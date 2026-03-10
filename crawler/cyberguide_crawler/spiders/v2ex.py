"""
V2EX spider — crawls career/programmer/jobs nodes.
"""
import scrapy
from cyberguide_crawler.items import ArticleItem


class V2exSpider(scrapy.Spider):
    name = 'v2ex'
    allowed_domains = ['www.v2ex.com']
    custom_settings = {
        'DOWNLOAD_DELAY': 2,
    }

    TARGET_NODES = ['career', 'programmer', 'jobs']

    def start_requests(self):
        max_pages = self.settings.getint('CRAWLER_MAX_PAGES', 3)
        for node in self.TARGET_NODES[:max_pages]:
            url = f'https://www.v2ex.com/go/{node}'
            yield scrapy.Request(url, callback=self.parse_list, meta={'node': node})

    def parse_list(self, response):
        links = response.css('.topic-link')
        self.logger.info(f"/go/{response.meta['node']}: {len(links)} topics")

        for link in links[:5]:
            title = link.css('::text').get('').strip()
            href = link.attrib.get('href', '')
            if not title or not href:
                continue

            full_url = response.urljoin(href)
            yield scrapy.Request(full_url, callback=self.parse_detail,
                                 meta={'title': title, 'url': full_url})

    def parse_detail(self, response):
        content_el = response.css('.topic_content *::text').getall()
        content = ' '.join(content_el).strip() if content_el else response.meta['title']

        yield ArticleItem(
            source_name=self.name,
            url=response.meta['url'],
            title=response.meta['title'],
            summary=content[:500],
            content_snippet=content[:2000],
            category='',
            language='zh',
        )
