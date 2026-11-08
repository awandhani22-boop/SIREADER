# SIREADER Phase 5–6 — Operations, Governance, Security & Release Readiness

**Status:** PREPARATORY ARCHITECTURE BASELINE — Phases 5.1–6.3 have not started  
**Dependency order:** Phase 4.1 -> 4.2 -> 4.3 -> 4.4 must pass before Phase 5; Phase 5 must pass before Phase 6 release hardening.  
**Non-negotiable:** no MT5 order operations, SL/TP changes, or trading approval bypass.

---

## Phase 5.1 — Human-Supervised Worker and Task Operations

### Purpose
Provide narrow, auditable operations for managing non-trading AI work after the worker runtime and persistent task model exist.

### Command envelope
Every command uses a versioned request:
- command_id (UUID)
- command_type (closed enum)
- target task/worker/attempt ID
- authenticated actor and role from server session, never caller-supplied identity
- idempotency key
- correlation_id
- issued_at and bounded expiry
- expected current state/version to prevent stale commands
- a reason code or bounded operator note where required

Commands are authenticated at BFF and API, authorized against explicit capability/role, validated against current backend state, and committed with an audit event. Use CSRF protection for cookie-authenticated browser commands.

### Initial allowed command candidates
- Enqueue a policy-approved non-trading task.
- Pause/drain an eligible worker from accepting new tasks.
- Resume an eligible worker.
- Request safe task cancellation.
- Request retry only where attempt history, idempotency and billing state prove it safe.

The backend is authoritative. UI command states are REQUESTED, ACCEPTED, REJECTED, RUNNING, COMPLETED or FAILED as distinct outcomes; a click is not evidence of success.

### Safety and acceptance
- No task command may make or modify a trading order or bypass manual approval.
- Every command validates current state and expected version.
- Duplicate command IDs/idempotency keys do not execute twice.
- Unauthorized/replayed/expired commands are rejected.
- Pause/drain prevents new claims but does not silently kill active work.
- Cancellation is cooperative and only terminal after acknowledgement or lease-expiry proof.
- Command outcome and actor are reconstructable from append-only audit.
- DEMO controls remain local simulation only and never call LIVE command APIs.

## Phase 5.2 — Review, Audit, Budgets & Governance

### Governance model
Separate:
1. approval of AI-generated work output;
2. permission to execute an operational task;
3. the existing trading-signal/manual-approval workflow.

These are not interchangeable.

### Required capabilities
- Human review states such as NOT_REQUIRED, PENDING_REVIEW, APPROVED, REJECTED, CHANGES_REQUESTED.
- Reviewer identity from authenticated session and explicit authorization policy.
- Append-only audit events for task lifecycle, review, provider routing, budget reservation/finalization, retry, escalation and operator commands.
- Correlation IDs link task -> attempts -> provider requests -> result -> review -> audit.
- Budget dashboard sourced from backend accounting only, with currency kept separate.
- Configurable soft/hard limits, threshold alerts, per-task caps, provider/model allowlists and escalation rules.
- Manual intervention path for UNKNOWN billing, stuck leases, policy conflicts or sensitive tasks.
- Retention/export policy for audit data and access logs.

### Acceptance
- Full task lifecycle is reconstructable.
- Review/approval decisions are immutable or append-only and include actor/reason/time.
- Unauthorized reviewers and self-approval conflicts follow explicit policy.
- Budget limits prevent disallowed provider calls under concurrent load.
- Currency separation and reserved-vs-actual values are clear.
- Sensitive inputs/results are redacted from general operator views.
- Existing trading approval remains independent and unchanged.

## Phase 6.1 — Security, Reliability & Failure Recovery

