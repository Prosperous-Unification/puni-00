## Slice 0 spikes, 2026-10-21

Run in a throwaway Bun project outside the workspace
(`bun init -y`, then `bun add --exact` of the pin set below), Bun 1.4.2, Node 24.20.0 for the
one cross-check. Sources are not kept in the repository; the commands and outputs are.

### 0.3 Pin set installs and typechecks under Bun

`bun add --exact ai@7.0.147 @ai-sdk/anthropic@4.0.84 @ai-sdk/openai@4.0.98
@openrouter/ai-sdk-provider@3.1.0 @ai-sdk/harness@1.0.158 @ai-sdk/harness-claude-code@1.0.162
@ai-sdk/harness-codex@1.0.160 @ai-sdk/harness-acp@1.0.97 @ai-sdk/code-mode@1.0.104
ai-sdk-sandbox-local@0.1.2 @agentclientprotocol/sdk@2.0.0 arktype@2.2.9 zod@4.6.7`:
28 packages, no peer warnings, exit 0.

One file importing every package, building a `createProviderRegistry` over Anthropic, OpenAI
and OpenRouter, resolving `anthropic:claude-opus-5-5`, and defining one `tool()` with a Zod
schema and one with an ArkType schema: `bunx tsc -p tsconfig.json` (TypeScript 5.9.3,
`strict`, `moduleResolution: bundler`) exit 0.

### 0.2 Code mode runs under Bun

`experimental_codeModeTool` inside `generateText` with `MockLanguageModelV3` emitting one
`code_mode` call whose `js` fetches two host tools and returns their difference, both tools
routed through `experimental_toolCallers`:

```
host tool calls: inv:sku_123,dem:sku_123
step0 tool parts: [{"type":"tool-result","toolCallId":"c1","toolName":"code_mode",...,"output":{"gap":8},"dynamic":false}]
final: done | steps: 2
```

Identical result under `node --experimental-strip-types`. Two facts for the adapter: the
tool's input field is `js`, not `code`; every public export carries the `experimental_`
prefix. Decision: code mode is available to the `api-model` adapter on Bun; the fallback in
design A6 is not needed.

### 0.1 Claude Code harness session on a local sandbox under Bun

`ai-sdk-sandbox-local` 0.1.2 implements the older sandbox surface (`getPortUrl`, no
`getPortEndpoint`), so the Claude Code harness takes its "basic sandbox" path and needs the
bridge port on the harness factory, not on `createSession`:

```ts
const harness = createClaudeCode({
  port: 4123,
  portEndpoint: { url: 'ws://127.0.0.1:4123' },
});
const local = createLocalSandbox({ cwd, ports: [4123] });
const net = await local.createSession();
const session = await agent.createSession({ sandboxSession: net });
```

Output: `harness session created` at 0.2 s with `sessionId`, `sessionWorkDir`,
`underlyingSession`; `destroy()` and `stop()` clean. The first attempt without the port
settings spent 49.6 s before refusing (the bridge's package install into
`<cwd>/claude-code-<id>/` happens before the check). The harness also warns: "The sandbox
implementation does not support configuring request transformations, so credential
brokering does not work. Falling back to less secure credential forwarding." On a local
sandbox that is acceptable: the host is the trust boundary.

**Not run:** a live prompt through the session. It would spend model tokens, which needs
Dany's explicit go. Until then 0.1 is open on the live half only; the Bun and sandbox half
is answered and design A7's fallback is not needed.

## Accepted plan reconciliation, 2026-10-21

Updated planning only: unified CTT hints; S7a/S7b delivery dependencies; immutable binding
manifests; worker/effect reconciliation; abstract persistence with SQLite as the current
adapter choice. Earlier spike observations above are retained as historical evidence.
They do not verify the new coordinator or prove live executor/recovery behavior.

Validation for this planning amendment:

- `bunx @fission-ai/openspec@1.12.0 validate twilight-agentic-workflows --strict`: exit 0, change valid. This validates this change only, not every unrelated OpenSpec in the monorepo.
- `bunx prettier@3.9.6 --check` on the changed Markdown: exit 0, all matched files use Prettier code style.
- WBS command-batch preflight: 129 resulting items, 117 dependency edges, no explicit dependency cycle; retained item IDs and existing unrelated plan content. Remote read-back verified all 31 note/name updates, six new items and 19 new dependency edges; 129 items, 117 edges, no schedule error.

No product implementation, deployment, paid prompt or runtime recovery test is part of
this documentation update.

## S0 execution baseline — 2026-10-22

User authorized the agentic-workflows foundation and an ongoing goal. Codex thread
`01a15f10-7287-7993-aa10-09e737cd64b4` works on `feat/agentic-foundation` in the isolated
`.worktrees/agentic-foundation` checkout, based on `origin/main` `d6f43af62`, with the
current `origin/plan/twilight-agentic-workflows` planning branch merged locally.

The separate multi-tenant workstream owns onboarding, login, machine credentials,
fleet identity provisioning, organization limits, compute providers and activation.
This work consumes those boundaries. Existing cross-project dependency and CTT library
implementations remain with their current sessions. Initial implementation is S0
RunStore/ArtifactStore semantics, memory conformance and SQLite durability (6a.1–6a.2).

Fresh preparation evidence:

- Live agentic project read: no step or subtree claims. No Codex agent person exists
  in the directory; the S0 parent notes record this session's ownership without using
  another fleet's person. Row `030.09` Dev is `in_progress`, confirmed by a fresh read.
- Bun `1.4.2`; locked OpenSpec `1.14.3`. OpenSpec status/apply identifies `sdd-lean`,
  ready, 2/35 tasks complete. Artifact readiness is not implementation completion.
- Initial frozen install failed with `EROFS accessing temporary directory`. With
  `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-agentic-bun-cache`,
  `bun install --frozen-lockfile` exited 0: 1801 installs across 1648 packages checked,
  no changes. No lockfile or dependency version changed.
- `bun test apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts
apps/twilight-structure/twilight-dash/cli/src/activation/observation-commands.db.test.ts
--timeout=60000`: 11 passed, 0 failed, 67 assertions, 1.73 seconds. This is the
  focused pre-change baseline, including absence/unreadability and bootstrap behavior.

Full host gate, CI, product implementation, R5 fault injection, live executor prompts,
deployment, second-provider durability and runtime recovery remain unverified here.

## S0 storage Task 1 candidate — 2026-10-22

The seven-method RunStore subset, pure ownership/admission/manifest/run planners and
memory test provider are implemented. This is a review candidate, not completed S0.
The current attempt union is queued-only; safe retry transitions and referenced artifact
bytes enter later slices. WBS rows `030.09` and `030.10` remain `in_progress`.

The implementation worker observed the initial focused test fail on the absent
`record-codecs` module, then pass with 3 tests and 12 assertions. Two further public-port
reds found real defects: stale ownership looked up an absent run before refusing, and
an `owner_busy` refusal failed to preserve the latest clock observation. Both were fixed.
Typed refusals now preserve validated clock metadata without changing domain state.

Final candidate checks, run in the isolated worktree with Bun 1.4.2:

