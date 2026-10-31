import { createHash } from 'node:crypto';
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
const officialTag = env['PUNI_GOOGLE_TAG_PATH'];
const tag = officialTag
  ? readFileSync(officialTag, 'utf8')
  : await (
      await globalThis.fetch(
        'https://www.googletagmanager.com/gtag/js?id=G-R0JM3R4SSV&l=puniAnalyticsLayer',
      )
    ).text();
if (tag.length < 100000) throw new Error('Official Google tag unavailable');
writeFileSync(
  `${screenshots}/tag-identity.json`,
  JSON.stringify(
    {
      source: 'https://www.googletagmanager.com/gtag/js?id=G-R0JM3R4SSV&l=puniAnalyticsLayer',
      runtime: 'official-google-non-debug',
      suppliedPath: officialTag ?? null,
      capturedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(tag).digest('hex'),
      bytes: new globalThis.TextEncoder().encode(tag).byteLength,
    },
    null,
    2,
  ),
);
const homeBundle = await globalThis.Bun.build({
  entrypoints: [new globalThis.URL('./analytics-home.mjs', import.meta.url).pathname],
  target: 'browser',
  throw: false,
});
// Proof: missing-home-dependency exits 1 here; Bun otherwise throws before returning a failure.
if (!homeBundle.success)
  throw new Error(`Home fixture bundle failed: ${homeBundle.logs.join('\n')}`);
