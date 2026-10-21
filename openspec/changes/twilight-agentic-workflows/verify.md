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
