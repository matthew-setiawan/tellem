"""
User settings — testing mode, test contact, and future preferences.
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, g

from middleware.auth_middleware import require_auth
from modules.db import get_settings_collection

settings_bp = Blueprint("settings", __name__)


def _get_settings(user_id):
    col = get_settings_collection()
    doc = col.find_one({"user_id": user_id})
    if not doc:
        return {
            "user_id": user_id,
            "testing_mode": False,
            "demo_leads": False,
            "test_contact": {"name": "", "email": "", "whatsapp": ""},
        }
    doc.pop("_id", None)
    doc.setdefault("demo_leads", False)
    return doc


@settings_bp.route("", methods=["GET"])
@require_auth
def get_settings():
    return jsonify(_get_settings(g.user["user_id"]))


@settings_bp.route("", methods=["PUT"])
@require_auth
def update_settings():
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    col = get_settings_collection()

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if "testing_mode" in body:
        updates["testing_mode"] = bool(body["testing_mode"])

    if "demo_leads" in body:
        updates["demo_leads"] = bool(body["demo_leads"])

    if "test_contact" in body:
        tc = body["test_contact"] or {}
        updates["test_contact"] = {
            "name": (tc.get("name") or "").strip(),
            "email": (tc.get("email") or "").strip(),
            "whatsapp": (tc.get("whatsapp") or "").strip(),
        }

    col.update_one(
        {"user_id": user_id},
        {"$set": updates, "$setOnInsert": {"user_id": user_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    return jsonify(_get_settings(user_id))
