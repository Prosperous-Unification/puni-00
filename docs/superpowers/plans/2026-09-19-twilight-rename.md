# Twilight Rename Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this plan one task at a time. Steps use checkbox syntax. Read the spec and the task's files before editing.

**Goal:** Bring every current document, proposed contract, planned unit and command name into line with the names decided on 2026-09-19, without rewriting history or breaking stored identities.

**Architecture:** A rename here is a change of meaning first and of spelling second. Prose is corrected by reading, never by blanket replacement. Identities that evidence, activations or links depend on keep their spelling. Physical moves of existing source are a separate, later, optional change.

**Tech stack:** Markdown, OpenSpec 1.12.0, Bun 1.4.2, Nx, the repository's document and wiki checks.

**Spec:** [Names and boundaries](../../twilight-structure/names.md) and the [Twilight glossary](../../twilight-structure/CONTEXT.md).

**Status:** Proposed on 2026-09-19. Task 1 is done by the change that introduced this plan. Nothing else has started.

## Global constraints

- The naming tree is fixed by the spec: Prosperous Unification (PUNI) is the company; Vesper Shipyards is the product's code name; Twilight Structure (twist) is the tool suite; Twilight Navigator (twin) plans; Twilight Dash (twid) executes; Twilight Burokrat (twib) holds the rules.
- Use full names in external or public-facing text. Short forms are for internal types, internal notes and command-line binaries.
- Never rewrite a historical snapshot: review receipts, research notes, dated audits, archived OpenSpec changes and stored evidence keep their wording.
- Never rename a stored identity: version-1 record and module identifiers, role filenames, the legacy wiki environment variables, immutable activations, OpenSpec change identifiers and the workflow schema identifier.
- No blanket search and replace. Every edit is made by reading the sentence and choosing the tool it now means.
- Docs-only tasks use the documentation exemption of rule R4. A task that changes a command, a package manifest, a workflow or a path is observable behaviour and needs its own OpenSpec change.
- Bun and Nx only. Commit with hooks enabled. Never `--no-verify`.

## Inventory at 2026-09-19

Counted with `git grep` on branch `docs/twilight-naming-and-code-organization`, lockfile excluded.

| Pattern                                      | Files | Occurrences | Where it concentrates                                                   |
| -------------------------------------------- | ----- | ----------- | ----------------------------------------------------------------------- |
| "Twilight Structure"                         | 13    | 20          | Current Twilight documents, context map, repo index                     |
| The Twilight documents directory name        | 49    | 316         | Evidence 143, research 63, proposed changes 50, links elsewhere         |
| A bare "Twilight"                            | 112   | 425         | Research 115, evidence 61, control-plane change 54                      |
| The planned Twilight verifier tool           | 8     | 25          | Control-plane change, SDLC stages                                       |
| Planned Twilight apps                        | 7     | 39          | Control-plane change                                                    |
| Planned Twilight libraries                   | 3     | 43          | Control-plane change                                                    |
| The control-plane change identifier          | 46    | 211         | Links from documents and other changes                                  |
| The workflow schema identifier               | 53    | 225         | Schema files, changes that select it, documents                         |
| Legacy wiki tool names and variables         | 105+  | 1,200+      | Burokrat source 307, wiki change 249, bootstrap policy 77, workflows 43 |
| The previous Nx project name of the wiki CLI | 29    | 97          | Dated plans 26, wiki release change 13                                  |
| "Twilight Burokrat" and its package name     | 63+   | 438         | Already correct                                                         |
| The short forms twib, twist                  | 0     | 0           | Not used anywhere yet                                                   |

The registry was checked the same day. The package names for Twilight Structure, Twilight Dash, Twilight Navigator and Twilight Burokrat are all unclaimed on npm, as is the product code name. The short forms twin, twid and twist are taken as npm package names, so they can only ever be binary names. The short form twib is unclaimed.

## What is renamed and what stays

