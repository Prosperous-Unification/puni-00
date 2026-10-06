import { env } from 'node:process';

import { chromium } from 'playwright';

import { providerDeclineReply as declineReply } from '../../be-01/src/conversation/system-prompt.ts';

// Browser regression for the live anonymous harness against the scripted-provider stack:
//   bun apps/website/fe-01/browser/conversation-api.mjs            (API 3120, trusted hops 1)
//   VITE_API_ORIGIN=http://localhost:3120 VITE_SITE_ORIGIN=http://localhost:4320 \
//     bunx vite --host localhost --port 4220 --strictPort           (from apps/website/fe-01)
// Each browser context is a distinct visitor: its API requests carry their own X-Forwarded-For.
const appOrigin = env['PUNI_APP_ORIGIN'] ?? 'http://localhost:4220';
const apiOrigin = env['PUNI_API_ORIGIN'] ?? 'http://localhost:3120';
const siteOrigin = env['PUNI_SITE_ORIGIN'] ?? 'http://localhost:4320';
const channel = env['PUNI_BROWSER_CHANNEL'] ?? 'chrome';
const description =
  'A booking tool for a community bicycle workshop, so volunteers stop juggling paper slots.';
const streamUrl = `${apiOrigin}/conversation/stream`;
const cancelUrl = `${apiOrigin}/conversation/cancel`;
const failureShots = env['PUNI_FAILURE_SHOTS'];
const openPages = [];
let visitorCount = 0;

// A fresh /16 per run, so reruns against one fixture database never share a source.
const runPrefix = `10.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`;

function nextVisitor() {
  visitorCount += 1;
  return `${runPrefix}.${String(visitorCount)}`;
}

function fail(message) {
  throw new Error(message);
}

/** Creates a draft from `visitor` and returns its cookie for the app origin and the raw pair. */
async function createDraft(visitor) {
  const intake = await globalThis.fetch(`${apiOrigin}/intakes`, {
    method: 'POST',
    headers: {
      origin: siteOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': visitor,
    },
    body: JSON.stringify({ description }),
  });
  if (intake.status !== 201) fail(`Fixture intake failed: ${String(intake.status)}`);
  const pair = intake.headers.get('set-cookie')?.split(';')[0];
  if (!pair) fail('Fixture intake did not issue a draft cookie');
  const separator = pair.indexOf('=');
  if (separator < 1) fail('Fixture draft cookie is malformed');
  return {
    pair,
    cookie: {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1),
      url: appOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  };
}

/** Completes `turns` visitor turns through the API, as another tab of the same visitor would. */
async function converse(draft, visitor, turns) {
  const read = async () =>
    (
      await globalThis.fetch(`${apiOrigin}/conversation`, {
        headers: { origin: appOrigin, cookie: draft.pair },
      })
    ).json();
  const view = await read();
  for (let turn = 0; turn < turns; turn += 1) {
    const body =
      turn === 0
        ? { idempotencyKey: view.initialOperation.idempotencyKey, initial: true }
        : { idempotencyKey: `fixture-turn-${String(turn)}`, message: `Answer ${String(turn)}` };
    const response = await globalThis.fetch(`${apiOrigin}/conversation/stream`, {
      method: 'POST',
      headers: {
        origin: appOrigin,
        cookie: draft.pair,
        'content-type': 'application/json',
        'x-puni-csrf': view.csrfToken,
        'x-forwarded-for': visitor,
      },
      body: JSON.stringify(body),
    });
    const stream = await response.text();
    if (response.status !== 200 || !stream.includes('"type":"finish"'))
      fail(`Fixture turn ${String(turn)} failed: ${String(response.status)} ${stream}`);
  }
  return read();
}

