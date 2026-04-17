"""
Outbound conversation management — tracks customer replies to outbound messages,
manages conversation status (interested, follow_up, not_interested, closed).
Includes AI instruct endpoint for natural-language management.
"""

import json
from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request, g

import config
from middleware.auth_middleware import require_auth
from modules.db import get_outbound_conversations_collection, get_message_logs_collection
from modules.llm import query_perplexity_chat

conversation_bp = Blueprint("conversations", __name__)


def _serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


@conversation_bp.route("", methods=["GET"])
@require_auth
def list_conversations():
    user_id = g.user["user_id"]
    status_filter = request.args.get("status")
    col = get_outbound_conversations_collection()

    query = {"user_id": user_id}
    if status_filter:
        query["status"] = status_filter

    docs = list(col.find(query).sort("updated_at", -1).limit(100))
    return jsonify([_serialize(d) for d in docs])


@conversation_bp.route("/<conversation_id>", methods=["GET"])
@require_auth
def get_conversation(conversation_id):
    user_id = g.user["user_id"]
    col = get_outbound_conversations_collection()

    try:
        doc = col.find_one({"_id": ObjectId(conversation_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid conversation ID"}), 400

    if not doc:
        return jsonify({"error": "Conversation not found"}), 404

    logs_col = get_message_logs_collection()
    messages = list(
        logs_col.find({"user_id": user_id, "jid": doc["jid"]})
        .sort("wa_message_timestamp", 1)
        .limit(100)
    )

    result = _serialize(doc)
    result["messages"] = []
    for msg in messages:
        result["messages"].append({
            "id": str(msg.get("message_id") or msg.get("_id")),
            "text": msg.get("text"),
            "fromMe": msg.get("from_me", False),
            "timestamp": msg.get("wa_message_timestamp", 0),
            "push_name": msg.get("push_name"),
        })

    return jsonify(result)


@conversation_bp.route("/<conversation_id>/status", methods=["PUT"])
@require_auth
def update_conversation_status(conversation_id):
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    new_status = (body.get("status") or "").strip()
    valid_statuses = {"sent", "replied", "interested", "follow_up", "not_interested", "closed", "escalated", "active"}

    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}"}), 400

    col = get_outbound_conversations_collection()
    try:
        result = col.find_one_and_update(
            {"_id": ObjectId(conversation_id), "user_id": user_id},
            {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
            return_document=True,
        )
    except Exception:
        return jsonify({"error": "Invalid conversation ID"}), 400

    if not result:
        return jsonify({"error": "Conversation not found"}), 404

    return jsonify(_serialize(result))


@conversation_bp.route("/stats", methods=["GET"])
@require_auth
def conversation_stats():
    user_id = g.user["user_id"]
    col = get_outbound_conversations_collection()

    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    results = list(col.aggregate(pipeline))
    stats = {r["_id"]: r["count"] for r in results}
    stats["total"] = sum(stats.values())

    return jsonify(stats)


def _build_instruct_prompt(conversations, stats):
    conv_summaries = []
    for c in conversations[:20]:
        name = c.get("contact_name") or c.get("customer_name") or c.get("jid", "").split("@")[0]
        line = f"- {name} | status: {c.get('status','unknown')} | campaign: {c.get('campaign_name','—')}"
        if c.get("last_customer_message"):
            line += f" | last reply: \"{c['last_customer_message'][:80]}\""
        conv_summaries.append(line)

    return f"""You are the AI management assistant for Tellem, an outbound messaging platform.
You help the user understand and manage their outbound conversations.

CURRENT STATS:
- Total conversations: {stats.get('total', 0)}
- Sent (awaiting reply): {stats.get('sent', 0)}
- Replied: {stats.get('replied', 0)}
- Interested: {stats.get('interested', 0)}
- Follow Up needed: {stats.get('follow_up', 0)}
- Not Interested: {stats.get('not_interested', 0)}
- Closed: {stats.get('closed', 0)}

RECENT CONVERSATIONS:
{chr(10).join(conv_summaries) if conv_summaries else '(none yet)'}

CAPABILITIES:
- Answer questions about conversation status and stats
- Provide advice on follow-up strategies
- Summarize what's happening with outbound campaigns
- Suggest next actions for specific conversations

Respond concisely and helpfully. When asked about specific people, reference the data above.
If the user asks to take an action (like changing status), tell them you've noted it and they can use the status buttons in the conversation feed on the right."""


@conversation_bp.route("/<conversation_id>/reply", methods=["POST"])
@require_auth
def send_user_reply(conversation_id):
    """
    User provides an instruction (e.g. 'tell them we're available Tuesday at 3pm').
    AI crafts a proper WhatsApp message incorporating the instruction and sends it.
    """
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    instruction = (body.get("instruction") or "").strip()

    if not instruction:
        return jsonify({"error": "instruction is required"}), 400

    col = get_outbound_conversations_collection()
    try:
        conv = col.find_one({"_id": ObjectId(conversation_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid conversation ID"}), 400
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    api_key = config.PERPLEXITY_API_KEY
    if not api_key:
        return jsonify({"error": "Perplexity API key required"}), 500

    jid = conv.get("jid", "")
    objective = conv.get("objective", "")
    contact_name = conv.get("contact_name") or conv.get("customer_name") or ""

    logs_col = get_message_logs_collection()
    jid_digits = "".join(ch for ch in jid.split("@")[0] if ch.isdigit())
    jid_norm = f"{jid_digits}@s.whatsapp.net"
    recent_msgs = list(
        logs_col.find({"user_id": user_id, "$or": [{"jid": jid}, {"jid": jid_norm}]})
        .sort("wa_message_timestamp", -1)
        .limit(15)
    )
    recent_msgs.reverse()
    history = [{"fromMe": m.get("from_me", False), "text": m.get("text", "")} for m in recent_msgs]

    from routes.webhook_routes import _build_follow_up_prompt, _parse_follow_up_response
    business_context = (conv.get("campaign_context") or "").strip()
    system_prompt = _build_follow_up_prompt(
        objective, contact_name, history,
        business_context=business_context, user_instruction=instruction
    )
    chat_msgs = [{"role": "user", "content": f"Manager says: {instruction}"}]

    try:
        result = query_perplexity_chat(api_key, chat_msgs, system_prompt)
        raw = result.get("reply", "") if isinstance(result, dict) else str(result)
        parsed = _parse_follow_up_response(raw)
        reply_text = (parsed.get("reply") or "").strip()
    except Exception as e:
        current_app.logger.exception("User reply LLM failed")
        return jsonify({"error": f"AI error: {str(e)}"}), 500

    if not reply_text:
        return jsonify({"error": "AI generated an empty reply. Try rephrasing your instruction."}), 400

    from modules.messaging import send_message
    send_result = send_message(user_id, "whatsapp", jid, reply_text)
    if not send_result.get("success"):
        return jsonify({"error": f"Failed to send: {send_result.get('error', 'unknown')}"}), 500

    now = datetime.now(timezone.utc).isoformat()
    col.update_one({"_id": conv["_id"]}, {"$set": {
        "status": "active",
        "escalation_reason": None,
        "updated_at": now,
    }})

    return jsonify({
        "ok": True,
        "reply_sent": reply_text,
        "status": "active",
    })


@conversation_bp.route("/instruct", methods=["POST"])
@require_auth
def ai_instruct():
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()

    if not message:
        return jsonify({"error": "message is required"}), 400

    api_key = config.PERPLEXITY_API_KEY
    if not api_key:
        return jsonify({
            "reply": "AI features require a Perplexity API key. Please add one in your backend .env file.",
            "actions_taken": False,
        })

    col = get_outbound_conversations_collection()
    conversations = list(col.find({"user_id": user_id}).sort("updated_at", -1).limit(20))

    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    agg = list(col.aggregate(pipeline))
    stats = {r["_id"]: r["count"] for r in agg}
    stats["total"] = sum(stats.values())

    system_prompt = _build_instruct_prompt(conversations, stats)
    chat_messages = [{"role": "user", "content": message}]

    try:
        result = query_perplexity_chat(api_key, chat_messages, system_prompt)
        reply = result.get("reply", "I couldn't generate a response.")
    except Exception as e:
        current_app.logger.exception("AI instruct failed")
        reply = f"Sorry, I encountered an error: {str(e)}"

    return jsonify({"reply": reply, "actions_taken": False})
