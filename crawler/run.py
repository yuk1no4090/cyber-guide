"""
Crawler runner — Scrapy-based CLI entry point.

Usage:
    python run.py --once                  # run all spiders once
    python run.py --once --spider eeban   # run a single spider
    python run.py                         # start APScheduler for periodic crawling
"""
import argparse
import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
)
logger = logging.getLogger('crawler')


def get_all_spider_names():
    return ['eeban', 'kaoyan', 'juejin', 'csdn', 'v2ex']


def run_scrapy(spider_names=None):
    """Run Scrapy spiders using CrawlerProcess."""
    os.environ.setdefault('SCRAPY_SETTINGS_MODULE', 'cyberguide_crawler.settings')

    from scrapy.crawler import CrawlerProcess
    from scrapy.utils.project import get_project_settings

    settings = get_project_settings()
    process = CrawlerProcess(settings)

    names = spider_names or get_all_spider_names()
    for name in names:
        process.crawl(name)

    logger.info("Starting Scrapy crawl: spiders=%s", names)
    process.start()
    logger.info("Scrapy crawl complete")


def main():
    parser = argparse.ArgumentParser(description='Cyber Guide Crawler (Scrapy)')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--spider', type=str, help='Run a specific spider only')
    args = parser.parse_args()

    enabled = os.getenv('CRAWLER_ENABLED', 'true').lower() == 'true'
    if not enabled:
        logger.warning("Crawler is disabled (CRAWLER_ENABLED=false). Exiting.")
        sys.exit(0)

    if args.once:
        spiders = [args.spider] if args.spider else None
        run_scrapy(spiders)
        return

    # Scheduled mode
    interval = int(os.getenv('CRAWLER_INTERVAL_MINUTES', '360'))
    from apscheduler.schedulers.blocking import BlockingScheduler
    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_scrapy,
        'interval',
        minutes=interval,
        id='crawl_job',
        max_instances=1,
    )
    logger.info("Scheduler started. Interval: %d minutes", interval)

    run_scrapy()

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")


if __name__ == '__main__':
    main()
