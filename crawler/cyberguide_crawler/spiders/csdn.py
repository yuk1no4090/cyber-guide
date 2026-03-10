"""
CSDN spider — uses hot-rank JSON API.
"""
import json
import scrapy
from cyberguide_crawler.items import ArticleItem


class CsdnSpider(scrapy.Spider):
    name = 'csdn'
    allowed_domains = ['blog.csdn.net']

    HOT_RANK_URL = 'https://blog.csdn.net/phoenix/web/blog/hot-rank'

    def start_requests(self):
        max_pages = self.settings.getint('CRAWLER_MAX_PAGES', 3)
        for page in range(max_pages):
            url = f'{self.HOT_RANK_URL}?page={page}&pageSize=10&type=0'
            yield scrapy.Request(url, callback=self.parse_results)

    def parse_results(self, response):
        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            return

        for item in (data.get('data', []) or []):
            title = (item.get('articleTitle', '') or '').strip()
            url = item.get('articleDetailUrl', '')
            author = item.get('nickName', '')
            if not title or not url:
                continue

            yield ArticleItem(
                source_name=self.name,
                url=url,
                title=title,
                summary=f'作者: {author}' if author else title,
                content_snippet='',
                category='',
                language='zh',
            )
