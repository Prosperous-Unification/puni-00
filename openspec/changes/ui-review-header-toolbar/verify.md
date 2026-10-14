# Verify

All runs 2026-10-13 in `/home/df/wd/puni/ui-header-toolbar`, Chromium on Linux,
`E2E_PORT_SHIFT=550` (500 collided with another lane's gw-01 on 4700).

## Commands and results

- `bunx nx run wbs-fe-01:test --skip-nx-cache` — 74 + 193 + 4 test files passed.
- `bunx nx run wbs-fe-01:test:unit` — 74 files passed.
- `bunx nx run wbs-fe-01:typecheck`, `lint:fast` — passed. `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 187/187 valid.
- Playwright: `header, home, toolbar-panels, project-settings, optimization-cue, mobile,
dark-mode, project-picker, plan-import, import-with-ai, name-markdown, tailwind, hints,
directory, spaces, status, plan-surface, keyboard, reference-cell-panel, live-caret,
organization` — 154 passed, 3 failed on the first run (a native `title`, a brand-click
  helper, a focus race in the new F-007 case), each fixed and re-run green (35 passed);
  `layout, gantt, attempts, steps, deadline` — 126 passed, 1 skipped.

## R5 proofs (observed failures)

Each new browser case was run against `origin/main` (worktree `ui-header-toolbar-base`) or
with the named fault injected; the observed text is the adjacent `Proof:` comment:

- F-028 all five panels `open=true focused=false`; unit: `expected true to be false`, and
  the `defaultPrevented` guard dropped `expected false to be true`.
- F-030 `Columns is clipped by 162px`; cue `Received string: "scroll"`.
- F-004 `Expected: 1 · Received: 2`; F-031 seven bordered items listed.
- F-005 `planWith: 85, resetTop: 85` against Starts 49.
- F-016 Undo moved `876.09375` → `950.609375`. F-007 `element(s) not found`.
- F-011 `1024: picker 53px`, `900: picker 26px`, no ellipsis at 1280/1024/900.
- F-010/F-041 heights `[32, 32, 32]`; F-047 header `101`.
- F-017 `lit: false`; `border: "2px"` with `border-0` dropped.
- F-018 `Unable to find … heading … "Offline"`; presence slot `expected [ …(3) ] to deeply equal []`.
- F-019/F-027 `Unable to find role="region" and name "No project open"` (Vitest and browser).
- F-024 `expected null not to be null`.
- Toolbar pins re-pinned to 1332.5 / 1630, itemised child by child against origin/main
  (Export +45.41, icons −18, schedule group ±0). An extra `Squad` button failed both
  pins at the earlier figures (`Received: 1406.1875`, `1703.59375`).

## After the Fable review (2026-10-13)

- Merged `origin/ui-review/phone` (#399); the toolbar's fragments now serve both
  faces: the Find count sits in the box on the desktop bar and on its own line in the
  sheet; the schedule group is the desktop return's; square icon buttons are desktop
  only; the sheet's in-place panels drop the window cap and the scroll shadow.
- F-011 test now measures the roster's own section (it measured the Saved plans
  shelf). With the collapse back at `xl` it failed on `1280: cut local-dev (you)`;
  the roster now collapses below 1440 and wraps whole names.
- Escape after Tab-out: a panel closes when the focus leaves it (unit: `expected true
to be false` without the listener; browser: `Expected: false · Received: true`).
  One panel at a time: without the toggle listener the keyboard case listed both
  `Filters` and `Views`.
- The focusout close first closed on the event's `relatedTarget`; in the phone sheet a
  tick-box label click passed the focus through the sheet's surface and `mobile.spec.ts`
  `makes the row of a tick box the tick box` crashed the tab (3/3). It now judges where
  the focus landed a task later. CI then failed `status.spec.ts` (the Columns panel closed
  under its tick when the page moved the focus by itself), so only a Tab pressed inside
  the panel arms the close (unit: `expected false to be true` without the Tab guard).
  toolbar-panels, status, mobile, import-with-ai, header: 60 passed.
- Sheet panels: with the sheet rule's reset taken out, `Received: "640px"`.
- Import JSON from the No project open card opens the imported project
  (`e2e/home.spec.ts`).

## UI integration restack — 2026-10-14

Prepared in the isolated clone `/tmp/puni-ui-integration-restack`, branch
`candidate/ui-integration-restack`. Composition commit `ff5f5fd87` has first parent
reviewed organization context/selection #405 at
`9fef922631dda1be513edde718fdd3b74c154256` and second parent original UI integration
#417 at `f24b7354d6e5f2f0b978aebedcd409a22dce5d72`. Commit `bc17c9e86` then merges
current main `8f324607e6c73c249faa79733c4cb7a7dddc605b` without conflicts. No push,
merge to the remote main branch, host gate, or #442 session feature work is included.

### Preservation and conflict choices

Against common base `db78a3244fa74fdc34e0e89317bbb261457d712d`, the original UI
integration changes 252 files and #405 changes 132. Exactly five overlap:
`organization-access.ts`, `organization-page.test.tsx`, `space-access.ts`,
`spaces-page.test.tsx`, and `spaces-page.tsx`. The other 247 original integration
files remain byte-identical after both composition merges. The phone, header/toolbar,
settings pages and plan table branch heads are all ancestors of the candidate.

Only two files required manual conflict resolution:

- `space-access.ts`: retained #405's `organization_context_changed` page refusal
  and its existing proof, and retained #417's required page-detail field. The
  context refusal now supplies “Reload to see the spaces in your selected
  organization.” as that detail.
- `spaces-page.tsx`: retained #405's `useResourceClient` organization scope and
  #417's `cn` presentation import. The module-global unscoped client stays removed.

The three other overlapping files merged automatically: #405's context refusal
handling and organization-aware test harnesses coexist with #417's rendered access
states and copy. Before the current-main merge, every difference from old #417 was
inside #405's changed-file set. Current main changed no frontend files, WBS library
files, `package.json`, or `bun.lock` relative to composition `ff5f5fd87`.

### Verification

- `BUN_TMPDIR=/tmp/puni-ui-bun-tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-ui-bun-cache bun install --frozen-lockfile`
  passed: 1573 installs across 1447 packages checked, no changes. The first attempt
  without a writable Bun temporary directory exited with EROFS; it is not evidence
  of a dependency failure.
- `NX_DAEMON=false bunx nx run-many -t lint,typecheck --projects=wbs-fe-01 --skip-nx-cache`
  passed all three frontend lint, module typecheck and application typecheck tasks,
  without cache. Nx reported sandbox plugin socket denial and used its documented
  main-process fallback.
- `CI=1 bunx playwright test --config apps/wbs/fe-01/playwright.organization.config.ts`
  passed 1/1 against its dedicated activated real backend fixture, with local
  listener permission.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` on `bc17c9e86` passed
  190/190 entries, zero failures. The pre-main composition passed 189/189.
- Prettier on every added/modified staged supported file passed. A first command
  included a deleted path and was rejected; rerunning with `--diff-filter=ACMR`
  passed. `git diff --cached --check` passed.
- `git merge-tree --write-tree HEAD origin/current-main` exits 0 with tree
  `bdd3cd715dda238c4330717b64a38c16d041d34c` before this evidence-only edit.
- Normal hooks installed with `tool-git-hooks:install`; the composition commit's
  lint, formatting, plaintext-secret and private-nesting checks passed. Migration
  checks had no matching files. Tool Wiki explicitly reported inactive because its
  external activation root is not provisioned; no certification is claimed.

Frontend suite and selected ordinary browser results are recorded below when the
runs finish. The initial sandbox frontend test attempt ended at its node-tier
command without Vitest results (exit 130); the permission-enabled rerun is the
verification run. Exact-SHA host gate, CI, full ordinary browser coverage, backend
checks, and changes outside the requested frontend scope remain unverified here.

### Observed composition regressions and repairs

The ordinary browser command was
`CI=1 E2E_PORT_SHIFT=3550 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts header home toolbar-panels mobile plan-table-review settings-layout page-states layout project-settings reference-cells external-refs`.
It finished **151 passed, 1 failed** (10.9m). The failure was the Organization
local-mode recovery case: an organization panel's `no_active_organization` refusal
withdrew the legacy runtime and replaced the useful page-level access state with
organization selection, which is unavailable in local mode. The trace showed two
alerts and no “Open the plan” link. This was a production integration failure.

The repair keeps `no_active_organization` and `not_a_member` at page level when the
captured resource scope is explicitly `legacy`. Active organization scopes still
withdraw on both errors; unauthenticated, changed-context and credential refusals
keep their existing withdrawal behavior. This restores the existing legacy
permissions/behavior requirement and UI recovery, without editing the #405 branch.

R5/TDD proof: new production HTTP-boundary tests first ran before the guard;
**2 legacy cases failed, 7 passed** (`/tmp/puni-ui-legacy-red.log`), because each
legacy refusal unexpectedly called the runtime withdrawal callback. The guard's
adjacent `Proof:` comment names those failures and the observed browser failure.
Tests also explicitly require withdrawal for both refusals in an active scope.
After repair, all **4 page-states browser cases passed** (19.1s), and the dedicated
real-organization browser case passed again **1/1** (8.1s).

The full frontend attempt passed the node tier (**74 files, 928 tests**), then the
UTC DOM tier finished **197 files passed, 1 failed; 3923 tests passed, 1 failed**.
Its sole failure was a #405-added context-refusal test expecting the old headline
“No organization is selected for this session.”, while #417 intentionally renders
“This session has no organization.” The assertion now matches that UI copy and
still requires the Members panel to be absent. This test failure is separate from
the runtime withdrawal bug.

The final six affected runtime, organization/refusal and spaces suites passed
**65/65 across 6 files** (`/tmp/puni-ui-legacy-green.log`). The separately executed
Pacific/Auckland tier passed **5/5 across 4 files** (`/tmp/puni-ui-zoned-final.log`).
The complete DOM suite was not repeated after these focused repairs, so no fully
green final frontend run is claimed. Full ordinary browser coverage beyond the
152-case selection, backend checks, exact-SHA host gate and CI remain unverified.

Final repair checks: uncached `wbs-fe-01:test:unit` passed **928 tests across
74 files**. Uncached `wbs-fe-01` lint, module typecheck and application typecheck
passed again. OpenSpec passed **190/190**, and Prettier plus `git diff --check`
passed on all repair/evidence files. These final checks ran after the repair.

### Hosted keyboard activation race repair — 2026-10-14

At exact commit `7d7bf3b7e814c602dad04875312b07093a1cf112`, hosted pixels
shard 4/4 failed `opening one popover by the keyboard closes the other (F-028)`:
its 30s poll expected `['Views']` and ended with `['Filters']`. The isolated
unchanged reproduction also failed once across ten cases: **9 passed, 1 failed**.
The preceding commit `9e08f26478fae41eb08385dada7eedcff290d768` has identical
frontend source; the intervening change touches only the MCP test fixture.

Both retained traces show the first poll returned `['Filters', 'Views']`, followed
by `['Filters']`. Views received activation and opened. The older Filters `toggle`
notification, queued by native disclosure activation, then closed the newer Views
panel before its own toggle listener ran. This is a production event-order race.
Vite EPIPE messages appeared in passing local cases too; their presence alone does
not establish the cause.

`useClosedOnDismiss` now closes peers synchronously during summary click
activation, including the native click generated by Enter or Space, before native
activation queues its toggle notification. The toggle listener remains for
programmatic disclosure state changes. This restores the existing one-open-panel
behavior without changing the browser test or its timeout.

TDD and R5 proofs, exercised through the production hook:

- The new deterministic `keeps the latest activated panel open before queued
toggles settle (F-028)` case activates both native summaries in one task. Before
  repair it failed with `['Filters']`; the other seven hook cases passed.
- Removing only the new synchronous click listener after repair failed the same
  case with `['Filters']`: **1 failed, 8 passed**. The listener was restored.
- Removing only the retained toggle listener failed `closes the previous panel
when disclosure state changes without summary activation` because Filters
  remained open: **1 failed, 8 passed**. The listener was restored.
- Adjacent `Proof:` comments name both injected faults and observed failures.

Final focused verification in `/tmp/puni-toolbar-ci-sol`:

- From `apps/wbs/fe-01`, `BUN_TMPDIR=/tmp bunx vitest run --config
vitest.config.ts src/components/wbs/close-on-dismiss.test.tsx
src/components/wbs/plan-toolbar.test.tsx`: **41 passed across 2 files**, including
  Tab dismissal, programmatic focus changes, Escape and owned-dialog behavior.
- `CI=1 E2E_PORT_SHIFT=3900 BUN_TMPDIR=/tmp bunx playwright test --config
apps/wbs/fe-01/playwright.config.ts toolbar-panels -g 'opening one popover'
--repeat-each=10`: **10 passed (1.1m)**. This is a bounded diagnostic repetition;
  the production gate still has zero retries.
- The same isolated browser command without `-g` or `--repeat-each`:
  **all 10 toolbar cases passed (45.2s)**, including phone panels and keyboard Tab.
- Targeted ESLint on both changed TypeScript files: **exit 0**.
- `BUN_TMPDIR=/tmp bunx tsc --build --force
apps/wbs/fe-01/tsconfig.app.json`: **exit 0**.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`:
  **197 passed, 0 failed**.
- Prettier on the changed files and `git diff --check`: **passed**.

Frozen Bun installation passed with `BUN_TMPDIR=/tmp`; the initial unqualified
attempt was refused because Bun's temporary directory was read-only. The first
sandbox browser attempt ended before cases ran; the actual browser runs used
local-listener permission. A first root-directory Vitest command found no files;
all reported test counts are from the correct app-directory command. Full frontend
coverage, other browser shards, new hosted CI and the exact-SHA h2puni gate remain
unverified in this worker; release verification belongs to the integration lane.
