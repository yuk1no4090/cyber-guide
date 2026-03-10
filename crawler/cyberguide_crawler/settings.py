"""
Scrapy settings for Cyber Guide crawler.
"""
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

BOT_NAME = "cyberguide_crawler"
SPIDER_MODULES = ["cyberguide_crawler.spiders"]
NEWSPIDER_MODULE = "cyberguide_crawler.spiders"

# --- Concurrency ---
CONCURRENT_REQUESTS = 8
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_DELAY = 1
RANDOMIZE_DOWNLOAD_DELAY = True

# --- AutoThrottle (adaptive rate limiting) ---
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1
AUTOTHROTTLE_MAX_DELAY = 10
AUTOTHROTTLE_TARGET_CONCURRENCY = 2.0
AUTOTHROTTLE_DEBUG = False

# --- Retry ---
RETRY_ENABLED = True
RETRY_TIMES = 2
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# --- Request ---
DOWNLOAD_TIMEOUT = 15
ROBOTSTXT_OBEY = True
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# --- Downloader middlewares ---
DOWNLOADER_MIDDLEWARES = {
    "scrapy.downloadermiddlewares.useragent.UserAgentMiddleware": None,
    "cyberguide_crawler.middlewares.useragent.RandomUserAgentMiddleware": 400,
}

# --- Spider middlewares ---
SPIDER_MIDDLEWARES = {
    "cyberguide_crawler.middlewares.stats_log.StatsLogMiddleware": 543,
}

# --- Item pipelines (order matters) ---
ITEM_PIPELINES = {
    "cyberguide_crawler.pipelines.cleaner.CleanerPipeline": 100,
    "cyberguide_crawler.pipelines.dedup.DedupPipeline": 200,
    "cyberguide_crawler.pipelines.database.DatabasePipeline": 400,
}

# --- Duplicate filter ---
DUPEFILTER_DEBUG = True

# --- Logging ---
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s [%(name)s] %(levelname)s: %(message)s"

# --- Telnet (disabled for security) ---
TELNETCONSOLE_ENABLED = False

# --- Feed export (not used, we write to DB) ---
FEED_EXPORT_ENCODING = "utf-8"

# --- Database (loaded from env) ---
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "cyber_guide")
POSTGRES_USER = os.getenv("POSTGRES_USER", "cyber_guide")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "changeme")

# --- Crawler behavior ---
CRAWLER_MAX_PAGES = int(os.getenv("CRAWLER_MAX_PAGES_PER_SOURCE", "3"))
CLOSESPIDER_TIMEOUT = 300

# --- AI extraction (optional, disabled by default) ---
AI_EXTRACT_ENABLED = os.getenv("AI_EXTRACT_ENABLED", "false").lower() == "true"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "glm-4-flash")

REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
