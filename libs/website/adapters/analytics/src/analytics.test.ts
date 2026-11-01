import { expect, test } from 'bun:test';

import {
  type AnalyticsPorts,
  createAnalytics,
  type MeasurementContext,
  type VendorEvent,
} from './analytics';
import { configureAnalytics, resolvePage } from './configuration';

const dev = { enabled: true, environment: 'development', measurementId: 'G-R0JM3R4SSV' } as const;
const href = 'https://dev.app.puni.dev/?email=secret@example.test#private';
function fixture(initialLocation = href, initialPreference: string | null = null) {
  let preference: string | null = initialPreference;
  let location = initialLocation;
  let finish: ((loaded: 'ready' | 'unavailable') => void) | undefined;
  const initializations: MeasurementContext[] = [];
  const permissions: string[] = [];
  const sent: VendorEvent[] = [];
  const markers = new Map<string, string>();
  const cookies = new Map([
    ['puni_dev_ga', 'a'],
    ['puni_dev_ga_R0JM3R4SSV', 'b'],
    ['puni_prod_ga', 'c'],
    ['claim', 'd'],
    ['operator', 'e'],
  ]);
  let disabled = 0;
  let now = Date.UTC(2026, 9, 25);
  const ports: AnalyticsPorts = {
    now: () => now,
    location: () => location,
    referrer: () => 'https://search.example/path?secret=email@example.test#secret',
    readPreference: () => ({ status: 'ok', value: preference }),
    writePreference: (value) => {
      preference = value;
      return { status: 'ok' };
    },
    clearAnalytics: (prefix) => {
      for (const key of cookies.keys())
        if (key === `${prefix}_ga` || key.startsWith(`${prefix}_ga_`)) cookies.delete(key);
      markers.clear();
      return { status: 'ok' };
    },
    readMarker: (key) => ({ status: 'ok', value: markers.get(key) ?? null }),
    writeMarker: (key) => {
      markers.set(key, 'sent');
      return { status: 'ok' };
    },
    vendor: {
      updateConsent: (permission) => {
        permissions.push(permission);
        return 'sent';
      },
      load: (context, _configuration, permission) => {
        permissions.push(permission);
        initializations.push(context);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      update: () => undefined,
      send: (event) => {
        sent.push(event);
        return 'sent';
      },
      disable: () => {
        disabled++;
      },
    },
  };
  const analytics = createAnalytics(dev, ports);
  return {
    analytics,
    ports,
    sent,
    initializations,
    permissions,
    markers,
    cookies,
    disabled: () => disabled,
    setPreference: (value: string | null) => {
      preference = value;
    },
    preference: () => preference,
    setLocation: (value: string) => {
      location = value;
    },
    advance: () => {
      now += 184 * 24 * 60 * 60 * 1000;
    },
    complete: async (loaded: 'ready' | 'unavailable' = 'ready') => {
      if (!finish) throw new Error('No load started');
      finish(loaded);
      await Promise.resolve();
    },
  };
}

test('first page and safe startup steps enqueue before cookie permission without acceptance replay', async () => {
  const f = fixture();
  expect(f.analytics.getState()).toEqual({ status: 'loading' });
  expect(f.initializations).toHaveLength(1);
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
  expect(
    f.analytics.dispatch({ name: 'brief_view', route: 'early', starting_choice: 'improve' }),
  ).toBe('sent');
  f.setLocation('https://dev.app.puni.dev/manual?email=secret@example.test');
  f.analytics.navigate();
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('sent');
  await f.complete();
  expect(f.analytics.getState()).toEqual({ status: 'cookieless' });
  expect(f.sent.map((event) => event.name)).toEqual([
    'page_view',
    'brief_view',
    'page_view',
    'funnel_failure',
  ]);
  expect(
    f.sent
      .filter((event) => event.name === 'page_view')
      .map((event) => event.parameters['page_id']),
  ).toEqual(['build', 'manual']);
  f.analytics.accept();
  f.analytics.accept();
  expect(f.initializations).toHaveLength(1);
  expect(f.analytics.getState()).toEqual({ status: 'ready' });
  expect(f.sent).toHaveLength(4);
});

test('initialization and navigation contain fixed pages, origin-only referrers and no raw campaign input', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  expect(f.initializations[0]).toMatchObject({
    page_location: 'https://dev.app.puni.dev/',
    page_title: 'Build with PUNI',
    page_referrer: 'https://search.example',
    campaign_source: '',
    campaign_medium: '',
    campaign_name: '',
  });
  expect(JSON.stringify(f.initializations)).not.toContain('secret');
  f.analytics.navigate();
  expect(f.sent).toHaveLength(1);
  f.setLocation('https://dev.app.puni.dev/manual?email=secret@example.test');
  f.analytics.navigate();
  expect(f.sent.at(-1)?.parameters['page_location']).toBe('https://dev.app.puni.dev/manual');
  f.setLocation('https://dev.app.puni.dev/operator');
  f.analytics.navigate();
  expect(f.analytics.getState()).toEqual({ status: 'disabled' });
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('dropped');
});

