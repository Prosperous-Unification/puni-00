# verify — `contextual-links-default`

## 2026-09-03 recovery run 2

Implementation through `825e251e` separates the initial hidden-Links baseline
from the project-data-derived reset target, persists only the reset-shown bit,
and keeps live link changes from mutating the stored layout. Tests cover the
40px folded/pinned delta, first visit with existing links, marker validation and
reload, explicit-column precedence, first/last-link stability, and a linked
descendant hidden by a collapsed branch.

### h2puni evidence

- Bun `1.3.14`.
- Focused table-frame/layout/settings/Steps run: **166/166 passed** at
  `a30d742d`.
- Expanded layout run after the collapsed-descendant case: **69/69 passed** at
  `825e251e`.
- Plan Cards plus Directory dependent suites: **165/165 passed** at
  `901ce9ee`; Plan Table: **45/45 passed** after its refs-shown fixture moved to
  explicit storage at `7cf603a8`.
- `fe-01:typecheck`: passed. Touched Prettier: passed. Touched ESLint: zero
  errors and one pre-existing `react-hooks/exhaustive-deps` warning in
  `wbs-table.tsx`.
- The unbounded full FE suite was attempted once and killed by the h2puni host
  before a verdict; it is **not** counted as a gate. The bounded affected suites
  above completed normally.

No build or autotest ran on h1claw. Remaining watched-red mutations,
controlled-read race coverage, browser pixels, full remote gate, CI, and
terminal reviews remain.

### Watched red

- At exact implementation head `ee48233a`, removing `refs` from
  `INITIAL_HIDDEN_COLUMNS` made `keeps Links hidden on a first visit even when
the project already has a link` fail on the unexpected `refs` header: **1
  failed, 68 skipped**. The mutation was not retained.

## 2026-09-03 recovery run 4

The browser fixtures now preserve the explicit refs-shown layout where their
existing geometry and interaction assertions require it. The external-refs
fixture instead waits for the linked project tree and uses the real Reset layout
gesture. A new Chromium case proves that a fresh hidden-Links layout removes
exactly 40px and leaves Name pinned at 129px rather than the refs-shown 169px.
The mobile Gantt-only reset now proves both column storage keys are untouched.

### h2puni evidence

- Bun `1.3.14`; exact implementation base `86200e85` plus the recorded browser
  fixture patch.
- Saved-view marker precedence: **2/2 passed together**. Full modified suites:
  `plan-layout` **73/73**, `plan-filter` **61/61**.
- Mobile Gantt-only reset: **1/1 passed**. External refs Chromium file:
  **6/6 passed**, including the 390×844 no-card-field assertion.
- Targeted layout Chromium gate: fresh hidden width, pinned shown geometry,
  horizontal-scroll pinning and keyboard tab order **4/4 passed**; the existing
  1280px folded-budget case then passed **1/1** after its expected arithmetic
  was made explicit about the refs-shown fixture.
- `fe-01:typecheck`: passed. Touched Prettier and ESLint: passed. OpenSpec
  strict all: **34/34 passed**.
- Exact head `0a20f880` focused `table-frame` + `plan-layout` + `plan-cards`:
  **238/238 passed**. Full-repository `nx format:check --all`: passed after
  formatting the controlled-read case and this evidence file. A full FE lint
  attempt saturated h2puni until SSH stopped responding and was terminated
  without a verdict; the touched-file lint above remains the counted result.

### Watched red

- Reintroducing hidden `refs` into `leafColumnIds` made the fresh-layout
  Chromium proof fail at Name **169px instead of 129px**: the exact 40px pinned
  gap the visible-only layout contract forbids.
- Removing the reset-marker clear from the explicit column writer made the
  saved-view proof fail on **`expected 'true' to be null`**.
- Initializing the successful-read marker from `projectId` exposed Reset before
  the held first read and failed on the unexpected button.
- Deriving the reset target from root rows rather than the flattened whole tree
  removed Reset for a linked child under its collapsed parent; the descendant
  proof failed before the click.
- Omitting the external-refs fixture's real Reset gesture made Chromium time out
  waiting for `Links for 010`, proving visible-Links browser cases cannot pass on
  the fresh hidden baseline by accident.

Every mutant was confined to the h2puni gate checkout and then replaced with
the exact production files; local and remote SHA-256 values matched afterwards.

No build or autotest ran on h1claw. At this checkpoint the remaining work was
the final regression corrections, exact-head CI and terminal review.

## 2026-09-03 recovery runs 12–13

Four later heads closed the branch regression and terminal gate:

- `4b26b073` added the explicit Links-shown setup missing from eleven existing
  column-behaviour cases. Before the fix, the focused h2puni run reported
  **11 failed / 269 passed** with 1.52 GB maximum RSS; afterwards
  `plan-cells` **89/89**, `plan-layout` **73/73**, and `plan-cards` **118/118**
  passed when run one file at a time under host pressure.
- `f8e36710` corrected the two contextual-Links pixel expectations; both exact
  Chromium cases passed **2/2** on h2puni.
- `839fde38` merged current `origin/main` after PR #199. A fresh detached
  h2puni worktree again passed `plan-cells` **89/89**, `plan-layout` **73/73**,
  and `plan-cards` **118/118**.
- `32a52b24` corrected two remaining 40px width expectations and bounded the
  shared fe-01 Vitest target to one worker. The file-parallel CI process at the
  prior head was killed before a summary; the serial full suite completed in
  **4m06s at 1.07 GB RSS** and exposed the two ordinary failures. Their focused
  files then passed **107/107**. The permanent one-worker bound is deliberate:
  it keeps the CI runner below its memory ceiling and preserves a verdict
  instead of a summary-less process death.

### Exact-head terminal evidence

- PR **#200**, workflow run **33805825125**, exact head `32a52b24`:
  `gate` **SUCCESS** at `2026-09-03T21:13:27Z` and `pixels` **SUCCESS** at
  `2026-09-03T21:16:36Z`. GitHub reported CLEAN and MERGEABLE against base
  `a8020276`, already an ancestor of the head.
- The sealed Opus 5 artifact
  `queue/reviews/task238-terminal-r13b-opus.txt` reviewed that exact head and
  returned APPROVE with no Critical finding and one Important record gap: this
  file and tasks 4.3/5.1 stopped four commits short. This section and the two
  task ticks close that finding; post-merge work is separated as task 5.2 so it
  is not falsely marked complete before the merge.
- Gemini was attempted at the same head through `bin/gemini-review.sh` with
  the reviewed tree pinned. The Antigravity `agy` seat exited 1 after three
  seconds with `Error: Agent execution terminated due to error.` and produced
  no canonical artifact. No metered fallback was used and no Gemini verdict is
  inferred.

No build or autotest ran on h1claw. Remaining work is task 5.2: exact-head
follow-up gates after this record-only correction, merge, commit-bearing dev
health verification, and the already dependency-gated TASK-239 browser QA.
