-- Comic Creator Pro Phase 1: provider registry, pricing, credits and jobs.
-- Additive migration. Existing comics, comic_pages, characters, character_sets,
-- user_roles and generation_usage tables are intentionally preserved.

create extension if not exists pgcrypto;

create table if not exists public.provider_models (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  model_key text not null,
  display_name text not null,
  description text,
  capabilities jsonb not null default '{}'::jsonb,
  supported_styles text[] not null default '{}',
  supported_content_categories text[] not null default '{general}',
  supports_reference_images boolean not null default false,
  max_reference_images integer not null default 0 check (max_reference_images >= 0),
  supports_single_page_output boolean not null default true,
  enabled boolean not null default false,
  auto_routing_enabled boolean not null default false,
  routing_priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_key, model_key)
);

create table if not exists public.model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider_model_id uuid not null references public.provider_models(id) on delete restrict,
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  provider_cost_per_generation numeric(14,6),
  customer_credits integer not null check (customer_credits >= 0),
  credit_value numeric(14,6),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from)
);
create index if not exists model_pricing_active_idx
  on public.model_pricing(provider_model_id, effective_from desc)
  where active = true;

create table if not exists public.model_routing_rules (
  id uuid primary key default gen_random_uuid(),
  style_key text not null,
  content_category text not null default 'general',
  provider_model_id uuid not null references public.provider_models(id) on delete cascade,
  priority integer not null default 100,
  weights jsonb not null default '{"quality":0.4,"identity":0.25,"layout":0.2,"cost":0.15}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(style_key, content_category, provider_model_id)
);

create table if not exists public.credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_credits bigint not null default 0 check (available_credits >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  comic_id uuid references public.comics(id) on delete set null,
  provider_model_id uuid references public.provider_models(id) on delete set null,
  provider_key text,
  model_key text,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed','cancel_requested','cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  result_path text,
  provider_request_id text,
  idempotency_key text not null,
  credits_reserved bigint not null default 0 check (credits_reserved >= 0),
  credits_charged bigint not null default 0 check (credits_charged >= 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists generation_jobs_user_created_idx
  on public.generation_jobs(user_id, created_at desc);
create index if not exists generation_jobs_queue_idx
  on public.generation_jobs(status, created_at)
  where status in ('queued','processing');

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.generation_jobs(id) on delete set null,
  entry_type text not null check (entry_type in ('grant','reservation','charge','refund','adjustment')),
  credits_delta bigint not null,
  idempotency_key text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger(user_id, created_at desc);

create table if not exists public.generation_provider_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null,
  model_key text not null,
  provider_request_id text,
  provider_cost numeric(14,6),
  currency_code text not null default 'USD',
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  usage_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider_key, provider_request_id)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

alter table public.provider_models enable row level security;
alter table public.model_pricing enable row level security;
alter table public.model_routing_rules enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.generation_provider_usage enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists provider_models_read_enabled on public.provider_models;
create policy provider_models_read_enabled on public.provider_models
  for select to authenticated using (enabled or public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists provider_models_admin_all on public.provider_models;
create policy provider_models_admin_all on public.provider_models
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists model_pricing_read_active on public.model_pricing;
create policy model_pricing_read_active on public.model_pricing
  for select to authenticated
  using ((active and (effective_until is null or effective_until > now()))
    or public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists model_pricing_admin_all on public.model_pricing;
create policy model_pricing_admin_all on public.model_pricing
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists model_routing_read_enabled on public.model_routing_rules;
create policy model_routing_read_enabled on public.model_routing_rules
  for select to authenticated using (enabled or public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists model_routing_admin_all on public.model_routing_rules;
create policy model_routing_admin_all on public.model_routing_rules
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists credit_accounts_read_own on public.credit_accounts;
create policy credit_accounts_read_own on public.credit_accounts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists generation_jobs_read_own on public.generation_jobs;
create policy generation_jobs_read_own on public.generation_jobs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists credit_ledger_read_own on public.credit_ledger;
create policy credit_ledger_read_own on public.credit_ledger
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists generation_provider_usage_read_own on public.generation_provider_usage;
create policy generation_provider_usage_read_own on public.generation_provider_usage
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists admin_audit_admin_read on public.admin_audit_log;
create policy admin_audit_admin_read on public.admin_audit_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.provider_models, public.model_pricing, public.model_routing_rules to authenticated;
grant select on public.credit_accounts, public.generation_jobs, public.credit_ledger,
  public.generation_provider_usage to authenticated;
grant select on public.admin_audit_log to authenticated;
revoke insert, update, delete on public.credit_accounts, public.generation_jobs,
  public.credit_ledger, public.generation_provider_usage, public.admin_audit_log from anon, authenticated;
grant insert, update, delete on public.provider_models, public.model_pricing,
  public.model_routing_rules to authenticated;
