# 040.13 — DI Bag 0.5.1 label surface execution packet

> **For agentic workers:** Execute one slice per attempt. Read `AGENTS.md`, `LLM_README.md`, the batch-1 execution contract, and this packet in full. The planner commits each green slice; the executor leaves a reviewable tree and evidence. The executor preamble controls sandbox differences.

| Field     | Value                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| WBS       | `cc9361f6` — di-bag label surface                                                                       |
| Base      | `726bc0463` on `plan/batch-8-di-bag-051-labels`                                                         |
| Rehearsal | `rehearse/di-bag-051-r1`: `14200810` (slice 1), `35f347ac` (slice 2)                                    |
| Package   | `di-bag` 0.5.0 → exact 0.5.1; `application-exception` 0.7.0 and `caught-object-report-json` 13.0.0 stay |
| Shape     | Two green planner commits; slice 2 contains the pin and every line of code that needs it                |

## 1. Intent and boundaries

The current test reads a label by parsing private `bindingLabel` prefixes. An unlabelled scanned module can forge the prefix in its own private key or borrow the prefix from a labelled inner module. Both passed the old check. Version 0.5.1 closes the information gap: each sealed `Module` exposes its exact `moduleLabel`, and a container snapshot has installation identities and ancestry. Compare the exported module's getter to its directory-derived label. Keep DI Bag's module validation and the exactly-one-export rule. Do not require any private binding for label agreement.

Keep the two scanned roots, README/pilot/shim clauses, runtime APIs, service lifetimes and Capacity's separate privacy contract. Do not reserve `/` in keys or labels. Do not change unrelated owner-maintained packages. Historical packets and dated failure evidence stay historical.

## 2. Read and release evidence

Read these paths before slice 1: `tools/tool-devsync/src/module-labels.test.ts`, `tools/tool-devsync/src/toolchain-pins.test.ts`, `libs/wbs/application/core/src/module/capacity/{module.ts,contract.ts,module.test.ts}`, `openspec/changes/adopt-di-composition/{design.md,specs/di-composition/spec.md}`, `openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md`, and the prior packet `docs/superpowers/plans/2026-09-25-batch-7/140-3-di-bag-migration.md`. Read the published 0.5.1 changelog, release commits `v0.5.0..v0.5.1`, `docs: explain module installation identities and ancestry`, `docs: record issue 42 implementation verification`, and emitted typings before editing. The issue-42 reproduction is an explanation of the forgeries, not a fixture this check scans.

0.5.1's `Module.moduleLabel` is a read-only inherited getter returning the exact sealing label or `undefined`; renamed views retain it. `GraphSnapshot.moduleInstallations` includes empty, unlabelled and repeated installations; each record has a unique `installationId`, exact `moduleLabel`, and `parentInstallationId`. A binding's `moduleInstallationId` identifies the innermost installation that introduced it; host declarations and replacements may have `undefined`. Slash-containing keys and labels remain valid. No codemod is needed from 0.5.0 to 0.5.1.

The checker holds the exported module object. It validates the object by installing it through DI Bag and then reads that object's getter. It does **not** search all snapshot labels for a match: that would accept the labelled inner module again. A check holding only a container must join binding `moduleInstallationId` to `moduleInstallations.installationId` and walk `parentInstallationId`, never parse `bindingLabel`. `Module` is type-only from the package, so there is no runtime `instanceof Module`. `Object.keys` and own-property checks miss the inherited getter.

Capacity is among the modules returned by `sealedModules()` from `libs/wbs/application/core/src/module`; its `module.ts` exports exactly `capacityModule`. Capacity's `module.test.ts` separately proves `capacityOptions` is private and its failure label. Thus removal of the checker-wide “at least one private binding” rule does not remove Capacity's privacy check. The label check can accept a fully exported or empty labelled module; no other clause in `module-labels.test.ts` requires a private binding.

## 3. OpenSpec decision and owned files

R4 requires OpenSpec: the package contract and the observable enforcement guarantee change. Create the small `di-bag-label-surface` sdd-lean change, separate from the completed 0.5.0 migration, with intent, a delta to `di-composition`, ordered tasks and verification. Amend the 0.5.0 change's exact pin scenario to 0.5.1 so OpenSpec has no stale current pin. Add dated closure notes to `adopt-di-composition` design/tasks and the adoption README-style plan; leave old evidence intact. No ADR or new architecture design is warranted.

