-- Private single-owner studio: remove unused customer billing objects.
-- Preserve provider registry, routing, jobs and usage telemetry.
drop table if exists public.model_pricing;
drop table if exists public.credit_ledger;
drop table if exists public.credit_accounts;

-- Assign the sole existing account the administrator role using the existing
-- server-managed role table, never user-editable Auth metadata.
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'nytkcrawler@gmail.com'
on conflict (user_id, role) do nothing;

-- No customer billing, payments, credits or pricing are part of this product.
