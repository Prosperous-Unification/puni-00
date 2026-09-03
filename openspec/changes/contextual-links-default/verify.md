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

No build or autotest ran on h1claw. Watched-red mutations, controlled-read race
coverage, browser pixels, full remote gate, CI, and terminal reviews remain.
