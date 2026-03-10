"""
掘金 (juejin.cn) spider — uses JSON API via FormRequest.
"""
import json
import scrapy
from cyberguide_crawler.items import ArticleItem


class JuejinSpider(scrapy.Spider):
    name = 'juejin'
    allowed_domains = ['api.juejin.cn', 'juejin.cn']

    SEARCH_URL = 'https://api.juejin.cn/search_api/v1/search'
    SEARCH_QUERIES = [
        '秋招 offer 经验',
        '春招 面试 总结',
        '实习 转正 经验',
        '职业规划 CS',
        '求职 后端 面经',
        '校招 简历 准备',
    ]

    def start_requests(self):
        max_pages = self.settings.getint('CRAWLER_MAX_PAGES', 3)
        for query in self.SEARCH_QUERIES[:max_pages * 2]:
            payload = json.dumps({
                'key_word': query,
                'search_type': 2,
                'cursor': '0',
                'limit': 10,
                'sort_type': 0,
            })
            yield scrapy.Request(
                self.SEARCH_URL,
                method='POST',
                body=payload,
                headers={'Content-Type': 'application/json'},
                callback=self.parse_results,
                meta={'query': query},
            )

    def parse_results(self, response):
        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            self.logger.warning(f"JSON parse failed for query={response.meta['query']}")
            return

        for item in (data.get('data', []) or []):
            rm = item.get('result_model', {})
            ai = rm.get('article_info', {})
            title = (ai.get('title', '') or '').strip()
            article_id = ai.get('article_id', '') or rm.get('article_id', '')
            if not title or not article_id:
                continue

            summary = (ai.get('brief_content', '') or '').strip()

            yield ArticleItem(
                source_name=self.name,
                url=f'https://juejin.cn/post/{article_id}',
                title=title,
                summary=summary[:500],
                content_snippet=summary[:2000],
                category='job',
                language='zh',
            )
