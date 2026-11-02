import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { build } from 'bun';
import { chromium } from 'playwright';

const compiled = await build({
  entrypoints: [resolve('libs/website/adapters/analytics/src/browser.ts')],
  target: 'browser',
  write: false,
});
assert.ok(compiled.success, 'Canonical browser controller compiles');
assert.equal(compiled.outputs.length, 1);
const source = await compiled.outputs[0].text();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let cases = 0;
try {
  for (const host of ['dev.puni.dev', 'dev.app.puni.dev']) {
    const context = await browser.newContext();
    try {
      await context.addCookies([
        {
          name: 'functional',
          value: 'COOKIE_SENTINEL',
          domain: '.puni.dev',
          path: '/',
          secure: true,
        },
      ]);
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', (error) => failures.push(error.message));
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new globalThis.URL(request.url());
        if (url.href === 'https://dev.puni.dev/api/analytics/region') {
          await route.fulfill({
            json: { region: 'unknown', database: null },
            headers: { 'Access-Control-Allow-Origin': `https://${host}` },
          });
        } else if (url.hostname === host && url.pathname === '/controller.js') {
          await route.fulfill({ contentType: 'text/javascript', body: source });
        } else if (url.hostname === host && url.pathname === '/') {
          await route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><title>Owned regional request fixture</title><script type="module">
              import { createBrowserAnalytics } from '/controller.js';
              window.analytics = createBrowserAnalytics(window, {
                enabled: true, environment: 'development', measurementId: 'G-R0JM3R4SSV'
              });
            </script>`,
          });
        } else if (url.hostname === 'www.googletagmanager.com') {
          await route.fulfill({
            contentType: 'text/javascript',
            body: '/* Owned load-only fixture. */',
          });
        } else throw new Error(`Unowned fixture request ${request.url()}`);
      });
      const [wire] = await Promise.all([
        page.waitForRequest('https://dev.puni.dev/api/analytics/region', { timeout: 5000 }),
        page.goto(`https://${host}/?email=REGION_SECRET#PRIVATE_FRAGMENT`),
      ]);
      const request = { url: wire.url(), headers: await wire.allHeaders(), body: wire.postData() };
      globalThis.console.log(JSON.stringify({ host, request }));
      assert.equal(request.url, 'https://dev.puni.dev/api/analytics/region');
      assert.equal(request.body, null);
      assert.equal(
        request.headers['referer'],
        undefined,
        'Regional lookup must omit browser-generated Referer',
      );
      assert.equal(
        request.headers['cookie'],
        undefined,
        'Regional lookup must omit functional cookies',
      );
      assert.ok(
        !JSON.stringify(request).includes('REGION_SECRET'),
        'Regional wire excludes current query/email',
      );
      assert.ok(
        !JSON.stringify(request).includes('PRIVATE_FRAGMENT'),
        'Regional wire excludes current fragment',
      );
      assert.deepEqual(failures, []);
      cases++;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
globalThis.console.log(
  `Regional request privacy: ${cases} canonical-controller native browser cases passed; all requests intercepted.`,
);
