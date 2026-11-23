import {
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { installedGrammar, readInvocation, UsageRefusal } from './cli-parser';
import { WorkflowBindingError } from './contracts/workflow-binding';
import { invokeCli } from './invoke-cli';
import { runWorkflowBindingCommand } from './workflow-binding';

let root: string;
const entry = (code: string) => ({ code, class: 'verify' });
const createManifest = () => ({
  version: 1,
  project: { id: 'engagement', revision: 7 },
  default: ['build'],
  types: [
    { workItemTypeId: 'constructor', codes: ['build'] },
    { workItemTypeId: 'default', codes: ['build'] },
    { workItemTypeId: 'spike', codes: ['build', 'research'] },
    { workItemTypeId: 'story', codes: ['build'] },
  ],
});
const createBinding = () => ({
  version: 2,
  project: { id: 'engagement', revision: 7 },
  default: [entry('build')],
  types: [{ workItemTypeId: 'spike', steps: [entry('build'), entry('research')] }],
  classes: { verify: { executor: 'tool', command: 'verify' } },
});
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'workflow-manifest-'));
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(createBinding()));
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(createManifest()));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
function accept() {
  return runWorkflowBindingCommand(
    ['validate', 'workflow-binding', 'workflow.json', '--manifest', 'manifest.json'],
    root,
  );
}
function expectRefusal(use: () => unknown, code: WorkflowBindingError['code'], path?: string) {
  let refusal: unknown;
  try {
    use();
  } catch (cause: unknown) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(WorkflowBindingError);
  if (!(refusal instanceof WorkflowBindingError)) throw Error('expected workflow refusal');
  expect(refusal.code).toBe(code);
  if (path !== undefined) expect(refusal.path).toBe(path);
  return refusal;
}
test('workflow manifest validates typed coverage and whole-default fallback offline', () => {
  const before = [
    readFileSync(join(root, 'workflow.json')),
    readFileSync(join(root, 'manifest.json')),
  ];
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  expect([
    readFileSync(join(root, 'workflow.json')),
    readFileSync(join(root, 'manifest.json')),
  ]).toEqual(before);
});
test('workflow manifest refuses a code that only belongs to another type', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const binding = createBinding();
  binding.types.push({ workItemTypeId: 'story', steps: [entry('build'), entry('research')] });
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expectRefusal(accept, 'unknown_step', 'types.story.research');
});
test('workflow manifest does not fill an incomplete explicit type from default', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const binding = createBinding();
  binding.types[0].steps = [entry('research')];
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expectRefusal(accept, 'missing_step', 'types.spike.build');
});
test('workflow manifest checks fallback against every omitted type', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const binding = createBinding();
  binding.types = [];
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expectRefusal(accept, 'missing_step', 'types.spike.research');
});
for (const field of ['id', 'revision'] as const) {
  test('workflow manifest refuses a different project ' + field, () => {
    expect(accept()).toMatch(/^[0-9a-f]{64}$/);
    const manifest = createManifest();
    if (field === 'id') manifest.project.id = 'other';
    else manifest.project.revision += 1;
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    expectRefusal(accept, 'manifest_mismatch', 'project.' + field);
  });
}
test('workflow manifest validates the untyped default independently of typed default identity', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const manifest = createManifest(),
    binding = createBinding();
  const typedDefault = manifest.types.find((type) => type.workItemTypeId === 'default');
  if (typedDefault === undefined) throw Error('typed default fixture absent');
  typedDefault.codes.push('research');
  binding.types.push({ workItemTypeId: 'default', steps: [entry('build'), entry('research')] });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  binding.default.push(entry('research'));
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expectRefusal(accept, 'unknown_step', 'default.research');
});
test('workflow manifest supports empty projects and zero-step type mappings', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  writeFileSync(
    join(root, 'manifest.json'),
    JSON.stringify({
      version: 1,
      project: { id: 'engagement', revision: 7 },
      default: [],
      types: [{ workItemTypeId: 'empty', codes: [] }],
    }),
  );
  writeFileSync(
    join(root, 'workflow.json'),
    JSON.stringify({
      version: 2,
      project: { id: 'engagement', revision: 7 },
      default: [],
      types: [],
      classes: {},
    }),
  );
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
});
test('workflow manifest distinguishes missing and unreadable manifest files', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  if (process.getuid?.() === 0) throw Error('manifest permission owner requires non-root');
  chmodSync(join(root, 'manifest.json'), 0);
  try {
    expect(() => readFileSync(join(root, 'manifest.json'))).toThrow();
    expectRefusal(accept, 'manifest_unreadable', 'manifest.json');
  } finally {
    chmodSync(join(root, 'manifest.json'), 0o600);
  }
  rmSync(join(root, 'manifest.json'));
  expectRefusal(accept, 'manifest_missing', 'manifest.json');
});
test('workflow manifest acceptance binds manifest content and original prompt bytes', () => {
  const first = accept(),
    binding = createBinding();
  const withPrompt = {
    ...binding,
    classes: { ...binding.classes, decision: { executor: 'human', prompt: 'prompt.md' } },
  };
  writeFileSync(join(root, 'prompt.md'), 'Approve.\n');
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(withPrompt));
  const prompted = accept();
  expect(prompted).not.toBe(first);
  writeFileSync(join(root, 'prompt.md'), 'Changed.\n');
  const changedPrompt = accept();
  expect(changedPrompt).not.toBe(prompted);
  const manifest = createManifest();
  manifest.types.push({ workItemTypeId: 'unbound-extra', codes: ['build'] });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  expect(accept()).not.toBe(changedPrompt);
});
test('workflow manifest canonicalizes nonsemantic type and mapping presentation order', () => {
  const before = accept(),
    manifest = createManifest(),
    binding = createBinding();
  manifest.types.reverse();
  binding.types[0].steps.reverse();
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding, null, 2));
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  expect(accept()).toBe(before);
});

