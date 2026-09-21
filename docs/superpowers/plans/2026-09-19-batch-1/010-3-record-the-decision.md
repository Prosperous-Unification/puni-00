# 010.3 Record the decision: ADR plus service-taxonomy and test-axes OpenSpec changes

| Field                                      | Value                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| Work item                                  | 010.3 in "PUNI platform plan"                                            |
| Size class                                 | DOC                                                                      |
| top-model-high-effort-planning-tokens      | 4000000                                                                  |
| mid-level-mid-effort-implementation-tokens | 3000000                                                                  |
| top-model-high-effort-review-tokens        | 3000000                                                                  |
| Implements                                 | Task 1 of the [rollout plan](../2026-09-19-code-organization-rollout.md) |

## 1. Goal and non-goals

**Goal.** The taxonomy stops being a design document and becomes a recorded decision with testable requirements: one ADR, the glossary terms its requirements use, and two OpenSpec changes that validate.

**Non-goals.** No code, no lint rule, no test, no policy file. The changes are proposed, not archived: their requirements become accepted only when the tasks that implement them have evidence. Nothing is synced into the accepted specifications directory. No test file is renamed and no Nx target is added or changed here. Nothing is staged, committed or branched: this packet ends in a hand-over, as the batch README's execution contract requires.

## 2. Read first

| File                                                                    | Why                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                             | R4: intent at most 400 words, delta specs state testable behaviour, alternatives go in ADRs.                    |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                   | The execution contract, the standard blocks, and the ownership table that puts `CONTEXT.md` in this lane.       |
| `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md`              | Three assumptions took effect here: rule K7, rule T2's level set, and the bracket form of scenario identifiers. |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`         | The source of every rule. Copy rule statements from it; do not rephrase and do not shorten them.                |
| `docs/superpowers/plans/2026-09-19-code-organization-rollout.md`        | Which task implements which rule; both `tasks.md` files reference it.                                           |
| `docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md`   | Its families, its delivery slices B0 to B7, and its open items. Ratchet mode needs an adopted set B0 lacks.     |
| `.agents/skills/domain-modeling/ADR-FORMAT.md`                          | The ADR format: a title and one to three sentences; optional sections only if they earn their place.            |
| `.agents/skills/domain-modeling/CONTEXT-FORMAT.md`                      | The glossary format: tight definitions of what a thing IS, an opinionated `_Avoid_` line, no lists.             |
| `CONTEXT.md`                                                            | The existing **Port**, **Adapter**, **Ring**, **Composition root** and **Service** entries you reconcile.       |
| `docs/adr/0014-ports-live-in-a-framework-free-core-lib.md`              | House style of an accepted architectural ADR with rejected alternatives.                                        |
| `openspec/specs/core-lib-extraction/spec.md`                            | The model: an architectural capability whose first requirement is that every project declares its ring.         |
| `openspec/changes/fifo-heavy-lock`                                      | A small complete change: `proposal.md`, a delta spec, `tasks.md`, `verify.md`.                                  |
| `openspec/config.yaml`                                                  | The global artifact rules: the 400-word intent cap, the required failure-proof table, the glossary rule.        |
| `openspec/schemas/sdd-lean/schema.yaml` and its `templates/`            | The artifact ids and the exact `tasks.md` checkbox format the apply phase parses.                               |
| `tools/tool-devsync/src/adr-index.test.ts`                              | The check that decides your ADR number: numbers must be unique and contiguous from 0001.                        |
| `libs/wbs/application/core/project.json` and its `playwright.config.ts` | The third Playwright suite, which the test level table must classify.                                           |

## 3. Verified facts

Checked in the repository by the planner. The OpenSpec probes ran against a copy of `openspec/` in a throwaway directory; the repository was never modified by one.

### The tree, 2026-09-19

- The highest ADR number is 0028, so the next is 0029. `tools/tool-devsync/src/adr-index.test.ts` asserts that ADR numbers are unique and contiguous from 0001, so a number another lane took first fails that test rather than passing silently. Allocate from the live tree at the moment of writing.
- The repository's default OpenSpec schema is `sdd-lean`. A change has `proposal.md` for intent, delta specs under `specs/<capability>/spec.md`, `tasks.md`, `verify.md`, and `design.md` only when the technical shape is non-trivial.
- `libs/wbs/adapters/store-memory/project.json` runs `src/testing/source-conformance.test.ts` through `test:conformance`, and `test` and `test:unit` both run all of `src`. `libs/wbs/adapters/store-sqlite/project.json` runs `src/testing/source-conformance.db.test.ts` through `test:conformance`, and its `test:unit` excludes `*.db.test.ts` by name. One conformance suite carries the plain unit suffix and the other carries the database suffix, so level cannot be decided by filename suffix alone.
- **There are three Playwright suites, not two.** `git ls-files` finds 36 `.spec.ts` files under `apps/wbs/fe-01/e2e`, one under `apps/wbs/fe-01/e2e-packaged`, and one at `libs/wbs/application/core/testing/portable-composition.spec.ts`. The third is run by `wbs-core:test:portable` through `libs/wbs/application/core/playwright.config.ts`, whose `testDir` is `./testing` and whose `testMatch` is `portable-composition.spec.ts`. A level rule written around the two frontend directories leaves that file unclassified.
- The frontend's fast tier is a list, not a suffix: `apps/wbs/fe-01/vitest.node-suites.ts` exports `NODE_SUITES`, `vitest.node.config.ts` includes exactly that list, and the `test:unit` target runs it.
- `apps/wbs/fe-01/src/components/ui` is the only directory in the frontend that imports a vendor UI library: `@radix-ui/react-dialog` and `class-variance-authority` appear in `button.tsx`, `label.tsx` and `modal.tsx` and nowhere else under `apps/wbs/fe-01/src`. F3's exclusivity holds in the tree today, so the requirement records a fact rather than a wish.
- `CONTEXT.md` has no entry for a service kind. Its **Adapter** entry ends "`Repository` is the SQLite adapter's suffix and means nothing outside that source", which the taxonomy's wider reading of the word contradicts. Its **Service** entry is a WBS directory term: what work is part of. `openspec/config.yaml` requires a term to be resolved in `CONTEXT.md` before an artifact uses it.
- The design's import matrix gives frontend delivery **types** from the contracts library and backend delivery an ordinary import. The two are not the same permission.

### The validator, probed 2026-09-19 and re-probed offline 2026-09-20

- Baseline on both days: `validate --all --json` reported 95 items, 95 passed, 0 failed. With one scratch change added it reported 96 of 96. **That 95 is orientation only. Step 0 records the number on your own clone and every later expectation is relative to it.**
- Removing one `- **WHEN**` bullet from a scenario left the change `"valid": true` with an empty `issues` array. Removing every WHEN and THEN bullet from both of its scenarios: still `"valid": true`, still no issues. The 1.12.0 delta check does not read scenario bodies.
- Removing the sole `#### Scenario:` heading of a requirement that had exactly one produced, verbatim from the JSON on 2026-09-20:

  ```json
  {
    "level": "ERROR",
    "path": "probe-tax/spec.md",
    "message": "ADDED \"A rule in enforce mode SHALL refuse every violation\" must include at least one scenario"
  }
  ```

  with `"valid": false` for that change and totals of 96 items, 95 passed, 1 failed. Restoring the file returned 96 of 96.

- A requirement body written with "may" instead of SHALL validated `"valid": true`. SHALL is the schema's and the configuration's rule, not the validator's; nothing but review catches a permissive body.
- A scenario title beginning with a bracketed identifier, `#### Scenario: [SERVICE-TAXONOMY-001] ...`, validated `"valid": true`. The identifier is part of the title, so nothing has to survive a transformation for it to keep working.
- `new change <name> --schema sdd-lean` creates the directory with exactly one file, `.openspec.yaml`, holding `schema: sdd-lean` and today's `created` date, and its console line reads `Creating change '<name>' with schema 'sdd-lean'`. **Without** the flag the same command writes `sdd-lean` but prints `spec-driven`, which is the planning home's default. Pass the flag, as the batch README requires, and the banner and the file agree.
- `status --change <name> --json` with `design.md` absent reports the `design` artifact as `"status": "ready"` and both `isPlanningComplete` and `isComplete` as `false`, with `intent`, `specs`, `tasks` and `verify` `"done"`. With `design.md` present it reports all five `"done"` and both flags `true`.

