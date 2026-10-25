import { mkdirSync } from 'node:fs';
import { env } from 'node:process';

import { Database } from 'bun:sqlite';
import { chromium } from 'playwright';

import { solveBrowserCheck } from '../../../../libs/website/domain/contracts/src/browser-check.ts';

// End-to-end acceptance for WBS 060.05.3 at four widths: brief edit → reload → storage fault →
// proposal request → operator inbox, on the Build card and on the manual brief. It runs against
// the scripted-provider stack with a known database and operator password:
//   WEBSITE_DATABASE_PATH=$DB OPERATOR_PASSWORD=$PW WEBSITE_API_PORT=$((3120+OFFSET)) \
//     APP_ORIGIN=http://localhost:$((4220+OFFSET)) PUBLIC_ORIGIN=http://localhost:$((4320+OFFSET)) \
//     bun apps/website/fe-01/browser/conversation-api.mjs
//   VITE_API_ORIGIN=http://localhost:$((3120+OFFSET)) VITE_SITE_ORIGIN=http://localhost:$((4320+OFFSET)) \
//     bunx vite --host localhost --port $((4220+OFFSET)) --strictPort        (from apps/website/fe-01)
//   PUNI_FIXTURE_DATABASE=$DB PUNI_OPERATOR_PASSWORD=$PW PUNI_SCREENS_PORT_OFFSET=$OFFSET \
//     PUNI_SCREENS_DIR=$OUT bun apps/website/fe-01/browser/proposal-flow.mjs
// The storage fault is a real one: a trigger in the fixture database aborts the submission insert.
const portOffsetText = env['PUNI_SCREENS_PORT_OFFSET'] ?? '0';
if (!/^\d+$/.test(portOffsetText) || Number(portOffsetText) > 60000)
  throw new Error(`PUNI_SCREENS_PORT_OFFSET must be an integer from 0 to 60000: ${portOffsetText}`);
const portOffset = Number(portOffsetText);
const loopback = (port) => `http://localhost:${String(port + portOffset)}`;
const apiOrigin = loopback(3120);
const appOrigin = loopback(4220);
const siteOrigin = loopback(4320);
const channel = env['PUNI_BROWSER_CHANNEL'] ?? 'chrome';
const databasePath = env['PUNI_FIXTURE_DATABASE'];
if (!databasePath) throw new Error('PUNI_FIXTURE_DATABASE is required');
const operatorPassword = env['PUNI_OPERATOR_PASSWORD'];
if (!operatorPassword) throw new Error('PUNI_OPERATOR_PASSWORD is required');
const outDir = env['PUNI_SCREENS_DIR'];
if (!outDir) throw new Error('PUNI_SCREENS_DIR is required');
mkdirSync(outDir, { recursive: true });

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const description =
  'A booking tool for a community bicycle workshop, so volunteers stop juggling paper slots.';