for (const fault of [
  'duplicate-type',
  'duplicate-code',
  'negative-revision',
  'fractional-revision',
  'unsafe-revision',
  'missing-default',
  'extra-field',
  'extra-project-field',
  'unsupported-version',
] as const) {
  test('workflow manifest refuses malformed manifest ' + fault, () => {
    expect(accept()).toMatch(/^[0-9a-f]{64}$/);
    const manifest = createManifest();
    if (fault === 'duplicate-type') manifest.types.push(manifest.types[0]);
    if (fault === 'duplicate-code') manifest.default.push('build');
    if (fault === 'negative-revision') manifest.project.revision = -1;
    if (fault === 'fractional-revision') manifest.project.revision = 1.5;
    if (fault === 'unsafe-revision') manifest.project.revision = 9007199254740992;
    if (fault === 'missing-default') Reflect.deleteProperty(manifest, 'default');
    if (fault === 'extra-field') Reflect.set(manifest, 'extra', true);
    if (fault === 'extra-project-field') Reflect.set(manifest.project, 'extra', true);
    if (fault === 'unsupported-version') Reflect.set(manifest, 'version', 2);
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    expectRefusal(accept, 'invalid_binding');
  });
}
for (const fault of [
  'duplicate-type',
  'duplicate-code',
  'unknown-type',
  'unknown-class',
  'invalid-unused-class',
  'extra-field',
] as const) {
  test('workflow manifest refuses malformed binding ' + fault, () => {
    expect(accept()).toMatch(/^[0-9a-f]{64}$/);
    const binding = createBinding();
    if (fault === 'duplicate-type') binding.types.push(binding.types[0]);
    if (fault === 'duplicate-code') binding.types[0].steps.push(entry('research'));
    if (fault === 'unknown-type')
      binding.types.push({ workItemTypeId: 'foreign', steps: [entry('build')] });
    if (fault === 'unknown-class') binding.types[0].steps[0].class = 'missing';
    if (fault === 'invalid-unused-class')
      Reflect.set(binding.classes, 'unused', { executor: 'invalid' });
    if (fault === 'extra-field') Reflect.set(binding, 'extra', true);
    writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
    expectRefusal(
      accept,
      fault === 'unknown-type'
        ? 'unmapped_type'
        : fault === 'unknown-class'
          ? 'unknown_class'
          : fault === 'invalid-unused-class'
            ? 'unknown_executor'
            : 'invalid_binding',
    );
  });
}
test('workflow manifest refuses nonregular manifest before reading', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  rmSync(join(root, 'manifest.json'));
  mkdirSync(join(root, 'manifest.json'));
  expectRefusal(accept, 'invalid_manifest', 'manifest.json');
});
for (const bytes of [Buffer.from('{'), Buffer.from([0xff])]) {
  test('workflow manifest refuses malformed JSON or UTF-8 ' + bytes.toString('hex'), () => {
    expect(accept()).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(join(root, 'manifest.json'), bytes);
    expectRefusal(accept, 'invalid_manifest', 'manifest.json');
  });
}
for (const args of [
  ['validate', 'workflow-binding', 'workflow.json', '--manifest'],
  ['validate', 'workflow-binding', 'workflow.json', '--manifest', ''],
  ['validate', 'workflow-binding', 'workflow.json', '--manifest', '--steps'],
  [
    'validate',
    'workflow-binding',
    'workflow.json',
    '--manifest',
    'manifest.json',
    '--steps',
    'build',
  ],
]) {
  test('workflow manifest validates complete grammar before IO ' + JSON.stringify(args), () => {
    expect(() => runWorkflowBindingCommand(args, '/never-read-workflow-root')).toThrow(
      UsageRefusal,
    );
  });
}
test('workflow manifest reaches actual Burokrat command dispatch', async () => {
  const expected = accept();
  const invocation = await invokeCli([
    'validate',
    'workflow-binding',
    join(root, 'workflow.json'),
    '--manifest',
    join(root, 'manifest.json'),
  ]);
  expect(invocation).toEqual({ exitCode: 0, stdout: expected + '\n', stderr: '' });
});

