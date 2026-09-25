# Suite directory move — Twilight Burokrat into the Twilight Structure suite

|             |                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | WBS `2fdc7076-5fd3-40cb-9e86-dad9da00574c`, "Suite directory layout": move `apps/wiki` to `apps/twilight-structure/twilight-burokrat` (Dany, 2026-09-23: "create apps/twilight-structure/twilight-burokrat and host everything there")                                                                                                                      |
| Size class  | M — three slices, each one executor attempt; slice 2 is small and ends without a commit (planner decision D3)                                                                                                                                                                                                                                               |
| Predecessor | none. Batch 7's other lane, 140.1 (`caught-object-report-json`), touches the root manifest, `bun.lock` and WBS sources; no path of this packet's (section 5)                                                                                                                                                                                                |
| Advances    | the suite level of the namespace layout, Twilight Burokrat's directory, and a standing check that keeps the retired root out of current files                                                                                                                                                                                                               |
| Schema      | OpenSpec change `adopt-suite-directory-layout`, `sdd-lean`, created by slice 1: four requirements (a declared suite holds products one directory deeper; a suite product keeps its lint policy beside it; Twilight Burokrat lives in the suite; the retired root survives only in historical records, archived or not), and five tasks ticked by the slices |
| Base        | revision 3 is rehearsed from `fc5015a9` (`main` at `e93a564a0`, the planner-owned exemption, and the two packet commits), with its own `bun install --frozen-lockfile`. The planner reruns section 9.1 with `REAL_BASE=<planning sha>` before dispatch                                                                                                      |
| Rehearsal   | `rehearse/suite-move-r3`: slice 1 `574c44de`, slices 2 and 3 together `34bf3814` after the planner-only Proof amendment, each committed with hooks on (sections 9.3–9.4)                                                                                                                                                                                    |

## 1. Goal, non-goals, and the cut

**Goal.** Twilight Burokrat's three pieces — the command-line project `cli/`, the consumer template
`consumer/` and the product lint policy `eslint.product.mjs` — leave `apps/wiki`, a directory named for
a product that no longer exists, and live under `apps/twilight-structure/twilight-burokrat`. Every
current reference follows them; history stays as it was written; and a standing check fails if the
retired root reappears in a current file.

The namespace layout gate knows only `apps/<product>/<project>` today and excuses `apps/wiki/cli` by a
frozen exception. Dany's rule shape (2026-09-23): **a declared list
of suite directories under `apps`; a listed directory's children are products, and any other
`apps/<dir>` is a product directly — two first-class shapes, no exception for WBS.** So the move is an
architecture change first and a rename second.

**Non-goals.**

- The npm package name `twilight-burokrat`, its bin names `twilight-burokrat` and `twib`, its packed
  file list, the Nx project name `twilight-burokrat`, the tag `product:twilight-burokrat`, the
  version-1 ids (`module.infra.tool-wiki`, `check.wiki-cli.*`, `boundary.infra.tool-wiki`), the
  `TOOL_WIKI_*` variables and `bin/tool-wiki-*.sh` do not change (section 3.2).
- `apps/wbs` stays where it is (Dany, 2026-09-23).
- No release, tag, activation or registry publish. Preparing the relocation activation the move
  needs before `trusted-wiki` can certify again is operator work under the activation runbook's
  "Relocation" (section 3.8).
- No historical record is rewritten: packets, plans and specs under `docs/superpowers`, archived
  OpenSpec changes, every `verify.md`, finished tasks, dated `Proof:` comments (section 3.2). Two
  exceptions: a routed link (section 3.2), and the six dated `Proof:` comments whose checks this
  packet changes — they are retired with the old lines and observed again (sections 7.7, 8.3).

**The cut.**

1. **The suite level**, test first, on the unmoved tree: the layout gate reads
   `APPLICATION_SUITES = ['twilight-structure']`; product lint policy discovery walks a suite's
   products and refuses a policy in the suite directory itself; Nx declares the suite products'
   policies as lint inputs; the OpenSpec change and the glossary's **Suite**. Nothing moves.
2. **The move**: `mv apps/wiki apps/twilight-structure/twilight-burokrat` and the one `extends` line
   typed lint needs. It ends **without a commit**: the planner stages it, and slice 3 runs on the
   staged move (section 3.4).
3. **Every reference follows**, as one checked substitution script (section 3.7): project
   configuration, sources, the release workflow, the bootstrap policy, mapping and relationship facts,
   devsync pins, current documents; the frozen exception becomes a name exception on the new root; and
   the retired-root check, red first. The planner then commits slices 2 and 3 as **one** commit, in
   which Git still records the 127 files as renames (section 3.4).

## 2. Read first

| File                                                                                                        | Why                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                                                | Rules R1–R5 and the routing index.                                                                                                               |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                                       | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.                                        |
| `tools/tool-devsync/workspace-projects.mjs` (`findNamespaceLayoutViolations`, `FROZEN_APPLICATION_ROOTS`)   | The layout gate slices 1 and 3 change.                                                                                                           |
| `tools/tool-devsync/product-policies.mjs` (`readProductPolicies`)                                           | Product lint policy discovery slice 1 changes.                                                                                                   |
| `docs/runbook-tool-wiki-activation.md`, "Relocation"                                                        | Why the bootstrap policy's `selector` moves and its `sourceSelector` stays, and what the operator must do before `trusted-wiki` certifies again. |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`, "on-disk bootstrap policy, mapping and relationship files" | The oracle that reads the bootstrap files and the repository at `HEAD`.                                                                          |

## 3. Design

### 3.1 The measured reference inventory

Measured on `ad0451da9` with the pattern the retired-root check uses, `apps/wiki(?![\w-])`: **102
tracked files, 917 occurrences** — and three kinds of reference the pattern cannot see. On
`e93a564a0` it is **103 files, 920**: PR #63 added one packet under `docs/superpowers` (three
mentions); no other file changed.

| Area                                                 |   Files | Occurrences | Disposition                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------: | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/superpowers` — packets, plans, specs           | 49 (50) |   758 (761) | Stay as written (brief). One exception: the routed rules design's one Markdown link, which the devsync link check fails once the target moves; it now points at the new README.                                                                  |
| `apps/wiki` itself, moved in slice 2                 |      18 |          62 | Follow, but two dated clauses of one `Proof:` comment in `pilot-policy.test.ts` (the 2026-09-16 move) that stay.                                                                                                                                 |
| `tools/tool-devsync`                                 |       7 |          34 | Follow: the layout rule and its tests, `RESTART_PATHS`, the destination map, the inventory pin, the legacy classifier and the index checker's CLI path. Stay: four dated `Proof:` clauses in the namespacing test and two in the inventory test. |
| `docs/wiki-policy`                                   |       4 |          11 | Follow: the bootstrap selector, the bootstrap mapping's prefix and index path (and its `mappingVersion` bumps v3 to v4), both relationship files' four facts each.                                                                               |
| `.github/workflows/twilight-burokrat-release.yml`    |       1 |           4 | Follow: the four `bun apps/wiki/cli/src/packaging/release-cli.ts` steps.                                                                                                                                                                         |
| Current documents                                    |       6 |          10 | Follow: `LLM_README.md`, `CONTEXT.md`, `docs/twilight-structure/names.md`, the activation runbook (5), the R5 catalogue. Stay: the 2026-09-13 extraction plan's dated status line.                                                               |
| `openspec/changes`, artifacts other than `verify.md` |       8 |          20 | Follow: `wiki-release`'s normative spec (3, the consumer template path it requires byte identity with) and `twilight-control-plane`'s unfinished task (2). Stay: proposals, finished tasks, designs describing past procedures (15).             |
| `openspec/changes/*/verify.md`                       |       7 |          16 | Stay: observation records.                                                                                                                                                                                                                       |
| `openspec/changes/archive`                           |       2 |           2 | Stay: closed.                                                                                                                                                                                                                                    |

**What the pattern cannot see**, found by breaking the tree and reading what failed (section 9.3):

- **Quoted path segments**: `gate-entrypoints.test.ts` builds the root seven times as
  `join(workspace, 'apps', 'wiki', …)`, once across lines. Nineteen of its tests failed on
  `ENOENT … apps/wiki/cli/src/cli.ts` until the script moved them; the retired-root check now reads
  this spelling too.
- **Depth**: the project sat three directories deep and now sits four. Every root-relative climb
  gains one `../`: `project.json` (`$schema`, two `$PWD/../../../node_modules`, two `--preload`),
  the three tsconfig `outDir`/`extends` values, the README's runbook link, and 21 source sites —
  `'../../../../..'` (8), `join(import.meta.dir, '..', '..', '..', '..', '..')` (9 on one line, 2
  with one segment per line), `pack.ts`'s `'../../../dist/…'` and `release.test.ts`'s
  `'../../../../../.github/…'`. The relationship facts
  copy the test command, so both relationship files follow it too.
- **Globs and discovery**: `nx.json`'s lint input `{workspaceRoot}/apps/*/eslint.product.mjs` and
  `readProductPolicies`' one-level walk would both silently stop seeing Twilight Burokrat's product
  policy one level down. Slice 1 adds `apps/*/*/eslint.product.mjs` and the suite walk.

Also moved by the move, with no text naming the root: the Nx project graph (`nx show project
twilight-burokrat` answers the new root), the legacy-occurrence digest (every context is keyed by its
file's path), the pilot's first refused index (the refusal names the first offending index in path
order, and `apps/twilight-structure` sorts before `apps/wbs`), and the check-indexes list.

### 3.2 What moves, what stays, and why

**Moves**: the directory and everything section 3.1 marks "follow". **Stays, with the reason:**

- **npm name `twilight-burokrat`, bin names, packed files.** The package is published under that name
  (`twilight-burokrat-v0.1.0`, 2026-09-22); `package.json`'s `files` (`dist/`, `README.md`, `NOTICE`,
  `LICENSE`) and `bin` (`dist/bin.mjs`) are package-relative, so the move cannot change them, and
  the planner's tarball listing proves it (section 9.4: the same 163 entries).
- **Nx project name `twilight-burokrat`.** The layout rule would name a suite project
  `<product>-<project>`, here `twilight-burokrat-cli`. Renaming it would touch CI's affected-gate
  selector (`ci.yml` `index("twilight-burokrat")`), the release workflow's four targets, the gate
  steps, both relationship files' `project` fields, the runbooks and every packet that runs
  `twilight-burokrat:*`. The frozen exception already keeps this name; slice 3 narrows it to a
  **name exception** on the new root, and the stale-exception check still fails once the root is
  gone. **Planner decision (section 13, D1):** keep the name (this packet) or rename it to
  `twilight-burokrat-cli` later as its own item.
- **`product:twilight-burokrat`.** The suite rule now derives it from the product directory, so the
  product half of the old exception is gone rather than kept as a clause no fault could fail.
- **Version-1 ids and `TOOL_WIKI_*`.** The runbook and the README say why: existing evidence and
  immutable activations keep their identity.
- **`bootstrap-policy.json`'s `sourceSelector` `tools/tool-wiki`.** The reviewed baselines live at
  that path at `pilot.sourceRevision` `364cc0f8`; only `selector` moves (runbook, "Relocation", step
  1), and `modules.bootstrap.json`'s prefix and index path must follow the selector, or the pilot
  oracle `the bootstrap policy and mapping select the moved pilot boundaries at HEAD` fails. **This
  corrects the planning inventory**, which calls `modules.bootstrap.json` history not to be edited: the
  oracle requires the edit, and the runbook requires the `mappingVersion` bump with it.
- **Historical records** (section 1). The one `docs/superpowers` edit is a link, not evidence: the
  Twilight Burokrat rules design is routed from `LLM_README.md`, and devsync's
  `every routed current document resolves its local links and anchors` failed on its
  `../../../apps/wiki/cli/README.md` once the target moved (observed on the rehearsal).

### 3.3 The layout rule

```js
export const APPLICATION_SUITES = Object.freeze(['twilight-structure']);
```

An application whose second segment is a listed suite must sit at exactly
`apps/<suite>/<product>/<project>`, carry `product:<product>` and be named `<product>-<project>`;
every other application keeps `apps/<product>/<project>`. A directory is a suite only by being
listed, so `apps/probe-suite/probe/cli` is still refused as malformed. Product lint policy discovery
reads the same list: it loads `apps/<suite>/<product>/eslint.product.mjs` for every product directory
of a listed suite, and refuses an `eslint.product.mjs` directly in the suite directory by name —
passing over it silently would be a fence that cannot fail. Slice 3 turns
`FROZEN_APPLICATION_ROOTS` (`{ product, name }` keyed by `apps/wiki/cli`) into
`APPLICATION_NAME_EXCEPTIONS` (`'apps/twilight-structure/twilight-burokrat/cli': 'twilight-burokrat'`)
read through one helper, `excusedName(root)`.

### 3.4 History: one commit for the move and its references

A pure `git mv` commit was tried first on the revision 1 base. The hook refused it: lefthook's `lint`
runs typed ESLint over the 127 staged files, and with `cli/tsconfig.json` still extending
`../../../tsconfig.base.json` (now `apps/tsconfig.base.json`, absent) it reported
`✖ 10477 problems (10477 errors, 0 warnings)`. With that one `extends` line changed and nothing else
the hook passed, and revision 1 committed the move alone: 126 renames at 100% and
`cli/tsconfig.json` at 85%. That commit was red on purpose until the next, so the planner decided
(D3) that **no red commit may reach `main`**: slice 2 still does the move alone, as an execution
step with its own checks, but ends without a commit; the planner stages it (`git add -A`, no commit),
and slice 3 edits on top of the staged move. The planner's one commit for slices 2 and 3 goes
through `planner-commit.sh` with whole devsync, no `--skip-devsync`.

Git still follows the renames in that combined commit, by similarity. On the rehearsal commit
`45e59fdf7`: `git show -M --summary` records **126 renames** — 98 at 100%, the rest from 99% down to
`cli/project.json` at 67%, `cli/tsconfig.json` at 64% and `cli/tsconfig.spec.json` at 50% — and one
pair it no longer matches: `cli/tsconfig.lib.json`, a five-line file whose one meaningful line (its
`outDir`) the move changes, shows as a delete and a create. `git log --follow` on a moved source file
reaches its pre-move history (`cli/src/policy/trust.ts`: the combined commit, then `f4934d65d`,
`6475fdcc4`); on `cli/tsconfig.lib.json` it pairs the new file with an unrelated older file instead,
so that file's history is read at its old path. Revision 1's separate move commit had paired all 127;
that is the price of D3.

### 3.5 OpenSpec: used

R4 requires a change for architecture and deploy safety. A directory move that changed no behaviour
would be mechanical, but this one changes the namespace layout rule (a new application shape and a
discovery rule every future suite relies on), adds a standing check, and moves the release workflow's
executable paths and the trusted bootstrap boundary. So slice 1 creates `adopt-suite-directory-layout`
(sdd-lean), with its intent (378 words), a delta spec of four requirements with WHEN/THEN scenarios,
five tasks ticked one slice at a time, and a `verify.md` each slice appends to. Validation goes up by
one item (115 → 116 on `e93a564a0`). No ADR: a directory layout is reversed by another move, and the decision is Dany's,
recorded in the intent. The glossary gains **Suite**, and **Product** names both shapes.

### 3.6 The retired-root check

`tools/tool-devsync/src/retired-roots.test.ts` scans every path Git tracks or would track
(`git ls-files --cached --others --exclude-standard`, less `--deleted`, so an unstaged move reads its
new path only), reading a symbolic link's target rather than
following it, for both spellings — the path `apps/wiki` (not followed by a word character or `-`) and
the quoted segments `'apps', 'wiki'` (across lines) — and answers three questions, one per case:

| Case                                                                    | Clause                                                      | Fault that only this clause catches                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `no file remains under the retired apps/wiki root`                      | a path under `apps/wiki/`, whatever it holds                | `g1`: an untracked `apps/wiki/stray.txt` that names nothing                                                             |
| `no current file names the retired apps/wiki root`                      | untracked files are read (`--others`)                       | `g2`: a new untracked document naming the root                                                                          |
|                                                                         | an unexcused occurrence is reported                         | `g3`: the root written into the first line of the tracked `docs/local-dev.md`                                           |
|                                                                         | the segment spelling                                        | `g4`: a new document holding only `join('apps', 'wiki')`                                                                |
| `every excuse for the retired root still matches exactly what it names` | a dated mention holds exactly its count                     | `g5`: one more mention in the excused `openspec/changes/wiki-release/tasks.md`                                          |
|                                                                         | a historical tree still holds something                     | `g6`: an added tree `docs/no-such-tree/`                                                                                |
| all three                                                               | an unreadable listing throws                                | `g7`: `ls-files` misspelled                                                                                             |
| all three                                                               | a tracked file the working tree no longer holds is not read | `g9`: the `g8` move with that filter off                                                                                |
| all three, green                                                        | an excuse survives its change's archiving (`unarchived`)    | `g8`: `twilight-burokrat-package/proposal.md` moved to `openspec/changes/archive/2026-10-01-twilight-burokrat-package/` |

Each fault has a twin with its clause disabled (`gN-off`). For `g1` and `g3`–`g6` the twin passes the
named case: the fault is caught by that clause and no other (batch 7 addendum, point 2). Three twins
say more. `g2-off` passes the named case, and the excuse case fails on the check's own untracked file,
which `--others` also stops seeing. `g7-off` shows that a broken listing is caught a second way too: the
empty scan leaves every excuse holding 0. What the refusal alone adds is that the leftover and current
cases do not go green on nothing. `g9` has no twin: it is `g8`'s move with its own clause off. `g8` is
the reverse shape. The archived move must stay green, and its
twin, with `unarchived` returning the path unchanged, fails the excuse case on `excuses 2, holds 0`.

The excuses are three historical trees (`docs/superpowers/`, this change's own directory,
`openspec/changes/archive/` last, so an archived listed change still counts for its own entry), every
change's `verify.md` whether archived or not, and eleven files that mix current text with dated
history, each excusing an exact count (the check's own file among them, three). A current reference
added to one of those eleven raises its count and fails the third case. **Archiving:** every excuse is
written in the unarchived form, and `unarchived` maps `openspec/changes/archive/<date>-<name>/…` back to
it, so archiving this change or any listed one moves no count. The delta spec names the root only as
"the retired root", so the spec the archive syncs into `openspec/specs/` needs no excuse. What still
needs an edit is a change that rewrites a listed file's mentions, or moves it any other way. The JSDoc
of `HISTORICAL_TREES` and `DATED_MENTIONS` and section 12 say so. **Known limit:** a root spelled any third way —
built from variables, split inside one string — is invisible to the text check; the suites that
resolve such paths are its net (`gate-entrypoints.test.ts` failed nineteen tests on the segment
spelling before the check read it).

### 3.7 A script plus a checked result, not a fenced diff

Slice 3 changes 50 files, most of them by one path or one `../`, and it lands on a tree whose slice 1
`Proof:` comments carry the executor's own date. A context diff would fail wherever a hunk's context
touched such a line. So slice 3 is **one script of exact substitutions**: `sub FILE COUNT OLD NEW`
refuses unless `FILE` holds exactly `COUNT` copies of `OLD`, and `subf` does the same for multi-line
text read from here-documents. Nothing is matched by a pattern; every edit is a literal the reviewer
reads in section 7.7. Prettier then formats the touched files. The checked result is the rehearsal:
section 9.1 replays the script on a fresh extract of the base and proves the tree byte-identical to
`rehearse/suite-move-r3` (`fill=0`), identical but for dates with the executor's own dates (`fill=1`),
and the same delta on the real planning base (`fill=real`). Slice 1 adds code rather than renaming it
and lands on the base, so it stays four ordinary diffs.

### 3.8 The release workflow, its environment, and the trusted activation

- **Release workflow.** Its four `bun apps/wiki/cli/src/packaging/release-cli.ts` steps move; its Nx
  targets are by name and do not. `release.test.ts` (packaging) reads the workflow from the checkout
  (`'../../../../../../.github/workflows/twilight-burokrat-release.yml'`) and `release.ts` reads
  `…/cli/package.json` and `…/cli/LICENSE` from the repository root; all follow and pass.
- **Its environment.** `twilight-burokrat-release` admits deployments by tag (`twilight-burokrat-v*`)
  and holds `NPM_TOKEN`; nothing in it names a path. No administrator action is needed. Not verified
  from here: the environment's settings were taken from the planning notes, not read from GitHub.
- **The trusted activation.** Every activation binds one commit, and `trusted-wiki` certifies nothing
  until an operator prepares one for a candidate head (runbook, "Relocation"): the committed policy
  already carries the move (`selector` new, `sourceSelector` unchanged, mapping prefix, index path,
  `mappingVersion` v4, facts), and
  `prepare-relocation-activation-cli.ts`'s default `--validator-entry` now names the new
  `cli/src/cli.ts`. No activation is provisioned today (CI's `lint` is red for that reason), so
  this packet changes no admission outcome; the relocation activation is **pending operator
  work**, named in section 12.

## 4. Verified facts

Every fact was read or run on `ad0451da9` on 2026-09-25 unless it names a rehearsal commit, and
rechecked on `e93a564a0`: the line anchors and every fact but the counts in the last three rows hold
there unchanged (PR #63 touched none of these files); the counts are given for both bases.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| the layout gate refuses any `apps/` root that is not three segments deep                                                                                                                                                                                                                                                                                                                                                                                         | `tools/tool-devsync/workspace-projects.mjs:397` (`segments.length !== 3`)                                    |
| `apps/wiki/cli` is excused by `FROZEN_APPLICATION_ROOTS` as product and name `twilight-burokrat`, looked up by exact root                                                                                                                                                                                                                                                                                                                                        | `workspace-projects.mjs:300`, `:414`                                                                         |
| `findStaleLayoutExceptions` reports an exception whose root no project occupies                                                                                                                                                                                                                                                                                                                                                                                  | `workspace-projects.mjs:310`                                                                                 |
| the gate is enforced by devsync's `namespace-layout.test.ts` alone (`accepts the complete actual workspace after the coordinated move`)                                                                                                                                                                                                                                                                                                                          | `tools/tool-devsync/src/namespace-layout.test.ts`                                                            |
| product lint policies are discovered one level below `apps/` and `libs/`, and a missing policy is the one outcome passed over                                                                                                                                                                                                                                                                                                                                    | `tools/tool-devsync/product-policies.mjs:5`, `:78`                                                           |
| Nx's lint cache input for product policies is `{workspaceRoot}/apps/*/eslint.product.mjs`                                                                                                                                                                                                                                                                                                                                                                        | `nx.json:48`                                                                                                 |
| project discovery (`readProjects`) is recursive, so the moved project is found at four segments                                                                                                                                                                                                                                                                                                                                                                  | `workspace-projects.mjs` `scanDirectory`                                                                     |
| the dev poller restarts on `apps/wiki/cli/project.json` and `tsconfig.json`, and its test walks apps rather than trusting the list                                                                                                                                                                                                                                                                                                                               | `tools/tool-devsync/src/sync.ts:496`, `:509`; `sync.test.ts` "RESTART_PATHS coverage"                        |
| the legacy-occurrence pin is `68a1e15d…`, 305 occurrences, keyed by path, class and line text; three moved files are named in its classifier                                                                                                                                                                                                                                                                                                                     | `repo-namespacing-handoff.test.ts:858`, `:406`–`:408`                                                        |
| the index checker test runs `apps/wiki/cli/src/cli.ts` by a relative URL                                                                                                                                                                                                                                                                                                                                                                                         | `repo-namespacing-handoff.test.ts:468`                                                                       |
| the inventory pins `apps/wiki/cli/tsconfig.lib.json`'s outDir `../../../dist/apps/wiki/cli`                                                                                                                                                                                                                                                                                                                                                                      | `workspace-inventory.test.ts:241`                                                                            |
| the bootstrap boundary selects `apps/wiki/cli` with `sourceSelector` `tools/tool-wiki`; its mapping prefix, index path and `mappingVersion` `…-v3`                                                                                                                                                                                                                                                                                                               | `docs/wiki-policy/bootstrap-policy.json:744`; `modules.bootstrap.json:4`, `:209`, `:214`                     |
| both relationship files copy `twilight-burokrat`'s test, lint-source and typecheck targets, cwd and paths included, and a test compares them with `project.json`                                                                                                                                                                                                                                                                                                 | `relationships.json:157`–`:204`, `relationships.bootstrap.json:129`–`:176`; `committed-target-facts.test.ts` |
| the pilot pins the selector literally and pins the first refused index, which sorts by path                                                                                                                                                                                                                                                                                                                                                                      | `pilot-policy.test.ts:971`, `:606`                                                                           |
| `gate-entrypoints.test.ts` builds the root from quoted segments seven times                                                                                                                                                                                                                                                                                                                                                                                      | `:29`, `:129`, `:518`, `:1113`, `:1192`, `:1292`, `:1300`                                                    |
| CI selects the project by name, never by path                                                                                                                                                                                                                                                                                                                                                                                                                    | `.github/workflows/ci.yml:481`                                                                               |
| lefthook, `bin/*.sh`, root `package.json`, `tsconfig.base.json`, `.prettierignore` and `.nxignore` name no path under `apps/wiki`                                                                                                                                                                                                                                                                                                                                | `git grep` on the base                                                                                       |
| the package's `files` and `bin` are package-relative; the base tarball has 163 entries, SHA-256 `13500818…`                                                                                                                                                                                                                                                                                                                                                      | `apps/wiki/cli/package.json`; `test:package` on the base                                                     |
| the Nx project `twilight-burokrat` has root `apps/wiki/cli` and `sourceRoot` `apps/wiki/cli/src`                                                                                                                                                                                                                                                                                                                                                                 | `nx show project twilight-burokrat --json`                                                                   |
| `check-indexes committed . HEAD` lists 34 indexes; Twilight Burokrat's, `module.infra.tool-wiki`, has 123 members                                                                                                                                                                                                                                                                                                                                                | run on the base                                                                                              |
| strict OpenSpec: 114 items on `ad0451da9`, 115 on `e93a564a0`                                                                                                                                                                                                                                                                                                                                                                                                    | run on the base                                                                                              |
| whole `tool-devsync:test` 371 pass (372 on `e93a564a0`, inferred from slice 1's 379 less its seven cases); whole `twilight-burokrat:test` 762 pass and 2 fail, both `this test timed out after 5000ms` on a loaded host (`production CLI validation boundary > rejects noncanonical candidate and membership paths`, `relationship extraction production CLI > refuses malformed static Nx project data without running candidate code`); `test:package` 44 pass | run on the base, 2026-09-25                                                                                  |
| the agent-scalable-wiki "operational freeze" that once deferred this move (`twilight-burokrat-package/design.md`) never happened: tasks 6.1 and 7.5 stay unchecked, and no committed artefact pins the old path beyond what section 3.1 lists                                                                                                                                                                                                                    | `openspec/changes/agent-scalable-llm-wiki/tasks.md`                                                          |

## 5. File plan

**Slice 1 owns 13 paths**: `CONTEXT.md`, `nx.json`, `tools/tool-devsync/workspace-projects.mjs`,
`tools/tool-devsync/product-policies.mjs`, and under `tools/tool-devsync/src/`:
`namespace-layout.test.ts`, `eslint-boundaries.test.ts`, `lint-policy-cache.test.ts`,
`repo-namespacing-handoff.test.ts` (the pin); and five new files under
`openspec/changes/adopt-suite-directory-layout/`: `.openspec.yaml`, `proposal.md`,
`specs/suite-directory-layout/spec.md`, `tasks.md`, `verify.md`.

**Slice 2 owns the move**: every path under `apps/wiki/` (deleted) and under
`apps/twilight-structure/twilight-burokrat/` (new, the same files; rehearsed 127 each way), plus
`tasks.md` and `verify.md` of the change. It ends without a commit; the planner stages it.

**Slice 3 owns 52 paths**: the 50 the script and patch 05 touch (listed in slice 3, step 3), plus
`tasks.md` and `verify.md` of the change. One is new: `tools/tool-devsync/src/retired-roots.test.ts`.
The planner commits slices 2 and 3 as one commit.

Nothing else: not `package.json`, `bun.lock`, `lefthook.yml`, `bin/`, `.github/workflows/ci.yml` or
`trusted-wiki.yml`, `infra/ci/burokrat/`, `docs/wiki-policy/policy.json` or `modules.json`, and no
file under `apps/wbs` or `libs`. 140.1 owns `package.json`, `bun.lock` and the WBS sources it
migrates; no path meets.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block is `sh`, run from the
repository root unless it says `cd`, one at a time. Bun runs as `env -u CLAUDECODE -u AGENT -u
CLAUDE_CODE_ENTRYPOINT` (13 Bun output tests fail under `CLAUDECODE=1`); Nx runs with
`NX_DAEMON=false` and `--skip-nx-cache`.

### Step 0 — at the start of every slice

**0a. The starting state.** Replace `<the SHA named in this attempt's slice note>` with the
40-character hash the slice note gives (`reviewed base <sha>`); unreplaced, the block dies on the
unterminated quote.

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
reviewed=<the SHA named in this attempt's slice note>
test "$base" = "$reviewed"
git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
test ! -s "$TMPDIR/evidence/status-before.txt"
```

Expected: `base=` the slice note's hash and an **empty** `status-before.txt`.

**0b. Helpers and extraction.** Writes six helpers into `$TMPDIR` and extracts this document's five
patches (section 7), three scripts (section 7) and 35 fault patches (section 8), each by the heading
above its block. Every file is written with `>`, so a rerun in the same `$TMPDIR` rewrites it.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/suite-directory-move.md
test -f "$packet"
mkdir -p "$TMPDIR/evidence" "$TMPDIR/patches" "$TMPDIR/scripts" "$TMPDIR/faults"
cat > "$TMPDIR/run-check.sh" <<'RUN_CHECK'
#!/usr/bin/env bash
# run-check.sh NAME COMMAND...: runs COMMAND into $TMPDIR/evidence/NAME.log, appends its status and
# prints the summary lines. Never fails itself: the status line is the result.
set -uo pipefail
name=$1
shift
log="$TMPDIR/evidence/$name.log"
if "$@" > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
test -f "$log"
if summary=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -aE '^ *[0-9]+ (pass|fail)$|^Ran |Found [0-9]+ error|error TS|^status='); then
  printf '%s | %s\n' "$name" "$(printf '%s' "$summary" | tr -s ' ' | tr '\n' ' ')"
else
  rc=$?
  test "$rc" -eq 1
fi
RUN_CHECK
cat > "$TMPDIR/expect-status.sh" <<'EXPECT_STATUS'
#!/usr/bin/env bash
# expect-status.sh NAME N: fails unless the named check's recorded status is exactly N.
set -euo pipefail
log="$TMPDIR/evidence/$1.log"
test -f "$log"
test "$(tail -n 1 "$log")" = "status=$2"
EXPECT_STATUS
cat > "$TMPDIR/fault.sh" <<'FAULT_SH'
#!/usr/bin/env bash
# fault.sh ID DIR COMMAND...: applies $TMPDIR/faults/ID.diff, runs COMMAND in DIR into
# $TMPDIR/evidence/fault-ID.log, appends its status, reverses the patch and proves every file it
# touched is back: modified files copied back byte for byte, created files gone. Rerun the
# original command green after restoration; a red restored tree is an evidence failure.
# The command's own status is the evidence, so this script fails only on an evidence fault.
set -euo pipefail
id=$1
dir=$2
shift 2
patch="$TMPDIR/faults/$id.diff"
test -f "$patch"
saved="$TMPDIR/saved-$id"
mkdir -p "$saved"
awk '/^--- a\// { print substr($0, 7) }' "$patch" | sort -u > "$saved.modified"
awk '/^--- \/dev\/null$/ { getline; print substr($0, 7) }' "$patch" | sort -u > "$saved.created"
while read -r f; do
  test -f "$f"
  mkdir -p "$saved/$(dirname "$f")"
  cp "$f" "$saved/$f"
done < "$saved.modified"
while read -r f; do test ! -e "$f"; done < "$saved.created"
cp "$patch" "$TMPDIR/evidence/fault-$id.patch"
git apply --unidiff-zero --check "$patch"
git apply --unidiff-zero "$patch"
log="$TMPDIR/evidence/fault-$id.log"
if (cd "$dir" && "$@") > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
git apply --unidiff-zero -R "$patch"
while read -r f; do
  cp "$saved/$f" "$f"
  cmp "$f" "$saved/$f"
done < "$saved.modified"
while read -r f; do test ! -e "$f"; done < "$saved.created"
green="$TMPDIR/evidence/restored-$id.log"
if (cd "$dir" && "$@") > "$green" 2>&1; then
  green_status=0
else
  green_status=$?
fi
echo "status=$green_status" >> "$green"
test "$green_status" -eq 0
echo "fault $id: status=$status, restored and green"
FAULT_SH
cat > "$TMPDIR/expect-fault.sh" <<'EXPECT_FAULT'
#!/usr/bin/env bash
# expect-fault.sh ID STATUS [FRAGMENT...]: the fault's recorded status is exactly STATUS and its
# log, colour codes stripped, holds every FRAGMENT as a fixed string.
set -euo pipefail
log="$TMPDIR/evidence/fault-$1.log"
test -f "$log"
test "$(tail -n 1 "$log")" = "status=$2"
shift 2
for fragment in "$@"; do
  if sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -qF -- "$fragment"; then :; else
    echo "fault log $log lacks: $fragment" >&2
    exit 1
  fi
done
EXPECT_FAULT
cat > "$TMPDIR/insert-proofs.pl" <<'INSERT_PROOFS'
# insert-proofs.pl PACKET PREFIX DATE: inserts every ```proof block of PACKET whose id starts with
# PREFIX, dated DATE, directly above its `anchor:` line or directly below its `after:` line. Each
# anchor must match exactly one line, compared with its indentation trimmed.
use strict;
use warnings;
my ($packet, $prefix, $date) = @ARGV;
die "usage: insert-proofs.pl PACKET PREFIX DATE\n" unless defined $date && $date =~ /^\d{4}-\d{2}-\d{2}$/;
open my $fh, '<', $packet or die "cannot read $packet: $!\n";
my (@blocks, @current);
my $inside = 0;
while (my $line = <$fh>) {
  if (!$inside && $line =~ /^```proof$/) { $inside = 1; @current = (); next; }
  if ($inside && $line =~ /^```$/) { $inside = 0; push @blocks, [@current]; next; }
  push @current, $line if $inside;
}
close $fh;
my $inserted = 0;
for my $block (@blocks) {
  my @lines = @$block;
  my %head;
  while (@lines && $lines[0] =~ /^(id|file|anchor|after): (.*)$/) { $head{$1} = $2; shift @lines; }
  die "proof block without id\n" unless defined $head{id};
  next unless index($head{id}, $prefix) == 0;
  my $target = $head{anchor} // $head{after} // die "$head{id} names no anchor\n";
  open my $in, '<', $head{file} or die "$head{id}: cannot read $head{file}: $!\n";
  my @source = <$in>;
  close $in;
  my @hits = grep {
    my $text = $source[$_];
    $text =~ s/^\s+//;
    $text =~ s/\s+$//;
    $text eq $target;
  } 0 .. $#source;
  die "$head{id}: anchor matches " . scalar(@hits) . " lines in $head{file}\n" unless @hits == 1;
  my ($indent) = $source[$hits[0]] =~ /^(\s*)/;
  my @comment = map { (my $text = $_) =~ s/<observed-date>/$date/g; "$indent$text" } @lines;
  splice @source, (defined $head{anchor} ? $hits[0] : $hits[0] + 1), 0, @comment;
  open my $out, '>', $head{file} or die "$head{id}: cannot write $head{file}: $!\n";
  print $out @source;
  close $out;
  $inserted++;
}
print "inserted $inserted proof blocks for $prefix\n";
INSERT_PROOFS
cat > "$TMPDIR/tick.sh" <<'TICK_SH'
#!/usr/bin/env bash
# tick.sh TASK...: checks each named task of this packet's OpenSpec change, exactly once.
set -euo pipefail
tasks=openspec/changes/adopt-suite-directory-layout/tasks.md
test -f "$tasks"
for task in "$@"; do
  test "$(grep -c "^- \[ \] $task " "$tasks")" -eq 1
  sed -i "s/^- \[ \] $task /- [x] $task /" "$tasks"
  test "$(grep -c "^- \[x\] $task " "$tasks")" -eq 1
done
TICK_SH
# Sections 7 and 8: every block under a "#### Patch NN", "#### Script NAME" or "#### Fault ID"
# heading, by that heading's third word. printf "" truncates on the first write of this run.
awk -v out="$TMPDIR" '
  /^#### (Patch|Script|Fault) / { kind = $2; id = $3; next }
  kind != "" && /^```(diff|sh)$/ {
    dir = kind == "Patch" ? "patches" : kind == "Script" ? "scripts" : "faults"
    f = out "/" dir "/" id (kind == "Script" ? ".sh" : ".diff")
    printf "" > f
    capture = 1
    next
  }
  capture && /^```$/ { capture = 0; kind = ""; close(f); next }
  capture { print > f }
' "$packet"
p=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
s=$(find "$TMPDIR/scripts" -name '*.sh' | wc -l)
f=$(find "$TMPDIR/faults" -name '*.diff' | wc -l)
r=$(grep -c '^```proof$' "$packet")
echo "patches=$p scripts=$s faults=$f proofs=$r"
test "$p" -eq 5
test "$s" -eq 3
test "$f" -eq 35
test "$r" -eq 27
````

Expected: `patches=5 scripts=3 faults=35 proofs=27`, exit 0, on a first run and on any rerun.
**Applying patch NN** always means exactly this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell. `git apply` without `--index` writes only the working tree.

**Running a check** always means `bash "$TMPDIR/run-check.sh" NAME COMMAND…`: it writes
`$TMPDIR/evidence/NAME.log`, appends `status=N` and prints the summary lines; `bash
"$TMPDIR/expect-status.sh" NAME N` then fails unless the recorded status is exactly `N`. Two shell
functions shorten the Bun runs; define and export them in every block that uses them, because
`run-check.sh` runs its command in a child shell:

```sh
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
bk() { (cd apps/twilight-structure/twilight-burokrat/cli && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/../../../../node_modules" timeout 1500 bun test --preload ../../../../tools/test/scratch/preload.ts "$@"); }
export -f dev bk
```

**Counts are relative.** Every count below is the slice's own step-0 number plus what the slice adds;
the rehearsed numbers are given for orientation. The executor never runs whole `tool-devsync:test`,
whole `twilight-burokrat:test`, `test:package`, `check-indexes`, the pilot's `pins …` test or
`build.test.ts`: they write Git objects, listen on a port, or read the commit the planner has not made
yet. Section 9.4 gives each to the planner with its expected value.

### Slice 1 — the suite level

**Step 1.** Step 0, then the baselines:

```sh
set -euo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
export -f dev
c="$TMPDIR/run-check.sh"
bash "$c" s1-base-layout dev ./src/namespace-layout.test.ts
bash "$c" s1-base-policies dev ./src/eslint-boundaries.test.ts
bash "$c" s1-base-cache dev ./src/lint-policy-cache.test.ts
bash "$c" s1-base-legacy dev ./src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence'
for n in s1-base-layout s1-base-policies s1-base-cache s1-base-legacy; do bash "$TMPDIR/expect-status.sh" $n 0; done
```

Then the strict OpenSpec block (section 9.2) as `s1-base-openspec`. Rehearsed: layout 19·0, policies
15·0, cache 4·0, legacy 1·0, OpenSpec `{"items":115,"passed":115,"failed":0}` on `e93a564a0`.

**Step 2. The contract first (R4).** Create the change with the batch README's standard block, then
apply patch 03 and validate:

```sh
set -euo pipefail
env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-suite-directory-layout --schema sdd-lean
grep -n "schema: sdd-lean" openspec/changes/adopt-suite-directory-layout/.openspec.yaml
git apply --check "$TMPDIR/patches/03.diff"
git apply "$TMPDIR/patches/03.diff"
```

Expected: one `1:schema: sdd-lean` line; then the strict block exits 0 with `passed` = step 1's
number **plus 1** (rehearsed 115 → 116). Patch 03 also adds **Suite** to `CONTEXT.md` and rewords
**Product**.

**Step 3. Red.** Apply patch 01 (the three test files), then:

```sh
set -euo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
export -f dev
c="$TMPDIR/run-check.sh"
bash "$c" s1-red-layout dev ./src/namespace-layout.test.ts
bash "$c" s1-red-policies dev ./src/eslint-boundaries.test.ts -t suite
bash "$c" s1-red-cache dev ./src/lint-policy-cache.test.ts
bash "$c" s1-red-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache
for n in s1-red-layout s1-red-policies s1-red-cache; do bash "$TMPDIR/expect-status.sh" $n 1; done
bash "$TMPDIR/expect-status.sh" s1-red-typecheck 0
```

Expected, rehearsed: layout `20 pass 3 fail` — `accepts a declared suite product at …`,
`derives a suite project product and name from its product directory` and `requires exactly
apps/<suite>/<product>/<project> under a declared suite` fail on `applications require
apps/<product>/<project>`; the fourth new case, `keeps an undeclared directory a product, so four
segments there stay malformed`, passes on this tree — it is the declared-list clause's oracle, and
fault `n2` is its red. Policies `1 pass 2 fail` (`Expected: 1 · Received: 0` for the suite policy,
`Expected: not 0` for the suite-level refusal); the third new case, `reads a libs directory named
like a suite as a product`, passes on this tree — the `group !== 'apps'` clause's oracle, and fault `p3`
is its red. Cache `2 pass 2 fail` on the absent
`{workspaceRoot}/apps/*/*/eslint.product.mjs`. The tests type-check against the unchanged code:
typecheck `status=0`.

**Step 4. Green.** Apply patch 02 (`workspace-projects.mjs`, `product-policies.mjs`, `nx.json`), then:

```sh
set -euo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
export -f dev
c="$TMPDIR/run-check.sh"
bash "$c" s1-green-layout dev ./src/namespace-layout.test.ts
bash "$c" s1-green-policies dev ./src/eslint-boundaries.test.ts
bash "$c" s1-green-cache dev ./src/lint-policy-cache.test.ts
bash "$c" s1-pin-red dev ./src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence'
for n in s1-green-layout s1-green-policies s1-green-cache; do bash "$TMPDIR/expect-status.sh" $n 0; done
bash "$TMPDIR/expect-status.sh" s1-pin-red 1
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/evidence/s1-pin-red.log" | grep -F '"digest": "551e2a7d0fb1ed4b5659abee6b00ede7ccf703b9f65f71761b88be12a318eb80"'
```

Expected: layout step 1 **+4** (23·0), policies **+3** (18·0), cache unchanged (4·0); the legacy pin
fails with the received digest `551e2a7d…` printed, occurrences 305 → 308 and
`current recursive selector` 31 → 34 — the three new `apps/*/*/` selectors, in `nx.json` and twice in
`lint-policy-cache.test.ts`; nothing unclassified. **A different received digest is a stop** (section
10, condition 5): the patch below pins this one. Then apply patch 04 (the pin) and rerun `s1-pin-green`
with the same command: `status=0`, `1 pass`. Then typecheck and lint, each expected `status=0`:

```sh
set -euo pipefail
bash "$TMPDIR/run-check.sh" s1-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache
bash "$TMPDIR/run-check.sh" s1-lint env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
bash "$TMPDIR/expect-status.sh" s1-typecheck 0
bash "$TMPDIR/expect-status.sh" s1-lint 0
```

**Step 5. The faults**, section 8.1: its run block, then its expectation block, which must print
`slice 1: every fault failed its named case on its own fact`.

**Step 6. Proof comments and the tasks**, only after step 5 printed its line:

```sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/suite-directory-move.md
perl "$TMPDIR/insert-proofs.pl" "$packet" s1- "$(date -u +%F)"
if git grep -n '<observed-date>' -- tools; then exit 1; else test $? -eq 1; fi
bash "$TMPDIR/tick.sh" 1.1 1.2
```

Expected: `inserted 9 proof blocks for s1-`, no placeholder left, tasks 1.1 and 1.2 checked. Rerun
step 4's four test checks as `s1-final-*` (same counts) and `s1-lint` as `s1-final-lint`.

**Step 7. Record and hand over.** Append this slice's `verify.md` entry (section 6.4), then:

```sh
set -euo pipefail
o=openspec/changes/adopt-suite-directory-layout
printf '%s\n' CONTEXT.md nx.json tools/tool-devsync/product-policies.mjs \
  tools/tool-devsync/src/eslint-boundaries.test.ts tools/tool-devsync/src/lint-policy-cache.test.ts \
  tools/tool-devsync/src/namespace-layout.test.ts tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  tools/tool-devsync/workspace-projects.mjs $o/.openspec.yaml $o/proposal.md \
  $o/specs/suite-directory-layout/spec.md $o/tasks.md $o/verify.md > "$TMPDIR/owned.txt"
