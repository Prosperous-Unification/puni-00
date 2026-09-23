import { expect, test } from '@playwright/test';

import { buildBrowserProbeBundle } from './browser-probe-bundle';
// A type-only import: Playwright loads a spec in Node, so a value imported from
// the probe would execute it here, before a browser exists.
import type { LifetimeBfcacheProbe } from './lifetime-bfcache-probe';

/**
 * Regular Chromium, not `chromium-headless-shell` — the default project's own
 * channel — and Playwright's own bfcache-disabling launch switch removed.
 *
 * `chromium-headless-shell` refuses every back/forward-cache restoration as an
 * automation-delegate policy independent of `--disable-back-forward-cache`
 * (`node_modules/playwright-core/lib/coreBundle.js` selects it for an ordinary
 * headless launch; `channel: 'chromium'` selects the regular, non-headless-shell
 * build instead). Verified against a standalone served-pages probe under this
 * exact configuration: `pageshow.persisted` read `true`, reproduced three times,
 * with zero `Page.backForwardCacheNotUsed` CDP events — this file is that same
 * configuration, driving the real production bootstrap instead of two static
 * pages.
 *
 * CI already installs regular Chromium alongside `chromium-headless-shell`
 * (`.github/workflows/ci.yml`'s own `bunx playwright install --with-deps
 * chromium` installs both — Playwright's own `browsers.json` marks both
 * `installByDefault` for that one argument); this spec's own project stays
 * opt-in as a verification-policy choice (`playwright.config.ts`'s own
 * comment), not because the channel is unavailable.
 */
test.use({
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
});

/** An origin nothing serves, fulfilled by the route below — two pages on it. */
const origin = 'https://lifetime-bfcache-probe.invalid';

test('a persisted pageshow rebuilds the application runtime after a real back/forward-cache restoration', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const bundle = await buildBrowserProbeBundle('e2e/lifetime-bfcache-probe.ts');
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === `${origin}/a`) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body:
          '<!doctype html><meta charset="utf-8"><title>a</title>' +
          `<script type="module">${bundle.code}</script>` +
          '<a id="go" href="/b">go</a>',
      });
      return;
    }
    if (url === `${origin}/b`) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>b</title>back with browser.goBack()',
      });
      return;
    }
    await route.abort('blockedbyclient');
  });

  await page.goto(`${origin}/a`);
  const readBuilds = async (): Promise<number> =>
    await page.evaluate(() =>
      (
        globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }
      ).lifetimeBfcacheProbe.builds(),
    );
  await expect.poll(readBuilds, 'the probe never acquired its first runtime').toBe(1);

  await page.click('#go');
  await page.waitForURL('**/b');
  // `waitUntil: 'commit'` rather than the default `'load'`: a bfcache-restored
  // page never fires a fresh `load` event, so the default wait would time out
  // on exactly the restoration this spec is proving happens (watched: 30000ms
  // exceeded, waiting for "load", against this exact configuration).
  await page.goBack({ waitUntil: 'commit' });
  // `expect(page).toHaveURL(...)`, not `waitForURL`: Playwright's own
  // `waitForURL` calls `waitForLoadState(waitUntil ?? 'load', ...)` even when
  // the URL already matches (`playwright-core/lib/coreBundle.js`), so it is
  // not a bare address assertion — it is a second, undocumented wait for
  // `load`, which a bfcache restoration never fires. `toHaveURL` polls the
  // address alone.
  await expect(page).toHaveURL(`${origin}/a`);

  const readPersisted = async (): Promise<boolean[]> =>
    await page.evaluate(() =>
      (
        globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }
      ).lifetimeBfcacheProbe.pageshowPersisted(),
    );
  const readUsable = async (): Promise<boolean[]> =>
    await page.evaluate(() =>
      (
        globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }
      ).lifetimeBfcacheProbe.usableAtLive(),
    );

  await expect
    .poll(readPersisted, 'the restoration never delivered a persisted pageshow')
    .toContain(true);
  await expect
    .poll(readBuilds, 'a persisted pageshow did not rebuild the application runtime')
    .toBe(2);
  // Not just that a second build ran — that its own services are readable and
  // writable, both after the first publication and after this restoration.
  // Pairing `acquireApplicationRuntime` with a slot other than the real
  // `applicationSlot` its own `isLive` reads would make every access here
  // throw "the page withdrew this preference store before the access
  // completed" while `builds()` still read correctly — this is the assertion
  // that catches that mismatch, not `builds()` alone.
  const usable = await readUsable();
  expect(usable, 'the application runtime was not usable after every live publication').toEqual([
    true,
    true,
  ]);
});
