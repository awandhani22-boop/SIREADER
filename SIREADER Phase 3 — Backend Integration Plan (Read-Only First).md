# **SIREADER Phase 3 — Backend Integration Plan (Read-Only First)** 

Planning only. Repo <mark>awandhani22-boop/SIREADER</mark> , branch <mark>phase-2-2-task-dispatcher</mark> @ <mark>a2efb076ce13db56f716963c2dadb9d1c00c2704</mark> . No source file was changed. 

**Labels used: [F]** fact found in the repo · **[A]** assumption · **[D]** proposed architecture decision · **[U]** unknown / needs input. 

**What I read:** <mark>CORE_RULES_COMPACT.md</mark> ; <mark>AI_RULES.md</mark> (first 60 lines, long lines truncated); skill 01 (first 45 lines) and skill 09 (full); <mark>package.json</mark> , <mark>vite.confg.ts</mark> i , <mark>.env.example</mark> , <mark>metadata.json</mark> ; <mark>src/</mark> file tree; <mark>worker.types.ts</mark> , <mark>task.types.ts</mark> (ids/status unions); <mark>worker.state.ts</mark> store interface; <mark>OfceApp.tsx</mark> fi tick loop. **Not re-read this session:** <mark>docs/PROJECT_STATE.md</mark> and <mark>docs/PHASE_2_2_FINAL_AUDIT.md</mark> as updated at <mark>a2efb07</mark> (I read the previous versions at <mark>cf1083d</mark> ). I did not run tests/build. 

## **1. Executive Summary** 

- **[F] The Python backend is not available.** No <mark>.py</mark> , OpenAPI, route, schema, or backend folder exists in this repo or the workspace. **The backend contract cannot be verified.** This plan invents no URL, endpoint, schema, event name, or auth mechanism. 

- **[D] Add a separate backend state slice and an integration layer (** **<mark>src/integration/</mark> ).** Never merge backend data into <mark>SimulationSnapshot</mark> . Simulation and backend are mutually exclusive data sources chosen by an explicit <mark>dataSource</mark> mode. 

- **[D] Read-only by construction:** the repository interface exposes only <mark>get*/subscribe*</mark> . No mutating method exists until a separately authorized phase. 

- **[D] Everything not needing the real backend (types, validators, mappers, mock adapter, resequencer, state machine, UI states) is built against a mock adapter.** Real-backend work starts only after Phase 3.0 freezes the contract. 

- **Smallest safe start:** Phase 3.0 (documents only), with Phase 3.1a (contract-independent primitives, zero network/UI) allowed in parallel. 

## **2. Phase 2.2 Baseline and Reusable Architecture** 

#### **Reusable [F]** 

- <mark>WorkerId = PermanentWorkerId | (string & {})</mark> is an open type, so unknown backend worker ids can be carried without crashing. 

- Normalized <mark>workers/tasks</mark> maps keyed by id; worker status union (8 values) and task lifecycle union (9 values) exist. 

- <mark>normalizeSimulationSnapshot</mark> shows the reference-preserving normalization pattern to copy for backend ingestion. 

- Per-worker store subscriptions in roster and scene (render isolation already tested). 

- <mark>WORKSTATION_REGISTRY</mark> (config-driven placement): adding a worker is a config entry. 

- Test harness for UI interaction (minimal DOM + <mark>invokeReactProp</mark> + React 19 <mark>act</mark> ); 256 tests / 13 files (owner-reported). 

#### **Must not be reused for backend data [F]** 

- Engine tick loop, seeded PRNG, <mark>src/scheduler/</mark> dispatch (canonical for the local demo only; skill 09 says it is not the Python source of truth), <mark>WorkerMockService</mark> , demo generator, <mark>tsk_pool_</mark> ids, <mark>simulatedTokens/costPerThousandTokensUsd/totalDurationSimMs/stagePipeline</mark> fields. 

## **3. Current Frontend Architecture Audit** 

