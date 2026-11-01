import { readFileSync } from 'node:fs';
import { env } from 'node:process';

import { chromium } from 'playwright';

const apiOrigin = env['PUNI_API_ORIGIN'] ?? 'http://localhost:3185';
const appOrigin = env['PUNI_APP_ORIGIN'] ?? 'http://localhost:4285';
const siteOrigin = env['PUNI_SITE_ORIGIN'] ?? 'http://localhost:4385';
const capturePath = env['PUNI_FIXTURE_OUTBOUND_PATH'];
if (!capturePath) throw new Error('PUNI_FIXTURE_OUTBOUND_PATH is required');
const selectedCase = env['PUNI_EDITOR_CASE'];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const references = 'https://first.test — borrow search\nDemo Two — avoid checkout';
const runTag = String(Date.now());
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function openDraft(isManual = false) {
  const visitor = `10.121.${String(Math.floor(Math.random() * 200))}.${String(Math.floor(Math.random() * 200))}`;
  const intake = await globalThis.fetch(`${apiOrigin}/intakes`, {
    method: 'POST',
    headers: { origin: siteOrigin, 'content-type': 'application/json', 'x-forwarded-for': visitor },
    body: JSON.stringify({ startingChoice: 'improve', startConversation: true }),
  });
  assert(intake.status === 201, 'intake refused');
  const pair = intake.headers.get('set-cookie')?.split(';')[0];
  assert(pair, 'claim absent');
  const separator = pair.indexOf('=');
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.route(`${apiOrigin}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': visitor } }),
  );
  await context.addCookies([
    {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1),
      url: appOrigin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  const posts = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/conversation/stream') && request.method() === 'POST')
      posts.push(request.postDataJSON());
  });
  await page.goto(isManual ? `${appOrigin}/manual` : appOrigin);
  if (isManual) await page.getByRole('button', { name: 'Change this', exact: true }).waitFor();
  else await page.getByRole('button', { name: 'Recurring bugs', exact: true }).waitFor();
  return { context, page, posts };
}
async function editRequest(page) {
  await page
    .getByRole('button', { name: /^(Change this|Add references or edit brief)$/ })
    .first()
    .waitFor();
  const entry = page.getByRole('button', { name: 'Change this', exact: true });
  if (await entry.isVisible()) await entry.click();
  else
    await page.getByRole('button', { name: 'Add references or edit brief', exact: true }).click();
  const refs = page.getByRole('textbox', { name: 'Optional references', exact: true });
  if (!(await refs.isVisible())) await page.locator('.reference-editor summary').click();
}
async function readDraft(page) {
  return page.evaluate(
    async (origin) =>
      (await globalThis.fetch(`${origin}/draft`, { credentials: 'include' })).json(),
    apiOrigin,
  );
}
try {
  if (!selectedCase || selectedCase === 'dirty-mount') {
    const { context, page, posts } = await openDraft(true);
    await editRequest(page);
    await page.getByRole('textbox', { name: 'Optional references', exact: true }).fill(references);
    await page.route(`${apiOrigin}/scoping`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'save_unavailable' }),
      }),
    );
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('region', { name: 'Final request', exact: true }).waitFor();
    await page.goto(appOrigin);
    await page.getByRole('region', { name: 'Final request', exact: true }).waitFor();
    assert(posts.length === 0, 'dirty recovered mount bought inference');
    await page.unroute(`${apiOrigin}/scoping`);
    await editRequest(page);
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page
      .getByRole('button', { name: 'Recurring bugs', exact: true })
      .waitFor({ timeout: 3000 });
    assert(posts.length === 1, 'authorized initial did not resume once after saving');
    await context.close();
    globalThis.console.log(
      'PASS dirty initial mount defers authorized inference until references are saved',
    );
  }
  if (!selectedCase || selectedCase === 'conflict') {
    const { context, page } = await openDraft();
    const origin = await readDraft(page);
    let writes = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/scoping') && request.method() === 'PATCH') writes += 1;
    });
    await editRequest(page);
    await page.getByRole('textbox', { name: 'Your brief', exact: true }).fill('Dirty tab body');
    await page.getByRole('textbox', { name: 'Optional references', exact: true }).fill(references);
    await page.waitForFunction(() =>
      Object.keys(globalThis.sessionStorage).some(
        (key) =>
          key.startsWith('puni_editor:') &&
          JSON.parse(globalThis.sessionStorage.getItem(key)).fields.brief === 'Dirty tab body',
      ),
    );
    const remoteTab = await context.newPage();
    await remoteTab.goto(`${appOrigin}/manual`);
    await remoteTab.getByRole('button', { name: 'Change this', exact: true }).waitFor();
    await editRequest(remoteTab);
    await remoteTab
      .getByRole('textbox', { name: 'Your brief', exact: true })
      .fill('Newer body from another tab');
    await remoteTab.getByRole('button', { name: 'Save draft', exact: true }).click();
    await remoteTab
      .getByText('Draft saved. This has not sent a request.', { exact: true })
      .waitFor();
    await page.reload();
    await editRequest(page);
    assert(
      (await page.getByRole('textbox', { name: 'Your brief', exact: true }).inputValue()) ===
        'Dirty tab body',
      'dirty cache lost local body',
    );
    const cached = await page.evaluate(
      (key) => JSON.parse(globalThis.sessionStorage.getItem(`puni_editor:${key}`)).fields,
      origin.csrfToken,
    );
    assert(
      cached.revision === origin.scoping.revision &&
        cached.savedBrief === (origin.brief || origin.description),
      'dirty reload silently substituted revision or baseline',
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.waitForFunction(
      () =>
        ![...globalThis.document.querySelectorAll('button')].find(
          (button) => button.textContent.trim() === 'Save draft',
        )?.disabled,
    );
    const remote = await readDraft(page);
    assert(writes === 0, 'draft write attempted before explicit reconciliation');
    assert(
      remote.brief === 'Newer body from another tab',
      'dirty reload silently overwrote remote body',
    );
    await page.getByText('Saved version changed', { exact: true }).waitFor();
    assert(
      (await page.getByText('Newer body from another tab', { exact: false }).count()) > 0,
      'remote version not shown',
    );
    await page.getByRole('button', { name: 'Keep my edits', exact: true }).click();
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your message', exact: true }).waitFor();
    const reconciled = await readDraft(page);
    assert(
      reconciled.brief === 'Dirty tab body' && reconciled.scoping.references === references,
      'explicit reconciliation did not preserve local edits',
    );
    await context.close();
    globalThis.console.log(
      'PASS dirty cache/reload preserves originating revision and requires explicit reconciliation',
    );
  }
  if (!selectedCase || selectedCase === 'references') {
    const { context, page } = await openDraft();
    await editRequest(page);
    await page.getByRole('textbox', { name: 'Optional references', exact: true }).fill(references);
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your message', exact: true }).waitFor();
    await page
      .getByRole('textbox', { name: 'Your message', exact: true })
      .fill('Please consider both references');
    await page.getByRole('textbox', { name: 'Your message', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Payments', exact: true }).waitFor();
    const calls = readFileSync(capturePath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const call = calls.at(-1);
    const texts = call.messages.map((message) =>
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => part.text).join(''),
    );
    const text = texts.find((candidate) =>
      candidate.startsWith('Untrusted current scoping context: '),
    );
    assert(
      text &&
        JSON.parse(text.slice('Untrusted current scoping context: '.length)).scoping.references ===
          references,
      'paid outbound omitted edited references and purposes',
    );
    await context.close();
    globalThis.console.log(
      'PASS edit→review→AI captures both references and purposes without separate Save',
    );
  }
  if (!selectedCase || selectedCase === 'failure') {
    const { context, page, posts } = await openDraft();
    await page
      .getByRole('textbox', { name: 'Your message', exact: true })
      .fill('Ask using my pending references');
    await editRequest(page);
    await page.getByRole('textbox', { name: 'Optional references', exact: true }).fill(references);
    await page.route(`${apiOrigin}/scoping`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'save_unavailable' }),
      }),
    );
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('region', { name: 'Final request', exact: true }).waitFor();
    assert(
      (
        await page.getByRole('region', { name: 'Final request', exact: true }).textContent()
      ).includes(references),
      'save failure dropped local refs',
    );
    assert(
      (await page.getByRole('textbox', { name: 'Your message', exact: true }).count()) === 0,
      'save failure restored AI with stale references',
    );
    assert(
      (await page.getByRole('group', { name: 'Suggested answers', exact: true }).count()) === 0,
      'save failure left paid choices available',
    );
    await page.locator('form.harness-composer').dispatchEvent('submit');
    await readDraft(page);
    assert(posts.length === 1, 'hidden composer bypass bought a stale paid turn');
    await page.reload();
    await page.getByRole('button', { name: '[ Start over ]', exact: true }).waitFor();
    assert(
      (await page.getByRole('textbox', { name: 'Your message', exact: true }).count()) === 0,
      'dirty cache reload restored AI with unsaved references',
    );
    await page.getByRole('button', { name: 'Keep exploring', exact: true }).click();
    assert(
      (await page.getByRole('textbox', { name: 'Your message', exact: true }).count()) === 0,
      'failed Keep exploring restored stale AI',
    );
    await page.getByRole('button', { name: 'Ask PUNI to help', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(`round1-${runTag}@example.test`);
    await page.getByRole('button', { name: 'Send my request', exact: true }).click();
    await page.getByText('Request saved.', { exact: true }).waitFor();
    assert(posts.length === 1, 'manual fallback bought inference');
    await context.close();
    globalThis.console.log(
      'PASS failed save keeps local review/manual submission and blocks stale AI',
    );
  }
} finally {
  await browser.close();
}