| Slice | Paths                                                                                                                                                                                                                                                                                             | Reason                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1     | `openspec/changes/di-bag-label-surface/{.openspec.yaml,proposal.md,specs/di-composition/spec.md,tasks.md,verify.md}`; `openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md`                                                                                                              | Intent and contract before code; update exact pin scenario.                          |
| 2     | `package.json`, `bun.lock`, `tools/tool-devsync/src/{module-labels.test.ts,toolchain-pins.test.ts}`, `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, `openspec/changes/adopt-di-composition/{design.md,tasks.md}`, `openspec/changes/di-bag-label-surface/{tasks.md,verify.md}` | Pin, getter check, proof comments, closure notes and observed verification together. |

The patches below are exact rehearsal edits. Save each fenced diff to its own evidence file using the extraction command in that slice. `git apply` changes the working tree but writes no Git objects. The executor must not stage or commit. Each slice records fresh baselines and its own results in `verify.md`; its dates and diagnostics come from observation, not from the rehearsal's wording.

## 4. Slice 1 — intent and contract

1. Create an attempt root with `mktemp -d "${TMPDIR:?}/di-bag-051-s1-XXXXXX"`; set `attempt` to that result and create `$attempt/evidence`. Record `git status --short --untracked-files=all`, `bun -e "import p from 'di-bag/package.json'; console.log(p.version)"` (expect 0.5.0), and strict OpenSpec totals. The base has 117 valid items (105 changes, 12 specs); if the real base differs, record its N and require N+1.
2. Extract slice 1 patch using the block below, run `git apply --check "$attempt/evidence/slice1.patch"`, then `git apply "$attempt/evidence/slice1.patch"`. Do not copy a rehearsal `verify.md` observation as though it happened in this attempt: replace only the dated slice-1 observation with your actual command output, keeping the file path and headings.
3. Run `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` and inspect `summary.totals`: status 0, N+1 passed, 0 failed. Run `env -u CLAUDECODE -u AGENT bunx prettier --write` on the six owned paths, then `--check` twice. Add actual evidence basenames to `verify.md`. No network is required: the OpenSpec package is locked and present; stop if `bunx` tries to download.
4. Hand over exactly the six paths in this slice. Planner stages and commits with hooks on, subject `docs(openspec): specify di-bag label surface` and both required trailers. Its rehearsal SHA is `14200810`. A single green commit ends the slice.

### Slice 1 patch

```diff
diff --git a/openspec/changes/di-bag-label-surface/.openspec.yaml b/openspec/changes/di-bag-label-surface/.openspec.yaml
new file mode 100644
index 00000000..b0d51f12
--- /dev/null
+++ b/openspec/changes/di-bag-label-surface/.openspec.yaml
@@ -0,0 +1,2 @@
+schema: sdd-lean
+created: 2026-09-26
diff --git a/openspec/changes/di-bag-label-surface/proposal.md b/openspec/changes/di-bag-label-surface/proposal.md
new file mode 100644
index 00000000..e34422df
--- /dev/null
+++ b/openspec/changes/di-bag-label-surface/proposal.md
@@ -0,0 +1,7 @@
+# DI Bag label surface
+
+The module label agreement check infers a sealed module's label from private binding-name prefixes. An unlabelled module can forge that prefix in a key or borrow it from a labelled child. This leaves WBS `cc9361f6` open and requires every module to retain a private binding solely so the check can read a prefix.
+
+Adopt `di-bag` 0.5.1. Read the exact label from each scanned module's `moduleLabel` getter, after DI Bag validates that the export is a module. When only a container is available, attribute bindings by `moduleInstallationId` and `moduleInstallations`; preserve the parent relation and do not infer origin from slashes. A fully exported or empty module may satisfy label agreement.
+
+The module roots and location-derived identifier convention remain the same. Capacity's own private-binding tests continue to enforce its contract. This change does not require a new provider, alter service lifetimes, or reserve `/` in keys or labels.
diff --git a/openspec/changes/di-bag-label-surface/specs/di-composition/spec.md b/openspec/changes/di-bag-label-surface/specs/di-composition/spec.md
new file mode 100644
index 00000000..0b76063b
--- /dev/null
+++ b/openspec/changes/di-bag-label-surface/specs/di-composition/spec.md
@@ -0,0 +1,29 @@
+## MODIFIED Requirements
+
+### Requirement: A module's label names its private bindings in failures
+
+Every sealed module SHALL carry the exact `moduleLabel` implied by its module directory and SHALL expose it through the read-only module getter. The label-agreement check SHALL read that getter on the sealed module it scans. A private binding SHALL NOT be required solely for label agreement. A container-only consumer SHALL attribute bindings to module installations through `moduleInstallationId` and `moduleInstallations`, including unlabelled and empty installations, without parsing slash-delimited binding labels.
+
+#### Scenario: A forged prefix does not supply a module label
+
+- **GIVEN** the scanned Capacity module is unlabelled and registers a private key `application.capacity/secret`
+- **WHEN** the label-agreement check reads the sealed module
+- **THEN** it reports the missing `application.capacity` module label even though the binding label has that prefix
+
+#### Scenario: A nested labelled module does not label its parent
+
+- **GIVEN** the scanned Capacity module is an unlabelled wrapper that installs a labelled inner module
+- **WHEN** the label-agreement check reads the wrapper
+- **THEN** it reports the wrapper's missing `application.capacity` label
+
+#### Scenario: No private binding is required for label agreement
+
+- **GIVEN** a sealed module with the expected label and all its bindings exported, or no bindings
+- **WHEN** the label-agreement check reads its getter
+- **THEN** the label agrees without requiring a private binding
+
+#### Scenario: A binding's installation is identified in a container
+
+- **GIVEN** a container includes a repeated module, an unlabelled wrapper and a binding whose key contains `/`
+- **WHEN** a container-only consumer attributes a binding
+- **THEN** it follows the binding's `moduleInstallationId` to the exact installation and its `parentInstallationId` ancestry
diff --git a/openspec/changes/di-bag-label-surface/tasks.md b/openspec/changes/di-bag-label-surface/tasks.md
new file mode 100644
index 00000000..1d118b9d
--- /dev/null
+++ b/openspec/changes/di-bag-label-surface/tasks.md
@@ -0,0 +1,4 @@
+- [x] 1. Record the 0.5.1 contract and baseline.
+- [ ] 2. Pin di-bag 0.5.1 and rewrite label agreement against the module getter.
+- [ ] 3. Observe forged-prefix and borrowed-label production-path negatives and clause-disabled twins; update known-limit notes.
+- [ ] 4. Verify focused suites, lint, typecheck and OpenSpec; record planner-only gates.
diff --git a/openspec/changes/di-bag-label-surface/verify.md b/openspec/changes/di-bag-label-surface/verify.md
new file mode 100644
index 00000000..d853fc15
--- /dev/null
+++ b/openspec/changes/di-bag-label-surface/verify.md
@@ -0,0 +1,8 @@
+# Verification
+
+The execution slices append observed commands, statuses and proof evidence here. Evidence names are relative to each attempt's evidence directory.
+
+## Slice 1 — 2026-09-26
+
+- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: status 0; 118 items passed, 0 failed (106 changes and 12 specs).
+- `bunx prettier --check` on the six owned OpenSpec paths: status 0, `All matched files use Prettier code style!`.
diff --git a/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md b/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md
index 30acc7fe..187b4fe6 100644
--- a/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md
+++ b/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md
@@ -8,7 +8,7 @@ library only through its root entry, so that no Node built-in is bundled for the
 #### Scenario: The pin is exact

 - **WHEN** the pins suite reads the root manifest
