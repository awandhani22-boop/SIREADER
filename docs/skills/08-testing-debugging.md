# Skill 08 — Testing, Debugging, and Delivery

## Mission
Make every iteration verifiable and easy to roll back.

## Required checks
- `npm run build` must pass after meaningful code changes.
- Run the project's typecheck/lint/test scripts when they exist.
- Check browser console for runtime errors and missing assets.
- Verify default camera, camera controls, selection, worker panel, assign task, pause/resume, and activity feed.
- Test all seven workers and all status-to-animation mappings.
- Test empty/loading/error states.

## Change procedure
1. Inspect relevant files and package versions.
2. Describe plan and exact files to modify.
3. Implement a small coherent change.
4. Run checks.
5. Fix newly introduced failures.
6. Summarize changed files, results, and remaining limitations.

## Regression rules
- Do not remove working interactions to make build pass.
- Do not replace the full project with a new template during a feature update.
- Do not update major dependency versions without explaining the need.
- Keep a backup before large changes.
- Clearly report when an asset, browser check, or build could not be verified.

## Delivery report format
- Implemented:
- Files changed:
- Commands/checks run:
- Build/test result:
- Browser issues:
- External assets/permissions needed:
- Known limitations:
- Next step:


## Phase 2.2 dispatcher verification
- Run the full Node test suite with `npx tsx --test src/**/*.test.ts` (the current `package.json` does not define an `npm test` script).
- Run `npm run lint` (TypeScript `tsc --noEmit`) and `npm run build` after shared runtime/store/UI changes.
- Use `git diff --check` and inspect the exact changed-file list before committing. Confirm the intended branch and parent commit before creating a commit.
- Dispatcher regression coverage should include priority/FIFO ordering, capability matching, blocked reasons, enqueue/dispatch lifecycle, deterministic ticks and seeded demo generation, pause/resume/reset behavior, diagnostics synchronization, legacy API compatibility, and UI/store queue/activity behavior.
- Report test declarations separately from tests actually executed. Report browser/manual QA separately; do not claim it passed unless performed.