### Required reviews
- Threat model across browser, BFF, Python API, workers, database, Supabase, providers and external Telegram/market sources.
- Least privilege for operator, API read-only role, migration role, worker runtime and provider clients.
- Secret rotation and local configuration workflow; secrets never printed, bundled or stored in browser storage.
- Dependency/vulnerability review and pinned reproducible builds.
- Input/output validation, sensitive data redaction, safe logging, rate/connection/resource limits.
- CSRF/session expiry, replay protection, authentication lockout and authorization tests.
- Backup/restore, database migration rollback, incident runbook and recovery drills.
- Loopback-only local topology remains default; remote/multi-user deployment requires a separate design.

### Failure policy
- Fail closed when auth, schema, DB role or provider pricing cannot be verified.
- Preserve UNKNOWN billing as uncertain; never blindly retry a possibly paid provider request.
- Show STALE/OFFLINE/ERROR explicitly; never silently fall back to simulated LIVE.
- Startup health is not equivalent to task/worker health.
- Use bounded retries/backoff and avoid restart loops/resource amplification.

### Acceptance
No unresolved Critical/High security issue; credential rotation exercised; restore/recovery tested; failure states validated; no accidental trading control route exists.

## Phase 6.2 — 3D Asset, Performance & Scale Readiness

### Asset policy
- Replace procedural placeholders only with sourced/licensed GLB/glTF assets.
- Record asset author/source, license, attribution, download date, file checksum and allowed usage.
- Inspect polygon/texture budgets, skeleton/rig compatibility, animation clips, material count and fallback.
- Maintain procedural safe fallback if asset fails to load.
- Do not bundle assets from unclear licensing or use a human/brand identity without authorization.

### Performance and scale
Measure real target hardware/browser before optimization:
- scene startup/load duration;
- frame-time percentiles (p50/p95/p99) and dropped frames;
- JS heap/GPU memory where observable;
- draw calls, triangles, texture memory and animation cost;
- worker interaction latency at 7, 50 and 100 data-driven worker entities;
- task panel/queue performance with representative histories.

Optimize based on measurements (instancing, LOD, texture compression, batching, lazy loading, shadow limits, animation throttling, disposal). Avoid per-frame Zustand writes. Preserve reduced-motion and lower-graphics support.

### Acceptance
- No uncontrolled per-worker JSX growth.
- 50-worker scene and 100-worker data model benchmarks are documented.
- No critical console/WebGL errors or resource leaks during repeated open/close.
- Asset licensing/credits are complete.
- Agreed target-device performance budgets are met.

## Phase 6.3 — Packaging, Deployment & Release Acceptance

### Delivery model
Local single-operator deployment is the initial supported topology. Remote/multi-user hosting is out-of-scope until an explicit auth/network/threat model is approved.

### Required release artifacts
- Reproducible clean-install runbook and pinned dependencies.
- Configuration template with placeholders only; no secret sample values.
- Startup/shutdown/update/rollback/backup/restore instructions.
- Health diagnostics with separate API, database, worker process, task, provider and event-stream status.
- Versioned release notes, migration plan, known limitations and support/incident guide.
- Verified desktop browser compatibility and accessibility basics.
- Signed/checksummed release artifacts where feasible.

### Release acceptance
- Fresh clean environment installs and starts from the runbook.
- All backend/frontend automated suites pass on release commit.
- PostgreSQL migrations apply/rollback on disposable DB; production DB changes are explicitly owner-controlled.
- Browser login/session/CSRF/logout passes.
- LIVE and DEMO isolation passes.
- SSE reconnect/fallback passes.
- Worker/task/provider/budget/audit lifecycle is end-to-end verifiable.
- Security review has no critical/high unresolved issue.
- 7/50/100 scale and asset evidence recorded.
- No trading order or approval bypass capability.
- PROJECT_STATE records exact release commit, environment, evidence and known limitations.

## Final v1.0 gate

SIREADER Virtual Office v1.0 means a secure, installable, genuinely operational AI workforce product—not a finished 3D demo or green frontend build. All source-of-truth, worker, provider, budget, persistence, governance, security, reliability and packaging gates must pass. A deferred requirement must be explicitly scoped out with owner approval and documented in the roadmap; never silently mark it complete.