-- **THEN** `di-bag` is pinned to `0.5.0` with no range
+- **THEN** `di-bag` is pinned to `0.5.1` with no range

 #### Scenario: A Node built-in reaches the browser probe

```

## 5. Slice 2 — pin, getter check and proofs

1. Start from the green slice-1 planner commit and a fresh attempt root. Record `git status`, the installed 0.5.0 package version, focused label and pin test counts, and the strict OpenSpec N. The executor's `node_modules` remains its own; never edit a package file in it or symlink an install.
2. Extract and apply slice 2 patch with `git apply --exclude=openspec/changes/di-bag-label-surface/verify.md` (both `--check` and apply); then append this attempt’s own verification entry. This slice alone gets `--network` for `env -u CLAUDECODE -u AGENT bun install --frozen-lockfile` after the planner has prepared the lockfile patch from the registry. The manifest and lock entry must both be exact 0.5.1; `bun -e` must print 0.5.1. No other slice needs registry access. The executor's installed copy may already be cached, but retain `--network` because this slice may need the tarball.
3. Run the focused label and pin files, Capacity's module file, `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:lint --skip-nx-cache`, and the matching `typecheck --skip-nx-cache`. Run strict OpenSpec validation and scoped Prettier write/check twice. Multi-file Vitest, if selected for an additional caller, runs serially with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; do not run a port-binding or Node-child-output Vitest test in the executor sandbox.
4. Run the fault table below from clean, saved passing files, one fault at a time. Write the patch, full output, exit status and restoration comparison into `$attempt/evidence/<id>.*`. A named test must run; zero matches is a stop. Restore with `cp` and `cmp`, never `git restore`. The adjacent dated `Proof:` comments in the patch are the rehearsal's observed facts; replace date or wording only if this attempt observes a different fact. For each twin, disable only the named clause, run the same planted module, then restore the check before restoring Capacity. Other clauses stay active. Fresh Bun processes avoid dynamic-import cache.
5. Update `verify.md` with actual observations and evidence basenames. Hand over exactly slice-2 paths. Planner commits with hooks on, subject `test(devsync): verify sealed module labels with di-bag 0.5.1` and both trailers. Its rehearsal SHA is `35f347ac`. Run planner-only checks after commit.

### Fault table: exact production path, old/new/twin

| ID  | Fault in scanned `libs/wbs/application/core/src/module/capacity/module.ts`                                                                                                                                                                                                                                                                  | Named test and required observation                                                                                                                                          | Clause-disabled twin                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| F1  | Keep both real providers and public `capacity`. Remove `moduleLabel: CAPACITY_LABEL`. Rename the private registration key to `'application.capacity/capacityOptions'`; destructure it as `{ 'application.capacity/capacityOptions': capacityOptions }` and type that exact key in Capacity's consumer.                                      | `seals every module under the label its location implies`: old inference passes 1/0 on 0.5.1; new check fails 0/1 on `moduleLabel undefined, expected application.capacity`. | Change only `if (actual !== label)` to `if (false && actual !== label)`; the planted module then passes 1/0. |
| F2  | Rename the original exported `capacityModule` declaration to unexported `capacityInner` without changing its providers or label. Append `export const capacityModule = DiBag.createBuilder().withInstalledModules([capacityInner]).buildModule({ exportedServiceKeys: ['capacity'] });`. The scanned export is the unlabelled outer module. | Same named test: old inference passes 1/0; new getter comparison fails 0/1 with the same exact label diagnostic.                                                             | Disable only the getter comparison as for F1; the planted wrapper passes 1/0.                                |
| P1  | Change only `package.json`'s `"di-bag": "0.5.1"` back to `"0.5.0"`; do not reinstall.                                                                                                                                                                                                                                                       | `are pinned to exact versions in the root manifest` fails 0/1, expected `di-bag: 0.5.1`, received `0.5.0`.                                                                   | Change only `OWNER_PACKAGES['di-bag']` to `0.5.0`; planted manifest passes 1/0.                              |

For F1 and F2, save the passing Capacity file and the passing checker first. The old checker is the base file (`git show 726bc0463:tools/tool-devsync/src/module-labels.test.ts`), copied into the worktree temporarily; it uses the installed 0.5.1 runtime. Restore the new checker before its failure and twin. Use `bun test ./tools/tool-devsync/src/module-labels.test.ts -t 'seals every module under the label its location implies'`. Its final status is 1/0 after both files are restored. For P1 use `bun test ./tools/tool-devsync/src/toolchain-pins.test.ts -t 'are pinned to exact versions in the root manifest'`; final status is 1/0. Do not run the other tests under a planted Capacity module: its own privacy/diagnostic clauses intentionally protect a different contract.

As a positive control, temporarily export `capacityOptions` as well as `capacity` from Capacity, run only the label-agreement test and observe 1/0 on the new getter check, then restore. Capacity's own private-binding tests must remain green on the unmodified source; they are what still depends on Capacity's privacy.

### Slice 2 patch

```diff
diff --git a/bun.lock b/bun.lock
index e8d74a11..7e406a91 100644
--- a/bun.lock
+++ b/bun.lock
@@ -22,7 +22,7 @@
         "application-exception": "0.7.0",
         "arktype": "^2.2.3",
         "caught-object-report-json": "13.0.0",
