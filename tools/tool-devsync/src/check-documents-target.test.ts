import { copyFile, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

const CHECKOUT = fileURLToPath(new URL('../../../', import.meta.url));
const NX = fileURLToPath(import.meta.resolve('nx/bin/nx.js'));

function runGit(repository: string, args: string[]): void {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
}

async function createRepository(): Promise<string> {
  const parent = await scratchAsync('document-target-');
  const repository = join(parent, 'repository');
  runGit(CHECKOUT, ['clone', '--quiet', '--shared', '--no-hardlinks', CHECKOUT, repository]);
  for (const path of [
    'tools/tool-devsync/project.json',
    'tools/tool-devsync/src/current-documents.ts',
    'tools/tool-devsync/src/check-documents.ts',
    'tools/tool-devsync/src/check-documents-target.test.ts',
  ]) {
    await copyFile(join(CHECKOUT, path), join(repository, path));
  }
  await symlink(join(CHECKOUT, 'node_modules'), join(repository, 'node_modules'), 'dir');
  runGit(repository, ['add', '--all']);
  return repository;
}

async function invokeTarget(repository: string): Promise<{ code: number; output: string }> {
  const invocation = Bun.spawn(
    [
      process.execPath,
      NX,
      'run',
      'tool-devsync:check:docs',
      '--skip-nx-cache',
      '--output-style=stream',
    ],
    {
      cwd: repository,
      env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(invocation.stdout).text(),
    new Response(invocation.stderr).text(),
    invocation.exited,
  ]);
  return { code, output: stdout + stderr };
}

test('the actual docs target executes documents, ADRs, retired roots and root provenance', async () => {
  const repository = await createRepository();
  const invocation = await invokeTarget(repository);
  expect(invocation.code, invocation.output).toBe(0);
  expect(invocation.output).toContain('Verified current documents and indexes');
  expect(invocation.output).toContain('ADR numbers are unique and contiguous from 0001');
  expect(invocation.output).toContain('no current file names the retired');
  expect(invocation.output).toContain('"migrationId":"root-knowledge.v1"');
}, 60_000);

test.each([
  // Proof: removing the documents command let the missing local link pass this actual
  // Nx target; the negative failed on exit 0 (2026-10-22).
  [
    'local link',
    'docs/capacity.md',
    '\n[Fault](missing-ci-document.md)\n',
    'absent docs/missing-ci-document.md',
  ],
  // Proof: removing only the ADR test path let duplicate 0001 numbers pass the actual
  // Nx target; this negative failed on exit 0 (2026-10-22).
  [
    'ADR numbering',
    'docs/adr/0001-ci-fault.md',
    '# Duplicate ADR\n',
    'ADR numbers are unique and contiguous from 0001',
  ],
  // Proof: removing only the retired-root test path made this negative and the target's
  // positive execution evidence fail; retired prose exited 0 (2026-10-22).
  [
    'retired root',
    'docs/findings/checks-that-cannot-fail-puni-00.md',
    '\nRetired ' + ['apps', 'wi' + 'ki'].join('/') + ' path.\n',
    'no current file names the retired',
  ],
])(
  'the actual docs target refuses broken %s',
  async (_name, path, fault, diagnostic) => {
    const repository = await createRepository();
    await mkdir(dirname(join(repository, path)), { recursive: true });
    if (path.endsWith('0001-ci-fault.md')) await writeFile(join(repository, path), fault);
    else
      await writeFile(
        join(repository, path),
        (await readFile(join(repository, path), 'utf8')) + fault,
      );
    runGit(repository, ['add', '--all']);
    const invocation = await invokeTarget(repository);
    expect(invocation.code, invocation.output).not.toBe(0);
    expect(invocation.output).toContain(diagnostic);
  },
  60_000,
);

// Proof: removing the root-migration command let a preserved findings payload change pass
// the actual Nx target; this negative failed on exit 0 (2026-10-22).
test('the actual docs target refuses changed root-migration payloads', async () => {
  const repository = await createRepository();
  const path = join(repository, 'docs/findings/current.md');
  const source = await readFile(path, 'utf8');
  const changed = source.replace('replaced only on the click', 'replaced incorrectly on the click');
  expect(changed).not.toBe(source);
  await writeFile(path, changed);
  const invocation = await invokeTarget(repository);
  expect(invocation.code, invocation.output).not.toBe(0);
  expect(invocation.output).toContain(
    'mapped destination block mismatch: docs/findings/current.md#router-landmines-001',
  );
}, 60_000);
