# Phase 7.4 — Limited Worker Rollout Plan

**Latest status (2026-11-12): WORKER/COMMAND/REVIEW/MAINTENANCE DB AUTHORITY + MANAGED-LIKE NON-SUPERUSER PG17 REHEARSAL + ACTUAL LOGIN/HTTP ACCEPTANCE PASS. HOSTED MANAGED-STAGING STEP SKIPPED BY OWNER; PRODUCTION CUTOVER NOT AUTHORIZED.**

## Current owner disposition — 2026-11-12

- The owner chose to skip the hosted Supabase development-branch / managed-equivalent staging step to avoid the quoted US$0.01344/hour compute charge. No branch was created and no recurring branch compute is running.
- This is an explicit SKIP/WAIVER, not a successful managed-Supabase staging result. Local PostgreSQL 17.11 managed-like acceptance remains valid only for the tested local restore and does not certify Supabase platform behavior.
- Production migration, hosted credentials, read-only API cutover, additional paid AI, worker activation, Telegram, MT5/HFM, trading, and v1.0 release remain unauthorized. The separate production backup/recovery, deployment-window, rollback-operator, credential and owner-signoff gates are still open.
- The Supabase organization uses the Free plan, which does not include automatic daily database backups or PITR. The existing 2026-11-11 custom-format PG17.11 dump (495,806 bytes; SHA-256 `FC83D455703EC0A66BC656EFCC82D6D9D6513AFFDCFF94C96C63CCEEE2A12333`; 872 TOC entries) passed archive-list verification on 2026-11-12 and was used for the local PG17.11 restore rehearsal. It is local-only, not off-site, and not a fresh pre-cutover snapshot.
- Before any production migration, create a fresh Supabase-aware manual roles/schema/data export, store a protected off-site copy, verify the archives, and perform an isolated restore rehearsal. Supabase's documented CLI export uses Docker and filters managed schemas; Docker and the CLI are not available as workstation PATH commands at present. Storage API objects and custom-role passwords require separate handling.
- Sanitized backend `.env` audit (2026-11-12): core `DATABASE_URL` targets the Supabase pooler with the `postgres`/admin identity and has no explicit `sslmode` parameter; read-only API uses the dedicated remote API identity with explicit SSL; Command still targets loopback `sireader_disposable`; Review, Maintenance and `WORKER_DATABASE_URL` are unset. AI pipeline, worker runtime, live provider and auto execution flags are all `False`. This is not a coherent hosted worker/command/review deployment topology; do not start the full stack or point Command at production until the intended identities/URLs and TLS policy have been reviewed.
- Do not weaken production guards or treat this decision as permission to apply migrations to the hosted project.

## 1. Verified technical result

- Global provider concurrency is hard-limited to **one in-flight request across all AI worker identities/processes**.
- PostgreSQL advisory transaction lock serializes the slot check. `PROVIDER_REQUESTED` and `UNKNOWN` occupy the slot; UNKNOWN has no TTL or automatic release.
- `mark_provider_requested` enforces the gate in the repository transaction; callers cannot bypass it by omitting a runtime-level helper.
- A blocked pre-dispatch reservation releases its Cost Guard reservation as definitely-not-charged and does not send the paid Messages request.
- Gate function is SECURITY DEFINER, owned by non-login `sireader_view_owner`. The tested function grants EXECUTE to the test runtime login and denies the Command API role, read-only API role, and PUBLIC.
- The test migration and rollback deliberately require `current_database() = 'sireader_test'`. They are **test-only artifacts**, not production/Supabase deployment migrations.

## 2. Evidence

