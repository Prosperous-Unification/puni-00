# 040.6 I — Label agreement and the closing ledger

| Field      | Value                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — sixteenth and last packet                                                                                                                                                |
| Size class | S, in two slices                                                                                                                                                                                                                                                    |
| Slices     | 1 adds `tools/tool-devsync/src/module-labels.test.ts`, the one check that every sealed module's label, identifier, README index, pilot row and boundary and `kinds.json` shim rows agree; 2 records it and the task-7 ledger                                        |
| Implements | `openspec/changes/adopt-di-composition/tasks.md` new task 7.6 (ticked), 7.2 and 7.4 (ticked by evidence and by the ledger), 7.1 and 7.3 (recorded open, each with a named follow-up), and one new spec scenario                                                     |
| Planned on | 2026-09-24; both slices rehearsed end to end and committed on a throwaway branch (`rehearse/040-6-i-r2`, after the round-1 review) cut from `e8ef4758` (planning `473d00db` merged with packet G's real lane `e2ae2520`, then packet H's four r3 rehearsal commits) |

**Dates.** Every `Proof:` comment and task note below carries the planner's rehearsal date,
2026-09-24. Write the date you actually observe (`date -u +%F`) when you add them; if it differs,
change only the date inside the lines you insert.

**You execute one slice and stop.** The end of your instructions names which. Each slice in section
7 opens with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Dispatch.** The checkout the launcher clones from must contain this packet file
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-i-label-agreement.md` must
print an entry) and must descend from packet H's slice-4 planner commit. This packet was rehearsed
on `e8ef4758`, whose H files are H's r3 rehearsal tree; H's real commits differ from it in H's own
`Proof:` dates and its `verify.md`. No hunk of this packet has an H line as context: slice 2's
`tasks.md` hunks sit on tasks 7.1 to 7.4 and after the last line of the file, which is packet E3's.
The check itself reads H's two README indexes, pilot rows, boundaries and `kinds.json` rows, so
**before dispatch the planner reruns section 15's script against the real base** in its apply-only
form (the same script with `same_as` replaced by `git add -A`, then
`git diff --cached --stat <rehearsal slice-2 sha>` must list only files this packet does not touch)
and runs the new check once on the result (`5 pass`). A refusal there is re-cut by the planner,
never repaired by the executor. This packet cites no pre-namespacing path, so it needs no
`legacy-root` exemption entry. Every count below was measured on `e8ef4758`; every comparison is
relative to the slice's own step 0. Slice 1:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-i-label-agreement 1 <packet-containing commit sha> --batch batch-6 --require-ancestor <H slice-4 planner commit> --driver claude --slice-note 'reviewed base <sha>' --preserve evidence
```

Slice 2 resumes the clone slice 1 built:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-6-i-label-agreement 2 <the same sha> --batch batch-6 --resume --require-ancestor <slice 1 planner commit> --driver claude --slice-note 'reviewed base <sha>' --preserve evidence
```

Nothing here binds a port, spawns a process outside Bun's test runner or needs the network, so **no
slice needs `--network`**. No slice reads an earlier attempt's evidence, only the committed tree, so
**no slice needs `--seed`**. Neither slice edits a file the wiki pilot suite reads, and the pilot
reads the committed `HEAD`; it is the planner's (section 8).

## 1. Goal and non-goals

**Goal.** Close what 040.6 deferred and what its ledger still owes, without a new module:

- **Label agreement (new task 7.6).** Packet D cut, after four review rounds, a check that a module's
  README `moduleId` names the label its `buildModule` call seals under, because every source-reading
  version was bypassed (see D's "Deferred: label agreement"). This packet adds the check in a form
  that reads nothing from source: `tools/tool-devsync/src/module-labels.test.ts` derives each
  module's identifier from where it lives and requires that the running library, the README index,
  the pilot row and boundary, and every `kinds.json` shim row naming the module all agree with it.
- **The ledger (tasks 7.1 to 7.4).** 7.2 is closed by evidence (two existing `service-kinds` tests
  and the new check's `kinds.json` half); 7.4 is closed by a per-module table in `design.md`; 7.1 and
  7.3 stay open, each with the measured reason and a named follow-up (section 9), because each needs
  code or build configuration, not a ledger entry.

**Non-goals.**

- No new module, no module file edit, no library or pin change: `di-bag` stays 0.4.0, and no
  `bun.lock`, `package.json`, `kinds.json`, `modules.json` or `policy.json` line changes.
- No shim deletion (7.1), no per-module type-check target (7.3), no K2 or K3 closure (7.4 records
  them), no task 3.3 or 3.6 work (3.3 stays E5's declared non-goal; 3.6's repository ports are
  packet H's section 9 item 1).
- No frontend module: `apps/wbs/fe-01/src/modules/preferences` seals under `frontend.preferences`
  but its README carries no index block; its agreement is 050.7's (section 9).

## 2. Read first

| File                                                                                                               | Why                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                       | Rules R1 to R5.                                                                          |
| `docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`, its "Deferred: label agreement"          | The two bypasses a label check must defeat, and the two routes it names.                 |
| `tools/tool-devsync/src/service-kinds.ts` and its test                                                             | The sibling check over `kinds.json`; task 7.2's evidence.                                |
| `libs/wbs/application/core/src/module/capacity/`                                                                   | The module every fault below targets: its contract label, `module.ts`, README and tests. |
| `node_modules/di-bag/dist/module.d.ts`, `inspection.d.ts`                                                          | Where di-bag keeps a label, and which bindings `inspectGraph()` reports as private.      |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`, "Standard blocks every packet uses" — "OpenSpec validation" | The exact `jq -s -e` contract both slices use.                                           |

## 3. Verified facts

Every line was read, or the command run, in a private worktree of `e8ef4758` on 2026-09-24.

| Fact                                                                                                                                                                                                                                                                                                                                                                                     | Evidence                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Eighteen sealed modules**: fifteen directories under `libs/wbs/application/core/src/module/`, three under `apps/wbs/be-01/src/module/`. Each `module.ts` has exactly one `export` (`export const <name>Module = DiBag.createBuilder()`), and each directory name is the identifier's last segment.                                                                                     | `ls`; `grep -n '^export'`            |
| **Each label is a contract constant**, `<NAME>_LABEL = '<ring or runtime>.<name>'`, passed as `{ label: <NAME>_LABEL }`. Each module's own tests compare `inspectGraph()` against that same constant, so renaming the constant keeps them green (row 1): no existing check ties the label to the README, the pilot or `kinds.json`.                                                      | `grep -n`; rehearsed                 |
| **di-bag 0.4.0 keeps a label out of reach.** `Module` stores it in a module-private `WeakMap` (`dist/module.js`); `inspectGraph()` names a private binding `<label>/<key>` and an exported one by its bare key; `BindingSnapshot.keys` is "empty for a private module binding" (`dist/inspection.d.ts`). A builder with no requirements registered still builds and describes its graph. | read; rehearsed                      |
| **Installed from tool-devsync, all eighteen report their private bindings**: twenty in all (Authentication and Realtime two each), every one `<label>/<identifier>`. Importing every module file and every shim from `tools/tool-devsync` resolves the `@wbs/*` aliases and takes about one second.                                                                                      | rehearsed                            |
| **Pilot.** `modules.json` and `policy.json` hold 22 rows and 22 boundaries; 16 of each name a module directory (all but Plan document and Plan import, task 7.5), each row's `indexPath` is `<directory>/README.md`, each boundary is `boundary.<label>` with selector `{ "kind": "prefix", "value": <directory> }`.                                                                     | `python3`                            |
| **Kinds.** `kinds.json` holds 87 entries; 33 are shim rows whose disposition ends `the <name> module directly` (5 under be-01, 28 under the core), naming all eighteen modules between them.                                                                                                                                                                                             | `python3`                            |
| **tool-devsync is the home.** Its `test` target's inputs already include every app and library source, `docs/wiki-policy/*.json` and `{workspaceRoot}/**/*`; `service-kinds.test.ts` already reads `kinds.json` there. The new file contains no pre-namespacing root, so `repo-namespacing-handoff.test.ts`'s legacy pin does not move.                                                  | `project.json`; rehearsed (`1 pass`) |
| **Task 7.1's measurement.** A module-specifier scan of every tracked `.ts`/`.tsx` found no importer of eight be-01 forwarding shims (`assumed-assignee`, `clean-name`, `compensating`, `dependency`, `directory-usage`, `history.service`, `optimizer-trigger-broadcaster`, `retention-timer`); `git grep` for each basename agreed.                                                     | `python3`; `git grep`                |
| **Baselines.** `tool-devsync` lint and typecheck exit 0; `service-kinds.test.ts` `17 pass`; the legacy pin `1 pass`; OpenSpec `114` passed; `proposal.md` 397 words.                                                                                                                                                                                                                     | rehearsed                            |

## 4. Design

**What the check derives.** A module's identity comes from its location, the grammar the proposal
records: under `libs/wbs/application/core/src/module/<name>` it is `module.application.<name>`, under
`apps/wbs/be-01/src/module/<name>` it is `module.backend.<name>`, and the label drops `module.`.
Nothing a module says about itself is trusted to define it.

**What must agree with it**, one test each, every mismatch collected into one list so a fault names
exactly what drifted:

1. **The sealed label, read from the running library.** `module.ts` must export exactly one value;
   it is installed into an empty builder, and every binding `inspectGraph()` reports with no public
   key must be named `<label>/<identifier>`, with at least one such binding. This is packet D's route
   2 without its weakness: the label is observed, not parsed. D's review-4 cases fall away by
   construction: an intersection-typed decoy beside the real module is a second exported value, and
   an exported key containing a slash carries a public key, so it is never read as private. A label
   with a slash in it, or a labelled outer module around a labelled inner one, puts something other
   than one identifier after the label and fails too; an **unlabelled** outer module around an inner
   one sealed under the right label does not (next paragraph but one). The label is observable only
   through private bindings, so every module keeps at least one by convention; a module exporting
   every binding is refused as sealing none.
2. **The README index**: the README holds exactly one `<!--` at all, on a line spelled
   `<!-- module-index {…} -->`, whose `moduleId` is the identifier. The wiki's own reader
   (`apps/wiki/cli/src/indexes/read-indexes.ts`) takes any HTML comment containing `module-index`,
   however spaced, across lines, and never inside a code fence; rather than reimplement that
   grammar (its `mdast` packages are hoisted but declared by no manifest this project may import
   from), the check admits only the one spelling both readers agree on and refuses any second or
   respelled comment, fenced or not.
