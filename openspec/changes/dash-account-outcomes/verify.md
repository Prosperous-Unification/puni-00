## Verification record

Implemented 2026-10-22 on `feat/dash-account-outcomes` (worktree `wt-cost-ledger` from main
`e2ae536b2`). Assumptions A1 to A8 in design.md stand; none confirmed by Dany yet.

### 1. Structural validation

`bunx @fission-ai/openspec@1.12.0 validate --all --json`: 268 items, 0 invalid (2026-10-22).

### 2. Task completion

All 13 slices in tasks.md are checked. Task 1.3 was re-scoped from "reconcile against the
final cumulative total" to "rows are the cumulative advance" after the real logs showed that
rule to be wrong (section 5); task 1.4 gained the unreadable-line rule for the same reason.

### 3. Delta spec sync

- `specs/efficiency-breakdown`: new capability, ADDED only; applied at archive. ✓ consistent with
  the implementation after the two rule changes above.

### 4. Failure proofs

Each fault was injected with a one-line edit, the named test was run and watched fail, then the
file was restored and the ledger suite re-run green (21 pass). Observed 2026-10-22.

| Guard                                          | Fault injected                                                        | Test that observed it                                                                            | Result |
| ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| One row per Claude request                     | keyed the pending map by request and line, so every line became a row | `a streamed response repeats its usage and counts once` (plus the disagreement test)             | failed |
| Repeated request with different inputs refuses | replaced the comparison with `if (false)`                             | `a repeated request id that disagrees refuses naming the path and line`                          | failed |
| Unknown model stays unpriced                   | returned `{ kind: 'priced', micros: 0 }` for an unlisted model        | `an unlisted model stays unpriced`                                                               | failed |
| Nested merges become member branches           | made the nested subject regex never match                             | `a plan branch carries nested pull requests and a hand merge has no branches`                    | failed |
| Ambiguous session stays unattributed           | attributed a multi-reference session to its first reference           | `a session that opened two pull requests is ambiguous`                                           | failed |
| Output directory must be new                   | `mkdirSync(..., { recursive: true })`                                 | `the output already exists refuses and writes nothing`                                           | failed |
| Unreadable lines are recorded                  | dropped the `unreadable.push`                                         | `an absent directory and a missing field refuse; a line that is not JSON is reported, not fatal` | failed |
| Codex rows are the cumulative advance          | used the raw total instead of the advance (`base = null`)             | `Codex rows are the advance of the cumulative counter and repeated events count once`            | failed |
| Falling Codex category refuses                 | replaced the negative-advance check with `if (false)`                 | `a Codex category that falls without a restart refuses naming the rollout`                       | failed |

