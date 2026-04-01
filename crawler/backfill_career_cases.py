"""
Backfill career_cases from crawled_articles that have extracted structured fields.
Converts high-quality articles with school/outcome/dest_school into career_cases.
"""
import hashlib
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DB_CONF = {
    "dbname": os.getenv("POSTGRES_DB", "cyber_guide"),
    "user": os.getenv("POSTGRES_USER", "cyber_guide"),
    "password": os.getenv("POSTGRES_PASSWORD", "change_me_in_production"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5432"),
}

OUTCOME_TO_CATEGORY = {
    "保研": "baoyan",
    "考研": "kaoyan",
    "留学": "study_abroad",
    "就业": "job",
}


def build_background(row):
    parts = []
    school = row.get("extracted_school") or ""
    tier = row.get("extracted_school_tier") or ""
    gpa = row.get("extracted_gpa") or ""
    rank = row.get("extracted_rank_pct") or ""
    if school:
        parts.append(f"学校：{school}")
    if tier and tier != "未知":
        parts.append(f"层次：{tier}")
    if gpa:
        parts.append(f"GPA：{gpa}")
    if rank:
        parts.append(f"排名：{rank}")
    return "；".join(parts) if parts else ""


def build_result(row):
    outcome = row.get("extracted_outcome") or ""
    dest = row.get("extracted_dest_school") or ""
    if outcome and dest:
        return f"{outcome} → {dest}"
    return outcome or dest or ""


def build_tags(row):
    tags = []
    outcome = row.get("extracted_outcome") or ""
    tier = row.get("extracted_school_tier") or ""
    if outcome:
        tags.append(outcome)
    if tier and tier != "未知":
        tags.append(tier)
    category = row.get("category") or ""
    if category:
        tags.append(category)
    return ",".join(tags) if tags else ""


def dedupe_hash(title, url):
    raw = (title or "").strip().lower() + "|" + (url or "")
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def main():
    conn = psycopg2.connect(**DB_CONF)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, source_name, url, title, content_snippet, category,
               quality_score, crawl_time, dedupe_hash,
               extracted_school, extracted_school_tier, extracted_gpa,
               extracted_rank_pct, extracted_outcome, extracted_dest_school
        FROM crawled_articles
        WHERE source_name = 'zhihu'
          AND COALESCE(extracted_outcome, '') NOT IN ('', '未知')
          AND LENGTH(COALESCE(content_snippet, '')) >= 200
        ORDER BY quality_score DESC
    """)
    columns = [desc[0] for desc in cur.description]
    rows = [dict(zip(columns, r)) for r in cur.fetchall()]
    print(f"Candidates: {len(rows)}")

    cur.execute("SELECT dedupe_hash FROM career_cases")
    existing_hashes = set(r[0] for r in cur.fetchall())
    print(f"Existing career_cases: {len(existing_hashes)}")

    inserted = 0
    skipped = 0
    for row in rows:
        dh = dedupe_hash(row["title"], row["url"])
        if dh in existing_hashes:
            skipped += 1
            continue

        outcome = row.get("extracted_outcome", "")
        category = OUTCOME_TO_CATEGORY.get(outcome, row.get("category", "job"))
        background = build_background(row)
        result = build_result(row)
        tags = build_tags(row)
        content = (row.get("content_snippet") or "")[:2000]

        cur.execute("""
            INSERT INTO career_cases (source, url, title, content, category, background, result, tags, quality_score, dedupe_hash, crawl_time)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (dedupe_hash) DO NOTHING
        """, (
            row.get("source_name", "zhihu"),
            row.get("url", ""),
            (row.get("title") or "")[:512],
            content,
            category,
            background,
            result,
            tags,
            row.get("quality_score", 0),
            dh,
            row.get("crawl_time"),
        ))
        inserted += 1
        existing_hashes.add(dh)

    conn.commit()
    conn.close()
    print(f"Inserted: {inserted}, Skipped (dup): {skipped}")


if __name__ == "__main__":
    main()
