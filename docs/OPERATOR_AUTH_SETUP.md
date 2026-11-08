# Local Operator Authentication Setup

This document contains setup instructions only. Do not place real password hashes, bearer tokens, or other secret values in GitHub or chat.

## 1. Generate the operator password hash

From the Virtual Office repository root, run:

```powershell
bun run hash:operator
```

The helper reads the password through a masked interactive terminal prompt. Use at least 16 printable ASCII characters. It writes one line in the form `OPERATOR_PASSWORD_HASH=scrypt$16384$8$1$...`. The value is a password-derived secret: keep it private.

## 2. Configure the local environment

Create or update the ignored local `.env` file and paste the generated `OPERATOR_PASSWORD_HASH=...` line there. Do not paste the password itself or its hash into this chat. The BFF entrypoint `server/main.ts` loads the ignored local `.env` file before importing and validating BFF configuration.

The server-to-server `SIREADER_API_AUTH_TOKEN` is separate from the operator password hash. Configure it locally only after the Python Backend Phase 3.1 runbook's private credential and endpoint smoke checks are completed.

## 3. Security behavior

- Password hash format is fixed scrypt: N=16384, r=8, p=1, 16-byte random salt, and 64-byte derived key.
- Login attempts are limited to five failures per loopback client IP within a 15-minute window.
- Session IDs and CSRF tokens use 32 cryptographically random bytes.
- Session data is held only in BFF process memory. A BFF restart invalidates every active session and requires the operator to log in again.
- Idle expiry is one hour; absolute expiry is eight hours. The cookie has an eight-hour maximum age and is HttpOnly, Secure, SameSite=Strict, Path=/, and host-only (no Domain).
- The CSRF token is returned only in authenticated login/session responses. Keep it in frontend memory only; do not put it in localStorage, sessionStorage, a URL, or logs.
- Logout requires the session cookie and a matching `X-CSRF-Token` header.
- All five upstream observability routes require an active operator session.

The helper does not write `.env`, store a password, or send credentials over the network.
