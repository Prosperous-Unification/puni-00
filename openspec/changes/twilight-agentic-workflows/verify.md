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

Independent Task 3 review of 86639e3fc..01838e29f found no Critical or Important
issue and approved spec compliance and quality. Root read the complete report and
accepts its six slice boxes. Existing OpenSpec/color warnings remain nonblocking
and disclosed. Whole-binding review and integration gates remain pending;
parent 1.1–1.2 are not yet closed.

### 2026-10-22 — workflow-binding packet review and package validation

The independent whole-packet review of storage base `79f4dcdd9` through
`5a74a694ec468bd37a25a13be6807e564464da38` approved the binding implementation
with no Critical or Important findings. All three task reviews are closed.
The reviewer inspected the full diff and a focused trailing-newline command
refusal; it did not rerun suites or recertify historical fault matrices.
Existing color-environment and eight OpenSpec long-requirement warnings remain
disclosed.

On exact source head `5a74a694ec468bd37a25a13be6807e564464da38`:

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test,build -p twilight-burokrat --parallel=2 --skip-nx-cache`
  passed all six targets (Burokrat test/build and four dependencies) in 41m7s.
  Log: `/tmp/puni-binding-aggregate-5a74a694e.log`.
- After that run completed,
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:test:package --skip-nx-cache`
  passed: 84 tests, 462 assertions, nine files, 250.31s; Nx total4m18s.
  This exercises the actual tarball installation and isolated executable.
  Log: `/tmp/puni-binding-package-5a74a694e.log`.

Parent 1.1–1.2 implementation and review are accepted. Parent1.3 repository
defaults/gate adoption, broader I1 policies/retention and runtime integration
remain open. The exact-SHA binding h2 gate and merge remain pending; the separate
storage gate does not certify this branch. No publishing or deployment occurred.

### 2026-10-22 — completed storage and binding host gates

The canonical h2puni wrapper completed with exit0 on exact storage head
`79f4dcdd97ba2111170558b71965899212171859`: frozen dependencies,267 OpenSpec
entries, format,180 workspace tasks in45m53s, Twilight targets in46m41s, both
source lints and actual Docker solver checks (3 tests/15 assertions in10.61s;
Docker target3m6s). Log: `/tmp/puni-agentic-gate-79f4dcdd9-retry.log`.
The preceding queue expiration occurred before checks and remains historical;
this completed run is the current storage evidence.

The same wrapper independently completed with exit0 on binding head
`6f09b11fc638c36c3d90747b98a0eabd63147c0e`: frozen1801 installs/1648 packages,
267 OpenSpec entries, format,180 workspace tasks in46m20s, Twilight targets
in48m20s, Burokrat source lint25.9s, Dash lint21.7s and actual Docker solver
checks (3 tests/15 assertions in10.51s; Docker target4m8s). It waited1433s for
the canonical host lock and printed the exact SHA. Log:
`/tmp/puni-agentic-binding-gate-6f09b11fc.log`. Both runs used the clean isolated
host gate tree. Existing Docker pip root/version notices and the controlled
orphan EOF diagnostic are retained; tests passed. External trusted Tool Wiki
activation remains unavailable (`certified:false`), not a passing certification.

Independent storage/binding reviews plus these exact gates accept storage parent
6a.1–6a.2 and the static binding packet. Other coordinator, provider portability,
governance, repository-default and product milestones remain open. Draft PR629
and PR639 carry the completed evidence; neither was merged or deployed here.
These are exact historical head results, not a claim that subsequent source is gated.

### 2026-10-22 — API-model executor plan adoption

Adopted executor-design.md, executor-tasks.md and the owning activity-execution
delta on a separate native worktree based on the gated6f09 binding/storage head.
Reconciled the parent's illustrative port and fake-adapter/prefix-check tasks to
one contract, injected capabilities, actual SDK mocks and honest recovery limits.
The three slices are port/settings, real SDK turn conversion and local owned
session lifecycle. No executor implementation or live entry point is enabled by
this adoption. Receiver HTTP work remains in its separate branch.