### Running OpenSpec with the network off, probed 2026-09-20

This packet cannot be executed without the OpenSpec command line, and the execution contract turns the network off. The launcher pre-installs the command into each attempt's temporary root before dispatch, so `bunx @fission-ai/openspec@1.12.0` works offline. The planner probed what that pre-install has to contain, by pointing the registry at an unreachable address.

- **A complete pre-install works, with no flag.** A `$TMPDIR` holding a fully populated `bunx-<uid>-@fission-ai/openspec@1.12.0` directory ran `--version`, `validate --all --json` and `new change --schema sdd-lean` with the registry unreachable, exit 0 each time. No `--offline` flag and no cache variable were needed.
- **A half-finished one fails, and then stays broken.** A directory warmed by a run that did not complete carried all 53 modules and a `bun.lock` but a `package.json` of `{}`. Every later invocation exited 1 with `error: ConnectionRefused downloading tarball @fission-ai/openspec@1.12.0`, and each failed run rewrote `package.json` back to `{}`, so the state does not heal itself. The working directory's `package.json` names `"@fission-ai/openspec": "1.12.0"`, and that one line is the difference.
- **`BUN_INSTALL_CACHE_DIR` under the attempt's directory does not help.** With it empty, the same invocation exits 1 with `error: ConnectionRefused downloading package manifest @fission-ai/openspec`. The packet sets no cache variable.

So Step 0 checks the pre-install's `package.json` before anything else, and a download attempt is a stop, not something to work around.

**Telemetry is opt-out and would otherwise reach the network.** `dist/telemetry/index.js` sets `POSTHOG_HOST = 'https://edge.openspec.dev'` and `isTelemetryEnabled()` returns true unless `OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`, a CI variable or a global config opt-out is present. Every OpenSpec invocation in this packet therefore carries `OPENSPEC_TELEMETRY=0`, as the batch README's standard blocks require.

### One named test, and the zero-match trap

Bun's `-t` filter matches the describe names and the test title joined, so an anchored pattern of a bare title matches nothing when the test sits inside a `describe`. `tools/tool-devsync/src/adr-index.test.ts` has no `describe`: its only case is a top-level `it('ADR numbers are unique and contiguous from 0001', ...)`, so the joined name is the bare title and the anchored form matches it. Observed on Bun 1.4.2: the anchored pattern printed `1 pass`, `0 fail`, `Ran 1 test across 1 file` and exited 0; a deliberately wrong pattern printed `error: regex "^no such test$" matched 0 tests. Searched 1 file (skipping 1 test)` and exited **1**. The expected count is still stated, and zero matched tests is still a stop, because that exit status is a property of this Bun version and not of the command.

### Rule K7 has no owner

The code organization design's tool table says Twilight Burokrat must check K1 to K9. The Burokrat rules design's Relationships family names only "kind direction K2 to K6; table ownership K8", and no rollout task adds a K7 check. Recording it as checked by review today, with a static check as a named open item, is what both documents together support, and `ASSUMPTIONS.md` records it as an assumption Dany can reopen.

## 4. Unknowns

- Whether a static check can decide K7 at all. A resource-service that opens a unit of work is visible in an import graph; a feature-service that fails to open one is not. Step 5 records the question on the requirement instead of inventing a check.
- Whether Conformance and Architecture tests fall inside T2. This packet excludes them, because a conformance case proves a port contract and an architecture fixture proves a rule, and neither is a scenario. `ASSUMPTIONS.md` records it; stop condition 7 covers a reader who disagrees.
- Whether the level-selection table implies renaming `libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts` so its level is legible from its name. Recorded as an open item owned by rollout Task 5, which names the level targets. This packet renames nothing.
- The exact file size ceiling for F7. Rollout Task 4 measures the distribution and sets it; the requirement states the ratchet, not a number.
- Whether `openspec archive` alters a scenario title when it merges a delta into an accepted specification. The bracket lives in the title, so it is at risk only if archiving rewrites titles, which nothing observed suggests.
- Whether the launcher's pre-install of the OpenSpec command completed in the attempt root the executor is given. Step 0 checks it before anything else; stop condition 1 covers both its absence and a half-finished one.

## 5. File plan

Thirteen paths. Every one is created by this packet; none is staged or committed here.

| File                                                               | Responsibility                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `docs/adr/0029-services-have-a-kind-and-one-direction.md`          | The decision, its rejected alternatives, its accepted cost. Confirm 0029 is still free before writing.   |
| `CONTEXT.md`                                                       | Five new glossary entries and one amended entry, exactly as Step 2 spells them.                          |
| `openspec/changes/service-taxonomy/.openspec.yaml`                 | Written by `new change`. Must read `schema: sdd-lean`.                                                   |
| `openspec/changes/service-taxonomy/proposal.md`                    | Intent, at most 400 words.                                                                               |
| `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md` | K1 to K9, inventory integrity, the composition-root exemption, F1, F2, F3, F7, module layout, the modes. |
| `openspec/changes/service-taxonomy/design.md`                      | Short: links the design, names the two check layers and the three modes.                                 |
| `openspec/changes/service-taxonomy/tasks.md`                       | Tracked checkbox slices in the schema's format, with rollout links under a references heading.           |
| `openspec/changes/service-taxonomy/verify.md`                      | Created once from the schema's template; this task appends only the evidence it actually produced.       |
| `openspec/changes/test-axes/.openspec.yaml`                        | Written by `new change`. Must read `schema: sdd-lean`.                                                   |
| `openspec/changes/test-axes/proposal.md`                           | Intent, at most 400 words.                                                                               |
| `openspec/changes/test-axes/specs/test-axes/spec.md`               | Levels, module location, identifiers, T1, T2, the two ledgers, manual cases.                             |
| `openspec/changes/test-axes/tasks.md`                              | Tracked checkbox slices in the schema's format, with rollout links under a references heading.           |
| `openspec/changes/test-axes/verify.md`                             | Created once from the schema's template; this task appends the reran identifier probe and the counts.    |

No `design.md` is written for `test-axes`. Its consequence is verified and expected: `status --change test-axes --json` reports `design` as `"ready"` and `isPlanningComplete` as `false`.

`openspec/changes/service-taxonomy/verify.md` is created here and appended to by packet 020.8 in wave 2. Leave room: append, never rewrite.

## 6. Interfaces

Names that later tasks rely on. Do not vary them.

```text
ADR title              Services have a kind and one direction
OpenSpec changes       service-taxonomy, test-axes
Capabilities           service-taxonomy, test-axes        (both architectural)
Rule identifiers       K1..K9, F1..F8, T1, T2             (as in the design)
Scenario identifier    [<CAPABILITY>-<NNN>] at the start of the scenario title,
                       capability in upper case with hyphens, three digits, never reused
Test citation          the same bracket at the start of the test title
Glossary terms         Service kind, Repository, Resource-service, Feature-service, Delivery
Commit subject         docs: record the service taxonomy and the test axes
```

Scenario identifiers are allocated, never renumbered. Where a requirement was added late its identifiers sit at the end of its capability's range and out of document order; that is correct and deliberate.

## 7. Steps

Each box is one action. Every command states what success looks like.

**The OpenSpec prefix.** Every OpenSpec command below is written in full as

```text
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 <command>
```

The variable applies to that one command and stops version 1.12.0 posting telemetry and querying the registry. It does not change `$TMPDIR`: every backup, patch and saved output this packet writes goes under the attempt's `$TMPDIR`, which is also where the launcher pre-installed the command.

### Step 0 — Record the baseline before touching anything

Nothing is edited in this step. Its numbers, not the planner's, are what every later comparison uses.

- [ ] Confirm the launcher's pre-install is complete before running anything that depends on it:

```sh
cat "$TMPDIR"/bunx-*-@fission-ai/openspec@1.12.0/package.json
```

Expected: one JSON object naming `"@fission-ai/openspec": "1.12.0"`. If the glob matches nothing, the pre-install did not happen. If the file reads `{}`, an earlier offline run failed and left the directory in a state that re-downloads on every later call and never repairs itself. Either way, stop and report; see stop condition 1.

