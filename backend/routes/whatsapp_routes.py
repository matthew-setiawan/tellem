"""
WhatsApp API routes — chats, contacts, messages, send.
Proxies to the whatsapp-service for session management.
"""

import requests
from flask import Blueprint, current_app, jsonify, request, g

import config
from modules.db import (
    get_message_logs_collection,
    get_whatsapp_chats_collection,
    get_whatsapp_contacts_collection,
)
from middleware.auth_middleware import require_auth

whatsapp_bp = Blueprint("whatsapp", __name__)


def _get_user_id():
    return g.user.get("user_id")


def _wa_service_url():
    return current_app.config.get("WA_SERVICE_URL", config.WA_SERVICE_URL)


# ── Contacts ─────────────────────────────────────────

@whatsapp_bp.route("/contacts", methods=["GET"])
@require_auth
def get_contacts():
    user_id = _get_user_id()
    contacts = list(
        get_whatsapp_contacts_collection()
        .find({"user_id": user_id}, {"_id": 0})
        .sort("displayName", 1)
    )
    return jsonify(contacts)


# ── Chats ────────────────────────────────────────────

@whatsapp_bp.route("/chats", methods=["GET"])
@require_auth
def get_chats():
    user_id = _get_user_id()
    chats = list(
        get_whatsapp_chats_collection()
        .find({"user_id": user_id}, {"_id": 0})
        .sort("updatedAt", -1)
    )
    for chat in chats:
        chat["id"] = chat.get("jid")
    return jsonify(chats)


# ── Messages ─────────────────────────────────────────

@whatsapp_bp.route("/messages/<path:jid>", methods=["GET"])
@require_auth
def get_messages(jid):
    user_id = _get_user_id()
    limit = min(max(int(request.args.get("limit", 100)), 1), 200)

    logs_col = get_message_logs_collection()
    digits = "".join(ch for ch in jid.split("@")[0] if ch.isdigit())
    query = {
        "user_id": user_id,
        "$or": [{"jid": jid}, {"jid": f"{digits}@s.whatsapp.net"}],
    }

    docs = list(
        logs_col.find(query)
        .sort([("wa_message_timestamp", -1), ("timestamp", -1)])
        .limit(limit)
    )

    messages = []
    for doc in reversed(docs):
        from_me = doc.get("from_me", False) or str(doc.get("direction", "")).lower() == "outbound"
        messages.append({
            "id": str(doc.get("message_id") or doc.get("_id")),
            "remoteJid": doc.get("jid"),
            "fromMe": from_me,
            "pushName": doc.get("push_name"),
            "text": doc.get("text"),
            "type": doc.get("message_type", "text"),
            "timestamp": doc.get("wa_message_timestamp") or 0,
            "channel": doc.get("channel", "whatsapp"),
        })

    return jsonify(messages)


# ── Send message ─────────────────────────────────────

@whatsapp_bp.route("/send", methods=["POST"])
@require_auth
def send_message():
    user_id = _get_user_id()
    body = request.get_json(silent=True) or {}
    jid = (body.get("jid") or "").strip()
    text = (body.get("text") or "").strip()

    if not jid or not text:
        return jsonify({"error": "jid and text are required"}), 400

    base = _wa_service_url()
    payload = {"userId": user_id, "jid": jid, "text": text}

    try:
        resp = requests.post(f"{base.rstrip('/')}/api/send-message", json=payload, timeout=15)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({"error": f"WhatsApp service unreachable: {e}"}), 502


# ── QR / Session proxy ───────────────────────────────

@whatsapp_bp.route("/session/status", methods=["GET"])
@require_auth
def session_status():
    user_id = _get_user_id()
    base = _wa_service_url()
    try:
        resp = requests.get(f"{base.rstrip('/')}/api/sessions/{user_id}/status", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"status": "disconnected", "error": str(e)})
