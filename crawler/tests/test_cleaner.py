import pytest
from scrapy.exceptions import DropItem

from cyberguide_crawler.pipelines.cleaner import (
    CleanerPipeline,
    clean_text,
    compute_dedupe_hash,
    compute_quality_score,
)


def test_clean_text_and_hash_are_stable():
    assert clean_text("  hello \n  world  ") == "hello world"

    h1 = compute_dedupe_hash(" 保研 经验贴 ", "https://example.com/a")
    h2 = compute_dedupe_hash("保研经验贴", "https://example.com/b")
    assert h1 == h2
    assert len(h1) == 32


def test_quality_score_prefers_planning_keywords():
    score = compute_quality_score("保研夏令营经验", "我整理了申请流程和面试准备", "eeban")
    assert score >= 15


def test_cleaner_pipeline_processes_article_fields():
    pipeline = CleanerPipeline()
    item = {
        "source_name": "eeban",
        "url": "https://example.com/post/1",
        "title": "  保研经验总结  ",
        "summary": "  一篇很有用的经验帖  ",
        "content_snippet": "保研流程、夏令营准备和面试建议。" * 30,
    }

    processed = pipeline.process_item(item, spider=None)

    assert processed["source_name"] == "eeban"
    assert processed["category"] == "baoyan"
    assert processed["dedupe_hash"]
    assert processed["quality_score"] >= 10
    assert processed["relevance_tier"] in {"high", "medium", "low"}
    assert processed["language"] == "zh"


def test_cleaner_pipeline_drops_advertisements():
    pipeline = CleanerPipeline()
    item = {
        "source_name": "juejin",
        "url": "https://example.com/ad",
        "title": "考研包过，加微信领取资料",
        "summary": "",
        "content_snippet": "内部资料，联系我，扫码进群",
    }

    with pytest.raises(DropItem):
        pipeline.process_item(item, spider=None)
