"""
保研论坛 (eeban.com) spider — crawls graduate recommendation experience posts.
Discuz! forum, standard HTML, no JS rendering needed.
"""
import logging
import re
from .base import BaseSpider
from pipelines.cleaner import clean_text, truncate, compute_dedupe_hash, compute_quality_score

logger = logging.getLogger(__name__)

BAOYAN_KEYWORDS = ['保研', '夏令营', '推免', '预推免', '直博', '录取', '经验', '面试', '笔试', 'offer']


def is_relevant(title: str) -> bool:
    return any(kw in title for kw in BAOYAN_KEYWORDS)


class EebanSpider(BaseSpider):
    source_name = 'eeban'
    base_url = 'https://www.eeban.com'

    # 保研交流 fid=662
    FORUM_IDS = [662]

    def crawl(self, max_pages: int = 3) -> list[dict]:
        articles = []

        for fid in self.FORUM_IDS:
            for page in range(1, max_pages + 1):
                url = f"{self.base_url}/forum.php?mod=forumdisplay&fid={fid}&page={page}"
                soup = self.fetch_page(url)
                if not soup:
                    continue

                threads = soup.select('a.s.xst')
                logger.info(f"[{self.source_name}] fid={fid} page={page}: {len(threads)} threads")

                for thread in threads:
                    title = clean_text(thread.text.strip())
                    href = thread.get('href', '')
                    if not title or not href:
                        continue

                    if not is_relevant(title):
                        continue

                    full_url = href if href.startswith('http') else f"{self.base_url}/{href}"

                    # Fetch post content
                    content = self._fetch_post_content(full_url)
                    if not content or len(content) < 50:
                        continue

                    dedupe = compute_dedupe_hash(title, full_url)
                    score = compute_quality_score(title, content)

                    articles.append({
                        'source_name': self.source_name,
                        'url': full_url,
                        'title': truncate(title, 200),
                        'summary': truncate(content, 500),
                        'content_snippet': truncate(content, 2000),
                        'category': 'baoyan',
                        'quality_score': score,
                        'dedupe_hash': dedupe,
                    })

        logger.info(f"[{self.source_name}] Crawled {len(articles)} articles")
        return articles

    def _fetch_post_content(self, url: str) -> str:
        soup = self.fetch_page(url)
        if not soup:
            return ''

        # Discuz! post content is in td[id^="postmessage_"]
        post_el = soup.select_one('td[id^="postmessage_"]')
        if not post_el:
            return ''

        # Remove quoted content and images
        for quote in post_el.select('.quote, blockquote'):
            quote.decompose()
        for img in post_el.select('img'):
            img.decompose()

        return clean_text(post_el.get_text())
