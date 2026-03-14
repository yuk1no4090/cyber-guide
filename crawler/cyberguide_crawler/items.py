"""
Scrapy Item definitions — structured data models that flow through the pipeline.
"""
import scrapy


class ArticleItem(scrapy.Item):
    """A crawled article/post from any source."""
    source_name = scrapy.Field()
    url = scrapy.Field()
    title = scrapy.Field()
    summary = scrapy.Field()
    content_snippet = scrapy.Field()
    category = scrapy.Field()       # baoyan / kaoyan / liuxue / job
    language = scrapy.Field()
    quality_score = scrapy.Field()
    relevance_tier = scrapy.Field()  # high / medium / low
    dedupe_hash = scrapy.Field()
    _career_case = scrapy.Field()   # set by ExtractorPipeline, consumed by DatabasePipeline


class CareerCaseItem(scrapy.Item):
    """A structured career experience case with AI-extracted fields."""
    source = scrapy.Field()
    url = scrapy.Field()
    title = scrapy.Field()
    content = scrapy.Field()
    category = scrapy.Field()
    background = scrapy.Field()     # AI-extracted: school, major, GPA
    result = scrapy.Field()         # AI-extracted: offer, admission
    tags = scrapy.Field()           # AI-extracted: comma-separated
    quality_score = scrapy.Field()
    dedupe_hash = scrapy.Field()
