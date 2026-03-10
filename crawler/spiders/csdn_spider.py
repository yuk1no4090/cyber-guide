"""
CSDN spider — crawls public hot-rank blog articles via JSON API.
(The search page requires JS rendering, so we use the hot-rank API instead.)
"""
import logging
import requests
from pipelines.cleaner import clean_text, truncate, compute_dedupe_hash, compute_quality_score
from config import REQUEST_TIMEOUT, USER_AGENT

logger = logging.getLogger(__name__)


class CsdnSpider:
    source_name = 'csdn'

    # CSDN hot-rank API — returns JSON, no JS rendering needed
    HOT_RANK_URL = 'https://blog.csdn.net/phoenix/web/blog/hot-rank'

    def crawl(self, max_pages: int = 3) -> list[dict]:
        articles = []
        headers = {'User-Agent': USER_AGENT}

        for page in range(max_pages):
            try:
                params = {'page': page, 'pageSize': 10, 'type': 0}
                resp = requests.get(self.HOT_RANK_URL, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                data = resp.json()

                items = data.get('data', [])
                if not items:
                    break

                for item in items:
                    title = clean_text(item.get('articleTitle', ''))
                    url = item.get('articleDetailUrl', '')
                    author = item.get('nickName', '')
                    if not title or not url:
                        continue

                    summary = f"作者: {author}" if author else title
                    dedupe = compute_dedupe_hash(title, url)
                    score = compute_quality_score(title, summary)

                    articles.append({
                        'source_name': self.source_name,
                        'url': url,
                        'title': truncate(title, 200),
                        'summary': truncate(summary, 300),
                        'content_snippet': truncate(summary, 500),
                        'dedupe_hash': dedupe,
                        'quality_score': score,
                    })

            except Exception as e:
                logger.warning(f"[{self.source_name}] Page {page} failed: {e}")

        logger.info(f"[{self.source_name}] Crawled {len(articles)} articles")
        return articles
