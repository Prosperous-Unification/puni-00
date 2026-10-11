import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { registeredRules } from '../rules/registry';

const cli = join(import.meta.dir, '..', 'cli.ts');

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

// Proof: replacing F1's reactObservations call with [] made this real CLI test fail:
// check exited 0 with allowed:true and findings:[] instead of refusing the committed React import.
test('F1 refuses a committed plain TypeScript store importing React', () => {
  const root = mkdtempSync(join(tmpdir(), 'f1-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(join(repository, 'src', 'm'), { recursive: true });
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, 'nx.json'), '{}\n');
    writeFileSync(join(repository, 'package.json'), '{"name":"f1-fixture","private":true}\n');
    writeFileSync(
      join(repository, 'tsconfig.json'),
      '{"compilerOptions":{"strict":true,"module":"ESNext","moduleResolution":"bundler","target":"ES2022"}}\n',
    );
    writeFileSync(join(repository, 'src', 'entry.ts'), 'export const entry = 1;\n');
    writeFileSync(
      join(repository, 'src', 'm', 'store.ts'),
      "import type { ReactNode } from 'react';\nexport const keep = (node: ReactNode): ReactNode => node;\n",
    );
    const rootIndex = {
      schemaVersion: 1,
      moduleId: 'module.fixture',
      memberships: [
        { kind: 'path', path: 'nx.json' },
        { kind: 'path', path: 'package.json' },
        { kind: 'path', path: 'tsconfig.json' },
        { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
      ],
      relationshipSelectors: [],
      applicableChecks: [],
      inapplicableSections: [
        {
          section: 'relationships',
          reason: 'The fixture declares no non-derivable relationships.',
        },
        { section: 'invariants', reason: 'The fixture has no cross-file runtime invariant.' },
        { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
      ],
      externalConsumers: {
        kind: 'none-known',
        knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
      },
    };
    writeFileSync(
      join(repository, 'README.md'),
      `# F1 fixture\n\n<!-- module-index ${JSON.stringify(rootIndex)} -->\n`,
    );
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate with plain TypeScript importing React');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.f1.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'F1' ? 'enforce' : 'observe',
        })),
        relationshipRequest: {
          schemaVersion: 1,
          typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/entry.ts'] },
        },
        plainTypeScriptPaths: [{ kind: 'path', value: 'src/m/store.ts' }],
      })}\n`,
    );

    const invocation = Bun.spawnSync(
      [process.execPath, cli, 'check', 'committed', repository, revision, policy, '--rule', 'F1'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          TOOL_WIKI_TRUSTED_NODE_MODULES: join(
            import.meta.dir,
            '..',
            '..',
            '..',
            '..',
            '..',
            '..',
            'node_modules',
          ),
        },
      },
    );
    const verdict = JSON.parse(invocation.stdout.toString()) as {
      allowed: boolean;
      certifies: boolean;
      findings: {
        ruleId: string;
        path: string;
        subject: string;
        message: string;
        effect: string;
      }[];
      unevaluated: { ruleId: string; reason: string }[];
    };
    expect(
      invocation.exitCode,
      `${invocation.stdout.toString()}${invocation.stderr.toString()}`,
    ).toBe(1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.certifies).toBe(false);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'F1',
        path: 'src/m/store.ts',
        subject: 'external:react',
        message: "declared plain TypeScript imports external:react through 'react'",
        effect: 'refusal',
      },
    ]);
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
