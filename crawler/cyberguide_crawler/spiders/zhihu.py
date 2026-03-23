"""
知乎 (zhihu.com) spider — uses Zhihu search API with x-zse-96 signing.

Scrapy's downloader middleware normalizes URLs and modifies headers in ways
that break Zhihu's signature verification.  We therefore fire a single dummy
Scrapy request and drive the actual HTTP calls through `requests` in the
callback, identical to the Xiaohongshu spider approach.
"""
import hashlib
import json
import os
import re
import time
from urllib.parse import quote

import requests as http_requests
import scrapy
from cyberguide_crawler.items import ArticleItem


class ZhihuSpider(scrapy.Spider):
    name = "zhihu"
    allowed_domains = ["www.zhihu.com", "zhihu.com", "zhuanlan.zhihu.com"]

    SEARCH_QUERIES = [
        # 保研
        "计算机保研经验 985",
        "双非保研985经验",
        "推免夏令营面试经验",
        "保研去向 计算机",
        # 考研
        "计算机考研408经验",
        "考研上岸经验 计算机",
        "双非考研985上岸",
        "考研调剂经验 计算机",
        "跨考计算机经验",
        # 留学
        "CS硕士留学申请经验",
        "美国CS选校定位",
        "英国计算机硕士申请",
        "港新CS留学申请",
        # GAP
        "GAP year 计算机 经历",
        "毕业后GAP考研值不值",
        # 就业 / 校招
        "互联网秋招面经总结",
        "后端开发校招经验",
        "前端开发求职面经",
        "算法岗求职面经",
        "实习转正互联网经验",
        "应届生offer选择",
        # 职场
        "程序员职业规划",
        "计算机毕业薪资",
        "转码非科班经验",
    ]

    CATEGORY_MAP = {
        "保研": "baoyan",
        "推免": "baoyan",
        "夏令营": "baoyan",
        "考研": "kaoyan",
        "调剂": "kaoyan",
        "复试": "kaoyan",
        "408": "kaoyan",
        "跨考": "kaoyan",
        "留学": "study_abroad",
        "申请": "study_abroad",
        "选校": "study_abroad",
        "phd": "study_abroad",
        "gap": "gap",
        "间隔年": "gap",
        "秋招": "job",
        "春招": "job",
        "校招": "job",
        "实习": "job",
        "offer": "job",
        "求职": "job",
        "面经": "job",
        "转码": "job",
        "薪资": "job",
        "去向": "job",
    }

    SEARCH_LIMIT = 10
    MAX_SEARCH_PAGES = 2
    X_ZSE_93 = "101_3_3.0"

    custom_settings = {
        "ROBOTSTXT_OBEY": False,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.zhihu_cookie = self._normalize_cookie(os.getenv("ZHIHU_COOKIE", ""))
        self.d_c0 = self._extract_d_c0(self.zhihu_cookie)
        self.search_queries = self._merge_queries(
            self.SEARCH_QUERIES,
            os.getenv("ZHIHU_EXTRA_QUERIES", ""),
        )

    def start_requests(self):
        if not self.zhihu_cookie:
            self.logger.warning("ZHIHU_COOKIE is empty, skip zhihu spider.")
            return
        if len(self.zhihu_cookie) < 50:
            self.logger.warning("ZHIHU_COOKIE seems invalid (too short), skip zhihu spider.")
            return
        if not self.d_c0:
            self.logger.warning("d_c0 not found in ZHIHU_COOKIE, skip zhihu spider.")
            return

        yield scrapy.Request(
            "https://www.zhihu.com/",
            callback=self._run_searches,
            dont_filter=True,
            meta={"dont_redirect": True, "handle_httpstatus_list": [200, 301, 302, 403]},
        )

    def _run_searches(self, response):
        """Drives all keyword searches via `requests` to preserve exact headers."""
        session = http_requests.Session()
        total = 0
        for query in self.search_queries:
            items = self._search_one_query(session, query)
            for item in items:
                yield item
                total += 1
            time.sleep(1.5)
        self.logger.info("zhihu total items yielded: %s", total)

    def _search_one_query(self, session, query):
        items = []
        for page_no in range(1, self.MAX_SEARCH_PAGES + 1):
            offset = (page_no - 1) * self.SEARCH_LIMIT
            path = (
                f"/api/v4/search_v3"
                f"?t=general&q={quote(query)}&offset={offset}&limit={self.SEARCH_LIMIT}"
            )
            try:
                resp = session.get(
                    f"https://www.zhihu.com{path}",
                    headers=self._api_headers(path),
                    timeout=12,
                )
            except Exception as e:
                self.logger.warning("zhihu request error: query=%s page=%s err=%s", query, page_no, e)
                break

            if resp.status_code != 200:
                self.logger.warning("zhihu search %s page=%s status=%s", query, page_no, resp.status_code)
                break

            try:
                payload = resp.json()
            except ValueError:
                break

            records = payload.get("data") or []
            for record in records:
                obj = record.get("object") or {}
                obj_type = (obj.get("type") or "").lower()
                item = self._build_item(query, obj, obj_type)
                if item:
                    items.append(item)

            if bool((payload.get("paging") or {}).get("is_end")):
                break
            time.sleep(2)

        self.logger.info("zhihu query=%s got=%s", query, len(items))
        return items

    def _build_item(self, query, obj, obj_type):
        if obj_type == "answer":
            q = obj.get("question") or {}
            title = self._strip_html(q.get("title") or "")
            excerpt = self._strip_html(obj.get("excerpt") or obj.get("content") or "")
            qid = q.get("id")
            aid = obj.get("id")
            if not (title and qid and aid):
                return None
            url = f"https://www.zhihu.com/question/{qid}/answer/{aid}"
        elif obj_type == "article":
            title = self._strip_html(obj.get("title") or "")
            excerpt = self._strip_html(obj.get("excerpt") or obj.get("content") or "")
            url = self._article_url(obj)
            if not (title and url):
                return None
        else:
            return None

        category = self._classify(query, title + " " + excerpt)
        return ArticleItem(
            source_name=self.name,
            url=url,
            title=title[:500],
            summary=excerpt[:500],
            content_snippet=excerpt[:2000],
            category=category,
            language="zh",
        )

    def _article_url(self, obj):
        token = obj.get("url_token")
        if token:
            return f"https://zhuanlan.zhihu.com/p/{token}"
        url = obj.get("url") or obj.get("share_url") or ""
        m = re.search(r'/articles?/(\d+)', url)
        if m:
            return f"https://zhuanlan.zhihu.com/p/{m.group(1)}"
        if url.startswith("http"):
            return url
        article_id = obj.get("id")
        if article_id:
            return f"https://zhuanlan.zhihu.com/p/{article_id}"
        return ""

    def _compute_x_zse_96(self, url_path):
        raw = f'{self.X_ZSE_93}+{url_path}+"{self.d_c0}"'
        return "2.0_" + hashlib.md5(raw.encode()).hexdigest()

    def _api_headers(self, url_path):
        return {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": "https://www.zhihu.com/",
            "Cookie": self.zhihu_cookie,
            "x-zse-93": self.X_ZSE_93,
            "x-zse-96": self._compute_x_zse_96(url_path),
        }

    def _extract_d_c0(self, cookie_str):
        m = re.search(r'd_c0=([^;]+)', cookie_str or "")
        return m.group(1).strip() if m else ""

    def _strip_html(self, text):
        if not text:
            return ""
        stripped = re.sub(r"<[^>]+>", "", text)
        return re.sub(r"\s+", " ", stripped).strip()

    def _classify(self, query, text):
        combined = (query + " " + text).lower()
        for keyword, cat in self.CATEGORY_MAP.items():
            if keyword in combined:
                return cat
        return "job"

    def _normalize_cookie(self, raw):
        cookie = (raw or "").strip()
        if cookie.lower().startswith("cookie:"):
            cookie = cookie.split(":", 1)[1].strip()
        return cookie

    def _merge_queries(self, base_queries, extra_raw):
        items = list(base_queries)
        extra_queries = [q.strip() for q in (extra_raw or "").split(",") if q.strip()]
        for q in extra_queries:
            if q not in items:
                items.append(q)
        return items
