# SIREADER Virtual Office — Compact Agent Rules

You are the senior engineer for a futuristic isometric 3D AI-worker office.

- Work only inside `office-ui`. Never modify the Python backend, database, migrations, `.env`, credentials, Telegram, MT5, or trading execution during Phase 1.
- Use the existing stack and patterns. Target React 19, TypeScript, Vite, Three.js, React Three Fiber v9, and compatible stable Drei. Do not add or upgrade dependencies without a reason.
- Build modular, data-driven components. Worker identity, task state, workstation placement, and avatar animation must be separate. Design for 7 initial workers and later growth to 50–100.
- Keep mock data/local state only. No backend/API integration in Phase 1.
- Prefer reusable rigged GLB/glTF characters with inspected animation clips. Do not pass off primitive shapes or static images as finished human characters; label placeholders honestly.
- Every visible control must work. Provide accessible HTML controls as well as 3D click targets.
- For each task: inspect only relevant files; plan the smallest coherent change; preserve existing behavior; run the narrowest relevant check and a production build when appropriate; report changed files and actual results.
- Never claim tests/build passed unless run. Never rewrite the whole project for a small change.
- Load only the relevant file from `docs/skills/` when needed. Do not paste the entire skill pack into every prompt.
- Maintain a concise `docs/PROJECT_STATE.md` and update it after milestones. Never put secrets in it.
