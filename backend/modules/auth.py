import hashlib
import hmac
import os
import time
import json
import base64

import config


def hash_password(password):
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return (salt + key).hex()


def verify_password(password, stored_hash):
    raw = bytes.fromhex(stored_hash)
    salt = raw[:32]
    stored_key = raw[32:]
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return hmac.compare_digest(key, stored_key)


def create_jwt(payload):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        **payload,
        "iat": int(time.time()),
        "exp": int(time.time()) + config.JWT_EXPIRY_HOURS * 3600,
    }

    segments = []
    for data in [header, payload]:
        encoded = base64.urlsafe_b64encode(
            json.dumps(data, separators=(",", ":")).encode()
        ).rstrip(b"=")
        segments.append(encoded)

    signing_input = b".".join(segments)
    signature = hmac.new(
        config.JWT_SECRET.encode(), signing_input, hashlib.sha256
    ).digest()
    segments.append(base64.urlsafe_b64encode(signature).rstrip(b"="))

    return b".".join(segments).decode()


def decode_jwt(token):
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        def pad(s):
            return s + "=" * (4 - len(s) % 4)

        payload_json = base64.urlsafe_b64decode(pad(parts[1]))
        payload = json.loads(payload_json)

        signing_input = f"{parts[0]}.{parts[1]}".encode()
        expected_sig = hmac.new(
            config.JWT_SECRET.encode(), signing_input, hashlib.sha256
        ).digest()
        actual_sig = base64.urlsafe_b64decode(pad(parts[2]))

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        if payload.get("exp", 0) < time.time():
            return None

        return payload
    except Exception:
        return None
