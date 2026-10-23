import { chmod, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { excludeIngressAndManagedDependencies } from './dependency-activation-owner';
import { fenceDependencyIngress, inspectDependencyIngress } from './dependency-ingress';
import type { RunDocker } from './docker-deadline';
import { captureOwnedSiteFile, publishOwnedSiteFile, withDependencyOwner } from './edge-ownership';
import { envLayout } from './env';

const edgeId = 'e'.repeat(64);
async function fixture() {
  const root = scratchSync('dependency-ingress-');
  const caddy = `${root}/caddy`;
  await mkdir(caddy);
  const layout = {
    ...envLayout('prod'),
    root,
    stateDir: root,
    siteAddress: 'prod.owner.test',
    siteCaddyPath: `${caddy}/site.caddy`,
  };
  const originals = {
    Caddyfile:
      'import log-redact.caddy\nimport site.caddy\nimport site-dev.caddy\nimport registry.caddy\n',
    'log-redact.caddy': '(access-log) {\n log\n}\n',
    'site.caddy': 'prod.owner.test {\n respond "original prod"\n import access-log\n}\n',
    'site-dev.caddy': 'dev.owner.test {\n respond "original dev"\n import access-log\n}\n',
    'registry.caddy': 'registry.owner.test {\n respond "registry"\n}\n',
  };
  for (const [name, contents] of Object.entries(originals))
    await writeFile(`${caddy}/${name}`, contents);
  const route = (host: string, body: string, status: number) => ({
    match: [{ host: [host] }],
    handle: [
      {
        handler: 'subroute',
        routes: [{ handle: [{ handler: 'static_response', body, status_code: status }] }],
      },
    ],
    terminal: true,
  });
  async function adapt() {
    const maintenance = (await readFile(layout.siteCaddyPath, 'utf8')).includes(
      'WBS dependency maintenance',
    );
    return {
      apps: {
        http: {
          servers: {
            srv0: {
              listen: [':8080'],
              routes: [
                route(
                  layout.siteAddress,
                  maintenance ? 'WBS dependency maintenance' : 'original prod',
                  maintenance ? 503 : 200,
                ),
                route('dev.owner.test', 'original dev', 200),
                route('registry.owner.test', 'registry', 200),
              ],
            },
          },
        },
      },
    };
  }
  let live = await adapt();
  const container = {
    Id: edgeId,
    Name: '/wbs-caddy-1',
    Path: 'caddy',
    Args: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
    Image: 'sha256:' + 'a'.repeat(64),
    Config: { Env: [] },
    State: {
      Running: true,
      Paused: false,
      Restarting: false,
      Pid: 123,
      StartedAt: '2026-10-23T00:00:00Z',
    },
    Mounts: [{ Type: 'bind', Source: caddy, Destination: '/etc/caddy', RW: false }],
  };
  const calls: string[][] = [];
  let fault: (args: string[]) => void | Promise<void> = () => undefined;
  let noop = false;
  let tamper: 'none' | 'unrelated' | 'route' = 'none';
  const runner: RunDocker = async (args) => {
    calls.push(args);
    await fault(args);
    if (args[0] === 'inspect') return JSON.stringify([container]);
    if (args.includes('adapt')) {
      const config = await adapt();
      const routes = config.apps.http.servers.srv0.routes;
      if (routes[0].handle[0].routes[0].handle[0].status_code === 503) {
        if (tamper === 'unrelated')
          routes[2].handle[0].routes[0].handle[0].body = 'changed registry';
        if (tamper === 'route') routes[0].handle[0].routes[0].handle[0].status_code = 200;
      }
      return JSON.stringify(config);
    }
    if (args.includes('reload')) {
      if (!noop) live = await adapt();
      return '';
    }
    if (args.includes('wget')) return JSON.stringify(live);
    throw new Error('unexpected Docker fixture command');
  };
  return {
    root,
    caddy,
    layout,
    originals,
    runner,
    calls,
    container,
    setFault: (inject: typeof fault) => {
      fault = inject;
    },
    setTamper: (selected: typeof tamper) => {
      tamper = selected;
    },
    setNoop: () => {
      noop = true;
    },
    changeLive: () => {
      live.apps.http.servers.srv0.routes[2].handle[0].routes[0].handle[0].body = 'drift';
    },
  };
}
async function refuses(promise: Promise<unknown>) {
  let refused = false;
  try {
    await promise;
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
}
test('owner persists selected whole-site closure, exact-ID reload and unrelated private evidence', async () => {
  const f = await fixture();
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layout] },
    async (owner) => {
      await fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000);
      await inspectDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000);
    },
    f.root,
  );
  expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toContain(
    'respond "WBS dependency maintenance" 503',
  );
  expect(await readFile(`${f.caddy}/site-dev.caddy`, 'utf8')).toBe(f.originals['site-dev.caddy']);
  expect(await readFile(`${f.caddy}/registry.caddy`, 'utf8')).toBe(f.originals['registry.caddy']);
  expect(f.calls.filter((args) => args.includes('reload')).map((args) => args[1])).toEqual([
    edgeId,
  ]);
  expect((await readdir(f.root)).some((name) => name.includes('ingress-original'))).toBe(true);
});
for (const fault of [
  'noop',
  'foreign-startup',
  'foreign-bind',
  'live-drift',
  'marker-loss',
  'interruption',
] as const) {
  test(`retains uncertainty and refuses ${fault}`, async () => {
    const f = await fixture();
    if (fault === 'noop') f.setNoop();
    if (fault === 'foreign-startup') f.container.Args.push('--resume');
    if (fault === 'foreign-bind') f.container.Mounts[0].RW = true;
    if (fault === 'live-drift') f.changeLive();
    if (fault === 'marker-loss')
      f.setFault(async (args) => {
        if (args.includes('reload')) await writeFile(`${f.root}/edge-owner.pending`, 'lost');
      });
    if (fault === 'interruption')
      f.setFault(async (args) => {
        if (
          args.includes('adapt') &&
          (await readFile(f.layout.siteCaddyPath, 'utf8')).includes('WBS dependency maintenance')
        )
          throw new Error('crash after publication');
      });
    await refuses(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layout] },
        (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
        f.root,
      ),
    );
    expect(await Bun.file(`${f.root}/edge-owner.pending`).exists()).toBe(true);
    if (['live-drift', 'foreign-startup', 'foreign-bind'].includes(fault))
      expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
    if (['interruption', 'noop', 'marker-loss'].includes(fault))
      expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toContain(
        'WBS dependency maintenance',
      );
    expect(f.calls.some((args) => ['stop', 'start', 'rm', 'restart'].includes(args[0] ?? ''))).toBe(
      false,
    );
  });
}
for (const fault of ['symlink', 'unreadable'] as const) {
  test(`trusted site ${fault} refuses before replacement`, async () => {
    const f = await fixture();
    if (fault === 'symlink') {
      await Bun.file(f.layout.siteCaddyPath).delete();
      await symlink(`${f.caddy}/site-dev.caddy`, f.layout.siteCaddyPath);
    } else await chmod(f.layout.siteCaddyPath, 0);
    try {
      await refuses(
        withDependencyOwner(
          { sha: 'a'.repeat(40), layouts: [f.layout] },
          (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
          f.root,
        ),
      );
    } finally {
      if (fault === 'unreadable') await chmod(f.layout.siteCaddyPath, 0o600);
    }
    expect(await readFile(`${f.caddy}/site-dev.caddy`, 'utf8')).toBe(f.originals['site-dev.caddy']);
    expect(f.calls.some((args) => args.includes('reload'))).toBe(false);
    expect(f.calls.some((args) => args.includes('adapt'))).toBe(false);
  });
}

for (const fault of ['identity', 'disk', 'admin', 'receipt'] as const) {
  test(`fresh ingress inspection refuses ${fault} drift`, async () => {
    const f = await fixture();
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layout] },
      async (owner) => {
        await fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000);
        if (fault === 'identity') f.container.Id = 'f'.repeat(64);
        if (fault === 'disk') await writeFile(`${f.caddy}/registry.caddy`, 'changed');
        if (fault === 'admin') f.changeLive();
        if (fault === 'receipt') {
          const publications = (await readdir(f.root))
            .filter((name) => name.includes('-ingress-complete'))
            .sort();
          const publication = publications.at(-1);
          if (publication === undefined) throw new Error('ingress publication absent');
          await writeFile(`${f.root}/${publication}`, '{}');
        }
        await refuses(
          inspectDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
        );
      },
      f.root,
    );
  });
}

