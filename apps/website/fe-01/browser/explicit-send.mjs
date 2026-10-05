import { env } from 'node:process';

import { chromium } from 'playwright';

const appOrigin = env['PUNI_APP_ORIGIN'] ?? 'http://localhost:4218';
const apiOrigin = env['PUNI_API_ORIGIN'] ?? 'http://localhost:3118';
const siteOrigin = env['PUNI_SITE_ORIGIN'] ?? 'http://localhost:4318';
const description = 'Build a booking service for a community bicycle workshop.';

const intake = await globalThis.fetch(`${apiOrigin}/intakes`, {
  method: 'POST',
  headers: { origin: siteOrigin, 'content-type': 'application/json' },
  body: JSON.stringify({ description }),
});
if (intake.status !== 201) throw new Error(`Fixture intake failed: ${String(intake.status)}`);
const draftCookie = intake.headers.get('set-cookie')?.split(';')[0];
if (!draftCookie) throw new Error('Fixture intake did not issue a draft cookie');
const cookieSeparator = draftCookie.indexOf('=');
if (cookieSeparator < 1) throw new Error('Fixture draft cookie is malformed');

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    {
      name: draftCookie.slice(0, cookieSeparator),
      value: draftCookie.slice(cookieSeparator + 1),
      url: appOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  const streamPosts = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url() === `${apiOrigin}/chat/stream` && request.method() === 'POST')
      streamPosts.push(request.postDataJSON());
  });
  await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await page.locator('#demo-email').waitFor();
  await page.locator('#demo-email').fill(`send-${String(Date.now())}@example.test`);
  await page.getByRole('button', { name: 'Enter local demo' }).click();
  await page.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
  await page.waitForTimeout(400);
  if (streamPosts.length !== 0)
    throw new Error(`Sign-in triggered ${String(streamPosts.length)} stream POSTs before Send`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
  await page.waitForTimeout(400);
  if (streamPosts.length !== 0)
    throw new Error(`Reload triggered ${String(streamPosts.length)} stream POSTs before Send`);
  await page.getByText(description).first().waitFor();
  await page.screenshot({ path: '/tmp/puni-explicit-send-before.png', fullPage: true });
  await page.getByRole('button', { name: /^Send/ }).click();
  await page.locator('.build-message.assistant').first().waitFor();
  if (streamPosts.length !== 1 || streamPosts[0]?.initial !== true)
    throw new Error(`Expected one initial stream POST after Send: ${JSON.stringify(streamPosts)}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
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
  await page.getByRole('button', { name: /^Send/ }).click();
  await page.locator('.build-message.assistant').nth(1).waitFor();
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
  const recoveryIntake = await globalThis.fetch(`${apiOrigin}/intakes`, {
    method: 'POST',
    headers: { origin: siteOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (recoveryIntake.status !== 201)
    throw new Error(`Recovery fixture intake failed: ${String(recoveryIntake.status)}`);
  const recoveryCookie = recoveryIntake.headers.get('set-cookie')?.split(';')[0];
  if (!recoveryCookie) throw new Error('Recovery fixture did not issue a draft cookie');
  const recoverySeparator = recoveryCookie.indexOf('=');
  if (recoverySeparator < 1) throw new Error('Recovery draft cookie is malformed');
  const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await recoveryContext.addCookies([
    {
      name: recoveryCookie.slice(0, recoverySeparator),
      value: recoveryCookie.slice(recoverySeparator + 1),
      url: appOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const recoveryPage = await recoveryContext.newPage();
  const recoveryPosts = [];
  recoveryPage.on('pageerror', (error) => errors.push(error.message));
  recoveryPage.on('request', (request) => {
    if (request.url() === `${apiOrigin}/chat/stream` && request.method() === 'POST')
      recoveryPosts.push(request.postDataJSON());
  });
  await recoveryPage.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await recoveryPage.locator('#demo-email').waitFor();
  await recoveryPage.locator('#demo-email').fill(`recovery-${String(Date.now())}@example.test`);
  await recoveryPage.getByRole('button', { name: 'Enter local demo' }).click();
  await recoveryPage.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
  await recoveryPage.route(`${apiOrigin}/chat/stream`, (route) => route.abort('failed'));
  await recoveryPage.getByRole('button', { name: /^Send/ }).click();
  await recoveryPage.getByRole('button', { name: 'Retry the same message' }).waitFor();
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
  if (!(await recoveryPage.locator('#build-message[readonly]').isVisible()))
    throw new Error('Dropped initial request exposed the ordinary composer after reload');
  if (await recoveryPage.getByLabel('Your message').count())
    throw new Error('A different message can bypass the saved Home request');
  await recoveryPage.screenshot({
    path: '/tmp/puni-explicit-send-mobile-recovery.png',
    fullPage: true,
  });
  await recoveryPage.unroute(`${apiOrigin}/chat/stream`);
  await recoveryPage.getByRole('button', { name: 'Retry the same message' }).click();
  await recoveryPage.locator('.build-message.assistant').first().waitFor();
  await recoveryPage.getByLabel('Your message').waitFor();
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
  const pendingIntake = await globalThis.fetch(`${apiOrigin}/intakes`, {
    method: 'POST',
    headers: { origin: siteOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (pendingIntake.status !== 201)
    throw new Error(`Pending-write fixture intake failed: ${String(pendingIntake.status)}`);
  const pendingCookie = pendingIntake.headers.get('set-cookie')?.split(';')[0];
  if (!pendingCookie) throw new Error('Pending-write fixture did not issue a draft cookie');
  const pendingSeparator = pendingCookie.indexOf('=');
  if (pendingSeparator < 1) throw new Error('Pending-write draft cookie is malformed');
  const pendingContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await pendingContext.addCookies([
    {
      name: pendingCookie.slice(0, pendingSeparator),
      value: pendingCookie.slice(pendingSeparator + 1),
      url: appOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const pendingPage = await pendingContext.newPage();
  const pendingPosts = [];
  pendingPage.on('pageerror', (error) => errors.push(error.message));
  pendingPage.on('request', (request) => {
    if (request.url() === `${apiOrigin}/chat/stream` && request.method() === 'POST')
      pendingPosts.push(request.postDataJSON());
  });
  await pendingPage.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await pendingPage.locator('#demo-email').waitFor();
  await pendingPage.locator('#demo-email').fill(`pending-${String(Date.now())}@example.test`);
  await pendingPage.getByRole('button', { name: 'Enter local demo' }).click();
  await pendingPage.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
  await pendingPage.evaluate(() => {
    const original = globalThis.Storage.prototype.setItem;
    globalThis.Storage.prototype.setItem = function (key, value) {
      if (key === 'puni_build_pending_chat') {
        globalThis.Storage.prototype.setItem = original;
        throw new Error('injected pending write failure');
      }
      return original.call(this, key, value);
    };
  });
  await pendingPage.getByRole('button', { name: /^Send/ }).click();
  await pendingPage.getByText('injected pending write failure').waitFor();
  const firstSend = pendingPage.getByRole('button', { name: /^Send/ });
  if (!(await firstSend.isEnabled()) || pendingPosts.length !== 0)
    throw new Error('A failed pending write did not restore the initial Send action');
  await firstSend.click();
  await pendingPage.locator('.build-message.assistant').first().waitFor();
  if (pendingPosts.length !== 1 || pendingPosts[0]?.initial !== true)
    throw new Error(
      `Pending-write retry did not send one initial turn: ${JSON.stringify(pendingPosts)}`,
    );
  const pendingUsers = await pendingPage.locator('.build-message.user').allInnerTexts();
  if (pendingUsers.length !== 1 || !pendingUsers[0]?.includes(description))
    throw new Error(
      `Pending-write retry duplicated the opening turn: ${JSON.stringify(pendingUsers)}`,
    );
  await pendingPage.reload({ waitUntil: 'domcontentloaded' });
  await pendingPage.locator('.build-message.assistant').first().waitFor();
  const savedPendingUsers = await pendingPage.locator('.build-message.user').allInnerTexts();
  if (savedPendingUsers.length !== 1 || !savedPendingUsers[0]?.includes(description))
    throw new Error(
      `Pending-write retry saved duplicate turns: ${JSON.stringify(savedPendingUsers)}`,
    );
  if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  globalThis.console.log(
    JSON.stringify({
      beforeSendPosts: 0,
      afterSendPosts: initialPosts,
      subsequentPosts: streamPosts.length,
      initialKey: streamPosts[0]?.idempotencyKey,
      userTurns: userTurns.length,
      recoveryPosts: recoveryPosts.length,
      pendingWritePosts: pendingPosts.length,
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
