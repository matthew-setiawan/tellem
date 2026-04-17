import re
import requests

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
DEFAULT_MODEL = "sonar"

_CITATION_RE = re.compile(r"\s*\[(\d+(?:\s*[,;]\s*\d+)*)\]")


def _strip_citations(text):
    if not text:
        return text
    return _CITATION_RE.sub("", text).strip()


def query_perplexity(api_key, message, system_prompt="You are a helpful assistant.", model=None):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
    }

    resp = requests.post(PERPLEXITY_API_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    choice = data["choices"][0]

    return {
        "reply": _strip_citations(choice["message"]["content"]),
        "model": data.get("model"),
        "usage": data.get("usage"),
    }


def _normalize_messages(messages):
    normalized = []
    for msg in messages:
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        role = msg.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        if normalized and normalized[-1]["role"] == role:
            normalized[-1]["content"] += "\n" + content
        else:
            normalized.append({"role": role, "content": content})

    if not normalized:
        normalized = [{"role": "user", "content": "Hello"}]

    if normalized[0]["role"] != "user":
        normalized.insert(0, {"role": "user", "content": "(conversation start)"})

    return normalized


def query_perplexity_chat(api_key, messages, system_prompt, model=None):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            *_normalize_messages(messages),
        ],
    }

    resp = requests.post(PERPLEXITY_API_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    choice = data["choices"][0]

    return {
        "reply": _strip_citations(choice["message"]["content"]),
        "model": data.get("model"),
        "usage": data.get("usage"),
    }