| Command                                                                                                                                                                                                          | Observed output                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts apps/twilight-structure/twilight-dash/cli/src/runs/admission.test.ts apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts --timeout=60000` | Exit 0; 20 pass, 0 fail, 110 assertions |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/eslint-boundaries.test.ts --timeout=60000`                                                   | Exit 0; 28 pass, 174 assertions         |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:typecheck --skip-nx-cache`                                                                                                                   | Exit 0; cache skipped, 1.8s             |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:lint --skip-nx-cache`                                                                                                                        | Exit 0; cache skipped, 17.8s            |
| `bunx eslint apps/twilight-structure/twilight-dash/cli/src/runs tools/tool-devsync/src/eslint-boundaries.test.ts`                                                                                                | Exit 0; no diagnostics                  |
| `bunx prettier --check apps/twilight-structure/twilight-dash/cli/src/runs apps/twilight-structure/twilight-dash/eslint.product.mjs tools/tool-devsync/src/eslint-boundaries.test.ts`                             | Exit 0; all matched files formatted     |
| `git diff --check`                                                                                                                                                                                               | Exit 0; no whitespace errors            |

Earlier lint/typecheck runs exposed and then corrected brand-constructor arguments,
async/assertion style, the absent exact contracts import allowance and unnecessary test
string escapes. Empty captured full-lint output was diagnosed with ESLint `--debug`;
the final named target passed. Initial Nx socket warnings were avoided with the two
explicit environment settings above. Root's comparison run of the same uncached lint
target in the original clean checkout also passed (18.2s); no environment exemption
was used to accept the candidate.

R5 evidence: the worker independently injected 43 domain/codec/provider faults and
four import-policy faults, observed their named assertions fail (exit 1), restored every
fault and ran the final green checks above. Production-adjacent `Proof:` comments name
the specific faults and tests; the tests and planners are under `runs/`.

| Fault family                                                                                                                      | Observed negative oracle                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Capacity, stale epoch, lease expiry, expected epoch, owner/store/organization binding, busy ownership                             | Capacity-one admits a second run, or the stale/mismatched owner writes or renews                                   |
| Clock regression, invalid clock adapter, lost clock on refusal                                                                    | Regressed/invalid time is accepted; owner_busy at 1050 permits renewal at 1049                                     |
| Run/admission identity, initial/stale revision, operation key, retry budget, ordinal, active occurrence                           | Conflicting identity mutates, stale revision reserves, or another queued attempt is admitted                       |
| Missing run/manifest/attempt, mismatched manifest binding, immutable manifest, initial run configuration                          | Trusted malformed facts/read state are accepted instead of throwing                                                |
| Canonical JSON/hash, digest/ID/reference codecs, portable version/discriminant/unknown fields, positive/safe integer and overflow | Invalid portable content is accepted or an unsafe number reaches stored state                                      |
| Snapshot cloning, closed provider, unowned mutation/renewal, pre-read fencing                                                     | Caller mutation changes retained state, a closed/unowned store operates, or stale authority reads the target first |
| Removed exact contracts allowance                                                                                                 | Legitimate codec/planner import is rejected                                                                        |
| Widened alias, relative import or file scope                                                                                      | Judge/relative imports or peer files become allowed                                                                |

The canonicalization fault initially survived because a bad digest masked it. The test
was strengthened with noncanonical JSON carrying a recomputed matching digest; the
same fault then failed for canonicalization. Missing-record pure-planner cases inject
malformed trusted facts because the public memory port cannot delete retained state;
public create/read cases separately prove absent-manifest/run refusal. No filesystem
unreadability or crash durability is claimed by memory tests.

Domain mutation command: the focused admission command above with
`--test-name-pattern <named test prefix>`. Policy mutation command: the boundary suite
above with `--test-name-pattern 'Dash run storage reaches'`. The policy allowance is
limited to `@twilight-burokrat/contracts` at the exact codec and admission-planner paths;
it reuses the existing canonical JSON/hash implementation.

Regular locked OpenSpec 1.14.3 validation reports valid with seven existing long-requirement
warnings. Strict validation fails on those warnings in unchanged requirements; the older
strict-success observation above used OpenSpec 1.12.0. Full Dash test/build, exact-SHA h2
gate, CI, durable adapters, live guarded WBS bridge, complete binding recovery and production
deployment have not been verified by this slice. Independent review is pending.

Independent review of `cf06a77b4` rejected this candidate. It reproduced two malformed
trusted-state cases that incorrectly returned applied intents: current run without its
immutable initial identity, and existing attempt ID without its immutable admission.
It also invalidated the relative-import and file-scope policy mutation claims above:
those two logs failed loading the policy, before any boundary assertion. Only allowance
removal and alias widening currently establish policy breakability. The prior four-proof
statement and adjacent source comment are superseded pending valid reruns. Fix round 1
will repair the missing identity checks, prove them, and correct these evidence claims.
The final lint log duration also needs alignment (retained log 17.8s, earlier summary
16.4s); both runs reported success. No slice acceptance is claimed.

### Fix round 1

Four new tests first failed on the real planners with the missing half of a trusted
identity pair: two returned applied intents and two returned identity_conflict instead
of throwing. Symmetric current/initial-run and attempt/admission presence checks now
throw before collision comparisons. Each of the four guards was separately removed;
its exact test failed at `toThrow` (one assertion), then passed after restoration. The
focused pattern `without its` changed from 0 pass/4 fail to 4 pass/0 fail.

The policy fault harness used `String.replace` with source text as a replacement string.
The alias's literal `$'` expanded to the suffix and produced an unterminated string in
the relative/path mutations. Those two historical runs remain invalid proofs. The
corrected harness inserts literal text, first verifies that the mutated module imports,
and requires the named boundary assertion plus a positive assertion count. Fresh valid
allowance-removal, alias-widening, relative-import and peer-path mutations then failed
at their intended assertions after respectively 1, 2, 3 and 13 assertions. The last two
specifically named the forbidden relative contracts import and `runs/plan-ownership.ts`
peer. All policies were restored; the full boundary suite passed. Source Proof comments
now describe these valid observations.

Fresh checks after the fixes, using the exact commands above: admission/clock **24 pass,
0 fail, 116 assertions**; boundary suite **28 pass, 174 assertions**; uncached typecheck
exit 0 (2.0s); uncached lint exit 0 (19.9s); Prettier and whitespace checks exit 0.
The prior candidate's lint duration is corrected to 17.8s: 16.4s was a different earlier
successful run before mechanical helper renaming. The fix has its own fresh run and
does not rely on that earlier measurement. Scoped re-review is pending; all previously
listed durable/bridge/host-gate limitations remain.

Scoped re-review of `cf06a77b4..237feb633` marked both Important findings and the duration
correction addressed, with no new breakage. It inspected all corrected policy and
identity fault logs and their assertion oracles. Storage Task 1 is accepted; parent
6a.1–6a.2 and WBS contract/conformance milestones remain in progress for the remaining
storage slices. No durable provider or coordinator completion is implied.

## S0 storage Task 2 candidate — SQLite admission

The independent SQLite adapter consumes the accepted production planners within row-level
transactions. A shared 15-case public-port contract now runs for memory and SQLite; the
original direct codec/planner tests remain. Bootstrap publishes a checked, closed and
fsynced sibling exclusively. Open never creates or resets trusted state and checks schema,
migration/down hashes, portable records, physical identities, ownership, reservations and
persisted configuration. Reads use a consistent transaction; writes acquire the lock before
reading the trusted clock. Refusals persist only validated monotonic clock metadata.

Observed initial red: the shared registration ran 13 memory cases successfully and failed
loading the planned absent SQLite adapter. This is the planned initial TDD red, not an R5
proof. Two later behavior reds caught target decoding before stale-owner refusal and an
exclusive SQLite lock classified as corruption. Early ownership fences and bounded async
lifecycle retries corrected those cases. The latter now throws contention after its budget.

Fresh final checks in the isolated worktree, Bun 1.4.2, uid 1000:

| Command                                                                                                                                                                                            | Observed result                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs ./apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts --timeout=60000` | 89 pass, 0 fail, 317 assertions across six files, 3.80s after restoring the final fault sweep |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:typecheck --skip-nx-cache`                                                                                                     | Exit 0, uncached, 2.0s                                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:lint --skip-nx-cache`                                                                                                          | Exit 0, uncached, 20.3s                                                                       |
| `bunx prettier --check apps/twilight-structure/twilight-dash/cli/src/runs`                                                                                                                         | Exit 0, all matched files formatted                                                           |
| `git diff --check`                                                                                                                                                                                 | Exit 0, no diagnostics                                                                        |
| `bunx openspec validate twilight-agentic-workflows --json`                                                                                                                                         | Valid, seven existing long-requirement warnings                                               |

