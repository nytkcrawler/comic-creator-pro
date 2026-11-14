create table if not exists public.comic_pages (
  id uuid primary key default gen_random_uuid(),
  comic_id uuid not null references public.comics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null default 1 check (page_number >= 1),
  image_path text not null,
  provider_id text not null check (provider_id in ('venice','replicate')),
  prompt text,
  generation_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint comic_pages_comic_page_unique unique (comic_id, page_number)
);
create index if not exists comic_pages_user_created_idx on public.comic_pages (user_id, created_at desc);
create index if not exists comic_pages_comic_id_idx on public.comic_pages (comic_id);
alter table public.comic_pages enable row level security;
create policy "Users manage their own comic pages" on public.comic_pages for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.comic_pages to authenticated;