test "$(wc -l < "$TMPDIR/owned.txt")" -eq 13
# shellcheck disable=SC2046 # fixed repository paths without spaces
env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
# shellcheck disable=SC2046
env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
git status --porcelain --untracked-files=all | cut -c4- | sort > "$TMPDIR/evidence/status-paths.txt"
sort "$TMPDIR/owned.txt" | diff - "$TMPDIR/evidence/status-paths.txt"
```

Then the strict OpenSpec block once more (`passed` = step 2's). Expected: `All matched files use
Prettier code style!` and an empty `diff`: eight ` M` paths and the new change directory's five files.

Planner commit subject: `feat(devsync): read apps/<suite>/<product>/<project> for a declared suite`.

### Slice 2 — the move

**Step 1.** Step 0. Record the number of files to move:

```sh
set -euo pipefail
git ls-files apps/wiki | wc -l | tee "$TMPDIR/evidence/s2-count.txt"
test ! -e apps/twilight-structure
```

Rehearsed: `127`.

**Step 2.** Run script `s2-move` (section 7.5) and its check:

```sh
set -euo pipefail
bash "$TMPDIR/scripts/s2-move.sh"
new=apps/twilight-structure/twilight-burokrat
test ! -e apps/wiki
# What the index holds under the old root is exactly what now sits, untracked, under the new one.
git ls-files apps/wiki | sed 's#^apps/wiki/##' | sort > "$TMPDIR/evidence/s2-old.txt"
git ls-files --others --exclude-standard "$new" | sed "s#^$new/##" | sort > "$TMPDIR/evidence/s2-new.txt"
test "$(wc -l < "$TMPDIR/evidence/s2-old.txt")" -gt 100
diff "$TMPDIR/evidence/s2-old.txt" "$TMPDIR/evidence/s2-new.txt"
# Every moved file keeps its bytes but cli/tsconfig.json, which differs by the extends line alone.
changed=0
while read -r f; do
  if git show "HEAD:apps/wiki/$f" | cmp -s - "$new/$f"; then :; else
    test "$f" = cli/tsconfig.json
    changed=$((changed + 1))
  fi
done < "$TMPDIR/evidence/s2-old.txt"
test "$changed" -eq 1
if git show HEAD:apps/wiki/cli/tsconfig.json | diff - "$new/cli/tsconfig.json" > "$TMPDIR/evidence/s2-tsconfig.diff"; then exit 1; else test $? -eq 1; fi
test "$(grep -c '^[<>]' "$TMPDIR/evidence/s2-tsconfig.diff")" -eq 2
echo "s2-check: $(wc -l < "$TMPDIR/evidence/s2-old.txt") files moved, one line changed"
```

Expected: `s2-move: apps/wiki is apps/twilight-structure/twilight-burokrat`, then `s2-check: 127 files
moved, one line changed` (step 1's number). `s2-tsconfig.diff` holds exactly the `extends` line,
`../../../tsconfig.base.json` → `../../../../tsconfig.base.json`.

**Step 3.** `bash "$TMPDIR/tick.sh" 2.1`, append this slice's `verify.md` entry, format the two
records and hand over:

```sh
set -euo pipefail
o=openspec/changes/adopt-suite-directory-layout
env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $o/tasks.md $o/verify.md
env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $o/tasks.md $o/verify.md
git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
n=$(cat "$TMPDIR/evidence/s2-count.txt")
test "$(grep -c '^ D apps/wiki/' "$TMPDIR/evidence/status-after.txt")" -eq "$n"
test "$(grep -c '^?? apps/twilight-structure/twilight-burokrat/' "$TMPDIR/evidence/status-after.txt")" -eq "$n"
test "$(grep -c '^ M openspec/changes/adopt-suite-directory-layout/' "$TMPDIR/evidence/status-after.txt")" -eq 2
test "$(wc -l < "$TMPDIR/evidence/status-after.txt")" -eq $((2 * n + 2))
```

**Nothing else runs in this slice.** Typecheck, lint and the devsync and Twilight Burokrat suites are
red on this tree until slice 3's edits; running them proves nothing slice 3's step 1 does not record.

**No planner commit** (D3, section 3.4). The planner reviews the hand-over, stages it and records the
index digest slice 3's note carries:

```sh
git add -A
git diff --cached -M --summary | grep -c '(100%)'
git diff --cached -M --summary | grep -v '(100%)'
git ls-files -s | sha256sum | cut -c1-64
```

Rehearsed: `126` renames at 100%, the one line
` rename apps/{wiki => twilight-structure/twilight-burokrat}/cli/tsconfig.json (85%)`, and the two
records as ` M`-staged; the digest is the clone's own and goes into slice 3's slice note.

### Slice 3 — every reference follows

**Step 1.** Slice 3 starts on slice 1's commit with slice 2's move **staged, not committed**, so it
replaces step 0a with this check; replace both placeholders from the slice note
(`reviewed base <sha>; staged index <digest>`):

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
reviewed=<the SHA named in this attempt's slice note>
staged=<the index digest named in this attempt's slice note>
test "$base" = "$reviewed"
test "$(git ls-files -s | sha256sum | cut -c1-64)" = "$staged"
git diff --quiet
git ls-files --others --exclude-standard | tee "$TMPDIR/evidence/untracked-before.txt"
test ! -s "$TMPDIR/evidence/untracked-before.txt"
git diff --cached -M --summary | grep -c '^ rename apps/{wiki => twilight-structure/twilight-burokrat}/'
```

Expected: `base=` the note's hash, an empty `untracked-before.txt`, and the count of staged renames
into the new root, rehearsed `127`. Then step 0b, and the baselines, which are **red by design** on the
staged move:

```sh
set -uo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
export -f dev
c="$TMPDIR/run-check.sh"
for f in namespace-layout workspace-projects sync workspace-inventory workspace-targets lint-policy-cache; do
  bash "$c" s3-base-$f dev ./src/$f.test.ts
done
bash "$c" s3-base-legacy dev ./src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence'
bash "$c" s3-base-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache
```

Rehearsed: layout 22·1, workspace-projects 15·2, sync 50·2, inventory 3·1, targets 17·2, cache 4·0,
legacy 0·1, typecheck `status=1` with `error TS6053: File '…/apps/wiki/cli/tsconfig.json' not found`.
The index already holds the new paths, so path-listing tests (`committed-target-facts.test.ts`, the
retired-root check) see the moved tree.
Record each; they are this slice's red. (`set -uo` without `-e`: the reds are expected.)