| Thing                                                          | Decision                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The Twilight documents directory                               | Stays. Twilight Structure now names the suite, so the directory is the suite's documentation root.                 |
| Current Twilight prose                                         | Reworded by reading. The running factory becomes Twilight Dash; planning with a person becomes Twilight Navigator. |
| Evidence, research, dated audits, archived changes             | Stay untouched. The Twilight README already declares them historical.                                              |
| OpenSpec change identifiers and the workflow schema identifier | Stay. They are identities with hundreds of inbound links. Their prose is updated.                                  |
| Planned Nx units that do not exist yet                         | Renamed in the design before anything is created. This costs nothing now.                                          |
| The planned Twilight verifier tool                             | Removed from the design. Verification is Twilight Burokrat's; compilation is Twilight Dash's.                      |
| Burokrat source location under the wiki apps directory         | Stays for now. A physical move is Task 7, optional and late.                                                       |
| Legacy wiki script names, workflow names and variables         | Stay. The Burokrat README already fixes their spelling for evidence continuity.                                    |
| Existing deploy, fleet, build and secrets tools                | Stay. Twilight Dash first wraps them as a facade; renaming them is not part of this plan.                          |
| WBS                                                            | Stays its own product. Twilight Navigator uses it as a planning surface.                                           |

## Planned unit names

These units are proposed by the control-plane design and do not exist. Their new names follow the repository's product namespacing, where the product directory carries the full name.

```text
Old proposal                  New name                                  Product tag
libs/twilight-contracts       libs/twilight/domain/contracts            product:twilight
libs/twilight-domain          libs/twilight-dash/domain/domain          product:twilight-dash
libs/twilight-runtime         libs/twilight-dash/adapters/runtime       product:twilight-dash
libs/twilight-assistant       libs/twilight-navigator/adapters/assistant product:twilight-navigator
apps/twilight-be              apps/twilight-dash/be                     product:twilight-dash
apps/twilight-fe              apps/twilight-dash/fe                     product:twilight-dash
apps/twilight-mcp             apps/twilight-dash/mcp                    product:twilight-dash
apps/twilight-worker          apps/twilight-dash/worker                 product:twilight-dash
tools/tool-twilight           not created                               none
```

The shared contracts library holds the three records the tools exchange: candidate, environment observation and report. It is the only unit all three tools may import.

## Tasks

### Task 1: Establish the names

**Files:** created `docs/twilight-structure/names.md`; modified `docs/twilight-structure/CONTEXT.md`, `docs/twilight-structure/README.md`, `CONTEXT-MAP.md`, `LLM_README.md`.

- [x] Write the naming tree, the writing rule, the three questions, the dependency rule and the landing table.
- [x] Redefine Twilight Structure in the glossary and add Prosperous Unification, Vesper Shipyards, Twilight Navigator, Twilight Dash and Twilight Burokrat, each with an avoid list.
- [x] Put a dated reading note at the top of the Twilight README, so every older document is read correctly before it is reworded.
- [x] Update the context map and the repository index.

**Deliverable:** one canonical page and a glossary that agree. Done on 2026-09-19.

### Task 2: Reword the current Twilight documents

**Files:** modify `docs/twilight-structure/spec.md`, `docs/twilight-structure/sdlc-stages.md`, `docs/twilight-structure/product-experience.md`, `docs/twilight-structure/client-repositories.md`, `docs/twilight-structure/knowledge.md`, `docs/twilight-structure/assumptions.md`, `docs/wiki/README.md`.

- [x] In each file, find every use of the old meaning:

```sh
git grep -n -E "Twilight Structure|\bTwilight\b" -- docs/twilight-structure/spec.md \
  docs/twilight-structure/sdlc-stages.md docs/twilight-structure/product-experience.md \
  docs/twilight-structure/client-repositories.md docs/twilight-structure/knowledge.md \
  docs/twilight-structure/assumptions.md docs/wiki/README.md
```

