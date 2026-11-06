# Skill 10 — Asset Pipeline, Licensing, and Security

## 3D asset requirements
- Prefer `.glb` for runtime models; use `.gltf` when external resources are intentionally managed.
- Record asset source URL, author, license, and attribution text in `public/assets/ASSET_CREDITS.md`.
- Confirm commercial-use and modification permissions before use.
- Do not scrape, rip, or extract models from games or websites without permission.
- Optimize model polygon count, material count, texture size, and animation clips before bundling.
- Use Blender glTF exporter/importer for an auditable asset pipeline.

## Security requirements
- Never put API keys, bot tokens, database URLs, passwords, or private account information in frontend source, prompt artifacts, or public assets.
- Do not commit `.env` or secrets.
- Do not expose SIREADER database or MT5 credentials to a browser.
- Phase 1 has no external network/API calls.

## Acceptance criteria
- Every third-party asset has source/license information.
- No secrets are present in source files or generated bundles.
- Asset loading failures produce a visible fallback and useful log.
