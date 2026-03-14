"""
保研论坛 (eeban.com) spider — Discuz! forum, async via Scrapy callbacks.
"""
import scrapy
from cyberguide_crawler.items import ArticleItem

BAOYAN_KEYWORDS = ['保研', '夏令营', '推免', '预推免', '直博', '录取', '经验', '面试', '笔试', 'offer']


class EebanSpider(scrapy.Spider):
    name = 'eeban'
    allowed_domains = ['www.eeban.com', 'eeban.com']
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
    }
    FORUM_IDS = [662, 661]  # 保研交流 + 保研干货

    def start_requests(self):
        max_pages = self.settings.getint('CRAWLER_MAX_PAGES', 10)
        for fid in self.FORUM_IDS:
            for page in range(1, max_pages + 1):
                url = f'https://www.eeban.com/forum.php?mod=forumdisplay&fid={fid}&page={page}'
                yield scrapy.Request(url, callback=self.parse_list, meta={'page': page, 'fid': fid})

    def parse_list(self, response):
        threads = response.css('a.s.xst')
        self.logger.info(
            f"fid={response.meta.get('fid')} page={response.meta['page']}: {len(threads)} threads"
        )

        for thread in threads:
            title = thread.css('::text').get('').strip()
            href = thread.attrib.get('href', '')
            if not title or not href:
                continue
            if not any(kw in title for kw in BAOYAN_KEYWORDS):
                continue

            full_url = response.urljoin(href)
            yield scrapy.Request(full_url, callback=self.parse_detail,
                                 meta={'title': title, 'url': full_url})

    def parse_detail(self, response):
        post_el = response.css('td[id^="postmessage_"]::text').getall()
        content = ' '.join(post_el).strip()
        if len(content) < 50:
            # Try broader selector
            content = ' '.join(response.css('.t_f *::text').getall()).strip()

        if len(content) < 50:
            return

        yield ArticleItem(
            source_name=self.name,
            url=response.meta['url'],
            title=response.meta['title'],
            summary=content[:500],
            content_snippet=content[:2000],
            category='baoyan',
            language='zh',
        )
