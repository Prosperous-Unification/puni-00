import { expect, test } from 'bun:test';

import {
  boundedCommand,
  runFixtureDockerCommand,
  scopeDiscovery,
  translateExecution,
} from './solver-drain-transport';

test('discovery retains original census and adds only owner filter', () => {
  const census = [
    'ps',
    '--all',
    '--no-trunc',
    '--filter',
    'name=^/wbs-solver-',
    '--format',
    '{{.ID}}',
  ];
  expect(scopeDiscovery(census, 'abc')).toEqual([
    ...census,
    '--filter',
    'label=wbs-solver-drain-owner=abc',
  ]);
  expect(() => scopeDiscovery(['ps', '--all'], 'abc')).toThrow('unrecognized');
});

test('execution mapping preserves real serialization bookkeeping and rejects alien argv', () => {
  const actual =
    '{ path=/scratch/bun ; argv[]=/scratch/bun /scratch/fixture --config=/scratch/config ; ignore_errors=no ; start_time=[now] ; stop_time=[n/a] ; pid=124 ; code=(null) ; status=0 }';
  expect(
    translateExecution(
      actual,
      '/scratch/bun',
      '/scratch/bun /scratch/fixture --config=/scratch/config',
      '/logical/bun',
      '/logical/bun /logical/bundle --config=/logical/config',
    ),
  ).toContain('start_time=[now] ; stop_time=[n/a] ; pid=124');
  expect(() =>
    translateExecution(
      actual,
      '/scratch/bun',
      '/scratch/bun /scratch/alienss --config=/scratch/config',
      '/logical/bun',
      'logical',
    ),
  ).toThrow('execution');
});

async function refuses(operation: Promise<string>, message: string): Promise<void> {
  try {
    await operation;
  } catch (cause) {
    expect(String(cause)).toContain(message);
    return;
  }
  throw new Error('expected command refusal');
}
test('execution rejects unknown native serialization and extra execution records', () => {
  for (const suffix of [
    'invented=true }',
    'start_time=[now] ; stop_time=[n/a] ; pid=1 ; code=(null) ; status=0 } { path=/alien ; argv[]=/alien }',
  ])
    expect(() =>
      translateExecution(
        `{ path=/fixture ; argv[]=/fixture ; ignore_errors=no ; ${suffix}`,
        '/fixture',
        '/fixture',
        '/logical',
        '/logical',
      ),
    ).toThrow('serialization');
});

test('bounded command kills and reaps exact child on timeout and malformed UTF8', async () => {
  await refuses(
    boundedCommand([process.execPath, '-e', 'setInterval(() => {}, 1000)'], 60),
    'deadline',
  );
  const decodingStarted = performance.now();
  await refuses(
    boundedCommand(
      [
        process.execPath,
        '-e',
        'process.stdout.write(Buffer.from([255])); setInterval(() => {}, 1000)',
      ],
      2000,
    ),
    'encoded',
  );
  expect(performance.now() - decodingStarted).toBeLessThan(1000);
});
test('bounded command refuses excessive output and nonzero status', async () => {
  await refuses(
    boundedCommand(
      [
        process.execPath,
        '-e',
        'process.stdout.write("x".repeat(70000)); setInterval(() => {}, 1000)',
      ],
      2000,
    ),
    'bound',
  );
  await refuses(boundedCommand([process.execPath, '-e', 'process.exit(7)'], 2000), 'exit 7');
});

test('ownership rejects foreign label, unknown name and changed ID before exact effect', async () => {
  const { assertFixtureContainer, runFixtureEffect } = await import('./solver-drain-transport');
  const id = 'a'.repeat(64);
  const inventory = [{ id, name: 'wbs-solver-fixture' }];
  const projection = { id, name: '/wbs-solver-fixture', owner: 'unique' };
  expect(() => {
    assertFixtureContainer(projection, id, 'unique', inventory);
  }).not.toThrow();
  for (const fault of [
    { ...projection, owner: 'foreign' },
    { ...projection, name: '/production' },
    { ...projection, id: 'b'.repeat(64) },
  ]) {
    let effects = 0;
    try {
      await runFixtureEffect(
        ['kill', id],
        id,
        () => {
          assertFixtureContainer(fault, id, 'unique', inventory);
          return Promise.resolve();
        },
        () => {
          effects++;
          return Promise.resolve('');
        },
      );
    } catch {
      /* Expected modeled safety refusal. */
    }
    expect(effects).toBe(0);
  }
});

test('cleanup refuses a no-op kill and changed terminal identity before remove', async () => {
  const { removeFixtureContainer } = await import('./solver-drain-transport');
  const original = {
    id: 'a'.repeat(64),
    name: '/wbs-solver-test',
    labels: {},
    image: 'sha256:' + 'b'.repeat(64),
    imageRef: 'fixture@sha256:' + 'c'.repeat(64),
    phase: 'running' as const,
    exitCode: 0,
    state: {},
  };
  for (const terminal of [
    original,
    { ...original, phase: 'terminal' as const, exitCode: 137, image: 'sha256:' + 'd'.repeat(64) },
  ]) {
    let inspections = 0;
    const effects: string[] = [];
    await refuses(
      removeFixtureContainer(
        original.id,
        () => Promise.resolve(inspections++ === 0 ? original : terminal),
        (args) => {
          effects.push(args[0]);
          return Promise.resolve(args[0] === 'wait' ? '137\n' : '');
        },
      ),
      'terminal',
    );
    expect(effects).not.toContain('rm');
  }
});