3. **The pilot**: either a `modules.json` row with that `moduleId` and `indexPath`
   `<directory>/README.md` and a `policy.json` boundary `boundary.<label>` selecting exactly
   `<directory>`, or neither; the modules with neither must be exactly Plan document and Plan import
   (task 7.5's two). Conversely, a row whose `indexPath` lies in a module directory must carry that
   directory's identifier. So a module that skips task 7.5 now fails, the registration discovery
   packet D said nothing did.
4. **`kinds.json`**: every shim row whose disposition names `the <name> module` must name a sealed
   module of its own project (core rows `application`, be-01 rows `backend`), and every runtime value
   the shim exports must be, by identity, a value some non-test file of that module exports. Every
   other disposition containing `re-export shim` must be one of the three library-forwarding forms
   `kinds.json` uses today (`@wbs/core directly`, `@wbs/core/service/<file> directly`,
   `@wbs/runtime-portable directly`), so a reworded row is refused, not skipped. At least one row
   must name a module, so a pattern that drifts from the rows cannot pass on nothing.

**Why runtime identity and not a TypeScript program** (addendum 18). The rule concerns a value the
library computes, not the shape of an import, so the strongest identity available is the library's
own report and the values themselves. A type-level reading of the `label` property is weaker, not
stronger: a cast can lie about a literal type, and the runtime would not notice.

**What it does not keep** (addendum 20), stated in the file's JSDoc and in `design.md`:

- di-bag 0.4.0 exposes a label only as the prefix of private binding names, so a module that drops
  its label and either spells `<label>/<key>` into a private key or installs an inner module sealed
  under that label reads as labelled (`dist/module.js`'s `labelOf` leaves an installed module's
  already-prefixed names untouched when the outer module has no label). Both take a deliberate
  construction, not a drift; closing them needs a label the library itself exposes, which is the
  di-bag migration's (D's route 1).
- Private registration keys are read as identifiers (`[A-Za-z_$][A-Za-z0-9_$]*`); a key outside that
  form is refused as not under the label.
- `sealedModules()` follows symbolic links (`stat`), so a linked module directory is read, not
  skipped.
- Primitive shim exports (`TOKEN_TTL_SECONDS` and the like) are compared by value, so a number could
  match another module's equal number. Every shim also exports a class or function, which cannot.
- `check.ts` is not read: that it installs the value `module.ts` exports is each module's own tests'
  business, and they import both.
- The frontend's `apps/wbs/fe-01/src/modules` is not scanned (section 1).

**Why no interleaving or model-based test** (addenda 15 and 16): nothing here has an owner, queue,
lock or retry; the check is a read-only pass over files and one library call per module.

**The ledger.** Task 7.2's two rules are already tests (`service-kinds.test.ts`'s `no entry
classifies a file that already declares its kind by suffix` and `every backend service file with no
kind suffix is classified exactly once`), green on this tree; 7.6 adds the third thing 7.2 implies,
that a shim row names its real owner. Task 7.4's obligations are all already disclosed, module by
module, in each `contract.ts` (Authentication's and Saved plans' K2 lines in tasks 3.5 and 3.3); the ledger collects them into one table with an owner per row. Tasks
7.1 and 7.3 are recorded open: shim retirement changes code, `kinds.json` and whatever pins count
those files, and 18 per-module type-check targets are build configuration across two projects, each
with its own negative. Both are named follow-ups (section 9), not this packet's growth.

## 5. File plan

`d` is `tools/tool-devsync/src/module-labels.test.ts`; `c` is
`libs/wbs/application/core/src/module/capacity`; `o` is `openspec/changes/adopt-di-composition`.

| Path                                                                                                                                                | Slice | Action                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `d`                                                                                                                                                 | 1     | create from the listing of 10.1; after rows 3-22 are observed, apply 10.2    |
| `o/verify.md`                                                                                                                                       | 1, 2  | each slice appends its own observations                                      |
| `o/tasks.md`, `o/design.md`, `o/proposal.md`, `o/specs/di-composition/spec.md`                                                                      | 2     | 10.3, 10.4, 10.5, 10.6                                                       |
| `c/contract.ts`, `c/module.ts`, `c/README.md`, `docs/wiki-policy/modules.json`, `docs/wiki-policy/policy.json`, `docs/code-organization/kinds.json` | 1     | **fault targets only**: each is mutated, observed and restored byte for byte |

## 6. Rehearsed observations

Every row was produced in a private worktree of `e8ef4758`, against the exact listing of 10.1 before
10.2's `Proof:` diff, each fault restored with `cp` + `cmp` before the next. A fault is written for
section 7's helpers as _file: "exact substring" → "replacement"_ (`swap.py`, which refuses unless the
substring occurs exactly once), as a line _appended_, or as a JSON record _dropped_ (`drop.py`).
`d`, `c` as in section 5; `M` is `docs/wiki-policy/modules.json`, `P` `docs/wiki-policy/policy.json`,
`K` `docs/code-organization/kinds.json`.

````text
label         c/contract.ts: "'application.capacity';" -> "'application.capacities';"
slash         c/contract.ts: "'application.capacity';" -> "'application.capacity/nested';"
dropped       c/module.ts: "], { label: CAPACITY_LABEL });" -> "]);"
decoy         append to c/module.ts: "export const decoy = capacityModule;"
private       d: "binding.keys.length === 0" -> "binding.keys.length < 0"
index         c/README.md: '"moduleId":"module.application.capacity"' -> '"moduleId":"module.application.capacities"'
twice         append to c/README.md: its own third line (the index block)
fence         append to c/README.md: a ```md fence holding its own third line
spaced        c/README.md: '<!-- module-index {' -> '<!--module-index {'
row           M: '"moduleId": "module.application.capacity",' -> '"moduleId": "module.application.capacities",'
foreign       M: '"indexPath": "libs/wbs/adapters/store-memory/src/README.md",'
                 -> '"indexPath": "libs/wbs/application/core/src/module/plan-document/README.md",'
boundary      P: '"boundaryId": "boundary.application.capacity",' -> '"boundaryId": "boundary.application.capacities",'
selector      P: '"value": "libs/wbs/application/core/src/module/capacity"'
                 -> '"value": "libs/wbs/application/core/src/module/step"'
unregistered  drop from M the module "module.application.capacity" and from P the boundary "boundary.application.capacity"
absent        K: "the capacity module directly" -> "the capacities module directly"
owner         K: "the capacity module directly" -> "the step module directly"
reworded      K: "the capacity module directly" -> "the capacity module"
pattern       d: " module directly$/;" -> " modules directly$/;"
root          d: "'apps/wbs/be-01/src/module'" -> "'apps/wbs/be-01/src/modules'"
scan          d: "isDirectory()) names.push(entry)" -> "isFile()) names.push(entry)"
````

The four `d` faults break the check's own guards (addendum 4: an unreadable or empty inventory must
fail, not pass). `…` below stands for `libs/wbs/application/core/src`.

| #   | Where                          | Fault        | Test that observed it                                                           | Literal fragment observed                                                                                                                                                                           |
| --- | ------------------------------ | ------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 step 0, unchanged tree | label        | `(cd libs/wbs/application/core && bun test ./src/module/capacity/)`             | `5 pass`, `0 fail`: Capacity's own tests do not see the label drift — the gap this packet closes                                                                                                    |
| 2   | slice 1 green                  | none         | `d`                                                                             | `5 pass`, `0 fail`, `8 expect() calls`                                                                                                                                                              |
| 3   | `c/contract.ts`                | label        | `seals every module under the label its location implies`                       | `+   "…/module/capacity: private binding "application.capacities/capacityOptions" is not under application.capacity",`; `4 pass`, `1 fail`                                                          |
| 4   | `c/contract.ts`                | slash        | the same test                                                                   | `… private binding "application.capacity/nested/capacityOptions" is not under application.capacity`; `4 pass`, `1 fail`                                                                             |
| 5   | `c/module.ts`                  | dropped      | the same test                                                                   | `… private binding "capacityOptions" is not under application.capacity`; `4 pass`, `1 fail`                                                                                                         |
| 6   | `c/module.ts`                  | decoy        | the same test                                                                   | `error: …/module/capacity/module.ts exports 2 values, expected 1`; `4 pass`, `1 fail`                                                                                                               |
| 7   | `d`                            | private      | the same test                                                                   | eighteen lines `…: seals no private binding`, one per module; `4 pass`, `1 fail`                                                                                                                    |
| 8   | `c/README.md`                  | index        | `indexes every module under the identifier its location implies`                | `+   "…/module/capacity: README names module.application.capacities",`; `4 pass`, `1 fail`                                                                                                          |
| 9   | `c/README.md`                  | twice        | the same test                                                                   | `error: …/module/capacity/README.md holds 2 HTML comments, expected 1`; `4 pass`, `1 fail`                                                                                                          |
| 10  | `c/README.md`                  | fence        | the same test                                                                   | the same line as row 9; `4 pass`, `1 fail` (the wiki ignores a fenced copy; the check refuses it rather than read it)                                                                               |
| 11  | `c/README.md`                  | spaced       | the same test                                                                   | `error: …/module/capacity/README.md's one HTML comment is not a module-index line`; `4 pass`, `1 fail` (the wiki would still read this block)                                                       |
| 12  | `M`                            | row          | `registers every module in the pilot under that identifier, or is known not to` | exactly `"…/module/capacity: modules.json does not index it once as module.application.capacity"` and `"modules.json: module.application.capacities indexes …/module/capacity"`; `4 pass`, `1 fail` |
| 13  | `M`                            | foreign      | the same test                                                                   | exactly `"modules.json: module.adapter.store-memory indexes …/module/plan-document"`; `4 pass`, `1 fail`                                                                                            |
| 14  | `P`                            | boundary     | the same test                                                                   | exactly `"…/module/capacity: policy.json does not select it once as boundary.application.capacity"`; `4 pass`, `1 fail`                                                                             |
| 15  | `P`                            | selector     | the same test                                                                   | the same line as row 14; `4 pass`, `1 fail`                                                                                                                                                         |
| 16  | `M` and `P`                    | unregistered | the same test, its `UNREGISTERED` assertion                                     | `+   "module.application.capacity",` (`Expected - 0`, `Received + 1`); `4 pass`, `1 fail`                                                                                                           |
| 17  | `K`                            | absent       | `names in kinds.json only the module that owns every export of the shim`        | exactly `"…/service/capacity.service.ts: names no sealed module capacities"`; `4 pass`, `1 fail`                                                                                                    |
| 18  | `K`                            | owner        | the same test                                                                   | exactly `"…/service/capacity.service.ts: re-exports what …/module/step does not export"`; `4 pass`, `1 fail`                                                                                        |
| 19  | `K`                            | reworded     | the same test                                                                   | exactly `"…/service/capacity.service.ts: re-export shim disposition matches no known form"`; `4 pass`, `1 fail`                                                                                     |
| 20  | `d`                            | pattern      | the same test, its row-count assertion                                          | `Expected: > 0`, `Received: 0`; `4 pass`, `1 fail`                                                                                                                                                  |
| 21  | `d`                            | root         | every test in `d`                                                               | `ENOENT: no such file or directory, scandir '…/apps/wbs/be-01/src/modules'`; `0 pass`, `5 fail`                                                                                                     |
| 22  | `d`                            | scan         | every test in `d`                                                               | `error: libs/wbs/application/core/src/module holds no module directory`; `0 pass`, `5 fail`                                                                                                         |
| 23  | slice 1 end                    | none         | `d`; `tool-devsync` lint and typecheck; `service-kinds.test.ts`; the legacy pin | `5 pass`; exit 0 and 0; `17 pass`; `1 pass`                                                                                                                                                         |
| 24  | slice 2 end                    | none         | OpenSpec block; `wc -w` of `proposal.md`; `d`                                   | `114` passed, `0` failed; `398`; `5 pass`                                                                                                                                                           |

