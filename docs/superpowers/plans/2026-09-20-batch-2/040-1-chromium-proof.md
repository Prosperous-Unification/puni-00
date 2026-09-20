# 040.1 Prove the three libraries in real Chromium from the Vite 8 bundle

| Field                                      | Value                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                  | 040.1 in "PUNI platform plan"                                                                                                      |
| Size class                                 | S                                                                                                                                  |
| Slices                                     | Two executor slices, dispatched one after the other, then the planner's browser slice                                              |
| Network                                    | Off. Every dependency is installed; no step downloads anything.                                                                    |
| top-model-high-effort-planning-tokens      | 800000                                                                                                                             |
| mid-level-mid-effort-implementation-tokens | 2500000                                                                                                                            |
| top-model-high-effort-review-tokens        | 1000000                                                                                                                            |
| Implements                                 | The 2026-09-19 amendment of the [package adoption plan](../2026-09-17-personal-package-adoption.md)                                |
| Depends on                                 | 020.1, merged in batch 1: `di-bag` 0.4.0, `application-exception` 0.5.0, `caught-object-report-json` 11.0.1 are pinned at the root |

The execution contract, the standard blocks and the sandbox rules are the batch 1 README's:
[Execution contract](../2026-09-19-batch-1/README.md#execution-contract),
[Standard blocks every packet uses](../2026-09-19-batch-1/README.md#standard-blocks-every-packet-uses),
[Hidden constraints every frontend packet must respect](../2026-09-19-batch-1/README.md#hidden-constraints-every-frontend-packet-must-respect).
Read them; this packet does not repeat them except where it must show an exact command.

## 0. Dispatch

The launcher supports this batch already — `--batch batch-2` maps to the clone root
`/home/df/wd/puni/batch-2`, the branch prefix `batch-2/`, the temporary root `/tmp/puni-batch2` and
the packet directory `docs/superpowers/plans/2026-09-20-batch-2`. The two attempts are:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-1-chromium-proof slice-1 <base-commit> --batch batch-2
/home/df/wd/puni/puni-plan/exec/run-executor.sh 040-1-chromium-proof slice-2 <slice-1-commit> --batch batch-2 --resume
```

The second carries `--resume` because the clone from slice 1 is still there; without it the
launcher refuses with exit 67. `<slice-1-commit>` is the commit the planner made from slice 1, so
slice 2 starts from reviewed work rather than from an unreviewed tree. With `--resume` the launcher
does **not** check out `<slice-1-commit>`: it keeps the resumed clone's own HEAD, and only requires
`<slice-1-commit>` to already exist as a commit in `/home/df/wd/puni/puni-00` before it will start.
Confirm before dispatching slice 2 that both hold: the clone's HEAD is already the planner's slice-1
commit, and `<slice-1-commit>` exists in `/home/df/wd/puni/puni-00`. No `--network`: nothing here
downloads. This packet adds no README, so the README coverage pin that 110.6 derives in
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` is not this packet's business in either
of its states.

## 1. Goal and non-goals

**Goal.** Turn the adoption plan's partial browser claim into two checks that run: one that proves
the three libraries, bundled by **this app's own `vite.config.ts`**, pull no Node built-in into a
browser build and keep nanoid on its browser entry, and one that runs that bundle in the Chromium
the layout gate already starts and asserts what the libraries did there.

**Non-goals.** No application code adopts the libraries here: no `shared-failures` module, no
reporting boundary, no DI Bag root in `apps/wbs/fe-01`. Nothing the app ships changes. No new Nx
project, no new Nx target, no CI workflow edit, no OpenSpec change.

**What the two checks do not cover.** They bundle one synthetic entry whose only imports are the
three libraries, so they say nothing about what application code imports. A later `di-bag/node` in
`src/` or in `libs/shared/domain/failures` cannot reach this bundle and will not fail these checks.
Import enforcement over production code is slice 8 of the adoption plan. And the adoption plan's
browser fixture for `@shared/failures` stays **unassigned**: 020.2 says in its own "Unknowns and
what is left undone" that no batch 2 packet gives that module a browser proof and leaves the
checkbox unticked, and this probe never imports it, so nothing here discharges it either. This
packet's claim is exactly: **these three published packages, built by this app's Vite
configuration, are browser-safe and work.**

## 2. Read first

| File                                                             | Why                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                      | R1 to R5. Bun and Nx only. R5 forbids `\|\| true`; no step here uses it.                                                                                                                                  |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`            | The execution contract, the standard blocks, the frontend tier rule.                                                                                                                                      |
| `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` | The 2026-09-19 amendment's "Browser proof is partial" bullet, which slice 2 replaces, and the compatibility bullets about the Vite bundle, nanoid's browser resolution and `di-bag` versus `di-bag/node`. |
| `apps/wbs/fe-01/src/styles.test.ts`                              | The pattern the helper copies: a real Vite build through the shipped config, in process, `write: false`.                                                                                                  |
| `libs/wbs/application/core/testing/portable-composition.spec.ts` | The other pattern: a bundle loaded into a routed blank page with every other request refused. The Chromium spec here is its sibling.                                                                      |
| `apps/wbs/fe-01/src/test-tiers.test.ts`                          | Two rules this packet must satisfy: the fast-tier partition and the lint-input list. Search for `DOM_EVIDENCE` and `fe-01 lint inputs`.                                                                   |
| `apps/wbs/fe-01/project.json`                                    | The `lint`, `lint:fast` and `e2e` targets you extend or rely on.                                                                                                                                          |
| `apps/wbs/fe-01/tsconfig.spec.json`                              | Its `include` is an explicit list; a root test file not named there is not type checked and does not even parse for ESLint.                                                                               |

## 3. Verified facts, 2026-09-20

Observed in the batch 2 planning worktree on the planning date, with the repository's own Vite
8.2.2, its own `vitest`, its own Playwright runner and the planner's installed Chromium. Symbols
are named rather than line numbers, because main has moved since and will move again.

1. **The libraries are installed and pinned.** The root manifest's `dependencies` hold `di-bag`
   `0.4.0`, `application-exception` `0.5.0` and `caught-object-report-json` `11.0.1`, and
   `tools/tool-devsync/src/toolchain-pins.test.ts`'s `OWNER_PACKAGES` holds the same three.
   `devDependencies` pins `vite` at `8.2.2`.
2. **Their portable entry points import no Node built-in.** `di-bag/dist/index.js`,
   `application-exception/index.js` and `caught-object-report-json/index.js` `require` only their
   own relative modules and each other. `di-bag/dist/acquisition-mode.js` reads
   `globalThis.process.getBuiltinModule` at run time — a property read, not an import.
3. **`di-bag/node` is the one that is not portable.** `node_modules/di-bag/dist/node.js` contains
   `const { isPromise } = require('node:util/types');` (line 18 on 2026-09-20).
4. **`application-exception` needs `nanoid` 3.3.19**, whose `exports` list a `browser` condition
   before `require`, so a browser build must take `index.browser.js` and not the entry that begins
   `import crypto from 'crypto'`.
5. **A build through the shipped config works.** `vite.build` with
   `configFile: apps/wbs/fe-01/vite.config.ts`, `root: apps/wbs/fe-01` and
   `build: { write: false, rollupOptions: { input: <probe> } }` emits **one chunk** of about
   140 kB from 49 modules. The config's `build.rolldownOptions` and the inline
   `build.rollupOptions` do not conflict, and the config's `proxy` is skipped because `command` is
   `build` — the same bargain `src/styles.test.ts` already relies on.
6. **Vite does not fail a browser build that imports a Node built-in.** With one line
   `import 'di-bag/node';` added to the probe, the build still succeeded and still emitted one
   chunk, and the chunk's module list gained `__vite-browser-external:node:util/types` — a stub
   that throws when the page loads it.
7. **Neither the bundle text nor the build warning can be used as the evidence, and both were
   tried.** The correct bundle already contains the literal `node:util/types`, because di-bag
   passes that string to `process.getBuiltinModule`. And the externalization warning
   (`Module "node:util/types" has been externalized for browser compatibility…`) arrives through
   `rollupOptions.onwarn` when the build runs under `bun`, but **inside `vitest` it arrives
   nowhere**: with both an `onwarn` collector and a `customLogger` installed, the faulty build
   produced an empty `onwarn` list and a logger that saw only an unrelated `__dirname` config
   warning. A warning-based assertion therefore passed against the faulty probe — a check that
   could not fail. The module identity is what this packet asserts on, and it is present in both
   runners.
8. **The stub throws in Chromium.** The faulty bundle raised, at module load,
   `Error: DI_BAG_INVALID_CONFIGURATION: withConfiguration runtime requires isNativePromise`, and
   the probe's global was never assigned.
9. **A build awaited at module scope takes the whole file down with it.** With the build awaited
   before `describe`, a failing build reported `Tests  no tests`, which the executor preamble
   treats as a failure whatever a packet says. The suite in section 6 therefore awaits one shared
   build **inside** each case: every failing build in section 10 now fails three registered tests
   instead of aborting collection, watched on 2026-09-20.
10. **Every file in section 6 was written into this worktree and run.** `wbs-fe-01:lint` exit 0,
    `wbs-fe-01:typecheck` exit 0, `bunx vitest run browser-packages.test.ts` **3 passed**, and the
    Chromium spec **1 passed in about a second** under the repository's Playwright with a
    temporary config. The files were then removed and the tree compared byte for byte; the
    worktree holds only this packet.
11. **All nine negatives in section 10 were watched** in those same runners. Their exact messages
    are in that table.
12. **The fast-tier rule reads a file's text.** A suite that is not `.tsx` and mentions none of
    `document`, `window`, `location`, `localStorage`, `navigator`, `WebSocket`, `matchMedia`,
    `getComputedStyle`, `HTMLElement`, `jsdom`, `@testing-library` must be listed in
    `vitest.node-suites.ts`. `vite-config.test.ts` and `src/styles.test.ts` stay out of that list
    because their `@vitest-environment node` header explains the jsdom/esbuild clash and so
    contains the word `jsdom`. The new root suite carries the same header for the same real
    reason, and the fast tier passed with it present, so **`vitest.node-suites.ts` is not touched
    by this packet**.
13. **Every root `*.ts` file of `apps/wbs/fe-01` must appear in both lint commands**, and a root
    test file absent from `tsconfig.spec.json`'s `include` fails ESLint outright with
    `was not found by the project service` — watched here before the include was added.
14. **Chromium runs in CI and in the planner's batch verification.** The CI `pixels` job installs
    chromium and runs `bun run e2e` in four shards; batch 1 ran `wbs-fe-01:e2e` on the integration
    head. `wbs-core:test:portable` and `wbs-fe-01:e2e-packaged` are in no gate and no workflow,
    which is why nothing here is added to them.
15. **This packet adds no Nx target**, so the rule that every test-running target name carries
    `CLAUDECODE=0` and `AGENT=0` defaults in `nx.json` does not apply to it. Both new checks run
    inside existing targets: `wbs-fe-01:test` and `wbs-fe-01:e2e`.

## 4. The decision: permanent checks, not a recorded experiment

The item's note says only a Node sandbox run exists. This packet makes the proof permanent, and the
justification is fact 6: **Vite answers a Node built-in in browser code with a warning and a stub
that throws at page load.** A recorded experiment proves one tree on one day; these packages are
pinned but will be upgraded, and the adoption plan's later slices add a reporting boundary and
frontend lifetimes on top of them.

The plan asks for exactly this, twice saying a build is not enough — "Add a browser execution
fixture to the portable test path; Vite build success alone is insufficient" and "Passing unit
tests cannot substitute for Chromium execution" — and it lists `bunx nx run wbs-fe-01:e2e` among
the commands the adoption must pass. So the Chromium half goes into the suite that command runs,
which is the one CI runs too, rather than into a new target no gate would call.

The split follows what each actor can do. The build property is checkable without a browser, so it
is a Vitest suite the executor writes first, watches fail, and breaks four ways. The execution
property needs Chromium, so it is a Playwright spec the executor writes and the planner runs and
breaks five ways.

## 5. File plan

| File                                                             | Change | Responsibility                                                                              |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/e2e/browser-packages-probe.ts`                   | create | The browser entry: one DI Bag graph, one typed failure, both reports, one corj report.      |
| `apps/wbs/fe-01/e2e/browser-packages-bundle.ts`                  | create | Builds that entry through the shipped `vite.config.ts` in process and reports what went in. |
| `apps/wbs/fe-01/browser-packages.test.ts`                        | create | The build property: externalizes nothing, bundles all three, keeps nanoid's browser entry.  |
| `apps/wbs/fe-01/e2e/browser-packages.spec.ts`                    | create | The execution property, in the layout gate's Chromium.                                      |
| `apps/wbs/fe-01/project.json`                                    | modify | The new root test file added to the `lint` and `lint:fast` commands.                        |
| `apps/wbs/fe-01/tsconfig.spec.json`                              | modify | The new root test file added to `include`.                                                  |
| `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` | modify | One bullet of the 2026-09-19 amendment replaced.                                            |

**Files this packet must not touch:** `apps/wbs/fe-01/vitest.node-suites.ts` (fact 12 — it needs no
entry, and 040.4 edits it), `apps/wbs/fe-01/src/test-tiers.test.ts`,
`apps/wbs/fe-01/vite.config.ts`, `apps/wbs/fe-01/playwright.config.ts`, anything under
`apps/wbs/fe-01/src/`, `.github/workflows/ci.yml`, `package.json`, `bun.lock`,
`tools/tool-devsync/**`.

**One file is shared with another batch 2 packet.** 020.2 (shared failures) also modifies
`docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, where it ticks slice 2's
checkboxes. This packet replaces one bullet of the amendment near the top and touches nothing else
in that document. Whichever runs second re-reads the file first, because the other's edit moves the
line numbers; the two hunks are far apart and do not overlap. Checked against the other packets in
this directory on 2026-09-20: 040.4 (plan feed) edits `vitest.node-suites.ts`, `src/modules/` and
the plan read hook; 110.1 (test axes) edits devsync and two other projects' `project.json` files,
not this app's; 010.6, 010.7, 020.7 and 110.6 are in the Bureaucrat, the backend and devsync. No
other file above is shared.

## 6. The four new files, exactly

Write them as given; every one of them was linted, type checked and run in this repository on
2026-09-20. The comments are part of the file (R3).

**Seven `Proof:` placeholders, and where each is earned.** Three in the suite and one in the
helper are the executor's, written in slice 1 after steps 3 to 6; three in the Chromium spec are
the planner's, written in section 10 after E, after F, G and H together, and after I. A
placeholder is never replaced by a comment describing a fault nobody watched.

### `apps/wbs/fe-01/e2e/browser-packages-probe.ts`

```ts
import { createRedactionPolicy, defineException, toReports } from 'application-exception';
import { makeCorj } from 'caught-object-report-json';
import { DiBag } from 'di-bag';

/**
 * What one run of the three libraries inside a browser produced.
 *
 * `reportVersion` may be undefined: corj declares a report's `v` optional, because a
 * compact report may omit fields, and the probe reports what it received rather than
 * asserting that away.
 */
export interface BrowserPackagesProof {
  readonly acquiredAt: number;
  readonly disposed: readonly string[];
  readonly correlated: boolean;
  readonly publicCode: string;
  readonly disclosesTheSecret: boolean;
  readonly reportVersion: string | undefined;
}

/** One options bag, built once, as the adoption plan's reporting contract requires. */
const REPORT_LIMITS = { maxReportSize: 32_768, maxDepth: 4, maxChildren: 16 } as const;

/** The one secret this probe owns, scrubbed wherever its text appears in either report. */
const redact = createRedactionPolicy({ patterns: [/probe-secret/g] });

const ProbeFailed = defineException({
  tag: 'probe/ProbeFailed',
  message: ({ step }: { step: string }) => `the probe failed at ${step}`,
  public: { code: 'PROBE_FAILED', message: 'The probe failed.' },
});

/**
 * Acquire an asynchronous service through the portable factory helpers, dispose it,
 * and report one typed failure twice.
 *
 * Every call here is one the adoption plan says browser code must be able to make:
 * `fromSyncFactory` and `fromAsyncFactory` fix the acquisition mode by name, so the
 * graph needs no `process.getBuiltinModule` classifier — a browser has none — and one
 * `toReports` call correlates the operator's report with the disclosed one under a
 * single occurrence identifier.
 *
 * @returns What the run observed, for an assertion made outside the page.
 */
async function proveTheThreeLibraries(): Promise<BrowserPackagesProof> {
  const disposed: string[] = [];
  const services = DiBag.createBuilder()
    .register({
      clock: DiBag.fromSyncFactory(() => ({ now: () => 1_726_800_000_000 })),
      session: DiBag.withDisposal(
        DiBag.fromAsyncFactory(async ({ clock }: { clock: { now: () => number } }) =>
          Promise.resolve({ at: clock.now() }),
        ),
        () => {
          disposed.push('session');
        },
      ),
    })
    .build();
  const session = await services.resolve('session');
  await services.close();

  const options = { corj: REPORT_LIMITS, redact } as const;
  const reports = toReports(new ProbeFailed({ details: { step: 'probe-secret' } }), {
    diagnostic: options,
    public: options,
  });

  return {
    acquiredAt: session.at,
    disposed,
    correlated: reports.diagnostic.occurrence_id === reports.public.occurrence_id,
    publicCode: reports.public.code,
    disclosesTheSecret: JSON.stringify(reports).includes('probe-secret'),
    reportVersion: makeCorj('a plain string', { maxReportSize: 1024 }).v,
  };
}

// The cast names the one boundary this file has: a bundled module and the page that
// loads it share nothing but this global, and `globalThis` is typed without it.
(
  globalThis as unknown as { browserPackagesProof: Promise<BrowserPackagesProof> }
).browserPackagesProof = proveTheThreeLibraries();
```

### `apps/wbs/fe-01/e2e/browser-packages-bundle.ts`

```ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rollup } from 'vite';

/** `apps/wbs/fe-01`, wherever the caller's working directory is. */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The browser entry under test. */
const PROBE_ENTRY = resolve(appRoot, 'e2e/browser-packages-probe.ts');

/**
 * The config this app is deployed with, not one assembled here.
 *
 * The distinction is the whole point, and it is `src/styles.test.ts`'s: a probe built
 * through a config of its own would keep passing while `vite.config.ts` grew a plugin
 * or an alias that changed what a browser receives.
 */
const SHIPPED_CONFIG = resolve(appRoot, 'vite.config.ts');

/**
 * How Vite names a module it refused to bundle for a browser.
 *
 * It does not fail such a build: it replaces the module with a stub that throws when
 * the page loads it, names the stub `__vite-browser-external:<specifier>`, and warns.
 * The warning is not usable as evidence — under `vitest` it reaches neither `onwarn`
 * nor a custom logger, while the stub module is in the output either way (both watched
 * 2026-09-20) — so the module identity is what this file reports.
 */
const BROWSER_EXTERNAL = '__vite-browser-external:';

/** One browser build of {@link PROBE_ENTRY}, by what went into it. */
export interface BrowserPackagesBundle {
  readonly code: string;
  /** Every module the chunk was built from: which file of a package the build chose. */
  readonly modules: readonly string[];
  /** The specifiers Vite refused to bundle for a browser, `node:util/types` and the like. */
  readonly externalizedForBrowser: readonly string[];
}

/**
 * Build the probe for the browser through the shipped config, in this process.
 *
 * Nothing is written: `write: false` over the config's own `outDir`, so a test run
 * never touches `dist/apps/wbs/fe-01`.
 *
 * **The module identities are the evidence, not the bundle text and not a warning.**
 * The correct bundle already contains the string `node:util/types`, because di-bag
 * passes it to `process.getBuiltinModule` at run time, so the text cannot tell the two
 * builds apart; and the warning Vite prints for an externalized module never arrives
 * inside `vitest` (see {@link BROWSER_EXTERNAL}).
 *
 * **Which file of a package was chosen is a separate question**, answered by `modules`
 * rather than by searching the code: nanoid's browser entry and corj's token module
 * both contain `crypto.getRandomValues`, so the text cannot tell them apart.
 *
 * @returns The single emitted chunk's code, the modules it was built from, and the
 * specifiers that reached browser code from a Node host.
 * @throws When the build emits anything other than one chunk, rather than letting an
 * assertion pass over a bundle nobody identified.
 */
export async function buildBrowserPackagesBundle(): Promise<BrowserPackagesBundle> {
  const built = await build({
    configFile: SHIPPED_CONFIG,
    root: appRoot,
    logLevel: 'silent',
    build: {
      write: false,
      rollupOptions: { input: PROBE_ENTRY },
    },
  });
  // `build` is overloaded — a watcher for `build.watch`, one bundle or an array
  // otherwise — and this call sets no watcher, so the cast is a shape check on a union
  // the compiler cannot collapse. `src/styles.test.ts` names the same boundary.
  const outputs = (Array.isArray(built) ? built : [built]) as Rollup.RolldownOutput[];
  const chunks = outputs
    .flatMap((bundle) => bundle.output)
    .filter((entry): entry is Rollup.OutputChunk => entry.type === 'chunk');
  // Proof: <the observed failure, written after watching it>
  if (chunks.length !== 1) {
    throw new Error(
      `the browser build of the three libraries emitted ${String(chunks.length)} chunks, not one`,
    );
  }
  const modules = Object.keys(chunks[0].modules);
  return {
    code: chunks[0].code,
    modules,
    externalizedForBrowser: modules
      .filter((id) => id.startsWith(BROWSER_EXTERNAL))
      .map((id) => id.slice(BROWSER_EXTERNAL.length)),
  };
}
```

### `apps/wbs/fe-01/browser-packages.test.ts`

```ts
// @vitest-environment node
//
// The same reason as `vite-config.test.ts` and `src/styles.test.ts`: this file runs a
// real Vite build, and importing `vite` under jsdom fails because esbuild refuses to
// load where `new TextEncoder().encode('') instanceof Uint8Array` is false — under
// jsdom it is. `src/test-tiers.test.ts` reads this text, so the word above also keeps
// this suite out of `vitest.node-suites.ts`, exactly as it does for those two files.
import { describe, expect, it } from 'vitest';

import {
  type BrowserPackagesBundle,
  buildBrowserPackagesBundle,
} from './e2e/browser-packages-bundle';

/**
 * One marker per library, each a string that library's own source carries.
 *
 * corj's version marker is reachable through `application-exception` as well, so this
 * list says all three libraries are in the bundle, not that each is imported directly.
 * What it is really for is vacuity: without it, a bundle that contained nothing at all
 * would satisfy every other case in this file.
 */
const LIBRARY_MARKERS = ['DI_BAG_CLASSIFIER_REQUIRED', 'appex/public/v4', 'corj/v0.14'];

/** nanoid's own top-level files, as `modules` names them: not `url-alphabet/index.js`. */
const NANOID_ENTRY = /\/nanoid\/[^/]+$/;

/** One build for the whole file, and a budget the build cannot outgrow unnoticed. */
const BUILD_BUDGET_MS = 120_000;

let building: Promise<BrowserPackagesBundle> | undefined;

/**
 * The one browser build these cases read, built on first use and shared after that.
 *
 * Awaited inside the cases rather than at module scope, so that a build which throws
 * — a Node built-in, a second chunk, a missing entry — fails registered tests instead
 * of aborting collection. A run that reports no tests is a failure here as everywhere.
 *
 * @returns The shared build, awaited.
 */
async function theBundle(): Promise<BrowserPackagesBundle> {
  building ??= buildBrowserPackagesBundle();
  return await building;
}

describe('the three libraries in a browser build', () => {
  it(
    'externalizes no Node built-in for the browser',
    async () => {
      // Proof: <the observed failure, written after watching it>
      expect((await theBundle()).externalizedForBrowser).toEqual([]);
    },
    BUILD_BUDGET_MS,
  );

  it(
    'bundles di-bag, application-exception and caught-object-report-json',
    async () => {
      // Proof: <the observed failure, written after watching it>
      const { code } = await theBundle();
      expect(LIBRARY_MARKERS.filter((marker) => !code.includes(marker))).toEqual([]);
    },
    BUILD_BUDGET_MS,
  );

  it(
    'resolves nanoid to its browser entry',
    async () => {
      // `application-exception` mints occurrence identifiers through nanoid 3.3.19, whose
      // exports offer a `browser` condition before `require`. The other entry is
      // `import crypto from 'crypto'` in browser code. The module identity is the only
      // honest test of that: `getRandomValues` appears in corj's tokens module too.
      //
      // Proof: <the observed failure, written after watching it>
      const chosen = (await theBundle()).modules
        .filter((id) => NANOID_ENTRY.test(id))
        .map((id) => id.slice(id.lastIndexOf('/nanoid/') + 1));
      expect(chosen).toEqual(['nanoid/index.browser.js']);
    },
    BUILD_BUDGET_MS,
  );
});
```

### `apps/wbs/fe-01/e2e/browser-packages.spec.ts`

```ts
import { expect, test } from '@playwright/test';

import { buildBrowserPackagesBundle } from './browser-packages-bundle';
import type { BrowserPackagesProof } from './browser-packages-probe';

/**
 * An origin nothing serves, fulfilled by the route below.
 *
 * `https`, so the page is a secure context and `crypto.getRandomValues` exists — which
 * is what nanoid's browser variant, and therefore every occurrence identifier, needs.
 * `libs/wbs/application/core/testing/portable-composition.spec.ts` bootstraps its own
 * bundle the same way and for the same reasons.
 */
const bootstrap = 'https://packages-probe.invalid/';

test('the three libraries run in Chromium from this app’s Vite build', async ({ page }) => {
  // One budget for the whole case — the routed page, the Vite build of the probe and
  // its execution — rather than the config's 60 seconds, because a case that bundles
  // the app is not a case that only clicks. All of it took about a second here.
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on('pageerror', (thrown) => {
    pageErrors.push(String(thrown));
  });
  await page.route('**/*', async (route) => {
    if (route.request().url() === bootstrap) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>packages probe</title>',
      });
      return;
    }
    unexpectedRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  await page.goto(bootstrap);

  const bundle = await buildBrowserPackagesBundle();
  await page.addScriptTag({ content: bundle.code, type: 'module' });
  const proof = await page.evaluate(
    async () =>
      await (globalThis as unknown as { browserPackagesProof?: Promise<BrowserPackagesProof> })
        .browserPackagesProof,
  );

  // First, because a bundle that throws while it loads never assigns the global, and
  // the module's own error is the legible half of that failure.
  // Proof: <the observed failure, written after watching it>
  expect(pageErrors).toEqual([]);
  // Proof: <the observed failures, written after watching them>
  expect(proof).toEqual({
    acquiredAt: 1_726_800_000_000,
    disposed: ['session'],
    correlated: true,
    publicCode: 'PROBE_FAILED',
    disclosesTheSecret: false,
    reportVersion: 'corj/v0.14',
  });

  // The bounded settle before the request assertion, and the reason it is not
  // superstition, are in `portable-composition.spec.ts`: without it the assertion races
  // the route callback and an injected request passes.
  await page.waitForTimeout(50);
  // Proof: <the observed failure, written after watching it>
  expect(unexpectedRequests).toEqual([]);
});
```

## 7. Slice 1 — the build property

One action per step, from the repository root unless a step says otherwise. Every fault block below
restores **before** it asserts on a captured status, and captures that status inside an `if`,
because `set -e` would otherwise end the shell at the deliberately failing command. **Every run in
this slice registers three tests**, whether it passes or fails; a run that reports no tests is a
failure everywhere in this packet, with no exception.

- [ ] **Step 0. Baseline, before touching anything.**

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  git status --short --untracked-files=all
  for path in apps/wbs/fe-01/browser-packages.test.ts \
    apps/wbs/fe-01/e2e/browser-packages-probe.ts \
    apps/wbs/fe-01/e2e/browser-packages-bundle.ts \
    apps/wbs/fe-01/e2e/browser-packages.spec.ts; do
    test ! -e "$path" || { echo "already present: $path" >&2; exit 1; }
  done
  if grep -n browser-packages apps/wbs/fe-01/vitest.node-suites.ts; then
    echo "the suite list already mentions this packet" >&2; exit 1
  else
    test $? -eq 1
  fi
  ```

  Expected: `git status` prints nothing, the loop prints nothing, and the `grep` finds nothing
  (status 1, accepted explicitly; any other status is a read error and a stop).

- [ ] **Step 0b. The sandbox unit tier, as a before picture.**

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)
  ```

  Expected: exit 0. Record the `Test Files  N passed` and `Tests  M passed` lines as N and M. This
  tier does not collect the new suite (fact 12), so N and M are expected unchanged in step 7.

- [ ] **Step 0c. OpenSpec, as a before picture.** Run the batch README's OpenSpec validation block
      verbatim (the version that keeps its report; the sandbox guard rejects `rm -f`). Record
      `summary.totals.passed` as P. Expected: exit 0, `failed` 0.

- [ ] **Step 1. Write the checks first, and watch all three fail.** Create only
      `apps/wbs/fe-01/e2e/browser-packages-bundle.ts` and `apps/wbs/fe-01/browser-packages.test.ts`
      from section 6, then declare the new root file: add `apps/wbs/fe-01/browser-packages.test.ts`
      to the `lint` and the `lint:fast` commands in `apps/wbs/fe-01/project.json`, immediately
      after `apps/wbs/fe-01/vite-config.test.ts` in each, and add `"browser-packages.test.ts",` to
      `include` in `apps/wbs/fe-01/tsconfig.spec.json`, immediately after `"vite-config.test.ts",`.

  ```sh
  if (cd apps/wbs/fe-01 && bunx vitest run browser-packages.test.ts) >"$TMPDIR/evidence/step-1-red.txt" 2>&1; then
    echo "the suite passed with no probe to build" >&2; exit 1
  else
    test $? -ne 0
  fi
  grep -c "Tests  3 failed" "$TMPDIR/evidence/step-1-red.txt"
  ```

  Expected: the recorded output holds `[UNRESOLVED_ENTRY] Cannot resolve entry module
