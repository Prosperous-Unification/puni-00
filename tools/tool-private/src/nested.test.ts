import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it, spyOn } from 'bun:test';

import { git } from './git';
import { nestedCommands, runNested } from './nested';

function workspace(): string {
  const root = scratchSync('tool-private-nested-');
  git(root, ['init', '--quiet']);
  return root;
}

describe('runNested', () => {
  it('skips visibly with exit 0 when the checkout is absent', async () => {
    const root = workspace();
    const printed = spyOn(console, 'log');
    try {
      const marker = join(root, 'ran');
      expect(await runNested(root, 'puni-fleet', 'check', [['touch', marker]])).toBe(0);
      expect(printed).toHaveBeenCalledWith('private checkout absent: puni-fleet checks skipped');
      expect(await runNested(root, 'puni-fleet', 'rehearse', [['touch', marker]])).toBe(0);
      expect(printed).toHaveBeenCalledWith('private checkout absent: puni-fleet rehearsal skipped');
      expect(await Bun.file(marker).exists()).toBe(false);
    } finally {
      printed.mockRestore();
    }
  });

  it('runs every command inside the checkout without the outer Nx task variables', async () => {
    const root = workspace();
    const nested = join(root, 'private/puni-fleet');
    mkdirSync(nested, { recursive: true });
    process.env['NX_TASK_TARGET_PROJECT'] = 'tool-private';
    try {
      const code = await runNested(root, 'puni-fleet', 'check', [
        ['sh', '-c', 'pwd > first'],
        ['sh', '-c', 'printf %s "${NX_TASK_TARGET_PROJECT-unset}" > second'],
      ]);
      expect(code).toBe(0);
    } finally {
      delete process.env['NX_TASK_TARGET_PROJECT'];
    }
    expect((await Bun.file(join(nested, 'first')).text()).trim()).toBe(nested);
    expect(await Bun.file(join(nested, 'second')).text()).toBe('unset');
  });

  it('propagates the first failing command', async () => {
    const root = workspace();
    const nested = join(root, 'private/puni-fleet');
    mkdirSync(nested, { recursive: true });

    const code = await runNested(root, 'puni-fleet', 'check', [
      ['sh', '-c', 'exit 1'],
      ['touch', 'after'],
    ]);
    expect(code).toBe(1);
    expect(await Bun.file(join(nested, 'after')).exists()).toBe(false);
  });

  it('refuses a private path that is a file rather than reading it as absent', () => {
    const root = workspace();
    mkdirSync(join(root, 'private'));
    writeFileSync(join(root, 'private/puni-fleet'), '');
    expect(runNested(root, 'puni-fleet', 'check', [])).rejects.toThrow(/not a directory/);
  });

  it('refuses a checkout it cannot inspect rather than reading it as absent', () => {
    const root = workspace();
    mkdirSync(join(root, 'private/puni-fleet'), { recursive: true });
    chmodSync(join(root, 'private'), 0o000);
    try {
      expect(runNested(root, 'puni-fleet', 'check', [])).rejects.toThrow(/EACCES/);
    } finally {
      chmodSync(join(root, 'private'), 0o755);
    }
  });

  it('runs the nested repository’s own install and Nx targets', () => {
    expect(nestedCommands).toEqual({
      check: [
        ['bun', 'install', '--frozen-lockfile'],
        ['bunx', 'nx', 'run-many', '-t', 'test', 'lint', 'typecheck', 'check'],
      ],
      rehearse: [
        ['bun', 'install', '--frozen-lockfile'],
        ['bunx', 'nx', 'run-many', '-t', 'rehearse'],
      ],
    });
  });
});