- [x] For each hit, apply the one-line test from the spec. A sentence about running, building, deploying, testing or environments becomes Twilight Dash. A sentence about discovery, specification or planning with a person becomes Twilight Navigator. A sentence about rules, templates, evidence validity or coverage judgment becomes Twilight Burokrat. A sentence about what a customer buys becomes Vesper Shipyards. A sentence about all tools together keeps Twilight Structure.
- [x] In `sdlc-stages.md`, replace the closing section's separate compiler and verifier tool with the split from the spec, and add the stage ownership sentence: request through planning are Twilight Navigator's, implementation through release are Twilight Dash's, every stage gate is Twilight Burokrat's.
- [x] In `spec.md`, keep the dated requirement rows verbatim, because they record what the user said on that date. Add one dated paragraph under Intent that maps the catalogue to the new names.
- [x] Leave every file under the evidence and research directories unchanged.
- [x] Remove the reading note's last sentence from the Twilight README once this task and Task 3 are complete. Done on 2026-09-20.
- [ ] Verify:

```sh
bunx nx run tool-devsync:test --skip-nx-cache
bunx nx format:check --all
```

**Deliverable:** current Twilight documents use each name in its new meaning; history is untouched.

### Task 3: Reword the proposed OpenSpec changes

**Files:** modify prose in `openspec/changes/twilight-control-plane/{proposal.md,design.md,tasks.md}` and its delta specs, `openspec/changes/twilight-review-hardening/`, `openspec/changes/twilight-sdlc-pilot/` where it states current intent, and the two Burokrat package changes. Identifiers and directory names stay.

