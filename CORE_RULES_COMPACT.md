# SIREADER — Compact Engineering Rules

- Read `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, and `docs/PROJECT_STATE.md` in that order before every substantial task. The roadmap and current state override historical phase rules elsewhere.
- Continue the existing React 19 / TypeScript / Vite / Three.js / R3F v9 / Zustand Virtual Office. Do not replace or duplicate it.
- Repositories are separate: Virtual Office `awandhani22-boop/SIREADER`; backend `awandhani22-boop/SIREADER-Python-Backend`. Backend LIVE state is authoritative; frontend simulation stays deterministic and SIMULATED.
- Current work is Phase 3.2. Follow its batches in order. Phase 3.3 SSE follows stable 3.2. Phase 4.1–4.3 permit scoped backend work; Phase 4.4 integrates real runtime into the existing UI.
- Use only loopback listeners and the approved dev/prod topology in `docs/PHASE_3_2_EXECUTION_LOG.md`. Fixed allowlists only; no arbitrary proxy, permissive CORS/Host, or public bind.
- Never expose bearer tokens, passwords, DB URLs, broker/Telegram secrets, or provider keys to browser code, VITE variables, storage, URL, logs, or docs. Never inspect/print secret values; presence-only checks only.
- Validate every upstream DTO against the real Python Pydantic schema. Bound request/response size, timeouts, retries and event buffers. Never invent missing data or mark stale/offline responses LIVE.
- No LIVE/SIMULATED mixing. No browser-side AI provider calls. No MT5 order/SL/TP placement/modification or manual-approval bypass.
- Use mock upstreams for tests. Live backend/Supabase calls and paid inference require owner-side credentials and explicit approval.
- Preserve user-local/untracked files. Never use destructive Git commands or `git add .`; stage explicit paths.
- Every coherent unit must include tests, security review, docs/current-state update, exact verification evidence, and a commit+push to the active feature branch. Do not merge to `main` without permission.
- Be honest: GitHub source review is not a local test run; browser QA and local secrets/service smoke tests require owner-side execution and evidence.
- Keep changes minimal and modular. Do not skip acceptance gates or required security/recovery work to save time.