|Finding|Type|Consequence for Phase 3|
|---|---|---|
|One Zustand store<br>useOfficeStorewhose root<br>**is**<br>SimulationSnapshot(sim + UI + camera +<br>queue-drawer state mixed)|F|Do not extend it with backend data; add a<br>second store|
|No repository/service**interface**exists;<br>WorkerMockServiceis a static class (skill 01<br>asks for a<br>WorkerRepository)|F|Adapter boundary is greenfield|
|OfficeAppdrives the engine with<br>window.setInterval→<br>advanceByWallClock|F|Loop must be gated by<br>dataSourceso no<br>fake activity runs in backend mode|
|TaskEntityis a simulation entity (stage<br>pipeline, tokens, cost, progress)|F|Backend tasks need their own view model;<br>mapping into<br>TaskEntitywould fabricate<br>fields|
|ActivityEventTypehas 7 simulation-oriented<br>values|F|Backend events need a separate view type<br>with an<br>UNKNOWNfallthrough|
|Roster is 7 workers; matching treats non-<br>permanent ids as not capable|F|Unknown backend workers have no<br>workstation: need a placeholder/overflow<br>strategy|
|WAITINGand<br>ERRORworker statuses exist<br>but the simulation never produces them|F|The backend may; scene/UI paths for them<br>are untested|
|UI labels are hard-coded: TopBar shows<br>SIMULATION MODEand<br>(SIMULATED)|F|Labels must become mode-aware or<br>backend data will be mislabeled|
|Template leftovers in<br>dependencies:<br>@google/genai,<br>express,<br>dotenv;<br>.env.examplehas<br>GEMINI_API_KEY;<br>metadata.jsondeclares a server-side Gemini<br>capability|F|No<br>src/import of them (grep), no<br>import.meta.env/<br>process.envin<br>src/,<br>vite.config.tsdefines no secret. Still a<br>security-surface decision (remove or keep)|
|No runtime-validation library (skill 09 suggests<br>Zod)|F|New-dependency decision (Zod vs hand-<br>written validators)|
|AI_RULES.md,<br>CORE_RULES_COMPACT.md,|F|Rules must be updated(docs only)before|



|Finding|Type|Consequence for Phase 3|
|---|---|---|
|skill 09 still forbid backend/network ("Phase<br>2.2", "deferred")||any Phase 3 code.<br>AI_RULES.mdalso says<br>"do not edit files outside<br>office-ui";<br>ambiguous for a new<br>src/integration/|



## **4. Python Backend Availability and Contract Audit** 

- **Searched:** <mark>git ls-fles</mark> i for <mark>.py</mark> , <mark>requirements</mark> , <mark>pyproject</mark> , <mark>fastapi</mark> , <mark>openapi</mark> , <mark>swagger</mark> , <mark>backend</mark> (only <mark>docs/skills/09-backend-integration.md</mark> matched); the uploads folder; filesystem for any <mark>*sireader*</mark> directory (only this clone). I cannot enumerate your other repositories. 

- **No** **<mark>.env</mark> , credentials, tokens, or keys were opened.** 

- **[U] Unknown:** framework, base URL, routes, request/response schemas, auth, WS/SSE support, event names, id formats, status enums, pagination, versioning, CORS, deployment topology, how MT5 data / approvals / spread watches are exposed. 

- **Conclusion:** backend contract not verifiable. Required inputs are listed in §19. 

## **5. System Context Diagram** 

##### flowchart LR 

OP["Human operator (browser)"] --> FE["Virtual Office frontend"] 

FE -->|"read-only HTTPS REST + SSE/WS (contract TBD)"| API["Backend API boundary (sameorigin proxy or direct: TBD)"] API --> PY["Python SIREADER backend (source of truth)"] PY --> DE["Decision Engine + approval workflow"] PY --> MT5[("MT5 / market data")] PY --> DB[("Persistence")] FE -.->|"forbidden"| AI["AI providers"] FE -.->|"forbidden"| MT5 

## **6. Component Architecture Diagram** 

flowchart TB subgraph UI["UI + 3D scene (presentational only)"] TB["TopBar / ConnectionBanner"] WP["WorkerPanel / ActivityFeed / Queue views"] SC["R3F scene (WorkerAvatar, labels)"] end subgraph ST["Zustand stores"] SIM["useOfficeStore (existing, unchanged)"] BE["useBackendStore (new): snapshot, connection, staleness, dataSource"] VM["mode-aware selectors / view models"] end subgraph INT["src/integration/ (new, no React)"] REPO["BackendRepository (read-only interface)"] HTTP["HttpAdapter"] 

