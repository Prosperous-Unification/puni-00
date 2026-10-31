import { mkdirSync } from 'node:fs';
import { env } from 'node:process';

import { Database } from 'bun:sqlite';
import { chromium } from 'playwright';

const appOrigin = env['PUNI_APP_ORIGIN'] ?? 'http://localhost:4220';
const apiOrigin = env['PUNI_API_ORIGIN'] ?? 'http://localhost:3120';
const siteOrigin = env['PUNI_SITE_ORIGIN'] ?? 'http://localhost:4320';
const outDir = env['PUNI_SCREENS_DIR'] ?? '/tmp/puni-scoping';
mkdirSync(outDir, { recursive: true });
const failures = [];
const runTag = String(Date.now());
let sequence = 0;
const browser = await chromium.launch({
  headless: true,
  channel: env['PUNI_BROWSER_CHANNEL'] ?? 'chrome',
  args: ['--no-sandbox'],
});
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function openDraft(width, startingChoice = 'improve', startConversation = true, description) {
  sequence += 1;
  const visitor = `10.115.${String(Math.floor(Math.random() * 200))}.${String(sequence)}`;
  const intake = await globalThis.fetch(`${apiOrigin}/intakes`, {
    method: 'POST',
    headers: { origin: siteOrigin, 'content-type': 'application/json', 'x-forwarded-for': visitor },
    body: JSON.stringify({
      startingChoice,
      startConversation,
      ...(description ? { description } : {}),
    }),
  });
  assert(intake.status === 201, `intake ${String(intake.status)}`);
  const pair = intake.headers.get('set-cookie')?.split(';')[0];
  assert(pair, 'missing cookie');
  const separator = pair.indexOf('=');
  const context = await browser.newContext({
    viewport: { width, height: width === 320 ? 568 : 900 },
  });
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
  page.on('pageerror', (error) => failures.push(error.message));
  const posts = [];
  const proposals = [];
  context.on('request', (request) => {
    if (request.url().endsWith('/proposals') && request.method() === 'POST')
      proposals.push(request.postDataJSON());
  });
  page.on('request', (request) => {
    if (request.url().endsWith('/conversation/stream') && request.method() === 'POST')
      posts.push(request.postDataJSON());
  });
  await page.goto(appOrigin);
  return { context, page, posts, proposals, pair, visitor };
}
async function assertAnonymous(draft, phase) {
  // Proof: forcing RequestEditor contact open failed this on the mounted initial Improve question; restored flow passes all starters and review.
  assert(
    (await draft.page.locator('input[type="email"]').count()) === 0,
    `email mounted during ${phase}`,
  );
  // Proof: injecting a RequestEditor mount POST failed here before contact submission; exact source restored.
  assert(draft.proposals.length === 0, `proposal posted during ${phase}`);
}
async function waitChoice(page, label) {
  await page.getByRole('button', { name: label, exact: true }).waitFor();
}
async function idle(page) {
  await page.getByRole('button', { name: 'Stop response' }).waitFor({ state: 'detached' });
}
async function editRequest(page) {
  const change = page.getByRole('button', { name: 'Change this', exact: true });
  if (await change.isVisible()) await change.click();
  else
    await page.getByRole('button', { name: 'Add references or edit brief', exact: true }).click();
  const references = page.getByRole('textbox', { name: 'Optional references', exact: true });
  if (!(await references.isVisible())) await page.locator('.reference-editor summary').click();
}
async function reviewRequest(page) {
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
}
async function overflow(page) {
  assert(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
    'horizontal overflow',
  );
}
try {
  for (const width of env['PUNI_SCOPING_FOCUS'] ? [] : [320, 390, 1440]) {
    const draft = await openDraft(width);
    const { context, page, posts } = draft;
    await waitChoice(page, 'Recurring bugs');
    await assertAnonymous(draft, 'initial Improve question');
    assert(posts.length === 1 && posts[0].automatic === true, 'authorized initial not once');
    const cacheExpiryMatches = await page.evaluate(async (origin) => {
      const saved = await (
        await globalThis.fetch(`${origin}/draft`, { credentials: 'include' })
      ).json();
      const cache = JSON.parse(globalThis.sessionStorage.getItem(`puni_editor:${saved.csrfToken}`));
      return cache.expiresAt === Date.parse(saved.expiresAt);
    }, apiOrigin);
    assert(cacheExpiryMatches, 'editor cache renewed or invented claim expiry');
    assert(
      (await page.getByText('What is holding it back?', { exact: false }).count()) === 1,
      'question repeated',
    );
    await page.getByRole('button', { name: 'Recurring bugs', exact: true }).dblclick();
    await waitChoice(page, 'Payments');
    assert(posts.length === 2, 'selection double purchase');
    await page.getByRole('button', { name: 'Payments', exact: true }).click();
    await waitChoice(page, 'Accept payments');
    await page.getByRole('button', { name: 'Accept payments', exact: true }).click();
    await page.getByRole('button', { name: 'Keep exploring', exact: true }).waitFor();
    assert(posts.length === 4, 'click-only journey count');
    await assertAnonymous(draft, 'candidate brief review');
    await editRequest(page);
    const brief = page.getByRole('textbox', { name: 'Your brief', exact: true });
    const refs = page.getByRole('textbox', { name: 'Optional references', exact: true });
    const final = page.getByRole('region', { name: 'Final request', exact: true });
    const edited = `Human-reviewed payment milestone ${String(width)}`;
    const references = 'https://one.test — borrow navigation\nDemo Two — avoid checkout';
    await brief.fill(edited);
    await refs.fill(references);
    await page.reload();
    await editRequest(page);
    assert(
      (await brief.inputValue()) === edited && (await refs.inputValue()) === references,
      'unsaved edits lost before review',
    );
    const exact = `${edited}\n\nReferences\n${references}`;
    await reviewRequest(page);
    assert((await final.textContent()) === exact, 'final references missing');
    await assertAnonymous(draft, 'edited brief and optional references');
    await page.reload();
    await editRequest(page);
    await brief.waitFor();
    assert(
      (await brief.inputValue()) === edited && (await refs.inputValue()) === references,
      'unsaved reload loss',
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved. This has not sent a request.', { exact: true }).waitFor();
    await reviewRequest(page);
    const fresh = await context.newPage();
    await fresh.goto(`${appOrigin}/manual`);
    assert(
      (await fresh.getByRole('region', { name: 'Final request', exact: true }).textContent()) ===
        exact,
      'fresh-tab duplicate/drop references',
    );
    await fresh.close();
    await page.getByRole('button', { name: 'Keep exploring', exact: true }).click();
    await page.getByRole('button', { name: 'Ask PUNI to help', exact: true }).waitFor();
    assert(
      (await page.getByRole('textbox', { name: 'Email', exact: true }).count()) === 0,
      'decline kept contact open',
    );
    await page.reload();
    await page.getByRole('button', { name: 'Ask PUNI to help', exact: true }).waitFor();
    await page
      .getByRole('textbox', { name: 'Your message', exact: true })
      .fill('Preserve my chat draft');
    await page.getByRole('button', { name: 'Send my request now', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Your message', exact: true })
      .waitFor({ state: 'hidden' });
    assert(
      (await page.getByRole('textbox', { name: 'Your message', exact: true }).count()) === 0,
      'competing chat input stayed visible during contact',
    );
    await page.getByRole('button', { name: 'Keep exploring', exact: true }).click();
    assert(
      (await page.getByRole('textbox', { name: 'Your message', exact: true }).inputValue()) ===
        'Preserve my chat draft',
      'contact discarded composer draft',
    );
    await assertAnonymous(draft, 'declined contact and resumed conversation');
    await page.getByRole('button', { name: 'Ask PUNI to help', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(`scoping-${runTag}-${String(width)}@example.test`);
    await overflow(page);
    await final.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outDir}/scoping-references-${String(width)}.png` });
    const submit = page.getByRole('button', { name: 'Send my request', exact: true });
    await page.getByRole('textbox', { name: 'Email', exact: true }).press('Tab');
    assert(
      await submit.evaluate((button) => button === globalThis.document.activeElement),
      'email Tab did not reach Send',
    );
    // Native nearest scrolling rounded the desktop bottom to900.109px in a900px viewport.
    // Center the control, then retain exact viewport containment and both edge hit tests.
    await submit.evaluate((button) => button.scrollIntoView({ block: 'center' }));
    assert(
      await submit.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const top = globalThis.document.elementFromPoint(box.x + box.width / 2, box.y + 1);
        const bottom = globalThis.document.elementFromPoint(box.x + box.width / 2, box.bottom - 1);
        return (
          box.top >= 0 &&
          box.bottom <= globalThis.innerHeight &&
          (top === button || button.contains(top)) &&
          (bottom === button || button.contains(bottom))
        );
      }),
      'Send is clipped or overlapped',
    );
    await page.screenshot({ path: `${outDir}/scoping-final-${String(width)}.png` });
    await page.screenshot({ path: `${outDir}/scoping-contact-${String(width)}.png` });
    assert(draft.proposals.length === 0, 'proposal posted before explicit contact submit');
    await page.getByRole('button', { name: 'Send my request', exact: true }).click();
    await page.getByText('Request saved.', { exact: true }).waitFor();
    assert(
      (await page
        .getByText(`Reply address: scoping-${runTag}-${String(width)}@example.test`)
        .count()) === 1,
      'missing destination email',
    );
    if (env['PUNI_FIXTURE_DATABASE']) {
      const database = new Database(env['PUNI_FIXTURE_DATABASE'], { readonly: true });
      const rows = database
        .query('SELECT brief FROM proposal_submission WHERE email = ?')
        .all(`scoping-${runTag}-${String(width)}@example.test`);
      assert(
        rows.length === 1 && rows[0].brief === exact,
        'operator stored request differs or duplicates',
      );
      database.close();
    }
    await context.close();
    globalThis.console.log(
      `PASS scoping ${String(width)} click-only, references, unsaved reload, fresh-tab/manual, decline/reopen, exact inbox`,
    );
  }
  // Each remaining starter mounts the same catalogue renderer without an extra first Send.
  for (const starter of env['PUNI_SCOPING_FOCUS']
    ? []
    : ['launch', 'similar', 'assistant', 'automate', 'unsure']) {
    const draft = await openDraft(390, starter);
    const { context, page, posts } = draft;
    await page.getByRole('group', { name: 'Suggested answers', exact: true }).waitFor();
    assert(posts.length === 1, `starter ${starter} duplicated`);
    await assertAnonymous(draft, `${starter} starter`);
    globalThis.console.log(`PASS anonymous starter ${starter}`);
    await overflow(page);
    await context.close();
  }
  const routed = await openDraft(390, 'unsure');
  await routed.page.getByRole('group', { name: 'Suggested answers', exact: true }).waitFor();
  const routingWords = 'Could a different starting offer fit? We move reports between tools.';
  await routed.page.getByRole('textbox', { name: 'Your message', exact: true }).fill(routingWords);
  await routed.page.getByRole('textbox', { name: 'Your message', exact: true }).press('Enter');
  await waitChoice(routed.page, 'Automate my work');
  await assertAnonymous(routed, 'unconfirmed route recommendation');
  assert(routed.posts.length === 2, 'route recommendation submitted a visitor answer');
  await routed.page.getByRole('button', { name: 'Automate my work', exact: true }).click();
  await routed.page.getByRole('button', { name: 'Keep exploring', exact: true }).waitFor();
  assert(
    routed.posts[2].selected.questionId === 'route-selection' &&
      routed.posts[2].selected.answerId === 'automate',
    'route confirmation was not the visitor selection',
  );
  assert(routed.posts[1].message === routingWords, 'route recommendation changed original words');
  await assertAnonymous(routed, 'visitor-confirmed route and brief');
  await routed.context.close();
  globalThis.console.log(
    'PASS route suggestions wait for explicit visitor confirmation (scripted reply)',
  );
  const uncertain = await openDraft(390, 'improve');
  await uncertain.page.getByRole('group', { name: 'Suggested answers', exact: true }).waitFor();
  await assertAnonymous(uncertain, 'uncertain starter');
  await uncertain.page.getByRole('button', { name: 'Not sure', exact: true }).click();
  await waitChoice(uncertain.page, 'Payments');
  await assertAnonymous(uncertain, 'uncertainty and simpler follow-up');
  await editRequest(uncertain.page);
  await uncertain.page.getByRole('button', { name: 'No references yet', exact: true }).click();
  await reviewRequest(uncertain.page);
  await assertAnonymous(uncertain, 'no references choice');
  await uncertain.context.close();
  globalThis.console.log(
    'PASS anonymous uncertainty and optional reference refusal (scripted reply)',
  );
  const early = await openDraft(390, 'improve', false);
  await early.page.getByRole('button', { name: 'Send my request now', exact: true }).waitFor();
  await assertAnonymous(early, 'before explicit early human review');
  await early.page.getByRole('button', { name: 'Send my request now', exact: true }).click();
  await early.page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
  assert(early.posts.length === 0, 'early review bought inference');
  const earlyEmail = `scoping-replay-${runTag}@example.test`;
  await editRequest(early.page);
  await early.page.getByRole('textbox', { name: 'Your brief', exact: true }).fill('x'.repeat(7990));
  await early.page
    .getByRole('textbox', { name: 'Optional references', exact: true })
    .fill('Reference purpose preserved');
  await reviewRequest(early.page);
  assert(
    await early.page.getByRole('button', { name: 'Send my request', exact: true }).isDisabled(),
    'combined overflow not blocked',
  );
  await editRequest(early.page);
  assert(
    (await early.page.getByRole('textbox', { name: 'Your brief', exact: true }).inputValue()) ===
      'x'.repeat(7990),
    'overflow truncated input',
  );
  await early.page
    .getByRole('textbox', { name: 'Your brief', exact: true })
    .fill('  Ready buyer brief  ');
  await early.page
    .getByRole('textbox', { name: 'Optional references', exact: true })
    .fill('Two demos — borrow layout  ');
  await reviewRequest(early.page);
  await early.page.getByRole('textbox', { name: 'Email', exact: true }).fill(earlyEmail);
  await early.page.route(`${apiOrigin}/proposals`, async (route) => {
    const saved = await route.fetch({
      headers: { ...route.request().headers(), 'x-forwarded-for': early.visitor },
    });
    assert(
      saved.status() === 201,
      `lost-response server status ${String(saved.status())}: ${await saved.text()}`,
    );
    await route.abort('connectionfailed');
  });
  await early.page.getByRole('button', { name: 'Send my request', exact: true }).click();
  await early.page.getByText('If the response was lost', { exact: false }).waitFor();
  await early.page.unroute(`${apiOrigin}/proposals`);
  await early.page.goto(`${appOrigin}/manual`);
  await early.page
    .getByRole('heading', { name: 'A person will review your brief and reply by email.' })
    .waitFor();
  assert(
    (await early.page.getByText(`Reply address: ${earlyEmail}`, { exact: true }).count()) === 1,
    'recovered receipt lost destination email',
  );
  if (env['PUNI_FIXTURE_DATABASE']) {
    const database = new Database(env['PUNI_FIXTURE_DATABASE'], { readonly: true });
    const rows = database
      .query('SELECT brief FROM proposal_submission WHERE email = ?')
      .all(earlyEmail);
    assert(
      rows.length === 1 &&
        rows[0].brief === '  Ready buyer brief  \n\nReferences\nTwo demos — borrow layout  ',
      'v1 lost-response recovery changed exact bytes or duplicated',
    );
    database.close();
  }
  await early.context.close();
  const mixed = await openDraft(390);
  await waitChoice(mixed.page, 'Recurring bugs');
  await assertAnonymous(mixed, 'before suggested answer');
  const staleTab = await mixed.context.newPage();
  await staleTab.goto(appOrigin);
  await waitChoice(staleTab, 'Recurring bugs');
  await mixed.page
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('  Exact explanation  ');
  await mixed.page.getByRole('button', { name: 'Recurring bugs', exact: true }).click();
  await waitChoice(mixed.page, 'Payments');
  assert(mixed.posts[1].message === '  Exact explanation  ', 'raw whitespace dropped');
  await staleTab
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('  Preserve stale text  ');
  await staleTab.getByRole('button', { name: 'Recurring bugs', exact: true }).click();
  await staleTab.getByText('The question changed.', { exact: false }).waitFor();
  assert(
    (await staleTab.getByRole('textbox', { name: 'Your message', exact: true }).inputValue()) ===
      '  Preserve stale text  ',
    'stale refusal dropped text',
  );
  await waitChoice(staleTab, 'Payments');
  await staleTab.close();
  await mixed.page.getByRole('button', { name: 'Payments', exact: true }).click();
  await waitChoice(mixed.page, 'Accept payments');
  await mixed.page.getByRole('button', { name: 'Accept payments', exact: true }).click();
  await mixed.page.getByRole('button', { name: 'Keep exploring', exact: true }).waitFor();
  await idle(mixed.page);
  await editRequest(mixed.page);
  await mixed.page
    .getByRole('textbox', { name: 'Your brief', exact: true })
    .fill('My unsaved human brief');
  const correctionTab = await mixed.context.newPage();
  await correctionTab.goto(appOrigin);
  await correctionTab
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('Correction: sign-in, not payments. contact@example.test');
  await correctionTab.getByRole('textbox', { name: 'Your message', exact: true }).press('Enter');
  await correctionTab
    .getByText(
      'Improve the existing app: inspect sign-in and agree the next milestone. Details need inspection.',
      { exact: true },
    )
    .waitFor({ state: 'attached' });
  await assertAnonymous(mixed, 'typed correction and candidate revision');
  await correctionTab.close();
  await mixed.page.reload();
  await mixed.page.getByText('Saved version changed', { exact: true }).waitFor();
  await mixed.page
    .getByText(
      'Improve the existing app: inspect sign-in and agree the next milestone. Details need inspection.',
      { exact: true },
    )
    .waitFor({ state: 'attached' });
  assert(
    (await mixed.page.getByRole('region', { name: 'Final request', exact: true }).textContent()) ===
      'My unsaved human brief',
    'candidate overwrote human edit',
  );
  await mixed.page.getByText('AI suggested brief', { exact: true }).click();
  assert(
    await mixed.page.getByRole('button', { name: 'Use suggested brief', exact: true }).isDisabled(),
    'dirty candidate guard absent',
  );
  await mixed.page.getByRole('button', { name: 'Keep my edits', exact: true }).click();
  await editRequest(mixed.page);
  await mixed.page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await mixed.page
    .getByText('Draft saved. This has not sent a request.', { exact: true })
    .waitFor();
  await reviewRequest(mixed.page);
  const candidate = mixed.page.getByRole('button', { name: 'Use suggested brief', exact: true });
  if (!(await candidate.isVisible()))
    await mixed.page.getByText('AI suggested brief', { exact: true }).click();
  await candidate.click();
  await mixed.page.waitForFunction(() =>
    globalThis.document
      .querySelector('.request-preview')
      ?.textContent?.startsWith('Improve the existing app: inspect sign-in'),
  );
  if (env['PUNI_FIXTURE_DATABASE']) {
    const database = new Database(env['PUNI_FIXTURE_DATABASE'], { readonly: true });
    assert(
      database
        .query('SELECT count(*) AS count FROM proposal_submission WHERE email = ?')
        .get('contact@example.test').count === 0,
      'email in chat submitted',
    );
    database.close();
  }
  await mixed.context.close();
  const invalid = await openDraft(320);
  await waitChoice(invalid.page, 'Recurring bugs');
  await invalid.page
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('invalid envelope');
  await invalid.page.getByRole('textbox', { name: 'Your message', exact: true }).press('Enter');
  await invalid.page.getByText('The reply could not be confirmed.', { exact: false }).waitFor();
  assert(
    (await invalid.page.locator('.harness-interrupted').count()) === 0,
    'known-invalid offered paid Retry',
  );
  await invalid.page
    .getByText('The reply could not be confirmed.', { exact: false })
    .scrollIntoViewIfNeeded();
  await invalid.page.screenshot({ path: `${outDir}/scoping-invalid-error-320.png` });
  await invalid.page.getByRole('button', { name: 'Send my request now', exact: true }).click();
  await invalid.page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
  await overflow(invalid.page);
  await invalid.page.screenshot({ path: `${outDir}/scoping-invalid-320.png` });
  await invalid.context.close();
  const interrupted = await openDraft(390, 'improve', true, 'slowly help improve my app');
  await interrupted.page.getByRole('button', { name: 'Stop response' }).waitFor();
  await interrupted.page.getByRole('button', { name: 'Stop response' }).click();
  await interrupted.page.getByRole('button', { name: '[ Retry ]', exact: true }).waitFor();
  await interrupted.page.reload();
  await interrupted.page.getByRole('button', { name: '[ Retry ]', exact: true }).waitFor();
  assert(interrupted.posts.length === 1, 'stopped initial auto-retried after reload');
  await interrupted.page.getByRole('button', { name: '[ Retry ]', exact: true }).click();
  await waitChoice(interrupted.page, 'Recurring bugs');
  assert(
    interrupted.posts.length === 2 &&
      interrupted.posts[1].automatic !== true &&
      interrupted.posts[0].idempotencyKey === interrupted.posts[1].idempotencyKey,
    'stopped initial Retry changed identity or stayed automatic',
  );
  await interrupted.context.close();
  const outage = await openDraft(390);
  await waitChoice(outage.page, 'Recurring bugs');
  await outage.page.route(`${apiOrigin}/conversation/stream`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'provider_unavailable' }),
    }),
  );
  await outage.page
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('  Preserve during outage  ');
  await outage.page.getByRole('textbox', { name: 'Your message', exact: true }).press('Enter');
  await outage.page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
  assert(
    (await outage.page.locator('#build-message').inputValue()) === '  Preserve during outage  ',
    'outage dropped free text',
  );
  await overflow(outage.page);
  await outage.context.close();
  const denied = await openDraft(390, 'improve', false);
  await denied.context.addInitScript(() => {
    globalThis.Storage.prototype.getItem = () => {
      throw new globalThis.DOMException('Storage denied', 'SecurityError');
    };
    globalThis.Storage.prototype.setItem = () => {
      throw new globalThis.DOMException('Storage denied', 'SecurityError');
    };
  });
  await denied.page.goto(`${appOrigin}/manual`);
  await denied.page.getByRole('region', { name: 'Final request', exact: true }).waitFor();
  await denied.page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(`scoping-denied-${runTag}@example.test`);
  await denied.page.getByRole('button', { name: 'Send my request', exact: true }).click();
  await denied.page.getByText('Request saved.', { exact: true }).waitFor();
  await denied.context.close();
  if (env['PUNI_FIXTURE_DATABASE']) {
    const capped = await openDraft(390);
    await waitChoice(capped.page, 'Recurring bugs');
    const draftId = capped.posts[0].idempotencyKey.slice('initial:'.length);
    const database = new Database(env['PUNI_FIXTURE_DATABASE']);
    database
      .query(
        "UPDATE conversation SET state = 'exhausted', exhausted_reason = 'turns' WHERE draft_id = ?",
      )
      .run(draftId);
    database.close();
    await capped.page.reload();
    await capped.page.getByText('This conversation reached its limit.', { exact: false }).waitFor();
    await capped.page.getByRole('button', { name: 'Ask PUNI to help', exact: true }).click();
    await capped.page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill(`scoping-capped-${runTag}@example.test`);
    await capped.page.getByRole('button', { name: 'Send my request', exact: true }).click();
    await capped.page.getByText('Request saved.', { exact: true }).waitFor();
    assert(capped.posts.length === 1, 'manual capped request bought inference');
    await capped.context.close();
  }
  assert(failures.length === 0, failures.join('\n'));
  globalThis.console.log(
    'PASS starters, early review, mixed/stale/correction, candidate protection, exact v1 lost-response recovery, invalid/cap/outage manual paths, stopped initial Retry and denied-storage submission',
  );
} finally {
  await browser.close();
}