test('withdrawal fences a stale completion and clears only environment analytics state', async () => {
  const f = fixture();
  f.analytics.accept();
  f.analytics.reject();
  await f.complete();
  expect(f.analytics.getState()).toEqual({ status: 'denied' });
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
  expect(f.disabled()).toBeGreaterThan(0);
  expect([...f.cookies.keys()]).toEqual(['puni_prod_ga', 'claim', 'operator']);
  f.analytics.accept();
  await f.complete();
  f.analytics.reject();
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('dropped');
});

test('shared versioned preferences synchronize acceptance, expiry and cross-tab withdrawal', async () => {
  const site = fixture();
  site.setLocation('https://dev.puni.dev/');
  site.analytics.accept();
  const app = fixture();
  app.setPreference(site.preference());
  app.analytics.sync();
  expect(app.analytics.getState()).toEqual({ status: 'loading' });
  await app.complete();
  site.analytics.reject();
  app.setPreference(site.preference());
  app.analytics.sync();
  expect(app.analytics.getState()).toEqual({ status: 'denied' });
  app.analytics.accept();
  await app.complete();
  app.advance();
  app.analytics.sync();
  expect(app.analytics.getState()).toEqual({ status: 'cookieless' });
  for (const invalid of [
    '{',
    '{}',
    'v0.accepted',
    JSON.stringify({ version: 99, accepted: true, expires: 9999999999999 }),
  ]) {
    app.setPreference(invalid);
    app.analytics.sync();
    expect(app.analytics.getState()).toEqual({ status: 'cookieless' });
  }
});

