from cyberguide_crawler.pipelines.extractor import ExtractorPipeline


def test_disabled_extractor_returns_item_unchanged():
    pipeline = ExtractorPipeline(
        api_key="",
        base_url="https://example.com",
        model="glm-4-flash",
        enabled=False,
    )
    item = {"title": "t", "quality_score": 99, "content_snippet": "x" * 200}
    assert pipeline.process_item(item, spider=None) == item
    assert "_career_case" not in item


def test_low_quality_item_skips_extraction():
    pipeline = ExtractorPipeline(
        api_key="key",
        base_url="https://example.com",
        model="glm-4-flash",
        enabled=True,
    )
    item = {"title": "t", "quality_score": 1, "content_snippet": "x" * 200}
    assert pipeline.process_item(item, spider=None) == item
    assert "_career_case" not in item
    assert pipeline.extracted_count == 0


def test_successful_extraction_attaches_structured_case():
    pipeline = ExtractorPipeline(
        api_key="key",
        base_url="https://example.com",
        model="glm-4-flash",
        enabled=True,
    )
    pipeline._extract = lambda _title, _content: {
        "background": "双非 CS",
        "result": "拿到实习 offer",
        "tags": "CS,实习",
    }

    item = {
        "source_name": "juejin",
        "url": "https://example.com/post",
        "title": "经验分享",
        "summary": "summary",
        "content_snippet": "x" * 300,
        "category": "job",
        "quality_score": 30,
        "dedupe_hash": "hash-1",
    }
    result = pipeline.process_item(item, spider=None)

    assert "_career_case" in result
    assert result["_career_case"]["background"] == "双非 CS"
    assert result["_career_case"]["result"] == "拿到实习 offer"
    assert pipeline.extracted_count == 1


def test_failed_extraction_lowers_quality_score():
    pipeline = ExtractorPipeline(
        api_key="key",
        base_url="https://example.com",
        model="glm-4-flash",
        enabled=True,
    )
    pipeline._extract = lambda _title, _content: None

    item = {
        "title": "失败样例",
        "content_snippet": "x" * 300,
        "quality_score": 11,
        "source_name": "juejin",
    }
    result = pipeline.process_item(item, spider=None)

    assert result["quality_score"] == 6.0
