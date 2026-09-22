import { expect, test } from '@playwright/test';

import { buildBrowserProbeBundle } from './browser-probe-bundle';
// A type-only import, and it has to stay one: Playwright loads a spec in Node, so a value
// imported from the probe would execute the probe here and fail before a browser existed.
import type { LifetimeFaultProof } from './lifetime-fault-probe';

/**
 * Strings that exist only inside the refused construction, and must exist nowhere else.
 *
 * Written out rather than derived: `lifetime-fault-probe.ts` throws exactly these.
 */
const RAW_MARKERS = ['alice@example.com', 'Bearer live-token', 'row 42 of plan_steps'];

/**
 * An origin nothing serves, fulfilled by the route below.
 *
 * `https`, so the page is a secure context and `crypto.getRandomValues` exists — which is
 * what every occurrence identifier needs. `fault-boundary.spec.ts` bootstraps its own
 * bundle the same way and for the same reason.
 */
const bootstrap = 'https://lifetime-fault-probe.invalid/';

test('a refused application runtime discloses a public report and nothing raw', async ({
  page,
}) => {
  // One budget for the whole case — the routed page, the Vite build of the probe and its
  // execution — rather than the config's 60 seconds.
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
        body: '<!doctype html><meta charset="utf-8"><title>lifetime fault probe</title>',
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
  await page.goto(bootstrap);

  const bundle = await buildBrowserProbeBundle('e2e/lifetime-fault-probe.ts');
  await page.addScriptTag({ content: bundle.code, type: 'module' });
  const proof = await page.evaluate(
    async () =>
      await (globalThis as unknown as { lifetimeFaultProof?: Promise<LifetimeFaultProof> })
        .lifetimeFaultProof,
  );

  // A refused construction is a modelled outcome: nothing escaped to the page's own
  // error handler, or every assertion below would be vacuous.
  expect(pageErrors).toEqual([]);
  expect(proof?.pageText).toContain('The page’s services stopped: Something went wrong');
  expect(proof?.reference).toMatch(/^AE_[0-9A-Z]+$/);
  // The fatal page's own subtree, markup and all, and **not** `page.content()`: the probe
  // is injected with `addScriptTag`, so the whole document contains the probe's own source
  // and therefore every marker in it.
  expect(RAW_MARKERS.filter((marker) => proof?.markup.includes(marker) ?? true)).toEqual([]);

  // The console is a disclosure boundary too, and in a real browser it carries React's
  // lines as well as the bootstrap's. Every line is read, not only the one this code wrote.
  const whole = consoleLines.join('\n');
  expect(RAW_MARKERS.filter((marker) => whole.includes(marker))).toEqual([]);
  expect(consoleLines).toContain(
    `the page's runtime failed Something went wrong ${String(proof?.reference)} nothing`,
  );
});
