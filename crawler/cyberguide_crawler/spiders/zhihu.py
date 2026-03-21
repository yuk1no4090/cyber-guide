"""
知乎 (zhihu.com) spider — scrapes search results for postgrad/study-abroad/job experience posts.
Uses the public search page (no API key required).
"""
import json
import re
import scrapy
from cyberguide_crawler.items import ArticleItem


class ZhihuSpider(scrapy.Spider):
    name = 'zhihu'
    allowed_domains = ['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com']

    SEARCH_QUERIES = [
        '保研经验 985',
        '保研经验 211',
        '保研经验 双非',
        '推免夏令营 面试经验',
        '考研上岸经验 计算机',
        '考研调剂经验',
        '双非考研985经验',
        '出国留学申请经验 CS',
        '留学申请 选校 结果',
        '美国CS硕士申请经验',
        '英国留学申请经验',
        '秋招经验总结',
        '校招offer选择 互联网',
        '应届生求职去向',
        '实习转正经验',
        '背景相似 保研去向',
        '双非逆袭 保研',
        '211考研985',
    ]

    CATEGORY_MAP = {
        '保研': 'baoyan', '推免': 'baoyan', '夏令营': 'baoyan',
        '考研': 'kaoyan', '调剂': 'kaoyan', '复试': 'kaoyan',
        '留学': 'study_abroad', '申请': 'study_abroad', '选校': 'study_abroad',
        '秋招': 'job', '春招': 'job', '校招': 'job', '实习': 'job',
        'offer': 'job', '求职': 'job', '去向': 'job',
    }

    custom_settings = {
        'DOWNLOAD_DELAY': 3,
        'CONCURRENT_REQUESTS_PER_DOMAIN': 1,
        'DEFAULT_REQUEST_HEADERS': {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
    }

    def start_requests(self):
        for query in self.SEARCH_QUERIES:
            url = f'https://www.zhihu.com/search?type=content&q={scrapy.utils.url.url_escape(query)}'
            yield scrapy.Request(
                url,
                callback=self.parse_search,
                meta={'query': query},
                dont_filter=True,
            )

    def parse_search(self, response):
        query = response.meta['query']
        cards = response.css('div.SearchResult-Card')
        if not cards:
            cards = response.css('div.List-item')

        for card in cards[:15]:
            link = card.css('a[data-za-detail-view-element_name="Title"]::attr(href)').get()
            if not link:
                link = card.css('h2 a::attr(href)').get()
            if not link:
                continue

            if link.startswith('//'):
                link = 'https:' + link
            elif link.startswith('/'):
                link = 'https://www.zhihu.com' + link

            if '/answer/' not in link and '/p/' not in link and '/question/' not in link:
                continue

            title = card.css('h2 span::text').get()
            if not title:
                title = card.css('h2 a::text').get()
            if not title:
                title = card.css('.ContentItem-title::text').get()
            title = (title or '').strip()
            if not title:
                continue

            excerpt = card.css('.RichContent-inner span::text').get()
            if not excerpt:
                excerpt = card.css('.SearchResult-Card--body span::text').get()
            excerpt = (excerpt or '').strip()

            category = self._classify(query, title + ' ' + excerpt)

            yield ArticleItem(
                source_name=self.name,
                url=link,
                title=title[:500],
                summary=excerpt[:500],
                content_snippet=excerpt[:2000],
                category=category,
                language='zh',
            )

    def _classify(self, query, text):
        combined = (query + ' ' + text).lower()
        for keyword, cat in self.CATEGORY_MAP.items():
            if keyword in combined:
                return cat
        return 'job'