e2e/browser-packages-probe.ts.` and `Tests  3 failed (3)`, and the `grep` prints `1`. This is the
  red before the implementation, and it registers its three tests rather than collecting none.

- [ ] **Step 2. Create the probe with the forbidden import, and watch the named case fail.** Write
      `apps/wbs/fe-01/e2e/browser-packages-probe.ts` exactly as section 6 gives it **plus one extra
      first line**, `import 'di-bag/node';`. This is negative A, observed as the implementation's
      first red rather than as a later mutation.

  ```sh
  cp apps/wbs/fe-01/e2e/browser-packages-probe.ts "$TMPDIR/evidence/negative-a-probe.ts"
  if (cd apps/wbs/fe-01 && bunx vitest run browser-packages.test.ts) >"$TMPDIR/evidence/negative-a-output.txt" 2>&1; then
    status=0
  else
    status=$?
  fi
  test "$status" -ne 0
  grep -c "expected \[ 'node:util/types' \] to deeply equal \[\]" "$TMPDIR/evidence/negative-a-output.txt"
  ```

  Expected: `externalizes no Node built-in for the browser` fails with
  `AssertionError: expected [ 'node:util/types' ] to deeply equal []`, the other two pass —
  `Tests  1 failed | 2 passed (3)` — and the `grep` prints `1`.

- [ ] **Step 3. Remove that line, watch green, then write A's proof comment and patch.**

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run browser-packages.test.ts)
  if diff -u apps/wbs/fe-01/e2e/browser-packages-probe.ts "$TMPDIR/evidence/negative-a-probe.ts" >"$TMPDIR/evidence/negative-a.patch"; then
    echo "the faulty copy and the passing file are identical" >&2; exit 1
  else
    test $? -eq 1
  fi
  ```

  Expected: `Test Files  1 passed`, `Tests  3 passed`, about one second; the patch records the one
  injected line. Only now replace the placeholder in
  `externalizes no Node built-in for the browser` with a `Proof:` comment naming the injected
  line, the date, and the assertion message observed in step 2.

