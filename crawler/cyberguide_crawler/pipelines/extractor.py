"""
ExtractorPipeline — AI-powered structured information extraction.
Runs after Dedup, before Database (order=300).

For ArticleItems with high quality_score and sufficient content,
calls glm-4-flash to extract background/result/tags,
and attaches structured fields to item['_career_case'] for DatabasePipeline.
"""
import json
import logging

import requests

logger = logging.getLogger(__name__)

QUALITY_THRESHOLD = 10.0
MIN_CONTENT_LENGTH = 100

EXTRACT_PROMPT = """你是一个信息提取助手。请从以下经验帖中提取结构化信息，严格输出JSON格式。

帖子标题：{title}
帖子正文：
{content}

请提取以下字段（如果帖子中没有相关信息，对应字段填""）：
{{
  "background": "学历背景（院校、专业、年级、985/211/双非）",
  "result": "最终结果（录取学校/offer/去向）",
  "tags": "标签（用逗号分隔，如：985,CS,保研,清华）"
}}

只输出JSON，不要输出任何解释。"""


class ExtractorPipeline:
    """Extract structured career info from high-quality articles via AI."""

    def __init__(self, api_key, base_url, model, enabled):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.enabled = enabled
        self.extracted_count = 0

    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            api_key=crawler.settings.get('OPENAI_API_KEY', ''),
            base_url=crawler.settings.get('OPENAI_BASE_URL', ''),
            model=crawler.settings.get('OPENAI_MODEL', 'glm-4-flash'),
            enabled=crawler.settings.getbool('AI_EXTRACT_ENABLED', False),
        )

    def open_spider(self, spider):
        if self.enabled and self.api_key:
            logger.info("ExtractorPipeline enabled (model=%s)", self.model)
        else:
            logger.info("ExtractorPipeline disabled (AI_EXTRACT_ENABLED=false or no API key)")

    def close_spider(self, spider):
        logger.info("ExtractorPipeline: extracted %d cases", self.extracted_count)

    def process_item(self, item, spider):
        if not self.enabled or not self.api_key:
            return item

        # Extract from any article with sufficient quality and content
        score = item.get('quality_score', 0)
        content = item.get('content_snippet', '') or item.get('summary', '')
        if score < QUALITY_THRESHOLD or len(content) < MIN_CONTENT_LENGTH:
            return item

        category = item.get('category', '') or 'general'

        # Call AI extraction
        extracted = self._extract(item.get('title', ''), content)
        if extracted:
            # Attach extracted fields to the item for DatabasePipeline
            item['_career_case'] = {
                'source': item.get('source_name', ''),
                'url': item.get('url', ''),
                'title': item.get('title', ''),
                'content': content,
                'category': category,
                'background': extracted.get('background', ''),
                'result': extracted.get('result', ''),
                'tags': extracted.get('tags', ''),
                'quality_score': score,
                'dedupe_hash': item.get('dedupe_hash', ''),
            }
            self.extracted_count += 1
        else:
            # Extraction failed: slightly lower quality to reduce future retrieval priority
            item['quality_score'] = max(float(score) - 5.0, 0.0)

        return item

    def _extract(self, title: str, content: str) -> dict | None:
        prompt = EXTRACT_PROMPT.format(
            title=title[:100],
            content=content[:2000],
        )
        try:
            resp = requests.post(
                f'{self.base_url}/chat/completions',
                json={
                    'model': self.model,
                    'messages': [{'role': 'user', 'content': prompt}],
                    'temperature': 0.1,
                    'max_tokens': 300,
                },
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                },
                timeout=20,
            )
            resp.raise_for_status()
            raw = resp.json().get('choices', [{}])[0].get('message', {}).get('content', '')
            if not raw:
                return None

            cleaned = raw.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[-1].rsplit('```', 1)[0].strip()

            return json.loads(cleaned)
        except Exception as e:
            logger.warning("AI extraction failed for '%s': %s", title[:30], e)
            return None
