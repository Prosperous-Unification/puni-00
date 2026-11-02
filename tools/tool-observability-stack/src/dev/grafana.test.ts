import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type } from 'arktype';
import { afterEach, expect, it } from 'bun:test';

import {
  applyGrafana,
  captureGrafana,
  createGrafanaClient,
  parseGrafanaJournal,
  renderDevGrafana,
  rollbackGrafana,
} from './grafana';
import { runGrafanaCli } from './grafana-cli';

const directories: string[] = [];
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
function createGrafanaFixture() {
  const datasources: Record<string, Record<string, unknown>> = {
    'sdlc-metrics': {
      uid: 'sdlc-metrics',
      name: 'VictoriaMetrics',
      type: 'prometheus',
      url: 'http://victoriametrics:8428',
      isDefault: true,
    },
    'sdlc-logs': { uid: 'sdlc-logs', name: 'VictoriaLogs', isDefault: false },
    'sdlc-traces': { uid: 'sdlc-traces', name: 'VictoriaTraces', isDefault: false },
  };
  const dashboards: Record<string, Record<string, unknown>> = {
    existing: { uid: 'existing', title: 'Existing', version: 3 },
  };
  const writes: string[] = [];
  let failDashboard = false;
  let retainDeleted = false;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (request.headers.get('authorization') !== 'Bearer test-only')
        return new Response('', { status: 401 });
      const path = new URL(request.url).pathname;
      const method = request.method;
      if (method !== 'GET') writes.push(`${method} ${path}`);
      if (path === '/api/datasources' && method === 'GET')
        return Response.json(Object.values(datasources));
      if (path === '/api/search')
        return Response.json(Object.values(dashboards).map(({ uid, title }) => ({ uid, title })));
      if (path === '/api/datasources' && method === 'POST') {
        const body = type({ uid: 'string' }).assert(await request.json());
        if (Object.hasOwn(datasources, body.uid)) return new Response('', { status: 409 });
        datasources[body.uid] = { ...body, id: 4, orgId: 1 };
        return Response.json({ id: 4 });
      }
      if (path === '/api/dashboards/db' && method === 'POST') {
        if (failDashboard) return new Response('', { status: 500 });
        const body = type({ overwrite: 'boolean', dashboard: { uid: 'string' } }).assert(
          await request.json(),
        );
        if (body.overwrite || Object.hasOwn(dashboards, body.dashboard.uid))
          return new Response('', { status: 412 });
        dashboards[body.dashboard.uid] = { ...body.dashboard, id: 8, version: 1 };
        return Response.json({ status: 'success' });
      }
      const sourceUid = /^\/api\/datasources\/uid\/([^/]+)$/.exec(path)?.[1];
      if (sourceUid) {
        if (!Object.hasOwn(datasources, sourceUid)) return new Response('', { status: 404 });
        if (method === 'DELETE') {
          if (retainDeleted) return Response.json({ message: 'deleted' });
          Reflect.deleteProperty(datasources, sourceUid);
          return Response.json({ message: 'deleted' });
        }
        return Response.json(datasources[sourceUid]);
      }
      const dashboardUid = /^\/api\/dashboards\/uid\/([^/]+)$/.exec(path)?.[1];
      if (dashboardUid) {
        if (!Object.hasOwn(dashboards, dashboardUid)) return new Response('', { status: 404 });
        if (method === 'DELETE') {
          if (retainDeleted) return Response.json({ message: 'deleted' });
          Reflect.deleteProperty(dashboards, dashboardUid);
          return Response.json({ message: 'deleted' });
        }
        return Response.json({ dashboard: dashboards[dashboardUid], meta: { provisioned: false } });
      }
      return new Response('', { status: 404 });
    },
  });
  servers.push(server);
  return {
    datasources,
    dashboards,
    writes,
    fail: () => {
      failDashboard = true;
    },
    retain: () => {
      retainDeleted = true;
    },
    endpoint: server.url.origin,
    api: createGrafanaClient(server.url.origin, 'Bearer test-only'),
  };
}
async function expectRefusal(promise: Promise<unknown>, pattern: RegExp) {
  const failure = await promise.then(
    () => 'accepted',
    (error: unknown) => {
      if (!(error instanceof Error)) throw error;
      return error.message;
    },
  );
  expect(failure).toMatch(pattern);
}