- [ ] Confirm the tool runs with the network off:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 --version
```

Expected: exit 0 and the single line `1.12.0`. Any `ConnectionRefused`, `downloading tarball` or `downloading package manifest` line means the command tried to reach the registry, which this attempt has no access to. Stop and report; do not retry with a flag or a cache variable, and do not ask for the network. See stop condition 1.

- [ ] Record the validation baseline:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json |
  jq '.summary.totals'
```

Expected: exit 0, `failed` of 0, and a `passed` equal to `items`. **Record that number as B.** The planner saw 95 on 2026-09-19 and again on 2026-09-20; a different number means the revision moved and is not by itself a problem.

- [ ] `git rev-parse HEAD` → record the starting revision. `git status --short` → record it; other lanes' modifications may be present and stay untouched.
- [ ] Confirm the ADR number is free:

```sh
ls docs/adr | tail -1
```

Expected: `0028-k3s-schedules-the-expandable-worker-pool.md`, so 0029 is next. A higher number means another lane took it; stop and report.

- [ ] `mkdir -p "$TMPDIR/evidence"` → the directory every fault patch and failing output goes into.

### Step 1 — Write the ADR

- [ ] Create `docs/adr/0029-services-have-a-kind-and-one-direction.md` with a `status: proposed` frontmatter block, because Dany accepts ADRs. Content, in the format's short style:

  - **Decision.** Every service is one of four kinds: repository, resource-service, feature-service, delivery. Dependencies run one way, delivery to feature to resource to repository, with the pure domain library under all of them. Layering is strict: a feature-service never reaches a repository. No kind imports a sibling of the same kind from another module. The same four kinds apply to the frontend and the backend.
  - **Why.** Uniform rules with no judgment calls suit agent-written code, and a bypass would make a resource's invariants optional.
  - **Considered options.** Relaxed layering, where a feature may reach a repository when the resource-service would only forward: rejected because every exception needs a judgment, and the rule would then be unenforceable by a tool. Vertical slices with no uniform layers: rejected because the repository already has rings, ports and a unit of work that slices would cut across. Package by layer across the whole application: rejected because it hides user value, which is the organizing idea.
  - **Consequences.** Plain create and rename operations take three hops. Dany chose that cost on 2026-09-19. A resource is an aggregate, not a table; table-sized resources would turn the layer into pass-through code.

### Step 2 — Resolve the glossary terms before any artifact uses them

`openspec/config.yaml` requires it and `CONTEXT.md` is this packet's lane. The word "Service" is already a WBS directory term, so the code terms are always written qualified: never write "service" alone for a kind.

- [ ] Amend the existing **Adapter** entry. Replace exactly this text:

  ```md
  **Adapter**:
  A concrete thing that satisfies a port: a drizzle repository, an in-memory store, the Elysia
  mount, the browser digest. `Repository` is the SQLite adapter's suffix and means nothing
  outside that source.
  _Avoid_: implementation (when the seam is the topic), driver, provider
  ```

  with exactly this text:

  ```md
  **Adapter**:
  A concrete thing that satisfies a port: a drizzle repository, an in-memory store, the Elysia
  mount, the browser digest. `Repository` is the SQLite adapter's filename suffix; as a service
  kind the same word names a port and its adapter together.
  _Avoid_: implementation (when the seam is the topic), driver, provider
  ```

- [ ] Add these five entries at the end of the `### Architecture` section, immediately after the **Composition root** entry and immediately before the `### Deployment` heading:

  ```md
  **Service kind**:
  Which of four roles a service file plays — repository, resource-service, feature-service or
  delivery — declared by its filename suffix or by a classification entry, and fixing the one
  direction it may import in. ADR 0029.
  _Avoid_: layer, stereotype, tier, category

  **Repository**:
  The kind that reaches one external thing — a table store, a third-party API, browser storage,
  a socket — and holds no decisions. A pair: the port core owns and the adapter that satisfies
  it, so depending on a repository means depending on the port.
  _Avoid_: DAO, data layer, store (alone)

  **Resource-service**:
  The kind that holds the quirks and invariants of one resource, an aggregate named after one
  glossary term. It imports repository ports and the domain library, never a feature-service.
  _Avoid_: service (alone — that is the directory term), manager, store service

  **Feature-service**:
  The kind that delivers one piece of user-facing value by coordinating resource-services, named
  after one requirement group of one capability. It owns the transaction and never reaches a
  repository.
  _Avoid_: service (alone — that is the directory term), use case, orchestrator

  **Delivery**:
  The kind at the edge people or machines touch — a controller, a tool handler, a component and
  its hooks. It holds no policy and imports feature-services only.
  _Avoid_: presentation, UI layer, endpoint (that is a bound route)
  ```

- [ ] Add no other term. Packet 010.4 proposes five terms of its own for the rule model; `ASSUMPTIONS.md` records that their glossary entries are deferred to a documentation task of their own. Adding them here would take that decision for another lane.

### Step 3 — Create the first change

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 \
  new change service-taxonomy --schema sdd-lean
grep -n "schema: sdd-lean" openspec/changes/service-taxonomy/.openspec.yaml
```

Expected: the first command prints `Creating change 'service-taxonomy' with schema 'sdd-lean'` and creates a directory holding `.openspec.yaml` alone; the second prints exactly one line. If it prints nothing, stop.

- [ ] Read the real instructions before writing the artifact:

```sh
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 \
  instructions intent --change service-taxonomy --json
```

Expected: exit 0 and a JSON object whose `schemaName` is `sdd-lean`.

### Step 4 — Write its intent

- [ ] Write `proposal.md`: problem, outcome, non-goals, constraints, taken from the design's Intent section. `## Why` must be 50 to 1000 characters. Name `service-taxonomy` under `### New Capabilities` and say in one line that it is architectural. List the five glossary terms and the amended **Adapter** under `## Domain Terms`, by name only.
- [ ] `wc -w openspec/changes/service-taxonomy/proposal.md` → expected below 400. The limit applies to this proposal alone. The count is appended to `verify.md` in Step 10.

### Step 5 — Write its delta spec

Start with `## ADDED Requirements`. Every requirement body uses SHALL or MUST and never "may" or "should"; the validator does not catch a permissive body, so this is on you. One requirement per row. Each scenario is `#### Scenario: [SERVICE-TAXONOMY-NNN] <title>` with bold GIVEN, WHEN and THEN bullets. Carry the full statement from the design: a forbidden import alone is not the rule.

