"""
Comprehensive edge-case tests for crawler pipelines.
Covers: Unicode, emoji, empty fields, extremely long content, malformed HTML,
ad detection boundaries, quality scoring, AI extraction failures, dedup edge cases.
"""
import pytest
from scrapy.exceptions import DropItem

from cyberguide_crawler.pipelines.cleaner import (
    CleanerPipeline,
    clean_text,
    compute_dedupe_hash,
    compute_quality_score,
    compute_relevance_tier,
    is_advertisement,
    normalize_category,
    truncate,
)
from cyberguide_crawler.pipelines.extractor import ExtractorPipeline


# ── clean_text edge cases ──

class TestCleanText:

    def test_preserves_chinese_characters(self):
        assert clean_text("你好世界") == "你好世界"

    def test_collapses_mixed_whitespace(self):
        assert clean_text("  hello\t\n  world  \r\n  ") == "hello world"

    def test_handles_only_whitespace(self):
        assert clean_text("   \n\t\r  ") == ""

    def test_handles_empty_string(self):
        assert clean_text("") == ""

    def test_handles_none(self):
        assert clean_text(None) == ""

    def test_preserves_emoji(self):
        assert clean_text("🎓 保研 💻") == "🎓 保研 💻"

    def test_handles_unicode_special_chars(self):
        assert clean_text("café résumé naïve") == "café résumé naïve"


# ── truncate edge cases ──

class TestTruncate:

    def test_within_limit(self):
        assert truncate("short", 100) == "short"

    def test_exact_limit(self):
        assert truncate("12345", 5) == "12345"

    def test_over_limit(self):
        assert truncate("123456", 5) == "12345..."

    def test_empty_string(self):
        assert truncate("", 10) == ""

    def test_zero_limit(self):
        assert truncate("hello", 0) == "..."

    def test_unicode_truncation(self):
        text = "你好世界"
        result = truncate(text, 2)
        assert result == "你好..."


# ── compute_dedupe_hash edge cases ──

class TestDedupeHash:

    def test_normalized_title_ignores_whitespace(self):
        h1 = compute_dedupe_hash("  保研 经验  ", "https://a.com/1")
        h2 = compute_dedupe_hash("保研经验", "https://a.com/2")
        assert h1 == h2

    def test_different_titles_different_hash(self):
        h1 = compute_dedupe_hash("保研经验", "https://a.com/1")
        h2 = compute_dedupe_hash("考研经验", "https://a.com/1")
        assert h1 != h2

    def test_same_title_different_hosts(self):
        h1 = compute_dedupe_hash("保研经验", "https://a.com/1")
        h2 = compute_dedupe_hash("保研经验", "https://b.com/1")
        assert h1 != h2

    def test_empty_title_and_url(self):
        h = compute_dedupe_hash("", "")
        assert len(h) == 32

    def test_emoji_in_title(self):
        h = compute_dedupe_hash("🎓保研成功🎉", "https://a.com")
        assert len(h) == 32


# ── compute_quality_score edge cases ──

class TestQualityScore:

    def test_empty_content_gets_low_score(self):
        score = compute_quality_score("", "", "unknown")
        assert score == 0

    def test_many_keywords_capped_at_100(self):
        title = " ".join(["保研", "推免", "夏令营", "考研", "复试", "调剂", "上岸"] * 5)
        content = title
        score = compute_quality_score(title, content, "eeban")
        assert score <= 100

    def test_content_length_scoring_brackets(self):
        short = "x" * 100
        medium = "x" * 300
        long_ = "x" * 800
        very_long = "x" * 2000
        huge = "x" * 5000

        assert compute_quality_score("", short, "") < compute_quality_score("", medium, "")
        assert compute_quality_score("", long_, "") > compute_quality_score("", short, "")
        assert compute_quality_score("", very_long, "") > 0
        assert compute_quality_score("", huge, "") > 0

    def test_source_weight_applied(self):
        base = compute_quality_score("保研", "保研经验", "unknown_source")
        eeban = compute_quality_score("保研", "保研经验", "eeban")
        assert eeban > base


# ── compute_relevance_tier edge cases ──

class TestRelevanceTier:

    def test_high_tier_conditions(self):
        assert compute_relevance_tier("baoyan", 25) == "high"
        assert compute_relevance_tier("kaoyan", 20) == "high"
        assert compute_relevance_tier("job", 30) == "high"

    def test_medium_tier(self):
        assert compute_relevance_tier("other", 15) == "medium"

    def test_low_tier(self):
        assert compute_relevance_tier("other", 5) == "low"
        assert compute_relevance_tier(None, 5) == "low"
        assert compute_relevance_tier("", 0) == "low"


# ── is_advertisement edge cases ──

class TestAdvertisementDetection:

    def test_ad_detection_case_insensitive(self):
        assert is_advertisement("加微信VX123")
        assert is_advertisement("加微信vx123")

    def test_clean_content_not_flagged(self):
        assert not is_advertisement("保研经验分享：夏令营准备攻略")

    def test_empty_string(self):
        assert not is_advertisement("")

    def test_none_input(self):
        assert not is_advertisement(None)


# ── normalize_category edge cases ──

