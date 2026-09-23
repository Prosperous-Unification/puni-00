# 050.7 e2a — hot module replacement closed by amendment: document replacement stated, gated replacement deferred

|             |                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — closes the HMR half of OpenSpec task 5                                                                                  |
| Size class  | S — one executor slice: a delta-spec amendment, three planning-document edits, one characterisation test with five negatives                                                                                       |
| Predecessor | [050.7 e2, held](050-7-e2-hmr-ownership.md) (four review rounds, three reproduced races, two abandoned mechanisms); [050.7e](050-7-e-page-lifecycle.md), merged: the `pagehide`/`pageshow` retirement it relies on |
| Decision    | Dany, 2026-09-23: take the **amendment** path of the held record's section 1, not a gated in-document replacement mechanism                                                                                        |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. This packet checks task 5 and adds no change directory                                                                                             |

## 1. Goal, decision, non-goals

**Goal.** Make the contract say what the code does. Today an edit to
`apps/wbs/fe-01/src/runtime/application-bootstrap.tsx` (or anything above it that no module accepts)
reloads the whole page. The held record established, in four review rounds, that this reload cannot
pass the spec's "A failed or expired retirement refuses the replacement" gate, and that the map's
sentence "Vite HMR disposal uses the same terminal retirement gate" promises something no code does.
Dany decided on 2026-09-23 to amend the contract rather than build the gate. This packet:

1. adds one requirement to the delta spec that names **document replacement** (a full reload: the
   old document's `pagehide` starts retirement, nobody waits for it, nothing refuses the reload, and
   the new document bootstraps regardless) and states that **gated in-document replacement** is not
   provided until a mechanism meets the existing refusal requirement;
2. scopes that refusal requirement to replacements inside one document, and removes "hot-reload
   disposal" from the list of close triggers, because no such trigger exists;
3. amends the lifetime map and the slot design record with the same distinction;
4. adds **one** test that proves the one guarantee a document replacement still has — retirement
   has started, synchronously, before the `pagehide` dispatch returns — with five production-path
   negatives;
5. checks task 5, appends a `verify.md` entry, and marks the held record closed by amendment,
   keeping its adversarial history for whoever builds the gated mechanism later.

**Non-goals.**

- **No production code.** `application-bootstrap.tsx`, `lifetime-slot.ts`,
  `preferences.resource.ts` and every other source file are read and mutated only for negatives, and
  restored byte-for-byte. `application-bootstrap.tsx`'s JSDoc (lines 96–102) already says the module
  has no `import.meta.hot` handling and points at 050.7e for what a later HMR packet must design; that
  stays true under the amendment and is not edited.
- **No gated in-document replacement**, no `import.meta.hot` registration, no ownership token. The
  held record's section 4 is the reason.
- **No browser probe.** The held record's section 5 explains why its round-3 probe was dropped; the
  guarantee this packet proves is observable without a browser (section 3.3).
- **No `CONTEXT.md` entry.** None of the frontend lifetime vocabulary (retirement, withdrawal, slot,
  page hide) lives in `CONTEXT.md` today; the lifetime map is where these terms are defined, and the
  two new ones go there with the rest (assumption 1, section 12).

## 2. Read first

| File                                                                                    | Why                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                            | Rules R1–R5 and the routing index.                                                                                 |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                   | "Execution contract" and "Standard blocks every packet uses": the strict OpenSpec block and the patch-save form.   |
| [050.7 e2, held](050-7-e2-hmr-ownership.md)                                             | Sections 1 and 3: the two options and why a full reload is not the gate. This packet closes it.                    |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`      | The requirements the amendment edits (lines 38–44 and 57–64) and extends.                                          |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`                                  | `startRetirement` (303–314), `onPageHide` (316–322), the listener registration (351). Read only.                   |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                           | `accept` (383–393: synchronous withdrawal) and `transition` (307–320: disposal begins before the first real wait). |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`                             | The `the page-lifecycle retirement trigger` block, where the new test goes.                                        |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`              | "Application owner" and test 2 of "Exact lifecycle tests", both amended here.                                      |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md` task 5, `verify.md`'s 050.7e parts | What is being checked, and the entry shape this slice appends.                                                     |

## 3. Verified facts

All read or run on 2026-09-23 against `474be8df` (main `0ad6f109` plus planning documents).

### 3.1 What a `pagehide` does today, before its dispatch returns

- `application-bootstrap.tsx:316-322`: `onPageHide` calls `invalidateRoot()` and then
  `startRetirement()`, both synchronously. `startRetirement` (`:303-314`) calls
  `dependencies.slot.retire()` and attaches only a `.catch`; nothing awaits it.
- `lifetime-slot.ts:383-393`, `accept()`: runs synchronously inside `retire()` and publishes
  `{ status: 'retiring' }` before `retire()` returns its promise.
- `lifetime-slot.ts:307-320`, `transition()`: with no transition already running (`ahead === null`),
  the async body runs synchronously up to `await disposeWithdrawn()`, and `disposeWithdrawn`
  (`:295-304`) calls `disposing.close({ timeoutMs: budgetMs })` before its own first `await`. So
  when the page is live and idle, the runtime's disposal has **begun** by the time the dispatch
  returns. When a transition is already running, disposal waits for it — the new test deliberately
  uses an idle live page, and the spec scenario says so.
- `preferences.resource.ts:78`: `if (!isLive()) throw new Error(WITHDRAWN);`, and production wires
  `isLive` to `applicationSlot.snapshot().status === 'live'` (`application-runtime.ts:160`). A
  preference access through a handle the withdrawn runtime published therefore throws from the
  moment `accept()` has run.
- `application-bootstrap.tsx:351`: the only `pagehide` registration.

### 3.2 Why a development edit is a document replacement

No module in `apps/wbs/fe-01/src` registers hot-update acceptance: `grep -rn "import.meta.hot"
apps/wbs/fe-01/src` prints exactly one line, `application-bootstrap.tsx:98`, which is JSDoc text
saying the module has no such dependency. The held record's section 3.1 traces Vite's own
`propagateUpdate` from an unaccepted edit to `full-reload`. This packet adds nothing to that
evidence and does not re-derive it; the second spec scenario (section 7.1) rests on it, and no
automated check keeps it true (section 9.4).

### 3.3 What 050.7e's tests already prove — measured, not assumed

Each fault was injected into the unchanged tree, the named suite run from `apps/wbs/fe-01`, and the
file restored and `cmp`-verified. "Bootstrap files" is `application-bootstrap.test.tsx`,
`application-bootstrap.model.test.tsx` and `application-bootstrap.strictmode.test.tsx` (19 tests
green before); "runtime" is `src/runtime/` (7 files, 71 tests green before).

| Fault injected                                                                        | Existing suite, observed                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pagehide` registration (`application-bootstrap.tsx:351`) removed                     | Bootstrap files: 12 failed, among them `retires the runtime and invalidates the root when pagehide fires (persisted=false, a flag this trigger never reads)` (`application-bootstrap.test.tsx:347-370`) and the model property. **Listener presence is already proved.**           |
| `startRetirement();` (`:321`) → `setTimeout(startRetirement, 0);`                     | Bootstrap files: 2 failed: the model property (`a runtime live before a pagehide trigger was still the one live at the end`, seed `20260924`) and `… refused when that retirement times out …` on `expected 'fatal' to be 'retiring'` — a 20 ms budget racing `waitFor`'s polling. |
| `startRetirement();` → `queueMicrotask(startRetirement);`                             | Runtime: 1 failed: the same timeout test, by the same timing accident.                                                                                                                                                                                                             |
| `invalidateRoot();` (`:320`) → `queueMicrotask(invalidateRoot);`                      | Runtime: 1 failed: `a persisted pageshow rebuilds into a genuinely fresh root …`.                                                                                                                                                                                                  |
| a macrotask wait inserted before `lifetime-slot.ts:320`'s `await disposeWithdrawn();` | Runtime: 8 failed — the bootstrap model property, the slot model property and six `application-services-context.test.tsx` cases; none names the `pagehide` path.                                                                                                                   |

