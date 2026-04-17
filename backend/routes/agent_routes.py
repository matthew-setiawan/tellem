"""
Agent-driven outbound — conversational AI interface for outreach.
Users chat with an AI agent that searches for contacts, asks clarifying
questions, and sends outreach messages on confirmation.
"""

import json
import re
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from flask import Blueprint, Response, current_app, jsonify, request, g, stream_with_context

import config
from middleware.auth_middleware import require_auth
from modules.db import (
    get_agent_threads_collection,
    get_message_logs_collection,
    get_outbound_conversations_collection,
    get_settings_collection,
    get_users_collection,
)
from modules.llm import query_perplexity_chat
from modules.outreach_search import search_contacts
from modules.messaging import send_message
from modules.demo import is_demo_jid, generate_fake_contacts, generate_fake_reply

agent_bp = Blueprint("agent", __name__)

# ── Helpers ──────────────────────────────────────────

_BRACKET_PLACEHOLDER_RE = re.compile(r'\[(?:Your |My |Sender |Agent )?(?:Name|Company|Title|Phone|Email|Business|Signature)[^\]]*\]', re.IGNORECASE)

def _clean_message(text, sender_name=""):
    """Strip any leftover bracket/brace placeholders the LLM may have produced."""
    text = _BRACKET_PLACEHOLDER_RE.sub(sender_name or "", text)
    text = text.replace("Best regards,\n", "").replace("Best regards", "")
    text = text.replace("Kind regards,\n", "").replace("Kind regards", "")
    text = text.replace("Warm regards,\n", "").replace("Warm regards", "")
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def _get_sender_info(user_id):
    """Fetch the sender's display name and business name from their profile."""
    try:
        users = get_users_collection()
        user = users.find_one({"_id": ObjectId(user_id)}, {"username": 1, "business_name": 1})
        if user:
            return user.get("username", ""), user.get("business_name", "")
    except Exception:
        pass
    return "", ""


def _get_test_settings(user_id):
    """Return (contacts_override, is_testing, is_demo) based on user's test settings."""
    col = get_settings_collection()
    settings = col.find_one({"user_id": user_id})
    if not settings or not settings.get("testing_mode"):
        return None, False, False

    if settings.get("demo_leads"):
        return "demo", True, True

    tc = settings.get("test_contact") or {}
    whatsapp = (tc.get("whatsapp") or "").strip()
    if not whatsapp:
        return None, False, False
    contacts = [{
        "name": tc.get("name") or "Test Contact",
        "title": "Test Contact",
        "company": "Testing Mode",
        "linkedin_url": None,
        "email": tc.get("email") or None,
        "phone": whatsapp,
        "whatsapp": whatsapp,
        "location": None,
        "summary": "This is your test contact. All searches return this number while testing mode is enabled.",
        "source": "testing",
    }]
    return contacts, True, False


AGENT_SYSTEM_PROMPT = """\
You are the Tellem outbound agent. You find people and send personalised \
outreach messages via WhatsApp.

CONVERSATION CONTEXT:
{context_block}

═══ STRICT PHASE FLOW — follow these phases in order ═══

PHASE 1 — GATHER (only if needed):
  If the user's request is too vague to search (e.g. just "reach out to people"), \
ask ONE short clarifying question with 2-3 options + "Something else".
  If the user gives you a WHO (role, industry, location, or company type), skip \
straight to PHASE 2. Do NOT ask about tone, message style, number of contacts, \
company size, or anything you can default yourself.

PHASE 2 — SEARCH:
  Use action "search". Reply should be short like "Searching for marketing managers in NYC..."
  Do NOT include options. Do NOT ask more questions. Just search.

PHASE 3 — CONTACTS FOUND (handled by system, not you):
  After search, the system shows contact cards automatically. Your job here is done.
  The system will show action options to the user. Do NOT ask clarifying questions after this point.

PHASE 4 — SEND:
  When the user confirms sending, use action "ready_to_send" with the objective.
  The objective is the overall goal the user described. Infer it from the conversation.

═══ KEY RULES ═══
- Be DECISIVE. Default to action over questions.
- Max 1-3 sentences per reply. No essays.
- NEVER ask questions after contacts have been found. Only offer action options.
- NEVER fabricate contact data.
- Fill in defaults yourself: 5 contacts, professional tone.

OUTPUT FORMAT — valid JSON only:
{{
  "reply": "<short message>",
  "action": "<reply | search | ready_to_send>",
  "options": [{{"label": "short option"}}],
  "search_query": "<when action=search>",
  "search_limit": <when action=search, 1-10, default 5>,
  "objective": "<when action=ready_to_send>"
}}

Options rules: only include "options" when asking a question (Phase 1) or NOT when searching. \
2-3 choices max + "Something else" as last. Labels under 30 chars.
Omit "options" entirely when searching or giving info.
"""