| Identifiers   | Requirement body, in full                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Scenarios                                                                                                                                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001, 002, 003 | K1. Every service file SHALL declare exactly one kind, by its filename suffix or by an entry in the classification file, and SHALL NOT carry both.                                                                                                                                                                                                                                                                                                                                            | 001 a file with neither fails, naming the path. 002 a file with a suffix and an entry fails, naming the path. 003 a file with one suffix and no entry passes.                                                                                                                                |
| 004, 005, 006 | K2. Delivery SHALL import feature-services, the domain library and its own delivery files. Backend delivery SHALL import the contracts library; frontend delivery SHALL import only types from it. Neither SHALL import a resource-service, a repository port or a repository adapter. The React permission SHALL be stated in both directions and never with "may": frontend delivery SHALL be allowed to import React, and backend delivery SHALL NOT import it.                            | 004 a component importing a resource-service fails. 005 a component importing a feature-service, the domain library, contracts types and React passes. 006 a component importing a runtime value from the contracts library fails, and a backend controller importing the same value passes. |
| 007, 008, 009 | K3. A feature-service SHALL import resource-services, the domain library and the contracts library, and SHALL NOT import a repository port or adapter, a feature-service of another module, delivery, React or a vendor UI library. Layering is strict: there is no exception for a resource-service that would only forward.                                                                                                                                                                 | 007 a feature-service importing a repository port fails. 008 a feature-service importing a resource-service, the domain library and the contracts library passes. 009 the same forbidden import reached through a barrel passes lint and fails the graph check.                              |
| 010, 011, 012 | K4. A resource-service SHALL import repository ports, the domain library and the contracts library, and SHALL NOT import a feature-service, a resource-service of another module, delivery, React or a vendor UI library.                                                                                                                                                                                                                                                                     | 010 a resource-service importing a feature-service fails. 011 a resource-service importing a repository port and the domain library passes. 012 a resource-service importing delivery fails.                                                                                                 |
| 013, 014      | K5. A repository adapter SHALL import the domain library, the contracts library and the port it implements, and SHALL import nothing above it: no resource-service, no feature-service, no delivery, no React, no vendor UI library.                                                                                                                                                                                                                                                          | 013 a repository adapter importing a resource-service fails. 014 a repository adapter importing its port and the domain library passes.                                                                                                                                                      |
| 015, 016      | K6. No kind SHALL import a sibling of the same kind from another module. Sideways work SHALL go through a published event.                                                                                                                                                                                                                                                                                                                                                                    | 015 a feature-service importing another module's feature-service fails. 016 two files of one kind inside one module pass.                                                                                                                                                                    |
| 017, 018      | The composition root exemption. A composition root SHALL be exempt from K2 to K6, because it installs modules and supplies adapters, and SHALL contain wiring only and no policy.                                                                                                                                                                                                                                                                                                             | 017 a composition root importing every kind passes. 018 a file claiming the exemption while holding a branch on domain state is reported.                                                                                                                                                    |
| 019, 020      | K7. The feature-service SHALL own the transaction. A resource-service SHALL NOT open a unit of work; it is built over the admitted stores. Until a static check for this rule exists, conformance SHALL be judged by review, and the requirement SHALL name review as its check.                                                                                                                                                                                                              | 019 a resource-service that opens a unit of work is refused in review, and the requirement states plainly that review is the check today. 020 a feature-service that opens the unit of work and calls two resource-services inside it passes.                                                |
| 021, 022      | K8. Each table SHALL belong to exactly one resource module, proved from the migration facts the wiki tool already extracts.                                                                                                                                                                                                                                                                                                                                                                   | 021 a table claimed by two modules fails, naming both. 022 a table claimed by none fails, naming the table.                                                                                                                                                                                  |
| 023, 024      | K9. A feature-service SHALL name the one capability it serves and a resource-service SHALL name the one glossary term it is named after, both machine-readably.                                                                                                                                                                                                                                                                                                                               | 023 a feature-service with no capability fails. 024 a resource-service whose term is absent from the glossary fails, naming the term.                                                                                                                                                        |
| 042 to 045    | **Inventory integrity, enforced in every mode.** The classification record SHALL be complete and current independently of any rule's mode: a candidate service file with neither a kind suffix nor an entry SHALL fail; an entry naming no existing file SHALL fail; a file carrying both a suffix and an entry SHALL fail; and an absent, unreadable or malformed classification file SHALL fail. These are checks on the record, not on the code, and observe mode SHALL NOT suppress them. | 042 an unclassified candidate fails while every taxonomy rule is in observe mode. 043 a stale entry naming no existing file fails. 044 an absent classification file and an unreadable one each fail, and the two are distinguished. 045 a malformed entry fails, naming the entry.          |
| 025, 026, 027 | F1. Feature-services, resource-services, stores and geometry SHALL be plain TypeScript: none of them SHALL import React or a React package.                                                                                                                                                                                                                                                                                                                                                   | 025 a service file importing React fails. 026 a store module or a geometry module importing React fails. 027 a component importing React passes.                                                                                                                                             |
| 028           | F2. Every stateful service SHALL expose one store contract: a subscribe function and a snapshot that is stable until something changed.                                                                                                                                                                                                                                                                                                                                                       | 028 a snapshot whose identity changes with no state change fails its unit test.                                                                                                                                                                                                              |
| 029, 030, 031 | F3. Features SHALL import UI only from the application's own primitives layer, and only that layer SHALL import a vendor UI library or a web component.                                                                                                                                                                                                                                                                                                                                       | 029 a feature importing a vendor UI library fails. 030 a file outside the primitives layer importing a vendor UI library fails, whatever its kind. 031 the primitives layer importing a vendor UI library passes.                                                                            |
| 032, 033      | F7. A production source file SHALL NOT grow past the size ceiling, and a file already above the ceiling SHALL only shrink.                                                                                                                                                                                                                                                                                                                                                                    | 032 an unlisted file over the ceiling fails, naming the file and both numbers. 033 a listed file that grew fails, naming both numbers.                                                                                                                                                       |
| 034, 035, 036 | The module layout. A module SHALL have the layout the design names, SHALL be exactly one DI Bag module and exactly one wiki module, and SHALL NOT span runtimes.                                                                                                                                                                                                                                                                                                                              | 034 a module directory with no contract file fails. 035 a module index naming a second module's files fails. 036 a module whose files install into two runtimes' bags fails.                                                                                                                 |
| 037           | Observe mode. A rule in observe mode SHALL report every taxonomy violation as debt and SHALL NOT fail a candidate. Observe mode governs the taxonomy rules only; the inventory integrity requirement above is outside it and fails in every mode.                                                                                                                                                                                                                                             | 037 a file of the wrong kind, or importing across a layer, is reported as debt in observe mode and the candidate is allowed, in the same run in which an unclassified file fails.                                                                                                            |
| 038, 039, 040 | Ratchet mode. A rule in ratchet mode SHALL refuse a violation introduced by new or touched code, SHALL refuse a regression inside a module in the adopted set, and SHALL report a pre-existing violation outside the adopted set as debt without refusing.                                                                                                                                                                                                                                    | 038 a new violating import in a touched file refuses. 039 a module in the adopted set that gains a violation refuses, naming the module. 040 an untouched pre-existing violation outside the adopted set is reported as debt and the candidate is allowed.                                   |
| 041           | Enforce mode. A rule in enforce mode SHALL refuse every violation across the declared coverage.                                                                                                                                                                                                                                                                                                                                                                                               | 041 a pre-existing violation that ratchet reported as debt refuses under enforce.                                                                                                                                                                                                            |

- [ ] Requirement 041 is written with **exactly one** scenario. Section 8's negative proof depends on that.
- [ ] In the ratchet requirement's body, state that the adopted set is policy supplied by the consumer, and that Twilight Burokrat slice B0 has no adopted set and refuses the `ratchet` mode by name until slice B2, as that design's open items record.
- [ ] Requirements 004 to 016 reference the design's import matrix by name in their bodies and say that the matrix, not the scenario list, is the complete statement.
- [ ] The inventory integrity requirement is the one packet 020.8 reads before it starts. It must say plainly that a failing inventory check is compatible with observe mode, because the two would otherwise contradict each other and 020.8 stops.

### Step 6 — Write `service-taxonomy/design.md`

- [ ] Under one page: link the code organization design, state the two check layers — fast lint inside a file, and the authoritative file-level import graph in Twilight Burokrat that sees through barrels and aliases — and state the three modes and where their policy lives.

### Step 7 — Write `service-taxonomy/tasks.md`

Only `- [ ]` lines are tracked; a link-only list is untracked and the apply phase cannot read it. Every slice names the test that proves it, and every slice that adds a check names the negative too. Rollout tasks are references, not slices. Write the file exactly as below; the reference links are relative to `openspec/changes/service-taxonomy/`, where `../../../` is the repository root.

