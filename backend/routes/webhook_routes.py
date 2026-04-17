"""
Webhook endpoint — receives inbound messages from the WhatsApp service.
Outbound-only logic: only auto-reply when a customer responds to our initial outbound message.
"""

import json
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from modules.db import (
    get_outbound_conversations_collection,
    get_outreach_contacts_collection,
    get_message_logs_collection,
)
from modules.messaging import send_message
from modules.llm import query_perplexity_chat

webhook_bp = Blueprint("webhook", __name__)


def _classify_reply(customer_text):
    """Quick keyword-based classification of customer intent."""
    text = customer_text.lower().strip()
    negative = ["not interested", "no thanks", "no thank you", "stop", "unsubscribe", "don't contact", "remove me"]
    positive = ["interested", "tell me more", "sounds good", "yes", "sure", "let's", "let's talk",
                 "book a call", "schedule", "demo", "sign me up", "i'm in", "count me in"]

    for phrase in negative:
        if phrase in text:
            return "not_interested"
    for phrase in positive:
        if phrase in text:
            return "interested"
    return "replied"


def _build_follow_up_prompt(objective, contact_name, conversation_history,
                            business_context="", user_instruction=""):
    parts = [
        "You are a professional outbound sales assistant.",
        "You are having an ongoing WhatsApp conversation with a potential customer.",
        "Your goal: guide the conversation toward a concrete next step (call, meeting, demo).",
        "",
        "OUTPUT FORMAT — valid JSON only:",
        '{',
        '  "action": "reply | escalate",',
        '  "reply": "<your message to the customer>",',
        '  "escalation_reason": "<ONLY when you need specific info from your manager>"',
        '}',
        "",
        "═══ CONVERSATION RULES ═══",
        "",
        "DEFAULT: action=reply. Keep the conversation going.",
        "",
        "When customer is INTERESTED / says yes / wants to learn more:",
        '  → action=reply. Engage! Say "That\'s great to hear! I\'d love to set up a quick call',
        '    to discuss further. What does your availability look like this week?"',
        '  → Guide them toward scheduling. Suggest specific options.',
        "",
        "When customer asks a QUESTION you can answer from context/objective:",
        "  → action=reply. Answer it and steer back toward next step.",
        "",
        "When customer asks about SPECIFIC DETAILS you don't know",
        "  (exact pricing, your calendar availability, technical specs, specific dates/times):",
        '  → action=reply with a holding message like "Great question! Let me check on',
        '    that for you and get right back to you."',
        "  → ALSO set action=escalate with the reason so your manager can respond.",
        "",
        "When customer says they are busy / follow up later:",
        "  → action=reply. Acknowledge, suggest a specific time to reconnect.",
        "",
        "When customer is NOT interested:",
        "  → action=reply. Be polite, thank them, leave the door open.",
        "",
        "═══ STYLE ═══",
        "- Concise (1-3 sentences). This is WhatsApp, not email.",
        "- Friendly, professional, NOT pushy.",
        "- Always try to move toward a concrete next step.",
        "- Use the customer's name naturally.",
        "",
        f"OBJECTIVE: {objective}",
        f"CUSTOMER NAME: {contact_name or 'Unknown'}",
    ]
    if business_context:
        parts.append(f"BUSINESS CONTEXT: {business_context}")
    if user_instruction:
        parts.append(f"\nMANAGER INSTRUCTION: {user_instruction}")
        parts.append("Incorporate the above instruction naturally into your reply.")
    parts.append("")
    parts.append("CONVERSATION SO FAR:")
    for msg in conversation_history[-15:]:
        role = "You" if msg.get("fromMe") else "Customer"
        parts.append(f"  {role}: {msg.get('text', '')}")

    parts.append("")
    parts.append("Respond with JSON now:")
    return "\n".join(parts)