Each assertion has its own mutation: rows 3 to 5 break the sealed label three ways, row 6 its
cardinality and row 7 the private-binding filter; rows 8 to 11 the README's identifier, its comment
count (a second block and a fenced copy) and its one permitted spelling; rows 12 to 16 each clause of
the pilot test (forward row, reverse row, boundary id, boundary selector, the unregistered list);
rows 17 to 20 each clause of the `kinds.json` test (unknown module, wrong owner, unknown form, row
count); rows 21 and 22 the discovery guards. Rows 12 to 16 name the pilot's own files; the wiki
pilot suite would also refuse most of those mutations, but slowly and from `HEAD`, and it never
compares the label.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses with
`if cmd >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"`;
never read a status through `tee`, never `|| true`. Start lint, typecheck and format targets the
same way and poll their logs (preamble rule 19). Scratch lives only under `"$TMPDIR"`, faults and
failing output under `"$TMPDIR/evidence"`; `verify.md` cites basenames only. You never run
`git add`, `git commit`, `git stash` or any other command that changes Git state (`git show`,
`git diff`, `git log` and `git ls-files` only read). Every step 0 opens with `base=$(git rev-parse HEAD)`
and an empty-status check. Shell state does not persist between your tool calls: every block below
starts by setting what it uses. `d` is `tools/tool-devsync/src/module-labels.test.ts` and `c` is
`libs/wbs/application/core/src/module/capacity`.

A fenced diff from section 10 is applied by copying it verbatim into a file and running, on two
separate lines under `set -e`, `git apply --check <file>` and then `git apply <file>`. A listing is
written verbatim as the file's whole content. After appending to `verify.md`, run
`GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md`
before the format check. Strip terminal colour codes before quoting a fragment
(`sed 's/\x1b\[[0-9;]*m//g'`).

**The helpers.** Write them once per attempt:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
cat >"$TMPDIR/swap.py" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
if text.count(old) != 1:
    sys.exit(f'{path}: {text.count(old)} occurrence(s) of {old!r}, wanted exactly 1')
open(path, 'w').write(text.replace(old, new))
PY
cat >"$TMPDIR/drop.py" <<'PY'
import json, sys
path, key, field, value = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
document = json.load(open(path))
kept = [record for record in document[key] if record.get(field) != value]
if len(kept) != len(document[key]) - 1:
    sys.exit(f'{path}: {len(document[key]) - len(kept)} {key} with {field} {value!r}, wanted exactly 1')
document[key] = kept
open(path, 'w').write(json.dumps(document, indent=2) + '\n')
PY
cat >"$TMPDIR/observe.sh" <<'SH'
#!/usr/bin/env bash
# observe.sh <row> <file>... -- <fault command...>
# Copies each file aside, injects the fault, saves the patch and the check's output under
# $TMPDIR/evidence, restores every file and proves each restore with cmp.
set -uo pipefail
row=$1; shift; files=()
while [[ $1 != -- ]]; do files+=("$1"); shift; done; shift
keep="$TMPDIR/orig/$row"; mkdir -p "$keep"
for file in "${files[@]}"; do cp "$file" "$keep/$(printf '%s' "$file" | tr / _)"; done
if ! "$@"; then echo "STOP: the fault for $row was refused"; exit 9; fi
: >"$TMPDIR/evidence/$row.patch"
for file in "${files[@]}"; do
  if diff -u "$keep/$(printf '%s' "$file" | tr / _)" "$file" >>"$TMPDIR/evidence/$row.patch"; then
    echo "STOP: the fault for $row changed nothing in $file"; exit 9
  else status=$?; [[ $status -eq 1 ]] || { echo "STOP: diff exited $status"; exit 9; }; fi
done
log="$TMPDIR/evidence/$row.log"
if (cd tools/tool-devsync && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../test/scratch/preload.ts ./src/module-labels.test.ts) >"$log" 2>&1; then status=0; else status=$?; fi
printf 'exit=%s\n' "$status" >>"$log"
for file in "${files[@]}"; do
  cp "$keep/$(printf '%s' "$file" | tr / _)" "$file"
  cmp "$file" "$keep/$(printf '%s' "$file" | tr / _)" || { echo "STOP: restore of $file failed"; exit 9; }
done
sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -E '^\(fail\)|^\+ |^error|ENOENT|Expected: |Received: |^ *[0-9]+ (pass|fail)$|^exit='
SH
chmod +x "$TMPDIR/observe.sh"
```

`observe.sh` prints the decisive lines; its last `grep` exits 1 only if it found none, which never
happens for a run that reached Bun. A row is observed when the printed lines agree with section 6
(preamble rule 20: the fact, not the matcher's wording). Quote each fault exactly as written in step
3 below; a substring holding `'` is passed in double quotes.

### Slice 1 — The label-agreement check

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
test ! -e tools/tool-devsync/src/module-labels.test.ts && echo "gate: check absent"
test -f apps/wbs/be-01/src/module/solver-supervisor/check.ts && echo "gate: H landed"
grep -c '"moduleId": "module.backend.solver-supervisor"' docs/wiki-policy/modules.json
ls libs/wbs/application/core/src/module | wc -l
ls apps/wbs/be-01/src/module | wc -l
```

Expect `base=…`, the three gates, then `1`, `15` and `3`. If any differs, stop. Then, each under
the status wrapper with its log under `"$TMPDIR/evidence/slice1-…-baseline.log"`:

```sh
NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache
(cd tools/tool-devsync && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../test/scratch/preload.ts ./src/service-kinds.test.ts)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "every legacy source occurrence"
```

Expect exit 0 for all four. Call the `service-kinds.test.ts` pass count `S` (observed `17`); the
legacy pin reads `1 pass`. Run the OpenSpec validation standard block and call `passed` `N`
(observed `114`).

1. **The red on unchanged code (row 1).** Write the helpers, then show that nothing today notices a
   label drift:

   ```sh
   set -euo pipefail
   c=libs/wbs/application/core/src/module/capacity
   mkdir -p "$TMPDIR/orig/gap"; cp "$c/contract.ts" "$TMPDIR/orig/gap/contract.ts"
   python3 "$TMPDIR/swap.py" "$c/contract.ts" "'application.capacity';" "'application.capacities';"
   log="$TMPDIR/evidence/gap.log"
   if (cd libs/wbs/application/core && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./src/module/capacity/) >"$log" 2>&1; then status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"
   cp "$TMPDIR/orig/gap/contract.ts" "$c/contract.ts"; cmp "$c/contract.ts" "$TMPDIR/orig/gap/contract.ts"
   tail -5 "$log"
   ```

   Expect `5 pass`, `0 fail`, `exit=0`: Capacity's own tests compare against the constant they
   import, so they cannot see it drift. If this run fails, stop: the tree differs from the rehearsal.

2. **The check.** Write the listing of 10.1 verbatim to `tools/tool-devsync/src/module-labels.test.ts`,
   then run it under the status wrapper:

   ```sh
   (cd tools/tool-devsync && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test --preload ../test/scratch/preload.ts ./src/module-labels.test.ts)
   ```

   Expect row 2: `5 pass`, `0 fail`, `8 expect() calls`. A failure here names the drift on the real
   base (for example a README of packet H's real lane that differs from its rehearsal): stop and
   report the lines; do not edit any module, README or JSON file.

3. **The negatives, rows 3 to 22**, one `observe.sh` call each, in this order, from the repository
   root, in one shell with `set -uo pipefail` and these variables set:

   ```sh
   set -uo pipefail
   d=tools/tool-devsync/src/module-labels.test.ts
   c=libs/wbs/application/core/src/module/capacity
   M=docs/wiki-policy/modules.json; P=docs/wiki-policy/policy.json; K=docs/code-organization/kinds.json
   o="$TMPDIR/observe.sh"; s="python3 $TMPDIR/swap.py"
   $o label "$c/contract.ts" -- $s "$c/contract.ts" "'application.capacity';" "'application.capacities';"
   $o slash "$c/contract.ts" -- $s "$c/contract.ts" "'application.capacity';" "'application.capacity/nested';"
   $o dropped "$c/module.ts" -- $s "$c/module.ts" "], { label: CAPACITY_LABEL });" "]);"
   $o decoy "$c/module.ts" -- bash -c "printf '%s\n' 'export const decoy = capacityModule;' >>\"$c/module.ts\""
   $o private "$d" -- $s "$d" "binding.keys.length === 0" "binding.keys.length < 0"
   $o index "$c/README.md" -- $s "$c/README.md" '"moduleId":"module.application.capacity"' '"moduleId":"module.application.capacities"'
   $o twice "$c/README.md" -- bash -c "sed -n 3p \"$c/README.md\" | grep -q '^<!-- module-index ' && sed -n 3p \"$c/README.md\" >>\"$c/README.md\""
   $o fence "$c/README.md" -- bash -c "sed -n 3p \"$c/README.md\" | grep -q '^<!-- module-index ' && { printf '%s\n' '\`\`\`md'; sed -n 3p \"$c/README.md\"; printf '%s\n' '\`\`\`'; } >>\"$c/README.md\""
   $o spaced "$c/README.md" -- $s "$c/README.md" '<!-- module-index {' '<!--module-index {'
   $o row "$M" -- $s "$M" '"moduleId": "module.application.capacity",' '"moduleId": "module.application.capacities",'
   $o foreign "$M" -- $s "$M" '"indexPath": "libs/wbs/adapters/store-memory/src/README.md",' '"indexPath": "libs/wbs/application/core/src/module/plan-document/README.md",'
   $o boundary "$P" -- $s "$P" '"boundaryId": "boundary.application.capacity",' '"boundaryId": "boundary.application.capacities",'
   $o selector "$P" -- $s "$P" '"value": "libs/wbs/application/core/src/module/capacity"' '"value": "libs/wbs/application/core/src/module/step"'
   $o unregistered "$M" "$P" -- bash -c "python3 \"$TMPDIR/drop.py\" \"$M\" modules moduleId module.application.capacity && python3 \"$TMPDIR/drop.py\" \"$P\" boundaries boundaryId boundary.application.capacity"
   $o absent "$K" -- $s "$K" 'the capacity module directly' 'the capacities module directly'
   $o owner "$K" -- $s "$K" 'the capacity module directly' 'the step module directly'
   $o reworded "$K" -- $s "$K" 'the capacity module directly' 'the capacity module'
   $o pattern "$d" -- $s "$d" ' module directly$/;' ' modules directly$/;'
   $o root "$d" -- $s "$d" "'apps/wbs/be-01/src/module'" "'apps/wbs/be-01/src/modules'"
   $o scan "$d" -- $s "$d" "isDirectory()) names.push(entry)" "isFile()) names.push(entry)"
   ```

   Compare each call's printed lines with its section 6 row before the next (running them one tool
   call at a time is fine; each call restores its own files). `exit=1` on every row. `STOP:` from the
   helper is a stop condition. Then confirm nothing is left mutated:
   `git status --porcelain --untracked-files=all` lists only `?? tools/tool-devsync/src/module-labels.test.ts`,
   and the check reruns `5 pass`.

4. **Proofs.** Only after rows 3 to 22 were each observed, apply 10.2 (the `Proof:` comments),
   changing only dates if yours differ. Rerun the check → `5 pass`, `0 fail`.

5. **Slice-end checks (row 23).** Under the status wrapper: `tool-devsync:lint` and
   `tool-devsync:typecheck` → exit 0; `bunx prettier --check tools/tool-devsync/src/module-labels.test.ts`
   → exit 0; `service-kinds.test.ts` → `S` pass, `0 fail`; the legacy pin → `1 pass` (the new file
   holds no pre-namespacing root, so no pinned number moves; if one does, stop). Do **not** run the
   whole `tool-devsync:test` target: it writes Git objects (planner-only, section 8). If lint reports
   only `simple-import-sort` or `prettier/prettier` diagnostics in `d`, preamble rule 17 applies.

6. Append `### Label agreement, Slice 1 — <date>` to `verify.md`: `base`, the four baselines and `N`,
   row 1, rows 2 to 22 each with its evidence basename and the decisive fragment you saw, row 23.
   Prettier on it, then `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

7. Hand-over as section 12's slice-1 lists: `git diff --name-only "$base"` plus
   `git ls-files --others --exclude-standard`.

Planner commit: `test(devsync): check that every sealed module's label, index, pilot rows and kinds rows agree`.

