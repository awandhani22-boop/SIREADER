# Phase 6.1 — Personal Security & Reliability

**Status: COMPLETE for the local single-user scope.**
**Date:** 2026-11-10

## Scope decision

SIREADER Virtual Office is a personal workstation application. Phase 6.1 therefore keeps practical protections against accidental exposure, bad requests, credential leakage, data mistakes, and avoidable downtime. It does not require enterprise compliance, public-hosting controls, multi-user identity infrastructure, or a complex monitoring stack.

## Personal-use security baseline

| Area | Accepted baseline | Verification |
|---|---|---|
| Network exposure | Vite, BFF, Python APIs and PostgreSQL bind to 127.0.0.1 only | Local port diagnostic; BFF/Vite config and security tests |
| Browser access | Operator session for mutations; CSRF and same-origin checks | BFF auth/session tests |
| Service credentials | API and command tokens remain server-side; separate read-only and command paths | BFF proxy tests; no credential values copied to browser or docs |
| Database access | Read-only API role separated from limited command role; non-trading RLS allowlist | PostgreSQL privilege tests and prior Phase 5 isolated-PostgreSQL replay |
| Input and output | Strict DTO validation, bounded request/response sizes, safe log formatting | BFF, API and command contract tests |
| Failure behavior | Session loss, timeout, stale/offline and schema errors are explicit; no silent LIVE/SIMULATED conversion | API poller/SSE/repository tests |
| Recovery | Backup/restore process documented; synthetic restore rehearsal completed | Temporary PostgreSQL 16.6 cluster drill |
| Dependencies | Frontend and Python package vulnerabilities reviewed | Bun audit, pip-audit, pip check |

## Findings fixed

1. The BFF review-detail path allowlist now admits only valid GET review-detail paths under workforce and governance. Malformed IDs and wrong methods remain rejected.
2. Standard browser response headers are applied: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, and a restrictive Permissions-Policy for camera, microphone and geolocation.
3. The Python test dependency was raised from the affected pytest 8 range to pytest>=9.0.3,<10.0; the active test environment uses pytest 9.2.0.
4. The local diagnostic script scripts/check-local.ps1 verifies loopback listeners and the UI response without starting/stopping services or reading secrets.

## Recovery and credential drills

- A synthetic PostgreSQL 16.6 custom-format backup was restored into a separate empty test database. Representative task, worker and API-view counts matched. This did not back up or restore the user's application database.
- Test-only operator password rotation verifies that the old password is rejected, the new password is accepted, and prior in-memory sessions are invalidated.
- Test-only read API and command token rotation checks verify separation and fail-closed behavior. No real .env secret or local API token was rotated.
- A written local backup/restore procedure is available in docs/LOCAL_INSTALL_AND_OPERATIONS.md. The application database has not been backed up or restored as part of Phase 6.

## Deliberate deferrals for a private workstation

- A strict Content-Security-Policy is deferred. The app currently loads Google Fonts and uses Three.js/WebGL plus SSE; a restrictive policy is not needed for loopback-only personal use and could break rendering. The four response headers above remain enabled.
- Real credential rotation is an owner-controlled operation and is not performed unless a credential is suspected compromised or the owner requests it.
- No public/LAN exposure, remote login, multi-user role model, enterprise monitoring, compliance process, or high-availability topology is supported.
- The synthetic restore drill and runbook are sufficient for the current personal-use phase; automated encrypted off-device backups and a formal retention service are not introduced.

## Verification — 2026-11-10

| Check | Result |
|---|---|
| Frontend dependency audit | 316 packages checked; no known vulnerabilities reported |
| Python dependency audit | No known vulnerabilities after pytest update |
| Python package consistency | pip check clean |
| Frontend full test command | 422 tests: 421 passed, 0 failed, 1 skipped |
| Port-owning listener test | Skipped because the active BFF already owned 127.0.0.1:3001; no service was stopped |
| Backend local suite (without disposable PostgreSQL URL) | 185 passed, 44 skipped |
| Prior full backend suite on temporary PostgreSQL 16.6 | 229 passed, 0 failed, 0 skipped |
| TypeScript | bun run lint passed |
| Production build | bun run build passed; existing large-chunk warning remains |
| Local diagnostics | Ports 3000, 3001, 8000, 8010, 5432 listening on loopback; UI HTTP 200 |
| Synthetic backup/restore | Passed on temporary PostgreSQL, separate from application DB |

The Node test run also reports existing React act(...) test warnings and a Three.js CommonJS deprecation warning. They do not fail tests or builds.

## Exit decision

Phase 6.1 is accepted as complete for private, local, single-user use. The deferred enterprise and public-deployment controls are explicitly out of scope, not silently left as blockers. The app remains loopback-only and the protections listed above remain required.