Frozen setup installed1493 packages in989ms. Inherited baseline command:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/workflow-binding.test.ts ./apps/twilight-structure/twilight-dash/cli/src/runs/run-store.test.ts --timeout=60000
```

Observed119 tests/252 assertions across2 files pass in530ms; log
`/tmp/puni-executor-baseline.log`. This proves the inherited baseline only.
No executor behavioral test, typecheck, mutation proof, build or new exact-SHA
gate has run. Planning formatting and diff checks passed. OpenSpec validation passed one change,
zero errors and seven untouched long-requirement warnings. The first draft had
12 warnings; tightening the five owned requirement paragraphs and retaining their
testable details in scenarios removed those warnings without changing other deltas.
No provider factories, credentials, tenant limits, CTT or WBS writes are part of
this packet; full preparation/turn intent persistence and receiver pin/grant
mapping remain later durable integration.

### Executor Task 1: identities and selected SDK settings

Candidate source implements the five-kind port, detached strict preparation/turn/locator snapshots, safe correlated dispatch exceptions and accepted API settings over injected concrete SDK model/tool capabilities. It introduces no adapter execution, provider factory, environment credentials, network calls, storage writes or durable recovery. Actual accepted BOM prompt bytes retain their binding digest while decoded instructions are Hi; zero SDK streams are observed. All four exact source/test consumers receive only the anchored contracts import allowance.

Fresh focused command: TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/agents/activity-executor.test.ts ./apps/twilight-structure/twilight-dash/cli/src/agents/api-model-settings.test.ts --timeout=60000: 18 pass, 0 fail, 85 assertions. The named Dash executor effective-policy case passes 1 test/50 assertions after genuine Nx graph initialization; product-constraints.test.ts passes 3/9. NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p twilight-dash,tool-devsync --skip-nx-cache --output-style=static: four targets pass in 1m28s. Policy-file lint, source formatting and git diff --check pass. Three unused-disable warnings occur only in untouched tool-devsync files, plus existing color-environment warnings; output is not pristine. Full tool-devsync suite, adapter/SDK dispatch and aggregate host gate remain unrun for this slice.

R5 evidence is retained in the task-1 report/evidence workspace. First source batch: 26 independent invocations, 24 intended failures and 2 surviving constructor negatives. Bun toThrow accepted returned Error objects; corrected void callbacks then watched both constructor guards fail in the second 19-fault batch. The real other-executor case proves a named diagnostic with the prompt backstop intact; the unmasked executor-tag trial instead corrupts the trusted SelectedActivity dependency and proves only that consumer boundary. A real null-tool test first failed by accepting null, then passed after the precise guard; removing only that guard failed. Four valid loaded policy mutations failed admission, judge/relative/path-denial assertions. Each fault restores exact original bytes in finally; final source hashes were freshly verified by root. These are trial counts, not unique guards or immediate RED/GREEN pairs. Initial missing-module RED, malformed policy loader attempts and an unresolved nonexistent alias are disclosed and excluded from semantic proof claims. Missing model/bare-ID negatives use the actual accepted-binding and SDK registry boundaries; no redundant prefix guard was added. Independent task review is pending.

Executor Task1 independent review at73749d161: spec compliance and task quality APPROVED, no Critical/Important. Reviewer inspected actual fault outputs and freshly verified all six final source/policy hashes. Deferred minors are the three untouched tool-devsync unused-disable warnings and existing color environment notice. Root fresh OpenSpec output records1valid0failed7existinglong-requirement warnings; candidate hooks actually passed plaintext-secrets/format/lint in8.97s, external ToolWiki inactive/certified:false. Only Task1 is accepted; driver/session/durable recovery/full build/gate remain open.

### Executor Task2: real SDK turn driver candidate

runApiModelTurn executes actual installed ToolLoopAgent with one observed stream feeding standalone UI conversion, zero SDK retries, distinct stop/length/tool-budget/content-filter outcomes and per-step usage completeness/safe sums. Completed history uses accumulated SDK responseMessages. Actual accepted-binding/model/tool fixtures exercise the production driver; there is no adapter/session/RunStore/WBS/provider/credential wiring or live/paid call. SDK error ownership follows the source-reviewed callback/invalid-call/provider paths, retaining original causes and correlated aggregate cleanup failures. Failed abort makes no one-dispatch or physical-stop guarantee.

Final three-file executor focused run:53pass0fail202assertions; named effective-policy1pass63assertions; product-constraints3pass9assertions. Initial two-project static command had tool-devsync typecheck/lint and Dash typecheck pass but Dash test import sorting fail, overallexit1. After correction the fresh Dash-only typecheck/lint run passes42.0s; unchanged successful tool-devsync targets were not repeated. Policy-file lint, four-file format and diff checks pass; root recomputed all four final source/policy hashes. Existing untouched lint/color warnings and new synthetic SDK default error logging are disclosed; output is not pristine. Full project/build/host gate and Task3 remain unrun. Independent task review is pending.

R5 records56trialinvocations including repeated/surviving/excluded attempts, not56unique guards. Actual zero-retry removal makes3calls vs1; SDK totals turn incomplete counts into measured; count/sum/limit/terminal/observer/approval/input/privacy faults reach their stated contract failures. Original callback removals survived a duplicate raw error backstop; disjoint actual SDK ownership removes that redundancy. Corrected green-baseline local callback/abort removals make2calls vs1 with working abort, invalid-call removal loses typed cause into uncertainty, provider raw removal loses original cause. Abort-cleanup tests retain both causes/identity. An unsupported one-call assertion when abort itself failed made a strengthened baseline red52pass1fail; all affected earlier tool-cleanup fault attempts are excluded. Corrected35-test117assertbaseline is green before revised faults, final53-test covering green follows exact restorations. A provider-preliminary exploratory assumption and a redundant local raw suppression were removed after failing/surviving evidence. Broad policy widening initially hit option parity; precise agents-path widening instead reaches named driver-source denial. All historical setup/compile/fault failures and exact restoration transcripts remain in task2 report/evidence.

Process deviation: worker used ignored Python fault/check orchestration despite the Bun/Nx-only instruction; the observed tests and static checks themselves executed Bun/Nx. Preserve that history, not relabeled evidence. Future orchestration must use Bun; no repeated valid tests merely to rename the historical runner. This deviation does not supply extra behavioral proof or excuse any failed baseline.

### Executor Task2 review fix round1

Independent review found rejected SDK reader API-call errors bypassed the raw-error-part classifier; an actual partial stream probe threw ActivityDispatchError instead of transport_lost. Root also clarified that complete approval/client-input suspensions retain observed measured usage or provider-usage-unavailable, remaining unresolved without history/effect completion. The actual driver now classifies rejected transport after preserving local-tool and listener cleanup/error ownership, retains partial text/correlation, and preserves combined abort-failure causes. Incomplete suspension terminals remain provider_incomplete with interrupted usage. Only driver/test plus owned design/spec/verify changed.

Real SDK regressions first selected13cases with5pass8fail; corrected48tests161assertGREEN before fault batch. Nine individual production negatives cover rejected-reader classification, local tool API-call ownership, listener cleanup and uncertainty precedence, reader cleanup, both suspended usage returns, incomplete terminal trust and approval routing. All observed intended failures and exact restoration to pre-commenthash06f23eae; one target-string setup failure occurred before mutation and is excluded. Root read complete appended report and selected actual proof/final transcripts, and recomputed both final hashes. Final covering66tests246assert3filesPASS; fresh Dash typecheck/lintPASS38.4s, format/diffPASS. Existing SDK synthetic error stderr and inheritedcolorwarnings remain; all fix1 orchestration Bun-only. No durable host/backend/quiescence/Task3 claim. Scoped independent re-review pending; no Task2 checkbox accepted.

### Executor Task2 review fix round2

Fix1 scoped re-review marked original I1/U1 addressed but demonstrated new ImportantI2: a listener failure made the broad observer catch swallow malformed reported usage. The actual negative-count SDK stream/finish-step-listener probe returned observer_failed instead of a correlated fatal exception. The second fix narrows modeled observer precedence to actual SDK API-call errors or the identical owned signal cancellation reason, preserving existing fatal cleanup/correlation for malformed usage and unexpected reader errors. The count diagnostic and other exception/cleanup ownership are unchanged.

Three actual SDK regressions first yielded1pass2fail, then51tests178assertGREEN. Three isolated production predicate faults reproduce fatal suppression, loss of modeled transport precedence and loss of identical cancellation precedence; all failed intended assertions and restored exact bytes, no survivor/setup failure this round. Final69tests263assert3filesPASS, fresh Dash type/lintPASS23.4s, format/diffPASS. Root read complete appended fix2 report, verified both final hashes and selected actual covering/static/fault logs. All round2 orchestration Bun/Nx; historical warnings/deviations remain explicit. Scoped re-review pending; Task2 checklist and Task3 remain open.

### Executor Task2 changed-dependency proof reconciliation

After fix2 scoped re-review closed I2, root identified that the new outer API-call classifier might mask the old raw-error-part classifier proof. One actual focused current-source removal survived: final transport uncertainty stayed the same, but actual sanitized UI error delivery disappeared. That survivor remains historical evidence, not a current outcome negative. Root ruled to retain the existing one-stream UI projection and prove the real observable boundary instead of adding a redundant exception guard or removing meaningful UI behavior; design/spec state it explicitly.

Fix3 changes no executable production behavior: the real SDK transport test now checks one sanitized error chunk with nonempty string text and retains private-text redaction, while its stale adjacent Proof names actual UI loss separately from the original NoOutput throw. New assertion baseline1pass7assert; the same isolated classifier removal then fails expected1errorchunk/actual0 after transport/one-call assertions pass, with exact byte restoration. No full trace/abort-count contract added. Final69tests266assert3filesPASS; fresh Dash type/lintPASS22.6s, format/diffPASS. Root read complete appended report and actual selected proof/final logs, verified both final hashes. Scoped re-review pending; Task2 checklist/Task3/full packet gate remain open.

Task2 fix3 scoped re-review at41af4df08: changed-dependency R5finding ADDRESSED, actual SDK UI-error delivery and truthful replacement proof confirmed, no new fix-range breakage. OriginalI1/U1/I2 remain closed. The four Task2 local implementation/test/proof/static steps are accepted after69passingtests266assertions, fresh static checks and all scoped reviews; Task3 and full-packet host/CI/integration requirements remain open. No full SDK packet/S0.03/S0.08/S7a, live provider, backend recovery or physical-quiescence completion is implied. Deferred M1SDKlogging/M2color/M3historicalPython remain for final whole-branch review.

### Executor Task3: process-local API-model lifecycle candidate

The actual createApiModelExecutor composes accepted settings and reviewed SDK driver behind the complete port. Owned real conversation identities, detached/frozen exact-key replay, pre-dispatch refusals without key binding, one active turn, decision continuation with private actual SDK history, uncertainty quarantine, conservative cancellation and close/listener detachment are implemented. All seven cross-process recovery capabilities and recovery queries remain explicitly unsupported. No earlier interface correction, provider factory/live wiring, credentials, RunStore/WBS writes or coordinator was added.

Final all-slice covering run88tests386assertions/4filesPASS; single uncached Dash project target2616tests12107assertions/74filesPASS450.45s(Nx7m31s). Fresh Dash typecheck/lint, scoped policy-file lint, effective-policy1test85assertions, four-file format and diff checksPASS; scoped OpenSpecvalid1pass0fail7existing long-requirement warnings. Root read the full final report, actual covering/project/static logs and selected production negatives, and recomputed all four final source/policy hashes. Existing synthetic SDK error logging and inherited color warnings remain disclosed.

R5 records34 targeted green-baseline/negative pairs(19 lifecycle,10 additional SDK/cancel/history/freeze,5 effective-policy), not34 independent guards. Each observed intended assertion failure and exact hash restoration; repeated quarantine/cause/listener faults remain separate cases. Actual active/cancel-slot removals produce2SDKdispatches; listener removal yields real converted text-end/abort after close; retained alias breaks exact settled replay; malformed-usage quarantine removal permits a fresh decision; history text-only reconstruction loses actual tool-call/tool-result messages. Local pre-abort removal proves reply/admission semantics, not physical dispatch when the SDK suppresses work. Strict exact-path policy faults reach intended admission/denial assertions with valid config.

Initial missing-module red and typed boundary17lifecycle failures, test-only type/lint corrections and post-campaign JS replacement-string/Prettier syntax failure are retained in the report. The latter wrapper ended with a successful test command and is not format proof; exact policy tail repair was followed by separately propagated final format/policy/lint greens. All Task3 orchestration used Bun. No invalid setup or wrapper exit was counted among semantic negatives. Source stable; independent Task3 review pending. ParentS0.03/S0.08/S7a, full-packet gates/CI, durable preparation/claim/turn ordering and backend effect/quiescence remain open.

Task3 independent review at6bdfbfb40: bounded spec compliance and task quality APPROVED, no Critical/Important findings. Reviewer read the exact committed diff and real fault/final evidence, with one focused unchanged-driver history check; no suite rerun or checkout mutation. Only the five fully evidenced Task3 local steps are accepted. Earlier SDK/color logging findings remain for whole-packet triage; all full-packet gates/CI, durable host/backend integration and parentS0/S7a completion remain open.

### Executor whole-packet review

Independent review of gated binding6f09b11fc..executor ebb7126be approves code-level integration of all three bounded slices, with no Critical/Important finding or source fix wave. It verifies cross-slice snapshot/configuration, real SDK error/usage/limit semantics, quarantine, exact retry, cancellation and private history. All Task2 review issues remain closed; the reviewer inspected actual final evidence and did not rerun suites or mutate checkout state.

Minor triage remains explicit: expected vendor SDK diagnostics may be captured/asserted in a separate improvement, without global suppression; UI sanitization tests do not certify production stderr sanitization. Three inherited unused directives and conflicting color settings remain separate maintenance. Historical Python orchestration was a real instruction violation; retain the actual Bun/Nx production evidence, failed/surviving proof limits and later Bun-only waves instead of relabeling history or repeating valid tests solely to rename a runner. Output is not pristine.

At this record, exact executor-HEAD canonical host gate, full-repository aggregate checks and CI are required and pending. Historical storage/binding gates certify their own SHAs only. This review cannot close parentS0.03/S0.08/S7a, authorize live providers, establish physical quiescence or replace durable preparation/claim/turn-intent integration.

## Receiver plan adoption

Adopted the scoped-only receiver contract, compact rb1 basis, immutable claim/attempt
binding, permanent acceptance ledger and unused-only rollback in an isolated branch based
on `79f4dcdd97ba2111170558b71965899212171859`. This is planning evidence, not receiver
implementation acceptance. Runtime auth/credential/provider/activation ownership stays
with the existing owners. Parent integration checkboxes remain open.

Fresh workspace checks: `bun install --frozen-lockfile` passed (1493 packages, 772ms).
`bun test ./libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts ./libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts ./libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts --timeout=30000`
passed 108 tests, 5504 assertions in 4.31s. Logs are `/tmp/puni-agentic-receiver-install.log`
and `/tmp/puni-agentic-receiver-baseline.log`. These are existing baseline tests, not proof
of the proposed receiver. No receiver implementation, R5 mutation runs or migrations have
run. Focused implementation and exact-SHA gate evidence will be recorded as performed.

Adoption validation: installed `openspec validate twilight-agentic-workflows --json` reports one valid change, zero errors and ten long-requirement warnings (three more than the seven-warning storage baseline); `/tmp/puni-agentic-receiver-adoption-openspec.json`. Formatting and `git diff --check` passed. Strict warning-free validation was not run or claimed.

## Receiver Task 1 candidate: coherent local observations

Implemented the canonical local revision descriptor and real Digest composition, plus an
admitted observation over complete local rows and steps. Project/person/credential identity
is copied before queueing; permissions and the admin person-binding exemption use a freshly
resolved membership role inside the transaction. The existing read-only SQLite project
permission decision supplies that role; ordinary command behavior is preserved. No runtime
route, ledger, grant, receipt or mutation API is exposed by this slice.

The initial real integration test placement in core violated Nx dependency boundaries.
Moved it to `apps/wbs/be-01/src/controller/runtime-state.db.test.ts`, using core exports and
the backend's actual digest adapter. No lint exception was added. Two fixture arity errors
were corrected. Direct lint runs without a project graph were not treated as full lint proof.

Validation at the candidate source:

- The full focused/regression batch passed 94 tests and 361 assertions across the descriptor,
  observation, existing SQLite fanout, mounted organization commands and module boundaries.
  This was before relocating the observation test. Its final location then passed all 17
  integration tests and 55 assertions in 3.97s. Relocation also replaced test-only Drizzle
  imports with the adapter's supported SQL-string boundary; production behavior did not change.
- Uncached domain/contracts typecheck and lint, and SQLite typecheck, passed in the first Nx
  run, which failed other checks due to the placement/type issues above (wrapper exit130).
  After correction, core/backend typecheck and lint plus dependencies passed six tasks in
  1m5s; the separate SQLite lint passed in34.9s. Nx called that repaired task flaky based on
  the earlier failure; the fresh run exited0. Ambient color-variable warning remains visible.
- Formatting of all13 source/test/export files and `git diff --check` passed. No new migration,
  build, live runtime route, deployment or exact-SHA receiver gate is claimed.

R5:21 distinct injected production faults each exited1, followed immediately by a restored
exit0 run (42 targeted invocations). They cover descriptor fields/validation, sparse rows,
current role/person/pin checks, source capability binding, request snapshots and admitted
capture. The actual SQLite UoW bypass exposed a staged row and premature observation while a
real writer remained open; it was restored byte-for-byte with no final UoW diff. Named-fault
and expected-refusal proofs are distinguished from success-versus-refusal proofs: F09/F10
still threw incidental TypeErrors without diagnostics; F11/F12/F17/F18 changed typed refusals
into throws. These do not claim unauthorized successful reads. The first malformed-role
injection was blocked by SQLite's CHECK and was not counted; the successful corruption probe
explicitly disabled that constraint before testing the actual trusted-role reader.

Exact commands, failed setup attempts, per-fault patches/logs, restorations and limits are in
`.superpowers/sdd/receiver-tasks/task-1-report.md` and `task-1-evidence/` in the receiver
worktree. The fault logs retain their original pre-relocation test path; final-location
regressions passed without rerunning the historical fault matrix. Independent Task1 review
approved spec compliance and quality at `23ae1d8093bcc96a9f3e40fc7255283ddbc2ca82`,
with no Critical or Important findings. The color-environment warning and historical Nx
notice are deferred tooling minors. Review inspected F01/F16 directly without rerunning
the matrix. Parent integration and exact-SHA receiver gate remain pending.

### 2026-10-22 — receiver Task2 persistence candidate

Implemented the required runtime store in SQLite and memory: four permanent
ledger/authority/binding/receipt tables, exact scoped identities, row/count
atomicity, immutable retained history and an additive migration with guarded down.
The generic source remains lazy before explicit migration. Every runtime operation
currently audits owned schema and all retained rows/payloads; cost grows with retained
history. Canonical request bytes remain opaque at this layer; Task3 owns digest,
receipt correspondence, current authorization and actual application acceptance.

Fresh checks in the isolated receiver worktree:

- Focused real-source/parser/WorkingPlan/inventory suite: 106 tests,432 assertions,
  six files,9.81s, all passed.
- SQLite conformance:82 tests,6992 assertions,37.06s; memory conformance:82 tests,
  5436 assertions,2.86s. Both certify the new runtime family without exclusions.
- Uncached core/contracts/SQLite/memory/conformance typecheck and lint passed in
  their final covering runs. Final conformance unit/typecheck/lint also passed.
  Initial failures exposed WorkingPlan catalog propagation, closed family/case
  registries, a duplicate test registration and ordinary lint/type errors; these
  were corrected and their failed logs retained.
- Forward migration lint was invoked explicitly on
  `20261022120000_add_runtime_commands/migration.sql` and exited0. Its SHA-256
  `ef8f1b818cb1e2d98f6f933f3e7125ac00cd1c428124afd5619c254cccaba00d`
  matches the repository's pinned inspection identity. Formatting/diff checks
  passed. OpenSpec validates one change with zero errors and ten existing
  long-requirement warnings.

R5 evidence contains64 distinct mutations and64 failing targeted trials:36 in the
first summary,27 in the extra summary, and one WorkingPlan lifetime fault. The first
63 were restored after each trial and followed by aggregate restored GREEN runs;
they are not63 immediate red/green pairs. The lifetime fault has an immediate
restored GREEN. Actual SQLite UoW rollback-to-COMMIT and memory staged-state aliasing
leaked earlier writes after a real late duplicate receipt failure. Removing the
primitive savepoint left a binding after a counter-trigger failure. Removing the
history audit produced false absence, and removing the down guard let the actual
rollback helper drop retained history. Named diagnostic and schema/constraint
proofs are distinct from successful unauthorized business operations.

Full commands, failures, historical mutation runners and per-fault outputs live in
`.superpowers/sdd/receiver-tasks/task-2-report.md` and `task-2-evidence/`. Historical
runner spellings predate formatting/lint cleanup; final restored suites passed,
without claiming the entire matrix was rerun afterward. Task1's matrix was not
rerun. This candidate has no runtime routes, application acceptance, full backend
suite, build, live deployment or exact-SHA receiver host gate. Independent Task2
review and parent acceptance remain pending.

### Receiver Task2 independent review — fixes required

Candidate `360dc8bb928419132cf64ba52d101bdab936f4ef` received a task-scoped
independent review. Two Important findings are open: SQLite binding insertion
accepted a non-string scope into permanent history, and memory audits checked
values/counts without checking scoped lookup keys, receipt ledger identity or
attempt uniqueness. Focused reviewer probes reproduced both. The original
implementer is correcting them with real regressions and watched R5 faults;
Task2 remains unchecked until scoped re-review.

The raw store's existing terminal-atomicity contract does not promise standalone
read isolation. Task3 application operations must continue to use the admitted
transaction. The new runtime family is certified without exclusions; the memory
provider's complete report still has six existing exclusions and absent
`livePlans`/`projectRanks` families. No broader certification is claimed.

#### Task2 fix round 1

SQLite binding insertion now parses and persists the validated scope. Memory
inspection validates canonical scoped keys, exact retained lookup identities,
receipt installation identity and scoped store/attempt uniqueness. Shared scope
negatives first failed on SQLite; 22 count-preserving memory corruption cases
first failed before the audit fix. Both groups pass after correction.

Fresh covering checks: 102 focused tests/654 assertions; SQLite conformance
84 tests/7111 assertions; memory conformance84 tests/5555 assertions; all six
SQLite/memory/conformance lint and typecheck targets; format and diff checks pass.
The runtime family has no exclusions on either provider. Memory's six existing
exclusions and two absent families remain outside this certification.

Twelve distinct new guard-removal/dependency-break trials each made the targeted
production negative fail by allowing the invalid operation. Source was restored
per trial, then the complete focused suite passed once; these are not twelve
immediate RED/GREEN pairs. The original64 trials remain historical, not rerun.
Root inspected all twelve mutation-summary entries and representative exact scope,
attempt-uniqueness and acceptance-key failure output. No full receiver gate,
broad backend/application/HTTP suite or live deployment was run in this fix round.
The corrected candidate still requires scoped independent re-review.

Scoped re-review of `360dc8bb9..070035ede` found I1/I2/M1 addressed with no new
Critical/Important findings. Task2 is accepted at
`070035ede8f4d665f98d0fcac97f71ead92bfc21`; only its checklist is checked.
Canonical-request semantic/digest correspondence, current-authorized application
replay and accepted-operation lifecycle fixtures remain Task3 work. Parent
receiver/bridge completion and final integration gates remain open.

### Receiver Task3 — authority and authorized reconciliation candidate

Added real admitted authority acquisition, pinned state and receipt lookup, plus
strict canonical authority/claim/write envelopes. Current project/person/credential
authorization precedes reconciliation; acquisition additionally preserves the
existing `insufficient_scope` refusal for a credential without write scope.
Authority CAS and accepted receipt commit together. Exact historical replay does
not reacquire a current grant. State reports actual live claims beside immutable
bindings, including legitimate ordinary claim movement.

Fresh covering command (all paths prefixed `./`):

```sh
env -u NO_COLOR bun test ./apps/wbs/be-01/src/controller/runtime-authority.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/runtime-request.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-ledger.db.test.ts ./apps/wbs/be-01/src/controller/runtime-state.db.test.ts ./libs/wbs/domain/domain/src/runtime-basis.test.ts ./libs/wbs/application/core/src/ports/runtime-command-records.test.ts ./libs/wbs/adapters/store-memory/src/runtime-command.test.ts ./libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts ./apps/wbs/be-01/src/controller/claim-identity.controller.db.test.ts --timeout=30000
env -u NO_COLOR NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-contracts,wbs-store-sqlite,wbs-store-memory,wbs-be-01 --skip-nx-cache
```

Results: 230 tests/1122 assertions across10 files passed in33.85s; all12 scoped
lint/typecheck tasks passed uncached in1m40s. Source formatting and diff checks
passed. Root OpenSpec validation passed one change with zero errors and10 existing
warnings. The initial bootstrap RED was missing-module/export loader failure,
not behavioral RED for every test. The write-scope case separately failed before
its guard. Intermediate type/lint/fixture failures remain in the report.

R5:21 distinct production guard faults produced47 failed test outcomes, each
followed by byte-for-byte source restoration and a targeted GREEN. This is not47
unique tests or exhaustive mutation coverage. Faults cover current authorization,
all three ledger pins, exact payload replay, actual SQLite CAS, digest/canonical
bytes/receipt correspondence, person inventory, synchronous request detachment,
strict input fields, safe generation, batch/session bounds, finite measurement
and semantic parsing. Wrong-pin acquisition and noncanonical replay proofs expose
incorrect refusal classification rather than unauthorized mutation. Initial digest
mutants survived because the fixture had dropped an immutable trigger: schema
audit masked the intended check. Those runs are excluded. Corrected fixtures
restore exact trigger SQL before public reads; counted digest/receipt mutants let
corrupted operations resolve. Named diagnostics additionally identify each layer.

A real late receipt INSERT trigger observes staged CAS/counts, then aborts;
authority, acceptance and counters roll back. Actual accepted authority prevents
migration down even after all ordinary claims are removed. Unused down/up changes
the ledger and rejects old pins. These do not prove future guarded runtime release.
Literal claim/write receipts test retained correspondence only; actual accepted
claim/write paths remain Tasks4/5. Existing Task1 proofs are historical, with their
regression tests rerun; no whole old fault-matrix recertification is claimed.

Full commands, failed/masked trials and21-pair manifest remain in
`.superpowers/sdd/receiver-tasks/task-3-report.md` and `task-3-evidence/`.
Independent Task3 review is pending. No runtime HTTP route, full receiver build,
exact-SHA receiver host gate or live deployment is claimed. No new migration or
secret was added; separate migration/secrets scans were not run for this slice.

Task3 independent review approved spec compliance and task quality at
`2a92c978c5a96b91a32069a951278f20ae00a183`, with no Critical/Important findings.
One Minor is deferred to final review: the reference-order test also changes the
command count, so it does not isolate reference ordering. Production code preserves
that order; no behavior defect was found. Only Task3 is checked. The subsequent
commit hooks additionally passed plaintext-secrets, format and lint; migration
hooks had no applicable files, and external Tool Wiki activation remains absent
(`certified:false`). Broader receiver/HTTP/build/host-gate obligations remain open.

### Receiver Task4 — exact conditional claim candidate

`claimRuntime` uses the existing command transaction, admission, apply/journal and
committed fanout path. Current authorization and ledger pin precede retained
acceptance lookup; exact replay precedes ordinary effectful admission. New claims
require current authority and basis, an unused runtime attempt and one exact
post-apply claim. Ordinary alreadyHeld claims cannot be adopted. Binding, final
basis and accepted receipt commit with the actual business writes. Runtime callers
must inject the real Digest; ordinary-only runner composition remains supported.

Fresh covering commands:

```sh
bun test ./apps/wbs/be-01/src/controller/runtime-claim.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts ./apps/wbs/be-01/src/controller/runtime-authority.db.test.ts ./apps/wbs/be-01/src/controller/runtime-state.db.test.ts ./libs/wbs/application/core/src/module/transaction-boundary.types.test.ts ./libs/wbs/application/core/src/module/plan-commands/runtime-request.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts ./apps/wbs/be-01/src/service/plan-commands.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-contracts,wbs-store-sqlite,wbs-be-01 --skip-nx-cache
```

Observed after lint amendments: 212 tests/928 assertions across nine files passed
in18.60s; all10 scoped lint/typecheck tasks passed uncached in1m14s. Changed source
formatting and diff checks passed. Root OpenSpec validation passed one change,
zero errors and10 existing warnings. Earlier setup/type/lint failures are retained
in the report. Initial behavioral RED was10 failures at absent claimRuntime after
fixture setup correction; later coverage additions are not separate TDD claims.

R5:24 distinct fault trials failed their targeted assertions; exact source bytes
were restored after each, followed by aggregate GREEN. These are not24 immediate
RED/GREEN pairs. The corrected manifest classifies13 behavior/identity/persistence,
five borrowed-claim dependency breaks, two typed-outcome backstops, two diagnostic
and two ordering trials. P4-06 reaches the intact attempt UNIQUE constraint;
P4-07 instead reaches the later unmanaged application refusal. Neither proves
unsafe acceptance. Fresh-role fallback proves erroneous refusal of an authorized
admin. Missing-capability/legacy diagnostics and parser/replay ordering are not
misrepresented as unsafe mutation proofs. The first eight trials historically
used Python orchestration contrary to the Bun-only convention; the remaining16
used Bun. Actual commands are preserved, not relabeled.

The real late receipt INSERT trigger confirms staged claim/progress/binding/count
and journal writes before aborting, then observes complete transactional rollback
and no delivered fanout. Both ordinary capture points execute on success; this
fixture's equivalent downstream scheduling facts emit no new elsewhere event.
A post-commit announcement failure followed by actual source close/reopen proves
lookup and exact replay recover the accepted claim without opening a new mutation
graph. Queued caller mutation tests cover detached nested request/identity inputs.

Full report, corrected manifest, fault outputs and final commands remain under
`.superpowers/sdd/receiver-tasks/task-4-report.md` and `task-4-evidence/`.
Independent review remains pending. Guarded release and release→new-attempt
integration remain Task5; mounted routes/read scope/Digest composition remain
Task6. No full receiver build, exact-SHA host gate or live deployment is claimed.

Independent Task4 review approved spec compliance and task quality at
`1f1fd61778aebfc25b65c37c260b5038a5e51012`, with no Critical/Important findings.
The review confirmed ordinary settlement, current-role/credential detachment and
delegated-parent/session consistency with existing claim semantics. The historical
Python orchestration deviation remains recorded; no repeated trial is claimed.
Only Task4 is accepted. Its explicitly cross-referenced guarded-release/new-attempt
scenario remains in Task5; HTTP composition and final receiver gates remain open.
Unchanged storage guarantees rely on accepted Task2 evidence, not an independent
rerun of its complete fault matrix. No coordinator quiescence is established.

### Receiver Task5 — exact claimed write candidate

`writeRuntime` applies the restricted batch through the existing transaction,
ordinary admission, apply/journal and committed fanout path. Shared claim/write
preflight keeps current authorization, ledger pin and canonical accepted replay
before ordinary effects. Fresh writes require the exact live claim, immutable
runtime binding, current owner/generation and current complete basis. Release is
one exact person/step and last. Ordinary normalizers compile the detached request;
canonical identity retains the original payload, including omitted ref names.
Unknown usage omits measurement and preserves the existing value; explicit zero
is a valid measurement. No executor quiescence is inferred.

Fresh covering commands:

```sh
env -u NO_COLOR bun test ./apps/wbs/be-01/src/controller/runtime-write.db.test.ts ./apps/wbs/be-01/src/controller/runtime-claim.db.test.ts ./apps/wbs/be-01/src/controller/runtime-authority.db.test.ts ./apps/wbs/be-01/src/controller/runtime-state.db.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts ./libs/wbs/adapters/store-sqlite/src/external-ref.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/runtime-request.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts ./libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts ./libs/wbs/application/core/src/module/plan-commands/command-bindings.test.ts ./libs/wbs/application/core/src/module/plan-commands/plan-command-admission.test.ts ./libs/wbs/application/core/src/module/plan-commands/admitted-write.test.ts --timeout=30000
env -u NO_COLOR NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-contracts,wbs-store-sqlite,wbs-store-memory,wbs-be-01 --skip-nx-cache
```

Observed: 256 tests/1125 assertions across12 files passed in54.59s; all12 scoped
lint/typecheck tasks passed uncached in2m14s. After the final exactly restored
faults and comment-only evidence corrections, the affected write/canonical suites
passed71 tests/288 assertions in9.36s. Source formatting and diff checks passed.
The covering/static run preceded only those restored trials and comments; it is
not described as a later run. Initial corrected feature RED was30 failures at
missing writeRuntime. Fixture, type and lint iterations remain in the report;
subsequent coverage additions are not claimed as initially failing TDD cases.

R5:48 numbered fault trials produced watched failures, with exact source bytes
restored after each and aggregate GREEN afterward, not48 immediate RED/GREEN
pairs or48 independent guards. All orchestration used Bun. Trials cover live and
immutable identities, target/step/release breadth/order, pin, owner, generation,
basis, payload equality, final basis, receipt INSERT, detachment, current scopes
and role propagation, strict parsing and canonical ref order. Their actual
outcomes matter: release-person and the initial wrong-step cases reached ordinary
not_claimed_by; normalization bypass reached typed unknown_system; missing-digest,
legacy and wrong-action omissions exposed incidental TypeErrors. Removing replay's
early return alone also only produced TypeError. The additional valid-before-return
admission fault reached the actual forbidden fanout capture. These diagnostic,
classification and ordering trials are not unsafe-acceptance claims.

The stronger live-guard fault used A's retained valid binding, a fresh grant/basis
and actual replacement B: the stale release deleted B. The independent wrong-step
fault used another genuinely held step and accepted its release. With guards
restored, A guarded release then B's new attempt receives a new claim ID; stale A
cannot touch B, and both bindings remain immutable. A competing holder between
release and retry receives ordinary eligibility/holder semantics without automatic
reclamation. The original role-propagation trial survived because measurement did
not consume that role; it is excluded. The strengthened exact-release case exposed
an erroneous person_not_bound refusal for a freshly authorized admin. One ambiguous
mutation anchor was rejected before editing; corrected trials then ran.

A real late receipt INSERT trigger verifies staged progress, measure, refs,
release, journal and binding before aborting; complete persisted snapshots and
fanout observations roll back. Postcommit announcement loss followed by actual
source close/reopen allows lookup and exact replay without new capture or mutation.
The inherited Task3 reference-order Minor now compares equal command counts and
has an independent sorting-fault negative; independent review remains required.

Full commands, failures, precise classifications and restoration records remain
in `.superpowers/sdd/receiver-tasks/task-5-report.md` and `task-5-evidence/`, with
`manifest-authoritative.json` superseding early broad labels. Root OpenSpec validation passed one change, zero errors and10 existing warnings.
Task5 independent review is pending at this candidate. Mounted routes,
shared client, boot readiness, full receiver build and exact-SHA host gate remain
Task6/final integration. No live deployment, durable coordinator integration or
physical worker quiescence is claimed. No new migration or secret was added;
separate migration/secrets scans were not run by the worker.

Independent Task5 review approved spec compliance and quality at
`e9ab79a08bd9b91e0a70f841d2fc8effbf670ef3`, with no Critical, Important or Minor
findings. It confirmed shared claim behavior, normalization without canonical
alias mutation, exact live/bound write identity, complete rollback and retained
replay. The inherited Task3 reference-order Minor is resolved by equal-command
coverage and its independent sorting-fault proof. All48 referenced logs and the
restoration mechanism were reviewed with their stated outcome classifications.
Unchanged storage/migration guarantees retain accepted Tasks1–4 evidence; this
review does not recertify their entire fault matrices. Only Task5 is accepted;
mounted HTTP/client/readiness and final receiver gates remain open. Commit hooks
also passed plaintext-secrets, formatting and lint; migration hooks were not
applicable, and external Tool Wiki activation remains absent (`certified:false`).

### Receiver Task6 — mounted HTTP/client and readiness candidate

All four final routes use the shared declarations, existing identity/organization
policies and admitted current authorization. The mounted runner receives the real
Digest. Complete wire validation precedes personId/context projection; mutations
and lookup require explicit pins. Command refusal translation validates against
its existing declaration before preserving correlated status/detail. The client
uses the existing shape-derived transport and response classifier.

Boot now awaits configured migration/StepBlockage/backfill/local identity and
actual runtime ledger inspection before retention/listener startup, using explicit
DI promise dependencies. Optimizer/proof workers follow successful listening;
owned resources retain reverse disposal and partial-acquisition cleanup. Explicit
local startup migrations may complete before a later occupied-port failure.
Deployed startup does not implicitly migrate or repair runtime state.

Fresh covering command:

```sh
bun test ./apps/wbs/be-01/src/boot.db.test.ts ./apps/wbs/be-01/src/domain-proof.boot.db.test.ts ./apps/wbs/be-01/src/runtime-command.boot.db.test.ts ./apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts ./apps/wbs/be-01/src/app.routes.test.ts ./apps/wbs/be-01/src/controller/organization-context.controller.db.test.ts ./apps/wbs/be-01/src/controller/claim-identity.controller.db.test.ts ./libs/wbs/domain/contracts/src/http/runtime-command-shapes.test.ts ./libs/wbs/domain/contracts/src/http/runtime-command-client.test.ts ./libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-contracts,wbs-core,wbs-be-01,wbs-store-sqlite,wbs-store-memory --skip-nx-cache
```

Observed124 tests/1956 assertions across10 files pass in20.71s; all12 scoped
lint/typecheck tasks pass in1m43s. Final focused35 tests/161 assertions pass.
After mechanical test-helper naming cleanup, affected backend21 tests/121
assertions pass in6.61s and its three static targets pass in56.7s. These runs
overlap; their counts are not additive. Edited-file formatting and diff checks
pass. Actual OpenAPI emission confirms the four exact method/path/operationId
pairs and required pins. OpenSpec passes one change with zero errors and10
long-requirement warnings; historical seven-warning shorthand was corrected.

The mounted tests use real SQLite/authority/claim/write paths. They commit then
lose only the transport reply, close/reopen the source, lookup the full acceptance
and exactly replay with unchanged journal/state/basis. Delayed old-generation
dispatch refuses after takeover; absence before fencing stays inconclusive.
Unused down/up and fully reconstructed valid tables change the pin before old
receipt absence/replay. Current auth before replay, foreign/absent project
indistinguishability, legacy refusal, strict input and existing holder/resource
semantics remain covered. Client cancellation, malformed replies and unexpected
status remain transport failures rather than inferred nonacceptance. Boot tests
hold real inspection, observe no early listener/timer/optimizer/proof worker,
then validate healthy startup, missing/corrupt ledger failure, pending migration,
occupied-port ownership and cleanup after actual socket acquisition.

R5 evidence contains17 numbered fault families plus repeated/strengthened trials.
Each mutation restores exact bytes in finally; the byte-observation pass records
restored=true throughout, followed by aggregate GREEN. This is not17 unique new
guards or immediate RED/GREEN pairs. Actual failures include early listener/timer
startup, unknown wire-key acceptance, malformed successful client receipts,
old-ledger acquisition acceptance, old-pin state/absence misclassification and
duplicate-query acceptance/classification. Missing wire pin instead reaches the
strict application parser (500 instead of boundary400); removed identity reaches
the missing-principal backstop (500 instead of401). Refusal/parser guards and the
unexpected-status guard prove named diagnostics while mounted/client backstops
still reject. Removing Digest proves the actual mounted composition requirement.
These are not represented as unsafe acceptance cases.

Initial auth mutation failed fixture setup; a reworked real-ledger/authority
fixture then reached the intended anonymous assertion. The first status fault
survived through a later classifier; the strengthened test observes its actual
unexpected_status→invalid_response change. The first retention fault hit listener
ordering first; reordered observations directly expose retention.start. All
historical logs remain retained and excluded from stronger claims. Initial TDD
and fixture/static iterations are preserved, including corrected migration-marker
fixture and genuine mounted404-before-implementation RED.

Full commands, trial classifications and restoration records remain under
`.superpowers/sdd/receiver-tasks/task-6-report.md` and `task-6-evidence/`.
Independent Task6 review, full receiver review/build, CI and exact-SHA host gate
remain pending. These checks do not prove Dash durable intent/pin/grant storage,
credential retrieval, executor quiescence, session ordering or CTT settlement;
parent5/6a.5–7 are not wholly complete. No live deployment or model call occurred.

Task6 independent review found Important I1: the response shape accepted empty,
gapped and duplicate-index write applied arrays. Its earlier incomplete-write
negative also omitted claim, masking this defect. Review therefore did not accept
Task6. A Minor about expected error/startup output in inherited regression tests
is retained for whole-branch review; it does not invalidate their passing assertions.

Fix1 requires1–200 applied entries and contiguous indexes on both command and
lookup success responses. A local SchemaShape refinement delegates structural
validation and forwards its issues before checking validated write indexes.
It preserves the original successful value/type. JSON/OpenAPI records the bounds
and order description; dependent ordering executes through Standard Schema.
Generic JSON-Schema-only consumers must additionally enforce that invariant.

The isolated complete-envelope batch first produced4 pass/12 fail, then16 pass
with all invalid sequences rejected. Four watched faults each failed and restored
exact bytes: minimum/maximum omissions accepted empty/201-entry responses;
order omission accepted eight invalid sequences across both routes; removing
structural issue forwarding caused TypeError instead of modeled validation
failure. This last case is forwarding/backstop evidence, not unsafe acceptance.
Aggregate restored GREEN is not four immediate fault/restoration/pass pairs.

Fix1 covering command:

```sh
bun test ./libs/wbs/domain/contracts/src/http/runtime-command-shapes.test.ts ./libs/wbs/domain/contracts/src/http/runtime-command-client.test.ts ./apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts ./libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-contracts,wbs-core,wbs-be-01 --skip-nx-cache
```

Observed67 tests/231 assertions across4 files pass. The combined static command
historically exited1: seven targets passed, contracts typecheck found test-control
literal widening. Adding satisfies RuntimeReceipt changed test typing only;
final contracts32 tests/64 assertions and both contracts static targets passed
(the latter24.2s). Thus each scoped component passes, without claiming the first
combined command exited0. Actual OpenAPI emission confirms bounds/order metadata
on both success schemas; formatting/diff checks pass. Exact output and four-fault
byte manifest remain in task-6-evidence/fix1-* and the appended task report.
Scoped independent re-review is pending. No full124 regression repetition,
receiver full gate, live call or coordinator recovery claim was made by this fix.

Scoped Task6 fix1 re-review approved I1 at
`32fa75d8082b498041dbfc937427af3c44540efc`, with no new Critical/Important
breakage. It checked both awaited Standard Schema boundaries, complete-envelope
negatives/controls, all four fault logs/restoration records and actual OpenAPI
metadata. All six receiver slices are now individually accepted. The expected
regression-log Minor remains for whole-branch triage; full receiver review,
remaining downstream build/CI and exact-SHA host gate are still pending.
Commit hooks also passed plaintext-secrets/format/lint in6.14s; no migration
files applied to this fix and external Tool Wiki activation remains unavailable.

### Receiver whole-branch review (d85a8dd2d)

Final review found Important I1: startup inspected the public runtime store outside the admitted SQLite snapshot. Its separate marker/history SELECTs can misclassify a valid concurrent commit as corruption. A focused production-repository statement-interleaving probe rejected the mixed observation and accepted the intact final ledger; this was not a second-connection or live deployment proof. Minor M1 identified omitted runtime module memberships/consumer metadata. Both await the single final fix wave. Prior scope/memory/reference-order/receipt-sequence findings were confirmed resolved; inherited expected error output and historical Python proof orchestration remain disclosed. Draft PR #649 is stacked on #629. Whole-branch CI, build and exact-SHA host gate remain pending.

### Receiver final fix wave: coherent startup audit

At d85a8dd2d, the new actual two-connection disk-backed boot test first failed with retained-history-count mismatch after a valid atomic authority/count commit between marker and history reads. Startup now uses source.uow.run, the borrowed runtime store and a noncommitting decision. The test observes actual SQLITE_BUSY on the competing connection, successful readiness with consistent zero history, and a valid authority/count commit after the audit. This is two connections in one process with a deterministic statement hook; no multiprocess/live blue-green or full concurrent HTTP claim is made. Existing schema/hash/count/record validation and lazy source construction remain unchanged. Startup briefly takes existing BEGIN IMMEDIATE admission and retains its normal contention policy. Module metadata now lists six runtime files and the actual routes consumer.

Final command bun test ./apps/wbs/be-01/src/boot.db.test.ts ./apps/wbs/be-01/src/domain-proof.boot.db.test.ts ./apps/wbs/be-01/src/runtime-command.boot.db.test.ts --timeout=10000: 51 pass,0 fail,166 assertions,3files17.88s. NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-be-01 --skip-nx-cache: all3module/typecheck/linttasksPASS50.8s. Four-file Prettier, diff whitespace and actual module memberships/consumer checks pass; root verified all four final byte hashes. Logs retain inherited startup/expected verifier/invalid-gateway/occupied-port diagnostics; no pristine-output claim.

Four individual boot-only faults all exit1 and restore exact bytes: replacing the UoW with standalone inspection recreates the healthy-ledger false refusal; inspection omission lets listening win; removal of retention readiness starts its actual timer; removal of server await acquires listener early. Final covering GREEN follows restoration. Historical first GREEN5pass1fail exposed Drizzle wrapped SQLiteError and was corrected; first covering50pass1fail exposed an inherited pre-boot held-gate fixture. That single queued-write shutdown test now acquires its hold after readiness through the actual proof-worker seam and invokes the real worker unchanged; pending-stop/close-order/proof assertions remain. Initial backend static failed test callback narrowing/void-expression lint; precise test-only corrections pass final static. Fault hashes precede observed comment additions; final-state hashes cover the final files. Full report/evidence retained in the receiver workspace. Scoped final re-review and exact-SHA aggregate gate remain pending.

Receiver final scoped re-review at0a7cab754: I1 startup snapshot and M1 module navigation ADDRESSED, no new Critical/Important/Minor or out-of-scope observations. Reviewer inspected the exact one-wave fix, retained two-connection/four-fault/restoration outputs and final covering/static records without rerunning suites. Existing UoW admission and the real queued-write shutdown fixture remain intact. Whole-branch source review is accepted with these corrections; CI and the exact-SHA full host gate remain required before integration or completion. No live deployment or full durable coordinator acceptance is implied.

### First receiver aggregate gate: required integration failures

Canonical h4 gate at e6aa12bd60eb6652c3cda0ac1f04e4241432f2af printed the exact SHA, installed locked dependencies unchanged and validated267OpenSpec entries. Its workspace stage exposed2memory catalog failures,1closed-feature-module audit failure and79legacy SQLite migration fixture failures. Summary lines repeat; these are82observed failed tests, not164. The full gate is not accepted and remaining workspace output is still being collected. Raw runtime repository capability/DTO provenance leaks into feature code, STORE_BINDINGS omits runtimeCommands, and independent rollback fixtures omit the new migration. Inspected unused runtime rollback itself succeeded; guards are not to be weakened. Bounded remediation is tracked in receiver-gate-tasks.md, followed by independent review and fresh aggregate exact-SHA validation. No merge/deployment has occurred.

The same ongoing workspace phase later completed the backend target with3224pass,3skip,5fail,64039assertions across217files in1270.03s. Four failures are exact latest/rollback/full-ledger expectations omitting runtime_commands; the fifth is the existing test-tier recognizer missing openSpaceDatabase, which the three real migrated runtime controller SQLite suites call. The bounded plan names only the two migration fixtures and recognizer as additional paths. All four browser CI shards plus k3s rehearsal passed; workspace/Twilight CI and final host status remain pending. Fresh expanded-plan OpenSpec validates1change with0failures and10existing long-requirement warnings.

The first exact-e6aa host gate completed exit1 after46m50s in workspace:174tasks succeeded and6targets failed (memory,core,SQLite,tool-devsync,backend,MCP),90actual failed tests after excluding repeated summaries. Later Twilight/source-lint/Docker phases did not run. Final inventory exposed two additional declaration gaps: memory module index omits the runtime source/test members; independent generated MCP operation pin and README84-tool count omit four actually derived runtime operations (88total). The same bounded repair names only these three declaration files, preserves exact complete catalog/index checks and changes no MCP auth/consent/credentials/derivation. A new exact-SHA full gate is required after scoped review.

### Receiver gate reconciliation candidate

The bounded repair gives runtime helpers a real private-store, fixed-scope RuntimeCommands resource and moves portable DTO declarations out of repository-owned modules with compatible adapter re-exports. Business authorization/canonical/receipt guards and SQL remain unchanged. Exact memory catalog coverage now exercises actual runtime shapes, and32legacySQLite plus2backend migration fixtures retain independent complete names/schema/ledger/row/hash/refusal checks. The tier recognizer names the actual migrated SQLite opener. Explicit memory source/test memberships and independent full88MCP operation/count declarations include the four receiver operations. Root verified all49final source hashes and selected inventory.

Actual module-audit/memory/representative rollback/tier/MCP/index REDs preceded fixes. Observed restored negatives include public raw-store exposure rejected by the unchanged production AST audit, bypassed runtime detachment producing real reread mutation in both paths, and opener removal reproducing all three actual misfilings. Core/memory complete test targets passed. Full SQLite run was1872pass1existingSkip1fail14998assert133files746.44s: only repository-status stability failed while authorized backend files became dirty. With tracked edits/HEAD held, the unchanged affected performance case passed1test612assert, unchanged=true; no full-suite-pass claim. Backend run56pass1fail then corrected sole resource case1pass13assert; tier2pass; MCP41pass415assert; indexchecker1pass through approved disposableindex, realindex/HEAD unchanged. All five scoped project typechecks plus dependencies pass; initial three sort-only lint errors corrected and affected targets rerun pass, remaining targets already pass; final backend/static/declarationformat checks pass.

Original untracked-candidate index diagnosis was masked; prepared alternate index containing exactly two new source paths and this new plan reached the actual missing-memory-membership failure, then passed after explicit memberships. Original h4gate completeexit1 remains evidence, not acceptance. Existing skip/colorwarnings and early Python orchestration deviation are retained honestly; subsequent orchestration Bun-only. CI Twilight52m35s also failed11pilot cases on the same memory missing member; root will run that newly exposed group on the committed candidate before fresh canonical gating. Independent bounded task review, CI and fresh exact-SHA full gate remain required. No merge/deploy or durable coordinator completion is claimed.

Root focused pilot group at committedf2a60 (bun test ./apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --test-name-pattern "reviewed radical-modularity pilot through production CLI" --timeout=240000) completed exit1:12pass7fail5filtered378assert19tests270.46s. All7failures now report plan-commands external-consumer mismatch. The memory index repair works; the earlier README addition of actual runtime-command.routes.ts lacks its corresponding exact consumer in docs/wiki-policy/modules.json. Root verified actual imports and the bootstrap map has no plan-commands entry. This required validation blocker remains open and is queued for one exact mapping declaration fix plus scoped review, without changing rules, authority or source revision.

Receiver gate-review fix1 adds only the exact runtime-command.routes.ts consumer in the existing plan-commands mapping. All previous entries/order and source revision/predecessor/authority fields remain; bootstrap has no corresponding module and is untouched. Production validate-record module-mapping reports valid, single-file format/diff pass. Root verified finalJSONhash27f0082a and exact4-line insertion. Newly failing pilot group plus ordinary indexchecker will run once on committed fix before scoped re-review; no passing covering result is prewritten.

Original e6aa CI is now completeFAIL: workspace1h3m18s,Twilight52m35s,aggregateFAIL; browser4shards+k3s rehearsalPASS. Workspace full artifact lists the same six host-failing targets plus tool-deploy:test. Its only deploy failure is actual first-start observation success child killed by test10000ms deadline, exitCode null (827pass1fail); adjacent refusal children complete around5.2–5.3s. This is retained timeout evidence, not a proven flaky classification. Root will diagnose that exact unchanged test separately before deciding any source correction; no deploy safety guard or timeout has been changed.

Receiver gate fix1 independent scoped re-review atc0109b9e2: I1exactconsumer mapping ADDRESSED, no new fix breakage or out-of-scope findings. Root actual19pilot tests405assertPASS189.01s and ordinary committed-indexchecker1test2assertPASS5.17s close the previously masked pilot/index issues. Full actual outputs are retained. This records the scoped review only; plan checklists remain open pending required full validation. The first gate/CI failures remain recorded. A NEW exact-SHA canonical full gate plus CI are required before completion/integration; no fullgate/CI/deploy success is claimed.

## Local agentic packet composition

An isolated integration branch starts at reviewed executor3ae7fb5e1 (binding6f09/storage79 included) and combines reviewed receiver5ba6ccbdf. Only CONTEXT and this verification appendix conflict; the accepted receiver Attempt wording/link and all executor terms are retained, and both complete evidence appendices are preserved. No source conflict or new feature behavior is manually resolved. Fresh frozen install succeeds; all267 OpenSpec items pass. Actual combined executor suites plus production module-boundary audit pass103tests406assertions/5files37.73s. This is focused composition evidence, not a full merged-tree gate.

At this record receiver5ba GitHub CI is fully successful, including workspace1h9m14s/Twilight59m16s/browser shards/k3s/fleet; its canonical h4 full gate remains active. Executor3ae exact h2 gate is in the canonical queue behind another host gate, with CI running. Current main75585eebd is not yet in this local composition and must be integrated before final acceptance. Published packet heads and user main checkout remain unchanged; no main merge or deployment is performed.

### Current-main integration — local validation; exact candidate gate pending (2026-10-22)

Integration combines receiver5ba6ccbdf98b0794dacfed441464fb28a8b8e5ed, executor3ae7fb5e132d574d8fd13c75186a8297853d6585, binding6f09b11fc638c36c3d90747b98a0eabd63147c0e and storage79f4dcdd97ba2111170558b71965899212171859, then merges pinned main75585eebdd42d78e1c06057f9e9f418495f49f94. It consumes current CredentialPin/credentialPinOf at both runtime admission seams; authentication implementation is unchanged. Machine/consent principals for one of two agent persons sharing an account exercise actual mounted HTTP/SQLite routes. Final12tests98assert pass; separately dropping runner pin yields6pass/6fail and dropping runtimeTransaction pin4pass/8fail with forbidden200 responses. Exact source restorations and green baselines are retained; no cryptographic/live authentication claim follows from the injected verified-principal test seam.

The first lexical-name migration assumption was wrong: existing readMigrationFolders correctly rejects duplicate numeric stamps, while legacy rollback/status use timestamps. Main audience scope and the old draft runtime folder shared20261022120000, causing actual200pass/14fail backend output. The integration renames ONLY our unmerged runtime identity to20261022121000_add_runtime_commands, preserves both SQL files byte-for-byte and all four main identities, and keeps all rollback/capture guards. Independent complete catalogs now reflect actual unique numeric order. Subsequent213pass/1fail exposed one remaining stale complete rollback oracle; its corrected final coverage is below. Neither earlier red is called flakiness. Existing old-branch DB identity is deliberately unsupported: actual capture rejects it with complete ledger/schema/runtime history and whole serialized database unchanged. No implicit ledger rename, schema repair or history deletion is offered. External retained branch databases were not inventoried; migration from such a database requires an explicit reviewed transition.

Final local evidence:230backendtests1349assert/12files79.77s;18/18uncached typecheck/lint tasks across8projects132.26s;102core/contracts/MCPtests340assert10.37s; real module/policy62tests297assert20.65s after successful real Nx graph creation1.69s.47TSfilesformat PASS; migrationlint/diff PASS. Scoped normal OpenSpec PASS with10 retained long-requirement warnings; optional strict validation failed on those warnings and is not called a strict pass. Complete SQLite was run exactly once after all edits/faults/formatting:1874pass,1existing stale-memory-undo skip,0fail,15010assert,1875tests133files,313.53s Nx. Before/after49owned hashes,index,HEAD,MERGE_HEAD and full Git status matched; all10 forward/down hashes matched through only the explicit old-to-new runtime path mapping. Local source-conformance output identifies the in-progress dirty merge base and is not exact-commit/full-host certification.

Historical receiver5ba now has actual full h4 gate PASS:267OpenSpecchecks, workspace180tasks49projectsplus9dependencies46m25s, Twilight10tasks50m42s, Burokrat/Dashlint, actual Docker solver smoke3tests15assert11.19s/target3m37s; CI39784761350 all applicable checks PASS, infra39784761322 PASS. Expected Docker/pip/readiness/EOF diagnostics and inactive external ToolWiki certification remain explicit. This certifies that immutable earlier leaf, not the new integration. Executor3ae full h2 gate and CI39795213446 workspace remain pending here; Twilight CI passed1h4m30s and all browser shards passed. Independent integration review, combined exact-SHA host gate and CI are still required. S0, S7a, durable host ordering, effects/quiescence and broader I1 governance remain open. No deployment or main merge has occurred. WBS authentication remains unavailable; latest status notes are retained locally without remote writes.

Independent Task1 review approved integration source310ed257bf1786164b5fcdbbc9c00dca6424c63c: no Critical/Important findings. Reviewer read the complete3393-line remerge diff once, checked cut-off admission continuations and two named unchanged risks, matched all49sourcehashes/all10SQLpins and inspected actual sealed forbidden-200 negatives with exact restorations. Existing10OpenSpecwarnings/optionalstrictfailure and stale-memory-undo skip remain explicit deferred minors. Broad final review plus exact combined-SHA host gate/CI are still pending; local approval does not certify separately owned credential cryptography or close S0/S7a.

Integration commit hooks first failed on actual default Node heap exhaustion near4GiB after82.29s; the identical staged candidate passed every unchanged hook with8192MiB capacity in59.55s. No source bytes changed. Executor3ae host workspace subsequently passed180tasks49projects+9dependencies46m6s; remaining host stages are active. Its CI workspace attempt1 failed1h10m51s on the existing browser revocation reader test at the10000ms bound (3081pass,3skip,1fail,1error,63289assertions); original cause of delay is unknown. Exact unchanged focused case passed1test14assertions at the original bound (4.33s case/6.62s total). One failed-workspace retry is running as attempt2; earlier failure is retained, not called flaky or repaired. Twilight CI passed1h4m30s and browser shards passed. Neither executor nor combined aggregate acceptance is claimed.

### Portable runtime request codec — local candidate, 2026-10-22

Planning baseline `922203565e0b05266f09319f3125e560b5f8f24b` extends reviewed
integration `ebda8a216c73a38050579bdc46f5da927223b3eb`. This packet publishes the
existing seven-function codec through contracts, keeps the application compatibility
facade and shares the unchanged 200-command limit with HTTP and ordinary application
consumers. Root independently matched all ten final source hashes, three unchanged
protected tests and the moved codec's non-comment body tokens. No SQL or migration changed.

| Dimension    | Bounded evidence / remaining gate                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | All five implementation slices have evidence; task review, whole-packet review, exact-commit host gate and applicable CI remain open. No task checkbox is closed by this record.                                    |
| Correctness  | Both added shared-identity/bound requirements have literal-byte, strict decode, detachment, boundary and real mounted receipt coverage. Existing queued-admission tests remain compatible.                          |
| Coherence    | One moved implementation, explicit facade, contracts-owned primitive, no application import from contracts, no production hashing provider. Digest correspondence grants no permission or authenticated acceptance. |

Actual commands run from the isolated codec tree:

| Command / scope                                                                                                                                           | Actual outcome                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` public codec + HTTP shapes + unchanged application codec + mounted runtime + authority/claim/write + generated MCP document, `--timeout=10000` | 187 pass, 0 fail, 783 assertions, eight files, 69.98s before final static-only fixture/style fixes.                                                                                                              |
| `bun test` public/HTTP/application/mounted/authority/MCP after those fixes, same timeout                                                                  | 109 pass, 0 fail, 417 assertions, six files, 13.03s.                                                                                                                                                             |
| `bun test` controller/service ordinary files with the two named 201-command cases only                                                                    | Final 2 pass, 0 fail, 9 assertions, 131 deliberately filtered cases, 2.98s. No complete ordinary suite claimed.                                                                                                  |
| `bun test --preload ./tools/test/scratch/preload.ts` module-label/effective-policy tests, `--timeout=30000`                                               | 35 pass, 268 assertions, 63.89s; preceded by a real 51-project Nx graph.                                                                                                                                         |
| Uncached Nx typecheck/lint for contracts, core, backend and MCP                                                                                           | Final applicable targets pass. Initial contracts fixture literal widening and five introduced lint style errors failed, were corrected, and their covering static/test checks passed; no production suppression. |
| Exact ten-file Prettier, `git diff --check`, normal scoped OpenSpec                                                                                       | Pass; OpenSpec retains exactly ten pre-existing long-requirement warnings, zero errors.                                                                                                                          |