- [ ] **Step 4. Negative B, then its proof comment.** The helper's entry, pointed at a module that
      imports nothing. Save the passing helper to `"$TMPDIR/bundle-passing.ts"`, write
      `printf 'export {};\n' > "$TMPDIR/empty-probe.ts"`, then edit `PROBE_ENTRY` in the working
      tree to that absolute path. Use step 2's capture shape with `negative-b.patch` and
      `negative-b-output.txt`, restore the helper with `cp`, prove it with `cmp`, and only then
      assert on the captured status.

  Expected: `bundles di-bag, application-exception and caught-object-report-json` fails with
  `expected [ 'DI_BAG_CLASSIFIER_REQUIRED', …(2) ] to deeply equal []`, and
  `resolves nanoid to its browser entry` fails with
  `expected [] to deeply equal [ 'nanoid/index.browser.js' ]`; `Tests  2 failed | 1 passed (3)`.
  Two failures are expected here and are not a stop: the guard covers both cases.
  `externalizes no Node built-in for the browser` still passes, which is exactly the vacuity this
  guard exists for. Rerun green, then write the `Proof:` comment on the markers case naming the
  empty entry, both failing cases and their messages.

- [ ] **Step 5. Negative C, then its proof comment.** The browser condition, removed from the
      helper's build. Save the helper, then add one line to the inline config, directly under
      `logLevel: 'silent',`:

  ```ts
  resolve: { conditions: ['module'], mainFields: ['module', 'jsnext:main', 'jsnext'] },
  ```

  Same capture shape again, with `negative-c.patch` and `negative-c-output.txt`.

  Expected: `resolves nanoid to its browser entry` fails with
  `expected [ 'nanoid/index.cjs' ] to deeply equal [ 'nanoid/index.browser.js' ]`, and
  `externalizes no Node built-in for the browser` fails with
  `expected [ 'crypto' ] to deeply equal []` — nanoid's Node entry is exactly what drags a Node
  built-in into browser code. `Tests  2 failed | 1 passed (3)`. Restore, rerun green, then write
  the `Proof:` comment on the nanoid case.

