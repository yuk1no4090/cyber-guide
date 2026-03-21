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
        '保研',
        '考研',
        '留学申请',
        '面试经验',
        '秋招 offer 经验',
        '春招 面试 总结',
        '实习 转正 经验',
        '职业规划 CS',
        '求职 后端 面经',
        '校招 简历 准备',
        '保研 夏令营 经验',
        '推免 面试 经验',
        '考研 上岸 经验',
        '复试 调剂 经验',
        '留学 文书 申请 经验',
        '211 保研 985 经验',
        '双非 考研 上岸',
        '双非 保研 逆袭',
        '留学 GPA 申请 结果',
        '出国留学 CS 选校',
        '985 秋招 去向',
        '应届生 求职 去向 总结',
        '互联网 校招 offer 选择',
        '考研 调剂 双非 经验',
        '留学 英国 美国 申请 经验',
    ]

    def start_requests(self):
        for query in self.SEARCH_QUERIES:
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
                meta={'query': query, 'cursor': '0', 'page_no': 1},
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

        has_more = bool(data.get('has_more'))
        next_cursor = data.get('cursor')
        page_no = int(response.meta.get('page_no', 1))
        max_query_pages = 2  # 每个关键词最多抓两页，约 20 条
        if has_more and next_cursor and page_no < max_query_pages:
            query = response.meta['query']
            payload = json.dumps({
                'key_word': query,
                'search_type': 2,
                'cursor': str(next_cursor),
                'limit': 10,
                'sort_type': 0,
            })
            yield scrapy.Request(
                self.SEARCH_URL,
                method='POST',
                body=payload,
                headers={'Content-Type': 'application/json'},
                callback=self.parse_results,
                meta={'query': query, 'cursor': str(next_cursor), 'page_no': page_no + 1},
            )
