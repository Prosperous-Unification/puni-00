import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
import { ESLint } from 'eslint';

import { createPolicyWorkspace, runLint, writeProject } from './testing/lint-workspace';

const workspace = fileURLToPath(new URL('../../..', import.meta.url));
const lint = new ESLint({ cwd: workspace });

/**
 * The only entries the root config's `allow` list may name, sorted. A bare `allow` entry is an
 * unanchored regular expression, so each is anchored and excuses its exact specifier alone. They
 * are WBS host tooling misfiled under `tools/`, and the exception dies with the relocation that
 * moves them: the case below fails once an entry stops being imported.
 */
const PENDING_INFRA_TO_PRODUCT_ALIASES = [
  '^@wbs/contracts/solver/supervisor-protocol$',
  '^@wbs/domain$',
] as const;

/** The specifier an anchored `allow` entry excuses, which is what the sources are scanned for. */
function specifierOf(entry: string): string {
  return entry.replace(/^\^/, '').replace(/\$$/, '');
}

async function ruleIds(path: string, source: string): Promise<readonly (string | null)[]> {
  const [report] = await lint.lintText(source, { filePath: path });
  return report.messages.map((message) => message.ruleId);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether `source` ends an import statement on `alias`. Matched on a whole line rather than
 * anywhere in the file, and never on a comment line, so that prose naming an alias — the Proof
 * below included — cannot keep a dead `allow` entry alive. The last line is what is tested
 * because the repository's imports of these aliases are multi-line.
 */
function importsAlias(source: string, alias: string): boolean {
  return source
    .split('\n')
    .some((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line) && line.endsWith(`from '${alias}';`));
}

function boundaryOf(config: unknown): readonly unknown[] {
  if (!isRecord(config) || !isRecord(config['rules'])) {
    throw new Error('ESLint returned a malformed effective configuration');
  }
  const boundary = config['rules']['@nx/enforce-module-boundaries'];
  if (!Array.isArray(boundary)) throw new Error('ESLint returned no module-boundary rule');
  return boundary;
}

describe('the effective production and test boundaries', () => {
  // Proof: independent source/test allowance removals failed their actual import admissions;
  // broad alias, relative path and unlisted-peer allowances failed the matching denials
  // after zero-fatal parser assertions. Each exact restoration passed 36 assertions (2026-10-31).
  it('Dash coordination topology consumes only the exact public WBS domain at its two paths', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/runs/prepare-activity.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash coordination peer policy malformed');
    for (const name of ['topology.ts', 'topology.test.ts']) {
      const path = 'apps/twilight-structure/twilight-dash/cli/src/coordination/' + name;
      const [admission] = await lint.lintText("await import('@wbs/domain');", { filePath: path });
      expect(admission.fatalErrorCount, path).toBe(0);
      expect(
        admission.messages.map((message) => message.ruleId),
        path,
      ).not.toContain('@nx/enforce-module-boundaries');
      for (const alias of [
        '@wbs/domain/step-node',
        '@wbs/contracts',
        '@wbs/core',
        '@wbs/store-memory',
        relative(dirname(path), 'libs/wbs/domain/domain/src/index.ts'),
      ]) {
        const [denial] = await lint.lintText(`await import('${alias}');`, { filePath: path });
        expect(denial.fatalErrorCount, path + ' ' + alias).toBe(0);
        expect(
          denial.messages.map((message) => message.ruleId),
          path + ' ' + alias,
        ).toContain('@nx/enforce-module-boundaries');
      }
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      expect(options, path).toEqual({ ...peerOptions, allow: ['^@wbs/domain$'] });
      const source = await readFile(join(workspace, path), 'utf8');
      expect(importsAlias(source, '@wbs/domain'), path).toBe(true);
      const [actual] = await lint.lintText(source, { filePath: path });
      expect(actual.fatalErrorCount, path).toBe(0);
      expect(
        actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
        path,
      ).toEqual([]);
    }
    for (const path of [
      peer,
      'apps/twilight-structure/twilight-dash/cli/src/runs/dispatch-turn.test.ts',
    ]) {
      await readFile(join(workspace, path), 'utf8');
      const [denial] = await lint.lintText("await import('@wbs/domain');", { filePath: path });
      expect(denial.fatalErrorCount, path).toBe(0);
      expect(
        denial.messages.map((message) => message.ruleId),
        path,
      ).toContain('@nx/enforce-module-boundaries');
    }
  }, 30_000);

  // Proof: P1 removes the allowance and P2–P5 widen it; this policy test rejects each fault.
  it('Dash runtime-dispatch worker reaches only its exact public factories', async () => {
    const path =
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/runtime-dispatch-worker.ts';
    for (const alias of ['@wbs/contracts', '@twilight-burokrat/contracts']) {
      const [admission] = await lint.lintText('await import(' + JSON.stringify(alias) + ');', {
        filePath: path,
      });
      expect(admission.fatalErrorCount).toBe(0);
      expect(admission.messages.map((message) => message.ruleId)).not.toContain(
        '@nx/enforce-module-boundaries',
      );
      const source = await readFile(join(workspace, path), 'utf8');
      expect(importsAlias(source, alias)).toBe(true);
      for (const peer of [
        'apps/twilight-structure/twilight-dash/cli/src/runs/testing/memory-stores.ts',
        'apps/twilight-structure/twilight-dash/cli/src/runs/dispatch-turn.ts',
      ]) {
        await readFile(join(workspace, peer), 'utf8');
        const [denial] = await lint.lintText('await import(' + JSON.stringify(alias) + ');', {
          filePath: peer,
        });
        expect(denial.fatalErrorCount).toBe(0);
        expect(denial.messages.map((message) => message.ruleId)).toContain(
          '@nx/enforce-module-boundaries',
        );
      }
    }
    for (const alias of [
      '@wbs/store-memory',
      '@twilight-burokrat/judge',
      '@wbs/contracts/solver/supervisor-protocol',
      relative(dirname(path), 'libs/wbs/domain/contracts/src/index.ts'),
    ]) {
      const [denial] = await lint.lintText('await import(' + JSON.stringify(alias) + ');', {
        filePath: path,
      });
      expect(denial.fatalErrorCount).toBe(0);
      expect(denial.messages.map((message) => message.ruleId)).toContain(
        '@nx/enforce-module-boundaries',
      );
    }
    const source = await readFile(join(workspace, path), 'utf8');
    const [actual] = await lint.lintText(source, { filePath: path });
    expect(actual.fatalErrorCount).toBe(0);
    expect(
      actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
    ).toEqual([]);
    const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
    if (!isRecord(options)) throw new Error('worker policy missing');
    expect(options['allow']).toEqual(['^@twilight-burokrat/contracts$', '^@wbs/contracts$']);
  }, 30000);
  it('Dash runtime client admits only its two exact public consumers', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/runs/prepare-activity.ts';
    await readFile(join(workspace, peer), 'utf8');
    expect(await ruleIds(peer, "await import('@wbs/contracts');")).toContain(
      '@nx/enforce-module-boundaries',
    );
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash runtime client peer policy malformed');
    for (const name of ['runtime-client.ts', 'runtime-client.test.ts']) {
      const path = 'apps/twilight-structure/twilight-dash/cli/src/bridge/' + name;
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash runtime client policy malformed');
      // Functional assertions precede equality so valid policy faults show the actual edge.
      const [admission] = await lint.lintText("await import('@wbs/contracts');", {
        filePath: path,
      });
      expect(admission.fatalErrorCount, path).toBe(0);
      expect(
        admission.messages.map((message) => message.ruleId),
        path,
      ).not.toContain('@nx/enforce-module-boundaries');
      for (const alias of [
        '@wbs/store-memory',
        '@wbs/contracts/solver/supervisor-protocol',
        '@twilight-burokrat/contracts',
        '@twilight-burokrat/judge',
        relative(dirname(path), 'libs/wbs/domain/contracts/src/index.ts'),
      ]) {
        const [denial] = await lint.lintText(`await import('${alias}');`, { filePath: path });
        expect(denial.fatalErrorCount, path + ' ' + alias).toBe(0);
        expect(
          denial.messages.map((message) => message.ruleId),
          path + ' ' + alias,
        ).toContain('@nx/enforce-module-boundaries');
      }
      expect(options['allow'], path).toEqual(['^@wbs/contracts$']);
      const withoutAllowance: unknown = { ...options, allow: [] };
      expect(withoutAllowance, path).toEqual(peerOptions);
      const source = await readFile(join(workspace, path), 'utf8');
      expect(importsAlias(source, '@wbs/contracts'), path).toBe(true);
      const [actual] = await lint.lintText(source, { filePath: path });
      expect(actual.fatalErrorCount, path).toBe(0);
      expect(
        actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
        path,
      ).toEqual([]);
    }
  }, 30_000);

  it('Dash turn dispatch admits only its two exact public consumers', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/runs/prepare-activity.ts';
    await readFile(join(workspace, peer), 'utf8');
    expect(await ruleIds(peer, "await import('@wbs/contracts');")).toContain(
      '@nx/enforce-module-boundaries',
    );
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/runs/dispatch-turn.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/turn-dispatch-error.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/turn-dispatch-contract.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/dispatch-turn.test.ts',
    ])
      expect(await ruleIds(path, "await import('@wbs/contracts');")).toContain(
        '@nx/enforce-module-boundaries',
      );
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash turn dispatch peer policy malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/bridge/claim-client.ts',
      'apps/twilight-structure/twilight-dash/cli/src/bridge/claim-client.test.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash turn dispatch policy malformed');
      // Functional assertions precede equality so valid policy faults show the actual edge.
      const [admission] = await lint.lintText("await import('@wbs/contracts');", {
        filePath: path,
      });
      expect(admission.fatalErrorCount, path).toBe(0);
      expect(
        admission.messages.map((message) => message.ruleId),
        path,
      ).not.toContain('@nx/enforce-module-boundaries');
      for (const alias of [
        '@wbs/store-memory',
        '@wbs/contracts/solver/supervisor-protocol',
        '@twilight-burokrat/contracts',
        '@twilight-burokrat/judge',
        relative(dirname(path), 'libs/wbs/domain/contracts/src/index.ts'),
      ]) {
        const [denial] = await lint.lintText(`await import('${alias}');`, { filePath: path });
        expect(denial.fatalErrorCount, path + ' ' + alias).toBe(0);
        expect(
          denial.messages.map((message) => message.ruleId),
          path + ' ' + alias,
        ).toContain('@nx/enforce-module-boundaries');
      }
      expect(options['allow'], path).toEqual(['^@wbs/contracts$']);
      const withoutAllowance: unknown = { ...options, allow: [] };
      expect(withoutAllowance, path).toEqual(peerOptions);
      const source = await readFile(join(workspace, path), 'utf8');
      expect(importsAlias(source, '@wbs/contracts'), path).toBe(true);
      const [actual] = await lint.lintText(source, { filePath: path });
      expect(actual.fatalErrorCount, path).toBe(0);
      expect(
        actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
        path,
      ).toEqual([]);
    }
  }, 30_000);

  it('Dash progress and ledger reach exactly the contracts alias at their scoped paths', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/progress/record-progress.ts',
      'apps/twilight-structure/twilight-dash/cli/src/progress/record-progress.test.ts',
      'apps/twilight-structure/twilight-dash/cli/src/ledger/account-outcomes.ts',
      'apps/twilight-structure/twilight-dash/cli/src/ledger/rate-card.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash progress boundary options are malformed');
      expect(await ruleIds(path, "await import('@twilight-burokrat/contracts');")).not.toContain(
        '@nx/enforce-module-boundaries',
      );
      for (const alias of [
        '@twilight-burokrat/judge',
        '../../../../twilight-burokrat/cli/src/contracts',
      ]) {
        expect(await ruleIds(path, `await import('${alias}');`)).toContain(
          '@nx/enforce-module-boundaries',
        );
      }
      expect(options['allow']).toEqual(['^@twilight-burokrat/contracts$']);
      const withoutLocalAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutLocalAlias).toEqual(peerOptions);
    }
    for (const path of [
      peer,
      'apps/twilight-structure/twilight-dash/cli/src/clock.ts',
      'apps/twilight-structure/twilight-dash/cli/src/authority/claims.ts',
      'apps/twilight-structure/twilight-dash/cli/src/check-runs/run-activation-checks.ts',
    ])
      expect(await ruleIds(path, "await import('@twilight-burokrat/contracts');")).toContain(
        '@nx/enforce-module-boundaries',
      );
  }, 30_000);

  it('Dash runtime history consumes only the public WBS contract at four exact paths', async () => {
    const peers = [
      'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/plan-runtime.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/runtime-store.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/memory-stores.ts',
    ];
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peers[0]))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/runs/runtime-records.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/runtime-codecs.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/runtime-receipt.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/runtime-history-contract.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash runtime boundary options are malformed');
      const [admission] = await lint.lintText(
        "import type { RuntimeScope } from '@wbs/contracts';\nconst scope: RuntimeScope = { organizationId: 'o', projectId: 'p', personId: 'a' };\nvoid scope;",
        { filePath: path },
      );
      expect(admission.fatalErrorCount).toBe(0);
      expect(admission.messages.map((message) => message.ruleId)).not.toContain(
        '@nx/enforce-module-boundaries',
      );
      for (const alias of [
        '@wbs/store-memory',
        '@wbs/contracts/solver/supervisor-protocol',
        relative(dirname(path), 'libs/wbs/domain/contracts/src/index.ts'),
        '@twilight-burokrat/judge',
      ]) {
        const [denial] = await lint.lintText(`await import('${alias}');`, { filePath: path });
        expect(denial.fatalErrorCount).toBe(0);
        expect(denial.messages.map((message) => message.ruleId)).toContain(
          '@nx/enforce-module-boundaries',
        );
      }
      expect(options['allow']).toEqual(['^@wbs/contracts$']);
      const withoutRuntimeAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutRuntimeAlias).toEqual(peerOptions);
      const source = await readFile(join(workspace, path), 'utf8');
      expect(importsAlias(source, '@wbs/contracts')).toBe(true);
      const [actual] = await lint.lintText(source, { filePath: path });
      expect(actual.fatalErrorCount).toBe(0);
      expect(
        actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
      ).toEqual([]);
    }
    for (const path of peers)
      expect(await ruleIds(path, "await import('@wbs/contracts');")).toContain(
        '@nx/enforce-module-boundaries',
      );
  }, 30_000);

  it('Dash claim builder consumes only the exact public encoder at its source path', async () => {
    const root = 'apps/twilight-structure/twilight-dash/cli/src/runs/';
    const path = root + 'build-claim-request.ts';
    const peer = root + 'prepare-activity.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('claim builder peer policy malformed');
    const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
    if (!isRecord(options)) throw new Error('claim builder policy malformed');
    const source = await readFile(join(workspace, path), 'utf8');
    expect(importsAlias(source, '@wbs/contracts')).toBe(true);
    expect(source).toContain("import { canonicalRuntimeRequest } from '@wbs/contracts';");
    const [actual] = await lint.lintText(source, { filePath: path });
    expect(actual.fatalErrorCount).toBe(0);
    expect(
      actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
    ).toEqual([]);
    for (const alias of [
      '@wbs/store-memory',
      '@wbs/contracts/solver/supervisor-protocol',
      '@twilight-burokrat/judge',
      relative(dirname(path), 'libs/wbs/domain/contracts/src/index.ts'),
    ]) {
      const [denial] = await lint.lintText("await import('" + alias + "');", { filePath: path });
      expect(denial.fatalErrorCount).toBe(0);
      expect(
        denial.messages.map((message) => message.ruleId),
        alias,
      ).toContain('@nx/enforce-module-boundaries');
    }
    for (const denied of [root + 'build-claim-request.test.ts', peer]) {
      const [denial] = await lint.lintText("await import('@wbs/contracts');", { filePath: denied });
      expect(denial.fatalErrorCount).toBe(0);
      expect(
        denial.messages.map((message) => message.ruleId),
        denied,
      ).toContain('@nx/enforce-module-boundaries');
    }
    expect(options['allow']).toEqual(['^@wbs/contracts$']);
    const withoutAllowance: Readonly<Record<string, unknown>> = { ...options, allow: [] };
    expect(withoutAllowance).toEqual(peerOptions);
  }, 30_000);

  it('runtime state reader has exact WBS contract admission', async () => {
    const root = 'apps/twilight-structure/twilight-dash/cli/src/runs/';
    const path = root + 'runtime-state.ts';
    const [admission] = await lint.lintText("await import('@wbs/contracts');", { filePath: path });
    expect(admission.fatalErrorCount, 'reader admission parses').toBe(0);
    expect(
      admission.messages.map((message) => message.ruleId),
      'reader WBS admission',
    ).not.toContain('@nx/enforce-module-boundaries');
    const source = await readFile(join(workspace, path), 'utf8');
    expect(importsAlias(source, '@wbs/contracts')).toBe(true);
    const [actual] = await lint.lintText(source, { filePath: path });
    expect(actual.fatalErrorCount, 'reader source parses').toBe(0);
    expect(
      actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
    ).toEqual([]);
    for (const name of ['plan-execution.ts', 'record-preparation.ts']) {
      const peer = root + name;
      await readFile(join(workspace, peer), 'utf8');
      const [denial] = await lint.lintText("await import('@wbs/contracts');", { filePath: peer });
      expect(denial.fatalErrorCount, name + ' parses').toBe(0);
      expect(
        denial.messages.map((message) => message.ruleId),
        name + ' denies WBS contracts',
      ).toContain('@nx/enforce-module-boundaries');
    }
  }, 30_000);

  it('Dash durable execution admits only exact public consumers and denies adjacent paths', async () => {
    const root = 'apps/twilight-structure/twilight-dash/cli/src/runs/';
    const peerOptions = boundaryOf(
      await lint.calculateConfigForFile(root + 'plan-execution.ts'),
    )[1];
    if (!isRecord(peerOptions)) throw new Error('execution peer policy malformed');
    for (const [paths, aliases] of [
      [['claim-records.ts', 'testing/execution-contract.ts'], ['@wbs/contracts']],
      [
        ['claim-history.ts', 'execution-history.test.ts', 'record-preparation.ts'],
        ['@twilight-burokrat/contracts'],
      ],
      [['testing/fixtures.ts'], ['@twilight-burokrat/contracts', '@wbs/contracts']],
    ] as const) {
      for (const name of paths) {
        const path = root + name;
        const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
        if (!isRecord(options)) throw new Error('execution consumer policy malformed');
        expect(options['allow'], path).toEqual(aliases.map((alias) => '^' + alias + '$'));
        const withoutAllowance: unknown = { ...options, allow: [] };
        expect(withoutAllowance, path).toEqual(peerOptions);
        const source = await readFile(join(workspace, path), 'utf8');
        for (const alias of aliases) {
          const [admission] = await lint.lintText(`await import('${alias}');`, { filePath: path });
          expect(admission.fatalErrorCount, path).toBe(0);
          expect(
            admission.messages.map((message) => message.ruleId),
            path + ' ' + alias,
          ).not.toContain('@nx/enforce-module-boundaries');
          expect(importsAlias(source, alias), path + ' consumes ' + alias).toBe(true);
        }
        for (const alias of [
          '@twilight-burokrat/judge',
          '@wbs/store-memory',
          '@wbs/contracts/solver/supervisor-protocol',
          relative(dirname(path), 'libs/wbs/domain/contracts/src/index.ts'),
          relative(
            dirname(path),
            'apps/twilight-structure/twilight-burokrat/cli/src/contracts/index.ts',
          ),
          ...(['@wbs/contracts', '@twilight-burokrat/contracts'] as const).filter(
            (alias) => !aliases.some((allowed) => allowed === alias),
          ),
        ]) {
          const [denial] = await lint.lintText(`await import('${alias}');`, { filePath: path });
          expect(denial.fatalErrorCount, path).toBe(0);
          expect(
            denial.messages.map((message) => message.ruleId),
            path + ' denies ' + alias,
          ).toContain('@nx/enforce-module-boundaries');
        }
        const [actual] = await lint.lintText(source, { filePath: path });
        expect(actual.fatalErrorCount).toBe(0);
        expect(
          actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
          path,
        ).toEqual([]);
      }
    }
    for (const name of [
      'plan-execution.ts',
      'plan-claims.ts',
      'execution-codecs.ts',
      'validate-history.ts',
      'runtime-history.ts',
      'sqlite/run-store.ts',
      'testing/memory-stores.ts',
      'run-store.test.ts',
    ]) {
      for (const alias of ['@wbs/contracts', '@twilight-burokrat/contracts'])
        expect(await ruleIds(root + name, `await import('${alias}');`), name).toContain(
          '@nx/enforce-module-boundaries',
        );
    }
  }, 30_000);

  for (const [name, alias] of [
    ['claim-records.ts', '@wbs/contracts'],
    ['testing/execution-contract.ts', '@wbs/contracts'],
    ['claim-history.ts', '@twilight-burokrat/contracts'],
    ['execution-history.test.ts', '@twilight-burokrat/contracts'],
    ['record-preparation.ts', '@twilight-burokrat/contracts'],
    ['runtime-state.ts', '@wbs/contracts'],
    ['testing/fixtures.ts', '@twilight-burokrat/contracts'],
    ['testing/fixtures.ts', '@wbs/contracts'],
  ] as const) {
    it(
      'Dash durable execution functionally admits ' + name + ' ' + alias,
      async () => {
        const path = 'apps/twilight-structure/twilight-dash/cli/src/runs/' + name;
        const admissionReports = await lint.lintText("await import('" + alias + "');", {
          filePath: path,
        });
        const admission = admissionReports.at(0);
        if (admission === undefined) throw new Error('missing durable policy admission report');
        expect(admission.fatalErrorCount).toBe(0);
        expect(admission.messages.map((message) => message.ruleId)).not.toContain(
          '@nx/enforce-module-boundaries',
        );
      },
      30_000,
    );
  }
  it('Dash durable execution functionally denies claim helper judge', async () => {
    const denialReports = await lint.lintText("await import('@twilight-burokrat/judge');", {
      filePath: 'apps/twilight-structure/twilight-dash/cli/src/runs/claim-history.ts',
    });
    const denial = denialReports.at(0);
    if (denial === undefined) throw new Error('missing durable policy judge report');
    expect(denial.fatalErrorCount).toBe(0);
    expect(denial.messages.map((message) => message.ruleId)).toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30_000);
  it('Dash durable execution functionally denies adjacent test contracts', async () => {
    const denialReports = await lint.lintText("await import('@twilight-burokrat/contracts');", {
      filePath: 'apps/twilight-structure/twilight-dash/cli/src/runs/run-store.test.ts',
    });
    const denial = denialReports.at(0);
    if (denial === undefined) throw new Error('missing durable policy peer report');
    expect(denial.fatalErrorCount).toBe(0);
    expect(denial.messages.map((message) => message.ruleId)).toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30_000);

  it('Dash manifest binding consumes only the contracts alias at two exact paths', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/runs/manifest-binding.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/manifest-binding-contract.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options))
        throw new Error('Dash manifest binding boundary options are malformed');
      const [admission] = await lint.lintText("await import('@twilight-burokrat/contracts');", {
        filePath: path,
      });
      expect(admission.fatalErrorCount).toBe(0);
      expect(admission.messages.map((message) => message.ruleId)).not.toContain(
        '@nx/enforce-module-boundaries',
      );
      for (const alias of [
        '@twilight-burokrat/judge',
        '@tools/fleet-plan',
        relative(
          dirname(path),
          'apps/twilight-structure/twilight-burokrat/cli/src/contracts/index.ts',
        ),
      ]) {
        const [denial] = await lint.lintText(`await import('${alias}');`, { filePath: path });
        expect(denial.fatalErrorCount).toBe(0);
        expect(denial.messages.map((message) => message.ruleId)).toContain(
          '@nx/enforce-module-boundaries',
        );
      }
      expect(options['allow']).toEqual(['^@twilight-burokrat/contracts$']);
      const withoutRecoveryAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutRecoveryAlias).toEqual(peerOptions);
      const source = await readFile(join(workspace, path), 'utf8');
      expect(importsAlias(source, '@twilight-burokrat/contracts')).toBe(true);
      const [actual] = await lint.lintText(source, { filePath: path });
      expect(actual.fatalErrorCount).toBe(0);
      expect(
        actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
      ).toEqual([]);
    }
    for (const path of [
      peer,
      'apps/twilight-structure/twilight-dash/cli/src/runs/plan-ownership.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/testing/memory-stores.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/run-store.ts',
    ])
      expect(await ruleIds(path, "await import('@twilight-burokrat/contracts');")).toContain(
        '@nx/enforce-module-boundaries',
      );
  }, 30_000);

  it('Dash run storage reaches exactly the contracts alias at its two scoped paths', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/runs/record-codecs.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/plan-admission.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash run storage boundary options are malformed');
      expect(await ruleIds(path, "await import('@twilight-burokrat/contracts');")).not.toContain(
        '@nx/enforce-module-boundaries',
      );
      for (const alias of [
        '@twilight-burokrat/judge',
        '../../../../twilight-burokrat/cli/src/contracts',
      ]) {
        expect(
          await ruleIds(path, `await import('${alias}');`),
          `reject ${alias} from ${path}`,
        ).toContain('@nx/enforce-module-boundaries');
      }
      expect(options['allow']).toEqual(['^@twilight-burokrat/contracts$']);
      const withoutLocalAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutLocalAlias).toEqual(peerOptions);
    }
    for (const path of [
      peer,
      'apps/twilight-structure/twilight-dash/cli/src/clock.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/plan-ownership.ts',
      'apps/twilight-structure/twilight-dash/cli/src/authority/claims.ts',
      'apps/twilight-structure/twilight-dash/cli/src/check-runs/run-activation-checks.ts',
    ])
      expect(
        await ruleIds(path, "await import('@twilight-burokrat/contracts');"),
        `reject contracts alias from ${path}`,
      ).toContain('@nx/enforce-module-boundaries');
  }, 30_000);

  it('Dash executor reaches exactly the contracts alias at its seven scoped paths', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    async function executorRuleIds(path: string, alias: string) {
      const [report] = await lint.lintText(`await import('${alias}');`, { filePath: path });
      expect(report.fatalErrorCount, `valid parser/config for ${path}`).toBe(0);
      return report.messages.map((message) => message.ruleId);
    }
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/agents/execution-records.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/activity-executor.test.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-settings.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-settings.test.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-turn.test.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-adapter.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-adapter.test.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash executor boundary options are malformed');
      expect(
        await executorRuleIds(path, '@twilight-burokrat/contracts'),
        `admit contracts from ${path}`,
      ).not.toContain('@nx/enforce-module-boundaries');
      for (const alias of [
        '@twilight-burokrat/judge',
        '@tools/fleet-plan',
        '../../../../twilight-burokrat/cli/src/contracts',
      ])
        expect(await executorRuleIds(path, alias), `reject ${alias} from ${path}`).toContain(
          '@nx/enforce-module-boundaries',
        );
      expect(options['allow']).toEqual(['^@twilight-burokrat/contracts$']);
      const withoutLocalAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutLocalAlias).toEqual(peerOptions);
      const source = await readFile(join(workspace, path), 'utf8');
      expect(
        importsAlias(source, '@twilight-burokrat/contracts'),
        `live contracts consumer ${path}`,
      ).toBe(true);
      const [actual] = await lint.lintText(source, { filePath: path });
      expect(actual.fatalErrorCount).toBe(0);
      expect(
        actual.messages.filter((message) => message.ruleId === '@nx/enforce-module-boundaries'),
      ).toEqual([]);
    }
    for (const path of [
      peer,
      'apps/twilight-structure/twilight-dash/cli/src/agents/activity-executor.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/execution-codecs.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/value-codecs.ts',
      'apps/twilight-structure/twilight-dash/cli/src/agents/api-model-turn.ts',
      'apps/twilight-structure/twilight-dash/cli/src/runs/plan-ownership.ts',
      'apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts',
    ])
      expect(
        await executorRuleIds(path, '@twilight-burokrat/contracts'),
        `reject contracts alias from unlisted peer ${path}`,
      ).toContain('@nx/enforce-module-boundaries');
  }, 30_000);

  it('a UI kit reaches shared browser code and nothing of a product or of Bun', async () => {
    // The design system's kits are `product:shared ring:adapter runtime:browser`
    // (`openspec/changes/design-system-foundation`): a product may reach them, so
    // they may reach no product back, and a browser package may reach no Bun one.
    const path = 'libs/shared/adapters/ui-core-01/src/index.ts';
    expect(await ruleIds(path, "await import('@shared/validation');")).not.toContain(
      '@nx/enforce-module-boundaries',
    );
    // `@wbs/domain` is the product fence alone: it is `ring:domain runtime:isomorphic`, which
    // every other rule admits, so only `product:shared` refuses it. The rest trip the ring and
    // runtime fences as well and would pass a mistagged product.
    // Proof: with the lib tagged `product:wbs` instead and the project graph refreshed
    // (`nx show project shared-ui-core-01`; the in-process lint reads the cached graph, so a
    // tag edit alone changes nothing), `@wbs/domain` linted clean and this case failed on
    // `Expected to contain: "@nx/enforce-module-boundaries"` (2026-10-21).
    for (const alias of [
      '@wbs/domain',
      '@wbs/core',
      '@wbs/realtime',
      '@wbs/store-sqlite',
      '@tools/fleet-plan',
    ]) {
      expect(await ruleIds(path, `await import('${alias}');`), alias).toContain(
        '@nx/enforce-module-boundaries',
      );
    }
  }, 30_000);

  it('keeps every root production boundary for the Dash planner except its exact local alias', async () => {
    const cliPath = 'apps/twilight-structure/twilight-dash/cli/src/cli.ts';
    const peerPath = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const cliBoundary = boundaryOf(await lint.calculateConfigForFile(cliPath));
    const peerBoundary = boundaryOf(await lint.calculateConfigForFile(peerPath));
    const cliOptions = cliBoundary[1];
    const peerOptions = peerBoundary[1];
    if (!isRecord(cliOptions) || !isRecord(peerOptions)) {
      throw new Error('Dash production boundary options are malformed');
    }
    expect(cliBoundary[0]).toEqual(peerBoundary[0]);
    expect(cliOptions['allow']).toEqual(['^@tools/fleet-plan$', '^@twilight-burokrat/judge$']);
    const withoutLocalAlias: Readonly<Record<string, unknown>> = { ...cliOptions, allow: [] };
    expect(withoutLocalAlias).toEqual(peerOptions);

    expect(await ruleIds(cliPath, "await import('@tools/fleet-plan');")).not.toContain(
      '@nx/enforce-module-boundaries',
    );
    expect(await ruleIds(cliPath, "await import('@tools/deploy-contract');")).toContain(
      '@nx/enforce-module-boundaries',
    );
    expect(await ruleIds(peerPath, "await import('@tools/fleet-plan');")).toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30_000);

  it('lets Dash tests reach only the planner facade, scratch helper and clock-read detector', async () => {
    const testPath = 'apps/twilight-structure/twilight-dash/cli/src/cli.test.ts';
    const peerPath = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const testOptions = boundaryOf(await lint.calculateConfigForFile(testPath))[1];
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peerPath))[1];
    if (!isRecord(testOptions) || !isRecord(peerOptions)) {
      throw new Error('Dash test boundary options are malformed');
    }
    expect(testOptions['allow']).toEqual([
      '^@tools/fleet-plan$',
      '^@tools/test-clock-reads$',
      '^@tools/test-scratch$',
      '^@twilight-burokrat/judge$',
    ]);
    const withoutLocalAliases: Readonly<Record<string, unknown>> = { ...testOptions, allow: [] };
    expect(withoutLocalAliases).toEqual(peerOptions);
    // Proof: widening the Dash test override to `['^@tools/']` failed this test at the exact
    // allow-list assertion (2026-10-11); the sibling import below keeps the remaining fences live.
    expect(await ruleIds(testPath, "await import('@tools/deploy-contract');")).toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30_000);

  it('lets Burokrat tests reach only the clock-read detector', async () => {
    const testPath = 'apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts';
    const peerPath = 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts';
    const testOptions = boundaryOf(await lint.calculateConfigForFile(testPath))[1];
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peerPath))[1];
    if (!isRecord(testOptions) || !isRecord(peerOptions)) {
      throw new Error('Burokrat test boundary options are malformed');
    }
    // Proof: widening the Burokrat test override to `['^@tools/']` failed this test at the exact
    // allow-list assertion (2026-10-12).
    expect(testOptions['allow']).toEqual(['^@tools/test-clock-reads$']);
    const withoutDetector: Readonly<Record<string, unknown>> = { ...testOptions, allow: [] };
    expect(withoutDetector).toEqual(peerOptions);
    expect(
      await ruleIds(testPath, "import { findClockReads } from '@tools/test-clock-reads';"),
    ).not.toContain('@nx/enforce-module-boundaries');
    expect(await ruleIds(testPath, "await import('@tools/test-scratch');")).toContain(
      '@nx/enforce-module-boundaries',
    );
    expect(
      await ruleIds(peerPath, "import { findClockReads } from '@tools/test-clock-reads';"),
    ).toContain('@nx/enforce-module-boundaries');
  }, 30_000);

  it('Dash authority reaches only the judge alias', async () => {
    const authorityPath = 'apps/twilight-structure/twilight-dash/cli/src/authority/claims.ts';
    const peerPath = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const authorityOptions = boundaryOf(await lint.calculateConfigForFile(authorityPath))[1];
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peerPath))[1];
    if (!isRecord(authorityOptions) || !isRecord(peerOptions)) {
      throw new Error('Dash authority boundary options are malformed');
    }
    // Proof: widening the authority override to `['^@twilight-burokrat/']` failed this test at
    // the exact allow-list assertion (2026-10-11).
    expect(authorityOptions['allow']).toEqual(['^@twilight-burokrat/judge$']);
    const withoutJudgeAlias: Readonly<Record<string, unknown>> = {
      ...authorityOptions,
      allow: [],
    };
    expect(withoutJudgeAlias).toEqual(peerOptions);
    expect(
      await ruleIds(authorityPath, "import { hashBytes } from '@twilight-burokrat/judge';"),
    ).not.toContain('@nx/enforce-module-boundaries');
    expect(
      await ruleIds(
        authorityPath,
        "import { decodeAdmissionPacket } from '../../../../twilight-burokrat/cli/src/admission-judge/packet-codec';",
      ),
    ).toContain('@nx/enforce-module-boundaries');
    expect(await ruleIds(authorityPath, "await import('@tools/fleet-plan');")).toContain(
      '@nx/enforce-module-boundaries',
    );
    expect(
      await ruleIds(peerPath, "import { hashBytes } from '@twilight-burokrat/judge';"),
    ).toContain('@nx/enforce-module-boundaries');
  }, 30_000);

  it('Dash activation reaches only the judge alias', async () => {
    const peerPath = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peerPath))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/activation/controller.ts',
      'apps/twilight-structure/twilight-dash/cli/src/activation/testing/observation-close-process.ts',
      'apps/twilight-structure/twilight-dash/cli/src/activation/units/render.ts',
      'apps/twilight-structure/twilight-dash/cli/src/check-runs/run-activation-checks.ts',
      'apps/twilight-structure/twilight-dash/cli/src/review/invoker.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error(`Dash boundary options are malformed: ${path}`);
      // Proof: widening the activation override to `['^@twilight-burokrat/']` failed this test at
      // the exact allow-list assertion (2026-10-12).
      expect(options['allow'], path).toEqual(['^@twilight-burokrat/judge$']);
      const withoutJudgeAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutJudgeAlias, path).toEqual(peerOptions);
      expect(
        await ruleIds(path, "import { hashBytes } from '@twilight-burokrat/judge';"),
        path,
      ).not.toContain('@nx/enforce-module-boundaries');
      const judgeModule = relative(
        dirname(path),
        'apps/twilight-structure/twilight-burokrat/cli/src/review/invocation-journal',
      );
      expect(
        await ruleIds(path, `import { readInvocationJournal } from '${judgeModule}';`),
        path,
      ).toContain('@nx/enforce-module-boundaries');
      expect(await ruleIds(path, "await import('@tools/fleet-plan');"), path).toContain(
        '@nx/enforce-module-boundaries',
      );
    }
  }, 30_000);

  it('Dash resources reach only the WBS transport contract at their scoped paths', async () => {
    const peer = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peer))[1];
    if (!isRecord(peerOptions)) throw new Error('Dash peer boundary options are malformed');
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/resources/runtime.ts',
      'apps/twilight-structure/twilight-dash/cli/src/resources/runtime.test.ts',
    ]) {
      const options = boundaryOf(await lint.calculateConfigForFile(path))[1];
      if (!isRecord(options)) throw new Error('Dash resources boundary options malformed');
      expect(options['allow']).toEqual(['^@wbs/contracts$']);
      const withoutWbsAlias: Readonly<Record<string, unknown>> = { ...options, allow: [] };
      expect(withoutWbsAlias).toEqual(peerOptions);
      expect(await ruleIds(path, "await import('@wbs/contracts');")).not.toContain(
        '@nx/enforce-module-boundaries',
      );
      for (const specifier of [
        '@wbs/core',
        '@wbs/contracts/ws-frames',
        '../../../../../../libs/wbs/domain/contracts/src/index',
      ])
        expect(await ruleIds(path, `await import('${specifier}');`)).toContain(
          '@nx/enforce-module-boundaries',
        );
    }
    expect(await ruleIds(peer, "await import('@wbs/contracts');")).toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30000);

  it('Dash compute reaches only the SSH transport facade', async () => {
    const computePath = 'apps/twilight-structure/twilight-dash/cli/src/compute/ssh-host.ts';
    const peerPath = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const computeOptions = boundaryOf(await lint.calculateConfigForFile(computePath))[1];
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peerPath))[1];
    if (!isRecord(computeOptions) || !isRecord(peerOptions)) {
      throw new Error('Dash compute boundary options are malformed');
    }
    // Proof: widening the compute override to `['^@tools/fleet']`, and scoping it to a directory
    // that does not exist, each failed this test at the exact allow-list assertion (2026-10-22).
    expect(computeOptions['allow']).toEqual(['^@tools/fleet-ssh-transport$']);
    const computeOptionsWithoutAllowance: Readonly<Record<string, unknown>> = {
      ...computeOptions,
      allow: [],
    };
    expect(computeOptionsWithoutAllowance).toEqual(peerOptions);
    expect(
      await ruleIds(computePath, "import { readSshTransport } from '@tools/fleet-ssh-transport';"),
    ).not.toContain('@nx/enforce-module-boundaries');
    for (const specifier of [
      '@tools/fleet-plan',
      '@tools/deploy-contract',
      '../../../../../../tools/tool-fleet/src/ssh-transport',
    ]) {
      expect(await ruleIds(computePath, `await import('${specifier}');`), specifier).toContain(
        '@nx/enforce-module-boundaries',
      );
    }
    expect(
      await ruleIds(peerPath, "import { readSshTransport } from '@tools/fleet-ssh-transport';"),
    ).toContain('@nx/enforce-module-boundaries');
  }, 30_000);

  it('keeps Dash authority test helpers out of production modules', async () => {
    const helperImport = "import { openOrBootstrapAuthority } from './testing/open-or-bootstrap';";
    // Proof: removing Dash's production `@typescript-eslint/no-restricted-imports` override let
    // claims.ts import the fixture helper without a diagnostic (2026-10-11).
    for (const path of [
      'apps/twilight-structure/twilight-dash/cli/src/authority/claims.ts',
      'apps/twilight-structure/twilight-dash/cli/src/authority/testing/open-or-bootstrap.ts',
    ]) {
      expect(await ruleIds(path, helperImport), path).toContain(
        '@typescript-eslint/no-restricted-imports',
      );
    }
    expect(
      await ruleIds(
        'apps/twilight-structure/twilight-dash/cli/src/cli.ts',
        "import { openOrBootstrapAuthority } from './authority/testing/open-or-bootstrap';",
      ),
    ).toContain('@typescript-eslint/no-restricted-imports');
    expect(
      await ruleIds(
        'apps/twilight-structure/twilight-dash/cli/src/authority/claims.db.test.ts',
        helperImport,
      ),
    ).not.toContain('@typescript-eslint/no-restricted-imports');
  }, 30_000);

  it('lets Navigator reach exactly the Burokrat and WBS record contracts', async () => {
    const navigatorPath = 'apps/twilight-structure/twilight-navigator/cli/src/plan-reference.ts';
    const peerPath = 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts';
    const navigatorOptions = boundaryOf(await lint.calculateConfigForFile(navigatorPath))[1];
    const peerOptions = boundaryOf(await lint.calculateConfigForFile(peerPath))[1];
    if (!isRecord(navigatorOptions) || !isRecord(peerOptions)) {
      throw new Error('Navigator boundary options are malformed');
    }
    expect(navigatorOptions['allow']).toEqual([
      '^@twilight-burokrat/contracts$',
      '^@wbs/contracts$',
    ]);
    const withoutRecordAliases: Readonly<Record<string, unknown>> = {
      ...navigatorOptions,
      allow: [],
    };
    expect(withoutRecordAliases).toEqual(peerOptions);
    // Proof: widening the Navigator override's WBS entry to `^@wbs/` failed this test at the
    // exact allow-list assertion (2026-10-11); the sibling probes keep the remaining fences live.
    for (const sibling of ['@wbs/core', '@tools/fleet-plan', '@wbs/contracts/ws-frames']) {
      expect(await ruleIds(navigatorPath, `await import('${sibling}');`)).toContain(
        '@nx/enforce-module-boundaries',
      );
    }
    expect(await ruleIds(peerPath, "await import('@twilight-burokrat/contracts');")).toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30_000);

  it('rejects runtime packages and drivers from core and domain production', async () => {
    // Proof: before the core/domain production override existed, the Elysia
    // probe returned no `no-restricted-imports` diagnostic. Real uncached lint
    // targets then rejected Elysia, node:crypto, drizzle-orm and bun:sqlite at
    // their injected import lines (2026-09-10).
    for (const [path, source] of [
      ['libs/wbs/application/core/src/index.ts', "import 'elysia';"],
      ['libs/wbs/application/core/src/index.ts', "import 'drizzle-orm';"],
      ['libs/wbs/application/core/src/index.ts', "import 'bun:sqlite';"],
      ['libs/wbs/application/core/src/index.ts', "import 'jose';"],
      ['libs/wbs/domain/domain/src/index.ts', "import 'node:crypto';"],
    ] as const) {
      expect(await ruleIds(path, source), `${path}: ${source}`).toContain('no-restricted-imports');
    }
  }, 30_000);

  it('rejects ambient runtime defaults from core production', async () => {
    // Proof: before the global fence existed, `Bun.version` produced only
    // `no-unused-expressions`; this case failed because it did not contain
    // `no-restricted-globals` (2026-09-10).
    for (const source of [
      'Bun.version;',
      'process.cwd();',
      "fetch('https://example.invalid');",
      'setTimeout(() => undefined, 1);',
      'setInterval(() => undefined, 1);',
      "Buffer.from('x');",
    ]) {
      expect(await ruleIds('libs/wbs/application/core/src/index.ts', source), source).toContain(
        'no-restricted-globals',
      );
    }
  }, 30_000);

  it('rejects both spellings of globalThis fetch from core production', async () => {
    // Proof: before both selectors existed, the dot spelling produced only
    // `no-floating-promises`; the effective test failed on the absent
    // `no-restricted-syntax`. The computed spelling later failed the uncached
    // core lint target at column 24 (2026-09-10).
    for (const source of [
      "globalThis.fetch('https://example.invalid');",
      "globalThis['fetch']('https://example.invalid');",
    ]) {
      expect(await ruleIds('libs/wbs/application/core/src/index.ts', source), source).toContain(
        'no-restricted-syntax',
      );
    }
  }, 30_000);

  it('keeps browser adapters outside the application ring in production and tests', async () => {
    // Proof: without the combined browser-adapter constraint, the production
    // probe returned no boundary diagnostic. The same edge injected into the
    // tracked frontend test failed fe-01:lint with the combined-tag message,
    // proving the test override retains this runtime boundary (2026-09-10).
    for (const path of [
      'apps/wbs/fe-01/src/components/wbs/plan-completeness.ts',
      'apps/wbs/fe-01/src/components/wbs/plan-completeness.test.ts',
    ]) {
      expect(await ruleIds(path, "import '@wbs/core';"), path).toContain(
        '@nx/enforce-module-boundaries',
      );
    }
  }, 30_000);

  it('rejects outer rings from domain production', async () => {
    // Proof: deleting the `ring:domain` constraint failed the effective-config
    // assertion on its exact missing object. Importing the non-circular,
    // isomorphic shared adapter supervisor protocol from tracked domain
    // production then failed the uncached domain lint target with “A project
    // tagged with \"ring:domain\" can only depend on libs tagged with
    // \"ring:domain\"” (2026-09-10).
    const config: unknown = await lint.calculateConfigForFile(
      'libs/wbs/domain/domain/src/index.ts',
    );
    const boundary = boundaryOf(config);
    const options = boundary[1];
    if (!isRecord(options) || !Array.isArray(options['depConstraints'])) {
      throw new Error('ESLint returned malformed domain boundary options');
    }
    expect(options['depConstraints']).toContainEqual({
      sourceTag: 'ring:domain',
      onlyDependOnLibsWithTags: ['ring:domain'],
    });
    expect(
      await ruleIds(
        'libs/wbs/domain/domain/src/index.ts',
        "import '@wbs/contracts/solver/supervisor-protocol';",
      ),
    ).toContain('@nx/enforce-module-boundaries');
  }, 30_000);

  it('rejects TypeBox across the repository', async () => {
    // Proof: deleting the repository-wide restriction made this tools/dev
    // production probe fail because `no-restricted-imports` was absent. The
    // same import in tracked tools/dev production failed its uncached lint
    // target with the ArkType diagnostic (2026-09-10).
    expect(
      await ruleIds('tools/dev/setup.ts', "import { Type } from '@sinclair/typebox'; void Type;"),
    ).toContain('no-restricted-imports');
  }, 30_000);

  it('permits bun:test only in core tests', async () => {
    // Proof: a temporary core test passed both core:lint and Bun (1 pass), then
    // its adjacent production sibling failed core:lint at the `bun:test`
    // import with `no-restricted-imports` (2026-09-10).
    expect(
      await ruleIds(
        'libs/wbs/application/core/src/ports/clock.test.ts',
        "import { describe } from 'bun:test'; describe('boundary', () => undefined);",
      ),
    ).not.toContain('no-restricted-imports');
    expect(await ruleIds('libs/wbs/application/core/src/index.ts', "import 'bun:test';")).toContain(
      'no-restricted-imports',
    );
  }, 30_000);

  it('applies the ring-only test exception to every tracked suffix and fixture', async () => {
    // Proof: before the runtime-only test override replaced the blanket `off`,
    // this case received severity 0 for `example.test.ts` instead of 2
    // (2026-09-10). With the scope constraints omitted from that replacement,
    // the new assertion failed because `scope:app` was absent. Importing
    // `@tools/compose` from config's tracked `define-config.test.ts` then
    // failed the uncached config lint target with “A project tagged with
    // \"scope:shared\" can only depend on libs tagged with \"scope:shared\"”.
    for (const path of [
      'libs/wbs/application/core/src/example.test.ts',
      'libs/wbs/application/core/src/example.test.tsx',
      'libs/wbs/application/core/src/example.spec.ts',
      'libs/wbs/application/core/src/example.property.test.ts',
      'libs/wbs/application/core/src/testing/example.ts',
    ]) {
      const config: unknown = await lint.calculateConfigForFile(path);
      const boundary = boundaryOf(config);
      expect(boundary[0], path).toBe(2);
      const options = boundary[1];
      if (!isRecord(options) || !Array.isArray(options['depConstraints'])) {
        throw new Error(`ESLint returned malformed boundary options for ${path}`);
      }
      expect(options['depConstraints'], path).toContainEqual({
        allSourceTags: ['ring:adapter', 'runtime:browser'],
        onlyDependOnLibsWithTags: ['ring:domain', 'runtime:browser'],
      });
      expect(options['depConstraints'], path).toContainEqual({
        sourceTag: 'scope:app',
        onlyDependOnLibsWithTags: ['scope:shared'],
      });
      expect(options['depConstraints'], path).toContainEqual({
        sourceTag: 'scope:shared',
        onlyDependOnLibsWithTags: ['scope:shared'],
      });
      expect(options['depConstraints'], path).not.toContainEqual(
        expect.objectContaining({ sourceTag: 'ring:application' }),
      );
    }
  });

  it('keeps generated product boundaries in production and every test override', async () => {
    for (const path of [
      'libs/wbs/application/core/src/index.ts',
      'libs/wbs/application/core/src/example.test.ts',
      'libs/wbs/application/core/src/testing/example.ts',
      'libs/wbs/adapters/store-memory/src/source.test.ts',
    ]) {
      const config: unknown = await lint.calculateConfigForFile(path);
      const boundary = boundaryOf(config);
      const options = boundary[1];
      if (!isRecord(options) || !Array.isArray(options['depConstraints'])) {
        throw new Error(`ESLint returned malformed boundary options for ${path}`);
      }
      expect(options['depConstraints'], path).toContainEqual({
        sourceTag: 'product:wbs',
        onlyDependOnLibsWithTags: ['product:wbs', 'product:shared'],
      });
      // The sole `scope:infra` rule is the generated one, at the production `nxRules` site
      // and in every test override alike: a product-less tool reaches infra and the shared
      // product, never another product's `scope:shared` library.
      // Proof: restoring the old `{ sourceTag: 'scope:infra', onlyDependOnLibsWithTags:
      // ['scope:shared', 'scope:infra'] }` entry in `scopeConstraints` failed this case on
      // `libs/wbs/application/core/src/index.ts` with `Expected - 0 · Received + 7`, the
      // second infra entry. While this check sat in the test-override case above, that
      // production path went unchecked and the duplicate passed (2026-09-15).
      expect(
        options['depConstraints'].filter(
          (constraint: unknown) =>
            isRecord(constraint) && constraint['sourceTag'] === 'scope:infra',
        ),
        path,
      ).toEqual([
        { sourceTag: 'scope:infra', onlyDependOnLibsWithTags: ['scope:infra', 'product:shared'] },
      ]);
    }
  });

  it('names exactly the two pending infra-to-product exceptions and each is still used', async () => {
    // Production and test alike: the generic test override carries its own `allow: []`, so the
    // tools block only reaches the supervisor tests while it follows that override.
    for (const path of [
      'tools/tool-remote-scripts/src/lib/docker.ts',
      'tools/tool-remote-scripts/src/lib/solver-supervisor-channel.test.ts',
    ]) {
      const config: unknown = await lint.calculateConfigForFile(join(workspace, path));
      const options = boundaryOf(config)[1];
      if (!isRecord(options) || !Array.isArray(options['allow'])) {
        throw new Error(`ESLint returned malformed boundary options for ${path}`);
      }
      const named = options['allow'].filter(
        (entry: unknown): entry is string => typeof entry === 'string',
      );
      // Proof: with the tools block's `allow` emptied, this case failed on
      // `Expected - 4 · Received + 1` — the two aliases against `[]`. Moving the block above the
      // generic test override left the `.test.ts` path with `[]` for the same failure
      // (2026-09-15).
      expect([...named].sort(), path).toEqual([...PENDING_INFRA_TO_PRODUCT_ALIASES]);
    }

    const tools = join(workspace, 'tools');
    const sources = await Promise.all(
      (await readdir(tools, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => readFile(join(entry.parentPath, entry.name), 'utf8')),
    );
    for (const entry of PENDING_INFRA_TO_PRODUCT_ALIASES) {
      const alias = specifierOf(entry);
      // Proof: an allow entry nobody imports is dead policy. Repointing the two tools/dev
      // corpus writers at a nonexistent alias failed this case by name —
      // `error: @wbs/domain · Expected: true · Received: false` (2026-09-15).
      expect(
        sources.some((source) => importsAlias(source, alias)),
        alias,
      ).toBe(true);
    }
  }, 30_000);

  it('excuses the named specifier alone and refuses its subpaths', async () => {
    // A bare `allow` entry is matched as an unanchored regular expression, so `@wbs/domain`
    // would excuse `@wbs/domain/workday` and every other subpath of it as well.
    // Proof: with the two entries in `eslint.config.js` spelled bare, the subpath import below
    // produced no boundary diagnostic and this case failed on `Expected to contain:
    // "@nx/enforce-module-boundaries" · Received: [ "@typescript-eslint/no-unused-vars",
    // "unused-imports/no-unused-imports" ]` (2026-09-16).
    const path = 'tools/tool-smoke/src/color.ts';
    expect(await ruleIds(path, "import { workday } from '@wbs/domain/workday';")).toContain(
      '@nx/enforce-module-boundaries',
    );
    expect(await ruleIds(path, "import { x } from '@wbs/domain';")).not.toContain(
      '@nx/enforce-module-boundaries',
    );
  }, 30_000);
});

