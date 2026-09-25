// @vitest-environment node
//
// The same reason as `vite-config.test.ts` and `src/styles.test.ts`: this file runs a
// real Vite build, and importing `vite` under jsdom fails because esbuild refuses to
// load where `new TextEncoder().encode('') instanceof Uint8Array` is false — under
// jsdom it is. `src/test-tiers.test.ts` reads this text, so the word above also keeps
// this suite out of `vitest.node-suites.ts`, exactly as it does for those two files.
import { describe, expect, it } from 'vitest';

import { type BrowserProbeBundle, buildBrowserProbeBundle } from './e2e/browser-probe-bundle';

/**
 * One marker per library, each a string that library's own source carries.
 *
 * corj's version marker is reachable through `application-exception` as well, so this
 * list says all three libraries are in the bundle, not that each is imported directly.
 * What it is really for is vacuity: without it, a bundle that contained nothing at all
 * would satisfy every other case in this file.
 */
const LIBRARY_MARKERS = ['DI_BAG_CLASSIFIER_REQUIRED', 'appex/public/v4', 'corj/v0.15'];

/** nanoid's own top-level files, as `modules` names them: not `url-alphabet/index.js`. */
const NANOID_ENTRY = /\/nanoid\/[^/]+$/;

/** One build for the whole file, and a budget the build cannot outgrow unnoticed. */
const BUILD_BUDGET_MS = 120_000;

let building: Promise<BrowserProbeBundle> | undefined;

/**
 * The one browser build these cases read, built on first use and shared after that.
 *
 * Awaited inside the cases rather than at module scope, so that a build which throws
 * — a Node built-in, a second chunk, a missing entry — fails registered tests instead
 * of aborting collection. A run that reports no tests is a failure here as everywhere.
 *
 * @returns The shared build, awaited.
 */
async function theBundle(): Promise<BrowserProbeBundle> {
  building ??= buildBrowserProbeBundle('e2e/browser-packages-probe.ts');
  return await building;
}

describe('the three libraries in a browser build', () => {
  it(
    'externalizes no Node built-in for the browser',
    async () => {
      // Proof: importing `di-bag/node` in the probe failed here on 2026-09-20 with
      // `expected [ 'node:util/types' ] to deeply equal []`.
      // Proof: di-bag 0.5.0 has no `di-bag/node`. On 2026-09-25, `import 'node:util/types';` as
      // the probe's first line failed here with the same message; with this assertion weakened to
      // an array check the same probe passed all three cases.
      expect((await theBundle()).externalizedForBrowser).toEqual([]);
    },
    BUILD_BUDGET_MS,
  );

  it(
    'bundles di-bag, application-exception and caught-object-report-json',
    async () => {
      // Proof: pointing the helper at an empty entry on 2026-09-20 failed this case on
      // `expected [ 'DI_BAG_CLASSIFIER_REQUIRED', …(2) ] to deeply equal []` and the
      // nanoid case on `expected [] to deeply equal [ 'nanoid/index.browser.js' ]`.
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
      // Proof: removing the browser condition and main field on 2026-09-20 failed here
      // on `expected [ 'nanoid/index.cjs' ] to deeply equal
      // [ 'nanoid/index.browser.js' ]` and externalized `crypto` in the first case.
      const chosen = (await theBundle()).modules
        .filter((id) => NANOID_ENTRY.test(id))
        .map((id) => id.slice(id.lastIndexOf('/nanoid/') + 1));
      expect(chosen).toEqual(['nanoid/index.browser.js']);
    },
    BUILD_BUDGET_MS,
  );
});
