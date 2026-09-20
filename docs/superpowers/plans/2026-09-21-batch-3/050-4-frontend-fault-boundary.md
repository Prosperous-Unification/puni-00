# 050.4 — Frontend fault boundary: public report only, nothing raw in the DOM or console

**Work item:** WBS 050.4. **Size:** L, five slices. **Design:** the frontend half of slice 3 of
the [package adoption plan](../2026-09-17-personal-package-adoption.md) plus the unassigned
browser-fixture box of its slice 2, under the existing OpenSpec change `adopt-failure-reporting`.

The execution contract, the standard blocks and the hidden frontend constraints are in
[the batch 1 README](../2026-09-19-batch-1/README.md): **Execution contract**, **Standard blocks
every packet uses** (OpenSpec validation, Running one named test, Formatting, Saving a mutation
patch, Negative proofs with a restore, Frontend tests inside the sandbox) and **Hidden constraints
every frontend packet must respect**. They are not repeated here. Read them, then
`/home/df/wd/puni/puni-plan/exec/executor-preamble.txt` rules 1 to 20, then this packet in full.

## Goal and non-goals

**Goal.** A render fault in `wbs-fe-01` discloses the public report's generic message and its
occurrence identifier, and nothing read from the caught value — not to the DOM, not to the browser
console, and not through react-dom's own default handler. The chart's boundary keeps disclosing
its own modelled sentence, by an explicit selector rather than by accident. A Chromium case proves
it on the shipped Vite build, and that case is also the browser execution fixture `@shared/failures`
has been owed since 020.2.

**Non-goals.** No browser telemetry endpoint and no operator sink: the diagnostic report is built
and dropped, visibly (see Assumption A1). `GanttDataError` is not migrated to `defineException`
(A2). No DI Bag in the frontend. No change to loading, empty, refusal or query-failure states,
which are rendered states and not faults. No change to `wbs-observability`, the backend or the MCP
server — those are 040.5's and packet 2.1's.

## Read first

