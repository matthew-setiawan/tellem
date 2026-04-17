"""
Outreach API — contact discovery, campaigns, manual number add, and execution.
"""

import csv
import io
import json
from datetime import datetime, timezone

import requests
from bson import ObjectId
from flask import Blueprint, Response, current_app, jsonify, request, g, stream_with_context

from middleware.auth_middleware import require_auth
from modules.db import (
    get_outreach_campaigns_collection,
    get_outreach_contacts_collection,
    get_settings_collection,
)
from modules.outreach_search import search_contacts

def _get_test_contact_if_testing(user_id):
    """Return the test contact array if testing mode is on, else None."""
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

outreach_bp = Blueprint("outreach", __name__)


def _serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    if "campaign_id" in doc and isinstance(doc["campaign_id"], ObjectId):
        doc["campaign_id"] = str(doc["campaign_id"])
    return doc


# ── Search ───────────────────────────────────────────

@outreach_bp.route("/search", methods=["POST"])
@require_auth
def search():
    body = request.get_json(silent=True) or {}
    query = (body.get("query") or "").strip()
    limit = min(int(body.get("limit", 5)), 10)

    if not query:
        return jsonify({"error": "query is required"}), 400

    user_id = g.user.get("user_id", "")
    test_contacts = _get_test_contact_if_testing(user_id)
    if test_contacts is not None:
        return jsonify({"contacts": test_contacts, "query": query, "testing_mode": True})

    api_key = current_app.config.get("PERPLEXITY_API_KEY")
    if not api_key:
        return jsonify({"error": "Perplexity API key not configured"}), 500

    try:
        contacts = search_contacts(api_key, query, limit=limit, user_id=user_id)
        return jsonify({"contacts": contacts, "query": query})
    except requests.exceptions.HTTPError as e:
        resp = e.response
        status = resp.status_code if resp is not None else None
        if status in (401, 403):
            return jsonify({"error": "Perplexity API key invalid or expired", "upstream_status": status}), 502
        return jsonify({"error": f"Search failed: {str(e)}"}), 502
    except Exception as e:
        current_app.logger.exception("Outreach search failed")
        return jsonify({"error": f"Search failed: {str(e)}"}), 500


# ── Campaigns CRUD ───────────────────────────────────

@outreach_bp.route("/campaigns", methods=["GET"])
@require_auth
def list_campaigns():
    user_id = g.user["user_id"]
    col = get_outreach_campaigns_collection()
    campaigns = list(col.find({"user_id": user_id}).sort("created_at", -1))
    return jsonify([_serialize(c) for c in campaigns])


@outreach_bp.route("/campaigns", methods=["POST"])
@require_auth
def create_campaign():
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()

    if not name:
        return jsonify({"error": "name is required"}), 400

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user_id,
        "name": name,
        "type": body.get("type", "general"),
        "status": "active",
        "contact_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    col = get_outreach_campaigns_collection()
    result = col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return jsonify(doc), 201