```md
## 1. The decision

- [ ] 1.1 Record ADR 0029, this delta spec and the five glossary terms — test: `bun test tools/tool-devsync/src/adr-index.test.ts -t '^ADR numbers are unique and contiguous from 0001$'`; negative: remove the sole scenario heading of SERVICE-TAXONOMY-041 and watch strict OpenSpec validation report `must include at least one scenario`, then restore it

## 2. Classification, observe mode (needs 1.1)

- [ ] 2.1 Classify every existing service file and its capability, term or disposition; implements K1, K9 and inventory integrity — test: the inventory test in `tools/tool-devsync/src/service-kinds.test.ts`; negative: delete one entry, and separately point an entry at a path that does not exist, and separately remove the classification file altogether

## 3. Checks that can fail (needs 1.1)

- [ ] 3.1 Add the direction fences to `apps/wbs/eslint.product.mjs`; implements F1, K2, K3, K4 — test: `tools/tool-devsync/src/kind-direction.test.ts`; negative: remove each pattern in turn and watch its case fail
- [ ] 3.2 Add the file size ratchet; implements F7 — test: `tools/tool-devsync/src/size-ceilings.test.ts`; negative: grow a pinned file through the test's fixture path, and add an unlisted file over the ceiling
- [ ] 3.3 Add the primitives fence; implements F3 — test: the F3 case beside `kind-direction.test.ts`, added with the first extracted frontend module; negative: import a vendor UI library from a feature file and from a file outside `apps/wbs/fe-01/src/components/ui`

## 4. Modules (needs 2.1 and 3.1)

- [ ] 4.1 Extract the frontend services into modules; implements F2 and the module layout — test: each source hook's existing tests, unedited, plus each module's isolated type check
- [ ] 4.2 Split the backend core's services into modules; implements K1, K6, K8 — test: the core's tests and both store conformance targets
- [ ] 4.3 Make each module one sealed, labelled DI Bag module; implements the "exactly one DI Bag module" half of the module layout — test: each module's `check.ts` installing the module with typed fixtures; negative: remove a required key from a module's contract and watch the install fail

## 5. Handover (needs 2.1, 3.1, 3.2 and 4.3)

- [ ] 5.1 Move the inventory, the ratchet and the direction rules into Twilight Burokrat's policy and supply the adopted set that ratchet mode needs; implements K2 to K6, K8 and all three modes — test: the Burokrat's own rule tests; negative: one violating fixture per rule, watched failing before the rule is enabled

## References

Slices map onto the [rollout plan](../../../docs/superpowers/plans/2026-09-19-code-organization-rollout.md): 1.1 is its Task 1, 2.1 its Task 2, 3.1 its Task 3, 3.2 its Task 4, 4.1 its Task 6, 4.2 its Task 7, 4.3 its Task 8, and 5.1 its Task 9. Slice 4.3 is owned by the [package adoption plan](../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md), which must be amended first. Slice 5.1 is slice B2 of the [Twilight Burokrat rules design](../../../docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md).
```

- [ ] Confirm each link resolves before moving on:

```sh
(cd openspec/changes/service-taxonomy && ls ../../../docs/superpowers/plans/2026-09-19-code-organization-rollout.md ../../../docs/superpowers/plans/2026-09-17-personal-package-adoption.md ../../../docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md)
```

Expected: three paths printed, exit 0. Anything else means a link is wrong; fix it before the validation step.

### Step 8 — Create `test-axes` and write its delta spec

- [ ] Create it exactly as Step 3 did, with `--schema sdd-lean` and the metadata check. Write its intent as Step 4 did. **No `design.md`.**
- [ ] Write the delta spec, same rules about full statements and SHALL bodies:

| Identifiers        | Requirement body, in full                                                                                                                                                                                                                                                                                                                                                                                     | Scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001, 002, 003, 024 | Every test file SHALL have exactly one level, selected by the first matching rule of the level-selection table below. The table, not any single suffix, SHALL be the statement of the rule.                                                                                                                                                                                                                   | 001 a file matching no rule fails, naming the file. 002 `libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts` resolves to Conformance although its suffix is the plain one. 003 `libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts` resolves to Conformance although its suffix is the database one. 024 `libs/wbs/application/core/testing/portable-composition.spec.ts` resolves to Browser through its Playwright configuration, not through a directory name. |
| 004, 005           | Each level SHALL be runnable alone through one Nx target. An existing aggregate target SHALL NOT be renamed or removed, and SHALL be exempt from the isolation rule as long as it is declared as an aggregate.                                                                                                                                                                                                | 004 a target declared for one level that also runs a file of another level fails, naming the file and both levels. 005 a target declared as an aggregate that runs two levels passes, and an undeclared target that does fails.                                                                                                                                                                                                                                                                            |
| 006                | A test SHALL live inside the module it tests, resolved from the module index.                                                                                                                                                                                                                                                                                                                                 | 006 a test outside any module's membership is reported, naming the file.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 007, 008           | Every OpenSpec scenario SHALL carry a stable identifier in square brackets at the start of its title.                                                                                                                                                                                                                                                                                                         | 007 a scenario with no identifier fails, naming the requirement. 008 a renamed scenario keeps its identifier.                                                                                                                                                                                                                                                                                                                                                                                              |
| 009, 010, 025      | Twilight Burokrat SHALL allocate every scenario identifier and SHALL record a predecessor when a scenario is renamed or split, the way ADR 0020 treats module identities. Before allocator provenance is enforced, the allocator SHALL import the identifiers that already exist in the repository and reserve them unchanged, so no hand-written identifier in an earlier change is invalidated or reissued. | 009 a hand-written identifier that the allocator neither issued nor imported fails. 010 a scenario split into two keeps the original as the predecessor of both. 025 the identifiers of the `service-taxonomy` and `test-axes` changes are imported and reserved unchanged, and remain valid after enforcement begins.                                                                                                                                                                                     |
| 011                | An identifier SHALL never be reused.                                                                                                                                                                                                                                                                                                                                                                          | 011 allocating an identifier that a removed scenario once held fails, naming the removed scenario.                                                                                                                                                                                                                                                                                                                                                                                                         |
| 012                | T1. The scenario-citation check SHALL accept a unit test that cites no scenario.                                                                                                                                                                                                                                                                                                                              | 012 a unit test with no citation passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 013, 014           | T2. A test at the API, View, Browser, Performance or Manual level SHALL cite a scenario in its title. Conformance and Architecture tests are outside T2, because a conformance case proves a port contract and an architecture fixture proves a rule, and neither is a scenario.                                                                                                                              | 013 an uncited browser test fails in enforce mode. 014 the same test is reported as debt in observe mode.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 015, 016           | Scenario coverage. Every scenario SHALL have a test at its lowest sufficient level, or an explicit disposition. A disposition SHALL be either manual or inapplicable with a recorded reason, and SHALL NOT be anything else.                                                                                                                                                                                  | 015 an uncovered scenario fails, naming it, and passing totals elsewhere do not cover it. 016 a disposition that is neither manual nor a reasoned inapplicability fails, naming the scenario.                                                                                                                                                                                                                                                                                                              |
| 017                | Structural coverage. Every module SHALL have the test levels its kinds require, as the design's table states them.                                                                                                                                                                                                                                                                                            | 017 a repository adapter with no conformance test fails, naming the module.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 018                | Every capability SHALL have at least one browser or manual scenario that passes through its whole chain, from delivery to the store.                                                                                                                                                                                                                                                                          | 018 a capability whose only tests stop at the feature-service fails, naming the capability.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 019, 020           | A manual case SHALL be a scenario with a manual disposition carrying a reviewed reason why it cannot be automated and a steps file.                                                                                                                                                                                                                                                                           | 019 a manual disposition with no reason fails. 020 a manual disposition with no steps file fails.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 021, 022           | Every manual run SHALL produce a report bound to an environment observation and to a source revision, and the report SHALL go stale when the scenario changes or when a module it touches changes.                                                                                                                                                                                                            | 021 a report naming no environment observation or no source revision is refused. 022 a report older than the scenario's last change is stale, and so is one older than a touched module's change.                                                                                                                                                                                                                                                                                                          |
| 023                | A manual disposition SHALL be reviewed again on a schedule and SHALL become a refusal when its review is overdue, so the manual level does not become a place to avoid writing tests.                                                                                                                                                                                                                         | 023 a manual disposition whose review date has passed refuses, naming the scenario and the date.                                                                                                                                                                                                                                                                                                                                                                                                           |

- [ ] Requirement 023 is written with **exactly one** scenario. Section 8's second negative proof depends on that.
- [ ] The level-selection table goes in the body of requirement 001, in this precedence order. Every row names something that exists today.