| File                                                             | Why                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx`        | The shared machinery both boundaries are; this packet rewrites it |
| `apps/wbs/fe-01/src/components/chrome/app-fault.tsx`             | The root boundary's own scope and fallback                        |
| `apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`              | The chart's boundary, and the one selective disclosure            |
| `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`        | The six cases that assert today's behaviour                       |
| `libs/shared/domain/failures/src/report-failure.ts`              | `reportFailure`, `createFailureRedaction` and their JSDoc         |
| `apps/wbs/fe-01/e2e/browser-packages-probe.ts` and its two peers | 040.1's pattern: a probe, a bundle helper and a Chromium spec     |
| `apps/wbs/fe-01/vite-config.test.ts`, the alias cases            | The exact map this packet adds a key to                           |

## Verified facts, checked in this repository on 2026-09-20

1. `fault-boundary.tsx:92` returns `{ message: faultWords(thrown) }`, and `faultWords` (line 24)
   returns `thrown.message` for any `Error`. `fault-boundary.tsx:112` is
   `console.error(this.props.logAs, thrown, info.componentStack)`. So today the caught value's own
   message reaches the DOM and the caught value itself reaches the console.
2. `app-fault.tsx:57` renders `The app stopped: {message}` and `gantt-fault.tsx:55` renders
   `The chart cannot be drawn: {message}`.
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
6. **Probed on Bun 1.4.2**, `reportFailure(new Error('DB row 42 for alice@example.com failed,
token hunter2'), { redact: createFailureRedaction(['hunter2']) })` returns
   `reports.public` = `{ v: 'appex/public/v4', occurrence_id: 'AE_…', fingerprint: 'fp1_…',
code: 'INTERNAL_ERROR', message: 'Something went wrong' }`. The public report of an untyped
   `Error` carries **no** content read from the caught value, and its `occurrence_id` equals the
   diagnostic's. Occurrence identifiers match `/^AE_[0-9A-Z]+$/`.
7. **Probed in Chromium on the shipped Vite build (observed 2026-09-20).** react-dom writes the
   caught error to `console.error` itself, in a production build, whatever a boundary does. The
   console carried exactly two lines:
   `"Error: saving plan p-7 for alice@example.com failed\n    at De (<anonymous>:13:20104)…"`
   and the boundary's own. **A boundary alone therefore cannot keep the console clean**; the root
   has to be created with `onCaughtError`. This is the fact slice 3 exists for.
8. `apps/wbs/fe-01/e2e/browser-packages-bundle.ts` hard-codes its entry
   (`const PROBE_ENTRY = resolve(appRoot, 'e2e/browser-packages-probe.ts')`) and has exactly two
   callers: `e2e/browser-packages.spec.ts:3` and `browser-packages.test.ts:9`.
9. The field names 040.5 uses — `occurrence_id`, `fingerprint`, reports nested under one object,
   and `reported: false` handles — are the library's and this packet does not rename any of them.
10. `test-tiers.test.ts` walks `src/**` and the app root for `*.test.ts(x)`; it does **not** walk
    `e2e/`. This packet adds no test file under `src/` and no root `.ts`, so `NODE_SUITES`, the
    tier partition and the `lint`/`lint:fast` input lists are untouched.

## Unknowns

- Whether `getDerivedStateFromError` is double-invoked under `StrictMode` in React 19.2 was not
  measured. It does not matter: each invocation mints its own occurrence id, only the committed
  state is rendered, and `componentDidCatch` logs the id it computes itself.
- Whether a minified stack frame can carry a raw identifier was not tested; the Chromium case
  searches for three string literals, which minification preserves, and says so.

## Assumptions recorded instead of asked

- **A1. There is no sink, and the diagnostic report is dropped.** The adoption plan's third
  reporting requirement says in terms: "Browser consoles and agent transcripts are disclosure
  boundaries too… There is no new browser telemetry endpoint in this plan." So the browser has
  nowhere to deliver an operator record. `discloseFault` therefore keeps only the public report,
  and the occurrence identifier is a handle to a record that does not exist yet — it still
  correlates the sentence on screen with the console line beside it. This is written into
  `discloseFault`'s JSDoc so the next reader does not mistake it for an oversight.
- **A2. `GanttDataError` keeps its class and gains a disclosure selector.** The plan forbids
  automatically replacing existing typed failures, and the class has ten throw sites in
  `gantt-geometry.ts`. Its messages are composed by that module over identifiers the payload
  already carried, so they are public by construction; the chart's boundary selects them through
  one named function, and every other value reaching the same boundary gets the generic message.
  Slice 2's last case proves the "every other value" half.
- **A3. The root boundary's `onCaughtError` is silent.** A caught fault has already been reported
  by the boundary, which also names _which_ boundary caught it. A second line would be the same
  event with less in it. This is not log-and-continue: nothing is swallowed, and slice 3's second
  and third cases prove the uncaught and recoverable paths do speak.
- **A4. The secret list is empty.** `createFailureRedaction([])` — this app owns no secret value:
  its session token lives in an `HttpOnly` cookie the document cannot read. The key rules of
  `@shared/failures` stay in force regardless.
- **A5. Probe builds disable code splitting.** The shipped config splits React into a `vendor`
  chunk, and a probe served from one `addScriptTag` cannot load three files. See slice 4.

## File plan

| File                                                                            | Create/modify | Responsibility                                                  |
| ------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| `apps/wbs/fe-01/tsconfig{,.app,.spec,.e2e}.json`                                | modify        | The `@shared/failures` path, one line each                      |
| `apps/wbs/fe-01/vite.config.ts`, `vitest.config.ts`                             | modify        | The same alias in both resolve maps                             |
| `apps/wbs/fe-01/vite-config.test.ts`                                            | modify        | The alias in `expected`, and one `toContain`                    |
| `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`                      | create        | What a caught value discloses, and nothing else                 |
| `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx`                       | modify        | State and callbacks carry a disclosure, not a message           |
| `apps/wbs/fe-01/src/components/chrome/app-fault.tsx`                            | modify        | Generic sentence plus a reference paragraph                     |
| `apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`                             | modify        | The `GanttDataError` disclosure selector                        |
| `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx`                       | modify        | Four edited cases, seven new ones                               |
| `apps/wbs/fe-01/src/components/chrome/root-fault-options.ts`                    | create        | react-dom's own handlers, so the console stays clean            |
| `apps/wbs/fe-01/src/main.tsx`                                                   | modify        | Create the app's root with those options                        |
| `apps/wbs/fe-01/e2e/browser-packages-bundle.ts`                                 | rename        | To `browser-probe-bundle.ts`, taking its entry as an argument   |
| `apps/wbs/fe-01/e2e/browser-packages.spec.ts`                                   | modify        | Its one call site                                               |
| `apps/wbs/fe-01/browser-packages.test.ts`                                       | modify        | Its import, type name and one call site                         |
| `apps/wbs/fe-01/e2e/fault-boundary-probe.ts`                                    | create        | The production boundary rendered in a browser                   |
| `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`                                     | create        | The Chromium case                                               |
| `openspec/changes/adopt-failure-reporting/{specs/…,tasks,verify}`               | modify        | Two requirements, task 3.1 ticked, task 4.1 added, observations |
| `tools/tool-devsync/src/{workspace-inventory,repo-namespacing-handoff}.test.ts` | modify        | Two pins this packet moves — **planner only**, slice 5          |

**Out of lane.** `libs/shared/domain/failures/**` (020.2's, and this packet only imports it);
`libs/wbs/adapters/observability/**` and `apps/wbs/be-01/**` (040.5's); `apps/wbs/fe-01/src/modules/**`
(040.4's); `e2e/browser-packages-probe.ts` (040.1's probe body is unchanged — only its bundle
helper's name and signature move). `apps/wiki/cli/**` is untouched, so the Twilight Bureaucrat
validator identity does not move.

---

## Slice 1 — `@shared/failures` resolves from `wbs-fe-01`

- [ ] 1.0 Record the baseline: run `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run vite-config.test.ts)`
      and write down its test count (expected 18 on the unmodified tree). Write down
      `git rev-parse HEAD`.
- [ ] 1.1 Add this line immediately **above** the `@shared/validation` entry in the `paths` block of
      each of `apps/wbs/fe-01/tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json` and
      `tsconfig.e2e.json`. Four files, one occurrence in each — `@shared/validation` appears exactly
      once per file, so the anchor is unambiguous.

  ```json
  "@shared/failures": ["../../../libs/shared/domain/failures/src/index.ts"],
  ```

- [ ] 1.2 In **both** `apps/wbs/fe-01/vite.config.ts` and `apps/wbs/fe-01/vitest.config.ts`, insert
      the entry below directly after the multi-line `'@shared/validation': resolve(…)` entry. Each
      file contains that entry exactly once.

  ```ts
  // `@shared/failures` is the reporting policy the fault boundaries disclose
  // through; it is `runtime:isomorphic` and has no Node import, so the same
  // module serves the browser build and both test tiers.
  '@shared/failures': resolve(__dirname, '../../../libs/shared/domain/failures/src/index.ts'),
  ```

- [ ] 1.3 In `apps/wbs/fe-01/vite-config.test.ts`, add the same key to the `expected` object,
      directly after its `'@shared/validation': resolve(APP_ROOT, …)` entry:

  ```ts
  '@shared/failures': resolve(APP_ROOT, '../../../libs/shared/domain/failures/src/index.ts'),
  ```

- [ ] 1.4 In the same file, after the existing
      `expect(Object.keys(appAliases)).toContain('@shared/validation');`, add:

  ```ts
  // The fault boundaries import `@shared/failures` for the public report they
  // disclose; without the key in both maps `app-fault.test.tsx` fails to
  // collect rather than failing an assertion.
  expect(Object.keys(appAliases)).toContain('@shared/failures');
  ```

- [ ] 1.5 Verify: `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run vite-config.test.ts)` — 18 tests
      pass, the baseline count unchanged. Then `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` —
      exit 0.

**Negative N1 (slice 1).** Delete the `'@shared/failures'` entry from `vitest.config.ts` only
(leave `vite.config.ts` alone) and run the same two files.

| Fact the proof rests on                                            | Named test                                                                               | Observed 2026-09-20                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The two alias maps must agree or a suite silently stops collecting | `vite-config.test.ts` → `maps every alias to the namespaced source file in both configs` | `AssertionError: expected [ '@', '@shared/validation', …(19) ] to deeply equal [ '@', '@shared/failures', …(20) ]` |

Restore, rerun green, then add no `Proof:` comment: slice 1 changes no safety check of its own, and
`vite-config.test.ts`'s existing proof comments already carry this fault's shape.

**Ready to commit.** `docs(fe-01): resolve @shared/failures from the frontend`, paths:
`apps/wbs/fe-01/tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `tsconfig.e2e.json`,
`vite.config.ts`, `vitest.config.ts`, `vite-config.test.ts`.

---

## Slice 2 — the boundaries disclose a public report

### 2a. The failing cases first

- [ ] 2.0 Baseline: `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/chrome/app-fault.test.tsx)`
      — record the count. Expected `6 passed (6)` on the tree slice 1 left.
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
      `discloses nothing of a thrown value that was not an error at all`, replace its two
      assertions with the four below, and replace its opening comment with the one shown:

  ```ts
  // `throw 'nope'` is legal JavaScript and a dependency can do it, and a
  // thrown string is the case where "just print the message" has no message
  // to print. The public report answers for a primitive exactly as it does
  // for an `Error`, under an occurrence id of its own.
  ```

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

- [ ] 2.7 Append this whole describe block to the end of the file:

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

- [ ] 2.8 Run the file. **Expected red: `7 failed | 3 passed (10)`** (rehearsed 2026-09-20). The
      seven are the four edited/renamed cases above plus the three new ones that assert generic
      text; `costs a chart rather than a page…` passes already, because `GanttDataError`'s message
      is what today's boundary prints anyway. A run reporting fewer than seven failures, or zero
      tests, is a stop.

### 2b. The implementation

- [ ] 2.9 Create `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` with exactly the
      listing in **Appendix A**.
- [ ] 2.10 Rewrite `fault-boundary.tsx` to the listing in **Appendix B**. `faultWords` and
      `NO_MESSAGE` are deleted with it; fact 3 above says nothing else reads them.
- [ ] 2.11 In `app-fault.tsx`: change `fallback={(message) => (` to `fallback={(fault) => (`;
      change the sentence's two lines to read
      "The app stopped: {fault.sentence}. Nothing on this page can put it back — reload it to
      start again. Anything already saved is on the server." (the em-dash line wraps one word
      earlier than before); and insert this immediately after that `</p>` and before the
      `<button`:

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

- [ ] 2.12 In `gantt-fault.tsx`, add the import and selector below after the existing
      `import { FaultBoundary } …`, pass `discloses={ganttWords}` to `<FaultBoundary>` between
      `logAs` and `resetKey`, change `fallback={(message) => (` to `fallback={(fault) => (`, and
      change the sentence's two lines to read "The chart cannot be drawn: {fault.sentence}. The
      plan itself is unaffected, and the next read of it draws the chart again." (the wrap moves
      one word earlier)

  ```ts
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
  ```

- [ ] 2.13 Run the file again. **Expected green: `10 passed (10)`.** Then run the neighbours that
      read the same fallbacks:
      `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/wbs/gantt-panel.test.tsx src/app.test.tsx)`
      — expected `252 passed` and `4 passed` respectively, no change from their own baselines.
- [ ] 2.14 `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. This slice moves a prop type
      from `(message: string) => ReactNode` to `(fault: DisclosedFault) => ReactNode` and changes a
      state field, so the type check runs in this same slice.
- [ ] 2.15 `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. An import-order or prettier
      diagnostic is preamble rule 17, not a stop.

### 2c. Negatives, all rehearsed 2026-09-20

Each row is one mutation, injected alone into a production file, saved as a patch under
`$TMPDIR/evidence`, observed, restored with `cmp`, rerun green. The test file is
`apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx` throughout; run it whole.

| #   | Fault, by function and expression                                                                                                        | Named test that must fail                                                       | Diagnostic actually seen                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| N2  | In `discloseFault`, the last `return`'s `sentence:` becomes `selected ?? (thrown instanceof Error ? thrown.message : disclosed.message)` | `puts neither the message, the cause nor a stack into the DOM`                  | `AssertionError: alice@example.com: expected '<div><main data-app-fault="true" clas…' not to contain 'alice@example.com'` (4 other cases failed too) |
| N3  | In `FaultBoundary.componentDidCatch`, append `, thrown` to the `console.error(…)` argument list                                          | `logs the boundary, the disclosed sentence and the reference, and nothing else` | `AssertionError: expected [ 'the app could not render', …(3) ] to deeply equal [ 'the app could not render', …(2) ]`                                 |
| N4  | Delete the whole `<p … data-app-fault-reference>` element from `app-fault.tsx`'s fallback                                                | `shows the same reference on the page as it logged`                             | `AssertionError: expected 'WBS tool v2The app stopped: Something…' to contain 'AE_9JCX62C7WAJCWRRK7F4YAF908H'` (2 other cases failed too)            |
| N5  | Delete the `discloses={ganttWords}` prop from `gantt-fault.tsx`'s `<FaultBoundary>`                                                      | `costs a chart rather than a page when the chart is what threw`                 | `AssertionError: expected 'The chart cannot be drawn: Something …' to contain 'slice sanding names a predecessor'`                                   |
| N6  | In `ganttWords`, change `thrown instanceof GanttDataError` to `thrown instanceof Error`                                                  | `discloses the chart’s own modelled sentence and no other error’s`              | `AssertionError: expected 'The chart cannot be drawn: saving pla…' to contain 'Something went wrong'`                                                |

N5 and N6 are two mutations because one test would otherwise stand behind both checks: N5 proves
the selector is wired, N6 proves it is narrow. N5 also fails
`gantt-panel.test.tsx > a chart that cannot be drawn > says why, and leaves the plan alone` on
`expected 'The chart cannot be drawn: Something …' to contain 'a-slice-nobody-sent'`; record it,
do not stop (preamble rule 16).

- [ ] 2.16 After watching each, add the adjacent `Proof:` comments naming the injected fault and
      the observed diagnostic: N2 above the `sentence:` line in `discloseFault`; N3 above the
      `console.error` call; N4 above the reference `<p>`; N5 and N6 above `ganttWords`.

**Ready to commit.** `feat(fe-01): disclose a public report from the fault boundaries`, paths:
`apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`, `fault-boundary.tsx`, `app-fault.tsx`,
`app-fault.test.tsx`, `apps/wbs/fe-01/src/components/wbs/gantt-fault.tsx`.

---

## Slice 3 — react-dom's own console line

Verified fact 7 is why this slice exists: in the production build react-dom writes
`Error: <the thrown message>` and a stack to the console for every caught fault, so slice 2 alone
leaves the raw message in the console beside a clean page.

- [ ] 3.0 Baseline: run `app-fault.test.tsx`; expected `10 passed (10)` from slice 2.
- [ ] 3.1 Create `apps/wbs/fe-01/src/components/chrome/root-fault-options.ts` with exactly the
      listing in **Appendix C**.
- [ ] 3.2 In `apps/wbs/fe-01/src/main.tsx`, add
      `import { ROOT_FAULT_OPTIONS } from './components/chrome/root-fault-options';` after
      `import { App } from './app';`, and replace `createRoot(el).render(` with:

  ```tsx
  // The options are not decoration: react-dom's own default writes the thrown error and its
  // stack to the console for every fault a boundary catches, which is a disclosure this
  // application's boundaries exist to prevent. See {@link ROOT_FAULT_OPTIONS}.
  createRoot(el, ROOT_FAULT_OPTIONS).render(
  ```

- [ ] 3.3 In `app-fault.test.tsx`, add
      `import { ROOT_FAULT_OPTIONS } from './root-fault-options';` after the `./app-fault` import,
      and append the describe block in **Appendix D**.
- [ ] 3.4 Run the file. **Expected green: `13 passed (13)`.** Then
      `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` and `wbs-fe-01:lint` — both exit 0, and
      `NX_DAEMON=false bunx nx run wbs-fe-01:build` — exit 0, printing a `✓ built in …` line.

### Negatives

| #   | Fault                                                                       | Named test                                                        | Diagnostic actually seen (2026-09-20)                                                                                      |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| N7  | Delete the `onCaughtError: () => undefined,` line from `ROOT_FAULT_OPTIONS` | jsdom cannot see this one — it is slice 4's `N9`, run in Chromium | see N9                                                                                                                     |
| N8  | In `onUncaughtError`, replace `fault.sentence` with `String(thrown)`        | `discloses a public report for a fault no boundary caught`        | rehearse and record; the row's fact is that argument 1 is `'Something went wrong'` and not text read from the caught value |

N7 is listed here so the reader is not left thinking the jsdom tier covers it: **it does not**, and
that is exactly why slice 4 exists. Write the `Proof:` comment for N7 only after slice 4's
Chromium run.

**Ready to commit.** `feat(fe-01): keep react-dom's own fault line out of the console`, paths:
`apps/wbs/fe-01/src/components/chrome/root-fault-options.ts`, `app-fault.test.tsx`,
`apps/wbs/fe-01/src/main.tsx`.

---

## Slice 4 — the Chromium case (executor writes; **planner runs**)

The executor has no browser. It writes these three files exactly and runs nothing in Chromium; it
records the Playwright command under "Not verified — pending planner verification". The planner
runs it, injects N9 and N10, and writes those two `Proof:` comments.

- [ ] 4.1 Rename `apps/wbs/fe-01/e2e/browser-packages-bundle.ts` to
      `apps/wbs/fe-01/e2e/browser-probe-bundle.ts`. The executor cannot use `git mv`; it copies the
      file to the new name and leaves the old one for the planner to delete, saying so in its
      report. Then in the new file:
  - delete the `const PROBE_ENTRY = …` declaration and its docblock;
  - rename `BrowserPackagesBundle` to `BrowserProbeBundle` and retitle its docblock
    `/** One browser build of a probe entry, by what went into it. */`;
  - change the signature to
    `export async function buildBrowserProbeBundle(entry: string): Promise<BrowserProbeBundle> {`
    and add `@param entry The probe's source file, relative to `apps/wbs/fe-01`.` above the
    existing `@returns`;
  - replace `rollupOptions: { input: PROBE_ENTRY },` with the block in **Appendix E**;
  - in the chunk-count `throw`, replace `the browser build of the three libraries emitted` with
    `` `the browser build of ${entry} emitted` ``, and soften the comment above it to
    `` `the browser build of … emitted 2 chunks, not one` ``.
- [ ] 4.2 In `e2e/browser-packages.spec.ts`, change the import to
      `import { buildBrowserProbeBundle } from './browser-probe-bundle';` and the call to
      `await buildBrowserProbeBundle('e2e/browser-packages-probe.ts')`. In
      `browser-packages.test.ts`, change the import to
      `import { type BrowserProbeBundle, buildBrowserProbeBundle } from './e2e/browser-probe-bundle';`,
      both `BrowserPackagesBundle` type references to `BrowserProbeBundle`, and
      `buildBrowserPackagesBundle()` to `buildBrowserProbeBundle('e2e/browser-packages-probe.ts')`.
      Run `bunx eslint --fix apps/wbs/fe-01/e2e/browser-packages.spec.ts` afterwards: the import
      order changes and that is preamble rule 17, not a stop.
- [ ] 4.3 Create `apps/wbs/fe-01/e2e/fault-boundary-probe.ts` with the listing in **Appendix F**
      and `apps/wbs/fe-01/e2e/fault-boundary.spec.ts` with the listing in **Appendix G**.
- [ ] 4.4 Executor verification: `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0;
      `wbs-fe-01:lint` — exit 0; and
      `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run browser-packages.test.ts)` — **3 passed (3)**,
      which is 040.1's build property still holding over the renamed helper.
- [ ] 4.5 Planner, on a host with Chromium:

  ```sh
  CI=1 E2E_PORT_SHIFT=2600 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- \
    e2e/fault-boundary.spec.ts e2e/browser-packages.spec.ts
  ```

  Expected: exit 0, `2 passed`. A bare `bunx playwright test` lacks the environment and the backend
  refuses to start. Use a port shift no other run on the host holds; a leftover server answers
  `http://localhost:5800/health is already used`, which means find and stop it, never lower `CI`.

### Planner's browser negatives, both rehearsed 2026-09-20

| #   | Fault                                                                                                                | Named test                                                          | Diagnostic actually seen                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N9  | Delete `onCaughtError: () => undefined,` from `ROOT_FAULT_OPTIONS`                                                   | `the root fault boundary discloses a public report and nothing raw` | `expect(received).toEqual(expected)` on the console filter: `- Array []` against `+ Array [ "alice@example.com", ]`. react-dom had written `Error: saving plan p-7 for alice@example.com failed` and a stack. |
| N10 | In `discloseFault`, `sentence:` becomes `selected ?? (thrown instanceof Error ? thrown.message : disclosed.message)` | same test                                                           | `expect(received).toContain(expected)`: expected `"The app stopped: Something went wrong"`, received `"WBS tool v2The app stopped: saving plan p-7 for alice@example.com failed. …Reference AE_JSR1…Reload"`  |

The planner writes N9's `Proof:` comment above `onCaughtError` in `root-fault-options.ts` and
N10's above the `sentence:` line, both dated and naming Chromium.

**Ready to commit.** `test(fe-01): prove the fault boundary in Chromium`, paths:
`apps/wbs/fe-01/e2e/browser-probe-bundle.ts`, `apps/wbs/fe-01/e2e/browser-packages-bundle.ts`
(deleted), `apps/wbs/fe-01/e2e/browser-packages.spec.ts`,
`apps/wbs/fe-01/e2e/fault-boundary-probe.ts`, `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`,
`apps/wbs/fe-01/browser-packages.test.ts`,
`apps/wbs/fe-01/src/components/chrome/root-fault-options.ts` (N9's proof comment),
`apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` (N10's proof comment).

---

## Slice 5 — OpenSpec, and the two pins this packet moves

This packet is observable behaviour under R4, and its change already exists: `adopt-failure-reporting`
covers slices 2 and 3 of the adoption plan. **Create no new change.**

- [ ] 5.1 Append the two requirements in **Appendix H** to
      `openspec/changes/adopt-failure-reporting/specs/failure-reporting/spec.md`. Each has a
      normative `SHALL` sentence directly under its `### Requirement:` heading; validation refuses
      one that has not.
- [ ] 5.2 In that change's `tasks.md`, tick `3.1` and replace its trailing "**unassigned:** …"
      clause with the test and negative in **Appendix I**, and add the new section heading
      "## 4. Frontend fault boundary (needs 1.1)" with task `4.1` from the same appendix.
- [ ] 5.3 Run the README's **OpenSpec validation** block verbatim (including its `jq` contract; do
      not add the `rm -f` line the older packets carry). Observed 2026-09-20: 107 items, 107
      passed, 0 failed, both before and after these edits — adding requirements to an existing
      delta spec does not change the item count, so the expectation is the baseline number,
      unchanged, with zero failures, and not a number plus k.
- [ ] 5.4 Append this packet's observations to that change's `verify.md`: the red and green counts
      of each slice, every negative's observed diagnostic, and the Chromium command with its exit
      status. Evidence references are basenames relative to the attempt's evidence directory, never
      an absolute path.
- [ ] 5.5 `NX_DAEMON=false bunx nx format:check --all` — exit 0. Format only the files this packet
      owns first, never repository-wide. A scratch `.ts` left at the repository root is reported by
      this check by name; move it under `$TMPDIR` rather than deleting it.

### Planner-only: two whole-suite pins this packet moves

Neither is visible to the executor, because `tool-devsync:test` writes Git objects. Both were
rehearsed on 2026-09-20 with the packet's files staged, running
`NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`.

| Pin                                                                                                                      | Moved by                                                                                 | Observed                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/tool-devsync/src/workspace-inventory.test.ts` → `pins the complete moved depth-sensitive configuration inventory` | Slice 1's four `../../../libs/shared/domain/failures/…` values in fe-01's four tsconfigs | `Expected length: 167 / Received length: 171`. Re-pin to the received number and extend the comment above it to name this packet's four values.                            |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` → the `legacySourceOccurrences()` digest                       | Every slice: the digest is line-sensitive over scanned sources                           | `categories` and `count` unchanged; only `digest` moved, `4b3aac6c…` → `e17a914c…`. **Do not copy that literal**: re-pin from the value the run prints on the actual tree. |

After re-pinning, `tool-devsync:test --skip-nx-cache` exits 0 (observed: `801 expect() calls`,
up from `795`).

### Other planner-only checks

- `NX_DAEMON=false bunx nx run wbs-fe-01:test` — observed `118 passed (118)` files,
  `2875 passed (2875)` tests on the rehearsed tree, against a baseline of 2868: this packet adds
  seven tests, all in `app-fault.test.tsx`. The zoned second run prints `2 passed (2)` files and
  `3 passed (3)` tests, unchanged.
- `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` — observed `42 passed (42)` files,
  `621 passed (621)` tests, unchanged: this packet adds nothing to the fast tier.
- The whole `wbs-fe-01:e2e` suite, once, because slice 2 changes text two boundaries render. No
  other spec asserts on it: `git grep` for `The app stopped`, `The chart cannot be drawn`,
  `data-app-fault` and `data-gantt-fault` finds only `app-fault.tsx`, `gantt-fault.tsx`,
  `app-fault.test.tsx`, `app.test.tsx` (attribute presence only) and `gantt-panel.test.tsx`.

## Stop conditions

Each is false on the tree this packet starts from; a true one means stop and report.

1. `apps/wbs/fe-01/src/components/chrome/fault-boundary.tsx` does not export `faultWords`, or
   `git grep -n faultWords apps/wbs/fe-01/src` finds a reader outside that file and
   `gantt-panel.test.tsx`'s own local constant.
2. `libs/shared/domain/failures/src/index.ts` does not export `reportFailure` and
   `createFailureRedaction`.
3. Any of fe-01's four tsconfigs already carries an `@shared/failures` path, or either Vite config
   already carries the alias.
4. `reportFailure(new Error('x'), { redact: createFailureRedaction([]) }).reports.public.message`
   is not `'Something went wrong'`, or its `occurrence_id` does not match `/^AE_[0-9A-Z]+$/`.
5. A slice's red run reports zero tests, or fewer failures than the slice names.
6. A named negative's test passes after the mutation. Check the location once against the function
   and expression the row names, redo it once, then stop (preamble rule 20).
7. The Chromium case cannot be run because no browser is available — that is the executor's normal
   state, and it is reported under "Not verified", not stopped on.

## Dispatch

Sandbox, no network (nothing here installs or fetches), no `--network` (this packet binds no port
itself; the Playwright stack is the planner's). Slices run one at a time, each from the reviewed
predecessor, each recording its own baseline in step N.0.

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
 * **The diagnostic report is discarded, deliberately and for now.** There is no browser
 * telemetry endpoint in this repository and the adoption plan explicitly adds none, so
 * nothing in a browser can deliver an operator record. The occurrence id is therefore a
 * handle to a record that does not exist yet; it still correlates the sentence on screen
 * with the console line beside it, and it is what a reader quotes.
 *
 * @param thrown The value React caught. Any value, including primitives and hostile objects.
 * @param select A kind-specific disclosure selector, for a failure whose own words are
 *   already public by construction. It receives the caught value and returns the sentence to
 *   disclose, or `null` to fall back to the generic public message. Omitted where a boundary
 *   discloses nothing of its own.
 * @returns The sentence to render and the handle to quote.
 */
export function discloseFault(
  thrown: unknown,
  select?: (thrown: unknown) => string | null,
): DisclosedFault {
  const reporting = reportFailure(thrown, { redact: FAULT_REDACTION });
  const selected = select?.(thrown) ?? null;
  if (!reporting.reported) {
    return { sentence: selected ?? REPORTING_LOST_SENTENCE, occurrenceId: reporting.occurrenceId };
  }
  const disclosed = reporting.reports.public;
  return {
    sentence: selected ?? disclosed.message,
    occurrenceId: disclosed.occurrence_id,
  };
}
```

## Appendix B — the changed parts of `fault-boundary.tsx`

The import line becomes two:

```ts
import { Component, type ReactNode } from 'react';

import { type DisclosedFault, discloseFault } from './fault-disclosure';
```

`NO_MESSAGE` and `faultWords` are deleted. `FaultBoundaryProps.fallback` becomes
`fallback: (fault: DisclosedFault) => ReactNode;` with this docblock addition:

```text
 * It receives a {@link DisclosedFault} and never the caught value: a fallback
 * that could reach the thrown error could put its message on screen, which is
 * the disclosure this boundary exists to prevent.
```

A new optional prop goes between `fallback` and `logAs`:

```ts
/**
 * A disclosure selector for the one kind of failure this boundary's own words are
 * already public for, or omitted where the boundary discloses nothing of its own.
 *
 * See {@link discloseFault}: it returns the sentence to show, or `null` to fall back to
 * the public report's generic message.
 */
discloses?: (thrown: unknown) => string | null;
```

`logAs`'s docblock's second paragraph becomes:

```text
 * Logged beside the fault's occurrence id and disclosed sentence, and nothing
 * else: the console is a disclosure boundary like the DOM, so neither the
 * caught value nor the component stack goes into it. This is the trace of
 * **where** it was thrown, which is the one thing the sentence on screen
 * leaves out.
```

`FaultBoundaryState.message` becomes
`/** What the caught fault discloses, or null while nothing has been caught. */ fault: DisclosedFault | null;`,
and the four members change to:

```ts
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
 * here; `componentDidCatch` applies it and replaces the state. Under `StrictMode` this
 * runs twice and mints two occurrence ids, of which only the committed one is ever
 * logged or shown.
 */
static getDerivedStateFromError(thrown: unknown): Pick<FaultBoundaryState, 'fault'> {
  return { fault: discloseFault(thrown) };
}
```

`getDerivedStateFromProps`'s reset branch becomes `return { fault: null, resetKey: props.resetKey };`.

```ts
/**
 * Apply this boundary's own disclosure selector and say, once, that a fault was caught.
 *
 * The console line carries the same two disclosed strings the fallback renders and
 * nothing else. Not a log-and-continue: the render is already refused and the reader is
 * already told; this is the copy an operator can be read back over a telephone.
 *
 * React's `ErrorInfo` second argument is deliberately not taken. Its `componentStack` is
 * a stack, the console is a disclosure boundary, and the adoption plan's third reporting
 * requirement puts browser consoles on the same footing as agent transcripts.
 */
override componentDidCatch(thrown: unknown): void {
  const fault = discloseFault(thrown, this.props.discloses);
  this.setState({ fault });
  console.error(this.props.logAs, fault.sentence, fault.occurrenceId);
}

override render(): ReactNode {
  const { fault } = this.state;
  return fault === null ? this.props.children : this.props.fallback(fault);
}
```

The `import type { ErrorInfo }` must go with the parameter, or lint fails on an unused import.

## Appendix C — `apps/wbs/fe-01/src/components/chrome/root-fault-options.ts`

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
 *   say so here — as the public report's generic sentence and its occurrence id, and never
 *   as the caught value.
 */
export const ROOT_FAULT_OPTIONS: RootOptions = {
  onCaughtError: () => undefined,
  onUncaughtError: (thrown: unknown) => {
    const fault = discloseFault(thrown);
    console.error('no boundary caught this', fault.sentence, fault.occurrenceId);
  },
  onRecoverableError: (thrown: unknown) => {
    const fault = discloseFault(thrown);
    console.error('React recovered from this', fault.sentence, fault.occurrenceId);
  },
};
```

## Appendix D — slice 3's cases, appended to `app-fault.test.tsx`

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
    expect(logged.mock.calls[0][0]).toBe('no boundary caught this');
    expect(logged.mock.calls[0][1]).toBe('Something went wrong');
    expect(String(logged.mock.calls[0][2])).toMatch(/^AE_[0-9A-Z]+$/);
  });

  itDom('discloses a public report for a fault React recovered from', () => {
    ROOT_FAULT_OPTIONS.onRecoverableError?.(new Error('alice@example.com'), {});

    expect(logged.mock.calls).toHaveLength(1);
    expect(logged.mock.calls[0][0]).toBe('React recovered from this');
    expect(logged.mock.calls[0][1]).toBe('Something went wrong');
  });
});
```

## Appendix E — the build block in `browser-probe-bundle.ts`

```ts
build: {
  write: false,
  rollupOptions: { input: resolve(appRoot, entry) },
  // The shipped config splits React and the router into a `vendor` chunk, which is
  // right for a deployed application and wrong for a probe: a page served from one
  // `addScriptTag` cannot load three files. The split is off for this build alone;
  // every plugin, alias and resolve condition is still the shipped config's, which
  // is what these probes are about.
  //
  // `codeSplitting: false` and not an empty `groups` array: Vite merges an inline
  // config into the file's by concatenating arrays, so `groups: []` left the shipped
  // `vendor` group exactly where it was.
  //
  // Proof: without this the fault-boundary probe built three chunks —
  // `fault-boundary-probe`, `rolldown-runtime` and `vendor` — and the helper threw
  // `the browser build of e2e/fault-boundary-probe.ts emitted 3 chunks, not one`. With
  // `groups: []` it still built the same three (2026-09-20).
  rolldownOptions: {
    input: resolve(appRoot, entry),
    output: { codeSplitting: false },
  },
},
```

## Appendix F — `apps/wbs/fe-01/e2e/fault-boundary-probe.ts`

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
 * Its three literal strings are what `fault-boundary.spec.ts` searches the rendered subtree
 * and the console for: a personal identifier in the message, a credential on the cause and
 * an internal locator beside it. String literals, because the shipped config builds this
 * probe minified and an identifier would not survive that — a marker that cannot appear is
 * a search that cannot fail.
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
 * through the deployed Vite config, and not a copy: a probe over its own boundary would
 * keep passing while the app's grew a raw message. `createRoot().render` is asynchronous,
 * so the loop below waits for the fallback rather than for a frame count.
 *
 * @returns What the page carried once the fallback had rendered.
 * @throws When the boundary never rendered, rather than letting the assertions outside run
 * over a page that never reached the state they are about.
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

## Appendix G — `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`

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

  // The boundary caught it, so nothing reached the page's own error handler. A throw that
  // escaped would make every assertion below vacuous.
  expect(pageErrors).toEqual([]);
  // Proof: with `discloseFault` returning the caught `Error`'s own message, this failed on a
  // received `"WBS tool v2The app stopped: saving plan p-7 for alice@example.com failed. …"`.
  // Watched in Chromium, 2026-09-20.
  expect(proof?.pageText).toContain('The app stopped: Something went wrong');
  expect(proof?.reference).toMatch(/^AE_[0-9A-Z]+$/);
  // The boundary's own rendered subtree, markup and all, and **not** `page.content()`:
  // the probe is injected with `addScriptTag`, so the whole document contains the probe's
  // own source and therefore every marker in it. Watched 2026-09-20 — the document-wide
  // form failed here on all three markers against a page that disclosed none of them.
  expect(RAW_MARKERS.filter((marker) => proof?.markup.includes(marker) ?? true)).toEqual([]);

  // The console is a disclosure boundary too, and in a real browser it carries React's own
  // lines as well as the boundary's. Every line is read, not only the one this code wrote.
  // Proof: with `onCaughtError` removed from `ROOT_FAULT_OPTIONS`, this failed on a
  // received `[ "alice@example.com" ]` where `[]` was expected — react-dom's own default
  // handler had written `Error: saving plan p-7 for alice@example.com failed` and a stack.
  // Watched in Chromium on the shipped build, 2026-09-20.
  const whole = consoleLines.join('\n');
  expect(RAW_MARKERS.filter((marker) => whole.includes(marker))).toEqual([]);
  expect(consoleLines).toContain(
    `the app could not render Something went wrong ${String(proof?.reference)}`,
  );
});
```

## Appendix H — the two delta requirements

```markdown
### Requirement: A browser fault boundary discloses a public report and nothing raw

A caught render fault SHALL disclose the public report's generic message and its occurrence
identifier to the page, and SHALL disclose neither the caught value's message, nor its cause, nor
a stack to the page or to the browser console.

#### Scenario: A secret-bearing render fault reaches the root boundary

- **GIVEN** a component that throws an error whose message and cause carry a personal identifier, a credential and an internal locator
- **WHEN** the root fault boundary catches it in a browser
- **THEN** the page shows the generic public message and the occurrence identifier
- **AND** neither the rendered markup nor any browser console line contains the message, the cause or a stack

#### Scenario: A modelled chart fault is disclosed by its own kind

- **GIVEN** a chart data fault whose sentence its own module composed
- **WHEN** the chart's fault boundary catches it
- **THEN** the panel shows that sentence
- **AND** an unmodelled error caught by the same boundary shows the generic public message instead

### Requirement: The shared reporting module executes in a browser

The shared failure reporting module SHALL produce both reports inside a browser, built through the
frontend's shipped bundler configuration, without a Bun or Node global.

#### Scenario: The module reports a failure in Chromium

- **GIVEN** the frontend's shipped bundler configuration
- **WHEN** a probe importing the shared reporting module runs in Chromium
- **THEN** it produces a public report carrying an occurrence identifier
- **AND** the page raises no error and requests no unexpected origin
```

## Appendix I — the two task lines

```markdown
- [x] 3.1 Add a browser execution fixture for `@shared/failures` to the portable test path — test: `CI=1 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- e2e/fault-boundary.spec.ts`, which builds the app's own root fault boundary through `vite.config.ts` and runs it in Chromium; negative: disclose the caught value's message instead of the public report's and observe the browser case fail

## 4. Frontend fault boundary (needs 1.1)

- [ ] 4.1 Disclose a public report and an occurrence identifier from both frontend fault boundaries, and silence react-dom's own raw console line — test: `apps/wbs/fe-01/src/components/chrome/app-fault.test.tsx` and the Chromium case above; negatives: disclose the caught value's message, log the caught value, drop the occurrence identifier, drop the chart's own disclosure selector, widen that selector to every error, remove `onCaughtError` from the root options, and drop the `@shared/failures` alias from the suite config
```
