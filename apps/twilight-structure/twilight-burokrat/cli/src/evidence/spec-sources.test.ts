import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { selectActiveSpecifications } from '../rules/active-spec-selector';
import { hashBytes, hashCanonical } from './content-manifest';

const scratch: string[] = [];
const main = 'openspec/specs/example/spec.md';
const alpha = 'openspec/changes/alpha/specs/example/spec.md';
const beta = 'openspec/changes/beta/specs/example/spec.md';
const rename = 'openspec/changes/rename/specs/example/spec.md';
const fragment = '### Requirement: Shared\n#### Scenario: [EXAMPLE-001] First\n';
const canonical = `## Requirements\n${fragment}`;
const modification = `## MODIFIED Requirements\n${fragment}`;
const pair = '- FROM: `### Requirement: Shared`\n- TO: `### Requirement: Renamed`\n';

function git(root: string, args: string[]): string {
  const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}

function write(root: string, path: string, text: string | Uint8Array): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function fixture(files: Record<string, string | Uint8Array> = {}): {
  root: string;
  revision: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'burokrat-spec-sources-'));
  scratch.push(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Spec Sources']);
  git(root, ['config', 'user.email', 'spec@example.invalid']);
  write(root, main, canonical);
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate']);
  return { root, revision: git(root, ['rev-parse', 'HEAD']) };
}

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Observation {
  schemaVersion: number;
  revision: string;
  candidate: string;
  inputs: { path: string; digest: string }[];
  requirements: {
    capability: string;
    title: string;
    source: string;
    digest: string;
    scenarios: { title: string; id?: string }[];
  }[];
  operations: {
    kind: string;
    capability: string;
    title: string;
    source: string;
    digest: string;
    fragmentDigest: string;
    from?: string;
    scenarios: { title: string; id?: string }[];
  }[];
  certifies: boolean;
  observationDigest: string;
}

async function inspect(root: string, revision: string): Promise<Observation> {
  const invocation = await invokeCli(['inspect-spec-sources', root, revision]);
  expect(invocation.stderr).toBe('');
  expect(invocation.exitCode).toBe(0);
  return JSON.parse(invocation.stdout) as Observation;
}

test('[TEST-AXES-054] every competing group and rename remains visible while selection refuses', async () => {
  const files = {
    [alpha]: modification,
    [beta]: modification,
    [rename]: `## RENAMED Requirements\n${pair}`,
  };
  const { root, revision } = fixture(files);
  const observation = await inspect(root, revision);
  expect(observation.requirements).toEqual([
    {
      capability: 'example',
      title: 'Shared',
      source: main,
      digest: hashBytes(fragment),
      scenarios: [{ id: 'EXAMPLE-001', title: 'First' }],
    },
  ]);
  expect(
    observation.operations.map(({ source, kind, title, from }) => ({
      source,
      kind,
      title,
      ...(from === undefined ? {} : { from }),
    })),
  ).toEqual([
    { source: alpha, kind: 'MODIFIED', title: 'Shared' },
    { source: beta, kind: 'MODIFIED', title: 'Shared' },
    { source: rename, kind: 'RENAMED', title: 'Renamed', from: 'Shared' },
  ]);
  expect(observation.operations[0].fragmentDigest).toBe(hashBytes(fragment));
  expect(observation.operations[2].fragmentDigest).toBe(hashBytes(pair));
  expect(() =>
    selectActiveSpecifications([
      {
        path: main,
        capability: 'example',
        kind: 'main',
        markdown: canonical,
        digest: hashBytes(canonical),
      },
      ...Object.entries(files).map(([path, markdown]) => ({
        path,
        capability: 'example',
        kind: 'change' as const,
        markdown,
        digest: hashBytes(markdown),
      })),
    ]),
  ).toThrow('competing overlay operation at rename endpoint');
  const conflictingRename = `## RENAMED Requirements\n${pair}- FROM: \`### Requirement: Renamed\`\n- TO: \`### Requirement: Third\`\n`;
  const conflict = fixture({ [rename]: conflictingRename });
  expect((await inspect(conflict.root, conflict.revision)).operations).toHaveLength(2);
  expect(() =>
    selectActiveSpecifications([
      {
        path: main,
        capability: 'example',
        kind: 'main',
        markdown: canonical,
        digest: hashBytes(canonical),
      },
      {
        path: rename,
        capability: 'example',
        kind: 'change',
        markdown: conflictingRename,
        digest: hashBytes(conflictingRename),
      },
    ]),
  ).toThrow('competing requirement rename endpoint');
});

test('[TEST-AXES-055] committed identity excludes staged replacements and archive bytes and binds entire payload', async () => {
  const { root, revision } = fixture({
    [alpha]: modification,
    'openspec/changes/archive/held/specs/example/spec.md': 'malformed archived source',
  });
  const first = await inspect(root, revision);
  write(root, main, 'malformed staged source');
  git(root, ['add', '.']);
  expect(await inspect(root, revision)).toEqual(first);
  expect(first.inputs).toEqual([
    { path: alpha, digest: hashBytes(modification) },
    { path: main, digest: hashBytes(canonical) },
  ]);
  const selected = readCandidate(root, { kind: 'committed', revision });
  expect(first.candidate).toBe(hashCanonical(selected));
  expect(first.revision).toBe(revision);
  expect(first.certifies).toBe(false);
  const { observationDigest, ...payload } = first;
  expect(observationDigest).toBe(hashCanonical(payload));
  for (const changed of [
    { ...payload, certifies: true },
    { ...payload, candidate: '0'.repeat(64) },
    { ...payload, revision: '0'.repeat(40) },
    { ...payload, inputs: [] },
    { ...payload, requirements: [] },
    { ...payload, operations: [] },
  ])
    expect(hashCanonical(changed)).not.toBe(observationDigest);
});

