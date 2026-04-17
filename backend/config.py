import os


def _get_env(name, default=None, trim=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip() if trim else raw
    if value == "":
        return default
    return value


def _get_int_env(name, default):
    raw = _get_env(name)
    if raw is None:
        return default
    return int(raw)


def _parse_csv_env(name, default=None):
    raw = _get_env(name, "")
    if not raw:
        return default or []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_bool_env(name, default=False):
    raw = _get_env(name, trim=True)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


MONGO_URI = _get_env("MONGO_URI")
MONGO_DB_NAME = _get_env("MONGO_DB_NAME", "tellem_ai", trim=True)

PERPLEXITY_API_KEY = _get_env("PERPLEXITY_API_KEY")
OPENAI_API_KEY = _get_env("OPENAI_API_KEY")

JWT_SECRET = _get_env("JWT_SECRET", "change-me-in-production")
JWT_EXPIRY_HOURS = _get_int_env("JWT_EXPIRY_HOURS", 24)

WA_INTERNAL_TOKEN = _get_env("WA_INTERNAL_TOKEN", JWT_SECRET)
WA_SERVICE_URL = _get_env("WA_SERVICE_URL", "http://localhost:3001", trim=True)

CORS_ORIGINS = _parse_csv_env("CORS_ORIGINS", [
    "http://localhost:5173",
    "http://localhost:3000",
])
