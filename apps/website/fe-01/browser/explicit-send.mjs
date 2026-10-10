import { env } from 'node:process';

import { chromium } from 'playwright';

// The anonymous Build on the loopback demo stack (DEMO_AUTH=1): the Home request waits for an
// explicit Send, and nothing reaches /conversation/stream on mount, reload or a dropped POST.

const appOrigin = env['PUNI_APP_ORIGIN'] ?? 'http://localhost:4218';
const apiOrigin = env['PUNI_API_ORIGIN'] ?? 'http://localhost:3118';
const siteOrigin = env['PUNI_SITE_ORIGIN'] ?? 'http://localhost:4318';
const description = 'Build a booking service for a community bicycle workshop.';

/** Opens Build for one anonymous draft and records its conversation stream POSTs. */
async function openDraft(browser, viewport) {
  // Each draft is its own visitor behind a simulated gateway hop (the stack runs with
  // TRUSTED_PROXY_HOPS=1), as the per-source daily caps require.
  const visitor = `10.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`;
  const intake = await globalThis.fetch(`${apiOrigin}/intakes`, {
    method: 'POST',
    headers: {
      origin: siteOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': visitor,
    },
    body: JSON.stringify({ description }),
  });
  if (intake.status !== 201) throw new Error(`Fixture intake failed: ${String(intake.status)}`);
  const cookie = intake.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Fixture intake did not issue a draft cookie');
  const separator = cookie.indexOf('=');
  if (separator < 1) throw new Error('Fixture draft cookie is malformed');
  const context = await browser.newContext({ viewport });
  await context.route(`${apiOrigin}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': visitor } }),
  );
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: appOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  const posts = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url() === `${apiOrigin}/conversation/stream` && request.method() === 'POST')
      posts.push(request.postDataJSON());
  });
  return { page, posts };
}

/** Waits until the reply in progress ends: the Stop control is gone. */
async function settle(page) {
  await page.getByRole('button', { name: 'Stop response' }).waitFor({ state: 'detached' });
}

const errors = [];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const { page, posts: streamPosts } = await openDraft(browser, { width: 1440, height: 900 });
  await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Send/ }).waitFor();
  await page.waitForTimeout(400);
  if (streamPosts.length !== 0)
    throw new Error(`Mount triggered ${String(streamPosts.length)} stream POSTs before Send`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Send/ }).waitFor();
  await page.waitForTimeout(400);
  if (streamPosts.length !== 0)
    throw new Error(`Reload triggered ${String(streamPosts.length)} stream POSTs before Send`);
  await page.getByText(description).first().waitFor();
  await page.screenshot({ path: '/tmp/puni-explicit-send-before.png', fullPage: true });
  await page.getByRole('button', { name: /^Send/ }).click();
  await page.getByLabel('Your message').waitFor();
  await settle(page);
  await page.locator('.build-message.assistant').first().waitFor();
  if (streamPosts.length !== 1 || streamPosts[0]?.initial !== true)
    throw new Error(`Expected one initial stream POST after Send: ${JSON.stringify(streamPosts)}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.build-message.assistant').first().waitFor();
  await page.waitForTimeout(400);
  if (streamPosts.length !== 1)
    throw new Error(`Reload duplicated the initial stream POST: ${JSON.stringify(streamPosts)}`);
  const userTurns = await page.locator('.build-message.user').allInnerTexts();
  if (userTurns.length !== 1 || !userTurns[0]?.includes(description))
    throw new Error(`Expected one saved Home turn: ${JSON.stringify(userTurns)}`);
  await page.screenshot({ path: '/tmp/puni-explicit-send-after.png', fullPage: true });
  const initialPosts = streamPosts.length;
  await page.getByLabel('Your message').fill('Can visitors reserve a time?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.locator('.build-message.assistant').nth(1).waitFor();
  await settle(page);
  if (streamPosts.length !== 2 || streamPosts[1]?.initial === true)
    throw new Error(
      `Ordinary follow-up did not use the later-turn path: ${JSON.stringify(streamPosts)}`,
    );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.build-message.assistant').nth(1).waitFor();
  const laterUsers = await page.locator('.build-message.user').allInnerTexts();
  if (
    laterUsers.length !== 2 ||
    !laterUsers[0]?.includes(description) ||
    !laterUsers[1]?.includes('Can visitors reserve a time?')
  )
    throw new Error(`Ordinary follow-up changed saved turn order: ${JSON.stringify(laterUsers)}`);

  const { page: recoveryPage, posts: recoveryPosts } = await openDraft(browser, {
    width: 390,
    height: 844,
  });
  await recoveryPage.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await recoveryPage.getByRole('button', { name: /^Send/ }).waitFor();
  await recoveryPage.route(`${apiOrigin}/conversation/stream`, (route) => route.abort('failed'));
  await recoveryPage.getByRole('button', { name: /^Send/ }).click();
  await recoveryPage.getByRole('button', { name: '[ Retry ]' }).waitFor();
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.getByRole('button', { name: /^Send/ }).waitFor();
  if (!(await recoveryPage.locator('#build-message[readonly]').isVisible()))
    throw new Error('Dropped initial request exposed the ordinary composer after reload');
  if (await recoveryPage.getByLabel('Your message').count())
    throw new Error('A different message can bypass the saved Home request');
  await recoveryPage.screenshot({
    path: '/tmp/puni-explicit-send-mobile-recovery.png',
    fullPage: true,
  });
  await recoveryPage.unroute(`${apiOrigin}/conversation/stream`);
  await recoveryPage.getByRole('button', { name: /^Send/ }).click();
  await recoveryPage.getByLabel('Your message').waitFor();
  await settle(recoveryPage);
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.locator('.build-message.assistant').first().waitFor();
  const recoveredUsers = await recoveryPage.locator('.build-message.user').allInnerTexts();
  if (recoveredUsers.length !== 1 || !recoveredUsers[0]?.includes(description))
    throw new Error(`Recovery changed the first saved turn: ${JSON.stringify(recoveredUsers)}`);
  if (
    recoveryPosts.length !== 2 ||
    recoveryPosts[0]?.idempotencyKey !== recoveryPosts[1]?.idempotencyKey ||
    recoveryPosts[0]?.initial !== true ||
    recoveryPosts[1]?.initial !== true
  )
    throw new Error(`Initial retry lost its operation identity: ${JSON.stringify(recoveryPosts)}`);
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  globalThis.console.log(
    JSON.stringify({
      beforeSendPosts: 0,
      afterSendPosts: initialPosts,
      subsequentPosts: streamPosts.length,
      initialKey: streamPosts[0]?.idempotencyKey,
      userTurns: userTurns.length,
      recoveryPosts: recoveryPosts.length,
      screenshots: [
        '/tmp/puni-explicit-send-before.png',
        '/tmp/puni-explicit-send-after.png',
        '/tmp/puni-explicit-send-mobile-recovery.png',
      ],
    }),
  );
} finally {
  await browser.close();
}
