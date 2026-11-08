# Task 11.1 browser address acceptance audit — 2026-10-23

Audited and tested exact feature commit `f587dcb2cfb06968997dfbdc371d959c87f9197b`
on `pop-os`, in isolated clone `/tmp/puni-browser-address` with its own Git
metadata. The shared checkout was not changed. This packet adds evidence only;
parent Task 11.1 remains open.

## Existing substantive coverage

The existing [real browser specification](../../../apps/wbs/fe-01/e2e/cross-project-refresh.real.spec.ts)
already contains the requested cases; no duplicate scenario or runtime change
was needed:

- Desktop alphabetical discovery selects `AXX`, creates a qualified whole-to-whole
  FS dependency through accepted HTTP, verifies the exact persisted SQLite
  relationship, reopens after reload and observes completion-driven tree refresh.
- Abbreviation editing uses the actual Project settings field and PATCH, requires
  canonical `NAV_NEW2` from persisted reload, retains every relationship coordinate
  and its identity, requires the original UUID-based anchor under the new label,
  then clicks it and requires the source-specific tree and work-item focus.
- Phone alphabetical discovery selects a remote node, verifies accepted HTTP and
  the exact stored project/node/owner tuple, reopens after reload and observes
  completion-driven refresh.

The dedicated [Playwright configuration](../../../apps/wbs/fe-01/playwright.cross-project.config.ts)
uses one Chromium worker, zero retries, a fresh composed backend and production
gateway on ports 7500/7501, and Vite on 7600, with server reuse disabled.
These are real browser/HTTP/SQLite assertions, not fabricated success responses.
The fixture's explicit `syntheticExternalCommands: true` writer seam remains
test-only; production authoring is dormant.

The prior [abbreviation/navigation receipt](verify-task11-abbrev-navigation.md),
[desktop discovery receipt](verify-task11-browser-author.md) and
[phone discovery receipt](verify-task11-phone-author.md) retain the watched
production-source fault proofs. No safety predicate, production source or test
changed in this audit; those faults were not rerun and this packet does not claim
new R5 proofs or a new TDD cycle.

## Fresh verification

Locked dependencies were reused through an untracked `node_modules` symlink to
`/home/df/wd/puni/puni-00/node_modules`; no install was performed. Fresh SHA-256
of both lockfiles was
`ce438c27003f3ac7cbf0ab95019c9058dfcb10707be6310871de680cda8b471b`.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:e2e-cross-project --skip-nx-cache -- --grep 'abbreviation edit|alphabetical discovery'`:
  **exit 0, 3 passed, 43.6s browser time**. Executed with localhost-capable
  permissions. [Output](evidence/browser-address-audit/focused-browser.log).
  The initial restricted-sandbox attempt exited 1 before any test output;
  [its output](evidence/browser-address-audit/restricted-attempt.log) establishes
  no behavior result and does not identify a specific underlying failure.
- `bun test --preload ./tools/test/scratch/preload.ts apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts -t 'mounted external authoring stays dormant'`:
  **exit 0, 1 passed, 128 filtered, 13 assertions**. The mounted control requires
  empty advertised semantics, HTTP 409, and unchanged persisted effects after
  refusal of a batch whose earlier local edit succeeded.
  [Output](evidence/browser-address-audit/dormant.log).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:install --skip-nx-cache`:
  **exit 0**; normal pre-commit and commit-message hooks installed in this clone.

## Remaining acceptance gap

The existing navigation case substitutes only the root document with the dedicated
fixture HTML while retaining the actual anchor URL and real APIs. Its explicit
organization resource scope bypasses production authentication/onboarding/root
composition. It therefore proves stable link construction and destination focus
inside the dedicated composition, not production root/login routing. No production
activation was enabled.

A concrete next test is a separately configured browser case that serves the
production root, signs into an organization with two seeded projects, edits the
source abbreviation in General, reloads the target and clicks its captured
predecessor link without document interception. It must require the exact source
project/work-item IDs, source-specific tree response and focused row after the
production session and organization providers resolve. That fixture needs explicit
test-only dependency authority while a separate mounted control continues to
require dormant production authoring; it must not enable runtime activation to
make the test pass.

The full browser matrix, full frontend/solver/API/conformance suites, runtime
typecheck/lint/build, OpenSpec validation, full workspace gate, exact-SHA host gate,
hosted CI, deployment and activation were not run. No changed runtime or test
source required those checks for this evidence-only audit. No push or remote host
mutation was performed.
