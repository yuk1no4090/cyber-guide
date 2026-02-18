-- 评价反馈案例卡片表（对应 /api/feedback 写入）
-- 幂等执行：可重复运行，不会因已存在对象报错

create extension if not exists "pgcrypto";

create table if not exists public.case_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  redacted_messages jsonb not null default '[]'::jsonb,
  conversation_turns int not null default 0,
  had_crisis boolean not null default false,
  rating int not null default 0,
  feedback text,
  quality_tier text not null default 'unrated',
  quality_score float not null default 0,
  mode text not null default 'chat'
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'case_cards_rating_check'
      and conrelid = 'public.case_cards'::regclass
  ) then
    alter table public.case_cards
      add constraint case_cards_rating_check
      check (rating between 0 and 10);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'case_cards_quality_tier_check'
      and conrelid = 'public.case_cards'::regclass
  ) then
    alter table public.case_cards
      add constraint case_cards_quality_tier_check
      check (quality_tier in ('gold', 'silver', 'bronze', 'needs_fix', 'unrated'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'case_cards_mode_check'
      and conrelid = 'public.case_cards'::regclass
  ) then
    alter table public.case_cards
      add constraint case_cards_mode_check
      check (mode in ('chat', 'profile', 'profile_other'));
  end if;
end
$$;

create index if not exists idx_case_cards_created_at
  on public.case_cards (created_at desc);

create index if not exists idx_case_cards_quality_tier
  on public.case_cards (quality_tier);
