"""
小红书 (xiaohongshu.com) spider — uses xhs client library with login cookie.

Requires: pip install xhs>=0.2.13
The xhs library makes HTTP calls internally (outside Scrapy's downloader),
so we fire a single dummy Scrapy request and yield ArticleItems from its callback.
"""
import os
import re
import time
import scrapy

from cyberguide_crawler.items import ArticleItem

try:
    from xhs import XhsClient
    from xhs.help import sign as _xhs_sign
except Exception:
    XhsClient = None
    _xhs_sign = None


def _sign_wrapper(uri, data=None, a1="", web_session=""):
    """Adapter between XhsClient._pre_headers expectations and xhs.help.sign."""
    if _xhs_sign is None:
        return {}
    return _xhs_sign(uri, data, a1=a1)


class XiaohongshuSpider(scrapy.Spider):
    name = "xiaohongshu"
    allowed_domains = ["xiaohongshu.com", "www.xiaohongshu.com", "edith.xiaohongshu.com"]

    SEARCH_QUERIES = [
        # 保研
        "计算机保研经验",
        "推免夏令营面经",
        "双非保研逆袭",
        # 考研
        "计算机考研上岸",
        "考研408经验",
        "跨考计算机",
        # 留学
        "CS留学申请",
        "留学选校定位",
        "GAP一年经历",
        # 就业
        "秋招面经互联网",
        "实习转正经验",
        "校招offer选择",
        "程序员求职",
        "转码成功经验",
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

    custom_settings = {
        "ROBOTSTXT_OBEY": False,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.xhs_cookie = self._normalize_cookie(os.getenv("XHS_COOKIE", ""))
        self.max_per_query = int(os.getenv("XHS_MAX_PER_QUERY", "20"))
        self.search_queries = self._merge_queries(
            self.SEARCH_QUERIES,
            os.getenv("XHS_EXTRA_QUERIES", ""),
        )
        self.client = None

    def start_requests(self):
        if XhsClient is None:
            self.logger.warning("xhs library not installed, skip xiaohongshu spider.")
            return
        if not self.xhs_cookie:
            self.logger.warning("XHS_COOKIE is empty, skip xiaohongshu spider.")
            return
        if len(self.xhs_cookie) < 50:
            self.logger.warning("XHS_COOKIE seems invalid (too short), skip xiaohongshu spider.")
            return

        try:
            self.client = XhsClient(cookie=self.xhs_cookie, sign=_sign_wrapper)
        except Exception as e:
            self.logger.warning("init XhsClient failed: %s", e)
            return

        yield scrapy.Request(
            "https://www.xiaohongshu.com/",
            callback=self._run_searches,
            dont_filter=True,
            meta={"dont_redirect": True, "handle_httpstatus_list": [200, 301, 302, 403]},
        )

    def _run_searches(self, response):
        """Callback that uses xhs library (not Scrapy downloader) for actual searches."""
        for query in self.search_queries:
            items = self._search_query(query)
            for item in items:
                yield item
            if items:
                time.sleep(1.5)

    def _search_query(self, query):
        try:
            result = self.client.get_note_by_keyword(
                query, page=1, page_size=self.max_per_query,
            )
        except Exception as e:
            self.logger.warning("xhs query failed: query=%s error=%s", query, e)
            return []

        notes = self._extract_notes(result)
        items = []
        for note in notes[: self.max_per_query]:
            item = self._note_to_item(query, note)
            if item:
                items.append(item)
        self.logger.info("xhs query=%s got=%s", query, len(items))
        return items

    def _extract_notes(self, payload):
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return []
        for key in ("items", "notes", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                for subkey in ("items", "notes", "list"):
                    subval = value.get(subkey)
                    if isinstance(subval, list):
                        return subval
        return []

    def _note_to_item(self, query, note):
        if not isinstance(note, dict):
            return None

        card = note.get("note_card") if isinstance(note.get("note_card"), dict) else note
        note_id = (
            card.get("note_id")
            or card.get("id")
            or note.get("id")
            or note.get("note_id")
        )
        title = (card.get("display_title") or card.get("title") or note.get("title") or "").strip()
        desc = (card.get("desc") or card.get("content") or note.get("desc") or "").strip()

        if not note_id:
            return None
        if not title and not desc:
            return None

        content = self._clean_text(desc or title)
        merged = (title + " " + content).strip()
        category = self._classify(query, merged)
        return ArticleItem(
            source_name=self.name,
            url=f"https://www.xiaohongshu.com/explore/{note_id}",
            title=(title or merged)[:500],
            summary=content[:500],
            content_snippet=content[:2000],
            category=category,
            language="zh",
        )

    def _clean_text(self, text):
        if not text:
            return ""
        return re.sub(r"\s+", " ", text).strip()

    def _classify(self, query, text):
        combined = (query + " " + text).lower()
        for keyword, cat in self.CATEGORY_MAP.items():
            if keyword in combined:
                return cat
        return "job"

    def _merge_queries(self, base_queries, extra_raw):
        items = list(base_queries)
        extra_queries = [q.strip() for q in (extra_raw or "").split(",") if q.strip()]
        for q in extra_queries:
            if q not in items:
                items.append(q)
        return items

    def _normalize_cookie(self, raw):
        cookie = (raw or "").strip()
        if cookie.lower().startswith("cookie:"):
            cookie = cookie.split(":", 1)[1].strip()
        return cookie
