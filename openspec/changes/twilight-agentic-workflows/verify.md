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
