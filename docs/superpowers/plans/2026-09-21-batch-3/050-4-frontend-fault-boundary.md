# 050.4 — Frontend fault boundary: public report only, nothing raw in the DOM or console

**Work item:** WBS 050.4. **Size:** L, six slices. **Design:** the frontend half of slice 3 of
the [package adoption plan](../2026-09-17-personal-package-adoption.md) plus the unassigned
browser-fixture box of its slice 2, under the existing OpenSpec change `adopt-failure-reporting`.

The execution contract, the standard blocks and the hidden frontend constraints are in
[the batch 1 README](../2026-09-19-batch-1/README.md): **Execution contract**, **Standard blocks
every packet uses** (OpenSpec validation, Running one named test, Formatting, Saving a mutation
patch, Negative proofs with a restore, Frontend tests inside the sandbox) and **Hidden constraints
every frontend packet must respect**. They are not repeated here. Read them, then
`/home/df/wd/puni/puni-plan/exec/executor-preamble.txt` rules 1 to 20, then this packet in full.

Revised on 2026-09-21 after its first review; the dispositions are in the last section.

## Goal and non-goals

**Goal.** A render fault in `wbs-fe-01` discloses the public report's generic message and its
occurrence identifier, and nothing read from the caught value — not to the DOM, not to the browser
console, and not through react-dom's own default handler. The chart's boundary keeps disclosing
its own modelled sentence, by an explicit selector rather than by accident. Deciding any of this
never raises a second failure out of a boundary already handling the first. A Chromium case proves
it on the shipped Vite build, and that case is also the browser execution fixture `@shared/failures`
has been owed since 020.2.

**Non-goals.** No browser telemetry endpoint and no operator sink: the diagnostic report is built
and dropped, visibly (Assumption A1). `GanttDataError` is not migrated to `defineException` (A2).
No DI Bag in the frontend. No change to loading, empty, refusal or query-failure states, which are
rendered states and not faults. No change to `wbs-observability`, the backend or the MCP server —
those are 040.5's and packet 2.1's. **No edit to either `tools/tool-devsync` test file**: see
"G2 owns both pins".

## Read first

| File                                                             | Why                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx`        | The shared machinery both boundaries are; this packet rewrites it |
| `apps/wbs/fe-01/src/components/chrome/app-fault.tsx`             | The root boundary's own scope and fallback                        |
| `apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`              | The chart's boundary, and the one selective disclosure            |
| `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`        | The six cases that assert today's behaviour                       |
| `apps/wbs/fe-01/src/main.tsx`                                    | Where the application's one React root is created                 |
| `libs/shared/domain/failures/src/report-failure.ts`              | `reportFailure`, `createFailureRedaction` and their JSDoc         |
| `apps/wbs/fe-01/e2e/browser-packages-probe.ts` and its two peers | 040.1's pattern: a probe, a bundle helper and a Chromium spec     |
| `apps/wbs/fe-01/vite-config.test.ts`, the alias cases            | The exact map this packet adds a key to                           |

## Verified facts, checked in this repository on 2026-09-20 and 2026-09-21

1. `fault-boundary.tsx:93` returns the caught error's own words through `faultWords` (line 24),
   which returns `thrown.message` for any `Error`. `fault-boundary.tsx:112` is
   `console.error(this.props.logAs, thrown, info.componentStack)`. So today the caught value's own
   message reaches the DOM and the caught value itself reaches the console.
2. `app-fault.tsx:57` and `gantt-fault.tsx:54` are the two lines that print it.
3. `faultWords` and `NO_MESSAGE` have no other reader: `git grep faultWords` finds only
   `fault-boundary.tsx` and an unrelated local `const faultWords` in `gantt-panel.test.tsx:3723`.
4. **`@shared/failures` does not resolve from `wbs-fe-01` today.** `tsconfig.base.json:95` has the
   alias, but fe-01's four tsconfigs (`tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`,
   `tsconfig.e2e.json`) each declare their own `paths` that **replace** the base's, and none of
   them carries it; neither does `vite.config.ts` nor `vitest.config.ts`. `vite-config.test.ts`
   compares the two Vite alias maps with `toEqual` against a literal `expected` object
   (lines 253-288), so the key has to be added there too.
5. The Nx boundary rules permit the import. `shared-failures` is
   `scope:shared, ring:domain, runtime:isomorphic, product:shared`; `wbs-fe-01` is
   `scope:app, ring:adapter, runtime:browser, product:wbs`. Every applicable rule in
   `eslint.config.js` (`ring:adapter`, `browserAdapterConstraint`, `scope:app`, `runtime:browser`)
   and the generated `product:wbs` rule (`workspace-projects.mjs:266`) admits it.
6. **Probed on Bun 1.4.2.** `reportFailure` over an ordinary `Error` returns a public report of
   `v: 'appex/public/v4'`, an `occurrence_id`, a `fingerprint`, `code: 'INTERNAL_ERROR'` and
   `message: 'Something went wrong'` — **no** content read from the caught value. Occurrence
   identifiers match `/^AE_[0-9A-Z]+$/`.
7. **The occurrence identifier is per caught object, not per call.** Two `reportFailure` calls over
   the _same_ `Error` returned `AE_MG3AWXXC86TVW9P2A00RD97VM1` both times; a second, equal `Error`
   got a different one. So `getDerivedStateFromError` and `componentDidCatch` reporting the same
   object agree on one handle, which is what makes the console line and the page match.
8. **react-dom logs the caught error itself, in a production build.** Observed in Chromium on the
   shipped Vite build: the console carried
   `"Error: saving plan p-7 for alice@example.com failed\n    at De (<anonymous>:13:20104)…"`
   beside the boundary's own line. **A boundary alone therefore cannot keep the console clean**;
   the root has to be created with `onCaughtError`. This is the fact slice 3 exists for.
9. **Reading a caught value can throw, and a throw inside `componentDidCatch` is not caught.**
   Measured: `revokedProxy instanceof Error` throws
   `TypeError: Proxy has already been revoked. No more operations are allowed to be performed on
it`; an `Error` with an own throwing `message` accessor throws when that property is read, while
   `reportFailure` survives it and reports `message: "[not-inspected]"`. Rendered through the
   boundaries this packet prescribes, **before** Appendix A's guard existed, a chart fault built
   that way failed the test itself with `Error: Should not already be working.` — React's words
   for a throw out of `componentDidCatch` — with no fallback of either kind on screen.
10. **A revoked `Proxy` thrown as the value never reaches a boundary at all.** React reads it while
    the render is unwinding: the failure is `TypeError: Cannot perform 'get' on a proxy that has
