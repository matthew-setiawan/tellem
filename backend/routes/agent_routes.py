"""
Agent-driven outbound — conversational AI interface for outreach.
Users chat with an AI agent that searches for contacts, asks clarifying
questions, and sends outreach messages on confirmation.
"""

import json
import re
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, Response, current_app, jsonify, request, g, stream_with_context

import config
from middleware.auth_middleware import require_auth
from modules.db import (
    get_agent_threads_collection,
    get_outbound_conversations_collection,
    get_settings_collection,
)
from modules.llm import query_perplexity_chat
from modules.outreach_search import search_contacts
from modules.messaging import send_message

agent_bp = Blueprint("agent", __name__)

# ── Helpers ──────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc).isoformat()


def _serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def _get_test_contact_if_testing(user_id):
    col = get_settings_collection()
    settings = col.find_one({"user_id": user_id})
    if not settings or not settings.get("testing_mode"):
        return None
    tc = settings.get("test_contact") or {}
    whatsapp = (tc.get("whatsapp") or "").strip()
    if not whatsapp:
        return None
    return [{
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

        test_contacts = _get_test_contact_if_testing(user_id)
        if test_contacts is not None:
            contacts = test_contacts
            is_testing = True
        else:
            try:
                contacts = search_contacts(api_key, search_query, limit=search_limit, user_id=user_id)
                is_testing = False
            except Exception as e:
                current_app.logger.exception("Agent search failed")
                contacts = []
                is_testing = False

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
            if is_testing:
                summary += " (Testing mode — returning your test contact)"

            contacts_msg = {
                "role": "assistant", "content": summary, "type": "contacts",
                "metadata": {"contacts": contacts, "testing_mode": is_testing},
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

        # Generate a draft message template using the first contact as reference
        draft_text = ""
        campaign_context = (thread.get("campaign_context") or "").strip()
        if reachable and api_key:
            try:
                sample = reachable[0]
                draft_prompt = _build_outreach_message_prompt(objective, sample, campaign_context)
                draft_prompt += "\n\nIMPORTANT: Use {name} as a placeholder for the recipient's name so the message can be sent to multiple people. Write ONLY the message text."
                draft_conv = [{"role": "user", "content": f"Write an outreach message template for {objective}."}]
                draft_result = query_perplexity_chat(api_key, draft_conv, draft_prompt)
                draft_text = (draft_result.get("reply", "") if isinstance(draft_result, dict) else str(draft_result)).strip()
            except Exception:
                current_app.logger.exception("Failed to generate draft message")

        if not draft_text:
            draft_text = f"Hi {{name}},\n\nI wanted to reach out regarding {objective}.\n\nWould love to connect and discuss further. Let me know if you're interested!\n\nBest regards"

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

def _build_outreach_message_prompt(objective, contact, campaign_context=""):
    parts = [
        "You are a professional outreach assistant. Write a single, personalized outreach message.",
        "Write ONLY the message text that will be sent directly via WhatsApp.",
        "Keep the message concise, friendly, and professional.",
        "",
        f"CAMPAIGN OBJECTIVE: {objective}",
    ]
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
    parts.append("Write the outreach message now. Output ONLY the message text.")
    return "\n".join(parts)


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

    def _apply_template(tmpl, contact):
        """Replace {name}, {company}, {title} placeholders in the template."""
        msg = tmpl
        msg = msg.replace("{name}", contact.get("name") or "there")
        msg = msg.replace("{company}", contact.get("company") or "your company")
        msg = msg.replace("{title}", contact.get("title") or "")
        return msg.strip()

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
                    system_prompt = _build_outreach_message_prompt(objective, contact, campaign_context)
                    conversation = [{"role": "user", "content": f"Write an outreach message to {name or phone}."}]
                    llm_result = query_perplexity_chat(api_key, conversation, system_prompt)
                    final_message = llm_result.get("reply", "") if isinstance(llm_result, dict) else str(llm_result)

                if not final_message or not final_message.strip():
                    raise ValueError("Empty message")

                final_message = final_message.strip()
                clean_phone = "".join(ch for ch in phone if ch.isdigit())
                jid = f"{clean_phone}@s.whatsapp.net" if "@" not in phone else phone
                result = send_message(user_id, "whatsapp", jid, final_message)

                if result.get("success"):
                    processed += 1
                    status = "sent"

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
                            "updated_at": conv_now,
                        }, "$setOnInsert": {"created_at": conv_now}},
                        upsert=True,
                    )
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
