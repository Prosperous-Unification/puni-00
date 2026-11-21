import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'bun:test';
import { ESLint } from 'eslint';

const workspace = fileURLToPath(new URL('../../..', import.meta.url));
const lint = new ESLint({ cwd: workspace });
beforeAll(() => {
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      '--eval',
      "const { createProjectGraphAsync } = await import('@nx/devkit'); const graph = await createProjectGraphAsync({ exitOnError: true }); process.stdout.write(JSON.stringify({ startup: graph.nodes['shared-bun-startup'], imports: graph.dependencies['puni-cli'] }));",
    ],
    {
      cwd: workspace,
      env: { ...process.env, NX_DAEMON: 'false', NX_FORCE_REUSE_CACHED_GRAPH: 'false' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20_000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const graph: unknown = JSON.parse(child.stdout.toString());
  if (!isRecord(graph)) throw new Error('Nx graph observation is malformed');
  expect(graph['imports']).toContainEqual({
    source: 'puni-cli',
    target: 'shared-bun-startup',
    type: 'static',
  });
  expect(graph).toMatchObject({
    startup: {
      data: {
        root: 'libs/shared/adapters/bun-startup',
        tags: ['scope:shared', 'type:adapter', 'runtime:bun', 'ring:adapter', 'product:shared'],
      },
    },
  });
}, 30_000);

const grammar = 'apps/puni/cli/src/cli-parser.ts';
const neighbor = 'apps/puni/cli/src/cli-parser.test.ts';

describe('source test-level compatibility client boundary', () => {
  const clients = [
    ['tools/tool-devsync/src/browser-level.ts', ['@puni/dash/browser-level']],
    [
      'tools/tool-devsync/src/performance-level.ts',
      ['@puni/dash/performance-level', '@puni/dash/test-level-evidence'],
    ],
    ['tools/tool-devsync/src/source-test-level-context.ts', ['@puni/dash/performance-level']],
  ] as const;
  for (const [client, aliases] of clients) {
    it(
      'changes only exact facade allowances for ' + client,
      async () => {
        const selected = await readBoundaryConfig(client);
        const inherited = await readBoundaryConfig('tools/tool-devsync/src/sync.ts');
        expect(inherited['allow']).toEqual([
          '^@wbs/contracts/solver/supervisor-protocol$',
          '^@wbs/domain$',
        ]);
        expect(selected['allow']).toEqual([
          '^@wbs/contracts/solver/supervisor-protocol$',
          '^@wbs/domain$',
          ...aliases.map((alias) => '^' + alias + '$'),
        ]);
        const withoutAllow: Record<string, unknown> = { ...selected, allow: inherited['allow'] };
        expect(withoutAllow).toEqual(inherited);
      },
      30000,
    );
    it(
      'admits the actual narrow compatibility client ' + client,
      async () => {
        const source = await readFile(new URL('../../../' + client, import.meta.url), 'utf8');
        expect(await findBoundaryFailures(client, source)).toEqual([]);
      },
      30000,
    );
    it(
      'keeps the facade allowances out of the adjacent test for ' + client,
      async () => {
        const adjacent = client.endsWith('/source-test-level-context.ts')
          ? 'tools/tool-devsync/src/test-levels.test.ts'
          : client.replace(/\.ts$/, '.test.ts');
        for (const alias of aliases)
          expect(
            await findBoundaryFailures(adjacent, 'await import(' + JSON.stringify(alias) + ');'),
          ).toHaveLength(1);
      },
      30000,
    );
    it(
      'refuses private runtime access from ' + client,
      async () => {
        expect(
          await findBoundaryFailures(client, "await import('@puni/dash/runtime');"),
        ).toHaveLength(1);
        expect(
          await findBoundaryFailures(
            client,
            "await import('../../../apps/twilight-structure/twilight-dash/cli/src/test-levels/performance');",
          ),
        ).toHaveLength(1);
      },
      30000,
    );
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readBoundaryConfig(path: string): Promise<Record<string, unknown>> {
  const config: unknown = await lint.calculateConfigForFile(path);
  if (!isRecord(config) || !isRecord(config['rules'])) throw new Error('ESLint rules are absent');
  const rule = config['rules']['@nx/enforce-module-boundaries'];
  if (!Array.isArray(rule) || !isRecord(rule[1])) throw new Error('ESLint boundary is malformed');
  return rule[1];
}

async function findBoundaryFailures(path: string, source: string): Promise<string[]> {
  const reports = await lint.lintText(source, { filePath: path });
  expect(reports).toHaveLength(1);
  const report = reports.at(0);
  if (report === undefined) throw new Error('ESLint produced no report');
  expect(report.fatalErrorCount).toBe(0);
  return report.messages
    .filter((message) => message.ruleId === '@nx/enforce-module-boundaries')
    .map((message) => message.message);
}

describe('PUNI composition boundary', () => {
  it('changes only exact import allowances from the inherited production policy', async () => {
    const grammarOptions = await readBoundaryConfig(grammar);
    const inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
    expect(grammarOptions['allow']).toEqual([
      '^@puni/burokrat/grammar$',
      '^@puni/dash/grammar$',
      '^@puni/navigator/grammar$',
    ]);
    const grammarWithoutAllow: Record<string, unknown> = { ...grammarOptions, allow: [] };
    expect(grammarWithoutAllow).toEqual(inherited);
  }, 30_000);

  it('admits the real root grammar through only the provider grammar facades', async () => {
    const source = await readFile(new URL('../../../' + grammar, import.meta.url), 'utf8');
    expect(await findBoundaryFailures(grammar, source)).toEqual([]);
  }, 30_000);

  for (const alias of ['@puni/navigator/grammar', '@puni/burokrat/grammar', '@puni/dash/grammar']) {
    it(`keeps ${alias} out of neighboring root files`, async () => {
      expect(await findBoundaryFailures(neighbor, `await import('${alias}');`)).toHaveLength(1);
    }, 30_000);
  }

  for (const alias of [
    '@puni/navigator/runtime',
    '@puni/burokrat/runtime',
    '@puni/dash/runtime',
    '@twilight-burokrat/judge',
    '@wbs/core',
    '@tools/fleet-plan',
    '../../../twilight-structure/twilight-dash/cli/src/cli-parser',
    '../../../twilight-structure/twilight-dash/cli/src/entrypoint',
  ]) {
    it(`rejects ${alias} from grammar composition`, async () => {
      expect(await findBoundaryFailures(grammar, `await import('${alias}');`)).toHaveLength(1);
    }, 30_000);
  }
});

describe('shared Bun startup boundary', () => {
  for (const path of [
    'apps/puni/cli/src/startup.ts',
    'apps/twilight-structure/twilight-burokrat/cli/src/runtime-facade.ts',
    'apps/twilight-structure/twilight-dash/cli/src/runtime-facade.ts',
  ]) {
    it(
      'admits shared startup from ' + path,
      async () => {
        expect(await findBoundaryFailures(path, "await import('@shared/bun-startup');")).toEqual(
          [],
        );
      },
      30_000,
    );
  }

  for (const alias of ['@puni/burokrat/runtime', '@tools/fleet-plan', '@wbs/core']) {
    it(
      'keeps product and infrastructure imports out of shared startup: ' + alias,
      async () => {
        expect(
          await findBoundaryFailures(
            'libs/shared/adapters/bun-startup/src/index.ts',
            "await import('" + alias + "');",
          ),
        ).toHaveLength(1);
      },
      30_000,
    );
  }
});

describe('PUNI execution boundary', () => {
  const executor = 'apps/puni/cli/src/execute-command.ts';
  const runtimes = ['@puni/burokrat/runtime', '@puni/dash/runtime', '@puni/navigator/runtime'];
  it('changes only exact runtime allowances in the dedicated executor', async () => {
    const options = await readBoundaryConfig(executor);
    const inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
    expect(options['allow']).toEqual(runtimes.map((alias) => '^' + alias + '$'));
    const optionsWithoutAllow: Record<string, unknown> = { ...options, allow: [] };
    expect(optionsWithoutAllow).toEqual(inherited);
  }, 30_000);
  it('admits the real lazy executor through only provider runtime facades', async () => {
    const source = await readFile(new URL('../../../' + executor, import.meta.url), 'utf8');
    expect(await findBoundaryFailures(executor, source)).toEqual([]);
  }, 30_000);
  for (const alias of runtimes) {
    it(
      'keeps ' + alias + ' out of neighboring root execution files',
      async () => {
        expect(
          await findBoundaryFailures(
            'apps/puni/cli/src/entrypoint.ts',
            `await import('${alias}');`,
          ),
        ).toHaveLength(1);
      },
      30_000,
    );
  }
  for (const alias of [
    '@puni/burokrat/grammar',
    '@puni/dash/grammar',
    '@puni/navigator/grammar',
    '@tools/fleet-plan',
    '@wbs/core',
    '../../../twilight-structure/twilight-dash/cli/src/cli',
  ]) {
    it(
      'rejects ' + alias + ' from root runtime composition',
      async () => {
        expect(await findBoundaryFailures(executor, `await import('${alias}');`)).toHaveLength(1);
      },
      30_000,
    );
  }
});
describe('PUNI package composition boundary', () => {
  const packager = 'apps/puni/cli/src/packaging/build.ts';
  it('changes only the exact packaging allowance in the package composition root', async () => {
    const options = await readBoundaryConfig(packager),
      inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
    expect(options['allow']).toEqual(['^@puni/burokrat/packaging$']);
    const optionsWithoutAllow: Record<string, unknown> = { ...options, allow: [] };
    expect(optionsWithoutAllow).toEqual(inherited);
  }, 30000);
  it('admits the real captured package builder through the packaging facade', async () => {
    const source = await readFile(new URL('../../../' + packager, import.meta.url), 'utf8');
    expect(await findBoundaryFailures(packager, source)).toEqual([]);
  }, 30000);
  for (const neighbor of [
    'apps/puni/cli/src/cli-parser.ts',
    'apps/puni/cli/src/execute-command.ts',
    'apps/puni/cli/src/entrypoint.ts',
    'apps/puni/cli/src/packaging/build.test.ts',
  ])
    it(
      'keeps packaging capabilities out of ' + neighbor,
      async () => {
        expect(
          await findBoundaryFailures(neighbor, "await import('@puni/burokrat/packaging');"),
        ).toHaveLength(1);
      },
      30000,
    );
  for (const alias of [
    '@puni/burokrat/runtime',
    '@puni/burokrat/grammar',
    '@puni/dash/runtime',
    '@tools/fleet-plan',
    '@wbs/core',
    '../../../../twilight-structure/twilight-burokrat/cli/src/policy/build-bun-toolkit',
  ])
    it(
      'rejects ' + alias + ' from package composition',
      async () => {
        expect(
          await findBoundaryFailures(packager, 'await import(' + JSON.stringify(alias) + ');'),
        ).toHaveLength(1);
      },
      30000,
    );
});

describe('PUNI local installation composition boundary', () => {
  const installer = 'apps/puni/cli/src/packaging/install.ts';
  it('changes only the exact packaging allowance in the local installation purpose', async () => {
    const options = await readBoundaryConfig(installer);
    const inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
    expect(options['allow']).toEqual(['^@puni/burokrat/packaging$']);
    const withoutAllow: Record<string, unknown> = { ...options, allow: [] };
    expect(withoutAllow).toEqual(inherited);
  }, 30000);
  it('admits the local installer through its exact packaging facade', async () => {
    const source = await readFile(new URL('../../../' + installer, import.meta.url), 'utf8');
    expect(await findBoundaryFailures(installer, source)).toEqual([]);
  }, 30000);
  for (const alias of [
    '@puni/burokrat/runtime',
    '@puni/burokrat/grammar',
    '@puni/dash/runtime',
    '../../../../twilight-structure/twilight-burokrat/cli/src/packaging/installed',
  ]) {
    it(
      'rejects ' + alias + ' from local installation composition',
      async () => {
        expect(
          await findBoundaryFailures(installer, 'await import(' + JSON.stringify(alias) + ');'),
        ).toHaveLength(1);
      },
      30000,
    );
  }
  it('keeps the local installation allowance out of the adjacent package test', async () => {
    expect(
      await findBoundaryFailures(
        'apps/puni/cli/src/packaging/build.test.ts',
        "await import('@puni/burokrat/packaging');",
      ),
    ).toHaveLength(1);
  }, 30000);
});

it('Forge installed selection facade changes only its exact acquisition importer allowance', async () => {
  const selected = await readBoundaryConfig('tools/tool-devsync/src/k3s/forge-installation.ts');
  const inherited = await readBoundaryConfig('tools/tool-devsync/src/k3s/forge-namespace.ts');
  const inheritedAllow = inherited['allow'];
  if (
    !Array.isArray(inheritedAllow) ||
    !inheritedAllow.every((entry: unknown): entry is string => typeof entry === 'string')
  )
    throw new Error('inherited module-boundary allowances are malformed');
  expect(inheritedAllow).toEqual(['^@wbs/contracts/solver/supervisor-protocol$', '^@wbs/domain$']);
  expect(selected['allow']).toEqual([...inheritedAllow, '^@puni/packaging$']);
  const withoutAllow: Record<string, unknown> = { ...selected, allow: inheritedAllow };
  expect(withoutAllow).toEqual(inherited);
}, 30000);

it('PUNI selection verifier changes only its exact current-profile installation allowance', async () => {
  const selected = await readBoundaryConfig('apps/puni/cli/src/packaging/selection.ts');
  const inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
  const inheritedAllow = inherited['allow'];
  if (
    !Array.isArray(inheritedAllow) ||
    !inheritedAllow.every((entry: unknown): entry is string => typeof entry === 'string')
  )
    throw new Error('inherited module-boundary allowances are malformed');
  expect(inheritedAllow).toEqual([]);
  expect(selected['allow']).toEqual([...inheritedAllow, '^@puni/burokrat/installation$']);
  const withoutAllow: Record<string, unknown> = { ...selected, allow: inheritedAllow };
  expect(withoutAllow).toEqual(inherited);
}, 30000);

it('admits the real Forge acquisition source only through its public PUNI packaging facade', async () => {
  const importer = 'tools/tool-devsync/src/k3s/forge-installation.ts';
  const source = await readFile(new URL('../../../' + importer, import.meta.url), 'utf8');
  expect(await findBoundaryFailures(importer, source)).toEqual([]);
}, 30000);
it('admits the real PUNI selection verifier only through its current-profile facade', async () => {
  const importer = 'apps/puni/cli/src/packaging/selection.ts';
  const source = await readFile(new URL('../../../' + importer, import.meta.url), 'utf8');
  expect(await findBoundaryFailures(importer, source)).toEqual([]);
}, 30000);
for (const neighbor of [
  'tools/tool-devsync/src/k3s/dev-environment.ts',
  'tools/tool-devsync/src/k3s/forge-supervisor.ts',
])
  it(
    'keeps the PUNI packaging capability out of ' + neighbor,
    async () => {
      expect(await findBoundaryFailures(neighbor, "await import('@puni/packaging');")).toHaveLength(
        1,
      );
    },
    30000,
  );
for (const alias of [
  '@puni/burokrat/packaging',
  '@puni/dash/runtime',
  '../../../../apps/puni/cli/src/packaging/selection',
])
  it(
    'keeps ' + alias + ' out of the Forge acquisition capability',
    async () => {
      expect(
        await findBoundaryFailures(
          'tools/tool-devsync/src/k3s/forge-installation.ts',
          'await import(' + JSON.stringify(alias) + ');',
        ),
      ).toHaveLength(1);
    },
    30000,
  );
it('keeps provider-private packaging out of the PUNI selection verifier', async () => {
  expect(
    await findBoundaryFailures(
      'apps/puni/cli/src/packaging/selection.ts',
      "await import('../../../../twilight-structure/twilight-burokrat/cli/src/packaging/installed');",
    ),
  ).toHaveLength(1);
}, 30000);

it('current source installation verification permits only its exact public PUNI packaging facade importer', async () => {
  const importer = 'tools/tool-remote-scripts/src/lib/source-puni-installation.ts';
  const selected = await readBoundaryConfig(importer);
  const inherited = await readBoundaryConfig(
    'tools/tool-remote-scripts/src/lib/source-dev-inputs.ts',
  );
  const inheritedAllow = inherited['allow'];
  if (
    !Array.isArray(inheritedAllow) ||
    !inheritedAllow.every((entry: unknown): entry is string => typeof entry === 'string')
  )
    throw new Error('source installation inherited boundary allowances are malformed');
  expect(inheritedAllow).toEqual(['^@wbs/contracts/solver/supervisor-protocol$', '^@wbs/domain$']);
  expect(selected['allow']).toEqual([...inheritedAllow, '^@puni/packaging$']);
  const withoutAllow: Record<string, unknown> = { ...selected, allow: inheritedAllow };
  expect(withoutAllow).toEqual(inherited);
}, 30000);

describe('PUNI SDK installation-only composition boundary', () => {
  const verifier = 'apps/puni/cli/src/packaging/selection.ts';
  it('replaces only the exact SDK allowance with the narrow installed-verifier facade', async () => {
    const selected = await readBoundaryConfig(verifier);
    const inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
    expect(inherited['allow']).toEqual([]);
    expect(selected['allow']).toEqual(['^@puni/burokrat/installation$']);
    const withoutAllow: Record<string, unknown> = { ...selected, allow: [] };
    expect(withoutAllow).toEqual(inherited);
  }, 30000);
  it('admits the actual SDK verifier without builder or private provider imports', async () => {
    const source = await readFile(new URL('../../../' + verifier, import.meta.url), 'utf8');
    expect(await findBoundaryFailures(verifier, source)).toEqual([]);
    for (const alias of [
      '@puni/burokrat/packaging',
      '../../../../twilight-structure/twilight-burokrat/cli/src/packaging/installation',
    ])
      expect(
        await findBoundaryFailures(verifier, 'await import(' + JSON.stringify(alias) + ');'),
      ).toHaveLength(1);
  }, 30000);
  for (const neighbor of [
    'apps/puni/cli/src/packaging/build.ts',
    'apps/puni/cli/src/namespaces.ts',
  ])
    it(
      'keeps the narrow verifier facade out of ' + neighbor,
      async () => {
        expect(
          await findBoundaryFailures(neighbor, "await import('@puni/burokrat/installation');"),
        ).toHaveLength(1);
      },
      30000,
    );
});

describe('PUNI installed runtime fixture boundary', () => {
  const fixture = 'apps/puni/cli/src/packaging/test-level-installation.test.fixture.ts';
  const aliases = ['@tools/performance-execution-fixture', '@puni/dash/performance-processes'];
  it('changes only exact fixture allowances from inherited policy', async () => {
    const selected = await readBoundaryConfig(fixture);
    const inherited = await readBoundaryConfig('apps/puni/cli/src/namespaces.ts');
    expect(selected['allow']).toEqual(aliases.map((alias) => '^' + alias + '$'));
    const withoutAllow: Record<string, unknown> = { ...selected, allow: [] };
    expect(withoutAllow).toEqual(inherited);
  }, 30000);
  it('admits the actual installed runtime fixture through resolved aliases', async () => {
    const source = await readFile(new URL('../../../' + fixture, import.meta.url), 'utf8');
    for (const alias of aliases) expect(source).toContain("from '" + alias + "'");
    expect(await findBoundaryFailures(fixture, source)).toEqual([]);
  }, 30000);
  for (const neighbor of [
    'apps/puni/cli/src/packaging/build.test.ts',
    'apps/puni/cli/src/packaging/build.ts',
    'apps/puni/cli/src/packaging/test-levels.ts',
    'apps/puni/cli/src/packaging/selection.ts',
  ])
    it(
      'keeps fixture capabilities out of ' + neighbor,
      async () => {
        for (const alias of aliases)
          expect(
            await findBoundaryFailures(neighbor, 'await import(' + JSON.stringify(alias) + ');'),
          ).toHaveLength(1);
      },
      30000,
    );
  for (const alias of [
    '@puni/dash/runtime',
    '@tools/fleet-plan',
    '../../../../../tools/tool-devsync/src/performance-execution-fixture',
    '../../../../twilight-structure/twilight-dash/cli/src/test-levels/performance-processes',
  ])
    it(
      'rejects unrelated or private access ' + alias,
      async () => {
        expect(
          await findBoundaryFailures(fixture, 'await import(' + JSON.stringify(alias) + ');'),
        ).toHaveLength(1);
      },
      30000,
    );
});