### Slice 2 — Record label agreement and the closing ledger

**Step 0.**

```sh
set -euo pipefail
base=$(git rev-parse HEAD); echo "base=$base"
test -z "$(git status --porcelain --untracked-files=all)" && echo "gate: clean tree"
git log -1 --format=%H -- tools/tool-devsync/src/module-labels.test.ts
o=openspec/changes/adopt-di-composition
test -f "$o/tasks.md" && test -f "$o/design.md" && test -f "$o/proposal.md" && test -f "$o/specs/di-composition/spec.md" && echo "gate: four files"
wc -w < "$o/proposal.md"
test -f "$o/tasks.md" && grep -c '^- \[ \] 7\.[1-4] ' "$o/tasks.md"
```

Expect `base=…`, the gate, a commit hash (slice 1's), the second gate, `397` and `4`. If any
differs, stop. Run the OpenSpec block and call `passed` `N` (observed `114`); run the check once →
`5 pass`.

1. Apply 10.3 (`tasks.md`: 7.1 and 7.3 recorded open, 7.2 and 7.4 ticked with dated notes, 7.6
   added and ticked), 10.4 (`design.md`: the "Not decided here" paragraph's last sentences, and two
   new sections, "Label agreement" and "Layering debt ledger"), 10.5 (`proposal.md`: one clause) and
   10.6 (`spec.md`: one scenario), each with `git apply --check` first. A refusal is a stop.
2. `bunx prettier --check` on the four files → exit 0 (no reflow; if Prettier would reflow, stop:
   the tree differs from the rehearsal). `wc -w < openspec/changes/adopt-di-composition/proposal.md`
   → `398` (R4's cap is 400). The OpenSpec block → `passed` `N`, `failed` `0`. The check → `5 pass`
   (it reads none of these files).
3. Append `### Label agreement and the closing ledger, Slice 2 — <date>` to `verify.md`: `base`,
   `N` before and after, the word counts, the check's rerun. Prettier on it, then
   `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.
4. Hand-over as section 12's slice-2 lists.

Planner commit: `docs(openspec): record label agreement and the closing ledger of adopt-di-composition`.

## 8. Planner-only checks

| Check                                                                                                                               | Why the planner's                                                                    | Observed on the rehearsed tree                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Section 15's script against the real base, apply-only, then the check once                                                          | The check reads H's real registration files                                          | see section 15                                                                                                                                 |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged        | Writes Git objects; `service-kinds.test.ts` and the legacy pin read `git ls-files`   | r1: both slice commits `371 pass`, `0 fail` over 26 files; r2 slice-2 commit `371 pass`, `0 fail` over 26 files (37 s); base was `366` over 25 |
| The wiki pilot suite, `apps/wiki/cli` `src/policy/pilot-policy.test.ts` with the trusted `node_modules`, after the planner's commit | Reads `HEAD`; neither slice edits a file it reads, so it is a no-change confirmation | r1 slice-2 commit: `21 pass`, `0 fail`, `309 expect()` calls, exit 0 (304 s); not rerun on r2, whose changes touch no file the pilot reads     |
| `bun run apps/wiki/cli/src/cli.ts check-indexes committed <repository> <slice 2 commit>`                                            | Index validation over committed trees; no index changes here                         | exit 0; 26 indexes, `reviewDebt` empty, on the r1 slice-2 commit; not rerun on r2 (no index changed)                                           |
| `(cd apps/wbs/be-01 && bun test)` (the whole `wbs-be-01:test` command, without coverage)                                            | No be-01 file changes; run once to confirm                                           | `1110 pass`, `1 skip`, `0 fail` over 95 files (89 s), on the r1 slice-2 tree; not rerun on r2 (no be-01 file changed)                          |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                                                                | Whole listener suite                                                                 | **not run**                                                                                                                                    |
| `bin/h2puni-gate.sh <sha>`                                                                                                          | Host-wide heavy lock                                                                 | **not run**                                                                                                                                    |

Stage `tools/tool-devsync/src/module-labels.test.ts` before `tool-devsync:test`: an untracked file is
still run by Bun, but the planner's commit is what the target's cache inputs and the legacy pin's
`git ls-files` see. **Known race, not this packet's:** if `apps/wiki/cli/src/admission/claims.db.test.ts`
› `bounds terminal lock contention and retries until a held write commits` fails, record it and rerun
that file once.

## 9. What follows 040.6

Each is a named follow-up this packet records rather than grows into.

1. **Retire the compatibility shims (task 7.1).** Move the tests of moved code that still sit under
   `service/` next to their owners, point importers at the modules, then delete each shim whose
   importers are gone with its `kinds.json` row. Start with the eight be-01 forwarding shims section 3
   found unimported, confirmed by `service-boundaries.test.ts`'s list, the be-01 `clock.test.ts`'s
   `AGE_THEIR_OWN_ENTRIES` list (it names `retention-timer.ts`) and a staged `tool-devsync:test`.
   Removing the last shim row naming a module is fine: the check requires at least one such row in
   all, not one per module; when none is left, drop that assertion with the rows.
2. **The isolated module type check (task 7.3).** A `tsconfig.json` per module directory and a
   `typecheck:module` target in `wbs-core` and `wbs-be-01`, each with a watched negative (a module
   importing a sibling's private file fails its own target).
3. **K3 resource-services** for the stores the ledger names (Plan history, Bounded replay sweep,
   Realtime, Saved plans, Plan import, Authentication), and **the Optimization repository ports**
   (task 3.6, packet H section 9 item 1, with its model-based test first).
4. **Feature owners (full K2)**, outside this change by its own decision, and **Plan document's
   composition export**, which changes `AppOptions` and the be-01 files that name it (packet E6).
5. **Frontend label agreement** for `apps/wbs/fe-01/src/modules` once 050.7 gives its modules index
   blocks: a third `MODULE_ROOTS` row with segment `frontend`.
6. **A label di-bag exposes itself**, in the di-bag migration, closes the one stated limit of the
   check (section 4).
7. **Before archiving `adopt-di-composition`**, the contracts' "Tracked under task 7.4 of
   `openspec/changes/adopt-di-composition/tasks.md`" sentences name a path archiving moves; repoint
   them to the archived change or the follow-ups above in the same change that archives it.

## 10. Exact content

`d` below is `tools/tool-devsync/src/module-labels.test.ts`. The listing is the file's complete
content; diffs apply with `git apply` from the repository root.

### 10.1 `d` (slice 1 step 2 — no `Proof:` comments)

```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';
import { DiBag, type GraphSnapshot } from 'di-bag';

const WORKSPACE = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * The two directories whose subdirectories are the sealed DI Bag modules of `adopt-di-composition`,
 * and the identifier segment each location implies: a library module carries its ring, a module
 * under an app its runtime word. `apps/wbs/fe-01/src/modules` is outside this change and carries
 * no index block yet, so it is not read here.
 */
const MODULE_ROOTS = [
  { root: 'libs/wbs/application/core/src/module', segment: 'application' },
  { root: 'apps/wbs/be-01/src/module', segment: 'backend' },
] as const;

/**
 * The sealed modules with no content-review pilot registration. Both predecessors postdate the
 * pilot's frozen `sourceRevision`, so no `sourceSelector` can bind them (task 7.5).
 */
const UNREGISTERED = ['module.application.plan-document', 'module.application.plan-import'];

/** The project a `kinds.json` shim row lives in, and the segment of the modules it may name. */
const PROJECTS = [
  { prefix: 'libs/wbs/application/core/', segment: 'application' },
  { prefix: 'apps/wbs/be-01/', segment: 'backend' },
] as const;

/** How a `kinds.json` shim row names the module that owns what it re-exports. */
const SHIM_OWNER =
  /^re-export shim; delete when importers use (?:@wbs\/core or )?the ([a-z0-9-]+) module directly$/;

/**
 * The other shim dispositions `kinds.json` uses, which forward to a library rather than a module.
 * A shim row matching neither this nor {@link SHIM_OWNER} is refused, so rewording a row cannot
 * take it out of the check.
 */
const SHIM_FORWARD =
  /^re-export shim; delete when importers use @wbs\/(?:core(?:\/service\/[a-z0-9.-]+)?|runtime-portable) directly$/;

/** One sealed module directory and the identity its location implies. */
interface SealedModule {
  readonly directory: string;
  readonly moduleId: string;
  readonly label: string;
}

/**
 * Every module directory under {@link MODULE_ROOTS}, sorted within each root. `stat` follows a
 * symbolic link, so a linked module directory is read rather than skipped.
 *
 * @throws When a root is unreadable or holds no directory: a moved root would otherwise read as
 *   "no module disagrees".
 */
async function sealedModules(): Promise<readonly SealedModule[]> {
  const modules: SealedModule[] = [];
  for (const { root, segment } of MODULE_ROOTS) {
    const names: string[] = [];
    for (const entry of await readdir(join(WORKSPACE, root))) {
      if ((await stat(join(WORKSPACE, root, entry))).isDirectory()) names.push(entry);
    }
    names.sort();
    if (names.length === 0) throw new Error(`${root} holds no module directory`);
    for (const name of names) {
      modules.push({
        directory: `${root}/${name}`,
        moduleId: `module.${segment}.${name}`,
        label: `${segment}.${name}`,
      });
    }
  }
  return modules;
}

/** Every runtime value a file exports, in export order. */
async function exportedValues(path: string): Promise<readonly unknown[]> {
  const namespace: unknown = await import(join(WORKSPACE, path));
  if (typeof namespace !== 'object' || namespace === null) {
    throw new Error(`${path} did not load as a module namespace`);
  }
  const values: readonly unknown[] = Object.values(namespace);
  return values;
}

/**
 * The labels di-bag gives the private bindings of one installation of the module `module.ts`
 * exports, read from the running library rather than from any spelling in the source.
 *
 * Exported bindings keep their bare key and carry their public names in `keys`, so only a binding
 * with no key is read: an exported key that merely contains a slash cannot pass for a label. The
 * label is observable only this way, so every sealed module keeps at least one private binding by
 * convention; one that exports every binding is refused as sealing none.
 *
 * Known limit: di-bag 0.4.0 exposes a label only as the prefix of private binding names, so a
 * module that drops its label and either spells `<label>/<key>` into a private key or installs an
 * inner module sealed under that label reads as labelled. Closing that needs a label the library
 * exposes itself, which is the di-bag migration's (packet D's route 1).
 *
 * @throws When `module.ts` exports anything but exactly one value, or when di-bag refuses it as a
 *   module.
 */
async function privateBindingLabels(directory: string): Promise<readonly string[]> {
  const values = await exportedValues(`${directory}/module.ts`);
  if (values.length !== 1) {
    throw new Error(`${directory}/module.ts exports ${String(values.length)} values, expected 1`);
  }
  // The host below supplies none of the module's requirements, which the type checker refuses;
  // the runtime still builds the graph, and describing it resolves nothing.
  const builder = DiBag.createBuilder() as unknown as {
    installModule: (module: unknown) => { build: () => { inspectGraph: () => GraphSnapshot } };
  };
  const graph = builder.installModule(values[0]).build().inspectGraph();
  return graph.bindings.filter((binding) => binding.keys.length === 0).map(({ label }) => label);
}

/**
 * The `moduleId` of the one `module-index` block in a module's README.
 *
 * The wiki reads any HTML comment containing `module-index`, however spaced, across lines, and
 * never inside a code fence. Rather than reimplement that grammar, the README may hold exactly one
 * `<!--` at all, on a line in the one spelling written here, so the two readers cannot disagree.
 *
 * @throws When the README is unreadable, holds any other HTML comment or none, its one comment is
 *   not that line, or the block is not JSON carrying a string `moduleId`.
 */
async function indexedModuleId(directory: string): Promise<string> {
  const source = await readFile(join(WORKSPACE, directory, 'README.md'), 'utf8');
  const comments = source.split('<!--').length - 1;
  if (comments !== 1) {
    throw new Error(`${directory}/README.md holds ${String(comments)} HTML comments, expected 1`);
  }
  const blocks = source
    .split('\n')
    .map((line) => /^<!-- module-index (\{.*\}) -->$/.exec(line)?.[1])
    .filter((block) => block !== undefined);
  if (blocks.length !== 1) {
    throw new Error(`${directory}/README.md's one HTML comment is not a module-index line`);
  }
  const parsed: unknown = JSON.parse(blocks[0]);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('moduleId' in parsed) ||
    typeof parsed.moduleId !== 'string'
  ) {
    throw new Error(`${directory}/README.md's module-index block names no moduleId`);
  }
  return parsed.moduleId;
}

/** One JSON record: the fields this check reads, each checked where it is read. */
type JsonRecord = Readonly<Record<string, unknown>>;

/** A JSON file's array under one top-level key, each element an object. */
async function recordsOf(path: string, key: string): Promise<readonly JsonRecord[]> {
  const parsed: unknown = JSON.parse(await readFile(join(WORKSPACE, path), 'utf8'));
  const records: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, key) : undefined;
  if (!Array.isArray(records)) throw new Error(`${path} has no ${key} array`);
  return records.map((record: unknown, index) => {
    if (typeof record !== 'object' || record === null) {
      throw new Error(`${path} ${key}[${String(index)}] is not an object`);
    }
    return Object.fromEntries(Object.entries(record));
  });
}