The three real process tests contributed 27 assertions. Independent children raced public
admission at capacity one and produced one winner. A dedicated child's COMMIT interception
asserted an active transaction and staged attempt/reservation/revision, then emitted an IPC
barrier; the independent parent still read the old snapshot, killed the child and reopened
with no admission changes. Killing after acknowledged commit preserved all three records.
All child waits are bounded and cleanup kills/reaps survivors. A real reservation-insert
abort trigger separately proves rollback through public admission and successful admission
after removing the fault. Non-root file/parent mode changes prove unreadability distinctly
from absence; the tests refuse to claim this under uid zero.

The final R5 sweep observed **54 valid faults**. Each targeted command used the source path
above plus `--test-name-pattern <named case>`. Its oracle required exit 1, the intended
failed test/assertion, a positive assertion count and no loader/parser failure. Every source
fault was restored before the final green run. Adjacent `Proof:` comments identify the
guards and cases; the fault families are:

| Fault family                                                    | Observed failing oracle                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Admission atomicity, persisted capacity, reservation intent     | Aborting reservation insertion leaves a changed run, or capacity-one admits a second live attempt    |
| Owner fencing and refusal-clock persistence                     | Stale owner reaches damaged target state, or a regressed clock becomes accepted                      |
| Schema/version/up/down hash, integrity diagnostic, foreign keys | Changed trusted schema or relationships pass open validation                                         |
| Metadata and manifest/run/attempt/admission physical identities | Valid-shaped stored content disagrees with its physical key or immutable identity without throwing   |
| Reservation matching and capacity overflow                      | Missing/extra reservations or over-capacity trusted state are accepted                               |
| WAL/FULL/foreign-key settings                                   | Broken durability configuration is accepted                                                          |
| Transaction cleanup and rollback failures                       | Failed writes survive or the original/rollback cause is lost                                         |
| Async bounded contention and post-lock clock                    | Retry blocks its scheduled releaser, a lock becomes corruption, or expiry during lock wait is missed |
| Open-without-create and exclusive publication                   | Missing trusted state is created, or a concurrent published target is replaced                       |
| Required options, stored settings and configuration equality    | Invalid clocks/integers/path or changed organization/capacity/lease are accepted                     |
| Missing records and file/parent access classification           | Required records are returned despite absence, or inaccessible state is misclassified                |

Rejected attempts are excluded from that count: child scripts initially used test-only
preload outside the runner; an unanchored Bun directory argument also collected generated
dist tests; unmatched mutation anchors, an undeclared fixture variable and a missing test
import failed setup. The final command uses `./apps/...` to anchor source discovery.
An attempted SQLite closed-guard mutation survived because the driver already rejects
closed operations; an exact-message baseline also failed, so both claims were withdrawn
and the redundant guard removed. The shared closed-operation contract remains green.
A redundant explicit initial-revision comparison was similarly removed because immutable
identity comparison already enforces it. Physical attempt-ID proof was strengthened by
corrupting both portable identities coherently against the unchanged database key, and
early-fence proofs now reach positive assertions. None of these discarded attempts count
as safety evidence.

Independent Task 2 review is pending. Full host gate, full Dash/repository tests and build,
CI secrets/migration lint and aggregate acceptance were not run for this candidate. The
migration/down pair is exercised in provider tests, which does not establish CI lint.
Process kill/reopen does not prove physical power-loss behavior. No second durable provider,
artifact verification, outcome/inbox/receipt support, coordinator, guarded live WBS bridge
or production deployment is claimed. Parent 6a.1–6a.2 remain unchecked.

Independent review of `e89ac9d4e` rejected this candidate for incomplete physical-schema
validation. Four focused public-open probes accepted an empty store with a renamed required
column, absent active-occurrence index, wrong nonunique index, or reservation table missing
its primary/foreign-key constraints. Stored migration hashes and row decoders do not prove
the installed schema when tables are empty. The reviewer separately inspected all 54 retained
fault logs and accepted their assertion oracles; the withdrawn historical logs remained
excluded. Fix round 1 must validate provider-owned structure independently of row contents,
reject without migration/repair, and preserve unrelated test triggers used by rollback
proofs. No Task 2 acceptance is claimed.

### Task 2 fix round 1

Ten new empty-store cases first failed with the intended missing-rejection assertion
(10 fail, 20 assertions): changed column name/type/nullability, missing reservation PK/FK,
wrong FK target, absent occurrence uniqueness, and missing/nonunique/wrong-column/wrong-
predicate active-occurrence index. The adapter now derives required table/index declarations
by executing the migration in a private in-memory reference and compares the installed
provider-owned structure before metadata/row reads. It requires those exact declarations,
allows unrelated tables and additional triggers, and performs no trusted-state repair.
The same cases passed with 30 assertions and checked that refused open left schema unchanged.

Two independent source faults removed the validation dispatch and bypassed its comparison.
Each made all ten named rejection assertions fail (20 assertions, no setup/loader failures).
Both were restored before the final green run. These are two new R5 observations in addition
to the prior 54; the prior sweep was not rerun. The source comments name these actual proofs.

The focused command was the source-only Bun command above narrowed to
`./apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/open-stores.db.test.ts`
with `--test-name-pattern 'empty-store physical schema'`. Final source-subtree run, without
the unchanged separate clock test: **97 pass, 0 fail, 341 assertions**. Existing rollback
trigger and process-kill tests remained green. The final typecheck/lint commands above
passed uncached in 1.4s/16.2s; touched-file formatting and whitespace checks passed.
Typecheck first required a test-only captured-array annotation change from `unknown` to
`unknown[]`; the focused regressions ran again after that type-only correction. No runtime
implementation changed after the subtree green. Scoped re-review remains pending, and all
previous aggregate gate, live integration and power-loss limitations remain.

Scoped re-review of `e89ac9d4e..de01475e9` marked I1 addressed with no new breakage. It
inspected the migration-derived comparison, ten regression outcomes and both new fault
logs, confirming that installed state is not repaired and extra rollback triggers remain
usable. Storage Task 2 is accepted. Parent 6a.1–6a.2 and WBS durable-provider/conformance
milestones remain in progress for artifacts, execution/outcomes, inbox/receipts and final
provider-selection/aggregate acceptance. This is not coordinator readiness.

### Storage Task 3 — artifact, execution and outcome candidate

The candidate extends both providers with immutable artifacts, execution command history,
and atomic completion/outbox writes. Verified application operations snapshot the guard
and payload before awaiting artifact reads, then persist that same snapshot. Raw persistence
ports require already verified references; byte integrity does not establish the truth of
executor observations, authorization or physical quiescence.

Pre-review design inspection identified two gaps addressed in this slice. Execution facts
now carry explicit command identities: a fresh command can record a later reattachment to
the same session, whereas an old command returns its original reply without rewinding
current state. Expected revisions remain concurrency guards. Trusted attempt decoding now
rejects potentially live states without capacity and settled states with unknown effects;
seven valid-shaped corruptions first failed their public-reopen rejection assertions.