**Conclusion.** Packet e proves that `pagehide` starts retirement at all. It does **not** prove the
property the amendment rests on — that retirement has started _before the dispatch returns_ — except
by accident: every existing test waits with `waitFor` or a macrotask before looking, and the two
deferral faults are caught only by a timing race and a property whose end-of-run drain happens to
exclude macrotasks. Hence one new test (section 7.6) that reads everything synchronously after the
dispatch, and whose five negatives each fail it at the assertion for the guarantee they break
(section 8).

### 3.4 The existing requirements the amendment touches

- `spec.md:38-44`, "One retirement per runtime, ordered by lifetime", lists "page hide and hot-reload
  disposal" as close triggers. There is no hot-reload disposal trigger in the code and, under the
  amendment, none is promised; the edit removes it and says a reload retires through page hide.
- `spec.md:57-64`, "A failed or expired retirement refuses the replacement", is unconditional. Read
  against a reload it is unsatisfiable (held record, section 3). The edit appends a scoping sentence:
  it governs every replacement inside one document, including any future gated one, and document
  replacement is governed by the new requirement. Nothing in the refusal requirement's four
  scenarios changes.
- `spec.md:184-202`, "A restored page rebuilds only after retirement succeeds": a persisted
  restoration is the **same** document, so it stays under the refusal requirement unchanged. The new
  requirement's scenario is phrased for a `pagehide` that does not persist the page, which is what a
  reload dispatches.
- `proposal.md` never mentions HMR or reload handling beyond a local-exit note (line 39); it is not
  edited.
- The slot design record names "hot-reload disposal" once, in its events table
  (`050-7-lifetime-slot-design.md:53`).
- The lifetime map names HMR at lines 59, 66, 78 and 142 (test 2).

## 4. The amended contract, in one table

| Under a document replacement (a reload)                                                   | Status                                                                 | Kept by                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| The React root is taken down before the `pagehide` dispatch returns                       | Guaranteed                                                             | The new test; fault N3                                                  |
| Publication is withdrawn before the dispatch returns                                      | Guaranteed                                                             | The new test; faults N1, N2                                             |
| Disposal has begun before the dispatch returns (page live and idle)                       | Guaranteed                                                             | The new test; fault N4                                                  |
| A preference access through a handle the old runtime published throws                     | Guaranteed                                                             | The new test; fault N5                                                  |
| The dispatch waits for the disposal                                                       | **Not provided.** A listener's return value is ignored by the platform | Stated; no fault can make it true, so no negative exists (section 9.4)  |
| Completion of the disposal is observed; a failure is reported                             | **Not provided** once the old document is gone                         | Stated                                                                  |
| A failed or expired retirement refuses the reload                                         | **Not provided**                                                       | Stated; the refusal requirement is scoped away from this case           |
| A terminal refusal crosses into the new document                                          | **Not provided**; the new document bootstraps regardless               | Stated                                                                  |
| Gated in-document replacement (bootstrap replaced inside the live document, after retire) | **Not provided** until a mechanism meets the refusal requirement       | The requirement's last sentence; the held record's races are its checks |

## 5. File plan

| Path                                                                               | Change                                                                        | Section |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | modify: two edited requirements, one added requirement with two scenarios     | 7.1     |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`         | modify: application owner paragraph, one hazard, the coordinator list, test 2 | 7.2     |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md`          | modify: one events-table row                                                  | 7.3     |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | modify: task 5 checked, with the dated closing note                           | 7.4     |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md`              | modify: title, header table, section 1's decision paragraph                   | 7.5     |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`                        | modify: one new test; afterwards, five `Proof:` comments                      | 7.6, 8  |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | modify: this slice's own appended entry                                       | 6       |

