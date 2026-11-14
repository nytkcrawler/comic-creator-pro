alter table public.comic_pages drop constraint if exists comic_pages_provider_id_check;
alter table public.comic_pages add constraint comic_pages_provider_id_check
  check (provider_id = any (array['openai'::text, 'venice'::text, 'replicate'::text]));
