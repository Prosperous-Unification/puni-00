import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

import { createBrowserAnalytics } from './browser';

const options = {
  enabled: true,
  environment: 'development',
  measurementId: 'G-R0JM3R4SSV',
} as const;
function browser(url = 'https://dev.app.puni.dev/?email=secret@example.test#private') {
  const dom = new JSDOM('<title>secret private title</title>', {
    url,
    referrer: 'https://search.example/private?email=secret@example.test',
  });
  const window = dom.window;
  return { dom, window };
}
function queue(window: Window & typeof globalThis): unknown[][] {
  return (Reflect.get(window, 'puniAnalyticsLayer') as IArguments[]).map((command) =>
    Array.from<unknown>(command),
  );
}
async function loaded(window: Window & typeof globalThis) {
  const script = window.document.querySelector('script');
  if (!script) throw new Error('No script');
  script.dispatchEvent(new window.Event('load'));
  await Promise.resolve();
}

test('browser starts cookieless before interaction and sets sanitized global/config metadata before insertion', async () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  expect(window.document.scripts).toHaveLength(1);
  const commands = queue(window);
  expect(commands[0]).toEqual([
    'consent',
    'default',
    {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  expect(commands[1]?.[0]).toBe('set');
  expect(commands[3]).toMatchObject([
    'config',
    options.measurementId,
    {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      allow_enhanced_conversions: false,
      user_data: null,
      cookie_domain: 'puni.dev',
      cookie_prefix: 'puni_dev',
      page_location: 'https://dev.app.puni.dev/',
      page_title: 'Build with PUNI',
      page_referrer: 'https://search.example',
    },
  ]);
  expect(JSON.stringify(commands)).not.toContain('secret');
  await loaded(window);
  expect(analytics.getState()).toEqual({ status: 'cookieless' });
  expect(queue(window).filter((command) => command[0] === 'event')).toHaveLength(1);
  analytics.dispose();
  dom.window.close();
});

test('one browser controller refuses incompatible configuration and cancels stale scripts on withdrawal', async () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  expect(createBrowserAnalytics(window, options)).toBe(analytics);
  expect(() => createBrowserAnalytics(window, { enabled: false })).toThrow('configuration');
  analytics.accept();
  const stale = window.document.scripts[0];
  analytics.reject();
  expect(Reflect.get(window, 'ga-disable-G-R0JM3R4SSV')).toBe(true);
  expect(queue(window)).toHaveLength(0);
  stale.dispatchEvent(new window.Event('load'));
  await Promise.resolve();
  expect(analytics.getState()).toEqual({ status: 'denied' });
  analytics.accept();
  expect(window.document.scripts).toHaveLength(1);
  await loaded(window);
  analytics.reject();
  expect(queue(window)).toHaveLength(0);
  analytics.dispose();
  dom.window.close();
});

test('browser withdrawal clears configured cookies and receipt markers while preserving functional and other-environment storage', async () => {
  const { dom, window } = browser();
  window.document.cookie = 'claim=necessary; Path=/';
  window.document.cookie = 'operator=necessary; Path=/';
  window.document.cookie = 'puni_prod_ga=production; Domain=puni.dev; Path=/';
  window.document.cookie = 'puni_dev_ga=development; Domain=puni.dev; Path=/';
  window.document.cookie = 'puni_dev_ga_R0JM3R4SSV=session; Path=/';
  window.sessionStorage.setItem('request-cache', 'necessary');
  window.sessionStorage.setItem('puni_prod:lead:old', 'sent');
  const analytics = createBrowserAnalytics(window, options);
  analytics.accept();
  await loaded(window);
  expect(
    analytics.dispatchLead('opaque-confirmation', {
      name: 'generate_lead',
      route: 'chat',
      funnel_version: '1',
    }),
  ).toBe('sent');
  expect(JSON.stringify(queue(window))).not.toContain('opaque-confirmation');
  analytics.reject();
  expect(window.document.cookie).not.toContain('puni_dev_ga');
  expect(window.document.cookie).toContain('claim=necessary');
  expect(window.document.cookie).toContain('operator=necessary');
  expect(window.document.cookie).toContain('puni_prod_ga=production');
  expect(window.sessionStorage.getItem('puni_dev:lead:opaque-confirmation')).toBeNull();
  expect(window.sessionStorage.getItem('request-cache')).toBe('necessary');
  expect(window.sessionStorage.getItem('puni_prod:lead:old')).toBe('sent');
  analytics.dispose();
  dom.window.close();
});

test('focus/pageshow resynchronize cross-host choice and storage denial is optional while programmer errors propagate', async () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  analytics.accept();
  await loaded(window);
  window.document.cookie = 'puni_dev_consent_v1=malformed; Domain=puni.dev; Path=/';
  window.dispatchEvent(new window.Event('pageshow'));
  expect(analytics.getState()).toEqual({ status: 'cookieless' });
  Object.defineProperty(window.document, 'cookie', {
    configurable: true,
    get() {
      throw new window.DOMException('denied', 'SecurityError');
    },
  });
  window.dispatchEvent(new window.Event('focus'));
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  Object.defineProperty(window.document, 'cookie', {
    configurable: true,
    get() {
      throw new TypeError('first-party bug');
    },
  });
  expect(() => {
    analytics.sync();
  }).toThrow('first-party bug');
  analytics.dispose();
  dom.window.close();
});