| Command                                                                                                                   | Observed result                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs --timeout=60000` | 178 pass, 0 fail, 613 assertions, 9 files, 7.12s     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:typecheck --skip-nx-cache`                            | Exit 0, 1.9s                                         |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:lint --skip-nx-cache`                                 | Exit 0, 18.1s                                        |
| Touched-source Prettier and `git diff --check`                                                                            | Exit 0                                               |
| `bunx openspec validate twilight-agentic-workflows --json` after command-identity amendment                               | Valid, same seven existing long-requirement warnings |

The R5 sweep retained **75 distinct fault cases from 79 invocations**. Each retained case
has its exact mutation, command, intended failed test and assertion outcome in
`/tmp/task3-faults/final-summary.json`, with individual logs in `/tmp/task3-faults/`.
The implementer report and controller ledger live in the ignored
`.superpowers/sdd/storage-tasks/` workspace. Adjacent source `Proof:` comments identify
the corresponding regression. Faults cover artifact byte/input/metadata validation;
each verified wrapper and asynchronous snapshot; owner fencing and missing targets;
claim/operation/locator authority; command identity and original replies; run/attempt
revisions; transition, effect and capacity invariants; retry eligibility; physical
execution/completion identities; pending-state/outbox consistency; and outcome atomicity.
Every mutation was restored before the final green run.

Four earlier invocations are excluded. Two snapshot-removal attempts reached downstream
digest rejection without asserting success for the valid original snapshot; strengthened
tests now fail explicit success assertions under the same faults. A run-revision bypass
was masked by a simultaneously stale attempt revision; an initial test edit did not match
and the unchanged rerun survived too. Independent stale-run/current-attempt coverage now
exposes that guard. Initial setup/parser/import failures are likewise not production-path
proofs. Three corrected-case logs were overwritten by their final runs; earlier outcomes
remain classified in the initial summary and are not counted as valid evidence.

SQLite tests corrupt actual retained BLOBs for manifest prompt/policy, completion output
and quiescence, interrupted/unresolved evidence, and waiting prompt/quiescence references.
Each public verified operation rejects without changing the run. An outbox abort trigger
separately interrupts public outcome recording: reopen succeeds and the complete prior
snapshot survives. Removing the write transaction makes the explicit successful-reopen
assertion fail because partial trusted state lacks its outbox. Restoring the transaction
and removing the trigger permits both completion and intent to persist, including duplicate
delivery after reopen.

A dedicated child intercepts the real SQLite COMMIT only after checking staged completion,
outbox, revisions and released reservation. Killing before commit preserves the entire
prior snapshot; killing after acknowledged commit preserves pending progress, released
capacity and refusal of new admission. Child exit signals and empty stderr are asserted.
This is process-interruption evidence, not a physical power-loss claim. No production
test hook was added. The unreleased migration/down pair changes together and now owns nine
tables; provider tests check its actual schema and hashes.

Independent Task 3 review is pending. Task 4 inbox/receipt methods, Task 5 production
selection/import checks, full host gate, full repository/build acceptance, CI secrets and
migration lint, guarded live WBS integration and production deployment are unverified or
not implemented here. Parent 6a.1–6a.2 remain unchecked. No second durable provider or
coordinator readiness is claimed.

### Storage Task 3 fix round 1

Independent review of `93ad0e979` found two Important defects through focused public-path
probes. Corrupting a settled attempt's quiescence operation allowed reopen and a retry of
the original operation. Corrupting only a historical claim reply's person allowed reopen
and an exact-command duplicate carrying the altered authority. Task 3 was not accepted.

The shared attempt decoder now binds every quiescence operation to its attempt identity.
SQLite history validation reconstructs each named attempt from its immutable admission
fields and checks ordered command replies against the same pure transition function used
by live execution. It consumes no fabricated owner or clock. Current-owner validation still
precedes historical target reads for mutations. Historical replies are checked against their
own transitions, never against the attempt's later state. Task 4 must incorporate persisted
decision-consumption provenance into this validation rather than bypassing revision gaps.
The 802-line shared contract was split into four cohesive groups without removing cases.

The new corruption/reopen/replay suite first observed **57 failed rejection assertions**;
a separate portable terminal case also failed. I1's ten operation-binding cases then passed.
The full integrity suite passed 66 cases after I2, including seven legitimate historical
reply/reopen cases and a query-dependency fault omitting required history. A final typed-
refusal routing regression brought the new file to 67 cases. Contradictions cover all fact
variants, preserved claim/locator, evidence/wait fields, immutable attempt metadata and
command/reply pairs naming a different project or work item.

Five new-check fault cases each failed their intended explicit assertions on the first
attempt: quiescence operation binding, historical postcondition equality, impossible
historical transition rejection, required history presence and live typed-refusal routing.
Exact mutations/argv/logs are in `/tmp/task3-fix1-faults/summary.json`; no attempts were
discarded in this round and the earlier 75-case sweep was not rerun or recounted. Every
fault was restored before final checks. The transition proof checks its named error cause
so an incidental TypeError is insufficient; the live-refusal proof requires no throw.

The same source-subtree command recorded above passed **245 tests, 0 failures, 661 assertions
across ten files in 8.40s**. Uncached `twilight-dash:typecheck` and `twilight-dash:lint` passed
in 2.0s and 18.3s. Formatting and whitespace checks passed. An initial direct ESLint autofix
reported a test-only unnecessary index null check; the fixture now searches by attempt
identity, and the final named checks passed. Logs are `/tmp/task3-fix1-final-{tests,typecheck,lint}.log`.

Scoped re-review is pending. These checks detect contradictory retained records and local
target identities; they do not attest against coherent replacement of the entire database.
All full-gate, live integration, Task 4/5 and coordinator-readiness limitations above remain.

Scoped re-review of `93ad0e979..168448562` marked I1, I2 and the contract split addressed,
with no new breakage. It inspected all five new fault proofs and final check logs without
rerunning the suites. Storage Task 3 is accepted; the nine slice checkboxes are checked.
Parent 6a.1–6a.2 and WBS foundation milestones remain in progress for decision/receipt
semantics, provider selection and aggregate acceptance.

### Storage Task 4 — decisions and exact receipts candidate

Both providers now receive immutable decisions, consume one decision per exact wait and
reconcile exact command receipts. Consumption retains its original queued reply and
reacquires capacity atomically. A later wait requires a fresh correlation key. Receipts
retain their original terminal replies, remove outbox entries atomically and permit the
specified bounded retry only after confirmed failure with absent/failed effects. Verified
decision/receipt operations snapshot inputs before checking retained evidence bytes; they
do not authenticate actors or establish remote WBS acceptance.

A preflight corruption probe changed only a current attempt's claim person while leaving
its execution history intact. Public reopen wrongly succeeded (one explicit missing-
rejection failure). With root's recorded scope ruling, trusted validation now reconstructs
execution, consumption, completion and receipt transitions for the named attempt, validates
each historical reply at its own predecessor and compares the final complete Attempt once
with current state. Reads, open and state-dependent mutations reach this check; writes
first fence ownership. The shared run revision is not reconstructed from one attempt.

The initial new-method tests failed before implementation, then passed for memory and
SQLite. Additional negatives exposed a wrong-command receipt throwing instead of refusing,
and admission/completion skipping provenance checks; these were corrected. The first full
subtree run had 325 passes and two failures: fresh execution/completion reconstruction used
the caller's run instead of the actual attempt's run, and an old migration test still
expected nine tables. Reconstruction now uses the actual target before the planner returns
the typed cross-run conflict. Two separate mutations restoring the wrong target fail explicit
`doesNotReject` assertions. The migration/down test compares the complete pre-down and
post-migration table sets and requires no provider object after down; the schema now owns
twelve tables. The unreleased migration/down pair changes together and old hashes refuse
open rather than receiving an implicit upgrade.

Root's handoff check also found a DecisionId-content collision returning `decision_conflict`
where the design requires `identity_conflict`. Shared memory/SQLite expectations first failed
with those exact reasons, then passed after the narrow branch correction. Invalid new waits
and choices retain `decision_conflict`. Its single guard-removal proof was refreshed against
the final assertion, and the previous log/entry remains archived.

Final checks after that correction:

| Command                                                                                                                   | Observed result                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs --timeout=60000` | 327 pass, 0 fail, 973 assertions, 14 files, 9.94s |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:typecheck --skip-nx-cache`                            | Exit 0, 2.1s                                      |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:lint --skip-nx-cache`                                 | Exit 0, 18.7s                                     |
| `bunx prettier --check apps/twilight-structure/twilight-dash/cli/src/runs` and `git diff --check`                         | Exit 0                                            |