**Step 2. The check, red first.** Apply patch 05 (the new `retired-roots.test.ts`), then:

```sh
set -euo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
export -f dev
bash "$TMPDIR/run-check.sh" s3-red-retired dev ./src/retired-roots.test.ts
bash "$TMPDIR/expect-status.sh" s3-red-retired 1
log="$TMPDIR/evidence/s3-red-retired.log"
sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -cE '^\+   "[^"]+:[0-9]+",$'
sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -F '(pass) no file remains under the retired apps/wiki root'
```

Expected, rehearsed: `1 pass 2 fail`; the count of current `path:line` entries is **115** — every
occurrence section 3.1 marks "follow", the seven segment spellings included — and the excuse case
lists `pilot-policy.test.ts: excuses 2, holds 5`, `repo-namespacing-handoff.test.ts: excuses 4, holds
8` and `workspace-inventory.test.ts: excuses 2, holds 4`: the dated history the excuses count, plus
the current lines the script is about to move.

**Step 3. The script, then Prettier over exactly the touched files:**

```sh
set -euo pipefail
bash "$TMPDIR/scripts/s3-edit.sh"
printf '%s\n' \
  apps/twilight-structure/twilight-burokrat/cli/project.json \
  apps/twilight-structure/twilight-burokrat/cli/README.md \
  apps/twilight-structure/twilight-burokrat/cli/src/admission/generations.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/contracts/contracts.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/indexes/root-migration.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/inventory/classification.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/consumer-bootstrap.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/install.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/pack.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/release.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/packaging/release.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/activation.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/gate-entrypoints.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/prepare-relocation-activation-cli.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/release-cli.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/release.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/relocation-fixtures.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/policy/trusted-policy.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/relationships/selectors.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/review/audit.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/rules/check.ts \
  apps/twilight-structure/twilight-burokrat/cli/src/rules/rules.test.ts \
  apps/twilight-structure/twilight-burokrat/cli/tsconfig.json \
  apps/twilight-structure/twilight-burokrat/cli/tsconfig.lib.json \
  apps/twilight-structure/twilight-burokrat/cli/tsconfig.spec.json \
  CONTEXT.md \
  docs/findings/checks-that-cannot-fail.md \
  docs/runbook-tool-wiki-activation.md \
  docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md \
  docs/twilight-structure/names.md \
  docs/wiki-policy/bootstrap-policy.json \
  docs/wiki-policy/modules.bootstrap.json \
  docs/wiki-policy/relationships.bootstrap.json \
  docs/wiki-policy/relationships.json \
  .github/workflows/twilight-burokrat-release.yml \
  LLM_README.md \
  openspec/changes/twilight-control-plane/tasks.md \
  openspec/changes/wiki-release/specs/wiki-release/spec.md \
  tools/tool-devsync/src/eslint-boundaries.test.ts \
  tools/tool-devsync/src/namespace-layout.test.ts \
  tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  tools/tool-devsync/src/retired-roots.test.ts \
  tools/tool-devsync/src/sync.ts \
  tools/tool-devsync/src/workspace-inventory.test.ts \
  tools/tool-devsync/src/workspace-projects.test.ts \
  tools/tool-devsync/workspace-projects.mjs \
  > "$TMPDIR/touched.txt"
test "$(wc -l < "$TMPDIR/touched.txt")" -eq 50
# shellcheck disable=SC2046 # fixed repository paths without spaces
env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/touched.txt")
{ git diff --name-only; git ls-files --others --exclude-standard; } | grep -v '^openspec/changes/adopt-suite-directory-layout/' | sort | diff - <(sort "$TMPDIR/touched.txt")
```

Expected: `s3-edit: every substitution matched its count`; Prettier rewrites twelve of the 50 files
(long paths re-wrapped); the `diff` prints nothing.

**Step 4. Green.**

```sh
set -euo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
bk() { (cd apps/twilight-structure/twilight-burokrat/cli && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/../../../../node_modules" timeout 1500 bun test --preload ../../../../tools/test/scratch/preload.ts "$@"); }
export -f dev bk
c="$TMPDIR/run-check.sh"
for f in namespace-layout workspace-projects sync workspace-inventory workspace-targets lint-policy-cache retired-roots; do
  bash "$c" s3-green-$f dev ./src/$f.test.ts
done
bash "$c" s3-green-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync twilight-burokrat --skip-nx-cache
bash "$c" s3-green-lint env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
bash "$c" s3-green-lint-source env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
for f in admission/generations contracts/contracts inventory/classification indexes/root-migration \
  policy/activation policy/gate-entrypoints policy/release policy/trusted-policy rules/rules \
  relationships/committed-target-facts relationships/selectors review/audit packaging/release; do
  bash "$c" "s3-green-bk-${f//\//-}" bk ./src/$f.test.ts
done
for n in "$TMPDIR"/evidence/s3-green-*.log; do bash "$TMPDIR/expect-status.sh" "$(basename "$n" .log)" 0; done
```

Run the Twilight Burokrat files one at a time as written (about twenty minutes; start the block
under the status wrapper and poll, preamble rule 19). Expected `status=0` everywhere, rehearsed:
layout 23·0, workspace-projects 17·0, sync 52·0, inventory 4·0, targets 19·0, cache 4·0,
retired-roots 3·0; generations 13, contracts 16, classification 16, root-migration 32,
activation 13, gate-entrypoints 57, release (policy) 13, trusted-policy 55, rules 63,
committed-target-facts 2, selectors 19, audit 19, release (packaging) 10, each with 0 fail. The counts equal step 1's plus the three
retired-root cases; the Twilight Burokrat files add and lose no test. The pilot's on-disk group and
`refuses prose facts presented as applicable checks` read the repository at `HEAD`, which still holds
the old root until the planner's commit: they are red on the staged move (rehearsed: on-disk 2·2 on
`boundary.infra.tool-wiki` and `check.wiki-cli.test -> …/cli`, prose-facts on `membership target
absent: …/cli/src`) and are the planner's, after the commit (section 9.4).

**Step 5. The legacy pin.**

```sh
set -euo pipefail
dev() { (cd tools/tool-devsync && env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts "$@"); }
export -f dev
bash "$TMPDIR/run-check.sh" s3-pin-red dev ./src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence'
bash "$TMPDIR/expect-status.sh" s3-pin-red 1
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/evidence/s3-pin-red.log" | grep -F '"digest": "c0a77f3355f27bc1e8fa7f23bd427c7b4cc7c068e6f787bb1552364482f28c22"'
bash "$TMPDIR/scripts/s3-pin.sh"
bash "$TMPDIR/run-check.sh" s3-pin-green dev ./src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence'
bash "$TMPDIR/expect-status.sh" s3-pin-green 0
```

Expected: the red names the received digest `c0a77f33…` at the same 308 occurrences and categories —
every context under the moved project changed only its path; **a different received digest is a
stop**; then `s3-pin: the legacy digest names the moved tree` and `1 pass`.

**Step 6. The faults**, section 8.2: its run block, then its expectation block, which must print
`slice 3: every fault met its expected outcome, and every clause-off twin showed its clause alone decides it`.

**Step 7. Proof comments, the dated note and the tasks**, only after step 6 printed its line:

```sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/suite-directory-move.md
observed=$(date -u +%F)
perl "$TMPDIR/insert-proofs.pl" "$packet" s3- "$observed"
pilot=apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts
test "$(grep -c '<observed-date-s3>' "$pilot")" -eq 1
sed -i "s/<observed-date-s3>/$observed/" "$pilot"
if git grep -n '<observed-date' -- tools apps; then exit 1; else test $? -eq 1; fi
bash "$TMPDIR/tick.sh" 3.1 3.2
```

Expected: `inserted 17 proof blocks for s3-`. The `planner-selector` Proof is pending planner
verification after the combined commit. Rerun step 4's devsync checks, both typechecks and
both lints as `s3-final-*`, and `s3-pin-green`: unchanged.

**Step 8. Record and hand over.** Append this slice's `verify.md` entry, then Prettier over the 50
touched paths plus `tasks.md` and `verify.md` (`--write`, then `--check`), then:

```sh
set -euo pipefail
bash "$TMPDIR/run-check.sh" s3-format env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx format:check --all
bash "$TMPDIR/expect-status.sh" s3-format 0
o=openspec/changes/adopt-suite-directory-layout
{ cat "$TMPDIR/touched.txt"; printf '%s\n' $o/tasks.md $o/verify.md; } | sort > "$TMPDIR/owned.txt"
test "$(wc -l < "$TMPDIR/owned.txt")" -eq 52
{ git diff --name-only; git ls-files --others --exclude-standard; } | sort | diff "$TMPDIR/owned.txt" -
```

Then the strict OpenSpec block (`passed` unchanged since slice 1). Expected: format `status=0`; an
empty `diff`: 51 paths changed against the index and one untracked,
`tools/tool-devsync/src/retired-roots.test.ts`. The staged move is the planner's, from slice 2.

Planner commit, for slices 2 and 3 together, through `planner-commit.sh` with whole devsync:
`refactor(burokrat): move Twilight Burokrat into the Twilight Structure suite, every reference with it`.

### 6.4 Verification record entries

Each slice appends one entry to `openspec/changes/adopt-suite-directory-layout/verify.md`, headed
`## Slice N — <what the slice did>`, containing only its own observations: the attempt id and
starting hash; step 1's baselines as numbers; every check's status; the red checkpoint's
diagnostics; the green counts; every fault with its observed fragment; and what stayed **pending
planner verification** (section 9.4). Evidence references are basenames in that attempt's evidence
directory, never absolute paths. Do not restate an earlier entry.

### 6.5 Dispatch

One attempt per slice, from the reviewed packet, with no network, driven by Codex gpt-6-sol at
medium reasoning effort in a workspace-write sandbox. Set `EXEC_MODEL=gpt-6-sol` and
`EXEC_EFFORT=medium` for the launcher's default Codex driver. The
base of slice 1 is batch 7 planning with this plan branch's commits cherry-picked in order (never
merge a `plan/*` branch); before the first dispatch the planner runs section 9.1 with
`REAL_BASE=<reviewed-base-sha>`, whose `fill=real` output is the dispatch evidence. This block holds
the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base.
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium /home/df/wd/puni/puni-plan/exec/run-executor.sh \
  suite-directory-move 1 <reviewed-base-sha> \
  --batch batch-7 \
  --slice-note 'reviewed base <reviewed-base-sha>' --preserve evidence

# Slice 2, into the same clone once slice 1 is committed; P1 is slice 1's planner commit.
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium /home/df/wd/puni/puni-plan/exec/run-executor.sh \
  suite-directory-move 2 P1 \
  --batch batch-7 \
  --resume --require-ancestor P1 --slice-note 'reviewed base P1' --preserve evidence

# Slice 3, into the same clone once slice 2 is reviewed and staged (no commit); D is the
# index digest the planner printed after staging.
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium /home/df/wd/puni/puni-plan/exec/run-executor.sh \
  suite-directory-move 3 P1 \
  --batch batch-7 \
  --resume --require-ancestor P1 --slice-note 'reviewed base P1; staged index D' --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`. The launcher's `batch-7` case
names this directory, so no `--batch-dir` is needed.

## 7. The code

Five patches and three scripts, in slice order. Step 0b extracts each by the heading above it;
section 9.1 applies all of them to a fresh extract of the base and proves the result equal to the
rehearsal. No patch or script adds a `Proof:` comment: those are section 8.3's, inserted only after
their faults were observed.

### 7.1 Slice 1 — the tests (patch 01)

Four layout cases, two discovery cases through a real Nx lint in a scratch workspace, and the suite
glob in the cache-input pins.

#### Patch 01 — namespace-layout, eslint-boundaries and lint-policy-cache tests

```diff
diff --git a/tools/tool-devsync/src/eslint-boundaries.test.ts b/tools/tool-devsync/src/eslint-boundaries.test.ts
index 9066f3f65..f11068d19 100644
--- a/tools/tool-devsync/src/eslint-boundaries.test.ts
+++ b/tools/tool-devsync/src/eslint-boundaries.test.ts
@@ -1,11 +1,11 @@
-import { chmod, readdir, readFile, rm, writeFile } from 'node:fs/promises';
-import { join } from 'node:path';
+import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
+import { dirname, join } from 'node:path';
 import { fileURLToPath } from 'node:url';

 import { describe, expect, it } from 'bun:test';
 import { ESLint } from 'eslint';

-import { createPolicyWorkspace, runLint } from './testing/lint-workspace';
+import { createPolicyWorkspace, runLint, writeProject } from './testing/lint-workspace';

 const workspace = fileURLToPath(new URL('../../..', import.meta.url));
 const lint = new ESLint({ cwd: workspace });
@@ -341,6 +341,61 @@ describe('product lint policy discovery', () => {
     expect(unreadable.output, unreadable.output).toContain('apps/probe/eslint.product.mjs');
   }, 90_000);

