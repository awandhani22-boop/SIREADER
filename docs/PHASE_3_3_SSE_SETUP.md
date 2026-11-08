# SIREADER Phase 3.3 — Owner Setup and Acceptance

This runbook applies to branch **phase-3-3-sse-implementation** in both repositories.

## Important status

The migration file and code are prepared on isolated branches. **The migration has not been applied to the live Supabase project by this implementation work.** Do not grant write or trigger privileges to sireader_api_ro. The listener uses the existing read-only API database URL and a dedicated Psycopg connection only for LISTEN.

## Connection mode

The owner-reported local configuration uses the Supabase Session pooler on port 5432. This is the required session-preserving mode for a persistent LISTEN connection. Do not change it to Transaction pooler mode (commonly port 6543). Keep the connection string and all credentials local; never paste it into logs, chat, tickets, or the browser.

References:
- Supabase connection pooling: https://supabase.com/docs/guides/database/connecting-to-postgres
- PostgreSQL LISTEN: https://www.postgresql.org/docs/current/sql-listen.html
- PostgreSQL NOTIFY: https://www.postgresql.org/docs/current/sql-notify.html

## Migration procedure

1. Review the migration file 2026_11_09_observability_events.sql in the Python Backend branch.
2. Confirm the six source tables exist in the target database: runtime_control_state, ai_usage_logs, ai_analysis_logs, ai_pending_messages, trade_decision_watches, approval_decisions.
3. Use the approved database-owner / Supabase SQL Editor process to apply the migration. Do not use the sireader_api_ro runtime login.
4. Verify the twelve intended triggers (six row-level and six statement-level TRUNCATE triggers) and one trigger function exist. approval_decisions is INSERT-only at row level, plus TRUNCATE.
5. Confirm the function is not SECURITY DEFINER and uses a fixed search path. The NOTIFY payload must be one of the fixed keys: system, telemetry, pipeline, market_watches, or audit.
6. Do not alter or broaden the read-only role grants. The listener sets default_transaction_read_only=on and only issues LISTEN.

Example verification query (run as database owner, not copied into app code):

~~~~sql
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND t.tgname IN (
    'sireader_observability_notify',
    'sireader_observability_truncate'
  )
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
~~~~

Expected result: twelve trigger rows across the six source tables.

## Local service verification

1. Keep the Python API on 127.0.0.1:8000, BFF on the documented port, and Virtual Office on 127.0.0.1:3000. All services must bind only to loopback.
2. Start the Python API. The listener retries with bounded backoff if the pooler or migration is unavailable. Snapshot GET endpoints remain available regardless.
3. Open http://127.0.0.1:3000 and log in. EventSource is created only after the operator session is authenticated.
4. Chrome DevTools → Network → filter events/stream. Expected: same-origin GET, HTTP 200, text/event-stream, and no bearer token in the browser request. The __Host-sireader_sid cookie remains HttpOnly; do not copy its value.
5. Confirm event payloads contain only schema_version, occurred_at, and allowlisted resource names. The event means “refresh snapshot”, not “worker alive” or “task executing”.
6. Trigger a harmless test notification in a controlled environment with SELECT pg_notify('sireader_observability_v1', 'system'); and confirm only the System snapshot is fetched again. This validates the listener route, not the table trigger mapping; trigger mapping is covered by the disposable PostgreSQL integration test.
7. Do not mutate live trading, message, audit, or broker rows merely to test notifications. Verify all six trigger mappings in a disposable/staging database.

## Failure and security acceptance

- Stop/restart Python API: browser must full-refresh snapshots after stream reset/epoch change, then reconnect.
- Disconnect BFF or browser network: existing snapshot polling must continue at the normal 10s/30s cadence; after SSE reconnect, periodic snapshot reconciliation uses 60s.
- Remove/rollback migration in a controlled test DB: SSE becomes unavailable, but GET polling remains usable.
- Logout or session expiry: EventSource closes and private LIVE state clears; no reconnect without a new authenticated session.
- Simulation Step/Speed/Pause must not alter LIVE snapshots or event metadata.
- Verify queue overflow, replay gap, and subscriber cap behavior through automated tests; no manual live DB pressure test.
- Confirm no API role write grants, no browser bearer token, no secret in logs, no CORS expansion, no trading action.

## Rollback

Use migrations/2026_11_09_observability_events_rollback.sql through the same approved database-owner process. This removes only the SIREADER observability triggers and function. It does not change tables, rows, role grants, or the existing snapshot API.
