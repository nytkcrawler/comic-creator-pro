# Phase 1: Platform foundation

Status: implementation branch prepared; database migration is blocked pending access to the linked Supabase project.

## Repository baseline

- Repository: `nytkcrawler/comic-creator-pro`
- Base branch: `main`
- Working branch: `feat/comic-platform-foundation`
- Existing runtime: React 18 + Vite, Express, Supabase Auth/Postgres/Storage
- Existing providers: OpenAI, Venice, Replicate
- Existing page contract: one provider request returns one complete comic-page image; no per-panel generation or stitching
- Existing tables documented by the app: `public.comics`, `public.comic_pages`
- Existing private Storage buckets documented by the app: `comic-panels`, `character-refs`

## Current blocker

The linked Supabase project `comic-creator-pro` (region `ap-south-1`) currently reports `INACTIVE`. Read-only attempts to inspect its tables and migration history timed out / reported that the database is not accessible. No database schema has been changed.

Do not apply a migration until the project is active and the existing schema and migration history have been inspected. This avoids guessing existing columns, duplicating objects, or introducing a migration that cannot be replayed safely.

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
4. Add admin-managed model pricing, keeping provider cost separate from customer credit price.
5. Add credit accounts and an append-only credit ledger.
6. Add persistent generation jobs and provider usage records.
7. Add model-routing rules and admin audit events.
8. Enable RLS on every new exposed public table and grant only the minimum required table/function permissions.
9. Add database tests for allowed and denied operations.
10. Verify migrations locally and against an isolated development database before any production deployment.

## Proposed additive data model

| Table | Purpose |
|---|---|
| `public.app_user_roles` | Server-managed user roles, including administrator |
| `public.provider_models` | Provider/model catalogue and capability metadata |
| `public.model_pricing` | Versioned admin-controlled credit prices and provider cost assumptions |
| `public.model_routing_rules` | Style/content/capability routing priorities |
| `public.credit_accounts` | Per-user available and reserved credit balances |
| `public.credit_ledger` | Append-only reservations, charges, refunds, and adjustments |
| `public.generation_jobs` | Durable generation lifecycle and idempotency |
| `public.generation_usage` | Provider request IDs, actual usage, latency, and cost |
| `public.admin_audit_log` | Audit trail for model, pricing, and routing changes |

The exact columns, foreign keys, indexes, and policies will be finalized only after inspecting the live schema and current application queries.

## Security rules

- Never use `raw_user_meta_data` / user-editable metadata for admin authorization.
- Store admin role assignments in a server-controlled source and deny users direct writes to role records.
- Enable RLS on every table in the exposed `public` schema.
- Give authenticated users access only to their own jobs, credit account, ledger, and usage-visible records.
- Keep model catalogue and active customer pricing readable only as needed by authenticated users; only admins may modify them.
- Keep provider secrets server-side. Never add service-role or provider keys to Vite environment variables.
- Credit reservations and settlements must be atomic and idempotent. Client-supplied prices are never authoritative.
- Keep ledger entries immutable; use compensating refund/adjustment entries instead of editing history.
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

## Next action required

The Supabase project is paused/inactive. Restore or resume the linked `comic-creator-pro` project in the Supabase dashboard, then ask to continue. Once it is active, inspect the existing schema and create the first tested migration on this branch. No production database changes have been made.
