"""
Database access layer for the crawler.
"""
import uuid
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values
from contextlib import contextmanager
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD


def get_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


@contextmanager
def get_cursor():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_tables():
    """Create crawled_articles table if not exists, and fix missing defaults on existing table."""
    with get_cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS crawled_articles (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                source_name VARCHAR(64) NOT NULL,
                url TEXT NOT NULL,
                title VARCHAR(512) NOT NULL,
                summary TEXT,
                content_snippet TEXT,
                language VARCHAR(16) DEFAULT 'zh',
                published_at TIMESTAMPTZ,
                crawl_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                quality_score NUMERIC DEFAULT 0,
                dedupe_hash VARCHAR(64) NOT NULL UNIQUE
            );
            CREATE INDEX IF NOT EXISTS idx_crawled_source ON crawled_articles(source_name);
            CREATE INDEX IF NOT EXISTS idx_crawled_dedupe ON crawled_articles(dedupe_hash);
        """)
        # Fix defaults if table was created by JPA without them
        cur.execute("ALTER TABLE crawled_articles ALTER COLUMN id SET DEFAULT gen_random_uuid();")
        cur.execute("ALTER TABLE crawled_articles ALTER COLUMN crawl_time SET DEFAULT NOW();")


def article_exists(dedupe_hash: str) -> bool:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM crawled_articles WHERE dedupe_hash = %s", (dedupe_hash,))
        return cur.fetchone() is not None


def insert_articles(articles: list[dict]):
    if not articles:
        return
    now = datetime.now(timezone.utc)
    with get_cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO crawled_articles
                (id, source_name, url, title, summary, content_snippet, language, quality_score, dedupe_hash, crawl_time)
            VALUES %s
            ON CONFLICT (dedupe_hash) DO NOTHING
            """,
            [
                (
                    str(uuid.uuid4()),
                    a['source_name'], a['url'], a['title'],
                    a.get('summary', ''), a.get('content_snippet', ''),
                    a.get('language', 'zh'), a.get('quality_score', 0),
                    a['dedupe_hash'],
                    now,
                )
                for a in articles
            ],
        )
