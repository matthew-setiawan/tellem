from functools import wraps
from flask import request, jsonify, g
from modules.auth import decode_jwt


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        token = header[7:]
        payload = decode_jwt(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        g.user = payload
        return f(*args, **kwargs)

    return decorated
