import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { digestOf } from './contracts/canonical';
import { selectWorkflowActivity } from './contracts/validate-workflow-binding';
import { WorkflowBindingError } from './contracts/workflow-binding';
import { invokeCli } from './invoke-cli';
import { readWorkflowBinding, runWorkflowBindingCommand } from './workflow-binding';

let root: string;
let prompt: string;
let binding: string;
const ordinary = `version: 1
types:
  default:
    approve: { class: decision }
classes:
  decision:
    executor: human
    prompt: .twilight/approve.md
`;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'binding-'));
  mkdirSync(join(root, '.twilight'));
  prompt = join(root, '.twilight', 'approve.md');
  binding = join(root, '.twilight', 'workflows.yaml');
  writeFileSync(prompt, 'Approve this revision.\n');
  writeFileSync(binding, ordinary);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
function read() {
  return readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve']);
}

function expectRefusal(action: () => unknown, code: string, path?: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowBindingError);
    if (!(error instanceof WorkflowBindingError)) throw error;
    expect(error).toMatchObject({ code });
    if (path !== undefined) expect(error.path).toBe(path);
    return error;
  }
  throw new Error(`expected ${code}`);
}

test('anchors prompt to root, not binding directory', () => {
  const accepted = read();
  expect(accepted.prompts[0].text).toBe('Approve this revision.\n');
  expect(accepted.bindingDigest).toBe(digestOf(accepted.snapshot));
  expect(readWorkflowBinding(root, binding, ['approve']).bindingDigest).toBe(
    accepted.bindingDigest,
  );
  expect(Reflect.set(accepted.snapshot.binding.classes['decision'], 'prompt', 'changed')).toBe(
    false,
  );
  expect(Reflect.set(accepted.prompts[0], 'text', 'changed')).toBe(false);
  writeFileSync(prompt, 'Later.\n');
  expect(accepted.prompts[0].text).toBe('Approve this revision.\n');
  expect(read().bindingDigest).not.toBe(accepted.bindingDigest);
});