| Order | The file                                                                                                                                                                                                                                                           | Level        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1     | A manual procedure file declared by a scenario's manual disposition                                                                                                                                                                                                | Manual       |
| 2     | Named by a project's `test:conformance` target                                                                                                                                                                                                                     | Conformance  |
| 3     | Declared in the policy as a rule's own negative fixture                                                                                                                                                                                                            | Architecture |
| 4     | A member of a declared Playwright suite, and carrying declared thresholds                                                                                                                                                                                          | Performance  |
| 5     | A member of a declared Playwright suite: today the three configurations `apps/wbs/fe-01/playwright.config.ts`, `apps/wbs/fe-01/playwright.packaged.config.ts` and `libs/wbs/application/core/playwright.config.ts`, each through its own `testDir` and `testMatch` | Browser      |
| 6     | Ending `.db.test.ts`                                                                                                                                                                                                                                               | API          |
| 7     | Listed in `apps/wbs/fe-01/vitest.node-suites.ts`                                                                                                                                                                                                                   | Unit         |
| 8     | Under `apps/wbs/fe-01/src`, ending `.test.tsx` or `.test.ts` and not in that list                                                                                                                                                                                  | View         |
| 9     | Ending `.test.tsx` anywhere else                                                                                                                                                                                                                                   | View         |
| 10    | Ending `.test.ts` anywhere else                                                                                                                                                                                                                                    | Unit         |

Browser membership is read from the Playwright configurations, never from a directory name, because one browser suite lives at `libs/wbs/application/core/testing/portable-composition.spec.ts` and no frontend directory contains it.

- [ ] State in the same requirement body that this task renames nothing and changes no target, and that whether `source-conformance.test.ts` should gain a distinguishing suffix is an open item owned by rollout Task 5, which is the task that names the level targets. Record it in `verify.md`.

### Step 9 — Write `test-axes/tasks.md`

Same tracked format. The allocator is a prerequisite, not an afterthought: slice B3 of the Burokrat rules design delivers the OpenSpec requirement selector and scenario identifiers, and its slice B4 already depends on B3.

```md
## 1. The contract

- [ ] 1.1 Record this delta spec, its level-selection table and its identifier rules — test: strict OpenSpec validation reporting zero failures; negative: remove the sole scenario heading of TEST-AXES-023 and watch it report `must include at least one scenario`, then restore it

## 2. Levels and identifiers (needs 1.1)

- [ ] 2.1 Add one Nx target per level without renaming or removing an existing target, and make every runner write a JUnit report; implements the level and target requirements — test: run each level target and confirm it collects only that level's files; negative: add an existing Conformance file, which rule 2 of the level table keeps classified as Conformance, to a target declared for the API level alone, and watch the isolation assertion fail naming that file and both levels; restore the target
- [ ] 2.2 Deliver the scenario identifier allocator with predecessor support, then allocate the identifiers of one capability end to end, cite them in its existing tests and produce the first coverage table by hand; implements the identifier requirements — test: the join from the JUnit reports to that capability's scenarios; negative: remove one citation and watch the scenario show as uncovered (needs slice B3 of the rules design, which also imports and reserves the identifiers this change already wrote by hand)

## 3. The ledgers (needs 2.1 and 2.2)

- [ ] 3.1 Compute both coverage ledgers in Twilight Burokrat and enforce T2; implements T1, T2, both coverage requirements, the capability chain and the manual case requirements — test: the Burokrat's ledger tests; negative: remove a citation from an API-level test, and separately give a scenario a disposition that is neither manual nor a reasoned inapplicability (needs slice B4, which the rules design makes depend on B3)

## References

1.1 is Task 1 of the [rollout plan](../../../docs/superpowers/plans/2026-09-19-code-organization-rollout.md), 2.1 and 2.2 are its Task 5, and 3.1 is its Task 9. The allocator in 2.2 is slice B3 of the [Twilight Burokrat rules design](../../../docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md), and the ledgers in 3.1 are its slice B4, which that design makes depend on B3.
```

- [ ] Confirm the two links resolve, the way Step 7 did, from `openspec/changes/test-axes`.

### Step 10 — Create each `verify.md` once and append only observed output

Do not write a record twice and do not copy a claim from this packet as if it were fresh.

- [ ] Create each from the schema's template. Then append, to each:
  - The word count of its own `proposal.md`, as the actual `wc -w` line, with the 400-word limit stated beside it.
  - The failure-proof table `openspec/config.yaml` requires, with the row from section 8 filled in from what you watched, including the path of the saved patch under `$TMPDIR/evidence`.
  - Step 0's baseline B and the final count.
- [ ] In `test-axes/verify.md` only, record the scenario identifier probe. The planner's probe is inherited evidence: either label it "inherited from the 010.3 planning probe, 2026-09-19 and 2026-09-20, not rerun here", or rerun it in a copy of `openspec/` under `$TMPDIR` and paste your own output. Then record the decision and its reason: the bracket form, because it is visible in rendered documents, matches the test title convention exactly, and lives in the title rather than in a comment that a transformation could drop. Settling this closes open item 1 of the code organization design.
- [ ] Record the conformance-file-suffix open item from Step 8, with rollout Task 5 named as its owner.

### Step 11 — Format the owned files

```sh
bunx prettier --write docs/adr/0029-services-have-a-kind-and-one-direction.md CONTEXT.md openspec/changes/service-taxonomy/proposal.md openspec/changes/service-taxonomy/design.md openspec/changes/service-taxonomy/tasks.md openspec/changes/service-taxonomy/verify.md openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md openspec/changes/test-axes/proposal.md openspec/changes/test-axes/tasks.md openspec/changes/test-axes/verify.md openspec/changes/test-axes/specs/test-axes/spec.md
```

Expected: each path printed with a time. Never run a repository-wide format write; it rewrites other lanes' files.

### Step 12 — Hand over, do not commit

The clone's Git directory is read-only. There is nothing to stage and nothing to commit.

- [ ] `git status --short` → expect exactly the thirteen paths of section 5 as modified or untracked, plus whatever other lanes already had in the tree, which stays untouched. Record the list.
- [ ] Report, under "Ready to commit": the thirteen paths and the subject `docs: record the service taxonomy and the test axes`, with a body carrying Step 0's baseline B, the final validation count, and both negative proofs with the exact failure line seen.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.
- [ ] Do **not** run `bin/h2puni-gate.sh`. Say in the report that the host gate was not run and why.

## 8. Negative proofs

This task adds no executable check, so its proof is that the artifacts it writes can be rejected. The fault must be one the validator actually catches, and the evidence must be a file, not a sentence.

**Restore discipline, for both proofs.** Nothing is restored from Git.

```sh
mkdir -p "$TMPDIR/evidence"
cp openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md \
   "$TMPDIR/service-taxonomy-spec.passing"
# ... inject the fault ...
diff -u "$TMPDIR/service-taxonomy-spec.passing" \
        openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md \
   > "$TMPDIR/evidence/proof-1-fault.patch"
test -s "$TMPDIR/evidence/proof-1-fault.patch"
# ... run the validator, saving its output to $TMPDIR/evidence/proof-1-failing.json ...
cp "$TMPDIR/service-taxonomy-spec.passing" \
   openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md
cmp "$TMPDIR/service-taxonomy-spec.passing" \
    openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md
```

`diff -u` exits 1 because the files differ; that status is not masked, it is replaced by the explicit `test -s` assertion on the patch it wrote, which exits 0 only if a mutation really landed. `cmp` exits 0 only if the restore is byte-exact.

### Proof 1 — the service-taxonomy delta spec can be rejected

- **Fault.** Delete the single `#### Scenario:` heading line of requirement SERVICE-TAXONOMY-041, leaving its bullets in place. That requirement is written with exactly one scenario for this purpose.
- **Command.** `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`, saved to `$TMPDIR/evidence/proof-1-failing.json`.
- **Expected.** The `service-taxonomy` item is `"valid": false` with one issue: `"level": "ERROR"`, `"path": "service-taxonomy/spec.md"`, and a message of the form `ADDED "<requirement name>" must include at least one scenario`. Totals: `failed` of 1 and `passed` of **B+1**, where B is Step 0's number.
- **Restore.** Copy the saved bytes back, `cmp`, rerun. Expected: `failed` of 0 and `passed` of **B+2**.

### Proof 2 — the test-axes delta spec can be rejected

- **Fault.** The same deletion on TEST-AXES-023, also written with exactly one scenario, with its own `$TMPDIR` backup, patch and saved output.
- **Expected.** `path` of `test-axes/spec.md`, the same message form, `failed` of 1 and `passed` of **B+1**; after the restore, `failed` of 0 and `passed` of **B+2**.