-        "di-bag": "0.5.0",
+        "di-bag": "0.5.1",
         "drizzle-orm": "1.0.0-rc.4",
         "elysia": "^1.4.30",
         "jose": "^6.2.12",
@@ -1400,7 +1400,7 @@

     "devlop": ["devlop@1.1.0", "", { "dependencies": { "dequal": "^2.0.0" } }, "sha512-RWmIqhcFf1lRYBvNmr7qTNuyCt/7/ns2jbpp1+PalgE/rDQcBT0fioSMUpJ93irlUhC5hrg4cYqe6U+0ImW0rA=="],

-    "di-bag": ["di-bag@0.5.0", "", {}, "sha512-Pk1yvfJpWTTv/IcDKnu8m7FX9Ovu8Do2cJsFcR8V0lvfVAyuZjP/7YYXW/VdynQUcLVaGPPNaEpQGJdCPXQxXw=="],
+    "di-bag": ["di-bag@0.5.1", "", {}, "sha512-rzG0NI9/M+/F1lYDRs+Get/jqZ6+X3mKPqe96WgCDOa1CJrFY+5I1/T+Vfnw3ffEcLPy5YS9++tTksauLadw3w=="],

     "doctrine": ["doctrine@2.1.0", "", { "dependencies": { "esutils": "^2.0.2" } }, "sha512-35mSku4ZXK0vfCuHEDAwt55dg2jNajHZ1odvF+8SSr82EsZY4QmXfuWso8oEd8zRhVObSN18aM0CjSdoBX7zIw=="],

diff --git a/docs/superpowers/plans/2026-09-17-personal-package-adoption.md b/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
index 014f375f..01fd1513 100644
--- a/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
+++ b/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
@@ -35,6 +35,16 @@ and the amendments below disagree, this one holds.
 - **Labels are still write-only.** 0.5.0 exposes a module's label only as the prefix of its
   private bindings' names, so the label check's known limit stands (WBS 040.13).

+## Amendment, 2026-09-26: di-bag exposes the label
+
+Work item 040.13 (WBS `cc9361f6`, OpenSpec change `di-bag-label-surface`) moves `di-bag`
+to 0.5.1. A sealed module now exposes its exact label through the read-only `moduleLabel`
+getter. The label-agreement check reads that getter on each scanned module; its former
+private-binding-prefix inference and at-least-one-private-binding convention are retired.
+Container-only inspection uses `moduleInstallations` and each binding's
+`moduleInstallationId` to identify origins, including unlabelled wrappers and slash-containing
+keys. Capacity's own privacy tests still enforce Capacity's private contract.
+
 ## Amendment, 2026-09-25: the report libraries moved together

 Work item 140.1–140.2 (OpenSpec change `migrate-report-libraries`) moved
