# Crawler Module — Scrapy Architecture

## Overview

The crawler collects public study/career planning content from Chinese tech forums and writes structured data into PostgreSQL. It uses **Scrapy 2.x** as the framework, with a 4-stage pipeline: Clean → Dedup → AI Extract → Database.

## Architecture

```
crawler/
├── run.py                       # CLI entry: --once / --spider NAME / scheduled
├── scrapy.cfg                   # Scrapy project config
├── requirements.txt             # Python dependencies (scrapy, psycopg2, etc.)
├── Dockerfile
└── cyberguide_crawler/
    ├── settings.py              # Scrapy settings (concurrency, pipelines, DB, AI)
    ├── items.py                 # ArticleItem + CareerCaseItem
    ├── spiders/
    │   ├── eeban.py             # 保研论坛 (eeban.com)
    │   ├── kaoyan.py            # 考研论坛 (bbs.kaoyan.com)
    │   ├── juejin.py            # 掘金 search API
    │   ├── csdn.py              # CSDN hot-rank API
    │   └── v2ex.py              # V2EX career node
    ├── pipelines/
    │   ├── cleaner.py           # Text cleaning, quality scoring, relevance tiering, ad filtering
    │   ├── dedup.py             # DB-level dedupe_hash check
    │   ├── extractor.py         # AI-powered structured info extraction (glm-4-flash)
    │   └── database.py          # Batch PostgreSQL writer + stale article downgrade
    ├── middlewares/
    │   ├── useragent.py         # Random User-Agent rotation
    │   └── stats_log.py         # Spider close stats logging
    └── utils/
        └── __init__.py
```

## Data Sources

| Spider   | Source             | Category    | Method           |
|----------|--------------------|-------------|------------------|
| `eeban`  | eeban.com          | baoyan      | HTML scraping    |
| `kaoyan` | bbs.kaoyan.com     | kaoyan      | HTML scraping    |
| `juejin` | api.juejin.cn      | job         | JSON search API  |
| `csdn`   | blog.csdn.net      | job         | JSON hot-rank API|
| `v2ex`   | v2ex.com           | job         | HTML scraping    |

## Pipeline Chain (order matters)

| Order | Pipeline            | Function |
|-------|---------------------|----------|
| 100   | `CleanerPipeline`   | Text normalization, truncation, `dedupe_hash`, `quality_score`, `relevance_tier`, category auto-fill, ad filtering |
| 200   | `DedupPipeline`     | Check `dedupe_hash` against DB, `DropItem` on duplicate |
| 300   | `ExtractorPipeline` | For high-quality articles, call AI to extract `background`/`result`/`tags`; attach `_career_case` to item; lower score on extraction failure |
| 400   | `DatabasePipeline`  | Batch write `crawled_articles` + `career_cases` to PostgreSQL; downgrade articles older than 180 days to `low` tier |

## Quality Scoring

`quality_score` is computed from:
- **Keyword hits**: +5 per planning keyword match (保研/考研/实习/面试/etc.)
- **Source weight**: eeban/kaoyan +10, juejin +5, csdn/v2ex +0
- **Content length**: 200-500 → +5, 500-1500 → +10, 1500-3000 → +8, >3000 → +3
- **Max**: capped at 100

`relevance_tier` is derived from category + score:
- **high**: category in {baoyan, kaoyan, job} AND score >= 20
- **medium**: score >= 10
- **low**: everything else

## Ad Filtering

Titles/content containing promotional keywords (加微信, 辅导班, 代写, etc.) are dropped before reaching the database.

## Running

```bash
# One-shot run (all spiders)
cd crawler && python run.py --once

# Single spider
python run.py --once --spider eeban

# Scheduled (APScheduler, default 6h interval)
python run.py
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | Database host |
| `POSTGRES_PORT` | 5432 | Database port |
| `POSTGRES_DB` | cyber_guide | Database name |
| `POSTGRES_USER` | cyber_guide | Database user |
| `POSTGRES_PASSWORD` | changeme | Database password |
| `CRAWLER_MAX_PAGES_PER_SOURCE` | 10 | Max pages per forum/API |
| `AI_EXTRACT_ENABLED` | true | Enable AI structured extraction |
| `OPENAI_API_KEY` | (required) | API key for AI extraction |
| `OPENAI_BASE_URL` | https://open.bigmodel.cn/api/paas/v4 | AI API endpoint |
| `OPENAI_MODEL` | glm-4-flash | Model for extraction |

## Database Tables

### `crawled_articles`
Raw articles with `quality_score`, `relevance_tier`, `category`, `dedupe_hash`.

### `career_cases`
AI-extracted structured cases with `background`, `result`, `tags` — used by backend RAG for similar-case retrieval.
