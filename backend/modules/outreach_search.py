"""
Outreach contact discovery via Perplexity web search.
"""

import json
import re

from modules.llm import query_perplexity

SEARCH_SYSTEM_PROMPT = """\
You are a recruiter research assistant. The user describes who they want to reach out to.

Search the web and return a JSON array of **up to {limit}** distinct people who match the request.
Prefer **several different people** (not just one): aim for at least 3 when the query implies a pool.

Each object MUST have these keys (use null only when truly unknown):
  "name"         – person's full name
  "title"        – current role
  "company"      – employer name
  "linkedin_url" – LinkedIn profile URL if found, else null
  "email"        – null (do not guess emails)
  "phone"        – null (do not guess phone numbers)
  "location"     – city/region if known
  "summary"      – one short sentence on why they fit the query

Rules:
- Return ONLY the JSON array. No markdown, no code fences, no preamble, no questions.
- Do NOT use citation markers like [1] or [2] inside JSON strings.
- Prefer **different people** (vary names).
- NEVER ask for clarification; pick reasonable interpretations and return the best matches.
"""

STRICT_RETRY_SYSTEM_PROMPT = """\
Output format is mandatory.

Return ONLY a JSON array of **up to {limit}** objects. Include multiple people when possible. No other text.

Each object:
{{"name":"...","title":"...","company":"...","linkedin_url":null,"email":null,"phone":null,"location":"...","summary":"..."}}

Do not ask questions. No markdown. No citations.
"""


def _parse_contacts_from_reply(reply_text):
    text = reply_text.strip()

    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    text = re.sub(r"\[(\d+)\]", "", text)

    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < 0 or end <= start:
        return []

    json_str = text[start : end + 1]
    try:
        data = json.loads(json_str)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass

    return []


def _str_or_none(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _pick_first(d, *keys):
    if not isinstance(d, dict):
        return None
    for k in keys:
        if k not in d:
            continue
        s = _str_or_none(d.get(k))
        if s:
            return s
    return None


def _normalize_contact_row(c):
    if not isinstance(c, dict):
        return None

    name = _pick_first(c, "name", "full_name", "fullName", "person_name", "Name")
    if not name:
        first = _str_or_none(c.get("first_name") or c.get("firstName"))
        last = _str_or_none(c.get("last_name") or c.get("lastName"))
        if first and last:
            name = f"{first} {last}"
        elif first:
            name = first

    return {
        "name": name or "Unknown",
        "title": _str_or_none(_pick_first(c, "title", "job_title", "role", "position")),
        "company": _str_or_none(_pick_first(c, "company", "employer", "organization")),
        "linkedin_url": _str_or_none(_pick_first(c, "linkedin_url", "linkedin", "linkedinUrl")),
        "email": _str_or_none(c.get("email")) if c.get("email") is not None else None,
        "phone": _str_or_none(c.get("phone")) if c.get("phone") is not None else None,
        "location": _str_or_none(_pick_first(c, "location", "city", "region")),
        "summary": _str_or_none(_pick_first(c, "summary", "bio", "description")),
        "source": "perplexity",
    }


def search_contacts(api_key, query, limit=5, user_id=""):
    limit = max(3, min(int(limit), 10))
    system = SEARCH_SYSTEM_PROMPT.format(limit=limit)
    result = query_perplexity(api_key, query, system_prompt=system, model="sonar")
    contacts = _parse_contacts_from_reply(result.get("reply", ""))

    if not contacts:
        retry_system = STRICT_RETRY_SYSTEM_PROMPT.format(limit=limit)
        retry_user = f"User request: {query}\n\nReturn the JSON array of people now."
        retry_result = query_perplexity(api_key, retry_user, system_prompt=retry_system, model="sonar")
        contacts = _parse_contacts_from_reply(retry_result.get("reply", "")) or contacts

    cleaned = []
    for c in contacts[:limit]:
        row = _normalize_contact_row(c)
        if row:
            cleaned.append(row)
    return cleaned
