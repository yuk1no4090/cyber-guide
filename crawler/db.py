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
    """Create tables if not exist, and fix missing columns/defaults on existing tables."""
    with get_cursor() as cur:
        # Original crawled_articles table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS crawled_articles (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                source_name VARCHAR(64) NOT NULL,
                url TEXT NOT NULL,
                title VARCHAR(512) NOT NULL,
                summary TEXT,
                content_snippet TEXT,
                category VARCHAR(32),
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

        # Add category column if missing (for tables created before this update)
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'crawled_articles' AND column_name = 'category'
                ) THEN
                    ALTER TABLE crawled_articles ADD COLUMN category VARCHAR(32);
                END IF;
            END $$;
        """)

        # Now safe to create category index
        cur.execute("CREATE INDEX IF NOT EXISTS idx_crawled_category ON crawled_articles(category);")

        # Career cases table — structured experience posts with AI-extracted fields
        cur.execute("""
            CREATE TABLE IF NOT EXISTS career_cases (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                source VARCHAR(64) NOT NULL,
                url TEXT NOT NULL,
                title VARCHAR(512) NOT NULL,
                content TEXT,
                category VARCHAR(32) NOT NULL,
                background TEXT,
                result TEXT,
                tags TEXT,
                quality_score NUMERIC DEFAULT 0,
                dedupe_hash VARCHAR(64) NOT NULL UNIQUE,
                crawl_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                extracted_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_cases_category ON career_cases(category);
            CREATE INDEX IF NOT EXISTS idx_cases_dedupe ON career_cases(dedupe_hash);
            CREATE INDEX IF NOT EXISTS idx_cases_quality ON career_cases(quality_score DESC);
        """)


def article_exists(dedupe_hash: str) -> bool:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM crawled_articles WHERE dedupe_hash = %s", (dedupe_hash,))
        return cur.fetchone() is not None


def case_exists(dedupe_hash: str) -> bool:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM career_cases WHERE dedupe_hash = %s", (dedupe_hash,))
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
                (id, source_name, url, title, summary, content_snippet, category, language, quality_score, dedupe_hash, crawl_time)
            VALUES %s
            ON CONFLICT (dedupe_hash) DO NOTHING
            """,
            [
                (
                    str(uuid.uuid4()),
                    a['source_name'], a['url'], a['title'],
                    a.get('summary', ''), a.get('content_snippet', ''),
                    a.get('category', ''), a.get('language', 'zh'),
                    a.get('quality_score', 0), a['dedupe_hash'],
                    now,
                )
                for a in articles
            ],
        )


def insert_career_cases(cases: list[dict]):
    """Insert structured career experience cases."""
    if not cases:
        return
    now = datetime.now(timezone.utc)
    with get_cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO career_cases
                (id, source, url, title, content, category, background, result, tags, quality_score, dedupe_hash, crawl_time, extracted_at)
            VALUES %s
            ON CONFLICT (dedupe_hash) DO NOTHING
            """,
            [
                (
                    str(uuid.uuid4()),
                    c['source'], c['url'], c['title'],
                    c.get('content', ''), c['category'],
                    c.get('background', ''), c.get('result', ''),
                    c.get('tags', ''), c.get('quality_score', 0),
                    c['dedupe_hash'], now,
                    now if c.get('background') else None,
                )
                for c in cases
            ],
        )