@webhook_bp.route("/inbound", methods=["POST"])
def handle_inbound_message():
    """
    Called by the WhatsApp service when a new inbound message arrives.
    Only responds if this customer has an active outbound conversation.
    """
    body = request.get_json(silent=True) or {}
    user_id = body.get("userId")
    jid = body.get("jid", "")
    text = (body.get("text") or "").strip()
    push_name = body.get("pushName")

    raw_lid_jid = body.get("rawLidJid")

    if not user_id or not jid or not text:
        return jsonify({"ok": True, "action": "ignored", "reason": "missing fields"})

    if jid.endswith("@g.us") or jid.endswith("@broadcast"):
        return jsonify({"ok": True, "action": "ignored", "reason": "group or broadcast"})

    is_lid = jid.endswith("@lid")

    # Normalize JID — strip +, spaces, dashes from the phone portion
    digits = "".join(ch for ch in jid.split("@")[0] if ch.isdigit())
    normalized_jid = f"{digits}@s.whatsapp.net" if not is_lid else jid

    conv_col = get_outbound_conversations_collection()

    if is_lid:
        # @lid JID that the WhatsApp service couldn't resolve.
        # Try to find the conversation by checking recent outbound conversations
        # for this user where the contact may have replied.
        current_app.logger.info(f"Received unresolved @lid JID: {jid}, attempting fallback lookup")

        # Strategy: look up all active outbound conversations for this user
        # and find one whose contact name matches the push_name
        conversation = None
        if push_name:
            conversation = conv_col.find_one({
                "user_id": user_id,
                "status": {"$nin": ["closed", "not_interested"]},
                "$or": [
                    {"contact_name": push_name},
                    {"customer_name": push_name},
                ],
            })
            if conversation:
                current_app.logger.info(
                    f"Matched @lid {jid} to conversation {conversation.get('jid')} via push_name '{push_name}'"
                )
                jid = conversation["jid"]
                normalized_jid = jid

        if not conversation:
            current_app.logger.info(f"No outbound conversation for @lid {jid}, ignoring inbound")
            return jsonify({"ok": True, "action": "ignored", "reason": "unresolved @lid, no matching conversation"})
    else:
        conversation = conv_col.find_one({
            "user_id": user_id,
            "$or": [{"jid": jid}, {"jid": normalized_jid}],
        })

        # If found with a mismatched JID, fix it for future lookups
        if conversation and conversation.get("jid") != normalized_jid:
            conv_col.update_one({"_id": conversation["_id"]}, {"$set": {"jid": normalized_jid}})
            conversation["jid"] = normalized_jid

    if not conversation:
        current_app.logger.info(f"No outbound conversation for {jid}, ignoring inbound")
        return jsonify({"ok": True, "action": "ignored", "reason": "no outbound conversation"})

    if conversation.get("status") in ("closed", "not_interested"):
        current_app.logger.info(f"Conversation with {jid} is {conversation['status']}, ignoring")
        return jsonify({"ok": True, "action": "ignored", "reason": f"conversation {conversation['status']}"})

    now = datetime.now(timezone.utc).isoformat()
    intent = _classify_reply(text)

    update_fields = {
        "updated_at": now,
        "last_customer_message": text,
        "last_customer_message_at": now,
    }
    if push_name:
        update_fields["customer_name"] = push_name

    if intent == "not_interested":
        update_fields["status"] = "not_interested"
    elif intent == "interested":
        update_fields["status"] = "interested"
    elif conversation.get("status") == "sent":
        update_fields["status"] = "replied"

    reply_count = conversation.get("auto_reply_count", 0)
    update_fields["auto_reply_count"] = reply_count + 1

    conv_col.update_one({"_id": conversation["_id"]}, {"$set": update_fields})

    # Skip auto-reply if conversation is paused by user (waiting for user instruction)
    if conversation.get("status") == "escalated" and not conversation.get("user_instruction"):
        current_app.logger.info(f"Conversation {jid} is escalated and waiting for user input, not auto-replying")
        return jsonify({"ok": True, "action": "waiting_for_user", "status": "escalated"})

    from config import PERPLEXITY_API_KEY
    if not PERPLEXITY_API_KEY:
        current_app.logger.warning("No Perplexity API key, skipping auto-reply")
        return jsonify({"ok": True, "action": "status_updated", "status": update_fields.get("status", intent)})

    if intent == "not_interested":
        _send_polite_close(user_id, jid, conversation, text)
        conv_col.update_one({"_id": conversation["_id"]}, {"$set": {"status": "closed"}})
        return jsonify({"ok": True, "action": "polite_close_sent", "status": "closed"})

    if reply_count >= 20:
        current_app.logger.info(f"Auto-reply limit reached for {jid}")
        conv_col.update_one({"_id": conversation["_id"]}, {"$set": {"status": "escalated",
                            "escalation_reason": "Auto-reply limit reached (20 messages)"}})
        return jsonify({"ok": True, "action": "escalated", "status": "escalated",
                        "reason": "Auto-reply limit reached"})

    try:
        result = _handle_follow_up(user_id, jid, conversation, text, push_name)
        return jsonify(result)
    except Exception as e:
        current_app.logger.exception("Follow-up handling failed")
        return jsonify({"ok": True, "action": "follow_up_failed", "error": str(e)})


