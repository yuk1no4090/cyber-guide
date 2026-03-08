"""
Crawler runner — can be invoked as one-shot or scheduled.

Usage:
    python run.py --once          # run all spiders once
    python run.py --once --dry-run  # parse only, don't write to DB
    python run.py                 # start scheduler
"""
import argparse
import logging
import sys

from config import CRAWLER_ENABLED, CRAWLER_INTERVAL_MINUTES, CRAWLER_MAX_PAGES_PER_SOURCE
from db import ensure_tables, insert_articles, article_exists
from spiders.csdn_spider import CsdnSpider
from spiders.v2ex_spider import V2exSpider
from spiders.juejin_spider import JuejinSpider

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
)
logger = logging.getLogger('crawler')

ALL_SPIDERS = [CsdnSpider, V2exSpider, JuejinSpider]


def run_all_spiders(dry_run: bool = False):
    """Execute all spiders and persist results."""
    logger.info("Starting crawl run (dry_run=%s)", dry_run)
    total_new = 0

    for SpiderClass in ALL_SPIDERS:
        spider = SpiderClass()
        try:
            articles = spider.crawl(max_pages=CRAWLER_MAX_PAGES_PER_SOURCE)
        except Exception as e:
            logger.error("Spider %s failed: %s", spider.source_name, e)
            continue

        if dry_run:
            for a in articles:
                logger.info("[DRY] %s | %s | score=%.1f", a['source_name'], a['title'], a['quality_score'])
            total_new += len(articles)
            continue

        # Filter already-seen articles
        new_articles = [a for a in articles if not article_exists(a['dedupe_hash'])]
        if new_articles:
            insert_articles(new_articles)
            total_new += len(new_articles)
            logger.info("[%s] Inserted %d new articles", spider.source_name, len(new_articles))
        else:
            logger.info("[%s] No new articles", spider.source_name)

    logger.info("Crawl run complete. Total new: %d", total_new)
    return total_new


def main():
    parser = argparse.ArgumentParser(description='Cyber Guide Crawler')
    parser.add_argument('--once', action='store_true', help='Run once and exit')
    parser.add_argument('--dry-run', action='store_true', help='Parse only, no DB writes')
    args = parser.parse_args()

    if not CRAWLER_ENABLED:
        logger.warning("Crawler is disabled (CRAWLER_ENABLED=false). Exiting.")
        sys.exit(0)

    if not args.dry_run:
        ensure_tables()

    if args.once:
        run_all_spiders(dry_run=args.dry_run)
        return

    # Scheduled mode
    from apscheduler.schedulers.blocking import BlockingScheduler
    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_all_spiders,
        'interval',
        minutes=CRAWLER_INTERVAL_MINUTES,
        id='crawl_job',
        max_instances=1,
    )
    logger.info("Scheduler started. Interval: %d minutes", CRAWLER_INTERVAL_MINUTES)

    # Run immediately on start
    run_all_spiders()

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")


if __name__ == '__main__':
    main()
