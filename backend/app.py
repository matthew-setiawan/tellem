import os
import sys
import traceback
from pathlib import Path
from flask import Flask, jsonify, request as flask_request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure

BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"

load_dotenv(BACKEND_DIR / ".env")
load_dotenv()

import config
from routes.health import health_bp
from routes.auth_routes import auth_bp
from routes.outreach_routes import outreach_bp
from routes.whatsapp_routes import whatsapp_bp
from routes.conversation_routes import conversation_bp
from routes.webhook_routes import webhook_bp
from routes.settings_routes import settings_bp
from routes.agent_routes import agent_bp


def create_app():
    app = Flask(__name__)
    CORS(app, origins=config.CORS_ORIGINS, supports_credentials=True)

    app.config["MONGO_URI"] = config.MONGO_URI
    app.config["PERPLEXITY_API_KEY"] = config.PERPLEXITY_API_KEY
    app.config["OPENAI_API_KEY"] = config.OPENAI_API_KEY
    app.config["WA_SERVICE_URL"] = config.WA_SERVICE_URL

    @app.before_request
    def log_request():
        print(f"\n>>> {flask_request.method} {flask_request.path}", flush=True)
        if flask_request.is_json:
            print(f"    Body: {flask_request.get_json(silent=True)}", flush=True)

    @app.after_request
    def log_response(response):
        print(f"<<< {response.status_code} {flask_request.path}", flush=True)
        return response

    @app.errorhandler(ServerSelectionTimeoutError)
    @app.errorhandler(ConnectionFailure)
    def handle_db_error(e):
        print(f"!!! DB ERROR: {e}", flush=True)
        return jsonify({"error": "Database unavailable – check MONGO_URI and Atlas IP whitelist"}), 503

    @app.errorhandler(Exception)
    def handle_generic_error(e):
        print(f"!!! ERROR: {e}", flush=True)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(outreach_bp, url_prefix="/api/outreach")
    app.register_blueprint(whatsapp_bp, url_prefix="/api/whatsapp")
    app.register_blueprint(conversation_bp, url_prefix="/api/conversations")
    app.register_blueprint(webhook_bp, url_prefix="/api/webhook")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")
    app.register_blueprint(agent_bp, url_prefix="/api/agent")

    # Serve the React SPA in production (when frontend/dist exists)
    _serve_frontend = FRONTEND_DIST.is_dir()

    @app.errorhandler(404)
    def handle_404(e):
        if flask_request.path.startswith("/api"):
            return jsonify({"error": "Not found"}), 404
        if _serve_frontend:
            req_path = flask_request.path.lstrip("/")
            file_path = FRONTEND_DIST / req_path
            if req_path and file_path.is_file():
                return send_from_directory(str(FRONTEND_DIST), req_path)
            return send_from_directory(str(FRONTEND_DIST), "index.html")
        return jsonify({"error": "Not found"}), 404

    return app


if __name__ == "__main__":
    uri = config.MONGO_URI or "NOT SET"
    masked = uri[:25] + "***" + uri[-30:] if len(uri) > 60 else uri
    print(f"\n=== Tellem Backend ===")
    print(f"  MONGO_URI: {masked}")
    print(f"  DB Name:   {config.MONGO_DB_NAME}")
    print(f"  CORS:      {config.CORS_ORIGINS}")
    print(f"=========================\n", flush=True)

    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