/** One string field of a record, or `undefined` when the record carries none. */
function textOf(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** The module directory a path lies in, when it lies under one of {@link MODULE_ROOTS}. */
function moduleDirectoryOf(path: string): string | undefined {
  for (const { root } of MODULE_ROOTS) {
    if (path.startsWith(`${root}/`)) return `${root}/${path.slice(root.length + 1).split('/')[0]}`;
  }
  return undefined;
}

test('discovers the sealed modules of both roots', async () => {
  const identifiers = (await sealedModules()).map(({ moduleId }) => moduleId);

  expect(identifiers).toContain('module.application.plan-history');
  expect(identifiers).toContain('module.backend.optimization');
});

test('seals every module under the label its location implies', async () => {
  const mismatches: string[] = [];
  for (const { directory, label } of await sealedModules()) {
    const labels = await privateBindingLabels(directory);
    if (labels.length === 0) mismatches.push(`${directory}: seals no private binding`);
    for (const binding of labels) {
      // One identifier after the label: a label with a slash in it, or a labelled outer module,
      // would otherwise put a different label in front of a key that looks right.
      const key = binding.startsWith(`${label}/`) ? binding.slice(label.length + 1) : '';
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
        mismatches.push(`${directory}: private binding "${binding}" is not under ${label}`);
      }
    }
  }

  expect(mismatches).toEqual([]);
});

test('indexes every module under the identifier its location implies', async () => {
  const mismatches: string[] = [];
  for (const { directory, moduleId } of await sealedModules()) {
    const indexed = await indexedModuleId(directory);
    if (indexed !== moduleId) mismatches.push(`${directory}: README names ${indexed}`);
  }

  expect(mismatches).toEqual([]);
});

test('registers every module in the pilot under that identifier, or is known not to', async () => {
  const modules = await sealedModules();
  const rows = await recordsOf('docs/wiki-policy/modules.json', 'modules');
  const boundaries = await recordsOf('docs/wiki-policy/policy.json', 'boundaries');
  const mismatches: string[] = [];
  const unregistered: string[] = [];
  for (const { directory, moduleId, label } of modules) {
    const row = rows.filter((candidate) => textOf(candidate, 'moduleId') === moduleId);
    const boundary = boundaries.filter(
      (candidate) => textOf(candidate, 'boundaryId') === `boundary.${label}`,
    );
    if (row.length === 0 && boundary.length === 0) {
      unregistered.push(moduleId);
      continue;
    }
    if (row.length !== 1 || textOf(row[0], 'indexPath') !== `${directory}/README.md`) {
      mismatches.push(`${directory}: modules.json does not index it once as ${moduleId}`);
    }
    if (
      boundary.length !== 1 ||
      JSON.stringify(boundary[0]['selector']) !==
        JSON.stringify({ kind: 'prefix', value: directory })
    ) {
      mismatches.push(`${directory}: policy.json does not select it once as boundary.${label}`);
    }
  }
  for (const row of rows) {
    const directory = moduleDirectoryOf(textOf(row, 'indexPath') ?? '');
    const owner = modules.find((candidate) => candidate.directory === directory);
    if (directory !== undefined && owner?.moduleId !== textOf(row, 'moduleId')) {
      mismatches.push(`modules.json: ${String(textOf(row, 'moduleId'))} indexes ${directory}`);
    }
  }

  expect(mismatches).toEqual([]);
  expect(unregistered).toEqual(UNREGISTERED);
});