test('cleanup removes created-inert without kill/wait and verifies terminal kill agreement', async () => {
  const { removeFixtureContainer } = await import('./solver-drain-transport');
  const original = {
    id: 'a'.repeat(64),
    name: '/wbs-solver-test',
    labels: {},
    image: 'sha256:' + 'b'.repeat(64),
    imageRef: 'fixture@sha256:' + 'c'.repeat(64),
    phase: 'inert' as const,
    exitCode: 0,
    state: {},
  };
  const effects: string[] = [];
  await removeFixtureContainer(
    original.id,
    () => Promise.resolve(original),
    (args) => {
      effects.push(args[0]);
      return Promise.resolve('');
    },
  );
  expect(effects).toEqual(['rm']);
});

test('effective unit refuses prefix drop-ins and extra commands before initial start', async () => {
  const { assertFixtureUnitAuthority, FIXTURE_UNIT_PROPERTIES } =
    await import('./solver-drain-transport');
  const expected = {
    service: 'wbs-solver-drain-acceptance-test.service',
    unit: '/scratch/unit',
    link: '/user/unit',
    edgeState: '/scratch/edge',
  };
  const fields = new Map(FIXTURE_UNIT_PROPERTIES.map((property) => [property, '']));
  for (const [property, value] of Object.entries({
    Id: expected.service,
    Names: expected.service,
    FragmentPath: expected.unit,
    Environment: `WBS_EDGE_STATE=${expected.edgeState}`,
    LoadState: 'loaded',
    Transient: 'no',
    NeedDaemonReload: 'no',
    Restart: 'always',
    KillMode: 'control-group',
  }))
    fields.set(property, value);
  expect(() => {
    assertFixtureUnitAuthority(fields, expected);
  }).not.toThrow();
  for (const [property, value] of Object.entries({
    DropInPaths: '/user/wbs-.service.d/override.conf',
    ExecStartPre: 'foreign',
    ExecStartPost: 'foreign',
    ExecStop: 'foreign',
    Environment: 'WBS_EDGE_STATE=/production',
    FragmentPath: '/production/unit',
    Id: 'production.service',
    Names: 'alias.service',
  })) {
    expect(() => {
      assertFixtureUnitAuthority(new Map([...fields, [property, value]]), expected);
    }).toThrow('fixture');
  }
});

test('effective preflight blocks actual guarded unit start and cleanup stop effects', async () => {
  const { assertFixtureUnitAuthority, FIXTURE_UNIT_PROPERTIES, runFixtureEffect } =
    await import('./solver-drain-transport');
  const expected = {
    service: 'fixture.service',
    unit: '/scratch/unit',
    link: '/user/unit',
    edgeState: '/scratch/edge',
  };
  for (const action of ['start', 'stop'])
    for (const [property, value] of [
      ['DropInPaths', 'prefix override'],
      ['ExecStartPre', 'foreign'],
    ]) {
      const fields = new Map(FIXTURE_UNIT_PROPERTIES.map((key) => [key, '']));
      for (const [key, entry] of Object.entries({
        Id: expected.service,
        Names: expected.service,
        FragmentPath: expected.unit,
        Environment: `WBS_EDGE_STATE=${expected.edgeState}`,
        LoadState: 'loaded',
        Transient: 'no',
        NeedDaemonReload: 'no',
        Restart: 'always',
        KillMode: 'control-group',
      }))
        fields.set(key, entry);
      fields.set(property, value);
      let effects = 0;
      await refuses(
        runFixtureEffect(
          ['systemctl', '--user', action, expected.service],
          expected.service,
          () => {
            assertFixtureUnitAuthority(fields, expected);
            return Promise.resolve();
          },
          () => {
            effects++;
            return Promise.resolve('');
          },
        ),
        'fixture',
      );
      expect(effects).toBe(0);
    }
});

test('native full inspect remains unchanged and ownership guarded in the runner transport', async () => {
  const id = 'a'.repeat(64);
  const run = (args: string[]) => boundedCommand(['/bin/printf', '%s', JSON.stringify(args)], 1000);
  expect(await runFixtureDockerCommand(['inspect', id], id, () => Promise.resolve(), run)).toBe(
    JSON.stringify(['inspect', id]),
  );
  let executed = false;
  for (const args of [
    ['inspect', '--all'],
    ['inspect', id, 'foreign'],
  ]) {
    let refused = false;
    try {
      await runFixtureDockerCommand(
        args,
        id,
        () => Promise.resolve(),
        () => {
          executed = true;
          return Promise.resolve('');
        },
      );
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  }
  await refuses(
    runFixtureDockerCommand(
      ['inspect', id],
      id,
      () => Promise.reject(new Error('foreign owner')),
      () => {
        executed = true;
        return Promise.resolve('');
      },
    ),
    'foreign owner',
  );
  expect(executed).toBe(false);
});
