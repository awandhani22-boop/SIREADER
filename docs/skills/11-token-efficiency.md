# Skill 11 — Token & Context Efficiency

## Goal
Complete work with the smallest useful context while preserving correctness. Reduce repeated explanations, unnecessary file reads, broad rewrites, and verbose reports. Do not sacrifice tests, security, maintainability, or visual quality just to save tokens.

## Before every task
1. Restate the requested outcome in one sentence.
2. Inspect only the files directly relevant to that outcome. Reuse the current project structure; do not reread every file unless doing a full audit.
3. Check existing components, utilities, types, tests, and assets before creating replacements.
4. Identify the smallest coherent change and list the files expected to change.
5. Ask a question only if a missing detail blocks safe progress; otherwise choose a reasonable reversible default.

## During implementation
- Make focused edits; do not regenerate or rewrite the entire project for a small feature.
- Reuse existing components, styles, hooks, state models, and assets.
- Avoid duplicate dependencies and unnecessary packages. Prefer installed libraries and browser-native APIs when suitable.
- Do not paste or reread the full skill pack on every task. Load only the one or two skill files relevant to the current task.
- Keep stable decisions in project files (`AI_RULES.md`, `docs/architecture.md`, or feature specs), not in repeated chat messages.
- Keep chat prompts concise and reference exact file paths and acceptance criteria.
- Do not ask the model to explain code it just wrote unless explanation is needed to make a decision.
- For visual iterations, describe the exact visible difference and affected area. Avoid asking for a full redesign when only one room, character, or panel needs adjustment.

## Verification
- Run the narrowest relevant check first (typecheck, targeted test, or build), then broader checks when the change affects shared architecture.
- Never skip verification to save tokens.
- If a command fails, inspect the first meaningful error and its relevant source; do not dump enormous logs unless necessary.
- Summarize only: changed files, checks actually run and results, known limitation, next action.

## Context management
- Maintain a short `docs/PROJECT_STATE.md` with: current phase, working features, architecture decisions, known issues, last successful build/test, and next task.
- Update that file after a meaningful milestone. Keep it factual and under roughly 150–250 words.
- At the start of a new session, give the agent `AI_RULES.md` plus `docs/PROJECT_STATE.md`; provide extra skill docs only when needed.
- If context becomes long, ask the agent to summarize decisions and current state into `docs/PROJECT_STATE.md`, then start a fresh chat and continue from those files.
- Do not store credentials, API keys, personal data, or `.env` values in project-state files.

## Compact task prompt template
Use this structure:

```text
Goal: [one result]
Relevant files: [paths, or ask you to inspect only the relevant files]
Constraints: [important boundaries only]
Acceptance criteria:
- [observable result]
- [test/build required]
Use the relevant skill in docs/skills only if needed. Make the smallest coherent change. Report changed files and verification results briefly.
```

## Token/cost discipline
- Prefer the smallest model that reliably completes the task; escalate only when blocked by a complex architectural or debugging problem.
- Do not send secrets or unnecessary project history to any model.
- Avoid repeated full-project summaries; maintain one concise project-state file.
- Do not force ultra-short output when detail is needed to prevent bugs. Correctness takes priority over token savings.