+  it('applies a suite product policy at apps/<suite>/<product>/eslint.product.mjs', async () => {
+    const fixture = await createPolicyWorkspace();
+    await writeProject(fixture, 'apps/twilight-structure/probe/app', 'probe-suite-app', [
+      'scope:app',
+      'type:app',
+      'runtime:bun',
+      'ring:adapter',
+      'product:probe',
+    ]);
+    await writeFile(
+      join(fixture, 'apps/twilight-structure/probe/eslint.product.mjs'),
+      "export default () => [{ files: ['apps/twilight-structure/probe/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['left-pad'] }] } }];\n",
+    );
+    await writeFile(
+      join(fixture, 'apps/twilight-structure/probe/app/src/main.ts'),
+      "import 'left-pad';\n",
+    );
+    const applied = await runLint(fixture, 'probe-suite-app');
+    expect(applied.code, applied.output).toBe(1);
+    expect(applied.output, applied.output).toContain('no-restricted-imports');
+  }, 90_000);
+
+  it('refuses a policy in a suite directory itself', async () => {
+    const fixture = await createPolicyWorkspace();
+    const suitePolicy = join(fixture, 'apps/twilight-structure/eslint.product.mjs');
+    await mkdir(dirname(suitePolicy), { recursive: true });
+    await writeFile(suitePolicy, 'export default () => [];\n');
+    const refused = await runLint(fixture, 'probe-app');
+    expect(refused.code, refused.output).not.toBe(0);
+    expect(refused.output, refused.output).toContain('sits in a suite directory');
+    expect(refused.output, refused.output).toContain('apps/twilight-structure/eslint.product.mjs');
+  }, 90_000);
+
+  it('reads a libs directory named like a suite as a product', async () => {
+    const fixture = await createPolicyWorkspace();
+    await writeProject(fixture, 'libs/twilight-structure/probe', 'twilight-structure-probe', [
+      'scope:shared',
+      'ring:domain',
+      'runtime:isomorphic',
+      'product:twilight-structure',
+    ]);
+    await writeFile(
+      join(fixture, 'libs/twilight-structure/eslint.product.mjs'),
+      "export default () => [{ files: ['libs/twilight-structure/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['left-pad'] }] } }];\n",
+    );
+    await writeFile(
+      join(fixture, 'libs/twilight-structure/probe/src/index.ts'),
+      "import 'left-pad';\n",
+    );
+    const applied = await runLint(fixture, 'twilight-structure-probe');
+    expect(applied.code, applied.output).toBe(1);
+    expect(applied.output, applied.output).toContain('no-restricted-imports');
+    expect(applied.output, applied.output).not.toContain('sits in a suite directory');
+  }, 90_000);
+
   it('refuses a policy that is not a function and one that returns no array', async () => {
     const fixture = await createPolicyWorkspace();
     const policy = join(fixture, 'apps/probe/eslint.product.mjs');
diff --git a/tools/tool-devsync/src/lint-policy-cache.test.ts b/tools/tool-devsync/src/lint-policy-cache.test.ts
index 79223c443..b5aceca34 100644
--- a/tools/tool-devsync/src/lint-policy-cache.test.ts
+++ b/tools/tool-devsync/src/lint-policy-cache.test.ts
@@ -192,6 +192,7 @@ describe('production lint policy cache inputs', () => {
       '{workspaceRoot}/tools/tool-devsync/product-policies.mjs',
       '{workspaceRoot}/tools/tool-devsync/workspace-projects.mjs',
       '{workspaceRoot}/apps/*/eslint.product.mjs',
+      '{workspaceRoot}/apps/*/*/eslint.product.mjs',
       '{workspaceRoot}/libs/*/eslint.product.mjs',
       '{workspaceRoot}/apps/**/project.json',
       '{workspaceRoot}/libs/**/project.json',
@@ -200,7 +201,7 @@ describe('production lint policy cache inputs', () => {
     ]);
   });

-  it('declares the discovery module and both product lint policy globs', async () => {
+  it('declares the discovery module and every product lint policy glob', async () => {
     // A product policy the root config discovers, and the module that discovers it, are read
     // at every lint, so a lint cached before either changed is a lint run against a fence that
     // no longer exists.
@@ -211,6 +212,7 @@ describe('production lint policy cache inputs', () => {
     // `{workspaceRoot}/tools/tool-devsync/product-policies.mjs` (2026-09-15).
     const inputs = await productionLintInputs();
     expect(inputs).toContain('{workspaceRoot}/apps/*/eslint.product.mjs');
+    expect(inputs).toContain('{workspaceRoot}/apps/*/*/eslint.product.mjs');
     expect(inputs).toContain('{workspaceRoot}/libs/*/eslint.product.mjs');
     expect(inputs).toContain('{workspaceRoot}/tools/tool-devsync/product-policies.mjs');
   });
diff --git a/tools/tool-devsync/src/namespace-layout.test.ts b/tools/tool-devsync/src/namespace-layout.test.ts
index 1a16c6469..068c80243 100644
--- a/tools/tool-devsync/src/namespace-layout.test.ts
+++ b/tools/tool-devsync/src/namespace-layout.test.ts
@@ -104,6 +104,61 @@ describe('namespace layout validation', () => {
     ]);
   });

+  it('accepts a declared suite product at apps/<suite>/<product>/<project>', () => {
+    const tags = ['scope:app', 'type:app', 'runtime:bun', 'ring:adapter'];
+    expect(
+      findNamespaceLayoutViolations([
+        project('apps/twilight-structure/twilight-probe/cli', 'twilight-probe-cli', [
+          ...tags,
+          'product:twilight-probe',
+        ]),
+      ]),
+    ).toEqual([]);
+  });
+
+  it('derives a suite project product and name from its product directory', () => {
+    const tags = ['scope:app', 'type:app', 'runtime:bun', 'ring:adapter'];
+    expect(
+      findNamespaceLayoutViolations([
+        project('apps/twilight-structure/twilight-probe/cli', 'twilight-structure-twilight-probe', [
+          ...tags,
+          'product:twilight-structure',
+        ]),
+      ]),
+    ).toEqual([
+      'apps/twilight-structure/twilight-probe/cli: directory product twilight-probe disagrees with product:twilight-structure',
+      'apps/twilight-structure/twilight-probe/cli: project name must be twilight-probe-cli, found twilight-structure-twilight-probe',
+    ]);
+  });
+
+  it('requires exactly apps/<suite>/<product>/<project> under a declared suite', () => {
+    const tags = ['scope:app', 'type:app', 'runtime:bun', 'ring:adapter'];
+    expect(
+      findNamespaceLayoutViolations([
+        project('apps/twilight-structure/cli', 'twilight-structure-cli', [
+          ...tags,
+          'product:twilight-structure',
+        ]),
+        project('apps/twilight-structure/twilight-probe/cli/nested', 'twilight-probe-cli', [
+          ...tags,
+          'product:twilight-probe',
+        ]),
+      ]),
+    ).toEqual([
+      'apps/twilight-structure/cli: applications require apps/<suite>/<product>/<project> in suite twilight-structure',
+      'apps/twilight-structure/twilight-probe/cli/nested: applications require apps/<suite>/<product>/<project> in suite twilight-structure',
+    ]);
+  });
+
+  it('keeps an undeclared directory a product, so four segments there stay malformed', () => {
+    const tags = ['scope:app', 'type:app', 'runtime:bun', 'ring:adapter'];
+    expect(
+      findNamespaceLayoutViolations([
+        project('apps/probe-suite/probe/cli', 'probe-cli', [...tags, 'product:probe']),
+      ]),
+    ).toEqual(['apps/probe-suite/probe/cli: applications require apps/<product>/<project>']);
+  });
+
   it('accepts both apps, every library ring directory and product-neutral tools', () => {
     expect(findNamespaceLayoutViolations(VALID_PROJECTS)).toEqual([]);
   });
```

### 7.2 Slice 1 — the rule (patch 02)

`APPLICATION_SUITES`, the suite shape in `findNamespaceLayoutViolations`, the suite walk and the
suite-level refusal in `readProductPolicies` (its per-policy body moves, unchanged, into
`readProductPolicy`), and the Nx lint input.

#### Patch 02 — workspace-projects.mjs, product-policies.mjs and nx.json

```diff
diff --git a/nx.json b/nx.json
index 888bf2aa8..8fd5f5409 100644
--- a/nx.json
+++ b/nx.json
@@ -46,6 +46,7 @@
         "{workspaceRoot}/tools/tool-devsync/product-policies.mjs",
         "{workspaceRoot}/tools/tool-devsync/workspace-projects.mjs",
         "{workspaceRoot}/apps/*/eslint.product.mjs",
+        "{workspaceRoot}/apps/*/*/eslint.product.mjs",
         "{workspaceRoot}/libs/*/eslint.product.mjs",
         "{workspaceRoot}/apps/**/project.json",
         "{workspaceRoot}/libs/**/project.json",
diff --git a/tools/tool-devsync/product-policies.mjs b/tools/tool-devsync/product-policies.mjs
index fb4a429df..b3045c9f9 100644
--- a/tools/tool-devsync/product-policies.mjs
+++ b/tools/tool-devsync/product-policies.mjs
@@ -2,6 +2,8 @@ import { readdir, stat } from 'node:fs/promises';
 import { join, resolve } from 'node:path';
 import { fileURLToPath, pathToFileURL } from 'node:url';

+import { APPLICATION_SUITES } from './workspace-projects.mjs';
+
 const POLICY_GROUPS = ['apps', 'libs'];
 const POLICY_FILE = 'eslint.product.mjs';

@@ -60,20 +62,88 @@ async function isPolicyPresent(policyPath) {
   }
 }

+/**
+ * The sorted names of the directories directly below `path`.
+ *
+ * @param {string} path
+ * @returns {Promise<string[]>}
+ * @throws When the directory cannot be read.
+ */
+async function directoriesBelow(path) {
+  return (await readdir(path, { withFileTypes: true }))
+    .filter((entry) => entry.isDirectory())
+    .map((entry) => entry.name)
+    .sort();
+}
+
+/**
+ * The flat-config objects one product's policy contributes, or none when it ships no policy.
+ *
+ * @param {string} policyPath Absolute path to a candidate `eslint.product.mjs`.
+ * @param {SharedConstraints} shared Passed to the policy function unchanged.
+ * @returns {Promise<readonly FlatConfigObject[]>}
+ * @throws When a present policy fails to load, does not default-export a function, throws when
+ *   called, or returns anything but an array.
+ */
+async function readProductPolicy(policyPath, shared) {
+  if (!(await isPolicyPresent(policyPath))) return [];
+  let loaded;
+  try {
+    loaded = await import(pathToFileURL(policyPath).href);
+  } catch (failure) {
+    // Proof: with absence decided here by `errorCode(failure) === 'ERR_MODULE_NOT_FOUND'`
+    // instead of by the `stat` above, a probe policy importing `this-package-does-not-exist`
+    // made `probe-app:lint` exit 0 with every fence silently gone, failing the nested-import
+    // negative on `Expected: not 0 · Received: 0`.
+    // Proof: with this rethrow replaced by a bare `continue`, a chmod-000 policy exited 0
+    // rather than naming the file, failing the unreadable negative the same way (2026-09-15).
+    throw new Error(`cannot load product lint policy ${policyPath}`, { cause: failure });
+  }
+  if (typeof loaded.default !== 'function') {
+    // Proof: with this check removed, a policy spelled `export default []` still failed the
+    // lint, but on `TypeError: loaded.default is not a function` raised inside the root
+    // config, which names neither the contract nor the file (2026-09-15).
+    throw new Error(`${policyPath} must default-export a function of the shared constants`);
+  }
+  let configs;
+  try {
+    configs = loaded.default(shared);
+  } catch (failure) {
+    // Proof: with this call left unwrapped, a probe policy throwing
+    // `probe policy refuses to compose` failed `probe-app:lint` with that bare message and
+    // named the file only in a stack frame, so the negative's
+    // `cannot evaluate product lint policy` assertion failed (2026-09-16).
+    throw new Error(`cannot evaluate product lint policy ${policyPath}`, { cause: failure });
+  }
+  if (!Array.isArray(configs)) {
+    // An `async` policy lands here too: it returns a promise, not an array, and the message
+    // has to say so rather than read as if the function returned the wrong element type.
+    // Proof: with this check removed, a policy returning a bare object failed on
+    // `TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function`
+    // from the push below, naming neither the contract nor the file (2026-09-15).
+    throw new Error(`${policyPath} must return an array of flat-config objects synchronously`);
+  }
+  return configs;
+}
+
 /**
  * Every flat-config object the products under `apps/` and `libs/` contribute, in group then
  * alphabetical order.
  *
  * A product keeps its own lint fences beside its code: `<group>/<product>/eslint.product.mjs`
  * default-exports a function of the shared boundary constants returning flat-config objects.
+ * A product of a suite in {@link APPLICATION_SUITES} keeps it at
+ * `apps/<suite>/<product>/eslint.product.mjs`; a suite directory is no product, so a policy
+ * directly in it is refused rather than read or passed over.
  * Anything a present policy does other than load and return an array stops lint naming the
  * file, because a fence that silently fails to load is a fence that cannot fail.
  *
  * @param {string | URL} workspace The repository root the product directories sit under.
  * @param {SharedConstraints} shared Passed to each policy function unchanged.
  * @returns {Promise<FlatConfigObject[]>} The discovered objects, ready to spread.
- * @throws When a group directory cannot be read, or a present policy fails to load, does not
- *   default-export a function, throws when called, or returns anything but an array.
+ * @throws When a group or suite directory cannot be read, a suite directory carries a policy of
+ *   its own, or a present policy fails to load, does not default-export a function, throws when
+ *   called, or returns anything but an array.
  */
 export async function readProductPolicies(workspace, shared) {
   const root = workspacePath(workspace);
@@ -81,50 +151,23 @@ export async function readProductPolicies(workspace, shared) {
   const policies = [];
   for (const group of POLICY_GROUPS) {
     const groupPath = join(root, group);
-    const products = (await readdir(groupPath, { withFileTypes: true }))
-      .filter((entry) => entry.isDirectory())
-      .map((entry) => entry.name)
-      .sort();
-    for (const product of products) {
-      const policyPath = join(groupPath, product, POLICY_FILE);
-      if (!(await isPolicyPresent(policyPath))) continue;
-      let loaded;
-      try {
-        loaded = await import(pathToFileURL(policyPath).href);
-      } catch (failure) {
-        // Proof: with absence decided here by `errorCode(failure) === 'ERR_MODULE_NOT_FOUND'`
-        // instead of by the `stat` above, a probe policy importing `this-package-does-not-exist`
-        // made `probe-app:lint` exit 0 with every fence silently gone, failing the nested-import
-        // negative on `Expected: not 0 · Received: 0`.
-        // Proof: with this rethrow replaced by a bare `continue`, a chmod-000 policy exited 0
-        // rather than naming the file, failing the unreadable negative the same way (2026-09-15).
-        throw new Error(`cannot load product lint policy ${policyPath}`, { cause: failure });
-      }
-      if (typeof loaded.default !== 'function') {
-        // Proof: with this check removed, a policy spelled `export default []` still failed the
-        // lint, but on `TypeError: loaded.default is not a function` raised inside the root
-        // config, which names neither the contract nor the file (2026-09-15).
-        throw new Error(`${policyPath} must default-export a function of the shared constants`);
+    for (const directory of await directoriesBelow(groupPath)) {
+      const directoryPath = join(groupPath, directory);
+      if (group !== 'apps' || !APPLICATION_SUITES.includes(directory)) {
+        policies.push(...(await readProductPolicy(join(directoryPath, POLICY_FILE), shared)));
+        continue;
       }
-      let configs;
-      try {
-        configs = loaded.default(shared);
-      } catch (failure) {
-        // Proof: with this call left unwrapped, a probe policy throwing
-        // `probe policy refuses to compose` failed `probe-app:lint` with that bare message and
-        // named the file only in a stack frame, so the negative's
-        // `cannot evaluate product lint policy` assertion failed (2026-09-16).
-        throw new Error(`cannot evaluate product lint policy ${policyPath}`, { cause: failure });
+      const suitePolicy = join(directoryPath, POLICY_FILE);
+      if (await isPolicyPresent(suitePolicy)) {
+        throw new Error(
+          `${suitePolicy} sits in a suite directory; a product lint policy belongs to one of its products`,
+        );
       }
-      if (!Array.isArray(configs)) {
-        // An `async` policy lands here too: it returns a promise, not an array, and the message
-        // has to say so rather than read as if the function returned the wrong element type.
-        // Proof: with this check removed, a policy returning a bare object failed on
-        // `TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function`
-        // from the push below, naming neither the contract nor the file (2026-09-15).
-        throw new Error(`${policyPath} must return an array of flat-config objects synchronously`);
+      for (const product of await directoriesBelow(directoryPath)) {
+        policies.push(
+          ...(await readProductPolicy(join(directoryPath, product, POLICY_FILE), shared)),
+        );
       }
-      policies.push(...configs);
     }
   }
   return policies;
diff --git a/tools/tool-devsync/workspace-projects.mjs b/tools/tool-devsync/workspace-projects.mjs
index 6567920a1..d1d162fd3 100644
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -287,6 +287,18 @@ function filterTags(project, axis) {
   return project.tags.filter((tag) => tag.startsWith(axis));
 }

+/**
+ * Directories under `apps/` that hold the products of one suite instead of being a product
+ * themselves. An application in a suite sits at `apps/<suite>/<product>/<project>`; every other
+ * `apps/<directory>` is a product, with its applications at `apps/<product>/<project>`. A
+ * directory is a suite only by being listed here, so a mistyped product directory is never read
+ * as one. `readProductPolicies` in `product-policies.mjs` reads the same list to find each suite
+ * product's lint policy. Decided in `openspec/changes/adopt-suite-directory-layout`.
+ *
+ * @type {readonly string[]}
+ */
+export const APPLICATION_SUITES = Object.freeze(['twilight-structure']);
+
 /**
  * Application roots whose directory temporarily differs from their product.
  * `apps/wiki/cli` publishes and runs as `twilight-burokrat` but moves to
@@ -391,11 +403,17 @@ export function findNamespaceLayoutViolations(projects) {

     const segments = project.root.split('/');
     if (project.root.startsWith('apps/')) {
+      const suite = APPLICATION_SUITES.includes(segments[1]) ? segments[1] : undefined;
+      const productAt = suite === undefined ? 1 : 2;
       // Proof: disabling this shape guard made the owning Nx target replace the
       // named malformed-app refusal with misleading derived product/name faults
       // (2026-09-14).
-      if (segments.length !== 3) {
-        violations.push(`${project.root}: applications require apps/<product>/<project>`);
+      if (segments.length !== productAt + 2) {
+        violations.push(
+          suite === undefined
+            ? `${project.root}: applications require apps/<product>/<project>`
+            : `${project.root}: applications require apps/<suite>/<product>/<project> in suite ${suite}`,
+        );
         continue;
       }
       // Proof: disabling this check made the owning Nx target omit the app's
@@ -414,13 +432,13 @@ export function findNamespaceLayoutViolations(projects) {
       const frozen = Object.hasOwn(FROZEN_APPLICATION_ROOTS, project.root)
         ? FROZEN_APPLICATION_ROOTS[project.root]
         : undefined;
-      const expectedProduct = frozen?.product ?? segments[1];
+      const expectedProduct = frozen?.product ?? segments[productAt];
       if (products.length === 1 && products[0] !== `product:${expectedProduct}`) {
         violations.push(
           `${project.root}: directory product ${expectedProduct} disagrees with ${products[0]}`,
         );
       }
-      const expectedName = frozen?.name ?? `${segments[1]}-${segments[2]}`;
+      const expectedName = frozen?.name ?? `${segments[productAt]}-${segments[productAt + 1]}`;
       // Proof: disabling this app-name check made the owning Nx target omit the
       // unqualified be-01 refusal while retaining the library refusal
       // (2026-09-14).
```

### 7.3 Slice 1 — the records (patch 03)

The glossary's **Suite** and reworded **Product**, and the change's intent, delta spec, tasks and
verification record header. `.openspec.yaml` is the OpenSpec command's own (slice 1, step 2).

#### Patch 03 — CONTEXT.md and the OpenSpec change

```diff
diff --git a/CONTEXT.md b/CONTEXT.md
index 63ff61648..852275fa1 100644
--- a/CONTEXT.md
+++ b/CONTEXT.md
@@ -1222,12 +1222,19 @@ implementation that lacks the behaviour it names.
 _Avoid_: contract tests (alone), shared tests, test harness

 **Product**:
-One application family in this repository — WBS is the first — named by a top-level directory,
-a project-name prefix and a `product:` tag that keeps one product's code out of another's.
+One application family in this repository — WBS is the first — named by its directory under
+`apps/` or under a suite's directory, a project-name prefix and a `product:` tag that keeps one
+product's code out of another's.
 `wiki` is the second: one CLI, `apps/wiki/cli`, released separately from the WBS tool.
 Tools belong to no product.
 _Avoid_: app (that is one deployable), workspace, scope (that is an Nx tag axis already in use)

+**Suite**:
+A named group of products whose directories sit together under one directory in `apps/`,
+declared as a suite so the directory is not read as a product itself. Twilight Structure is the
+first.
+_Avoid_: product family, umbrella, namespace (for this)
+
 **Composition root**:
 The one place ports are bound to adapters and services are built, in core, called by be-01
 over the SQLite source and by tests over the in-memory one. The batch runner calls its
diff --git a/openspec/changes/adopt-suite-directory-layout/proposal.md b/openspec/changes/adopt-suite-directory-layout/proposal.md
new file mode 100644
index 000000000..50002eb84
--- /dev/null
+++ b/openspec/changes/adopt-suite-directory-layout/proposal.md
@@ -0,0 +1,71 @@
+## Why
+
+Twilight Burokrat, the first product of the Twilight Structure suite, still lives in `apps/wiki`,
+named for a product that no longer exists, and the namespace layout gate excuses it by a frozen
+exception. On 2026-09-23 Dany decided that the suite's products live under one directory,
+`apps/twilight-structure/`, so the gate has to know a suite level before the product can move.
+
+## What Changes
+
+**Application layout**
+
+- From: every application at `apps/<product>/<project>`; `apps/wiki/cli` excused as product
+  `twilight-burokrat`.
+- To: a declared list of suite directories. An application in a listed suite sits at
+  `apps/<suite>/<product>/<project>` and takes its product and qualified name from the product
+  directory; every other `apps/<directory>` is a product as before. Twilight Burokrat keeps the
+  Nx name `twilight-burokrat` through a name exception on its exact root.
+- Impact: non-breaking; WBS projects are unaffected.
+
+**Product lint policies**
+
+- From: `apps/<product>/eslint.product.mjs` only.
+- To: also `apps/<suite>/<product>/eslint.product.mjs`; a policy directly in a suite directory
+  is refused by name, and Nx treats every such policy as a lint cache input.
+
+**The directory**
+
+- From: `apps/wiki/{cli,consumer,eslint.product.mjs}`.
+- To: `apps/twilight-structure/twilight-burokrat/{cli,consumer,eslint.product.mjs}`, with every
+  current reference following it: project configuration, the release workflow, the bootstrap
+  policy, mapping and relationship facts, devsync pins and current documents. A check keeps the
+  retired root out of everything but historical records, and survives their archiving.
+
+## Non-Goals
+
+- No change to the npm name, bin names, packed files, Nx project name, product tag, version-1
+  check and module ids, `TOOL_WIKI_*` variables or `bin/tool-wiki-*.sh`.
+- `apps/wbs` stays where it is.
+- No release, tag or activation is published; preparing the relocation activation is operator
+  work under the activation runbook.
+- Historical records are not rewritten.
+
+## Constraints
+
+- The bootstrap boundary moves by selector: `selector` names the new root, `sourceSelector`
+  keeps `tools/tool-wiki`, where its reviewed baselines are.
+- Checks that read the repository at `HEAD` pass only once the move is committed.
+
+## Capabilities
+
+### New Capabilities
+
+- `suite-directory-layout`: suites under `apps/`, their products' lint policies, the moved
+  Twilight Burokrat and the retired `apps/wiki` root.
+
+### Modified Capabilities
+
+- none
+
+## Domain Terms
+
+- Suite, Product
+
+## Decisions Recorded
+
+- none: a directory layout is reversed by another move, and the decision is Dany's, recorded here.
+
+## Impact
+
+`tools/tool-devsync`, `nx.json`, `apps/twilight-structure/twilight-burokrat`, the Twilight
+Burokrat release workflow, `docs/wiki-policy`, current documents.
diff --git a/openspec/changes/adopt-suite-directory-layout/specs/suite-directory-layout/spec.md b/openspec/changes/adopt-suite-directory-layout/specs/suite-directory-layout/spec.md
new file mode 100644
index 000000000..2b181e15c
--- /dev/null
+++ b/openspec/changes/adopt-suite-directory-layout/specs/suite-directory-layout/spec.md
@@ -0,0 +1,97 @@
+## ADDED Requirements
+
+### Requirement: A declared suite holds its products one directory deeper
+
+The namespace layout gate SHALL read a declared list of suite directories under `apps/`. An
+application under a listed suite SHALL sit at exactly `apps/<suite>/<product>/<project>`, carry
+`product:<product>` and be named `<product>-<project>` unless a name exception names its exact
+root. An application under any other directory SHALL keep the `apps/<product>/<project>` shape.
+
+#### Scenario: A suite product is accepted
+
+- **WHEN** a project at `apps/twilight-structure/twilight-probe/cli` is named `twilight-probe-cli`
+  and tagged `product:twilight-probe`
+- **THEN** the layout gate reports no violation
+
+#### Scenario: A suite project claims the suite as its product
+
+- **WHEN** the same root carries `product:twilight-structure` and the name
+  `twilight-structure-twilight-probe`
+- **THEN** the gate names the directory product `twilight-probe` and the expected name
+  `twilight-probe-cli`
+
+#### Scenario: A suite project sits at the wrong depth
+
+- **WHEN** a project sits at `apps/twilight-structure/cli`, or one directory below a suite
+  product's project
+- **THEN** the gate refuses each root as not `apps/<suite>/<product>/<project>` in suite
+  `twilight-structure`
+
+#### Scenario: An undeclared directory is not a suite
+
+- **WHEN** a project sits at `apps/probe-suite/probe/cli`
+- **THEN** the gate refuses it as not `apps/<product>/<project>`
+
+### Requirement: A suite product keeps its lint policy beside it
+
+Product lint policy discovery SHALL load `apps/<suite>/<product>/eslint.product.mjs` for every
+product directory of a declared suite and SHALL refuse an `eslint.product.mjs` placed directly in
+a suite directory, naming the file. Nx SHALL declare every suite product's policy as a lint cache
+input.
+
+#### Scenario: A suite product's policy applies
+
+- **WHEN** `apps/twilight-structure/probe/eslint.product.mjs` forbids an import that
+  `apps/twilight-structure/probe/app` makes
+- **THEN** that project's real Nx lint fails on the forbidden import
+
+#### Scenario: A policy sits in the suite directory itself
+
+- **WHEN** `apps/twilight-structure/eslint.product.mjs` exists
+- **THEN** lint fails naming that file instead of reading it or passing over it
+
+### Requirement: Twilight Burokrat lives in the Twilight Structure suite
+
+Twilight Burokrat's command-line project, consumer template and product lint policy SHALL live
+under `apps/twilight-structure/twilight-burokrat`, keeping the Nx name `twilight-burokrat`, the
+tag `product:twilight-burokrat`, the npm name, the bin names and the packed file list unchanged.
+A name exception SHALL name exactly its root and SHALL be reported once no project occupies it.
+
+#### Scenario: The workspace passes the layout gate after the move
+
+- **WHEN** the layout gate reads the real workspace
+- **THEN** it reports no violation and no stale exception
+
+#### Scenario: The packed package is the same package
+
+- **WHEN** the package suite packs the moved project
+- **THEN** the tarball is `twilight-burokrat-0.1.0.tgz` and lists the same files as before the move
+
+### Requirement: The retired root survives only in historical records
+
+Every file the repository tracks or would track SHALL be free of the root Twilight Burokrat left
+in this change, in either of its two spellings, except the listed historical records and the
+listed dated proofs; no file SHALL remain under that root; and every listed excuse SHALL still
+excuse exactly what it names, before and after its OpenSpec change is archived.
+
+#### Scenario: A current file names the retired root
+
+- **WHEN** a current document or source file names the retired root, as a path or as quoted
+  segments
+- **THEN** the check fails naming that file and line
+
+#### Scenario: A file is left under the retired root
+
+- **WHEN** any file exists under the retired root, whatever it contains
+- **THEN** the check fails naming that path
+
+#### Scenario: An excuse no longer matches
+
+- **WHEN** a listed file holds more or fewer occurrences than its excuse counts, or a listed
+  historical tree holds none
+- **THEN** the check fails naming that excuse
+
+#### Scenario: A listed change is archived
+
+- **WHEN** a change whose file carries a dated excuse moves to `openspec/changes/archive/`
+- **THEN** its excuse still matches and the check stays green
diff --git a/openspec/changes/adopt-suite-directory-layout/tasks.md b/openspec/changes/adopt-suite-directory-layout/tasks.md
new file mode 100644
index 000000000..bf3d2dbb2
--- /dev/null
+++ b/openspec/changes/adopt-suite-directory-layout/tasks.md
@@ -0,0 +1,26 @@
+## 1. The suite level
+
+- [ ] 1.1 The layout gate reads `APPLICATION_SUITES` and accepts `apps/<suite>/<product>/<project>`
+      — test: `namespace-layout.test.ts` suite cases; negative: each clause disabled in turn fails
+      its named case.
+- [ ] 1.2 Product lint policy discovery walks a suite's products and refuses a policy in the
+      suite directory; Nx declares `apps/*/*/eslint.product.mjs` a lint input — test:
+      `eslint-boundaries.test.ts`, `lint-policy-cache.test.ts`; negative: each clause disabled
+      fails its named case.
+
+## 2. The move
+
+- [ ] 2.1 `apps/wiki` moves to `apps/twilight-structure/twilight-burokrat` with no content change
+      but the one `extends` line typed lint needs, committed together with slice 3 — test: every
+      moved file byte-identical to its source but `cli/tsconfig.json`.
+
+## 3. Every reference follows
+
+- [ ] 3.1 Project configuration, sources, the release workflow, the bootstrap policy, mapping and
+      relationship facts, devsync pins and current documents name the new root; the frozen
+      exception becomes a name exception on the new root — test: the Twilight Burokrat, devsync
+      and pilot suites at the committed head; negative: the name exception removed fails the
+      real-workspace layout case.
+- [ ] 3.2 The retired-root check — test: `retired-roots.test.ts`; negative: a planted reference,
+      a planted file and a broken excuse each fail the check on its own clause, and an archived
+      listed change stays excused.
diff --git a/openspec/changes/adopt-suite-directory-layout/verify.md b/openspec/changes/adopt-suite-directory-layout/verify.md
new file mode 100644
index 000000000..7ee5c9738
--- /dev/null
+++ b/openspec/changes/adopt-suite-directory-layout/verify.md
@@ -0,0 +1,4 @@
+# Verification
+
+Entries are appended per slice, newest last. Evidence references are basenames in that
+attempt's evidence directory.
```

### 7.4 Slice 1 — the legacy pin (patch 04)

Applied only after the executor has watched the old pin fail with exactly this digest (slice 1, step
4).

#### Patch 04 — repo-namespacing-handoff.test.ts

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
index 383a9a6ff..35d3a58d1 100644
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -618,7 +618,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
   // the classified occurrence count and categories remain unchanged (2026-09-19).
   expect(await legacySourceOccurrences()).toEqual({
     categories: {
-      'current recursive selector': 31,
+      'current recursive selector': 34,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
       'historical policy selector or baseline': 87,
@@ -855,8 +855,8 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // `apps/fe-01/` it was extracted from; raised `historical policy selector or baseline` from 71
     // to 87 and occurrences from 289 to 305, digest `8d9667b7…` to `68a1e15d…`, no unclassified
     // entries; the `Proof:` comments added in the pilot suite moved nothing (2026-09-25).
-    digest: '68a1e15da4a66840c53c9a57c43583e1b303f2115504abc09e8bbe08d7294e02',
-    occurrences: 305,
+    digest: '551e2a7d0fb1ed4b5659abee6b00ede7ccf703b9f65f71761b88be12a318eb80',
+    occurrences: 308,
     unclassified: [],
   });
 });
```

### 7.5 Slice 2 — the move

#### Script s2-move

```sh
set -euo pipefail
test -d apps/wiki
test ! -e apps/twilight-structure
mkdir apps/twilight-structure
mv apps/wiki apps/twilight-structure/twilight-burokrat
test ! -e apps/wiki
# The one line the commit hook needs: typed lint cannot load a tsconfig whose base is missing.
f=apps/twilight-structure/twilight-burokrat/cli/tsconfig.json
old='  "extends": "../../../tsconfig.base.json",'
new='  "extends": "../../../../tsconfig.base.json",'
test "$(grep -cxF "$old" "$f")" -eq 1
OLD=$old NEW=$new perl -0777 -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/' "$f"
test "$(grep -cxF "$new" "$f")" -eq 1
echo "s2-move: apps/wiki is apps/twilight-structure/twilight-burokrat"
```

### 7.6 Slice 3 — the retired-root check (patch 05)

#### Patch 05 — retired-roots.test.ts

```diff
diff --git a/tools/tool-devsync/src/retired-roots.test.ts b/tools/tool-devsync/src/retired-roots.test.ts
new file mode 100644
--- /dev/null
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -0,0 +1,180 @@
+import { lstat, readFile, readlink } from 'node:fs/promises';
+import { join, relative } from 'node:path';
+import { fileURLToPath } from 'node:url';
+
+import { expect, test } from 'bun:test';
+
+const WORKSPACE = fileURLToPath(new URL('../../../', import.meta.url));
+/** This file's own workspace-relative path, derived so a move cannot leave its excuse behind. */
+const SELF = relative(WORKSPACE, fileURLToPath(import.meta.url));
+
+/**
+ * Twilight Burokrat's old root, retired when it moved into the Twilight Structure suite
+ * (`openspec/changes/adopt-suite-directory-layout`), in both spellings a reference takes: a path,
+ * where the lookahead keeps a longer directory name that merely starts with it from matching, and
+ * quoted segments handed to `join`, which may break across lines.
+ */
+const RETIRED_ROOT_SPELLINGS = [
+  /apps\/wiki(?![\w-])/g,
+  /(['"`])apps\1\s*,\s*(['"`])wiki\2/g,
+] as const;
+/** Where files under the retired root would sit. */
+const RETIRED_DIRECTORY = 'apps/wiki/';
+
+/**
+ * A path as it reads before its OpenSpec change was archived:
+ * `openspec/changes/archive/<date>-<name>/…` becomes `openspec/changes/<name>/…`. Every excuse
+ * below is written in this form, so archiving a listed change moves none of them.
+ */
+function unarchived(path: string): string {
+  return path.replace(/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-/, 'openspec/changes/');
+}
+
+/**
+ * Trees that record what was done, in the words of the day it was done. Rewriting their paths
+ * would falsify them, so the retired root may stay there in any number. A change is listed by
+ * its unarchived directory and stays excused once archived; its delta spec names no retired
+ * root, so the spec its archive syncs into `openspec/specs/` needs no excuse. The first tree a
+ * path falls under takes the occurrence, so the archive, which holds every archived change,
+ * comes last: an archived listed change still counts for its own entry.
+ */
+const HISTORICAL_TREES = [
+  'docs/superpowers/',
+  'openspec/changes/adopt-suite-directory-layout/',
+  'openspec/changes/archive/',
+] as const;
+
+/** Every change's verification record: observed commands and output, never current guidance. */
+const VERIFICATION_RECORD = /^openspec\/changes\/(?:archive\/)?[^/]+\/verify\.md$/;
+
+/**
+ * Current files that also keep dated history naming the retired root: a proof observed before
+ * the move, a finished task, a superseded design. Each excuses exactly the occurrences it counts,
+ * so a current reference added to one of them still fails. A file of an OpenSpec change is listed
+ * by its unarchived path and keeps its excuse when the change is archived; a change that edits a
+ * listed file's mentions, or moves it any other way, updates its count here in the same commit.
+ */
+const DATED_MENTIONS: readonly (readonly [path: string, occurrences: number])[] = [
+  ['apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts', 2],
+  ['docs/plans/2026-09-13-tool-wiki-precedents-and-extraction.md', 1],
+  ['openspec/changes/adopt-di-composition/tasks.md', 1],
+  ['openspec/changes/trusted-activation-relocation/design.md', 2],
+  ['openspec/changes/twilight-burokrat-package/design.md', 4],
+  ['openspec/changes/twilight-burokrat-package/proposal.md', 2],
+  ['openspec/changes/wiki-release/proposal.md', 2],
+  ['openspec/changes/wiki-release/tasks.md', 4],
+  ['tools/tool-devsync/src/repo-namespacing-handoff.test.ts', 4],
+  ['tools/tool-devsync/src/workspace-inventory.test.ts', 2],
+  [SELF, 3],
+];
+
+interface RetiredRootScan {
+  /** Paths below the retired root, whatever they contain. */
+  readonly leftovers: readonly string[];
+  /** `path:line` of every occurrence no excuse covers. */
+  readonly current: readonly string[];
+  /** Every excuse that no longer matches what it names. */
+  readonly staleExcuses: readonly string[];
+}
+
+/**
+ * The paths one `git ls-files` invocation lists.
+ *
+ * @throws When Git cannot list the workspace.
+ */
+function listPaths(options: readonly string[]): string[] {
+  const listing = Bun.spawnSync(['git', 'ls-files', ...options, '-z'], {
+    cwd: WORKSPACE,
+    stdout: 'pipe',
+    stderr: 'pipe',
+  });
+  if (listing.exitCode !== 0) {
+    throw new Error(`cannot list the workspace: ${listing.stderr.toString()}`);
+  }
+  return listing.stdout.toString().split('\0').filter(Boolean);
+}
+
+/**
+ * Every path in the working tree Git tracks or would track: the index plus untracked files
+ * `.gitignore` admits, less tracked files the working tree no longer holds — a move not yet staged
+ * lists its old path as deleted and its new one as untracked.
+ *
+ * @throws When Git cannot list the workspace.
+ */
+function candidatePaths(): string[] {
+  const deleted = new Set(listPaths(['--deleted']));
+  return [...new Set(listPaths(['--cached', '--others', '--exclude-standard']))]
+    .filter((path) => !deleted.has(path))
+    .sort();
+}
+
+/**
+ * What Git stores for a path: a symbolic link's target, or a file's bytes read as text.
+ *
+ * @throws When the path is absent or unreadable.
+ */
+async function readText(path: string): Promise<string> {
+  const full = join(WORKSPACE, path);
+  return (await lstat(full)).isSymbolicLink() ? await readlink(full) : await readFile(full, 'utf8');
+}
+
+async function scanRetiredRoot(): Promise<RetiredRootScan> {
+  const paths = candidatePaths();
+  const counted = new Map<string, number>(DATED_MENTIONS.map(([path]) => [path, 0]));
+  const perTree = new Map<string, number>(HISTORICAL_TREES.map((tree) => [tree, 0]));
+  const current: string[] = [];
+  for (const path of paths) {
+    const text = await readText(path);
+    const excused = unarchived(path);
+    const tree = HISTORICAL_TREES.find(
+      (prefix) => excused.startsWith(prefix) || path.startsWith(prefix),
+    );
+    const lines: number[] = [];
+    for (const spelling of RETIRED_ROOT_SPELLINGS) {
+      for (const match of text.matchAll(spelling)) {
+        const dated = counted.get(excused);
+        if (dated !== undefined) counted.set(excused, dated + 1);
+        else if (tree !== undefined) perTree.set(tree, (perTree.get(tree) ?? 0) + 1);
+        else if (VERIFICATION_RECORD.test(path)) continue;
+        else lines.push(text.slice(0, match.index).split('\n').length);
+      }
+    }
+    current.push(
+      ...lines.sort((left, right) => left - right).map((line) => `${path}:${String(line)}`),
+    );
+  }
+  const staleExcuses = [
+    ...HISTORICAL_TREES.filter((tree) => perTree.get(tree) === 0).map(
+      (tree) => `${tree}: excuses nothing`,
+    ),
+    ...DATED_MENTIONS.filter(([path, occurrences]) => counted.get(path) !== occurrences).map(
+      ([path, occurrences]) =>
+        `${path}: excuses ${String(occurrences)}, holds ${String(counted.get(path))}`,
+    ),
+  ];
+  return {
+    leftovers: paths.filter((path) => path.startsWith(RETIRED_DIRECTORY)),
+    current,
+    staleExcuses,
+  };
+}
+
+let scan: Promise<RetiredRootScan> | undefined;
+
+/** The one scan the three cases share, started by whichever case runs first. */
+async function scanned(): Promise<RetiredRootScan> {
+  scan ??= scanRetiredRoot();
+  return await scan;
+}
+
+test('no file remains under the retired apps/wiki root', async () => {
+  expect((await scanned()).leftovers).toEqual([]);
+});
+
+test('no current file names the retired apps/wiki root', async () => {
+  expect((await scanned()).current).toEqual([]);
+});
+
+test('every excuse for the retired root still matches exactly what it names', async () => {
+  expect((await scanned()).staleExcuses).toEqual([]);
+});
```

### 7.7 Slice 3 — every reference

Read top to bottom, this is the whole of slice 3's edit. `sub` and `subf` refuse unless the file
holds exactly the counted copies of the literal they replace; the here-documents are single-quoted,
so nothing in them expands. The frozen exception's replacement and the name exception with its
helper are the `subf` blocks under `# The layout gate`. The dated Proof comments this edit retires are six — the two 2026-09-18 ones in
`workspace-projects.mjs`, two in `sync.ts`, one in `workspace-projects.test.ts` and one in
`pilot-policy.test.ts` — each on a line the edit replaces, each observed again as a section 8.3 block
(`s3-stale`, `s3-exact`/`s3-applied`, `s3-manifest`, `s3-tsconfig`, `s3-row`).

#### Script s3-edit

```sh
set -euo pipefail
R=apps/twilight-structure/twilight-burokrat
C=$R/cli
# sub FILE COUNT OLD NEW: FILE must hold exactly COUNT copies of OLD, all replaced by NEW.
sub() {
  test -f "$1"
  got=$(OLD=$3 perl -0777 -ne '$n = () = /\Q$ENV{OLD}\E/g; print $n' "$1")
  if [ "$got" != "$2" ]; then echo "sub: $1 holds $got of [$3], expected $2" >&2; exit 1; fi
  OLD=$3 NEW=$4 perl -0777 -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g' "$1"
}
# subf FILE COUNT, OLD on descriptor 3 and NEW on descriptor 4: sub for multi-line text.
subf() {
  old=$(cat <&3; printf x)
  new=$(cat <&4; printf x)
  sub "$1" "$2" "${old%x}" "${new%x}"
}
# One level deeper: the project's configuration.
sub $C/project.json 10 'apps/wiki/' "$R/"
sub $C/project.json 1 '"../../../node_modules/nx/' '"../../../../node_modules/nx/'
sub $C/project.json 2 '$PWD/../../../node_modules' '$PWD/../../../../node_modules'
sub $C/project.json 2 '--preload ../../../tools/' '--preload ../../../../tools/'
sub $C/tsconfig.json 1 '"../../../dist/apps/wiki/cli"' "\"../../../../dist/$C\""
sub $C/tsconfig.lib.json 1 '"../../../dist/apps/wiki/cli"' "\"../../../../dist/$C\""
sub $C/tsconfig.spec.json 1 '"../../../dist/out-tsc"' '"../../../../dist/out-tsc"'
sub $C/README.md 1 '](../../../docs/' '](../../../../docs/'
# One level deeper: sources that climb to the repository root.
for f in inventory/classification.test.ts packaging/build.ts packaging/consumer-bootstrap.test.ts \
  packaging/install.test.ts policy/pilot-policy.test.ts relationships/committed-target-facts.test.ts; do
  sub $C/src/$f 1 "'../../../../..'" "'../../../../../..'"
done
sub $C/src/packaging/build.test.ts 2 "'../../../../..'" "'../../../../../..'"
sub $C/src/packaging/release.test.ts 1 "'../../../../../.github/" "'../../../../../../.github/"
sub $C/src/packaging/pack.ts 1 "'../../../dist/twilight-burokrat-pack'" "'../../../../dist/twilight-burokrat-pack'"
for f in indexes/root-migration.test.ts policy/activation.test.ts policy/gate-entrypoints.test.ts \
  policy/release.test.ts policy/relocation-fixtures.ts rules/rules.test.ts; do
  sub $C/src/$f 1 "'..', '..', '..', '..', '..'" "'..', '..', '..', '..', '..', '..'"
done
sub $C/src/policy/trusted-policy.test.ts 3 "'..', '..', '..', '..', '..'" "'..', '..', '..', '..', '..', '..'"
# The same climb, one segment per line.
for f in contracts/contracts.test.ts relationships/selectors.test.ts; do
  subf $C/src/$f 1 3<<'OLD' 4<<'NEW'
      import.meta.dir,
      '..',
      '..',
      '..',
      '..',
      '..',
OLD
      import.meta.dir,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
NEW
done
# The root itself, where every occurrence in the file names today's location.
sub $C/src/admission/generations.test.ts 8 'apps/wiki/' "$R/"
sub $C/src/inventory/classification.test.ts 1 "const notice = 'apps/wiki/cli/NOTICE';" "const notice = '$C/NOTICE';"
subf $C/src/inventory/classification.test.ts 1 3<<'OLD' 4<<'NEW'
      // rules`; removing NOTICE then moves the same refusal to `apps/wiki/cli/NOTICE`.
OLD
      // rules`; removing NOTICE then moves the same refusal to
      // `apps/twilight-structure/twilight-burokrat/cli/NOTICE`.
NEW
sub $C/src/packaging/build.ts 4 'apps/wiki/' "$R/"
sub $C/src/packaging/install.test.ts 1 'apps/wiki/' "$R/"
sub $C/src/packaging/release.test.ts 3 'apps/wiki/' "$R/"
sub $C/src/packaging/release.ts 2 'apps/wiki/' "$R/"
sub $C/src/policy/activation.test.ts 2 'apps/wiki/' "$R/"
sub $C/src/policy/gate-entrypoints.test.ts 4 'apps/wiki/' "$R/"
# The same root spelled as path segments.
sub $C/src/policy/gate-entrypoints.test.ts 4 "'apps', 'wiki', 'cli'" "'apps', 'twilight-structure', 'twilight-burokrat', 'cli'"
sub $C/src/policy/gate-entrypoints.test.ts 2 "'apps', 'wiki', 'consumer'" "'apps', 'twilight-structure', 'twilight-burokrat', 'consumer'"
sub $C/src/policy/gate-entrypoints.test.ts 1 "      'apps',
      'wiki',
" "      'apps',
      'twilight-structure',
      'twilight-burokrat',
"
sub $C/src/policy/prepare-relocation-activation-cli.ts 1 'apps/wiki/' "$R/"
sub $C/src/policy/release-cli.ts 5 'apps/wiki/' "$R/"
sub $C/src/policy/release.test.ts 9 'apps/wiki/' "$R/"
sub $C/src/policy/relocation-fixtures.ts 2 'apps/wiki/' "$R/"
sub $C/src/review/audit.test.ts 1 'apps/wiki/' "$R/"
sub $C/src/rules/check.ts 1 '// The identity `lintTrustedCandidate` records (apps/wiki/cli/src/policy/trust.ts:1480).' '// The identity `lintTrustedCandidate` in `policy/trust.ts` records.'
sub .github/workflows/twilight-burokrat-release.yml 4 'bun apps/wiki/' "bun $R/"
sub docs/runbook-tool-wiki-activation.md 5 'apps/wiki/' "$R/"
sub docs/findings/checks-that-cannot-fail.md 1 'apps/wiki/' "$R/"
sub openspec/changes/wiki-release/specs/wiki-release/spec.md 3 'apps/wiki/' "$R/"
sub openspec/changes/twilight-control-plane/tasks.md 2 'apps/wiki/' "$R/"
# Files that also keep dated history: only the current lines move.
sub $C/src/policy/pilot-policy.test.ts 1 "  'apps/wiki/cli/README.md'," "  '$C/README.md',"
sub tools/tool-devsync/src/repo-namespacing-handoff.test.ts 3 "'apps/wiki/cli/src/" "'$C/src/"
sub tools/tool-devsync/src/repo-namespacing-handoff.test.ts 1 "'../../../apps/wiki/cli/src/cli.ts'" "'../../../$C/src/cli.ts'"
sub tools/tool-devsync/src/workspace-inventory.test.ts 1 "file: 'apps/wiki/cli/tsconfig.lib.json'," "file: '$C/tsconfig.lib.json',"
sub tools/tool-devsync/src/workspace-inventory.test.ts 1 "value: '../../../dist/apps/wiki/cli'," "value: '../../../../dist/$C',"
subf tools/tool-devsync/src/eslint-boundaries.test.ts 1 3<<'OLD' 4<<'NEW'
    // The shape W6's `apps/wiki/eslint.product.mjs` must not ship: the array a reader would
    // reach for first, which the root config cannot hand the shared constants to.
OLD
    // The shape Twilight Burokrat's `apps/twilight-structure/twilight-burokrat/eslint.product.mjs`
    // must not ship: the array a reader would reach for first, which the root config cannot hand
    // the shared constants to.
NEW
sub LLM_README.md 1 '(`apps/wiki/cli`,' "(\`$C\`,"
sub docs/twilight-structure/names.md 1 '(../../apps/wiki/cli/README.md)' "(../../$C/README.md)"
# The one Markdown link into the old root, in the routed Twilight Burokrat rules design.
sub docs/superpowers/specs/2026-09-19-twilight-burokrat-rules-design.md 1 '](../../../apps/wiki/cli/README.md)' "](../../../$C/README.md)"
# The bootstrap boundary, its mapping and both relationship declarations follow the project.
sub docs/wiki-policy/bootstrap-policy.json 1 '"value": "apps/wiki/cli"' "\"value\": \"$C\""
sub docs/wiki-policy/modules.bootstrap.json 2 '"apps/wiki/cli' "\"$C"
sub docs/wiki-policy/modules.bootstrap.json 1 '"tool-wiki-bootstrap-6475fdcc-v3"' '"tool-wiki-bootstrap-6475fdcc-v4"'
for f in docs/wiki-policy/relationships.json docs/wiki-policy/relationships.bootstrap.json; do
  sub $f 4 'apps/wiki/' "$R/"
  sub $f 1 '$PWD/../../../node_modules' '$PWD/../../../../node_modules'
  sub $f 1 '--preload ../../../tools/' '--preload ../../../../tools/'
done
# The layout gate: the frozen exception becomes a name exception on the new root.
W=tools/tool-devsync/workspace-projects.mjs
subf $W 1 3<<'OLD' 4<<'NEW'
/**
 * Application roots whose directory temporarily differs from their product.
 * `apps/wiki/cli` publishes and runs as `twilight-burokrat` but moves to
 * `apps/twilight-burokrat/cli` only after the wiki freeze/adoption tasks
 * (openspec/changes/twilight-burokrat-package/design.md). Each entry excuses
 * exactly one root, product and name; {@link findStaleLayoutExceptions} fails
 * once the root is gone so the excuse cannot outlive the move.
 *
 * @type {Readonly<Record<string, { readonly product: string, readonly name: string }>>}
 */
export const FROZEN_APPLICATION_ROOTS = {
  'apps/wiki/cli': { product: 'twilight-burokrat', name: 'twilight-burokrat' },
};

/**
 * Name every frozen application root that no discovered project still occupies.
OLD
/**
 * Application roots whose Nx name differs from the `<product>-<project>` their directories give.
 * Twilight Burokrat's command-line project keeps the name `twilight-burokrat` it publishes and
 * runs under rather than `twilight-burokrat-cli`
 * (`openspec/changes/adopt-suite-directory-layout`). Each entry excuses exactly one root's name
 * and nothing else; {@link findStaleLayoutExceptions} fails once the root is gone so the excuse
 * cannot outlive the project.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const APPLICATION_NAME_EXCEPTIONS = {
  'apps/twilight-structure/twilight-burokrat/cli': 'twilight-burokrat',
};

/**
 * The Nx name {@link APPLICATION_NAME_EXCEPTIONS} gives an application root, if it names one.
 *
 * @param {string} root
 * @returns {string | undefined}
 */
function excusedName(root) {
  return Object.hasOwn(APPLICATION_NAME_EXCEPTIONS, root)
    ? APPLICATION_NAME_EXCEPTIONS[root]
    : undefined;
}

/**
 * Name every name exception whose root no discovered project still occupies.
NEW
subf $W 1 3<<'OLD' 4<<'NEW'
    Object.keys(FROZEN_APPLICATION_ROOTS)
      // Proof: disabling this filter failed `names a frozen root that no project occupies after
      // the move` (2026-09-18).
      .filter((root) => !roots.has(root))
      .map((root) => `${root}: frozen layout exception names no project; remove it`)
OLD
    Object.keys(APPLICATION_NAME_EXCEPTIONS)
      .filter((root) => !roots.has(root))
      .map((root) => `${root}: name exception names no project; remove it`)
NEW
subf $W 1 3<<'OLD' 4<<'NEW'
      // Proof: matching any `apps/wiki/` root instead of the exact frozen root failed
      // `excuses only the exact frozen application product and name`; without the entry the
      // actual workspace reported `apps/wiki/cli: directory product wiki disagrees with
      // product:twilight-burokrat` and its name refusal (2026-09-18).
      const frozen = Object.hasOwn(FROZEN_APPLICATION_ROOTS, project.root)
        ? FROZEN_APPLICATION_ROOTS[project.root]
        : undefined;
OLD
NEW
sub $W 1 'const expectedProduct = frozen?.product ?? segments[productAt];' 'const expectedProduct = segments[productAt];'
sub $W 1 'const expectedName = frozen?.name ?? `' 'const expectedName = excusedName(project.root) ?? `'
T=tools/tool-devsync/src/namespace-layout.test.ts
subf $T 1 3<<'OLD' 4<<'NEW'
  it('excuses only the exact frozen application product and name', () => {
    const tags = ['scope:app', 'type:app', 'runtime:bun', 'ring:adapter'];
    expect(
      findNamespaceLayoutViolations([
        project('apps/wiki/cli', 'twilight-burokrat', [...tags, 'product:twilight-burokrat']),
      ]),
    ).toEqual([]);
    expect(
      findNamespaceLayoutViolations([
        project('apps/wiki/cli', 'wiki-cli', [...tags, 'product:wiki']),
        project('apps/wiki/other', 'twilight-burokrat', [...tags, 'product:twilight-burokrat']),
      ]),
    ).toEqual([
      'apps/wiki/cli: directory product twilight-burokrat disagrees with product:wiki',
      'apps/wiki/cli: project name must be twilight-burokrat, found wiki-cli',
      'apps/wiki/other: directory product wiki disagrees with product:twilight-burokrat',
      'apps/wiki/other: project name must be wiki-other, found twilight-burokrat',
    ]);
  });

  it('names a frozen root that no project occupies after the move', () => {
    expect(findStaleLayoutExceptions(VALID_PROJECTS)).toEqual([
      'apps/wiki/cli: frozen layout exception names no project; remove it',
    ]);
  });
OLD
  it('excuses only the exact root its name exception names', () => {
    const tags = [
      'scope:app',
      'type:app',
      'runtime:bun',
      'ring:adapter',
      'product:twilight-burokrat',
    ];
    expect(
      findNamespaceLayoutViolations([
        project('apps/twilight-structure/twilight-burokrat/cli', 'twilight-burokrat', tags),
      ]),
    ).toEqual([]);
    expect(
      findNamespaceLayoutViolations([
        project('apps/twilight-structure/twilight-burokrat/cli', 'twilight-burokrat-cli', tags),
        project('apps/twilight-structure/twilight-burokrat/other', 'twilight-burokrat', tags),
      ]),
    ).toEqual([
      'apps/twilight-structure/twilight-burokrat/cli: project name must be twilight-burokrat, found twilight-burokrat-cli',
      'apps/twilight-structure/twilight-burokrat/other: project name must be twilight-burokrat-other, found twilight-burokrat',
    ]);
  });

  it('names a name exception that no project occupies', () => {
    expect(findStaleLayoutExceptions(VALID_PROJECTS)).toEqual([
      'apps/twilight-structure/twilight-burokrat/cli: name exception names no project; remove it',
    ]);
  });
NEW
# The dev poller's restart list: the two entries move; their proofs are observed again.
S=tools/tool-devsync/src/sync.ts
subf $S 1 3<<'OLD' 4<<'NEW'
  // The wiki CLI has no serve target, but it is an app on disk and `sync.test.ts`
  // walks apps rather than trusting this list; a manifest the supervisor's project
  // graph reads at startup belongs here either way.
  // Proof: omitting it failed `names every app project.json, which the supervisor
  // reads once at startup` on `Expected to contain: "apps/wiki/cli/project.json"`
  // (2026-09-16).
  'apps/wiki/cli/project.json',
OLD
  // Twilight Burokrat's CLI has no serve target, but it is an app on disk and `sync.test.ts`
  // walks apps rather than trusting this list; a manifest the supervisor's project
  // graph reads at startup belongs here either way.
  'apps/twilight-structure/twilight-burokrat/cli/project.json',
NEW
subf $S 1 3<<'OLD' 4<<'NEW'
  // Proof: omitting this entry failed `names every app tsconfig, which is read once at
  // process start` on `Expected to contain: "apps/wiki/cli/tsconfig.json"` (2026-09-16).
  'apps/wiki/cli/tsconfig.json',
OLD
  'apps/twilight-structure/twilight-burokrat/cli/tsconfig.json',
NEW
# The destination map: the row sorts first now; its proof is observed again.
P=tools/tool-devsync/src/workspace-projects.test.ts
subf $P 1 3<<'OLD' 4<<'NEW'
const EXPECTED_PRODUCT_PROJECTS = [
  ['apps/wbs/be-01', 'wbs-be-01'],
  ['apps/wbs/fe-01', 'wbs-fe-01'],
  ['apps/wbs/gw-01', 'wbs-gw-01'],
  ['apps/wbs/mcp-01', 'wbs-mcp-01'],
  // Proof: leaving this row out after tool-wiki moved to apps/wiki/cli failed the owning
  // Nx target on the exact extra `['apps/wiki/cli', 'twilight-burokrat']` tuple, and the
  // product-axis case below on its `['apps/wiki/cli', ['product:twilight-burokrat']]`
  // companion (2026-09-16).
  ['apps/wiki/cli', 'twilight-burokrat'],
OLD
const EXPECTED_PRODUCT_PROJECTS = [
  ['apps/twilight-structure/twilight-burokrat/cli', 'twilight-burokrat'],
  ['apps/wbs/be-01', 'wbs-be-01'],
  ['apps/wbs/fe-01', 'wbs-fe-01'],
  ['apps/wbs/gw-01', 'wbs-gw-01'],
  ['apps/wbs/mcp-01', 'wbs-mcp-01'],
NEW
sub $P 1 "import { productConstraints, readProjects } from '../workspace-projects.mjs';" "import { APPLICATION_SUITES, productConstraints, readProjects } from '../workspace-projects.mjs';"
subf $P 1 3<<'OLD' 4<<'NEW'
      EXPECTED_PRODUCT_PROJECTS.map(([root]) => [
        root,
        [root === 'apps/wiki/cli' ? 'product:twilight-burokrat' : `product:${root.split('/')[1]}`],
      ]),
OLD
      EXPECTED_PRODUCT_PROJECTS.map(([root]) => {
        const segments = root.split('/');
        const suite = segments[0] === 'apps' && APPLICATION_SUITES.includes(segments[1]);
        return [root, [`product:${segments[suite ? 2 : 1]}`]];
      }),
NEW
# The pilot: the selector pin moves, its proof is observed again; the first refused index is
# Twilight Burokrat's own again.
PP=$C/src/policy/pilot-policy.test.ts
subf $PP 1 3<<'OLD' 4<<'NEW'
    // Proof: widening the boundary's selector to `apps` in the real policy file left every
    // assertion below green — `apps` matches at HEAD and every mapped path still lies under it —
    // and failed here alone on `- "value": "apps/wiki/cli" · + "value": "apps"` (2026-09-16).
    expect(wiki?.selector).toEqual({ kind: 'prefix', value: 'apps/wiki/cli' });
OLD
    expect(wiki?.selector).toEqual({
      kind: 'prefix',
      value: 'apps/twilight-structure/twilight-burokrat/cli',
    });
NEW
subf $PP 1 3<<'OLD' 4<<'NEW'
    // (2026-09-24).
    expect(observed).toContain(
      'applicable check has no executable authority in apps/wbs/be-01/src/module/optimization/README.md: check.be-01.test (external-consumer)',
    );
OLD
    // (2026-09-24). Moving Twilight Burokrat into the Twilight Structure suite put its own index
    // first again, since `apps/twilight-structure` sorts before `apps/wbs` (<observed-date-s3>).
    expect(observed).toContain(
      'applicable check has no executable authority in apps/twilight-structure/twilight-burokrat/cli/README.md: check.wiki-cli.test (external-consumer)',
    );
NEW
sub CONTEXT.md 1 '`wiki` is the second: one CLI, `apps/wiki/cli`, released separately from the WBS tool.' 'Twilight Burokrat is the second: one CLI, `apps/twilight-structure/twilight-burokrat/cli`,
released separately from the WBS tool.'
echo "s3-edit: every substitution matched its count"
```

### 7.8 Slice 3 — the legacy pin

#### Script s3-pin

```sh
set -euo pipefail
f=tools/tool-devsync/src/repo-namespacing-handoff.test.ts
test -f "$f"
old="    digest: '551e2a7d0fb1ed4b5659abee6b00ede7ccf703b9f65f71761b88be12a318eb80',"
new="    digest: 'c0a77f3355f27bc1e8fa7f23bd427c7b4cc7c068e6f787bb1552364482f28c22',"
test "$(grep -cxF "$old" "$f")" -eq 1
OLD=$old NEW=$new perl -0777 -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/' "$f"
test "$(grep -cxF "$new" "$f")" -eq 1
echo "s3-pin: the legacy digest names the moved tree"
```

## 8. Proofs

Every fault below was injected for real on the rehearsal's tree of the slice that owns it, on
2026-09-25, through the same `fault.sh` the executor uses: patch applied with `git apply
--unidiff-zero`, the named file run, the patch reversed, every modified file compared byte for byte
and every created file proved gone. The executor repeats each one and inserts the adjacent `Proof:`
comments (section 8.3) **only after its own expectation block has passed**, dated by its own
observation. A fault that leaves its named case passing is first a location mistake (preamble rule
20); a `gN-off` twin that fails its named case means the clause is not the only one catching the
fault — both are stops (section 10).

Every patch is zero-context, so a comment of any length above a line does not move it: `git apply
--unidiff-zero` finds the removed line at its offset.

### 8.1 Slice 1

| Fault | Clause disabled                                                                       | Named case, and the fact it fails on                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `n1`  | suite recognition (`APPLICATION_SUITES.includes(segments[1])` → `false`)              | `accepts a declared suite product at …` receives `applications require apps/<product>/<project>` (three cases fail: every suite case)                                          |
| `n2`  | only a declared directory is a suite (`\|\| segments.length === 4` added)             | `keeps an undeclared directory a product, …` receives `[]`; nothing else fails                                                                                                 |
| `n3`  | the shape guard inside a suite (`suite === undefined &&`)                             | `requires exactly apps/<suite>/<product>/<project> …` receives the derived product `cli` and `project name must be cli-undefined, found twilight-structure-cli`                |
| `n6`  | the shape guard outside a suite (`suite !== undefined &&`)                            | `keeps an undeclared directory a product, …` receives `directory product probe-suite disagrees with product:probe` — a different fact from `n2`'s                              |
| `n4`  | the product read from the product directory (`segments[1]`)                           | `derives a suite project product and name …` loses its product line; `accepts …` receives `directory product twilight-structure disagrees with product:twilight-probe`         |
| `n5`  | the name built from the product and project directories (`segments[1]`-`segments[2]`) | the same case loses its name line; `accepts …` receives `project name must be twilight-structure-twilight-probe, found twilight-probe-cli`                                     |
| `p1`  | the walk of a suite's products (`for (const product of [])`)                          | `applies a suite product policy at …` sees the lint exit 0 (`Received: 0`); the refusal case passes                                                                            |
| `p2`  | the suite-level refusal (`if (false)`)                                                | `refuses a policy in a suite directory itself` sees the lint exit 0 (`Expected: not 0`); the walk case passes                                                                  |
| `p3`  | libs stays out of the suite walk (`group !== 'apps' \|\|` removed)                    | `reads a libs directory named like a suite as a product` sees the lint refuse `libs/twilight-structure/eslint.product.mjs` as sitting in a suite directory; the other two pass |
| `c1`  | the Nx lint input `{workspaceRoot}/apps/*/*/eslint.product.mjs` removed               | both cache-input cases fail on its absence                                                                                                                                     |

#### Fault n1 — suite recognition off

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -406 +406 @@
-      const suite = APPLICATION_SUITES.includes(segments[1]) ? segments[1] : undefined;
+      const suite = false ? segments[1] : undefined;
```

#### Fault n2 — any four-segment directory read as a suite

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -406 +406 @@
-      const suite = APPLICATION_SUITES.includes(segments[1]) ? segments[1] : undefined;
+      const suite = APPLICATION_SUITES.includes(segments[1]) || segments.length === 4 ? segments[1] : undefined;
```

#### Fault n3 — shape guard skipped inside a suite

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -411 +411 @@
-      if (segments.length !== productAt + 2) {
+      if (suite === undefined && segments.length !== productAt + 2) {
```

#### Fault n6 — shape guard skipped outside a suite

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -411 +411 @@
-      if (segments.length !== productAt + 2) {
+      if (suite !== undefined && segments.length !== productAt + 2) {
```

#### Fault n4 — product read from the suite segment

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -435 +435 @@
-      const expectedProduct = frozen?.product ?? segments[productAt];
+      const expectedProduct = frozen?.product ?? segments[1];
```

#### Fault n5 — name built from the suite segments

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -441 +441 @@
-      const expectedName = frozen?.name ?? `${segments[productAt]}-${segments[productAt + 1]}`;
+      const expectedName = frozen?.name ?? `${segments[1]}-${segments[2]}`;
```

#### Fault p1 — a suite's products not walked

```diff
--- a/tools/tool-devsync/product-policies.mjs
+++ b/tools/tool-devsync/product-policies.mjs
@@ -166 +166 @@
-      for (const product of await directoriesBelow(directoryPath)) {
+      for (const product of []) {
```

#### Fault p2 — suite-level policy not refused

```diff
--- a/tools/tool-devsync/product-policies.mjs
+++ b/tools/tool-devsync/product-policies.mjs
@@ -161 +161 @@
-      if (await isPolicyPresent(suitePolicy)) {
+      if (false) {
```

#### Fault p3 — a libs directory read as a suite

```diff
--- a/tools/tool-devsync/product-policies.mjs
+++ b/tools/tool-devsync/product-policies.mjs
@@ -156 +156 @@
-      if (group !== 'apps' || !APPLICATION_SUITES.includes(directory)) {
+      if (!APPLICATION_SUITES.includes(directory)) {
```

#### Fault c1 — suite policy glob not a lint input

```diff
--- a/nx.json
+++ b/nx.json
@@ -49 +48,0 @@
-        "{workspaceRoot}/apps/*/*/eslint.product.mjs",
```

Run, then expect:

```sh
set -euo pipefail
d=tools/tool-devsync
t='env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts'
for id in n1 n2 n3 n6 n4 n5; do bash "$TMPDIR/fault.sh" $id $d $t ./src/namespace-layout.test.ts; done
for id in p1 p2 p3; do bash "$TMPDIR/fault.sh" $id $d $t ./src/eslint-boundaries.test.ts -t suite; done
bash "$TMPDIR/fault.sh" c1 $d $t ./src/lint-policy-cache.test.ts -t declares
```

```sh
set -euo pipefail
e="$TMPDIR/expect-fault.sh"
L='(fail) namespace layout validation >'
bash "$e" n1 1 ' 3 fail' "$L accepts a declared suite product at apps/<suite>/<product>/<project>" \
  'apps/twilight-structure/twilight-probe/cli: applications require apps/<product>/<project>'
bash "$e" n2 1 ' 1 fail' "$L keeps an undeclared directory a product, so four segments there stay malformed" '+ []'
bash "$e" n3 1 ' 1 fail' "$L requires exactly apps/<suite>/<product>/<project> under a declared suite" \
  'project name must be cli-undefined, found twilight-structure-cli'
bash "$e" n6 1 ' 1 fail' "$L keeps an undeclared directory a product, so four segments there stay malformed" \
  'apps/probe-suite/probe/cli: directory product probe-suite disagrees with product:probe'
bash "$e" n4 1 ' 2 fail' "$L derives a suite project product and name from its product directory" \
  'directory product twilight-structure disagrees with product:twilight-probe'
bash "$e" n5 1 ' 2 fail' "$L derives a suite project product and name from its product directory" \
  'project name must be twilight-structure-twilight-probe, found twilight-probe-cli'
bash "$e" p1 1 ' 1 fail' \
  '(fail) product lint policy discovery > applies a suite product policy at apps/<suite>/<product>/eslint.product.mjs' \
  'Received: 0'
bash "$e" p2 1 ' 1 fail' '(fail) product lint policy discovery > refuses a policy in a suite directory itself' \
  'Expected: not 0'
bash "$e" p3 1 ' 1 fail' '(fail) product lint policy discovery > reads a libs directory named like a suite as a product' \
  'sits in a suite directory'
bash "$e" c1 1 ' 2 fail' \
  '(fail) production lint policy cache inputs > declares every transitive workspace input read by the generated policy' \
  '(fail) production lint policy cache inputs > declares the discovery module and every product lint policy glob'
echo "slice 1: every fault failed its named case on its own fact"
```

### 8.2 Slice 3

| Fault           | What it does                                                                                                                                                           | Named case, and the fact                                                                                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `g1` / `g1-off` | plants an untracked `apps/wiki/stray.txt` naming nothing / and disables the leftover filter                                                                            | `no file remains …` fails with `"apps/wiki/stray.txt"` alone / every case passes                                                                                                                                                                                                                                                     |
| `g2` / `g2-off` | plants an untracked document naming the root / and drops `--others`                                                                                                    | `no current file names …` fails with `"docs/retired-root-probe.md:1"` / that case passes (the excuse case fails on the untracked check file itself, `excuses 3, holds 0`, because an executor's check file is untracked too)                                                                                                         |
| `g3` / `g3-off` | writes the root into tracked `docs/local-dev.md`'s first line / and reports no unexcused line                                                                          | `no current file names …` fails with `"docs/local-dev.md:1"` / every case passes                                                                                                                                                                                                                                                     |
| `g4` / `g4-off` | plants a document holding only `join('apps', 'wiki')` / and drops the segment spelling                                                                                 | `no current file names …` fails with `"docs/retired-root-probe.md:1"` / every case passes                                                                                                                                                                                                                                            |
| `g5` / `g5-off` | adds one mention to excused `openspec/changes/wiki-release/tasks.md` / and stops comparing counts                                                                      | `every excuse …` fails with `excuses 4, holds 5` while `no current file …` passes / every case passes                                                                                                                                                                                                                                |
| `g6` / `g6-off` | adds a historical tree `docs/no-such-tree/` / and stops reporting empty trees                                                                                          | `every excuse …` fails with `docs/no-such-tree/: excuses nothing` / every case passes                                                                                                                                                                                                                                                |
| `g7` / `g7-off` | misspells `ls-files` / and removes the refusal                                                                                                                         | all three fail on `cannot list the workspace: git: 'ls-filez' is not a git command` / the leftover and current cases pass on an empty listing and only the excuse case fails, every excuse holding 0: the empty-tree excuse catches the fault too, and the refusal's own share is that two of three cases do not go green on nothing |
| `g9`            | the `g8` move with `.filter((path) => !deleted.has(path))` removed                                                                                                     | all three fail on `ENOENT` reading the moved file's old path, still listed by the index                                                                                                                                                                                                                                              |
| `g8` / `g8-off` | moves `twilight-burokrat-package/proposal.md` into `openspec/changes/archive/2026-10-01-twilight-burokrat-package/` / and makes `unarchived` return the path unchanged | all three **pass** / `every excuse …` fails with `openspec/changes/twilight-burokrat-package/proposal.md: excuses 2, holds 0`                                                                                                                                                                                                        |
| `e1`            | excuses every root under the product directory instead of the exact one                                                                                                | `excuses only the exact root its name exception names` loses the `…/other` name line                                                                                                                                                                                                                                                 |
| `e2`            | drops `excusedName(project.root) ??`                                                                                                                                   | `accepts the complete actual workspace …` receives `…/cli: project name must be twilight-burokrat-cli, found twilight-burokrat`                                                                                                                                                                                                      |
| `e3`            | the stale-exception filter answers `false`                                                                                                                             | `names a name exception that no project occupies` receives `[]`                                                                                                                                                                                                                                                                      |
| `r1`, `r2`      | omit the two moved `RESTART_PATHS` entries                                                                                                                             | `names every app project.json …` / `names every app tsconfig …` on `Expected to contain: "…/cli/project.json"` / `"…/cli/tsconfig.json"`                                                                                                                                                                                             |
| `r3`            | omits the moved destination-map row                                                                                                                                    | `pins every product root …` on the extra tuple, and `activates the product axis …` on its companion                                                                                                                                                                                                                                  |
| `r4`            | pins the pre-move three-deep outDir                                                                                                                                    | `pins the complete moved depth-sensitive configuration inventory` on `value: "../../../dist/apps/wiki/cli"`                                                                                                                                                                                                                          |
| `r5`            | widens the bootstrap selector to `apps`                                                                                                                                | Planner-only after the combined commit: the four-case on-disk group starts green (`4 pass`), only `the bootstrap policy and mapping select the moved pilot boundaries at HEAD` fails on `+   "value": "apps",`, and restored bytes return the group to `4 pass`. The executor reports this proof pending planner verification.       |

#### Fault g1 — a file left under the retired root

```diff
--- /dev/null
+++ b/apps/wiki/stray.txt
@@ -0,0 +1 @@
+stray
```

#### Fault g1-off — the same, leftover filter off

```diff
--- /dev/null
+++ b/apps/wiki/stray.txt
@@ -0,0 +1 @@
+stray
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -156 +156 @@
-    leftovers: paths.filter((path) => path.startsWith(RETIRED_DIRECTORY)),
+    leftovers: paths.filter(() => false),
```

#### Fault g2 — an untracked document naming the root

```diff
--- /dev/null
+++ b/docs/retired-root-probe.md
@@ -0,0 +1 @@
+See `apps/wiki/cli`.
```

#### Fault g2-off — the same, untracked files not listed

```diff
--- /dev/null
+++ b/docs/retired-root-probe.md
@@ -0,0 +1 @@
+See `apps/wiki/cli`.
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -106 +106 @@
-  return [...new Set(listPaths(['--cached', '--others', '--exclude-standard']))]
+  return [...new Set(listPaths(['--cached', '--exclude-standard']))]
```

#### Fault g3 — a tracked document naming the root

```diff
--- a/docs/local-dev.md
+++ b/docs/local-dev.md
@@ -1 +1 @@
-# Local Development
+# Local Development, formerly under `apps/wiki/cli`
```

#### Fault g3-off — the same, unexcused lines not reported

```diff
--- a/docs/local-dev.md
+++ b/docs/local-dev.md
@@ -1 +1 @@
-# Local Development
+# Local Development, formerly under `apps/wiki/cli`
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -139 +139 @@
-        else lines.push(text.slice(0, match.index).split('\n').length);
+        else continue;
```

#### Fault g4 — the root as quoted segments

```diff
--- /dev/null
+++ b/docs/retired-root-probe.md
@@ -0,0 +1 @@
+join('apps', 'wiki')
```

#### Fault g4-off — the same, segment spelling not read

```diff
--- /dev/null
+++ b/docs/retired-root-probe.md
@@ -0,0 +1 @@
+join('apps', 'wiki')
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -19 +18,0 @@
-  /(['"`])apps\1\s*,\s*(['"`])wiki\2/g,
```

#### Fault g5 — one more mention in an excused file

```diff
--- a/openspec/changes/wiki-release/tasks.md
+++ b/openspec/changes/wiki-release/tasks.md
@@ -1 +1 @@
-Ordered slices. Slices 1 and 2 stand alone and land first: they make the existing archive's
+Ordered slices. Slices 1 and 2 stand alone and land first: they make the existing archive's (`apps/wiki/cli`)
```

#### Fault g5-off — the same, counts not compared

```diff
--- a/openspec/changes/wiki-release/tasks.md
+++ b/openspec/changes/wiki-release/tasks.md
@@ -1 +1 @@
-Ordered slices. Slices 1 and 2 stand alone and land first: they make the existing archive's
+Ordered slices. Slices 1 and 2 stand alone and land first: they make the existing archive's (`apps/wiki/cli`)
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -150 +150 @@
-    ...DATED_MENTIONS.filter(([path, occurrences]) => counted.get(path) !== occurrences).map(
+    ...DATED_MENTIONS.filter(() => false).map(
```

#### Fault g6 — a historical tree that holds nothing

```diff
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -44 +44 @@
-  'openspec/changes/archive/',
+  'openspec/changes/archive/', 'docs/no-such-tree/',
```

#### Fault g6-off — the same, empty trees not reported

```diff
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -44 +44 @@
-  'openspec/changes/archive/',
+  'openspec/changes/archive/', 'docs/no-such-tree/',
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -147 +147 @@
-    ...HISTORICAL_TREES.filter((tree) => perTree.get(tree) === 0).map(
+    ...HISTORICAL_TREES.filter(() => false).map(
```

#### Fault g7 — an unreadable listing

```diff
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -86 +86 @@
-  const listing = Bun.spawnSync(['git', 'ls-files', ...options, '-z'], {
+  const listing = Bun.spawnSync(['git', 'ls-filez', ...options, '-z'], {
```

#### Fault g7-off — the same, refusal removed

```diff
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -86 +86 @@
-  const listing = Bun.spawnSync(['git', 'ls-files', ...options, '-z'], {
+  const listing = Bun.spawnSync(['git', 'ls-filez', ...options, '-z'], {
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -91,3 +90,0 @@
-  if (listing.exitCode !== 0) {
-    throw new Error(`cannot list the workspace: ${listing.stderr.toString()}`);
-  }
```

#### Fault g8 — a listed change archived

```diff
--- a/openspec/changes/twilight-burokrat-package/proposal.md
+++ /dev/null
@@ -1,20 +0,0 @@
-# Intent
-
-## Problem
-
-The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.
-
-## Desired outcome
-
-Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.
-
-## Non-goals
-
-- Moving the package to another Git repository.
-- Certifying a consumer commit merely by installing a package.
-- Renaming historical stored activations or evidence.
-- Publishing without verified registry authority and protected credentials.
-
-## Constraints
-
-Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
--- /dev/null
+++ b/openspec/changes/archive/2026-10-01-twilight-burokrat-package/proposal.md
@@ -0,0 +1,20 @@
+# Intent
+
+## Problem
+
+The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.
+
+## Desired outcome
+
+Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.
+
+## Non-goals
+
+- Moving the package to another Git repository.
+- Certifying a consumer commit merely by installing a package.
+- Renaming historical stored activations or evidence.
+- Publishing without verified registry authority and protected credentials.
+
+## Constraints
+
+Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
```

#### Fault g8-off — the same, archived paths not mapped back

```diff
--- a/openspec/changes/twilight-burokrat-package/proposal.md
+++ /dev/null
@@ -1,20 +0,0 @@
-# Intent
-
-## Problem
-
-The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.
-
-## Desired outcome
-
-Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.
-
-## Non-goals
-
-- Moving the package to another Git repository.
-- Certifying a consumer commit merely by installing a package.
-- Renaming historical stored activations or evidence.
-- Publishing without verified registry authority and protected credentials.
-
-## Constraints
-
-Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
--- /dev/null
+++ b/openspec/changes/archive/2026-10-01-twilight-burokrat-package/proposal.md
@@ -0,0 +1,20 @@
+# Intent
+
+## Problem
+
+The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.
+
+## Desired outcome
+
+Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.
+
+## Non-goals
+
+- Moving the package to another Git repository.
+- Certifying a consumer commit merely by installing a package.
+- Renaming historical stored activations or evidence.
+- Publishing without verified registry authority and protected credentials.
+
+## Constraints
+
+Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -30 +30 @@
-  return path.replace(/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-/, 'openspec/changes/');
+  return path;
```

#### Fault g9 — the same, deleted paths still read

```diff
--- a/openspec/changes/twilight-burokrat-package/proposal.md
+++ /dev/null
@@ -1,20 +0,0 @@
-# Intent
-
-## Problem
-
-The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.
-
-## Desired outcome
-
-Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.
-
-## Non-goals
-
-- Moving the package to another Git repository.
-- Certifying a consumer commit merely by installing a package.
-- Renaming historical stored activations or evidence.
-- Publishing without verified registry authority and protected credentials.
-
-## Constraints
-
-Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
--- /dev/null
+++ b/openspec/changes/archive/2026-10-01-twilight-burokrat-package/proposal.md
@@ -0,0 +1,20 @@
+# Intent
+
+## Problem
+
+The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.
+
+## Desired outcome
+
+Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.
+
+## Non-goals
+
+- Moving the package to another Git repository.
+- Certifying a consumer commit merely by installing a package.
+- Renaming historical stored activations or evidence.
+- Publishing without verified registry authority and protected credentials.
+
+## Constraints
+
+Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
--- a/tools/tool-devsync/src/retired-roots.test.ts
+++ b/tools/tool-devsync/src/retired-roots.test.ts
@@ -107 +106,0 @@
-    .filter((path) => !deleted.has(path))
```

#### Fault e1 — name exception widened to the product directory

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -323,2 +323,2 @@
-  return Object.hasOwn(APPLICATION_NAME_EXCEPTIONS, root)
-    ? APPLICATION_NAME_EXCEPTIONS[root]
+  return root.startsWith('apps/twilight-structure/twilight-burokrat/')
+    ? 'twilight-burokrat'
```

#### Fault e2 — name exception not applied

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -458 +458 @@
-        excusedName(project.root) ?? `${segments[productAt]}-${segments[productAt + 1]}`;
+        `${segments[productAt]}-${segments[productAt + 1]}`;
```

#### Fault e3 — stale name exception not reported

```diff
--- a/tools/tool-devsync/workspace-projects.mjs
+++ b/tools/tool-devsync/workspace-projects.mjs
@@ -337 +337 @@
-    .filter((root) => !roots.has(root))
+    .filter(() => false)
```

#### Fault r1 — restart list without the moved project.json

```diff
--- a/tools/tool-devsync/src/sync.ts
+++ b/tools/tool-devsync/src/sync.ts
@@ -493 +492,0 @@
-  'apps/twilight-structure/twilight-burokrat/cli/project.json',
```

#### Fault r2 — restart list without the moved tsconfig.json

```diff
--- a/tools/tool-devsync/src/sync.ts
+++ b/tools/tool-devsync/src/sync.ts
@@ -504 +503,0 @@
-  'apps/twilight-structure/twilight-burokrat/cli/tsconfig.json',
```

#### Fault r3 — destination map without the moved row

```diff
--- a/tools/tool-devsync/src/workspace-projects.test.ts
+++ b/tools/tool-devsync/src/workspace-projects.test.ts
@@ -17 +16,0 @@
-  ['apps/twilight-structure/twilight-burokrat/cli', 'twilight-burokrat'],
```

#### Fault r4 — inventory pinned to the pre-move outDir

```diff
--- a/tools/tool-devsync/src/workspace-inventory.test.ts
+++ b/tools/tool-devsync/src/workspace-inventory.test.ts
@@ -241 +241 @@
-    value: '../../../../dist/apps/twilight-structure/twilight-burokrat/cli',
+    value: '../../../dist/apps/wiki/cli',
```

#### Fault r5 — bootstrap selector widened to apps

```diff
--- a/docs/wiki-policy/bootstrap-policy.json
+++ b/docs/wiki-policy/bootstrap-policy.json
@@ -744 +744 @@
-        "value": "apps/twilight-structure/twilight-burokrat/cli"
+        "value": "apps"
```

Run, then expect:

```sh
set -euo pipefail
d=tools/tool-devsync
t='env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts'
for id in g1 g1-off g2 g2-off g3 g3-off g4 g4-off g5 g5-off g6 g6-off g7 g7-off g8 g8-off g9; do
  bash "$TMPDIR/fault.sh" $id $d $t ./src/retired-roots.test.ts
done
for id in e1 e2 e3; do bash "$TMPDIR/fault.sh" $id $d $t ./src/namespace-layout.test.ts; done
for id in r1 r2; do bash "$TMPDIR/fault.sh" $id $d $t ./src/sync.test.ts -t 'RESTART_PATHS coverage'; done
bash "$TMPDIR/fault.sh" r3 $d $t ./src/workspace-projects.test.ts -t readProjects
bash "$TMPDIR/fault.sh" r4 $d $t ./src/workspace-inventory.test.ts
```

```sh
set -euo pipefail
e="$TMPDIR/expect-fault.sh"
LEFT='(fail) no file remains under the retired apps/wiki root'
CURRENT='(fail) no current file names the retired apps/wiki root'
EXCUSE='(fail) every excuse for the retired root still matches exactly what it names'
bash "$e" g1 1 ' 1 fail' "$LEFT" '"apps/wiki/stray.txt"'
bash "$e" g1-off 0 ' 3 pass'
bash "$e" g2 1 ' 1 fail' "$CURRENT" '"docs/retired-root-probe.md:1"'
bash "$e" g2-off 1 '(pass) no current file names the retired apps/wiki root'
bash "$e" g3 1 ' 1 fail' "$CURRENT" '"docs/local-dev.md:1"'
bash "$e" g3-off 0 ' 3 pass'
bash "$e" g4 1 ' 1 fail' "$CURRENT" '"docs/retired-root-probe.md:1"'
bash "$e" g4-off 0 ' 3 pass'
bash "$e" g5 1 ' 1 fail' "$EXCUSE" 'openspec/changes/wiki-release/tasks.md: excuses 4, holds 5'
bash "$e" g5-off 0 ' 3 pass'
bash "$e" g6 1 ' 1 fail' "$EXCUSE" 'docs/no-such-tree/: excuses nothing'
bash "$e" g6-off 0 ' 3 pass'
bash "$e" g7 1 ' 3 fail' "cannot list the workspace: git: 'ls-filez' is not a git command"
bash "$e" g7-off 1 ' 1 fail' "$EXCUSE" 'docs/superpowers/: excuses nothing'
bash "$e" g8 0 ' 3 pass'
bash "$e" g8-off 1 ' 1 fail' "$EXCUSE" 'openspec/changes/twilight-burokrat-package/proposal.md: excuses 2, holds 0'
bash "$e" g9 1 ' 3 fail' 'ENOENT' 'openspec/changes/twilight-burokrat-package/proposal.md'
L='(fail) namespace layout validation >'
bash "$e" e1 1 ' 1 fail' "$L excuses only the exact root its name exception names" \
  'apps/twilight-structure/twilight-burokrat/other: project name must be twilight-burokrat-other, found twilight-burokrat'
bash "$e" e2 1 ' 2 fail' "$L accepts the complete actual workspace after the coordinated move" \
  'apps/twilight-structure/twilight-burokrat/cli: project name must be twilight-burokrat-cli, found twilight-burokrat'
bash "$e" e3 1 ' 1 fail' "$L names a name exception that no project occupies" '+ []'
bash "$e" r1 1 ' 1 fail' \
  '(fail) RESTART_PATHS coverage > names every app project.json, which the supervisor reads once at startup' \
  'Expected to contain: "apps/twilight-structure/twilight-burokrat/cli/project.json"'
bash "$e" r2 1 ' 1 fail' \
  '(fail) RESTART_PATHS coverage > names every app tsconfig, which is read once at process start' \
  'Expected to contain: "apps/twilight-structure/twilight-burokrat/cli/tsconfig.json"'
bash "$e" r3 1 ' 2 fail' \
  '(fail) readProjects > pins every product root and qualified Nx identity in the destination map' \
  '(fail) readProjects > activates the product axis of its own directory on every app and library'
bash "$e" r4 1 ' 1 fail' '(fail) pins the complete moved depth-sensitive configuration inventory' \
  "value: \"../../../dist/apps/wiki/cli\""
echo "slice 3: every fault met its expected outcome, and every clause-off twin showed its clause alone decides it"
```

### 8.3 The Proof comments

Nine blocks are slice 1's, seventeen are slice 3's, and `planner-selector` is inserted by the
planner after the combined commit and the restored-green `r5` proof. Each block names its file and either the line it
goes directly above (`anchor:`) or directly below (`after:`), compared with indentation trimmed and required to match exactly one line.
`insert-proofs.pl` inserts a slice's blocks with the anchor's indentation and the executor's own
date; the slice's steps say when. Blocks `s1-*` belong to slice 1 and `s3-*` to slice 3.

```proof
id: s1-suite
file: tools/tool-devsync/workspace-projects.mjs
anchor: const suite = APPLICATION_SUITES.includes(segments[1]) ? segments[1] : undefined;
// Proof: with `APPLICATION_SUITES.includes(segments[1])` spelled `false`, `accepts a
// declared suite product at apps/<suite>/<product>/<project>` received `applications
// require apps/<product>/<project>`; with `|| segments.length === 4` added, `keeps an
// undeclared directory a product, so four segments there stay malformed` received `[]`
// (<observed-date>).
```

```proof
id: s1-shape
file: tools/tool-devsync/workspace-projects.mjs
anchor: if (segments.length !== productAt + 2) {
// Proof: with this guard skipped inside a suite, `requires exactly
// apps/<suite>/<product>/<project> under a declared suite` received the derived product
// `cli` and name `cli-undefined`; skipped outside one, `keeps an undeclared directory a
// product, so four segments there stay malformed` received `directory product probe-suite
// disagrees with product:probe` (<observed-date>).
```

```proof
id: s1-product
file: tools/tool-devsync/workspace-projects.mjs
anchor: const expectedProduct = frozen?.product ?? segments[productAt];
// Proof: with the product read at `segments[1]`, `derives a suite project product and
// name from its product directory` lost its `directory product twilight-probe` line
// (<observed-date>).
```

```proof
id: s1-name
file: tools/tool-devsync/workspace-projects.mjs
anchor: const expectedName = frozen?.name ?? `${segments[productAt]}-${segments[productAt + 1]}`;
// Proof: with the name built from `segments[1]` and `segments[2]`, the same case lost its
// `project name must be twilight-probe-cli` line (<observed-date>).
```

```proof
id: s1-walk
file: tools/tool-devsync/product-policies.mjs
anchor: for (const product of await directoriesBelow(directoryPath)) {
// Proof: with this loop walking `[]`, `applies a suite product policy at
// apps/<suite>/<product>/eslint.product.mjs` saw the lint exit 0 (<observed-date>).
```

```proof
id: s1-refuse
file: tools/tool-devsync/product-policies.mjs
anchor: if (await isPolicyPresent(suitePolicy)) {
// Proof: with this check spelled `if (false)`, `refuses a policy in a suite directory
// itself` saw the lint exit 0 (<observed-date>).
```

```proof
id: s1-libs
file: tools/tool-devsync/product-policies.mjs
anchor: if (group !== 'apps' || !APPLICATION_SUITES.includes(directory)) {
// Proof: with `group !== 'apps' ||` removed, `reads a libs directory named like a suite as a
// product` saw the lint refuse `libs/twilight-structure/eslint.product.mjs` as sitting in a
// suite directory (<observed-date>).
```

```proof
id: s1-cache
file: tools/tool-devsync/src/lint-policy-cache.test.ts
anchor: const inputs = await productionLintInputs();
// Proof: with the suite products' glob removed from nx.json, this case and the exact
// inventory above both failed on its absence (<observed-date>).
```

```proof
id: s1-pin
file: tools/tool-devsync/src/repo-namespacing-handoff.test.ts
anchor: digest: '551e2a7d0fb1ed4b5659abee6b00ede7ccf703b9f65f71761b88be12a318eb80',
// Proof: declaring the suite products' lint policies as Nx lint inputs added one
// `current recursive selector` to nx.json and two to lint-policy-cache.test.ts; leaving
// `68a1e15d…` at 305 here failed on the observed digest below, recursive selectors 31 to
// 34, occurrences 305 to 308, none unclassified (<observed-date>).
```

```proof
id: s3-leftover
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: leftovers: paths.filter((path) => path.startsWith(RETIRED_DIRECTORY)),
// Proof: an untracked `stray.txt` planted under the retired root, naming nothing, failed
// `no file remains under …` alone with its path; with this filter answering `false` as
// well, all three cases passed (<observed-date>).
```

```proof
id: s3-others
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: return [...new Set(listPaths(['--cached', '--others', '--exclude-standard']))]
// Proof: a new untracked document naming the retired root failed `no current file names …`
// with its `path:1`; without `--others` that case passed (<observed-date>).
```

```proof
id: s3-content
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: else lines.push(text.slice(0, match.index).split('\n').length);
// Proof: the retired root written into the first line of the tracked docs/local-dev.md
// failed `no current file names …` with `docs/local-dev.md:1`; with this branch spelled
// `else continue;` every case passed (<observed-date>).
```

```proof
id: s3-segments
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: /(['"`])apps\1\s*,\s*(['"`])wiki\2/g,
// Proof: a new document holding only the two quoted segments handed to `join` failed
// `no current file names …` with its `path:1`; without this spelling every case passed
// (<observed-date>).
```

```proof
id: s3-count
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: ...DATED_MENTIONS.filter(([path, occurrences]) => counted.get(path) !== occurrences).map(
// Proof: one more mention added to the top of openspec/changes/wiki-release/tasks.md failed
// `every excuse … still matches …` with `excuses 4, holds 5` while `no current file names …`
// passed; with this filter answering `false` every case passed (<observed-date>).
```

```proof
id: s3-tree
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: ...HISTORICAL_TREES.filter((tree) => perTree.get(tree) === 0).map(
// Proof: a `docs/no-such-tree/` entry added to the historical trees failed `every excuse …
// still matches …` with `docs/no-such-tree/: excuses nothing`; with this filter answering
// `false` every case passed (<observed-date>).
```

```proof
id: s3-listing
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: if (listing.exitCode !== 0) {
// Proof: with `ls-files` misspelled `ls-filez`, all three cases failed on `cannot list the
// workspace: git: 'ls-filez' is not a git command`; with this refusal removed as well, the
// leftover and current cases passed on an empty listing and only the excuse case failed, every
// excuse holding 0 — without the refusal two of three cases go green on nothing (<observed-date>).
```

```proof
id: s3-exact
file: tools/tool-devsync/workspace-projects.mjs
anchor: return Object.hasOwn(APPLICATION_NAME_EXCEPTIONS, root)
// Proof: excusing every root under the product directory instead of the exact one made
// `excuses only the exact root its name exception names` lose its
// `…/twilight-burokrat/other: project name must be twilight-burokrat-other` line
// (<observed-date>).
```

```proof
id: s3-applied
file: tools/tool-devsync/workspace-projects.mjs
anchor: const expectedName =
// Proof: without `excusedName(project.root) ??`, `accepts the complete actual workspace
// after the coordinated move` received `apps/twilight-structure/twilight-burokrat/cli:
// project name must be twilight-burokrat-cli, found twilight-burokrat` (<observed-date>).
```

```proof
id: s3-stale
file: tools/tool-devsync/workspace-projects.mjs
anchor: .filter((root) => !roots.has(root))
// Proof: with this filter answering `false`, `names a name exception that no project
// occupies` received `[]` (<observed-date>).
```

```proof
id: s3-manifest
file: tools/tool-devsync/src/sync.ts
anchor: 'apps/twilight-structure/twilight-burokrat/cli/project.json',
// Proof: omitting it failed `names every app project.json, which the supervisor reads once
// at startup` on `Expected to contain:
// "apps/twilight-structure/twilight-burokrat/cli/project.json"` (<observed-date>).
```

```proof
id: s3-tsconfig
file: tools/tool-devsync/src/sync.ts
anchor: 'apps/twilight-structure/twilight-burokrat/cli/tsconfig.json',
// Proof: omitting this entry failed `names every app tsconfig, which is read once at process
// start` on `Expected to contain:
// "apps/twilight-structure/twilight-burokrat/cli/tsconfig.json"` (<observed-date>).
```

```proof
id: s3-row
file: tools/tool-devsync/src/workspace-projects.test.ts
anchor: ['apps/twilight-structure/twilight-burokrat/cli', 'twilight-burokrat'],
// Proof: leaving this row out after Twilight Burokrat moved into the Twilight Structure
// suite failed the owning Nx target on the exact extra
// `['apps/twilight-structure/twilight-burokrat/cli', 'twilight-burokrat']` tuple, and the
// product-axis case below on its `product:twilight-burokrat` companion (<observed-date>).
```

```proof
id: s3-outdir
file: tools/tool-devsync/src/workspace-inventory.test.ts
after: // moved project's actual three-deep outDir (2026-09-16).
// Proof: pinning the three-deep outDir the project had before it joined the Twilight
// Structure suite failed this oracle with its actual four-deep one (<observed-date>).
```

```proof
id: planner-selector
file: apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts
anchor: expect(wiki?.selector).toEqual({
// Proof: widening the boundary's selector to `apps` in the real policy file left every
// assertion below green — `apps` matches at HEAD and every mapped path still lies under it —
// and failed here alone on `- "value": "apps/twilight-structure/twilight-burokrat/cli" ·
// + "value": "apps"` (<observed-date>).
```

```proof
id: s3-pin
file: tools/tool-devsync/src/repo-namespacing-handoff.test.ts
anchor: digest: 'c0a77f3355f27bc1e8fa7f23bd427c7b4cc7c068e6f787bb1552364482f28c22',
// Proof: leaving `551e2a7d…` here after Twilight Burokrat moved into the Twilight Structure
// suite failed on the observed digest below at the same 308 occurrences and categories:
// every context the project carries kept its match and class and changed only the path it
// is reported under, none unclassified (<observed-date>).
```

```proof
id: s3-archive
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: return path.replace(/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-/, 'openspec/changes/');
// Proof: moving `twilight-burokrat-package/proposal.md` to
// `openspec/changes/archive/2026-10-01-twilight-burokrat-package/` left all three cases green;
// with this function returning `path` unchanged, `every excuse … still matches …` failed with
// `…/twilight-burokrat-package/proposal.md: excuses 2, holds 0` (<observed-date>).
```

```proof
id: s3-deleted
file: tools/tool-devsync/src/retired-roots.test.ts
anchor: .filter((path) => !deleted.has(path))
// Proof: with this filter removed, the archiving move of `g8` — its old path deleted from the
// working tree, not yet from the index — failed all three cases on `ENOENT` reading that
// path (<observed-date>).
```

## 9. Verification

### 9.1 Every patch and script applies, extracted from this document, in slice order

The claim is not "these edits were once correct" but "these patches, scripts, faults and Proof
blocks, as this committed document spells them, reproduce the rehearsal" — on the rehearsal's base,
with the executor's own dates, and on the real dispatch base. Three modes:

- `fill=0` — the rehearsal base `fc5015a9` (`main` plus the planner-owned exemption and packet commits), dated 2026-09-25 as the rehearsal was: the
  result must be byte-identical to the rehearsal's final commit, but for `verify.md`, which the
  executor writes.
- `fill=1` — the same base, dated 2026-10-01 and with a simulated executor record appended to
  `verify.md` in slices 1 and 3: every file that differs from the rehearsal must differ only in
  dates (`created:` and parenthesised dates normalised).
- `fill=real` — the base named by `REAL_BASE` (planning with this plan branch cherry-picked; section
  6.5), dated 2026-10-01: the same paths must change, renames included, and every changed path must
  carry the rehearsal's delta, dates normalised. **This mode's output is the dispatch evidence.**
  Unset, the mode prints that it was skipped and proves nothing. A failing `fill=real` is a
  re-rehearsal, never a waiver: a legacy digest another lane moved fails patch 04 here first.

Every mode follows the planner's flow: slice 1 committed, slice 2 staged and not committed, slices 2
and 3 committed together. It applies all five patches and three scripts, checks all 35 fault
patches against the tree their slice leaves, replays all 35 faults through the restored-green
helper, and inserts all 27 Proof blocks. Each mode gets a fresh clone and its own frozen Bun
install; `node_modules` is never linked. Run from the plan worktree's root.

````sh
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
packet=$repo/docs/superpowers/plans/2026-09-25-batch-7/suite-directory-move.md
base=fc5015a906e060473b5b20984d812332c097394c
final=34bf381498127a29a9773ae072faf978d8a557d5
real_base=${REAL_BASE:-}
runtime_root=${TMPDIR:?}
test -f "$packet"
git -C "$repo" cat-file -e "$final^{commit}"
change=openspec/changes/adopt-suite-directory-layout
commit() { git -c user.email=x@example.invalid -c user.name=x commit -qm "$1"; }
# A file with every date this packet writes — `created:` and a parenthesised date — normalised.
dates_of() { sed -E 's/(created: |\()20[0-9]{2}-[0-9]{2}-[0-9]{2}/\1D/g' "$1"; }
# The lines one version of a file changes into another, in order, dates normalised.
delta_of() {
  dates_of "$1" > "$work/delta.a"
  dates_of "$2" > "$work/delta.b"
  if diff -U0 "$work/delta.a" "$work/delta.b" > "$work/delta.d"; then :; else test $? -eq 1; fi
  sed -n -e '/^---/d' -e '/^+++/d' -e '/^[-+]/p' "$work/delta.d"
}
for fill in 0 1 real; do
  from=$base
  date=2026-09-25
  if [ "$fill" != 0 ]; then date=2026-10-01; fi
  if [ "$fill" = real ]; then
    if [ -z "$real_base" ]; then echo "fill=real skipped: REAL_BASE unset, not dispatch evidence"; continue; fi
    from=$real_base
  fi
  work=$(mktemp -d "$runtime_root/extract-XXXXXX")
  mkdir -p "$work/final" "$work/actual" "$work/patches" "$work/scripts" "$work/faults" "$work/runtime/evidence"
  awk -v out="$work" '
    /^#### (Patch|Script|Fault) / { kind = $2; id = $3; next }
    kind != "" && /^```(diff|sh)$/ {
      dir = kind == "Patch" ? "patches" : kind == "Script" ? "scripts" : "faults"
      f = out "/" dir "/" id (kind == "Script" ? ".sh" : ".diff")
      printf "" > f
      capture = 1
      next
    }
    capture && /^```$/ { capture = 0; kind = ""; close(f); next }
    capture { print > f }
  ' "$packet"
  # The step 0b helpers this run needs, cut from the packet itself.
  awk '/^cat > "\$TMPDIR\/insert-proofs.pl" <</ { on = 1; next } on && /^INSERT_PROOFS$/ { exit } on { print }' "$packet" > "$work/insert-proofs.pl"
  awk '/^cat > "\$TMPDIR\/tick.sh" <</ { on = 1; next } on && /^TICK_SH$/ { exit } on { print }' "$packet" > "$work/tick.sh"
  awk '/^cat > "\$TMPDIR\/fault.sh" <</ { on = 1; next } on && /^FAULT_SH$/ { exit } on { print }' "$packet" > "$work/runtime/fault.sh"
  cp -R "$work/faults" "$work/runtime/faults"
  test -s "$work/insert-proofs.pl"
  test -s "$work/tick.sh"
  test -s "$work/runtime/fault.sh"
  echo "fill=$fill extracted patches=$(find "$work/patches" -name '*.diff' | wc -l) scripts=$(find "$work/scripts" -name '*.sh' | wc -l) faults=$(find "$work/faults" -name '*.diff' | wc -l)"
  test "$(find "$work/faults" -name '*.diff' | wc -l)" -eq 35
  git -C "$repo" archive "$final" | tar -x -C "$work/final"
  git clone -q --no-local "$repo" "$work/tree"
  git -C "$work/tree" fetch -q "$repo" "$from" "$final"
  cd "$work/tree"
  git checkout -q --detach "$from"
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bun install --frozen-lockfile > "$work/install.log" 2>&1
  test -d node_modules
  test ! -L node_modules
  export TMPDIR="$work/runtime"
  # Slice 1: the change as `openspec new change` writes it, the four patches, the proofs, the ticks.
  mkdir -p "$change"
  printf 'schema: sdd-lean\ncreated: %s\n' "$date" > "$change/.openspec.yaml"
  for n in 03 01 02 04; do
    git apply --check "$work/patches/$n.diff"
    git apply "$work/patches/$n.diff"
  done
  for id in n1 n2 n3 n6 n4 n5 p1 p2 p3 c1; do git apply --unidiff-zero --check "$work/faults/$id.diff"; done
  dev=tools/tool-devsync
  for id in n1 n2 n3 n6 n4 n5; do
    bash "$TMPDIR/fault.sh" "$id" "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/namespace-layout.test.ts
    test "$(tail -n 1 "$TMPDIR/evidence/fault-$id.log")" = status=1
  done
  for id in p1 p2 p3; do
    bash "$TMPDIR/fault.sh" "$id" "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/eslint-boundaries.test.ts -t suite
    test "$(tail -n 1 "$TMPDIR/evidence/fault-$id.log")" = status=1
  done
  bash "$TMPDIR/fault.sh" c1 "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/lint-policy-cache.test.ts -t declares
  test "$(tail -n 1 "$TMPDIR/evidence/fault-c1.log")" = status=1
  echo "fill=$fill slice 1 faults=10, each restored and green"
  perl "$work/insert-proofs.pl" "$packet" s1- "$date"
  bash "$work/tick.sh" 1.1 1.2
  if [ "$fill" != 0 ]; then printf '\n## Slice 1 — simulated executor record\n\nNot knowable from here.\n' >> "$change/verify.md"; fi
  # Slice 1 step 7's Prettier over its owned paths, after the Proof comments.
  git status --porcelain --untracked-files=all | cut -c4- > "$work/owned1.txt"
  test "$(wc -l < "$work/owned1.txt")" -eq 13
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$work/owned1.txt") > /dev/null
  git add -A
  commit s1
  # Slice 2: the move, staged by the planner and not committed.
  bash "$work/scripts/s2-move.sh"
  bash "$work/tick.sh" 2.1
  git add -A
  echo "fill=$fill slice 2 staged renames=$(git diff --cached -M --summary | grep -c '^ rename')"
  # Slice 3.
  git apply --check "$work/patches/05.diff"
  git apply "$work/patches/05.diff"
  bash "$work/scripts/s3-edit.sh"
  { git diff --name-only; git ls-files --others --exclude-standard; } | grep -v "^$change/" > "$work/touched.txt"
  test "$(wc -l < "$work/touched.txt")" -eq 50
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  # g2-off addresses the pre-format selector line in the new check; format it after faults.
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(grep -v '/retired-roots.test.ts$' "$work/touched.txt") > /dev/null
  bash "$work/scripts/s3-pin.sh"
  for id in g1 g1-off g2 g2-off g3 g3-off g4 g4-off g5 g5-off g6 g6-off g7 g7-off g8 g8-off g9 e1 e2 e3 r1 r2 r3 r4; do
    git apply --unidiff-zero --check "$work/faults/$id.diff"
  done
  for id in g1 g1-off g2 g2-off g3 g3-off g4 g4-off g5 g5-off g6 g6-off g7 g7-off g8 g8-off g9; do
    bash "$TMPDIR/fault.sh" "$id" "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/retired-roots.test.ts
    expected=1
    case "$id" in g1-off|g3-off|g4-off|g5-off|g6-off|g8) expected=0 ;; esac
    test "$(tail -n 1 "$TMPDIR/evidence/fault-$id.log")" = "status=$expected"
  done
  for id in e1 e2 e3; do
    bash "$TMPDIR/fault.sh" "$id" "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/namespace-layout.test.ts
    test "$(tail -n 1 "$TMPDIR/evidence/fault-$id.log")" = status=1
  done
  for id in r1 r2; do
    bash "$TMPDIR/fault.sh" "$id" "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/sync.test.ts -t 'RESTART_PATHS coverage'
    test "$(tail -n 1 "$TMPDIR/evidence/fault-$id.log")" = status=1
  done
  bash "$TMPDIR/fault.sh" r3 "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/workspace-projects.test.ts -t readProjects
  bash "$TMPDIR/fault.sh" r4 "$dev" env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT bun test --preload ../test/scratch/preload.ts ./src/workspace-inventory.test.ts
  for id in r3 r4; do test "$(tail -n 1 "$TMPDIR/evidence/fault-$id.log")" = status=1; done
  echo "fill=$fill slice 3 faults=24, each restored and green"
  perl "$work/insert-proofs.pl" "$packet" s3- "$date"
  pilot=apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts
  test "$(grep -c '<observed-date-s3>' "$pilot")" -eq 1
  sed -i "s/<observed-date-s3>/$date/" "$pilot"
  bash "$work/tick.sh" 3.1 3.2
  if [ "$fill" != 0 ]; then printf '\n## Slice 3 — simulated executor record\n\nNot knowable from here.\n' >> "$change/verify.md"; fi
  # Slice 3 step 8's Prettier over its 52 owned paths, after the Proof comments.
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$work/touched.txt") \
    "$change/tasks.md" "$change/verify.md" > /dev/null
  git add -A
  commit s2s3
  pilot_group='on-disk bootstrap policy, mapping and relationship files'
  pilot_dir=apps/twilight-structure/twilight-burokrat/cli
  pilot_cmd=(env -u CLAUDECODE -u AGENT -u CLAUDE_CODE_ENTRYPOINT "TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules" timeout 900 bun test --preload ../../../../tools/test/scratch/preload.ts ./src/policy/pilot-policy.test.ts -t "$pilot_group")
  (cd "$pilot_dir" && "${pilot_cmd[@]}") > "$TMPDIR/evidence/planner-selector-before.log" 2>&1
  grep -qF ' 4 pass' "$TMPDIR/evidence/planner-selector-before.log"
  bash "$TMPDIR/fault.sh" r5 "$pilot_dir" "${pilot_cmd[@]}"
  test "$(tail -n 1 "$TMPDIR/evidence/fault-r5.log")" = status=1
  grep -qF ' 1 fail' "$TMPDIR/evidence/fault-r5.log"
  grep -qF '+   "value": "apps",' "$TMPDIR/evidence/fault-r5.log"
  grep -qF ' 4 pass' "$TMPDIR/evidence/restored-r5.log"
  perl "$work/insert-proofs.pl" "$packet" planner- "$date"
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write "$pilot_dir/src/policy/pilot-policy.test.ts" > /dev/null
  git add "$pilot_dir/src/policy/pilot-policy.test.ts"
  git commit --amend --no-edit -q
  echo "fill=$fill slices 1-3 applied as two commits, all 35 faults restored and green; planner-selector inserted after r5"
  echo "fill=$fill combined commit renames=$(git diff -M --summary HEAD~1 HEAD | grep -c '^ rename')"
  git archive HEAD | tar -x -C "$work/actual"
  if (cd "$work/actual" && diff -rq . "$work/final") > "$work/differ.txt"; then :; else test $? -eq 1; fi
  if grep -v "verify.md and" "$work/differ.txt" | grep -v '^Files ' > "$work/only.txt"; then
    if [ "$fill" != real ]; then cat "$work/only.txt" >&2; exit 1; fi
  else test $? -eq 1; fi
  if [ "$fill" = 0 ]; then
    if grep -v "$change/verify.md and" "$work/differ.txt"; then exit 1; else test $? -eq 1; fi
    echo "fill=0 tree identical to $final but for the executor-written verify.md"
  elif [ "$fill" = 1 ]; then
    sed -n 's#^Files \./\(.*\) and .* differ$#\1#p' "$work/differ.txt" | grep -v "^$change/verify.md$" > "$work/dated.txt"
    while read -r f; do test "$(dates_of "$f")" = "$(dates_of "$work/final/$f")"; done < "$work/dated.txt"
    echo "fill=1 $(wc -l < "$work/dated.txt") files differ, every one only in dates"
  else
    git diff -M --name-status HEAD~2 HEAD | grep -v "$change/verify.md" > "$work/changed-real.txt"
    git -C "$repo" diff -M --name-status "$base" "$final" | grep -v "$change/verify.md" > "$work/changed-rehearsed.txt"
    diff "$work/changed-rehearsed.txt" "$work/changed-real.txt"
    while IFS=$'\t' read -r kind a b; do
      case "$kind" in
        M) old=$a new=$a ;;
        R*) old=$a new=$b ;;
        A) test "$(dates_of "$a")" = "$(dates_of "$work/final/$a")"; continue ;;
        D) test ! -e "$a"; continue ;;
        *) echo "unexpected change $kind $a" >&2; exit 1 ;;
      esac
      git -C "$repo" show "$base:$old" > "$work/authored"
      git -C "$repo" show "$real_base:$old" > "$work/real"
      test "$(delta_of "$work/real" "$new")" = "$(delta_of "$work/authored" "$work/final/$new")"
    done < "$work/changed-real.txt"
    echo "fill=real the same $(wc -l < "$work/changed-real.txt") changes as the rehearsal, each the same delta"
  fi
  cd "$repo"
done
````

Revision 3 evidence is recorded after running this block from the committed revision 3 packet,
with `REAL_BASE` set to `main` plus every plan-branch commit cherry-picked, including the
planner-owned exemption. The negative uses slice 1's commit as `REAL_BASE` and must stop at patch
03 before any comparison.

### 9.2 The strict OpenSpec block, reproduced

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -c '.summary.totals' "$report"
```

Expected: one JSON report and exit 0. Rehearsed on `e93a564a0`: **115** before slice 1, **116** after
slice 1's contract step and at every later step (revision 1, on `ad0451da9`: 114 → 115).

### 9.3 Commands actually run, and what each reported

All on 2026-09-25 by this packet's author. **Revision 2** (this document) was rehearsed on `main` at
`e93a564a0` in a clone with its own `bun install --frozen-lockfile` — no linked `node_modules`, which
the review found stale for `toolchain-pins` — with Bun 1.4.2 and Nx; Bun without `CLAUDECODE`, `AGENT`
and `CLAUDE_CODE_ENTRYPOINT`; multi-file runs one file at a time.

**Measurement and design probes** (revision 1, on `ad0451da9`):

- A pure `git mv apps/wiki apps/twilight-structure/twilight-burokrat` committed with hooks on:
  refused, `lint` `✖ 10477 problems (10477 errors, 0 warnings)`. The same move plus the one `extends`
  line: committed, every hook green (126 renames at 100%, one at 85%). Revision 2 no longer commits
  the move alone (D3, section 3.4).
- The first suite message spelled `apps/${suite}/<product>/<project>`; devsync's legacy classifier
  reported it `UNCLASSIFIED`. Reworded.
- The first retired-root check threw `EISDIR` on tracked directory symlinks (`.claude/skills/*`); it
  reads a link's target. It first scanned at module load, so a broken listing showed as
  `Unhandled error between tests` with `0 pass 0 fail`; it now scans lazily. Revision 2 found a third
  shape: a tracked file deleted from the working tree (an unstaged move) threw `ENOENT`; the listing
  now drops `--deleted` paths (fault `g9`).
- With only the slash spelling checked, `gate-entrypoints.test.ts` failed 19 of 57 tests on the seven
  segment spellings. The pilot's prose-facts case now names Twilight Burokrat's own index first. The
  routed rules design's link failed devsync's two link checks. Three comments grew past 100 columns.
  The script handles all of these.
- **What the whole suite caught.** Revision 1's first slice 3 commit passed every focused check and
  whole devsync, but whole `twilight-burokrat:test` failed four: two real defects —
  `contracts.test.ts › pins the unmet source-certification outcome to both real source gates`
  (`ENOENT …/apps/docs/experiment-evidence/fixed-benchmark-corpus.v1.json`) and
  `selectors.test.ts › selects one exact occurrence from the real four-table migration`, two root
  climbs written one `'..'` per line that the one-line searches missed — and two flakes that are
  section 10's condition 11 (`relationships.test.ts › refuses malformed static Nx project data…` timed
  out at 5000 ms, as it did on the unmodified base; `claims.db.test.ts › bounds terminal lock
contention…`). A scan of the moved tree for every climb that leaves the project found exactly the
  two; the script moves them and the focused list holds both files. The rerun gave 764·0.

**The rehearsal, `rehearse/suite-move-r3`** from `fc5015a9`, built from this document's patches,
scripts, faults and Proof blocks, with the hooks on for both commits:

| Step                   | Slice 1 (`574c44de`)                                            | Slice 2 (no commit)                                                   | Slices 2+3 committed together (`34bf3814`)                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| start                  | clean at `fc5015a9`                                             | slice 1's commit, clean                                               | slice 1's commit with the move staged: index digest checked, worktree = index, nothing untracked, 127 staged renames into the new root                                                                                                                                                                                                                                                                                       |
| baselines              | layout 19·0, policies 15·0, cache 4·0, legacy 1·0, OpenSpec 115 | `git ls-files apps/wiki` 127                                          | layout 22·1, workspace-projects 15·2, sync 50·2, inventory 3·1, targets 17·2, cache 4·0, legacy 0·1, typecheck `TS6053` `status=1`                                                                                                                                                                                                                                                                                           |
| contract / red         | OpenSpec 116; layout 20·3, policies 1·2, cache 2·2, typecheck 0 | —                                                                     | retired-roots 1·2, 115 current lines                                                                                                                                                                                                                                                                                                                                                                                         |
| script                 | —                                                               | `s2-check: 127 files moved, one line changed`                         | `s3-edit: every substitution matched its count`; Prettier reformatted 12 of 50                                                                                                                                                                                                                                                                                                                                               |
| green                  | layout 23·0, policies 18·0, cache 4·0; typecheck 0, lint 0      | —                                                                     | layout 23·0, workspace-projects 17·0, sync 52·0, inventory 4·0, targets 19·0, cache 4·0, retired-roots 3·0; typecheck (both) 0, lint 0, lint:source 0, build 0; generations 13·0, contracts 16·0, classification 16·0, root-migration 32·0, activation 13·0, gate-entrypoints 57·0, release (policy) 13·0, trusted-policy 55·0, rules 63·0, committed-target-facts 2·0, selectors 19·0, audit 19·0, release (packaging) 10·0 |
| legacy pin             | red on `551e2a7d…` 308 (recursive 31 → 34), then 1·0            | —                                                                     | red on `c0a77f33…` 308, then 1·0                                                                                                                                                                                                                                                                                                                                                                                             |
| faults                 | 10 of 10 as section 8.1                                         | —                                                                     | 25 of 25 as section 8.2                                                                                                                                                                                                                                                                                                                                                                                                      |
| proofs, ticks, records | 9 blocks, tasks 1.1–1.2, Prettier clean, owned 13 = status      | task 2.1; `--write` then `--check`; status 127 ` D`, 127 `??`, 2 ` M` | 17 executor blocks; `planner-selector` pending planner verification, tasks 3.1–3.2, `nx format:check --all` 0, OpenSpec 116, owned 52 = changed against the index                                                                                                                                                                                                                                                            |
| commit                 | hooks green                                                     | staged by the planner: 126 renames at 100%, one at 85%                | whole devsync on the staged tree first (382·0), then hooks green                                                                                                                                                                                                                                                                                                                                                             |

### 9.4 Planner-only, with the expected value

The executor cannot run these: they write Git objects, listen on a port, need the commit, or take
the host. The revised gates and `r5` were rerun on revision 3 from `fc5015a9`; broader package and host
checks remain as recorded for revision 2 and require planner verification on the dispatch result.

| When                | Check                                                                                                                                                                              | Expected                                                                                                                                                                                                                                              | Rehearsed                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| slice 1's commit    | whole `tool-devsync:test` (inside `planner-commit.sh`)                                                                                                                             | base **+7** tests, 0 fail                                                                                                                                                                                                                             | 372 → 379, 0 fail                                                                                                                                                                                                                                                                                                                                                    |
| after slice 1       | `bun apps/wiki/cli/src/cli.ts check-indexes committed . HEAD`                                                                                                                      | exit 0, the base's index count                                                                                                                                                                                                                        | 34                                                                                                                                                                                                                                                                                                                                                                   |
| after slice 2       | `git add -A`, the rename summary and the index digest (slice 2, "No planner commit")                                                                                               | step 1's N − 1 renames at `(100%)` and `cli/tsconfig.json` at `(85%)`; no commit                                                                                                                                                                      | 126 and one; digest recorded into slice 3's note                                                                                                                                                                                                                                                                                                                     |
| slices 2+3's commit | `planner-commit.sh <clone> "<subject>"` — whole devsync on the staged tree, then the hooks                                                                                         | slice 1's number **+3**, 0 fail; hooks green                                                                                                                                                                                                          | 382, 0 fail; hooks green                                                                                                                                                                                                                                                                                                                                             |
| after the commit    | `git show -M --summary HEAD`, and `git log --follow` on moved files                                                                                                                | N − 1 renames; the one unpaired file named below                                                                                                                                                                                                      | 126 renames (98 at 100%); `cli/tsconfig.lib.json` shows as delete and create; `--follow` reaches `cli/src/policy/trust.ts`'s pre-move history                                                                                                                                                                                                                        |
| after the commit    | the whole pilot suite, `bun test --preload ../../../../tools/test/scratch/preload.ts ./src/policy/pilot-policy.test.ts` in the moved `cli/`, with `TOOL_WIKI_TRUSTED_NODE_MODULES` | the base count, 0 fail — the on-disk group and prose-facts, red on the staged move, go green here                                                                                                                                                     | 21 pass, 0 fail                                                                                                                                                                                                                                                                                                                                                      |
| after the commit    | planner-only `r5`, then `planner-selector` Proof                                                                                                                                   | four-case on-disk group `4 pass` green; `r5` fails only the named selector case on `+   "value": "apps",`; copy back saved bytes and rerun `4 pass`; insert `planner-` with the observed date and amend the unpublished combined commit with hooks on | `4 pass, 0 fail` before; `fault r5: status=1, restored and green`; `3 pass, 1 fail` on the named case only; `4 pass, 0 fail` after; `inserted 1 proof blocks for planner-`; hooks green                                                                                                                                                                              |
| after the commit    | `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes committed . HEAD`                                                                                      | exit 0, the same index count; `module.infra.tool-wiki` at `apps/twilight-structure/twilight-burokrat/cli/README.md` with the same members                                                                                                             | 34; `apps/twilight-structure/twilight-burokrat/cli/README.md`, 123 members                                                                                                                                                                                                                                                                                           |
| after the commit    | `twilight-burokrat:test:package`, then `tar -tzf dist/twilight-burokrat-pack/twilight-burokrat-0.1.0.tgz \| sort`                                                                  | exit 0; the listing equals the base's line for line                                                                                                                                                                                                   | 44 pass; the same 163 entries as the base listing (taken on `ad0451da9`; PR #63 changed no package file). The bytes differ (SHA-256 `ca3094d2…`): `package-manifest.json`'s source revision and toolkit identity, the bundles' source-path comments, the relocation preparer's default `validator-entry`, and the packed README's runbook link — never a listed path |
| after the commit    | `twilight-burokrat:build`; `nx show project twilight-burokrat --json`                                                                                                              | exit 0; `root` `apps/twilight-structure/twilight-burokrat/cli`, `sourceRoot` `…/cli/src`, name unchanged                                                                                                                                              | build 0; `root` `apps/twilight-structure/twilight-burokrat/cli`, `sourceRoot` `…/cli/src`, name `twilight-burokrat`                                                                                                                                                                                                                                                  |
| after the commit    | whole `twilight-burokrat:test`                                                                                                                                                     | the base count, 0 fail but section 10's known flakes                                                                                                                                                                                                  | 764 pass, 0 fail (1143 s)                                                                                                                                                                                                                                                                                                                                            |
| after the commit    | `nx format:check --all`; `run-many -t typecheck lint lint:source -p tool-devsync twilight-burokrat`                                                                                | exit 0                                                                                                                                                                                                                                                | format 0; typecheck 0; lint and lint:source 0                                                                                                                                                                                                                                                                                                                        |
| before the merge    | `bin/h2puni-gate.sh <sha>` on the shared build host, and CI                                                                                                                        | `h2puni gate: running on <sha>`, exit 0                                                                                                                                                                                                               | not run: the rehearsal is not the dispatch head                                                                                                                                                                                                                                                                                                                      |

After the combined commit, the planner runs the four-case on-disk group green from the moved
`cli/` with `TOOL_WIKI_TRUSTED_NODE_MODULES` set to the clone's own `node_modules`. Then run
`bash "$TMPDIR/fault.sh" r5` with the same command, require only the named selector case to fail
(`3 pass`, `1 fail`), and inspect `evidence/restored-r5.log` for `4 pass`, `0 fail`. The helper
reverses the patch, copies saved bytes back, compares them, and reruns the group. Only then run
`perl "$TMPDIR/insert-proofs.pl" "$packet" planner- "$(date -u +%F)"`; require `inserted 1 proof
blocks for planner-`, format the pilot test with Prettier `--write` and `--check`, stage it, and
amend the unpublished combined commit with hooks enabled. The executor records `r5` and this
Proof as pending planner verification; neither is part of slice 3's 17 Proof insertions.

### 9.5 What none of this proves

- **That `trusted-wiki` certifies the moved tree.** No activation is provisioned, and a relocation
  activation needs the operator's review record for a real candidate head (sections 3.8, 12).
- **That the release workflow runs green on GitHub.** Its paths were checked by `release.test.ts`,
  which reads the workflow, and by `release-cli.ts`'s own suites; no tag was pushed.
- **A third spelling of the root** (section 3.6): the text check reads two; path-building code in any
  other shape is caught only by the suites that resolve it — as whole `twilight-burokrat:test` did
  for the one-segment-per-line climbs.
- **The `twilight-burokrat-release` environment's settings** were taken from the planning notes, not
  read from GitHub.
- **The real dispatch base.** Section 9.1's `fill=real` ran against the rehearsal base; the planner
  reruns it.

## 10. Stop conditions

Each is false on the rehearsed tree.

1. Step 0a's hash differs from the slice note, or the tree is not clean; in slice 3, the index digest
   differs from the note, the working tree differs from the index, or anything is untracked. Stop.
2. A patch's `git apply --check` fails, or `s2-move`, `s3-edit` or `s3-pin` prints `sub: … holds N
of […], expected M` or fails a `test`. Stop: the base is not the one this packet was cut for.
3. A red checkpoint is green, or a green one is red, or a count differs from step 1's number by
   anything but the slice's own additions. Stop.
4. `s2-check` finds a file that differs other than `cli/tsconfig.json`, or a path on one side only.
   Stop.
5. A legacy pin's received digest is not the one the step names (`551e2a7d…` in slice 1,
   `c0a77f33…` in slice 3). Stop: another change moved a legacy context; the planner re-pins.
6. A fault's expectation block fails: a named case passes, fails on another fact, or a `-off` twin
   does other than section 8 records. Restore is automatic; rerun that one fault once; if it still differs, stop.
7. `fault.sh` fails after its command ran (a `cmp` differs or a created file remains). Stop and do
   not continue with a touched tree.
8. `insert-proofs.pl` dies (`anchor matches N lines`), or a placeholder is left. Stop.
9. The retired-root red count is not 115, or the green check lists any current line. Stop.
10. Prettier rewrites a file not on the slice's list, or the hand-over `diff` prints anything. Stop.
11. **Known, not this packet's:** a single `this test timed out after 5000ms` in a Twilight Burokrat
    file on a loaded host (the base run lost two that way), or `claims.db.test.ts` › `bounds terminal
lock contention and retries until a held write commits` (batch 6 addendum, point 7). Record it,
    rerun **that file alone once**, and stop only if it fails again.
12. Anything asks for a `git` state change in the clone, a network call, or `--no-verify`. Stop.

## 11. Out of lane

- `package.json`, `bun.lock` and every WBS source: 140.1's lane and not this packet's.
- `docs/wiki-policy/policy.json` and `modules.json`: the pilot, which names nothing under the moved
  root.
- `bin/tool-wiki-*.sh`, `lefthook.yml`, `.github/workflows/ci.yml`, `trusted-wiki.yml` and
  `infra/ci/burokrat/`: they name the project and the launcher, never the path.
- Every file under `docs/superpowers` but the one routed link, every archived change and every
  `verify.md` but this change's own.
- The name exception's value and the Nx project name: section 13, D1.

## 12. Hand-over

After this packet:

- **The relocation activation is operator work.** Before `trusted-wiki` certifies the moved tree, an
  operator runs the activation runbook's "Relocation" for the merged head: review record,
  `prepare-relocation-activation-cli.ts` (its default `--validator-entry` now names the moved
  `cli/src/cli.ts`), the release, the three variables. Nothing is provisioned today, so no admission
  outcome changes now; the first activation after the merge must be prepared from a head that
  contains it.
- **The Nx name** `twilight-burokrat` stays through a name exception (section 13, D1).
- **Stale text the move did not cause**: `authority-store.ts`'s JSDoc link
  `../../../docs/adr/0021-…` already pointed outside the repository's `docs/`; `check.ts`'s
  `trust.ts:1480` line number was already wrong and is now a file reference; the moved
  `eslint.product.mjs`'s JSDoc still says "The wiki product … `wiki-cli`" (the product is Twilight
  Burokrat, the project `twilight-burokrat`).
- **Archiving and the retired-root check.** Archiving this change or any change the check lists moves
  no excuse: excuses are written in the unarchived form, and `unarchived` maps an archived path back
  (fault `g8`). The delta spec names no retired root, so the synced spec needs no excuse. A change
  that **edits** a listed file's mentions, or moves a listed file any way but archiving, must update
  `DATED_MENTIONS` or `HISTORICAL_TREES` in the same commit; both JSDoc blocks say so.
- **`git log --follow`** on `cli/tsconfig.lib.json` does not reach its pre-move history (section 3.4);
  read it at its old path, `git log -- apps/wiki/cli/tsconfig.lib.json`.
- **A second suite** is one entry in `APPLICATION_SUITES`; its products' policies are discovered
  and cached with no further change.

## 13. Planner decisions and assumptions

Decided by the planner on 2026-09-25, after review round 1:

**D1 — Nx project name: kept.** `twilight-burokrat` stays through the one-root name exception; a
rename to `twilight-burokrat-cli` is a separate item.

**D2 — `modules.bootstrap.json` changes: accepted.** Prefix, index path and `mappingVersion` v3 → v4
follow the selector; the planning note that called the file history was wrong.

**D3 — no red commit reaches `main`.** Slice 2 is an execution step that ends without a commit; the
planner stages it and slices 2 and 3 are committed together, through `planner-commit.sh` with whole
devsync. Git follows the renames by similarity (section 3.4).

Assumptions:

1. Historical records are packets, plans and specs under `docs/superpowers`, archived changes, every
   `verify.md`, finished tasks, proposals and designs that describe what was done, and dated
   `Proof:` comments. Unfinished tasks and normative specs are current.
2. The one `docs/superpowers` edit (a routed link) is navigation, not evidence.
3. The operational freeze that once deferred this move was never performed (section 4); Dany's
   2026-09-23 decision supersedes the deferral in `twilight-burokrat-package/design.md`, whose
   rename map stays as the record it is.
4. `APPLICATION_SUITES` lives in `workspace-projects.mjs` beside the rule it changes, and
   `product-policies.mjs` imports it; one list, no second copy.
5. The retired-root check is standing, not a one-off: the next packet that copies a command from an
   old plan meets it.

## 14. The brief, point by point

| Point                                                                                                                                                                                                            | Where                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| measure every reference: Nx roots and names, `project.json`, tsconfig, globs, lefthook, CI, policy JSON, devsync inventory and pins, `files`/`bin`/build outputs, release workflow and environment, `LLM_README` | section 3.1 (by area, with counts, and the three kinds the text cannot see), section 4, section 3.8                                                               |
| historical packets stay as written                                                                                                                                                                               | sections 1, 3.2; the check's historical trees                                                                                                                     |
| npm name and Nx names unchanged unless a reason is shown                                                                                                                                                         | section 3.2; D1                                                                                                                                                   |
| a pure `git mv` commit first, if the checks allow                                                                                                                                                                | section 3.4: the hook refused the pure move; the move plus one line is slice 2, committed with slice 3 (D3); the renames and the one unpaired file are recorded   |
| OpenSpec decided and justified                                                                                                                                                                                   | section 3.5                                                                                                                                                       |
| ordered slices, one planner commit each with its subject                                                                                                                                                         | section 6: slice 1 one commit, slices 2 and 3 one commit (D3)                                                                                                     |
| a proof that no path was missed, load-bearing, clause by clause                                                                                                                                                  | sections 3.6, 8.2 (`g1`–`g9` and their `-off` twins); slice 2's `s2-check`                                                                                        |
| HEAD-reading checks are the planner's, with expected values                                                                                                                                                      | section 9.4                                                                                                                                                       |
| a three-mode extraction                                                                                                                                                                                          | section 9.1                                                                                                                                                       |
| script or diff, chosen and justified                                                                                                                                                                             | section 3.7                                                                                                                                                       |
| every slice rehearsed, red, green, faults, exact output                                                                                                                                                          | sections 6, 8, 9.3                                                                                                                                                |
| batch 7 addendum 1 (executor environment, serial Vitest, `--skip-nx-cache`)                                                                                                                                      | section 6: every `bun` and `bunx` runs under `env -u CLAUDECODE -u AGENT`; no Vitest in this packet                                                               |
| 2 (each clause its own negative)                                                                                                                                                                                 | sections 8.1, 8.2                                                                                                                                                 |
| 3 (index checks are the planner's)                                                                                                                                                                               | section 9.4                                                                                                                                                       |
| 4 (extraction with `>`)                                                                                                                                                                                          | step 0b and section 9.1 (`printf "" > f`)                                                                                                                         |
| 5 (dates and placeholders)                                                                                                                                                                                       | `<observed-date>` in section 8.3, `<observed-date-s3>` in `s3-edit`; `fill=1`                                                                                     |
| 7 (the suite move)                                                                                                                                                                                               | the whole packet                                                                                                                                                  |
| 8 (stand-in base)                                                                                                                                                                                                | header, section 9.1: rehearsed on `main` at `e93a564a0` (the planner's rebase), revision 1 on `ad0451da9`                                                         |
| batch 6 addendum 5 (HEAD-reading tests), 9 (form), 11 (one-command `test $?`), 12 (chains stop), 13 (module index), 14 (`./` paths), 19 (grep on missing files)                                                  | sections 6, 9.4; every `bun test` names `./src/…`; every grep of a file follows a `test -f` or reads captured output; the moved module index declares nothing new |
| public repository: no absolute paths but the dispatch block                                                                                                                                                      | section 6.5 holds the only ones                                                                                                                                   |

## 15. Ready to commit

| Commit | Paths                                                                                                                          | Subject                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1      | slice 1: 13 — section 5 (8 modified, 5 new under the change)                                                                   | `feat(devsync): read apps/<suite>/<product>/<project> for a declared suite`                             |
| 2      | slice 2's staged move (N renamed, rehearsed 127) and its two records, plus slice 3's 52 (51 modified, 1 new) — one commit (D3) | `refactor(burokrat): move Twilight Burokrat into the Twilight Structure suite, every reference with it` |

After the last commit the host gate runs on the shared build host with the committed hash, and its
printed running-hash line and exit status are recorded. Anywhere else it is reported as not run, with
the reason — never as passed.

## 16. Review round 1, disposed

| Finding or decision                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 — keep the Nx name                                  | Kept: section 13; the name exception is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D2 — `modules.bootstrap.json` changes                  | Kept as written: section 3.2; the planning note is corrected there.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D3 — no red commit on `main`                           | Slice 2 ends without a commit, the planner stages it, slice 3 starts from the staged move (its own step 0 checks the index digest), and slices 2 and 3 are one commit through `planner-commit.sh` with whole devsync: sections 1, 3.4, 5, 6, 6.5, 9.1, 9.4, 15. The rehearsal records 126 renames in the combined commit and the one file Git no longer pairs, `cli/tsconfig.lib.json` (section 3.4). Two HEAD-reading pilot checks and `r5`'s clean run move to the planner (sections 6, 8.2, 9.4).        |
| Important 1 — unfilled placeholders                    | Every value is observed on the revision 2 rehearsal on `e93a564a0`: sections 3.4, 9.1, 9.3, 9.4.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Important 2 — the check breaks on archiving            | Excuses name changes, not archive paths: `unarchived` maps `openspec/changes/archive/<date>-<name>/…` back, the archive tree comes last, `verify.md` matches archived or not, and the delta spec names only "the retired root". Proved by `g8` (archived listed change stays green) and its twin `g8-off`; the obligation left (edits to listed files) is in both JSDoc blocks and section 12. Building `g8` exposed an unstaged-move crash (`ENOENT` on a deleted tracked path), fixed and proved by `g9`. |
| Important 3 — slice 2 checks without writing           | Slice 2 step 3 runs `prettier --write` then `--check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Minor 1 — Proof count                                  | Sections 1 and 7.7 say six, name them, and exempt re-observed proofs.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Minor 2 — echo and `g7`                                | The echo reads "every fault met its expected outcome, and every clause-off twin showed its clause alone decides it"; sections 3.6 and 8.2 say what `g2-off`, `g7-off` and `g8-off` isolate.                                                                                                                                                                                                                                                                                                                 |
| Minor 3 — `bunx` unwrapped                             | Every `bunx` and every Prettier call runs under `env -u CLAUDECODE -u AGENT`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Minor 4 — `group !== 'apps'` and the second suite list | Reachable, so kept and proved: new case `reads a libs directory named like a suite as a product`, fault `p3`. The product-axis test imports `APPLICATION_SUITES`.                                                                                                                                                                                                                                                                                                                                           |
| Minor 5 — the base's numbers                           | Sections 4, 9.2 and 9.4 name `e93a564a0`'s numbers (OpenSpec 115 → 116, devsync 372 → 379 → 382).                                                                                                                                                                                                                                                                                                                                                                                                           |
| Minor 6 — stale `eslint.product.mjs` JSDoc             | Listed in section 12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Rebase                                                 | Rehearsed as `rehearse/suite-move-r2` on `e93a564a0` with its own frozen install; section 9.1's base is `e93a564a0`.                                                                                                                                                                                                                                                                                                                                                                                        |

## 17. Review round 2, disposed

| Finding                              | Disposition                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocking 1 — planning gate           | Added the exact `legacy-root` entry in a separate planner-owned commit on this plan branch. The rehearsal cherry-picks it with the packet; whole staged devsync reached 379·0 after slice 1 and 382·0 after the combined commit.      |
| Blocking 2 — fault restoration       | Replaced `fault.sh`'s tail with reverse application, saved-byte copy-back and comparison, created-file absence, and a required green rerun. All 35 r3 faults print `restored and green`.                                              |
| Blocking 3 — `r5` proof timing       | Moved `r5` and `planner-selector` after the combined commit, left 17 executor Proofs, and made §9.1 insert the planner Proof using each mode's date. The planner requires 4·0 → 3·1 (named case only) → 4·0 and amends with hooks on. |
| Blocking 4 — success message         | Slice 3 step 6 now requires the sentence printed by §8.2's expectation block.                                                                                                                                                         |
| PARTLY Minor 2 — clause-off evidence | Retained the exact expected outcomes for `g2-off` and `g7-off`, including their failures, and the `g7` isolation note; the step 6 message now matches the actual echo.                                                                |
| Dispatch driver                      | Uses the launcher's default Codex driver with `EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium` in a workspace-write sandbox.                                                                                                                 |
