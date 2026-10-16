import { appendFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

const destination = process.env['FORGE_RECOVERY_TRACE'];
if (destination === undefined)
  throw new Error('FORGE_RECOVERY_TRACE is required by browser preload');
const recordEvent = (event: string, fields: unknown): void => {
  appendFileSync(
    `${destination}.jsonl`,
    `${JSON.stringify({ at: new Date().toISOString(), event, fields })}\n`,
  );
};
const launchBrowser = chromium.launch.bind(chromium);
chromium.launch = async (options) => {
  const browser = await launchBrowser(options);
  const createPage = browser.newPage.bind(browser);
  browser.newPage = async (settings) => {
    const page = await createPage(settings);
    await page.context().tracing.start({ screenshots: true, snapshots: true });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) recordEvent('main-frame-navigation', { url: frame.url() });
    });
    page.on('console', (message) => {
      recordEvent('console', { type: message.type(), message: message.text() });
    });
    page.on('pageerror', (failure) => {
      recordEvent('page-error', { message: failure.message });
    });
    await page.addInitScript(() => {
      let marker: unknown;
      Object.defineProperty(window, 'f9Marker', {
        configurable: true,
        get: () => marker,
        set: (value: unknown) => {
          marker = value;
          console.info('[forge-recovery-marker]', value, performance.timeOrigin);
        },
      });
    });
    const closeBrowser = browser.close.bind(browser);
    browser.close = async () => {
      await page.context().tracing.stop({ path: `${destination}.zip` });
      await closeBrowser();
    };
    return page;
  };
  return browser;
};
