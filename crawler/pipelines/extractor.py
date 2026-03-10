"""
AI-powered information extraction pipeline.
Takes raw article content and extracts structured fields using glm-4-flash.
Only runs on articles above a quality threshold to control API costs.
"""
import json
import logging
import requests
from config import REQUEST_TIMEOUT

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """你是一个信息提取助手。请从以下经验帖中提取结构化信息，严格输出JSON格式。

帖子标题：{title}
帖子正文：
{content}

请提取以下字段（如果帖子中没有相关信息，对应字段填""）：
{{
  "background": "学历背景（院校、专业、年级、985/211/双非）",
  "conditions": "硬性条件（GPA/排名/实习/科研/论文/竞赛/语言成绩）",
  "result": "最终结果（录取学校/offer/去向）",
  "advice": "核心建议（1-3条，每条一句话）",
  "tags": "标签（用逗号分隔，如：985,CS,保研,清华）"
}}

只输出JSON，不要输出任何解释。"""

QUALITY_THRESHOLD = 10.0


def extract_case_info(title: str, content: str, api_key: str, base_url: str, model: str = 'glm-4-flash') -> dict | None:
    """
    Call AI to extract structured information from a career experience post.
    Returns a dict with background/conditions/result/advice/tags, or None on failure.
    """
    if not content or len(content) < 100:
        return None

    prompt = EXTRACT_PROMPT.format(
        title=title[:100],
        content=content[:3000],
    )

    try:
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }
        payload = {
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.1,
            'max_tokens': 500,
        }
        resp = requests.post(
            f'{base_url}/chat/completions',
            json=payload,
            headers=headers,
            timeout=REQUEST_TIMEOUT + 10,
        )
        resp.raise_for_status()
        data = resp.json()

        raw_text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        if not raw_text:
            return None

        # Parse JSON from response (handle markdown code blocks)
        cleaned = raw_text.strip()
        if cleaned.startswith('```'):
            cleaned = cleaned.split('\n', 1)[-1]
            cleaned = cleaned.rsplit('```', 1)[0]
        cleaned = cleaned.strip()

        result = json.loads(cleaned)
        return {
            'background': result.get('background', ''),
            'conditions': result.get('conditions', ''),
            'result': result.get('result', ''),
            'advice': result.get('advice', ''),
            'tags': result.get('tags', ''),
        }

    except json.JSONDecodeError as e:
        logger.warning(f"[extractor] JSON parse failed: {e}")
        return None
    except Exception as e:
        logger.error(f"[extractor] AI extraction failed: {e}")
        return None


def should_extract(article: dict) -> bool:
    """Only extract from articles with sufficient quality and content length."""
    score = article.get('quality_score', 0)
    content = article.get('content_snippet', '') or article.get('summary', '')
    return score >= QUALITY_THRESHOLD and len(content) >= 100
