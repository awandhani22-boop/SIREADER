# Skill 09 — Future Python Backend Integration (Not for Phase 1)

## Mission
Define a safe integration boundary for later connection to the existing SIREADER Python backend.

## Phase 1 rule
Do not implement or activate backend integration in Phase 1. No invented endpoints, credentials, network requests, or database connections.

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
