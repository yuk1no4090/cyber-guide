"""
CSDN spider — crawls public career/study planning articles.
"""
import logging
from .base import BaseSpider
from pipelines.cleaner import clean_text, truncate, compute_dedupe_hash, compute_quality_score

logger = logging.getLogger(__name__)


class CsdnSpider(BaseSpider):
    source_name = 'csdn'
    base_url = 'https://so.csdn.net/so/search'

    SEARCH_QUERIES = ['职业规划 CS', '学习路线 计算机', '求职经验 后端']

    def crawl(self, max_pages: int = 3) -> list[dict]:
        articles = []
        for query in self.SEARCH_QUERIES[:max_pages]:
            url = f"{self.base_url}?q={query}&t=blog&p=1"
            soup = self.fetch_page(url)
            if not soup:
                continue

            items = soup.select('.search-list-con')
            for item in items[:5]:
                title_el = item.select_one('.limit_width a')
                if not title_el:
                    continue

                title = clean_text(title_el.get_text())
                link = title_el.get('href', '')
                if not link or not title:
                    continue

                desc_el = item.select_one('.search-desc')
                summary = clean_text(desc_el.get_text()) if desc_el else ''

                dedupe_hash = compute_dedupe_hash(title, link)
                quality = compute_quality_score(title, summary)

                articles.append({
                    'source_name': self.source_name,
                    'url': link,
                    'title': truncate(title, 200),
                    'summary': truncate(summary, 500),
                    'content_snippet': truncate(summary, 500),
                    'quality_score': quality,
                    'dedupe_hash': dedupe_hash,
                })

        logger.info(f"[{self.source_name}] Crawled {len(articles)} articles")
        return articles
