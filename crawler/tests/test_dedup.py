import pytest
from scrapy.exceptions import DropItem

from cyberguide_crawler.pipelines.dedup import DedupPipeline


class _FakeCursor:
    def __init__(self, existing):
        self._existing = existing

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, *_args, **_kwargs):
        return None

    def fetchone(self):
        return (1,) if self._existing else None


class _FakeConn:
    def __init__(self, existing):
        self._existing = existing

    def cursor(self):
        return _FakeCursor(self._existing)


def test_process_item_raises_when_hash_missing():
    pipeline = DedupPipeline(db_settings={})
    pipeline.conn = _FakeConn(existing=False)

    with pytest.raises(DropItem, match="Missing dedupe_hash"):
        pipeline.process_item({"title": "hello"}, spider=None)


def test_process_item_drops_duplicate_hash():
    pipeline = DedupPipeline(db_settings={})
    pipeline.conn = _FakeConn(existing=True)

    with pytest.raises(DropItem, match="Duplicate"):
        pipeline.process_item({"dedupe_hash": "abc", "title": "dup"}, spider=None)


def test_process_item_passes_new_hash():
    pipeline = DedupPipeline(db_settings={})
    pipeline.conn = _FakeConn(existing=False)

    item = {"dedupe_hash": "xyz", "title": "new-item"}
    assert pipeline.process_item(item, spider=None) == item