test('names in kinds.json only the module that owns every export of the shim', async () => {
  const modules = await sealedModules();
  const entries = await recordsOf('docs/code-organization/kinds.json', 'entries');
  const mismatches: string[] = [];
  let named = 0;
  for (const entry of entries) {
    const path = textOf(entry, 'path');
    const disposition = textOf(entry, 'disposition') ?? '';
    const owner = SHIM_OWNER.exec(disposition)?.[1];
    if (path === undefined) continue;
    if (owner === undefined) {
      if (disposition.includes('re-export shim') && !SHIM_FORWARD.test(disposition)) {
        mismatches.push(`${path}: re-export shim disposition matches no known form`);
      }
      continue;
    }
    named += 1;
    const project = PROJECTS.find(({ prefix }) => path.startsWith(prefix));
    const module = modules.find(
      ({ moduleId }) => moduleId === `module.${String(project?.segment)}.${owner}`,
    );
    if (module === undefined) {
      mismatches.push(`${path}: names no sealed module ${owner}`);
      continue;
    }
    const files = (await readdir(join(WORKSPACE, module.directory))).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    const owned = new Set<unknown>();
    for (const file of files) {
      for (const value of await exportedValues(`${module.directory}/${file}`)) owned.add(value);
    }
    const shimmed = await exportedValues(path);
    if (shimmed.length === 0 || shimmed.some((value) => !owned.has(value))) {
      mismatches.push(`${path}: re-exports what ${module.directory} does not export`);
    }
  }

  expect(named).toBeGreaterThan(0);
  expect(mismatches).toEqual([]);
});
```

### 10.2 Slice 1's Proof comments (slice 1 step 4 — only after rows 3-22 were observed)

```diff
--- a/tools/tool-devsync/src/module-labels.test.ts
+++ b/tools/tool-devsync/src/module-labels.test.ts
@@ -60,10 +60,14 @@
   const modules: SealedModule[] = [];
   for (const { root, segment } of MODULE_ROOTS) {
     const names: string[] = [];
+    // Proof (2026-09-24): pointing the backend root at a missing `src/modules` failed all five
+    // tests with `ENOENT: no such file or directory, scandir` (0 pass, 5 fail).
     for (const entry of await readdir(join(WORKSPACE, root))) {
       if ((await stat(join(WORKSPACE, root, entry))).isDirectory()) names.push(entry);
     }
     names.sort();
+    // Proof (2026-09-24): keeping files instead of directories failed all five tests with
+    // `libs/wbs/application/core/src/module holds no module directory` (0 pass, 5 fail).
     if (names.length === 0) throw new Error(`${root} holds no module directory`);
     for (const name of names) {
       modules.push({
@@ -105,6 +109,9 @@
  */
 async function privateBindingLabels(directory: string): Promise<readonly string[]> {
   const values = await exportedValues(`${directory}/module.ts`);
+  // Proof (2026-09-24): appending `export const decoy = capacityModule;` to Capacity's module.ts
+  // failed "seals every module under the label its location implies" with `…/capacity/module.ts
+  // exports 2 values, expected 1` (4 pass, 1 fail).
   if (values.length !== 1) {
     throw new Error(`${directory}/module.ts exports ${String(values.length)} values, expected 1`);
   }
@@ -114,6 +121,9 @@
     installModule: (module: unknown) => { build: () => { inspectGraph: () => GraphSnapshot } };
   };
   const graph = builder.installModule(values[0]).build().inspectGraph();
+  // Proof (2026-09-24): reading no binding as private reported every one of the eighteen modules
+  // as `seals no private binding` in "seals every module under the label its location implies"
+  // (4 pass, 1 fail).
   return graph.bindings.filter((binding) => binding.keys.length === 0).map(({ label }) => label);
 }

@@ -130,6 +140,10 @@
 async function indexedModuleId(directory: string): Promise<string> {
   const source = await readFile(join(WORKSPACE, directory, 'README.md'), 'utf8');
   const comments = source.split('<!--').length - 1;
+  // Proof (2026-09-24): repeating Capacity's index line at the end of its README, and appending
+  // it inside a Markdown code fence instead, each failed "indexes every module under the
+  // identifier its location implies" with `…/capacity/README.md holds 2 HTML comments, expected
+  // 1` (4 pass, 1 fail each).
   if (comments !== 1) {
     throw new Error(`${directory}/README.md holds ${String(comments)} HTML comments, expected 1`);
   }
@@ -137,6 +151,9 @@
     .split('\n')
     .map((line) => /^<!-- module-index (\{.*\}) -->$/.exec(line)?.[1])
     .filter((block) => block !== undefined);
+  // Proof (2026-09-24): respelling Capacity's block `<!--module-index {`, which the wiki still
+  // reads, failed the same test with `…/capacity/README.md's one HTML comment is not a
+  // module-index line` (4 pass, 1 fail).
   if (blocks.length !== 1) {
     throw new Error(`${directory}/README.md's one HTML comment is not a module-index line`);
   }
@@ -199,6 +216,12 @@
       // One identifier after the label: a label with a slash in it, or a labelled outer module,
       // would otherwise put a different label in front of a key that looks right.
       const key = binding.startsWith(`${label}/`) ? binding.slice(label.length + 1) : '';
+      // Proof (2026-09-24): Capacity's contract label set to `application.capacities`, then to
+      // `application.capacity/nested`, and its `buildModule` call without the label each failed
+      // "seals every module under the label its location implies" naming the private binding
+      // `application.capacities/capacityOptions`, `application.capacity/nested/capacityOptions`
+      // and `capacityOptions` (4 pass, 1 fail each); with the first of them Capacity's own
+      // module tests stayed green (5 pass), the drift no earlier check saw.
       if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
         mismatches.push(`${directory}: private binding "${binding}" is not under ${label}`);
       }
@@ -212,6 +235,8 @@
   const mismatches: string[] = [];
   for (const { directory, moduleId } of await sealedModules()) {
     const indexed = await indexedModuleId(directory);
+    // Proof (2026-09-24): Capacity's README naming `module.application.capacities` failed this
+    // test with `…/capacity: README names module.application.capacities` (4 pass, 1 fail).
     if (indexed !== moduleId) mismatches.push(`${directory}: README names ${indexed}`);
   }

@@ -233,9 +258,16 @@
       unregistered.push(moduleId);
       continue;
     }
+    // Proof (2026-09-24): Capacity's `modules.json` row renamed `module.application.capacities`
+    // failed "registers every module in the pilot under that identifier, or is known not to" with
+    // `…/capacity: modules.json does not index it once as module.application.capacity` and the
+    // reverse clause's line (4 pass, 1 fail).
     if (row.length !== 1 || textOf(row[0], 'indexPath') !== `${directory}/README.md`) {
       mismatches.push(`${directory}: modules.json does not index it once as ${moduleId}`);
     }
+    // Proof (2026-09-24): Capacity's boundary renamed `boundary.application.capacities`, then its
+    // selector pointed at the Step directory, each failed the same test with `…/capacity:
+    // policy.json does not select it once as boundary.application.capacity` (4 pass, 1 fail).
     if (
       boundary.length !== 1 ||
       JSON.stringify(boundary[0]['selector']) !==
@@ -247,12 +279,17 @@
   for (const row of rows) {
     const directory = moduleDirectoryOf(textOf(row, 'indexPath') ?? '');
     const owner = modules.find((candidate) => candidate.directory === directory);
+    // Proof (2026-09-24): the Memory source row's index path moved to Plan document's README
+    // failed the same test with `modules.json: module.adapter.store-memory indexes
+    // …/plan-document` alone (4 pass, 1 fail).
     if (directory !== undefined && owner?.moduleId !== textOf(row, 'moduleId')) {
       mismatches.push(`modules.json: ${String(textOf(row, 'moduleId'))} indexes ${directory}`);
     }
   }

   expect(mismatches).toEqual([]);
+  // Proof (2026-09-24): dropping Capacity's `modules.json` row and `policy.json` boundary failed
+  // the same test here, the received list gaining `module.application.capacity` (4 pass, 1 fail).
   expect(unregistered).toEqual(UNREGISTERED);
 });

@@ -267,6 +304,10 @@
     const owner = SHIM_OWNER.exec(disposition)?.[1];
     if (path === undefined) continue;
     if (owner === undefined) {
+      // Proof (2026-09-24): Capacity's shim row reworded to end `the capacity module` failed
+      // "names in kinds.json only the module that owns every export of the shim" with
+      // `…/service/capacity.service.ts: re-export shim disposition matches no known form`
+      // (4 pass, 1 fail).
       if (disposition.includes('re-export shim') && !SHIM_FORWARD.test(disposition)) {
         mismatches.push(`${path}: re-export shim disposition matches no known form`);
       }
@@ -277,6 +318,8 @@
     const module = modules.find(
       ({ moduleId }) => moduleId === `module.${String(project?.segment)}.${owner}`,
     );
+    // Proof (2026-09-24): Capacity's shim row naming `the capacities module` failed the same test
+    // with `…/service/capacity.service.ts: names no sealed module capacities` (4 pass, 1 fail).
     if (module === undefined) {
       mismatches.push(`${path}: names no sealed module ${owner}`);
       continue;
@@ -289,11 +332,16 @@
       for (const value of await exportedValues(`${module.directory}/${file}`)) owned.add(value);
     }
     const shimmed = await exportedValues(path);
+    // Proof (2026-09-24): Capacity's shim row naming `the step module` failed the same test with
+    // `…/service/capacity.service.ts: re-exports what …/module/step does not export`
+    // (4 pass, 1 fail).
     if (shimmed.length === 0 || shimmed.some((value) => !owned.has(value))) {
       mismatches.push(`${path}: re-exports what ${module.directory} does not export`);
     }
   }

+  // Proof (2026-09-24): a pattern expecting `modules directly` matched no row and failed the
+  // same test here with `Expected: > 0`, `Received: 0` (4 pass, 1 fail).
   expect(named).toBeGreaterThan(0);
   expect(mismatches).toEqual([]);
 });
```

### 10.3 `openspec/changes/adopt-di-composition/tasks.md` (slice 2 step 1)

```diff
diff --git a/openspec/changes/adopt-di-composition/tasks.md b/openspec/changes/adopt-di-composition/tasks.md
index 376d8037b..3b2d3647c 100644
--- a/openspec/changes/adopt-di-composition/tasks.md
+++ b/openspec/changes/adopt-di-composition/tasks.md
@@ -289,14 +289,35 @@
 ## 7. Ledger and closure

 - [ ] 7.1 Move each test with its owner and delete the re-export shims whose callers are gone.
-      `service-boundaries.test.ts`'s list is what decides when a shim may go.
-- [ ] 7.2 Update `docs/code-organization/kinds.json` for every moved and suffix-declared file: a
-      suffix-declared path carries no entry, and a retained unsuffixed shim keeps one.
+      `service-boundaries.test.ts`'s list is what decides when a shim may go. **Open on 2026-09-24,
+      owned by a follow-up that retires the shims.** Every module moved its own unit tests, but
+      tests of moved code remain under `service/` and reach it through the shims, and `kinds.json`
+      still carries 33 shim rows naming a module. A module-specifier scan that day found no
+      importer of eight be-01 forwarding shims under `apps/wbs/be-01/src/service/`
+      (`assumed-assignee.ts`, `clean-name.ts`, `compensating.ts`, `dependency.ts`,
+      `directory-usage.ts`, `history.service.ts`, `optimizer-trigger-broadcaster.ts`,
+      `retention-timer.ts`). Deleting a shim is a code change with its own `kinds.json` rows and
+      checks, not a ledger entry; besides `service-boundaries.test.ts`, the be-01 `clock.test.ts`
+      list `AGE_THEIR_OWN_ENTRIES` names `retention-timer.ts`.
+- [x] 7.2 Update `docs/code-organization/kinds.json` for every moved and suffix-declared file: a
+      suffix-declared path carries no entry, and a retained unsuffixed shim keeps one. Closed
+      2026-09-24 by evidence: both halves hold on this tree under
+      `tools/tool-devsync/src/service-kinds.test.ts`, and task 7.6 checks that every shim row naming
+      a module names the one whose files export what it re-exports. A moved file without a suffix
+      inside a module directory carries no row, because `SERVICE_ROOTS` does not scan `src/module`;
+      its module's README index names it instead, a known limit owned by the kind rules.
 - [ ] 7.3 Give every module a `tsconfig.json` and an Nx `typecheck:module` target, so the isolated
       type check the design names actually runs. Proof: the target fails on a module that breaks its