test('optional loading/transport/storage failures are visible and retries are bounded', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete('unavailable');
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'loader' });
  f.analytics.sync();
  expect(f.initializations).toHaveLength(1);
  f.analytics.accept();
  await f.complete('unavailable');
  f.analytics.accept();
  expect(f.initializations).toHaveLength(2);
  const storage = fixture();
  storage.ports.writePreference = () => ({ status: 'unavailable' });
  storage.analytics.accept();
  expect(storage.analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(storage.initializations).toHaveLength(1);
  const transport = fixture();
  transport.analytics.accept();
  await transport.complete();
  transport.ports.vendor.send = () => 'unavailable';
  expect(transport.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe(
    'unavailable',
  );
  expect(transport.analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
});

test('programmer errors throw even while denied, and transport programming errors are not outages', async () => {
  const f = fixture();
  expect(() =>
    f.analytics.dispatch({
      name: 'funnel_failure',
      category: 'network',
      email: 'secret@example.test',
    } as never),
  ).toThrow();
  expect(() =>
    f.analytics.dispatch({ name: 'generate_lead', route: 'manual', funnel_version: '1' } as never),
  ).toThrow('dispatchLead');
  f.analytics.accept();
  await f.complete();
  f.ports.vendor.send = () => {
    throw new TypeError('bug');
  };
  expect(() => f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toThrow(
    'bug',
  );
});

test('lead receipts stay in consented local markers and mark only successful vendor enqueue', async () => {
  const f = fixture();
  const lead = { name: 'generate_lead', route: 'manual', funnel_version: '1' } as const;
  expect(f.analytics.dispatchLead('receipt-secret', lead)).toBe('sent');
  expect(f.markers.size).toBe(0);
  f.analytics.accept();
  await f.complete();
  expect(f.sent.map((event) => event.name)).toEqual(['page_view', 'generate_lead']);
  expect(f.analytics.dispatchLead('receipt-secret', lead)).toBe('duplicate');
  expect(f.analytics.dispatchLead('consented-receipt', lead)).toBe('sent');
  expect(f.analytics.dispatchLead('receipt-secret', lead)).toBe('duplicate');
  expect(JSON.stringify(f.sent)).not.toContain('receipt-secret');
  const again = createAnalytics(dev, f.ports);
  await f.complete();
  expect(again.dispatchLead('consented-receipt', lead)).toBe('duplicate');
  f.ports.readMarker = () => ({ status: 'unavailable' });
  expect(again.dispatchLead('another-receipt', lead)).toBe('unavailable');
  f.analytics.reject();
  expect(f.markers.size).toBe(0);
});

test('configuration isolates environments and refuses wrong hosts, IDs, cookie domains and prefixes', () => {
  expect(configureAnalytics({}, 'http://localhost:4201').enabled).toBe(false);
  for (const changed of [
    { measurementId: 'G-OTHER12345' },
    { cookieDomain: 'dev.puni.dev' },
    { cookiePrefix: 'puni_prod' },
    { preferenceName: 'puni_prod_consent_v1' },
  ])
    expect(() => configureAnalytics({ ...dev, ...changed }, href)).toThrow();
  expect(() => configureAnalytics(dev, 'https://app.puni.dev/')).toThrow();
  expect(() => configureAnalytics(dev, 'http://localhost:4201/')).toThrow();
  expect(() =>
    configureAnalytics({ ...dev, environment: 'production' }, 'https://puni.dev/'),
  ).toThrow();
  const production = configureAnalytics(
    { enabled: true, environment: 'production', measurementId: 'G-TESTPROD12' },
    'https://puni.dev/',
  );
  const development = configureAnalytics(dev, href);
  expect(production.cookieDomain).toBe(development.cookieDomain);
  expect(production.cookiePrefix).not.toBe(development.cookiePrefix);
  expect(production.preferenceName).not.toBe(development.preferenceName);
});

test('page/campaign mapping permits only exact registered triples and excludes private/unknown routes', () => {
  const config = configureAnalytics(dev, href);
  const campaigns = [{ source: 'fixture', medium: 'test', campaign: 'reserved-test' }];
  const mapped = resolvePage(
    config,
    'https://dev.puni.dev/?utm_source=fixture&utm_medium=test&utm_campaign=reserved-test&email=secret',
    'javascript:secret',
    campaigns,
  );
  expect(mapped).toMatchObject({
    campaign_source: 'fixture',
    campaign_medium: 'test',
    campaign_name: 'reserved-test',
    page_referrer: '',
  });
  expect(
    resolvePage(
      config,
      'https://dev.puni.dev/?utm_source=fixture&utm_medium=test&utm_campaign=secret@example.test',
      '',
      campaigns,
    )?.campaign_name,
  ).toBe('');
  expect(resolvePage(config, 'https://dev.puni.dev/unknown-secret', '', campaigns)).toBeNull();
  expect(resolvePage(config, 'https://dev.app.puni.dev/operator/inbox', '', campaigns)).toBeNull();
  expect(() => resolvePage(config, 'https://evil.example/', '')).toThrow();
});

test('session marker corruption is a programmer/state error and failed marker writes cannot duplicate within a page', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  const lead = { name: 'generate_lead', route: 'chat', funnel_version: '1' } as const;
  f.markers.set('puni_dev:lead:corrupt', 'unexpected');
  expect(() => f.analytics.dispatchLead('corrupt', lead)).toThrow('marker');
  f.ports.writeMarker = () => ({ status: 'unavailable' });
  expect(f.analytics.dispatchLead('confirmed', lead)).toBe('unavailable');
  f.analytics.accept();
  await f.complete();
  expect(f.analytics.dispatchLead('confirmed', lead)).toBe('duplicate');
  expect(f.sent.filter((event) => event.name === 'generate_lead')).toHaveLength(1);
});

test('the actual dispatch sink never receives extra sentinel content', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  try {
    f.analytics.dispatch({
      name: 'funnel_failure',
      category: 'network',
      email: 'boundary-sentinel@example.test',
    } as never);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }
  expect(JSON.stringify(f.sent)).not.toContain('boundary-sentinel@example.test');
});