### What these do not prove, and when to stop

- They do not prove that WHEN and THEN clauses are checked. They are not: removing every WHEN and THEN bullet from a scenario left the change valid with zero issues in the planning probe. Do not claim otherwise in either record.
- If the injected fault leaves the change valid, the proof has failed, not succeeded. Restore, record the output, and stop; do not go looking for a different fault.

## 9. OpenSpec

This task is the OpenSpec work. Both capabilities are architectural; say so in each specification's purpose line and in each proposal, because only a user-facing capability may own a feature-service.

## 10. Verification

Every command states its expected result. Anything else is a stop condition.

### What the executor runs

| Command                                                                                                    | Expected                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wc -w openspec/changes/service-taxonomy/proposal.md`                                                      | Below 400. The limit applies to this proposal alone.                                                                                                                                                                                       |
| `wc -w openspec/changes/test-axes/proposal.md`                                                             | Below 400, on its own.                                                                                                                                                                                                                     |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 status --change service-taxonomy --json`            | All five artifacts `"done"`; `isPlanningComplete` and `isComplete` both `true`.                                                                                                                                                            |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 status --change test-axes --json`                   | `intent`, `specs`, `tasks`, `verify` `"done"`; `design` `"ready"`; both flags `false`. That is correct for a change with no `design.md`, not a failure.                                                                                    |
| The validation block below                                                                                 | One JSON report, the block exits 0, and `summary.totals.passed` equals **B+2** with `failed` of 0.                                                                                                                                         |
| `bun test tools/tool-devsync/src/adr-index.test.ts -t '^ADR numbers are unique and contiguous from 0001$'` | Exit 0, `1 pass`, `0 fail`, `Ran 1 test across 1 file`. **Exactly one test must run.** `error: regex ... matched 0 tests` is a stop, never a pass. This is the check that proves the new ADR number; it is one file, not the whole target. |
| `NX_DAEMON=false bunx nx format:check --all`                                                               | Exit 0, or failures naming only files outside this packet's thirteen, which are reported and left alone. Run it after Step 11, never a repository-wide write.                                                                              |

The validation block is the batch README's, unchanged, with one predicate added after it. `mktemp` writes under the attempt's `$TMPDIR`:

```sh
set -euo pipefail
report="$(mktemp)"
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -e --argjson baseline "$B" '.summary.totals.passed == ($baseline + 2)' "$report" >/dev/null
rm -f -- "$report"
```

Substitute Step 0's recorded number for `$B`. The second predicate is the count check the first one deliberately does not make: the block's `passed > 0` accepts any total, and this packet adds exactly two items.

### What the planner runs afterwards, and the executor reports as pending

| Command                                          | Why the executor cannot run it                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `git add` of the thirteen paths, then the commit | The clone's Git directory is read-only here.                                                                      |
| `NX_DAEMON=false bunx nx run tool-devsync:test`  | Its namespacing test runs the wiki index checker over the working tree, which writes Git objects into this clone. |
| `bin/h2puni-gate.sh <sha>`                       | The host gate cannot run on this machine.                                                                         |

Every one of these is listed in the report under "Not verified" as pending planner verification.

**What none of it proves.** Validation proves structure only. It does not prove the requirements are complete, that any rule is enforced, that a scenario body says anything, or that any classification is right. The implementing tasks prove those, and 020.8 is the first of them.

## 11. Stop conditions

1. Step 0's pre-install check fails: the `bunx-*-@fission-ai` glob matches nothing, its `package.json` reads `{}`, or `--version` does not print `1.12.0` and instead mentions a tarball, a manifest or a refused connection. The launcher's pre-install did not take, and nothing this packet does can repair it: a failed offline run rewrites that `package.json` to `{}`, so retrying makes it worse. Stop and report so the planner re-warms the attempt root.
2. A named test run reports `matched 0 tests`. The filter selected nothing and the exit status is not evidence of anything. Stop and report the pattern.
3. A rule in the design is ambiguous enough that two honest readers would write different requirements. Report the rule and both readings rather than choosing.
4. An injected fault of section 8 leaves the change valid, or fails a different change than the one mutated.
5. Validation refuses the bracket form although the planning probe accepted it.
6. Another lane has taken ADR 0029 or created a change with one of these names.
7. You read the design as putting Conformance or Architecture tests inside T2's "API level or above", or as letting observe mode suppress an inventory failure. Report the reading; do not change the requirement alone. Packet 020.8 stops if the inventory distinction is absent, so a wrong call here blocks wave 2.
8. A requirement as written would be weaker than the design's statement of the same rule, and you cannot see how to carry the whole statement. Report the gap.
9. `summary.totals.passed` is not B+2 after both changes are written, or not B+1 during a fault. A different number means another lane's change entered the tree; stop rather than adjusting the expectation.
10. Any step seems to need `git add`, `git commit`, the whole `tool-devsync:test` target or the host gate. None can run here; Step 12 and section 10 say what to do instead.
11. Any command in section 10 fails for a reason outside this packet's thirteen files. Report it; never repair another lane's tree and never rerun with a check removed.

## 12. Out of lane

Everything outside the thirteen paths of section 5. In particular:

| Path or thing                                            | Why not                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `openspec/specs/`                                        | Nothing is archived or synced in this task.                                          |
| Any Nx project file, test file or lint configuration     | The level targets belong to rollout Task 5; the fences to Task 3.                    |
| `tools/tool-devsync/project.json`                        | Packet 020.8 owns it.                                                                |
| The five rule-model glossary terms packet 010.4 proposes | `ASSUMPTIONS.md` defers their glossary entries to a documentation task of their own. |
| `docs/superpowers/specs/` and `docs/superpowers/plans/`  | The source designs are read, never corrected here. A defect in one is reported.      |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`    | The ownership table is the planner's.                                                |

## 13. Dispatch boundary

Dispatch this documentation packet as one slice named `whole`. Execute Steps 0–10, format with Step 11, run both negative proofs in section 8, and run the executor checks in section 10. Append the observed evidence to both verification records, format the owned files again, and rerun the format check and strict validation before Step 12.

Step 12 is the sole checkpoint: stop and report for planner review and commit. There is no intermediate checkpoint after Step 5.

If execution ends early, report PARTIAL with the missing artifacts, proofs and checks identified. Do not describe `service-taxonomy` as complete or ready for packet 020.8 until its artifacts and proof have been reviewed and committed.

## Review disposition

### First review, 2026-09-19 (Codex gpt-6-astra, high effort)

All eleven findings were correct and all eleven were fixed in revision 2. The second review confirmed seven as fixed and four as partly fixed; those four are carried below. The evidence for the original eleven is in revision 2's disposition and is not repeated.

### Second review, 2026-09-19 (Codex gpt-6-astra, high effort): READY AFTER FIXES