Failure proofs, each from green with exact restoration:

| Check / dependency                          | Injected production fault                                              | Observed negative and restoration                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared cap in canonical and HTTP boundaries | Contracts constant 200 → 201                                           | Four independent cases become accepted: canonical write, command body, command receipt and lookup receipt; 27 pass → 23 pass/4 fail → 27 pass. |
| Ordinary service/controller cap consumption | Same constant fault                                                    | Actual 201-create batch success and HTTP 200 replace required refusal: 2 pass → 0 pass/2 fail → 2 pass. This is forbidden-success evidence.    |
| Real receiver uses shared canonical encoder | Compatibility facade appends one ASCII space, public encoder unchanged | Three actual successful authority/claim/write receipt digests mismatch the independent public encoding: 3 pass → 0 pass/3 fail → 3 pass.       |

Adjacent Proof comments name these faults. The missing-export TDD RED is setup evidence,
not semantic proof. Original moved predicate/copy histories are retained without a fresh
blanket recertification. Fault hashes were recomputed from retained exact source/recipes;
drivers checked exact restoration before green runs.

Evidence/report live in the packet's ignored `.superpowers/sdd/runtime-request-tasks/`
workspace while review and gates remain active. Source manifest SHA-256:
`72a115a5e6f43cd7f189696b405456df84e59d1aa34d14eb45f732f078a4c2d5`.
Nx color-environment warnings and the ten OpenSpec warnings remain disclosed.
No complete SQLite repeat was needed for this SQL-free packet. Full host/build/browser/CI
acceptance is not supplied by these scoped runs. Durable sender intent, full receipt
correspondence/authentication, preparation/locator/claim/turn ordering, broader I1 and
S0/S7a/activation remain open. The parent change is not ready to archive.