test('listener notifications, late preference changes and terminal disposal cannot resume collection', async () => {
  const f = fixture();
  const states: string[] = [];
  const unsubscribe = f.analytics.subscribe((state) => states.push(state.status));
  f.analytics.accept();
  await f.complete();
  expect(states).toEqual(['ready']);
  unsubscribe();
  f.analytics.reject();
  expect(states).toEqual(['ready']);
  f.analytics.accept();
  f.setPreference(null);
  await f.complete();
  expect(f.analytics.getState()).toEqual({ status: 'cookieless' });
  f.analytics.dispose();
  f.analytics.accept();
  f.analytics.sync();
  expect(f.analytics.getState()).toEqual({ status: 'disabled' });
});

test('a superseded loader cannot ready a newly accepted generation', async () => {
  const f = fixture();
  const completions: ((value: 'ready') => void)[] = [];
  f.ports.vendor.load = () =>
    new Promise((resolve) => {
      completions.push(resolve);
    });
  f.analytics.reject();
  f.analytics.accept();
  const beforeCompletion = f.sent.length;
  await f.complete();
  expect(f.analytics.getState()).toEqual({ status: 'loading' });
  expect(f.sent).toHaveLength(beforeCompletion);
  completions[0]('ready');
  await Promise.resolve();
  expect(f.analytics.getState()).toEqual({ status: 'ready' });
  expect(f.sent).toHaveLength(beforeCompletion);
});

test('current service routes resolve to their own reviewed page identity', () => {
  const config = configureAnalytics(dev, href);
  for (const [path, id, title] of [
    ['/services', 'services', 'PUNI services'],
    ['/services/product-discovery', 'product-discovery', 'PUNI product discovery'],
    ['/services/software-design', 'software-design', 'PUNI software design'],
    ['/services/software-development', 'software-development', 'PUNI software development'],
  ])
    expect(resolvePage(config, `https://dev.puni.dev${path}?private=secret`, '')).toMatchObject({
      page_id: id,
      page_location: `https://dev.puni.dev${path}`,
      page_title: title,
    });
  expect(resolvePage(config, 'https://dev.puni.dev/services/unapproved-slug', '')).toBeNull();
});

test('malformed preference fields never authorize cookies and malformed receipts never become markers', async () => {
  const f = fixture();
  const valid = { version: 1, accepted: true, expires: Date.UTC(2027, 3, 25) };
  for (const invalid of [
    null,
    [],
    { ...valid, version: 2 },
    { ...valid, accepted: 'true' },
    { ...valid, expires: 'future' },
    { ...valid, expires: valid.expires + 0.5 },
    { ...valid, extra: 'ignored' },
  ]) {
    f.setPreference(JSON.stringify(invalid));
    f.analytics.sync();
    expect(f.initializations).toHaveLength(1);
    expect(f.permissions).toEqual(['denied']);
  }
  f.analytics.accept();
  await f.complete();
  const lead = { name: 'generate_lead', route: 'chat', funnel_version: '1' } as const;
  for (const receipt of ['', 'x'.repeat(201), null])
    expect(() => f.analytics.dispatchLead(receipt!, lead)).toThrow(
      'Invalid local lead confirmation',
    );
  expect(() =>
    f.analytics.dispatchLead('receipt', { name: 'funnel_failure', category: 'network' } as never),
  ).toThrow('Invalid local lead confirmation');
  expect(f.markers.size).toBe(0);
});

