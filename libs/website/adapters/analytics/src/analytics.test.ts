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
function fixture() {
  let preference: string | null = null;
  let location = href;
  let finish: ((loaded: 'ready' | 'unavailable') => void) | undefined;
  const initializations: MeasurementContext[] = [];
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
      load: (context) => {
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

test('basic blocking drops all denied/loading interactions without a backfill queue', async () => {
  const f = fixture();
  expect(f.analytics.getState()).toEqual({ status: 'denied' });
  expect(f.initializations).toHaveLength(0);
  expect(
    f.analytics.dispatch({ name: 'brief_view', route: 'early', starting_choice: 'improve' }),
  ).toBe('dropped');
  f.analytics.accept();
  f.analytics.accept();
  expect(f.initializations).toHaveLength(1);
  expect(f.analytics.dispatch({ name: 'funnel_failure', category: 'network' })).toBe('dropped');
  await f.complete();
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
  expect(
    f.analytics.dispatch({ name: 'brief_view', route: 'early', starting_choice: 'improve' }),
  ).toBe('sent');
  expect(f.sent.map((event) => event.name)).toEqual(['page_view', 'brief_view']);
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
  expect(f.sent).toEqual([]);
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
  expect(app.analytics.getState()).toEqual({ status: 'denied' });
  for (const invalid of [
    '{',
    '{}',
    'v0.accepted',
    JSON.stringify({ version: 99, accepted: true, expires: 9999999999999 }),
  ]) {
    app.setPreference(invalid);
    app.analytics.sync();
    expect(app.analytics.getState()).toEqual({ status: 'denied' });
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
  expect(storage.initializations).toHaveLength(0);
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
  expect(f.analytics.dispatchLead('receipt-secret', lead)).toBe('dropped');
  expect(f.markers.size).toBe(0);
  f.analytics.accept();
  await f.complete();
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
  expect(f.analytics.dispatchLead('receipt-secret', lead)).toBe('sent');
  expect(f.analytics.dispatchLead('receipt-secret', lead)).toBe('duplicate');
  expect(JSON.stringify(f.sent)).not.toContain('receipt-secret');
  const again = createAnalytics(dev, f.ports);
  await f.complete();
  expect(again.dispatchLead('receipt-secret', lead)).toBe('duplicate');
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
  expect(states).toEqual(['loading', 'ready']);
  unsubscribe();
  f.analytics.reject();
  expect(states).toEqual(['loading', 'ready']);
  f.analytics.accept();
  f.setPreference(null);
  await f.complete();
  expect(f.analytics.getState()).toEqual({ status: 'denied' });
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
  f.analytics.accept();
  f.analytics.reject();
  f.analytics.accept();
  completions[0]('ready');
  await Promise.resolve();
  expect(f.analytics.getState()).toEqual({ status: 'loading' });
  expect(f.sent).toEqual([]);
  completions[1]('ready');
  await Promise.resolve();
  expect(f.analytics.getState()).toEqual({ status: 'ready' });
  expect(f.sent.map((event) => event.name)).toEqual(['page_view']);
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

test('malformed preference fields never authorize a load and malformed receipts never become markers', async () => {
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
    expect(f.initializations).toHaveLength(0);
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