diff --git a/openspec/changes/adopt-di-composition/design.md b/openspec/changes/adopt-di-composition/design.md
index ed4e13e7..46ee7be7 100644
--- a/openspec/changes/adopt-di-composition/design.md
+++ b/openspec/changes/adopt-di-composition/design.md
@@ -109,6 +109,14 @@ Amended 2026-09-25 by `migrate-di-bag`: di-bag 0.5.0 still exposes a label only
 first limit stands, tracked as WBS 040.13; `inspectGraph()` is now `graphSnapshot()`, whose private
 bindings carry an empty `serviceKeys` and a `bindingLabel`.

+Amended 2026-09-26 by `di-bag-label-surface`: di-bag 0.5.1 exposes each sealed module's exact
+label through its read-only `moduleLabel` getter. The label-agreement check reads the scanned
+module itself, closing the forged-prefix and borrowed-inner limit above. Its private-binding
+convention is no longer needed for label agreement. `graphSnapshot().moduleInstallations`
+records empty and unlabelled installations with identity and parentage; bindings carry
+`moduleInstallationId`, so a container-only consumer need not parse slash-delimited labels.
+Capacity's own private-binding and failure-label tests retain their separate contract.
+
 ## Layering debt ledger

 Task 7.4, per module: the obligations sealing leaves open, each stated in that module's
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
index 9ba280cd..e5a350fd 100644
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -434,3 +434,7 @@
       into the `@wbs/core directly` or `@wbs/runtime-portable directly` form is skipped until
       forwarding rows are compared by identity against the library's index, the kind rules owning
       the wording; and `apps/wbs/fe-01/src/modules` is outside this change.
+
+## 2026-09-26 follow-up
+
+The label inference limit recorded in task 7 is closed by `di-bag-label-surface` (WBS `cc9361f6`): the check reads the scanned module's `moduleLabel` getter on di-bag 0.5.1. Historical task evidence remains dated.
diff --git a/openspec/changes/di-bag-label-surface/tasks.md b/openspec/changes/di-bag-label-surface/tasks.md
index 1d118b9d..965dcec4 100644
--- a/openspec/changes/di-bag-label-surface/tasks.md
+++ b/openspec/changes/di-bag-label-surface/tasks.md
@@ -1,4 +1,4 @@
 - [x] 1. Record the 0.5.1 contract and baseline.
