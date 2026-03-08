"""
Base spider class — all source spiders inherit from this.
"""
import logging
import requests
from bs4 import BeautifulSoup
from config import REQUEST_TIMEOUT, REQUEST_MAX_RETRIES, USER_AGENT

logger = logging.getLogger(__name__)


class BaseSpider:
    """Base class for all crawl spiders."""

    source_name: str = 'unknown'
    base_url: str = ''

    def fetch_page(self, url: str) -> BeautifulSoup | None:
        """Fetch a URL and return parsed BeautifulSoup, with retries."""
        headers = {'User-Agent': USER_AGENT}
        for attempt in range(REQUEST_MAX_RETRIES + 1):
            try:
                resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                return BeautifulSoup(resp.text, 'lxml')
            except requests.RequestException as e:
                logger.warning(f"[{self.source_name}] Fetch failed (attempt {attempt + 1}): {url} - {e}")
        return None

    def crawl(self, max_pages: int = 3) -> list[dict]:
        """Override in subclass. Returns list of article dicts."""
        raise NotImplementedError
