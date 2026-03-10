"""
StatsLogMiddleware — logs crawl statistics when each spider closes.
"""
import logging

logger = logging.getLogger(__name__)


class StatsLogMiddleware:
    """Spider middleware that logs summary stats on spider_closed."""

    @classmethod
    def from_crawler(cls, crawler):
        o = cls()
        crawler.signals.connect(o.spider_closed, signal=__import__('scrapy').signals.spider_closed)
        return o

    def process_spider_output(self, response, result, spider):
        for item in result:
            yield item

    def spider_closed(self, spider, reason):
        stats = spider.crawler.stats.get_stats()
        items = stats.get('item_scraped_count', 0)
        dropped = stats.get('item_dropped_count', 0)
        requests = stats.get('downloader/request_count', 0)
        errors = stats.get('log_count/ERROR', 0)
        elapsed = stats.get('elapsed_time_seconds', 0)

        logger.info(
            f"[STATS] {spider.name}: "
            f"items={items}, dropped={dropped}, requests={requests}, "
            f"errors={errors}, elapsed={elapsed:.1f}s"
        )