been revoked` at `react-dom-client.development.js:17331` in `handleThrow`, above
    `renderRootSync`. Nothing in this packet can catch that, and nothing in this packet claims to.
    The reachable hostile values are a throwing own accessor, and an unreportable **cause**.
11. **An `Error` subclass cannot install a throwing `message` getter on its prototype.** `Error`'s
    constructor writes `message` as an own data property, which shadows it: a `get message()` on a
    `GanttDataError` subclass never ran and the case read `never read`. The fixture in Appendix D2
    uses `Object.defineProperty` on the instance for that reason.
12. `apps/wbs/fe-01/e2e/browser-packages-bundle.ts` hard-codes its entry
    (`const PROBE_ENTRY = resolve(appRoot, 'e2e/browser-packages-probe.ts')`) **inside** an
    existing `build: { write: false, rollupOptions: … }` property, and has exactly two callers:
    `e2e/browser-packages.spec.ts:3` and `browser-packages.test.ts:9`.
13. **`externalizedForBrowser` is not breakable over this packet's probe graph.** With a Node-only
    import inside `fault-disclosure.ts` — `node:util`, `node:util/types` and `di-bag/node` were all
    tried — the bundle's module id came back as bare `__vite-browser-external`, with no
    `:<specifier>` suffix, so the helper's list stayed `[]` and the assertion could not fail. The
    same injection into 040.1's own probe entry still fails `browser-packages.test.ts` on
    `expected [ 'node:util/types' ] to deeply equal []`, so **040.1's check is unharmed**; this
    packet simply does not repeat it, and uses `pageErrors` instead (slice 4, N11).
14. The field names 040.5 uses — `occurrence_id`, `fingerprint`, reports nested under one object,
    and `reported: false` handles — are the library's and this packet renames none of them.
15. `test-tiers.test.ts` walks `src/**` and the app root for `*.test.ts(x)`; it does **not** walk
    `e2e/`. This packet's one new suite is `src/main.test.tsx`, a `.tsx` file, which the tier rule
    puts in the jsdom tier without a `NODE_SUITES` entry. `NODE_SUITES`, the tier partition and the
    `lint`/`lint:fast` input lists are therefore untouched. Measured: `wbs-fe-01:test:unit` is
    `42 passed (42)` files and `621 passed (621)` tests before and after.

## Unknowns

- Whether `getDerivedStateFromError` is double-invoked under `StrictMode` in React 19.2 was not
  measured. Verified fact 7 makes it harmless for an `Error`: a second report of the same object
  returns the same identifier. For a thrown **primitive** a second call would mint a second
  identifier; no case in this packet depends on that, and none asserts it.
- Whether a minified stack frame can carry a raw identifier was not tested; the Chromium case
  searches for three string literals, which minification preserves, and says so.

## Assumptions recorded instead of asked

- **A1. There is no sink, and the diagnostic report is dropped.** The adoption plan's third
  reporting requirement says in terms: "Browser consoles and agent transcripts are disclosure
  boundaries too… There is no new browser telemetry endpoint in this plan." So the browser has
  nowhere to deliver an operator record. `discloseFault` keeps only the public report, and the
  occurrence identifier is a handle to a record that does not exist yet — it still correlates the
  sentence on screen with the console line beside it. Written into `discloseFault`'s JSDoc so the
  next reader does not mistake it for an oversight.
- **A2. `GanttDataError` keeps its class and gains a disclosure selector.** The plan forbids
  automatically replacing existing typed failures, and the class has ten throw sites in
  `gantt-geometry.ts`. Its messages are composed by that module over identifiers the payload
  already carried, so they are public by construction; the chart's boundary selects them through
  one named function, and every other value reaching the same boundary gets the generic message.
- **A3. The root's `onCaughtError` is silent.** A caught fault has already been reported by the
  boundary, which also names _which_ boundary caught it. A second line would be the same event
  with less in it. Not log-and-continue: nothing is swallowed, and slice 3's cases prove the
  uncaught and recoverable paths do speak.
- **A4. The secret list is empty.** `createFailureRedaction([])` — this app owns no secret value:
  its session token lives in an `HttpOnly` cookie the document cannot read. The key rules of
  `@shared/failures` stay in force regardless.
- **A5. Probe builds disable code splitting.** The shipped config splits React into a `vendor`
  chunk, and a probe served from one `addScriptTag` cannot load three files. See slice 4.
- **A6. A losing disclosure is modelled, not hidden.** `DisclosedFault.lost` is
  `'nothing' | 'the report' | 'the selector'`, and every console line carries it as a fixed fourth
  argument. That is the degradation R5 requires to be visible in a return type and covered by a
  test; it is also what makes "a caught value was appended to the line" a failed assertion.

## File plan

| File                                                         | Create/modify | Responsibility                                                   |
| ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------- |
| `openspec/changes/adopt-failure-reporting/specs/…/spec.md`   | modify        | Three requirements — **slice 0, before any implementation**      |
| `openspec/changes/adopt-failure-reporting/tasks.md`          | modify        | Task 3.1's command, and a new unchecked section 4                |
| `openspec/changes/adopt-failure-reporting/verify.md`         | modify        | **Every slice appends its own observations before handing over** |
| `apps/wbs/fe-01/vite-config.test.ts`                         | modify        | The alias in `expected`, and one `toContain` — **slice 1 first** |
| fe-01's four `tsconfig*.json`                                | modify        | The `@shared/failures` path; `.spec` also gains `vite/client`    |
| `apps/wbs/fe-01/vite.config.ts`, `vitest.config.ts`          | modify        | The same alias in both resolve maps                              |
| `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`   | create        | What a caught value discloses, and what was lost deciding        |
| `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx`    | modify        | State and callbacks carry a disclosure, not a message            |
| `apps/wbs/fe-01/src/components/chrome/app-fault.tsx`         | modify        | Generic sentence plus a reference paragraph                      |
| `apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`          | modify        | The `GanttDataError` selector and the chart's own reference      |
| `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`    | modify        | Four edited cases, ten new ones                                  |
| `apps/wbs/fe-01/src/components/chrome/root-fault-options.ts` | create        | react-dom's own handlers, so the console stays clean             |
| `apps/wbs/fe-01/src/main.tsx`                                | modify        | Create the app's root with those options                         |
| `apps/wbs/fe-01/src/main.test.tsx`                           | create        | That the root is created with them                               |
| `apps/wbs/fe-01/e2e/browser-packages-bundle.ts`              | rename        | To `browser-probe-bundle.ts`, taking its entry as an argument    |
| `apps/wbs/fe-01/e2e/browser-packages.spec.ts`                | modify        | Its one call site                                                |
| `apps/wbs/fe-01/browser-packages.test.ts`                    | modify        | Its import, type name and one call site                          |
| `apps/wbs/fe-01/e2e/fault-boundary-probe.ts`                 | create        | The production boundary and root options rendered in a browser   |
| `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`                  | create        | The Chromium case                                                |

**Out of lane.** `libs/shared/domain/failures/**` (020.2's, and this packet only imports it);
`libs/wbs/adapters/observability/**` and `apps/wbs/be-01/**` (040.5's); `apps/wbs/fe-01/src/modules/**`
(040.4's); `e2e/browser-packages-probe.ts` (040.1's probe body is unchanged — only its bundle
helper's name and signature move); and **both `tools/tool-devsync` test files**, which are G2's.
`apps/wiki/cli/**` is untouched, so the Twilight Bureaucrat validator identity does not move.

### G2 owns both pins

Packet G2 (branch `plan/batch-3-g2`) replaces the two hand-moved `tools/tool-devsync` literals with
derived forms, precisely so a lane like this one does not have to edit them. **This packet gives
the executor no instruction that touches either file**, and the planner has two orderings:

- **G2 has landed:** nothing to do. Both checks derive their own values.
- **G2 has not landed:** the planner reconciles both pins **after slice 1 and after no other
  slice**, as a separate commit outside this packet's file plan, and says so in the integration
  record.

Measured with this packet's whole tree staged on 2026-09-21:

| Pin                                                                                               | Moved by                                                                                     | Observed                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace-inventory.test.ts` → `pins the complete moved depth-sensitive configuration inventory` | Slice 1 only: four `../../../libs/shared/domain/failures/…` values in fe-01's four tsconfigs | `Expected length: 167 / Received length: 171`. The **file** count is unchanged, because all four tsconfigs already held parent-relative values.                   |
| `repo-namespacing-handoff.test.ts` → the `legacySourceOccurrences()` digest                       | Slice 1 only, and only through `vite-config.test.ts`                                         | `categories`, `occurrences` and `unclassified` unchanged; `digest` `4b3aac6c…` → `e17a914c…`. **Do not copy that literal**: re-pin from the value the run prints. |

The digest mechanism, measured rather than assumed: `LEGACY_ROOT` matches the pre-move roots —
the four unprefixed application directories under `apps/`, and the old unprefixed library
directories — and the hashed context is `path:line:match:line.trim()`. Of every file this
packet touches, only `vite-config.test.ts` contains such a token — three of them, at lines 282, 283
and 293 — and slice 1 inserts lines above them, which moves their **line numbers**. Proved by
running the whole devsync target with slices 2 to 4 applied and slice 1's `vite-config.test.ts`
edit reverted: `1 tests failed`, the inventory pin only, the digest test green.

---

## Slice 0 — the specification, before any implementation

- [ ] 0.0 Record `git rev-parse HEAD`, and run the README's **OpenSpec validation** block verbatim
      (including its `jq` contract; do not add the `rm -f` line older packets carry). Write down
      the item total. Observed 2026-09-21: 107 items, 107 passed, 0 failed.
- [ ] 0.1 Append the three requirements in **Appendix J** to
      `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`. Each has a
      normative `SHALL` sentence directly under its `### Requirement:` heading; validation refuses
      one that has not. **Create no new change**: `adopt-failure-reporting` already covers slices 2
      and 3 of the adoption plan.
- [ ] 0.2 In that change's `tasks.md`, apply the two edits in **Appendix K**: task `3.1` keeps its
      Node-only-global negative and gains this packet's command, and a new section `4` is added
      with `4.1` **unchecked**. Neither box is ticked in this slice.
- [ ] 0.3 Run the OpenSpec validation block again. Expected: the item total from 0.0, unchanged,
      with zero failures — adding requirements to an existing delta spec adds no artifact, so this
      is not a number plus k (measured both ways, 2026-09-21).
- [ ] 0.4 Append a "050.4 slice 0" section to that change's `verify.md` with the two validation
      results. **Every slice below appends its own section before handing over**; evidence
      references are basenames relative to the attempt's evidence directory, never an absolute
      clone, home or temporary path.

**Ready to commit.** `docs(openspec): specify the frontend fault boundary's disclosure`, paths:
`openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`,
`openspec/changes/adopt-failure-reporting/tasks.md`,
`openspec/changes/adopt-failure-reporting/verify.md`.

---

## Slice 1 — `@shared/failures` resolves from `wbs-fe-01`

**Pre-edit check.** `git grep -n "@shared/failures" apps/wbs/fe-01` prints nothing. If it prints
anything, stop: another lane has started this.

- [ ] 1.0 Baseline: `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run vite-config.test.ts)`. Record the
      count; observed `18 passed (18)`.
- [ ] 1.1 **The assertion first.** In `apps/wbs/fe-01/vite-config.test.ts`, add the key to the
      `expected` object, directly after its `'@shared/validation': resolve(APP_ROOT, …)` entry:

  ```ts
  '@shared/failures': resolve(APP_ROOT, '../../../libs/shared/domain/failures/src/index.ts'),
  ```

- [ ] 1.2 In the same file, after the existing
      `expect(Object.keys(appAliases)).toContain('@shared/validation');`, add:

  ```ts
  // The fault boundaries import `@shared/failures` for the public report they
  // disclose; without the key in both maps `app-fault.test.tsx` fails to
  // collect rather than failing an assertion.
  expect(Object.keys(appAliases)).toContain('@shared/failures');
  ```

- [ ] 1.3 Run the baseline command again. **Expected red: `1 failed | 17 passed (18)`**. The one
      failing case is the alias-map case named in N1's table below, and it fails on
      "expected [ '@', '@wbs/domain/workday', …(19) ] to include '@shared/failures'" (rehearsed
      2026-09-21). Zero failures here is a stop.
- [ ] 1.4 Add this line immediately **above** the `@shared/validation` entry in the `paths` block of
      each of `apps/wbs/fe-01/tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json` and
      `tsconfig.e2e.json`. Four files, one occurrence in each — `@shared/validation` appears exactly
      once per file, so the anchor is unambiguous.

  ```json
  "@shared/failures": ["../../../libs/shared/domain/failures/src/index.ts"],
  ```

- [ ] 1.5 In `apps/wbs/fe-01/tsconfig.spec.json`, add `"vite/client"` to the end of the `types`
      array, so it reads
      `"types": ["vitest/globals", "@testing-library/jest-dom", "node", "vite/client"],`. Slice 3's
      `src/main.test.tsx` pulls `main.tsx` into the spec project, and `main.tsx`'s first statement
      is `import './styles.css'`; without this the type check fails with
      `TS2882: Cannot find module or type declarations for side-effect import of './styles.css'`
      (watched 2026-09-21). It is done here because this slice owns the tsconfigs.
- [ ] 1.6 In **both** `apps/wbs/fe-01/vite.config.ts` and `apps/wbs/fe-01/vitest.config.ts`, insert
      the entry below directly after the multi-line `'@shared/validation': resolve(…)` entry. Each
      file contains that entry exactly once.

  ```ts
  // `@shared/failures` is the reporting policy the fault boundaries disclose
  // through; it is `runtime:isomorphic` and has no Node import, so the same
  // module serves the browser build and both test tiers.
  '@shared/failures': resolve(__dirname, '../../../libs/shared/domain/failures/src/index.ts'),
  ```

- [ ] 1.7 Verify: the 1.0 command — **18 tests pass, the count from 1.0 unchanged**; then
      `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`, exit 0.
- [ ] 1.8 **Negative N1.** Delete the `'@shared/failures'` entry from `vitest.config.ts` only,
      leaving `vite.config.ts` alone, and run
      `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run vite-config.test.ts)`.

| Fact the proof rests on                                            | Named test                                                                                                      | Observed 2026-09-20                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The two alias maps must agree or a suite silently stops collecting | `the app and the run resolve the same modules > maps every alias to the namespaced source file in both configs` | `AssertionError: expected [ '@', '@shared/validation', …(19) ] to deeply equal [ '@', '@shared/failures', …(20) ]`, with `1 failed | 17 passed (18)` |

Restore, rerun green, then add a `Proof:` comment naming this fault and that diagnostic directly
above the `toContain('@shared/failures')` line added in 1.2 — it is a new assertion, so it owes
one.

- [ ] 1.9 Append slice 1's observations to the change's `verify.md`.

**Ready to commit.** `build(fe-01): resolve @shared/failures from the frontend`, paths:
`apps/wbs/fe-01/vite-config.test.ts`, `apps/wbs/fe-01/tsconfig.json`,
`apps/wbs/fe-01/tsconfig.app.json`, `apps/wbs/fe-01/tsconfig.spec.json`,
`apps/wbs/fe-01/tsconfig.e2e.json`, `apps/wbs/fe-01/vite.config.ts`,
`apps/wbs/fe-01/vitest.config.ts`, `openspec/changes/adopt-failure-reporting/verify.md`.

---

## Slice 2 — the boundaries disclose a public report

**Pre-edit check.** `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx` exports `faultWords`,
and `git grep -n "@shared/failures" apps/wbs/fe-01/vite.config.ts` prints one line (slice 1
landed). Either being false is a stop.

### 2a. The failing cases first

- [ ] 2.0 Baselines, all recorded now and compared later:
      `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/chrome/app-fault.test.tsx)` —
      observed `6 passed (6)`; and
      `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/wbs/gantt-panel.test.tsx src/app.test.tsx)`
      — observed `256 passed (256)`.
- [ ] 2.1 In `app-fault.test.tsx`, add this import beside the existing
      `import { GanttFaultBoundary } from '@/components/wbs/gantt-fault';`:

  ```ts
  import { GanttDataError } from '@/components/wbs/gantt-geometry';
  ```

- [ ] 2.2 After the existing `Throwing` component in that file, add two more:

  ```tsx
  /**
   * A component that throws the panel's own modelled fault.
   *
   * The distinction the disclosure rests on: `GanttDataError`'s sentences are written by
   * `gantt-geometry.ts` over identifiers the payload already carried, so the chart's boundary
   * selects them deliberately. A plain `Error` reaching the same boundary does not get that
   * treatment, which is the case below.
   */
  function ThrowingGanttData({ words }: { words: string }): never {
    throw new GanttDataError(words);
  }

  /** A component that throws a value the case built, rather than one it described. */
  function ThrowingValue({ thrown }: { thrown: unknown }): never {
    throw thrown;
  }
  ```

  `ThrowingValue` needs **no** `only-throw-error` disable: eslint does not fire on a `throw` of a
  parameter typed `unknown`, and adding one fails lint as an unused directive (watched 2026-09-20).

- [ ] 2.3 Rename the case `says what was thrown, offers a reload, and leaves a document behind` to
      `discloses a generic sentence and a reference, offers a reload, and leaves a document behind`,
      and replace its numbered block 1 with blocks 1 and 2 below, renumbering the three that follow
      to 3, 4 and 5:

  ```ts
  // 1. The public report's own generic message, and **not** the thrown
  //    error's words: the root catches what nothing modelled, so what it
  //    caught is raw by definition and the page is a disclosure boundary.
  expect(appFaultWords()).toContain('The app stopped');
  expect(appFaultWords()).toContain('Something went wrong');
  expect(appFaultWords()).not.toContain('the plan is in a state it cannot be in');
  // 2. The handle, which is the one fault-specific thing on the page and the
  //    only way a reader and an operator can be talking about the same event.
  expect(document.querySelector('[data-app-fault-reference]')?.textContent).toMatch(
    /^Reference AE_[0-9A-Z]+$/,
  );
  ```

- [ ] 2.4 Rename `says so when what was thrown was not an error at all` to
      `discloses nothing of a thrown value that was not an error at all`, replace its opening
      comment with one saying that a thrown string is the case where "just print the message" has
      no message to print and that the public report answers for a primitive exactly as it does for
      an `Error`, and replace its two assertions with:

  ```ts
  expect(appFaultWords()).toContain('Something went wrong');
  expect(appFaultWords()).not.toContain('nope');
  expect(appFaultWords()).not.toContain('undefined');
  expect(document.querySelector('[data-app-fault-reference]')?.textContent).toMatch(
    /^Reference AE_[0-9A-Z]+$/,
  );
  ```

- [ ] 2.5 In `costs a chart rather than a page when the chart is what threw`, change the child of
      `<GanttFaultBoundary generation={1}>` from `<Throwing words="slice sanding …" />` to
      `<ThrowingGanttData words="slice sanding names a predecessor this payload has not got" />`.
      Nothing else in that case changes: its two assertions about the chart's own sentence are
      exactly what the selector must keep true.
- [ ] 2.6 In `catches what the chart’s boundary is not under`, replace
      `expect(appFaultWords()).toContain('the table cannot render this row');` with:

  ```ts
  expect(appFaultWords()).toContain('Something went wrong');
  expect(appFaultWords()).not.toContain('the table cannot render this row');
  ```

- [ ] 2.7 Append the whole describe block in **Appendix D1** to the end of the file.
- [ ] 2.8 Run the 2.0 file command. **Expected red: `7 failed | 3 passed (10)`** (rehearsed
      2026-09-21). The seven are the four edited or renamed cases plus the three new ones that
      assert generic text; `costs a chart rather than a page…` passes already, because
      `GanttDataError`'s message is what today's boundary prints anyway. Fewer than seven failures,
      or zero tests, is a stop.

### 2b. The implementation

- [ ] 2.9 Create `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` with exactly the
      listing in **Appendix A**.
- [ ] 2.10 Rewrite `fault-boundary.tsx` to the listing in **Appendix B**. `faultWords` and
      `NO_MESSAGE` go with it; fact 3 says nothing else reads them.
- [ ] 2.11 In `app-fault.tsx`: change `fallback={(message) => (` to `fallback={(fault) => (`;
      change the sentence's two lines to read "The app stopped: {fault.sentence}. Nothing on this
      page can put it back — reload it to start again. Anything already saved is on the server."
      (the wrap moves one word earlier); and insert this immediately after that closing `</p>` and
      before the `<button` — note there is **no** semicolon after the closing tag, which would
      render as JSX text:

  ```tsx
  {
    /*
     * The handle, and the only thing on this page that is specific to this fault.
     * The sentence above is the public report's generic message, because the root
     * catches what nothing modelled; the identifier is what a reader quotes and what
     * an operator's record will be keyed by once a browser has somewhere to send one.
     */
  }
  <p className="text-muted-foreground mb-4 font-mono text-xs" data-app-fault-reference>
    Reference {fault.occurrenceId}
  </p>;
  ```

  Add this paragraph to `AppFaultBoundary`'s docblock, before
  `**It cannot heal itself, and says so rather than pretending.**`:

  ```text
  * **It says nothing about what was thrown.** The sentence is the public report's own
  * generic message and the line under it is the occurrence identifier both reports share;
  * the caught value's message, its stack and everything hanging off it stay inside the
  * diagnostic report, which `discloseFault` drops. A page is a disclosure boundary and
  * so is the console beside it — see the adoption plan's third reporting requirement.
  ```

- [ ] 2.12 Rewrite `gantt-fault.tsx` to the listing in **Appendix C**, which adds the selector, the
      `discloses` prop, the `fault.sentence` expression and the chart's own reference element.
- [ ] 2.13 Run the 2.0 file command again. **Expected green: `10 passed (10)`.** Then run the 2.0
      neighbour command again: **the number recorded there, unchanged.**
- [ ] 2.14 `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. This slice moves a prop type
      from `(message: string) => ReactNode` to `(fault: DisclosedFault) => ReactNode` and changes a
      state field, so the type check runs in this same slice.
- [ ] 2.15 `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. An import-order or prettier
      diagnostic is preamble rule 17, not a stop.

### 2c. Negatives, all rehearsed 2026-09-20 and 2026-09-21

Each row is one mutation, injected alone into a production file, saved as a patch under
`$TMPDIR/evidence`, observed, restored with `cmp`, rerun green. The test file is
`apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx` throughout; run it whole.

| #   | Fault, by function and expression                                                                                                             | Named test that must fail                                                       | Diagnostic actually seen                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| N2  | In `discloseFault`, the **final** `return`'s `sentence:` becomes `selected ?? (thrown instanceof Error ? thrown.message : disclosed.message)` | `puts neither the message, the cause nor a stack into the DOM`                  | `AssertionError: alice@example.com: expected '<div><main data-app-fault="true" clas…' not to contain 'alice@example.com'` (4 other cases failed too) |
| N3  | In `FaultBoundary.componentDidCatch`, append `, thrown` to the `console.error(…)` argument list                                               | `logs the boundary, the disclosed sentence and the reference, and nothing else` | `AssertionError: expected [ 'the app could not render', …(4) ] to deeply equal [ 'the app could not render', …(3) ]`                                 |
| N4  | Delete the whole `<p … data-app-fault-reference>` element from `app-fault.tsx`'s fallback                                                     | `shows the same reference on the page as it logged`                             | `AssertionError: expected 'WBS tool v2The app stopped: Something…' to contain 'AE_9JCX62C7WAJCWRRK7F4YAF908H'` (2 other cases failed too)            |
| N5  | Delete the `discloses={ganttWords}` prop from `gantt-fault.tsx`'s `<FaultBoundary>`                                                           | `costs a chart rather than a page when the chart is what threw`                 | `AssertionError: expected 'The chart cannot be drawn: Something …' to contain 'slice sanding names a predecessor'`                                   |
| N6  | In `ganttWords`, change `thrown instanceof GanttDataError` to `thrown instanceof Error`                                                       | `discloses the chart’s own modelled sentence and no other error’s`              | `AssertionError: expected 'The chart cannot be drawn: saving pla…' to contain 'Something went wrong'`                                                |

N5 and N6 are two mutations because one test would otherwise stand behind both checks: N5 proves
the selector is wired, N6 proves it is narrow. N5 also fails
`gantt-panel.test.tsx > a chart that cannot be drawn > says why, and leaves the plan alone` on
`expected 'The chart cannot be drawn: Something …' to contain 'a-slice-nobody-sent'`; record it,
do not stop (preamble rule 16).

- [ ] 2.16 After watching each, add the adjacent `Proof:` comments naming the injected fault and
      the observed diagnostic: N2 above the final `sentence:` line in `discloseFault`; N3 above the
      `console.error` call; N4 above the reference `<p>`; N5 and N6 above `ganttWords`.
- [ ] 2.17 Append slice 2's observations to the change's `verify.md`.

**Ready to commit.** `feat(fe-01): disclose a public report from the fault boundaries`, paths:
`apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`,
`apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx`,
`apps/wbs/fe-01/src/components/chrome/app-fault.tsx`,
`apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`,
`apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`,
`openspec/changes/adopt-failure-reporting/verify.md`.

---

## Slice 3 — react-dom's own handlers, and the root that carries them

**Pre-edit check.** `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` exists and exports
`DisclosureLoss` (slice 2 landed), and `src/main.tsx` contains `createRoot(el).render(` with one
argument. Either being false is a stop.

Verified fact 8 is why this slice exists: in the production build react-dom writes
`Error: <the thrown message>` and a stack to the console for every caught fault, so slice 2 alone
leaves the raw message in the console beside a clean page. Verified fact 9 is the other half: the
same default handlers **read** the caught value, so a hostile one kills the render.

### 3a. The failing cases first

- [ ] 3.0 Baseline: run `app-fault.test.tsx`; expected `10 passed (10)` from slice 2. Confirm
      `src/main.test.tsx` does not exist.
- [ ] 3.1 Create `apps/wbs/fe-01/src/main.test.tsx` with exactly the listing in **Appendix E**, and
      run `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/main.test.tsx)`. **Expected red:
      `1 failed (1)`**, on
      `AssertionError: expected undefined to be { …(3) } // Object.is equality` — `main.tsx` passes
      one argument today (rehearsed 2026-09-21). This is the only case that fails when the options
      object is perfect and nothing hands it to the root.
- [ ] 3.2 In `app-fault.test.tsx`, add
      `import { ROOT_FAULT_OPTIONS } from './root-fault-options';` after the `./app-fault` import,
      and append the whole block in **Appendix D2**. Run the file: **expected red, 6 of 16 failing**
      — three cases on a module that does not exist yet and three on the handlers it would export.
      A collection error naming `./root-fault-options` is the expected shape; `0 tests` is a stop.

### 3b. The implementation

- [ ] 3.3 Create `apps/wbs/fe-01/src/components/chrome/root-fault-options.ts` with exactly the
      listing in **Appendix F**.
- [ ] 3.4 In `apps/wbs/fe-01/src/main.tsx`, add
      `import { ROOT_FAULT_OPTIONS } from './components/chrome/root-fault-options';` after
      `import { App } from './app';`, and replace `createRoot(el).render(` with:

  ```tsx
  // The options are not decoration: react-dom's own default writes the thrown error and its
  // stack to the console for every fault a boundary catches, and its handlers read the caught
  // value, which a hostile one does not survive. See {@link ROOT_FAULT_OPTIONS}.
  createRoot(el, ROOT_FAULT_OPTIONS).render(
  ```

- [ ] 3.5 Run both test files. **Expected green: `16 passed (16)` and `1 passed (1)`.** Then
      `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` and `wbs-fe-01:lint` — both exit 0 — and
      `NX_DAEMON=false bunx nx run wbs-fe-01:build`, exit 0 with a `✓ built in …` line.

### 3c. Negatives

| #   | Fault                                                                                                      | Named test that must fail                                                                   | Diagnostic actually seen                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| N7  | In `src/main.tsx`, remove the second argument so the call reads `createRoot(el).render(`                   | `the application’s root > is created with the options that keep a fault out of the console` | `AssertionError: expected undefined to be { …(3) } // Object.is equality`, `1 failed (1)` (2026-09-21)                     |
| N8  | In `onUncaughtError`, replace `fault.sentence` with `String(thrown)`                                       | `discloses a public report for a fault no boundary caught`                                  | rehearse and record: the row's fact is that argument 2 is `'Something went wrong'` and not text read from the caught value |
| N9  | In `discloseFault`, move the `select?.(thrown)` call **above** the `if (!reporting.reported)` early return | `names the reporting loss in the console and gives it a handle`                             | rehearse and record: the row's fact is that a value the reporter could not describe is never offered to a selector         |
| N10 | In `discloseFault`, delete the `try`/`catch` around `select?.(thrown)`, leaving the bare assignment        | `keeps a throwing message getter inside the chart’s boundary`                               | `Error: Should not already be working.` — React's words for a throw out of `componentDidCatch` (2026-09-20)                |

N7 is not interchangeable with removing `onCaughtError` from the options object: that is slice 4's
N12, and it proves the handler's content rather than the root's wiring. N9 and N10 are separate
mutations because one test must not stand behind two checks.

- [ ] 3.6 After watching each, add the adjacent `Proof:` comments: N7 above the `createRoot` call in
      `main.tsx`; N8 above `onUncaughtError`'s `console.error`; N9 above the
      `if (!reporting.reported)` return; N10 above the `try` in `discloseFault`.
- [ ] 3.7 Append slice 3's observations to the change's `verify.md`.

**Ready to commit.** `feat(fe-01): keep react-dom's own fault line out of the console`, paths:
`apps/wbs/fe-01/src/components/chrome/root-fault-options.ts`,
`apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` (N9 and N10 proof comments),
`apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`, `apps/wbs/fe-01/src/main.tsx`,
`apps/wbs/fe-01/src/main.test.tsx`, `openspec/changes/adopt-failure-reporting/verify.md`.

---

## Slice 4 — the Chromium case (executor writes; **planner runs**)

**Pre-edit check.** `apps/wbs/fe-01/e2e/browser-packages-bundle.ts` exists and
`apps/wbs/fe-01/src/components/chrome/root-fault-options.ts` exists. Either being false is a stop.

The executor has no browser. It writes these files exactly, runs nothing in Chromium, and records
the Playwright command under "Not verified — pending planner verification". **No listing it writes
carries a `Proof:` comment**: the planner adds those after observing the failures, per preamble
rule 9.

- [ ] 4.0 Baseline: `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run browser-packages.test.ts)` —
      record the count; observed `3 passed (3)`.
- [ ] 4.1 Copy `apps/wbs/fe-01/e2e/browser-packages-bundle.ts` to
      `apps/wbs/fe-01/e2e/browser-probe-bundle.ts` and leave the original in place for the planner
      to remove from the index, saying so in the report. Then in the **new** file:
  - delete the `const PROBE_ENTRY = …` declaration and the docblock above it;
  - rename `BrowserPackagesBundle` to `BrowserProbeBundle` and retitle its docblock
    `/** One browser build of a probe entry, by what went into it. */`;
  - change the signature to
    `export async function buildBrowserProbeBundle(entry: string): Promise<BrowserProbeBundle> {`
    and add an `@param entry` line naming the probe's source file, relative to `apps/wbs/fe-01`,
    above the existing `@returns`;
  - **replace the whole existing `build` property** — from the line reading `build: {` down to and
    including its own closing `},`, which is the property inside the `await build({ … })` call and
    the last one before that call's closing `});` — with the block in **Appendix G**. Do **not**
    replace only the `rollupOptions` line: that nests `build` inside `build` and fails the type
    check with `Object literal may only specify known properties, and 'build' does not exist in
type 'BuildEnvironmentOptions'`;
  - in the chunk-count `throw`, replace the text `the browser build of the three libraries emitted`
    with an interpolation of `entry` in its place, and soften the comment above it so it no longer
    names the three libraries.
- [ ] 4.2 In `e2e/browser-packages.spec.ts`, change the import to
      `import { buildBrowserProbeBundle } from './browser-probe-bundle';` and the call to
      `await buildBrowserProbeBundle('e2e/browser-packages-probe.ts')`. In
      `browser-packages.test.ts`, change the import to
      `import { type BrowserProbeBundle, buildBrowserProbeBundle } from './e2e/browser-probe-bundle';`,
      both `BrowserPackagesBundle` type references to `BrowserProbeBundle`, and
      `buildBrowserPackagesBundle()` to `buildBrowserProbeBundle('e2e/browser-packages-probe.ts')`.
      Run `bunx eslint --fix apps/wbs/fe-01/e2e/browser-packages.spec.ts` afterwards: the import
      order changes and that is preamble rule 17, not a stop.
- [ ] 4.3 Create `apps/wbs/fe-01/e2e/fault-boundary-probe.ts` with the listing in **Appendix H**
      and `apps/wbs/fe-01/e2e/fault-boundary.spec.ts` with the listing in **Appendix I**.
- [ ] 4.4 Executor verification: `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0;
      `wbs-fe-01:lint` — exit 0; and the 4.0 command again — **the count from 4.0, unchanged**,
      which is 040.1's build property still holding over the renamed helper.
- [ ] 4.5 Append slice 4's observations to the change's `verify.md`, naming the Chromium command as
      not run and why.
- [ ] 4.6 **Planner, on a host with Chromium.** Before launching, run `ss -ltn` and read the
      listening ports. This gate binds `3100+S`, `3200+S` and `4200+S` for the shift `S` it is
      given, so pick an `S` whose **three** ports are all free and at least 300 away from every
      other live run's three. Then:

  ```sh
  CI=1 E2E_PORT_SHIFT=3300 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- \
    e2e/fault-boundary.spec.ts e2e/browser-packages.spec.ts
  ```

  Expected: exit 0, `2 passed`. Observed on 2026-09-21 at shift 3300, with 6400, 6500 and 7500 all
  free. A bare `bunx playwright test` lacks the environment and the backend refuses to start.

  **If a port is occupied, choose another shift.** `http://localhost:<port>/health is already used`
  is not authority to kill anything: a peer lane's tiers overlap yours whenever the shifts differ
  by 100, 1000 or 1100, so the process holding the port may be theirs. Terminate a process only
  after proving it is yours — `readlink /proc/<pid>/cwd` naming your own clone, or a PID your own
  launch recorded — and otherwise leave it alone and move.

### Planner's browser negatives

| #   | Fault                                                                                                                                                    | Named test                                                          | Diagnostic actually seen (2026-09-20 and 21)                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N11 | Prepend `import 'di-bag/node';` to `src/components/chrome/fault-disclosure.ts`                                                                           | `the root fault boundary discloses a public report and nothing raw` | `expect(received).toEqual(expected)` at `expect(pageErrors).toEqual([])`: `+ Array [ "Error: DI_BAG_INVALID_CONFIGURATION: withConfiguration runtime requires isNativePromise; see …", ]`                     |
| N12 | Delete `onCaughtError: () => undefined,` from `ROOT_FAULT_OPTIONS`                                                                                       | same test                                                           | `expect(received).toEqual(expected)` on the console filter: `- Array []` against `+ Array [ "alice@example.com", ]`. react-dom had written `Error: saving plan p-7 for alice@example.com failed` and a stack. |
| N13 | In `discloseFault`, `sentence:` becomes `selected ?? (thrown instanceof Error ? thrown.message : disclosed.message)`                                     | same test                                                           | `expect(received).toContain(expected)`: expected `"The app stopped: Something went wrong"`, received `"WBS tool v2The app stopped: saving plan p-7 for alice@example.com failed. …Reference AE_V2WX…Reload"`  |
| N14 | Add `void fetch('https://unexpected.invalid/fault').catch(() => undefined);` as the first statement of the probe's `proveTheBoundaryDisclosesNothingRaw` | same test                                                           | `expect(received).toEqual(expected)` at `expect(unexpectedRequests).toEqual([])`: `+ Array [ "https://unexpected.invalid/fault", ]`                                                                           |

N11 is task 3.1's browser-portability negative, kept because that task's own wording requires one,
and it is asserted through `pageErrors` rather than `externalizedForBrowser` — see verified fact 13
for why the latter cannot fail over this graph, and why 040.1's own use of it is unharmed.

- [ ] 4.7 The planner writes the `Proof:` comments from what it saw: N11 and N12 above
      `expect(pageErrors).toEqual([])` and above the console filter in `fault-boundary.spec.ts`,
      N13 above `expect(proof?.pageText)`, N14 above `expect(unexpectedRequests)`. It also replays
      Appendix G's chunk-count behaviour once — delete the `rolldownOptions` property and rerun the
      spec, expecting
      `Error: the browser build of e2e/fault-boundary-probe.ts emitted 3 chunks, not one`
      (observed 2026-09-20) — and writes that comment above the `rolldownOptions` property.

**Ready to commit.** `test(fe-01): prove the fault boundary in Chromium`, paths:
`apps/wbs/fe-01/e2e/browser-probe-bundle.ts`, `apps/wbs/fe-01/e2e/browser-packages-bundle.ts`
(deleted), `apps/wbs/fe-01/e2e/browser-packages.spec.ts`,
`apps/wbs/fe-01/e2e/fault-boundary-probe.ts`, `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`,
`apps/wbs/fe-01/browser-packages.test.ts`,
`apps/wbs/fe-01/src/components/chrome/root-fault-options.ts` (N12's proof comment),
`apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` (N11's and N13's proof comments),
`openspec/changes/adopt-failure-reporting/verify.md`.

---

## Slice 5 — close the specification

**Pre-edit check.** Slices 0 to 4 are committed, and
`openspec/changes/adopt-failure-reporting/tasks.md` contains an unchecked `4.1`.

- [ ] 5.0 Baseline: run the OpenSpec validation block; record the item total.
- [ ] 5.1 Tick `3.1` and `4.1` in that change's `tasks.md` — **only now**, after every check and
      every proof each of them names has been run and recorded.
- [ ] 5.2 Run the OpenSpec validation block again: the total from 5.0, unchanged, zero failures.
- [ ] 5.3 `NX_DAEMON=false bunx nx format:check --all` — exit 0. Format only the files this packet
      owns first, never repository-wide. A scratch `.ts` left at the repository root is reported by
      this check by name; move it under `$TMPDIR` rather than deleting it (the command guard
      rejects `rm -f`).
- [ ] 5.4 Append a closing section to `verify.md` consolidating the six slices' evidence. If the
      attempt's temporary root no longer holds an earlier slice's evidence, the planner re-seeds it
      through the launcher's `--seed <dir>` argument, which merges a directory into
      `$TMPDIR/<basename>`; a fresh `TMPDIR` per attempt is why that argument exists.

**Ready to commit.** `docs(openspec): record the frontend fault boundary's verification`, paths:
`openspec/changes/adopt-failure-reporting/tasks.md`,
`openspec/changes/adopt-failure-reporting/verify.md`.

### Planner-only checks

- `NX_DAEMON=false bunx nx run wbs-fe-01:test` — observed `119 passed (119)` files and
  `2879 passed (2879)` tests on the rehearsed tree, against a baseline of 118 and 2868: this packet
  adds eleven tests, ten in `app-fault.test.tsx` and one in `main.test.tsx`, and one file. The
  zoned second run prints `2 passed (2)` files and `3 passed (3)` tests, unchanged.
- `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` — observed `42 passed (42)` files and
  `621 passed (621)` tests, unchanged.
- The whole `wbs-fe-01:e2e` suite, once, because slice 2 changes text two boundaries render. No
  other spec asserts on it: `git grep` for `The app stopped`, `The chart cannot be drawn`,
  `data-app-fault` and `data-gantt-fault` finds only `app-fault.tsx`, `gantt-fault.tsx`,
  `app-fault.test.tsx`, `app.test.tsx` (attribute presence only) and `gantt-panel.test.tsx`.
- `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`, with this packet's files staged,
  after G2 or after the planner's own reconciliation. See "G2 owns both pins".

## Stop conditions

Each slice's own pre-edit check is stated above its steps, because a condition that is true of the
starting tree becomes false the moment its slice lands. These are the whole-packet ones, and every
one is false on the tree slice 0 starts from:

1. `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx` does not export `faultWords`, or
   `git grep -n faultWords apps/wbs/fe-01/src` finds a reader outside that file and
   `gantt-panel.test.tsx`'s own local constant.
2. `libs/shared/domain/failures/src/index.ts` does not export `reportFailure` and
   `createFailureRedaction`.
3. The public report of an ordinary `Error` does not carry `message: 'Something went wrong'`, or
   its `occurrence_id` does not match `/^AE_[0-9A-Z]+$/`.
4. A slice's red run reports zero tests, or fewer failures than the slice names.
5. A named negative's test passes after the mutation. Check the location once against the function
   and expression the row names, redo it once, then stop (preamble rule 20).
6. A step seems to need `tools/tool-devsync/src/workspace-inventory.test.ts` or
   `repo-namespacing-handoff.test.ts` edited. Those are G2's; stop and report.
7. The Chromium case cannot be run because no browser is available — that is the executor's normal
   state, and it is reported under "Not verified", not stopped on.

## Dispatch

Sandbox, no network (nothing here installs or fetches), no `--network` (this packet binds no port
itself; the Playwright stack is the planner's). Slices run one at a time, each from the reviewed
predecessor. Each slice records its own baselines in its `N.0` step and appends to `verify.md`
before handing over; a later attempt that needs an earlier one's evidence receives it through the
launcher's `--seed`.

---

## Appendix A — `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`

```ts
import { createFailureRedaction, reportFailure } from '@shared/failures';

/**
 * The redaction policy both fault boundaries report through, built once.
 *
 * Empty, and that is the whole list: this app owns no secret. Its session token lives in an
 * `HttpOnly` cookie the document cannot read, so there is no value here to compile into a
 * pattern rule. The key rules of `@shared/failures` are still in force — an `authorization`
 * property on a caught fetch failure is skipped whatever this list says.
 *
 * A module constant because the library caches one report maker per policy; building one per
 * caught fault would throw that cache away on the one path that is already in trouble.
 */
const FAULT_REDACTION = createFailureRedaction([]);

/**
 * What was lost while deciding what a caught fault discloses.
 *
 * Modelled rather than silent, and written into the console line, because either loss means
 * the reader is being told less than the boundary would normally say.
 */
export type DisclosureLoss = 'nothing' | 'the report' | 'the selector';

/**
 * What a boundary may put on screen and in the console about a fault it caught.
 *
 * `sentence` is disclosed text and nothing else: either a kind's own selected words, or the
 * public report's generic message. `occurrenceId` correlates this fault with the operator's
 * record of it, and is the one handle a reader can quote.
 */
export interface DisclosedFault {
  /** Disclosed words for the reader. Never a caught value's own message. */
  readonly sentence: string;
  /** The public report's occurrence identifier, or a local handle when reporting was lost. */
  readonly occurrenceId: string;
  /** Whether this disclosure is the whole of what the boundary could say. */
  readonly lost: DisclosureLoss;
}

/**
 * What a reader is told when reporting itself failed and there is no public report to read.
 *
 * Fixed text rather than anything derived from the caught value: reading that value is what
 * threw.
 */
const REPORTING_LOST_SENTENCE = 'the failure could not be described';

/**
 * Decide what one caught value discloses, without ever throwing and without reading the
 * caught value directly.
 *
 * **Nothing raw crosses this function.** A thrown `Error`'s own `message` and `stack`, and
 * any value hanging off it, reach `reportFailure` and stay inside the diagnostic report,
 * which this function drops. What comes back is the public report's `code`-keyed generic
 * message — `Something went wrong` for anything untyped — under the occurrence id both
 * reports share. The browser console and the DOM are disclosure boundaries, so they get
 * exactly that.
 *
 * **Nothing here may throw, and two things very nearly do.** This runs inside
 * `componentDidCatch`, where a throw is not caught by the boundary already handling the
 * fault: it escapes upward, and with it the page. A caught value that cannot be inspected —
 * an `Error` whose `message` is a throwing own accessor, one whose cause is a revoked
 * `Proxy` — must therefore come back as an outcome and never as a second failure.
 * `reportFailure` models its own half; the selector is this function's to protect, so it is
 * called **after** the report, only when the report succeeded, and inside a guard. A value
 * that already defeated the reporter is never offered a selector, because reading it is what
 * defeated the reporter.
 *
 * A revoked `Proxy` thrown *as* the value never arrives here at all: react-dom's own
 * `handleThrow` reads it while the render is still unwinding and throws first (watched under
 * jsdom, 2026-09-20). That is React's, not this module's, and no boundary can catch it.
 *
 * **The diagnostic report is discarded, deliberately and for now.** There is no browser
 * telemetry endpoint in this repository and the adoption plan explicitly adds none, so
 * nothing in a browser can deliver an operator record. The occurrence id is therefore a
 * handle to a record that does not exist yet; it still correlates the sentence on screen
 * with the console line beside it, and it is what a reader quotes.
 *
 * @param thrown The value React caught. Any value, including primitives and hostile objects.
 * @param select A kind-specific disclosure selector, for a failure whose own words are
 *   already public by construction. It receives the caught value and returns the sentence to
 *   disclose, or `null` to fall back to the generic public message. It may throw; that is a
 *   modelled outcome and not a fault. Omitted where a boundary discloses nothing of its own.
 * @returns The sentence to render, the handle to quote, and what was lost deciding them.
 */
export function discloseFault(
  thrown: unknown,
  select?: (thrown: unknown) => string | null,
): DisclosedFault {
  const reporting = reportFailure(thrown, { redact: FAULT_REDACTION });
  if (!reporting.reported) {
    return {
      sentence: REPORTING_LOST_SENTENCE,
      occurrenceId: reporting.occurrenceId,
      lost: 'the report',
    };
  }
  const disclosed = reporting.reports.public;
  let selected: string | null;
  try {
    selected = select?.(thrown) ?? null;
    // The one modelled recovery here: a selector that cannot read the value it was given
    // discloses nothing, which is the safe direction, and `lost` says so rather than the
    // page pretending the boundary had a choice.
  } catch {
    return {
      sentence: disclosed.message,
      occurrenceId: disclosed.occurrence_id,
      lost: 'the selector',
    };
  }
  return {
    sentence: selected ?? disclosed.message,
    occurrenceId: disclosed.occurrence_id,
    lost: 'nothing',
  };
}
```

## Appendix B — `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx`, in full

`NO_MESSAGE` and `faultWords` are gone, and the `ErrorInfo` type import goes with the parameter
that used it, or lint fails on an unused import.

```tsx
import { Component, type ReactNode } from 'react';

import { type DisclosedFault, discloseFault } from './fault-disclosure';

export interface FaultBoundaryProps {
  /**
   * What a caught fault renders instead of the children, given only what the fault
   * discloses.
   *
   * The whole of what differs between the two boundaries, and the reason the
   * fallback is a prop rather than a `message` this class knows how to print:
   * one of them offers a reload of the document and the other says the plan
   * above it is unaffected, and neither sentence is true of the other's scope.
   *
   * It receives a {@link DisclosedFault} and never the caught value: a fallback
   * that could reach the thrown error could put its message on screen, which is
   * the disclosure this boundary exists to prevent.
   */
  fallback: (fault: DisclosedFault) => ReactNode;
  /**
   * A disclosure selector for the one kind of failure this boundary's own words are
   * already public for, or omitted where the boundary discloses nothing of its own.
   *
   * See {@link discloseFault}: it returns the sentence to show, or `null` to fall back to
   * the public report's generic message.
   */
  discloses?: (thrown: unknown) => string | null;
  /**
   * What the console line calls the thing that could not render.
   *
   * Logged beside the fault's occurrence id and disclosed sentence, and nothing
   * else: the console is a disclosure boundary like the DOM, so neither the
   * caught value nor the component stack goes into it. This is the trace of
   * **where** it was thrown, which is the one thing the sentence on screen
   * leaves out.
   */
  logAs: string;
  /**
   * The identity of the state the children were drawn from; a fault clears when
   * it moves, and only then.
   *
   * React never retries a boundary on its own, so a boundary with nothing to
   * reset against latches until it is remounted. The Gantt panel passes the
   * **tree read's** generation, because the fault it catches is a payload skew
   * that is over by the next whole read; the root passes a constant, because
   * whatever state the tree held is gone with the tree and no later prop can
   * prove the fault is over.
   *
   * Cleared through here rather than by a `key` on the element: a `key` would
   * remount the children on every change and take the chart's scroll position
   * with it.
   */
  resetKey: number | string;
  children: ReactNode;
}

interface FaultBoundaryState {
  /** What the caught fault discloses, or null while nothing has been caught. */
  fault: DisclosedFault | null;
  /** The {@link FaultBoundaryProps.resetKey} this state was decided against. */
  resetKey: number | string;
}

/**
 * The machinery both of this app's error boundaries are, with everything that
 * differs between them passed in.
 *
 * A class because React has no hook for this: `getDerivedStateFromError` is a
 * class-only lifecycle. It was written out twice — two constructors, two
 * `getDerivedStateFromError`, two `componentDidCatch`, two `render` guards —
 * and the second one grew the reset the first one still has no use for.
 *
 * Where each boundary stands and why is on {@link AppFaultBoundary} and
 * {@link GanttFaultBoundary}; that argument is about scope, not about this.
 */
export class FaultBoundary extends Component<FaultBoundaryProps, FaultBoundaryState> {
  constructor(props: FaultBoundaryProps) {
    super(props);
    this.state = { fault: null, resetKey: props.resetKey };
  }

  /**
   * Turn the caught value into a disclosure before anything can render it.
   *
   * The reporting happens here rather than in `componentDidCatch` so that the very first
   * commit after the throw already has the public sentence and the occurrence id: a
   * fallback rendered from a half-filled state would put the generic message on screen
   * without the handle a reader is meant to quote.
   *
   * It is a static lifecycle and has no access to props, so the selector cannot be read
   * here; `componentDidCatch` applies it and replaces the state. Repeating the call is
   * cheap and correlates: `reportFailure` returns the **same** occurrence id for a second
   * report of the same `Error` object (measured 2026-09-20), so the sentence this renders
   * and the one `componentDidCatch` logs carry one handle.
   */
  static getDerivedStateFromError(thrown: unknown): Pick<FaultBoundaryState, 'fault'> {
    return { fault: discloseFault(thrown) };
  }

  /**
   * Clears a fault when the children's state has moved on, and only then.
   *
   * Runs before every render, including the one that follows
   * `getDerivedStateFromError` — where the key has not moved, so the fault
   * stands and the fallback is what renders.
   */
  static getDerivedStateFromProps(
    props: FaultBoundaryProps,
    state: FaultBoundaryState,
  ): FaultBoundaryState | null {
    if (props.resetKey === state.resetKey) return null;
    return { fault: null, resetKey: props.resetKey };
  }

  /**
   * Apply this boundary's own disclosure selector and say, once, that a fault was caught.
   *
   * The console line carries the disclosed sentence, the handle and what was lost deciding
   * them, and nothing else — a fixed four-argument shape, so a caught value appended to it
   * is a failed assertion rather than a longer line nobody reads. Not a log-and-continue:
   * the render is already refused and the reader is already told; this is the copy an
   * operator can be read back over a telephone.
   *
   * React's `ErrorInfo` second argument is deliberately not taken. Its `componentStack` is
   * a stack, the console is a disclosure boundary, and the adoption plan's third reporting
   * requirement puts browser consoles on the same footing as agent transcripts.
   */
  override componentDidCatch(thrown: unknown): void {
    const fault = discloseFault(thrown, this.props.discloses);
    this.setState({ fault });
    console.error(this.props.logAs, fault.sentence, fault.occurrenceId, fault.lost);
  }

  override render(): ReactNode {
    const { fault } = this.state;
    return fault === null ? this.props.children : this.props.fallback(fault);
  }
}
```

## Appendix C — `apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`, in full

```tsx
import type { ReactNode } from 'react';

import { FaultBoundary } from '@/components/chrome/fault-boundary';

import { GanttDataError } from './gantt-geometry';

/**
 * The one kind of failure this panel discloses its own words for.
 *
 * {@link GanttDataError}'s messages are sentences this module's own source writes over
 * identifiers the payload already carried — `slice x is under step y, which this plan does
 * not list` — so they disclose nothing the reader did not send. Everything else reaching
 * this boundary is unmodelled, and gets the public report's generic message instead.
 *
 * @param thrown The caught value.
 * @returns The panel's own sentence, or `null` for anything else.
 */
function ganttWords(thrown: unknown): string | null {
  return thrown instanceof GanttDataError ? thrown.message : null;
}

interface GanttFaultProps {
  /**
   * Which tree read the children are drawing.
   *
   * The reset key, and it must be the identity of the **read** rather than of
   * the panel: `layOutGantt` throws on a payload whose slices name something
   * the payload has not got, and the commonest way to get one is a peer's edit
   * landing between two of this client's reads. That skew is transient by
   * construction — the next whole read has neither half of it — so a boundary
   * that latched would turn a moment into a panel nobody can reopen without
   * reloading the page.
   */
  generation: number;
  children: ReactNode;
}

/**
 * The error boundary the Gantt panel's throws are thrown into, and nothing
 * else's.
 *
 * **It wraps the panel alone, deliberately.** The chart is the explicitly
 * optional feature AGENTS.md's degradation clause is about: the plan above it
 * is the editor, it is what the reader came for, and a chart that cannot be
 * drawn must cost them a chart rather than a page. A boundary any higher would
 * take the table down with the drawing.
 *
 * **The fallback says why.** {@link GanttDataError}'s messages are sentences
 * naming the slice and what it promised — `slice x is under step y, which this
 * plan does not list` — and they are the only description anybody has of a skew
 * that is over by the time it is read about. Printing "something went wrong"
 * over them would throw away the one artefact of the fault.
 *
 * **And it resets itself.** React never retries a boundary on its own: once
 * caught, the fallback stands until the boundary's state is cleared or it is
 * remounted. `generation` is the {@link FaultBoundary.resetKey}, and it moves on
 * every landed tree read, so the next refetch clears the fault and the panel
 * redraws.
 *
 * The machinery is {@link FaultBoundary}, shared with the root boundary since
 * 2026-09-02; what is here is this boundary's own scope and its own sentence.
 */
export function GanttFaultBoundary({ generation, children }: GanttFaultProps): ReactNode {
  return (
    <FaultBoundary
      logAs="the Gantt panel could not draw this plan"
      discloses={ganttWords}
      resetKey={generation}
      fallback={(fault) => (
        <section data-gantt-fault aria-label="Gantt chart" className="border-border border-t p-3">
          <p role="status" className="text-sm">
            The chart cannot be drawn: {fault.sentence}. The plan itself is unaffected, and the next
            read of it draws the chart again.
          </p>
          {/*
           * The same handle the root's fallback shows, for the same reason: a reader who
           * reports a chart that will not draw has one thing to quote, and it is the
           * identifier the console line beside it carries.
           */}
          <p className="text-muted-foreground font-mono text-xs" data-gantt-fault-reference>
            Reference {fault.occurrenceId}
          </p>
        </section>
      )}
    >
      {children}
    </FaultBoundary>
  );
}
```

## Appendix D1 — slice 2's cases, appended to `app-fault.test.tsx`

```tsx
describe('what a caught fault discloses', () => {
  /** A failure carrying everything a diagnostic report would want and a page may not have. */
  const secretBearing = (): Error =>
    new Error('saving plan p-7 for alice@example.com failed', {
      cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
    });

  itDom('puts neither the message, the cause nor a stack into the DOM', () => {
    render(
      <AppFaultBoundary>
        <ThrowingValue thrown={secretBearing()} />
      </AppFaultBoundary>,
    );

    const page = document.body.innerHTML;
    for (const raw of ['alice@example.com', 'Bearer live-token', 'row 42 of plan_steps', 'p-7']) {
      expect(page, raw).not.toContain(raw);
    }
    expect(appFaultWords()).toContain('Something went wrong');
  });

  itDom('logs the boundary, the disclosed sentence and the reference, and nothing else', () => {
    render(
      <AppFaultBoundary>
        <ThrowingValue thrown={secretBearing()} />
      </AppFaultBoundary>,
    );

    // React writes its own `console.error` for every caught fault, so this
    // boundary's line is found by what it says rather than by position.
    const ours = logged.mock.calls.filter((call) => call[0] === 'the app could not render');
    expect(ours).toHaveLength(1);
    expect(ours[0]).toEqual([
      'the app could not render',
      'Something went wrong',
      expect.any(String),
      'nothing',
    ]);
    expect(String(ours[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });

  itDom('shows the same reference on the page as it logged', () => {
    render(
      <AppFaultBoundary>
        <ThrowingValue thrown={secretBearing()} />
      </AppFaultBoundary>,
    );

    const logLine = logged.mock.calls.find((call) => call[0] === 'the app could not render');
    expect(appFaultWords()).toContain(String(logLine?.[2]));
  });

  itDom('discloses the chart’s own modelled sentence and no other error’s', () => {
    render(
      <GanttFaultBoundary generation={1}>
        <ThrowingValue thrown={secretBearing()} />
      </GanttFaultBoundary>,
    );

    expect(chartFaultWords()).toContain('Something went wrong');
    expect(chartFaultWords()).not.toContain('alice@example.com');
  });
});
```

## Appendix D2 — slice 3's cases, appended to `app-fault.test.tsx`

```tsx
describe('what React itself is allowed to say', () => {
  itDom('says nothing of its own about a fault a boundary already reported', () => {
    // react-dom writes the thrown error and its stack to `console.error` for every caught
    // fault, production build included — watched in Chromium, 2026-09-20. The boundary has
    // already reported it, naming which boundary caught it, so the root's handler is
    // silent rather than saying the same event again with less in it.
    expect(ROOT_FAULT_OPTIONS.onCaughtError?.(new Error('alice@example.com'), {})).toBeUndefined();
    expect(logged.mock.calls).toHaveLength(0);
  });

  itDom('discloses a public report for a fault no boundary caught', () => {
    ROOT_FAULT_OPTIONS.onUncaughtError?.(new Error('alice@example.com'), {});

    expect(logged.mock.calls).toHaveLength(1);
    expect(logged.mock.calls[0]).toEqual([
      'no boundary caught this',
      'Something went wrong',
      expect.any(String),
      'nothing',
    ]);
    expect(String(logged.mock.calls[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });

  itDom('discloses a public report for a fault React recovered from', () => {
    ROOT_FAULT_OPTIONS.onRecoverableError?.(new Error('alice@example.com'), {});

    expect(logged.mock.calls).toHaveLength(1);
    expect(logged.mock.calls[0]).toEqual([
      'React recovered from this',
      'Something went wrong',
      expect.any(String),
      'nothing',
    ]);
    expect(String(logged.mock.calls[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });
});

/** Every root {@link renderInProductionRoot} made, unmounted after each case. */
const productionRoots: ReturnType<typeof createRoot>[] = [];

afterEach(() => {
  for (const root of productionRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
});

/**
 * Render through a root created exactly as `main.tsx` creates the application's.
 *
 * `@testing-library`'s `render` builds its own root with react-dom's **default** handlers,
 * and those handlers read the caught value: a revoked proxy thrown under a boundary made
 * React's own default throw `TypeError: Cannot perform 'get' on a proxy that has been
 * revoked` out of the render, with no fallback of either kind on screen (watched
 * 2026-09-20). That safety is a property of {@link ROOT_FAULT_OPTIONS}, and it can only be
 * asserted through a root that has them.
 *
 * @param element What to render.
 * @returns The host element, so a case can read what was drawn into it.
 */
function renderInProductionRoot(element: ReactNode): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host, ROOT_FAULT_OPTIONS);
  productionRoots.push(root);
  act(() => {
    root.render(element);
  });
  return host;
}

describe('a caught value that cannot be inspected', () => {
  /**
   * A `GanttDataError` whose `message` throws when it is read.
   *
   * An **own** accessor, defined on the instance: `Error`'s constructor writes `message` as
   * an own data property, so a `get message()` on a subclass prototype is shadowed and
   * never runs (watched 2026-09-20 — the case read `never read` instead of throwing).
   *
   * @returns The hostile value, ready to throw.
   */
  const withAThrowingMessage = (): GanttDataError => {
    const hostile = new GanttDataError('never read');
    Object.defineProperty(hostile, 'message', {
      get: () => {
        throw new Error('selector accessor ran');
      },
    });
    return hostile;
  };

  itDom('keeps a throwing message getter inside the chart’s boundary', () => {
    // The fault this is here to stop: `ganttWords` reads `thrown.message`, and a throw
    // inside `componentDidCatch` is not caught by the boundary already handling the fault
    // — it escapes upward, and the chart takes the page with it. Reporting itself survives
    // this value, because `inspection: 'no-invoke'` reports the property as
    // `[not-inspected]`, so only the selector is exposed.
    renderInProductionRoot(
      <AppFaultBoundary>
        <p>the editor</p>
        <GanttFaultBoundary generation={1}>
          <ThrowingValue thrown={withAThrowingMessage()} />
        </GanttFaultBoundary>
      </AppFaultBoundary>,
    );

    expect(chartFaultWords()).toContain('Something went wrong');
    expect(chartFaultWords()).not.toContain('selector accessor ran');
    // The page is still there, which is what a throw out of `componentDidCatch` costs.
    expect(appFaultWords()).toBeNull();
    expect(screen.getByText('the editor')).toBeDefined();
    const ours = logged.mock.calls.filter(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(ours).toHaveLength(1);
    expect(ours[0][3]).toBe('the selector');
  });

  itDom('names the reporting loss in the console and gives it a handle', () => {
    // `toReports` throws on a revoked `Proxy` as a cause — `@shared/failures` models that
    // as `reported: false`, and this is the boundary's half of it: fixed text, a local
    // handle, and no second attempt to read the value that already defeated the reporter.
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    renderInProductionRoot(
      <GanttFaultBoundary generation={1}>
        <ThrowingValue thrown={new Error('boom', { cause: proxy })} />
      </GanttFaultBoundary>,
    );

    const ours = logged.mock.calls.filter(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(ours).toHaveLength(1);
    expect(ours[0]).toEqual([
      'the Gantt panel could not draw this plan',
      'the failure could not be described',
      expect.any(String),
      'the report',
    ]);
    expect(String(ours[0][2])).toMatch(/^UNREPORTED_\d+$/);
    expect(chartFaultWords()).toContain(String(ours[0][2]));
  });

  itDom('shows the chart’s own reference, matching what it logged', () => {
    renderInProductionRoot(
      <GanttFaultBoundary generation={1}>
        <ThrowingGanttData words="slice sanding names a predecessor this payload has not got" />
      </GanttFaultBoundary>,
    );

    const logLine = logged.mock.calls.find(
      (call) => call[0] === 'the Gantt panel could not draw this plan',
    );
    expect(document.querySelector('[data-gantt-fault-reference]')?.textContent).toBe(
      `Reference ${String(logLine?.[2])}`,
    );
  });
});
```

## Appendix E — `apps/wbs/fe-01/src/main.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest';

import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';

/**
 * The real `createRoot`, replaced for this file.
 *
 * `main.tsx` is a module with one side effect — it creates the application's root and
 * renders into it — so the only way to assert what it passes is to be the thing it calls.
 * `render` is a no-op here on purpose: what is under test is the root's construction, not
 * the tree, which every other suite in this app already covers.
 */
const createRoot = vi.hoisted(() =>
  vi.fn((_container: Element | DocumentFragment, _options?: unknown) => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
);

vi.mock('react-dom/client', () => ({ createRoot }));

describe('the application’s root', () => {
  it('is created with the options that keep a fault out of the console', async () => {
    // Without this case the whole disclosure rule is one deleted argument away from being
    // undone with every other test still green: `ROOT_FAULT_OPTIONS` can be complete and
    // correct while nothing passes it to the root the application actually runs in.
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main');

    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(createRoot.mock.calls[0][0]).toBe(document.getElementById('root'));
    expect(createRoot.mock.calls[0][1]).toBe(ROOT_FAULT_OPTIONS);
  });
});
```

## Appendix F — `apps/wbs/fe-01/src/components/chrome/root-fault-options.ts`

```ts
import type { RootOptions } from 'react-dom/client';

import { discloseFault } from './fault-disclosure';

/**
 * What React itself does with a fault, and the second half of the disclosure rule.
 *
 * **React logs the caught error whatever a boundary does, in a production build.** Left at
 * its default, `react-dom` writes `Error: <the thrown message>` and a stack to
 * `console.error` for every error a boundary catches — observed in Chromium on the shipped
 * Vite build, 2026-09-20, as `Error: saving plan p-7 for alice@example.com failed\n    at
 * De (<anonymous>:13:20104)…`. So a boundary that discloses only a public report still
 * leaves the raw message in the console beside it, and the browser console is a disclosure
 * boundary exactly as the page is.
 *
 * Every root in this application is created with these options for that reason.
 *
 * - `onCaughtError` is deliberately silent. A caught fault has already been reported by
 *   {@link import('./fault-boundary').FaultBoundary}, which names *which* boundary caught
 *   it; a second line here would be the same event twice, with less in it.
 * - `onUncaughtError` and `onRecoverableError` are the faults no boundary reported, so they
 *   say so here — as the public report's generic sentence, its occurrence id and what was
 *   lost deciding them, and never as the caught value. The four-argument shape is the same
 *   as {@link import('./fault-boundary').FaultBoundary}'s, so a caught value appended to
 *   either is a failed assertion rather than a longer line nobody reads.
 *
 * **They also keep a hostile caught value from killing the page.** react-dom's default
 * handlers read the thrown value: a revoked `Proxy` thrown under a boundary made React's own
 * default throw `TypeError: Cannot perform 'get' on a proxy that has been revoked` out of the
 * render, with no fallback of either kind on screen (watched under jsdom, 2026-09-20).
 * {@link discloseFault} never reads the value directly, so these handlers do not.
 */
export const ROOT_FAULT_OPTIONS: RootOptions = {
  onCaughtError: () => undefined,
  onUncaughtError: (thrown: unknown) => {
    const fault = discloseFault(thrown);
    console.error('no boundary caught this', fault.sentence, fault.occurrenceId, fault.lost);
  },
  onRecoverableError: (thrown: unknown) => {
    const fault = discloseFault(thrown);
    console.error('React recovered from this', fault.sentence, fault.occurrenceId, fault.lost);
  },
};
```

## Appendix G — the whole `build` property in `browser-probe-bundle.ts`

```ts
    build: {
      write: false,
      rollupOptions: { input: resolve(appRoot, entry) },
      // The shipped config splits React and the router into a `vendor` chunk, which is
      // right for a deployed application and wrong for a probe: a page served from one
      // `addScriptTag` cannot load three files. The split is off for this build alone;
      // every plugin, alias and resolve condition is still the shipped config's, which is
      // what these probes are about.
      //
      // `codeSplitting: false` and not an empty `groups` array: Vite merges an inline
      // config into the file's by concatenating arrays, so `groups: []` left the shipped
      // `vendor` group exactly where it was.
      rolldownOptions: {
        input: resolve(appRoot, entry),
        output: { codeSplitting: false },
      },
    },
```

## Appendix H — `apps/wbs/fe-01/e2e/fault-boundary-probe.ts`

```ts
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';

/**
 * What one run of the app's root fault boundary in a real browser put on the page.
 *
 * The console is not in here: Playwright listens to it from outside the page, which is the
 * only reading that includes React's own lines as well as the boundary's.
 */
export interface FaultBoundaryProof {
  /** Everything the boundary rendered, as text. */
  readonly pageText: string;
  /** Everything the boundary rendered, as markup: attributes as well as text. */
  readonly markup: string;
  /** The occurrence identifier the page disclosed, or null if it disclosed none. */
  readonly reference: string | null;
}

/**
 * The fault this probe throws.
 *
 * Its three literal strings are what `fault-boundary.spec.ts` searches the document and the
 * console for: a personal identifier in the message, a credential on the cause and an
 * internal locator beside it. String literals, because the shipped config builds this probe
 * minified and an identifier would not survive that — a marker that cannot appear is a
 * search that cannot fail.
 */
function throwInsideAComponent(): never {
  throw new Error('saving plan p-7 for alice@example.com failed', {
    cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
  });
}

/** A component that throws the moment it renders, the way an impossible union does. */
function Throwing(): never {
  return throwInsideAComponent();
}

/**
 * Render the shipped root boundary over a throwing child and read what the document says.
 *
 * Deliberately the production component **and** the production root options from `src/`,
 * through the deployed Vite config, and not a copy: a probe over its own boundary would keep passing while the app's grew a raw
 * message. `flushSync` is not used — `createRoot().render` is asynchronous, so the caller
 * waits for the fallback rather than for a frame count.
 *
 * @returns What the page carried once the fallback had rendered.
 */
async function proveTheBoundaryDisclosesNothingRaw(): Promise<FaultBoundaryProof> {
  const host = document.createElement('div');
  document.body.append(host);
  // `createElement` and not JSX, so that this probe stays a `.ts` file: the e2e tsconfig
  // and Playwright's `testMatch` both name `.ts`, and one `.tsx` here would need both
  // widened for two calls.
  createRoot(host, ROOT_FAULT_OPTIONS).render(
    createElement(AppFaultBoundary, null, createElement(Throwing)),
  );
  const deadline = Date.now() + 10_000;
  while (host.querySelector('[data-app-fault]') === null) {
    if (Date.now() > deadline) throw new Error('the root fault boundary never rendered');
    await new Promise((settle) => setTimeout(settle, 10));
  }
  const reference = host.querySelector('[data-app-fault-reference]')?.textContent ?? null;
  return {
    pageText: host.textContent,
    markup: host.innerHTML,
    reference: reference === null ? null : reference.replace('Reference ', ''),
  };
}

// The cast names the one boundary this file has: a bundled module and the page that loads it
// share nothing but this global, and `globalThis` is typed without it.
(globalThis as unknown as { faultBoundaryProof: Promise<FaultBoundaryProof> }).faultBoundaryProof =
  proveTheBoundaryDisclosesNothingRaw();
```

## Appendix I — `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`

```ts
import { expect, test } from '@playwright/test';

import { buildBrowserProbeBundle } from './browser-probe-bundle';
// A type-only import, and it has to stay one: Playwright loads a spec in Node, so a value
// imported from the probe would execute the probe here and fail on `document is not
// defined` before a browser existed. Watched 2026-09-20.
import type { FaultBoundaryProof } from './fault-boundary-probe';

/**
 * Strings that exist only inside the thrown value, and must therefore exist nowhere else.
 *
 * Kept here rather than exported from the probe for the reason above, and written out
 * rather than derived: `fault-boundary-probe.ts` throws exactly these.
 */
const RAW_MARKERS = ['alice@example.com', 'Bearer live-token', 'row 42 of plan_steps'];

/**
 * An origin nothing serves, fulfilled by the route below.
 *
 * `https`, so the page is a secure context and `crypto.getRandomValues` exists — which is
 * what nanoid's browser variant, and therefore every occurrence identifier, needs.
 * `browser-packages.spec.ts` bootstraps its own bundle the same way and for the same reason.
 */
const bootstrap = 'https://fault-boundary-probe.invalid/';

test('the root fault boundary discloses a public report and nothing raw', async ({ page }) => {
  // One budget for the whole case — the routed page, the Vite build of the probe and its
  // execution — rather than the config's 60 seconds, because a case that bundles the app is
  // not a case that only clicks.
  test.setTimeout(120_000);
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on('console', (line) => {
    consoleLines.push(line.text());
  });
  page.on('pageerror', (thrown) => {
    pageErrors.push(String(thrown));
  });
  await page.route('**/*', async (route) => {
    if (route.request().url() === bootstrap) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>fault boundary probe</title>',
      });
      return;
    }
    unexpectedRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  await page.goto(bootstrap);

  const bundle = await buildBrowserProbeBundle('e2e/fault-boundary-probe.ts');
  await page.addScriptTag({ content: bundle.code, type: 'module' });
  const proof = await page.evaluate(
    async () =>
      await (globalThis as unknown as { faultBoundaryProof?: Promise<FaultBoundaryProof> })
        .faultBoundaryProof,
  );

  // Two things at once, and the second is task 3.1's browser-portability half. The
  // boundary caught the fault, so nothing reached the page's own error handler — a throw
  // that escaped would make every assertion below vacuous. And the reporting module's
  // executed import closure reached no Node built-in: Vite does not fail such a build, it
  // substitutes a stub that throws when the page loads it, and that throw arrives here.
  //
  // `externalizedForBrowser` is deliberately **not** asserted here, although
  // `browser-packages.test.ts` asserts it over its own entry. In this probe's graph a
  // Node-only import is bundled under the module id `__vite-browser-external`, with no
  // `:<specifier>` suffix for the helper to report, so the list stays empty and the
  // assertion could not fail (watched three ways, 2026-09-20). A check that cannot fail is
  // worse than none.
  expect(pageErrors).toEqual([]);
  expect(proof?.pageText).toContain('The app stopped: Something went wrong');
  expect(proof?.reference).toMatch(/^AE_[0-9A-Z]+$/);
  // The boundary's own rendered subtree, markup and all, and **not** `page.content()`:
  // the probe is injected with `addScriptTag`, so the whole document contains the probe's
  // own source and therefore every marker in it. Watched 2026-09-20 — the document-wide
  // form failed here on all three markers against a page that disclosed none of them.
  expect(RAW_MARKERS.filter((marker) => proof?.markup.includes(marker) ?? true)).toEqual([]);

  // The console is a disclosure boundary too, and in a real browser it carries React's own
  // lines as well as the boundary's. Every line is read, not only the one this code wrote.
  const whole = consoleLines.join('\n');
  expect(RAW_MARKERS.filter((marker) => whole.includes(marker))).toEqual([]);
  expect(consoleLines).toContain(
    `the app could not render Something went wrong ${String(proof?.reference)} nothing`,
  );

  // The bounded settle before the request assertion, and the reason it is not
  // superstition, are in `portable-composition.spec.ts`: without it the assertion races
  // the route callback and an injected request passes.
  await page.waitForTimeout(50);
  // The reporting path must reach no origin at all: `@shared/failures` is framework-free
  // and this application adds no browser telemetry endpoint.
  expect(unexpectedRequests).toEqual([]);
});
```

## Appendix J — the three delta requirements

The text below is what was validated on 2026-09-21; it goes at the end of
`openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`.

```markdown
### Requirement: A browser fault boundary discloses a public report and nothing raw

A caught render fault SHALL disclose the public report's generic message and its occurrence identifier, and SHALL disclose neither the caught value's message, nor its cause, nor a stack to the page or to the browser console.

#### Scenario: A secret-bearing render fault reaches the root boundary

- **GIVEN** a component that throws an error whose message and cause carry a personal identifier, a credential and an internal locator
- **WHEN** the root fault boundary catches it in a browser
- **THEN** the page shows the generic public message and the occurrence identifier
- **AND** neither the rendered markup nor any browser console line contains the message, the cause or a stack

#### Scenario: A modelled chart fault is disclosed by its own kind

- **GIVEN** a chart data fault whose sentence its own module composed
- **WHEN** the chart's fault boundary catches it
- **THEN** the panel shows that sentence and the occurrence identifier
- **AND** an unmodelled error caught by the same boundary shows the generic public message instead

### Requirement: Deciding what a fault discloses never throws

Deciding what a caught fault discloses SHALL model a failure to inspect the caught value as an outcome carrying fixed text and a correlation handle, and SHALL NOT raise a second failure out of the boundary that is already handling the first.

#### Scenario: Reporting cannot describe the caught value

- **GIVEN** a caught value whose inspection makes the reporter throw
- **WHEN** a fault boundary decides what to disclose
- **THEN** the boundary renders fixed text and a local correlation handle
- **AND** the boundary above it renders nothing

#### Scenario: A kind's disclosure selector throws

- **GIVEN** a caught value whose own message throws when it is read
- **WHEN** the boundary's disclosure selector is applied to it
- **THEN** the boundary renders the generic public message
- **AND** the console line names the selector as what was lost

### Requirement: The shared reporting module executes in a browser

The shared failure reporting module SHALL produce both reports inside a browser, built through the frontend's shipped bundler configuration, without a Node built-in in its executed import closure.

#### Scenario: The module reports a failure in Chromium

- **GIVEN** the frontend's shipped bundler configuration
- **WHEN** a probe importing the shared reporting module runs in Chromium
- **THEN** it produces a public report carrying an occurrence identifier
- **AND** the page raises no error and requests no unexpected origin
```

## Appendix K — the two task edits

In `openspec/changes/adopt-failure-reporting/tasks.md`, task `3.1` keeps its existing text and its
Node-only-global negative, and gains this packet's command. Replace its trailing
"**unassigned:** …" clause with ", run as `CI=1 NX_DAEMON=false bunx nx run wbs-fe-01:e2e --
e2e/fault-boundary.spec.ts`, which builds the app's own root fault boundary through
`vite.config.ts` and runs it in Chromium". Leave the box **unchecked** until slice 5.

Then add this section, with its box unchecked:

```markdown
## 4. Frontend fault boundary (needs 1.1)

- [ ] 4.1 Disclose a public report and an occurrence identifier from both frontend fault boundaries, keep react-dom's own raw console line out, and make deciding a disclosure incapable of throwing — test: `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`, `src/main.test.tsx` and the Chromium case above; negatives: disclose the caught value's message, log the caught value, drop the occurrence identifier, drop the chart's own disclosure selector, widen that selector to every error, drop the root options argument in `main.tsx`, remove `onCaughtError` from those options, call the selector before the reporting-loss return, remove the selector guard, reach an unexpected origin, and drop the `@shared/failures` alias from the suite config
```

## Disposition of review 1

**Critical.**

1. **Uncompilable literal edit (slice 4.1 / Appendix E).** FIXED. Step 4.1 now says to replace the
   **whole `build` property**, identifies its opening and closing lines, and states the exact
   compiler diagnostic the wrong edit produces. The block is Appendix G.
2. **The disclosure function throws (Appendix A).** FIXED, and it was worse than reported: the
   throw escapes `componentDidCatch` and React's own state is left corrupted (`Error: Should not
already be working.`), so the chart's fault takes the page. `discloseFault` now returns the
   reporting-loss outcome **before** any selector runs, guards the selector call, and models both
   losses in `DisclosedFault.lost`, which every console line carries. Three cases in Appendix D2
   cover it and N9, N10 and N12 break it. One correction to the finding: a revoked `Proxy` thrown
   _as_ the value never reaches a boundary — React's `handleThrow` reads it first (verified fact 10) — so the reachable hostile values are a throwing own accessor and an unreportable cause, and
   an `Error` subclass cannot even install such an accessor on its prototype (fact 11).
3. **The browser proof bypassed `main.tsx`.** FIXED. `src/main.test.tsx` (Appendix E) asserts the
   root's construction, and N7 removes the second argument and watches it fail. N12 stays as the
   handler-content proof.
4. **An occupied port authorized killing an unidentified process.** FIXED. Step 4.6 requires
   `ss -ltn` first, a shift whose three ports are free and 300 clear of every other run, and proof
   of ownership through `/proc/<pid>/cwd` or a recorded PID before any termination; otherwise move.

**Important.**

1. **No chart occurrence identifier.** FIXED. `gantt-fault.tsx` (Appendix C) renders
   `data-gantt-fault-reference`, a case in Appendix D2 matches it to the chart's console line, and
   Appendix J's chart scenario now says "that sentence **and the occurrence identifier**".
2. **Implementation before the failing tests.** FIXED. Slice 1 now edits `vite-config.test.ts`
   first and names its red (`1 failed | 17 passed (18)`); slice 3 writes `main.test.tsx` and the
   handler cases first and names both reds. Every red and green is relative to a baseline the same
   slice records.
3. **Specification and evidence too late.** FIXED. A new slice 0 adds and validates the
   requirements and the unchecked task before any code; every slice appends to `verify.md` before
   handing over; slice 5 ticks 3.1 and 4.1 only after their checks pass, and names `--seed` for
   earlier evidence.
4. **G2 ownership, and the per-slice digest claim.** FIXED and the claim corrected. The packet now
   has a "G2 owns both pins" section, gives the executor no instruction touching either file, adds
   stop condition 6, and states both orderings. Measured: only slice 1 moves either pin, the digest
   only through `vite-config.test.ts`'s three `LEGACY_ROOT` lines shifting, and the inventory's
   **file** count does not move at all.
5. **Preflight and baselines.** FIXED. Initial-tree checks are scoped to slice 1; slices 2, 3, 4
   and 5 each carry a predecessor-state pre-edit check; slices 4 and 5 gained `4.0` and `5.0`; the
   neighbour totals are recorded in 2.0 and compared in 2.13.
6. **R5 coverage of the new reporting paths.** FIXED. Reporting loss has a boundary-level case
   asserting the fixed text, the `UNREPORTED_n` handle and the matching page text; every console
   assertion is now the complete four-argument tuple, so appending the caught value or dropping the
   identifier fails; N1 gained its `Proof:` comment.
7. **The browser fixture did not enforce no-unexpected-request, and task 3.1's negative was
   replaced.** FIXED. The spec collects unexpected requests, settles, and asserts the list is
   empty, with N14 as the watched fetch mutation; task 3.1 keeps its Node-only-global negative,
   which is N11. One correction: it is asserted through `pageErrors`, not
   `externalizedForBrowser` — over this probe's graph that list cannot be made non-empty (verified
   fact 13), and a check that cannot fail is worse than none. 040.1's own use of it still breaks
   exactly as its comment says.
8. **Pre-written proof comments.** FIXED. Every listing the executor writes is free of them, and
   4.7 tells the planner which comment goes where after which observation, including the replay of
   Appendix G's chunk-count behaviour.

**Minor.** 1. The stray `</p>;` — FIXED, and step 2.11 says why. 2. Line anchors — FIXED: facts 1
and 2 now name 93 and 54. 3. Identifier generation — FIXED: verified fact 7 records the measured
per-object behaviour and the Unknowns section keeps `StrictMode` explicitly unmeasured. 4. N1's
command — FIXED: step 1.8 gives it.

**Rejected:** nothing outright. Two findings were accepted with a measured correction, both stated
above: the reachable hostile values in Critical 2, and the enforcement mechanism in Important 7.
