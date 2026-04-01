"""
Offline RAG retrieval evaluation script.

Calls /api/chat/stream (NDJSON), parses delta/meta lines, and reports
on evidence presence, structured fields, and link quality.

Usage:
    cd crawler && python rag_eval.py
    cd crawler && python rag_eval.py --base http://localhost:8080
"""
import argparse
import json
import os
import re
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

EVAL_QUERIES = [
    {"query": "我是双非计算机大三，GPA 3.5，排名前10%，想保研，能去什么学校", "expect_outcome": "保研"},
    {"query": "211计算机大四考研408，能考什么985", "expect_outcome": "考研"},
    {"query": "双非GPA3.2想申请美国CS硕士QS100有希望吗", "expect_outcome": "留学"},
    {"query": "985计算机研二秋招后端开发面经", "expect_outcome": "就业"},
    {"query": "普通一本计算机大三想出国读研留学", "expect_outcome": "留学"},
    {"query": "宝鸡文理学院计算机考研能去什么学校", "expect_outcome": "考研"},
    {"query": "杭电计算机保研到985的可能性", "expect_outcome": "保研"},
    {"query": "港大CS硕士申请GPA要求多少", "expect_outcome": "留学"},
    {"query": "双非有实习有科研保研面试经验", "expect_outcome": "保研"},
    {"query": "跨考计算机408二战经验", "expect_outcome": "考研"},
]


def get_token(base: str):
    r = requests.post(
        f"{base}/api/auth/anonymous",
        json={"session_id": "rag-eval"},
        timeout=10,
    )
    r.raise_for_status()
    d = r.json()
    return d["token"], d["session_id"]


def parse_ndjson(raw_text: str):
    """Parse NDJSON text into (full_reply, meta_dict)."""
    full_reply = ""
    meta = {}
    for line in raw_text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = obj.get("t")
        if t == "delta":
            full_reply += obj.get("c", "")
        elif t == "meta":
            meta = obj
            if "message" not in meta or not meta["message"]:
                meta["message"] = full_reply
        elif t == "error":
            meta = {"error": obj.get("message", "unknown error")}
    return full_reply, meta


def test_query(base: str, token: str, session_id: str, q: dict):
    r = requests.post(
        f"{base}/api/chat/stream",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "session_id": session_id,
            "messages": [{"role": "user", "content": q["query"]}],
        },
        timeout=30,
        stream=False,
    )
    full_reply, meta = parse_ndjson(r.text)

    if "error" in meta:
        return {"query": q["query"][:40], "error": meta["error"]}

    evidence = meta.get("evidence") or []
    similar = meta.get("similarCases") or []
    reply = meta.get("message", full_reply) or full_reply

    has_link = bool(re.search(r"\[[^\]]+\]\(https?://[^)]+\)", reply))
    has_evidence = len(evidence) > 0
    has_structured = any(
        e.get("schoolTier") or e.get("gpa") or e.get("outcome")
        for e in evidence
    )
    has_similar_structured = any(
        c.get("schoolTier") or c.get("gpa") or c.get("outcome")
        for c in similar
    )

    return {
        "query": q["query"][:50],
        "expect": q["expect_outcome"],
        "reply_len": len(reply),
        "has_link": has_link,
        "evidence_count": len(evidence),
        "similar_count": len(similar),
        "has_structured": has_structured or has_similar_structured,
        "reply_preview": reply[:120].replace("\n", " "),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=os.getenv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8080"))
    args = parser.parse_args()
    base = args.base.rstrip("/")

    token, session_id = get_token(base)
    print(f"Token obtained, session={session_id}\n")

    results = []
    for q in EVAL_QUERIES:
        try:
            r = test_query(base, token, session_id, q)
            results.append(r)
            if "error" in r:
                print(f"[ERR] {r['query']}: {r['error']}\n")
                continue
            ok = r["has_link"] and r["evidence_count"] > 0
            status = "OK" if ok else "WARN"
            print(f"[{status}] {r['query']}")
            print(f"  expect={r['expect']}, evidence={r['evidence_count']}, similar={r['similar_count']}, link={r['has_link']}, structured={r['has_structured']}")
            print(f"  reply: {r['reply_preview']}")
            print()
        except Exception as e:
            print(f"[ERR] {q['query'][:40]}: {e}\n")
            results.append({"query": q["query"][:40], "error": str(e)})

    total = len(results)
    ok_results = [r for r in results if "error" not in r]
    ok_total = len(ok_results)

    if ok_total == 0:
        print("All queries failed.")
        return

    link_rate = sum(1 for r in ok_results if r.get("has_link")) / ok_total
    evidence_rate = sum(1 for r in ok_results if r.get("evidence_count", 0) > 0) / ok_total
    structured_rate = sum(1 for r in ok_results if r.get("has_structured")) / ok_total
    avg_evidence = sum(r.get("evidence_count", 0) for r in ok_results) / ok_total

    print("=" * 60)
    print(f"Total queries: {total} (ok={ok_total}, err={total - ok_total})")
    print(f"Link in reply rate: {link_rate:.0%}")
    print(f"Evidence presence rate: {evidence_rate:.0%}")
    print(f"Structured fields rate: {structured_rate:.0%}")
    print(f"Avg evidence per query: {avg_evidence:.1f}")


if __name__ == "__main__":
    main()