test('enabled configuration rejects credentials, cleartext and nonstandard ports on approved hosts', () => {
  for (const url of [
    'http://dev.puni.dev/',
    'https://dev.puni.dev:444/',
    'https://user:secret@dev.puni.dev/',
  ])
    expect(() => configureAnalytics(dev, url)).toThrow('Unapproved analytics host');
});

test('page dispatch reports a transport outage instead of claiming a sent navigation', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  f.setLocation('https://dev.app.puni.dev/manual');
  f.ports.vendor.send = () => 'unavailable';
  expect(f.analytics.dispatch({ name: 'page_view', page_id: 'manual' })).toBe('unavailable');
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
});

test('launch service routes resolve canonical site metadata before dispatching bounded page views', async () => {
  const config = configureAnalytics(dev, href);
  for (const [id, title] of [
    ['launch-app-or-website', 'Launch an app or website'],
    ['improve-app', 'Improve an existing app'],
    ['build-something-similar', 'Build something similar'],
    ['ai-assistant', 'Set up a personal AI assistant'],
    ['automate-workflows', 'Automate workflows with AI'],
  ] as const) {
    const location = 'https://dev.puni.dev/services/' + id;
    expect(resolvePage(config, location + '?email=secret@example.test#private', '')).toEqual({
      page_id: id,
      page_location: location,
      page_title: title,
      page_referrer: '',
      campaign_source: '',
      campaign_medium: '',
      campaign_name: '',
    });
    const f = fixture(location + '?email=secret@example.test#private');
    f.analytics.accept();
    await f.complete();
    expect(f.sent).toEqual([
      {
        name: 'page_view',
        parameters: {
          page_id: id,
          page_location: location,
          page_title: title,
          page_referrer: 'https://search.example',
          campaign_source: '',
          campaign_medium: '',
          campaign_name: '',
        },
      },
    ]);
  }
});

test('dispatch rejects a non-enumerable required category before the vendor sink', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  const event = Object.defineProperty(
    { name: 'funnel_failure', category: 'network' } as const,
    'category',
    {
      enumerable: false,
    },
  );
  expect(() => f.analytics.dispatch(event)).toThrow();
  expect(f.sent.map((sent) => sent.name)).toEqual(['page_view']);
});

test('dispatch rejects a changing event name before the vendor sink', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  let reads = 0;
  const changing = {
    get name() {
      return reads++ === 0 ? 'funnel_failure' : 'page_view';
    },
    page_id: 'home',
  };
  expect(() => f.analytics.dispatch(changing as never)).toThrow();
  expect(f.sent.map((sent) => sent.name)).toEqual(['page_view']);
});

test('dispatch rejects hidden symbol content before the vendor sink', async () => {
  const f = fixture();
  f.analytics.accept();
  await f.complete();
  const hidden = Object.defineProperty(
    { name: 'funnel_failure', category: 'network' } as const,
    Symbol('email'),
    {
      value: 'symbol-sentinel@example.test',
    },
  );
  expect(() => f.analytics.dispatch(hidden)).toThrow();
  expect(f.sent.map((sent) => sent.name)).toEqual(['page_view']);
});