for (const [label, text, refusal] of [
  [
    'orphan',
    '## ADDED Requirements\n#### Scenario: Lost\n',
    'scenario heading outside a requirement',
  ],
  ['empty', '', 'active specification has no requirements'],
  ['missing operation', fragment, 'overlay requirement has no operation'],
  [
    'rename pair',
    '## RENAMED Requirements\n- FROM: `### Requirement: Shared`\n',
    'malformed requirement rename pair',
  ],
  ['UTF-8', new Uint8Array([255]), 'canonical specification is not UTF-8'],
] as const)
  test(`[TEST-AXES-056] malformed active ${label} refuses without JSON`, async () => {
    const { root, revision } = fixture({ [alpha]: text });
    const invocation = await invokeCli(['inspect-spec-sources', root, revision]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(refusal);
  });

test('[TEST-AXES-056] absent active inventory and symbolic revision refuse', async () => {
  const { root, revision } = fixture();
  git(root, ['rm', main]);
  git(root, ['commit', '-m', 'absent']);
  const absent = await invokeCli(['inspect-spec-sources', root, git(root, ['rev-parse', 'HEAD'])]);
  expect(absent.exitCode).toBe(1);
  expect(absent.stderr).toContain('active canonical specification inventory is absent');
  const symbolic = await invokeCli(['inspect-spec-sources', root, 'HEAD']);
  expect(symbolic.exitCode).toBe(1);
  expect(symbolic.stderr).toContain('requires a full committed SHA');
  const usage = await invokeCli(['inspect-spec-sources', root, revision, 'extra']);
  expect(usage.exitCode).toBe(1);
  expect(usage.stderr).toContain('usage: twilight-burokrat inspect-spec-sources');
});

function inspectFault(setup: ReturnType<typeof fixture>, modulePath: string, replacement: string) {
  const preload = join(setup.root, 'fault-preload.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(`${modulePath}?real-fault`)});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, ${replacement} }));\n`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-spec-sources',
      setup.root,
      setup.revision,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}

test('[TEST-AXES-055] reversed committed input enumeration preserves the complete CLI observation', async () => {
  const setup = fixture({ [alpha]: modification, [beta]: modification });
  const expected = await inspect(setup.root, setup.revision);
  const reordered = inspectFault(
    setup,
    join(import.meta.dir, '..', 'rules', 'spec-sources.ts'),
    'readActiveSpecifications: (...args) => [...actual.readActiveSpecifications(...args)].reverse()',
  );
  expect(reordered.exitCode).toBe(0);
  expect(JSON.parse(reordered.stdout)).toEqual(expected);
});

test('[TEST-AXES-055] raw rename whitespace changes fragment identity while endpoints retain their semantic identity', async () => {
  const first = fixture({ [rename]: `## RENAMED Requirements\n${pair}` });
  const raw = pair.replaceAll('\n', '\r\n').replace('- TO:', '  - TO:');
  const second = fixture({ [rename]: `## RENAMED Requirements\n${raw}` });
  const before = (await inspect(first.root, first.revision)).operations[0];
  const after = (await inspect(second.root, second.revision)).operations[0];
  expect(after.digest).toBe(before.digest);
  expect(after.from).toBe(before.from);
  expect(after.title).toBe(before.title);
  expect(after.fragmentDigest).toBe(hashBytes(raw));
  expect(after.fragmentDigest).not.toBe(before.fragmentDigest);
});

for (const [label, failure] of [
  ['missing', 'selected blob is absent'],
  ['unreadable', 'selected blob cannot be read'],
] as const)
  test(`[TEST-AXES-056] ${label} selected blob fails through the shared reader`, () => {
    const setup = fixture();
    const fault = inspectFault(
      setup,
      join(import.meta.dir, '..', 'inventory', 'read-blob.ts'),
      `readSelectedBlob: () => { throw new Error(${JSON.stringify(failure)}); }`,
    );
    expect(fault.exitCode).toBe(1);
    expect(fault.stdout).toBe('');
    expect(fault.stderr).toContain(failure);
  });

test('[TEST-AXES-056] selected nonregular source and noncommitted reader fault refuse', async () => {
  const setup = fixture();
  git(setup.root, [
    'update-index',
    '--cacheinfo',
    `120000,${git(setup.root, ['rev-parse', `HEAD:${main}`])},${main}`,
  ]);
  git(setup.root, ['commit', '-m', 'nonregular source']);
  const nonregular = await invokeCli([
    'inspect-spec-sources',
    setup.root,
    git(setup.root, ['rev-parse', 'HEAD']),
  ]);
  expect(nonregular.exitCode).toBe(1);
  expect(nonregular.stderr).toContain('canonical specification must be a regular blob');
  const fault = inspectFault(
    setup,
    join(import.meta.dir, '..', 'inventory', 'read-candidate.ts'),
    "readCandidate: (...args) => { const selected = actual.readCandidate(...args); return { ...selected, selection: { kind: 'staged', base: selected.selection.revision, indexTree: selected.selection.tree } }; }",
  );
  expect(fault.exitCode).toBe(1);
  expect(fault.stderr).toContain('spec source selection is not committed');
});
