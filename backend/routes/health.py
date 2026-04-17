from flask import Blueprint, jsonify
from modules.db import ping_db

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health():
    try:
        ping_db()
        return jsonify({"status": "ok", "db": "connected"})
    except Exception as e:
        return jsonify({"status": "degraded", "db": str(e)}), 503
