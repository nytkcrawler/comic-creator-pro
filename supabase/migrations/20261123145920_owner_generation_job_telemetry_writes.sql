-- Allow the authenticated owner to create and advance only their own
-- generation job and usage telemetry rows. Registry administration remains
-- protected by the existing admin policies.
drop policy if exists generation_jobs_insert_own on public.generation_jobs;
create policy generation_jobs_insert_own on public.generation_jobs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists generation_jobs_update_own on public.generation_jobs;
create policy generation_jobs_update_own on public.generation_jobs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists generation_provider_usage_insert_own on public.generation_provider_usage;
create policy generation_provider_usage_insert_own on public.generation_provider_usage
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert, update on public.generation_jobs to authenticated;
grant insert on public.generation_provider_usage to authenticated;