test('blocked vendor load and denied session storage stay visibly unavailable', async () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  analytics.accept();
  window.document.scripts[0].dispatchEvent(new window.Event('error'));
  await Promise.resolve();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'loader' });
  analytics.accept();
  await loaded(window);
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      throw new window.DOMException('denied', 'SecurityError');
    },
  });
  expect(
    analytics.dispatchLead('receipt', {
      name: 'generate_lead',
      route: 'manual',
      funnel_version: '1',
    }),
  ).toBe('unavailable');
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  analytics.dispose();
  dom.window.close();
});

test('vendor commands use the documented arguments protocol and neutralize every raw UTM dimension', () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  analytics.accept();
  const layer = Reflect.get(window, 'puniAnalyticsLayer') as unknown[];
  expect(Object.prototype.toString.call(layer[0])).toBe('[object Arguments]');
  expect(Array.from<unknown>(layer[1] as IArguments)[1]).toMatchObject({
    campaign_id: '',
    campaign_content: '',
    campaign_term: '',
    url_passthrough: false,
    ads_data_redaction: true,
  });
  analytics.dispose();
  dom.window.close();
});

test('silent cookie refusal is visible for acceptance and withdrawal; loader timeout is bounded', async () => {
  const { dom, window } = browser();
  const cookie = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie');
  if (!cookie?.get) throw new Error('Missing browser cookie boundary');
  const analytics = createBrowserAnalytics(window, options);
  window.document.cookie = 'puni_dev_ga=keep; Path=/';
  Object.defineProperty(window.document, 'cookie', {
    configurable: true,
    get: (): unknown => cookie.get?.call(window.document),
    set: () => undefined,
  });
  analytics.accept();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(window.document.scripts).toHaveLength(0);
  analytics.reject();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  Reflect.deleteProperty(window.document, 'cookie');
  let expire: (() => void) | undefined;
  window.setTimeout = ((callback: () => void) => {
    expire = callback;
    return 1;
  }) as typeof window.setTimeout;
  analytics.accept();
  if (!expire) throw new Error('No load timeout');
  expire();
  await Promise.resolve();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'loader' });
  expect(window.document.scripts).toHaveLength(0);
  analytics.dispose();
  dom.window.close();
});

test('withdrawal reports a cookie cleanup failure even when the rejection preference persists', () => {
  const { dom, window } = browser();
  const cookie = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie');
  if (!cookie?.get || !cookie.set) throw new Error('Missing browser cookie boundary');
  const analytics = createBrowserAnalytics(window, options);
  window.document.cookie = 'puni_dev_ga=undeletable; Path=/';
  Object.defineProperty(window.document, 'cookie', {
    configurable: true,
    get: (): unknown => cookie.get?.call(window.document),
    set: (value: string) => {
      if (value.startsWith('puni_dev_consent_v1=')) cookie.set?.call(window.document, value);
    },
  });
  analytics.reject();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(window.document.cookie).toContain('puni_dev_ga=undeletable');
  analytics.dispose();
  dom.window.close();
});

test('real domain cookies share development consent across hosts without granting production consent', async () => {
  const { CookieJar } = await import('jsdom');
  const cookieJar = new CookieJar();
  const site = new JSDOM('', { url: 'https://dev.puni.dev/', cookieJar });
  const app = new JSDOM('', { url: 'https://dev.app.puni.dev/', cookieJar });
  const production = new JSDOM('', { url: 'https://app.puni.dev/', cookieJar });
  const siteAnalytics = createBrowserAnalytics(site.window, options);
  siteAnalytics.accept();
  const appAnalytics = createBrowserAnalytics(app.window, options);
  expect(appAnalytics.getState()).toEqual({ status: 'loading' });
  const productionAnalytics = createBrowserAnalytics(production.window, {
    enabled: true,
    environment: 'production',
    measurementId: 'G-TESTPROD12',
  });
  expect(productionAnalytics.getState()).toEqual({ status: 'loading' });
  expect(queue(production.window)[0]?.[2]).toMatchObject({ analytics_storage: 'denied' });
  siteAnalytics.reject();
  app.window.dispatchEvent(new app.window.Event('focus'));
  expect(appAnalytics.getState()).toEqual({ status: 'denied' });
  siteAnalytics.dispose();
  appAnalytics.dispose();
  productionAnalytics.dispose();
  site.window.close();
  app.window.close();
  production.window.close();
});