test.each([
  ['dev.puni.dev', '/', 'home', 'PUNI'],
  ['dev.puni.dev', '/services', 'services', 'PUNI services'],
  ['dev.puni.dev', '/services/product-discovery', 'product-discovery', 'PUNI product discovery'],
  ['dev.puni.dev', '/services/software-design', 'software-design', 'PUNI software design'],
  [
    'dev.puni.dev',
    '/services/software-development',
    'software-development',
    'PUNI software development',
  ],
  [
    'dev.puni.dev',
    '/services/launch-app-or-website',
    'launch-app-or-website',
    'Launch an app or website',
  ],
  ['dev.puni.dev', '/services/improve-app', 'improve-app', 'Improve an existing app'],
  [
    'dev.puni.dev',
    '/services/build-something-similar',
    'build-something-similar',
    'Build something similar',
  ],
  ['dev.puni.dev', '/services/ai-assistant', 'ai-assistant', 'Set up a personal AI assistant'],
  [
    'dev.puni.dev',
    '/services/automate-workflows',
    'automate-workflows',
    'Automate workflows with AI',
  ],
  ['dev.puni.dev', '/blog', 'blog', 'PUNI journal'],
  ['dev.puni.dev', '/privacy', 'privacy', 'PUNI privacy'],
  [
    'dev.puni.dev',
    '/blog/a-clearer-first-step-for-software-requests',
    'a-clearer-first-step-for-software-requests',
    'A clearer first step for software requests',
  ],
  ['dev.app.puni.dev', '/', 'build', 'Build with PUNI'],
  ['dev.app.puni.dev', '/manual', 'manual', 'Request PUNI help'],
] as const)(
  'canonical and directory routes retain fixed metadata: %s%s',
  async (host, path, id, title) => {
    const config = configureAnalytics(dev, href);
    const canonical = `https://${host}${path}`;
    const expected = {
      page_id: id,
      page_location: canonical,
      page_title: title,
      page_referrer: 'https://search.example',
      campaign_source: '',
      campaign_medium: '',
      campaign_name: '',
    };
    for (const alias of path === '/' ? [canonical] : [canonical, `${canonical}/`]) {
      const location = `${alias}?email=route-secret@example.test&utm_campaign=route-secret#route-secret`;
      expect(
        resolvePage(config, location, 'https://search.example/private?email=route-secret#secret'),
      ).toEqual(expected);
      const f = fixture(location);
      f.analytics.accept();
      await f.complete();
      expect(f.initializations).toEqual([expected]);
      expect(f.sent).toEqual([{ name: 'page_view', parameters: expected }]);
      f.setLocation(canonical);
      f.analytics.navigate();
      f.setLocation(alias);
      f.analytics.navigate();
      expect(f.sent).toHaveLength(1);
    }
  },
);

test.each([
  ['dev.puni.dev', '//'],
  ['dev.puni.dev', '///'],
  ['dev.app.puni.dev', '//'],
  ['dev.puni.dev', '/services//'],
  ['dev.puni.dev', '/services///'],
  ['dev.puni.dev', '/services%2f'],
  ['dev.puni.dev', '/services%2F'],
  ['dev.puni.dev', '/services/%2f'],
  ['dev.puni.dev', '/%2F'],
  ['dev.puni.dev', '/services//software-design/'],
  ['dev.puni.dev', '/services/unapproved-slug/'],
  ['dev.puni.dev', '/unknown-secret/'],
  ['dev.puni.dev', '/operator/'],
  ['dev.app.puni.dev', '/operator/'],
  ['dev.app.puni.dev', '/operator/inbox/'],
  ['dev.app.puni.dev', '/manual//'],
  ['dev.app.puni.dev', '/manual%2f'],
  ['dev.app.puni.dev', '/manual/%2F'],
  ['dev.app.puni.dev', '/privacy/'],
  ['dev.puni.dev', '/manual/'],
] as const)('unsupported directory routes remain unmeasured: %s%s', (host, path) => {
  const location = `https://${host}${path}?email=route-secret@example.test#private`;
  expect(resolvePage(configureAnalytics(dev, href), location, '')).toBeNull();
  const f = fixture(location);
  f.analytics.accept();
  expect(f.analytics.getState()).toEqual({ status: 'disabled' });
  expect(f.initializations).toEqual([]);
  expect(f.sent).toEqual([]);
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('dropped');
});

test('directory aliases do not relax approved host validation', () => {
  const config = configureAnalytics(dev, href);
  for (const location of [
    'https://evil.example/services/',
    'https://puni.dev/services/',
    'http://dev.puni.dev/services/',
    'https://dev.puni.dev:444/services/',
    'https://user:secret@dev.puni.dev/services/',
  ])
    expect(() => resolvePage(config, location, '')).toThrow('Unapproved analytics host');
});