MOCK["MockBackendAdapter + fixtures"] SCH["DTO schemas + validators"] MAP["mappers DTO to view models"] RT["RealtimeClient (SSE or WS)"] RS["Resequencer / dedupe / gap detector"] SYNC["SyncCoordinator (snapshot + events)"] end UI --> VM VM --> SIM VM --> BE SYNC --> BE SYNC --> REPO SYNC --> RT RT --> RS REPO --> HTTP REPO --> MOCK HTTP --> SCH --> MAP RS --> SCH 

Rule: no networking, scheduling policy, or backend mapping inside <mark>src/scene/</mark> ; scene components read one <mark>useWorkerView(workerId)</mark> selector. 

## **7. Data Flow Diagram** 

sequenceDiagram participant U as UI participant S as SyncCoordinator participant R as Repository participant T as RealtimeClient participant B as Backend U->>S: start(dataSource=BACKEND) S->>R: getSnapshot() R->>B: GET snapshot (TBD) B-->>R: snapshot + cursor R-->>S: validated + mapped (unknown items kept as UNKNOWN) S->>T: connect(fromCursor) T->>B: open stream (TBD) B-->>T: events (id, seq) T-->>S: dedupe + order by seq Note over S: gap in seq or invalid cursor S->>R: getSnapshot() (resync) Note over T,S: no heartbeat within T seconds then STALE, then reconnect with backoff 

## **8. State Ownership Model** 

|Domain|Owner|Location|Mutated by|
|---|---|---|---|
|Simulated|Frontend|existing<br>useOfficeStore|only in|



|Domain|Owner|Location|Mutated by|
|---|---|---|---|
|workers/tasks/scheduler/events/PRNG|sim<br>engine||SIMULATION<br>mode|
|Backend<br>workers/tasks/events/approvals/spread<br>watches/market|**Backend**|new<br>useBackendStore<br>(read-only mirror)|only<br>SyncCoordinator|
|Connection, last-sync time, staleness,<br>diagnostics|Frontend|useBackendStore.con<br>nection|transport/sync only|
|dataSource: 'SIMULATION' |<br>'BACKEND'|Frontend|useBackendStore|explicit user action|
|Selection, camera, drawers|Frontend|existing store|UI|



- **[D] Mutually exclusive modes.** In <mark>BACKEND</mark> mode the simulation interval is not started, simulation controls are disabled with a visible reason, and no simulated entity is shown. Switching modes is explicit and never merges task maps. 

- **[D] Backend ids are never rewritten into** **<mark>tsk_pool_*</mark> or the simulation namespace.** View-model keys carry <mark>origin: 'BACKEND'</mark> . 

- **[D] Read-only is structural:** the interface has no mutating method; a static test fails if one is added. 

## **9. REST / WebSocket / SSE Contract Requirements (to be supplied)** 

- **REST:** snapshot endpoint (workers, active + recent tasks, read-only approvals, spread watches, market summary), paginated activity history by cursor, health/version endpoint, schema-version header, one error envelope. 

- **Event envelope fields required:** unique id, monotonic <mark>seq</mark> per stream, <mark>type</mark> , <mark>schemaVersion</mark> , backend <mark>occurredAt</mark> , <mark>payload</mark> ; a snapshot <mark>cursor</mark> that ties the snapshot to <mark>seq</mark> ; heartbeat interval; replay-from-cursor and retention window; an explicit "resync required" signal. 

- **Transport [D, final choice deferred to 3.0]:** SSE preferred for one-way monitoring (built-in reconnect and <mark>Last-Event-ID</mark> , plain HTTP). Trade-off: browser <mark>EventSource</mark> cannot set an <mark>Authorization</mark> header, so auth must be cookie-based or via a proxy. Choose WebSocket only if bidirectional commands are later authorized or the backend already standardizes on it. 

## **10. Authentication and Security Design** 

Principles only. **No auth implementation is chosen** before the backend contract and deployment architecture are known. 

- No secrets in the bundle or in <mark>VITE_*</mark> variables; no credentials in <mark>docs/</mark> or fixtures. 

- Prefer a same-origin reverse proxy / backend-for-frontend, or short-lived tokens issued by the backend. Never store tokens in <mark>localStorage</mark> . HttpOnly + SameSite cookies if sessions are used. 

