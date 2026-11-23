# Phase 1: Platform foundation

Status: private single-owner architecture selected. Provider registry, routing, jobs and usage telemetry are retained. Customer billing tables have been removed. Owner admin role is assigned to the sole existing Auth account.

## Repository baseline

- Repository: `nytkcrawler/comic-creator-pro`
- Base branch: `main`
- Working branch: `feat/comic-platform-foundation`
- Existing runtime: React 18 + Vite, Express, Supabase Auth/Postgres/Storage
- Existing providers: OpenAI, Venice, Replicate
- Existing page contract: one provider request returns one complete comic-page image; no per-panel generation or stitching
- Existing tables inspected: `public.comics`, `public.comic_pages`, `public.characters`, `public.character_sets`, `public.user_roles`, `public.generation_usage`, and supporting tables
- Existing Storage bucket inventory still requires a separate verified review; no bucket was created or modified.

## Inspection and migration result

The linked Supabase project `comic-creator-pro` in `ap-south-1` is now `ACTIVE_HEALTHY`.

Five existing migrations were found:
- `20261113170001_comic_creator_initial_schema`
- `20261113170037_comic_creator_rls_performance_hardening`
- `20261113211603_comic_creator_persistence_and_generation_limits`
- `20261114045321_comic_page_image_persistence`
- `20261114045724_allow_openai_comic_pages`

Existing tables already include `characters`, `character_sets`, `user_roles` (enum values: admin, moderator, user), and `generation_usage`. These were reused rather than duplicated. The existing `has_role(uuid, app_role)` helper and user-owned RLS patterns were inspected.

The additive migration `20261123144653_comic_platform_provider_billing_jobs` was applied. A follow-up migration `20261123150210_private_single_owner_no_billing` removed the unused customer billing tables and assigned the sole existing Auth account the admin role. The following platform tables remain:
- `provider_models`
- `model_routing_rules`
- `generation_jobs`
- `generation_provider_usage`
- `admin_audit_log`

The migration was committed to the development branch with a filename matching the applied remote migration version. No existing comic, character, role, or usage tables were recreated or renamed. Verification found one Auth account and one admin role assignment. Provider model registry is empty and ready for verified provider configuration.

## Phase 1 scope

1. Inspect current tables, columns, constraints, indexes, RLS policies, storage policies, and migration history.
2. Add an administrator role registry that does not trust user-editable Auth metadata.
3. Add a provider/model registry with capability metadata:
   - style and genre compatibility
   - supported resolutions and aspect ratios
   - reference-image input support and limits
   - single-image output support
   - policy/content eligibility flags
   - enabled state and routing priority
4. Add persistent generation jobs and provider usage telemetry.
5. Add model-routing rules and admin audit events.
6. Track provider API usage/cost optionally for personal visibility, with no customer billing.
8. Enable RLS on every new exposed public table and grant only the minimum required table/function permissions.
9. Add database tests for allowed and denied operations.
10. Verify migrations locally and against an isolated development database before any production deployment.

## Proposed additive data model

| Table | Purpose |
|---|---|
| `public.app_user_roles` | Server-managed user roles, including administrator |
| `public.provider_models` | Provider/model catalogue and capability metadata |
| `public.model_routing_rules` | Style/content/capability routing priorities |
| `public.generation_jobs` | Durable generation lifecycle and idempotency |
| `public.generation_usage` | Provider request IDs, actual usage, latency, and cost |
| `public.admin_audit_log` | Audit trail for model, pricing, and routing changes |

The initial additive columns, foreign keys, indexes, and policies are live. The customer billing tables were removed in the follow-up migration. Existing tables are reused where appropriate.

## Security rules

- Never use `raw_user_meta_data` / user-editable metadata for admin authorization.
- Store admin role assignments in a server-controlled source and deny users direct writes to role records.
- Enable RLS on every table in the exposed `public` schema.
- Give authenticated users access only to their own jobs, credit account, ledger, and usage-visible records.
- Keep the provider model catalogue readable to the authenticated owner; only the owner admin may modify it.
- Keep provider secrets server-side. Never add service-role or provider keys to Vite environment variables.
- Keep storage buckets private and validate ownership before issuing signed URLs.

## Migration workflow

The repository currently has no confirmed Supabase migration baseline. Once the linked project is active:

1. Inspect the remote schema and migration history.
2. Establish a reproducible local Supabase project and baseline migration.
3. Create the Phase 1 migration using `supabase migration new <descriptive_name>`.
4. Review grants and RLS policies together.
5. Run local reset and database tests.
6. Run Supabase security/performance advisors.
7. Apply to a dedicated development database first.
8. Only deploy to production after reviewing the migration diff and obtaining explicit approval.

Supabase CLI v3 changes remote-command behavior: hosted database changes require explicit remote targeting and confirmation. Never use a remote reset on production.

## Acceptance criteria

- No existing comic tables or storage buckets are recreated or renamed.
- Every new exposed table has RLS and explicit grants.
- Non-admin users cannot change models, pricing, routing, or role assignments.
- A user cannot read or alter another user's credits, ledger, or generation jobs.
- Concurrent reservations cannot overdraw an account.
- Duplicate callbacks cannot double-settle or double-refund a job.
- A provider failure releases the reservation exactly once.
- Model selection checks provider availability, content eligibility, reference support, and one-image output support.
- The existing one-page / one-image generation contract remains unchanged.

## Next implementation steps

1. Configure the verified provider model catalogue and capability metadata.
2. Implement server-side provider adapters and automatic/manual model routing.
3. Connect the existing character library to provider-specific reference inputs.
4. Add automated tests for owner-only access, RLS, provider failures, and job idempotency.
5. Add private settings and generation job status UI.

There is no customer billing, credit system, subscription flow, or payment integration. Provider usage/cost telemetry is optional and informational only. No provider credentials were added, no provider calls were made, and no frontend or production application deployment was performed.
