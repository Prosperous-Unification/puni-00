import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';

import type { Selection } from './ci-selection';

const selector = join(import.meta.dir, 'ci-selection.ts');

function git(root: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(): { root: string; base: string } {
  const root = scratchSync('ci-selection-');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'CI selection test');
  git(root, 'config', 'user.email', 'ci-selection@example.test');
  write(root, 'docs/findings/report.md', '# Report\n');
  write(root, 'src/code.ts', 'export const answer = 1;\n');
  write(root, 'docs/import-with-ai.md', '# Consumed guide\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return { root, base: git(root, 'rev-parse', 'HEAD') };
}

function commit(root: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'candidate');
  return git(root, 'rev-parse', 'HEAD');
}

function select(root: string, base: string, head = git(root, 'rev-parse', 'HEAD')) {
  return Bun.spawnSync([process.execPath, selector, base, head, root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function scope(root: string, base: string): string {
  const invocation = select(root, base);
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  return (JSON.parse(invocation.stdout.toString()) as Selection).scope;
}

describe('production CI prose selection', () => {
  test('selects documentation validation for ordinary reviewed prose', () => {
    const { root, base } = fixture();
    write(root, 'docs/findings/report.md', '# Updated report\n');
    const head = commit(root);
    const invocation = select(root, base, head);
    expect(invocation.exitCode).toBe(0);
    const plan = JSON.parse(invocation.stdout.toString()) as Selection;
    expect(plan).toMatchObject({ schemaVersion: 1, base, head, scope: 'docs' });
    expect(plan.changes).toHaveLength(1);
    expect(plan.reasons.length).toBeGreaterThan(0);
  });

  test.each([
    'src/code.ts',
    'docs/import-with-ai.md',
    'docs/findings/policy.json',
    'docs/findings/fixtures/input.md',
    'unknown.md',
    'AGENTS.md',
  ])('does not exempt code, behavior inputs or unreviewed paths: %s', (path) => {
    const { root, base } = fixture();
    write(root, 'docs/findings/report.md', '# Updated report\n');
    write(root, path, 'changed\n');
    commit(root);
    expect(scope(root, base)).toBe('code');
  });

  test('does not exempt a rename from code into a documentation path', () => {
    const { root, base } = fixture();
    git(root, 'mv', 'src/code.ts', 'docs/findings/code.md');
    commit(root);
    expect(scope(root, base)).toBe('code');
  });

  test('does not exempt executable mode changes', () => {
    const { root, base } = fixture();
    git(root, 'update-index', '--chmod=+x', 'docs/findings/report.md');
    git(root, 'commit', '--quiet', '-m', 'executable');
    expect(scope(root, base)).toBe('code');
  });

  test('does not exempt symbolic links', () => {
    const { root, base } = fixture();
    const invocation = Bun.spawnSync([
      'ln',
      '-s',
      '../../src/code.ts',
      join(root, 'docs/findings/link.md'),
    ]);
    expect(invocation.exitCode).toBe(0);
    commit(root);
    expect(scope(root, base)).toBe('code');
  });

  test('retains deleted prose paths for document validation', () => {
    const { root, base } = fixture();
    git(root, 'rm', 'docs/findings/report.md');
    commit(root);
    expect(scope(root, base)).toBe('docs');
  });

  test('empty diff cannot claim a documentation exemption', () => {
    const { root, base } = fixture();
    expect(scope(root, base)).toBe('code');
  });

  test.each(['HEAD', '0'.repeat(40)])(
    'refuses invalid or unavailable immutable base %s',
    (base) => {
      const { root } = fixture();
      expect(select(root, base).exitCode).not.toBe(0);
    },
  );

  test('refuses malformed index declarations before selecting an exemption', () => {
    const { root, base } = fixture();
    write(root, 'docs/findings/report.md', '# Report\n<!-- module-index {broken} -->\n');
    commit(root);
    expect(select(root, base).exitCode).not.toBe(0);
  });

  test('new module authority does not qualify as ordinary prose', () => {
    const { root, base } = fixture();
    write(root, 'docs/findings/report.md', '# Report\n<!-- module-index {"memberships":[]} -->\n');
    commit(root);
    expect(scope(root, base)).toBe('code');
  });

  test.each([true, false])(
    'compares effective module authority when fences change: %s',
    (activate) => {
      const { root } = fixture();
      const declaration = '<!-- module-index {"memberships":[]} -->';
      const fenced = `# Findings\n\n\`\`\`html\n${declaration}\n\`\`\`\n`;
      const active = `# Findings\n\n${declaration}\n`;
      write(root, 'docs/findings/README.md', activate ? fenced : active);
      const base = commit(root);
      write(root, 'docs/findings/README.md', activate ? active : fenced);
      commit(root);
      expect(scope(root, base)).toBe('code');
    },
  );

  test('refuses a head that is not the checked-out candidate', () => {
    const { root, base } = fixture();
    write(root, 'docs/findings/report.md', '# Updated\n');
    commit(root);
    expect(select(root, base, base).exitCode).not.toBe(0);
  });

  test('refuses a base that is not an ancestor of the candidate', () => {
    const { root, base } = fixture();
    write(root, 'docs/findings/report.md', '# Future\n');
    const future = commit(root);
    git(root, 'checkout', '--quiet', '--detach', base);
    expect(select(root, future, base).exitCode).not.toBe(0);
  });

  for (const [label, edit, expected] of [
    [
      'prose membership',
      {
        memberships: [
          { kind: 'path', path: 'report.md' },
          { kind: 'path', path: 'new.md' },
        ],
      },
      'docs',
    ],
    ['code membership', { memberships: [{ kind: 'path', path: '../../src/code.ts' }] }, 'code'],
    ['check authority', { applicableChecks: [] }, 'code'],
    ['consumer authority', { externalConsumers: { kind: 'none' } }, 'code'],
  ] as const) {
    test(`distinguishes documentation index ${label}`, () => {
      const { root } = fixture();
      const declaration = {
        schemaVersion: 1,
        moduleId: 'module.docs.findings',
        memberships: [{ kind: 'path', path: 'report.md' }],
        applicableChecks: ['check.wiki-cli.test'],
        externalConsumers: { kind: 'declared', memberships: [] },
      };
      write(
        root,
        'docs/findings/README.md',
        `# Findings\n<!-- module-index ${JSON.stringify(declaration)} -->\n`,
      );
      const base = commit(root);
      write(
        root,
        'docs/findings/README.md',
        `# Findings\n<!-- module-index ${JSON.stringify({ ...declaration, ...edit })} -->\n`,
      );
      write(root, 'docs/findings/new.md', '# New finding\n');
      commit(root);
      expect(scope(root, base)).toBe(expected);
    });
  }
});