Seven paths, all modified, none created. No file enters a module directory, so no `module-index`
change. `docs/findings/current-document-check-exemptions.json` is **not** touched: its `legacy-root`
excuse covers pre-namespacing library roots, which nothing here cites, and every relative link this packet and
its diffs add resolves (`../2026-09-21-batch-6/050-7-e2-hmr-ownership.md` from the map; this
document's own basename from the held record, once the planner has committed it).

## 6. Slice 1 — the amendment, its test, and its negatives

One executor attempt. It ends with a hand-over; the planner reviews and commits.

### Step 0 — from the repository root

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

Expected: `base=` one 40-character hash equal to the slice note's, and an **empty**
`status-before.txt`. The launcher cuts a fresh checkout at the reviewed base, so anything
uncommitted here means the attempt is not starting where it was reviewed.

Baselines, each with its status kept:

```sh
set -euo pipefail
cd apps/wbs/fe-01
if bunx vitest run src/runtime/ > "$TMPDIR/evidence/base-runtime.log" 2>&1
then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/base-runtime.log"
if bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts \
  --exclude src/components/wbs/short-date.test.ts > "$TMPDIR/evidence/base-sandbox.log" 2>&1
then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/base-sandbox.log"
grep -E "Test Files|Tests |^status=" "$TMPDIR/evidence"/base-runtime.log "$TMPDIR/evidence"/base-sandbox.log
```

Expected: `status=0` twice. **Record both file and test counts.** Rehearsed on `474be8df`:
`7 files`, `71 tests` for the runtime directory. The sandbox node tier was rehearsed only after the
diffs (`46 files`, `674 tests`); the slice compares against its own step-0 number, whatever it is.

```sh
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-base.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -c '.summary.totals' "$report"
```

Expected: exits 0 and prints one totals object. **Record `passed`.** Rehearsed:
`{"items":114,"passed":114,"failed":0}`.

The executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:e2e` or
`tool-devsync:test`; section 9.3 names them for the planner.

### Steps

- [ ] 1. Step 0 above.
- [ ] 2. **Extract and apply the six diffs of section 7, in order.** `git apply` without `--index`
      or `--cached` writes only the working tree, which the contract allows; the check and the apply
      are separate commands so a failed check stops the shell.

  ````sh
  set -euo pipefail
  packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-e2a-hmr-amendment.md
  patches=$(mktemp -d "${TMPDIR:?}/e2a-patches-XXXXXX")
  awk -v out="$patches" '
    /^## 7\. The diffs$/ { inside=1; next }
    /^## 8\. Proofs$/    { inside=0 }
    inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print >> f }
  ' "$packet"
  count=$(ls "$patches" | wc -l)
  echo "extracted=$count"
  test "$count" -eq 6
  for p in "$patches"/0[1-6].diff; do
    git apply --check "$p"
    git apply "$p"
  done
  echo "all patches applied"
  ````

  Expected: `extracted=6`, then `all patches applied`. Any `error:` line is stop condition 3. If
  the sandbox's command guard refuses `git apply` itself (not a failed check), run the same loop with
  `patch -p1 --forward --dry-run -i "$p"` then `patch -p1 --forward -i "$p"` in place of the two
  `git apply` lines, and record which tool applied the diffs. The author applied all six both ways
  against `474be8df` and got byte-identical files.

- [ ] 3. **The contract validates.** Rerun the strict OpenSpec block of step 0. Expected: exits 0,
      `passed` equal to step 0's number — the total counts changes and specs, not requirements.
- [ ] 4. **Green.** Rerun both step-0 Vitest commands with the same wrappers, into
      `after-runtime.log` and `after-sandbox.log`. Expected: `status=0`; the runtime directory at
      step 0's files and step 0's tests **+ 1** (rehearsed `7 files`, `72 tests`); the sandbox node
      tier **exactly** step 0's counts (rehearsed `46 files`, `674 tests`) — the test file is a jsdom
      suite, not in `vitest.node-suites.ts`. This test is green on unchanged production code by
      design: it characterises what `pagehide` already does. Its teeth are the negatives in step 6,
      not a red checkpoint.
- [ ] 5. **Durable typecheck and lint.**

  ```sh
  set -euo pipefail
  if NX_DAEMON=false bunx nx run wbs-fe-01:typecheck > "$TMPDIR/evidence/typecheck.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/typecheck.log"
  if NX_DAEMON=false bunx nx run wbs-fe-01:lint > "$TMPDIR/evidence/lint.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/lint.log"
  grep -E "^status=" "$TMPDIR/evidence"/typecheck.log "$TMPDIR/evidence"/lint.log
  ```

  Expected: `status=0` in both (rehearsed: both exit 0 with the test applied). An autofixable
  import-order or Prettier lint error is fixed with `bunx eslint --fix <file>` (preamble rule 17).

- [ ] 6. **The five negatives of section 8**, one at a time, each restored and `cmp`-verified before
      the next. Then add the five `Proof:` comments exactly where section 8 says, dated with the
      date **the executor observed** each failure, and rerun the new test alone:
      `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx -t 'starts retirement before its pagehide dispatch returns')`.
      Expected: exactly one test passed and none failed; the rest of the file is reported skipped
      (rehearsed: `Tests 1 passed | 17 skipped (18)`).
- [ ] 7. **Append this slice's entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`**, as
      a new `## Packet 050.7e2a — document replacement amendment` section after the last existing
      one, with `### Negative-proof observations` and `### Slice verification` subsections in the
      shape of the 050.7e entries above it. Its own observations only: step 0's baselines as numbers;
      the extraction output; each command's status and counts; the five faults, each with the message
      it failed on; and, under slice verification, "Task 5 is checked: hot-reload disposal is closed
      by amendment (Dany, 2026-09-23) — a development edit to the bootstrap is a document
      replacement, and a gated in-document replacement is not provided", followed by the list of what
      stays **pending planner verification** (section 9.3). Evidence references are basenames
      relative to this attempt's evidence directory, never absolute paths.
