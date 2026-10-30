# Task 11.1 bounded phone remote-node authoring acceptance

Based exactly on `ca07be834b3f0e640870a06c5d0c98099aa76988`, isolated worktree `/tmp/puni-phone-authoring`, branch `proof/phone-cross-project-authoring`. This packet extends the existing desktop whole-to-whole case with phone remote-node creation. Parent tasks 9.2 and 11.1 stay open.

The new `AuthorPhone` project begins with no successor-owned external relationship. A real Chromium phone context (390×844, touch/mobile enabled) opens Add details, the production Depends on sheet and its actual picker. Lowercase `axx` discovers `Project AXX - A`; selecting the project establishes `AXX.` without writing. Selecting its qualified `AXX.010.s1-dev` node creates a remote-node → local-whole FS relationship, as required by the one-click rule in [the editor ruling](architecture/autocomplete-editor.md). The test checks the exact successor-owned command URL, full `addTypedDependency` payload with the remote project's actual row/step UUIDs, accepted HTTP 200 and complete response with the generated ID. The SQLite fixture projection must contain exactly the expected organization, endpoint projects, rows, scopes, remote step, null local step, FS type and returned identity.

Reload/reopen renders the qualified captured relationship and retains the exact remote-node and local-whole selector tuples. After a fresh resume and ping/pong barrier, a real upstream completion renders the phone's accessible Reading: Waiting state, installs an authoritative tree sequence, adds exactly one completion notification and preserves the SQLite relationship. The test attaches the accepted command/response, persisted rows, reads and socket frames. No interception supplies the authoring, lookup, tree or completion path.

Only the existing `syntheticExternalCommands: true` fixture seam enables external writes. No production authoring policy changes. The document mounts the dedicated fixture App with ordinary runtime/HTTP/organization composition and manually installed fixture auth cookies; this is not production root router, registration or login acceptance.

## Watched production faults

The retained [Bun harness](evidence/task11-phone-author/mutations.ts) runs each fault separately through the configured browser target with `--grep 'phone alphabetical discovery'`, requires exit 1 and its named assertion, and restores original bytes in `finally` and cancellation handling. These are production-path behavior assertions; source strings only locate injection sites.

- Widen the external add branch's stored remote node to whole scope. HTTP creation still succeeds and the exact SQLite assertion fails on node/remote-step versus whole/null.
- Suppress production alphabetic project discovery. The phone's `Project AXX - A` button is absent and its visible-button assertion fails.
- Reverse persisted endpoint coordinates and project ownership. HTTP creation still succeeds but the intended successor's SQLite set is empty and the exact owner assertion fails.

Adjacent `Proof:` comments identify each observed fault. See [exit receipts](evidence/task11-phone-author/mutations.json) and the adjacent negative logs. All injected production edits restore exactly before the next fault.

## Verification and limits

Checks use the matching existing root dependency tree through an untracked `node_modules` symlink; no fresh install was attempted on the nearly full shared disk. Root/worktree `bun.lock` SHA-256 matches `ce438c27003f3ac7cbf0ab95019c9058dfcb10707be6310871de680cda8b471b`. Nx commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache`.

- Configured browser: `bunx nx run wbs-fe-01:e2e-cross-project --skip-nx-cache`, exit **0**, **9 passed in 1.4 minutes** on restored sources. [Output](evidence/task11-phone-author/browser-final.log).
- Frontend and backend configured typechecks, including module prerequisites: exit **0** each. [Frontend](evidence/task11-phone-author/frontend-typecheck.log), [backend](evidence/task11-phone-author/backend-typecheck.log).
- Configured frontend lint: `bunx nx run wbs-fe-01:lint --skip-nx-cache`, exit **0**. [Output](evidence/task11-phone-author/frontend-lint.log).
- Changed-file ESLint (browser, fixture, proof harness) and proof-harness TypeScript: exit **0**, silent success. [ESLint](evidence/task11-phone-author/eslint.log), [TypeScript](evidence/task11-phone-author/harness-typecheck.log).
- Dormant production control: `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --test-name-pattern 'mounted external authoring stays dormant'`, exit **0**, **1 pass, 128 filtered, 13 assertions**. [Output](evidence/task11-phone-author/dormant.log).
- OpenSpec: `bunx openspec validate --all --json`, exit **0**, **274 passed / 0 failed**. [Summary](evidence/task11-phone-author/openspec-summary.json).
- Explicit Prettier checks: exit **0**. [Output](evidence/task11-phone-author/format.log). `git diff --check`: exit **0**.

An initial sandbox browser attempt exited before assertions; browser receipts use the localhost-capable execution boundary. The test first failed on its absent dedicated fixture, then exposed test-authoring errors: empty phone fields require Add details, and phone readings use accessible text rather than the desktop-only attribute. Those failures are not counted as R5 proofs.

No full frontend/solver/API/conformance suite, full repository gate, build, exact-SHA host gate, hosted CI, deployment, push, merge or activation was run. Broader descendant scopes, SS/FF authoring, abbreviation/navigation, full task 11.1 and production activation remain open. This bounded packet does not claim release readiness.