test('owned site publication refuses foreign path and changed original bytes', async () => {
  const f = await fixture();
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [f.layout] },
    async (owner) => {
      const site = await captureOwnedSiteFile(f.layout.siteCaddyPath);
      await refuses(
        publishOwnedSiteFile(
          owner,
          f.layout,
          await captureOwnedSiteFile(`${f.caddy}/registry.caddy`),
          'replacement',
        ),
      );
      await writeFile(f.layout.siteCaddyPath, 'changed original');
      await refuses(publishOwnedSiteFile(owner, f.layout, site, 'replacement'));
    },
    f.root,
  );
  expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe('changed original');
  expect(await readFile(`${f.caddy}/registry.caddy`, 'utf8')).toBe(f.originals['registry.caddy']);
});

for (const fault of ['absent', 'unreadable'] as const) {
  test(`trusted root ${fault} refuses without changing selected file`, async () => {
    const f = await fixture();
    const path = `${f.caddy}/Caddyfile`;
    if (fault === 'absent') await Bun.file(path).delete();
    else await chmod(path, 0);
    try {
      await refuses(
        withDependencyOwner(
          { sha: 'a'.repeat(40), layouts: [f.layout] },
          (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
          f.root,
        ),
      );
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o600);
    }
    expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
    expect(f.calls.some((args) => args.includes('reload'))).toBe(false);
  });
}