-- [ ] 2. Pin di-bag 0.5.1 and rewrite label agreement against the module getter.
-- [ ] 3. Observe forged-prefix and borrowed-label production-path negatives and clause-disabled twins; update known-limit notes.
-- [ ] 4. Verify focused suites, lint, typecheck and OpenSpec; record planner-only gates.
+- [x] 2. Pin di-bag 0.5.1 and rewrite label agreement against the module getter.
+- [x] 3. Observe forged-prefix and borrowed-label production-path negatives and clause-disabled twins; update known-limit notes.
+- [x] 4. Verify focused suites, lint, typecheck and OpenSpec; record planner-only gates.
diff --git a/openspec/changes/di-bag-label-surface/verify.md b/openspec/changes/di-bag-label-surface/verify.md
index d853fc15..523e7c5a 100644
--- a/openspec/changes/di-bag-label-surface/verify.md
+++ b/openspec/changes/di-bag-label-surface/verify.md
@@ -6,3 +6,17 @@ The execution slices append observed commands, statuses and proof evidence here.

 - `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: status 0; 118 items passed, 0 failed (106 changes and 12 specs).
 - `bunx prettier --check` on the six owned OpenSpec paths: status 0, `All matched files use Prettier code style!`.
+
+## Slice 2 — 2026-09-26
+
+- `bun install --frozen-lockfile`: status 0, `Checked 1602 installs across 1447 packages (no changes)`. Installed package: `di-bag@0.5.1`.
+- Focused module-label and pin files: 25 pass, 0 fail. Capacity module tests: 5 pass, 0 fail.
+- `NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache`: status 0, cache skipped.
+- `NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache`: status 0, cache skipped.
+- OpenSpec strict validation: 118 passed, 0 failed.
+- Forged Capacity private key: old check 1 pass; new check 1 fail with `moduleLabel undefined, expected application.capacity`; comparison disabled 1 pass; restored 1 pass.
+- Borrowed labelled Capacity inner module: old check 1 pass; new check 1 fail with the same exact label diagnostic; comparison disabled 1 pass; restored 1 pass. The faults mutate the actual scanned Capacity module.
+- Manifest reverted to `di-bag: 0.5.0`: exact-pin test 1 fail (expected 0.5.1, received 0.5.0); expectation changed to 0.5.0: 1 pass; restored focused run green.
+- Exporting Capacity's private `capacityOptions`: label check 1 pass on 0.5.1, demonstrating no private-binding dependency. Capacity's own private-binding tests remain separate.
+
+Planner-only checks pending after the slice commit: `tool-devsync:test`, committed index check, host gate and any Vitest suite that binds a port or reads a Node child's Bun-pipe output.
diff --git a/package.json b/package.json
index 6b09f1f0..4027f676 100644
--- a/package.json
+++ b/package.json
@@ -46,7 +46,7 @@
     "application-exception": "0.7.0",
     "arktype": "^2.2.3",
     "caught-object-report-json": "13.0.0",
-    "di-bag": "0.5.0",
+    "di-bag": "0.5.1",
     "drizzle-orm": "1.0.0-rc.4",
     "elysia": "^1.4.30",
     "jose": "^6.2.12",
diff --git a/tools/tool-devsync/src/module-labels.test.ts b/tools/tool-devsync/src/module-labels.test.ts
index 71afb8ea..6a10b262 100644
--- a/tools/tool-devsync/src/module-labels.test.ts
+++ b/tools/tool-devsync/src/module-labels.test.ts
@@ -3,7 +3,7 @@ import { join } from 'node:path';
 import { fileURLToPath } from 'node:url';

 import { expect, test } from 'bun:test';
-import { DiBag, type GraphSnapshot } from 'di-bag';
+import { DiBag } from 'di-bag';

 const WORKSPACE = fileURLToPath(new URL('../../..', import.meta.url));

@@ -99,24 +99,16 @@ async function exportedValues(path: string): Promise<readonly unknown[]> {
 }

 /**
- * The labels di-bag gives the private bindings of one installation of the module `module.ts`
- * exports, read from the running library rather than from any spelling in the source.
+ * The exact label on the sealed module exported by `module.ts`. Installing it makes DI Bag
+ * validate that the single runtime export really is a module; no provider is acquired.
  *
- * Exported bindings keep their bare key and carry their public names in `serviceKeys`, so only a
- * binding with no key is read: an exported key that merely contains a slash cannot pass for a label. The
- * label is observable only this way, so every sealed module keeps at least one private binding by
- * convention; one that exports every binding is refused as sealing none.
+ * `moduleLabel` is the sealing value, including when every binding is exported or the module
+ * installs a labelled child. Binding-label strings cannot establish either fact.
  *
- * Known limit: di-bag exposes a label only as the prefix of private binding names — 0.5.0 keeps
- * `moduleLabel` write-only, held in a private `WeakMap` — so a module that drops its label and
- * either spells `<label>/<key>` into a private key or installs an inner module sealed under that
- * label reads as labelled. Closing that needs a label accessor the library does not have yet (WBS
- * 040.13, left open by the 0.5.0 migration).
- *
- * @throws When `module.ts` exports anything but exactly one value, or when di-bag refuses it as a
+ * @throws When `module.ts` exports anything but exactly one value, or when DI Bag refuses it as a
  *   module.
  */
-async function privateBindingLabels(directory: string): Promise<readonly string[]> {
+async function sealedModuleLabel(directory: string): Promise<unknown> {
   const values = await exportedValues(`${directory}/module.ts`);
   // Proof (2026-09-24): appending `export const decoy = capacityModule;` to Capacity's module.ts
   // failed "seals every module under the label its location implies" with `…/capacity/module.ts
@@ -124,20 +116,17 @@ async function privateBindingLabels(directory: string): Promise<readonly string[
   if (values.length !== 1) {
     throw new Error(`${directory}/module.ts exports ${String(values.length)} values, expected 1`);
   }
-  // The host below supplies none of the module's requirements, which the type checker refuses;
-  // the runtime still builds the graph, and describing it resolves nothing.
+  // The host supplies none of the module's requirements, which the type checker refuses;
+  // the runtime still builds the graph without resolving any service.
   const builder = DiBag.createBuilder() as unknown as {
-    withInstalledModules: (modules: readonly unknown[]) => {
-      buildContainer: () => { graphSnapshot: () => GraphSnapshot };
-    };
+    withInstalledModules: (modules: readonly unknown[]) => { buildContainer: () => unknown };
   };
-  const graph = builder.withInstalledModules([values[0]]).buildContainer().graphSnapshot();
-  // Proof (2026-09-24): reading no binding as private reported every one of the eighteen modules
-  // as `seals no private binding` in "seals every module under the label its location implies"
-  // (4 pass, 1 fail).
-  return graph.bindings
-    .filter((binding) => binding.serviceKeys.length === 0)
-    .map((binding) => binding.bindingLabel);
+  builder.withInstalledModules([values[0]]).buildContainer();
+  const module = values[0];
+  if (typeof module !== 'object' || module === null || !('moduleLabel' in module)) {
+    throw new Error(`${directory}/module.ts has no moduleLabel getter`);
+  }
+  return module.moduleLabel;
 }

 /**
@@ -235,21 +224,12 @@ test('discovers the sealed modules of both roots', async () => {
 test('seals every module under the label its location implies', async () => {
   const mismatches: string[] = [];
   for (const { directory, label } of await sealedModules()) {
-    const labels = await privateBindingLabels(directory);
-    if (labels.length === 0) mismatches.push(`${directory}: seals no private binding`);
-    for (const binding of labels) {
-      // One identifier after the label: a label with a slash in it, or a labelled outer module,
-      // would otherwise put a different label in front of a key that looks right.
-      const key = binding.startsWith(`${label}/`) ? binding.slice(label.length + 1) : '';
-      // Proof (2026-09-24): Capacity's contract label set to `application.capacities`, then to
-      // `application.capacity/nested`, and its `buildModule` call without the label each failed
-      // "seals every module under the label its location implies" naming the private binding
-      // `application.capacities/capacityOptions`, `application.capacity/nested/capacityOptions`
-      // and `capacityOptions` (4 pass, 1 fail each); with the first of them Capacity's own
-      // module tests stayed green (5 pass), the drift no earlier check saw.
-      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
-        mismatches.push(`${directory}: private binding "${binding}" is not under ${label}`);
-      }
+    const actual = await sealedModuleLabel(directory);
+    // Proof (2026-09-26): an unlabelled Capacity with a forged private key and an unlabelled
+    // Capacity wrapper borrowing a labelled inner module each failed here with `moduleLabel
+    // undefined, expected application.capacity`; with this comparison disabled each passed.
+    if (actual !== label) {
+      mismatches.push(`${directory}: moduleLabel ${String(actual)}, expected ${label}`);
     }
   }

diff --git a/tools/tool-devsync/src/toolchain-pins.test.ts b/tools/tool-devsync/src/toolchain-pins.test.ts
index a37c4b79..4df77111 100644
--- a/tools/tool-devsync/src/toolchain-pins.test.ts
+++ b/tools/tool-devsync/src/toolchain-pins.test.ts
@@ -502,8 +502,11 @@ describe('the CI gate scope', () => {
  * lockfile can say. That the copies a duplicate would produce are actually one module at
  * runtime is a different claim, proved by the resolution probe in the task's verification.
  */