Boundary allow-list: adding the two ledger paths to the Dash product policy is pinned by
`tools/tool-devsync/src/eslint-boundaries.test.ts` ("Dash progress and ledger reach exactly the
contracts alias at their scoped paths"), which passed (27 pass) and whose existing negatives still
refuse the judge alias and the relative specifier at those paths.

### 5. What the real logs changed

Run against this laptop's logs before the rules were final, each refusal named its file and line:

- A subagent transcript repeated a request id with a larger `output_tokens` on its last line.
  Across the week's transcripts 584 repeats differed, all only in output and all growing. Rule:
  the last line of a request is its usage; input and cache counts must not change.
- A rollout from 2026-08-29 did not reconcile `last_token_usage` against its final total. Across
  4,808 rollouts 1,246 failed that check: 11,021 token-count events were exact repeats and 15
  restarted the counter. Rule: a row is the advance of `total_token_usage` per category.
- A live subagent transcript held one line that no JSON parser accepts (Bun, Node and Python
  agree). Rule: such a line is listed as unreadable and skipped; the breakdown states the count.

### 6. Gate output

- `bunx nx format:check --all`: exit 0.
- `bunx nx run-many -t lint typecheck -p twilight-dash tool-devsync --skip-nx-cache`: both
  targets succeeded for both projects.
- `bun test src/ledger` in the Dash CLI: 21 pass, 0 fail (64 expect calls).
- `bun test src/ledger src/no-ambient-clock.test.ts src/cli.test.ts`: 51 pass, 0 fail.
- `nx run twilight-dash:test --skip-nx-cache`: 2,133 tests across 58 files, all passed, 681 s
  (2026-10-22, includes the no-ambient-clock scan and the dispatcher tests).
- Host gate of record: `bin/h2puni-gate.sh 6e546f9fa1fa870f9783d708938e22c3adca2670` on h4claw
  (`~/gate-6e546f9f.log`, started 2026-10-22 17:44 UTC after a 30-minute lock refusal with exit 75
  on the first launch, relaunched with `HEAVY_LOCK_WAIT_SECONDS=10800`): `GATE_EXIT=0`. CI's
  `gate workspace` job failed twice on the same head on a `wbs-be-01` browser-pair revocation
  test that times out at 10 s there and passes on the host gate; recorded as a CI flake.

### 7. The figures for the week to 2026-10-22

`account-outcomes --repository /home/df/wd/puni/puni-00 --since 2026-10-15T00:00:00Z --until 2026-10-22T12:00:00Z`
over this laptop's two Claude Code project directories and the Codex sessions directory, rate
card `2026-10-22-list-prices.json` (digest `8873cdc1b135cda46ce45466691925b5d05725746e5df9ca344f311302949946`),
92,595 usage rows in 90 s:

| Figure                             | Value       |
| ---------------------------------- | ----------- |
| Accepted outcomes                  | 61          |
| Priced cost, API-equivalent        | 5884.65 USD |
| Blended cost per accepted outcome  | 96.47 USD   |
| Attributed cost                    | 1004.24 USD |
| Coverage                           | 17.1%       |
| Unattributed, on-default-branch    | 249.22 USD  |
| Unattributed, no-branch            | 0.00 USD    |
| Unattributed, branch-not-accepted  | 1436.58 USD |
| Unattributed, ambiguous-references | 3194.61 USD |

| Harness     | Model             | Rows  | Cost        | Input      | Cache write | Cache write ext. | Cache read    | Output     |
| ----------- | ----------------- | ----- | ----------- | ---------- | ----------- | ---------------- | ------------- | ---------- |
| claude-code | claude-fable-5-1  | 3747  | 803.95 USD  | 90,964     | 17,369,346  | 10,101,665       | 1,012,755,566 | 2,613,926  |
| claude-code | claude-haiku-5-5  | 5     | unpriced    | 12         | 51,957      | 0                | 121,351       | 3,904      |
| claude-code | claude-opus-5-5   | 10677 | 1197.22 USD | 21,730     | 127,080,871 | 1,746,985        | 2,688,398,972 | 503,672    |
| codex       | codex-auto-review | 11985 | unpriced    | 52,746,691 | 0           | 0                | 979,958,528   | 953,736    |
| codex       | gpt-6-astra       | 19567 | 2871.77 USD | 56,114,721 | 0           | 0                | 2,016,079,104 | 5,890,928  |
| codex       | gpt-6-sol         | 20423 | 492.12 USD  | 18,090,810 | 0           | 0                | 2,085,669,376 | 3,879,962  |
| codex       | gpt-6.1-sol       | 26191 | 519.59 USD  | 48,467,060 | 0           | 0                | 3,167,880,320 | 10,587,150 |

What the figures establish: an API-equivalent lower bound of spend for the period and a blended
cost per merge to `main`. What they do not: subscription actuals, human time, or a per-outcome
attribution for the 83% that sits in the remainder, most of it sessions that referenced several
pull requests (orchestrators) and sessions whose recorded branch is the shared checkout's branch
at start rather than the work's. Both are the next slice's problem, stated as figures here rather
than hidden.

### 8. Implementation signal

Implementation commit `6e546f9fa` (gated); this record is the only later commit on the branch.