- Disposable EDB PostgreSQL 18.6 `sireader_test`, bound only to `127.0.0.1:55442`.
- PostgreSQL integration modules: **24 passed, 0 skipped, 0 failed**. Covered migration idempotency, rollback/forward, function owner/ACL, RLS, UNKNOWN quarantine, and two distinct worker identities racing for one slot (exactly one winner).
- Full backend root suite: **675 passed, 0 skipped, 0 failed**.
- Backend `compileall`: PASS.
- Frontend: **422 passed, 0 failed**; TypeScript check PASS; Vite production build PASS.
- Known non-blocking warnings: Starlette/httpx deprecation; React test `act(...)` notices; Three.js CommonJS deprecation; Vite main JS bundle 1,511.12 kB minified / 405.35 kB gzip.

## 3. Current machine / configuration facts (sanitized)

- Persistent runtime remains AI pipeline OFF, worker runtime OFF, provider MOCK, live provider OFF, per-task USD cap 0, daily USD cap 0, monthly ceiling USD 5.00, trading DRY_RUN, auto execution OFF.
- Backend `DATABASE_URL` is configured for database `postgres` through a remote/pooler host, using a `postgres.<project-ref>`-style identity. No secret, host name, or project reference is reproduced here.
- `SIREADER_WORKFORCE_COMMAND_DATABASE_URL` is configured for local database `sireader_disposable` on loopback with the dedicated `sireader_workforce_cmd` identity.
- The local diagnostics script currently reports all five documented application ports absent: 3000 (Vite), 3001 (BFF), 8000 (read-only API), 8010 (Command API), and 5432 (local PostgreSQL).
- No services were started during this check. The temporary PostgreSQL 18.6 test server was stopped, port 55442 closed, and its archive, binary files, and cluster data removed.

## 4. What is not yet verified / safe to activate

1. The global provider gate migration tested in Phase 7.4 is intentionally restricted to `sireader_test`; it rejects the current worker database name `postgres`. It must not be weakened or applied to Supabase as-is.
2. No production-capable migration for the remote worker database has been reviewed or deployed. Production schema, existing roles, grants, RLS policies, backup/recovery posture, and rollback behavior have not been re-queried or changed in this verification.
3. The existing worker `DATABASE_URL` uses a pooler-style postgres identity. A production rollout needs an explicitly reviewed least-privilege worker database identity and an independently reviewed migration/grant boundary; do not simply reuse a broad database owner identity.
4. Local services are currently stopped. The read-only API's configured database target is remote while the Command API target is local; reconcile the intended topology before starting the complete local stack. Do not start it merely to test the new provider gate.
5. The one-request Phase 7.3 Haiku authorization has been consumed. It does not authorize any further paid request or a continuously running worker.

## 5. Required sequence before limited LIVE rollout

1. Sonnet architecture/security review of a **separate production/staging migration design**: target allowlist, dedicated worker role, minimum grants, SECURITY DEFINER owner, RLS, audit, and rollback. Keep the test-only migration guard intact.
2. Prepare an isolated staging clone with the required schema/roles/extensions. Apply and rollback the proposed migration there; repeat privilege and two-worker concurrency tests. No connection to production for this stage.
3. Review backup/recovery and change window for the real target. Applying a Supabase/production migration requires a separate explicit owner approval and must not be bundled with this technical test.
4. Obtain a new explicit authorization for a bounded LIVE run naming worker/model, exact task/request count, benign synthetic input, per-task/daily/monthly USD limits, hard-stop behavior, and operating window. The previous single Haiku approval is already spent.
5. Run only the approved one-worker finite canary, reconcile Cost Guard and provider usage, verify human-review/audit state, then stop and confirm no worker process remains.
6. Obtain owner operational/browser acceptance and release sign-off before changing the official v1.0 status.

## 6. Cost and safety boundary

Carry forward **USD 0.000042** as manual price-based reconciliation for the previous one-shot Haiku canary; it was not an independently reported provider invoice amount. No further provider request, worker activation, Supabase mutation, Telegram action, MT5/HFM action, or trading operation occurred in this update.

**Conclusion:** Phase 7.4 code and disposable-PostgreSQL technical acceptance are complete. Limited LIVE rollout remains **BLOCKED by production migration/role readiness and explicit authorization**, not by the local integration test. Supabase production cutover is separate. **SIREADER Virtual Office v1.0 remains NOT RELEASED.**


