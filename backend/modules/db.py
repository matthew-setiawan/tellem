from pymongo import MongoClient
import config

_client = None
_db = None
_indexes_ready = False
_MONGO_CLIENT_OPTIONS = {
    "serverSelectionTimeoutMS": 15000,
    "connectTimeoutMS": 10000,
    "socketTimeoutMS": 30000,
    "maxPoolSize": 50,
    "minPoolSize": 5,
}


def get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(config.MONGO_URI, **_MONGO_CLIENT_OPTIONS)
        _db = _client[config.MONGO_DB_NAME]
    return _db


def ping_db():
    client = get_db().client
    client.admin.command("ping")
    return True


def get_users_collection():
    return get_db()["users"]


def get_settings_collection():
    return get_db()["business_settings"]


def get_message_logs_collection():
    ensure_indexes()
    return get_db()["message_logs"]


def get_whatsapp_contacts_collection():
    ensure_indexes()
    return get_db()["whatsapp_contacts"]


def get_whatsapp_chats_collection():
    ensure_indexes()
    return get_db()["whatsapp_chats"]


def get_outreach_campaigns_collection():
    ensure_indexes()
    return get_db()["outreach_campaigns"]


def get_outreach_contacts_collection():
    ensure_indexes()
    return get_db()["outreach_contacts"]


def get_supervisor_threads_collection():
    ensure_indexes()
    return get_db()["supervisor_threads"]


def get_supervisor_conversations_collection():
    ensure_indexes()
    return get_db()["supervisor_conversations"]


def get_outbound_conversations_collection():
    ensure_indexes()
    return get_db()["outbound_conversations"]


def get_agent_threads_collection():
    ensure_indexes()
    return get_db()["agent_threads"]


def ensure_indexes():
    global _indexes_ready
    if _indexes_ready:
        return

    db = get_db()

    db["users"].create_index("username", unique=True, name="username_unique")
    db["users"].create_index("email", sparse=True, name="email_idx")
    db["business_settings"].create_index("user_id", unique=True, name="user_id_unique")

    db["whatsapp_contacts"].create_index(
        [("user_id", 1), ("jid", 1)],
        unique=True, name="user_jid_unique",
    )
    db["whatsapp_chats"].create_index(
        [("user_id", 1), ("jid", 1)],
        unique=True, name="user_jid_unique",
    )
    db["whatsapp_chats"].create_index(
        [("user_id", 1), ("updatedAt", -1)],
        name="user_updated_at_desc",
    )
    db["message_logs"].create_index(
        [("user_id", 1), ("wa_instance_id", 1), ("channel", 1), ("jid", 1), ("message_id", 1)],
        unique=True,
        partialFilterExpression={"message_id": {"$exists": True, "$type": "string"}},
        name="wa_message_unique",
    )
    db["message_logs"].create_index(
        [("user_id", 1), ("wa_instance_id", 1), ("channel", 1), ("jid", 1), ("wa_message_timestamp", -1)],
        name="wa_message_cursor",
    )
    db["outreach_campaigns"].create_index(
        [("user_id", 1), ("created_at", -1)],
        name="user_created_at_desc",
    )
    db["outreach_contacts"].create_index(
        [("user_id", 1), ("campaign_id", 1)],
        name="user_campaign_idx",
    )

    db["outbound_conversations"].create_index(
        [("user_id", 1), ("jid", 1)],
        unique=True, name="user_jid_unique",
    )
    db["outbound_conversations"].create_index(
        [("user_id", 1), ("status", 1), ("updated_at", -1)],
        name="user_status_updated",
    )

    db["agent_threads"].create_index(
        [("user_id", 1), ("updated_at", -1)],
        name="user_updated_at_desc",
    )

    _indexes_ready = True