test('valid legacy rejection stays fully blocked while absent expired and malformed choices collect cookieless', async () => {
  const validRejection = JSON.stringify({
    version: 1,
    accepted: false,
    expires: Date.UTC(2027, 3, 25),
  });
  const rejected = fixture(href, validRejection);
  expect(rejected.initializations).toEqual([]);
  expect(rejected.analytics.getState()).toEqual({ status: 'denied' });
  expect(rejected.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe(
    'dropped',
  );
  for (const choice of [null, '{', JSON.stringify({ version: 1, accepted: true, expires: 1 })]) {
    const fresh = fixture(href, choice);
    await fresh.complete();
    expect(fresh.analytics.getState()).toEqual({ status: 'cookieless' });
    expect(fresh.sent.map((event) => event.name)).toEqual(['page_view']);
    expect(fresh.markers.size).toBe(0);
  }
});

test('cookieless leads use memory only and never touch unavailable persistent markers', async () => {
  const f = fixture();
  f.ports.readMarker = () => {
    throw new Error('No pre-permission marker reads');
  };
  f.ports.writeMarker = () => {
    throw new Error('No pre-permission marker writes');
  };
  const lead = { name: 'generate_lead', route: 'manual', funnel_version: '1' } as const;
  expect(f.analytics.dispatchLead('private-receipt', lead)).toBe('sent');
  expect(f.analytics.dispatchLead('private-receipt', lead)).toBe('duplicate');
  await f.complete();
  f.analytics.accept();
  expect(f.analytics.dispatchLead('private-receipt', lead)).toBe('duplicate');
  expect(f.sent.filter((event) => event.name === 'generate_lead')).toHaveLength(1);
  expect(JSON.stringify(f.sent)).not.toContain('private-receipt');
});

test('expiry downgrades the existing tag and clears configured cookies without replay', async () => {
  const f = fixture(
    href,
    JSON.stringify({ version: 1, accepted: true, expires: Date.UTC(2027, 3, 25) }),
  );
  await f.complete();
  expect(f.permissions).toEqual(['granted']);
  f.advance();
  f.analytics.sync();
  expect(f.analytics.getState()).toEqual({ status: 'cookieless' });
  expect(f.permissions).toEqual(['granted', 'denied']);
  expect([...f.cookies.keys()]).toEqual(['puni_prod_ga', 'claim', 'operator']);
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
});

test('consent transport refusal is visible and never implicitly retries or sends future events', async () => {
  const f = fixture();
  await f.complete();
  f.ports.vendor.updateConsent = () => 'unavailable';
  f.analytics.accept();
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'transport' });
  expect(f.initializations).toHaveLength(1);
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('unavailable');
});

test('retry refuses unreadable preference state even after a successful preference write', async () => {
  const f = fixture();
  await f.complete('unavailable');
  f.ports.readPreference = () => ({ status: 'unavailable' });
  f.analytics.accept();
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(f.initializations).toHaveLength(1);
});

test('cookie-permission downgrade reports cleanup failure and stops later events', async () => {
  const f = fixture(
    href,
    JSON.stringify({ version: 1, accepted: true, expires: Date.UTC(2027, 3, 25) }),
  );
  await f.complete();
  f.ports.clearAnalytics = () => ({ status: 'unavailable' });
  f.advance();
  f.analytics.sync();
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('unavailable');
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
});

test('choice observation follows persisted choices independently of loading', async () => {
  const f = fixture();
  expect(f.analytics.getChoice()).toBe('unset');
  const choices: string[] = [];
  const unsubscribe = f.analytics.subscribeChoice((choice) => choices.push(choice));
  f.analytics.accept();
  expect(f.analytics.getState().status).toBe('loading');
  expect(f.analytics.getChoice()).toBe('accepted');
  expect(choices).toEqual(['accepted']);
  await f.complete('unavailable');
  expect(f.analytics.getChoice()).toBe('accepted');
  f.analytics.reject();
  expect(f.analytics.getChoice()).toBe('rejected');
  unsubscribe();
  f.setPreference(null);
  f.analytics.sync();
  expect(choices).toEqual(['accepted', 'rejected']);
});

for (const preference of [
  null,
  'malformed',
  JSON.stringify({ version: 1, accepted: true, expires: 1 }),
])
  test(`invalid or missing choice remains unset: ${String(preference)}`, () => {
    const f = fixture(href, preference);
    expect(f.analytics.getChoice()).toBe('unset');
  });