The final logs are `/tmp/task4-fix1-final-{tests,typecheck,lint,format}.log`. The retained
fault evidence is **62 distinct cases from 102 mutation Bun invocations**: 39 preliminary
invocations, 58 in the corrected complete sweep, four isolated additions and the one
refreshed collision proof. Of the preliminary 39, 34 were valid repeated observations and
five had weak or masked oracles; none are counted as extra distinct proofs. An ESLint-
normalized predicate stopped that sweep before invocation 40. The five weak cases covered
cross-run receipt targeting, pending-state refusal and three asynchronous snapshots. They
were strengthened with distinguishing inputs and explicit applied/`doesNotReject` assertions.
Missing-module/export scaffolding failures and helper-only throws are excluded from safety
evidence. Exact accounting is in `/tmp/task4-fault-attempts.md` and exact retained mutations,
argv, assertions and logs are in `/tmp/task4-faults/summary.json`. All mutations were restored.

Proof families cover owner fences; global inbox and receipt identity; target/revision/wait
matching; capacity and fresh wait keys; artifact verification and pre-await snapshots;
physical keys and complete historical/current provenance; required completion/outbox state;
live typed-refusal routing; and receipt/consumption/reservation atomicity. Real SQLite abort
triggers preserve both the whole physical projection and public snapshot after reopen.
The fake lost-ack source reconciles the exact retained command without creating another
attempt; it establishes persistence behavior only.

Two old proof arrangements were superseded explicitly. The earlier readOutcomes current-
state comparison and its comment were removed because full reconstruction now checks that
invariant once. Ordinary missing-history tests now accept the earlier named provenance
error; a new reset-to-admitted projection plus omitted-query-row fault independently exposes
the retained required-command guard. Corrupt-history tests compare physical projections
after refusal because public readRun now correctly throws on those corrupt histories.

Independent Task 4 review is pending. Task 5 production selection/import enforcement,
aggregate exact-SHA gate, full build/CI acceptance, secrets/migration lint, authenticated
inbox delivery, real quiescence and guarded live WBS acceptance remain unverified here.
Parent 6a.1–6a.2 remain unchecked; this is not coordinator or deployment acceptance.

### Storage Task 4 fix round 1

Independent review rejected the candidate: reinserting a confirmed terminal command into
`run_outbox` made `readRun` throw, but retry admission still applied and reserved capacity.
Admission, fresh execution, direct completion and execution replay reconstructed history
without checking independent delivery presence. The fix routes these and the existing
read/open/receipt paths through one `validateAttempt` operation. It validates against the
attempt's actual target run after owner fencing. Reconstruction remains private and no
longer provides an incomplete validation entry point. The obsolete required-command proof
comment was removed; the reset-to-admitted negative remains its independent evidence.

The focused matrix first failed all eight cases at `Missing expected rejection`, then
passed; receipt coverage expanded it to ten cases. Each corrupt terminal-extra-outbox or
pending-missing-outbox case asserts rejection and unchanged physical rows, then restores
the delivery state and checks the valid applied, duplicate or typed-refusal result. The
retry positive reserves exactly one slot. Focused history/outcome suites passed 154 tests
with 306 assertions. Logs: `/tmp/task4-review-fix1-red.log`,
`/tmp/task4-review-fix1-green-expanded.log`, `/tmp/task4-review-fix1-focused-final.log`.

Eight isolated production routing/dependency faults each failed the intended rejection
assertion: complete delivery validation, admission, completion, fresh execution, execution
replay, required-attempt receipt reads, inspection and open. Exact edits, commands and
failing output live in `/tmp/task4-review-fix1-faults/summary.json` and its named `.patch`/
`.log` files. All eight mutations were restored, with no weak or discarded attempts. This
adds eight proof cases/eight mutation invocations; cumulative historical accounting is
70 cases/110 invocations. Earlier proofs were not rerun or recertified by this fix.

Final checks after restoration:

- `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs --timeout=60000`: 337 pass, zero fail, 1,013 assertions across 14 files, 9.77s.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:typecheck --skip-nx-cache`: exit 0, 2.1s.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:lint --skip-nx-cache`: exit 0, 19.8s.
- `bunx prettier --check apps/twilight-structure/twilight-dash/cli/src/runs` and `git diff --check`: exit 0.

Final command output is in `/tmp/task4-review-fix1-final-{tests,typecheck,lint,format}.log`.
Root inspected those logs and the eight fault metadata entries. Scoped independent
re-review remains pending; Task 4 is not accepted yet. Task 5, full host gate/build,
CI acceptance, standalone migration lint, secrets, live workers/WBS and coordinator
readiness remain outside these checks.

Scoped independent re-review inspected all eight new fault patches and failing logs,
confirmed complete validation routing and the corrected proof comment, and reported no
new breakage or out-of-scope findings. Storage Task 4 is accepted; its nine slice checkboxes
are checked. Parent 6a.1–6a.2 remain unchecked until Task 5 and aggregate acceptance.

### Storage Task 5 — production selection and acceptance candidate

The async `openStores` factory validates explicit SQLite selection and delegates settings
and trusted-state validation to the existing opener. It cannot select memory or bootstrap.
The SQLite provider now explicitly fences operations after close, even when a retained real
connection prevents the driver's own exception from masking the missing check; close is
idempotent. Public port keys are enumerated against valid existing identities. Structural
AST tests reject adapter/path/schema dependencies in the portable boundary and production
memory imports. A separate Bun process commits a public admission between the parent
`readRun` header and remaining reads; the public read must expose a whole old snapshot,
then the whole new snapshot on its next call.

Root's direct migration-lint command initially exited 1: its trusted-root allowlist did
not own the new provider directory. CI scans all tracked SQL. This slice registers only
`runs/sqlite/migrations` and an exact staged SQL hook route, preserving other roots and
waivers. Existing migration tests now cover the real forward/down pair, missing rollback,
destructive forward SQL, sibling-path refusal and parsed production hook routing.

Observed development failures were retained, not treated as proof: initial missing factory
module; invalid admission fixture and incomplete portable-import allowlist; a cached
statement interceptor firing twice; and seven test lint diagnostics. The meaningful close
RED was `Missing expected rejection: acquireOwnership must refuse a closed store`.
Migration RED had four expected failures for missing root/routing. After implementation,
the first aggregate passed 411 tests but lint failed; tests were corrected, relevant fault
observations repeated, and the final aggregate below passed.

Eighteen distinct faults were observed:

