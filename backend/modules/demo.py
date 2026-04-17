"""
Demo mode utilities — generate fake contacts and simulated replies
so users can test the full outbound flow without sending real messages.
"""

import json
import uuid

from modules.llm import query_perplexity_chat


DEMO_JID_SUFFIX = "@demo.tellem"


def is_demo_jid(jid):
    return jid and jid.endswith(DEMO_JID_SUFFIX)


def _make_demo_jid():
    return f"demo_{uuid.uuid4().hex[:8]}{DEMO_JID_SUFFIX}"


def generate_fake_contacts(api_key, query, count=5):
    """Use the LLM to generate realistic-looking fake contacts based on the search query."""
    system_prompt = (
        "You generate realistic-looking FAKE contact data for demo purposes. "
        "Output valid JSON only — an array of objects.\n"
        "Each object must have: name, title, company, email, phone, location, summary.\n"
        "Make the data believable and varied. Use real-sounding company names "
        "and job titles that match the search query. Phone numbers should look "
        "real but use clearly fake formats (e.g. +1 555-XXX-XXXX).\n"
        "Output ONLY the JSON array, nothing else."
    )

    user_msg = f"Generate {count} fake contacts matching: {query}"

    try:
        result = query_perplexity_chat(api_key, [{"role": "user", "content": user_msg}], system_prompt)
        raw = result.get("reply", "[]") if isinstance(result, dict) else str(result)

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

        bracket_start = raw.find("[")
        bracket_end = raw.rfind("]")
        if bracket_start >= 0 and bracket_end > bracket_start:
            raw = raw[bracket_start:bracket_end + 1]

        contacts = json.loads(raw)
    except Exception:
        contacts = _fallback_contacts(query, count)

    result_contacts = []
    for c in contacts[:count]:
        demo_jid = _make_demo_jid()
        result_contacts.append({
            "name": c.get("name", "Demo Contact"),
            "title": c.get("title", ""),
            "company": c.get("company", ""),
            "email": c.get("email", ""),
            "phone": c.get("phone", "+1 555-000-0000"),
            "whatsapp": demo_jid,
            "location": c.get("location", ""),
            "summary": c.get("summary", "Demo contact for testing"),
            "source": "demo",
            "is_demo": True,
        })

    return result_contacts


def generate_fake_reply(api_key, contact, outreach_message, objective):
    """Generate a realistic simulated reply from a fake lead."""
    system_prompt = (
        "You are role-playing as a real person who just received a WhatsApp outreach message. "
        "Generate a SHORT, realistic reply (1-3 sentences max). "
        "Vary the tone naturally — some people are interested, some ask questions, "
        "some are busy but open, some are politely dismissive. "
        "Write as a normal person would text on WhatsApp — informal, brief, "
        "no corporate language. Output ONLY the reply text, nothing else."
    )

    user_msg = (
        f"You are {contact.get('name', 'someone')}, "
        f"{contact.get('title', '')} at {contact.get('company', 'a company')}.\n"
        f"You received this outreach message:\n\"{outreach_message}\"\n\n"
        f"Write a realistic reply."
    )

    try:
        result = query_perplexity_chat(api_key, [{"role": "user", "content": user_msg}], system_prompt)
        reply = result.get("reply", "") if isinstance(result, dict) else str(result)
        reply = reply.strip().strip('"').strip("'")
        if reply:
            return reply
    except Exception:
        pass

    return "Hey, thanks for reaching out. Can you tell me a bit more?"


def _fallback_contacts(query, count):
    """Generate basic fake contacts without LLM if the API call fails."""
    names = [
        ("Alex Rivera", "Head of Growth", "TechFlow Inc"),
        ("Jordan Chen", "VP Marketing", "ScaleUp Labs"),
        ("Morgan Patel", "Director of Sales", "CloudBase"),
        ("Sam Nguyen", "CEO", "DataBridge"),
        ("Casey Williams", "COO", "NextStep Ventures"),
        ("Riley Kim", "Head of BD", "Quantum AI"),
        ("Taylor Brown", "CTO", "SyncWave"),
        ("Jamie Davis", "Partnerships Lead", "Meridian Corp"),
    ]
    contacts = []
    for i in range(min(count, len(names))):
        name, title, company = names[i]
        contacts.append({
            "name": name,
            "title": title,
            "company": company,
            "email": f"{name.split()[0].lower()}@{company.lower().replace(' ', '')}.com",
            "phone": f"+1 555-{100 + i:03d}-{1000 + i * 111:04d}",
            "location": "United States",
            "summary": f"Potential lead matching: {query[:50]}",
        })
    return contacts
