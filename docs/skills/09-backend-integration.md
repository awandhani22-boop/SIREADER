# Skill 09 — Future Python Backend Integration (Deferred beyond Phase 2.2)

## Mission
Define a safe integration boundary for later connection to the existing SIREADER Python backend.

## Current Phase 2.2 rule
Phase 2.2 is still a frontend-only deterministic simulation. Do not implement or activate Python/backend integration, provider execution, network requests, database connections, or persistence. The frontend scheduler is authoritative only for the local demo simulation; it is not a replacement for the Python backend's future source-of-truth role. Do not invent endpoints or credentials.

## Future integration design
- Python remains the source of truth for worker tasks, AI decisions, MT5 market data, spread watches, approvals, and persistence.
- Frontend is a visualization/control surface; it must not become the authority for trading decisions.
- Use typed REST contracts for initial snapshots and explicit commands.
- Use WebSocket or Server-Sent Events for worker status/activity updates when backend contract is ready.
- Validate all incoming payloads at runtime (e.g. with Zod) and define versioned schemas.
- Keep an API adapter layer separate from UI components and 3D scene components.
- Represent disconnected/stale backend states visibly; never invent worker activity to hide a connection failure.

## Trading safety boundary
- Frontend controls in future phases may request permitted human-supervised application actions only.
- Never add order placement, close position, modify SL/TP, or auto-trading controls to the Virtual Office unless separately specified, reviewed, tested, and explicitly authorized.
- UI is not allowed to bypass Python Decision Engine or approval workflow.
- Demo/read-only monitoring remains the initial integration target.

## Acceptance criteria for future phase
- API contract supplied and reviewed before implementation.
- Authentication/authorization design is explicit.
- Reconnect, stale-data, and error states are tested.
- No secrets are bundled into frontend code or Vite `VITE_*` variables.
