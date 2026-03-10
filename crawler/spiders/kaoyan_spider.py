"""
考研帮 (kaoyan.com) spider — crawls graduate exam experience posts.
Discuz! forum, same structure as eeban.
"""
import logging
from .base import BaseSpider
from pipelines.cleaner import clean_text, truncate, compute_dedupe_hash, compute_quality_score

logger = logging.getLogger(__name__)

KAOYAN_KEYWORDS = ['考研', '经验', '上岸', '复试', '初试', '调剂', '录取', '分享', '心得', '备考', '总结']


def is_relevant(title: str) -> bool:
    return any(kw in title for kw in KAOYAN_KEYWORDS)


class KaoyanSpider(BaseSpider):
    source_name = 'kaoyan'
    base_url = 'http://bbs.kaoyan.com'

    # f22 = 考研经验, f540 = 考研心路
    FORUM_PATHS = ['f22p{}', 'f540p{}']

    def crawl(self, max_pages: int = 3) -> list[dict]:
        articles = []

        for path_template in self.FORUM_PATHS:
            for page in range(1, max_pages + 1):
                path = path_template.format(page)
                url = f"{self.base_url}/{path}"
                soup = self.fetch_page(url)
                if not soup:
                    continue

                # kaoyan.com uses standard Discuz! selectors
                threads = soup.select('a.s.xst') or soup.select('th a[href*="/t"]')
                logger.info(f"[{self.source_name}] {path}: {len(threads)} threads")

                for thread in threads[:10]:
                    title = clean_text(thread.text.strip())
                    href = thread.get('href', '')
                    if not title or not href or len(title) < 5:
                        continue

                    if not is_relevant(title):
                        continue

                    full_url = href if href.startswith('http') else f"{self.base_url}{href}"

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
                        'category': 'kaoyan',
                        'quality_score': score,
                        'dedupe_hash': dedupe,
                    })

        logger.info(f"[{self.source_name}] Crawled {len(articles)} articles")
        return articles

    def _fetch_post_content(self, url: str) -> str:
        soup = self.fetch_page(url)
        if not soup:
            return ''

        post_el = soup.select_one('td[id^="postmessage_"]')
        if not post_el:
            post_el = soup.select_one('.t_f')
        if not post_el:
            return ''

        for quote in post_el.select('.quote, blockquote'):
            quote.decompose()

        return clean_text(post_el.get_text())
