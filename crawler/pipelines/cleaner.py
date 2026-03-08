"""
Data cleaning and deduplication utilities.
"""
import hashlib
import re
from urllib.parse import urlparse


def compute_dedupe_hash(title: str, url: str) -> str:
    """SHA-256 hash of normalized title + url host for deduplication."""
    normalized_title = re.sub(r'\s+', '', title.strip().lower())
    host = urlparse(url).netloc
    raw = f"{normalized_title}|{host}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]


def clean_text(text: str) -> str:
    """Remove excessive whitespace and normalize."""
    if not text:
        return ''
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def truncate(text: str, max_len: int = 500) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + '...'


PLANNING_KEYWORDS = [
    '职业规划', '学习路线', '求职', '面试', '实习', '考研', '留学',
    '转行', '技术栈', '简历', '秋招', '春招', '校招', '社招',
    '算法', '刷题', '项目经验', '方向选择', '迷茫', '焦虑',
    'CS', '计算机', '软件工程', '后端', '前端', '全栈',
]


def compute_quality_score(title: str, content: str) -> float:
    """Simple keyword-based quality scoring."""
    text = (title + ' ' + content).lower()
    score = 0.0

    # keyword hits
    for kw in PLANNING_KEYWORDS:
        if kw.lower() in text:
            score += 5

    # content length quality window (200-2000 chars is ideal)
    content_len = len(content)
    if 200 <= content_len <= 2000:
        score += 10
    elif content_len > 2000:
        score += 5

    return min(score, 100)
