# Phase 3.2 — Local Development & Production Runbook

This runbook applies to the existing SIREADER Virtual Office repository and its Phase 3.2 BFF. It does not authorize trading, worker execution, or changes to the Python backend.

## 1. Prerequisites

- Windows 10/11 or another supported desktop OS.
- Node.js 22 and Bun installed.
- Dependencies installed from the committed lockfile:
  \`bun install --frozen-lockfile\`.
- Python Backend Phase 3.1 available on loopback port 8000 only when performing the separately approved live API smoke checks.

Do not use \`localhost\` in the browser. The canonical browser origin is exactly:

\`http://127.0.0.1:3000\`

This exact origin matters for the locked Host/Origin checks and the \`__Host-\` session cookie.

## 2. Development mode

From the repository root, start both local services:

\`\`\`powershell
bun run dev
\`\`\`

The launcher starts two sibling processes and stops both if either one exits:

| Service | Bind | Purpose |
|---|---|---|
| Vite | \`127.0.0.1:3000\` | Existing React/Three.js frontend and browser origin |
| Express BFF | \`127.0.0.1:3001\` | Auth/session and fixed API proxy routes |

Only the exact \`/api\` namespace is proxied to port 3001. The proxy preserves the browser Host header; it does not rewrite it to the upstream port. Vite and BFF both use strict ports. If a port is occupied, startup fails rather than selecting a fallback.

Open \`http://127.0.0.1:3000\`. Do not open port 3001 directly in the browser; the BFF intentionally expects the browser-facing Host header to remain \`127.0.0.1:3000\`.

To run a single service during focused debugging:

\`\`\`powershell
bun run dev:vite
\`\`\`

or:

\`\`\`powershell
bun run dev:bff
\`\`\`

In development, the BFF serves API routes only; Vite serves the frontend.

## 3. Local operator authentication

Generate the password hash locally in an interactive terminal:

\`\`\`powershell
bun run hash:operator
\`\`\`

Put the resulting \`OPERATOR_PASSWORD_HASH=...\` line in the ignored local \`.env\` file. Never place the password or hash in Git, screenshots, chat, browser storage, or frontend variables. The BFF entrypoint loads dotenv before validating configuration.

The server-to-server \`SIREADER_API_AUTH_TOKEN\` is a separate secret. Do not configure it until the Python Backend Phase 3.1 runbook's private credential and five-endpoint HTTP checks have been completed. Never paste that token into chat.

## 4. Production-like local serving

Build the existing frontend, then start the production BFF:

\`\`\`powershell
bun run build
bun run start
\`\`\`

The production launcher sets \`NODE_ENV=production\` before loading the BFF. Express binds only to \`127.0.0.1:3000\`, serves the existing \`dist/\` directory, handles SPA HTML navigations, and continues to reserve the \`/api\` namespace for the fixed BFF routes. It fails to start if \`dist/index.html\` is missing or the required port cannot be bound.

The production command does not start the Python API. Start and verify the backend separately using its own repository instructions.

## 5. Verification

Run the full frontend/BFF automated checks:

\`\`\`powershell
bun run test
bun run lint
bun run build
\`\`\`

Expected behavior to verify locally in Chrome:

- The address bar remains on \`http://127.0.0.1:3000\`.
- Operator login sets \`__Host-sireader_sid\` as HttpOnly, Secure, SameSite=Strict, Path=/, with no Domain attribute.
- The cookie is not readable through \`document.cookie\`.
- Logout revokes the session and clears private LIVE state.
- Browser API requests go to same-origin \`/api/...\`; no Python Bearer token appears in browser requests, bundles, storage, or logs.
- Unknown \`/api/... \` paths return JSON 404 and never SPA \`index.html\`.
- LIVE values remain separate from the existing deterministic SIMULATED office.

Do not declare end-to-end LIVE observability accepted until the operator hash, BFF, Python API token, authenticated backend endpoints, and Chrome cookie/session behavior have been verified locally. Record results without recording secret values.

## 6. Stop services

Press \`Ctrl+C\` in the development or production terminal. The development launcher stops both Vite and BFF child processes.