- [ ] 8. **Formatting, after the last edit.** Owned-file Prettier over all seven paths, `--write`
      then `--check`:

  ```sh
  set -euo pipefail
  owned="openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
  docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
  docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md
  openspec/changes/adopt-frontend-lifetimes/tasks.md
  docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md
  apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
  openspec/changes/adopt-frontend-lifetimes/verify.md"
  GSETTINGS_BACKEND=memory bunx prettier --write $owned > "$TMPDIR/evidence/prettier-write.log" 2>&1
  GSETTINGS_BACKEND=memory bunx prettier --check $owned > "$TMPDIR/evidence/prettier-check.log" 2>&1
  if NX_DAEMON=false bunx nx format:check --all > "$TMPDIR/evidence/format-check.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/format-check.log"
  tail -2 "$TMPDIR/evidence/prettier-check.log" "$TMPDIR/evidence/format-check.log"
  ```

  Expected: the check prints `All matched files use Prettier code style!` and `status=0`. Rehearsed:
  every diff in section 7 is already in its post-Prettier form (`prettier --check` passed on all six
  rehearsed files; the held record's re-padded header table is part of its diff).

- [ ] 9. Rerun the strict OpenSpec block once more, **after** the `verify.md` edit, so the document
      just changed is what was validated. Expected: exits 0, `passed` equal to step 0's.
- [ ] 10. **Hand over.**

  ```sh
  set -euo pipefail
  git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-after.txt"
  ```

  Expected: exactly the seven paths of section 5, each as ` M`, and nothing else. Step 0 required an
  empty status, so every line here is this slice's own.

Planner commit subject: `test(wbs-fe-01): state document replacement and prove its pagehide retirement starts`.

### Dispatch

The launcher takes the packet basename, the slice label and the base commit. This block holds the
only absolute path in this document.

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-e2a-hmr-amendment 1 <base> --batch batch-6 --batch-dir docs/superpowers/plans/2026-09-21-batch-6 --slice-note 'reviewed base <base>' --preserve evidence
```

`<base>` is the reviewed commit that contains this document. No `--seed`: nothing reads earlier
attempts' evidence. No `--network`: nothing reaches a host. `--slice-note` is how step 0 learns the
reviewed SHA from outside the clone; without it step 0 cannot pass.

## 7. The diffs

Six unified diffs against `474be8df`, applied in this order by step 2. Each is the post-Prettier
form.

### 7.1 `spec.md` — the scoping edits and the new requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 9c22737f..0fd51628 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -38,8 +38,9 @@ from delivery.
 ### Requirement: One retirement per runtime, ordered by lifetime

 Every close trigger for one current runtime - route unmount, selection change,
-identity change, local exit, page hide and hot-reload disposal - SHALL join one
-retirement of that runtime. Publication SHALL be withdrawn before disposal
+identity change, local exit and page hide - SHALL join one retirement of that
+runtime. A development edit that reloads the document retires the page through
+its page hide, not through a trigger of its own. Publication SHALL be withdrawn before disposal
 starts. A project's retirement SHALL begin before its session's, and the
 application's SHALL begin only after both have been started and joined.

@@ -61,7 +62,10 @@ owner SHALL refuse the transition: it SHALL NOT build or publish the
 replacement, SHALL NOT republish the withdrawn services, and SHALL publish a
 fatal state carrying only the sanitized public failure report and its occurrence
 handle. The owner SHALL keep observing the disposal that is still running, and
-its eventual completion SHALL NOT publish the refused replacement.
+its eventual completion SHALL NOT publish the refused replacement. This governs
+every replacement inside one document, including any future gated in-document
+replacement of the bootstrap module; a document replacement cannot refuse and is
+governed by the requirement that names it.

 #### Scenario: A disposer rejects during a replacement

@@ -200,3 +204,35 @@ fails, no bootstrap SHALL be attempted and the fatal state SHALL be shown.

 - **WHEN** the joined retirement rejects or outruns its wait
 - **THEN** no bootstrap is attempted and the fatal state is shown
+
+### Requirement: A document replacement starts retirement and promises nothing after it
+
+When a development edit reaches the bootstrap module, or a module above it that
+no hot-update boundary accepts, fe-01 SHALL be replaced by a full reload of the
+document - a document replacement - and SHALL NOT be updated in place. Before
+the old document's pagehide dispatch returns, its bootstrap SHALL have taken down
+the React root, withdrawn the application runtime's publication, so that every
+preference access through a handle that runtime published throws, and begun that
+runtime's disposal, or queued it behind a transition that is already running. The
+old document SHALL NOT wait for the disposal, and fe-01 SHALL NOT claim that it
+completed, that its failure was observed, or that its failure refused anything:
+the new document's bootstrap runs regardless, and no terminal refusal crosses from
+the old document to the new one. A gated
+in-document replacement, which holds a replacement module's bootstrap behind the
+old runtime's retirement inside one live document, SHALL NOT be provided until a
+mechanism for it meets "A failed or expired retirement refuses the replacement".
+
+#### Scenario: The old document starts retirement before its page hide returns
+
+- **WHEN** a live page with no transition running receives a pagehide that does
+  not persist it, as a reload's does, and its runtime's disposal does not settle
+- **THEN** by the time the dispatch returns the root has been taken down, the
+  runtime is withdrawn, its disposal has begun, and a preference write through a
+  handle it published throws, and the dispatch has not waited for the disposal
+
+#### Scenario: An edit to the bootstrap reloads the document
+
+- **WHEN** the bootstrap module, or a module above it with no accepting boundary,
+  changes while the development server is serving the page
+- **THEN** the page is reloaded as a new document, and no second bootstrap runs
+  inside the old one
```

### 7.2 The lifetime map

The first hunk splits the application-owner paragraph: its "Vite HMR disposal uses the same terminal
retirement gate" sentence goes, and a new paragraph defines the two terms.

```diff
diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index 885bbe7b..5de0713a 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -56,14 +56,16 @@ Presentational and ephemeral React state does not become a runtime service: pick

 `main.tsx` is the page composition boundary. It currently creates the React root and renders `App` inside `<StrictMode>`. Build the application runtime at bootstrap outside the StrictMode subtree, resolve its narrow public services, and place only those services in the application provider. A plain host-level lifetime coordinator owns the current application, session and project handles; it is bootstrap wiring, not a fourth runtime or a service exposed through context. React owners tell it when identity/selection changes, and every close trigger joins the same in-flight retirement operation.

-The accepted table says application closes on page hide, including a persisted `pagehide`. Therefore BFCache restoration is an implementation consequence, not a new product choice: page hide initiates project, then session, then application retirement and unmounts/invalidates the React root. A persisted `pageshow` joins that same retirement promise and invokes the complete bootstrap path only after it succeeds: build fresh runtimes/root/listeners, restore the signed-in identity through `fetchMe`, preserve the browser address, and let catalog/directory/feed perform their normal arrival reads. Retirement rejection or bounded-wait expiry publishes the sanitized fatal state and starts no bootstrap; eventual cleanup completion does not silently resume it. Non-persisted navigation does not rebuild. Vite HMR disposal uses the same terminal retirement gate before the replacement module performs ordinary bootstrap. Since a browser lifecycle event cannot be relied on to await a promise, `pagehide` provides best-effort initiation rather than proof of completion; controlled tests await the coordinator promise.
+The accepted table says application closes on page hide, including a persisted `pagehide`. Therefore BFCache restoration is an implementation consequence, not a new product choice: page hide initiates project, then session, then application retirement and unmounts/invalidates the React root. A persisted `pageshow` joins that same retirement promise and invokes the complete bootstrap path only after it succeeds: build fresh runtimes/root/listeners, restore the signed-in identity through `fetchMe`, preserve the browser address, and let catalog/directory/feed perform their normal arrival reads. Retirement rejection or bounded-wait expiry publishes the sanitized fatal state and starts no bootstrap; eventual cleanup completion does not silently resume it. Non-persisted navigation does not rebuild. Since a browser lifecycle event cannot be relied on to await a promise, `pagehide` provides best-effort initiation rather than proof of completion; controlled tests await the coordinator promise.
+
+A development edit that reaches the bootstrap is a **document replacement**, not a hot update: no module on the path to the page's entry accepts it, so Vite reloads the whole page. The old document's retirement is then initiated by its own `pagehide`, exactly as for any other navigation, and is not a gate: its completion is not observed, its failure cannot refuse the reload, and the new document bootstraps regardless. A **gated in-document replacement** — the replacement module bootstrapping inside the same live document only after the old runtime's retirement has succeeded, under the same terminal retirement gate as every other transition — is not provided. Whoever adds one inherits that gate and the races recorded in [the 050.7 e2 record](../2026-09-21-batch-6/050-7-e2-hmr-ownership.md). The OpenSpec change `adopt-frontend-lifetimes` states both as requirements.

 Hazards:

 - building the application runtime in a component or lazy React initializer makes development StrictMode construct it twice;
 - registering a resource by returning an object that happens to have `close()` does not dispose it; use DI Bag ownership explicitly;
 - calling bounded close and treating timeout as cancellation leaks the still-running cleanup from the owner's accounting;
-- HMR and page hide can race, so listener cleanup plus the coordinator's shared retirement promise must prevent a second graph from being created while the old owner still appears current;
+- a gated in-document replacement, if one is ever added, races page hide, so listener cleanup plus the coordinator's shared retirement promise must prevent a second graph from being created while the old owner still appears current;
 - rebuilding only the bag on BFCache `pageshow` leaves React contexts pointing to closed services. Re-run the whole bootstrap/root publication path;
 - the existing directory `visibilitychange`/focus arrival rereads and project reconnect behavior remain useful for ordinary tab backgrounding, which does not fire this terminal owner path.

@@ -75,7 +77,7 @@ Create/replace the session runtime on transitions of `session.user.id`, never on

 The existing `AccountMenu` “Log out” action is a **local exit** in 050.7. Today it only calls `setSession(null)`; no frontend caller invokes the declared `POST /api/auth/logout`, so neither the server refresh state nor cookie is authoritatively revoked and a reload may restore the same identity. Preserve that observable behavior in this scope rather than adding remote revocation implicitly.

-Local exit calls the host coordinator before clearing local state: the coordinator invalidates project publication, joins/closes the project, invalidates session publication, joins/closes the session, and only after successful retirement commits the local signed-out UI state. A retirement failure or timeout refuses that local transition and publishes the sanitized fatal/public-report state described below. It never republishes the withdrawn old project/session services, even though the still-valid remote cookie may authenticate a later full reload. Project selection effects likewise call the coordinator, so route unmount, switch, local exit, page hide and HMR converge on the same current handle and promise. This supplies the project-before-session control path that independent nested effect cleanup cannot guarantee. Authoritative logout is separate observable auth work and remains outside 050.7.
+Local exit calls the host coordinator before clearing local state: the coordinator invalidates project publication, joins/closes the project, invalidates session publication, joins/closes the session, and only after successful retirement commits the local signed-out UI state. A retirement failure or timeout refuses that local transition and publishes the sanitized fatal/public-report state described below. It never republishes the withdrawn old project/session services, even though the still-valid remote cookie may authenticate a later full reload. Project selection effects likewise call the coordinator, so route unmount, switch, local exit and page hide — which is also how a document replacement retires the page — converge on the same current handle and promise. This supplies the project-before-session control path that independent nested effect cleanup cannot guarantee. Authoritative logout is separate observable auth work and remains outside 050.7.

 Keep the router instance stable. `AppRouter` intentionally creates it once and refreshes its context because recreating it loses the current address. Router context may carry the narrow session delivery services required by lazy routes plus the existing presentational `account`, `presence`, and `nav`; it must no longer carry `token`, `ProjectApi`, `DirectoryApi`, or a bag once extraction is complete.

@@ -139,7 +141,7 @@ The finite close budget is a routine implementation choice, not a user decision
 These are focused production-wiring tests. Each safety assertion needs its R5 mutation and adjacent `Proof:` note when implemented.

 1. **Application bootstrap is outside StrictMode.** Render the real bootstrap composition with a recording application module under `<StrictMode>`. Assert one application runtime and one owned application resource are acquired, not two. Mutation: move runtime creation under the StrictMode component; observe acquisition count 2.
-2. **Application shutdown is shared across page hide and HMR.** Capture the registered `pagehide` and `import.meta.hot.dispose` callbacks, fire both in each order, await the recorded shutdown, and assert project → session → application disposal once and listener removal. Mutation: bypass the coordinator/create separate close paths; observe duplicate close initiation or reversed lifetime order. If Vite HMR cannot be exercised directly in Vitest, put registration behind the actual `main.tsx` bootstrap function and invoke that production function with a typed hot adapter.
+2. **Application shutdown under a document replacement is page hide's.** A development edit to the bootstrap reloads the document, so there is no `import.meta.hot.dispose` callback to capture: the old document's shutdown is its `pagehide`. Dispatch a non-persisted `pagehide` on a live page whose disposal is still pending and, before any await, assert the root is taken down, publication is withdrawn, disposal has begun and a preference write through a captured handle throws. Mutation: defer the retirement past the dispatch; the runtime is still published when the dispatch returns. A gated in-document replacement, if one is ever added, needs this test's original form — both callbacks fired in each order, one shutdown, listener removal — as well.
 3. **Persisted page restoration joins retirement before rebuilding.** Start at `/directory`, dispatch a persisted `pagehide`, leave one disposer deferred, then dispatch `pageshow` with `persisted: true`. Assert no application runtime, React root, listener, identity read or project/session service is rebuilt while retirement is pending. Settle retirement successfully and assert the complete bootstrap runs once, `fetchMe` restores the session, the browser address remains `/directory`, and directory performs its normal arrival read. Repeat from an open project and assert a fresh feed/socket rather than reuse of the closed feed. In rejection and budget-expiry variants, assert the sanitized fatal state, zero bootstrap attempts, and continued observation of late cleanup. Mutation: start bootstrap directly from `pageshow`; the replacement is observed before retirement settles. Mutation: rebuild only the bag without republishing the root; context still exposes the old service.
 4. **Application disposal failure is visible.** Make one owned disposer reject while another records completion. Assert shutdown rejects with the DI Bag cleanup failure, the other disposer still ran, and the sanitized lifecycle-failure reporter receives exactly one correlated occurrence. Mutation: swallow the close promise; the reporter receives nothing. Page-hide tests assert initiation/reporting, not browser waiting.
 5. **Session identity and the actual credential source.** Exercise both real installation paths: startup `fetchMe` installs the returned user with `token: ''`, and password login installs the declared session response. Assert both pass `user.id` as the coordinator key and the session credential only as adapter input. In the coordinator's focused contract test, feed declared sessions `u1/''`, `u1/'t'`, then `u2/''`: the same-ID input does not replace the runtime (there is no production event that emits it today), while the ID change closes the first session and exposes no `u1` directory/catalog snapshot. Compile/production wiring assertions enumerate consumers: `httpDirectoryApi` and `httpProjectApi` receive the session credential, while saved plans and WebSocket remain cookie-backed. Mutation: key the owner on token; the focused contract replaces `u1` and collides `u1`/`u2` on `''`, while the production-path assertions prove both token shapes reach that key function. Mutation: retain stores on ID change; `u1` state appears for `u2`.
```

### 7.3 The slot design record

```diff
diff --git a/docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md b/docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md
index 21cca1af..f6454fa4 100644
--- a/docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md
+++ b/docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md
@@ -50,7 +50,7 @@ Five, and `snapshot()` is correct the instant a request is accepted.
 | Event                                       | Where it comes from                                                    |
 | ------------------------------------------- | ---------------------------------------------------------------------- |
 | `replace(acquire)`                          | bootstrap (the first publication), identity change, selection change   |
-| `retire()`                                  | route unmount, local exit, page hide, hot-reload disposal              |
+| `retire()`                                  | route unmount, local exit, page hide (a document replacement's too)    |
 | retirement settles                          | DI Bag's `close()` resolving                                           |
 | retirement rejects                          | `DiBagCleanupError` — a disposer threw                                 |
 | retirement outruns its budget               | `DiBagCloseCancelledError` — the wait ended, the disposal did not      |
```

### 7.4 `tasks.md` — task 5

The decision date in the note is Dany's decision date, a fact, not an observation date.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index ef9a1533..6e10bc21 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -29,7 +29,7 @@
       synchronous `isLive` predicate over the existing `LifetimeSlot.snapshot()`; no
       change to `lifetime-slot.ts`) — see
       `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`.