- Read-only phase: CSRF matters only once mutating requests exist; CORS needs an explicit allowlist if cross-origin. 

- Authorization: a read-only scope/role; frontend never infers permission. 

- Treat all backend strings as text (no HTML rendering); validate and size-limit payloads; never log payloads. 

- Template cleanup decision (§19): remove <mark>@google/genai</mark> , <mark>express</mark> , <mark>dotenv</mark> , the <mark>GEMINI_API_KEY</mark> example, and the Gemini capability in <mark>metadata.json</mark> , or document why they stay. Add a bundle secret-scan to the audit. 

## **11. Error, Reconnect, and Stale Data Strategy** 

- **Connection state machine [D]:** <mark>IDLE → CONNECTING → LIVE → STALE → RECONNECTING → RESYNCING → LIVE</mark> ; terminal-until-user states <mark>ERROR_AUTH</mark> and <mark>ERROR_CONTRACT</mark> (unsupported schema version). 

- **Ordering/duplicates:** order by <mark>seq</mark> ; dedupe by event id in a bounded window; buffer a small out-of-order window, then resync. Apply only events with <mark>seq > snapshot.cursor</mark> after a snapshot. 

- **Stale detection:** no heartbeat/event within a configurable timeout → <mark>STALE</mark> ; <mark>lastSyncedAt</mark> shown. Backoff with jitter and a cap. 

- **Honesty rule (skill 09):** when <mark>STALE</mark> /disconnected, avatars freeze with a stale badge. The UI never invents or continues activity to hide a failure. 

- **Unknown data:** unknown worker, task type, or status is kept as <mark>UNKNOWN</mark> with the raw value displayed; it never crashes. Invalid payloads are dropped, counted, and listed in diagnostics. 

- **Error normalization:** <mark>BackendError { kind: NETWORK | TIMEOUT | HTTP | AUTH | CONTRACT | PROTOCOL | ABORTED, retryable, status?, message (sanitized) }</mark> . 

## **12. Worker and Task Mapping Strategy** 

|Topic|Strategy|
|---|---|
|Worker identity|backend id → open<br>WorkerId; the 7 known ids map to existing<br>workstations/avatars; unknown ids go to a config-driven overflow area<br>with a generic avatar. Layout for 50–100 workers is a later config task|
|Worker status|backend status →<br>WorkerStatusplus<br>UNKNOWNand<br>STALE. Mapping<br>table is**[U]**until the contract exists|
|Task|BackendTaskView: id, workerId or null, raw type string, title, raw +<br>normalized status, backend timestamps (ISO → epoch ms), optional<br>priority, optional error.<br>progressis<br>nullwhen unknown (never defaulted<br>to 0 and animated)|
|Usage/cost|not mapped to<br>simulatedTokens/<br>simulatedCostUsd. Show real usage<br>only if the contract provides it, labeled as backend data|
|Events|separate<br>BackendActivityViewwith an<br>UNKNOWNtype fallthrough;do|



|Topic|Strategy|
|---|---|
||not extend<br>ActivityEventType|
|Time|backend wall-clock epoch vs simulation ms are different domains;<br>formatSimDurationmust never receive epoch values. Estimate server<br>clock offset for relative ages|
|Labels|derive from<br>dataSource:<br>SIMULATION MODE+<br>(SIMULATED)in sim; a<br>LIVE · READ-ONLYbadge in backend mode; "simulated" suffixes<br>disappear. A label swap alone does not make data real|



## **13. Phase 3 Milestone Breakdown** 

### **Phase 3.0 — Backend Contract Discovery & Architecture Freeze (no code)** 

1. **Goal:** freeze the contract and decisions. 2. **Scope:** documents only. 3. **Builds:** <mark>docs/PHASE_3_ARCHITECTURE.md</mark> (ADR), answered contract questionnaire, sample payload fixtures (sanitized), rules updates. 4. **Files:** <mark>docs/PHASE_3_ARCHITECTURE.md</mark> , <mark>AI_RULES.md</mark> , <mark>CORE_RULES_COMPACT.md</mark> , <mark>docs/skills/09-*.md</mark> , <mark>docs/PROJECT_STATE.md</mark> . 5. **Depends on:** Phase 2.2 approval (done). **Needs backend input: yes** (docs/OpenAPI/samples, not necessarily live access). 6. **Risks:** contract incomplete or still moving. 7. **Acceptance:** every item in §19 answered or explicitly deferred with an owner. 8. **Tests:** none (doc review). 9. **Manual QA:** n/a. 10. **DoD:** reviewed and approved ADR + frozen contract version + rules updated. 

