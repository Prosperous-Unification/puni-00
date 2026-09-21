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
  // Proof: prepending `import 'di-bag/node'` to `fault-disclosure.ts` made this case
  // receive `DI_BAG_INVALID_CONFIGURATION` in `pageErrors` (N16, 2026-09-21).
  expect(pageErrors).toEqual([]);
  // Proof: falling back to the caught Error's message made this assertion receive
  // `The app stopped: saving plan p-7 for alice@example.com failed` (N18, 2026-09-21).
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
  // Proof: deleting `onCaughtError` from the root options let React's own line expose
  // `alice@example.com` through this full-console filter (N17, 2026-09-21).
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
  // Proof: fetching `https://unexpected.invalid/fault` in the probe made that URL appear
  // in `unexpectedRequests` and failed this assertion (N19, 2026-09-21).
  expect(unexpectedRequests).toEqual([]);
});