for (const [flag, value, catalogue] of [
  ['--manifest', 'manifest.json', { kind: 'manifest', file: 'manifest.json' }],
  ['--steps', 'build,research', { kind: 'steps', steps: ['build', 'research'] }],
] as const) {
  test('workflow manifest root Optique grammar returns a typed request ' + flag, () => {
    expect(
      readInvocation(
        installedGrammar,
        ['validate', 'workflow-binding', 'workflow.json', flag, value],
        {
          stdout() {
            throw Error('grammar unexpectedly printed');
          },
        },
      ),
    ).toEqual({
      kind: 'command',
      command: { command: 'validate workflow-binding', file: 'workflow.json', catalogue },
    });
  });
}
test('workflow manifest root Optique grammar refuses competing applicability sources', () => {
  expect(() =>
    readInvocation(
      installedGrammar,
      [
        'validate',
        'workflow-binding',
        'workflow.json',
        '--manifest',
        'manifest.json',
        '--steps',
        'build',
      ],
      {
        stdout() {
          throw Error('grammar unexpectedly printed');
        },
      },
    ),
  ).toThrow(UsageRefusal);
});

test('workflow manifest checks an untyped-only default without typed fallback interference', () => {
  const manifest = { ...createManifest(), types: [] },
    binding = { ...createBinding(), types: [] };
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  binding.default.push(entry('research'));
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expectRefusal(accept, 'unknown_step', 'default.research');
});
test('workflow manifest refuses duplicate typed codes in the actual manifest', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const manifest = createManifest();
  manifest.types[2].codes.push('research');
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  expectRefusal(accept, 'invalid_binding');
});
test('workflow manifest refuses duplicate untyped binding codes', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const binding = createBinding();
  binding.default.push(entry('build'));
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  expectRefusal(accept, 'invalid_binding');
});
for (const revision of [-1, 1.5, 9007199254740992]) {
  test('workflow manifest refuses coherently malformed revisions ' + String(revision), () => {
    expect(accept()).toMatch(/^[0-9a-f]{64}$/);
    const manifest = createManifest(),
      binding = createBinding();
    manifest.project.revision = revision;
    binding.project.revision = revision;
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
    expectRefusal(accept, 'invalid_binding');
  });
}
test('workflow manifest refuses invalid UTF-8 even when replacement text would match the binding', () => {
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
  const manifest = createManifest(),
    binding = createBinding();
  manifest.project.id = 'INVALID_UTF8_ID';
  binding.project.id = '\ufffd';
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  const encoded = JSON.stringify(manifest),
    marker = encoded.indexOf('INVALID_UTF8_ID');
  if (marker < 0) throw Error('manifest UTF-8 fault marker absent');
  writeFileSync(
    join(root, 'manifest.json'),
    Buffer.concat([
      Buffer.from(encoded.slice(0, marker)),
      Buffer.from([0xff]),
      Buffer.from(encoded.slice(marker + 'INVALID_UTF8_ID'.length)),
    ]),
  );
  expectRefusal(accept, 'invalid_manifest', 'manifest.json');
});
test('workflow manifest preserves stable reserved and whitespace-bearing type identities', () => {
  const manifest = createManifest();
  for (const workItemTypeId of ['__proto__', 'prototype', 'has space'])
    manifest.types.push({ workItemTypeId, codes: ['build'] });
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
  expect(accept()).toMatch(/^[0-9a-f]{64}$/);
});
test('workflow manifest actual process accepts the digest and refuses another type code', () => {
  const expected = accept();
  function invoke(label: string) {
    const stdoutPath = join(root, label + '.stdout'),
      stderrPath = join(root, label + '.stderr');
    const stdout = openSync(stdoutPath, 'wx', 0o600);
    let child: ReturnType<typeof Bun.spawnSync>;
    try {
      const stderr = openSync(stderrPath, 'wx', 0o600);
      try {
        child = Bun.spawnSync({
          cmd: [
            process.execPath,
            join(import.meta.dir, 'cli.ts'),
            'validate',
            'workflow-binding',
            'workflow.json',
            '--manifest',
            'manifest.json',
          ],
          cwd: root,
          stdin: 'ignore',
          stdout,
          stderr,
          timeout: 30000,
        });
      } finally {
        closeSync(stderr);
      }
    } finally {
      closeSync(stdout);
    }
    const signal: unknown = child.signalCode;
    if (signal !== undefined && signal !== null)
      throw Error('manifest command terminated by signal');
    return {
      exitCode: child.exitCode,
      stdout: readFileSync(stdoutPath, 'utf8'),
      stderr: readFileSync(stderrPath, 'utf8'),
    };
  }
  expect(invoke('accepted')).toEqual({ exitCode: 0, stdout: expected + '\n', stderr: '' });
  const binding = createBinding();
  binding.types.push({ workItemTypeId: 'story', steps: [entry('build'), entry('research')] });
  writeFileSync(join(root, 'workflow.json'), JSON.stringify(binding));
  const refused = invoke('refused');
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('unknown_step');
  expect(refused.stderr).toContain('types.story.research');
});
