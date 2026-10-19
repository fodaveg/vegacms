# H-02: configuración runtime bajo base path

Task: ae926f52-4a14-49d7-8c50-8b230711cec9
Base: ce0a3d44c9a6f36fda295ca44750d0227777b883
Worktree: /private/tmp/vegacms-config-base-20261018
Branch: fix/config-base-path-20261018
Candidate commit: 13b04bffa00d88647e892e37db4595e0671d70e4
Verified tree: 1caaa4075729c560fc6d5537a22de0c044004323

Both config fetches now use SvelteKit base. Root remains /vega.config.json; /admin uses /admin/vega.config.json. No change to backend URL or /api endpoint semantics.

## Evidence

Working directory for all checks: worktree above. Explicit Node v22.22.3 from $HOME/.nvm/versions/node/v22.22.3/bin/node; node_modules symlink reuses canonical existing dependencies without installing. Actual Vitest version 4.1.10 (existing dependency resolution).

- Prerequisite: node node_modules/@sveltejs/kit/svelte-kit.js sync, exit 0.
- Red: explicit Node22 + node_modules/vitest/vitest.mjs run src/lib/session/backend.dom.test.ts src/lib/session/BackendUrlForm.svelte.test.ts, exit 1: 2 /admin behavioral failures, 37 passing. red.log.
- Green: same command on verified candidate, exit 0: 39/39 passing. green.log.
- ESLint: explicit Node22 + node_modules/eslint/bin/eslint.js on the four changed files, exit 0. eslint.log.
- Prettier: explicit Node22 + node_modules/prettier/bin/prettier.cjs --check on the four changed files, exit 0. prettier.log.
- git diff --check, exit 0; all four file diffs reviewed.

Tests only return config JSON for the exact expected URL, and check resolved backend URL or mounted component auth text, not source patterns. New /admin cases failed before product patch while root cases passed.

## Additional checks on the same committed tree

- Explicit Node22 + node_modules/vitest/vitest.mjs run src/lib/session: exit 0, 10 files / 108 tests passed. session.log.
- Explicit Node22 + node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json: exit 0, 0 errors, 0 warnings. check.log. Combined with prior sync this is the package check equivalent.
- git status --short empty after commit; HEAD tree matches verified tree above.
- Final df: 49,200,000 KiB available (46.9 GiB). No cleanup performed: worktree remains active for root review and all generated outputs are small. No dependency installs or heavy builds occurred; initial df not sampled by this agent because no heavy operation was planned. Root sampled approximately 47 GiB before extending checks.

## Limits and remaining validation

Remaining full gate coverage (global lint, PocketBase download/verification, all JS/Go tests, build, E2E) and bundle budget remain pending at root. No integration, push or deployment. No browser build or HTTP serving under /admin exercised by this agent.

pnpm exec in this symlinked worktree attempted dependency install and aborted before proceeding (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY). No install was approved or run. Use direct Node22 CLI commands for reuse. Ambient node in this /private/tmp worktree resolved Node26 and gave localStorage undefined; explicit Node22 fixed runner environment without product changes. red.log reflects the valid Node22 behavioral failure, not that initial environmental failure.

Logs and candidate.patch are local evidence in canonical repository .verification/config-base-20261018, outside /tmp. Worktree and generated .svelte-kit retained for root review/gate. No regenerable cleanup done because candidate is active; no build/heavy suite or dependency install occurred.
