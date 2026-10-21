import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

const CHECKOUT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(CHECKOUT, 'tools/tool-devsync/src/check-documents.ts');
const EXEMPTIONS = 'docs/findings/current-document-check-exemptions.json';

function runGit(repository: string, args: string[]): void {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
}

async function writeDocument(repository: string, path: string, source: string): Promise<void> {
  await mkdir(dirname(join(repository, path)), { recursive: true });
  await writeFile(join(repository, path), source);
}

async function createRepository(): Promise<string> {
  const repository = await scratchAsync('current-documents-');
  for (const group of ['apps', 'libs', 'tools']) await mkdir(join(repository, group));
  await writeDocument(repository, 'LLM_README.md', '# Routes\n\n`docs/guide.md`\n');
  await writeDocument(
    repository,
    'docs/guide.md',
    '# Guide\n\n## Details\n\n[Details](#details)\n',
  );
  await writeDocument(
    repository,
    EXEMPTIONS,
    JSON.stringify({ expires: '2099-12-31', entries: [] }),
  );
  await writeDocument(
    repository,
    'openspec/changes/frozen/design.md',
    '# Historical\n\n[Frozen](missing.md)\n',
  );
  await writeDocument(
    repository,
    'docs/README.md',
    `# Documents

<!-- module-index ${JSON.stringify({
      schemaVersion: 1,
      moduleId: 'module.docs',
      memberships: [
        { kind: 'path', path: 'guide.md' },
        { kind: 'directory-prefix', prefix: 'findings', exclusions: [] },
      ],
      relationshipSelectors: [],
      applicableChecks: [],
      inapplicableSections: [
        { section: 'relationships', reason: 'No relationships in this fixture.' },
        { section: 'invariants', reason: 'No runtime invariant in this fixture.' },
        { section: 'checks', reason: 'The production checker validates this fixture.' },
      ],
      externalConsumers: { kind: 'none-known', knowledgeLimit: 'Only this fixture was inspected.' },
    })} -->

[Guide](guide.md#details)
`,
  );
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['add', '--all']);
  runGit(repository, [
    '-c',
    'user.name=Document Fixture',
    '-c',
    'user.email=docs@example.test',
    'commit',
    '-m',
    'fixture',
  ]);
  return repository;
}

async function invokeDocuments(args: string[]): Promise<{ code: number; output: string }> {
  const invocation = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: CHECKOUT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(invocation.stdout).text(),
    new Response(invocation.stderr).text(),
    invocation.exited,
  ]);
  return { code, output: stdout + stderr };
}

test('the production documents CLI validates the supplied checkout instead of its own source tree', async () => {
  const repository = await createRepository();
  const invocation = await invokeDocuments([repository]);
  expect(invocation.code, invocation.output).toBe(0);
  expect(invocation.output).toContain('Verified current documents and indexes');
}, 60_000);

test.each([
  ['missing link', '[Fault](missing.md)', 'absent docs/missing.md'],
  ['missing anchor', '[Fault](#missing)', 'absent #missing'],
  ['missing selector', '`bunx nx test absent-project`', 'absent-project'],
  [
    'legacy path',
    '`' + ['libs', 'domain', 'src', 'fault.ts'].join('/') + '`',
    'docs/guide.md:' + ['libs', 'domain', ''].join('/'),
  ],
])(
  'the production documents CLI refuses %s',
  async (_name, fault, diagnostic) => {
    const repository = await createRepository();
    await writeDocument(repository, 'docs/guide.md', `# Guide\n\n## Details\n\n${fault}\n`);
    const invocation = await invokeDocuments([repository]);
    expect(invocation.code, invocation.output).not.toBe(0);
    expect(invocation.output).toContain(diagnostic);
  },
  60_000,
);

test('the production documents CLI refuses an absent inline-code root route', async () => {
  const repository = await createRepository();
  await writeDocument(repository, 'LLM_README.md', '`docs/missing-runbook.md`\n');
  const invocation = await invokeDocuments([repository]);
  expect(invocation.code, invocation.output).not.toBe(0);
  expect(invocation.output).toContain('LLM_README.md -> docs/missing-runbook.md');
}, 60_000);

test.each(['absent', 'unreadable', 'malformed'] as const)(
  'the production documents CLI refuses %s exemption state',
  async (fault) => {
    const repository = await createRepository();
    const path = join(repository, EXEMPTIONS);
    if (fault === 'absent') await rm(path);
    if (fault === 'unreadable') await chmod(path, 0);
    if (fault === 'malformed') await writeFile(path, '{"expires":"2099-12-31","entries":{}}');
    try {
      const invocation = await invokeDocuments([repository]);
      expect(invocation.code, invocation.output).not.toBe(0);
      expect(invocation.output).toContain(
        fault === 'malformed' ? 'entries must be an array' : EXEMPTIONS,
      );
      if (fault === 'unreadable') expect(invocation.output).toContain('EACCES');
      if (fault === 'absent') expect(invocation.output).toContain('ENOENT');
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o644);
    }
  },
  60_000,
);

test.each([
  [
    'expired',
    {
      expires: '2000-01-01',
      entries: [{ path: 'docs/guide.md', reason: 'Frozen', excuses: ['links'] }],
    },
    'expired',
  ],
  [
    'absent document',
    {
      expires: '2099-12-31',
      entries: [{ path: 'docs/absent.md', reason: 'Frozen', excuses: ['links'] }],
    },
    'absent exemption document',
  ],
  [
    'unneeded check',
    {
      expires: '2099-12-31',
      entries: [{ path: 'docs/guide.md', reason: 'Frozen', excuses: ['links'] }],
    },
    'unneeded exemption',
  ],
  [
    'unknown check',
    {
      expires: '2099-12-31',
      entries: [{ path: 'docs/guide.md', reason: 'Frozen', excuses: ['unknown'] }],
    },
    'unknown',
  ],
])(
  'the production documents CLI refuses %s exemptions',
  async (_name, exemptions, diagnostic) => {
    const repository = await createRepository();
    await writeFile(join(repository, EXEMPTIONS), JSON.stringify(exemptions));
    const invocation = await invokeDocuments([repository]);
    expect(invocation.code, invocation.output).not.toBe(0);
    expect(invocation.output).toContain(diagnostic);
  },
  60_000,
);

test('the production documents CLI refuses exemptions outside current documents', async () => {
  const repository = await createRepository();
  await writeFile(
    join(repository, EXEMPTIONS),
    JSON.stringify({
      expires: '2099-12-31',
      entries: [
        { path: 'openspec/changes/frozen/design.md', reason: 'Frozen', excuses: ['links'] },
      ],
    }),
  );
  const invocation = await invokeDocuments([repository]);
  expect(invocation.code, invocation.output).not.toBe(0);
  expect(invocation.output).toContain(
    'non-current exemption document: openspec/changes/frozen/design.md',
  );
}, 60_000);

test('the production documents CLI runs actual index membership validation', async () => {
  const repository = await createRepository();
  const path = join(repository, 'docs/README.md');
  await writeFile(
    path,
    (await readFile(path, 'utf8')).replace('"path":"guide.md"', '"path":"absent.md"'),
  );
  const invocation = await invokeDocuments([repository]);
  expect(invocation.code, invocation.output).not.toBe(0);
  expect(invocation.output).toContain('absent.md');
}, 60_000);

test('the production documents CLI refuses unexpected arguments', async () => {
  const invocation = await invokeDocuments(['.', 'unexpected']);
  expect(invocation.code, invocation.output).not.toBe(0);
  expect(invocation.output).toContain('usage: check-documents.ts [repository]');
});
