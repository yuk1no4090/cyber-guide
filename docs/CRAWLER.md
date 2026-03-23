# Crawler Module — Scrapy Architecture

## Overview

The crawler collects public study/career planning content from Chinese forums and platforms and writes structured data into PostgreSQL. It uses **Scrapy 2.x** as the framework, with a 4-stage pipeline: Clean → Dedup → AI Extract → Database.

Some spiders call **external HTTP clients** (`requests` or the `xhs` library) inside a Scrapy callback so that request headers/signatures match what the target site expects (Zhihu `x-zse-96`, Xiaohongshu `x-s` / `x-t`).

## Architecture

```
crawler/
├── run.py                       # CLI: --once / --spider NAME / scheduled
├── scrapy.cfg
├── requirements.txt             # scrapy, psycopg2, requests, xhs (optional), etc.
├── Dockerfile
└── cyberguide_crawler/
    ├── settings.py
    ├── items.py                 # ArticleItem + CareerCaseItem
    ├── spiders/
    │   ├── eeban.py             # 保研论坛 (eeban.com)
    │   ├── kaoyan.py            # 考研论坛 (bbs.kaoyan.com)
    │   ├── juejin.py            # 掘金 search API
    │   ├── csdn.py              # CSDN hot-rank API
    │   ├── v2ex.py              # V2EX career node
    │   ├── zhihu.py             # 知乎 search_v3 API + x-zse-96 (requests, ZHIHU_COOKIE)
    │   └── xiaohongshu.py       # 小红书关键词搜索 (xhs + XHS_COOKIE + sign)
    ├── pipelines/
    │   ├── cleaner.py           # Quality score, relevance_tier, ad filter, source weights
    │   ├── dedup.py
    │   ├── extractor.py         # AI extraction (glm-4-flash)
    │   └── database.py
    ├── middlewares/
    │   ├── useragent.py
    │   └── stats_log.py
    └── utils/
```

## Data Sources

| Spider         | Source              | Typical category | Method |
|----------------|---------------------|------------------|--------|
| `eeban`        | eeban.com           | baoyan           | HTML   |
| `kaoyan`       | bbs.kaoyan.com      | kaoyan           | HTML   |
| `juejin`       | api.juejin.cn       | job              | JSON API |
| `csdn`         | blog.csdn.net       | job              | JSON API |
| `v2ex`         | v2ex.com            | job              | HTML   |
| `zhihu`        | www.zhihu.com       | mixed (classified) | JSON API + signed headers |
| `xiaohongshu`  | edith.xiaohongshu.com | mixed (classified) | `xhs` client + cookie |

**Zhihu**: requires a logged-in browser **`ZHIHU_COOKIE`**; signing uses cookie `d_c0` and path `/api/v4/search_v3?...` for `x-zse-96`. Optional comma-separated **`ZHIHU_EXTRA_QUERIES`** appends more search keywords.

**Xiaohongshu**: requires **`XHS_COOKIE`** and dependency **`xhs`**; the client must be constructed with `sign` from `xhs.help` (wrapped in spider). Optional **`XHS_EXTRA_QUERIES`**, **`XHS_MAX_PER_QUERY`**. Platform may return "登录已过期" or risk-control errors when the cookie is stale or the account is restricted.

## Pipeline Chain (order matters)

| Order | Pipeline             | Function |
|-------|----------------------|----------|
| 100   | `CleanerPipeline`    | Text normalization, `dedupe_hash`, `quality_score`, `relevance_tier`, category, ad filtering |
| 200   | `DedupPipeline`      | DB `dedupe_hash` check, `DropItem` on duplicate |
| 300   | `ExtractorPipeline`  | High-quality items → AI `background` / `result` / `tags` → `career_cases` |
| 400   | `DatabasePipeline`   | Batch write `crawled_articles` + `career_cases`; stale downgrade |

## Quality Scoring (cleaner)

- **Keyword hits**: planning-related terms (保研, 考研, 秋招, …)
- **Source weight** (examples): eeban/kaoyan +10, zhihu +8, juejin +5, xiaohongshu +4, csdn/v2ex +0
- **Length bands**: short/medium/long bonuses, capped at 100
- **`relevance_tier`**: high / medium / low from category + score

## Running

```bash
cd crawler && python run.py --once              # all spiders
python run.py --once --spider zhihu             # single spider
python run.py                                   # APScheduler (interval from env)
```

Load env from repo root: copy `.env.example` → `.env` (or export variables). Crawler reads the same `POSTGRES_*` and AI keys as the backend when extracting.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_*` | DB connection (see `.env.example`) |
| `CRAWLER_MAX_PAGES_PER_SOURCE` | Max pages per HTML/API spider where applicable |
| `CRAWLER_INTERVAL_MINUTES` | Scheduler interval when running `run.py` without `--once` |
| `AI_EXTRACT_ENABLED` | Enable AI structured extraction |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | Used by extractor pipeline |
| `ZHIHU_COOKIE` | Full `Cookie` header string for zhihu spider |
| `ZHIHU_EXTRA_QUERIES` | Comma-separated extra search queries |
| `XHS_COOKIE` | Full cookie string for xiaohongshu spider |
| `XHS_MAX_PER_QUERY` | Max notes per keyword (default ~20) |
| `XHS_EXTRA_QUERIES` | Comma-separated extra keywords |

## Database Tables

- **`crawled_articles`**: raw + `quality_score`, `relevance_tier`, `category`, `dedupe_hash`
- **`career_cases`**: structured cases for similar-case RAG in the backend