- Provider discriminator removal; closed-operation fence removal; close-idempotence removal.
- Read transaction bypass, producing revision zero with one attempt and one reservation.
- Eight actual forbidden import forms: provider, path, adapter type, re-export, import type,
  dynamic literal, dynamic computed and require. AST assertions named the dependency.
- Migration root removal/widening, hook route removal/widening, missing-down bypass and
  destructive-forward bypass. These failed acceptance or refusal assertions on real paths.

Exact edits, argv and failing output are recorded in
`/tmp/task5-mutation-summary-initial.json`,
`/tmp/task5-snapshot-mutation-summary-final.json` and
`/tmp/task5-migration-mutation-summary-final.json`, with named
`/tmp/task5-proof-*.log` files. All mutations were restored. There were 27 mutation
invocations: 25 accepted observations across 18 distinct faults, plus two excluded attempts.
Both excluded attempts reached behavior assertions but did not meet the mutation runner's
Bun assertion-counter requirement; the migration attempt also used an incorrect expected
message. Their logs remain as `provider-attempt1` and `migration-root-removed-attempt1`.
They are not counted as proofs. Earlier storage proof cases were not rerun or recertified.

Final restored checks:

- `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs ./tools/tool-git-hooks/src/hooks/migration-lint.test.ts ./tools/tool-git-hooks/src/hooks.test.ts --timeout=60000`: 411 pass, zero fail, 1,099 assertions, 18 files, 11.68s.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p twilight-dash,tool-git-hooks --skip-nx-cache`: both targets pass, 2.2s.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p twilight-dash,tool-git-hooks --skip-nx-cache`: both targets pass, 20.8s.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0001-run-store/migration.sql apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0001-run-store/down.sql`: exit 0 after checking the supplied paths.
- `bunx prettier --check apps/twilight-structure/twilight-dash/cli/src/runs tools/tool-git-hooks/src/hooks/migration-lint.ts tools/tool-git-hooks/src/hooks/migration-lint.test.ts lefthook.yml` and `git diff --check`: exit 0.

Logs are `/tmp/task5-final-restored-{tests,typecheck,lint}.log`,
`/tmp/task5-final-migration-cli.log`, `/tmp/task5-final-format.log` and
`/tmp/task5-final-diff-check.log`. Root inspected the final aggregate/static output and
fault metadata. Regular locked OpenSpec validation after the plan amendments passed with
the same seven long-requirement warnings; strict validation is not claimed.

Task 5 independent review remains pending. Full project test targets, build, whole-repository
migration lint/secrets, exact-SHA host gate, current-main integration and whole-branch review
remain outstanding. Parent 6a.1–6a.2 are still unchecked. No live worker/WBS, hardware
power-loss, second durable provider or coordinator readiness claim follows from this packet.

Independent Task 5 review approved spec compliance and task quality with no findings. It
inspected the recorded snapshot/close faults, import and migration assertions and focused
dependency routing without rerunning passing suites. The five implementation checkboxes
are checked; the final root review/gate checkbox and parent 6a.1–6a.2 remain pending.

Root supplementary checks at `95493a44cef90f6dc967e8567a823f861097073f`: all 192 tracked SQL
files passed `git ls-files -z -- '*.sql' | xargs -0 --no-run-if-empty bun run tools/tool-git-hooks/src/hooks/migration-lint.ts`;
all 11,583 tracked files passed `git ls-files -z | xargs -0 --no-run-if-empty bun run tools/tool-git-hooks/src/hooks/plaintext-secrets.ts`.
Both used `set -euo pipefail`, exited zero without diagnostics, and their nonempty input
counts were verified. These checks precede current-main integration and the full host gate.

### Whole-branch review and consolidated fix

Whole-branch review of `69cbf4f7f66cbf944394202cc497ff4294a842dd` found two Important
issues. A real reservation deletion after open allowed capacity-one cross-run admission
while the first attempt still held capacity. Four SQLite operations also observed caller
mutations after invocation: renewal, manifest retention, run creation and admission.
The reviewer's isolated diagnostics and output are retained at
`/tmp/storage-final-review-probes.ts` and `/tmp/storage-final-review-probes.log`.
One initial probe incorrectly used the test preload outside the test runner; that setup
failure is excluded. Subsequent real-provider probes confirmed both issues. The branch
was not accepted despite the earlier task approvals.

The consolidated fix centralizes global reservation correspondence for open and live reads,
admission, decision consumption, execution, outcome and receipt transitions. Missing held,
reserved settled and orphan reservation rows throw before capacity-dependent changes;
release does not silently repair damage. Owner refusal still precedes these live checks.
The four object-taking methods clone complete requests before queueing, while clock,
owner and revision observations remain inside the lock.

New capacity tests cover all six live routes and all three corruption classes, cross-run
capacity-one admission and own-target releases. They assert stale-owner refusal, rejection
without physical row changes, restoration and valid behavior. Shared request tests mutate
owner and payload aliases immediately after invocation, including complete valid replacement
manifests and originally stale requests. Four SQLite cases queue behind a real independent
`BEGIN IMMEDIATE`, mutate while blocked, then assert the original request and post-lock
clock observation after release.

Authoritative capacity RED: 19 missing-rejection failures after correcting two fixture
setup mistakes. Real queued-request RED: four explicit reply failures. Initial focused
GREEN: 75 tests, 289 assertions. Nineteen distinct production removals were then observed
failing, each followed by its restored passing rerun: six live validation routes, open,
three correspondence predicates, correspondence enforcement, capacity ceiling and seven
request snapshots. Exact edits, argv, exits and output are in
`/tmp/storage-final-fix-proofs/`, `/tmp/storage-final-fix-snapshot-proofs/` and
`/tmp/storage-final-fix-renewal-proof/`, each with `results.json`, `.diff` and RED/GREEN logs.
Accounting is 27 mutation trials and 54 focused test invocations, including superseded
snapshot trials that failed through a helper. Those owner tests were strengthened to
explicit reply assertions and repeated; renewal required one further correction/repeat.
The final proof set uses the strongest explicit evidence for each removal. Earlier whole
mutation sweeps were not rerun or recertified.

The initial broad test command omitted `./`, collected generated tests and exited 1 with
16 loader errors; its 416 source passes are not a valid aggregate GREEN. Initial typecheck
found six test-only union/brand diagnostics, corrected without production casts. Initial
lint exited 1 with an Nx plugin-socket fallback warning but no ESLint diagnostic; its cause
is unestablished and no success is claimed. The final commands below disabled plugin
isolation and ran after all changes and restorations settled.

- `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs --timeout=60000`: 416 pass, zero fail, 1,210 assertions, 17 files, 11.05s.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:typecheck --skip-nx-cache`: exit 0, 1.8s.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-dash:lint --skip-nx-cache`: exit 0, 18.2s.
- Prettier check of the five changed source/test files and `git diff --check`: exit 0.

Final logs: `/tmp/storage-final-fix-final-{tests,typecheck,lint,format,diffcheck}.log`.
Root inspected those logs, the complete report and production diff. The shared validator
scans global attempts/reservations; no performance benchmark or optimization claim is made.
Scoped final re-review and the exact-SHA host gate remain pending. Parent acceptance remains
unchecked. No migration/schema, live service, coordinator, deployment or second-provider
behavior was added by this fix.

After integrating current main at `69cbf4f7f`, root repeated the supplementary scans:
all 194 tracked SQL paths passed migration lint and all 11,590 tracked paths passed the
plaintext-secrets scan, both exit 0 without diagnostics. These scans precede the fix above;
its changed files are covered by staged hooks, while full CI/host acceptance remains pending.

### 2026-10-22 — final review closed; first aggregate gate found an ADR collision

Scoped final re-review of `69cbf4f7f..a4de3b5b3` closed both Important findings above
and found no new breakage. It inspected the twelve capacity/open fault diffs and the
strongest seven request-snapshot faults with their RED/restored GREEN logs. No additional
broad test run was represented as reviewer evidence.

The clean isolated h2 gate printed
`h2puni gate: running on a4de3b5b313a6c3b3df6edce325f9284b78f22bc` under the
canonical heavy lock. Frozen install, all 267 OpenSpec validations and format passed.
During its first Nx batch, `tool-devsync:test` reported 894 pass, one fail and 3,165
assertions in 733.67s: `ADR numbers are unique and contiguous from 0001` observed two
ADRs numbered 0056. The full run is therefore not acceptance evidence. At this record's
commit, the first batch is still draining; later Twilight and solver-smoke stages have
not run. Full log: `/tmp/puni-agentic-gate-a4de3b5b3.log`. The external Tool Wiki
activation marker was inactive/not-certified; no certification is claimed.

The planning merge introduced this change's proposed activities ADR0056 while main
already held UI-kit ADR0056. `git ls-tree` at main `d504c9eae` and a fresh GitHub main
ADR listing confirmed that main owns the UI-kit number and has no ADR0057. Root renamed
only this change's ADR to0057 and updated its own proposal/design references. ADR bytes,
runtime code and tests are unchanged; the existing numbering guard remains intact.

- Before correction, `bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/adr-index.test.ts`: zero pass, one fail with duplicate56 versus expected57.
- After correction and staging the rename, `bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/adr-index.test.ts ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`: 16 pass, zero fail, 21 assertions, 15.21s.
- The first broader local attempt before staging was not green: ten pass/six fail. Five failures read the old path from Git's index; the production index-checker case could not write temporary Git objects under the sandbox. Staging the intended rename and running with the required Git write permission produced the passing result above. No check was weakened.
- Prettier for the renamed ADR and two updated documents, and `git diff --check`: exit0.
- `openspec validate twilight-agentic-workflows --json`: one valid change, zero failures, the same seven long-requirement warnings.

Local logs: `/tmp/puni-agentic-adr-green.log` (failed unstaged/sandbox run),
`/tmp/puni-agentic-adr-staged-green.log` and `/tmp/puni-agentic-adr-openspec.json`.
The corrected committed SHA still requires a complete new host gate; parent6a.1–6a.2
and Task5's final acceptance checkbox remain unchecked. No live bridge, coordinator,
second durable provider or deployment acceptance follows from these checks.

### 2026-10-22 — workflow-binding packet preflight

Binding work is isolated on `feat/agentic-workflow-binding`, based on storage candidate
`42681e77400689b05d802f8fdf34c7d0f5d38aa1`, in the native managed worktree
`/home/df/.codex/worktrees/d4f8/puni-00`. The storage PR and its replacement h2 gate
remain separate; this does not claim storage aggregate acceptance.

The reviewed binding supplement expands parent1.1–1.2 into three TDD slices: strict
shape/coverage and checked class selection; exact prompt-byte acceptance and real loader;
CLI integration. Approval/budget declarations, defaults/gate rollout, runtime retention,
adapters and dispatch remain outside this packet. The sample now defines its previously
dangling review/integrate classes; its human integration class models only the wait.

Frozen Bun install succeeded with1493packages in1.57s. Before any behavior changes, the
existing canonical, navigator-records, invoke-cli, cli and no-ambient-clock tests passed:
39tests,237assertions,5files,17.24s. Command: `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/canonical.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/navigator-records.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/invoke-cli.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/cli.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`.
Logs: `/tmp/puni-binding-install.log`, `/tmp/puni-binding-baseline.log`. This baseline
verifies existing behavior only; no new binding implementation or R5 proof exists yet.

Adoption OpenSpec validation: one valid change, zero failures, eight long-requirement
warnings (seven before the added acceptance requirement). The new warning reflects the
explicit snapshot/IO contract; no validation failure is ignored. WBS I1 is a rolled-up
parent: an attempted atomic notes/progress update refused `rolled_up`, and reread confirmed
no note/status change. Progress must be recorded on its actual schema/CLI children. Their
broader sandbox/cwd, approval/budget, retry/context and retained-manifest requirements are
explicit remaining work; the static subset does not complete I1.01 or I1 overall.

### 2026-10-22 — binding Task 1 candidate: strict shape, coverage and selection

Implemented only static decoding, complete per-type step coverage and checked class
selection in the four planned contract files. Prompt-byte acceptance, YAML/IO, CLI,
retention and execution remain later work. No acceptance digest or runtime authority
is produced by this slice. Independent task review remains pending.

Focused command: `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`.
Setup red was a missing module (not guard evidence); exported scaffolding then produced
65 failing behavior tests. Final restored source passes 79 tests with 114 assertions,
zero failures, in326ms. Self-review first observed and corrected array-subclass admission,
sparse-step refusal classification and deterministic raw-JSON error ordering.

Uncached checks both exited0: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` (1.4s) and the same invocation with
`twilight-burokrat:lint:source` (19.1s). Initial typecheck/lint attempts failed on new
index-signature access, interface style and redundant conditions; those were corrected
before these final runs. Lint retains the ambient NO_COLOR/FORCE_COLOR warning.
Four-file Prettier check and `git diff --check` pass.

