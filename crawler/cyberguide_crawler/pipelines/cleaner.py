"""
CleanerPipeline — text cleaning, truncation, dedupe hash, quality scoring.
Runs first in the pipeline chain (order=100).
"""
import hashlib
import re
from urllib.parse import urlparse
from scrapy.exceptions import DropItem


PLANNING_KEYWORDS = [
    '保研', '推免', '夏令营', '预推免', '直博', '考研', '复试', '调剂', '上岸', '备考',
    '留学', '申请', 'GPA', 'GRE', 'TOEFL', 'IELTS', 'offer', '录取', '拒信',
    '秋招', '春招', '校招', '社招', '实习', '面试', '面经', '简历', '求职',
    '转正', '薪资', '公司', '岗位',
    '职业规划', '学习路线', '转行', '方向选择', '迷茫', '焦虑', '项目经验',
    'CS', '计算机', '软件工程', '后端', '前端', '全栈', '算法', '刷题', '技术栈',
    '985', '211', '双非',
]

AD_KEYWORDS = [
    '加微信', 'vx', 'vx:', '微信号', 'qq', '公众号', '辅导班', '代写', '保过',
    '内部资料', '包过', '联系我', '私聊', '扫码', '课程咨询', '考研辅导',
]

SOURCE_WEIGHT = {
    'eeban': 10,
    'kaoyan': 10,
    'juejin': 5,
    'v2ex': 0,
    'csdn': 0,
}

SOURCE_CATEGORY_MAP = {
    'eeban': 'baoyan',
    'kaoyan': 'kaoyan',
    'juejin': 'job',
    'v2ex': 'job',
    'csdn': 'job',
}


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


def compute_quality_score(title: str, content: str, source_name: str) -> float:
    text = (title + ' ' + content).lower()
    score = sum(5 for kw in PLANNING_KEYWORDS if kw.lower() in text)
    score += SOURCE_WEIGHT.get((source_name or '').lower(), 0)
    content_len = len(content)
    if 200 <= content_len <= 500:
        score += 5
    elif 500 < content_len <= 1500:
        score += 10
    elif 1500 < content_len <= 3000:
        score += 8
    elif content_len > 3000:
        score += 3
    return min(score, 100)


def compute_relevance_tier(category: str, score: float) -> str:
    c = (category or '').lower()
    if c in {'baoyan', 'kaoyan', 'job'} and score >= 20:
        return 'high'
    if score >= 10:
        return 'medium'
    return 'low'


def is_advertisement(text: str) -> bool:
    lower = (text or '').lower()
    return any(kw.lower() in lower for kw in AD_KEYWORDS)


def normalize_category(source_name: str, category: str) -> str:
    if category and category.strip():
        return category.strip().lower()
    return SOURCE_CATEGORY_MAP.get((source_name or '').lower(), '')


class CleanerPipeline:
    """Clean text fields, compute dedupe_hash and quality_score."""

    def process_item(self, item, spider):
        item['title'] = truncate(clean_text(item.get('title', '')), 200)
        item['summary'] = truncate(clean_text(item.get('summary', '')), 500)
        item['content_snippet'] = truncate(clean_text(item.get('content_snippet', '')), 2000)

        source_name = (item.get('source_name', '') or '').strip().lower()
        item['source_name'] = source_name
        item['category'] = normalize_category(source_name, item.get('category', ''))

        ad_text = ' '.join([
            item.get('title', ''),
            item.get('summary', ''),
            item.get('content_snippet', ''),
        ])
        if is_advertisement(ad_text):
            raise DropItem(f"广告/推广内容: {item.get('title', '')[:40]}")

        url = item.get('url', '')
        title = item.get('title', '')
        item['dedupe_hash'] = compute_dedupe_hash(title, url)
        score = compute_quality_score(title, item.get('content_snippet', '') or item.get('summary', ''), source_name)
        item['quality_score'] = score
        item['relevance_tier'] = compute_relevance_tier(item.get('category', ''), score)
        item.setdefault('language', 'zh')

        return item
