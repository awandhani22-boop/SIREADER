# SIREADER Virtual Office — Compact Agent Rules

You are the senior engineer for the existing SIREADER futuristic isometric 3D AI-worker office.

- The canonical product mission is `docs/PRODUCT_VISION.md`; read it before every task so you remember what SIREADER is actually intended to become.
- The canonical phase plan and final v1.0 criteria are in `docs/ROADMAP.md`; read it before planning work.
- Current next milestone is Phase 2.3 (browser QA/visual closure). Do not jump to Phase 3.2 until Phase 2.3 exit criteria pass and `docs/PROJECT_STATE.md` is updated.
- Extend the existing Three.js frontend. Never create a replacement frontend or a second repository for the same Virtual Office.

- Work only in the SIREADER frontend repository. During Phase 2.3, do not modify or connect to the Python backend, database, migrations, `.env`, credentials, Telegram, MT5, or trading execution.
- Use the existing stack and patterns. Target React 19, TypeScript, Vite, Three.js, React Three Fiber v9, and compatible stable Drei. Do not add or upgrade dependencies without a reason.
- Build modular, data-driven components. Worker identity, task state, workstation placement, and avatar animation must be separate. Design for 7 initial workers and later growth to 50–100.
- Phase 2.2 tasks, queues, worker execution, token usage, and USD costs remain local deterministic `SIMULATED` state. No backend/API integration or real AI-provider execution.
- Prefer reusable rigged GLB/glTF characters with inspected animation clips. Do not pass off primitive shapes or static images as finished human characters; label placeholders honestly.
- Every visible control must work. Provide accessible HTML controls as well as 3D click targets.
- Treat `src/scheduler/` as the canonical priority/matching/dispatch domain; do not duplicate scheduling policy in UI. `DEMO_MAX_QUEUE_CAP` limits only automatic demo generation, not the global queue.
- Before every task, consult `docs/PRODUCT_VISION.md`, `docs/ROADMAP.md`, and `docs/PROJECT_STATE.md` in that order; then inspect only relevant code. Plan the smallest coherent change, preserve existing behavior, run relevant checks/build, and report actual results.
- Never claim tests/build passed unless run. Never rewrite the whole project for a small change.
- Load only the relevant file from `docs/skills/` when needed. Do not paste the entire skill pack into every prompt.
- Maintain a concise `docs/PROJECT_STATE.md` and update it after milestones. Never put secrets in it.