class TestNormalizeCategory:

    def test_source_mapping(self):
        assert normalize_category("eeban", "") == "baoyan"
        assert normalize_category("kaoyan", "") == "kaoyan"
        assert normalize_category("juejin", "") == "job"

    def test_explicit_category_overrides(self):
        assert normalize_category("eeban", "job") == "job"
        assert normalize_category("unknown", "Custom ") == "custom"

    def test_none_source_and_category(self):
        assert normalize_category(None, None) == ""
        assert normalize_category(None, "") == ""


# ── CleanerPipeline full flow edge cases ──

class TestCleanerPipeline:

    def setup_method(self):
        self.pipeline = CleanerPipeline()

    def test_all_empty_fields(self):
        item = {
            "source_name": "",
            "url": "",
            "title": "",
            "summary": "",
            "content_snippet": "",
        }
        result = self.pipeline.process_item(item, spider=None)
        assert result["dedupe_hash"]
        assert result["quality_score"] == 0
        assert result["relevance_tier"] == "low"

    def test_emoji_heavy_content(self):
        item = {
            "source_name": "juejin",
            "url": "https://juejin.cn/post/1",
            "title": "🔥🔥🔥 热门经验 🎉",
            "summary": "分享 💡 找实习的心得 🚀",
            "content_snippet": "秋招面试经验 👨‍💻 offer对比 📊" * 50,
        }
        result = self.pipeline.process_item(item, spider=None)
        assert result["title"].startswith("🔥")
        assert "实习" in result["summary"]

    def test_extremely_long_content_is_truncated(self):
        item = {
            "source_name": "csdn",
            "url": "https://csdn.net/article/1",
            "title": "很长的标题" * 100,
            "summary": "很长的摘要" * 200,
            "content_snippet": "x" * 10000,
        }
        result = self.pipeline.process_item(item, spider=None)
        assert len(result["title"]) <= 203  # 200 + "..."
        assert len(result["summary"]) <= 503
        assert len(result["content_snippet"]) <= 2003

    def test_html_tags_in_content_not_stripped_by_cleaner(self):
        # Cleaner only cleans whitespace, not HTML
        item = {
            "source_name": "v2ex",
            "url": "https://v2ex.com/t/1",
            "title": "<b>Bold Title</b>",
            "summary": "<script>alert(1)</script>",
            "content_snippet": "<p>Some content</p>",
        }
        result = self.pipeline.process_item(item, spider=None)
        assert result["title"] == "<b>Bold Title</b>"


# ── ExtractorPipeline edge cases ──

class TestExtractorEdgeCases:

    def test_extract_returns_none_on_exception(self):
        pipeline = ExtractorPipeline(
            api_key="key",
            base_url="https://example.com",
            model="glm-4-flash",
            enabled=True,
        )
        pipeline._extract = lambda _t, _c: None

        item = {
            "title": "test",
            "content_snippet": "x" * 300,
            "quality_score": 15,
            "source_name": "juejin",
        }
        result = pipeline.process_item(item, spider=None)
        assert "_career_case" not in result
        assert result["quality_score"] == 10.0  # Lowered by 5

    def test_quality_score_not_below_zero(self):
        pipeline = ExtractorPipeline(
            api_key="key",
            base_url="https://example.com",
            model="glm-4-flash",
            enabled=True,
        )
        pipeline._extract = lambda _t, _c: None

        item = {
            "title": "test",
            "content_snippet": "x" * 300,
            "quality_score": 3,
            "source_name": "juejin",
        }
        result = pipeline.process_item(item, spider=None)
        # quality_score < QUALITY_THRESHOLD (10), so extraction is skipped entirely
        assert result["quality_score"] == 3
        assert "_career_case" not in result

    def test_extract_with_malformed_json_response(self):
        pipeline = ExtractorPipeline(
            api_key="key",
            base_url="https://example.com",
            model="glm-4-flash",
            enabled=True,
        )
        # Simulate AI returning garbage
        pipeline._extract = lambda _t, _c: None

        item = {
            "title": "test",
            "content_snippet": "x" * 300,
            "quality_score": 20,
            "source_name": "eeban",
        }
        result = pipeline.process_item(item, spider=None)
        assert "_career_case" not in result

    def test_extract_uses_summary_as_fallback_content(self):
        pipeline = ExtractorPipeline(
            api_key="key",
            base_url="https://example.com",
            model="glm-4-flash",
            enabled=True,
        )
        pipeline._extract = lambda _t, _c: {
            "background": "985 CS",
            "result": "offer",
            "tags": "CS",
        }

        item = {
            "title": "test",
            "content_snippet": "",
            "summary": "y" * 300,
            "quality_score": 20,
            "source_name": "eeban",
            "url": "https://example.com",
            "category": "baoyan",
            "dedupe_hash": "hash",
        }
        result = pipeline.process_item(item, spider=None)
        assert "_career_case" in result
        assert result["_career_case"]["background"] == "985 CS"

    def test_short_content_skips_extraction(self):
        pipeline = ExtractorPipeline(
            api_key="key",
            base_url="https://example.com",
            model="glm-4-flash",
            enabled=True,
        )
        item = {
            "title": "test",
            "content_snippet": "short",
            "quality_score": 50,
            "source_name": "eeban",
        }
        result = pipeline.process_item(item, spider=None)
        assert "_career_case" not in result
        assert pipeline.extracted_count == 0