@outreach_bp.route("/campaigns/<campaign_id>", methods=["GET"])
@require_auth
def get_campaign(campaign_id):
    user_id = g.user["user_id"]
    col = get_outreach_campaigns_collection()
    try:
        campaign = col.find_one({"_id": ObjectId(campaign_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400

    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    contacts_col = get_outreach_contacts_collection()
    contacts = list(contacts_col.find({"user_id": user_id, "campaign_id": campaign_id}).sort("created_at", -1))

    result = _serialize(campaign)
    result["contacts"] = [_serialize(c) for c in contacts]
    return jsonify(result)


@outreach_bp.route("/campaigns/<campaign_id>", methods=["PUT"])
@require_auth
def update_campaign(campaign_id):
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    col = get_outreach_campaigns_collection()

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "name" in body:
        updates["name"] = body["name"]
    if "type" in body:
        updates["type"] = body["type"]
    if "status" in body:
        updates["status"] = body["status"]
    if "objective" in body:
        updates["objective"] = body["objective"]
    if "campaign_context" in body:
        updates["campaign_context"] = body["campaign_context"]

    try:
        result = col.find_one_and_update(
            {"_id": ObjectId(campaign_id), "user_id": user_id},
            {"$set": updates},
            return_document=True,
        )
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400

    if not result:
        return jsonify({"error": "Campaign not found"}), 404
    return jsonify(_serialize(result))


@outreach_bp.route("/campaigns/<campaign_id>", methods=["DELETE"])
@require_auth
def delete_campaign(campaign_id):
    user_id = g.user["user_id"]
    col = get_outreach_campaigns_collection()
    contacts_col = get_outreach_contacts_collection()

    try:
        col.delete_one({"_id": ObjectId(campaign_id), "user_id": user_id})
        contacts_col.delete_many({"user_id": user_id, "campaign_id": campaign_id})
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400

    return jsonify({"ok": True})


# ── Campaign contacts ────────────────────────────────

@outreach_bp.route("/campaigns/<campaign_id>/contacts", methods=["POST"])
@require_auth
def add_contacts_to_campaign(campaign_id):
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    contacts = body.get("contacts", [])

    if not contacts:
        return jsonify({"error": "contacts array is required"}), 400

    camp_col = get_outreach_campaigns_collection()
    try:
        campaign = camp_col.find_one({"_id": ObjectId(campaign_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400

    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    now = datetime.now(timezone.utc).isoformat()
    contacts_col = get_outreach_contacts_collection()
    docs = []
    for c in contacts:
        docs.append({
            "user_id": user_id,
            "campaign_id": campaign_id,
            "name": c.get("name", "Unknown"),
            "title": c.get("title"),
            "company": c.get("company"),
            "linkedin_url": c.get("linkedin_url"),
            "email": c.get("email"),
            "phone": c.get("phone"),
            "whatsapp": c.get("whatsapp"),
            "location": c.get("location"),
            "summary": c.get("summary"),
            "source": c.get("source", "manual"),
            "status": "found",
            "created_at": now,
        })

    if docs:
        contacts_col.insert_many(docs)
        camp_col.update_one(
            {"_id": ObjectId(campaign_id)},
            {"$inc": {"contact_count": len(docs)}, "$set": {"updated_at": now}},
        )

    return jsonify({"added": len(docs)}), 201


@outreach_bp.route("/campaigns/<campaign_id>/contacts/<contact_id>", methods=["DELETE"])
@require_auth
def remove_contact_from_campaign(campaign_id, contact_id):
    user_id = g.user["user_id"]
    contacts_col = get_outreach_contacts_collection()
    try:
        result = contacts_col.delete_one({
            "_id": ObjectId(contact_id),
            "user_id": user_id,
            "campaign_id": campaign_id,
        })
    except Exception:
        return jsonify({"error": "Invalid ID"}), 400

    if result.deleted_count:
        camp_col = get_outreach_campaigns_collection()
        camp_col.update_one(
            {"_id": ObjectId(campaign_id)},
            {"$inc": {"contact_count": -1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )

    return jsonify({"ok": True})


# ── Add single number ────────────────────────────────

@outreach_bp.route("/campaigns/<campaign_id>/add-number", methods=["POST"])
@require_auth
def add_number_to_campaign(campaign_id):
    """Add a single contact by phone number with an outreach objective."""
    user_id = g.user["user_id"]
    body = request.get_json(silent=True) or {}
    phone = (body.get("phone") or body.get("whatsapp") or "").strip()
    name = (body.get("name") or "").strip() or phone
    objective = (body.get("objective") or "").strip()

    if not phone:
        return jsonify({"error": "phone number is required"}), 400

    camp_col = get_outreach_campaigns_collection()
    try:
        campaign = camp_col.find_one({"_id": ObjectId(campaign_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400

    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    now = datetime.now(timezone.utc).isoformat()
    contacts_col = get_outreach_contacts_collection()
    doc = {
        "user_id": user_id,
        "campaign_id": campaign_id,
        "name": name,
        "title": body.get("title"),
        "company": body.get("company"),
        "phone": phone,
        "whatsapp": phone,
        "email": body.get("email"),
        "location": body.get("location"),
        "summary": body.get("summary"),
        "objective": objective,
        "source": "manual",
        "status": "found",
        "created_at": now,
    }

    contacts_col.insert_one(doc)
    camp_col.update_one(
        {"_id": ObjectId(campaign_id)},
        {"$inc": {"contact_count": 1}, "$set": {"updated_at": now}},
    )

    doc["_id"] = str(doc["_id"])
    return jsonify(doc), 201


# ── CSV import ───────────────────────────────────────

@outreach_bp.route("/campaigns/<campaign_id>/import-csv", methods=["POST"])
@require_auth
def import_csv_to_campaign(campaign_id):
    user_id = g.user["user_id"]

    camp_col = get_outreach_campaigns_collection()
    try:
        campaign = camp_col.find_one({"_id": ObjectId(campaign_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400

    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "CSV file is required"}), 400

    try:
        stream = io.StringIO(file.stream.read().decode("utf-8-sig"))
        reader = csv.DictReader(stream)
    except Exception as e:
        return jsonify({"error": f"Failed to parse CSV: {e}"}), 400

    now = datetime.now(timezone.utc).isoformat()
    contacts_col = get_outreach_contacts_collection()
    docs = []
    for row in reader:
        name = (row.get("name") or row.get("Name") or row.get("contact") or "").strip()
        email = (row.get("email") or row.get("Email") or "").strip() or None
        whatsapp = (row.get("whatsapp") or row.get("WhatsApp") or "").strip() or None
        phone = (row.get("phone") or row.get("Phone") or "").strip() or None
        if not name:
            name = email or whatsapp or phone or ""
        if not name:
            continue
        docs.append({
            "user_id": user_id,
            "campaign_id": campaign_id,
            "name": name,
            "title": (row.get("title") or "").strip() or None,
            "company": (row.get("company") or "").strip() or None,
            "email": email,
            "phone": phone,
            "whatsapp": whatsapp,
            "location": (row.get("location") or "").strip() or None,
            "summary": (row.get("summary") or "").strip() or None,
            "source": "csv",
            "status": "found",
            "created_at": now,
        })

    if docs:
        contacts_col.insert_many(docs)
        camp_col.update_one(
            {"_id": ObjectId(campaign_id)},
            {"$inc": {"contact_count": len(docs)}, "$set": {"updated_at": now}},
        )

    return jsonify({"imported": len(docs)})


# ── Campaign execution (AI outbound) ────────────────

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


@outreach_bp.route("/campaigns/<campaign_id>/execute", methods=["POST"])
@require_auth
def execute_campaign(campaign_id):
    user_id = g.user["user_id"]

    camp_col = get_outreach_campaigns_collection()
    try:
        campaign = camp_col.find_one({"_id": ObjectId(campaign_id), "user_id": user_id})
    except Exception:
        return jsonify({"error": "Invalid campaign ID"}), 400
    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    objective = (campaign.get("objective") or "").strip()
    if not objective:
        return jsonify({"error": "Campaign has no objective set"}), 400

    campaign_context = (campaign.get("campaign_context") or "").strip()

    api_key = current_app.config.get("PERPLEXITY_API_KEY")
    if not api_key:
        return jsonify({"error": "Perplexity API key not configured"}), 500

    contacts_col = get_outreach_contacts_collection()
    contacts = list(contacts_col.find({"user_id": user_id, "campaign_id": campaign_id}).sort("created_at", -1))

    from modules.llm import query_perplexity_chat
    from modules.messaging import send_message
    from modules.db import get_outbound_conversations_collection

    def generate():
        reachable = [c for c in contacts if c.get("whatsapp") or c.get("phone")]
        total = len(reachable)
        processed = 0
        failed = 0

        yield f"data: {json.dumps({'type': 'start', 'total': total, 'processed': 0, 'failed': 0})}\n\n"

        for contact in reachable:
            contact_id = str(contact["_id"])
            phone = contact.get("whatsapp") or contact.get("phone") or ""
            name = contact.get("name", "")

            yield ": keepalive\n\n"

            try:
                system_prompt = _build_outreach_message_prompt(objective, contact, campaign_context)
                conversation = [{"role": "user", "content": f"Write an outreach message to {name or phone}."}]
                llm_result = query_perplexity_chat(api_key, conversation, system_prompt)
                generated_message = llm_result.get("reply", "") if isinstance(llm_result, dict) else str(llm_result)

                if not generated_message or not generated_message.strip():
                    raise ValueError("LLM returned empty message")

                generated_message = generated_message.strip()
                clean_phone = "".join(ch for ch in phone if ch.isdigit())
                jid = f"{clean_phone}@s.whatsapp.net" if "@" not in phone else phone
                result = send_message(user_id, "whatsapp", jid, generated_message)
                status = "sent" if result.get("success") else "failed"
                if not result.get("success"):
                    failed += 1
                else:
                    processed += 1
                    conv_col = get_outbound_conversations_collection()
                    conv_now = datetime.now(timezone.utc).isoformat()
                    conv_col.update_one(
                        {"user_id": user_id, "jid": jid},
                        {"$set": {
                            "user_id": user_id,
                            "jid": jid,
                            "contact_name": name,
                            "phone": phone,
                            "objective": contact.get("objective") or objective,
                            "campaign_id": campaign_id,
                            "campaign_name": campaign.get("name", ""),
                            "campaign_context": campaign_context,
                            "initial_message": generated_message,
                            "status": "sent",
                            "auto_reply_count": 0,
                            "updated_at": conv_now,
                        }, "$setOnInsert": {"created_at": conv_now}},
                        upsert=True,
                    )

                contacts_col.update_one(
                    {"_id": contact["_id"]},
                    {"$set": {"status": status, "last_message": generated_message}},
                )

            except Exception:
                current_app.logger.exception("Campaign execute failed for contact %s", contact_id)
                status = "failed"
                failed += 1
                contacts_col.update_one(
                    {"_id": contact["_id"]},
                    {"$set": {"status": "failed"}},
                )

            yield f"data: {json.dumps({'type': 'progress', 'contact_id': contact_id, 'contact_name': name, 'contact_status': status, 'processed': processed, 'failed': failed, 'total': total})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'processed': processed, 'failed': failed, 'total': total})}\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })
