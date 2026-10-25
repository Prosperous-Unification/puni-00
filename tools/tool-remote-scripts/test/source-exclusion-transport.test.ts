import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { readFields } from '../src/lib/managed-cohort';
import { createFixtureDocker } from './source-exclusion-transport';

const token = 'd50734f0-2f15-4ad7-bb40-8627ce818632';
const root = `/tmp/source-${token}`;
const source = {
  Id: 'a'.repeat(64),
  Name: `/source-${token}`,
  Image: `sha256:${'b'.repeat(64)}`,
  Config: {
    Image: `source-${token}:1`,
    Labels: { 'puni.source-exclusion': token },
    Entrypoint: ['entry'],
    Cmd: ['bun', 'run', 'dev'],
    User: '1000:1000',
  },
  HostConfig: { NetworkMode: `net-${token}` },
  Mounts: [{ Type: 'bind', Source: `${root}/runtime`, Destination: '/run/wbs-solver', RW: false }],
  NetworkSettings: { Networks: { [`net-${token}`]: { NetworkID: 'c'.repeat(64) } } },
};
function fixture(
  containers: unknown[] = [source],
  additional: { name: string; imageRef: string; imageId: string; id: string }[] = [],
  malformed = false,
  subset = false,
) {
  const calls: string[][] = [];
  let discoveries = 0;
  const run = (args: string[]) => {
    calls.push(args);
    if (args[0] === 'ps' && subset && ++discoveries > 1) return Promise.resolve(source.Id);
    if (args[0] === 'ps')
      return Promise.resolve(containers.map((entry) => String(readFields(entry)['Id'])).join('\n'));
    if (args[0] === 'inspect' && malformed) return Promise.resolve('{PRIVATE_FIXTURE_SENTINEL');
    if (args[0] === 'inspect')
      return Promise.resolve(
        JSON.stringify(
          containers.filter((entry) => args.includes(String(readFields(entry)['Id']))),
        ),
      );
    return Promise.resolve('');
  };
  const docker = createFixtureDocker({
    token,
    root,
    sourceName: `source-${token}`,
    sourceTag: `source-${token}:1`,
    runtime: `${root}/runtime`,
    caddyName: `edge-${token}`,
    plans: [
      {
        name: `source-${token}`,
        id: source.Id,
        imageRef: source.Config.Image,
        imageId: source.Image,
      },
      ...additional,
    ],
    run,
  });
  return { docker, calls };
}
function rootedFixture(privateRoot: string, runtime: string, calls: string[][]) {
  const physical = structuredClone(source);
  physical.Mounts[0].Source = runtime;
  return createFixtureDocker({
    token,
    root: privateRoot,
    sourceName: `source-${token}`,
    sourceTag: `source-${token}:1`,
    runtime,
    caddyName: `edge-${token}`,
    plans: [
      {
        name: `source-${token}`,
        id: source.Id,
        imageRef: source.Config.Image,
        imageId: source.Image,
      },
    ],
    run: (args) => {
      calls.push(args);
      if (args[0] === 'ps') return Promise.resolve(source.Id);
      if (args[0] === 'inspect') return Promise.resolve(JSON.stringify([physical]));
      throw new Error('unexpected mocked Docker command');
    },
  });
}

for (const parent of ['/tmp', '/var/tmp']) {
  test(`mocked fixture admits UUID descendants of ${parent} through census and inspection`, async () => {
    const privateRoot = `${parent}/source-${token}`;
    const calls: string[][] = [];
    const docker = rootedFixture(privateRoot, `${privateRoot}/runtime`, calls);
    expect(await docker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}'])).toBe(source.Id + '\n');
    const inspected: unknown = JSON.parse(await docker(['inspect', source.Id]));
    expect(inspected).toMatchObject([
      { Name: '/wbs-dev-src', Id: source.Id, Mounts: [{ Source: '/run/user/1000/wbs-solver' }] },
    ]);
    expect(calls.some((args) => args[0] === 'inspect')).toBe(true);
    expect(
      calls
        .filter((args) => args[0] === 'ps')
        .every((args) => args.includes(`label=puni.source-exclusion=${token}`)),
    ).toBe(true);
  });
}

