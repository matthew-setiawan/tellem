from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from modules.auth import hash_password, verify_password, create_jwt
from modules.db import get_users_collection
from middleware.auth_middleware import require_auth

auth_bp = Blueprint("auth", __name__)


def serialize_user(user):
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "email": user.get("email", ""),
        "business_name": user.get("business_name", ""),
        "role": user.get("role", "user"),
        "created_at": user.get("created_at", ""),
    }


@auth_bp.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body required"}), 400

    username = body.get("username", "").strip()
    password = body.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    users = get_users_collection()
    user = users.find_one({"username": username}, {
        "username": 1, "password_hash": 1, "email": 1,
        "business_name": 1, "role": 1, "created_at": 1,
    })

    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_jwt({
        "user_id": str(user["_id"]),
        "username": user["username"],
        "role": user.get("role", "user"),
    })

    return jsonify({"token": token, "user": serialize_user(user)})


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    users = get_users_collection()
    user = users.find_one({"_id": ObjectId(g.user["user_id"])}, {"password_hash": 0})
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(serialize_user(user))


@auth_bp.route("/register", methods=["POST"])
def register():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body required"}), 400

    username = body.get("username", "").strip()
    password = body.get("password", "")
    email = body.get("email", "").strip().lower()
    business_name = body.get("business_name", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if not email:
        return jsonify({"error": "Email is required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    users = get_users_collection()

    if users.find_one({"username": username}):
        return jsonify({"error": "Username already exists"}), 409
    if users.find_one({"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    user_oid = ObjectId()
    users.insert_one({
        "_id": user_oid,
        "username": username,
        "password_hash": hash_password(password),
        "email": email,
        "business_name": business_name,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    user = users.find_one({"_id": user_oid})
    token = create_jwt({
        "user_id": str(user["_id"]),
        "username": user["username"],
        "role": "user",
    })
    return jsonify({"token": token, "user": serialize_user(user)}), 201
