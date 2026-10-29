import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { env } from 'node:process';
import { chromium } from 'playwright';

const app = 'https://dev.app.puni.dev';
const site = 'https://dev.puni.dev';
const api = env['PUNI_API_ORIGIN'] ?? 'http://127.0.0.1:3197';
const build = env['PUNI_APP_ORIGIN'] ?? 'http://127.0.0.1:4297';
const screenshots = env['PUNI_SCREENS_DIR'] ?? '/tmp/task7-analytics';
mkdirSync(screenshots, { recursive: true });
const sentinels = [
  'DESCRIPTION_SENTINEL',
  'FOLLOWUP_SENTINEL',
  'REFERENCE_SENTINEL',
  'EMAIL_SENTINEL@example.test',
  'QUERY_SENTINEL',
  'HASH_SENTINEL',
  'ERROR_SENTINEL',
  'REFERRER_SENTINEL',
];
const isFixtureVendor = env['PUNI_ANALYTICS_VENDOR'] === 'fixture';
const officialTag = env['PUNI_GOOGLE_TAG_PATH'];
const tag = isFixtureVendor
  ? `const queue = window.puniAnalyticsLayer; function consume(command) { if (command[0] === 'event' && !window['ga-disable-G-R0JM3R4SSV']) { const params = new globalThis.URLSearchParams({en:command[1],...command[2]}); fetch('https://www.google-analytics.com/g/collect?'+params, {mode:'no-cors'}); } } const saved = [...queue]; queue.push = (...commands) => { commands.forEach(consume); return Array.prototype.push.apply(queue,commands); }; saved.forEach(consume);`
  : officialTag
    ? readFileSync(officialTag, 'utf8')
    : await (
        await globalThis.fetch(
          'https://www.googletagmanager.com/gtag/js?id=G-R0JM3R4SSV&l=puniAnalyticsLayer',
        )
      ).text();
