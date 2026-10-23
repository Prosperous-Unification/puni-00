# Task 11.1 bounded alphabetical discovery and new authoring acceptance

Based on `228c7314ce9915841cd404a2a4cc0428a4662edd`, branch `proof/task11-browser-author`, isolated worktree `/tmp/puni-task11-browser`. This packet adds browser acceptance and one unlinked fixture project. Parent task 11.1 stays open.

The configured real-stack suite now starts with no relationship owned by the new `Author` project. A real desktop browser types lowercase `axx` into the production dependency picker, observes and chooses `Project AXX - A`, observes the qualified `AXX.` prefix and chooses `AXX.010 - A row`. Selection sends the actual successor-owned command HTTP request. The case requires HTTP 200 and its complete accepted creation response, then reads the real fixture SQLite database and checks the exact organization, both project/work-item/scope/step coordinates, FS type and generated relationship identity. Both endpoints are whole-work-item scope; their step coordinates must be null. The returned command identity must equal the persisted identity.

A full page reload reopens the captured dependency and shows `AXX.010`. Real upstream completion then changes the successor's installed node reading from unknown to waiting, increases authoritative tree reads, installs the returned sequence and receives exactly one new `elsewhere_changed` socket frame after a real reload resume and ping/pong barrier. Earlier reset replay frames are counted before that barrier. The relationship remains persisted. Playwright attaches the accepted response, rows, tree reads and frames. No route intercept, synthetic picker choice or substituted refresh callback supplies this new path.

Only the existing explicit `syntheticExternalCommands: true` harness seam enables fixture writes. Production authoring remains dormant. The unchanged production control `mounted external authoring stays dormant and rolls back an earlier successful command` passed: **1 pass, 128 filtered, 13 assertions**, including empty advertised semantics, HTTP 409 refusal and rollback. [Control output](evidence/task11-browser-author/dormant.log).

## Watched production-path negatives

Each fault was applied independently, and the production source was restored in a Python `finally` block before the next run. [Exact mutation runner](evidence/task11-browser-author/mutations.py.txt), [exit receipts](evidence/task11-browser-author/mutations.json).

- Suppress alphabetical discovery in `use-dependency-search.ts` by requiring an already selected project. The real picker never exposes `Project AXX - A`; its visible-option assertion fails, exit **1**. [Browser assertion](evidence/task11-browser-author/discovery-negative.log).
- Reverse persisted predecessor/successor coordinates and project ownership in the SQLite repository's external `add` branch. The browser still observes accepted HTTP **200**, but the exact intended successor's SQLite relationship set is empty and the persistence assertion fails, exit **1**. [Browser assertion](evidence/task11-browser-author/owner-negative.log).

Adjacent `Proof:` comments identify the observed failures. Both production source diffs are empty after restoration. Initial test-authoring mismatches (creation response includes an ID; captured dependency closes with Back to dependency picker) were corrected and are not R5 evidence. An initial full-suite run passed six cases and failed the new case because its total-frame assertion included an earlier reset replay; the final case establishes a new socket barrier and counts the completion delta.

## Verification

All commands ran in this isolated worktree. Nx commands used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache`.

- `bunx nx run wbs-fe-01:e2e-cross-project`: exit **0**, **7 passed (1.2 minutes)**. [Full browser output](evidence/task11-browser-author/browser-final.log).
- `bunx nx run wbs-fe-01:typecheck`: exit **0**, including module prerequisite. [Output](evidence/task11-browser-author/fe-typecheck.log).
- `bunx nx run wbs-be-01:typecheck`: exit **0**, including module prerequisite. [Output](evidence/task11-browser-author/be-typecheck.log).
- `bunx eslint apps/wbs/fe-01/e2e/cross-project-refresh.real.spec.ts apps/wbs/be-01/src/testing/cross-project-browser-server.ts`: exit **0**, silent. [Output](evidence/task11-browser-author/eslint.log).
- `bunx nx run wbs-fe-01:lint`: exit **0**. [Configured frontend lint output](evidence/task11-browser-author/fe-lint.log).
- Explicit Prettier checks over the changed code, Markdown and evidence JSON: exit **0**. `git diff --check`: exit **0**.
- `bunx openspec validate --all --json`: exit **0**. [Summary](evidence/task11-browser-author/openspec-summary.json). A separate `--strict` validation of this change returned exit **1** on existing long-requirement warnings; it is not counted as passing.

`bun install --frozen-lockfile` failed with ENOSPC. Only this task's partial `node_modules` installation was removed, recovering its allocated disk. Checks reused the existing root dependency tree through an untracked worktree `node_modules` symlink; the root and worktree `bun.lock` hashes match (`ce438c27003f3ac7cbf0ab95019c9058dfcb10707be6310871de680cda8b471b`), but a fresh frozen install is unverified. The initial sandbox browser attempt could not run its localhost stack; browser receipts use the localhost-capable execution boundary. Logs retain existing NO_COLOR/FORCE_COLOR and Vite configuration warnings.

This bounded desktop whole-to-whole FS slice does not establish phone creation, node/descendant endpoint creation, abbreviation editing and stable navigation, every task 11.1 scenario, production activation, full frontend/solver/API/conformance gates, deployment or release readiness. Those checks, build and exact-SHA host gate were not run. No push or integration is part of this packet.
