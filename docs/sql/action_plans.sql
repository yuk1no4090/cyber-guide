-- 7天微行动计划表
-- 幂等执行：可重复运行，不会因已存在对象报错

create extension if not exists "pgcrypto";

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  day_index int not null,
  task_text text not null,
  status text not null default 'todo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'action_plans_day_index_check'
      and conrelid = 'public.action_plans'::regclass
  ) then
    alter table public.action_plans
      add constraint action_plans_day_index_check
      check (day_index between 1 and 7);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'action_plans_status_check'
      and conrelid = 'public.action_plans'::regclass
  ) then
    alter table public.action_plans
      add constraint action_plans_status_check
      check (status in ('todo', 'done', 'skipped'));
  end if;
end
$$;

create unique index if not exists idx_action_plans_session_day_unique
  on public.action_plans (session_id, day_index);

create or replace function public.action_plans_set_updated_at_v1()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_action_plans_set_updated_at_v1 on public.action_plans;

create trigger trg_action_plans_set_updated_at_v1
before update on public.action_plans
for each row
execute function public.action_plans_set_updated_at_v1();