Independent scoped spec/quality review approved source `8c70ed715b833e5647425a0f15919754245357b3` with no Critical/Important findings. All ten source hashes, three protected tests, moved body tokens and actual fault/restoration outputs were independently checked. Exactly local slices1.1–1.4 are complete;1.5, parent5.3, whole-packet review and exact-head host/CI acceptance remain open. Minor color-environment and ten baseline OpenSpec warnings are carried to whole-packet triage.

### Portable runtime receipt correspondence — local candidate, 2026-10-22

Planning baseline `eb8898cdcef522144a91b261227b70f442aeccb5` extends reviewed
codec `e7c2e9a25e21a01cd3184e607c7659bca3f33354`. This packet publishes three
synchronous predicates over boundary-validated values and an independently computed
request digest. It moves one scope/claim/acceptance implementation and makes the
receiver consume it. Root independently matched all six final source hashes, three
unchanged protected files and all three moved non-comment comparison bodies against
the planning baseline. No SQL, stored bytes or credential implementation changes.

| Dimension    | Bounded evidence / remaining gate                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | All five local implementation slices have evidence. Independent task/whole-packet review and exact-head host gate/applicable CI remain open; all five local checkboxes remain open at this record.                                                                  |
| Correctness  | Authority/claim/ordered-write correspondence, independent metadata/acceptance negatives, nonmutation and actual mounted receipt coverage pass. Fresh claim ID and actor account are not predicted from request scope; valid resulting basis may remain unchanged.   |
| Coherence    | Contracts owns the sole moved comparisons; application keeps its old claim compatibility export. Earlier strict decode, storage/ledger/digest checks, errors and ordering remain. Content correspondence establishes neither authentication nor current permission. |