it('adds durable owned objects and removes only those objects', async () => {
  const host = createGrafanaFixture();
  let journal = await captureGrafana(host.api);
  const phases: string[] = [];
  journal = await applyGrafana(host.api, journal, (saved) => {
    phases.push(saved.phase);
    return Promise.resolve();
  });
  expect(phases).toEqual(['datasource-created', 'applied']);
  expect(host.datasources['puni-dev-prometheus']['isDefault']).toBe(false);
  expect(host.datasources['puni-dev-prometheus']['url']).toBe('http://puni-dev-prometheus:9090');
  expect(host.dashboards['puni-dev-observability']['title']).toBe('Puni dev observation');
  await rollbackGrafana(host.api, journal, () => Promise.resolve());
  expect(Object.keys(host.datasources).sort()).toEqual([
    'sdlc-logs',
    'sdlc-metrics',
    'sdlc-traces',
  ]);
  expect(Object.keys(host.dashboards)).toEqual(['existing']);
  expect(host.datasources['sdlc-metrics']['isDefault']).toBe(true);
});
it.each(['datasource', 'dashboard'])('refuses preexisting owned %s UID', async (kind) => {
  const host = createGrafanaFixture();
  if (kind === 'datasource')
    host.datasources['puni-dev-prometheus'] = { uid: 'puni-dev-prometheus', isDefault: false };
  else
    host.dashboards['puni-dev-observability'] = {
      uid: 'puni-dev-observability',
      title: 'Collision',
    };
  await expectRefusal(captureGrafana(host.api), /collision/);
  expect(host.writes).toEqual([]);
});
it('refuses changed baseline before applying', async () => {
  const host = createGrafanaFixture();
  const journal = await captureGrafana(host.api);
  host.datasources['sdlc-metrics']['name'] = 'Changed';
  await expectRefusal(
    applyGrafana(host.api, journal, () => Promise.resolve()),
    /baseline/,
  );
  expect(host.writes).toEqual([]);
});
it.each(['datasource', 'dashboard'])('refuses deletion of edited owned %s', async (kind) => {
  const host = createGrafanaFixture();
  const journal = await applyGrafana(host.api, await captureGrafana(host.api), () =>
    Promise.resolve(),
  );
  if (kind === 'datasource') host.datasources['puni-dev-prometheus']['url'] = 'http://other';
  else host.dashboards['puni-dev-observability']['version'] = 2;
  const count = host.writes.length;
  await expectRefusal(
    rollbackGrafana(host.api, journal, () => Promise.resolve()),
    /owned/,
  );
  expect(host.writes.length).toBe(count);
});
it('retains recoverable datasource receipt if dashboard creation fails', async () => {
  const host = createGrafanaFixture();
  let saved = await captureGrafana(host.api);
  host.fail();
  await expectRefusal(
    applyGrafana(host.api, saved, (journal) => {
      saved = journal;
      return Promise.resolve();
    }),
    /500/,
  );
  expect(saved.phase).toBe('datasource-created');
  await rollbackGrafana(host.api, saved, () => Promise.resolve());
  expect(host.datasources['puni-dev-prometheus']).toBeUndefined();
  expect(host.dashboards['existing']['version']).toBe(3);
});
it('refuses changed unrelated baseline on rollback before deletion', async () => {
  const host = createGrafanaFixture();
  const journal = await applyGrafana(host.api, await captureGrafana(host.api), () =>
    Promise.resolve(),
  );
  host.dashboards['existing']['title'] = 'changed';
  const count = host.writes.length;
  await expectRefusal(
    rollbackGrafana(host.api, journal, () => Promise.resolve()),
    /baseline/,
  );
  expect(host.writes.length).toBe(count);
});
it('blocks apply after a receipt was already created', async () => {
  const host = createGrafanaFixture();
  const journal = await applyGrafana(host.api, await captureGrafana(host.api), () =>
    Promise.resolve(),
  );
  Reflect.deleteProperty(host.datasources, 'puni-dev-prometheus');
  Reflect.deleteProperty(host.dashboards, 'puni-dev-observability');
  await expectRefusal(
    applyGrafana(host.api, journal, () => Promise.resolve()),
    /captured/,
  );
});
it.each([
  'http://example.com',
  'https://127.0.0.1:3000',
  'http://127.0.0.1:3000#fragment',
  'http://:pass@127.0.0.1:3000',
  'http://127.0.0.1:3000/path',
  'http://user:pass@127.0.0.1:3000',
  'http://user@127.0.0.1:3000',
  'http://127.0.0.1:3000?query=1',
])('refuses nonprivate API boundary %s', (endpoint) => {
  expect(() => createGrafanaClient(endpoint, 'Bearer test-only')).toThrow(/loopback/);
});
it('refuses missing credential', () => {
  expect(() => createGrafanaClient('http://127.0.0.1:3000', '')).toThrow(/credential/);
});
it('renders explicit missing values and ambiguity without selecting a last revision', () => {
  const { dashboard } = renderDevGrafana();
  expect(
    dashboard.panels.every((panel) => panel.fieldConfig.defaults.noValue === 'Missing / Unknown'),
  ).toBe(true);
  expect(
    dashboard.panels.find((panel) => panel.title === 'Active revision count')?.targets[0].expr,
  ).toBe('count(puni_dev_revision_info{environment="dev",service="be-01"} == 1)');
  expect(
    dashboard.panels.find((panel) => panel.title === 'Observed revision (only when unique)')
      ?.targets[0].expr,
  ).toContain('and on() (count(');
});

