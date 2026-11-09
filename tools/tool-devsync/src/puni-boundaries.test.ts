import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import { ESLint } from 'eslint';

const workspace = fileURLToPath(new URL('../../..', import.meta.url));
const lint = new ESLint({ cwd: workspace });
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