-      own contract.
-- [ ] 7.4 Record, per module, which K2 and K3 obligations it does not close and where they are
-      tracked. Full K2 closure stays outside this change.
+      own contract. **Open on 2026-09-24, owned by a follow-up for the isolated module type
+      check:** eighteen module directories in two projects each need a configuration and a
+      watched negative, which is build configuration rather than a ledger entry.
+- [x] 7.4 Record, per module, which K2 and K3 obligations it does not close and where they are
+      tracked. Full K2 closure stays outside this change. Recorded 2026-09-24 as `design.md`'s
+      "Layering debt ledger": per module, the K2 and K3 obligations its `contract.ts` states and
+      who closes them — the feature owners this change leaves outside its claim, a K3
+      resource-services follow-up, task 3.6's repository ports, Plan document's composition
+      export (it changes `AppOptions`) and task 6.1. The contracts' "tracked under task 7.4"
+      sentences resolve to that table.
 - [x] 7.5 Register each sealed module's directory as a wiki index: a `<!-- module-index -->` block
       naming every module file by path, and full membership in `docs/wiki-policy/modules.json`'s
       content-review pilot (a `modules.json` row matched one-to-one by a `policy.json` boundary).
@@ -399,3 +420,15 @@
       boundary needs either the pilot's `sourceRevision` moved forward or a documented exemption
       for a boundary with no predecessor, neither of which this packet decides; see
       `docs/superpowers/plans/2026-09-21-batch-6/040-6-e3-plan-import.md`.
+- [x] 7.6 Label agreement: every sealed module's DI Bag label, the identifier its location implies,
+      its README index, its wiki pilot row and boundary, and every `kinds.json` shim row naming it
+      agree. Landed 2026-09-24 as `tools/tool-devsync/src/module-labels.test.ts`, which reads the
+      label from an installation of the one value `module.ts` exports, requires every private
+      binding to be named `<label>/<identifier>`, compares shim exports to module exports by
+      identity, and names Plan document and Plan import as the two unregistered modules, so a
+      module that skips task 7.5 now fails. Proof: twenty faults, each watched failing its named
+      test — among them Capacity's contract label renamed, which Capacity's own module tests did
+      not notice. Known limits, stated in the design's "Label agreement": a module that drops its
+      label and either spells `<label>/<key>` into a private key or installs an inner module
+      sealed under that label reads as labelled until di-bag exposes a label itself, and
+      `apps/wbs/fe-01/src/modules` is outside this change.
```

### 10.4 `openspec/changes/adopt-di-composition/design.md` (slice 2 step 1)

```diff
diff --git a/openspec/changes/adopt-di-composition/design.md b/openspec/changes/adopt-di-composition/design.md
index 005c751a9..0f1c4541f 100644
--- a/openspec/changes/adopt-di-composition/design.md
+++ b/openspec/changes/adopt-di-composition/design.md
@@ -70,8 +70,59 @@ membership in the wiki's content-review pilot — both a `modules.json` row and
 `policy.json` boundary, required together (`trust.ts:1224-1230` refuses a mapped module without
 exactly one matching boundary) — keeping a declared registration's mapping row, boundary and index
 mutually consistent, checked by the pilot's own production `lint()` call. That is narrower than
