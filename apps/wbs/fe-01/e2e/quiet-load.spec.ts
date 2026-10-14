import { expect, type Page, test } from '@playwright/test';

/**
 * A healthy page load in local mode asks only what the deployment can answer.
 *
 * The session read reports which deployment features are active
 * (`openspec/changes/session-features`); with onboarding and organizations off,
 * the client must not issue their reads, so Chromium has no refused resource to
 * log. Every console error or warning and every 4xx/5xx answer during the load
 * is collected and the list must be empty.
 */
const PAGES = ['/', '/organization', '/spaces'] as const;

/** What one load said in the console and which answers it was refused. */
interface LoadNoise {
  console: string[];
  refused: string[];
}

async function loadQuietly(page: Page, path: string): Promise<LoadNoise> {
  const noise: LoadNoise = { console: [], refused: [] };
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      noise.console.push(`${message.type()}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      noise.refused.push(
        `${response.request().method()} ${new URL(response.url()).pathname} ${String(response.status())}`,
      );
  });
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  // Every read the page starts is settled before the lists are judged.
  await page.waitForLoadState('networkidle');
  return noise;
}

for (const path of PAGES) {
  // Proof: on origin/main b144be17d (no `features` on the session read) this
  // case failed for every path: `/` refused `GET /api/onboarding 403`,
  // `/organization` added the panels' 403s, `/spaces` `GET /api/spaces 409`,
  // each with Chromium's "Failed to load resource" console error.
  test(`loads ${path} in local mode with no refused request and no console noise`, async ({
    page,
  }) => {
    const noise = await loadQuietly(page, path);
    expect(noise).toEqual({ console: [], refused: [] });
  });
}
