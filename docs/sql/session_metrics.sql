-- 会话指标表（全局隐私开关开启时写入摘要/指标，不存完整消息）
-- 幂等执行：可重复运行，不会因已存在对象报错

create extension if not exists "pgcrypto";

create table if not exists public.session_metrics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  mode text not null default 'chat',
  conversation_turns int not null default 0,
  user_msg_count int not null default 0,
  avg_user_msg_length float not null default 0,
  had_crisis boolean not null default false,
  summary text,
  prompt_version text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_metrics_mode_check'
      and conrelid = 'public.session_metrics'::regclass
  ) then
    alter table public.session_metrics
      add constraint session_metrics_mode_check
      check (mode in ('chat', 'profile', 'profile_other'));
  end if;
end
$$;

create index if not exists idx_session_metrics_session_id
  on public.session_metrics (session_id);

create index if not exists idx_session_metrics_created_at
  on public.session_metrics (created_at desc);
