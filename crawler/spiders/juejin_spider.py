"""
Juejin (掘金) spider — crawls public tech career articles.
"""
import logging
import requests
from pipelines.cleaner import clean_text, truncate, compute_dedupe_hash, compute_quality_score
from config import REQUEST_TIMEOUT, USER_AGENT

logger = logging.getLogger(__name__)


class JuejinSpider:
    source_name = 'juejin'

    # Juejin has a JSON API for search
    SEARCH_URL = 'https://api.juejin.cn/search_api/v1/search'
    SEARCH_QUERIES = ['职业规划', '学习路线 后端', 'CS 求职']

    def crawl(self, max_pages: int = 3) -> list[dict]:
        articles = []
        headers = {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
        }

        for query in self.SEARCH_QUERIES[:max_pages]:
            try:
                payload = {
                    'key_word': query,
                    'search_type': 2,  # articles
                    'cursor': '0',
                    'limit': 5,
                    'sort_type': 0,
                }
                resp = requests.post(
                    self.SEARCH_URL,
                    json=payload,
                    headers=headers,
                    timeout=REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json()

                for item in data.get('data', []):
                    result_model = item.get('result_model', {})
                    article_info = result_model.get('article_info', {})
                    title = clean_text(article_info.get('title', ''))
                    article_id = article_info.get('article_id', '') or result_model.get('article_id', '')
                    if not title or not article_id:
                        continue

                    link = f"https://juejin.cn/post/{article_id}"
                    summary = clean_text(article_info.get('brief_content', ''))

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

            except Exception as e:
                logger.warning(f"[{self.source_name}] Search failed for '{query}': {e}")

        logger.info(f"[{self.source_name}] Crawled {len(articles)} articles")
        return articles
