import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { env } from 'node:process';

import { chromium } from 'playwright';

// Two fixture stacks: demo sign-in (4218/3118) and Google sign-in unconfigured (4219/3119).
const demo = {
  app: 'http://localhost:4218',
  api: 'http://localhost:3118',
  site: 'http://localhost:4318',
};
const oidc = {
  app: 'http://localhost:4219',
  api: 'http://localhost:3119',
  site: 'http://localhost:4319',
};
// The site origins serve no files locally; site media is fetched from this origin instead.
const mediaOrigin = env['PUNI_MEDIA_ORIGIN'] ?? 'https://dev.puni.dev';
// Bundled Chromium cannot decode the site's H.264 video; installed Google Chrome can.
const channel = env['PUNI_BROWSER_CHANNEL'] ?? 'chrome';
const outDir = env['PUNI_SCREENS_DIR'];
if (!outDir) throw new Error('PUNI_SCREENS_DIR is required');
const strict = env['PUNI_SCREENS_STRICT'] === '1';
const operatorPassword = env['PUNI_OPERATOR_PASSWORD'];
mkdirSync(outDir, { recursive: true });

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const description =
  'A booking tool for a community bicycle workshop, so volunteers stop juggling paper slots.';

async function createDraftCookie(stack) {
  const intake = await globalThis.fetch(`${stack.api}/intakes`, {
    method: 'POST',
    headers: { origin: stack.site, 'content-type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (intake.status !== 201) throw new Error(`Fixture intake failed: ${String(intake.status)}`);
  const cookie = intake.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Fixture intake did not issue a draft cookie');
  const separator = cookie.indexOf('=');
  if (separator < 1) throw new Error('Fixture draft cookie is malformed');
  return {
    name: cookie.slice(0, separator),
    value: cookie.slice(separator + 1),
    url: stack.app,
    httpOnly: true,
    sameSite: 'Lax',
  };
}

const states = [
  {
    name: 'build-disabled',
    check: async (page, _consoleTexts, stack) => {
      const problems = [];
      const main = await page.locator('main').innerText();
      if (/not configured/i.test(main)) problems.push('"not configured" wording shown');
      if ((await page.locator('main .build-disabled-row').count()) !== 1)
        problems.push('missing the disabled row');
      if ((await page.getByRole('link', { name: /Shape your brief/ }).count()) !== 1)
        problems.push('missing Shape your brief action');
      if ((await page.locator('main textarea, main .harness-composer').count()) !== 0)
        problems.push('a composer is shown while the provider is disabled');
      const live = await page
        .locator('[aria-live], [role="status"], [role="alert"]')
        .allInnerTexts();
      if (live.some((text) => /\bAI\b|PUNI (is|replied)|thinking|writing/i.test(text)))
        problems.push(`live region claims AI: ${JSON.stringify(live)}`);
      if ((await page.locator('nav[aria-label="Primary"] a[aria-current="page"]').count()) !== 1)
        problems.push('Build is not marked as the current page');
      // Proof: restoring the header pill made this report at all four widths.
      if ((await page.locator('header.site-header a', { hasText: /request/i }).count()) !== 0)
        problems.push('header carries a request link');
      const video = page.locator('.hero-media video');
      if ((await video.count()) !== 1) problems.push('no background video');
      else {
        if ((await video.getAttribute('src')) !== `${stack.site}/media/hero/background.mp4`)
          problems.push(`video src ${String(await video.getAttribute('src'))}`);
        if ((await video.getAttribute('crossorigin')) !== null)
          problems.push('video carries crossorigin');
      }
      const moon = await page
        .locator('.wordmark-moon img')
        .evaluate((image) => ({ src: image.currentSrc, width: image.naturalWidth }))
        .catch(() => null);
      if (!moon?.src.startsWith(`${stack.site}/media/brand/moon.`) || moon.width === 0)
        problems.push(`moon not loaded from the site origin: ${JSON.stringify(moon)}`);
      return problems;
    },
    stack: oidc,
    path: '/',
    cookie: true,
    ready: (page) => page.locator('.build-disabled-row').waitFor(),
  },
  {
    name: 'build-reduced-motion',
    reducedMotion: 'reduce',
    check: async (page, _consoleTexts, stack) => {
      const problems = [];
      if ((await page.locator('.hero-media video').count()) !== 0)
        problems.push('video rendered under reduced motion');
      if (
        (await page.locator('.hero-media-poster img').getAttribute('src')) !==
        `${stack.site}/media/hero/poster.jpg`
      )
        problems.push('poster missing under reduced motion');
      return problems;
    },
    stack: oidc,
    path: '/',
    cookie: true,
    ready: (page) => page.locator('.build-disabled-row').waitFor(),
  },
  {
    name: 'build-media-failed',
    abortMedia: true,
    allowed: ['net::ERR_FAILED'],
    // Proof: deleting HeroMedia's onError handlers made this report the missing gradient at all four widths.
    check: async (page) => {
      const problems = [];
      if ((await page.locator('.hero-media-gradient').count()) !== 1)
        problems.push('media failure did not switch to the gradient');
      if ((await page.locator('.wordmark-dot').count()) !== 1)
        problems.push('moon failure did not show the dot');
      if ((await page.locator('main .build-disabled-row').count()) !== 1)
        problems.push('media failure hid the conversation');
      return problems;
    },
    stack: oidc,
    path: '/',
    cookie: true,
    ready: async (page) => {
      await page.locator('.build-disabled-row').waitFor();
      await page
        .locator('.hero-media-gradient')
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
    },
  },
  {
    name: 'manual',
    // Proof: forcing the manual AI card on (in app-flow.ts or main.tsx) made this check fail all
    // four widths, again after the /session wait replaced networkidle (offersAiExploration → true).
    check: async (page) => {
      // The looping band video keeps the network busy, so wait for the settled /session read.
      await page.waitForFunction(() =>
        globalThis.performance
          .getEntriesByType('resource')
          .some((entry) => new globalThis.URL(entry.name).pathname === '/session'),
      );
      await page.waitForTimeout(200);
      const back = await page.locator('main a').evaluateAll((links) =>
        links
          .map((link) => new globalThis.URL(link.href))
          .filter(
            (url) =>
              url.origin === globalThis.location.origin &&
              (url.pathname === '/' || url.pathname.startsWith('/studio')),
          )
          .map((url) => url.href),
      );
      return back.length === 0 ? [] : [`manual brief links back to Build: ${back.join(', ')}`];
    },
    stack: oidc,
    path: '/manual',
    cookie: true,
    ready: (page) => page.locator('#brief').waitFor(),
  },
  {
    name: 'manual-session-down',
    stack: oidc,
    path: '/manual',
    cookie: true,
    abortSession: true,
    // The aborted /session request and its contextual report are the expected console output.
    allowed: ['net::ERR_FAILED', 'Manual brief hid the AI card'],
    ready: (page) => page.locator('#brief').waitFor(),
    // Proof: hiding the card without console.error made this check report "unavailable not reported".
    check: async (page, consoleTexts) => {
      const problems = [];
      if ((await page.getByRole('link', { name: /Explore with AI/ }).count()) !== 0)
        problems.push('AI card shown without a session status');
      if (!consoleTexts.some((text) => text.includes('Manual brief hid the AI card')))
        problems.push('unavailable not reported');
      return problems;
    },
  },
  {
    name: 'manual-nocookie',
    stack: oidc,
    path: '/manual',
    cookie: false,
    ready: (page) => page.getByRole('heading', { name: /start with your request/i }).waitFor(),
  },
  {
    name: 'loading',
    stack: oidc,
    path: '/',
    cookie: true,
    hold: true,
    ready: (page) => page.getByText(/Checking your request/).waitFor(),
  },
  {
    name: 'error',
    // Proof: removing the network branch of describeFailure made this check report "Failed to fetch".
    check: async (page) => {
      const alert = await page.getByRole('alert').innerText();
      const problems = [];
      if (!alert.includes('We couldn’t reach PUNI. Check your connection and try again.'))
        problems.push(`error copy: ${alert.replaceAll('\n', ' ')}`);
      if (alert.includes('Failed to fetch')) problems.push('raw browser error shown');
      if ((await page.getByRole('button', { name: 'Try again' }).count()) !== 1)
        problems.push('no retry');
      if ((await page.getByRole('link', { name: 'Back to Home' }).count()) !== 1)
        problems.push('no exit');
      return problems;
    },
    stack: oidc,
    path: '/',
    cookie: true,
    abort: true,
    ready: (page) => page.getByRole('alert').waitFor(),
  },
  {
    name: 'operator',
    stack: oidc,
    path: '/operator',
    cookie: false,
    ready: (page) => page.locator('#operator-password').waitFor(),
  },
  {
    name: 'workspace',
    // A request without a concept answers GET /concept with 404 by contract.
    allowed: ['status of 404'],
    stack: demo,
    path: '/',
    cookie: true,
    demoSignIn: true,
    check: async (page) => {
      const problems = [];
      if (!(await page.locator('#build-message[readonly]').isVisible()))
        problems.push('the Home request is not pre-filled in the composer');
      if ((await page.getByRole('button', { name: /^Send/ }).count()) !== 1)
        problems.push('expected one Send action');
      const composer = await page.locator('.harness-composer').boundingBox();
      const viewport = page.viewportSize();
      if (!composer || !viewport || composer.y + composer.height > viewport.height)
        problems.push('composer is not pinned inside the viewport');
      return problems;
    },
    ready: async (page) => {
      await page.getByRole('heading', { name: 'Shape the work together.' }).waitFor();
      await page.locator('#build-message').waitFor();
    },
  },
];
if (operatorPassword)
  states.push({
    name: 'operator-inbox',
    stack: oidc,
    path: '/operator',
    cookie: false,
    operatorSignIn: true,
    ready: (page) => page.getByRole('button', { name: /Refresh inbox/ }).waitFor(),
  });

/**
 * Measures an element's focus outline (`focus`) or border (`rest`) against the first opaque
 * surface behind it, as a WCAG contrast ratio. Runs in the page.
 */
function inspectIndicator(element, mode) {
  const channels = (color) => {
    const parts = color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const luminance = (rgb) =>
    rgb
      .slice(0, 3)
      .map((channel) => channel / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  let behind = [255, 255, 255, 1];
  for (let node = element.parentElement; node; node = node.parentElement) {
    const color = channels(globalThis.getComputedStyle(node).backgroundColor);
    if (color[3] > 0) {
      behind = color;
      break;
    }
  }
  const style = globalThis.getComputedStyle(element);
  const visible =
    mode === 'rest' ||
    (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2);
  const raw = channels(mode === 'rest' ? style.borderTopColor : style.outlineColor);
  const shown = raw
    .slice(0, 3)
    .map((channel, index) => channel * raw[3] + behind[index] * (1 - raw[3]));
  const [high, low] = [luminance(shown), luminance(behind)].sort((first, second) => second - first);
  return {
    name: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} "${(element.textContent ?? '').trim().slice(0, 24)}"`,
    ratio: visible ? (high + 0.05) / (low + 0.05) : 0,
  };
}

/**
 * Proof: `outline: none` on focused fields, the old composer glow, and the old #c9c9c4 border
 * each made this report a failing ratio (0:1 indicator, 1.66:1 border).
 * Tabs through the page and focuses every text field, failing any focus indicator under 3:1
 * (WCAG 2.4.13) and any resting field border under 3:1 (WCAG 1.4.11) against its surface.
 */
async function auditFocus(page) {
  const problems = [];
  const seen = new Set();
  const record = (focus, label) => {
    if (seen.has(focus.name)) return;
    seen.add(focus.name);
    if (focus.ratio < 3)
      problems.push(`${label} focus indicator ${focus.ratio.toFixed(2)}:1 on ${focus.name}`);
  };
  await page.locator('h1').first().focus();
  for (let step = 0; step < 14; step += 1) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    if ((await focused.count()) === 1)
      record(await focused.evaluate(inspectIndicator, 'focus'), 'tab');
  }
  for (const field of await page.locator('input:visible, textarea:visible').all()) {
    await field.focus();
    record(await field.evaluate(inspectIndicator, 'focus'), 'field');
    await field.evaluate((element) => element.blur());
    const rest = await field.evaluate(inspectIndicator, 'rest');
    if (rest.ratio < 3) problems.push(`field border ${rest.ratio.toFixed(2)}:1 on ${rest.name}`);
  }
  return problems;
}

/** The live marketing site the app header must match; only read, never written. */
const parityOrigin = env['PUNI_PARITY_ORIGIN'] ?? 'https://dev.puni.dev';
const parityViewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const parityTolerance = 2;
/** The same header parts on the site and in the app; `menuItems` are read with the menu open. */
const siteHeaderParts = {
  brand: '.puni-wordmark',
  wordmark: '.puni-wordmark-line',
  moon: '.puni-wordmark-moon img',
  rail: '.puni-desktop-nav .puni-rail-label',
  nav: '.puni-rail-links a',
  menu: '.puni-menu summary',
  menuTitle: '.puni-menu .nav-link-title',
  menuItems: '.puni-menu .nav-menu-content a',
};
const appHeaderParts = {
  brand: 'header.site-header .brand',
  wordmark: 'header.site-header .wordmark-header',
  moon: 'header.site-header .wordmark-moon img',
  rail: 'header.site-header .nav-rail-label',
  nav: 'header.site-header .site-nav a',
  menu: 'header.site-header .menu-toggle',
  menuTitle: 'header.site-header .nav-rail-label',
  menuItems: 'header.site-header .site-nav a',
};

/**
 * Reads the box and type of each header part, or `hidden` for an undisplayed one. `phase`
 * picks the closed parts or the open menu's parts. Runs in the page.
 */
function measureHeaderParts([parts, phase]) {
  const read = (element) => {
    if (!element) return 'missing';
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return 'hidden';
    const style = globalThis.getComputedStyle(element);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      size: Number.parseFloat(style.fontSize),
      line: style.lineHeight,
      weight: style.fontWeight,
      family: style.fontFamily.split(',')[0].replaceAll(/["']/g, '').trim(),
    };
  };
  const one = (selector) => read(globalThis.document.querySelector(selector));
  const all = (selector) =>
    [...globalThis.document.querySelectorAll(selector)].map((element) => read(element));
  if (phase === 'open')
    return {
      menu: one(parts.menu),
      menuTitle: one(parts.menuTitle),
      menuItems: all(parts.menuItems),
    };
  return {
    brand: one(parts.brand),
    wordmark: one(parts.wordmark),
    moon: one(parts.moon),
    rail: one(parts.rail),
    nav: all(parts.nav),
    menu: one(parts.menu),
  };
}

/** Lists every part whose visibility, box (±{@link parityTolerance}px) or type differs. */
function compareHeaderParts(site, app) {
  const problems = [];
  const format = (part) =>
    typeof part === 'string'
      ? part
      : `${part.x.toFixed(1)},${part.y.toFixed(1)} ${part.width.toFixed(1)}x${part.height.toFixed(1)} ${part.family} ${String(part.size)}px/${part.line} ${part.weight}`;
  const pairs = Object.entries(site).flatMap(([name, sitePart]) =>
    Array.isArray(sitePart)
      ? sitePart.map((part, index) => [`${name}[${String(index)}]`, part, app[name]?.[index]])
      : [[name, sitePart, app[name]]],
  );
  for (const [name, sitePart, appPart] of pairs) {
    if (appPart === undefined) {
      problems.push(`${name}: absent in app (site ${format(sitePart)})`);
      continue;
    }
    if (typeof sitePart === 'string' || typeof appPart === 'string') {
      if (sitePart !== appPart)
        problems.push(`${name}: site ${format(sitePart)}, app ${format(appPart)}`);
      continue;
    }
    const isBoxOff = ['x', 'y', 'width', 'height'].some(
      (key) => Math.abs(sitePart[key] - appPart[key]) > parityTolerance,
    );
    const isTypeOff =
      Math.abs(sitePart.size - appPart.size) > 0.5 ||
      sitePart.line !== appPart.line ||
      sitePart.weight !== appPart.weight ||
      sitePart.family !== appPart.family;
    if (isBoxOff || isTypeOff)
      problems.push(`${name}: site ${format(sitePart)}, app ${format(appPart)}`);
  }
  return problems;
}

const only = env['PUNI_SCREENS_ONLY']?.split(',');
const selected = only ? states.filter((state) => only.includes(state.name)) : states;
const failures = [];
const mediaCache = new Map();

/** Fetches one site media file from {@link mediaOrigin} once, without the app's cookies. */
async function fetchSiteMedia(pathname) {
  if (!mediaCache.has(pathname))
    mediaCache.set(
      pathname,
      globalThis.fetch(`${mediaOrigin}${pathname}`).then(async (response) => {
        if (!response.ok)
          throw new Error(`Media fixture ${pathname} answered ${String(response.status)}`);
        return {
          contentType: response.headers.get('content-type') ?? 'application/octet-stream',
          body: Buffer.from(await response.arrayBuffer()),
        };
      }),
    );
  return mediaCache.get(pathname);
}

/** Serves the stack's site media from {@link mediaOrigin}, or aborts it to model a media outage. */
async function routeSiteMedia(context, stack, abort) {
  await context.route(`${stack.site}/media/**`, async (route) => {
    if (abort) return route.abort('failed');
    const media = await fetchSiteMedia(new globalThis.URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: media.contentType, body: media.body });
  });
}

const browser = await chromium.launch({ channel, headless: true, args: ['--no-sandbox'] });
try {
  for (const state of selected) {
    for (const viewport of viewports) {
      const label = `${state.name}-${String(viewport.width)}`;
      const context = await browser.newContext({
        viewport,
        ...(state.reducedMotion ? { reducedMotion: state.reducedMotion } : {}),
      });
      await routeSiteMedia(context, state.stack, state.abortMedia === true);
      if (state.cookie) await context.addCookies([await createDraftCookie(state.stack)]);
      const page = await context.newPage();
      const consoleErrors = [];
      const consoleTexts = [];
      page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        consoleTexts.push(text);
        // A signed-out session and a missing manual draft answer 401 by contract.
        if (text.includes('status of 401')) return;
        if (state.allowed?.some((allowed) => text.includes(allowed))) return;
        if (state.abort && text.includes('net::ERR_FAILED')) return;
        if (state.abort && text.includes('CORS')) return;
        consoleErrors.push(text);
      });
      await page.addInitScript(() => {
        globalThis.__cls = 0;
        new globalThis.PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) globalThis.__cls += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      if (state.hold)
        await page.route(`${state.stack.api}/entry`, () => new Promise(() => undefined));
      if (state.abort) await page.route(`${state.stack.api}/entry`, (route) => route.abort());
      if (state.abortSession)
        await page.route(`${state.stack.api}/session`, (route) => route.abort());
      await page.goto(`${state.stack.app}${state.path}`, { waitUntil: 'domcontentloaded' });
      if (state.demoSignIn) {
        // The live anonymous harness keeps the optional sign-in behind a bar control.
        await page.getByRole('button', { name: '[ Sign in ]' }).click();
        await page.locator('#demo-email').fill(`screens-${String(Date.now())}@example.test`);
        await page.getByRole('button', { name: /Enter local demo/ }).click();
      }
      if (state.operatorSignIn) {
        await page.locator('#operator-password').fill(operatorPassword);
        await page.getByRole('button', { name: /Sign in/ }).click();
      }
      await state.ready(page);
      await page.evaluate(() => globalThis.document.fonts.ready);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${outDir}/app-${label}.png`, fullPage: true });
      const audit = await page.evaluate(() => {
        const overflow = globalThis.document.documentElement.scrollWidth - globalThis.innerWidth;
        const small = [];
        for (const element of globalThis.document.querySelectorAll(
          'a[href], button, input, textarea, select, summary',
        )) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (globalThis.getComputedStyle(element).visibility === 'hidden') continue;
          // WCAG 2.5.8 exempts links inside running text.
          if (element.tagName === 'A' && element.closest('p')) continue;
          if (box.height < 44 || box.width < 44)
            small.push(
              `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 32)}" ${String(Math.round(box.width))}x${String(Math.round(box.height))}`,
            );
        }
        const h1 = globalThis.document.querySelector('h1');
        return {
          overflow,
          small,
          cls: globalThis.__cls,
          title: globalThis.document.title,
          h1Focused: h1 !== null && globalThis.document.activeElement === h1,
        };
      });
      const problems = state.check ? await state.check(page, consoleTexts, state.stack) : [];
      problems.push(...(await auditFocus(page)));
      if (audit.overflow > 0) problems.push(`horizontal overflow ${String(audit.overflow)}px`);
      if (audit.small.length > 0) problems.push(`small targets: ${audit.small.join('; ')}`);
      if (audit.cls >= 0.05) problems.push(`CLS ${audit.cls.toFixed(3)}`);
      if (consoleErrors.length > 0) problems.push(`console: ${consoleErrors.join(' | ')}`);
      globalThis.console.log(
        `${label}: title="${audit.title}" h1Focused=${String(audit.h1Focused)} cls=${audit.cls.toFixed(3)} ${problems.length === 0 ? 'OK' : problems.join(' / ')}`,
      );
      if (problems.length > 0) failures.push(label);
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      await context.close();
    }
  }

  if (!only || only.includes('menu')) {
    const context = await browser.newContext({ viewport: viewports[2] });
    await routeSiteMedia(context, oidc, false);
    await context.addCookies([await createDraftCookie(oidc)]);
    const page = await context.newPage();
    await page.goto(oidc.app, { waitUntil: 'domcontentloaded' });
    // Wait for the loaded state: its h1 focus would otherwise reset the focus start point.
    await page.locator('.build-disabled-row').waitFor();
    // The looping background video keeps the network busy, so networkidle never settles here.
    await page.waitForTimeout(800);
    // Clicking the header's empty middle sets the sequential focus start before its controls.
    await page.mouse.click(195, 34);
    const order = [];
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => globalThis.document.activeElement?.className.split(' ')[0] ?? ''),
      );
    }
    // Proof: moving the brand back after the Menu toggle made this report skip-link,menu-toggle,brand.
    const orderOk = order.join(',') === 'skip-link,brand,menu-toggle';
    globalThis.console.log(`tab-order-390: ${order.join(',')} ${orderOk ? 'OK' : 'FAIL'}`);
    if (!orderOk) failures.push('tab-order-390');
    await page.keyboard.press('Escape');
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    const build = page.locator('nav[aria-label="Primary"] a[aria-current="page"]');
    await build.waitFor();
    await page.screenshot({ path: `${outDir}/app-menu-open-390.png` });
    const expanded = await page.locator('.menu-toggle').getAttribute('aria-expanded');
    await page.keyboard.press('Escape');
    const closed = !(await build.isVisible());
    const focused = await page.evaluate(() =>
      globalThis.document.activeElement?.classList.contains('menu-toggle'),
    );
    const menuOk = expanded === 'true' && closed && focused === true;
    globalThis.console.log(
      `menu-390: expanded=${String(expanded)} escapeClosed=${String(closed)} focusReturned=${String(focused)} ${menuOk ? 'OK' : 'FAIL'}`,
    );
    if (!menuOk) failures.push('menu-390');
    await context.close();
  }

  // Proof: against the previous header (4cacc8ced) all 15 route-width captures failed (16px
  // Geist brand, no moon on manual, inline 14px nav, Menu at 1024); restoring the moon's old
  // 0.7em size failed all 15 again on the moon and wordmark boxes.
  if (!only || only.includes('header-parity')) {
    const parityRoutes = ['/', '/manual', '/operator'];
    for (const viewport of parityViewports) {
      const siteContext = await browser.newContext({ viewport });
      const sitePage = await siteContext.newPage();
      await sitePage.goto(`${parityOrigin}/`, { waitUntil: 'load', timeout: 30_000 });
      await sitePage.evaluate(() => globalThis.document.fonts.ready);
      await sitePage.waitForTimeout(800);
      const site = await sitePage.evaluate(measureHeaderParts, [siteHeaderParts, 'closed']);
      const isNarrow = viewport.width === 390;
      let siteOpen = null;
      if (isNarrow) {
        await sitePage.locator(siteHeaderParts.menu).click();
        await sitePage.waitForTimeout(300);
        siteOpen = await sitePage.evaluate(measureHeaderParts, [siteHeaderParts, 'open']);
      }
      if (viewport.width === 1440 || isNarrow) {
        if (isNarrow) await sitePage.locator(siteHeaderParts.menu).click();
        await sitePage.screenshot({ path: `${outDir}/parity-site-${String(viewport.width)}.png` });
        await sitePage.screenshot({
          path: `${outDir}/parity-site-header-${String(viewport.width)}.png`,
          clip: { x: 0, y: 0, width: viewport.width, height: isNarrow ? 120 : 280 },
        });
        if (isNarrow) {
          await sitePage.locator(siteHeaderParts.menu).click();
          await sitePage.waitForTimeout(300);
          await sitePage.screenshot({ path: `${outDir}/parity-site-menu-open-390.png` });
        }
      }
      await siteContext.close();
      for (const route of parityRoutes) {
        const label = `header-parity${route === '/' ? '/build' : route}-${String(viewport.width)}`;
        const context = await browser.newContext({ viewport });
        await routeSiteMedia(context, oidc, false);
        await context.addCookies([await createDraftCookie(oidc)]);
        const page = await context.newPage();
        await page.goto(`${oidc.app}${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').first().waitFor();
        await page.evaluate(() => globalThis.document.fonts.ready);
        await page.waitForTimeout(800);
        const problems = compareHeaderParts(
          site,
          await page.evaluate(measureHeaderParts, [appHeaderParts, 'closed']),
        );
        const name = route === '/' ? 'build' : route.slice(1);
        if (viewport.width === 1440 || isNarrow) {
          await page.screenshot({
            path: `${outDir}/parity-app-${name}-${String(viewport.width)}.png`,
          });
          await page.screenshot({
            path: `${outDir}/parity-app-${name}-header-${String(viewport.width)}.png`,
            clip: { x: 0, y: 0, width: viewport.width, height: isNarrow ? 120 : 280 },
          });
        }
        if (isNarrow && siteOpen) {
          const toggle = page.locator(appHeaderParts.menu);
          if ((await toggle.count()) === 1 && (await toggle.isVisible())) {
            await toggle.click();
            await page.waitForTimeout(300);
            const appOpen = await page.evaluate(measureHeaderParts, [appHeaderParts, 'open']);
            problems.push(
              ...compareHeaderParts(siteOpen, appOpen).map((problem) => `open ${problem}`),
            );
            await page.screenshot({ path: `${outDir}/parity-app-${name}-menu-open-390.png` });
          } else problems.push('open menu: app has no visible Menu button');
        }
        globalThis.console.log(`${label}: ${problems.length === 0 ? 'OK' : problems.join(' / ')}`);
        if (problems.length > 0) failures.push(label);
        await context.unrouteAll({ behavior: 'ignoreErrors' });
        await context.close();
      }
    }
  }

  if (!only || only.includes('start-over')) {
    const context = await browser.newContext({ viewport: viewports[3] });
    await routeSiteMedia(context, oidc, false);
    await context.route(
      (url) => url.origin === oidc.site && !url.pathname.startsWith('/media/'),
      (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Home</title>' }),
    );
    await context.addCookies([await createDraftCookie(oidc)]);
    const page = await context.newPage();
    await page.goto(oidc.app, { waitUntil: 'domcontentloaded' });
    await page.locator('.build-disabled-row').waitFor();
    const problems = [];
    const activeText = () =>
      page.evaluate(() => globalThis.document.activeElement?.textContent?.trim() ?? '');
    await page.getByRole('button', { name: /Start over/ }).focus();
    await page.keyboard.press('Enter');
    if (!(await activeText()).includes('Keep')) problems.push('confirmation did not focus Keep');
    for (const name of [/Keep/, /Discard/]) {
      const box = await page.getByRole('button', { name }).boundingBox();
      if (!box || box.height < 44 || box.width < 44)
        problems.push(`small ${String(name)} target ${JSON.stringify(box)}`);
    }
    await page.screenshot({ path: `${outDir}/app-start-over-confirm-320.png` });
    await page.keyboard.press('Enter');
    if (!(await activeText()).includes('Start over')) problems.push('Keep did not return focus');
    if ((await page.locator('main .build-disabled-row').count()) !== 1)
      problems.push('Keep changed the conversation');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    if (!(await activeText()).includes('Discard')) problems.push('Tab did not reach Discard');
    await page.keyboard.press('Enter');
    await page.waitForURL(`${oidc.site}/#request`);
    const cookies = await context.cookies(oidc.app);
    if (cookies.some((cookie) => cookie.name.endsWith('puni_draft')))
      problems.push(`draft cookie kept: ${JSON.stringify(cookies.map((cookie) => cookie.name))}`);
    await page.goto(oidc.app, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(`${oidc.site}/?entry=missing#request`);
    globalThis.console.log(
      `start-over-320: ${problems.length === 0 ? 'OK' : problems.join(' / ')}`,
    );
    if (problems.length > 0) failures.push('start-over-320');
    await context.close();
  }

  for (const viewport of only ? [] : [viewports[0], viewports[2]]) {
    const context = await browser.newContext({
      viewport,
      recordVideo: { dir: `${outDir}/video-${String(viewport.width)}`, size: viewport },
    });
    await routeSiteMedia(context, oidc, false);
    await context.addCookies([await createDraftCookie(oidc)]);
    const page = await context.newPage();
    await page.goto(oidc.app, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('link', { name: /brief/i }).first().click();
    await page.locator('#brief').waitFor();
    await page.waitForTimeout(800);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(1200);
    await context.close();
  }
} finally {
  await browser.close();
}
if (strict && failures.length > 0)
  throw new Error(
    `Screen audit failed for ${String(failures.length)} captures: ${failures.join(', ')}`,
  );
