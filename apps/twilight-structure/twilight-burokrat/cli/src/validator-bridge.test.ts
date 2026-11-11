import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { buildValidatorBundle } from './policy/trusted-modules';
import { readWorkflowBinding } from './workflow-binding';

const directories: string[] = [];
function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni-validator-bridge '));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function invoke(request: unknown, callerDirectory = scratch()) {
  return Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      join(import.meta.dir, 'cli.ts'),
      '--puni-request-v1',
    ],
    {
      cwd: scratch(),
      env: { PATH: process.env['PATH'] },
      stdin: Buffer.from(JSON.stringify({ version: 1, callerDirectory, request })),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
}

describe('actual validator stdin bridge', () => {
  it('executes a typed template command through the validator role', () => {
    const child = invoke({ command: 'template', action: 'list' });
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toContain('"id":"module"');
    expect(child.stderr.toString()).toBe('');
  });

  for (const request of [
    { command: 'candidate-identity', repository: '.', kind: 'committed', revision: 'HEAD' },
    { command: 'template', action: 'list', injected: 'secret-sentinel' },
    { command: 'template', action: 'bogus-secret-sentinel' },
  ]) {
    it('refuses invalid transport before dispatch: ' + JSON.stringify(request), () => {
      const child = invoke(request);
      expect(child.exitCode).toBe(1);
      expect(child.stdout.toString()).toBe('');
      expect(child.stderr.toString()).toBe('invalid installed validator request\n');
    });
  }

  it('uses caller root for relative binding and prompt files without changing safe child cwd', () => {
    const callerDirectory = scratch();
    mkdirSync(join(callerDirectory, '.twilight'));
    writeFileSync(join(callerDirectory, '.twilight/approve.md'), 'Approve this revision.\n');
    writeFileSync(
      join(callerDirectory, '.twilight/workflows.yaml'),
      `version: 1
types:
  default:
    approve: { class: decision }
classes:
  decision:
    executor: human
    prompt: .twilight/approve.md
`,
    );
    const accepted = readWorkflowBinding(callerDirectory, '.twilight/workflows.yaml', ['approve']);
    const child = invoke(
      {
        command: 'validate workflow-binding',
        file: '.twilight/workflows.yaml',
        steps: ['approve'],
      },
      callerDirectory,
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe(accepted.bindingDigest + '\n');
    expect(child.stderr.toString()).toBe('');
  });

  it('dispatches with both argv adapters broken', () => {
    const child = Bun.spawnSync(
      [process.execPath, join(import.meta.dir, 'fixtures/request-dispatch.fixture.ts')],
      { cwd: scratch(), stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toContain('"id":"module"');
  });

  it('opens ordinary host inputs relative to the caller rather than the safe child cwd', () => {
    const callerDirectory = scratch();
    writeFileSync(join(callerDirectory, 'selected.json'), '{malformed selected input');
    const child = invoke(
      { command: 'validate-plan-tasks', planReference: 'selected.json', tasks: 'later.json' },
      callerDirectory,
    );
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toContain(
      'malformed JSON input ' + callerDirectory + '/selected.json:',
    );
  });

  it('preserves native symlink then parent semantics for host file inputs', () => {
    const callerDirectory = scratch();
    const outside = scratch();
    mkdirSync(join(outside, 'inner'));
    symlinkSync(join(outside, 'inner'), join(callerDirectory, 'link'));
    writeFileSync(join(outside, 'selected.json'), '{malformed native selected input');
    writeFileSync(join(callerDirectory, 'selected.json'), '{}');
    const child = invoke(
      {
        command: 'validate-plan-tasks',
        planReference: 'link/../selected.json',
        tasks: 'later.json',
      },
      callerDirectory,
    );
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain(
      'malformed JSON input ' + callerDirectory + '/link/../selected.json:',
    );
  });
  it('refuses malformed UTF-8 without replacing its bytes before validation', () => {
    const bytes = Buffer.from(
      JSON.stringify({
        version: 1,
        callerDirectory: scratch(),
        request: { command: 'template', action: 'show', template: 'MARKER' },
      }).replace('MARKER', '@'),
    );
    bytes[bytes.indexOf('@')] = 0xff;
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        join(import.meta.dir, 'cli.ts'),
        '--puni-request-v1',
      ],
      { cwd: scratch(), stdin: bytes, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toBe('invalid installed validator request\n');
  });
  it('includes the typed bridge in the actual standalone validator role bundle', async () => {
    const directory = scratch();
    const entrypoint = join(directory, 'validator.mjs');
    await Bun.write(entrypoint, await buildValidatorBundle(join(import.meta.dir, 'cli.ts')));
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', entrypoint, '--puni-request-v1'],
      {
        cwd: scratch(),
        stdin: Buffer.from(
          JSON.stringify({
            version: 1,
            callerDirectory: scratch(),
            request: { command: 'template', action: 'list' },
          }),
        ),
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toContain('"id":"module"');
    expect(child.stderr.toString()).toBe('');
  });
});