it('refuses malformed journal', () => {
  expect(() => parseGrafanaJournal({ schema: 1 })).toThrow();
});
it('refuses captured journal rollback without ownership', async () => {
  const host = createGrafanaFixture();
  const journal = await captureGrafana(host.api);
  await expectRefusal(
    rollbackGrafana(host.api, journal, () => Promise.resolve()),
    /receipts/,
  );
  expect(host.writes).toEqual([]);
});
it('refuses changed default at capture', async () => {
  const host = createGrafanaFixture();
  host.datasources['sdlc-metrics']['isDefault'] = false;
  await expectRefusal(captureGrafana(host.api), /default/);
});
it('refuses a full discovery page instead of assuming completeness', async () => {
  const host = createGrafanaFixture();
  for (let index = 0; index < 999; index++)
    host.dashboards[String(index)] = { uid: String(index), title: 'Fixture' };
  await expectRefusal(captureGrafana(host.api), /limit/);
});
it('refuses invalid authentication rather than treating it as absence', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('', { status: 401 }),
  });
  servers.push(server);
  await expectRefusal(
    captureGrafana(createGrafanaClient(server.url.origin, 'Bearer wrong')),
    /401/,
  );
});
it('refuses provisioned owned dashboard', async () => {
  const host = createGrafanaFixture();
  const journal = await applyGrafana(host.api, await captureGrafana(host.api), () =>
    Promise.resolve(),
  );
  const provisioned: Parameters<typeof rollbackGrafana>[0] = async (path, method, body) => {
    const response = await host.api(path, method, body);
    if (path === '/api/dashboards/uid/puni-dev-observability')
      return { ...(response as object), meta: { provisioned: true } };
    return response;
  };
  const count = host.writes.length;
  await expectRefusal(
    rollbackGrafana(provisioned, journal, () => Promise.resolve()),
    /provisioned/,
  );
  expect(host.writes.length).toBe(count);
});
it('refuses credential forwarding outside API paths', async () => {
  const host = createGrafanaFixture();
  await expectRefusal(host.api('http://example.com'), /path/);
});

