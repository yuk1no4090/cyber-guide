"""
DatabasePipeline — batch-writes items to PostgreSQL.
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
        self.buffer = []

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
        if self.buffer:
            self._flush()
        if self.conn:
            self.conn.close()

    def process_item(self, item, spider):
        self.buffer.append(dict(item))
        if len(self.buffer) >= self.FLUSH_SIZE:
            self._flush()
        return item

    def _flush(self):
        if not self.buffer:
            return
        now = datetime.now(timezone.utc)
        try:
            with self.conn.cursor() as cur:
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
                            a.get('source_name', ''), a.get('url', ''), a.get('title', ''),
                            a.get('summary', ''), a.get('content_snippet', ''),
                            a.get('category', ''), a.get('language', 'zh'),
                            a.get('quality_score', 0), a.get('dedupe_hash', ''),
                            now,
                        )
                        for a in self.buffer
                    ],
                )
            self.conn.commit()
            count = len(self.buffer)
            self.buffer.clear()
            logger.info(f"Flushed {count} items to database")
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Database flush failed: {e}")
            self.buffer.clear()

    def _ensure_tables(self):
        """Create tables and fix defaults if needed."""
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
            cur.execute("CREATE INDEX IF NOT EXISTS idx_crawled_category ON crawled_articles(category);")
        self.conn.commit()