R5 evidence:55 distinct production faults,55 failed filtered runs and55 successful
restored runs (110 filtered invocations). The JSON summary has55 unique IDs. Exact
patches, argv and logs live at `/tmp/puni-binding-task1/proof-<fault>.{diff,command.json,fault.log,restored.log}`;
`proof-summary.json` indexes them. This is not55 independent unsafe-admission claims:
version/executor/bare-model and some selection/project-step faults change the required
named refusal while another guard still rejects. The fraction proof removes both
integer defenses; the whole JSON-boundary proof observes accessor admission and does
not independently certify each cycle/symbol subexpression. Setup failures are excluded.

Root inspected the complete report and summary, final checks and four exact fault/restoration
pairs. In the strong coverage proof, bypassing only unknown-step rejection accepted `qa`.
Removing document detachment froze caller settings, making a required successful
`Reflect.set` returnfalse. Separately removing deep freezing made returned nested settings
mutable. A complete duplicate project-step set also proves actual admission without the
uniqueness check. Adjacent Proof comments distinguish these outcomes from classification
and combined faults; the full evidence remains available for independent review.

Logs and full report: `/tmp/puni-binding-task1/` and the task ledger's `task-1-report.md`.
No full host gate, broader Burokrat suite/build, live service, migration or runtime integration
check was run for this slice. Storage gate evidence applies to its separate candidate only.
Task1 checklist and parent1.1–1.2 remain unchecked; this subset does not complete broader
WBS I1.01 sandbox/cwd/approval/budget/retry/retained-revision/context requirements.

### 2026-10-22 — binding Task 1 review fix: undeclared tool prompt classification

Independent task review found one Important contract defect: a tool class has no prompt
field, but an invalid extra prompt was classified as invalid_prompt_path before strict
shape rejection. The fix interprets prompt paths only for prompt-bearing executors.
Two regressions assert the named code and path for both valid and invalid extra tool
prompts; the initial run passed the valid-path case and failed the invalid-path case
with the reported wrong code. Both pass after the fix.

Removing only the new executor guard reproduced the wrong-code failure; restoring it
passed the exact filtered test. This adds one classification fault/restoration pair to
the earlier 55 distinct pairs, without rerunning or recertifying those earlier proofs.
Exact evidence is in /tmp/puni-binding-task1/fix-round-1/.