for (const fault of ['unrelated', 'route'] as const) {
  test(`adapted ${fault} drift refuses before actual reload`, async () => {
    const f = await fixture();
    f.setTamper(fault);
    await refuses(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layout] },
        (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
        f.root,
      ),
    );
    expect(f.calls.some((args) => args.includes('reload'))).toBe(false);
    expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toContain('WBS dependency maintenance');
  });
}

test('explicit inclusive coordinator closes ingress before entering managed inventory', async () => {
  const f = await fixture();
  const previous = process.env['WBS_EDGE_STATE'];
  process.env['WBS_EDGE_STATE'] = f.root;
  try {
    await refuses(
      excludeIngressAndManagedDependencies({ sha: 'a'.repeat(40), layouts: [f.layout] }, f.runner),
    );
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
  }
  const reload = f.calls.findIndex((args) => args.includes('reload'));
  const managed = f.calls.findIndex((args) => args[0] === 'ps');
  expect(reload).toBeGreaterThan(-1);
  expect(managed).toBeGreaterThan(reload);
  expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toContain('WBS dependency maintenance');
});

test('unrelated live drift after reload refuses completion despite selected 503', async () => {
  const f = await fixture();
  f.setFault((args) => {
    if (args.includes('wget') && f.calls.some((command) => command.includes('reload')))
      f.changeLive();
  });
  await refuses(
    withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layout] },
      (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
      f.root,
    ),
  );
  expect(f.calls.some((args) => args.includes('reload'))).toBe(true);
});

test('partial Caddy ID refuses before disk mutation', async () => {
  const f = await fixture();
  f.container.Id = 'e'.repeat(12);
  await refuses(
    withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layout] },
      (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
      f.root,
    ),
  );
  expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
});

test('disk drift before publication refuses before selected file replacement', async () => {
  const f = await fixture();
  let inspections = 0;
  f.setFault(async (args) => {
    if (args[0] === 'inspect' && ++inspections === 2)
      await writeFile(`${f.caddy}/registry.caddy`, 'changed externally');
  });
  await refuses(
    withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layout] },
      (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
      f.root,
    ),
  );
  expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
  expect(f.calls.some((args) => args.includes('reload'))).toBe(false);
});

test('missing persistent site import refuses before replacement', async () => {
  const f = await fixture();
  await writeFile(`${f.caddy}/Caddyfile`, 'import log-redact.caddy\n');
  await refuses(
    withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [f.layout] },
      (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
      f.root,
    ),
  );
  expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
});

for (const boundary of ['inspect', 'wget'] as const) {
  test(`malformed private ${boundary} output refuses without diagnostic contents`, async () => {
    const f = await fixture();
    let failure: unknown;
    const runner: RunDocker = (args, signal) =>
      args.includes(boundary) ? Promise.resolve('FIXTURECREDENTIALSECRET') : f.runner(args, signal);
    try {
      await withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layout] },
        (owner) => fenceDependencyIngress(owner, [f.layout], runner, performance.now() + 60000),
        f.root,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain('FIXTURECREDENTIALSECRET');
    expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
  });
}

for (const missing of ['Image', 'Env', 'StartedAt'] as const) {
  test(`missing immutable edge ${missing} refuses before publication`, async () => {
    const f = await fixture();
    if (missing === 'Env') Reflect.deleteProperty(f.container.Config, 'Env');
    else if (missing === 'StartedAt') Reflect.deleteProperty(f.container.State, 'StartedAt');
    else Reflect.deleteProperty(f.container, 'Image');
    await refuses(
      withDependencyOwner(
        { sha: 'a'.repeat(40), layouts: [f.layout] },
        (owner) => fenceDependencyIngress(owner, [f.layout], f.runner, performance.now() + 60000),
        f.root,
      ),
    );
    expect(await readFile(f.layout.siteCaddyPath, 'utf8')).toBe(f.originals['site.caddy']);
  });
}