The final behavior command was:

```sh
bun test libs/wbs/domain/contracts/src/runtime-request.test.ts libs/wbs/domain/contracts/src/runtime-receipt.test.ts libs/wbs/domain/contracts/src/http/runtime-command-shapes.test.ts libs/wbs/domain/contracts/src/http/runtime-command-client.test.ts libs/wbs/domain/contracts/src/http/client.test.ts libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts apps/wbs/be-01/src/controller/runtime-authority.db.test.ts apps/wbs/be-01/src/controller/runtime-claim.db.test.ts apps/wbs/be-01/src/controller/runtime-write.db.test.ts apps/wbs/mcp-01/src/generated-document.test.ts --timeout=10000
```

Actual final output: 292 pass, 0 fail, 1023 assertions across eleven files, 23.65s
Bun / 23.743s driver, exit 0. Untouched baseline was 127 pass / 494 assertions across
four files, 52.42s Bun. Missing-export RED was setup only. A temporary permissive
implementation gave semantic RED: 5 pass / 31 fail / 41 assertions, exit 1.

| Command / scope                                                                                                                                                                                | Actual outcome                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real Nx project graph, then `bun test --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/module-labels.test.ts tools/tool-devsync/src/eslint-boundaries.test.ts --timeout=30000` | Graph exit 0; policy 35 pass / 268 assertions, 49.23s Bun / 49.605s driver, exit 0.                                                                         |
| `bunx nx run-many -t typecheck lint --projects=wbs-contracts,wbs-core,wbs-be-01,wbs-mcp-01 --skip-nx-cache --parallel=2`                                                                       | Initial run exit 1 in 162.871s: nine successful targets, contracts lint rejected the new barrel member order. Only that order was fixed.                    |
| `bunx nx run-many -t typecheck lint --projects=wbs-contracts --skip-nx-cache --parallel=2 --output-style=static` after correction                                                              | Both corrected contracts targets pass, 21.644s, exit 0; full eleven-file behavior command above reran afterward. No blanket initial static pass is claimed. |
| `bunx prettier --check` on exactly six owned paths; `git --no-optional-locks diff --check`                                                                                                     | Final passes, 0.415s / 0.008s, exit 0.                                                                                                                      |
| `bunx openspec validate twilight-agentic-workflows --json`                                                                                                                                     | One valid change, ten existing long-requirement warnings, zero errors, 1.099s, exit 0. Color environment warnings are retained separately.                  |

Fresh R5 observations, each from green with exact source restoration:

| Injected production fault                                         | Observed semantic failure / restored green                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit each scope organization/project/person comparison separately | Each independent public receipt negative changes from false to true: 1 pass → 1 fail → 1 pass, exits 0/1/0. This is public predicate mismatch admission, not an HTTP/authentication proof.                                                                                                     |
| Omit ledger, command ID or digest comparison separately           | Each corresponding public negative receives true: 1 pass → 1 fail → 1 pass, exits 0/1/0.                                                                                                                                                                                                       |
| Bypass only the receiver's final shared receipt predicate call    | Unchanged real SQLite retained owner/generation/kind cases: 3 pass / 9 assertions → 3 fail / 3 assertions → 3 pass / 9 assertions. Actual acquisition replay wrongly resolves. The first rejection assertion stops execution before the later lookup; no additional lookup failure is claimed. |
| Make shared claim comparison return true                          | Unchanged real SQLite borrowed-binding cases: 9 pass / 36 assertions → 1 pass / 8 fail / 28 assertions → 9 pass / 36 assertions. Eight present mismatches return actual `ok: true` write receipts; absent binding remains refused.                                                             |

All eight distinct original/mutated/restored source identities and complete execution
logs were retained and independently audited. Adjacent Proof comments name those
faults. Existing moved comparison clauses retain their historical proof scope; this
does not freshly recertify every unchanged guard. The initial receiver fault driver's
post-observation validator searched the wrong error substring and itself failed
after three actual semantic failures and exact restoration/green. Corrected validation
read those retained logs without a redundant fault rerun; both driver versions and
the diagnostic explanation remain recorded; the original raw thrown-error transcript was not separately retained.

No complete SQLite/storage or ordinary suite was repeated. Exact candidate host/CI,
latest-main organization-limit integration, authenticated transport, trusted sender
artifact decoding, durable intent/history, host ordering, I1/S0/S7a and activation
remain open. The parent change is not ready to archive. All earlier packet acceptance
records remain historical; they do not certify this candidate.

Independent Task1 review approved source `eb502c97081f73e5554dd82e7a63f50a241d7065` for spec compliance and task quality, with no Critical/Important findings. Reviewer independently matched all six source hashes, moved body tokens and eight fault/restoration identities, and checked real replay/write consequences. Exactly local slices1.1–1.4 are complete;1.5 and parent5.4 remain open. Whole-packet triage carries three Minor findings: the digest mismatch fixture uses a non-64-hex string; color-environment noise; ten unchanged OpenSpec warnings. Missing original driver-level raw error transcript limits that diagnostic reconstruction, while semantic failures and exact restored green are verified. Exact-head host/CI, latest-main reconciliation and all broader workflow acceptance remain open.

### Runtime consumption of current-main organization limits — local candidate, 2026-10-22

Planning `502dbf7f0f1ecd4ea8bc77f24b4e723c520daa23` extends receipt
`f978678f7b698cef085788559a1a94c2380231f6`; the source merge consumes main
`33685ec480bc996b6d1909156167367af7279941`. Forty content conflicts preserve both
parents' complete migration catalogs, navigation and closed refusal variants. Main
already supplies the ordinary transaction-bound claim gauge; no second limit or
runtime policy adaptation was needed. Direct source/reopen/boot fixtures now consume
main's existing deployment defaults. Current credential pins and authorization remain.

| Dimension    | Bounded evidence / remaining acceptance                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | All local slices have evidence, including the authorized final one-file rollback-oracle correction. All five integration task boxes and parent5.5 remain open pending independent review and root acceptance.                                                                         |
| Correctness  | Real mounted HTTP/SQLite/shared-client cases prove typed cap/current/index/kind refusal with complete unchanged effects, one below-cap acquisition, exact historical replay after cap reduction and current authorization before replay. Final full-suite validation remains pending. |
| Coherence    | Main owns policy/defaults/gauge. Runtime uses the ordinary transaction, immutable request/receipt protocol and existing shared schema. Every SQL/down identity remains unchanged; no credential, provider, coordinator or implicit store repair is introduced.                        |

The new cap cases pass2tests/17assertions. At cap0/current0 the parsed response is
409 `{error:'claim_limit',cap:0,current:0,at:0,kind:'claimWorkItem'}`; complete claims,
occupancy, bindings, receipts, journal, ledger, authority, work/progress, events,
sequencer and audit observations remain equal. Cap1 commits one claim/binding and
one additional receipt/journal entry. Lowering cap to0 replays the identical full
accepted reply without additional effects; changing current membership to viewer
refuses replay403 before revealing that acceptance.

Fresh R5 dependency proof removed only the actual working-plan organizationLimits
getter. The selected real mounted cap case failed: expected typed409 became
shared-client `unexpected_status`500, with production diagnostic `a bound claim was
added under scoped access without organization limits` (0pass/1fail/1filtered,
2assertions,2.931s driver). Original green2cases/17assertions and exact restored
green2cases/17assertions2.942s are retained. This proves dependency consumption and
loss of a typed refusal, not unsafe acceptance. Original/restored SHA256 both
`77b9d70ae161bfaff9fadc1098acc46e757a871901389f68869d949717f1e848`;
mutant `7a2270aa610ee7188b97addf94005c631c75f08806b4909847fc7b210786702a`.
Root independently verified the exact removal, actual failure/restoration streams
and unchanged final executable tokens. The final production file adds only its
truthful adjacent Proof comment.

Actual focused commands include:

```sh
bun test apps/wbs/be-01/src/controller/runtime-claim-limit.db.test.ts apps/wbs/be-01/src/controller/runtime-state.db.test.ts apps/wbs/be-01/src/controller/runtime-authority.db.test.ts apps/wbs/be-01/src/controller/runtime-claim.db.test.ts apps/wbs/be-01/src/controller/runtime-write.db.test.ts apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts apps/wbs/be-01/src/controller/runtime-credential-pin.db.test.ts apps/wbs/be-01/src/runtime-command.boot.db.test.ts apps/wbs/be-01/src/controller/claim-limit.controller.db.test.ts --timeout=30000
bun test libs/wbs/domain/contracts/src/runtime-request.test.ts libs/wbs/domain/contracts/src/runtime-receipt.test.ts libs/wbs/domain/contracts/src/http/runtime-command-client.test.ts libs/wbs/domain/contracts/src/http/runtime-command-shapes.test.ts libs/wbs/domain/contracts/src/http/refusal.test.ts apps/wbs/mcp-01/src/generated-document.test.ts apps/wbs/mcp-01/src/openapi-tools.test.ts --timeout=30000
bun test tools/tool-devsync/src/module-labels.test.ts tools/tool-devsync/src/eslint-boundaries.test.ts tools/tool-devsync/src/product-constraints.test.ts tools/tool-devsync/src/workspace-projects.test.ts --timeout=60000
```

| Check                                                                                                                                                                                                                     | Actual outcome                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime + ordinary cap command above                                                                                                                                                                                      | 177pass,0fail,913assertions,nine files,65.78s Bun/65.894s driver.                                                                                                                                                                                                                                                                                                 |
| Public codec/receipt/HTTP/MCP command above                                                                                                                                                                               | 140pass,0fail,597assertions,seven files,7.01s Bun/7.082s driver.                                                                                                                                                                                                                                                                                                  |
| Real Nx graph, then module/effective-policy command above                                                                                                                                                                 | Graph exit0,51nodes,3.209s; policy55pass/297assertions,four files,62.19s Bun/62.412s driver.                                                                                                                                                                                                                                                                      |
| Focused changed migration/rollback/ledger nine-file command, `--timeout=30000`                                                                                                                                            | 231pass,0fail,1153assertions,68.83s Bun/68.889s driver. Complete file list/argv is retained with source evidence.                                                                                                                                                                                                                                                 |
| Separate uncached `bunx nx run-many -t typecheck` and `-t lint`, projects `wbs-contracts,wbs-domain,wbs-core,wbs-store-memory,wbs-store-sqlite,wbs-be-01,wbs-mcp-01`, `--parallel=2 --skip-nx-cache --outputStyle=static` | Initial backend typecheck failed on new-test ClientReply narrowing; initial contracts lint failed on a duplicate merged person_not_bound union member. Six other projects and module checks passed. Corrected backend/contracts typecheck22.174s and contracts lint18.925s passed; required seven-project outcomes are accounted for, not a blanket initial pass. |
| Exact changed-file format/diff and all174SQL migration lint                                                                                                                                                               | Pre-freeze49files pass; post-oracle50files pass1.990s, diff0.021s, migration lint0.014s.                                                                                                                                                                                                                                                                          |
| Normal scoped OpenSpec for both changes                                                                                                                                                                                   | twilight-agentic-workflows valid with10existing warnings,0.832s; main wbs-organization-limits valid with7warnings and2INFO archive-preconditions,0.718s. No archive/strict pass claimed.                                                                                                                                                                          |

The one complete local SQLite invocation was:

```sh
bunx nx run wbs-store-sqlite:test --skip-nx-cache --outputStyle=static
```

**Actual exit1:1902pass,1existing skip,1fail,16092assertions,1904tests/138files,
379.54s Bun/380.429s driver.** Its complete before/after freeze passed:11,760file
identities/modes, raw index, HEAD, MERGE_HEAD, full191-line status and174SQL bytes
were unchanged. Index SHA256
`5057b14234b34a4a95269def0f2b4423132f12c85f3c344b403730cb34cd9c70`.
The sole failure was the main-added organization-limits migration's empty rollback
expectation: target audience1200 legitimately reverses limits-audit1301, limits1300
and preserved runtime1210, but the old literal listed only the first two. Root
authorized that exact test-only correction after the freeze. The complete affected
file passed8tests/28assertions in0.677s, followed by uncached SQLite typecheck5.294s,
file lint3.144s and final formatting/identity checks. No production/SQL/guard changed.
No second broad suite was run, and **the final local complete-suite result is not
claimed green**. Final combined exact-SHA host gate/CI must validate the final source.

Root independently compared all frozen11,760entries and current files: only the
authorized oracle and root-owned scope amendment differed after the complete run.
All original49owned source hashes remained unchanged; all final50hashes and174SQL
paths/bytes matched. Final source-manifest SHA256
`4aa4f1a1e61858a709b5b0ab823845ae50e03307e2a4fddbda9574cabeb87407`;
full report SHA256 `4aff6c6770d24e044aaa86b6dfb8632f2c1719f5d4ad2f95d6e7e863feae27c9`.

Other retained failures: first runtime fixtures81pass/81fail from missing defaults;
after restoration161pass/1fail exposed the older latest-runtime assumption. The
history guard fixture now explicitly verifies reversal of the two newer migrations
before comparing the complete remaining ledger/schema/runtime history unchanged
around runtime-down refusal. No multi-migration rollback atomicity is promised.
The old-identity fixture excludes all six later main additions and retains its
strict full-ledger/schema/history/serialized-byte refusal proof. Two cap-fixture
uniqueness failures and a shared-client envelope assertion error preceded green;
none is labeled semantic policy RED or flakiness. All original/restored sources,
stdout/stderr, exact commands/exits and timing evidence remain retained.

Evidence naming collisions overwrote two intended payload filenames with execution
metadata; the actual graph is retained separately and source-state verification was
repeated under a distinct filename. Original/corrected command logs remain. Root's
first audit used the wrong metadata key `exit`; inspection showed `exitCode`, and
the corrected read-only audit passed without source/test changes. Node color noise,
existing memory stale-undo skip, inherited receipt invalid-format digest fixture,
and earlier missing raw receiver-driver diagnostic transcript remain disclosed.
The two main INFO messages concern archive prerequisites (missing registry header
and absent target resource-directory spec); main artifacts were not silently edited.

Historical integration `ebda8a216c73a38050579bdc46f5da927223b3eb` now has full
canonical h2 gate PASS and all applicable CI PASS on its pinned755baseline. Receipt
f978 remains code-reviewed without independent leaf gate/CI acceptance. Neither
certifies this new composition. New task/whole-branch review, exact combined-head
host/CI and latest-main drift check remain open. WBS authentication is unavailable;
status is retained locally without remote writes. No merge/deployment/activation,
I1/S0/S7a completion, authenticated transport, durable sender or host-ordering claim
is made. The parent change is not ready to archive.