if (!isFixtureVendor && tag.length < 100000) throw new Error('Official Google tag unavailable');
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
const violations = [];
let sequence = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function until(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  throw new Error(message);
}
function eventNames(hits) {
  return hits
    .flatMap((hit) => [new globalThis.URL(hit.url).search.slice(1), ...hit.body.split('\n')])
    .map((query) => new globalThis.URLSearchParams(query).get('en'))
    .filter(Boolean);
}
async function open(
  width,
  { accepted = false, blocked = false, manual = false, hold = false } = {},
) {
  sequence++;
  const visitor = `10.119.${String(Math.floor(Math.random() * 200))}.${String(sequence)}`;
  const intake = await globalThis.fetch(`${api}/intakes`, {
    method: 'POST',
    headers: { origin: site, 'content-type': 'application/json', 'x-forwarded-for': visitor },
    body: JSON.stringify({
      startingChoice: 'improve',
      startConversation: !manual,
      description: sentinels[0],
    }),
  });
  assert(intake.status === 201, `intake refused ${intake.status}`);
  const pair = intake.headers.get('set-cookie').split(';')[0];
  const separator = pair.indexOf('=');
  const context = await browser.newContext({
    viewport: { width, height: width === 320 ? 568 : 900 },
    serviceWorkers: 'block',
  });
  const hits = [];
  const posts = [];
  let loaders = 0;
  let proposalMode = 'normal';
  let recoveryPageView = null;
  const secrets = [pair.slice(separator + 1)];
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new globalThis.URL(request.url());
    if (url.origin === site && url.pathname.startsWith('/api/')) {
      if (request.method() === 'POST')
        posts.push({ path: url.pathname, body: request.postDataJSON() });
      if (url.pathname === '/api/proposals' && proposalMode === 'reject') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': app,
            'access-control-allow-credentials': 'true',
          },
          body: JSON.stringify({ code: 'ERROR_SENTINEL' }),
        });
        return;
      }
      const response = await route.fetch({
        url: `${api}${url.pathname.slice(4)}${url.search}`,
        headers: { ...request.headers(), 'x-forwarded-for': visitor },
      });
      if (url.pathname === '/api/draft' && recoveryPageView !== null) {
        await until(
          () => eventNames(hits).filter((name) => name === 'page_view').length >= recoveryPageView,
          'Recovery page analytics did not become ready',
        );
        recoveryPageView = null;
      }
      if (url.pathname === '/api/proposals' && response.ok()) {
        const confirmation = await response.json();
        secrets.push(confirmation.receipt);
      }
      if (url.pathname === '/api/proposals' && proposalMode === 'lost') {
        proposalMode = 'normal';
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    } else if (url.origin === app) {
      const response = await route.fetch({ url: `${build}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } else if (
      url.hostname === 'www.googletagmanager.com' &&
      url.pathname === '/gtag/js' &&
      url.searchParams.get('id') === 'G-R0JM3R4SSV'
    ) {
      loaders++;
      if (hold) await held;
      if (blocked) await route.abort('blockedbyclient');
      else await route.fulfill({ status: 200, contentType: 'application/javascript', body: tag });
    } else if (
      /(google-analytics\.com|googletagmanager\.com|google\.com|doubleclick\.net)$/.test(
        url.hostname,
      )
    ) {
      hits.push({ url: request.url(), body: request.postData() ?? '' });
      await route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': app, 'access-control-allow-credentials': 'true' },
      });
    } else if (url.origin === site) await route.fulfill({ status: 404, body: '' });
    else {
      errors.push(`Unexpected blocked network destination: ${url.origin}`);
      await route.abort('blockedbyclient');
    }
  });
  await context.addCookies([
    {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1),
      url: site,
      httpOnly: true,
      sameSite: 'Lax',
    },
    ...(accepted
      ? [
          {
            name: 'puni_dev_consent_v1',
            value: encodeURIComponent(
              JSON.stringify({ version: 1, accepted: true, expires: Date.now() + 86400000 }),
            ),
            domain: '.puni.dev',
            path: '/',
            secure: true,
            sameSite: 'Lax',
          },
        ]
      : []),
  ]);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${app}${manual ? '/manual' : '/'}?q=${sentinels[4]}&utm_campaign=${sentinels[4]}#${sentinels[5]}`,
    {
      waitUntil: 'domcontentloaded',
      referer: `${site}/private/${sentinels[7]}?secret=${sentinels[7]}`,
    },
  );
  try {
    await page
      .getByRole('button', { name: manual ? 'Change this' : 'Recurring bugs', exact: true })
      .waitFor({ timeout: 10000 });
  } catch (error) {
    globalThis.console.error(errors, await page.locator('body').innerText(), posts);
    throw error;
  }
  return {
    page,
    context,
    hits,
    posts,
    secrets,
    release,
    loaders: () => loaders,
    prepareRecovery: () => {
      recoveryPageView = eventNames(hits).filter((name) => name === 'page_view').length + 1;
    },
    setProposalMode: (mode) => {
      proposalMode = mode;
    },
  };
}
async function submit(page) {
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(`${String(Date.now())}-${String(sequence)}-${sentinels[3]}`);
  await page.getByRole('button', { name: 'Send my request', exact: true }).click();
  try {
    await page
      .getByRole('heading', { name: 'Request saved.', exact: true })
      .waitFor({ timeout: 10000 });
  } catch (error) {
    globalThis.console.error(await page.locator('body').innerText());
    throw error;
  }
}
async function review(page) {
  await page.getByRole('button', { name: 'Send my request now', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).waitFor();
}
function inspect(hits) {
  writeFileSync(`${screenshots}/last-inspection.json`, JSON.stringify(hits, null, 2));
  const payload = decodeURIComponent(JSON.stringify(hits));
  for (const sentinel of sentinels)
    if (payload.includes(sentinel)) violations.push(`Vendor payload leaked ${sentinel}`);
  for (const hit of hits) {
    const params = new globalThis.URL(hit.url).searchParams;
    if (params.has('dl'))
      assert(
        [`${app}/`, `${app}/manual`].includes(params.get('dl')),
        `Unsafe page location ${params.get('dl')}`,
      );
    if (params.has('dr'))
      assert(params.get('dr') === site || params.get('dr') === '', 'Unsafe referrer');
    if (params.has('dt'))
      assert(
        ['Build with PUNI', 'Request PUNI help'].includes(params.get('dt')),
        `Unsafe title ${params.get('dt')}`,
      );
  }
  if (
    eventNames(hits).some((name) =>
      ['form_start', 'form_submit', 'view_search_results', 'click'].includes(name),
    )
  )
    violations.push('Automatic form/search/outbound event');
}
try {
  if (env['PUNI_ANALYTICS_CASE'] === 'metadata') {
    const fixture = await open(390, { accepted: true, manual: true });
    await until(() => eventNames(fixture.hits).includes('page_view'), 'Metadata pageview absent');
    inspect(fixture.hits);
    await fixture.context.unrouteAll({ behavior: 'wait' });
    await fixture.context.close();
    assert(violations.length === 0, violations.join('\n'));
  } else if (env['PUNI_ANALYTICS_CASE'] === 'disabled') {
    const fixture = await open(390, { accepted: true, manual: true });
    await submit(fixture.page);
    assert(fixture.loaders() === 0 && fixture.hits.length === 0, 'Default build loaded analytics');
    await fixture.context.unrouteAll({ behavior: 'wait' });
    await fixture.context.close();
    globalThis.console.log('PASS default-disabled build submits without analytics');
  } else {
    for (const width of [320, 390, 1440]) {
      const fixture = await open(width);
      const { page, context, hits } = fixture;
      assert(fixture.loaders() === 0 && hits.length === 0, 'Denied loaded Google');
      const accept = page.getByRole('button', { name: 'Accept analytics', exact: true });
      const reject = page.getByRole('button', { name: 'Reject analytics', exact: true });
      assert(
        (await accept.isVisible()) && (await reject.isVisible()),
        'Unequal consent availability',
      );
      await reject.click();
      await review(page);
      await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
      const email = page.getByRole('textbox', { name: 'Email', exact: true });
      await email.scrollIntoViewIfNeeded();
      await email.focus();
      await page.keyboard.press('Tab');
      assert(
        await page
          .getByRole('button', { name: 'Send my request', exact: true })
          .evaluate((button) => button === globalThis.document.activeElement),
        'Email Tab does not reach Send',
      );
      for (const control of [
        email,
        page.getByRole('button', { name: 'Send my request', exact: true }),
        reject,
      ]) {
        await control.scrollIntoViewIfNeeded();
        assert(
          await control.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const hit = globalThis.document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            );
            return (
              box.width >= 44 && box.height >= 44 && (hit === element || element.contains(hit))
            );
          }),
          'Consent obscured a control or target too small',
        );
      }
      await page.screenshot({ path: `${screenshots}/privacy-${width}.png` });
      await submit(page);
      assert(hits.length === 0, 'Denied submission measured');
      await accept.click();
      await until(() => eventNames(hits).includes('page_view'), 'Accepted Google pageview absent');
      assert(
        !eventNames(hits).some((name) =>
          [
            'generate_lead',
            'brief_view',
            'email_request_view',
            'scoping_question_view',
            'conversation_start',
          ].includes(name),
        ),
        'Late consent backfilled earlier milestones',
      );
      inspect(hits);
      writeFileSync(`${screenshots}/late-${width}.json`, JSON.stringify(hits, null, 2));
      await context.unrouteAll({ behavior: 'wait' });
      await context.close();
      globalThis.console.log(`PASS denied/late consent, keyboard and hit targets ${width}`);
    }
    const fixture = await open(390, { accepted: true });
    await until(
      () => eventNames(fixture.hits).includes('page_view'),
      'Initial real tag pageview absent',
    );
    const { page, hits } = fixture;
    await page.locator('.harness-composer textarea').fill(sentinels[1]);
    await page.getByRole('button', { name: 'Recurring bugs', exact: true }).click();
    await page.getByRole('button', { name: 'Payments', exact: true }).waitFor();
    await review(page);
    await page.getByRole('button', { name: 'Change this', exact: true }).click();
    await page.locator('.reference-editor summary').click();
    await page
      .getByRole('textbox', { name: 'Optional references', exact: true })
      .fill(`https://example.test/${sentinels[2]} — borrow layout`);
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Send my request', exact: true }).click();
    assert(!eventNames(hits).includes('generate_lead'), 'Invalid email emitted lead');
    await submit(page);
    await until(() => eventNames(hits).includes('generate_lead'), 'Confirmed chat lead absent');
    assert(
      eventNames(hits).filter((name) => name === 'generate_lead').length === 1,
      'Duplicate confirmed lead',
    );
    inspect(hits);
    await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click();
    const beforeWithdrawal = hits.length;
    await page.evaluate(() => {
      globalThis.history.pushState({}, '', '/?search=QUERY_SENTINEL#HASH_SENTINEL');
      globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange'));
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1500));
    assert(hits.length === beforeWithdrawal, 'Loaded tag emitted after withdrawal');
    await page.goto(`${app}/operator?secret=${sentinels[4]}`);
    assert(
      (await page.locator('script[src*="googletagmanager"]').count()) === 0,
      'Operator loaded tag',
    );
    assert(hits.length === beforeWithdrawal, 'Operator measured');
    writeFileSync(`${screenshots}/real-google.json`, JSON.stringify(hits, null, 2));
    await fixture.context.unrouteAll({ behavior: 'wait' });
    await fixture.context.close();
    globalThis.console.log(
      'PASS chat lead, accepted input, loaded withdrawal and operator; payload verdict pending',
    );
    for (const recovery of [false, true]) {
      const manual = await open(390, { accepted: true, manual: true });
      await until(
        () => eventNames(manual.hits).includes('page_view'),
        'Accepted manual page absent',
      );
      manual.setProposalMode('reject');
      await manual.page
        .getByRole('textbox', { name: 'Email', exact: true })
        .fill(`${String(Date.now())}-${sentinels[3]}`);
      await manual.page.getByRole('button', { name: 'Send my request', exact: true }).click();
      await manual.page
        .getByRole('status')
        .filter({ hasText: 'This option isn’t available right now' })
        .waitFor();
      assert(!eventNames(manual.hits).includes('generate_lead'), 'Rejected POST emitted lead');
      manual.setProposalMode(recovery ? 'lost' : 'normal');
      await manual.page.getByRole('button', { name: 'Send my request', exact: true }).dblclick();
      if (recovery) {
        await manual.page.getByRole('status').filter({ hasText: 'response was lost' }).waitFor();
        assert(
          !eventNames(manual.hits).includes('generate_lead'),
          'Lost response emitted unconfirmed lead',
        );
        // Hold only the fixture GET until the accepted tag is ready; separate loading tests assert drops.
        manual.prepareRecovery();
        await manual.page.goto(`${app}/manual`, { waitUntil: 'domcontentloaded' });
        await manual.page
          .getByRole('heading', {
            name: 'A person will review your brief and reply by email.',
            exact: true,
          })
          .waitFor();
      } else
        await manual.page.getByRole('heading', { name: 'Request saved.', exact: true }).waitFor();
      await until(
        () => eventNames(manual.hits).includes('generate_lead'),
        'Manual confirmation/recovery lead absent',
      );
      assert(
        eventNames(manual.hits).filter((name) => name === 'generate_lead').length === 1,
        'Manual confirmation duplicate',
      );
      inspect(manual.hits);
      const payload = JSON.stringify(manual.hits);
      for (const secret of manual.secrets)
        assert(!payload.includes(secret), 'Receipt or claim entered vendor payload');
      const leads = eventNames(manual.hits).filter((name) => name === 'generate_lead').length;
      await manual.page.reload({ waitUntil: 'domcontentloaded' });
      await manual.page
        .getByRole('heading', { name: 'Let’s start with your request.', exact: true })
        .waitFor();
      assert(
        eventNames(manual.hits).filter((name) => name === 'generate_lead').length === leads,
        'Reload replayed known receipt',
      );
      const loadedBeforeOperator = manual.loaders();
      await manual.page.goto(`${app}/operator?secret=${sentinels[4]}`);
      assert(
        manual.loaders() === loadedBeforeOperator &&
          (await manual.page.locator('script[src*="googletagmanager"]').count()) === 0,
        'Accepted public navigation loaded an operator tag',
      );
      await manual.context.unrouteAll({ behavior: 'wait' });
      await manual.context.close();
      globalThis.console.log(
        `PASS accepted manual ${recovery ? 'lost-response recovery' : 'confirmation'}, rejected POST, duplicate click and reload`,
      );
    }
    for (const blocked of [false, true]) {
      const manual = await open(390, { accepted: true, blocked, manual: true, hold: !blocked });
      await submit(manual.page);
      if (!blocked) {
        manual.release();
        await until(() => eventNames(manual.hits).includes('page_view'), 'Held tag did not load');
        assert(!eventNames(manual.hits).includes('generate_lead'), 'Loading backfilled lead');
      } else {
        assert(
          await manual.page
            .getByRole('status')
            .filter({ hasText: 'Optional analytics is unavailable' })
            .isVisible(),
          'Blocked tag has no optional failure state',
        );
        assert(manual.hits.length === 0, 'Blocked analytics emitted');
      }
      await manual.context.unrouteAll({ behavior: 'wait' });
      await manual.context.close();
      globalThis.console.log(
        `PASS manual submission while ${blocked ? 'network blocked' : 'loading'}`,
      );
    }
    assert(errors.length === 0, errors.join('\n'));
    writeFileSync(
      `${screenshots}/verdict.json`,
      JSON.stringify(
        { vendor: isFixtureVendor ? 'fixture' : 'official-google', violations, errors },
        null,
        2,
      ),
    );
    assert(violations.length === 0, [...new Set(violations)].join('\n'));
  }
} finally {
  await browser.close();
}
