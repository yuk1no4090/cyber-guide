"""
V2EX spider — crawls public career discussion topics.
"""
import logging
from .base import BaseSpider
from pipelines.cleaner import clean_text, truncate, compute_dedupe_hash, compute_quality_score

logger = logging.getLogger(__name__)


class V2exSpider(BaseSpider):
    source_name = 'v2ex'
    base_url = 'https://www.v2ex.com'

    # Career-related nodes
    TARGET_NODES = ['career', 'programmer', 'jobs']

    def crawl(self, max_pages: int = 3) -> list[dict]:
        articles = []
        for node in self.TARGET_NODES[:max_pages]:
            url = f"{self.base_url}/go/{node}"
            soup = self.fetch_page(url)
            if not soup:
                continue

            items = soup.select('.cell.item')
            for item in items[:5]:
                title_el = item.select_one('.topic-link')
                if not title_el:
                    continue

                title = clean_text(title_el.get_text())
                href = title_el.get('href', '')
                link = f"{self.base_url}{href}" if href.startswith('/') else href
                if not link or not title:
                    continue

                dedupe_hash = compute_dedupe_hash(title, link)
                quality = compute_quality_score(title, title)

                articles.append({
                    'source_name': self.source_name,
                    'url': link,
                    'title': truncate(title, 200),
                    'summary': '',
                    'content_snippet': '',
                    'quality_score': quality,
                    'dedupe_hash': dedupe_hash,
                })

        logger.info(f"[{self.source_name}] Crawled {len(articles)} articles")
        return articles
