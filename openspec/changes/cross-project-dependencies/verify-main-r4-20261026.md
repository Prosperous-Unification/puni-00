# Private main and source reconciliation R4

This checkpoint preserves current main and the reviewed source components on the
private `integration/dependencies-main-20261026-r4` branch. It does not authorize
an architectural main merge, activation, deployment or provider execution.

## Frozen composition

- `584c9866fabb2ee80e7a7824c7476fd71caffc9a` merges R3
  `b78d7c2995908f31032021e14fa31265cf120029` and main
  `994dd0d49c599db5e177867a55c663db3cc852c2`; its tree is
  `8b6f23fe55675badbdd88b3f61e9aa3ea6f299b0`.
- `89c794f31725a81352687075bfcd5a107b6b42c8` merges that result and published
  source checkpoint `44338f6670cb6df09b1551bff8dabfe9e84411e3`; its tree is
  `13e4e639244a84befab66a260c16e9320cd10df2`.

The sole main conflict resolves to the reviewed R3 command-shape test blob
`69e6d69f91f8b409661be12b3e63a458bd8e249e`: retain the scoped endpoint case and
exactly one production compilation guard. Main's OAuth client lifetime and
transactional refresh changes travel with their callers, tests and documentation;
R3's direct credential-rules import remains. Both policies retain the fixture
exclusions and feature evidence inventory. All other main paths are preserved.

C/J ancestry was already present. The source merge adds exactly the four reviewed
A1/I implementation and receipt commits, without replaying C/J. All source blobs
match published443. The only source conflict appends the complete eighteen-line
A1/I receipt suffix after the unchanged R4 verification prefix. Active B1 drafts
and the separate normal-root browser work are excluded. Independent Astra High
reviews approved both exact composed trees; normal commit hooks passed.

## Fresh checks

All commands ran in the isolated local worktree with Bun1.4.4, existing locked
dependencies and owned private scratch. They are bounded integration evidence.

| Scope                    | Commands and observed outcome                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main composition         | `bun test` on the complete command-shape, OAuth, session-store, store-migrations and startup-document files: 338 pass, 1,354 assertions.                                                                                                                         |
| Fixture classification   | Complete `classification.test.ts`: 26 pass, 296 assertions, including both policies and four existing omitted-exclusion negatives.                                                                                                                               |
| Strict memory            | Complete `contracts-boot-memory.test.ts`: two pass, seven assertions; one rounded RSS **increase over the arktype baseline** of 492 MB against the unchanged 500 MB limit. The observed 8 MB margin is not an absolute process limit or repeatability guarantee. |
| Main static checks       | Fresh Nx graph; uncached `wbs-contracts` and `wbs-mcp-01` typecheck/lint, all four tasks pass; explicit formatting passes.                                                                                                                                       |
| Source composition       | Complete profile/channel/journal/archive/inputs/bootstrap suites: 234 pass, 977 Bun assertions, 9.99 seconds. Additional Node assertions were not counted.                                                                                                       |
| Source static checks     | Explicit rehearsal `tsc --noEmit --listFiles` includes all twelve TS files; fresh graph, twelve-file scoped ESLint and seventeen-file formatting pass.                                                                                                           |
| Candidate inventory      | Actual staged final-policy classification passes for both reviewed trees, with no untracked input; the source union contains 15,709 classified entries.                                                                                                          |
| Exact committed89 policy | External-trust pilot, stale literal-command negative and both committed relationship-fact tests: four pass, 100 assertions, 58.03 seconds.                                                                                                                       |
| Committed89 indexes      | `check-indexes committed . HEAD`: forty indexes; existing store-memory README review debt remains 52 direct entries against limit40.                                                                                                                             |
| Canonical OpenSpec       | Locked `openspec validate --all --json`: 298 passed, zero failed (280 changes, eighteen specs).                                                                                                                                                                  |

The external-trust selection uses the two test files
`policy/pilot-policy.test.ts` and `relationships/committed-target-facts.test.ts`
beneath the Burokrat CLI, scratch preload and the three literal selectors
`pins exact pre-index tuples and passes observe lint from external trust`,
`refuses a stale Burokrat test command without its literal source selection` and
`matches what the static extractor reads`. It requires
`TOOL_WIKI_TRUSTED_NODE_MODULES` pointing to the installed trusted TypeScript
runtime outside the materialized candidate, as the configured Nx target does.

The initial external-trust invocation omitted that setting: two tests stopped at
`trusted TypeScript runtime modules are not configured`, while two relationship
tests passed. Configuring the existing runtime, without source/assertion changes,
produced the four-test result above. A separate four-test metadata selection
passed eighteen assertions; it is not substituted for the external CLI selection.

## Retained failures and limits

An extra whole-tree bootstrap-policy classification failed on
`.agents/skills/.openspec-target` matching zero rules. The identical invocation
against committed R3 also failed identically; policy, marker and classifier closure
are byte-identical. Required bootstrap fixture regressions and final-policy
inventory passed. Whole-tree bootstrap certification remains unestablished; the
policy was not expanded and the failed command is not reported as passing.
Two earlier inventory invocations supplied a trusted-policy wrapper where the CLI
requires its `classificationPolicy` field; their schema failures remain separate
from the corrected inventory results.

These source tests include existing native-binding initialization and ordinary
owned filesystem, proc-descriptor, child-process and Bun-build fixtures. They
execute no genuine provider, database-open/SQL, Docker, host, namespace, credential
or production operation. The source-only merge did not repeat the memory check
because production memory-related code did not change.

No full repository build/gate, exact-SHA canonical host acceptance, certified
external Tool Wiki activation, native measurement/cleanup or full feature
acceptance is established. Full B2/K/P/O/A2/R, source-role readiness, restoration,
policy handoff and ordinary-controller adoption remain required. Parent task
checkboxes and the architectural main-merge hold remain unchanged.