for (const [label, privateRoot, runtime] of [
  ['outside parent', `/home/source-${token}`, `/home/source-${token}/runtime`],
  ['tmp sibling prefix', `/tmpx/source-${token}`, `/tmpx/source-${token}/runtime`],
  ['var tmp sibling prefix', `/var/tmpx/source-${token}`, `/var/tmpx/source-${token}/runtime`],
  ['missing token', '/tmp/source-missing', '/tmp/source-missing/runtime'],
  [
    'wrong token',
    '/var/tmp/source-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '/var/tmp/source-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/runtime',
  ],
  ['runtime outside root', `/var/tmp/source-${token}`, `/var/tmp/foreign-${token}/runtime`],
  [
    'runtime sibling prefix',
    `/var/tmp/source-${token}`,
    `/var/tmp/source-${token}-sibling/runtime`,
  ],
]) {
  test(`mocked fixture refuses ${label} before any Docker callback`, () => {
    const calls: string[][] = [];
    expect(() => rootedFixture(privateRoot, runtime, calls)).toThrow(
      label.startsWith('runtime') ? 'runtime outside root' : 'root must contain UUID',
    );
    expect(calls).toEqual([]);
  });
}

test('fresh owner census preserves unrelated complete inventory and native startup', async () => {
  const unrelated = structuredClone(source);
  unrelated.Id = 'e'.repeat(64);
  unrelated.Name = `/unrelated-${token}`;
  const f = fixture(
    [source, unrelated],
    [
      {
        name: `unrelated-${token}`,
        id: 'e'.repeat(64),
        imageRef: source.Config.Image,
        imageId: source.Image,
      },
    ],
  );
  const listed = await f.docker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']);
  expect(listed.trim().split('\n')).toEqual([source.Id, unrelated.Id]);
  const inspected: unknown = JSON.parse(await f.docker(['inspect', source.Id]));
  if (!Array.isArray(inspected)) throw new Error('fixture inspection absent');
  const member = readFields(inspected[0]);
  const config = readFields(member['Config']);
  const mounts = member['Mounts'];
  if (!Array.isArray(mounts)) throw new Error('fixture mounts absent');
  expect(member['Name']).toBe('/wbs-dev-src');
  expect(config['Image']).toBe('wbs-dev-src:1');
  expect(config['Entrypoint']).toEqual(['entry']);
  expect(readFields(mounts[0])['Source']).toBe('/run/user/1000/wbs-solver');
  expect(
    f.calls
      .filter((args) => args[0] === 'ps')
      .every((args) => args.includes(`label=puni.source-exclusion=${token}`)),
  ).toBe(true);
});
test('foreign label refuses before any exact-ID effect', async () => {
  const foreign = structuredClone(source);
  foreign.Config.Labels['puni.source-exclusion'] = 'foreign';
  const f = fixture([foreign]);
  await refuses(f.docker(['stop', '--time', '10', source.Id]), 'ownership');
  expect(f.calls.some((args) => args[0] === 'stop')).toBe(false);
});
test('unplanned labelled child is never hidden from fixture census', async () => {
  const alien = structuredClone(source);
  alien.Id = 'e'.repeat(64);
  alien.Name = `/unplanned-${token}`;
  const f = fixture([source, alien]);
  await refuses(f.docker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']), 'planned');
});
test('physical mount escape refuses before translating source coordinates', async () => {
  const foreign = structuredClone(source);
  foreign.Mounts[0].Source = '/home/puni1/wbs-dev/src';
  await refuses(fixture([foreign]).docker(['inspect', source.Id]), 'mount');
});
test('image substitution refuses before any effect', async () => {
  const foreign = structuredClone(source);
  foreign.Image = `sha256:${'f'.repeat(64)}`;
  await refuses(fixture([foreign]).docker(['update', '--restart=no', source.Id]), 'image');
});

async function refuses(work: Promise<unknown>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await work;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain(message);
}

test('fresh census detects a newly labelled writer after an earlier observation', async () => {
  const containers: unknown[] = [structuredClone(source)];
  const f = fixture(containers);
  await f.docker(['inspect', source.Id]);
  const alien = structuredClone(source);
  alien.Id = 'e'.repeat(64);
  alien.Name = `/new-${token}`;
  containers.push(alien);
  await refuses(f.docker(['update', '--restart=no', source.Id]), 'planned');
  expect(f.calls.some((args) => args[0] === 'update')).toBe(false);
});
test('same planned name cannot replace its captured full identity', async () => {
  const containers = [structuredClone(source)];
  const f = fixture(containers);
  await f.docker(['inspect', source.Id]);
  containers[0].Id = 'e'.repeat(64);
  await refuses(f.docker(['stop', '--time', '10', containers[0].Id]), 'captured identity differs');
  expect(f.calls.some((args) => args[0] === 'stop')).toBe(false);
});
test('source tag lookup reaches the exact invocation tag and native image inspection', async () => {
  const f = fixture();
  await f.docker(['image', 'inspect', '--format', '{{.Id}}', 'wbs-dev-src:1']);
  await f.docker(['image', 'inspect', source.Image]);
  expect(f.calls).toContainEqual(['image', 'inspect', '--format', '{{.Id}}', source.Config.Image]);
  expect(f.calls).toContainEqual(['image', 'inspect', source.Image]);
  expect(f.calls.some((args) => args.includes('wbs-dev-src:1'))).toBe(false);
});
test('alien exec and unsupported lifecycle argv never reach owned containers', async () => {
  const f = fixture();
  await refuses(f.docker(['exec', source.Id, 'sh', '-c', 'touch /data/alien']), 'unrecognized');
  await refuses(f.docker(['restart', source.Id]), 'unrecognized');
  expect(f.calls.some((args) => args[0] === 'exec' || args[0] === 'restart')).toBe(false);
});
test('native startup, lifecycle, full mount flags and security survive exact translations', async () => {
  const native = {
    ...structuredClone(source),
    Path: 'entry',
    Args: ['bun', 'run', 'dev'],
    State: { Running: false, Pid: 0, ExitCode: 143, StartedAt: 'start', FinishedAt: 'finish' },
    RestartCount: 2,
  };
  const f = fixture([native]);
  const observed: unknown = JSON.parse(await f.docker(['inspect', source.Id]));
  const expected = structuredClone(native);
  expected.Name = '/wbs-dev-src';
  expected.Config.Image = 'wbs-dev-src:1';
  expected.Mounts[0].Source = '/run/user/1000/wbs-solver';
  expect(observed).toEqual([expected]);
});

test('malformed native inspection never exposes credential-bearing parser excerpts', async () => {
  const f = fixture([source], [], true);
  let failure: unknown;
  try {
    await f.docker(['inspect', source.Id]);
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('private fixture inspection malformed');
  expect(String(failure)).not.toContain('PRIVATE_FIXTURE_SENTINEL');
  if (!(failure instanceof Error)) throw new Error('expected actual parse failure');
  expect(failure.cause).toBeUndefined();
});

test('namespace audit native projection preserves exact owned argv', async () => {
  const f = fixture();
  await f.docker(['inspect', '--format', '{{json .}}', source.Id]);
  expect(f.calls).toContainEqual(['inspect', '--format', '{{json .}}', source.Id]);
});

// Proof: removing the Docker-stub directory from the child PATH failed the
// option-like pin case before the real runner; the selected stub records and refuses effects.
async function preflightChild(environment: Record<string, string>, expected: string) {
  const directory = await mkdtemp(join(tmpdir(), 'source-preflight-'));
  try {
    const docker = join(directory, 'docker');
    const log = join(directory, 'docker-calls');
    await writeFile(
      docker,
      '#!/bin/sh\nprintf "docker invoked\\n" >> "$PROBE_DOCKER_LOG"\nexit 74\n',
    );
    await chmod(docker, 0o700);
    const script = `
      import { runSourceExclusionAcceptance } from ${JSON.stringify(new URL('./source-exclusion.ts', import.meta.url).pathname)};
      if (Bun.which('docker') !== process.env['EXPECTED_DOCKER']) throw new Error('Docker stub not selected');
      try { await runSourceExclusionAcceptance(); }
      catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        console.log(JSON.stringify({ refusal: cause.message }));
        process.exit(78);
      }
    `;
    const child = Bun.spawnSync([process.execPath, '--no-env-file', '--eval', script], {
      env: {
        PATH: `${directory}:/usr/bin:/bin`,
        TMPDIR: '/tmp',
        BUN_TMPDIR: '/tmp',
        EXPECTED_DOCKER: docker,
        PROBE_DOCKER_LOG: log,
        ...environment,
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    expect(child.exitCode).toBe(78);
    expect(child.stderr.toString()).toBe('');
    expect(JSON.parse(child.stdout.toString())).toEqual({ refusal: expected });
    expect(await Bun.file(log).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test('source runner refuses option-like image pins before fixture effects', async () => {
  await preflightChild(
    { SOURCE_EXCLUSION_SOURCE_IMAGE: `--unsafe@sha256:${'a'.repeat(64)}` },
    'independent local image pin required before fixture effects',
  );
});
test('source runner refuses production receipt roots before fixture effects', async () => {
  const environment = Object.fromEntries(
    ['SOURCE', 'BACKEND', 'GATEWAY', 'CADDY', 'SOLVER'].map((role) => [
      `SOURCE_EXCLUSION_${role}_IMAGE`,
      `fixture@sha256:${'a'.repeat(64)}`,
    ]),
  );
  environment['SOURCE_EXCLUSION_RECEIPT'] = '/home/puni1/wbs/state/forbidden.json';
  await preflightChild(environment, 'production receipt path refused');
});

test('source runner refuses production temporary roots before fixture effects', async () => {
  const { runSourceExclusionAcceptance } = await import('./source-exclusion');
  const previous = process.env['TMPDIR'];
  process.env['TMPDIR'] = '/home/puni1/wbs';
  try {
    await refuses(runSourceExclusionAcceptance(), 'fixture temp root must be canonical under /tmp');
  } finally {
    if (previous === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = previous;
  }
});

test('full production inventory cannot become a second-list subset', async () => {
  const unrelated = structuredClone(source);
  unrelated.Id = 'e'.repeat(64);
  unrelated.Name = `/unrelated-${token}`;
  const f = fixture(
    [source, unrelated],
    [
      {
        name: `unrelated-${token}`,
        id: 'e'.repeat(64),
        imageRef: source.Config.Image,
        imageId: source.Image,
      },
    ],
    false,
    true,
  );
  const ids = (await f.docker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}']))
    .trim()
    .split('\n');
  expect(ids).toEqual([source.Id, unrelated.Id]);
});
test('unsupported discovery filters refuse rather than narrowing audit inventory', async () => {
  const f = fixture();
  await refuses(
    f.docker(['ps', '-a', '--no-trunc', '--filter', 'name=source', '--format', '{{.ID}}']),
    'unrecognized fixture discovery',
  );
});

test('replacement before first census cannot establish fixture identity', async () => {
  const replacement = structuredClone(source);
  replacement.Id = 'f'.repeat(64);
  await refuses(
    fixture([replacement]).docker(['inspect', replacement.Id]),
    'fixture captured identity differs',
  );
});