+// Proof (2026-09-26): reverting the manifest's di-bag pin to 0.5.0 failed 'are pinned to
+// exact versions in the root manifest' (0 pass, 1 fail); changing this expectation to 0.5.0
+// made the same fault pass (1 pass, 0 fail).
 const OWNER_PACKAGES = {
-  'di-bag': '0.5.0',
+  'di-bag': '0.5.1',
   'application-exception': '0.7.0',
   'caught-object-report-json': '13.0.0',
 } as const;
```

## 6. Verification and expected deltas

| Check                                                                                                                                | Executor or planner                    | Expected observation                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env -u CLAUDECODE -u AGENT bun install --frozen-lockfile` after slice 2                                                             | Executor, network slice                | Status 0; rehearsal: `Checked 1602 installs across 1447 packages (no changes)`; installed `di-bag@0.5.1`.                                                                                                                      |
| `env -u CLAUDECODE -u AGENT bun test ./tools/tool-devsync/src/module-labels.test.ts ./tools/tool-devsync/src/toolchain-pins.test.ts` | Executor                               | 25 pass, 0 fail in rehearsal: label file 5 pass, pin file 20 pass. Compare to slice baseline; no test removed.                                                                                                                 |
| `env -u CLAUDECODE -u AGENT bun test ./libs/wbs/application/core/src/module/capacity/module.test.ts`                                 | Executor                               | 5 pass, 0 fail. Its privacy and failure-label tests remain.                                                                                                                                                                    |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:lint --skip-nx-cache`                                           | Executor                               | Status 0, cache skipped.                                                                                                                                                                                                       |
| Matching `tool-devsync:typecheck --skip-nx-cache`                                                                                    | Executor                               | Status 0, cache skipped.                                                                                                                                                                                                       |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                        | Executor                               | Baseline N+1, zero failed; rehearsal 118/118, with 106 changes and 12 specs.                                                                                                                                                   |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`                                           | Planner, after commit                  | Exit 0 on a same-mount host. Scratch rehearsal: 380 pass, 2 fail, both `durable dev poller` tests on `Invalid cross-device link` with exit 128; exactly the two known preamble rule-21 cases, so pending planner verification. |
| `env -u CLAUDECODE -u AGENT bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes committed . <slice-commit>`   | Planner, after each commit             | Exit 0; writes Git objects, so the executor cannot run it. No module index changes.                                                                                                                                            |
| Frontend whole `wbs-fe-01:test:unit` / `wbs-fe-01:test`, port-binding or Node-child-output Vitest                                    | Planner only, if its gate selects them | Exit 0; the executor preamble forbids these sandbox-dependent tests. Run any multi-file Vitest serially with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.                                                                    |
| `bin/h2puni-gate.sh <final-sha>`                                                                                                     | Planner on h2puni                      | Exit 0, after it prints `h2puni gate: running on <final-sha>`; not available in the executor sandbox or this scratch rehearsal.                                                                                                |

The installed-package type and runtime probe must include `moduleLabel`, `moduleInstallations`, `installationId`, `parentInstallationId`, and `moduleInstallationId`; compare exact labels, including `undefined`, and verify `Reflect.set` cannot alter the getter. A snapshot-only consumer joins IDs rather than splitting a `bindingLabel` string. No test in this packet binds a port or asserts on a Node child's Bun socket-pipe text.