## Final worker DB connection guard and full-suite result — 2026-11-11

The worker runtime now has a dedicated database session boundary. A remote core `DATABASE_URL` is never used as a worker fallback, even in MOCK mode. MOCK fallback is allowed only for live-provider-OFF and explicit loopback disposable/test DB targets. Other worker modes require `WORKER_DATABASE_URL` with `sireader_worker_runtime` direct/pooler identity, remote TLS, explicit database, and no libpq target overrides.

Final tests: 42 focused worker DB/runtime tests passed; full backend with disposable PostgreSQL 16.6 **702 passed, 1 skipped, 0 failed**. Cluster shut down and removed, port 55448 closed. No additional paid model request or LIVE worker was run. Production worker role and migration remain unimplemented pending separate writer/RLS/maintenance/review design and approvals.


## 2026-11-11 — worker maintenance separation update

- Removed lease recovery, deadline expiry, stale-review expiry, and task/review payload purging from the normal worker polling path.
- Ordinary worker runtime no longer imports those maintenance repository functions; a regression test enforces this boundary.
- Maintenance remains a separate one-shot command with its existing local-only database identity guard. A production maintenance identity and database-enforced bounded operations are still NOT designed/approved/deployed.
- Verification after this code change: focused runtime/review suite 60 passed, 17 skipped. The previous full PostgreSQL 16 run (702 passed, 1 skipped) predates this change; it is not claimed as a post-change full-suite result. No PostgreSQL server binaries/service were available for a fresh full DB-backed run during this update.
- Release remains BLOCKED: production worker role/migration, production maintenance role, database-enforced lease/transition/review release boundary, staging rehearsal, recovery approval and limited rollout remain open. No Supabase LIVE, paid AI, Telegram, MT5/HFM or trading actions performed.


## Post-separation verification update — 2026-11-11

After removing the obsolete runtime fixture dependency on `_last_maintenance_at`, the full backend test suite was rerun without a PostgreSQL test service configured: **657 passed, 47 skipped, 0 failed**. The skipped tests include database-backed PostgreSQL integration/migration/security checks because `SIREADER_TEST_POSTGRES_URL` was intentionally unset and no local PostgreSQL service/binaries were available. Python compileall and `git diff --check` both passed. This is not a substitute for the PG16/PG17 migration, ACL, RLS, concurrency, and rollback rehearsal.


## Static writer-security review deliverable — 2026-11-11

Added backend/docs/PRODUCTION_WORKER_WRITER_SECURITY_REVIEW_2026-11-11.md. It records the ORM operation inventory, least-privilege role separation, staging negative-test matrix, and critical findings: direct ORM writes are not yet a production writer contract; the current normal-result trigger alone does not bind publication to the prior task lease/attempt; review inserts need a transaction-scoped completion proof; a shared worker DB login cannot independently attest per-worker identity; and activity-event actor integrity needs DB enforcement. These are design blockers, not production changes. Do not provision the worker role or deploy writer SQL until these are remediated and staging-tested.


## Worker DB command contract — 2026-11-11

Added backend/docs/WORKER_DATABASE_COMMAND_CONTRACT_V1_2026-11-11.md. This is the target API/role/migration/acceptance contract for replacing direct ORM mutations with narrow database functions. It defines separate worker runtime, maintenance, command API, review operator, read-only API and NOLOGIN view-owner authorities, including transaction-scoped lease/attempt validation and result quarantine/release. It is design-only, not executable SQL. Independent security review is still required before migration authoring.

Staging tooling check: Docker, Podman, PostgreSQL server/client binaries (postgres, initdb, pg_ctl, psql), and Supabase CLI were not found on the workstation during this continuation. Therefore a PG17 staging environment and DB-backed ACL/RLS/concurrency/rollback rehearsal cannot be honestly claimed. Production stays untouched and LIVE remains blocked.


## Superseding PG17 read-only staging rehearsal — 2026-11-11

Post-separation verification is now complete on a local PostgreSQL 17.11 user-space cluster. The core production backup schemas were restored, four production read-model/security-barrier migration drafts applied, the API read-only startup audit passed for all 14 approved views, 24/24 base tables had RLS enabled, 14 authenticated API endpoint probes returned 200, unauthenticated access returned 401, and the explicit SelectorEventLoop SSE listener check passed. The separate PostgreSQL 17.11 privilege suite passed 23/23. Full backend suite: 657 passed, 47 skipped. Virtual Office: 422 tests passed, TypeScript and production build passed; the build has a non-blocking large-chunk warning.

See `backend/docs/SIREADER_PG17_STAGING_REHEARSAL_2026-11-11.md`. This supersedes the earlier statement that fresh PG17 staging was unavailable. It is read-model/API acceptance only: the production worker writer, maintenance/command/review identities, lease/attempt-bound result release, ORM adapter conversion, and production approvals remain open. No production writer role, migration, or LIVE execution is authorized. **Phase 7.4 production rollout BLOCKED; v1.0 NOT RELEASED.**

## Latest worker database command-boundary extension ? 2026-11-11

The Phase 7.4 staging scope now includes the database command layer, in addition to the global provider-slot gate:

- The eight worker command functions are installed and tested on the isolated PostgreSQL 17.11 sireader_stage restore. This is separate from the earlier PostgreSQL 18.6 sireader_test provider-gate race/ACL suite.
- Seven worker permission identities are separate NOLOGIN/NOINHERIT roles. Workers have no direct workforce base-table privileges; command functions enforce authenticated worker identity, instance, attempt and unexpired lease.
- Provider reservation remains globally serialized; UNKNOWN outcomes stay quarantined. Completion/review quarantine, result-release provenance and activity actor integrity are database-enforced in the staging SQL.
- The Python runtime now uses app.workers.database_commands for worker lifecycle mutations. The SQL acceptance transaction and Python adapter smoke test used synthetic tasks and rolled them back.
- Staging outputs: STAGING_WORKER_COMMAND_LAYER_TESTS_PASS and PYTHON_DATABASE_COMMAND_ADAPTER_PG17_PASS. Worker database/runtime targeted regression: 52 passed. Provider credential-boundary suite: 62 passed.
- Final backend full suite after provider credential-boundary hardening: **670 passed, 47 skipped**; Python compileall passed. The 47 skipped cases require the separately configured PostgreSQL test URL. Separate PG17 staging integration tests passed as described in the backend acceptance report.
- Virtual Office: **422 passed**; TypeScript check and production build passed. The existing large-bundle warning remains non-blocking.

**Current decision:** Phase 7.4 code and local/disposable PostgreSQL technical acceptance are PASS. This does not provision production logins, approve a Supabase migration, or authorize another paid request. Production maintenance/command/review identities and the production-specific migration/rollback plan still need independent security review and a separate staging rehearsal. Limited LIVE rollout remains blocked pending explicit owner authorization. Virtual Office v1.0 remains NOT RELEASED.


## Superseding security review and staging closeout — 2026-11-11

The Phase 7.4 local worker command boundary has completed a second-pass security review and remediation on isolated PostgreSQL 17.11 staging. This supersedes prior notes above that described the worker command SQL as awaiting static review, but does not remove the production deployment gates.

Security fixes exercised in PG17 staging:
- Trading-related task capabilities are denied at the database provider-reservation boundary, even for an otherwise approved AI worker.
- LIVE completion requires an existing provider reservation/request ID, an approved AI worker identity and USD billing fields; unreserved completion cannot claim LIVE provenance or provider billing.
- Worker policy version, reason/action consistency, redaction count and fixed worker model tier are validated by the database function.
- Truncated LIVE output is automatically quarantined for human review with OUTPUT_TRUNCATED_REVIEW audit reason.
- Retention trigger authorization uses session_user rather than SECURITY DEFINER current_user.
- Python and PostgreSQL review policy match for 40 catalogue rules, 56 capability/task pairs and 1,120 deterministic comparisons; unknown capabilities fail closed.

Final local evidence:
- PG17.11 sireader_stage, loopback 127.0.0.1:55439, TLS 1.3; full local backup taken before staging SQL update.
- Worker SQL acceptance transaction passed and rolled back; Python adapter integration passed and rolled back; 7 adapter unit tests passed.
- Effective privilege audit: 7 worker permission roles NOLOGIN/NOINHERIT with no role memberships and no direct workforce base-table grants; 9 workforce base tables RLS-enabled; 18 private-schema functions owned by the NOLOGIN function owner; SECURITY DEFINER functions fixed to search_path=pg_catalog; no PUBLIC EXECUTE; provider-reservation EXECUTE only for Haiku/Sonnet/Opus.
- Backend 670 passed / 47 skipped; Virtual Office 422 passed; TypeScript and production build passed. The 47 skipped root tests remain environment-gated; the explicit PG17 command SQL, policy parity and adapter checks passed separately.
- Staging was stopped after testing, port 55439 verified closed and temporary HBA configuration removed.

Full findings and trust-boundary qualifications: [Worker Database Security Review](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/WORKER_DATABASE_SECURITY_REVIEW_CLOSEOUT_2026-11-11.md) and [Worker Database Staging Acceptance](https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/WORKER_DATABASE_COMMAND_LAYER_STAGING_ACCEPTANCE_2026-11-11.md).

**Production release gates remain OPEN/BLOCKED:** production-specific forward/rollback migration, worker LOGIN/pooler identities, bounded maintenance procedures, separate Command API and review-operator database functions, hosted-Supabase-equivalent staging, backup/restore and rollback approval, read-only API target reconciliation, and fresh explicit authorization for any additional LIVE worker/provider request. The previous one-request Haiku approval is consumed. Runtime remains OFF/MOCK, live provider OFF, WORKER_DATABASE_URL unset, spending caps zero and trading DRY_RUN. No production DDL or credentials were created. **Limited LIVE rollout remains NOT AUTHORIZED; v1.0 remains NOT RELEASED.**



## Restored production-backup migration rehearsal update — 2026-11-11

A clean PostgreSQL 17.11 restore of the locally held Supabase custom-format backup passed the four workforce/read-model/security-barrier baseline migrations followed by the new authority migration. The forward migration and guarded authority-only rollback were both tested; the same forward migration then applied successfully again. The rollback preserves workforce schema/RLS tables and read-only views and intentionally refuses to run after operational workforce data exists.

The Python database role validators were exercised using actual local LOGIN identities for Command, Review and Maintenance. The Command API uses its role-specific SQL function surface; the review route uses a separate review DB pool; maintenance uses its dedicated DB function and database clock. Role secrets were not written or committed.

This closes the local production-migration design/rehearsal work in Phase 7.4. It does not close hosted Supabase deployment: the hosted target still has no workforce schema/roles, and it has not received the new migrations or secrets. Managed-Supabase-equivalent staging, verified hosted restore point, deployment window/rollback operator, monitoring, role secret provisioning, fresh paid-LIVE authorization and final v1.0 owner acceptance remain blocked. Do not start a worker or perform hosted DDL from this local rehearsal.

Evidence: https://github.com/awandhani22-boop/SIREADER-Python-Backend/blob/phase-5-implementation/docs/PHASE_7_4_PRODUCTION_MIGRATION_REHEARSAL_2026-11-11.md



## Managed-role and actual-LOGIN HTTP continuation — 2026-11-12

This continuation supersedes the earlier rehearsal wording where the first local PG17 test used a superuser identity. The final authority migration was reapplied successfully on a clean restore using a separate **NOSUPERUSER** migration operator with only the managed-like CREATEROLE/CREATEDB/BYPASSRLS capabilities. Hosted Supabase remained read-only and unchanged.

### Migration and permission evidence

- The four previously-applied hosted migration SQL files were restored exactly from the hosted `supabase_migrations.schema_migrations` ledger into `supabase/migrations`. The five Phase 7 workforce/security migrations follow them in local version order. No historic migration was applied to hosted again.
- Supabase CLI 3.1.0 generated the authority migration filename; `supabase init` generated a local `config.toml`. No project link, password, or secret was written.
- The final authority migration passed on local PG17.11 as a LOGIN operator with `NOSUPERUSER`, `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, mirroring the inspected Supabase `postgres` role shape.
- Effective permission matrix: all seven worker identities have all seven lifecycle functions; provider-slot reservation is EXECUTE only for Haiku/Sonnet/Opus; Command has four functions; Review has two; Maintenance has one.
- Final audit after COMMIT: zero PUBLIC EXECUTE on the private schema; zero direct workforce base-table privileges on worker/command/review/maintenance runtime LOGINs; nine workforce tables with RLS; fourteen API views with `security_barrier=true`; function owner retains USAGE but not CREATE on its private schema.
- The ten runtime LOGIN roles do not inherit membership in other roles. PostgreSQL CREATEROLE leaves the migration operator's creator ADMIN membership on the NOLOGIN function-owner role; the migration explicitly removes its temporary SET edge and final verification reports `set_option=false`, `inherit_option=false`. It therefore cannot SET ROLE or inherit function-owner privileges after migration.

### Runtime acceptance

- SQL worker acceptance: `STAGING_WORKER_COMMAND_LAYER_TESTS_PASS`.
- SQL operator/review/maintenance acceptance: `STAGING_OPERATOR_REVIEW_MAINTENANCE_COMMAND_LAYER_TESTS_PASS`.
- Actual PostgreSQL LOGIN startup/adapter/maintenance test: `REAL_LOGIN_COMMAND_REVIEW_MAINTENANCE_PG17_PASS`.
- Actual LOGIN FastAPI HTTP test: `REAL_LOGIN_FASTAPI_COMMAND_REVIEW_PG17_PASS`. Enqueue, idempotent replay, cancel, worker pause/resume and review approval were exercised through HTTP with distinct Command and Review logins. An intentionally untrusted `X-Operator-Id` header did not override the actor recorded from the Review database identity.
- Synthetic review fixtures were rejected/expired/purged through the authenticated Review and Maintenance function boundaries. No retention trigger was bypassed.

### Latest regression

- Backend: **327 passed, 47 skipped, 0 failed**. The 47 skips require the separate `SIREADER_TEST_POSTGRES_URL`; explicit PG17 SQL and actual-LOGIN acceptance ran separately.
- Virtual Office: **422 passed, 0 failed**; TypeScript/lint passed; production build passed.
- Non-blocking warnings: Starlette/httpx TestClient deprecation, React `act(...)` notices, Three.js CommonJS deprecation, Vite JS bundle 1,511.12 kB minified / 405.35 kB gzip.

### Local CLI and hosted-platform boundary

- The historical hosted migration ledger was reconciled into the local repo. CLI 3.1.0 `migration list --remote=<project-ref>` could not connect from this workstation because its current network does not support IPv6 and the CLI requires an explicit pooler URL for IPv4. The ledger itself was read and verified through the Supabase database connection.
- Supabase CLI local configuration is initialized. No hosted `db push`, `db pull`, migration, role, credential, or setting change was run.
- Supabase development branches have not been created. The branch compute quote is **US$0.01344/hour**; provisioning requires a separate explicit cost confirmation. No branch compute is currently running.

**Current disposition:** Phase 7.4 implementation, SQL, Python adapters, managed-like non-superuser migration/rollback rehearsal, actual LOGIN and HTTP acceptance are locally complete. Hosted Supabase equivalent-staging and deployment remain not authorized. No password was provisioned, no paid provider request or worker was activated, and v1.0 remains NOT RELEASED.