const runTag = `${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
const runPrefix = `10.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250))}`;
let visitorCount = 0;

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
    headers: { origin: siteOrigin, 'content-type': 'application/json', 'x-forwarded-for': visitor },
    body: JSON.stringify({ description }),
  });
  if (intake.status !== 201) fail(`Fixture intake failed: ${String(intake.status)}`);
  const pair = intake.headers.get('set-cookie')?.split(';')[0];
  if (!pair) fail('Fixture intake did not issue a draft cookie');
  const separator = pair.indexOf('=');
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

/** Completes the three visitor turns that bring the scripted conversation to its brief. */
async function reachBrief(draft, visitor) {
  const headers = { origin: appOrigin, cookie: draft.pair, 'x-forwarded-for': visitor };
  const read = async () =>
    (await globalThis.fetch(`${apiOrigin}/conversation`, { headers })).json();
  const view = await read();
  for (let turn = 0; turn < 3; turn += 1) {
    const offered = view.challenge;
    const body =
      turn === 0
        ? {
            idempotencyKey: view.initialOperation.idempotencyKey,
            initial: true,
            check: offered && {
              salt: offered.salt,
              challenge: offered.challenge,
              signature: offered.signature,
              number: solveBrowserCheck(offered.salt, offered.challenge, offered.maxnumber),
            },
          }
        : { idempotencyKey: `flow-turn-${String(turn)}`, message: `Answer ${String(turn)}` };
    const response = await globalThis.fetch(`${apiOrigin}/conversation/stream`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-puni-csrf': view.csrfToken },
      body: JSON.stringify(body),
    });
    const stream = await response.text();
    if (response.status !== 200 || !stream.includes('"type":"finish"'))
      fail(`Fixture turn ${String(turn)} failed: ${String(response.status)}`);
  }
  const briefed = await read();
  if (briefed.stage !== 'contact' || !briefed.brief.includes('Users:'))
    fail(`Fixture conversation has no brief: ${JSON.stringify(briefed.stage)}`);
}

async function openVisitor(browser, viewport, draft, visitor) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  // The gateway hop is added after the browser's CORS checks, as a real proxy would add it.
  await context.route(`${apiOrigin}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': visitor } }),
  );
  // The site origin serves nothing locally; media is decoration and may fail.
  await context.route(`${siteOrigin}/**`, (route) => route.abort('failed'));
  if (draft) await context.addCookies([draft.cookie]);
  const page = await context.newPage();
  const errors = [];
  const proposalPosts = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${apiOrigin}/proposals`)
      proposalPosts.push(request.postDataJSON());
  });
  return { context, page, errors, proposalPosts };
}

/** Fails on horizontal overflow and on controls under 44 px outside running text. */
async function expectFit(page, label) {
  const audit = await page.evaluate(() => {
    const overflow = globalThis.document.documentElement.scrollWidth - globalThis.innerWidth;
    const small = [];
    for (const element of globalThis.document.querySelectorAll(
      'button, a[href], textarea, input',
    )) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (element.tagName === 'A' && element.closest('p')) continue;
      if (box.height < 44 && !element.closest('.visually-hidden'))
        small.push(`${element.tagName} ${element.textContent?.trim() ?? ''} ${String(box.height)}`);
    }
    return { overflow, small };
  });
  if (audit.overflow > 0) fail(`${label}: horizontal overflow ${String(audit.overflow)}px`);
  if (audit.small.length) fail(`${label}: targets under 44px ${JSON.stringify(audit.small)}`);
}

async function shoot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

const database = new Database(databasePath);
const faultSql =
  "CREATE TRIGGER flow_storage_fault BEFORE INSERT ON proposal_submission BEGIN SELECT RAISE(ABORT, 'storage fault'); END";

function countSubmissions(email) {
  return database.query('SELECT count(*) AS n FROM proposal_submission WHERE email = ?').get(email)
    .n;
}

/** Reports a failed submission without success, then submits once under the same key. */
async function submitThroughFault(page, posts, email, label, success) {
  database.run(faultSql);
  try {
    await page.getByRole('button', { name: /Request a/ }).click();
    const alert = page.locator('[role="alert"], .feedback[role="status"]').last();
    await alert.waitFor();
    const text = await alert.innerText();
    if (!/couldn’t reach PUNI|try again/i.test(text)) fail(`${label}: fault copy ${text}`);
    // The refusal is read where it appears: wholly inside the viewport and above the Build dock.
    // Proof: without ManualPage's scrollIntoView effect this failed at manual-768; without the
    // card's, at build-390.
    await page.waitForTimeout(300);
    const box = await alert.boundingBox();
    const dock =
      (await page.locator('.harness-dock').count()) === 1
        ? await page.locator('.harness-dock').boundingBox()
        : null;
    const limit = dock ? dock.y : (page.viewportSize()?.height ?? 0);
    if (!box || box.y < 0 || box.y + box.height > limit + 1)
      fail(
        `${label}: the refusal is not fully visible (${JSON.stringify(box)}, limit ${String(limit)})`,
      );
    if (await success.count()) fail(`${label}: success shown after a storage fault`);
    if (countSubmissions(email) !== 0) fail(`${label}: the fault stored a submission`);
    // The notice is for a submission left by an earlier page load, not the one just refused.
    // Proof: while ManualPage still raised it on submit, this failed at manual-1440.
    if (await page.getByText('A previous submission may need confirmation.').count())
      fail(`${label}: the refused submission is announced as a previous one`);
    await shoot(page, `${label}-fault`);
  } finally {
    database.run('DROP TRIGGER IF EXISTS flow_storage_fault');
  }
  // A double click sends at most two POSTs under one key and stores one submission.
  await page.getByRole('button', { name: /Request a/ }).dblclick();
  await success.waitFor();
  const keys = new Set(posts.map((post) => post.idempotencyKey));
  if (keys.size !== 1) fail(`${label}: the retry changed the idempotency key ${[...keys].join()}`);
  if (countSubmissions(email) !== 1)
    fail(`${label}: expected one stored submission, found ${String(countSubmissions(email))}`);
}

const summary = [];
const browser = await chromium.launch({ channel, headless: true, args: ['--no-sandbox'] });
try {
  for (const viewport of viewports) {
    const width = String(viewport.width);
    const edit = `- Edited on the Build card at ${width} px.`;
    const buildEmail = `build-${width}-${runTag}@example.test`;
    const manualEmail = `manual-${width}-${runTag}@example.test`;
    const manualEdit = `Volunteers book repair slots; members see the week. Edited at ${width} px.`;

    // 1. Build card: edit, blur saves, reload keeps the edit, fault, then one receipt.
    const visitor = nextVisitor();
    const draft = await createDraft(visitor);
    await reachBrief(draft, visitor);
    const build = await openVisitor(browser, viewport, draft, visitor);
    await build.page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
    const card = build.page.locator('#proposal-brief');
    await card.waitFor();
    await shoot(build.page, `build-card-${width}`);
    await card.fill(`${await card.inputValue()}\n${edit}`);
    await build.page.locator('#proposal-email').focus();
    // Proof: removing the card's onBlur save made this wait time out at 1440 px.
    await build.page.getByText('Saved. It stays with this browser for 24 hours.').waitFor();
    await expectFit(build.page, `build card ${width}`);
    await shoot(build.page, `build-card-saved-${width}`);
    await build.page.reload({ waitUntil: 'domcontentloaded' });
    await card.waitFor();
    if (!(await card.inputValue()).includes(edit))
      fail(`Build ${width}: the edited brief did not survive reload`);
    await build.page.locator('#proposal-email').fill(buildEmail);
    await submitThroughFault(
      build.page,
      build.proposalPosts,
      buildEmail,
      `build-${width}`,
      build.page.getByRole('heading', { name: 'Thank you.' }),
    );
    const buildReference = await build.page.locator('.proposal-receipt .reference').innerText();
    await expectFit(build.page, `build receipt ${width}`);
    await shoot(build.page, `build-receipt-${width}`);
    if (build.errors.length) fail(`Build ${width} browser errors: ${JSON.stringify(build.errors)}`);
    await build.context.close();

    // 2. Manual brief: Save draft, reload keeps the edit, fault, then one receipt.
    const manualVisitor = nextVisitor();
    const manualDraft = await createDraft(manualVisitor);
    const manual = await openVisitor(browser, viewport, manualDraft, manualVisitor);
    await manual.page.goto(`${appOrigin}/manual`, { waitUntil: 'domcontentloaded' });
    const brief = manual.page.locator('#brief');
    await brief.waitFor();
    await brief.fill(manualEdit);
    await manual.page.getByRole('button', { name: 'Save draft' }).click();
    await manual.page.getByText(/Brief saved\./).waitFor();
    await manual.page.reload({ waitUntil: 'domcontentloaded' });
    await brief.waitFor();
    if ((await brief.inputValue()) !== manualEdit)
      fail(`Manual ${width}: the saved brief did not survive reload`);
    await manual.page.locator('#email').fill(manualEmail);
    await expectFit(manual.page, `manual ${width}`);
    await shoot(manual.page, `manual-ready-${width}`);
    await submitThroughFault(
      manual.page,
      manual.proposalPosts,
      manualEmail,
      `manual-${width}`,
      manual.page.getByRole('heading', {
        name: 'A person will review your brief and reply by email.',
      }),
    );
    const manualReference = await manual.page.locator('.reference').innerText();
    await shoot(manual.page, `manual-receipt-${width}`);
    if (manual.errors.length)
      fail(`Manual ${width} browser errors: ${JSON.stringify(manual.errors)}`);
    await manual.context.close();

    // 3. Operator inbox: both requests, once each, with the edited briefs.
    const operator = await openVisitor(browser, viewport, null, nextVisitor());
    await operator.page.goto(`${appOrigin}/operator`, { waitUntil: 'domcontentloaded' });
    await operator.page.locator('#operator-password').fill(operatorPassword);
    await operator.page.getByRole('button', { name: /Sign in/ }).click();
    await operator.page.getByRole('button', { name: /Refresh inbox/ }).waitFor();
    for (const [email, text] of [
      [buildEmail, edit],
      [manualEmail, manualEdit],
    ]) {
      const entries = operator.page.locator('article.submission', { hasText: email });
      if ((await entries.count()) !== 1)
        fail(`Inbox ${width}: ${email} appears ${String(await entries.count())} times`);
      if (!(await entries.innerText()).includes(text))
        fail(`Inbox ${width}: ${email} lacks its edited brief`);
    }
    // The operator reads the brief with its own line breaks, bullets one per line.
    // Proof: without `white-space: pre-line` on .submission-brief this failed at 1440 px.
    const buildBrief = await operator.page
      .locator('article.submission', { hasText: buildEmail })
      .locator('.submission-brief')
      .innerText();
    if (!buildBrief.includes(`\n${edit}`))
      fail(`Inbox ${width}: the brief lost its line breaks: ${JSON.stringify(buildBrief)}`);
    await operator.page
      .locator('article.submission', { hasText: buildEmail })
      .scrollIntoViewIfNeeded();
    await expectFit(operator.page, `operator inbox ${width}`);
    await shoot(operator.page, `operator-inbox-${width}`);
    await operator.context.close();
    summary.push({ width: viewport.width, buildReference, manualReference });
  }
} finally {
  database.run('DROP TRIGGER IF EXISTS flow_storage_fault');
  database.close();
  await browser.close();
}
globalThis.console.log(JSON.stringify({ ok: true, summary }));