### **Phase 3.1 — Typed Integration Boundary & Adapter** 

1. **Goal:** typed, validated, testable boundary with no UI impact. 2. **Scope:** <mark>src/integration/</mark> only; no store, UI, or network to a real server. 3. **Builds:** <mark>BackendError</mark> + normalization, read-only <mark>BackendRepository</mark> , DTO schemas/validators, mappers (unknown-tolerant), <mark>MockBackendAdapter</mark> + fixtures (valid, unknown worker/status, malformed, schema-version mismatch). 4. **Files:** 

<mark>src/integration/{backend.types,backend.schemas,backend.mappers,backend.errors,backen d.repository,mock.adapter}.ts</mark> , <mark>src/integration/f</mark> i <mark>xtures/</mark> , tests. 5. **Depends on:** 3.0 for real schemas. **3.1a** (contract-independent: errors, connection types, envelope/resequencer primitives) needs no backend; **3.1b** (real DTOs) needs the contract. 6. **Risks:** rework if schemas are provisional; Zod dependency choice. 7. **Acceptance:** all malformed fixtures yield normalized errors, never throws; interface has no mutating method. 8. **Tests:** schema/mappers/error unit tests, static guard (no <mark>fetch/EventSource/WebSocket</mark> outside <mark>src/integration/</mark> ). 9. **Manual QA:** n/a. 10. **DoD:** tests + <mark>npm run lint</mark> + build green; 256 existing tests unchanged. 

### **Phase 3.2 — Read-Only Snapshot Integration** 

1. **Goal:** show backend workers/tasks/history read-only. 2. **Scope:** <mark>useBackendStore</mark> , <mark>dataSource</mark> mode, snapshot loader, view models, mode-aware labels. 3. **Builds:** store, <mark>SnapshotLoader</mark> , 

<mark>useWorkerView</mark> , data-source badge, backend task/activity lists, sim loop gated by mode. 4. **Files:** <mark>src/integration/backend.store.ts</mark> , <mark>src/ui/TopBar.tsx</mark> , <mark>src/ui/WorkerPanel.tsx</mark> , <mark>src/ui/ActivityFeed.tsx</mark> , <mark>src/app/OfceApp.tsx</mark> fi , one selector swap in scene components. 5. **Depends on:** 3.1. **3.2a** against the mock adapter needs no backend; **3.2b** real <mark>HttpAdapter</mark> needs contract + auth + CORS/proxy. 6. **Risks:** mislabeled simulated vs real data; scene regressions. 7. **Acceptance:** backend mode never shows simulated entities; unknown workers/statuses render; Phase 2.2 simulation unchanged in <mark>SIMULATION</mark> mode. 8. **Tests:** store, mapping, mode-switch, label tests; render-isolation test kept; baseline hash gate re-run. 9. **Manual QA:** switch modes, load mock snapshot, unknown worker visible, reset/sim still works. 10. **DoD:** all tests green, owner QA recorded. 

### **Phase 3.3 — Real-Time Event Transport** 

1. **Goal:** live updates, correctly ordered and recoverable. 2. **Scope:** transport + sync logic; minimal UI. 3. **Builds:** <mark>RealtimeClient</mark> interface, SSE or WS implementation per 3.0, resequencer/dedupe/gap detection, <mark>SyncCoordinator</mark> , deterministic mock transport with injected clock. 4. **Files:** <mark>src/integration/realtime.*.ts</mark> , <mark>src/integration/sync.coordinator.ts</mark> , tests. 5. **Depends on:** 3.2. Mock transport needs no backend; the real transport needs the event contract. 6. **Risks:** ordering/gap bugs, auth limits of <mark>EventSource</mark> . 7. **Acceptance:** duplicates ignored, out-of-order fixed or resynced, gap triggers snapshot, reconnect resumes from cursor. 8. **Tests:** fake-timer/clock tests for every transition. 9. **Manual QA:** kill/restore the mock stream, observe resync. 10. **DoD:** tests green; no wall-clock in tests. 

