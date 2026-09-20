import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { buildPackage } from './build';

const toolkitRoles = [
  'SHA256SUMS',
  'launcher.sh',
  'prepare-activation.mjs',
  'prepare-relocation-activation.mjs',
  'snapshotter.ts',
  'toolkit.json',
  'trusted-node-modules/typescript/package.json',
  'validator.mjs',
] as const;

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function invoke(executable: string, argv: readonly string[], cwd: string) {
  return Bun.spawnSync([process.execPath, executable, ...argv], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

async function refusalMessage(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected package build refusal');
}

describe('buildPackage', () => {
  test('refuses a build that does not produce exactly one executable', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'twilight-bureaucrat-empty-build-'));
    scratchRoots.push(externalRoot);

    expect(
      await refusalMessage(
        buildPackage(externalRoot, () => Promise.resolve({ logs: [], outputs: [], success: true })),
      ),
    ).toContain('Cannot build Twilight Bureaucrat');
  });

  test('builds the canonical executable for use outside the repository', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'twilight-bureaucrat-bin-'));
    scratchRoots.push(externalRoot);
    const packageRoot = join(externalRoot, 'package');
    await buildPackage(packageRoot);
    const executable = join(packageRoot, 'dist/bin.mjs');

    for (const role of toolkitRoles) {
      expect((await stat(join(packageRoot, 'dist/toolkit', role))).isFile()).toBe(true);
    }
    const packageManifest = JSON.parse(
      await readFile(join(packageRoot, 'dist/package-manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(packageManifest).toMatchObject({ packageVersion: '0.1.0', schemaVersion: 1 });
    expect(packageManifest['sourceRevision']).toMatch(/^[0-9a-f]{40}$/);
    expect(packageManifest['toolkitIdentity']).toMatch(/^[0-9a-f]{64}$/);
    expect(packageManifest['toolkitIdentity']).toBe(
      hashBytes(await readFile(join(packageRoot, 'dist/toolkit/toolkit.json'))),
    );
    expect((await readdir(join(packageRoot, 'dist'))).sort()).toEqual([
      'bin.mjs',
      'package-manifest.json',
      'toolkit',
    ]);

    const version = invoke(executable, ['--version'], externalRoot);
    expect(version.exitCode, version.stderr.toString()).toBe(0);
    expect(version.stdout.toString()).toBe('0.1.0\n');

    const unknown = invoke(executable, ['not-a-command'], externalRoot);
    expect(unknown.exitCode).not.toBe(0);
    expect(unknown.stderr.toString()).toContain('unknown command');

    const fixtureDirectory = join(externalRoot, 'fixture');
    await mkdir(fixtureDirectory);
    const fixture = join(fixtureDirectory, 'benchmark-corpus.v1.json');
    await copyFile(
      join(import.meta.dir, '../contracts/fixtures/benchmark-corpus.v1.json'),
      fixture,
    );
    const validation = invoke(
      executable,
      ['validate-record', 'benchmark-corpus', fixture],
      externalRoot,
    );
    expect(validation.exitCode, validation.stderr.toString()).toBe(0);
    expect(validation.stdout.toString()).toBe('valid benchmark-corpus\n');

    const ruleHelp = invoke(executable, ['--help'], externalRoot);
    expect(ruleHelp.exitCode, ruleHelp.stderr.toString()).toBe(0);
    expect(ruleHelp.stdout.toString()).toContain(
      'twilight-bureaucrat check <committed|staged|working>',
    );
    expect(ruleHelp.stdout.toString()).toContain('twilight-bureaucrat explain <rule-id>');

    const explained = invoke(executable, ['explain', 'MOD-INDEX'], externalRoot);
    expect(explained.exitCode, explained.stderr.toString()).toBe(0);
    expect(JSON.parse(explained.stdout.toString()) as { id: string }).toMatchObject({
      id: 'MOD-INDEX',
    });

    const packageCandidate = join(externalRoot, 'candidate');
    await mkdir(join(packageCandidate, 'src'), { recursive: true });
    for (const argv of [
      ['init', '--initial-branch=main'],
      ['config', 'user.email', 'rules@example.test'],
      ['config', 'user.name', 'Rules Fixture'],
    ]) {
      expect(Bun.spawnSync(['git', '-C', packageCandidate, ...argv]).exitCode).toBe(0);
    }
    const packageIndex = {
      schemaVersion: 1,
      moduleId: 'module.package-fixture',
      memberships: [{ kind: 'directory-prefix', prefix: 'src', exclusions: [] }],
      relationshipSelectors: [],
      applicableChecks: [],
      inapplicableSections: [
        { section: 'relationships', reason: 'The fixture declares no relationships.' },
        { section: 'invariants', reason: 'The fixture has no cross-file invariant.' },
        { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
      ],
      externalConsumers: {
        kind: 'none-known',
        knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
      },
    };
    await writeFile(
      join(packageCandidate, 'README.md'),
      `# Package fixture\n\n<!-- module-index ${JSON.stringify(packageIndex)} -->\n`,
      'utf8',
    );
    await writeFile(join(packageCandidate, 'src/entry.ts'), 'export const entry = 1;\n', 'utf8');
    expect(Bun.spawnSync(['git', '-C', packageCandidate, 'add', '--all']).exitCode).toBe(0);
    expect(
      Bun.spawnSync(['git', '-C', packageCandidate, 'commit', '--message', 'candidate']).exitCode,
    ).toBe(0);

    const packagePolicy = join(externalRoot, 'rule-policy.json');
    await writeFile(
      packagePolicy,
      JSON.stringify({
        schemaVersion: 1,
        policyId: 'rules.package.v1',
        // Every registered rule needs a stated mode, so a newly registered rule is added here.
        // Proof: with `F7` registered and absent from this list, this test failed on `rule policy
        // states no mode for F7` (exit 1 where 0 was expected), seen in the planner's whole-suite
        // run on 2026-09-20; the sandboxed executor cannot build the package and never ran it.
        ruleModes: [
          { ruleId: 'F7', mode: 'observe' },
          { ruleId: 'INV-CLASSIFY', mode: 'observe' },
          { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'observe' },
          { ruleId: 'MOD-INDEX', mode: 'enforce' },
          { ruleId: 'REL-EXTRACT', mode: 'observe' },
        ],
      }),
      'utf8',
    );
    const allowed = invoke(
      executable,
      ['check', 'committed', packageCandidate, 'HEAD', packagePolicy, '--rule', 'MOD-INDEX'],
      externalRoot,
    );
    expect(allowed.exitCode, allowed.stderr.toString()).toBe(0);
    // An allowed verdict must be allowed for the stated reason: no finding and nothing unevaluated.
    // `allowed: true` alone would also accept a verdict that reported debt it had silently downgraded.
    expect(
      JSON.parse(allowed.stdout.toString()) as {
        allowed: boolean;
        certifies: boolean;
        findings: unknown[];
        ruleIds: string[];
        unevaluated: unknown[];
      },
    ).toMatchObject({
      allowed: true,
      certifies: false,
      findings: [],
      ruleIds: ['MOD-INDEX'],
      unevaluated: [],
    });

    const refusedCandidate = join(externalRoot, 'refused');
    await mkdir(refusedCandidate);
    for (const argv of [
      ['init', '--initial-branch=main'],
      ['config', 'user.email', 'rules@example.test'],
      ['config', 'user.name', 'Rules Fixture'],
    ]) {
      expect(Bun.spawnSync(['git', '-C', refusedCandidate, ...argv]).exitCode).toBe(0);
    }
    await writeFile(join(refusedCandidate, 'orphan.ts'), 'export const orphan = 1;\n', 'utf8');
    expect(Bun.spawnSync(['git', '-C', refusedCandidate, 'add', '--all']).exitCode).toBe(0);
    expect(
      Bun.spawnSync(['git', '-C', refusedCandidate, 'commit', '--message', 'no index']).exitCode,
    ).toBe(0);
    const refused = invoke(
      executable,
      ['check', 'committed', refusedCandidate, 'HEAD', packagePolicy, '--rule', 'MOD-INDEX'],
      externalRoot,
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stdout.toString()).toContain('"allowed":false');
    expect(refused.stdout.toString()).toContain('selected candidate contains no module indexes');

    const lint = invoke(
      executable,
      ['lint', 'working', resolve(import.meta.dir, '../../../../..'), 'HEAD'],
      externalRoot,
    );
    expect(lint.exitCode, lint.stderr.toString()).toBe(0);
    expect(lint.stdout.toString()).toContain('"status":"inactive"');

    const preparer = invoke(executable, ['prepare-activation'], externalRoot);
    expect(preparer.exitCode).not.toBe(0);
    expect(preparer.stderr.toString()).toContain('missing required flag: --candidate-repository');

    const relocationPreparer = invoke(executable, ['prepare-relocation-activation'], externalRoot);
    expect(relocationPreparer.exitCode).not.toBe(0);
    expect(relocationPreparer.stderr.toString()).toContain(
      'missing required flag: --candidate-repository',
    );

    await writeFile(join(packageRoot, 'dist/toolkit/validator.mjs'), '\ncorrupted\n', {
      flag: 'a',
    });
    const corruptToolkit = invoke(
      executable,
      [
        'prepare-activation',
        '--candidate-repository',
        resolve(import.meta.dir, '../../../../..'),
        '--candidate-sha',
        '0'.repeat(40),
        '--candidate-policy',
        'policy.json',
        '--candidate-mapping',
        'mapping.json',
        '--review-record',
        join(externalRoot, 'review.json'),
        '--audit-strata',
        join(externalRoot, 'strata.json'),
        '--destination',
        join(externalRoot, 'activation'),
        '--work',
        join(externalRoot, 'work'),
        '--resource-lane',
        'package-test',
        '--cwd-identity',
        'package-test',
      ],
      externalRoot,
    );
    expect(corruptToolkit.exitCode).not.toBe(0);
    expect(corruptToolkit.stderr.toString()).toContain(
      'toolkit role differs from toolkit.json: validator.mjs',
    );

    await buildPackage(packageRoot);
    expect(invoke(executable, ['--version'], externalRoot).stdout.toString()).toBe('0.1.0\n');
    // Proof: under the 20-second limit this test took 19458.92ms in the h2puni gate on fd0a777c
    // and timed out at 20039.60ms in the gate on d748f1a7 (2026-09-20), after the rule model added
    // five runs of the built binary to its two builds. A limit a loaded host reaches is a gate
    // that fails at random, so it has three times the observed duration.
  }, 60_000);
});