-"every sealed DI module has a pilot registration": discovering an unregistered module is also out
-of scope. Whether an index block's `moduleId` names the same label its module's own `buildModule`
-call seals its bag under is explicitly **not** checked by task 7.5: four review rounds against a
-machine-checked version of that specific claim each found a new bypass, so it is deferred to a
-later change with its own design (040.6 packet D's "Deferred: label agreement").
+"every sealed DI module has a pilot registration". Whether an index block's `moduleId` names the
+same label its module's own `buildModule` call seals its bag under is **not** checked by task 7.5:
+four review rounds against a source-reading version of that claim each found a new bypass (040.6
+packet D's "Deferred: label agreement"). Task 7.6 checks it instead, as the next section says.
+
+## Label agreement
+
+`tools/tool-devsync/src/module-labels.test.ts` derives each module's identifier from where it lives
+(`module.application.<name>` under the core's `src/module`, `module.backend.<name>` under be-01's)
+and requires everything that names the module to agree with it. The label is read from the running
+library, never from source: `module.ts` must export exactly one value, which is installed into an
+empty builder, and every private binding `inspectGraph()` reports — a binding with no public key —
+must be named `<label>/<identifier>`, so every module keeps at least one private binding by convention. That defeats both of packet D's cut cases: a decoy export is a
+second exported value, and an exported key containing a slash is not a private binding. The README
+must hold exactly one HTML comment, its index line, which must carry the identifier (the wiki reads
+any comment containing `module-index`, so any second or respelled comment is refused rather than
+parsed a second way); a `modules.json` row and a `policy.json` boundary must both name it
+and its directory, or neither exists and the module is one of the two the check names as
+unregistered (Plan document and Plan import, task 7.5); and every `kinds.json` shim row that names a
+module must name one whose files export every value the shim re-exports, by identity, while any
+other shim row must use one of the three library-forwarding forms, so a reworded row is refused
+rather than skipped.
+
+Two limits are stated rather than chased. di-bag 0.4.0 exposes a label only as the prefix of
+private binding names, so a module that drops its label and either spells `<label>/<key>` into a
+private key or installs an inner module sealed under that label reads as labelled; a
+library-exposed label, the di-bag migration's, closes it. The frontend's
+`apps/wbs/fe-01/src/modules` is outside this change and carries no index block yet.
+
+## Layering debt ledger
+
+Task 7.4, per module: the obligations sealing leaves open, each stated in that module's
+`contract.ts` or, for Authentication and Saved plans, in tasks 3.5 and 3.3, and who closes them. "Feature owners" is the K2 closure this change declares outside
+its claim; "resource-services" is a K3 follow-up needing a resource-service over the store named;
+task 6.1 moves the application-ring support a resource still imports.
+
+| Module               | K2 left open                                                                     | K3 left open                                 | Closed by                           |
+| -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
+| Plan history         | none stated                                                                      | `ProjectStore` and `PlanEventStore`          | resource-services                   |
+| Bounded replay sweep | none stated                                                                      | `EventLogStore` and `PlanEventStore`         | resource-services                   |
+| Realtime             | none stated                                                                      | `eventLog`                                   | resource-services                   |
+| Saved plans          | rename and delete publish in `http/saved-plan.routes.ts` (task 3.3)              | `plans` and `capture`                        | task 3.3's owner; resource-services |
+| Plan import          | none stated                                                                      | the direct store writes inside its `uow` run | resource-services                   |
+| Authentication       | throttle orchestration stays in delivery                                         | `users` and `identities`                     | feature owners; resource-services   |
+| Optimization         | none stated                                                                      | the SQLite `db` and its repository functions | Optimization repository ports (3.6) |
+| Plan commands        | be-01 constructs `PlanCommandRunner`; routes take `WorkItemService`              | none                                         | feature owners                      |
+| Plan document        | `http/project.routes.ts` installs it (a composition export changes `AppOptions`) | none                                         | Plan document composition export    |
+| Calendar marker      | routes take `CalendarMarkerService`                                              | none                                         | feature owners                      |
+| Capacity             | Plan commands and delivery name `CapacityService`                                | none                                         | feature owners                      |
+| Directory            | routes, Plan import and Plan commands name `DirectoryService`                    | none (K4 support: task 6.1)                  | feature owners; task 6.1            |
+| Priority band        | Plan commands and delivery name `PriorityBandService`                            | none                                         | feature owners                      |
+| Project              | routes and Saved plans name `ProjectService`                                     | none                                         | feature owners                      |
+| Step                 | `http/step.routes.ts` takes `StepService`                                        | none (K4 support: task 6.1)                  | feature owners; task 6.1            |
+| Work item            | routes, Plan commands, Plan import and Saved plans name it                       | none (K4 support: task 6.1)                  | feature owners; task 6.1            |
+| Solver launcher      | none                                                                             | none                                         | —                                   |
+| Solver supervisor    | none                                                                             | none (K5 by the map's carve-out)             | —                                   |
```

### 10.5 `openspec/changes/adopt-di-composition/proposal.md` (slice 2 step 1)

```diff
diff --git a/openspec/changes/adopt-di-composition/proposal.md b/openspec/changes/adopt-di-composition/proposal.md
index c43197564..c63c9bea0 100644
--- a/openspec/changes/adopt-di-composition/proposal.md
+++ b/openspec/changes/adopt-di-composition/proposal.md
@@ -58,7 +58,7 @@ nine existing identifiers are untouched.
 - K3 debt is preserved: a feature-service reading a repository port keeps doing so, declared not
   implicit; task 7.4 records it.
 - Wiki registration is part of this change: task 7.5 tracks the index block and full pilot
-  membership (mapping row and boundary, both required); label agreement is deferred.
+  membership (mapping row and boundary, both required); task 7.6 checks label agreement.

 ## Impact

```

### 10.6 `openspec/changes/adopt-di-composition/specs/di-composition/spec.md` (slice 2 step 1)

```diff
diff --git a/openspec/changes/adopt-di-composition/specs/di-composition/spec.md b/openspec/changes/adopt-di-composition/specs/di-composition/spec.md
index bf361139d..57242deae 100644
--- a/openspec/changes/adopt-di-composition/specs/di-composition/spec.md
+++ b/openspec/changes/adopt-di-composition/specs/di-composition/spec.md
@@ -41,6 +41,14 @@ it lives under. The nine existing identifiers SHALL NOT change.
 - **THEN** Plan history is `module.application.plan-history` and Optimization is
   `module.backend.optimization`, and each label drops only the `module.` prefix

+#### Scenario: Everything that names a module agrees with its label
+
+- **GIVEN** a sealed module under the core's or be-01's module directory
+- **WHEN** its label is read from an installation, and its identifier from its README index, its
+  wiki pilot row and boundary, and every `kinds.json` shim row naming it
+- **THEN** each agrees with the identifier its location implies, and a module with no pilot
+  registration is one the change names
+
 ### Requirement: The bag is reachable only from a composition root

 A bag SHALL be built only by a module's own composition function or by a composition root, and the
```

## 11. Global stop conditions

- A red checkpoint reports `0 tests ran`.
- `observe.sh` prints `STOP:` (a fault refused, a fault that changed nothing, a failed restore).
- A row's printed lines disagree with section 6 about its fact (preamble rule 20): a named test
  passes, a different test fails, or a pilot or `kinds.json` row reports a violation other than, or
  beyond, the one named.
- Row 1 fails, or row 2 does not read `5 pass`: the real base differs from the rehearsal in a way
  this packet does not own.
- A step-0 line does not print what it says, or the step-0 tree is not clean.
- `git apply --check` refuses any section-10 diff: the file drifted; report, do not repair.
- Any pinned number of the legacy pin moves, `S` changes, or OpenSpec `passed` differs from `N`.
- A check needs an edit this packet does not prescribe — in particular any edit to a module file, a
  README, `modules.json`, `policy.json` or `kinds.json` beyond a fault that is then restored.
- A network access or an OpenSpec download.

**Not a stop:** an Nx target outliving the tool's wait is still running (rule 19); extra failing
tests under a mutation (rule 16) are recorded.

## 12. Ready to commit

Each slice hands over `git diff --name-only "$base"` plus `git ls-files --others --exclude-standard`.

| Slice | Modified (tracked)                                                                                                                                                                                                                                                                | Untracked (new)                                | Deleted |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------- |
| 1     | `openspec/changes/adopt-di-composition/verify.md`                                                                                                                                                                                                                                 | `tools/tool-devsync/src/module-labels.test.ts` | nothing |
| 2     | `openspec/changes/adopt-di-composition/design.md`, `openspec/changes/adopt-di-composition/proposal.md`, `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`, `openspec/changes/adopt-di-composition/tasks.md`, `openspec/changes/adopt-di-composition/verify.md` | nothing                                        | nothing |

Every "modified" count includes `verify.md`, which the rehearsal commits never touch, so a
rehearsal commit's `--name-status` shows one fewer. Slice 1: 1 modified, 1 new (2 paths). Slice 2: 5
modified. The planner may add a revised packet file to its own commits; the lists are scoped to
`$base`, so that does not break them.

## 13. Findings

- **The label had drifted nowhere, but nothing would have noticed.** All eighteen modules agree
  today; renaming Capacity's label constant kept every existing check green (row 1), because each
  module's tests compare against the constant they import.
- **Packet D's two cut cases do not arise at runtime.** Read from the library, a decoy is a second
  exported value (row 6) and an exported slash key is not a private binding. What survives needs the
  label dropped and a deliberate construction: a forged private key, or an unlabelled outer module
  around an inner one sealed under the right label (section 4).
- **Registration discovery comes free.** The pilot half of the check names the two modules task 7.5
  could not register, so a future module that skips registration fails (row 16).
- **Task 7.1 is measurable now:** eight be-01 forwarding shims have no importer (section 3).
- **Landed code of packets A-H:** no defect found.

## 14. Document exemption

None needed. This packet cites no pre-namespacing path; `tasks.md`'s 7.5 note, which does, is
never quoted as context by 10.3's hunks.

## 15. `git apply --check` verification

Every fenced `diff` block and the listing above were extracted from this document by the script
below and applied in slice order to a disposable worktree of `e8ef4758`, and the resulting trees
compared with the rehearsed slice commits. The same worktree then replayed section 7 step 3's block,
as written, against the listing before 10.2.

````sh
#!/usr/bin/env bash
# Usage: extract.sh <repository> <packet.md> <base> <slice1-sha> <slice2-sha>
set -euo pipefail
repo=$1; packet=$2; base=$3; s1=$4; s2=$5
work=$(mktemp -d "${TMPDIR:?}/i-extract-XXXXXX")
python3 - "$packet" "$work" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
body = text[text.index('## 10. Exact content'):text.index('## 11. Global stop conditions')]
diffs = re.findall(r'^```diff\n(.*?)^```$', body, re.S | re.M)
for number, patch in enumerate(diffs, 1):
    open(f'{sys.argv[2]}/{number:02d}.patch', 'w').write(patch)
listings = re.findall(r'^```ts\n(.*?)^```$', body, re.S | re.M)
for number, listing in enumerate(listings, 1):
    open(f'{sys.argv[2]}/{number:02d}.listing', 'w').write(listing)
print(f'diffs={len(diffs)} listings={len(listings)}')
PY
test "$(ls "$work"/*.patch | wc -l)" -eq 5
test "$(ls "$work"/*.listing | wc -l)" -eq 1
wt="$work/tree"
git -C "$repo" worktree add --quiet --detach "$wt" "$base"
cd "$wt"
apply() {
  git apply --check "$work/$1.patch"
  git apply "$work/$1.patch"
  echo "applied $1"
}
same_as() {
  git add -A
  if git diff --cached --quiet "$1"; then echo "tree equals $1"; else git diff --cached --stat "$1"; exit 1; fi
}
# Slice 1
cp "$work/01.listing" tools/tool-devsync/src/module-labels.test.ts
apply 01
same_as "$s1"
# Slice 2
for n in 02 03 04 05; do apply "$n"; done
same_as "$s2"
cd "$repo"
git worktree remove --force "$wt"
echo "all 5 diffs and the listing applied in slice order; every slice tree equals its rehearsal commit"
````

Output:

```text
diffs=5 listings=1
applied 01
tree equals e3b230586
applied 02
applied 03
applied 04
applied 05
tree equals 1bc126d2a
all 5 diffs and the listing applied in slice order; every slice tree equals its rehearsal commit
```

The rehearsal commits are throwaway, on `rehearse/040-6-i-r2` above `e8ef4758`: slice 1 `e3b230586`
and slice 2 `1bc126d2a` (slice 2 amended once, before this script ran, to rewrap one line of its
7.6 note). Round 1's `rehearse/040-6-i` (`34c3a0fe5`, `97b7c93bf`) is kept but superseded. None is
pushed; neither touches `verify.md`, which only the executor writes. Their subjects are rehearsal
labels; the planner commits every slice with section 7's subject, and only the trees are compared.
Lefthook ran on every rehearsal commit (`format`, `lint`, `tool-wiki`, `plaintext-secrets` green). On
the r2 slice-1 tree before 10.2, section 7's helper block (extracted from this document) and step 3's
block ran all twenty calls: each ended `exit=1` with its section 6 fragment, no `STOP:` line, and
`git status` afterwards listed only the new check file.

**Review disposition.** Round 1 (READY AFTER FIXES: three Important, five minor) is applied here.
Important 1: the README reader now admits exactly one HTML comment, in the one spelling both readers
agree on (rows 9 to 11; the wiki's `mdast` reader was not reused because its packages are declared
by no manifest `tool-devsync` may import from). Important 2: every other `re-export shim`
disposition must be one of the three library-forwarding forms (row 19). Important 3: the nested-module
sentence is corrected in section 4, the listing's JSDoc, 10.3's 7.6 note and 10.4's limits paragraph.
Minors: the ledger preface names tasks 3.5 and 3.3; the at-least-one-private-binding convention is
stated in the JSDoc, section 4 and `design.md`; keys are read as `[A-Za-z_$][A-Za-z0-9_$]*`; section 9
and 7.1's note name `clock.test.ts`'s `AGE_THEIR_OWN_ENTRIES`; `sealedModules()` follows symbolic
links through `stat`.

## 16. Label agreement, landed

Packet D's "Deferred: label agreement" asked a later design to defeat two cases first: an
intersection-typed export hiding the real module behind a correctly labelled decoy, and a
registration key containing a slash impersonating the label. Section 4 says why neither is
reachable by a check that reads the label from the running library, which limit remains, and whose
it is. Task 7.6 records it; 7.5's own wording, which excludes label agreement from 7.5, stands.

## 17. Batch-6 addendum, point by point

| #   | Point                                | Where this packet meets it                                                                                                                                                                  |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fixture reproduces the failure first | Row 1: on the unchanged tree a renamed label constant leaves Capacity's own tests green; rows 3-22 are each a real drift on real files the new check refuses                                |
| 2   | Test code passes typecheck and lint  | `tool-devsync` lint and typecheck exit 0 on the rehearsed slice; lefthook's `lint` and `format` passed on both rehearsal commits                                                            |
| 3   | Commit-safe hand-over counts         | §12, scoped to each slice's `$base`                                                                                                                                                         |
| 4   | Commands can show failure            | §7 status wrapper; `observe.sh` records each run's exit and stops on a refused, empty or unrestored fault; rows 21 and 22 prove the check's own inventory guards                            |
| 5   | Tests reading `HEAD`                 | Neither slice edits a pilot input; the pilot suite is the planner's, after the commit (§8)                                                                                                  |
| 6   | Sandbox facts                        | No port, process or network use; `tool-devsync:test` is planner-only; the executor runs only the focused files                                                                              |
| 7   | Known race                           | §8                                                                                                                                                                                          |
| 8   | Names                                | `module.application.<name>` and `module.backend.<name>` by location, labels without `module.`; Twilight Burokrat targets named as `twilight-burokrat:*`                                     |
| 9   | Packet form, public repo             | one planner commit per slice; no private absolute path outside the launcher lines; no pre-namespacing path, so no exemption                                                                 |
| 10  | Pins                                 | no `bun.lock`, `package.json` or library version change; `di-bag` stays 0.4.0                                                                                                               |
| 11  | `\|\| test $? -eq 1` after pipelines | not used; `observe.sh` reads `diff`'s own status after one command                                                                                                                          |
| 12  | Planner chains stop                  | the planner commit helper is used as-is; no chained push                                                                                                                                    |
| 13  | Index every module file              | no module file is added                                                                                                                                                                     |
| 14  | Bun path vs filter                   | every focused run is `./…` from the repository root or `cd <project>` with `./src/…`; lint and typecheck run before the baselines                                                           |
| 15  | Interleaving property tests          | not triggered: no owner, queue, lock or retry (§4)                                                                                                                                          |
| 16  | Model-based tests                    | not triggered, for the same reason                                                                                                                                                          |
| 17  | Seed earlier evidence                | no slice reads earlier evidence; no `--seed`                                                                                                                                                |
| 18  | Symbol-based boundary checks         | the label is read from di-bag's own `inspectGraph()` and shim ownership compared by value identity; no source text of a module is parsed; the README and JSON files are data read as data   |
| 19  | ugrep exits 1 on missing file        | slice 2's step-0 `grep -c` follows `test -f`; `observe.sh`'s only `grep` is display and never decides a result                                                                              |
| 20  | Promise only what a check keeps      | §4's limits: a forged private key with the label dropped, primitive exports compared by value, `check.ts` unread, the frontend unscanned; 7.1 and 7.3 recorded open with owners, not ticked |