### **Phase 3.4 — Connection Resilience & UI Integration** 

1. **Goal:** honest offline/stale/error UX. 2. **Scope:** connection state UI and avatar stale/unknown states. 3. **Builds:** <mark>ConnectionBanner</mark> , stale badge, diagnostics panel, unknown-worker/status visuals, reduced-motion handling. 4. **Files:** <mark>src/ui/ConnectionBanner.tsx</mark> , <mark>src/ui/TopBar.tsx</mark> , <mark>src/scene/WorkerAvatar.tsx</mark> , <mark>src/scene/WorldLabelsOverlay.tsx</mark> . 5. **Depends on:** 3.3. Mockdriven; no real backend needed. 6. **Risks:** accidental fake activity in scene; accessibility. 7. **Acceptance:** <mark>STALE</mark> /disconnected freezes avatars with a visible badge; no activity animation without live data. 8. **Tests:** UI state tests via existing harness. 9. **Manual QA:** each connection state, unknown worker, reduced motion. 10. **DoD:** QA recorded, tests green. 

### **Phase 3.5 — End-to-End Integration Audit** 

1. **Goal:** verify against a real (staging) backend, read-only. 2. **Scope:** audit and fixes only. 3. **Builds:** contract tests, soak/reconnect run, security review, final audit doc. 4. **Files:** <mark>docs/PHASE_3_FINAL_AUDIT.md</mark> , <mark>docs/PROJECT_STATE.md</mark> . 5. **Depends on:** 3.0–3.4 and a reachable backend ( **required** ). 6. **Risks:** contract drift, environment access. 7. **Acceptance:** §16 all PASS with evidence. 8. **Tests:** full suite + contract tests + bundle secret scan. 9. **Manual QA:** full session against staging. 10. **DoD:** approved audit; recorded commands and results. 

## **14. File-Level Implementation Roadmap** 