def _build_context_block(thread):
    ctx = thread.get("context") or {}
    parts = []
    campaign_ctx = (thread.get("campaign_context") or "").strip()
    if campaign_ctx:
        parts.append(f"Campaign Context (provided by user — use this to inform your search and messaging):\n{campaign_ctx}")
    if ctx.get("objective"):
        parts.append(f"Objective: {ctx['objective']}")
    contacts = ctx.get("contacts_found") or []
    if contacts:
        names = [c.get("name", "?") for c in contacts[:10]]
        parts.append(f"Contacts already found ({len(contacts)}): {', '.join(names)}")
        parts.append("PHASE: Contacts found. Do NOT ask clarifying questions. Only respond to user actions.")
    sent = ctx.get("sent_count", 0)
    failed = ctx.get("failed_count", 0)
    if sent or failed:
        parts.append(f"Sent: {sent}, Failed: {failed}")
        parts.append("PHASE: Outreach complete. Summarise results or answer follow-up questions.")
    if not contacts and not sent:
        parts.append("PHASE: New conversation — gather info or search.")
    return "\n".join(parts)


def _build_chat_messages(thread):
    msgs = []
    for m in (thread.get("messages") or []):
        role = m.get("role", "user")
        if role == "status":
            role = "assistant"
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    return msgs