describe('product lint policy discovery', () => {
  it('applies apps/<product>/eslint.product.mjs and refuses an unreadable one', async () => {
    const fixture = await createPolicyWorkspace();
    await writeFile(
      join(fixture, 'apps/probe/eslint.product.mjs'),
      "export default () => [{ files: ['apps/probe/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['left-pad'] }] } }];\n",
    );
    await writeFile(join(fixture, 'apps/probe/app/src/main.ts'), "import 'left-pad';\n");
    const applied = await runLint(fixture, 'probe-app');
    // Proof: with `...productPolicies` dropped from the fixture's flat config — the state
    // before discovery existed — this uncached Nx lint exited 0 and failed here on
    // `Expected: 1 · Received: 0` (2026-09-15). The fixture calls the production
    // `readProductPolicies`, so every negative below runs the code the root config runs.
    expect(applied.code, applied.output).toBe(1);

    // Absent is the normal case, and the only failure discovery is allowed to pass over.
    await rm(join(fixture, 'apps/probe/eslint.product.mjs'));
    const absent = await runLint(fixture, 'probe-app');
    expect(absent.code, absent.output).toBe(0);

    await writeFile(join(fixture, 'apps/probe/eslint.product.mjs'), 'export default () => [];\n');
    await chmod(join(fixture, 'apps/probe/eslint.product.mjs'), 0o000);
    const unreadable = await runLint(fixture, 'probe-app');
    // Proof: replacing the rethrow in `product-policies.mjs` with an unconditional `continue` —
    // swallowing every import failure — made this same unreadable policy exit 0, failing on
    // `Expected: not 0 · Received: 0` (2026-09-15). Nx prefixes the child's streams onto its
    // own stdout, so the diagnostic is read from the merged output rather than from stderr.
    expect(unreadable.code, unreadable.output).not.toBe(0);
    // Pin the diagnostic, not merely the failure: any other way of breaking this lint would
    // otherwise keep the negative green with the rethrow gone.
    expect(unreadable.output, unreadable.output).toContain('cannot load product lint policy');
    expect(unreadable.output, unreadable.output).toContain('apps/probe/eslint.product.mjs');
  }, 90_000);

  it('applies a suite product policy at apps/<suite>/<product>/eslint.product.mjs', async () => {
    const fixture = await createPolicyWorkspace();
    await writeProject(fixture, 'apps/twilight-structure/probe/app', 'probe-suite-app', [
      'scope:app',
      'type:app',
      'runtime:bun',
      'ring:adapter',
      'product:probe',
    ]);
    await writeFile(
      join(fixture, 'apps/twilight-structure/probe/eslint.product.mjs'),
      "export default () => [{ files: ['apps/twilight-structure/probe/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['left-pad'] }] } }];\n",
    );
    await writeFile(
      join(fixture, 'apps/twilight-structure/probe/app/src/main.ts'),
      "import 'left-pad';\n",
    );
    const applied = await runLint(fixture, 'probe-suite-app');
    expect(applied.code, applied.output).toBe(1);
    expect(applied.output, applied.output).toContain('no-restricted-imports');
  }, 90_000);

  it('refuses a policy in a suite directory itself', async () => {
    const fixture = await createPolicyWorkspace();
    const suitePolicy = join(fixture, 'apps/twilight-structure/eslint.product.mjs');
    await mkdir(dirname(suitePolicy), { recursive: true });
    await writeFile(suitePolicy, 'export default () => [];\n');
    const refused = await runLint(fixture, 'probe-app');
    expect(refused.code, refused.output).not.toBe(0);
    expect(refused.output, refused.output).toContain('sits in a suite directory');
    expect(refused.output, refused.output).toContain('apps/twilight-structure/eslint.product.mjs');
  }, 90_000);

  it('reads a libs directory named like a suite as a product', async () => {
    const fixture = await createPolicyWorkspace();
    await writeProject(fixture, 'libs/twilight-structure/probe', 'twilight-structure-probe', [
      'scope:shared',
      'ring:domain',
      'runtime:isomorphic',
      'product:twilight-structure',
    ]);
    await writeFile(
      join(fixture, 'libs/twilight-structure/eslint.product.mjs'),
      "export default () => [{ files: ['libs/twilight-structure/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['left-pad'] }] } }];\n",
    );
    await writeFile(
      join(fixture, 'libs/twilight-structure/probe/src/index.ts'),
      "import 'left-pad';\n",
    );
    const applied = await runLint(fixture, 'twilight-structure-probe');
    expect(applied.code, applied.output).toBe(1);
    expect(applied.output, applied.output).toContain('no-restricted-imports');
    expect(applied.output, applied.output).not.toContain('sits in a suite directory');
  }, 90_000);

  it('refuses a policy that is not a function and one that returns no array', async () => {
    const fixture = await createPolicyWorkspace();
    const policy = join(fixture, 'apps/probe/eslint.product.mjs');

    // The shape Twilight Burokrat's `apps/twilight-structure/twilight-burokrat/eslint.product.mjs`
    // must not ship: the array a reader would reach for first, which the root config cannot hand
    // the shared constants to.
    await writeFile(policy, 'export default [];\n');
    const notAFunction = await runLint(fixture, 'probe-app');
    // Proof: with the `typeof loaded.default !== 'function'` check removed from
    // `product-policies.mjs`, this lint still failed but on `TypeError: loaded.default is not a
    // function`, so the `must default-export a function` assertion below failed instead
    // (2026-09-15).
    expect(notAFunction.code, notAFunction.output).not.toBe(0);
    expect(notAFunction.output, notAFunction.output).toContain(
      'must default-export a function of the shared constants',
    );
    expect(notAFunction.output, notAFunction.output).toContain('apps/probe/eslint.product.mjs');

    await writeFile(policy, 'export default () => ({ files: [] });\n');
    const notAnArray = await runLint(fixture, 'probe-app');
    // Proof: with the `Array.isArray(configs)` check removed from `product-policies.mjs`, this
    // lint failed on a raw `Spread syntax requires ...iterable[Symbol.iterator] to be a function`
    // instead, naming neither the contract nor the file, so both assertions below failed
    // (2026-09-15).
    expect(notAnArray.code, notAnArray.output).not.toBe(0);
    expect(notAnArray.output, notAnArray.output).toContain(
      'must return an array of flat-config objects',
    );
    expect(notAnArray.output, notAnArray.output).toContain('apps/probe/eslint.product.mjs');
  }, 90_000);

  it('refuses a policy whose function throws', async () => {
    const fixture = await createPolicyWorkspace();
    await writeFile(
      join(fixture, 'apps/probe/eslint.product.mjs'),
      "export default () => {\n  throw new Error('probe policy refuses to compose');\n};\n",
    );
    const throwing = await runLint(fixture, 'probe-app');
    // Proof: with `loaded.default(shared)` left unwrapped in `product-policies.mjs`, this lint
    // failed on the policy's own bare `Error: probe policy refuses to compose`, naming the file
    // only in a stack frame, so the assertion below failed on `Expected to contain: "cannot
    // evaluate product lint policy"` (2026-09-16).
    expect(throwing.code, throwing.output).not.toBe(0);
    expect(throwing.output, throwing.output).toContain('cannot evaluate product lint policy');
    expect(throwing.output, throwing.output).toContain('apps/probe/eslint.product.mjs');
  }, 90_000);

  it('refuses a policy whose own imports do not resolve', async () => {
    const fixture = await createPolicyWorkspace();
    await writeFile(
      join(fixture, 'apps/probe/eslint.product.mjs'),
      "import plugin from 'this-package-does-not-exist';\nexport default () => [plugin];\n",
    );
    const unresolved = await runLint(fixture, 'probe-app');
    // A present policy that names six plugin packages must not read as absent because one of
    // them is missing: absence is decided on the file, before the import.
    // Proof: with absence decided by `failure?.code === 'ERR_MODULE_NOT_FOUND'` from the import
    // instead of by `stat`, this lint exited 0 with every fence silently discarded, failing on
    // `Expected: not 0 · Received: 0` (2026-09-15).
    expect(unresolved.code, unresolved.output).not.toBe(0);
    expect(unresolved.output, unresolved.output).toContain('cannot load product lint policy');
    expect(unresolved.output, unresolved.output).toContain('apps/probe/eslint.product.mjs');
  }, 90_000);
});