Stop if the published 0.5.1 package lacks any promised field, if either forgery does not pass the old check, if a new-check failure names a different fact, if a twin still fails, if a named test runs zero tests, if the install changes any other owner package, or if a required focused lint/typecheck/validation fails after allowed formatting fixes. Record an ordinary planner-only failure as pending planner verification; never reinterpret it as green.

## 9.1 Three-mode patch application check (planner)

Run this from a planner checkout **after this packet is committed**, before dispatch. It checks the exact fenced diffs, including additions, in three modes. Mode 1 varies the executor-owned date and verification text. Slice 2 excludes `verify.md` because each executor writes its own observations there; all other paths are byte-exact. `REAL_BASE` is the actual planning commit; leaving it unset is a skipped mode, not proof. The script uses scratch Git objects and is planner-only.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-26-batch-8/di-bag-051-labels.md
work=$(mktemp -d "${TMPDIR:?}/di-bag-051-modes-XXXXXX")
extract() {
  awk -v marker="### Slice $1 patch" '
    $0 == marker { section=1; next }
    section && $0 == "```diff" { inside=1; next }
    inside && $0 == "```" { exit }
    inside { print }
  ' "$packet" > "$work/slice$1.patch"
}
extract 1
extract 2
for mode in 0 1 real; do
  if test "$mode" = real && test -z "${REAL_BASE:-}"; then
    echo 'fill=real: skipped (REAL_BASE unset)'
    continue
  fi
  base=726bc0463
  if test "$mode" = real; then base=$REAL_BASE; fi
  git clone --no-local . "$work/$mode" >/dev/null 2>&1
  git -C "$work/$mode" checkout -q "$base"
  git -C "$work/$mode" apply --check "$work/slice1.patch"
  git -C "$work/$mode" apply "$work/slice1.patch"
  if test "$mode" = 1; then
    sed -i 's/created: 2026-09-26/created: 2026-10-01/' \
      "$work/$mode/openspec/changes/di-bag-label-surface/.openspec.yaml"
    printf '\nSimulated executor observation, 2026-10-01.\n' \
      >> "$work/$mode/openspec/changes/di-bag-label-surface/verify.md"
  fi
  git -C "$work/$mode" apply --exclude=openspec/changes/di-bag-label-surface/verify.md \
    --check "$work/slice2.patch"
  git -C "$work/$mode" apply --exclude=openspec/changes/di-bag-label-surface/verify.md \
    "$work/slice2.patch"
  test "$(git -C "$work/$mode" diff --name-only | wc -l)" -eq 8
  test "$(git -C "$work/$mode" ls-files --others --exclude-standard | wc -l)" -eq 5
  echo "fill=$mode: slice1=applies slice2=applies tracked=8 new=5"
done
````

Rehearsal output on base `726bc0463` (the `real` run used that SHA as its stand-in):

```text
fill=0: slice1=applies slice2=applies tracked=8 new=5
fill=1: slice1=applies slice2=applies tracked=8 new=5
fill=real: slice1=applies slice2=applies tracked=8 new=5
```

The planner reruns with `REAL_BASE=<planning-sha>` and records that third line again. If another packet edits an owned path, re-rehearse the merged base instead of waiving a failed patch. The planner also compares the owned paths' final bytes with rehearsal commit `35f347ac` except for the executor-filled `verify.md` and the varied `.openspec.yaml` date; those two preserve their schema and observed entries.

## 9.2 Planner-only checks and hand-over

After each slice commit, run the moved CLI's `check-indexes committed . <sha>`. After slice 2, run whole `tool-devsync:test` on a same-mount host and the normal host gate on the final SHA. The scratch full-suite failure above is the preamble's cross-device limitation, not a green result. Record the host outputs in `verify.md` and make a separate planner follow-up commit if the observations change that file; do not amend a green slice without rerunning §9.1 on its final tree. A new file under a module directory would need its module-index README updated; this packet creates none.

## Dispatch

The launcher path is the one public-document exception for absolute workstation paths. Commit this packet on the planning branch before dispatch. Substitute the actual planning SHA and then each green slice SHA; do not run the next slice on an uncommitted attempt. The executor's baseline is its own installed 0.5.0 clone. Only slice 2 has registry network.

```sh
REAL_BASE=<planning-sha> bash <section-9.1-script-saved-under-TMPDIR>
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium \
  /home/df/wd/puni/puni-plan/exec/run-executor.sh di-bag-051-labels 1 <planning-sha> \
  --batch batch-8 --driver codex
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium \
  /home/df/wd/puni/puni-plan/exec/run-executor.sh di-bag-051-labels 2 <slice-1-sha> \
  --batch batch-8 --driver codex --network
```

Each planner commit uses the slice subject and these trailers, with hooks active:

```text
Co-Authored-By: Codex gpt-6-sol <noreply@openai.com>
Planned-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Open questions: none. If the real base moved, §9.1 determines whether a new patch rehearsal is needed; the executor must not improvise around drift.