- [x] Replace the unit table in the control-plane design with the names from [Planned unit names](#planned-unit-names) and delete the verifier tool's row.
- [x] In the design's boundary diagram and prose, name the runtime Twilight Dash, the planning port's owner Twilight Navigator, and the knowledge and verification operations Twilight Burokrat.
- [x] Assign each proposed capability an owning tool in its delta spec's purpose: assistant interaction and repository planning to Twilight Navigator; control plane and delivery environments to Twilight Dash.
- [x] Record the lease migration as an open design item in the control-plane design: admission verdicts stay with Twilight Burokrat, lease acquisition, heartbeat and fencing move to Twilight Dash.
- [x] Do not touch `verify.md` files. They record what was observed under the old names. Done on 2026-09-20.
- [ ] Verify the structured report, not the exit code:

```sh
set -euo pipefail
bunx @fission-ai/openspec@1.12.0 validate --all --json |
  jq -e '.summary.totals.failed == 0 and .summary.totals.passed > 0'
```

**Deliverable:** every proposed contract names its owning tool; no unit is created under an old name.

### Task 4: Reword decisions and current plans

**Files:** modify `docs/adr/0027-planning-commits-are-the-transaction-boundary.md`, `docs/adr/0028-k3s-schedules-the-expandable-worker-pool.md`, `docs/superpowers/specs/2026-09-17-twilight-burokrat-and-fleet-design.md`, `docs/superpowers/plans/2026-09-17-twilight-burokrat-and-fleet.md`, `docs/superpowers/plans/2026-09-17-k3s-fleet.md`, `docs/infra/README.md`.

- [x] An accepted ADR keeps its decision text. Add one dated line under its status naming the owning tool: ADR 0027 belongs to Twilight Navigator's planning contract and ADR 0028 to Twilight Dash's worker pool.
- [x] In the fleet documents, state once that the fleet and its delivery tooling are Twilight Dash's, and leave task identifiers and evidence links unchanged. Done on 2026-09-20.
- [ ] Verify with the same two commands as Task 2.

**Deliverable:** decisions and active plans point at the tool that owns them.

### Task 5: Add the short command name for Twilight Burokrat

This task changes a package manifest, so it needs an OpenSpec change named `twilight-burokrat-short-command` with intent, a delta spec, tasks and a verification record.

**Files:** modify `apps/wiki/cli/package.json`; modify `apps/wiki/cli/src/packaging/install.test.ts`. The two other packaging tests that build a manifest fixture with a `bin` map, `consumer-bootstrap.test.ts` and `build.test.ts`, are read first and updated only if they assert the exact map.

- [ ] Write the failing assertion first, inside the existing test `installs the exact tarball with scripts disabled and runs without workspace resolution`. Replace its manifest expectation and add the short command's run directly after the full command's version check:

```ts
expect(manifest).toMatchObject({
  name: 'twilight-burokrat',
  version: '0.1.0',
  bin: { 'twilight-burokrat': 'dist/bin.mjs', twib: 'dist/bin.mjs' },
});
```

```ts
const shortCommand = join(consumer, 'node_modules/.bin/twib');
const shortVersion = run([shortCommand, '--version'], consumer, sanitizedEnvironment(consumer));
expect(shortVersion.exitCode, shortVersion.stderr.toString()).toBe(0);
expect(shortVersion.stdout.toString()).toBe('0.1.0\n');
```

- [ ] Run the package test and watch it fail on the missing `twib` key:

```sh
bunx nx run twilight-burokrat:test:package --skip-nx-cache
```

- [ ] Add the second entry to the manifest's `bin` map: `"twib": "dist/bin.mjs"`.
- [ ] Rerun and watch it pass. Remove the new entry once, watch the same assertion fail again, restore it, and record both observations in the change's `verify.md`.
- [ ] Do not publish. Registry publication remains task P4 of the package plan and needs explicit authorization.

**Deliverable:** `twib` works wherever the package is installed; the full name remains the documented one.

### Task 6: Reserve the public names

This task is outward-facing and irreversible. It is executed only on Dany's explicit instruction, never by an agent on its own.

- [ ] Decide whether to register the product's `.com` domain. It was unregistered on 2026-09-19.
- [ ] Decide whether to reserve the four full package names on npm. All four were unclaimed on 2026-09-19.
- [ ] Commission a trademark and company-register search for Vesper Shipyards before the name appears in public.
- [ ] Record each decision and its date in the [names page](../../twilight-structure/names.md).

**Deliverable:** recorded decisions; no agent action.

### Task 7: Move the Burokrat source under its product directory, optional

Do this only after the package is published and adopted, which are tasks P4 and P5 of the package plan. It needs its own OpenSpec change, because it changes paths that activations, workflows and hooks depend on.

- [ ] Read the trusted activation relocation change first. Its relocation command is the supported way to move trusted module paths.
- [ ] Move the two directories under the wiki apps directory to a product directory carrying the full name, with `git mv`.
- [ ] Update the module path mapping in the wiki policy with a new mapping version. Module identifiers do not change; ADR 0020 makes a rename a mapping change, not an identity change.
- [ ] Update every declared external consumer in the Burokrat README's module index: the lint launcher, the host gate, the trusted workflow, the candidate workflow, the hook file and the Nx configuration.
- [ ] Re-pin the legacy occurrence digest in the namespacing handoff test. Moving files shifts its pinned counts and line-sensitive digest; re-pin only after reading the diff it reports.
- [ ] Run the package tests, the source lint, the type check and the full gate. On the shared build host use the gate script with the commit hash and do not check the commit out first.

**Deliverable:** source location matches the product name, with trust and evidence continuity proven. Until then the current location is correct and documented.

## Verification for the docs tasks

```sh
bunx nx run tool-devsync:test --skip-nx-cache
bunx nx format:check --all
bunx @fission-ai/openspec@1.12.0 validate --all --json
```

The first command checks that links and anchors in routed documents resolve and that named Nx projects exist. A pass does not prove the prose uses the right tool name; that is a reading check, done by a reviewer with the spec open.

## Self-review

- Spec coverage: the naming tree is Task 1; the writing rule is a global constraint; the landing table drives Tasks 2 to 4; the lease migration is recorded in Task 3 and designed elsewhere; short forms are Task 5; public names are Task 6.
- No task renames an identity the spec says must stay.
- Tasks 5 and 7 change behaviour and are gated on their own OpenSpec changes.
