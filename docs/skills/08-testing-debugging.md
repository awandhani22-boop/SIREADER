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