Independent Task 1 review at source merge
`d2e1e830a9e3dfe82827b41c242cd91fc5315852` approved both spec compliance
and task quality, with no Critical or Important finding. The reviewer independently
matched all50source hashes, all174SQL/down identities, ninety retained parent blobs,
the exact getter-only fault/restoration and the complete11760file immutable freeze.
Local task1.1–1.4 are checked only for that amended source/evidence scope;1.5 and
parent5.5 remain open for final combined whole-branch review, published exact-SHA
canonical host gate/applicable CI and root acceptance. The final local complete
SQLite run remains the disclosed failure; the subsequent oracle correction has
focused8test/28assertion evidence, not a newly claimed full-suite pass.

Deferred review Minors are the evidence-driver metadata/payload filename collisions
(recovered graph/source-state artifacts and independent audit close the present gap),
inherited color warning noise, and existing agentic/main OpenSpec warnings and main
archive prerequisites. Carry all three into final review. Review report retained at
`/tmp/puni-agentic-limits-task1-review.md`; no source fix or extra suite was needed.

### Whole-branch review and final fixture correction

Independent whole-branch review approved the bounded foundation's code/spec at
`d5ce3ec26ac6f695a6d61bfb1e3d33dea7ceab78`, with no Critical or Important finding.
It read the complete88commit/233path/1,986,218byte package and reconciled raw source,
SQL, freeze and fault identities. All remaining parent coordinator/activation and
combined exact-SHA canonical gate/applicable CI acceptance stay open.

One final narrow fix wave changes only the receipt metadata requestDigest negative
to a different valid64hex digest (c repeated64, existing digest b repeated64).
Ledger/command mismatch fixtures stay unchanged. The complete receipt file passed
38tests/60assertions; removing only the production digest equality made its selected
negative fail with expectedfalse/receivedtrue; exact restoration passed the selected
case and full38/60 again. Uncached contracts typecheck/lint, changed-test format and
diff checks passed. One color-environment warning remains. Production original and
restored SHA256 is `258fa2def1b50c012bfd9152d5600d21e5c1b7a62caf546afcbd5c84bb482426`;
mutant `124bf3ff02b431f982cd0ac3499d2f28c79896b8312c846ca3c3461364723c01`;
final test `82fb11b5f6f5c0c184f6a77f1597f6fe4e3904b8e24be80301c416af5f03a0e4`.
This fresh proof covers the valid-input predicate case, not HTTP authentication.

The fix driver's added raw-index freeze check actually failed: raw hash changed from
76688d749b910531a8f84641abc1b7ca86c9888979a6f675e1b2cda11457fb41 to
c3e25bd2c28553dddfed148dd89061dfa7463a081ab4f9effe394fba97cf3b32. It remains a
failed check. Original raw bytes were not retained, so causal attribution is unknown;
mtime falling within diff-check is not proof of cause. No reset/rewrite concealed it.
Independent root audit matched all11,760current file hashes/modes/lengths to the
post-proof manifest, found exactly the permitted test change from baseline, verified
the exact one-comparison fault/restoration and all50original-source/174SQL identities,
and compared all11,760staged mode/blob/path entries exactly with HEAD. These establish
semantic source/index identity separately; **no raw-byte freeze pass is claimed**.
The earlier complete-SQLite invocation's own successful freeze and failed test result
retain their original scope. No broad suite was rerun in this test-only wave.

Report and independent audit remain in the plan evidence workspace as
final-fix-report.md and final-fix-root-audit.json. Historical evidence filename
collisions have recovered/audited payloads; new metadata uses distinct filenames.
Expected SDK stderr, inherited lint/color/OpenSpec warnings, existing memory skip,
initial review extraction deviation and historical proof-diagnostic limits remain
disclosed. Scoped fix re-review and final published combined gate/CI are pending.

## Durable runtime authority planning, 2026-10-22

Native isolated branch feat/agentic-durable-execution starts at immutable PR660 head
3fdc85cdcffa41e57936764c8de62a2557cf166b. Frozen install passed (1493 packages,
1.52s); the fresh RunStore memory/SQLite baseline passed 64 tests, 232 assertions,
0 failures across two files. Implementation, R5 negatives, reviews and cohesive
composition acceptance remain open. PR660's exact-head host gate and CI remain separate.

Parent0.3 is reopened: its historical throwaway2.x pin experiment does not establish
the checked-out root's dependency compatibility. Frozen root installation contains
@agentclientprotocol/sdk1.4.0. No SDK upgrade or2.x adapter verification is claimed.

CTT committed main94ff58f5 contains completedWork, DEFER_READY, summary and settle.
The primary registry0.8.0 tarball (218212 bytes,244 entries) matched its published
SHA512 integrity, but its root and sync/async declarations lack the new surface.
The package was inspected, not executed. No CTT source, dependency or publication
changed; a suitable package remains a future coordinator-admission prerequisite.

## Durable runtime authority implementation candidate, 2026-10-22

Task1 retains exact authority intents and receipt artifacts inside the existing
RunStore, with shared memory/SQLite rules and immutable local provenance. Schema2
bootstraps unchanged0001 plus additive0002; current format, complete physical schema
and runtime counts/history are audited before absence. There is no sender dispatch,
claim/write composition, executor launch, coordinator, credentials or activation.
Parent5.6 and final cohesive acceptance remain open pending independent review.

The existing public response schema deliberately ignores added wire fields. Actual
artifact verification preserves that compatibility while enforcing known fields and
complete correspondence; local retained records remain strict. Current-epoch local
owner labels are checked against the same admitted OwnershipStatus, independently
of receiver labels. Historical owner labels have no independent owner ledger.