Final focused binding suite: 81 pass, zero fail, 120 assertions, 459 ms. Fresh uncached
Burokrat typecheck (1.4 s), source lint (36.7 s), affected-file Prettier check and
git diff --check pass. The ambient color-environment warning remains disclosed.
Root read the complete fix report, source diff, regression/mutation logs and final
check output. Scoped re-review remains pending; no Task 1 acceptance is claimed here.

Scoped re-review of c54d20e57..6acadfde1 closed I1 and found no new Critical/Important
breakage. It inspected the exact regression, guard-removal/restoration and final check
artifacts without rerunning the suite. Binding Task 1's six slice boxes are accepted.
Parent tasks 1.1–1.2 and broader I1 remain open until their remaining acceptance work;
Task 2 now supplies real prompt bytes, immutable acceptance and the filesystem/YAML loader.
The minor ambient color warning remains disclosed as an invocation-environment issue.

### 2026-10-22 — binding Task 2 candidate: byte acceptance and real loader

Task 2 adds exact-byte SHA-256, immutable acceptance/selection, strict YAML 1.2
and a real filesystem loader in the eight planned source/test/fixture files.
Root read the full implementation report, production diff, final check logs and
an actual loader-returned BOM acceptance snapshot. Independent task review remains
pending; no Task 2 or parent completion is claimed.

Fresh focused tests pass 129/129 with 251 assertions in402ms; canonical tests pass
7/7 with12 assertions. Both use ./-anchored source files and the scratch preload.
Uncached Burokrat typecheck (1.4s), source lint (19.2s), eight-file Prettier check
and git diff --check pass. The inherited NO_COLOR/FORCE_COLOR warning remains
visible. Commands and complete evidence are retained in the binding task ledger's
task-2-report.md and task-2-evidence directory.

TDD first observed missing APIs (not behavioral proof), then81 passing/44 failing
tests with throwing stubs. An initial standard-tag/environment-path test failed
because its braces violated existing RelativePath syntax; a literal dollar-named
file corrected the fixture without widening production paths. Initial test typing,
import order and arrow-style diagnostics were corrected; the intermediate eslint
typing diagnostic has transcript evidence only, as disclosed in the report.

R5 accounting is39 distinct production mutations/39 invocations:38 failed and one
expected non-proof passed. Removing only the local synchronous byte copy remained
green because only immutable strings escape. There were three aggregate restored
green runs, not38 separate fault/restoration pairs. Later batches added wrong-source
membership and strict-comment-spacing coverage. Production was restored between
mutations and final checks ran on restored source. Real binding/prompt deletion and
chmod(0) tests ran as uid1000 with actual read failures and no permission skips.

Observed faults cover exact prompt-source sets, fatal UTF-8, original BOM-byte
hash/base64 correspondence, digest descriptors/order, immutable output layers,
root anchoring/physical containment, pre-read regular-file checks, YAML syntax,
version/keys/aliases/tags/merges, and missing-versus-unreadable classification.
Some faults change a required refusal while another guard still rejects; they are
not claimed as unsafe admission. Directory tests prove the nonregular boundary;
no actual FIFO/device was opened. Original Task 1 fault proofs were not repeated.

The retained observed-acceptance.json has original bytes77u/QQo=, decoded text
A plus newline, SHA34458efc6b3e8689be7b17dffa5c40d9c1b72807c93cd35c96f8a6e1b4484a7c
and acceptance digeste497237ece2c34c931eb80f100b5a9a5335b5578e17870ac0b5abce4edeb1f9b.
Output mutation attempts returnedfalse; later file edits left the accepted value
stable while a new acceptance changed its digest.

No CLI, full package test/build, full host gate, live service, runtime authority,
spending or retention integration was exercised by this slice. Host gate evidence
for storage42681 applies only to that separate candidate. Hostile filesystem races,
atomic checkout and concurrent SharedArrayBuffer writers are not claimed.

### 2026-10-22 — binding Task 2 review fixes

Independent review found two Important issues: a permission-denied root reported
the binding filename instead of repositoryRoot, and loader/acceptance duplicated
the declared prompt-set rule. The fix checks actual root traversal capability
inside the root error boundary, preserving EACCES as cause, and shares one narrow
listBindingPromptPaths helper without changing filtering/deduplication/sorting.

A real chmod(0) regression ran as uid 1000 and failed against the original code.
Removing only the new X_OK check reproduced the wrong-path failure; restoring it
passed the focused suite. This is one distinct source fault, one failed invocation
and one restored green invocation; the original pre-fix regression is separate.
Earlier 39 mutation trials were not repeated or recertified.

Final restored checks: 130 binding tests pass with 257 assertions in 379 ms;
7 canonical tests pass with 12 assertions; fresh uncached typecheck (1.5 s),
source lint (19.9 s), eight-file formatting and git diff --check pass.
The inherited color warning remains visible. Full fix report and exact
fault/restoration logs are in the binding ledger's task-2-report.md and
task-2-evidence/fix-round-1. Root inspected the full report, source diff, actual
failed/restored logs and final check output. Scoped re-review is pending;
Task 2 and parent acceptance remain open.

Scoped re-review of ebc2eba28..5b007a33d closed both I1 and I2 with no new
breakage. Root read the complete report and accepts Task 2's six slice boxes.
This accepts static byte snapshots and real loading only; Task 3 CLI, parent
1.1–1.2, broader I1 governance and runtime retention remain open. Full packet
review and integration checks remain required after Task 3.

### 2026-10-22 — binding Task 3 candidate: CLI validation

The candidate adds the exact five-argument workflow-binding command before generic
record validation. It prints the accepted digest and newline only on success;
malformed arguments refuse before filesystem access. Existing JSON validate and
validate-record commands remain supported; workflow-binding is not a RecordKind.
README documents the invocation root, complete-type fallback and static limits.

Root read the full task-3-report.md, production diff, retained final check logs and
the actual qa-bypass command output. Original feature RED had 41 passing and
19 failing tests; initial GREEN had 62 passing. An added repeated --steps value
regression first observed unknown_step instead of invalid_arguments, then passed
after its narrow grammar fix. Initial bounded typecheck failed on a Bun test.each
rest-tuple callback; only the test table changed to explicit name/args rows.

Final unchanged-source packet: 164 tests pass, 398 assertions, four files, 27.21 s.
Fresh uncached Burokrat typecheck and source lint, ten-file Prettier check and
git diff --check pass. OpenSpec reports one valid change, zero errors and the
same eight long-requirement warnings; strict validation was not claimed. The
inherited color-environment warning remains disclosed.

R5: 11 distinct production mutations produced 11 failed targeted invocations and
14 failed cases. They cover early routing, exact arity, helper prefixes, filename
checks, required flag, repeated flag value, step-segment shape/uniqueness and
the actual binding checker's step membership. All faults were restored; the final
packet is restored GREEN, not 11 separately observed restoration pairs.
Some faults change the named refusal while another boundary still rejects.

With only membership rejection bypassed, a complete approve-plus-qa binding and
readable prompt actually exited 0, printed digest
9166ebba065a345820873dc08e560bd8fc3e885f0c59aa67956b30abeb80ae90 and a newline,
and emitted no stderr; the refusal test then failed on exit status. That extra
process is separate from the 11 mutation-test invocations. Exact evidence, argv,
diffs, final source hashes and logs are retained in task-3-evidence beside the
binding ledger report. Historical Task 1/2 fault matrices were not rerun.

Independent Task 3 review is pending. No package-wide build/test, portable
installation, full host gate, live service, runtime, retention or authority check
was performed by this scoped slice. Parent 1.1–1.2 and whole-packet acceptance
remain open; I1 governance, defaults and runtime integration remain separate.