test('names absent prompt separately from unreadable prompt', () => {
  rmSync(prompt);
  expectRefusal(read, 'prompt_missing', '.twilight/approve.md');
});
test('names unreadable prompt at the real filesystem boundary', () => {
  if (process.getuid?.() === 0) throw new Error('file-mode proof requires non-root');
  chmodSync(prompt, 0);
  try {
    expect(() => readFileSync(prompt)).toThrow();
    expect(expectRefusal(read, 'prompt_unreadable').cause).toBeInstanceOf(Error);
  } finally {
    chmodSync(prompt, 0o600);
  }
});
test('names absent binding separately from unreadable binding', () => {
  rmSync(binding);
  expectRefusal(read, 'binding_missing', '.twilight/workflows.yaml');
});
test('names unreadable binding at the real filesystem boundary', () => {
  if (process.getuid?.() === 0) throw new Error('file-mode proof requires non-root');
  chmodSync(binding, 0);
  try {
    expect(() => readFileSync(binding)).toThrow();
    expect(expectRefusal(read, 'binding_unreadable').cause).toBeInstanceOf(Error);
  } finally {
    chmodSync(binding, 0o600);
  }
});
test('refuses a nonregular binding before reading its bytes', () => {
  rmSync(binding);
  mkdirSync(binding);
  const refusal = expectRefusal(read, 'invalid_yaml');
  expect(refusal.message).toContain('binding must be a regular file');
});
test('refuses an unusable root', () => {
  expectRefusal(
    () => readWorkflowBinding(join(root, 'absent'), '.twilight/workflows.yaml', ['approve']),
    'binding_unreadable',
    'repositoryRoot',
  );
  expectRefusal(
    () => readWorkflowBinding(prompt, '.twilight/workflows.yaml', ['approve']),
    'binding_unreadable',
    'repositoryRoot',
  );
});
test('names a permission-denied root at its own boundary and preserves its IO cause', () => {
  if (process.getuid?.() === 0) throw new Error('file-mode proof requires non-root');
  chmodSync(root, 0);
  try {
    expect(() => readFileSync(binding)).toThrow();
    const refusal = expectRefusal(read, 'binding_unreadable', 'repositoryRoot');
    expect(refusal.cause).toBeInstanceOf(Error);
    expect(refusal.cause).toMatchObject({ code: 'EACCES', path: root });
  } finally {
    chmodSync(root, 0o700);
  }
});
test('refuses a prompt directory', () => {
  rmSync(prompt);
  mkdirSync(prompt);
  expectRefusal(read, 'prompt_not_file');
});
test('permits a prompt symlink inside physical root', () => {
  const destination = join(root, 'inside.md');
  writeFileSync(destination, 'Inside.\n');
  rmSync(prompt);
  symlinkSync(destination, prompt);
  expect(read().prompts[0].text).toBe('Inside.\n');
});
test('refuses a prompt symlink outside physical root including sibling prefix', () => {
  const outside = mkdtempSync(`${root}-sibling-`);
  try {
    const destination = join(outside, 'outside.md');
    writeFileSync(destination, 'Outside.\n');
    rmSync(prompt);
    symlinkSync(destination, prompt);
    expectRefusal(read, 'prompt_outside_root');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
test('resolves physical repository root symlinks', () => {
  const alias = `${root}-alias`;
  try {
    symlinkSync(root, alias);
    expect(readWorkflowBinding(alias, '.twilight/workflows.yaml', ['approve']).bindingDigest).toBe(
      read().bindingDigest,
    );
  } finally {
    rmSync(alias);
  }
});
test('refuses malformed binding UTF-8', () => {
  writeFileSync(binding, Uint8Array.from([0xc3, 0x28]));
  expectRefusal(read, 'invalid_yaml');
});

test.each([
  ['duplicate key', ordinary + 'version: 1\n'],
  ['non-string key', ordinary.replace('approve:', '7:')],
  ['complex key', ordinary.replace('approve:', '? [approve]\n    :')],
  [
    'alias',
    ordinary.replace(
      'approve: { class: decision }',
      'approve: &ref { class: decision }\n    other: *ref',
    ),
  ],
  [
    'merge',
    ordinary.replace('approve: { class: decision }', 'approve: { class: decision, <<: {} }'),
  ],
  ['custom tag', ordinary.replace('version: 1', 'version: !custom 1')],
  ['non-JSON standard tag', ordinary.replace('version: 1', 'version: !!set {}')],
  ['YAML 1.1 directive', '%YAML 1.1\n---\n' + ordinary],
  ['warning directive', '%FOO bar\n---\n' + ordinary],
  ['extra document', ordinary + '\n---\nversion: 1\n'],
  ['parser error', ordinary + '\n[broken'],
  [
    'strict comment spacing',
    ordinary.replace('executor: human', 'executor: "human"#missing-space'),
  ],
  ['empty stream', ''],
])('refuses YAML %s', (_name, yaml) => {
  writeFileSync(binding, yaml);
  expectRefusal(read, 'invalid_yaml');
});
test.each([
  ['scalar root', 'true\n', 'invalid_binding'],
  ['null root', 'null\n', 'invalid_binding'],
  ['array root', '[]\n', 'invalid_binding'],
  ['nonfinite scalar', ordinary.replace('version: 1', 'version: .inf'), 'invalid_binding'],
  ['missing version', ordinary.replace('version: 1\n', ''), 'invalid_binding'],
  ['unsupported version', ordinary.replace('version: 1', 'version: 2'), 'unsupported_version'],
  ['undeclared field', ordinary + 'extra: true\n', 'invalid_binding'],
])('refuses binding %s after YAML', (_name, yaml, code) => {
  writeFileSync(binding, yaml);
  expectRefusal(read, code);
});
test('accepts explicit standard tags and YAML 1.2 without interpolating environment', () => {
  writeFileSync(
    binding,
    '%YAML 1.2\n---\n' +
      ordinary
        .replace('version: 1', 'version: !!int 1')
        .replace('executor: human', 'executor: !!str human'),
  );
  expect(read().prompts[0].text).toBe('Approve this revision.\n');
  writeFileSync(join(root, '.twilight/$UNSET_BINDING_PATH.md'), 'Literal path.\n');
  writeFileSync(
    binding,
    ordinary.replace('.twilight/approve.md', '.twilight/$UNSET_BINDING_PATH.md'),
  );
  expect(read().prompts[0].text).toBe('Literal path.\n');
});
test('keeps digest stable across commented reordered YAML and changes it for original BOM or newline bytes', () => {
  const accepted = read();
  writeFileSync(
    binding,
    '# reordered\nclasses: { decision: { prompt: .twilight/approve.md, executor: human } }\ntypes: { default: { approve: { class: decision } } }\nversion: 1\n',
  );
  expect(read().bindingDigest).toBe(accepted.bindingDigest);
  writeFileSync(
    prompt,
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Approve this revision.\n')]),
  );
  expect(read().bindingDigest).not.toBe(accepted.bindingDigest);
  writeFileSync(prompt, 'Approve this revision.');
  expect(read().bindingDigest).not.toBe(accepted.bindingDigest);
});
test('checks coverage before attempting prompt reads', () => {
  rmSync(prompt);
  expectRefusal(
    () => readWorkflowBinding(root, '.twilight/workflows.yaml', ['approve', 'later']),
    'missing_step',
  );
});
test('loads the complete illustrative parent YAML with its exact five project codes', () => {
  copyFileSync(join(import.meta.dir, 'contracts/fixtures/workflow-binding.v1.yaml'), binding);
  mkdirSync(join(root, '.twilight/prompts'));
  for (const name of ['plan', 'impl', 'review', 'integrate'])
    writeFileSync(join(root, `.twilight/prompts/${name}.md`), `${name}\n`);
  const accepted = readWorkflowBinding(root, '.twilight/workflows.yaml', [
    'plan',
    'impl',
    'review',
    'verify',
    'integrate',
  ]);
  expect(accepted.prompts).toHaveLength(4);
  expect(selectWorkflowActivity(accepted, 'change', 'review').settings.executor).toBe('api-model');
  expect(selectWorkflowActivity(accepted, 'change', 'integrate').settings.executor).toBe('human');
  expect(selectWorkflowActivity(accepted, 'change', 'verify').prompt).toBeNull();
});

function spawnBinding(args: readonly string[], cwd = root) {
  const child = Bun.spawnSync({
    cmd: [process.execPath, join(import.meta.dir, 'cli.ts'), ...args],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
}
function expectCliRefusal(
  invocation: { exitCode: number | null; stdout: string; stderr: string },
  code: string,
) {
  expect(invocation.exitCode, invocation.stderr).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(code);
}

test('routes an incomplete binding command before generic record validation', async () => {
  const invocation = await invokeCli(['validate', 'workflow-binding', '/never-read.yaml']);
  expectCliRefusal(invocation, 'invalid_arguments');
  expect(invocation.stderr).not.toContain('binding_missing');
});
test('prints only the accepted digest with real cwd and exit status', () => {
  const accepted = read();
  const invocation = spawnBinding([
    'validate',
    'workflow-binding',
    '.twilight/workflows.yaml',
    '--steps',
    'approve',
  ]);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  expect(invocation.stdout).toBe(`${accepted.bindingDigest}\n`);
  expect(invocation.stderr).toBe('');
});
test.each([
  ['no operands', []],
  ['missing steps value', ['.twilight/workflows.yaml', '--steps']],
  ['extra operand', ['.twilight/workflows.yaml', '--steps', 'approve', 'extra']],
  ['repeated flag', ['.twilight/workflows.yaml', '--steps', 'approve', '--steps', 'approve']],
  ['wrong flag', ['.twilight/workflows.yaml', '--step', 'approve']],
  ['repeated flag as value', ['.twilight/workflows.yaml', '--steps', '--steps']],
  ['empty filename', ['', '--steps', 'approve']],
  ['flag as filename', ['--steps', '--steps', 'approve']],
  ['empty steps', ['.twilight/workflows.yaml', '--steps', '']],
  ['leading empty segment', ['.twilight/workflows.yaml', '--steps', ',approve']],
  ['trailing empty segment', ['.twilight/workflows.yaml', '--steps', 'approve,']],
  ['duplicate segment', ['.twilight/workflows.yaml', '--steps', 'approve,approve']],
  ['whitespace segment', ['.twilight/workflows.yaml', '--steps', 'approve, later']],
])('refuses malformed CLI %s before filesystem access', (name, operands) => {
  // A valid absolute binding makes isolated arity/flag bypasses reach real acceptance.
  const args = operands.map((operand) =>
    operand === '.twilight/workflows.yaml' ? binding : operand,
  );
  expectCliRefusal(spawnBinding(['validate', 'workflow-binding', ...args]), 'invalid_arguments');
  if (name !== 'no operands') {
    rmSync(binding);
    expectCliRefusal(spawnBinding(['validate', 'workflow-binding', ...args]), 'invalid_arguments');
  }
});
// Proof: bypassing only production checkWorkflowBinding step membership made this spawned
// complete approve+qa fixture exit 0 with a digest and empty stderr; the refusal test failed.
test('refuses an unknown qa mapping in a spawned binding command', () => {
  writeFileSync(
    binding,
    ordinary.replace(
      'approve: { class: decision }',
      'approve: { class: decision }\n    qa: { class: decision }',
    ),
  );
  const invocation = spawnBinding([
    'validate',
    'workflow-binding',
    '.twilight/workflows.yaml',
    '--steps',
    'approve',
  ]);
  expectCliRefusal(invocation, 'unknown_step');
  expect(invocation.stderr).toContain('types.default.qa');
});
test('uses actual cwd for prompts even with an absolute binding filename', () => {
  const nested = join(root, 'nested');
  mkdirSync(nested);
  const invocation = spawnBinding(
    ['validate', 'workflow-binding', binding, '--steps', 'approve'],
    nested,
  );
  expectCliRefusal(invocation, 'prompt_missing');
  expect(invocation.stderr).toContain('.twilight/approve.md');
});
test.each([
  ['missing binding', 'binding_missing'],
  ['missing prompt', 'prompt_missing'],
  ['malformed YAML', 'invalid_yaml'],
])('prints named stderr and no success stdout for %s', (name, code) => {
  if (name === 'missing binding') rmSync(binding);
  if (name === 'missing prompt') rmSync(prompt);
  if (name === 'malformed YAML') writeFileSync(binding, '[broken');
  expectCliRefusal(
    spawnBinding([
      'validate',
      'workflow-binding',
      '.twilight/workflows.yaml',
      '--steps',
      'approve',
    ]),
    code,
  );
});
test.each(['validate', 'validate-record'])(
  'preserves legacy %s JSON validation',
  async (command) => {
    const filename = join(root, 'entry.json');
    writeFileSync(
      filename,
      JSON.stringify({
        schemaVersion: 1,
        path: 'example.ts',
        mode: '100644',
        blob: '1'.repeat(40),
      }),
    );
    const invocation = await invokeCli([command, 'candidate-entry', filename]);
    expect(invocation.exitCode, invocation.stderr).toBe(0);
    expect(invocation.stdout).toBe('valid candidate-entry\n');
    expect(invocation.stderr).toBe('');
  },
);
test.each([
  ['short', ['validate-record', 'workflow-binding', '/never-read.yaml']],
  [
    'complete',
    ['validate-record', 'workflow-binding', '.twilight/workflows.yaml', '--steps', 'approve'],
  ],
])('keeps binding out of the JSON-only alias (%s)', async (_name, args) => {
  const invocation = await invokeCli(args);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr.length).toBeGreaterThan(0);
  expect(invocation.stderr).not.toContain('invalid_arguments');
  expect(invocation.stderr).not.toContain('binding_missing');
});

test.each([
  [
    'wrong command',
    ['validate-record', 'workflow-binding', '.twilight/workflows.yaml', '--steps', 'approve'],
  ],
  [
    'wrong subject',
    ['validate', 'candidate-entry', '.twilight/workflows.yaml', '--steps', 'approve'],
  ],
])('refuses helper %s before filesystem access', (_name, args) => {
  expectRefusal(() => runWorkflowBindingCommand(args, root), 'invalid_arguments', 'arguments');
  rmSync(binding);
  expectRefusal(() => runWorkflowBindingCommand(args, root), 'invalid_arguments', 'arguments');
});
