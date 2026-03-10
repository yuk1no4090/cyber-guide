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

            # V2EX uses .topic-link inside span.item_title
            links = soup.select('.topic-link')
            for link in links[:5]:
                title = clean_text(link.text.strip())
                href = link.get('href', '')
                if not title or not href:
                    continue

                full_url = f"{self.base_url}{href}" if href.startswith('/') else href

                # Try to get a snippet from the topic page
                summary = title  # fallback
                try:
                    topic_soup = self.fetch_page(full_url)
                    if topic_soup:
                        # Topic content is in .topic_content or .reply_content
                        content_el = topic_soup.select_one('.topic_content')
                        if content_el:
                            summary = truncate(clean_text(content_el.get_text()), 300)
                except Exception:
                    pass

                dedupe = compute_dedupe_hash(title, full_url)
                score = compute_quality_score(title, summary)

                articles.append({
                    'source_name': self.source_name,
                    'url': full_url,
                    'title': truncate(title, 200),
                    'summary': summary,
                    'content_snippet': truncate(summary, 500),
                    'dedupe_hash': dedupe,
                    'quality_score': score,
                })

            logger.info(f"[{self.source_name}] Crawled {len(articles)} articles from /go/{node}")

        return articles
