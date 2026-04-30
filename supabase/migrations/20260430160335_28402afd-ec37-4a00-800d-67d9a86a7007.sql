-- Bot polling offset (singleton)
create table public.telegram_bot_state (
  id int primary key check (id = 1),
  update_offset bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.telegram_bot_state (id, update_offset) values (1, 0);

-- Per-chat session: rolling history + lightweight profile
create table public.telegram_sessions (
  chat_id bigint primary key,
  username text,
  first_name text,
  history jsonb not null default '[]'::jsonb,
  location text,
  has_kids boolean default false,
  has_pets boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Photo audits performed via Telegram
create table public.telegram_audits (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  area text,
  risk_level text,
  summary text,
  findings jsonb,
  created_at timestamptz not null default now()
);
create index idx_telegram_audits_chat on public.telegram_audits(chat_id);

-- RLS: lock everything down. Only service_role (edge functions) touches these.
alter table public.telegram_bot_state enable row level security;
alter table public.telegram_sessions enable row level security;
alter table public.telegram_audits enable row level security;
-- (No policies = no access for anon/authenticated. service_role bypasses RLS.)

-- Required extensions for cron polling
create extension if not exists pg_cron;
create extension if not exists pg_net;