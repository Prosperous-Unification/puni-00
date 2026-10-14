import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { inspectBackendConfig, resolveDatabaseHost } from './backend-config';
import { NETWORK, ROOT } from './docker';

const image = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
const service = {
  container_name: 'be-01-green',
  image,
  environment: { DB_PATH: '/data/wbs.db' },
  networks: { [NETWORK]: { aliases: ['be-01-green'] } },
  volumes: [{ type: 'bind', source: `${ROOT}/data`, target: '/data' }],
};
const resolvePath = (path: string) => Promise.resolve(path);

for (const override of [
  { networks: { [NETWORK]: { aliases: ['be-01-green', 'be-01.internal'] } } },
  { ports: [{ target: 3100, published: '3100' }] },
  { depends_on: { 'be-01-blue': { condition: 'service_started' } } },
  { network_mode: 'host' },
  { container_name: 'be-01-blue' },
  { image: 'unreviewed-image' },
  { env_file: [{ path: '/other.env' }] },
  { links: ['be-01-blue'] },
  { external_links: ['be-01-blue'] },
  { volumes_from: ['be-01-blue'] },
]) {
  test(`merged candidate configuration refuses exposure ${JSON.stringify(override)}`, async () => {
    await refuses(
      inspectBackendConfig(
        JSON.stringify({ services: { 'be-01-green': { ...service, ...override } } }),
        'green',
        image,
        resolvePath,
      ),
      'unsafe candidate',
    );
  });
}

test('effective candidate database is resolved from its most-specific bind, not an incidental data mount', async () => {
  const decoded = await inspectBackendConfig(
    JSON.stringify({
      services: {
        'be-01-green': {
          ...service,
          environment: { DB_PATH: '/live/production.db' },
          volumes: [
            { type: 'bind', source: `${ROOT}/data`, target: '/unused-backups' },
            { type: 'bind', source: '/actual-production', target: '/live' },
          ],
        },
      },
    }),
    'green',
    image,
    resolvePath,
  );
  expect(decoded.databaseHostPath).toBe('/actual-production/production.db');
  expect(decoded.databasePath).toBe('/live/production.db');
});

test('a more-specific file bind cannot establish the complete database family', async () => {
  await refuses(
    resolveDatabaseHost(
      '/data/wbs.db',
      [
        { type: 'bind', source: `${ROOT}/data`, target: '/data', writable: true },
        {
          type: 'bind',
          source: '/actual-production/production.db',
          target: '/data/wbs.db',
          writable: true,
        },
      ],
      resolvePath,
    ),
    'database family',
  );
});

test('canonical host aliases preserve actual database identity', async () => {
  expect(
    await resolveDatabaseHost(
      '/data/wbs.db',
      [{ type: 'bind', source: '/alias', target: '/data', writable: true }],
      (path) => Promise.resolve(path.replace(/^\/alias(?=\/|$)/, `${ROOT}/data`)),
    ),
  ).toBe(`${ROOT}/data/wbs.db`);
});

for (const mounts of [
  [{ type: 'bind', source: `${ROOT}/data`, target: '/unused-backups', writable: true }],
  [{ type: 'volume', source: 'volume', target: '/data', writable: true }],
  [{ type: 'bind', source: `${ROOT}/data`, target: '/data', writable: false }],
]) {
  test(`database ownership refuses unresolved or unwritable bind ${JSON.stringify(mounts)}`, async () => {
    await refuses(resolveDatabaseHost('/data/wbs.db', mounts, resolvePath), 'database');
  });
}

async function refuses(operation: Promise<unknown>, text: string): Promise<void> {
  let failure = '';
  try {
    await operation;
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }
  expect(failure).toContain(text);
}

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  test(`database family rejects a shadow bind at ${suffix || 'main file'}`, async () => {
    await refuses(
      resolveDatabaseHost(
        '/data/wbs.db',
        [
          { type: 'bind', source: `${ROOT}/data`, target: '/data', writable: true },
          {
            type: 'bind',
            source: `${ROOT}/data/wbs.db${suffix}`,
            target: `/data/wbs.db${suffix}`,
            writable: true,
          },
        ],
        resolvePath,
      ),
      'database family',
    );
  });
}

test('a renamed file alias cannot establish the SQLite family identity', async () => {
  await refuses(
    resolveDatabaseHost(
      '/data/other.db',
      [{ type: 'bind', source: `${ROOT}/data`, target: '/data', writable: true }],
      (path) => Promise.resolve(path === `${ROOT}/data/other.db` ? `${ROOT}/data/wbs.db` : path),
    ),
    'database family',
  );
});

test('a redirected retained WAL cannot establish the SQLite family identity', async () => {
  await refuses(
    resolveDatabaseHost(
      '/data/wbs.db',
      [{ type: 'bind', source: `${ROOT}/data`, target: '/data', writable: true }],
      (path) => Promise.resolve(path.endsWith('-wal') ? '/elsewhere/wbs.db-wal' : path),
    ),
    'database family',
  );
});

test('a dangling WAL link is malformed retained state rather than an absent sidecar', async () => {
  const root = await mkdtemp(join(tmpdir(), 'database-family-link-'));
  try {
    await Bun.write(join(root, 'wbs.db'), 'main');
    await symlink(join(root, 'missing-wal'), join(root, 'wbs.db-wal'));
    await refuses(
      resolveDatabaseHost(
        '/data/wbs.db',
        [{ type: 'bind', source: root, target: '/data', writable: true }],
        realpath,
      ),
      'database family',
    );
  } finally {
    await rm(root, { recursive: true });
  }
});
