"""
Batch extract structured profile fields from enriched zhihu articles.

Usage:
  cd crawler && python extract_profiles.py --limit 20
  cd crawler && python extract_profiles.py
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from typing import Any

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DB_CONF = {
    "dbname": os.getenv("POSTGRES_DB", "cyber_guide"),
    "user": os.getenv("POSTGRES_USER", "cyber_guide"),
    "password": os.getenv("POSTGRES_PASSWORD", "change_me_in_production"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5432"),
}

API_KEY = os.getenv("OPENAI_API_KEY", "")
BASE_URL = os.getenv("OPENAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/")
MODEL = os.getenv("OPENAI_MODEL", "glm-4-flash")

PROMPT = """
从下面这篇经验帖中提取作者背景与去向，只输出 JSON，不要输出解释。
字段定义：
{{
  "school": "作者原学校（如无法判断填空）",
  "school_tier": "C9/985/211/双一流/双非/普通一本/未知",
  "gpa": "GPA或绩点数字，例如3.5（提取不到则空）",
  "rank_pct": "排名百分比，例如5%（提取不到则空）",
  "outcome": "保研/考研/留学/就业/未知",
  "dest_school": "去向学校（提取不到则空）"
}}

标题：{title}
正文：
{content}
""".strip()


def call_extract(title: str, content: str) -> dict[str, str] | None:
    if not API_KEY:
        raise RuntimeError("OPENAI_API_KEY is empty")
    resp = requests.post(
        f"{BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": PROMPT.format(title=title[:200], content=content[:2600])}],
            "temperature": 0.1,
            "max_tokens": 300,
        },
        timeout=25,
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    raw = (((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()
    try:
        parsed = json.loads(raw)
    except Exception:
        return None
    return sanitize_fields({
        "school": str(parsed.get("school", "")).strip(),
        "school_tier": str(parsed.get("school_tier", "")).strip(),
        "gpa": str(parsed.get("gpa", "")).strip(),
        "rank_pct": str(parsed.get("rank_pct", "")).strip(),
        "outcome": str(parsed.get("outcome", "")).strip(),
        "dest_school": str(parsed.get("dest_school", "")).strip(),
    })


def sanitize_fields(data: dict[str, str]) -> dict[str, str]:
    school = (data.get("school") or "").strip()[:128]
    school_tier = (data.get("school_tier") or "").strip()[:32]
    gpa = normalize_gpa(data.get("gpa") or "")
    rank_pct = normalize_rank_pct(data.get("rank_pct") or "")
    outcome = normalize_outcome(data.get("outcome") or "")
    dest_school = (data.get("dest_school") or "").strip()[:128]
    return {
        "school": school,
        "school_tier": school_tier,
        "gpa": gpa[:16],
        "rank_pct": rank_pct[:16],
        "outcome": outcome[:32],
        "dest_school": dest_school,
    }


def normalize_gpa(raw: str) -> str:
    m = re.search(r"([0-4](?:\\.[0-9]{1,2})?)", raw or "")
    return m.group(1) if m else (raw.strip()[:16] if raw else "")


def normalize_rank_pct(raw: str) -> str:
    text = (raw or "").strip()
    m = re.search(r"([0-9]{1,2}(?:\\.[0-9])?)\\s*%?", text)
    if m:
        return f"{m.group(1)}%"
    return text[:16]


def normalize_outcome(raw: str) -> str:
    t = (raw or "").strip()
    if "保研" in t or "推免" in t:
        return "保研"
    if "考研" in t or "调剂" in t or "复试" in t:
        return "考研"
    if "留学" in t or "出国" in t:
        return "留学"
    if "就业" in t or "实习" in t or "工作" in t:
        return "就业"
    return "未知"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="0 means all")
    parser.add_argument("--delay", type=float, default=1.0, help="seconds between calls")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONF)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, title, content_snippet
        FROM crawled_articles
        WHERE source_name='zhihu'
          AND LENGTH(COALESCE(content_snippet, '')) >= 200
          AND (extracted_outcome IS NULL OR extracted_outcome = '')
        ORDER BY quality_score DESC, crawl_time DESC
        """
    )
    rows: list[tuple[Any, str, str]] = cur.fetchall()
    if args.limit > 0:
        rows = rows[: args.limit]
    total = len(rows)
    print(f"target rows={total}")
    ok = 0
    fail = 0
    for i, (row_id, title, content) in enumerate(rows, 1):
        info = call_extract(title or "", content or "")
        if not info:
            fail += 1
            print(f"[{i}/{total}] fail")
        else:
            cur.execute(
                """
                UPDATE crawled_articles
                SET extracted_school=%s,
                    extracted_school_tier=%s,
                    extracted_gpa=%s,
                    extracted_rank_pct=%s,
                    extracted_outcome=%s,
                    extracted_dest_school=%s
                WHERE id=%s
                """,
                (
                    info["school"],
                    info["school_tier"],
                    info["gpa"],
                    info["rank_pct"],
                    info["outcome"],
                    info["dest_school"],
                    row_id,
                ),
            )
            conn.commit()
            ok += 1
            print(f"[{i}/{total}] ok outcome={info['outcome']} school={info['school']}")
        if i < total:
            time.sleep(args.delay)
    conn.close()
    print(f"done ok={ok} fail={fail} total={total}")


if __name__ == "__main__":
    main()