Bun1.4.2 whole-script Database.run continued after an intermediate CHECK and later
DROP; a failing statement ending in semicolon plus newline also returned normally.
Bootstrap/reference now consume ordered complete trimmed forwardStatements. The new
down's supported caller first validates the complete installed format and uses an
explicit transaction with trimmed breakpoint execution, first-error rollback/rethrow.
Its SQL guard checks runtime-use/count/meta consistency, not independent full-format
authentication. No rollback API/CLI, old-format upgrade or power-loss proof is claimed.
See the [observed SQL incident](../../../docs/findings/checks-that-cannot-fail.md#bun-sqlite-whole-script-errors-can-be-masked).

The prescribed root bare-path Bun invocation failed510pass/22fail/20errors/1421
expect calls across40files in63.74s: two existing exact lifecycle/import fixtures
needed the four new methods and pure type dependency;20generated dist modules were
also collected by Bun's substring pattern and could not resolve aliases. Both the
failed logs and unchanged first freeze are retained. Root authorized only the exact
fixtures and one corrected full source run; no dist output was moved or deleted.

The corrected command was bun test with cwd CLI src/runs:512pass/0fail,1422Bun
expect calls,20source files,64.75s (64.803s wrapper), no skips. All four policy files
passed56tests/361Bun expects. Dash/tool-devsync uncached lint/typecheck, exact changed
formatting/diff and new migration-pair lint passed. Tool lint has3existing unused
eslint-disable warnings; color-environment warnings remain. Normal scoped OpenSpec
passed1change with10inherited warnings; strict/all validation is not claimed here.
Race-focused6tests/44Bun expects passed before the full run; node:assert counts are
not included in Bun's expect total. No broad package/backend/host/browser repeat ran.

R5 retained73trial windows:68observed named production-path failures and5masked/setup
trials with no proof claim. F34c/F53c supersede malformed/masked SQL variants;F24b
observes actual format1 byte change;F58 observes unchecked generation acceptance;F66
injects an adapter dependency into the new portable type;F67 removes the real closed
fence and exposes pinRuntimeScope's missing rejection. The earlier F18 ambiguous
anchor preflight stopped before mutation. Artifact-read dependency and never-pinned
diagnostic faults retain their narrower strengths. Existing reused guards were not
blanket recertified. All failed drivers, raw outputs and exact restoration identities
remain in the task evidence rather than being counted as successful negatives.

Root audited11776tracked/new source paths against the completed final snapshot with
no mismatches,312invocation log sizes,73exact original/restored fault hashes and both
complete-suite freezes. HEAD, full status, semantic staged identities and raw index
bytes were unchanged in those windows. All212protected file hashes/modes/sizes match;
all210previous SQL and both old portable files remain untouched. The only added SQL
is the0002pair. The root audit's initial symlink-directory read error was corrected
by hashing symlink target spelling; no evidence pass was claimed from that failed
audit attempt. Ignored task report/evidence remain available for independent review.

At immutable parentPR660 head3fdc85cdcffa41e57936764c8de62a2557cf166b, the canonical
h2 wrapper printed that SHA and completed exit0: workspace180tasks/49projects plus9
dependencies50m9s, Twilight10tasks48m45s, both source lints and solver-image smoke
3tests/15assertions3m5s. Raw log SHA256
f175802c72a273071a285ca2e9ae44716c25518e9bc684e847f766edaea1032a.
Tool-wiki inactive/certifiedfalse, legacy builder/pip warnings and startup curl56
remain recorded. Both browser2 CI attempts at that parent cancelled25m; pixels stays
red. Its host pass does not certify this uncommitted authority candidate or repair
CI. Separate reviewed budget correction and final cohesive exact-SHA gate/CI remain
required. WBS MCP authentication is unavailable; no remote status update asserted.

### Runtime authority task review, fix round1 candidate

Independent task review of e306f7e14 found one Important integrity defect: changing
only a later staged intent's local epoch from2to1 let read/reopen return an obsolete
grant. The original512-test pass did not cover that corruption. Ordered replay now
requires nondecreasing staged local epochs. Three actual SQLite negatives cover
read, current-owner mutation and reopen without changed schema/rows; a shared valid
[1,2,3] late-acceptance history verifies both providers and real receipt artifacts.

The review's down-caller composition gap also has a focused private fixture: inside
one BEGIN IMMEDIATE transaction, validateDatabase precedes trimmed down statements,
with first-error rollback/rethrow. Otherwise-valid wrong bundle and altered empty
schema refuse without deletion; unused down restores the prior schema/old records,
and used history trips the SQL guard and rolls back. Independent raw SQL guard tests
remain, explicitly distinguished from full caller validation. No operator/public
rollback API exists or is certified by these fixture tests.

Actual epoch-guard removal produced all3persisted missing rejections; removal of the
composed caller's real validateDatabase invocation produced both wrong-format missing
rejections. Both proofs ran0/1/0 with exact restoration and complete immutable fault
windows. Final two covering history files passed99tests/193Bun expects0fail9.56s;
uncached Dash lint/typecheck, exact three-file format/diff passed. Original512full
suite was not repeated or relabeled. SQL was unchanged, so no new migration lint;
no package/backend/policy/host/browser/CI repeat. Color warning remains. Formatter
setup ReferenceError and a fixture unsafe-return typing failure were corrected and
retained as nonsemantic failed trials, not RED/proof claims.

Root matched11776current source identities to the final focused snapshot,23invocation
log byte counts, both fault/freezes and212protected file identities. The original
207580-byte report prefix still matches SHA256
90f538d4e4bb8d35ec9c7379dddde5ebc401e3990ffc66f0fe11f977c87de2fe;
historical full-suite logs remain unchanged. Exactly three assigned source files
differ from e306f7e14; no SQL, portable layout, public API, race/lifecycle fixture or
other-product source changed. Scoped re-review remains pending, with no task
acceptance or release implied. M2 audit optimization remains deferred; the design
now describes repeated/quadratic lookup cost truthfully, with no measured scale
threshold. M3 inherited diagnostic warnings remain disclosed for final review.

### Bounded authority source-phase acceptance

Independent complete phase review approved3fdc85cdc..76eb6756e (7commits,40paths,
264819bytes) with no remaining Critical/Important finding. Task review and round1
scoped re-review closed the actual epoch regression and down-caller composition
gap. The six local authority implementation/verification items are now closed;
parent5.6 and later cohesive sender/coordinator/operational acceptance remain open.
No final fix wave or further test rerun was requested. This metadata-only acceptance
changes neither reviewed source nor the preserved proof identities.

The CI budget branch5bd230718 was incorporated by conflict-free private feature
merge76eb6756e after both of its independent reviews. All25reviewed production/test
source hashes match their approved parents. Its four local tasks are accepted,
with initial transcript-only logs and distinct present-state index audit limitations
retained. No live35-minute timeout/completed hosted browser verdict is established.

Three final Minor groups remain nonblocking: quadratic/repeated history audits with
no measured threshold (truthfully documented, optimization deferred); inherited
unused-disable/color/OpenSpec warning noise; and CI Nx historical task labeling on
a successful check. No warning-free, scalable-history or source-flakiness claim.

The512-test pass remains historical at its tested source, while99covering tests
certify the review fix. No full-suite pass transfers to the fixed/merged HEAD.
This phase adds no dispatch, claim/write composition, complete executor ordering,
coordinator or activation. Preparation/full locator/claim/turn/outcome/recovery,
final cohesive source review, exact-SHA canonical host gate and applicable hosted
CI remain required. The original3fdc host PASS and both failed browser attempts
retain their original heads and outcomes. No independent authority PR/gate, main
merge, deployment, production spend or cleanup occurred.

### Retained binding recovery planning

Intent, delta spec, design and ordered TDD tasks adopted for the retained-binding
boundary. Implementation, R5 proofs and independent reviews remain pending.
No source, format, host/CI acceptance or parent6a.3 closure is implied.

### Retained binding recovery implementation and evidence

Burokrat now decodes retained acceptance through its existing JSON/binding/path
owners. Dash reconstructs acceptance from actual retained prompt and policy bytes,
verifies every repeated reference, expands shared content to all declared paths
and compares the complete canonical snapshot. The returned manifest association
is detached and deeply immutable; Buffer replies use an independent Uint8Array
copy. Working-file edits and actual SQLite close/reopen preserve original BOM
bytes and selection. Static consistency and byte integrity grant no execution
authority.

Final focused source commands passed117tests/241Bunexpects in2Burokratfiles and
45tests/63expects in4Dashfiles. The required four-file devsync run initially failed
76pass/1fail: an unchanged pre-existing Dash hash-input test expected no WBS
contracts edge, despite the accepted runtime-history consumers and graph allowlist.
The failed run and isolated reproduction remain failed. After a complete immutable
capture, root authorized only that assertion false-to-true plus its observed-failure
comment. The whole corrected workspace-targets file passed26tests/94expects; the
other51policy tests were not repeated. These are239distinct passing cases across
two windows, not one239-test all-green invocation.

All six original uncached static targets passed (Burokrat lint:source/typecheck,
Dash lint/typecheck and tool-devsync lint/typecheck). Only the tool-devsync pair was
repeated after the fixture correction and passed. Changed-file format/diff and
normal scoped OpenSpec validation passed. Eleven long-requirement warnings remain
(ten inherited plus the retained recovery delta); color warnings and Nx output
limits remain disclosed. Nx successful summaries do not expose all executor output;
no warning-free claim is made.

Forty-six isolated production-path fault trials all produced nonzero child exits
and exact original/restored bytes. Three establish classification, three establish
before-artifact-IO ordering, and stronger retained-byte cases separately demonstrate
the relevant acceptance escapes. Dependency-broken valid paths are distinguished
from guard-removal admission proofs. Both ordinary and Buffer held-byte tests catch
aliasing; the original slice defect failed, the copying constructor passed and
actual slice reversion failed. Existing unchanged guards were not blanket recertified.

The worker violated the explicit Bun/Nx-only instruction by using Python to edit,
orchestrate and capture evidence. It disclosed79requested process starts:
48outer wrappers,13recorded inner commands,4standalone writers and14inline batches.
Standalone/inline raw output is transcript-only. Actual tests/static/format/OpenSpec
children used Bun/Nx, while their original wrapper did not. The unexecuted Python
report builder and all old scripts/logs were preserved. No historical command was
rewritten or relabeled as compliant. Python use stopped when root identified it;
remaining evidence/report work used Bun. This is a disclosed process violation,
not an authorized exception or a claim of full instruction compliance.

After explicit worker hold release, root independently audited the evidence with
Bun1.4.2: both complete windows match11790source/mode identities, HEAD, branch,
full status and complete staged identities; raw index hashes match within both.
Current source matches the final corrected capture. All11785staged entries match
immutable planning BASE8b764a39d451288460493bf24e01962fb598f19d; all214SQL/old-record
protected paths are unchanged. All97retained invocation log pairs and46fault
original/mutant/restored identities were checked. Root read the retained orchestrator
and fault/capture scripts without executing Python. The audit verifies retained
evidence and current state; it does not undo or excuse the historical violation.

Unreadability is modeled through a failing artifact port with the original cause;
no actual mode-zero filesystem-artifact claim. Memory/SQLite/reopen proofs are real.
No generic Manifest retention, portable layout, adapter format, SQL, provider,
credential, dispatch or coordinator change. No full Burokrat/package/backend/
RunStore/browser/build/host/CI repeat; later cohesive review and exact-SHA canonical
gate/applicable CI remain required. Independent task/final phase reviews and local
task checkbox acceptance remain pending. Parent6a.3 stays open.

### Bounded retained-binding source-phase acceptance

Independent task review approved implementation/spec behavior and code quality.
Its Important historical-process finding received explicit root disposition:
Python use remains rejected as noncompliant, with all disclosures and raw gaps
preserved; technical source acceptance is based on independent Bun audits rather
than a retroactive process waiver.

Final complete bounded review approved0aec439bd..58bde16e8:2commits,16paths,
85754bytes/1777package lines. The dispatch mistakenly described14paths; the reviewer
read all16 and found no omitted part. No actionable code finding or final fix wave
was requested. Both reviews independently inspected retained raw evidence; the
task reviewer also rehashed all138fault bodies.

Only the five local binding-recovery implementation items are now closed.
Their closure records bounded behavior and scoped verification acceptance; it
does not certify historical process compliance. Parent6a.3 remains open for
revocation and provenance-aware re-pinning, and parent5.6/cohesive execution
ordering, final branch review, exact-SHA canonical host gate and applicable CI
remain open. Deferred warning noise and limits stay visible. No source changed
after the approved58bde16e8; this acceptance commit is metadata only. No main
integration, deployment, cleanup or independent helper release occurred.

### Durable execution history planning

The bounded history intent, explicit version/API design, delta requirements and two ordered
TDD tasks are adopted. Shared portable values/codecs precede one coherent Attempt2, atomic
claim association and format3 provider change. Existing authority/binding acceptance stays
accepted; no external dispatch, exact write/release or host ordering is implemented by this
planning adoption. New code, semantic RED/GREEN, R5 faults and reviews are pending.

The locked OpenSpec status/apply commands were read before adoption: sdd-lean, ready,
parent39tasks with5complete/34open. Artifact existence is not implementation acceptance.
Parent6a.5, parent5.6 and all cohesive review/gate/CI milestones remain open.

Planning checks: locked Bun OpenSpec validation exited0,1change passed/0failed with
the same11 long-requirement warnings. Exact seven-file Prettier check and git diff
--check exited0. No implementation tests were run for this documentation adoption.
Fresh WBS project read still requires MCP authentication; remote claims/status were
not read or updated. Reconnect is already pending; local work continues.

### Portable execution values and complete reply snapshots

Task1 extracts original scalar codec instances and portable executor values from the live
port. Original facade/constructor identities remain, runtime codecs consume the common leaf,
and complete TurnReply snapshots validate correlation, variants, usage and nested immutable
own copies without freezing callers. Exact source policy moves one Burokrat consumer; no
Attempt/RunStore version, SQL, dispatch or adapter behavior change.

The final agent invocation passed99tests/787Bunexpects. Final storage failed192pass/1timeout;
the exact physical-reference child case passed separately with its unchanged15s limit.
Final policy failed39pass/1timeout, and that exact case also timed out alone at its unchanged
30s limit. Standalone timing diagnostics completed all37operations/64assertions; an authorized
official Bun run with observational ESLint timings passed1test/64assertions under the original
30s limit. Its33ESLint calls matched the diagnostic sequence/source hashes. Original causes
remain unknown.193distinct storage and40policy cases passed across invocations; the combined
failed commands remain failed. No test source, assertions or limits were changed for timing.

Four uncached targets passed: Dash lint/typecheck and tool-devsync lint/typecheck. Exact
changed-file format/diff and scoped OpenSpec passed. Expected SDK diagnostics, color warnings,
three unused-disable warnings in unchanged files and11 inherited requirement-length warnings
remain disclosed. No full-package/backend/browser/build/host/CI repetition.

Of67retained fault trials,39isolated intended assertion failures are accepted and28original
trials remain unproved: one masked payload,21overlapping codec trials,4dependency setup/overlap
trials and2invalid policy-loader trials. Corrected distinct sequential captures demonstrate
the new guards/consumption edges with exact restoration; adjacent Proof comments cite them.
The overlap, original failures and coarse invalid driver labels remain preserved.

After explicit worker release, root independently Bun-audited11797source/mode identities,
full HEAD/branch/status/staging and raw index, plus all146raw log pairs and67fault triplets.
All11793staged identities match immutable planning BASE656607d97; only7authorized tracked
files differ and4new source files exist.11786other tracked blobs/modes, including original
SQL/records/RunStore, are unchanged. Raw indexSHA256cc481ca74219afc340aab14c0fb473df46dd467d8bbe47cede6d72691a522c79
is stable.248output hashes were recorded originally;22early invocation pairs are inventoried
now without a retroactive sealing claim. Original report and all raw evidence remain intact.

Independent task reviews, coherent Attempt2/claim/history/format3 implementation and whole
phase acceptance remain pending. This source commit closes no local or parent checkbox and
certifies no external ordering, exact write/release, full gate, main integration or deployment.

### Portable codec review proof correction

Task review approved code quality and found two missing R5 negatives for the completed
and unresolved outer reply freezes. The original implementer removed each outer freeze
separately; the existing frozen-state assertion failed with2 and58Bunexpects. Both exact
source restorations preceded the next trial. Two adjacent Proof comments now record those
observations; no functional statements, tests, assertions or time limits changed.

The full codec file passed10tests/351expects; exact-file ESLint, format and diff checks
passed. Root's independent post-release audit matched11797trackedsource/mode identities,
all11797staged entries against immutableb0f496c32, full HEAD/branch/status/rawindex and
final before/after captures. Only the two-comment source path differs;11796other tracked
paths are unchanged. All737prior evidence files retain hashes/modes/lengths, and the
original47023-byte report prefix remains unchanged; the fix report is append-only.

Both new trials are actual isolated assertion failures, bringing retained totals to69
trials/41valid proofs/28unproved originals. Original failed combined runs, focused coverage
and unknown timeout causes remain unchanged. No broad checks were repeated for comments.
Scoped re-review and Task1closure remain pending; Task2 and all parent/full gates stay open.

### Portable codec prerequisite acceptance

Independent task review and R1 scoped re-review now approve Task1 spec compliance and code
quality. Both missing outer-freeze proofs are addressed; no new breakage was found. Only
the six local Task1 source/evidence items are closed. Original failed combined commands,
focused coverage, unknown timeout causes and output limitations remain as recorded.

Task2's coherent Attempt2/atomic-claim/history/format3 work and whole-phase review are next.
Its historical reconstruction additionally requires provider-owned scope context independent
from generated replies; no source implementation of that correction is claimed here. All
parent/fullgate/CI/main/operational acceptance remains open.

The historical-scope correction and Task1 acceptance metadata passed fresh locked scoped
OpenSpec validation (1pass/0fail, same11inheritedwarnings), exact four-file formatting
and diff checks. Task2 public APIs and format3 SQL shape are unchanged by the correction;
provider-owned record context, historical prefix and causal bounds supply the missing
independent reconstruction input. No Task2 implementation or R5 proof is claimed yet.

### Durable execution history Task2 implementation candidate

Task2 implements Attempt2, exact preparation/claim/turn checkpoints and recovery,
independent historical scope context, original command/completion acknowledgements,
verified retained-evidence helpers, coupled memory/SQLite updates and format3. No
executor dispatch, remote WBS send, exact write/release or production host order is
implemented by this candidate. All nine local Task2 boxes and parent/full gates stay open
pending independent task and whole-phase reviews.

The current complete source invocation573 passed986tests,0failures,0standaloneerrors
and2828Bunexpects across26files in124.69s. It used these explicit arguments from
`apps/twilight-structure/twilight-dash/cli/src/runs` without a timeout override:

```sh
bun test ./admission.test.ts ./artifact-store.test.ts ./claim-history.test.ts ./execution-history.test.ts ./manifest-binding.test.ts ./open-stores.test.ts ./outcomes.test.ts ./receipts.test.ts ./record-preparation.test.ts ./run-store.test.ts ./runtime-history.test.ts ./signals.test.ts ./sqlite/admission-races.db.test.ts ./sqlite/artifact-store.db.test.ts ./sqlite/capacity-integrity.db.test.ts ./sqlite/execution-history.db.test.ts ./sqlite/execution-integrity.db.test.ts ./sqlite/manifest-binding.db.test.ts ./sqlite/open-stores.db.test.ts ./sqlite/outcomes.db.test.ts ./sqlite/run-store.db.test.ts ./sqlite/runtime-history.db.test.ts ./sqlite/runtime-races.db.test.ts ./sqlite/signal-integrity.db.test.ts ./sqlite/signals-receipts.db.test.ts ./sqlite/snapshot.db.test.ts
```

Final60-file format check567, uncached Dash lint568 and typecheck569 passed.
Unchanged tool-devsync lint520 passed with three inherited unused-disable warnings;
typecheck523 and the final changed policy-file lint524 passed. Effective boundaries525
passed42tests/525expects, module labels526 passed6/9 and product constraints527
passed3/9. Actual migration-lint528 passed both0003 forward/down paths. Those unchanged
owners were not rerun after test-harness/comment-only repairs. Color-environment notices
remain. Root documentation formatting, scoped OpenSpec validation and diff checks follow
this evidence reconciliation; host/build/browser/backend/applicable-CI acceptance is pending.

Original full invocation533 remains FAILED980pass/6fail/2cleanup errors/2798expects.
Two exact legacy rollback/capacity expectations were corrected and passed538. Three
admission cases and the snapshot case had5000ms process-test timeouts; the observed
contention and before-COMMIT stacks were at readiness, while the after-COMMIT reached
phase remains unverified. Fresh import-only children537 measured5011.876ms and5098.643ms;
this is current process cost, not retrospective timeout causation or cold-disk timing.

Under rulings157/167, per-case startup is separated and measured: admission15000ms,
snapshot10000ms, with original5000ms bodies and10000ms barriers/operation waits retained.
The snapshot fixture now interposes between actual catalog run-row and attempt-row reads,
using the same real admission writer and an atomically published reply after store close.
No original combined5000ms-path pass is inferred. Four repaired cases passed552/554;
corrected readiness cases passed560/562. The current full573 proves their coexistence
with all other source RunStore cases. Actual COMMIT/SIGKILL/reopen does not prove power loss.

The221 retained trial IDs comprise160 non-diagnostic production samples,18 bounded
diagnostics, one refusal-priority contract(F65), one indexed corruption-exception
contract(F205), one consistent-read availability sample(F218), eight helper-only samples
and32UNPROVED originals. Counts are trials, not unique guards, every compound member or
all provider paths. F218 observes an actual applied writer packet before a valid concurrent
read loses success; it proves neither a returned mixed snapshot nor unsafe application.
F219 observes ENOENT after deterministic removal at the mandatory read, not a never-published
wait timeout. F213/F214 remain unproved exact hook-name mismatches; fresh220/221 declared
normal case and beforeAll hook identities separately. Setup, selector, initializer, masked
and nonliteral-replacement failures remain preserved. Supported rollback's queued-attempt
sample does not certify each masked SQL clause independently.

After explicit worker release, root verified all11813source/mode identities, complete
HEAD/branch/status/staged tree and raw index, all349early evidence identities, exact raw
output/driver/script prehashes, all26 current test hashes and the986 actual pass names.
The pre-documentation source capture is SHA256
`230902fb43ba38284ca9d2d316331c4b74f5e2e0fb8d22b0b215b486bfb629ae`.
Only46authorized tracked paths and16new source files differ from planning BASE1c6960c68;
old0001/0002 SQL bytes/modes and other projects are unchanged. Five repaired admission/snapshot
children have independently reconstructed complete streams/EOF, producer argv/source,
exit/signal and owned cleanup evidence. Other process evidence retains its original limits.
Original212 registry entries remain unchanged in the221-entry inventory.

Initial38log pairs lack original output hashes and12early drivers are absent; F01–12
lack separate actual mutant-mode/restored-body artifacts. Original missing-PID/stdout-prefix
limits and all failed commands remain explicit, with no retroactive sealing or green verdict.
The four unchanged agent suites and broad local package/backend/browser/build checks were
not run for this task under its scoped brief. WBS authentication/connector access remains
unavailable, so no remote project status update is claimed.

Source implementation and local verification are candidate evidence only. Root normal
commit, both independent task verdicts, whole-phase review, printed-SHA canonical host gate,
applicable CI, integration and operational acceptance remain pending. No checkbox closure,
main merge, live spend or deployment is implied.

### Task2 candidate documentation reconciliation

Root applied the bounded caller, completion, recovery and provenance decisions after
worker release, preserving all open Task2 boxes. The first documentation validation
passed with13 requirement-length warnings; earlier records saying11 retain their
historical scope. Final document checks are captured separately from source tests.
No new source test invocation or acceptance is inferred from documentation checks.

### Task2 independent review and first fix round

Task review of1c6960c68..8071351ba found four Important issues: incomplete R5 coverage
for the shared SQLite audit dependency and new runtime/claim checks, an unreachable
retained check, duplicated coupled test construction and six unreconciled file entries.
No Critical runtime defect was established. The original writer owns the first fix round.
All nine Task2 boxes remain open. Inherited lint/color/requirement-length warnings remain
a deferred Minor for the whole-phase review.

Root read all six unchanged dependencies and their current owning call sites. Their
facade codec/type, version1 row, completion decoder, format-hash and transaction ownership
already supplies the required adaptations, so the task inventory now explicitly records
them as unchanged dependencies. No incidental source edits or recertification of their
unchanged checks is implied. Scoped re-review must verify this reconciliation and all
source/proof fixes. Historical provenance gaps retain their original limits; their
acceptance disposition is still pending. No task/phase/host/CI/integration closure.

Root review-fix decisions retain one claiming-checkpoint owner after the complete
joined audit, with exact submitted-intent correspondence and checkpoint narrowing.
Repeated scope lookup/pending/claim-kind validation is assigned to its actual runtime
and history owners; source implementation and scoped re-review remain pending. Six
new trial plans distinguish the central SQLite dependency, shared port/fold checks,
submitted identity, duplicate-refusal and the declared canonical-undefined diagnostic.
No unexecuted plan is a passing proof, and F78 remains unproved.

Root independently reread the twelve early negatives: retained original/mutant bodies,
raw/driver hashes, original outer script prehash, sequential named failures, actual
restored hash/mode and both full captures agree. Their original observed semantic
strength is retained without repeating solely to add duplicate artifacts. Actual
mutant modes and separate restored-body copies remain absent, as do the earlier
unsealed-output and missing-driver limits. No retroactive sealing or universal
provenance certification is claimed. Scoped and whole-phase reviewers receive this
explicit acceptance disposition; all source/task/full gates remain open.

### Task2 production refactor requires explicit approval

Automatic approval review rejected the entire fix1-004 production refactor before
process creation, describing runtime-guard removal/claim-validation changes as potential
persistent security weakening without explicit user authorization. No production edit
ran and no indirect retry occurred. The exact two-file patch is retained unapplied for
review; root will request explicit user authorization after completing unaffected work.
The earlier checkpoint-owner decision remains a proposal, not implemented behavior.

The independent I3 test-only refactor shares the coupled fixture and dispatcher while
preserving command IDs, turn key and owned cleanup. Normal004e passed57tests/249expects;
original003 remains FAILED15pass/2fail/41expects. Its corrected checkpoint fixture passed
004c separately with2tests/6expects. Those commands are not one aggregate green run.

After formatting only the two changed test files, exact-file ESLint, uncached Dash lint
(56.6s, color-environment notice) and typecheck(8.6s) passed. Normal011 passed all six
coupled before/after-COMMIT SIGKILL/reopen cases with48expects in34.31s, unchanged
15000ms setup/5000ms body/10000ms barriers and no override or retry. Original child
evidence limits remain: stdout EOF is explicit, stderr is a completed arrayBuffer
chunk without a separate EOF event. No power-loss or blanket lifecycle claim.

Following explicit worker release, root audited all11813tracked source/mode identities,
complete HEAD/branch/staged tree/raw index and349early artifacts. Only the two test files
and two root documents differ from8071351ba; all production bytes remain unchanged.
Root also checked raw output/driver/script prehashes, exact process names, sequential
commands, the unchanged221-entry registry and the unapplied patch hash. Root released
the hold; worker is idle pending permission. No guard fault F222–227 ran. Original
32unproved trials, failed533 and historical provenance limits remain unchanged.

No fix commit, scoped re-review, whole-phase review, host gate, applicable CI or integration
acceptance is claimed. All nine Task2 boxes remain open. WBS connector access remains
unavailable; no remote status update, main merge, live spend or deployment occurred.

### Task2 first scoped re-review and independent audit proof

Test-only candidate48e6ea25b committed the verified fixture fixes and truthful metadata
with normal hooks. Scoped re-review8071351ba..48e6ea25b marks I3fixture duplication and
I4file inventory ADDRESSED; I1audit dependency and I2guard coverage/unreachable check
remain NOT ADDRESSED. No new fix-diff breakage was found. The proposed persistent
production refactor remains unapplied and still requires the requested user approval.

The next bounded fix round investigates I1only through the user-required R5 procedure:
one temporary SQLite audit-dependency fault in an isolated owned test, restored exactly
in finally under a separately granted full source/Git hold. The rejected runtime/claim
source files and persistent patch remain untouched. No such new trial has run yet;
its exact current-source plan, expected assertion and restoration must precede execution.
Any automatic rejection of this separate test action will be respected without a retry.
No Task2 checkbox, whole-phase, gate, CI or integration acceptance is implied.

### Task2 independent SQLite audit proof accepted locally

Root independently audited F222: one valid-shaped queued run-revision mismatch lost
its public-read rejection when only the shared validateHistory call was bypassed. The
pinned baseline and exact-restored case each passed1test/6expects; the fault failed
0pass/1fail/5expects at the declared rejection assertion. Source bytes/modes, complete
Git state, raw logs, driver/script prehashes and all three child executable identities
matched. The explicit root hold was released before adding its adjacent Proof comment
and222nd registry entry; original221 entries and32unproved originals remain preserved.
This certifies one shared dependency/public-read sample, not three coupled callers.

The original queued-reservation candidate remains an unexecuted proof plan: a separate
capacity check would still reject it. The actual revision case leaves reservations
intact. Historical global-Bun1.4.4 baseline remains separate; the accepted proof used
repository-pinned1.4.2 from the checksum-verified isolated temporary installation.

Remaining retained-guard proposals are five separate temporary trials, F228–232. Old
F223–227 plans stay unexecuted. The replay and checkpoint-priority cases are bounded
contract samples; reconstruction and submitted-intent cases require their actual named
loss of rejection. These proposals do not authorize the rejected persistent refactor
or removal of any predicate it deletes. No new trial or result is claimed yet.

A task-local bunx probe exited0 with empty version streams. It remains inconclusive;
direct pinned CLI probes printed ESLint v10.10.0. Final local static checks will invoke
the installed CLI entrypoints directly with the configured full Dash scope and forced
project-build arguments. No new named Nx-target verdict is inferred. Canonical host
gate, applicable CI and complete task/phase acceptance remain open.

### Task2 retained-check observations and evidence gap

Independent current-window audit verified all11813 source identities and unchanged
HEAD, branch, index, stage and status across the five temporary retained-check trials.
Baseline and restored runs each passed7tests/18expects. F228 and F229 changed replay
refusals to duplicate replies; these establish refusal/replay contracts only. F230
removed one compound reconstruction check and lost three named authority throws. F231
changed a submitted-intent identity refusal to applied. F232 changed state_conflict to
identity_conflict and establishes refusal priority only. Each literal, protected
statement, original/mutant/restored body, recorded mode and actual raw log matched.

The original complete audit FAILED because the original early-evidence manifest
`/tmp/puni-execution-history-early-evidence-audit-084.json` is absent. Its historical
creator printed only the summary, so the transcript cannot recover the349 original
file identities. Earlier evidence preservation is therefore UNVERIFIED for this
window. No current hashes were substituted for historical identities, and the failed
complete audit was neither overwritten nor relabeled successful. The separate report
`/tmp/puni-i2-current-window-audit.json` certifies current-window observations only.

Root released the current hold for five bounded adjacent Proof comments and registry
append, preserving all222 existing entries and32 UNPROVED originals. F223–227 remain
unexecuted plans; five appended trials yield227 actual entries, highest ID232. Final
pinned format, direct full-Dash ESLint, forced TypeScript project build and covering
tests are pending. The persistent guard-removal patch remains unapplied and subject
to the existing user approval request. I2, complete Task2/phase acceptance, canonical
host gate, applicable CI and integration remain open.

### Task2 final local proof fix verified

The final exact source passed changed-file formatting, direct four-file and full-Dash
ESLint, the configured native TypeScript7.0.2 forced project build, and nine covering
tests/27assertions. Root independently checked actual commands, exits, raw hashes,
retained drivers/scripts, exact case sets and restoration. The post-format/final
capture comparison preserved all11813 source identities plus complete Git/index state.
Formatting changed only the declared SQLite test; production changes are six bounded
Proof comments, with planner behavior byte-identical after removing those comments.

The initial preflight FAILED on the assumed Nx bin path and ran no final checks.
Read-only resolution established Nx23.2.1 at dist/bin/nx.js and configured tsc at
@typescript/native/bin/tsc, resolving TypeScript7.0.2. The separate parser-compatible
TypeScript6 installation was not used. Corrected preparation preceded the successful
window; original failure and unused draft remain retained. These are direct lint/type
checks with configured scope/arguments, not named Nx-target/full-host verdicts.

Original222 registry bytes and entries are unchanged; five appended observations yield
227entries/maxID232 with all32 UNPROVED originals retained. F223–227 remain unexecuted.
The current audit reports and recovered review-only patch are archived in the task
workspace. Missing older temporary review files are represented only by the delivered
agent-verdict transcript, not claimed recovered originals. The proposed patch matched
its recorded original SHA256 and remains unapplied; its historical note describes
then-planned verification rather than current results.

The missing084 manifest still prevents historical349-file preservation verification.
Task2/I2, whole-phase review, canonical host gate, applicable CI and integration remain
open. The broad historical986-test result was not rerun for this test/comment slice;
unchanged process, policy and migration checks remain historical. No live action or
production deployment was performed.

Root checks: Nx exact-five-file format check and git diff --check passed.
OpenSpec validate twilight-agentic-workflows passed with13 existing requirement-length
warnings. Raw root-fix2-013–015 command evidence is retained beside the worker window.
Scoped round2 re-review and the remaining guard-refactor approval are still pending.

## Private runtime principal-cap restoration — 2026-10-25

The parked durable-runtime candidate remains private on base c6721a5a97ed610f7ac42508cfb1efe137f444b7. Fresh SQLite runtime admission now applies the credential owner's unchanged organizationRoleOf to current stored membership before project classification. Both runtime capture owners detach verified authentication before queuing, then derive the existing person pin from that same snapshot. Metadata remains ephemeral; public request/receipt formats, storage and role policy are unchanged. Deliberate human-admin recovery and direct nonruntime fanout compatibility remain intact.

A real mounted API-key regression returned 200 instead of forbidden on unchanged production; consent consumer and queued-alias cases also failed semantically. The corrected final nine-file command under pinned Bun1.4.2 passed193 tests,0 failures,948 assertions at the unchanged10000ms timeout. Configured core module typecheck checked all17 modules; core and SQLite-store TypeScript builds, six-file ESLint and Prettier passed. Backend build had already passed before comment-only changes.

Root audited three finite production-path faults: RCAP-01 discarded authentication at the shared role helper (2 mounted real-key read/acquisition cases became200); RCAP-02 aliased the transaction authentication snapshot (6 queued machine/consent read/acquisition/lookup cases accepted); RCAP-03 aliased the command-runner snapshot (8 queued claim/write/replay cases accepted). All16 failed at the expected refusal assertion. Each fault had its own passing baseline, exact byte/mode restoration and immediate same-selector passing rerun. Complete manifests for11,814 protected paths and raw Git/index/HEAD/status/diffs matched after restoration. Three adjacent Proof comments describe those actual observations.

Retained evidence: [runtime-principal-cap.json.gz](evidence/runtime-principal-cap.json.gz), compressed SHA256 8cb718143342c47860696f9db78d210a4af0d754bc9eed72eda4af36e644726f; decoded SHA256 c1d22ead627fbd09bf0327bf73896f62f0a78c7566d8633d0586b493f614333a. Decode gzip JSON; each files entry names a base64 blobs value by SHA256.826 path records retain original command streams/argv/exits, all phase manifests, finite runner/proposal/hold, original/mutant/restored target bytes, raw Git files, root audit and final hashes. Redundant unchanged source bodies are omitted; their full manifests and immutable base identify them. Earlier setup failures, partial-edit failures and sandbox-blocked JWKS run remain failed history; the exact local-server rerun and consolidated final command passed.

Not verified here: be-01 module target, full host gate/build/CI-only secrets and migration checks, real consent cryptography/family verification, or live/deployed behavior. Consent/queued fixtures cover the verified-principal consumer seam. Independent reviews remain pending at this record. This fixes a consumer defect, not G2, old I2, the earlier SQL evidence gaps, S0/S7a acceptance or release readiness. The previously rejected persistent Dash guard-removal patch remains unapplied. No runtime publication, architecture merge, paid execution or production action occurred.

Task review approved spec and quality with no Critical/Important findings. Its four R2 test-helper naming findings were corrected mechanically; exact reverse renaming reproduces the earlier test bytes. The renamed test passed23 cases/89 assertions once, with test-only lint/format passing. [Name-change evidence](evidence/runtime-principal-cap-names.json) preserves the exact delta and raw commands. The immutable archive above describes the pre-rename test; production and Proof bytes did not change. Current test SHA256 is6e358972b22f2d6adaf206e11a3b561f0f83f206b6508df4470f985418fa1fd8.

Additional root checks: targeted OpenSpec JSON validation exited0 (valid,0 failures,13 existing long-requirement warnings); the on-disk bootstrap policy test group passed5 cases/25 assertions with19 filtered out. Neither is a full gate. Whole-fix review and normal private commit remain pending at this record.

Whole-fix review approved the private consumer change with no Critical/Important findings; its final R2 nit was resolved by renaming the consent-stub helper only. Another exact23-case/89-assertion run and test-only lint/format passed; production and Proof bytes are unchanged. The name supplement preserves both mechanical steps. Final test SHA256 is9f12ba68b946a709a68a434963b0888d3b2dd1e06106ce42e5be6696c9178572. Normal private implementation commit:d0d981c08913f4baa5a997acd9bee7651a7ca434, followed by this naming/evidence correction. Configured hooks passed lint/format/secrets/private-nesting; Tool Wiki explicitly reported inactive/uncertified because the external activation root is absent. No runtime push or merge occurred; all parent acceptance limits remain.

## Recovered SQL history and six current trigger proofs — 2026-10-25

The original receiver Task2 report and139 evidence files were recovered from the retained c66f worktree:140 files/625966 bytes. Its broad classifier incorrectly called six migration-setup failures guard proofs. Of32 cited SQL-family trials,26 raw logs reach intended refusal assertions after prohibited SQL or rollback succeeds; six P29/P30 logs fail on a blank Drizzle migration query before reaching the negative. The original report, false classifications and all failed logs remain unchanged. The26 retain their original provenance limits: no complete per-trial original/mutant/restored source hash chain, combined streams and later aggregate restoration instead of immediate pairs. Recovery is discovery-time collection, not retroactive sealing or recertification.

[Recovered history](evidence/runtime-sql-recovered-history.json.gz): compressed SHA2564e6fcd6458a259dc63dcd29e3fa02b0ea20db5b3611cd8498373faa45d4740ed; decoded SHA2569d5a168d2c8650db484d18d5a55f2a8f48107985fc6639141637d999f2524a51. Its JSON entries retain path/size/hash/mode/base64 bytes and the corrective recovered audit. Neither archived Python driver was executed.

Six distinct current proofs instead bootstrap each disposable database through unchanged production runMigrations then openDatabase, drop exactly one installed trigger after healthy migration, and execute the exact existing SQL negative without an intervening application audit. Each absent trigger permits SQLite changes=1 and makes the expected toThrow actually fail. Four deletes remove exactly one row; two updates intentionally write the already-stored value and return changes=1 while row values stay equal. Each faulty database rolls back the attack, restores its captured installed original trigger SQL and verifies the complete catalog, runtime rows and migration ledger exactly. A third fresh migrated database independently passes the original negative; its random ledger identity is compared only to its own baseline.

| Current proof | Installed trigger removed         | Historical setup-failure filename under task-2-evidence |
| ------------- | --------------------------------- | ------------------------------------------------------- |
| SQL6-D01      | runtime_ledger_no_delete          | P29-no-delete-runtime_ledger.txt                        |
| SQL6-D02      | runtime_authority_no_delete       | P29-no-delete-runtime_authority.txt                     |
| SQL6-D03      | runtime_claim_binding_no_delete   | P29-no-delete-runtime_claim_binding.txt                 |
| SQL6-D04      | runtime_command_receipt_no_delete | P29-no-delete-runtime_command_receipt.txt               |
| SQL6-U01      | runtime_claim_binding_no_update   | P30-no-update-runtime_claim_binding.txt                 |
| SQL6-U02      | runtime_command_receipt_no_update | P30-no-update-runtime_command_receipt.txt               |

Actual cumulative execution:19 child invocations. V1's one healthy baseline passed, but its runner stopped before any DROP because Bun1.4.2's native SQLiteError has constructor.name=Error. That failed attempt has zero classified proofs and remains retained. After a separate audited correction/hold, V2 executed18 phases:12 healthy passes and six expected assertion failures, each with the actual forbidden SQL success and exact restoration. Native name/constructor/code/errno/message and the real instanceof check are retained. No setup failure was counted as a proof.

Root independently inspected every raw fault, all18 child outcomes and all38 V2 source/Git/proof snapshots;11,816 current repository paths/hashes/modes matched throughout. Protected migration.sql SHA256ef8f1b818cb1e2d98f6f933f3e7125ac00cd1c428124afd5619c254cccaba00d and down.sql SHA256f746030705887823048439ac61e3f892d9f57e675b298f11533b87b649ea0775 are unchanged, including comments. The mapping above supplements the historical P29/P30 annotations without editing migration bytes. Starting private HEAD:29571c32142718b84125d7eb079be259792465ee.

[Current SQL proofs](evidence/runtime-sql-six-proofs.json.gz): compressed SHA25610b31b7ca7c86c688c22b281887d0dfe880cb5bab83889fc9d6de4e834bdc6fd; decoded SHA2563399af24a6a6062d17b53f8698cc02acc957a73c6bfd0d5495eaf47b05534baf. Decode gzip JSON;1858 file records reference698 base64 blobs by SHA256. It preserves both attempted runs, finite code/proposals/holds, exact original streams/argv/exits, SQL states, disposable databases, full phase manifests and root audit. Redundant unchanged source bodies are omitted; protected SQL/owners/tests/Dash/dependencies and raw Git bodies are included, with complete source identities pinned to the starting commit.

Task review approved the substantive proof contract with no Critical/Important findings. One literal environment deviation is explicit: the plan's example removed NO_COLOR; actual reviewed execution set NO_COLOR=1 and removed FORCE_COLOR, avoiding conflicting color controls. Raw environment and diagnostics remain retained. This did not change the SQL test scope and was accepted by root without altering frozen evidence or rerunning. Whole-handoff review and a normal private evidence commit remain pending at this record.

These proofs establish six direct SQLite trigger sensitivities only. They do not establish application/startup acceptance with absent triggers, other SQL guard proofs, historical26 source provenance, original084manifest preservation, G2/I2 resolution, full host/build/CI acceptance or S0/S7a completion. No production source, existing test, SQL/comment, dependency, authentication policy, schema or deployment default changed. No runtime publication, architecture merge, live call or production action occurred.

## CLI-harness and ACP SDK readiness — 2026-10-25

The next planned adapters were checked against current primary-source package metadata and exact tagged source before changing dependencies. [SDK readiness findings](../../../docs/research/2026-10-25-agent-executor-adapter-sdk-readiness.md) retain the version graph, permission/lifecycle/usage limitations, ACP stable-versus-unstable schema split and the existing module-placement constraint. These findings change the next implementation packet's acceptance checks; they do not choose G2, accept ADR0057, implement an adapter or complete a parent task. Existing October21 runtime spikes remain historical observations for their named versions.

Root independently re-read the Codex permission guard, harness cleanup and usage normalization, ACP migration guide, installed usage declarations and current prototype/boundary callers. Four official registry tarball SHA512 integrity values matched retained downloads; four key source files matched independently fetched GitHub API source (apart from the API CLI's output newline). A browser raw-source cache miss was recovered through the official GitHub API.

No SDK/session/model/provider/process execution, credential access, token spend, dependency change, application test, build or full gate ran. Only research Markdown and this verification link changed; runtime, storage, SQL and authorization source remain unchanged. No architectural merge or runtime publication is part of this research.
