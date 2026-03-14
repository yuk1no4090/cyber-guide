"""
DatabasePipeline — batch-writes items to PostgreSQL.
Handles both ArticleItem -> crawled_articles and CareerCaseItem -> career_cases.
Runs last in the pipeline chain (order=400).
"""
import uuid
import logging
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

logger = logging.getLogger(__name__)


class DatabasePipeline:
    """Collect items in a buffer and flush to PostgreSQL on spider close."""

    FLUSH_SIZE = 50

    def __init__(self, db_settings):
        self.db_settings = db_settings
        self.conn = None
        self.article_buffer = []
        self.case_buffer = []

    @classmethod
    def from_crawler(cls, crawler):
        return cls({
            'host': crawler.settings.get('POSTGRES_HOST'),
            'port': crawler.settings.getint('POSTGRES_PORT'),
            'dbname': crawler.settings.get('POSTGRES_DB'),
            'user': crawler.settings.get('POSTGRES_USER'),
            'password': crawler.settings.get('POSTGRES_PASSWORD'),
        })

    def open_spider(self, spider):
        self.conn = psycopg2.connect(**self.db_settings)
        self._ensure_tables()

    def close_spider(self, spider):
        self._flush_articles()
        self._flush_cases()
        self._downgrade_stale_articles()
        if self.conn:
            self.conn.close()

    def process_item(self, item, spider):
        d = dict(item)

        # Check if ExtractorPipeline attached a career case
        career_case = d.pop('_career_case', None)
        if career_case:
            self.case_buffer.append(career_case)

        self.article_buffer.append(d)

        if len(self.article_buffer) >= self.FLUSH_SIZE:
            self._flush_articles()
        if len(self.case_buffer) >= self.FLUSH_SIZE:
            self._flush_cases()

        return item

    def _flush_articles(self):
        if not self.article_buffer:
            return
        now = datetime.now(timezone.utc)
        try:
            with self.conn.cursor() as cur:
                execute_values(
                    cur,
                    """
                    INSERT INTO crawled_articles
                        (id, source_name, url, title, summary, content_snippet, category, language, quality_score, relevance_tier, dedupe_hash, crawl_time)
                    VALUES %s
                    ON CONFLICT (dedupe_hash) DO NOTHING
                    """,
                    [
                        (
                            str(uuid.uuid4()),
                            a.get('source_name', ''), a.get('url', ''), a.get('title', ''),
                            a.get('summary', ''), a.get('content_snippet', ''),
                            a.get('category', ''), a.get('language', 'zh'),
                            a.get('quality_score', 0), a.get('relevance_tier', 'low'), a.get('dedupe_hash', ''),
                            now,
                        )
                        for a in self.article_buffer
                    ],
                )
            self.conn.commit()
            logger.info("Flushed %d articles to crawled_articles", len(self.article_buffer))
            self.article_buffer.clear()
        except Exception as e:
            self.conn.rollback()
            logger.error("Article flush failed: %s", e)
            self.article_buffer.clear()

    def _flush_cases(self):
        if not self.case_buffer:
            return
        now = datetime.now(timezone.utc)
        try:
            with self.conn.cursor() as cur:
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
                            c.get('source', ''), c.get('url', ''), c.get('title', ''),
                            c.get('content', ''), c.get('category', ''),
                            c.get('background', ''), c.get('result', ''),
                            c.get('tags', ''), c.get('quality_score', 0),
                            c.get('dedupe_hash', ''), now, now,
                        )
                        for c in self.case_buffer
                    ],
                )
            self.conn.commit()
            logger.info("Flushed %d cases to career_cases", len(self.case_buffer))
            self.case_buffer.clear()
        except Exception as e:
            self.conn.rollback()
            logger.error("Case flush failed: %s", e)
            self.case_buffer.clear()

    def _ensure_tables(self):
        with self.conn.cursor() as cur:
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
                    relevance_tier VARCHAR(16) DEFAULT 'low',
                    dedupe_hash VARCHAR(64) NOT NULL UNIQUE
                );
                CREATE INDEX IF NOT EXISTS idx_crawled_source ON crawled_articles(source_name);
                CREATE INDEX IF NOT EXISTS idx_crawled_dedupe ON crawled_articles(dedupe_hash);
            """)
            cur.execute("ALTER TABLE crawled_articles ALTER COLUMN id SET DEFAULT gen_random_uuid();")
            cur.execute("ALTER TABLE crawled_articles ALTER COLUMN crawl_time SET DEFAULT NOW();")
            cur.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawled_articles' AND column_name='category')
                    THEN ALTER TABLE crawled_articles ADD COLUMN category VARCHAR(32);
                    END IF;
                END $$;
            """)
            cur.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crawled_articles' AND column_name='relevance_tier')
                    THEN ALTER TABLE crawled_articles ADD COLUMN relevance_tier VARCHAR(16) DEFAULT 'low';
                    END IF;
                END $$;
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_crawled_category ON crawled_articles(category);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_crawled_tier ON crawled_articles(relevance_tier);")

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
        self.conn.commit()

    def _downgrade_stale_articles(self):
        """
        Downgrade stale articles (>180 days old) to low relevance_tier.
        This keeps old content available while reducing its retrieval priority.
        """
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    UPDATE crawled_articles
                    SET relevance_tier = 'low'
                    WHERE crawl_time < NOW() - INTERVAL '180 days'
                      AND COALESCE(relevance_tier, '') <> 'low'
                """)
                updated = cur.rowcount
            self.conn.commit()
            if updated > 0:
                logger.info("Downgraded %d stale articles to low tier", updated)
        except Exception as e:
            self.conn.rollback()
            logger.error("Stale article downgrade failed: %s", e)
