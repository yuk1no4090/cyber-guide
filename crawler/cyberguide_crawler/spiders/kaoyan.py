"""
考研帮 (kaoyan.com) spider — Discuz! forum.
"""
import scrapy
from cyberguide_crawler.items import ArticleItem

KAOYAN_KEYWORDS = ['考研', '经验', '上岸', '复试', '初试', '调剂', '录取', '分享', '心得', '备考', '总结']


class KaoyanSpider(scrapy.Spider):
    name = 'kaoyan'
    allowed_domains = ['bbs.kaoyan.com']
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
    }

    FORUM_PATHS = ['f22p{}', 'f540p{}', 'f105p{}', 'f97p{}']

    def start_requests(self):
        max_pages = self.settings.getint('CRAWLER_MAX_PAGES', 10)
        for path_tpl in self.FORUM_PATHS:
            for page in range(1, max_pages + 1):
                path = path_tpl.format(page)
                url = f'http://bbs.kaoyan.com/{path}'
                yield scrapy.Request(url, callback=self.parse_list, meta={'path': path})

    def parse_list(self, response):
        threads = response.css('a.s.xst') or response.css('th a[href*="/t"]')
        self.logger.info(f"{response.meta['path']}: {len(threads)} threads")

        for thread in threads:
            title = thread.css('::text').get('').strip()
            href = thread.attrib.get('href', '')
            if not title or not href or len(title) < 5:
                continue
            if not any(kw in title for kw in KAOYAN_KEYWORDS):
                continue

            full_url = response.urljoin(href)
            yield scrapy.Request(full_url, callback=self.parse_detail,
                                 meta={'title': title, 'url': full_url})

    def parse_detail(self, response):
        post_texts = response.css('td[id^="postmessage_"] *::text').getall()
        if not post_texts:
            post_texts = response.css('.t_f *::text').getall()
        content = ' '.join(post_texts).strip()

        if len(content) < 50:
            return

        yield ArticleItem(
            source_name=self.name,
            url=response.meta['url'],
            title=response.meta['title'],
            summary=content[:500],
            content_snippet=content[:2000],
            category='kaoyan',
            language='zh',
        )