-- [ ] 5. Page hide, hot-reload disposal and persisted restoration join one
+- [x] 5. Page hide, hot-reload disposal and persisted restoration join one
       application retirement; restoration rebuilds only after it succeeds.
       Page hide and persisted restoration are closed by 050-7-e: `pagehide`
       retires the runtime through the slot and invalidates the mounted React
@@ -38,11 +38,19 @@
       (the slot's own serialization is the join); a retirement that rejects
       or times out leaves the sanitized fatal page showing, redrawn without a
       second report across a hide-and-restore of an already-fatal page. Hot-
-      reload disposal is this packet's own explicit non-goal after three
-      review rounds each found a further HMR ownership race — see
+      reload disposal was 050-7-e's own explicit non-goal after three review
+      rounds each found a further HMR ownership race — see
       `docs/superpowers/plans/2026-09-21-batch-6/050-7-e-page-lifecycle.md`,
-      sections 1 and 11 — and is handed to 050-7-e2, which checks this box
-      once it lands. A bounded Chromium application-lifecycle case exists
+      sections 1 and 11. It is closed by amendment (Dany, 2026-09-23): an
+      edit that reaches the bootstrap is a document replacement, whose
+      retirement page hide starts before its dispatch returns and nobody
+      awaits, and a gated in-document replacement is not provided — the
+      requirement "A document replacement starts retirement and promises
+      nothing after it", landed by
+      `docs/superpowers/plans/2026-09-21-batch-6/050-7-e2a-hmr-amendment.md`.
+      The held record
+      `docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md`
+      keeps the races any gated mechanism must answer. A bounded Chromium application-lifecycle case exists
       (`e2e/lifetime-bfcache-probe.ts`, `lifetime-bfcache.spec.ts`) and was
       run through the real `wbs-fe-01:e2e` Nx target, `CI=1`, a checked-free
       port shift: one test, passing (section 4.7 has the exact command and
```

### 7.5 The held record

Only the title, the header table and section 1's second half change. Sections 2 to 9 — the reasons,
the three races and the two abandoned mechanisms — stay verbatim, and the new paragraph says they
describe the state before the amendment.

```diff
diff --git a/docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md b/docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md
index 065f4483..25342c71 100644
--- a/docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md
+++ b/docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md
@@ -1,11 +1,11 @@
-# 050.7 e2 — hot module replacement: held
+# 050.7 e2 — hot module replacement: closed by amendment

-|             |                                                                                                                                                                                                       |
-| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
-| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **sixth packet, held**                                                                                     |
-| Size class  | — a documentation record; no code, no test, no config change; no executor slice                                                                                                                       |
-| Predecessor | [050.7e](050-7-e-page-lifecycle.md), merged at `e9b7f83b`: page-hide/persisted-restoration retirement, root invalidation, the report/draw split, and section 11's hand-over naming three races        |
-| Status      | **Held.** In-document hot-module replacement of the bootstrap module is deferred. Task 5 stays unchecked. This record is committed by the planner as documentation; nothing is dispatched (section 9) |
+|             |                                                                                                                                                                                                                                                                                          |
+| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **sixth packet, closed by amendment**                                                                                                                                                         |
+| Size class  | — a documentation record; no code, no test, no config change; no executor slice                                                                                                                                                                                                          |
+| Predecessor | [050.7e](050-7-e-page-lifecycle.md), merged at `e9b7f83b`: page-hide/persisted-restoration retirement, root invalidation, the report/draw split, and section 11's hand-over naming three races                                                                                           |
+| Status      | **Closed by amendment (Dany, 2026-09-23).** A development edit to the bootstrap is a document replacement; gated in-document replacement is not provided. [050.7 e2a](050-7-e2a-hmr-amendment.md) lands the amendment and checks task 5. This record keeps the history (sections 3 to 5) |

 ## Revision note (round 4: held, not cut to "done")

@@ -27,23 +27,25 @@ wait for retirement to complete, does not observe whether it succeeded or failed
 a terminal refusal across the navigation — the new document's own fresh bootstrap runs regardless of
 how the old document's retirement ended (section 3).

-**Task 5 (`openspec/changes/adopt-frontend-lifetimes/tasks.md`) stays UNCHECKED.** Closing it requires
-one of two things, neither decided by this packet:
-
-1. **A gated in-document replacement** — an actual mechanism that awaits retirement and refuses
-   replacement on failure or timeout, the way `openspec/changes/adopt-frontend-lifetimes/specs/
-adopt-frontend-lifetimes/spec.md`'s own "A failed or expired retirement refuses the replacement"
-   requirement already demands for every other transition in this codebase. The three races and two
-   abandoned mechanisms three prior rounds reproduced (sections 4.1–4.2) are recorded here as this
-   mechanism's own adversarial history, for whoever attempts it next.
-2. **An amendment** to the existing OpenSpec change and the lifetime map, explicitly distinguishing
-   **document replacement** (today's real behaviour: a full reload, best-effort, no completion proof)
-   from **gated in-document replacement** (what the map's own "Vite HMR disposal uses the same
-   terminal retirement gate" sentence currently promises), stating the former's limits plainly, and
-   validating that amendment before any packet claims the obligation closed under it.
-
-Choosing between these is a decision for the planner or Dany, not something this packet decides or
-implements.
+**The decision (Dany, 2026-09-23): the amendment, not a gated mechanism.** Round 4 left two ways
+to close task 5 (`openspec/changes/adopt-frontend-lifetimes/tasks.md`):
+
+1. **A gated in-document replacement** — a mechanism that awaits retirement and refuses replacement
+   on failure or timeout, as the spec's "A failed or expired retirement refuses the replacement"
+   requirement demands for every other transition. **Not taken.** It stays not provided, and the
+   three races and two abandoned mechanisms of section 4 remain its adversarial history, for whoever
+   attempts it next.
+2. **An amendment** to the OpenSpec change and the lifetime map, distinguishing **document
+   replacement** (today's real behaviour: a full reload whose retirement `pagehide` starts and nobody
+   awaits) from **gated in-document replacement**, and stating the former's limits plainly.
+   **Taken.** [050.7 e2a](050-7-e2a-hmr-amendment.md) adds the requirement "A document replacement
+   starts retirement and promises nothing after it", scopes "A failed or expired retirement refuses
+   the replacement" to replacements inside one document, amends the map and the slot design, proves
+   the guarantee that remains with a test that fails under five injected faults, and checks task 5.
+
+Sections 2 to 9 below are round 4's text, unchanged. Where they say task 5 stays unchecked, or quote
+the map's "Vite HMR disposal uses the same terminal retirement gate" sentence, they describe the
+state before the amendment: the map no longer carries that sentence.

 ## 2. Read first

```

### 7.6 `application-bootstrap.test.tsx` — the one new test

Inserted directly after `retires the runtime and invalidates the root when pagehide fires …` inside
`describe('the page-lifecycle retirement trigger', …)`. It uses only helpers the file already has
(`recordingRoot`, `pageHideEvent`, `FakeApp`, `installApplicationRuntime`, `fakeBrowserStorage`,
`waitFor`). `isLive` is wired to the test's own slot, as `application-runtime.test.ts`'s
`once isLive is wired to a real slot` block does, so the withdrawal is the one production uses.
The close never settles on its own, so the synchronous reads cannot be satisfied by a disposal that
happened to finish; the test releases it at the end and waits for `empty` so nothing is left pending.

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
index c2cd4c7a..5b8cf2de 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
@@ -369,6 +369,67 @@ describe('the page-lifecycle retirement trigger', () => {
     },
   );

+  itDom(
+    'starts retirement before its pagehide dispatch returns, and never waits for the disposal to settle',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      let closeCalls = 0;
+      const closeRelease: { current: (() => void) | null } = { current: null };
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        const installed = installApplicationRuntime({
+          openStore: fakeBrowserStorage,
+          isLive: () => slot.snapshot().status === 'live',
+        });
+        return {
+          services: installed.services,
+          close: () => {
+            closeCalls += 1;
+            return new Promise<void>((resolve) => {
+              closeRelease.current = resolve;
+            });
+          },
+        };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+      const published = slot.snapshot();
+      if (published.status !== 'live') {
+        throw new Error(`setup: the page never went live; the slot is ${published.status}`);
+      }
+      const detail = published.services.remembered.ganttDetail;
+
+      // A full reload gives the old document this dispatch and no later task
+      // that is guaranteed to run, so everything below is read synchronously,
+      // with no await between the dispatch and the reads.
+      eventTarget.dispatchEvent(pageHideEvent(false));
+
+      expect(slot.snapshot().status, 'pagehide returned before withdrawing the runtime').toBe(
+        'retiring',
+      );
+      expect(closeCalls, 'pagehide returned before the disposal began').toBe(1);
+      expect(root.unmounts(), 'pagehide returned before invalidating the root').toBe(1);
+      expect(() => {
+        detail.write(true);
+      }).toThrow('the page withdrew this preference store before the access completed');
+
+      // The disposal is still running: the dispatch returned without it.
+      if (closeRelease.current === null) throw new Error('setup: the close was never called');
+      const release = closeRelease.current;
+      release();
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('empty');
+      });
+    },
+  );
+
   itDom('a non-persisted pageshow does not rebuild', async () => {
     const slot = createLifetimeSlot<ApplicationServices>(50);
     const root = recordingRoot(slot);
```

## 8. Proofs

Every fault below was injected for real in the planner's worktree on 2026-09-23, the new test run
alone with `-t 'starts retirement before its pagehide dispatch returns'` (1 test ran, 17 skipped),
the file restored from a `cp` copy and `cmp`-verified, and the test rerun green before the next.
The executor repeats each one with the README's patch-save form:

```sh
set -euo pipefail
cp <file> "$TMPDIR/<basename>.passing"
# …apply the edit named below…
if diff -u "$TMPDIR/<basename>.passing" <file> > "$TMPDIR/evidence/<name>.patch"
then echo "nothing was injected" >&2; exit 1; else test $? -eq 1; fi
cd apps/wbs/fe-01
if bunx vitest run src/runtime/application-bootstrap.test.tsx \
  -t 'starts retirement before its pagehide dispatch returns' > "$TMPDIR/evidence/<name>.log" 2>&1
then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/<name>.log"
cd ../../..
cp "$TMPDIR/<basename>.passing" <file>
cmp <file> "$TMPDIR/<basename>.passing"
grep -E "AssertionError|Tests |^status=" "$TMPDIR/evidence/<name>.log"
```

Restore **before** reading the status. `status=0` voids the proof: re-read the location, redo once
(preamble rule 20), then stop (stop condition 5).

| Id  | File and exact edit                                                                                                                                                                                                          | Rehearsed failure (2026-09-23)                                                                       | `Proof:` comment goes directly above                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| N1  | `application-bootstrap.tsx:351`: the line `  dependencies.eventTarget.addEventListener('pagehide', onPageHide);` deleted                                                                                                     | `AssertionError: pagehide returned before withdrawing the runtime: expected 'live' to be 'retiring'` | the `expect(slot.snapshot().status, 'pagehide returned before withdrawing the runtime')` |
| N2  | `application-bootstrap.tsx:321`, inside `onPageHide`: `    startRetirement();` → `    setTimeout(startRetirement, 0);`                                                                                                       | the same message as N1                                                                               | the same assertion, below N1's comment                                                   |
| N3  | `application-bootstrap.tsx:320`, inside `onPageHide`: `    invalidateRoot();` → `    queueMicrotask(invalidateRoot);`                                                                                                        | `AssertionError: pagehide returned before invalidating the root: expected +0 to be 1`                | the `expect(root.unmounts(), 'pagehide returned before invalidating the root')`          |
| N4  | `lifetime-slot.ts:320`, in `transition()`, the **six-space-indented** `      await disposeWithdrawn();` (not the eight-space one at `:364`): insert above it `      await new Promise((resolve) => setTimeout(resolve, 0));` | `AssertionError: pagehide returned before the disposal began: expected +0 to be 1`                   | the `expect(closeCalls, 'pagehide returned before the disposal began')`                  |
| N5  | `preferences.resource.ts:78`: `if (!isLive()) throw new Error(WITHDRAWN);` → `if (false) throw new Error(WITHDRAWN);`                                                                                                        | `AssertionError: expected [Function] to throw an error`                                              | the `expect(() => { detail.write(true); }).toThrow(…)`                                   |

N2 is the fault the amendment is about: a retirement deferred to a later task is one a reload may
never run. N1 and N2 share an assertion because they break the same guarantee by different routes;
each other assertion has its own fault, so no single mutation hides a second check. Each `Proof:`
comment names the injected fault, the observed message and the executor's own observation date, in
the file's existing form (`// Proof: on <date>, <fault> failed this test with <message>.`); none is
written before its failure has been observed.

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document

Run by the author against a disposable tree built from `git archive 474be8df`, after the final
Prettier pass on this document:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-e2a-hmr-amendment.md
work=$(mktemp -d "${TMPDIR:?}/e2a-extract-XXXXXX")
mkdir -p "$work/patches" "$work/tree"
awk -v out="$work/patches" '
  /^## 7\. The diffs$/ { inside=1; next }
  /^## 8\. Proofs$/    { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(ls "$work/patches" | wc -l)
echo "extracted=$count"
test "$count" -eq 6
git archive 474be8df | tar -x -C "$work/tree"
git -C "$work/tree" init -q
git -C "$work/tree" add -A
git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
for p in "$work"/patches/0[1-6].diff; do
  git -C "$work/tree" apply --check "$p"
  git -C "$work/tree" apply "$p"
done
echo "all patches applied"
````

Observed on 2026-09-23:

```
extracted=6
all patches applied
```

### 9.2 Commands run by the author, and what each reported

All on 2026-09-23 in the private planning worktree at `474be8df`, `env -u CLAUDECODE
-u CLAUDE_CODE_ENTRYPOINT`, not inside an executor sandbox.

| Command                                                                                                   | Before                                          | After the six diffs                                                               |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/)`                                                     | exit 0, `7 files`, `71 tests`                   | exit 0, `7 files`, `72 tests`                                                     |
| the new test alone (`-t 'starts retirement before its pagehide dispatch returns'`)                        | —                                               | exit 0, `1 passed`, `17 skipped` (18)                                             |
| sandbox node tier (README's command)                                                                      | not run on this base                            | exit 0, `46 files`, `674 tests`                                                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache`                                         | —                                               | exit 0                                                                            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`                                              | —                                               | exit 0                                                                            |
| `NX_DAEMON=false env -u AGENT bunx nx run wbs-fe-01:test --skip-nx-cache`                                 | not run on this base                            | exit 0, `131 files`, `2996 tests`; zoned `2 files`, `3 tests`                     |
| the strict OpenSpec block                                                                                 | exit 0, `{"items":114,"passed":114,"failed":0}` | exit 0, `{"items":114,"passed":114,"failed":0}`                                   |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate adopt-frontend-lifetimes --strict --json` | —                                               | exit 0, `valid: true`, `issues: []`                                               |
| `prettier --check` on the six rehearsed files, then `NX_DAEMON=false bunx nx format:check --all`          | —                                               | both exit 0                                                                       |
| the five faults of section 8                                                                              | —                                               | each failed the new test with the message in section 8, restored, `cmp`-identical |
| the five faults of section 3.3 against the **unchanged** test file                                        | exit 0                                          | as tabulated in section 3.3                                                       |

OpenSpec: **114 before, 114 after, 0 failed.** The item total counts change directories and specs,
not requirements, so an added requirement does not move it.

### 9.3 Planner-only, with the expected relative delta

| Check                                                                                                                        | Expectation                                              | Author's rehearsal                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:test`                            | the jsdom tier's baseline **+ 1** test, **+ 0** files    | after: exit 0, `131 files`, `2996 tests`; the base was not re-run                                  |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:test:unit`                       | unchanged: the file is not in the node tier              | not run                                                                                            |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, staged | exit 0; no module README, no project target, no new path | not rehearsed with the slice applied; the commit helper ran it for this document's own commit only |
| `bin/h2puni-gate.sh <sha>`                                                                                                   | exit 0 on the shared build host                          | not run; pending, never reported as passed                                                         |

No browser run is required: nothing in the bfcache spec or any other Playwright file changes, and the
guarantee under test is observable in jsdom.

### 9.4 What none of this proves

- **That a real reload's disposal completes.** It is the point of the amendment that nothing does.
- **That the dispatch does not wait.** True by the platform — `EventTarget` ignores a listener's
  return value and a listener cannot block on a promise — so no production fault can make it false,
  and this packet claims it as a stated property, not a proved one (addendum 20).
- **That a development edit reloads rather than hot-updates.** Established by source reading
  (section 3.2 and the held record's 3.1), kept by no automated check. A future `import.meta.hot`
  registration in fe-01 would make the second scenario false without failing any test; the new
  requirement's last sentence makes such a change a gated in-document replacement that must first
  meet the refusal requirement, so the review of that change is where it is caught. A code-shape
  scanner for it was not added: addendum 18 says such checks must resolve symbols, and a regex over
  `import.meta.hot` would be exactly the check it warns against.
- **Retirement starting while a transition is already running.** The disposal then waits behind the
  running one (section 3.1), so "disposal has begun" is only guaranteed for an idle live page. The
  requirement says "begun … or queued it behind a transition that is already running", the scenario
  says "no transition running", and the new test uses an idle live page. The queued case is proved
  by nothing here beyond the slot's own serialization tests; the withdrawal and the preference
  refusal hold either way, because `accept()` is synchronous regardless.

## 10. Stop conditions

Each is false on the real starting tree, checked on 2026-09-23.

1. Step 0's status is not empty, or `base` differs from the slice note's SHA.
2. Step 0's runtime baseline is not `status=0`, or its OpenSpec block exits non-zero.
3. A diff in section 7 fails `git apply --check`, or the extraction does not print `extracted=6`.
   Stop and report the exact error; do not hand-edit a file into shape.
4. The `-t` filter matches zero tests or more than one.
5. A negative leaves the new test passing after one careful redo, or fails it with a different
   assertion than section 8 names.
6. After step 4, the runtime directory is not step 0 **+ 1** test, or the sandbox node tier moved at
   all.
7. At hand-over, any path outside section 5's seven is listed.
8. Anything asks for a Git state change in the clone, a network call, a browser, or `--no-verify`.
9. `claims.db.test.ts` › `bounds terminal lock contention and retries until a held write commits`
   fails: a known racy test that is not this packet's. Record it, rerun once, do not touch it.

## 11. Out of lane

- Every production file: `application-bootstrap.tsx`, `lifetime-slot.ts`, `preferences.resource.ts`,
  `application-runtime.ts`, `main.tsx`. Mutated only for section 8's negatives and restored.
- `proposal.md` of the change, `CONTEXT.md`, `docs/adr/`: untouched. The decision is recorded in the
  held record and the task note; it has one real alternative, but it is not hard to reverse — adding
  the gated mechanism later is exactly what the new requirement allows — so it does not meet the bar
  for an ADR.
- [050.7e](050-7-e-page-lifecycle.md), which quotes the map's old HMR sentence in its section 3.1:
  a merged packet's historical quotation, left as it was.
- `e2e/lifetime-bfcache*.ts`, `playwright.config.ts`, `bun.lock`, `package.json`: untouched.

## 12. Assumptions recorded rather than asked

1. **The two new terms live in the lifetime map, not `CONTEXT.md`.** `CONTEXT.md` holds none of the
   frontend lifetime vocabulary today; adding two terms without their neighbours would split one
   glossary across two files. A later packet that moves the lifetime vocabulary moves these with it.
2. **"Before the dispatch returns" is the contract, not "before the document is discarded".** The
   platform would still run a microtask queued by the listener, so `queueMicrotask(startRetirement)`
   would still start retirement under a real reload; the contract is stricter than that minimum
   because synchronous start is what the code does and the only boundary a jsdom test can observe
   without a browser. Measured: that deferral fails the new test with N1's message too.
3. **The spec edits live in the existing delta file**, not a new change: `adopt-frontend-lifetimes`
   is unarchived, its requirements are all `ADDED`, and task 5 belongs to it.
4. **The refusal requirement is scoped by a sentence, not re-headed.** Renaming it would break every
   packet and verification entry that cites its title.

## 13. Batch-6 addendum, point by point

| Point                                      | Meets it? | Basis                                                                                                                                                                        |
| ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduce the failure on unchanged code | Partly    | There is no defect to reproduce: the test characterises existing behaviour and is green on unchanged code (step 4 says so). Its teeth are five rehearsed faults (section 8). |
| 2. Typecheck and lint                      | Yes       | `wbs-fe-01:typecheck` and `wbs-fe-01:lint` both exit 0 with the test applied (section 9.2); step 5 repeats them.                                                             |
| 3. Cumulative path counts                  | Yes       | Hand-over is exactly section 5's seven paths; the planner's only own path is this document, committed before dispatch.                                                       |
| 4. Failure-visible commands                | Yes       | Every test and Nx command keeps its status in the log; the negatives restore before reading status.                                                                          |
| 5. HEAD-reading rename tests               | N/A       | No rename of a project, target or CI path.                                                                                                                                   |
| 6. Sandbox facts                           | Yes       | The sandbox runs only focused Vitest, the node tier, typecheck, lint, format and OpenSpec; section 9.3 lists the rest.                                                       |
| 7. Known racy test                         | Yes       | Stop condition 9.                                                                                                                                                            |
| 8. Names                                   | Yes       | No product or module identifier is introduced or repointed.                                                                                                                  |
| 9. Slice form, baselines, proofs, privacy  | Yes       | One slice, relative baselines, five negatives with observed messages, no absolute path except the dispatch line.                                                             |
| 10. Pins                                   | Yes       | No dependency or lockfile edit.                                                                                                                                              |
| 11. Pipeline-status masking                | Yes       | No status is read through a pipeline: every status comes from an `if … then … else status=$?` wrapper around one command.                                                    |
| 12. Planner command chaining               | Yes       | The dispatch is one command; the commit helper stops on its own failures.                                                                                                    |
| 13. Module indexes                         | N/A       | No new file.                                                                                                                                                                 |
| 14. Bun directory filters                  | N/A       | No `bun test` directory argument; Vitest from `apps/wbs/fe-01`.                                                                                                              |
| 15. Interleaving property                  | N/A       | No lifecycle code changes; the existing model property is untouched and still runs in step 4.                                                                                |
| 16. Model-based remedy                     | N/A       | No lifecycle mechanism is built. The held record's rounds ended in a decision (Dany, 2026-09-23), not a fifth mechanism; a gated one, if built, owes this point in full.     |
| 17. Seeded evidence                        | N/A       | The slice reads no earlier attempt's evidence.                                                                                                                               |
| 18. Symbol-based boundary checks           | N/A       | No scanner is added; section 9.4 says why a regex one was declined.                                                                                                          |
| 19. Guard grep inputs                      | Yes       | No prescribed `grep` decides a status; the one in section 3.2 is the author's reading, cited as such.                                                                        |
| 20. Claims match proof strength            | Yes       | Section 4 marks each property proved or stated; section 9.4 lists what nothing here proves.                                                                                  |

## 14. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Subject                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1     | `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`, `openspec/changes/adopt-frontend-lifetimes/tasks.md`, `openspec/changes/adopt-frontend-lifetimes/verify.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, `docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md`, `docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md`, `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx` — **seven modified** | `test(wbs-fe-01): state document replacement and prove its pagehide retirement starts` |

After the commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded; anywhere else it is reported as not run, with the
reason.
