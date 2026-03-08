"""
Crawler configuration — loaded from environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
DB_NAME = os.getenv('POSTGRES_DB', 'cyber_guide')
DB_USER = os.getenv('POSTGRES_USER', 'cyber_guide')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'changeme')

CRAWLER_ENABLED = os.getenv('CRAWLER_ENABLED', 'true').lower() == 'true'
CRAWLER_INTERVAL_MINUTES = int(os.getenv('CRAWLER_INTERVAL_MINUTES', '360'))
CRAWLER_MAX_PAGES_PER_SOURCE = int(os.getenv('CRAWLER_MAX_PAGES_PER_SOURCE', '3'))

REQUEST_TIMEOUT = 10
REQUEST_MAX_RETRIES = 2
USER_AGENT = 'CyberGuideCrawler/0.1 (+https://github.com/yuk1no4090/cyber-guide)'