- [ ] **Step 6. Negative D, the chunk-count refusal, then its proof comment.** Save the helper;
      change `rollupOptions: { input: PROBE_ENTRY }` to
      `rollupOptions: { input: [PROBE_ENTRY, '<$TMPDIR>/empty-probe.ts'] }` with the absolute path
      written out; same capture shape, `negative-d.patch` and `negative-d-output.txt`.

  Expected: all three cases fail with
  `Error: the browser build of the three libraries emitted 2 chunks, not one` —
  `Tests  3 failed (3)`, because the shared build is awaited inside each case. Restore, rerun
  green, then write the `Proof:` comment above the `if (chunks.length !== 1)` refusal in
  `browser-packages-bundle.ts`, naming the second entry and the three failing cases.

- [ ] **Step 7. The tier, the lint inputs, the types and the format.**

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)
  NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  NX_DAEMON=false bunx nx run wbs-fe-01:lint
  GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/browser-packages.test.ts apps/wbs/fe-01/e2e/browser-packages-bundle.ts apps/wbs/fe-01/e2e/browser-packages-probe.ts apps/wbs/fe-01/project.json apps/wbs/fe-01/tsconfig.spec.json
  NX_DAEMON=false bunx nx format:check --all
  ```

  Expected: the first repeats step 0b's N and M exactly, with `src/test-tiers.test.ts` among the
  passing files; the rest exit 0. If `test-tiers.test.ts` asks for the new file in `NODE_SUITES`,
  the `@vitest-environment node` header has lost the word `jsdom` — restore the header rather than
  editing `vitest.node-suites.ts`. If ESLint says the root test
  `was not found by the project service`, the `tsconfig.spec.json` entry of step 1 is missing.

- [ ] **Step 8. Hand over slice 1.** `git status --short --untracked-files=all` shows exactly:

  ```
  apps/wbs/fe-01/browser-packages.test.ts
  apps/wbs/fe-01/e2e/browser-packages-bundle.ts
  apps/wbs/fe-01/e2e/browser-packages-probe.ts
  apps/wbs/fe-01/project.json
  apps/wbs/fe-01/tsconfig.spec.json
  ```

  Commit subject for the planner:
  `test(wbs-fe-01): prove the three libraries bundle for the browser with no Node built-in`

  The report names the whole targets not run here — `wbs-fe-01:test`, `wbs-fe-01:test:unit`,
  `wbs-fe-01:e2e` and the host gate — as pending planner verification, and lists the four proof
  comments written, each with the message that earned it.

## 8. Slice 2 — the Chromium spec and the plan's claim

Slice 2 is dispatched with `--resume` from the commit the planner made from slice 1.

- [ ] **Step 9. Baseline for this slice.**

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  git status --short --untracked-files=all
  for path in apps/wbs/fe-01/browser-packages.test.ts \
    apps/wbs/fe-01/e2e/browser-packages-probe.ts \
    apps/wbs/fe-01/e2e/browser-packages-bundle.ts; do
    test -e "$path" || { echo "slice 1 is not in this clone: $path" >&2; exit 1; }
  done
  test ! -e apps/wbs/fe-01/e2e/browser-packages.spec.ts || { echo "the spec already exists" >&2; exit 1; }
  (cd apps/wbs/fe-01 && bunx vitest run browser-packages.test.ts)
  ```

  Expected: `git status` prints nothing, because slice 1 is committed; the three files exist; the
  spec does not; slice 1's suite is green at `Tests  3 passed`. Then run the OpenSpec block and
  record this slice's own `passed` count as P2; step 12 compares with P2, not with slice 1's P.