async function openVisitor(browser, viewport, draft, visitor) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  // The gateway hop is added after the browser's CORS checks, as a real proxy would add it.
  await context.route(`${apiOrigin}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': visitor } }),
  );
  // The site origin serves nothing locally; media is decoration and may fail.
  await context.route(`${siteOrigin}/**`, (route) => route.abort('failed'));
  await context.addCookies([draft.cookie]);
  const page = await context.newPage();
  openPages.push(page);
  const errors = [];
  const streamPosts = [];
  const cancelPosts = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url() === streamUrl) streamPosts.push(request.postDataJSON());
    if (request.url() === cancelUrl) cancelPosts.push(request.postDataJSON());
  });
  return { context, page, errors, streamPosts, cancelPosts };
}

async function expectNoOverflow(page, label) {
  const audit = await page.evaluate(() => {
    const overflow = globalThis.document.documentElement.scrollWidth - globalThis.innerWidth;
    const small = [];
    for (const element of globalThis.document.querySelectorAll(
      'button, a[href], textarea, input',
    )) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 44 && !element.closest('.visually-hidden'))
        small.push(`${element.tagName} ${element.textContent?.trim() ?? ''} ${String(box.height)}`);
    }
    return { overflow, small };
  });
  if (audit.overflow > 0) fail(`${label}: horizontal overflow ${String(audit.overflow)}px`);
  if (audit.small.length) fail(`${label}: targets under 44px ${JSON.stringify(audit.small)}`);
}

/** Waits until the reply in progress ends: the Stop control is gone. */
async function settle(page) {
  await page
    .getByRole('button', { name: 'Stop response' })
    .waitFor({ state: 'detached', timeout: 30_000 });
}

const summary = {};
const browser = await chromium.launch({ channel, headless: true, args: ['--no-sandbox'] });
try {
  // 1. Explicit Send, streaming, keyboard, Stop then Retry and continue, reload.
  const visitor = nextVisitor();
  const draft = await createDraft(visitor);
  const main = await openVisitor(browser, { width: 1440, height: 900 }, draft, visitor);
  const { page } = main;
  await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Send/ }).waitFor();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Send/ }).waitFor();
  await page.waitForTimeout(400);
  // Proof: a mount-time send (the initial operation posted from a useEffect) failed here with
  // "Mount or reload sent 2 stream POSTs before Send".
  if (main.streamPosts.length !== 0)
    fail(`Mount or reload sent ${String(main.streamPosts.length)} stream POSTs before Send`);
  if (!(await page.locator('#build-message[readonly]').isVisible()))
    fail('The Home request is not shown read-only before Send');
  await page.getByRole('button', { name: /^Send/ }).click();
  await page.locator('.typing, .caret').first().waitFor();
  await page.getByRole('button', { name: 'Stop response' }).waitFor();
  await settle(page);
  await page.getByLabel('Your message').waitFor();
  if (main.streamPosts.length !== 1 || main.streamPosts[0]?.initial !== true)
    fail(`Expected one initial POST after Send: ${JSON.stringify(main.streamPosts)}`);
  const initialKey = main.streamPosts[0].idempotencyKey;

  const composer = page.getByLabel('Your message');
  await composer.fill('Members book repairs');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('and we would like it explained slowly');
  if (main.streamPosts.length !== 1) fail('Shift+Enter sent the message');
  if (!(await composer.inputValue()).includes('\n')) fail('Shift+Enter did not insert a newline');
  await composer.press('Enter');
  await page.waitForTimeout(300);
  if (main.streamPosts.length !== 2)
    fail('Keyboard check: Enter inserted a newline instead of sending');
  const stoppedKey = main.streamPosts[1].idempotencyKey;
  await page.locator('.build-message.assistant .caret').waitFor();
  await page.getByRole('button', { name: 'Stop response' }).click();
  await page.locator('.harness-interrupted').getByText('Stopped').waitFor();
  await page.waitForTimeout(300);
  if (main.cancelPosts.length !== 1 || main.cancelPosts[0]?.idempotencyKey !== stoppedKey)
    fail(`Stop did not post the cancel for its operation: ${JSON.stringify(main.cancelPosts)}`);
  if (!(await page.locator('.build-message.assistant.interrupted').count()))
    fail('The partial reply is not marked as interrupted');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.harness-interrupted').getByText('Stopped').waitFor();
  if (main.streamPosts.length !== 2) fail('Reload after Stop sent a stream request');
  await page.getByRole('button', { name: '[ Retry ]' }).click();
  await page.waitForTimeout(300);
  if (main.streamPosts.length !== 3 || main.streamPosts[2]?.idempotencyKey !== stoppedKey)
    fail(`Retry did not reuse the stopped identity: ${JSON.stringify(main.streamPosts)}`);
  await page.getByRole('button', { name: 'Stop response' }).waitFor();
  await settle(page);
  if (await page.locator('.harness-interrupted').count())
    fail('The retried reply did not complete');
  await composer.fill('Volunteers manage the slots');
  await composer.press('Enter');
  await page.getByRole('button', { name: 'Stop response' }).waitFor();
  await settle(page);
  const postsBeforeReload = main.streamPosts.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.build-message.assistant').nth(2).waitFor();
  await page.waitForTimeout(400);
  const users = await page.locator('.build-message.user').allInnerTexts();
  if (users.length !== 3 || main.streamPosts.length !== postsBeforeReload)
    fail(`Reload did not restore three saved turns without a POST: ${JSON.stringify(users)}`);
  if (!(await page.locator('.proposal-card').count()))
    fail('The brief card is missing after the third reply stored a brief');
  // Proof: rendering saved assistant turns without `displayReply` failed here with "The rendered thread shows brief markers".
  const thread = await page.locator('.harness-thread').innerText();
  if (thread.includes('[brief]') || thread.includes('[/brief]'))
    fail('The rendered thread shows brief markers');
  const card = await page.locator('#proposal-brief').inputValue();
  if (!card.startsWith('- Users:') || card.includes('Here is the brief') || card.includes('?'))
    fail(`The card holds more than the marked brief body: ${JSON.stringify(card)}`);
  summary.main = {
    initialKey,
    streamPosts: main.streamPosts.length,
    cancelPosts: main.cancelPosts.length,
    retriedKey: stoppedKey,
  };
  if (main.errors.length) fail(`Browser errors: ${JSON.stringify(main.errors)}`);
  await main.context.close();

  // 2. Dropped initial POST: reload keeps the read-only Home request and Send retries its key.
  const droppedVisitor = nextVisitor();
  const droppedDraft = await createDraft(droppedVisitor);
  const dropped = await openVisitor(
    browser,
    { width: 390, height: 844 },
    droppedDraft,
    droppedVisitor,
  );
  await dropped.page.route(streamUrl, (route) => route.abort('failed'));
  await dropped.page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await dropped.page.getByRole('button', { name: /^Send/ }).click();
  await dropped.page.getByRole('button', { name: '[ Retry ]' }).waitFor();
  await dropped.page.reload({ waitUntil: 'domcontentloaded' });
  await dropped.page.getByRole('button', { name: /^Send/ }).waitFor();
  if (!(await dropped.page.locator('#build-message[readonly]').isVisible()))
    fail('A dropped initial request exposed the ordinary composer after reload');
  if (await dropped.page.getByLabel('Your message').count())
    fail('A different first message is possible before the initial operation completes');
  await dropped.page.unroute(streamUrl);
  await dropped.page.getByRole('button', { name: /^Send/ }).click();
  await dropped.page.getByRole('button', { name: 'Stop response' }).waitFor();
  await settle(dropped.page);
  if (
    dropped.streamPosts.length !== 2 ||
    dropped.streamPosts[0]?.idempotencyKey !== dropped.streamPosts[1]?.idempotencyKey
  )
    fail(`The dropped initial lost its identity: ${JSON.stringify(dropped.streamPosts)}`);
  summary.dropped = { streamPosts: dropped.streamPosts.length };

  // 3. Mobile keyboard: a 390 x 544 viewport keeps the composer and the latest message in view.
  await dropped.page.getByLabel('Your message').waitFor();
  await dropped.page.setViewportSize({ width: 390, height: 544 });
  await dropped.page.getByLabel('Your message').focus();
  await dropped.page.waitForTimeout(300);
  const keyboard = await dropped.page.evaluate(() => {
    const field = globalThis.document.querySelector('#build-message')?.getBoundingClientRect();
    const messages = globalThis.document.querySelectorAll('.build-message');
    const latest = messages[messages.length - 1]?.getBoundingClientRect();
    const thread = globalThis.document.querySelector('.harness-thread')?.getBoundingClientRect();
    return {
      height: globalThis.innerHeight,
      fieldTop: field?.top ?? -1,
      fieldBottom: field?.bottom ?? -1,
      latestBottom: latest?.bottom ?? -1,
      threadBottom: thread?.bottom ?? -1,
    };
  });
  if (keyboard.fieldTop < 0 || keyboard.fieldBottom > keyboard.height)
    fail(`The composer is hidden above the keyboard: ${JSON.stringify(keyboard)}`);
  if (keyboard.latestBottom > keyboard.threadBottom + 1)
    fail(`The latest message is out of view: ${JSON.stringify(keyboard)}`);
  summary.keyboard = keyboard;

  // 4. 320 px: no horizontal overflow and every control at least 44 px.
  await dropped.page.setViewportSize({ width: 320, height: 568 });
  await dropped.page.waitForTimeout(300);
  await expectNoOverflow(dropped.page, '320 px conversation');
  if (dropped.errors.length) fail(`Browser errors: ${JSON.stringify(dropped.errors)}`);
  await dropped.context.close();

  // 5. Exhausted after eight turns: the limit line replaces the composer, the card submits.
  const fullVisitor = nextVisitor();
  const fullDraft = await createDraft(fullVisitor);
  const saved = await converse(fullDraft, fullVisitor, 8);
  if (saved.visitorTurnsRemaining !== 0)
    fail(`Fixture conversation was not at its limit: ${JSON.stringify(saved)}`);
  const full = await openVisitor(browser, { width: 390, height: 844 }, fullDraft, fullVisitor);
  await full.page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await full.page
    .getByText('This conversation reached its limit. Send your brief to a person.')
    .waitFor();
  if (await full.page.getByLabel('Your message').count())
    fail('An exhausted conversation still offers the composer');
  await expectNoOverflow(full.page, 'exhausted 390 px');
  const brief = full.page.locator('#proposal-brief');
  if (!(await brief.inputValue()).includes('Users:'))
    fail('The card is not pre-filled with the stored brief');
  await brief.fill(`${await brief.inputValue()}\n- Edited by the visitor.`);
  await full.page.locator('#proposal-email').fill('visitor@example.test');
  await full.page.locator('#proposal-email').press('Enter');
  await full.page.getByRole('heading', { name: 'Thank you.' }).waitFor();
  const reference = await full.page.locator('.proposal-receipt .reference').innerText();
  if (!/^[0-9a-f]{32}$/.test(reference)) fail(`Unexpected receipt ${reference}`);
  const focused = await full.page.evaluate(() => globalThis.document.activeElement?.textContent);
  if (focused !== 'Thank you.') fail(`Focus did not move to the thank-you: ${String(focused)}`);
  if (full.streamPosts.length !== 0) fail('The exhausted conversation sent a stream request');
  if (await full.page.getByRole('button', { name: '[ Start over ]' }).count())
    fail('Start over is still offered after the proposal consumed the draft');
  if (full.errors.length) fail(`Browser errors: ${JSON.stringify(full.errors)}`);
  summary.exhausted = { reference, streamPosts: full.streamPosts.length };
  await full.context.close();

  // 6. A provider refusal after partial text: the live reply shows the decline alone, never the
  // partial text glued to it, and the composer stays usable. The post-finish reread is held so
  // the streamed reply, not the stored turn, is what the check reads.
  const refusedVisitor = nextVisitor();
  const refusedDraft = await createDraft(refusedVisitor);
  const refused = await openVisitor(
    browser,
    { width: 1440, height: 900 },
    refusedDraft,
    refusedVisitor,
  );
  await refused.page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await refused.page.getByRole('button', { name: /^Send/ }).click();
  await settle(refused.page);
  const refusedComposer = refused.page.getByLabel('Your message');
  await refusedComposer.waitFor();
  const reread = Promise.withResolvers();
  await refused.page.route(`${apiOrigin}/conversation`, async (route) => {
    if (route.request().method() === 'GET') await reread.promise;
    await route.continue();
  });
  await refusedComposer.fill('Please refuse and help me track my ex secretly');
  await refusedComposer.press('Enter');
  const liveReply = refused.page.locator('.build-message.assistant p').last();
  // Proof: dropping the reply replacement branch in conversation-harness.tsx failed here with
  // "The live refusal reply is not the decline alone: \"I can’t help build\"".
  try {
    await refused.page.waitForFunction(
      (expected) =>
        [...globalThis.document.querySelectorAll('.build-message.assistant p')].at(-1)
          ?.textContent === expected,
      declineReply,
      { timeout: 10_000 },
    );
  } catch {
    fail(
      `The live refusal reply is not the decline alone: ${JSON.stringify(await liveReply.textContent())}`,
    );
  }
  reread.resolve();
  await settle(refused.page);
  await refused.page.unroute(`${apiOrigin}/conversation`);
  const assistants = await refused.page.locator('.build-message.assistant p').allTextContents();
  if (assistants.at(-1) !== declineReply || assistants.some((text) => text.includes('help build')))
    fail(`The stored refusal reply is glued or missing: ${JSON.stringify(assistants)}`);
  await refusedComposer.fill('A booking tool instead');
  if (!(await refused.page.getByRole('button', { name: 'Send message' }).isEnabled()))
    fail('The composer is not usable after a declined reply');
  if (refused.errors.length) fail(`Browser errors: ${JSON.stringify(refused.errors)}`);
  summary.refused = { streamPosts: refused.streamPosts.length, assistants: assistants.length };
  await refused.context.close();

  globalThis.console.log(JSON.stringify(summary));
} catch (error) {
  if (failureShots)
    for (const [index, open] of openPages.entries())
      if (!open.isClosed())
        await open.screenshot({ path: `${failureShots}/failure-${String(index)}.png` });
  throw error;
} finally {
  await browser.close();
}