async function createCliFixture() {
  const host = createGrafanaFixture();
  const directory = await mkdtemp(join(tmpdir(), 'grafana-journal-'));
  directories.push(directory);
  return {
    ...host,
    path: join(directory, 'journal.json'),
    environment: { GRAFANA_URL: host.endpoint, GRAFANA_AUTHORIZATION: 'Bearer test-only' },
  };
}
it('persists private durable receipts through CLI apply and rollback', async () => {
  const host = await createCliFixture();
  await runGrafanaCli(['capture', host.path], host.environment);
  expect((await stat(host.path)).mode & 0o777).toBe(0o600);
  await runGrafanaCli(['apply', host.path], host.environment);
  expect(parseGrafanaJournal(JSON.parse(await readFile(host.path, 'utf8'))).phase).toBe('applied');
  await runGrafanaCli(['rollback', host.path], host.environment);
  expect(parseGrafanaJournal(JSON.parse(await readFile(host.path, 'utf8'))).phase).toBe('removed');
  expect(host.datasources['puni-dev-prometheus']).toBeUndefined();
});
it('refuses existing capture without overwriting receipt', async () => {
  const host = await createCliFixture();
  await writeFile(host.path, 'original');
  await expectRefusal(runGrafanaCli(['capture', host.path], host.environment), /EEXIST/);
  expect(await readFile(host.path, 'utf8')).toBe('original');
  expect(host.writes).toEqual([]);
});
it('refuses occupied lock without API mutation', async () => {
  const host = await createCliFixture();
  await writeFile(`${host.path}.lock`, 'other-process');
  await expectRefusal(runGrafanaCli(['capture', host.path], host.environment), /EEXIST/);
  expect(await readFile(`${host.path}.lock`, 'utf8')).toBe('other-process');
  expect(host.writes).toEqual([]);
});
it('refuses absent journal before applying', async () => {
  const host = await createCliFixture();
  await expectRefusal(runGrafanaCli(['apply', host.path], host.environment), /ENOENT/);
  expect(host.writes).toEqual([]);
});
it('refuses unreadable journal independently of privilege', async () => {
  const host = await createCliFixture();
  await runGrafanaCli(['capture', host.path], host.environment);
  await chmod(host.path, 0);
  await expectRefusal(runGrafanaCli(['apply', host.path], host.environment), /unreadable/);
  expect(host.writes).toEqual([]);
});
it('refuses malformed journal before applying', async () => {
  const host = await createCliFixture();
  await writeFile(host.path, '{broken');
  await expectRefusal(runGrafanaCli(['apply', host.path], host.environment), /JSON/);
  expect(host.writes).toEqual([]);
});
it('refuses missing environment configuration', async () => {
  await expectRefusal(runGrafanaCli(['capture', '/tmp/unused-journal'], {}), /required/);
});
it('refuses invalid operation before loading configuration', async () => {
  await expectRefusal(runGrafanaCli(['invalid', '/tmp/unused-journal'], {}), /usage/);
});
it('refuses rollback when an unrecorded owned dashboard exists after partial apply', async () => {
  const host = createGrafanaFixture();
  let saved = await captureGrafana(host.api);
  host.fail();
  await expectRefusal(
    applyGrafana(host.api, saved, (journal) => {
      saved = journal;
      return Promise.resolve();
    }),
    /500/,
  );
  host.dashboards['puni-dev-observability'] = {
    uid: 'puni-dev-observability',
    title: 'Unrecorded',
    version: 1,
  };
  const count = host.writes.length;
  await expectRefusal(
    rollbackGrafana(host.api, saved, () => Promise.resolve()),
    /unrecorded/,
  );
  expect(host.writes.length).toBe(count);
});
it('refuses missing owned datasource instead of adopting an absence', async () => {
  const host = createGrafanaFixture();
  const journal = await applyGrafana(host.api, await captureGrafana(host.api), () =>
    Promise.resolve(),
  );
  Reflect.deleteProperty(host.datasources, 'puni-dev-prometheus');
  const count = host.writes.length;
  await expectRefusal(
    rollbackGrafana(host.api, journal, () => Promise.resolve()),
    /object/,
  );
  expect(host.writes.length).toBe(count);
});
it('refuses undefined external inventory fields instead of hashing a fabricated value', async () => {
  const host = createGrafanaFixture();
  const invalid: Parameters<typeof captureGrafana>[0] = async (path, method, body) => {
    const response = await host.api(path, method, body);
    if (path === '/api/datasources' && Array.isArray(response))
      type({ '[string]': 'unknown' }).array().assert(response)[0]['extra'] = undefined;
    return response;
  };
  await expectRefusal(captureGrafana(invalid), /undefined/);
});
it('bounds successful API response bytes independently of content length', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ text: 'x'.repeat(2 * 1024 * 1024) }),
  });
  servers.push(server);
  await expectRefusal(
    createGrafanaClient(server.url.origin, 'Bearer test-only')('/api/datasources'),
    /response-size/,
  );
});
it('bounds a stalled API response within five seconds', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch() {
      await Bun.sleep(6000);
      return Response.json({});
    },
  });
  servers.push(server);
  await expectRefusal(
    createGrafanaClient(server.url.origin, 'Bearer test-only')('/api/datasources'),
    /timed out|abort/i,
  );
}, 8000);