|Area|Change|Milestone|
|---|---|---|
|src/integration/(new)|types, errors, schemas, mappers, repository,<br>mock/http adapters, realtime, sync, store, fixtures|3.1–3.3|
|src/ui/TopBar.tsx|mode-aware badge/labels|3.2|
|src/ui/ConnectionBanner.tsx<br>(new)|connection/stale/error banner|3.4|
|src/ui/WorkerPanel.tsx,<br>ActivityFeed.tsx,<br>GlobalQueuePanel.tsx|read-only backend views; queue panel<br>hidden/replaced in backend mode|3.2|
|src/app/OfficeApp.tsx|gate the sim interval by<br>dataSource|3.2|
|src/scene/*|only a<br>useWorkerViewselector swap +<br>stale/unknown visuals|3.2, 3.4|
|docs/*,<br>AI_RULES.md,<br>CORE_RULES_COMPACT.md,<br>skill 09|Phase 3 rules, ADR, audits|3.0, 3.5|
|package.json|possibly add a validator library; possibly remove<br>template deps|3.0 decision|
|**Never touched**|src/scheduler/,<br>task.transitions.ts,<br>simulation.engine.ts,<br>worker.mock-service.ts|all|



## **15. Testing Strategy** 

- **Unit:** schemas (malformed fuzz), mappers (unknown tolerant), error normalization, resequencer, connection state machine with an injected clock. 

- **Contract tests:** fixtures first; the same suite runs against staging in 3.5. 

- **UI:** existing minimal-DOM harness with <mark>invokeReactProp</mark> and React 19 <mark>act</mark> . 

- **Regression:** the 256 existing tests unchanged; re-record a fresh determinism hash baseline on <mark>a2efb07</mark> before 3.2 (the earlier <mark>8d2b9bb</mark> hashes are obsolete because the demo generator changed). 

- **Static guards:** no <mark>fetch/EventSource/WebSocket</mark> outside <mark>src/integration/</mark> ; nothing in <mark>src/scheduler/</mark> or <mark>src/scene/</mark> imports <mark>src/integration/</mark> ; no <mark>VITE_*</mark> secret; read-only interface has no mutating method. 

- **Manual browser QA** scripted per milestone and recorded. 

## **16. Acceptance Criteria (Phase 3)** 

1. Contract frozen and versioned before any real-backend code. 

2. Read-only: no order, close, modify SL/TP, auto-trading, approval mutation, or provider call exists in the frontend. 

3. Simulation and backend data never share a map; backend mode shows no simulated entity; labels derive from <mark>dataSource</mark> . 

4. Every payload is validated at runtime; unknown worker/task/status renders as <mark>UNKNOWN</mark> without crashing. 

5. Disconnect/stale/error states are visible and tested; no fabricated activity. 

6. Duplicate, out-of-order, and missed events are handled; resync works. 

7. No secret in the bundle or <mark>VITE_*</mark> ; auth design documented and approved. 

8. Phase 2.2 behavior and its 256 tests unchanged; determinism hash gate passes. 

9. <mark>npm run lint</mark> , <mark>npm run build</mark> , <mark>git dif</mark> f <mark>--check</mark> pass; results are recorded with commands. 

## **17. Risks and Mitigations** 

|Risk|Mitigation|
|---|---|
|Backend contract missing/unstable|3.0 freeze; provisional schemas marked and isolated|
|Simulated data presented as real (or reverse)|separate store,<br>origin, mode-aware labels, tests|
|EventSourcecannot send auth headers|decide transport and auth together in 3.0<br>(cookie/proxy)|
|Scene regressions|selector-only change, existing isolation tests|
|Template dependencies enlarge the attack<br>surface|explicit removal decision + bundle secret scan|
|Unknown workers exceed workstation config|overflow-area config, generic avatar|
|Clock skew / epoch vs sim time confusion|separate time domains, offset estimate, no shared<br>formatters|
|Rules docs still forbid backend work|update rules in 3.0 before code|



## **18. Explicit Out-of-Scope Items** 

Order placement, close-position, modify SL/TP, auto-trading; approving/rejecting through the UI; direct AI-provider calls; credentials in the frontend; backend/database changes; frontend persistence of backend data; changes to Phase 2.2 or <mark>src/scheduler/</mark> ; converting simulated tasks to real by relabeling; new 3D assets; multi-user collaboration. 

## **19. Unresolved Decisions and Required Inputs** 

1. Backend repo/OpenAPI or route + schema documentation and sanitized sample payloads. **[U]** 

2. Deployment topology and base URLs (same-origin proxy vs cross-origin), environments (dev/staging/prod), and who runs the backend for QA. **[U]** 

3. Authentication method, token/session lifetime, read-only scope. **[U]** 

4. Realtime support (SSE and/or WS), event envelope, replay/retention, heartbeat. **[U]** 

5. Id formats and enums for worker status, task status, task type; timestamp format and timezone. **[U]** 

6. Worker roster source: fixed 7 or dynamic up to 100; avatar/workstation assignment rule. **[U]** 

7. Scope of read endpoints for approvals, spread watches, market data. **[U]** 

8. Rate limits, pagination, CORS policy. **[U]** 

9. Validator choice: add Zod or hand-written. **[D pending]** 

10. Remove or keep <mark>@google/genai</mark> , <mark>express</mark> , <mark>dotenv</mark> , <mark>GEMINI_API_KEY</mark> example, Gemini capability in <mark>metadata.json</mark> . **[D pending]** 

11. Rules updates to allow <mark>src/integration/</mark> and clarify "outside <mark>ofce-ui</mark> fi ". **[D pending]** 

12. Does the simulation remain in production builds, and how is the mode switch exposed? **[D pending]** 

13. Fixture policy: no real trading data or credentials. **[D]** 

## **20. Recommended First Implementation Task** 

**Phase 3.0, documents only, with Phase 3.1a in parallel.** 

- **3.0 deliverable:** <mark>docs/PHASE_3_ARCHITECTURE.md</mark> (this plan as ADR), the answered §19 questionnaire, and the rules updates. Blocking for everything that touches the real backend. 

- **3.1a (optional parallel, no network/UI/store):** <mark>src/integration/</mark> with <mark>BackendError</mark> + normalization, <mark>ConnectionState</mark> types and machine, the read-only <mark>BackendRepository</mark> interface, a generic event-envelope validator + resequencer with fixtures, and the static guard tests. 

- **Acceptance for 3.1a:** guard tests pass, 256 existing tests unchanged, lint and build green, zero changes outside <mark>src/integration/</mark> and tests. 

Stopping here for architectural review. 