def _send_polite_close(user_id, jid, conversation, customer_text):
    """Send a polite closing message when customer is not interested."""
    contact_name = conversation.get("contact_name") or conversation.get("customer_name") or ""
    name_part = f" {contact_name}" if contact_name else ""
    reply = f"Thank you{name_part} for letting me know. I completely understand! If you ever need anything in the future, don't hesitate to reach out. Have a great day!"

    send_message(user_id, "whatsapp", jid, reply)


def _parse_follow_up_response(raw_text):
    """Extract JSON from the LLM follow-up reply."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            data = json.loads(text[brace_start:brace_end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    return {"action": "reply", "reply": raw_text.strip()}


def _handle_follow_up(user_id, jid, conversation, customer_text, push_name):
    """Use LLM to decide: auto-reply or escalate to user."""
    from config import PERPLEXITY_API_KEY

    objective = conversation.get("objective", "")
    contact_name = push_name or conversation.get("contact_name") or conversation.get("customer_name") or ""

    logs_col = get_message_logs_collection()
    jid_digits = "".join(ch for ch in jid.split("@")[0] if ch.isdigit())
    jid_normalized = f"{jid_digits}@s.whatsapp.net"
    recent_msgs = list(
        logs_col.find({"user_id": user_id, "$or": [{"jid": jid}, {"jid": jid_normalized}]})
        .sort("wa_message_timestamp", -1)
        .limit(10)
    )
    recent_msgs.reverse()

    history = []
    for msg in recent_msgs:
        history.append({
            "fromMe": msg.get("from_me", False),
            "text": msg.get("text", ""),
        })

    business_context = (conversation.get("campaign_context") or "").strip()
    system_prompt = _build_follow_up_prompt(objective, contact_name, history,
                                            business_context=business_context)
    conversation_msgs = [{"role": "user", "content": f"Customer replied: {customer_text}"}]

    result = query_perplexity_chat(PERPLEXITY_API_KEY, conversation_msgs, system_prompt)
    raw_reply = result.get("reply", "") if isinstance(result, dict) else str(result)
    parsed = _parse_follow_up_response(raw_reply)

    action = parsed.get("action", "reply")
    conv_col = get_outbound_conversations_collection()
    now = datetime.now(timezone.utc).isoformat()

    reply_text = (parsed.get("reply") or "").strip()

    if action == "escalate":
        reason = parsed.get("escalation_reason", "Needs human attention")

        # Send the holding message to the customer (e.g., "Let me check on that!")
        if reply_text:
            send_message(user_id, "whatsapp", jid, reply_text)

        conv_col.update_one({"_id": conversation["_id"]}, {"$set": {
            "status": "escalated",
            "escalation_reason": reason,
            "updated_at": now,
        }})
        current_app.logger.info(f"Escalating {jid}: {reason}")
        return {"ok": True, "action": "escalated_with_holding_message",
                "status": "escalated", "reason": reason, "holding_message": reply_text}

    if not reply_text:
        return {"ok": True, "action": "no_reply_generated"}

    send_message(user_id, "whatsapp", jid, reply_text)

    new_status = "interested" if _classify_reply(customer_text) == "interested" else "active"
    conv_col.update_one({"_id": conversation["_id"]}, {"$set": {
        "status": new_status,
        "updated_at": now,
    }})
    return {"ok": True, "action": "auto_reply_sent", "status": new_status}