def _parse_agent_response(raw_text):
    """Extract JSON from the LLM reply, falling back to plain text."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    try:
        data = json.loads(text)
        if isinstance(data, dict) and "reply" in data:
            return data
    except json.JSONDecodeError:
        pass

    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            data = json.loads(text[brace_start:brace_end + 1])
            if isinstance(data, dict) and "reply" in data:
                return data
        except json.JSONDecodeError:
            pass

    return {"reply": raw_text.strip(), "action": "reply"}


def _auto_title(first_message):
    text = first_message.strip()[:60]
    if len(first_message) > 60:
        text += "..."
    return text


# ── Thread CRUD ──────────────────────────────────────

@agent_bp.route("/threads", methods=["GET"])
@require_auth
def list_threads():
    user_id = g.user["user_id"]
    col = get_agent_threads_collection()
    docs = list(
        col.find({"user_id": user_id}, {"messages": 0})
        .sort("updated_at", -1)
        .limit(50)
    )
    return jsonify([_serialize(d) for d in docs])


@agent_bp.route("/threads", methods=["POST"])
@require_auth
def create_thread():
    user_id = g.user["user_id"]
    now = _now()
    doc = {
        "user_id": user_id,
        "title": "New Outreach",
        "messages": [],
        "campaign_context": "",
        "context": {
            "objective": None,
            "search_query": None,
            "contacts_found": [],
            "contacts_confirmed": [],
            "sent_count": 0,
            "failed_count": 0,
        },
        "created_at": now,
        "updated_at": now,
    }
    col = get_agent_threads_collection()
    result = col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return jsonify(doc), 201


@agent_bp.route("/threads/<thread_id>", methods=["GET"])
@require_auth
def get_thread(thread_id):
    user_id = g.user["user_id"]
    col = get_agent_threads_collection()
    try:
        doc = col.find_one({"_id": ObjectId(thread_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid thread ID"}), 400
    if not doc:
        return jsonify({"error": "Thread not found"}), 404
    return jsonify(_serialize(doc))


@agent_bp.route("/threads/<thread_id>", methods=["DELETE"])
@require_auth
def delete_thread(thread_id):
    user_id = g.user["user_id"]
    col = get_agent_threads_collection()
    try:
        col.delete_one({"_id": ObjectId(thread_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid thread ID"}), 400
    return jsonify({"ok": True})


@agent_bp.route("/threads/<thread_id>/context", methods=["PUT"])
@require_auth
def update_thread_context(thread_id):
    """Set or update the user-provided campaign context for this thread."""
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    campaign_context = (body.get("campaign_context") or "").strip()

    col = get_agent_threads_collection()
    try:
        result = col.find_one_and_update(
            {"_id": ObjectId(thread_id), "user_id": user_id},
            {"$set": {"campaign_context": campaign_context, "updated_at": _now()}},
            return_document=True,
        )
    except Exception:
        return jsonify({"error": "Invalid thread ID"}), 400
    if not result:
        return jsonify({"error": "Thread not found"}), 404
    return jsonify(_serialize(result))


# ── Core message endpoint ────────────────────────────

@agent_bp.route("/threads/<thread_id>/message", methods=["POST"])
@require_auth
def send_message_to_thread(thread_id):
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    user_text = (body.get("message") or "").strip()
    if not user_text:
        return jsonify({"error": "message is required"}), 400

    col = get_agent_threads_collection()
    try:
        thread = col.find_one({"_id": ObjectId(thread_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid thread ID"}), 400
    if not thread:
        return jsonify({"error": "Thread not found"}), 404

    now = _now()
    user_msg = {"role": "user", "content": user_text, "type": "text", "created_at": now}
    col.update_one(
        {"_id": thread["_id"]},
        {"$push": {"messages": user_msg}, "$set": {"updated_at": now}},
    )

    if len(thread.get("messages", [])) == 0:
        col.update_one({"_id": thread["_id"]}, {"$set": {"title": _auto_title(user_text)}})

    thread["messages"] = (thread.get("messages") or []) + [user_msg]

    api_key = config.PERPLEXITY_API_KEY
    if not api_key:
        err_msg = {
            "role": "assistant", "content": "AI features require a Perplexity API key in the backend .env file.",
            "type": "text", "created_at": now,
        }
        col.update_one({"_id": thread["_id"]}, {"$push": {"messages": err_msg}, "$set": {"updated_at": now}})
        return jsonify({"messages": [_strip_msg(err_msg)]})

    system_prompt = AGENT_SYSTEM_PROMPT.format(context_block=_build_context_block(thread))
    chat_msgs = _build_chat_messages(thread)

    try:
        llm_result = query_perplexity_chat(api_key, chat_msgs, system_prompt)
        raw_reply = llm_result.get("reply", "")
    except Exception as e:
        current_app.logger.exception("Agent LLM call failed")
        raw_reply = json.dumps({"reply": f"Sorry, I encountered an error: {e}", "action": "reply"})

    parsed = _parse_agent_response(raw_reply)
    action = parsed.get("action", "reply")
    reply_text = parsed.get("reply", raw_reply)
    options = parsed.get("options") or []
    response_messages = []

    msg_type = "options" if options else "text"
    assistant_msg = {
        "role": "assistant", "content": reply_text, "type": msg_type, "created_at": _now(),
    }
    if options:
        assistant_msg["metadata"] = {"options": options}
    col.update_one({"_id": thread["_id"]}, {"$push": {"messages": assistant_msg}, "$set": {"updated_at": _now()}})
    response_messages.append(_strip_msg(assistant_msg))

    if action == "search":
        search_query = parsed.get("search_query", user_text)
        search_limit = min(int(parsed.get("search_limit", 5)), 10)

        test_override, is_testing, is_demo = _get_test_settings(user_id)
        if is_demo:
            try:
                contacts = generate_fake_contacts(api_key, search_query, count=search_limit)
            except Exception:
                current_app.logger.exception("Demo contact generation failed")
                contacts = []
        elif test_override and test_override != "demo":
            contacts = test_override
        else:
            try:
                contacts = search_contacts(api_key, search_query, limit=search_limit, user_id=user_id)
            except Exception as e:
                current_app.logger.exception("Agent search failed")
                contacts = []

        col.update_one(
            {"_id": thread["_id"]},
            {"$set": {
                "context.contacts_found": contacts,
                "context.search_query": search_query,
                "updated_at": _now(),
            }},
        )

        if contacts:
            reachable = [c for c in contacts if c.get("whatsapp") or c.get("phone")]
            summary = f"Found {len(contacts)} contact{'s' if len(contacts) != 1 else ''}."
            if is_demo:
                summary += " (Demo mode — these are AI-generated fake leads)"
            elif is_testing:
                summary += " (Testing mode — returning your test contact)"

            contacts_msg = {
                "role": "assistant", "content": summary, "type": "contacts",
                "metadata": {"contacts": contacts, "testing_mode": is_testing, "demo_mode": is_demo},
                "created_at": _now(),
            }
            col.update_one({"_id": thread["_id"]}, {"$push": {"messages": contacts_msg}, "$set": {"updated_at": _now()}})
            response_messages.append(_strip_msg(contacts_msg))

            next_step_options = [{"label": f"Send to all {len(reachable)}"}] if reachable else []
            next_step_options += [{"label": "Search for more"}, {"label": "Something else"}]
            action_msg = {
                "role": "assistant",
                "content": "What would you like to do next?",
                "type": "options",
                "metadata": {"options": next_step_options},
                "created_at": _now(),
            }
            col.update_one({"_id": thread["_id"]}, {"$push": {"messages": action_msg}, "$set": {"updated_at": _now()}})
            response_messages.append(_strip_msg(action_msg))
        else:
            summary = "No contacts found matching that criteria. Try a different search."
            no_results_msg = {
                "role": "assistant", "content": summary, "type": "text",
                "created_at": _now(),
            }
            col.update_one({"_id": thread["_id"]}, {"$push": {"messages": no_results_msg}, "$set": {"updated_at": _now()}})
            response_messages.append(_strip_msg(no_results_msg))

    elif action == "ready_to_send":
        objective = parsed.get("objective", "")
        if objective:
            col.update_one({"_id": thread["_id"]}, {"$set": {"context.objective": objective, "updated_at": _now()}})

        ctx = thread.get("context") or {}
        contacts = ctx.get("contacts_found") or []
        reachable = [c for c in contacts if c.get("whatsapp") or c.get("phone")]

        draft_text = ""
        campaign_context = (thread.get("campaign_context") or "").strip()
        sender_name, business_name = _get_sender_info(user_id)

        if reachable and api_key:
            try:
                sample = reachable[0]
                draft_prompt = (
                    "You write short, natural WhatsApp outreach messages.\n"
                    "Write a TEMPLATE message that will be sent to multiple people.\n\n"
                    "RULES:\n"
                    "- Use {name} as the ONLY placeholder — it will be auto-replaced with each recipient's real first name.\n"
                    "- NEVER use any other placeholders like [Your Name], [Company], {sender}, etc.\n"
                    "- NEVER include bracketed fill-in-the-blank tokens of any kind.\n"
                    "- Keep it 2-4 sentences. Sound like a real person texting, not a formal letter.\n"
                    "- No 'Dear', no 'Best regards', no letter-style formatting.\n"
                    "- Mention specific details from the campaign context to sound genuine.\n"
                )
                if sender_name:
                    draft_prompt += f"\nSENDER NAME: {sender_name} (use this as the sign-off name if you sign off)\n"
                if business_name:
                    draft_prompt += f"SENDER BUSINESS: {business_name}\n"
                draft_prompt += f"\nCAMPAIGN OBJECTIVE: {objective}\n"
                if campaign_context:
                    draft_prompt += f"\nCAMPAIGN CONTEXT:\n{campaign_context}\n"
                draft_prompt += f"\nSAMPLE RECIPIENT (for reference, but use {{name}} in the message):\n"
                draft_prompt += f"- Name: {sample.get('name', 'Unknown')}\n"
                if sample.get("title"):
                    draft_prompt += f"- Title: {sample['title']}\n"
                if sample.get("company"):
                    draft_prompt += f"- Company: {sample['company']}\n"
                if sample.get("summary"):
                    draft_prompt += f"- Notes: {sample['summary']}\n"
                draft_prompt += "\nWrite the message template now. Output ONLY the message text."

                draft_conv = [{"role": "user", "content": f"Write an outreach message template for: {objective}"}]
                draft_result = query_perplexity_chat(api_key, draft_conv, draft_prompt)
                draft_text = (draft_result.get("reply", "") if isinstance(draft_result, dict) else str(draft_result)).strip()
                draft_text = _clean_message(draft_text, sender_name)
            except Exception:
                current_app.logger.exception("Failed to generate draft message")

        if not draft_text:
            sign_off = f"\n\n— {sender_name}" if sender_name else ""
            draft_text = f"Hey {{name}}, I wanted to reach out about {objective}. Would love to connect and chat about this — let me know if you're open to it!{sign_off}"

        col.update_one({"_id": thread["_id"]}, {"$set": {"context.draft_message": draft_text, "updated_at": _now()}})

        draft_msg = {
            "role": "assistant",
            "content": f"Here's the draft message for {len(reachable)} contact{'s' if len(reachable) != 1 else ''}. Edit it below and click 'Send Messages' when ready.",
            "type": "draft",
            "metadata": {"draft": draft_text, "reachable_count": len(reachable), "objective": objective},
            "created_at": _now(),
        }
        col.update_one({"_id": thread["_id"]}, {"$push": {"messages": draft_msg}, "$set": {"updated_at": _now()}})
        response_messages.append(_strip_msg(draft_msg))

    return jsonify({"messages": response_messages})


def _strip_msg(msg):
    """Return a serialisable copy of a message dict."""
    out = {k: v for k, v in msg.items() if k != "_id"}
    return out


# ── Execute (SSE) ────────────────────────────────────

def _build_outreach_message_prompt(objective, contact, campaign_context="", sender_name="", business_name=""):
    parts = [
        "You are a professional outreach assistant. Write a single, personalized WhatsApp message.",
        "Write ONLY the final message text — it will be sent DIRECTLY to the recipient with zero edits.",
        "",
        "CRITICAL RULES:",
        "- Use the recipient's ACTUAL first name — never write {name}, [Name], or any placeholder.",
        "- NEVER include sign-off placeholders like [Your Name], [Your Company], {sender}, etc.",
        "- NEVER include bracketed/braced fill-in-the-blank tokens of any kind.",
        "- Keep it concise (2-4 sentences), warm, and natural — like a real person texting on WhatsApp.",
        "- Do NOT write formal letter-style openings or closings (no 'Dear', no 'Best regards').",
        "- Sound human, not like a template. Vary sentence structure.",
    ]
    if sender_name or business_name:
        parts.append("")
        sender_line = "SENDER: "
        if sender_name:
            sender_line += sender_name
        if business_name:
            sender_line += f" from {business_name}" if sender_name else business_name
        parts.append(sender_line)
        parts.append("Sign off naturally with the sender's real name if appropriate.")
    parts.append("")
    parts.append(f"CAMPAIGN OBJECTIVE: {objective}")
    if campaign_context:
        parts.append("")
        parts.append(f"CAMPAIGN CONTEXT (use this information to craft the message):\n{campaign_context}")
    parts.append("")
    parts.append("RECIPIENT DETAILS:")
    if contact.get("name"):
        parts.append(f"- Name: {contact['name']}")
    if contact.get("title"):
        parts.append(f"- Title: {contact['title']}")
    if contact.get("company"):
        parts.append(f"- Company: {contact['company']}")
    if contact.get("location"):
        parts.append(f"- Location: {contact['location']}")
    if contact.get("summary"):
        parts.append(f"- Notes: {contact['summary']}")
    parts.append("")
    parts.append("Write the outreach message now. Output ONLY the message text, ready to send as-is.")
    return "\n".join(parts)


def _run_demo_conversation_loop(app, user_id, jid, contact, objective, campaign_context, max_rounds=4):
    """Background thread: simulate a multi-turn conversation for demo contacts."""
    with app.app_context():
        api_key = config.PERPLEXITY_API_KEY
        if not api_key:
            return

        from routes.webhook_routes import (
            _build_follow_up_prompt, _parse_follow_up_response, _resolve_status,
        )

        msg_col = get_message_logs_collection()
        conv_col = get_outbound_conversations_collection()
        contact_name = contact.get("name", "")

        for round_num in range(max_rounds):
            time.sleep(3)

            conversation = conv_col.find_one({"user_id": user_id, "jid": jid})
            if not conversation:
                break

            recent_msgs = list(
                msg_col.find({"user_id": user_id, "jid": jid})
                .sort("wa_message_timestamp", -1)
                .limit(10)
            )
            recent_msgs.reverse()
            history = [{"fromMe": m.get("from_me", False), "text": m.get("text", "")} for m in recent_msgs]

            last_customer_msg = conversation.get("last_customer_message", "")
            system_prompt = _build_follow_up_prompt(
                objective, contact_name, history, business_context=campaign_context
            )
            chat_msgs = [{"role": "user", "content": f"Customer replied: {last_customer_msg}"}]

            try:
                result = query_perplexity_chat(api_key, chat_msgs, system_prompt)
                raw_reply = result.get("reply", "") if isinstance(result, dict) else str(result)
                parsed = _parse_follow_up_response(raw_reply)
            except Exception:
                app.logger.exception("Demo loop: AI follow-up failed for %s round %d", jid, round_num)
                break

            ai_reply = (parsed.get("reply") or "").strip()
            if not ai_reply:
                break

            ai_ts = time.time()
            msg_col.insert_one({
                "user_id": user_id,
                "channel": "whatsapp",
                "jid": jid,
                "message_id": f"demo_{uuid4().hex[:12]}",
                "from_me": True,
                "direction": "outbound",
                "text": ai_reply,
                "message_type": "text",
                "wa_message_timestamp": ai_ts,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "is_demo": True,
            })

            status_after_ai = _resolve_status(parsed, last_customer_msg, conversation)
            conv_col.update_one(
                {"user_id": user_id, "jid": jid},
                {"$set": {"status": status_after_ai, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )

            time.sleep(3)

            try:
                fake_reply = generate_fake_reply(api_key, contact, ai_reply, objective)
            except Exception:
                app.logger.exception("Demo loop: fake reply generation failed for %s round %d", jid, round_num)
                break

            reply_ts = time.time()
            msg_col.insert_one({
                "user_id": user_id,
                "channel": "whatsapp",
                "jid": jid,
                "message_id": f"demo_{uuid4().hex[:12]}",
                "from_me": False,
                "direction": "inbound",
                "text": fake_reply,
                "message_type": "text",
                "push_name": contact_name,
                "wa_message_timestamp": reply_ts,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "is_demo": True,
            })

            conversation = conv_col.find_one({"user_id": user_id, "jid": jid}) or conversation
            new_status = _resolve_status({"customer_interest": "neutral"}, fake_reply, conversation)

            conv_col.update_one(
                {"user_id": user_id, "jid": jid},
                {"$set": {
                    "last_customer_message": fake_reply,
                    "last_customer_message_at": datetime.now(timezone.utc).isoformat(),
                    "status": new_status,
                    "auto_reply_count": round_num + 2,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

        app.logger.info("Demo conversation loop finished for %s", jid)


@agent_bp.route("/threads/<thread_id>/execute", methods=["POST"])
@require_auth
def execute_thread(thread_id):
    user_id = g.user["user_id"]
    col = get_agent_threads_collection()
    body = request.get_json(silent=True) or {}
    message_template = (body.get("message_template") or "").strip()

    try:
        thread = col.find_one({"_id": ObjectId(thread_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid thread ID"}), 400
    if not thread:
        return jsonify({"error": "Thread not found"}), 404

    ctx = thread.get("context") or {}
    contacts = ctx.get("contacts_found") or []
    objective = ctx.get("objective") or ""

    if not objective:
        return jsonify({"error": "No objective set. Tell the agent what you want to achieve first."}), 400

    reachable = [c for c in contacts if c.get("whatsapp") or c.get("phone")]
    if not reachable:
        return jsonify({"error": "No contacts with WhatsApp/phone numbers to reach."}), 400

    # Use the user-edited template if provided, otherwise fall back to stored draft
    template = message_template or ctx.get("draft_message") or ""

    campaign_context = (thread.get("campaign_context") or "").strip()

    api_key = config.PERPLEXITY_API_KEY
    if not template and not api_key:
        return jsonify({"error": "No message template and no API key to generate messages"}), 500

    if message_template:
        col.update_one({"_id": thread["_id"]}, {"$set": {"context.draft_message": message_template}})

    sender_name, business_name = _get_sender_info(user_id)

    def _apply_template(tmpl, contact):
        """Replace {name}, {company}, {title} placeholders and strip leftover bracket tokens."""
        msg = tmpl
        first_name = (contact.get("name") or "").split()[0] if contact.get("name") else "there"
        msg = msg.replace("{name}", first_name)
        msg = msg.replace("{company}", contact.get("company") or "your company")
        msg = msg.replace("{title}", contact.get("title") or "")
        return _clean_message(msg, sender_name)

    def generate():
        total = len(reachable)
        processed = 0
        failed = 0

        yield f"data: {json.dumps({'type': 'start', 'total': total, 'processed': 0, 'failed': 0})}\n\n"

        for contact in reachable:
            phone = contact.get("whatsapp") or contact.get("phone") or ""
            name = contact.get("name", "")

            yield ": keepalive\n\n"

            try:
                if template:
                    final_message = _apply_template(template, contact)
                else:
                    system_prompt = _build_outreach_message_prompt(
                        objective, contact, campaign_context,
                        sender_name=sender_name, business_name=business_name,
                    )
                    conversation = [{"role": "user", "content": f"Write an outreach message to {name or phone}."}]
                    llm_result = query_perplexity_chat(api_key, conversation, system_prompt)
                    final_message = llm_result.get("reply", "") if isinstance(llm_result, dict) else str(llm_result)
                    final_message = _clean_message(final_message, sender_name)

                if not final_message or not final_message.strip():
                    raise ValueError("Empty message")

                final_message = final_message.strip()
                clean_phone = "".join(ch for ch in phone if ch.isdigit())
                jid = f"{clean_phone}@s.whatsapp.net" if "@" not in phone else phone
                result = send_message(user_id, "whatsapp", jid, final_message)

                if result.get("success"):
                    processed += 1
                    status = "sent"
                    contact_is_demo = is_demo_jid(jid)
                    contact_is_test = contact.get("source") == "testing"

                    conv_col = get_outbound_conversations_collection()
                    conv_now = _now()
                    conv_col.update_one(
                        {"user_id": user_id, "jid": jid},
                        {"$set": {
                            "user_id": user_id,
                            "jid": jid,
                            "contact_name": name,
                            "phone": phone,
                            "objective": contact.get("objective") or objective,
                            "campaign_name": thread.get("title", "Agent Outreach"),
                            "campaign_context": campaign_context,
                            "thread_id": str(thread["_id"]),
                            "initial_message": final_message,
                            "status": "sent",
                            "auto_reply_count": 0,
                            "is_demo": contact_is_demo,
                            "is_test": contact_is_demo or contact_is_test,
                            "updated_at": conv_now,
                        }, "$setOnInsert": {"created_at": conv_now}},
                        upsert=True,
                    )

                    if contact_is_demo and api_key:
                        try:
                            msg_col = get_message_logs_collection()
                            outbound_ts = time.time()

                            msg_col.insert_one({
                                "user_id": user_id,
                                "channel": "whatsapp",
                                "jid": jid,
                                "message_id": f"demo_{uuid4().hex[:12]}",
                                "from_me": True,
                                "direction": "outbound",
                                "text": final_message,
                                "message_type": "text",
                                "wa_message_timestamp": outbound_ts,
                                "timestamp": _now(),
                                "is_demo": True,
                            })

                            fake_reply = generate_fake_reply(api_key, contact, final_message, objective)
                            reply_ts = time.time() + 1
                            msg_col.insert_one({
                                "user_id": user_id,
                                "channel": "whatsapp",
                                "jid": jid,
                                "message_id": f"demo_{uuid4().hex[:12]}",
                                "from_me": False,
                                "direction": "inbound",
                                "text": fake_reply,
                                "message_type": "text",
                                "push_name": name,
                                "wa_message_timestamp": reply_ts,
                                "timestamp": _now(),
                                "is_demo": True,
                            })
                            from routes.webhook_routes import _classify_reply
                            keyword_intent = _classify_reply(fake_reply)
                            initial_status = "interested" if keyword_intent == "interested" else "active"
                            conv_col.update_one(
                                {"user_id": user_id, "jid": jid},
                                {"$set": {
                                    "last_customer_message": fake_reply,
                                    "last_customer_message_at": _now(),
                                    "customer_name": name,
                                    "status": initial_status,
                                    "auto_reply_count": 1,
                                    "updated_at": _now(),
                                }},
                            )

                            app = current_app._get_current_object()
                            threading.Thread(
                                target=_run_demo_conversation_loop,
                                args=(app, user_id, jid, contact, objective, campaign_context),
                                daemon=True,
                            ).start()
                        except Exception:
                            current_app.logger.exception("Demo fake reply generation failed for %s", name)
                else:
                    failed += 1
                    status = "failed"

            except Exception:
                current_app.logger.exception("Agent execute failed for %s", name)
                status = "failed"
                failed += 1

            yield f"data: {json.dumps({'type': 'progress', 'contact_name': name, 'contact_status': status, 'processed': processed, 'failed': failed, 'total': total})}\n\n"

        col.update_one(
            {"_id": thread["_id"]},
            {"$set": {
                "context.sent_count": processed,
                "context.failed_count": failed,
                "updated_at": _now(),
            }},
        )

        done_msg = {
            "role": "status",
            "content": f"Outreach complete — sent {processed}/{total}, {failed} failed.",
            "type": "progress",
            "metadata": {"processed": processed, "failed": failed, "total": total},
            "created_at": _now(),
        }
        col.update_one({"_id": thread["_id"]}, {"$push": {"messages": done_msg}, "$set": {"updated_at": _now()}})

        yield f"data: {json.dumps({'type': 'done', 'processed': processed, 'failed': failed, 'total': total})}\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })
