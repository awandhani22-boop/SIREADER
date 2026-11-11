# Phase 7.4 — Limited Worker Rollout Plan

**Latest status (2026-11-11): WORKER DB COMMAND LAYER + PG17 STAGING ACCEPTANCE PASS. PRODUCTION ROLLOUT NOT AUTHORIZED.**

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