it.each(['sdlc-logs', 'sdlc-traces'])('refuses missing existing datasource %s', async (uid) => {
  const host = createGrafanaFixture();
  Reflect.deleteProperty(host.datasources, uid);
  await expectRefusal(captureGrafana(host.api), /UIDs/);
});
it('refuses multiple default datasources at capture', async () => {
  const host = createGrafanaFixture();
  host.datasources['sdlc-logs']['isDefault'] = true;
  await expectRefusal(captureGrafana(host.api), /default/);
});

it('refuses successful delete acknowledgement while owned dashboard remains', async () => {
  const host = createGrafanaFixture();
  const journal = await applyGrafana(host.api, await captureGrafana(host.api), () =>
    Promise.resolve(),
  );
  host.retain();
  await expectRefusal(
    rollbackGrafana(host.api, journal, () => Promise.resolve()),
    /still exists/,
  );
  expect(host.datasources['puni-dev-prometheus']).toBeDefined();
  expect(host.writes.filter((call) => call.startsWith('DELETE'))).toEqual([
    'DELETE /api/dashboards/uid/puni-dev-observability',
  ]);
});
it('refuses successful delete acknowledgement while owned datasource remains', async () => {
  const host = createGrafanaFixture();
  let journal = await captureGrafana(host.api);
  host.fail();
  await expectRefusal(
    applyGrafana(host.api, journal, (saved) => {
      journal = saved;
      return Promise.resolve();
    }),
    /500/,
  );
  host.retain();
  await expectRefusal(
    rollbackGrafana(host.api, journal, () => Promise.resolve()),
    /still exists/,
  );
});
it('rechecks UID absence after capture before writing', async () => {
  const host = createGrafanaFixture();
  const journal = await captureGrafana(host.api);
  host.datasources['puni-dev-prometheus'] = {
    uid: 'puni-dev-prometheus',
    isDefault: false,
    name: 'Foreign',
  };
  await expectRefusal(
    applyGrafana(host.api, journal, () => Promise.resolve()),
    /collision/,
  );
  expect(host.writes).toEqual([]);
});

it('refuses invalid rollback phase despite a matching datasource receipt', async () => {
  const host = createGrafanaFixture();
  let journal = await captureGrafana(host.api);
  host.fail();
  await expectRefusal(
    applyGrafana(host.api, journal, (saved) => {
      journal = saved;
      return Promise.resolve();
    }),
    /500/,
  );
  await expectRefusal(
    rollbackGrafana(host.api, { ...journal, phase: 'captured' }, () => Promise.resolve()),
    /receipts/,
  );
  expect(host.writes.filter((call) => call.startsWith('DELETE'))).toEqual([]);
});
