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
