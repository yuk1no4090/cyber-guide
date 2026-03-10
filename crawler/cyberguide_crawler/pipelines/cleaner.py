"""
CleanerPipeline — text cleaning, truncation, dedupe hash, quality scoring.
Runs first in the pipeline chain (order=100).
"""
import hashlib
import re
from urllib.parse import urlparse


PLANNING_KEYWORDS = [
    '保研', '推免', '夏令营', '预推免', '直博', '考研', '复试', '调剂', '上岸', '备考',
    '留学', '申请', 'GPA', 'GRE', 'TOEFL', 'IELTS', 'offer', '录取', '拒信',
    '秋招', '春招', '校招', '社招', '实习', '面试', '面经', '简历', '求职',
    '转正', '薪资', '公司', '岗位',
    '职业规划', '学习路线', '转行', '方向选择', '迷茫', '焦虑', '项目经验',
    'CS', '计算机', '软件工程', '后端', '前端', '全栈', '算法', '刷题', '技术栈',
    '985', '211', '双非',
]


def clean_text(text: str) -> str:
    if not text:
        return ''
    return re.sub(r'\s+', ' ', text).strip()


def truncate(text: str, max_len: int) -> str:
    return text[:max_len] if len(text) <= max_len else text[:max_len] + '...'


def compute_dedupe_hash(title: str, url: str) -> str:
    normalized = re.sub(r'\s+', '', title.strip().lower())
    host = urlparse(url).netloc
    raw = f"{normalized}|{host}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def compute_quality_score(title: str, content: str) -> float:
    text = (title + ' ' + content).lower()
    score = sum(5 for kw in PLANNING_KEYWORDS if kw.lower() in text)
    content_len = len(content)
    if 200 <= content_len <= 2000:
        score += 10
    elif content_len > 2000:
        score += 5
    return min(score, 100)


class CleanerPipeline:
    """Clean text fields, compute dedupe_hash and quality_score."""

    def process_item(self, item, spider):
        item['title'] = truncate(clean_text(item.get('title', '')), 200)
        item['summary'] = truncate(clean_text(item.get('summary', '')), 500)
        item['content_snippet'] = truncate(clean_text(item.get('content_snippet', '')), 2000)

        url = item.get('url', '')
        title = item.get('title', '')
        item['dedupe_hash'] = compute_dedupe_hash(title, url)
        item['quality_score'] = compute_quality_score(title, item.get('content_snippet', '') or item.get('summary', ''))
        item.setdefault('language', 'zh')
        item.setdefault('category', '')

        return item
