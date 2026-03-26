"""
Zhihu content enrichment script.

Reads all zhihu articles from the database that have short content_snippet,
fetches full article content via the detail API with x-zse-96 signing,
and updates content_snippet + summary in the database.

Usage:
    cd crawler && python enrich_zhihu.py          # enrich all short articles
    cd crawler && python enrich_zhihu.py --limit 5 # test with 5 articles
    cd crawler && python enrich_zhihu.py --dry-run  # test API without writing DB
"""
import argparse
import hashlib
import os
import re
import sys
import time

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

ZHIHU_COOKIE = os.getenv("ZHIHU_COOKIE", "")
D_C0 = ""
m = re.search(r'd_c0=([^;]+)', ZHIHU_COOKIE)
if m:
    D_C0 = m.group(1).strip()

X_ZSE_93 = "101_3_3.0"
SNIPPET_MAX = 2000
SUMMARY_MAX = 500
MIN_EXISTING_LEN = 150
REQUEST_DELAY = 2.0

DB_CONF = {
    "dbname": os.getenv("POSTGRES_DB", "cyber_guide"),
    "user": os.getenv("POSTGRES_USER", "cyber_guide"),
    "password": os.getenv("POSTGRES_PASSWORD", "change_me_in_production"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5432"),
}


def compute_x_zse_96(path: str) -> str:
    raw = f'{X_ZSE_93}+{path}+"{D_C0}"'
    return "2.0_" + hashlib.md5(raw.encode()).hexdigest()


def api_headers(path: str) -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Cookie": ZHIHU_COOKIE,
        "Referer": "https://www.zhihu.com/",
        "x-zse-93": X_ZSE_93,
        "x-zse-96": compute_x_zse_96(path),
    }


def strip_html(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_article_id(url: str) -> str | None:
    m = re.search(r"/p/(\d+)", url)
    return m.group(1) if m else None


def fetch_article_content(article_id: str) -> str | None:
    path = f"/api/v4/articles/{article_id}"
    try:
        r = requests.get(
            f"https://www.zhihu.com{path}",
            headers=api_headers(path),
            timeout=12,
        )
        if r.status_code == 200:
            data = r.json()
            raw_content = data.get("content", "")
            return strip_html(raw_content)
        else:
            print(f"  API {r.status_code} for article {article_id}")
            return None
    except Exception as e:
        print(f"  Request error for article {article_id}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Limit articles to process (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="Test API without DB writes")
    args = parser.parse_args()

    if not D_C0:
        print("ERROR: ZHIHU_COOKIE missing or no d_c0 found. Set it in .env")
        sys.exit(1)

    conn = psycopg2.connect(**DB_CONF)
    cur = conn.cursor()

    query = """
        SELECT id, url, LENGTH(content_snippet) as slen
        FROM crawled_articles
        WHERE source_name = 'zhihu'
          AND url LIKE '%%zhuanlan.zhihu.com/p/%%'
          AND (content_snippet IS NULL OR LENGTH(content_snippet) < %s)
        ORDER BY quality_score DESC
    """
    cur.execute(query, (MIN_EXISTING_LEN,))
    rows = cur.fetchall()

    if args.limit > 0:
        rows = rows[:args.limit]

    total = len(rows)
    print(f"Found {total} articles needing enrichment (min_len={MIN_EXISTING_LEN})")
    if total == 0:
        print("Nothing to do.")
        conn.close()
        return

    enriched = 0
    failed = 0
    skipped = 0

    for i, (row_id, url, slen) in enumerate(rows, 1):
        article_id = extract_article_id(url)
        if not article_id:
            skipped += 1
            continue

        content = fetch_article_content(article_id)
        if not content or len(content) < 50:
            failed += 1
            progress = f"[{i}/{total}]"
            print(f"  {progress} SKIP article={article_id} (no content or too short)")
        else:
            snippet = content[:SNIPPET_MAX]
            summary = content[:SUMMARY_MAX]

            if not args.dry_run:
                cur.execute(
                    "UPDATE crawled_articles SET content_snippet = %s, summary = %s WHERE id = %s",
                    (snippet, summary, row_id),
                )
                conn.commit()

            enriched += 1
            progress = f"[{i}/{total}]"
            print(f"  {progress} OK article={article_id} len={len(content)} -> snippet={len(snippet)}")

        if i < total:
            time.sleep(REQUEST_DELAY)

    conn.close()
    mode = "DRY-RUN" if args.dry_run else "DONE"
    print(f"\n{mode}: enriched={enriched}, failed={failed}, skipped={skipped}, total={total}")


if __name__ == "__main__":
    main()
