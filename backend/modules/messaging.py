"""
Messaging helpers: send messages via the WhatsApp service.
Demo JIDs (@demo.tellem) are handled locally without hitting WhatsApp.
"""

import requests
from flask import current_app

import config
from modules.demo import is_demo_jid


def resolve_existing_jid(user_id, channel, phone):
    """Check if we already have a chat with this phone number."""
    from modules.db import get_whatsapp_chats_collection

    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if not digits:
        return None

    chats = get_whatsapp_chats_collection()
    jid_pattern = f"{digits}@s.whatsapp.net"
    chat = chats.find_one({"user_id": user_id, "jid": jid_pattern}, {"jid": 1})
    return chat["jid"] if chat else None


def send_message(user_id, channel, jid, text):
    """Send a text message via the WhatsApp service (or silently succeed for demo JIDs)."""
    if is_demo_jid(jid):
        return {"success": True, "demo": True}

    base = current_app.config.get("WA_SERVICE_URL", config.WA_SERVICE_URL)
    payload = {
        "userId": user_id,
        "jid": jid,
        "text": text,
    }

    try:
        resp = requests.post(
            f"{base.rstrip('/')}/api/send-message",
            json=payload,
            timeout=15,
        )
        data = resp.json()
        return {"success": resp.ok and data.get("success", False), **data}
    except Exception as e:
        current_app.logger.exception("send_message failed")
        return {"success": False, "error": str(e)}
