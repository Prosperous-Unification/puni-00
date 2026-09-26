import { expect, test } from '@playwright/test';

import type { BrowserPackagesProof } from './browser-packages-probe';
import { buildBrowserProbeBundle } from './browser-probe-bundle';

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

  const bundle = await buildBrowserProbeBundle('e2e/browser-packages-probe.ts');
  await page.addScriptTag({ content: bundle.code, type: 'module' });
  const proof = await page.evaluate(
    async () =>
      await (globalThis as unknown as { browserPackagesProof?: Promise<BrowserPackagesProof> })
        .browserPackagesProof,
  );

  // First, because a bundle that throws while it loads never assigns the global, and
  // the module's own error is the legible half of that failure.
  // Proof: with `import 'di-bag/node';` as the probe's first line this failed on a received
  // `"Error: DI_BAG_INVALID_CONFIGURATION: withConfiguration runtime requires isNativePromise…"`
  // where `[]` was expected. Watched in Chromium, 2026-09-20.
  // Proof: di-bag 0.5.0 has no `di-bag/node`. On 2026-09-26, the probe given a namespace import
  // of `node:util/types` and a microtask calling its `isPromise`, after the global was assigned,
  // failed only here, on a received `"TypeError: he.isPromise is not a function"`; with this
  // assertion weakened to an array check the same probe passed. Watched in Chromium.
  expect(pageErrors).toEqual([]);
  // Proof: three faults in the probe, one at a time, each failing a different field here:
  // `redact` dropped from the options bag gave `- "disclosesTheSecret": false,` against
  // `+ "disclosesTheSecret": true,`; the disposer's body emptied gave `- "disposed": Array [
  // "session", ]` against `+ "disposed": Array []`; the one `toReports` call replaced by
  // `toDiagnosticReport` and `toPublicReport` over two separate exceptions gave `- "correlated":
  // true,` against `+ "correlated": false,`. Watched in Chromium, 2026-09-20.
  expect(proof).toEqual({
    acquiredAt: 1_726_800_000_000,
    disposed: ['session'],
    correlated: true,
    publicCode: 'PROBE_FAILED',
    disclosesTheSecret: false,
    reportVersion: 'corj/v0.15',
  });

  // The bounded settle before the request assertion, and the reason it is not
  // superstition, are in `portable-composition.spec.ts`: without it the assertion races
  // the route callback and an injected request passes.
  await page.waitForTimeout(50);
  // Proof: with `void fetch('https://unexpected.invalid/fault').catch(() => undefined);` added to
  // the probe this failed on a received `"https://unexpected.invalid/fault"` where `[]` was
  // expected. Watched in Chromium, 2026-09-20.
  expect(unexpectedRequests).toEqual([]);
});