- [ ] **Step 10. Create `apps/wbs/fe-01/e2e/browser-packages.spec.ts`** exactly as section 6 gives
      it, with all three `Proof:` placeholders left as they are. **Do not run it**: Playwright
      needs a Chromium this sandbox does not have, and `wbs-fe-01:e2e` starts three servers.

- [ ] **Step 11. Replace the plan's claim.** In
      `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, find the amendment bullet
      that begins `- **Browser proof is partial.**` and replace that bullet, both of its lines,
      with:

  ```
  - **The browser proof is a check now.** Work item 040.1 added a probe of the three libraries
    built through `apps/wbs/fe-01/vite.config.ts`: `apps/wbs/fe-01/browser-packages.test.ts`
    holds the build property — no module is externalized for the browser, and nanoid keeps its
    browser entry — and `apps/wbs/fe-01/e2e/browser-packages.spec.ts` runs that bundle in the
    layout gate's Chromium. Import `di-bag`, never `di-bag/node`: Vite answers a Node built-in in
    browser code with a warning and a stub that throws at page load, and inside `vitest` that
    warning is not even delivered, so the module identities are what the check reads. Neither
    check says anything about what application code imports, and neither gives `@shared/failures`
    the browser fixture this plan's slice 2 asks for; both remain open.
  ```

- [ ] **Step 12. Check what can be checked here.**

  ```sh
  NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  NX_DAEMON=false bunx nx run wbs-fe-01:lint
  GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/e2e/browser-packages.spec.ts docs/superpowers/plans/2026-09-17-personal-package-adoption.md
  NX_DAEMON=false bunx nx format:check --all
  (cd apps/wbs/fe-01 && bunx vitest run browser-packages.test.ts)
  ```

  Expected: every command exits 0 and the last still reports `Tests  3 passed`. Run the OpenSpec
  block once more: `failed` 0 and `passed` equal to P2, since this packet creates no change.

- [ ] **Step 13. Hand over slice 2.** Added paths:

  ```
  apps/wbs/fe-01/e2e/browser-packages.spec.ts
  docs/superpowers/plans/2026-09-17-personal-package-adoption.md
  ```

  Commit subject: `test(wbs-fe-01): run the three libraries in Chromium from the Vite bundle`

  Under "Not verified" the report says that `wbs-fe-01:e2e`, `wbs-fe-01:test`,
  `wbs-fe-01:test:unit` and the host gate were not run here, and that the spec's three `Proof:`
  comments are still placeholders awaiting the planner's observations in section 10.

## 9. Verification

Counts are relative throughout: the planner records each baseline immediately before this packet,
on the same commit, because other packets in this batch move the same totals.

| Command                                                                                  | Who      | Expected                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `(cd apps/wbs/fe-01 && bunx vitest run browser-packages.test.ts)`                        | executor | Exit 0, `Test Files  1 passed`, `Tests  3 passed`                                                        |
| Sandbox unit command (step 0b)                                                           | executor | Exit 0, the same file and test counts as that baseline                                                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                        | executor | Exit 0                                                                                                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                             | executor | Exit 0                                                                                                   |
| `NX_DAEMON=false bunx nx format:check --all`                                             | executor | Exit 0                                                                                                   |
| OpenSpec validation block                                                                | executor | `failed` 0, `passed` unchanged from that slice's own baseline                                            |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run wbs-fe-01:test` | planner  | The UTC leg gains **one file and three tests** over the recorded baseline; the Auckland leg is unchanged |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit`                                        | planner  | Unchanged from the recorded baseline, in files and in tests                                              |
| `CI=1 E2E_PORT_SHIFT=1900 NX_DAEMON=false bunx nx run wbs-fe-01:e2e`                     | planner  | **One passing test more** than the recorded baseline; skips unchanged                                    |
| `bin/h2puni-gate.sh <sha>`                                                               | planner  | On the shared build host only; not run in an attempt                                                     |

The planner-only rows are planner-only for the reasons the execution contract gives: Node may not
spawn `bun` in the sandbox, and there is no Chromium there.

## 10. Negative proofs

> **Isolation, for every planner browser run (slice 2 dispatch review, 2026-09-20).** Run every browser baseline, fault and restored-green check with `CI=1` and the same `E2E_PORT_SHIFT`. Shift 1900 selects ports 5000, 5100 and 6100. `CI=1` disables existing-server reuse (`playwright.config.ts` sets `reuseExistingServer: !isCi`). If any port is occupied, stop and select another valid shift for all three tiers; never enable reuse or terminate an unrelated server. The focused command is `CI=1 E2E_PORT_SHIFT=1900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts browser-packages.spec.ts`.

Every message below was watched in this repository on 2026-09-20, in the runner named. None of
these runs reports zero tests: the Vitest ones register three cases and the Chromium one registers
its single case, whatever the fault.

| #   | Check                                                  | Fault                                                                                                                    | The named test fails with                                                                                                            | Who      |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| A   | `externalizes no Node built-in for the browser`        | `import 'di-bag/node';` as the probe's first line (slice 1, step 2)                                                      | `expected [ 'node:util/types' ] to deeply equal []`; `Tests  1 failed \| 2 passed (3)`                                               | executor |
| B   | `bundles …` and `resolves nanoid to its browser entry` | `PROBE_ENTRY` pointed at a module that imports nothing                                                                   | `expected [ 'DI_BAG_CLASSIFIER_REQUIRED', …(2) ] to deeply equal []` and `expected [] to deeply equal [ 'nanoid/index.browser.js' ]` | executor |
| C   | `resolves nanoid to its browser entry` (and A with it) | the `browser` condition and main field removed from the helper's build                                                   | `expected [ 'nanoid/index.cjs' ] to deeply equal [ 'nanoid/index.browser.js' ]`, beside `expected [ 'crypto' ] to deeply equal []`   | executor |
| D   | the helper's one-chunk refusal                         | a second entry added to `input`                                                                                          | `Error: the browser build of the three libraries emitted 2 chunks, not one`; `Tests  3 failed (3)`                                   | executor |
| E   | the Chromium case, `expect(pageErrors)`                | the same one line as A                                                                                                   | received gains `"Error: DI_BAG_INVALID_CONFIGURATION: withConfiguration runtime requires isNativePromise…"`                          | planner  |
| F   | the Chromium case, `expect(proof)`                     | `redact` dropped from the probe's options bag                                                                            | `- "disclosesTheSecret": false,` against `+ "disclosesTheSecret": true,`                                                             | planner  |
| G   | the Chromium case, `expect(proof)`                     | the disposer's body emptied                                                                                              | `- "disposed": Array [ "session",` against `+ "disposed": Array [],`                                                                 | planner  |
| H   | the Chromium case, `expect(proof)`                     | the one `toReports` call replaced by `toDiagnosticReport` and `toPublicReport` over two separate `ProbeFailed` instances | `- "correlated": true,` against `+ "correlated": false,`                                                                             | planner  |
| I   | the Chromium case, `expect(unexpectedRequests)`        | `void fetch('https://unexpected.invalid/fault').catch(() => undefined);` added to the probe                              | `expect(unexpectedRequests).toEqual([])` fails with `"https://unexpected.invalid/fault"` in the received array                       | planner  |

E to I are all mandatory; none is an alternative to another. Three of them prove one assertion
each of the three the spec makes, and F, G and H each prove a different field of the same
`toEqual`, because one differing field says nothing about the others.

Two details that were measured and matter. **H needs two instances**, not two calls: a typed
exception carries its own occurrence identifier, so `toDiagnosticReport` and `toPublicReport` over
the _same_ instance still correlate and the fault passes. And **I catches its own rejection
deliberately**: an uncaught `fetch` failure also raises a page error, which fails `expect(pageErrors)`
first and leaves the request observer unproven.

**How the planner runs E to I.** From the repository root, on the merged branch:

```sh
bun run tools/dev/setup.ts
CI=1 E2E_PORT_SHIFT=1900 NX_DAEMON=false bunx nx run wbs-fe-01:e2e
```

`bun run tools/dev/setup.ts` is what the `e2e` target runs first and what writes the three `.env`
files a fresh checkout lacks; its output is local preparation and is never committed. Record that
green run as the baseline. Then, one fault at a time: save the file's passing bytes, inject, save
the patch under `evidence/`, run the spec alone with
`bunx playwright test --config apps/wbs/fe-01/playwright.config.ts browser-packages.spec.ts` (the
config starts the three servers; the spec does not use them), save the failing output, restore with
`cp`, prove it with `cmp`, and rerun green. When E is done write the `Proof:` comment above
`expect(pageErrors)`; when F, G and H are all done write the one above `expect(proof)`, naming all
three faults and the three field differences; when I is done write the one above
`expect(unexpectedRequests)`. A placeholder that is still a placeholder is a proof nobody has
earned, and the packet is not complete until all three are written.

## 11. Stop conditions

Each is false on the real starting tree of the slice it belongs to; meeting one means stop and
report, not improvise.

1. **Slice 1 only:** any of the four new files already exists, or `vitest.node-suites.ts` already
   mentions `browser-packages`. **Slice 2 only:** any of slice 1's three files is missing, the
   clone is not at slice 1's reviewed commit, or the Chromium spec already exists.
2. The slice's own baseline — the sandbox unit command, the OpenSpec block, and in slice 2 slice
   1's suite — is not green before any edit.
3. Any run of `browser-packages.test.ts` reports a number of registered tests other than three, in
   particular zero. Every intended red in this packet — step 1's missing entry, step 2's
   forbidden import, and negatives B, C and D — registers three tests and fails one, two or three
   of them; a run that collects nothing means the file no longer awaits its build inside the
   cases, and that is a defect, not a proof.
4. The Vite build inside the suite fails for a reason other than the injected fault. Report the
   message; do not relax the helper's throw.
5. Any prescribed line does not type check or does not lint. Report the exact message; do not reach
   for `any`, a non-null assertion or a disable comment.
6. A negative's named test passes, or fails with a different message. Extra failing tests are
   recorded, never a stop — B, C and D each fail more than one case by design, as their expected
   results say.
7. `src/test-tiers.test.ts` demands the new suite in `NODE_SUITES`, and restoring the
   `@vitest-environment node` header does not settle it.
8. The task appears to need a file outside section 5's plan — in particular `vite.config.ts`,
   anything under `src/`, the CI workflow, or the root manifest.
9. Any step needs the network.

## 12. Assumptions recorded, not asked

1. **No OpenSpec change.** This packet adds tests and corrects a plan document; it changes no
   observable behaviour, contract, migration, deploy safety or architecture, so R4's exemption
   applies, exactly as it did for 020.1's install slice. The validation block still runs, to show
   the count did not move.
2. **The probe lives in `e2e/`, not in `src/`.** It is never imported by the application and never
   reaches the shipped bundle, whose entry is `index.html`. Putting it under `src/` would place
   code that never ships inside the app's own source tree and inside `tsconfig.app.json`.
3. **The Chromium half goes into the existing layout gate** rather than into a new target. A new
   target would be in no workflow and no gate, which is the "check nobody runs" failure mode, and
   it would also owe the `CLAUDECODE=0` default every test-running target name carries. The cost is
   one extra Vite build, about a second, in a suite of many minutes.
4. **The probe exercises the adoption plan's own vocabulary** — `fromSyncFactory`,
   `fromAsyncFactory`, `withDisposal`, one `toReports` call, a redaction policy of patterns —
   rather than the smallest possible call of each library, so that the browser proof covers the
   calls the later slices will make, and so that each of F, G and H has a real fault to inject.
5. **`acquiredAt` is a fixed number, not a clock read**, so the Chromium assertion is one `toEqual`
   over the whole proof object and cannot drift with the machine's time.

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was checked against the repository before it was acted on; the checks are named.

| Finding                                                       | Disposition                        | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1: the helper fails lint                             | **Fixed, and the cause was worse** | Confirmed by running `bunx eslint` on the files in the worktree: three errors, exactly as reported. The reviewer's fix lints clean — but it would have left a check that cannot fail: inside `vitest` the externalization warning reaches neither `onwarn` nor a custom logger (fact 7), so the assertion passed against the faulty probe. The warning machinery is gone; the helper reports module identities, and `externalizedForBrowser` is derived from `__vite-browser-external:` module ids. Watched failing as negative A. |
| Critical 2: the fault block cannot restore under `set -e`     | Fixed                              | Every fault block now captures the failing run inside `if … then status=0; else status=$?; fi`, restores with `cp`, proves the restore with `cmp`, and only then asserts on the captured status.                                                                                                                                                                                                                                                                                                                                   |
| Critical 3: the stop condition forbids slice 2's prerequisite | Fixed                              | Stop condition 1 is split per slice. Slice 2 starts from the reviewed slice 1 commit, asserts the three files exist and the spec does not, reruns slice 1's suite, and records its own OpenSpec baseline P2.                                                                                                                                                                                                                                                                                                                       |
| Critical 4: the launcher cannot select this packet            | Fixed (superseded)                 | The launcher now accepts `--batch batch-2`; section 0 carries the two real dispatch commands instead of a prerequisite. See the second review's table below.                                                                                                                                                                                                                                                                                                                                                                       |
| Important 1: `getRandomValues` does not identify nanoid       | Fixed                              | Confirmed: `caught-object-report-json/tokens.js` contains it. The case asserts the chosen module is `nanoid/index.browser.js`, and negative C forces `nanoid/index.cjs` while the rest of the bundle stays intact.                                                                                                                                                                                                                                                                                                                 |
| Important 2: new checks without negatives                     | Fixed                              | Negatives C, D and the Chromium ones added. All were watched in the real runners.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Important 3: the claim overreaches                            | Fixed                              | Section 1 states what the checks do not cover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Important 4: implementation before the test                   | Fixed                              | Step 1 creates the helper and the suite and watches all three cases fail; step 2 adds the probe.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Important 5: `\|\| true` in the baseline                      | Fixed                              | Step 0 checks the four paths with `test ! -e`, and accepts exactly status 1 from the suite-list `grep`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Important 6: absolute whole-target counts                     | Fixed                              | Section 9 is relative throughout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Important 7: proof C without fresh-clone preparation          | Fixed                              | Section 10 requires `bun run tools/dev/setup.ts` and a green focused run before any injection.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Minor 1: wrong line anchors                                   | Fixed                              | Section 3 names symbols instead, since main moves the numbers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Minor 2: wrong proof-section reference                        | Fixed                              | Section 6 points at section 7 for the executor's proofs and section 10 for the planner's.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Minor 3: `reportVersion` described as optional                | Fixed                              | The JSDoc says the value may be undefined.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Each finding was reproduced in the worktree before it was acted on, then the files were removed and
the tree compared byte for byte; `git status` is clean of them. Every command and every fault in
the table below was run.

| Finding                                                               | Disposition | What changed, and what was observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1: the intended reds collect no tests and trip the stop rule | Fixed       | Reproduced: with the build awaited at module scope, both the missing probe and the two-chunk fault printed `Tests  no tests`. The suite now awaits one shared lazy build **inside** each case, with an explicit 120-second budget. Re-run: missing probe `Tests  3 failed (3)` with `[UNRESOLVED_ENTRY] Cannot resolve entry module e2e/browser-packages-probe.ts.`; two chunks `Tests  3 failed (3)` with the refusal message. Steps 1, 2 and 6 and stop condition 3 rewritten; the zero-test exception is gone, and zero tests is now a stop everywhere. |
| Important 1: launcher facts are stale                                 | Fixed       | Verified in `run-executor.sh`: `--batch batch-2` maps to `/home/df/wd/puni/batch-2`, branch `batch-2/`, `/tmp/punibatch2`, and this packet directory. Section 0 now carries both dispatch commands, the second with `--resume` from slice 1's commit; the old prerequisite is gone.                                                                                                                                                                                                                                                                        |
| Important 2: missing adjacent proof comments                          | Fixed       | Seven placeholders now: three in the suite, one above the helper's chunk-count refusal (written in step 6, which no longer says the refusal goes unproven), and three in the spec — above `expect(pageErrors)`, `expect(proof)` and `expect(unexpectedRequests)`. Section 6's introduction and both hand-overs say who writes which and when.                                                                                                                                                                                                              |
| Important 3: F left disposal optional and correlation unproven        | Fixed       | E to I are now five mandatory planner proofs, one per assertion and one per field of the proof object. All were watched: redaction `- "disclosesTheSecret": false,` / `+ … true,`; disposal `- "disposed": Array [ "session",` / `+ … Array [],`; correlation `- "correlated": true,` / `+ … false,`. Correlation needed a measured detail: two `toReports`-equivalent calls over the **same** exception instance still correlate, because the instance carries the identifier, so the fault uses two instances.                                           |
| Important 4: shared-failures ownership is wrong                       | Fixed       | Confirmed in `020-2-shared-failures.md`'s "Unknowns and what is left undone": no batch 2 packet proves that module in a browser. Section 1 and the plan's replacement bullet now say it stays unassigned.                                                                                                                                                                                                                                                                                                                                                  |
| Minor 1: the timeout comment reverses the order                       | Fixed       | The comment now describes one budget covering the routed page, the build and the execution, without claiming an order.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH

The verdict is DISPATCH: slice 1 has no blocking defect under the stated
executor restrictions and planner review; this does not itself authorize
slice 2 or the planner's browser slice. The review named no blocking problems
for slice 1, so there was no blocking text to apply. Two non-blocking, dispatch-scoped
corrections were applied by the planner by hand, before slice 2 and its
dispatch command are used: section 0's temporary root is now `/tmp/puni-batch2`,
not the wrong `/tmp/punibatch2`, and section 0 now says explicitly that
`--resume` keeps the resumed clone's own HEAD rather than checking out
`<slice-1-commit>`, and that the launcher only requires that commit to exist
in `/home/df/wd/puni/puni-00`, so the planner must confirm both facts before
dispatching slice 2. The remaining non-blocking notes — that externalization
detection is environment-dependent, and that the planner should use an
isolated stack for the whole browser suite because the Playwright config can
otherwise reuse existing servers — are advisory rather than literal
replacement text and were left for the planner to apply when running E to I.
