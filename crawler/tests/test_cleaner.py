"""Tests for the data cleaning pipeline."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pipelines.cleaner import compute_dedupe_hash, clean_text, truncate, compute_quality_score


def test_dedupe_hash_deterministic():
    h1 = compute_dedupe_hash("职业规划指南", "https://example.com/post/1")
    h2 = compute_dedupe_hash("职业规划指南", "https://example.com/post/1")
    assert h1 == h2


def test_dedupe_hash_different_for_different_input():
    h1 = compute_dedupe_hash("职业规划指南", "https://example.com/post/1")
    h2 = compute_dedupe_hash("学习路线推荐", "https://example.com/post/2")
    assert h1 != h2


def test_clean_text():
    assert clean_text("  hello   world  ") == "hello world"
    assert clean_text("") == ""


def test_truncate():
    assert truncate("short", 100) == "short"
    assert truncate("a" * 600, 500).endswith("...")
    assert len(truncate("a" * 600, 500)) == 503


def test_quality_score_with_keywords():
    score = compute_quality_score("CS 职业规划", "这是一篇关于求职和面试的文章" * 20)
    assert score > 0


def test_quality_score_empty():
    score = compute_quality_score("", "")
    assert score == 0
