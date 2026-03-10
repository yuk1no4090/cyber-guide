"""
DedupPipeline — checks database for existing dedupe_hash, drops duplicates.
Runs after CleanerPipeline (order=200).
"""
import psycopg2
from scrapy.exceptions import DropItem


class DedupPipeline:
    """Drop items whose dedupe_hash already exists in the database."""

    def __init__(self, db_settings):
        self.db_settings = db_settings
        self.conn = None

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

    def close_spider(self, spider):
        if self.conn:
            self.conn.close()

    def process_item(self, item, spider):
        dedupe_hash = item.get('dedupe_hash', '')
        if not dedupe_hash:
            raise DropItem("Missing dedupe_hash")

        with self.conn.cursor() as cur:
            cur.execute("SELECT 1 FROM crawled_articles WHERE dedupe_hash = %s", (dedupe_hash,))
            if cur.fetchone():
                raise DropItem(f"Duplicate: {item.get('title', '')[:40]}")

        return item