test('choice observation syncs expiry, navigation, read failure and write recovery', () => {
  const f = fixture();
  f.analytics.accept();
  f.advance();
  f.analytics.navigate();
  expect(f.analytics.getChoice()).toBe('unset');
  f.setPreference(JSON.stringify({ version: 1, accepted: false, expires: Date.UTC(2030, 0) }));
  f.analytics.sync();
  expect(f.analytics.getChoice()).toBe('rejected');
  f.ports.readPreference = () => ({ status: 'unavailable' });
  f.analytics.sync();
  expect(f.analytics.getChoice()).toBe('unavailable');
  f.ports.writePreference = () => ({ status: 'unavailable' });
  f.analytics.reject();
  expect(f.analytics.getChoice()).toBe('unavailable');
  f.ports.writePreference = () => ({ status: 'ok' });
  f.analytics.reject();
  expect(f.analytics.getChoice()).toBe('rejected');
});

test('regional defaults update permission during loading without inventing a saved choice or replay', async () => {
  const f = fixture();
  const regions: string[] = [];
  f.analytics.subscribeRegion((region) => regions.push(region));
  expect(f.analytics.getRegion()).toBe('unknown');
  f.analytics.setRegion('consent-required');
  expect(f.permissions).toEqual(['denied']);
  f.analytics.setRegion('elsewhere');
  expect(f.analytics.getRegion()).toBe('elsewhere');
  expect(f.analytics.getChoice()).toBe('unset');
  expect(f.preference()).toBeNull();
  expect(f.permissions).toEqual(['denied', 'granted']);
  expect(f.analytics.getState().status).toBe('loading');
  expect(regions).toEqual(['consent-required', 'elsewhere']);
  await f.complete();
  expect(f.analytics.getState().status).toBe('ready');
  f.analytics.setRegion('unknown');
  expect(f.permissions).toEqual(['denied', 'granted', 'denied']);
  expect(f.analytics.getState().status).toBe('cookieless');
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
  expect([...f.cookies.keys()]).toEqual(['puni_prod_ga', 'claim', 'operator']);
});

test('regional defaults never override explicit acceptance rejection or unreadable preference', () => {
  for (const accepted of [true, false]) {
    const f = fixture(href, JSON.stringify({ version: 1, accepted, expires: Date.UTC(2030, 0) }));
    f.analytics.setRegion(accepted ? 'consent-required' : 'elsewhere');
    expect(f.analytics.getChoice()).toBe(accepted ? 'accepted' : 'rejected');
    expect(f.permissions).toEqual(accepted ? ['granted'] : []);
    expect(f.analytics.getState().status).toBe(accepted ? 'loading' : 'denied');
  }
  const f = fixture();
  f.ports.readPreference = () => ({ status: 'unavailable' });
  f.analytics.setRegion('elsewhere');
  expect(f.analytics.getChoice()).toBe('unavailable');
  expect(f.permissions).toEqual(['denied']);
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
});

test('a failed preference write cannot revive old acceptance through a regional answer or sync', async () => {
  const f = fixture(
    href,
    JSON.stringify({ version: 1, accepted: true, expires: Date.UTC(2030, 0) }),
  );
  await f.complete();
  f.ports.writePreference = () => ({ status: 'unavailable' });
  f.analytics.reject();
  f.analytics.setRegion('elsewhere');
  f.analytics.navigate();
  expect(f.analytics.getChoice()).toBe('unavailable');
  expect(f.analytics.getState()).toEqual({ status: 'unavailable', reason: 'storage' });
  expect(f.permissions).toEqual(['granted']);
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('unavailable');
});

test('regional updates after disposal cannot notify or grant', async () => {
  const f = fixture();
  const regions: string[] = [];
  f.analytics.subscribeRegion((region) => regions.push(region));
  f.analytics.dispose();
  f.analytics.setRegion('elsewhere');
  await f.complete();
  expect(f.analytics.getRegion()).toBe('unknown');
  expect(regions).toEqual([]);
  expect(f.permissions).toEqual(['denied']);
  expect(f.analytics.getState().status).toBe('disabled');
});