const homeScript = await homeBundle.outputs[0].text();
const homeDocument = `<html><head><title>DESCRIPTION_SENTINEL</title></head><body><h1>Public Home adapter fixture</h1><script type="module">${homeScript}</script></body></html>`;
const browser = await chromium.launch({
  ...(env['PUNI_CHROMIUM_PATH']
    ? { executablePath: env['PUNI_CHROMIUM_PATH'] }
    : { channel: 'chrome' }),
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
/** Collector POST rows inherit the URL envelope; both transports carry real Google fields. */
function decodeHits(hits) {
  return hits.flatMap((hit) => {
    const envelope = [...new globalThis.URL(hit.url).searchParams];
    const rows = hit.body ? hit.body.split(/\r?\n/).filter(Boolean) : [''];
    return rows.map((row) =>
      Object.fromEntries([...envelope, ...new globalThis.URLSearchParams(row)]),
    );
  });
}
function eventNames(hits) {
  return decodeHits(hits)
    .map((fields) => fields.en)
    .filter(Boolean);
}
function eventCommands(commands) {
  return commands.filter((command) => command[0] === 'event');
}
async function commands(page) {
  return page.evaluate(() =>
    Array.from(Reflect.get(globalThis, 'puniAnalyticsLayer') ?? [], (command) =>
      Array.from(command),
    ),
  );
}
async function storage(context, page) {
  return {
    cookies: (await context.cookies()).map(({ name, domain }) => ({ name, domain })),
    keys: await page.evaluate(() => Object.keys(globalThis.sessionStorage)),
  };
}
// Proof: lead-marker-fence and cookie-cleanup faults fail home-cookieless-lead/home-accept.
function assertCookieless(snapshot) {
  assert(
    snapshot.cookies.every(({ name }) => ['puni_draft', 'puni_dev_consent_v1'].includes(name)),
    'Cookieless Google wrote analytics cookies',
  );
  assert(
    !snapshot.keys.some((key) => key.startsWith('puni_dev:lead:')),
    'Cookieless lead wrote receipt marker',
  );
}
async function settle() {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 1400));
}
async function close(fixture, name) {
  await settle();
  const snapshot = {
    loaders: fixture.loaders(),
    storage: await storage(fixture.context, fixture.page),
    commands: await commands(fixture.page),
    insertions: await fixture.page.evaluate(() => Reflect.get(globalThis, 'analyticsInsertions')),
  };
  // Keep interception installed through teardown so a final SDK beacon cannot escape locally fulfilled routes.
  await fixture.context.close();
  writeFileSync(
    `${screenshots}/${name}.json`,
    JSON.stringify({ ...snapshot, raw: fixture.hits, decoded: decodeHits(fixture.hits) }, null, 2),
  );
  // Proof: the late actual-tag final_text fault passed before this ordering fix; it now fails with the full raw receipt retained.
  inspect(fixture.hits);
  const payload = JSON.stringify(decodeHits(fixture.hits));
  for (const secret of fixture.secrets)
    assert(!payload.includes(secret), 'Receipt or claim entered vendor payload');
  globalThis.console.log(`PASS ${name}`);
}
async function open(
  width,
  {
    accepted = false,
    rejected = false,
    blocked = false,
    manual = false,
    home = false,
    hold = false,
  } = {},
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
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript(() => {
    const insertions = [];
    Reflect.set(globalThis, 'analyticsInsertions', insertions);
    const append = globalThis.Element.prototype.append;
    globalThis.Element.prototype.append = function (...nodes) {
      for (const node of nodes)
        if (
          node instanceof globalThis.HTMLScriptElement &&
          node.src.includes('googletagmanager.com/gtag/js')
        )
          insertions.push(
            Array.from(Reflect.get(globalThis, 'puniAnalyticsLayer'), (command) =>
              Array.from(command),
            ),
          );
      append.apply(this, nodes);
    };
  });
  const hits = [];
  const posts = [];
  let loaders = 0;
  let isBlocked = blocked;
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
    } else if (home && url.origin === site) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: homeDocument });
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
      if (isBlocked) await route.abort('blockedbyclient');
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
    ...(accepted || rejected
      ? [
          {
            name: 'puni_dev_consent_v1',
            value: encodeURIComponent(
              JSON.stringify({ version: 1, accepted, expires: Date.now() + 86400000 }),
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
    `${home ? site : app}${manual ? '/manual' : '/'}?q=${sentinels[4]}&utm_campaign=${sentinels[4]}#${sentinels[5]}`,
    {
      waitUntil: 'domcontentloaded',
      referer: `${site}/private/${sentinels[7]}?secret=${sentinels[7]}`,
    },
  );
  if (home) await page.waitForFunction(() => Reflect.has(globalThis, 'analyticsFixture'));
  else
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
    unblock: () => {
      isBlocked = false;
    },
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
/** Google's pageLocation stripProtocol experiment removes the scheme; accept only exact registry forms.
 * Raw collector receipts retain the original transport spelling. Proof: raw-location still fails.
 */
function matchesLocation(value, canonical) {
  return value === canonical || value === canonical.slice('https://'.length);
}
/** Proof: raw URL/referrer/campaign and granted-default production faults fail Home privacy checks. */
function inspect(hits) {
  writeFileSync(
    `${screenshots}/last-inspection.json`,
    JSON.stringify({ raw: hits, decoded: decodeHits(hits) }, null, 2),
  );
  const payload = JSON.stringify(decodeHits(hits));
  for (const sentinel of sentinels)
    if (payload.includes(sentinel)) violations.push(`Vendor payload leaked ${sentinel}`);
  for (const fields of decodeHits(hits)) {
    if (fields.en) {
      assert(fields.gcs !== undefined && fields.gcs !== '', 'Actual Google consent field absent');
      assert(
        !fields._dbg && !fields['ep.debug_mode'],
        'Debug collection is not a real non-debug proof',
      );
    }
    if (fields.dl)
      assert(
        [`${app}/`, `${app}/manual`, `${site}/`, `${site}/services`].some((canonical) =>
          matchesLocation(fields.dl, canonical),
        ),
        `Unsafe page location ${fields.dl}`,
      );
    if (fields.dr) assert(fields.dr === site || fields.dr === '', `Unsafe referrer ${fields.dr}`);
    if (fields.dt)
      assert(
        ['Build with PUNI', 'Request PUNI help', 'PUNI', 'PUNI services'].includes(fields.dt),
        `Unsafe title ${fields.dt}`,
      );
  }
  assert(
    !eventNames(hits).some((name) =>
      ['form_start', 'form_submit', 'view_search_results', 'click'].includes(name),
    ),
    'Automatic form/search/outbound event',
  );
}
const completed = [];
let status = 'failed';
async function run(name, verify) {
  const selected = env['PUNI_ANALYTICS_CASE'];
  if (
    (!selected && name === 'disabled') ||
    (selected && selected !== name && !(selected === 'metadata' && name === 'home-first'))
  )
    return;
  await verify();
  completed.push(name);
}
async function useController(page, method) {
  return page.evaluate((name) => Reflect.get(globalThis, 'analyticsFixture')[name](), method);
}
async function openChoices(page) {
  const allow = page.getByRole('button', { name: 'Allow analytics cookies', exact: true });
  if (!(await allow.isVisible()))
    await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
}
try {
  await run('home-first', async () => {
    const fixture = await open(390, { home: true });
    await until(
      () => eventNames(fixture.hits).includes('page_view'),
      'First Home pageview absent before choice',
    );
    const rows = decodeHits(fixture.hits).filter((fields) => fields.en === 'page_view');
    // Proof: default-granted and raw-location faults fail this real-Google Home path.
    assert(
      rows.length === 1 &&
        rows[0]['ep.page_id'] === 'home' &&
        matchesLocation(rows[0].dl, `${site}/`),
      'First page is not canonical Home',
    );
    assert(
      rows.every((fields) => fields.gcs === 'G100'),
      'Fresh Home did not deny analytics storage',
    );
    const insertion = await fixture.page.evaluate(
      () => Reflect.get(globalThis, 'analyticsInsertions')[0],
    );
    assert(
      insertion[0][0] === 'consent' && insertion[0][1] === 'default',
      'Consent does not precede insertion config',
    );
    assert(
      Object.values(insertion[0][2]).every((value) => value === 'denied'),
      'Insertion granted consent',
    );
    const configuration = insertion.find((command) => command[0] === 'config')[2];
    // Proof: automatic-pageview, signals and enhanced-conversion faults fail home-first at insertion.
    assert(
      configuration.send_page_view === false &&
        configuration.allow_google_signals === false &&
        configuration.allow_ad_personalization_signals === false &&
        configuration.allow_enhanced_conversions === false &&
        configuration.user_data === null &&
        configuration.ads_data_redaction === true,
      'Unsafe insertion privacy configuration',
    );
    assert(configuration.page_location === `${site}/`, 'Unsafe initial config');
    assertCookieless(await storage(fixture.context, fixture.page));
    await fixture.page.screenshot({ path: `${screenshots}/home-first.png` });
    await close(fixture, 'home-first');
  });
  await run('home-rapid', async () => {
    const fixture = await open(390, { home: true, hold: true });
    await fixture.page.evaluate(() => {
      const analytics = Reflect.get(globalThis, 'analyticsFixture');
      analytics.dispatch({
        name: 'funnel_start',
        starting_choice: 'typed',
        entry_point: 'hero',
        funnel_version: '1',
      });
      globalThis.history.pushState({}, '', '/services?email=QUERY_SENTINEL#HASH_SENTINEL');
      analytics.navigate();
    });
    // Proof: startup-drops fails home-rapid before the held loader is released.
    const queued = eventCommands(await commands(fixture.page));
    assert(
      queued.map((command) => command[1]).join(',') === 'page_view,funnel_start,page_view',
      'Startup events were lost or reordered',
    );
    fixture.release();
    await until(() => eventNames(fixture.hits).length >= 3, 'Rapid startup events absent');
    const rows = decodeHits(fixture.hits).filter((fields) => fields.en);
    assert(
      rows
        .slice(0, 3)
        .map((fields) => fields.en)
        .join(',') === 'page_view,funnel_start,page_view',
      'Actual startup event ordering changed',
    );
    assert(
      matchesLocation(rows[0].dl, `${site}/`) && matchesLocation(rows[2].dl, `${site}/services`),
      'Navigation replaced first Home context',
    );
    assert(
      rows.every((fields) => fields.gcs === 'G100'),
      'Startup granted storage',
    );
    assertCookieless(await storage(fixture.context, fixture.page));
    await close(fixture, 'home-rapid');
  });
  await run('home-accept', async () => {
    const fixture = await open(390, { home: true });
    await until(() => eventNames(fixture.hits).includes('page_view'), 'Pre-acceptance Home absent');
    await fixture.page.evaluate(() =>
      Reflect.get(globalThis, 'analyticsFixture').dispatch({
        name: 'funnel_start',
        starting_choice: 'typed',
        entry_point: 'hero',
        funnel_version: '1',
      }),
    );
    await until(
      () => eventNames(fixture.hits).includes('funnel_start'),
      'Cookieless funnel absent',
    );
    const before = eventCommands(await commands(fixture.page));
    const beforeHits = decodeHits(fixture.hits).length;
    await useController(fixture.page, 'accept');
    await settle();
    const after = await commands(fixture.page);
    assert(
      JSON.stringify(eventCommands(after)) === JSON.stringify(before),
      // Proof: acceptance-replay fails home-accept even when SDK network batching differs.
      'Acceptance controller replayed page/history',
    );
    const update = after.findLast((command) => command[0] === 'consent');
    assert(
      update[1] === 'update' && update[2].analytics_storage === 'granted',
      'Cookie acceptance did not update existing tag',
    );
    assert(
      ['ad_storage', 'ad_user_data', 'ad_personalization'].every(
        (key) => update[2][key] === 'denied',
      ),
      'Acceptance enabled Ads',
    );
    // Google's consent-update ping can repeat en/dl with gcu=1; command history proves it is SDK-owned.
    const acceptanceRows = decodeHits(fixture.hits).slice(beforeHits);
    assert(
      acceptanceRows.every((fields) => fields.gcu === '1' || fields.en === 'user_engagement'),
      'Acceptance replayed historical network event',
    );
    await fixture.page.evaluate(() =>
      Reflect.get(globalThis, 'analyticsFixture').dispatch({
        name: 'services_view',
        page_id: 'home',
      }),
    );
    await until(
      () => eventNames(fixture.hits).includes('services_view'),
      'Post-consent event absent',
    );
    assert(
      decodeHits(fixture.hits).find((fields) => fields.en === 'services_view').gcs === 'G101',
      'Future event did not grant analytics storage',
    );
    assert(
      (await storage(fixture.context, fixture.page)).cookies.some(({ name }) =>
        name.startsWith('puni_dev_ga'),
      ),
      'Accepted tag did not write configured cookies',
    );
    const sdkRows = decodeHits(fixture.hits)
      .slice(beforeHits)
      .filter((fields) => fields.en !== 'services_view');
    assert(
      sdkRows.every((fields) => fields.gcu === '1' || fields.en === 'user_engagement'),
      'SDK consent change replayed historical funnel',
    );
    writeFileSync(
      `${screenshots}/sdk-consent-updates.json`,
      JSON.stringify(
        {
          controllerEventsBefore: before,
          controllerEventsAfterAcceptance: eventCommands(after),
          sdkRows,
        },
        null,
        2,
      ),
    );
    const receipt = 'WITHDRAWAL_RECEIPT_SENTINEL';
    const marker = `puni_dev:lead:${receipt}`;
    fixture.secrets.push(receipt);
    const outcome = await fixture.page.evaluate((confirmation) => {
      globalThis.sessionStorage.setItem('functional-sentinel', 'kept');
      return Reflect.get(globalThis, 'analyticsFixture').dispatchLead(confirmation, {
        name: 'generate_lead',
        route: 'manual',
        funnel_version: '1',
      });
    }, receipt);
    assert(outcome === 'sent', 'Permitted withdrawal lead was not enqueued');
    await until(
      () => eventNames(fixture.hits).includes('generate_lead'),
      'Permitted withdrawal lead absent',
    );
    const beforeWithdrawal = await storage(fixture.context, fixture.page);
    const markerBefore = await fixture.page.evaluate(
      (key) => globalThis.sessionStorage.getItem(key),
      marker,
    );
    const functionalBefore = await fixture.page.evaluate(() =>
      globalThis.sessionStorage.getItem('functional-sentinel'),
    );
    assert(
      beforeWithdrawal.keys.includes(marker) &&
        markerBefore === 'sent' &&
        functionalBefore === 'kept',
      'Withdrawal setup lacks real marker or functional state',
    );
    await useController(fixture.page, 'reject');
    await settle();
    const stopped = fixture.hits.length;
    await fixture.page.evaluate(() => {
      const analytics = Reflect.get(globalThis, 'analyticsFixture');
      analytics.dispatch({ name: 'services_view', page_id: 'home' });
      globalThis.history.pushState({}, '', '/services');
      analytics.navigate();
      globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange'));
    });
    await settle();
    assert(fixture.hits.length === stopped, 'Loaded tag emitted after withdrawal');
    const afterWithdrawal = await storage(fixture.context, fixture.page);
    const functionalAfter = await fixture.page.evaluate(() =>
      globalThis.sessionStorage.getItem('functional-sentinel'),
    );
    writeFileSync(
      `${screenshots}/withdrawal-storage.json`,
      JSON.stringify(
        {
          before: beforeWithdrawal,
          markerBefore,
          functionalBefore,
          after: afterWithdrawal,
          functionalAfter,
        },
        null,
        2,
      ),
    );
    // Proof: skipping production marker removal fails this actual prepopulated withdrawal case.
    assertCookieless(afterWithdrawal);
    // Proof: deleting functional-sentinel inside production cleanup fails preservation across withdrawal.
    assert(functionalAfter === 'kept', 'Withdrawal deleted functional storage');
    await close(fixture, 'home-accept');
  });
  await run('home-reject-loading', async () => {
    const fixture = await open(390, { home: true, hold: true });
    await useController(fixture.page, 'reject');
    fixture.release();
    await settle();
    assert(
      fixture.hits.length === 0 && eventCommands(await commands(fixture.page)).length === 0,
      // Proof: reject-stop and combined reject-purge/cancellation faults fail home-reject-loading.
      'Stale loader emitted after rejection',
    );
    await useController(fixture.page, 'navigate');
    assert(fixture.hits.length === 0, 'Rejected navigation measured');
    await close(fixture, 'home-reject-loading');
  });
  await run('home-stored-rejection', async () => {
    const fixture = await open(390, { home: true, rejected: true });
    await settle();
    // Proof: stored-rejection bypass fails this actual Home test.
    assert(fixture.loaders() === 0 && fixture.hits.length === 0, 'Stored rejection loaded Google');
    await close(fixture, 'home-stored-rejection');
  });
  await run('home-blocked-retry', async () => {
    const fixture = await open(390, { home: true, blocked: true });
    await until(
      async () => (await useController(fixture.page, 'getState')).status === 'unavailable',
      'Blocked loader not unavailable',
    );
    assert(fixture.hits.length === 0, 'Blocked loader emitted');
    fixture.unblock();
    await useController(fixture.page, 'accept');
    // Proof: retry-disabled fails home-blocked-retry with no second loader.
    await until(() => eventNames(fixture.hits).includes('page_view'), 'Explicit retry failed');
    assert(fixture.loaders() === 2, 'Explicit retry did not use bounded second loader');
    await close(fixture, 'home-blocked-retry');
  });
  await run('home-retry-bound', async () => {
    const fixture = await open(390, { home: true, blocked: true });
    await until(
      async () => (await useController(fixture.page, 'getState')).status === 'unavailable',
      'Initial block not unavailable',
    );
    await useController(fixture.page, 'accept');
    await until(
      async () =>
        fixture.loaders() === 2 &&
        (await useController(fixture.page, 'getState')).status === 'unavailable',
      'Second block not unavailable',
    );
    await useController(fixture.page, 'accept');
    await settle();
    // Proof: retry-unbounded fails home-retry-bound by starting a third actual script request.
    assert(
      fixture.loaders() === 2 && fixture.hits.length === 0,
      'Retry exceeded two loader attempts',
    );
    await close(fixture, 'home-retry-bound');
  });
  await run('home-cookieless-lead', async () => {
    const fixture = await open(390, { home: true });
    await until(
      () => eventNames(fixture.hits).includes('page_view'),
      'Cookieless lead Home absent',
    );
    const outcomes = await fixture.page.evaluate(() => {
      const analytics = Reflect.get(globalThis, 'analyticsFixture');
      const event = { name: 'generate_lead', route: 'manual', funnel_version: '1' };
      return [
        analytics.dispatchLead('RECEIPT_SENTINEL', event),
        analytics.dispatchLead('RECEIPT_SENTINEL', event),
      ];
    });
    fixture.secrets.push('RECEIPT_SENTINEL');
    // Proof: lead-dedup fails home-cookieless-lead after two real dispatchLead calls.
    assert(outcomes.join(',') === 'sent,duplicate', 'Cookieless in-memory dedup failed');
    await until(() => eventNames(fixture.hits).includes('generate_lead'), 'Cookieless lead absent');
    await settle();
    assert(
      eventNames(fixture.hits).filter((name) => name === 'generate_lead').length === 1,
      'Cookieless duplicate payload',
    );
    assertCookieless(await storage(fixture.context, fixture.page));
    await close(fixture, 'home-cookieless-lead');
  });
  for (const width of [320, 390, 1440])
    await run(`app-privacy-${width}`, async () => {
      const fixture = await open(width);
      const { page, hits } = fixture;
      await until(
        () => eventNames(hits).includes('page_view'),
        'First app view absent before choice',
      );
      assertCookieless(await storage(fixture.context, page));
      const allow = page.getByRole('button', { name: 'Allow analytics cookies', exact: true });
      const disable = page.getByRole('button', { name: 'Disable measurement', exact: true });
      assert((await allow.isVisible()) && (await disable.isVisible()), 'Unequal privacy choices');
      await disable.click();
      await settle();
      const stopped = hits.length;
      await review(page);
      await openChoices(page);
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
        disable,
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
          'Privacy obscured control or target too small',
        );
      }
      await page.screenshot({ path: `${screenshots}/privacy-${width}.png` });
      await submit(page);
      await settle();
      assert(hits.length === stopped, 'Disabled submission measured');
      const before = eventCommands(await commands(page)).length;
      await allow.click();
      await until(() => hits.length > stopped, 'Explicit re-enable pageview absent');
      const added = eventCommands(await commands(page)).slice(before);
      assert(
        added.every((command) => command[1] === 'page_view'),
        'Re-enable replayed rejected funnel/lead',
      );
      await close(fixture, `app-privacy-${width}`);
    });
  await run('app-chat-lead', async () => {
    const fixture = await open(390, { accepted: true });
    const { page, hits } = fixture;
    await until(() => eventNames(hits).includes('page_view'), 'Accepted app view absent');
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
    await settle();
    assert(
      eventNames(hits).filter((name) => name === 'generate_lead').length === 1,
      'Duplicate chat lead',
    );
    await close(fixture, 'app-chat-lead');
  });
  for (const recovery of [false, true])
    await run(`app-manual-${recovery ? 'recovery' : 'confirm'}`, async () => {
      const fixture = await open(390, { accepted: true, manual: true });
      const { page, hits } = fixture;
      await until(() => eventNames(hits).includes('page_view'), 'Accepted manual page absent');
      fixture.setProposalMode('reject');
      await page
        .getByRole('textbox', { name: 'Email', exact: true })
        .fill(`${String(Date.now())}-${sentinels[3]}`);
      await page.getByRole('button', { name: 'Send my request', exact: true }).click();
      await page
        .getByRole('status')
        .filter({ hasText: 'This option isn’t available right now' })
        .waitFor();
      assert(!eventNames(hits).includes('generate_lead'), 'Rejected POST emitted lead');
      fixture.setProposalMode(recovery ? 'lost' : 'normal');
      await page.getByRole('button', { name: 'Send my request', exact: true }).dblclick();
      if (recovery) {
        await page.getByRole('status').filter({ hasText: 'response was lost' }).waitFor();
        assert(
          !eventNames(hits).includes('generate_lead'),
          'Lost response emitted unconfirmed lead',
        );
        fixture.prepareRecovery();
        await page.goto(`${app}/manual`, { waitUntil: 'domcontentloaded' });
        await page
          .getByRole('heading', {
            name: 'A person will review your brief and reply by email.',
            exact: true,
          })
          .waitFor();
      } else await page.getByRole('heading', { name: 'Request saved.', exact: true }).waitFor();
      await until(
        () => eventNames(hits).includes('generate_lead'),
        'Manual confirmation/recovery lead absent',
      );
      await settle();
      assert(
        eventNames(hits).filter((name) => name === 'generate_lead').length === 1,
        'Manual confirmation duplicate',
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page
        .getByRole('heading', { name: 'Let’s start with your request.', exact: true })
        .waitFor();
      await settle();
      assert(
        eventNames(hits).filter((name) => name === 'generate_lead').length === 1,
        'Reload replayed known receipt',
      );
      const loaded = fixture.loaders();
      const count = hits.length;
      await page.goto(`${app}/operator?secret=${sentinels[4]}`);
      await settle();
      assert(fixture.loaders() === loaded && hits.length === count, 'Operator measured');
      await close(fixture, `app-manual-${recovery ? 'recovery' : 'confirm'}`);
    });
  for (const blocked of [false, true])
    await run(`app-${blocked ? 'blocked' : 'loading'}`, async () => {
      const fixture = await open(390, { manual: true, blocked, hold: !blocked });
      await submit(fixture.page);
      if (!blocked) {
        fixture.release();
        await until(
          () => eventNames(fixture.hits).includes('generate_lead'),
          'Safe startup lead was lost',
        );
        assertCookieless(await storage(fixture.context, fixture.page));
      } else {
        assert(
          await fixture.page
            .getByRole('status')
            .filter({ hasText: 'Optional analytics is unavailable' })
            .isVisible(),
          'Blocked analytics failure invisible',
        );
        assert(fixture.hits.length === 0, 'Blocked analytics emitted');
        fixture.unblock();
        await openChoices(fixture.page);
        await fixture.page
          .getByRole('button', { name: 'Allow analytics cookies', exact: true })
          .click();
        await until(
          () => eventNames(fixture.hits).includes('page_view'),
          'App blocked-loader retry failed',
        );
        assert(
          !eventNames(fixture.hits).includes('generate_lead'),
          'Retry replayed unavailable lead',
        );
      }
      await close(fixture, `app-${blocked ? 'blocked' : 'loading'}`);
    });
  await run('disabled', async () => {
    const fixture = await open(390, { accepted: true, manual: true });
    await submit(fixture.page);
    assert(fixture.loaders() === 0 && fixture.hits.length === 0, 'Default build loaded analytics');
    await close(fixture, 'disabled');
  });
  // Proof: unknown-case exits 1 instead of reporting an empty successful run.
  assert(completed.length > 0, 'Unknown case selection');
  assert(errors.length === 0, errors.join('\n'));
  assert(violations.length === 0, [...new Set(violations)].join('\n'));
  status = 'passed';
} finally {
  writeFileSync(
    `${screenshots}/verdict.json`,
    JSON.stringify(
      {
        status,
        vendor: 'official-google',
        completed,
        violations,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