test('startup preserves Home and safe steps, grants cookies in place and never replays events', async () => {
  const { dom, window } = browser('https://dev.puni.dev/?email=SECRET#SECRET');
  const analytics = createBrowserAnalytics(window, options);
  expect(window.document.cookie).toBe('');
  expect(window.sessionStorage.length).toBe(0);
  analytics.dispatch({ name: 'funnel_failure', category: 'network' });
  window.history.pushState({}, '', '/services?email=SECRET');
  analytics.navigate();
  const events = () => queue(window).filter((command) => command[0] === 'event');
  expect(events().map((command) => command[1])).toEqual([
    'page_view',
    'funnel_failure',
    'page_view',
  ]);
  expect(events()[0]?.[2]).toMatchObject({
    page_id: 'home',
    page_location: 'https://dev.puni.dev/',
  });
  analytics.accept();
  const commands = queue(window);
  expect(commands.at(-1)).toEqual([
    'consent',
    'update',
    {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  expect(events()).toHaveLength(3);
  await loaded(window);
  expect(analytics.getState()).toEqual({ status: 'ready' });
  expect(events()).toHaveLength(3);
  expect(JSON.stringify(commands)).not.toContain('SECRET');
  analytics.dispose();
  dom.window.close();
});

test('a valid explicit rejection prevents even the initial Google script', () => {
  const { dom, window } = browser();
  const preference = JSON.stringify({ version: 1, accepted: false, expires: Date.now() + 60000 });
  window.document.cookie = `puni_dev_consent_v1=${encodeURIComponent(preference)}; Domain=puni.dev; Path=/`;
  const analytics = createBrowserAnalytics(window, options);
  expect(analytics.getState()).toEqual({ status: 'denied' });
  expect(window.document.scripts).toHaveLength(0);
  expect(Reflect.has(window, 'puniAnalyticsLayer')).toBe(false);
  analytics.dispose();
  dom.window.close();
});

test('startup commands are bounded and overflow visibly disables optional measurement', async () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  for (let count = 0; count < 110; count++)
    analytics.dispatch({ name: 'funnel_failure', category: 'network' });
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
  expect(queue(window)).toHaveLength(0);
  expect(window.document.scripts).toHaveLength(0);
  await Promise.resolve();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
  analytics.dispose();
  dom.window.close();
});

test('full startup queue refuses consent updates visibly without an implicit loader retry', async () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  for (let count = 0; count < 94; count++)
    analytics.dispatch({ name: 'funnel_failure', category: 'network' });
  expect(queue(window)).toHaveLength(100);
  analytics.accept();
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
  expect(queue(window)).toHaveLength(0);
  expect(window.document.scripts).toHaveLength(0);
  await Promise.resolve();
  analytics.dispose();
  dom.window.close();
});

test('returning permission grants only analytics storage before config and resumed consent uses update', async () => {
  const { dom, window } = browser();
  const preference = JSON.stringify({ version: 1, accepted: true, expires: Date.now() + 60000 });
  window.document.cookie = `puni_dev_consent_v1=${encodeURIComponent(preference)}; Domain=puni.dev; Path=/`;
  const analytics = createBrowserAnalytics(window, options);
  expect(queue(window)[0]).toEqual([
    'consent',
    'default',
    {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  await loaded(window);
  analytics.reject();
  analytics.accept();
  expect(queue(window)[0]).toEqual([
    'consent',
    'update',
    {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  await Promise.resolve();
  expect(analytics.getState()).toEqual({ status: 'ready' });
  analytics.dispose();
  dom.window.close();
});

test('navigation never grows a full startup layer beyond the command bound', () => {
  const { dom, window } = browser();
  const analytics = createBrowserAnalytics(window, options);
  for (let count = 0; count < 94; count++)
    analytics.dispatch({ name: 'funnel_failure', category: 'network' });
  const layer = Reflect.get(window, 'puniAnalyticsLayer') as IArguments[];
  let peak = layer.length;
  const append = layer.push.bind(layer);
  layer.push = (...commands) => {
    const length = append(...commands);
    peak = Math.max(peak, length);
    return length;
  };
  window.history.pushState({}, '', '/manual');
  analytics.navigate();
  expect(peak).toBe(100);
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
  expect(layer).toHaveLength(0);
  analytics.dispose();
  dom.window.close();
});

test('unreadable initial preference blocks optional loading while an absent choice starts it', () => {
  const { dom, window } = browser();
  Object.defineProperty(window.document, 'cookie', {
    get() {
      throw new window.DOMException('denied', 'SecurityError');
    },
  });
  const analytics = createBrowserAnalytics(window, options);
  expect(analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(window.document.scripts).toHaveLength(0);
  expect(Reflect.has(window, 'puniAnalyticsLayer')).toBe(false);
  analytics.dispose();
  dom.window.close();
});

test('cookieless browser leads work with unreadable session storage and write no cookies', () => {
  const { dom, window } = browser();
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      throw new window.DOMException('denied', 'SecurityError');
    },
  });
  const analytics = createBrowserAnalytics(window, options);
  const lead = { name: 'generate_lead', route: 'manual', funnel_version: '1' } as const;
  expect(analytics.dispatchLead('PRIVATE_RECEIPT', lead)).toBe('sent');
  expect(analytics.dispatchLead('PRIVATE_RECEIPT', lead)).toBe('duplicate');
  expect(window.document.cookie).toBe('');
  expect(JSON.stringify(queue(window))).not.toContain('PRIVATE_RECEIPT');
  analytics.dispose();
  dom.window.close();
});