| Finding                                                  | Disposition   | Evidence and what changed                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — section 8's count contradicts section 10    | Fixed         | Confirmed: the old text said "one higher than 95" while section 10 expected 97. Both are gone. Step 0 records B, section 8 expects B+1 during a fault and B+2 after the restore, and section 10 adds a `jq` predicate asserting B+2. Stop condition 8 covers a different number.                                                                                                                                                                                     |
| Important 1 — K2 contradicts the import matrix           | Fixed         | Confirmed in the design's matrix: frontend delivery gets contracts **types**, backend delivery an ordinary import. Requirement 004 to 006 now splits them and scenario 006 refuses a frontend runtime import of the contracts library while passing the same import in a backend controller.                                                                                                                                                                         |
| Important 2 — a browser suite matches no row             | Fixed         | Confirmed: `git ls-files` finds 36 `.spec.ts` under `apps/wbs/fe-01/e2e`, one under `e2e-packaged` and `libs/wbs/application/core/testing/portable-composition.spec.ts`, run by `wbs-core:test:portable` through a config whose `testDir` is `./testing`. Browser is now defined by declared Playwright suite membership across the three configurations, with that file as scenario 024.                                                                            |
| Important 2b — the isolation proof is circular           | Fixed         | Confirmed: adding a unit file to `test:conformance` reclassifies it as Conformance under row 2, so the mutation need not fail. Slice 2.1's negative now adds an existing Conformance file to a target declared for the API level alone, where row 2 keeps its classification and the isolation assertion must fail.                                                                                                                                                  |
| Important 3 — allocator enforcement has no prerequisite  | Fixed         | Confirmed in the rules design: B3 delivers scenario identifiers and B4 depends on B3. Slice 2.2 now delivers the allocator before allocating, slices 2.2 and 3.1 name B3 and B4, and requirement 009 gains a bootstrap clause plus scenario 025: the allocator imports and reserves this change's hand-written identifiers unchanged before provenance is enforced.                                                                                                  |
| Important 4 — the copied reference links resolve nowhere | Fixed         | Confirmed by reading the file: both fenced templates carried `../2026-09-19-code-organization-rollout.md` and `../../specs/...`, which resolve under `openspec/changes/` and `openspec/specs/`. All five links are now `../../../docs/...`, and Steps 7 and 9 each end with an `ls` that fails if a link is wrong.                                                                                                                                                   |
| Executability — missing `--schema sdd-lean`              | Fixed         | Verified both forms: with the flag the banner reads `Creating change 'x' with schema 'sdd-lean'`; without it the banner reads `spec-driven` while the file still says `sdd-lean`. Steps 3 and 8 pass the flag and grep the metadata, as the README's standard block requires.                                                                                                                                                                                        |
| Executability — verification after a commit              | Fixed         | Step 11 formats the owned files, Step 12 hands over thirteen paths and the subject `docs: record the service taxonomy and the test axes`, and no step stages, commits or branches.                                                                                                                                                                                                                                                                                   |
| Executability — the whole devsync target                 | Fixed         | Replaced with `bun test tools/tool-devsync/src/adr-index.test.ts -t '^ADR numbers are unique and contiguous from 0001$'`, expecting `1 pass`. The whole target is listed as pending planner verification.                                                                                                                                                                                                                                                            |
| Executability — Nx daemon and the host gate              | Fixed         | `NX_DAEMON=false` on the format check, the only Nx command left. The host gate is not run and is reported as such.                                                                                                                                                                                                                                                                                                                                                   |
| Executability — telemetry and the package cache          | Fixed, partly | Telemetry confirmed: `POSTHOG_HOST = 'https://edge.openspec.dev'` and opt-out by default, so `OPENSPEC_TELEMETRY=0` prefixes every invocation. The cache half is **not adopted**: with an empty `BUN_INSTALL_CACHE_DIR` under the attempt's directory the same call exits 1 with `error: ConnectionRefused downloading package manifest @fission-ai/openspec`. The packet sets no cache variable and relies on the launcher's pre-install. See the correction below. |
| Executability — scratch files "outside the repository"   | Fixed         | Every backup, patch and saved output is under `$TMPDIR`, with `$TMPDIR/evidence` for the proof artefacts, byte restores by `cp` and `cmp`, and no Git restoration.                                                                                                                                                                                                                                                                                                   |
| Cut points                                               | Answered      | New section 13: one session with planner checkpoints after Step 5 and Step 12, and `service-taxonomy` as the cut if the session runs out of room — the review's own recommended order.                                                                                                                                                                                                                                                                               |

**A correction this revision makes to its own predecessor.** Revision 3 of this packet claimed that offline execution required pinning `TMPDIR=/tmp` and passing `--offline`, because a per-attempt temporary root "cannot see" the installed command. That claim was drawn from an incomplete experiment and is **wrong**. Re-probed on 2026-09-20 with the registry unreachable: an attempt root holding a **complete** `bunx-<uid>-@fission-ai/openspec@1.12.0` directory — one whose `package.json` names `"@fission-ai/openspec": "1.12.0"` — runs `--version`, `validate` and `new change` at exit 0 with no flag and no pinned temporary directory. The earlier failures came from a half-finished warm whose `package.json` was `{}`; each failed run rewrites it back to `{}`, which is why retrying looked like a property of the path. The packet now uses the batch README's plain form, checks the pre-install's `package.json` in Step 0, and makes a download attempt stop condition 1. No fixed path under the system temporary directory remains.

### Grill of the execution plan, 2026-09-19 (Codex, high effort)

| Point                                                                         | Disposition | What changed                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q2 — "010.3 schedules verification after committing"                          | Fixed       | Verification now runs against the working tree. Step 12 hands over; nothing is staged or committed, and the three planner-only checks are named.                                                     |
| Q6 — "§8 says two added changes increase 95 by one; §10 correctly expects 97" | Fixed       | Both absolute numbers are gone; see critical 1 above.                                                                                                                                                |
| Q11 and unasked 9 — fixed temporary paths and per-attempt state               | Fixed       | Nothing writes to a fixed path under the system temporary directory, and no command pins one either. Everything the packet writes lives under the attempt's `$TMPDIR`.                               |
| Unasked 3 — proving the committed bytes are the reviewed bytes                | Fixed       | Step 12 records `git status --short` and the exact thirteen paths, and section 10 splits executor checks from planner checks so the planner re-runs the rest on the staged tree.                     |
| Unasked 4 — restoration if a session dies mid-mutation                        | Fixed       | Section 8 saves the passing bytes, writes the mutation as a patch under `$TMPDIR/evidence`, asserts the patch is non-empty, restores by `cp` and proves it with `cmp`. Never from Git.               |
| Unasked 11 — detecting a weakened test                                        | Noted       | This packet adds no test. Its two proofs are recorded as patch plus failing output so the planner can replay them rather than trust the report.                                                      |
| Unasked 12 — the OpenSpec count per clone and at integration                  | Fixed       | Every count is relative to Step 0's B. The grill's arithmetic for the batch — two changes from this packet — is what B+2 states, and this packet asserts nothing about any other packet's additions. |
| Unasked 16 — masking a required check's failure                               | Fixed       | No `                                                                                                                                                                                                 |     | true`and no echoed status anywhere.`diff`exiting 1 is replaced by an explicit`test -s` assertion on the patch it wrote. |

### Packet-specific corrections from the coordinator

- **020.8's second review: the inventory distinction is missing.** Verified in that packet: its section 9 says inventory integrity is enforced from day one while taxonomy debt is only reported, and its stop conditions make an absent distinction a hard stop before step 1. Requirement 042 to 045 now states it, requirement 037 is scoped to taxonomy rules only, and scenario 037 makes the two run in the same pass. Nothing in 020.8 was edited; the correction belongs here.
- **010.4's five rule-model terms.** Not added. `ASSUMPTIONS.md` records that their glossary entries are deferred because the Twilight glossary already defines Finding and Verdict for the runtime. Step 2 and section 12 both say so, so an executor holding this packet does not take that decision by accident.

### Batch-wide corrections of 2026-09-20

- **The anchored `-t` filter.** The hazard is real in general and does not bite here: `tools/tool-devsync/src/adr-index.test.ts` has no `describe`, so the joined name is the bare title. Observed on Bun 1.4.2: the anchored pattern printed `1 pass`, `0 fail`, `Ran 1 test across 1 file` and exited 0, and a deliberately wrong pattern printed `error: regex "^no such test$" matched 0 tests` and exited **1**. Section 10 now states the expected count, and `matched 0 tests` is stop condition 2 rather than something the exit status is trusted to catch.
- **`OPENSPEC_TELEMETRY=0` on every invocation.** Done, on all ten. The telemetry host and the opt-out precedence are recorded in section 3 from the package's own source.
- **The launcher pre-installs OpenSpec into the attempt root.** Adopted: `--offline` and the pinned temporary directory are gone, and so is any fallback branch. What replaces them is a cheap Step 0 check of the pre-install's `package.json`, because a half-finished pre-install fails in a way that repeats and worsens. The correction to revision 3's claim is written out above, under the second review.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

One blocking finding, correct, applied by the planner by hand: section 13 offered a checkpoint after Step 5 that the launcher cannot honour (one named slice per attempt, stdin closed) and called `service-taxonomy` complete before its design, tasks, verification record and negative proof existed. Section 13 is now the reviewer's replacement text: one slice, one checkpoint at Step 12.
