import { describe, expect, it } from 'bun:test';

import { daggerArgs } from './dagger-args';
import { $, ShellError } from './shell';
import { buildScpCommand, buildSshCommand } from './ssh';

describe('$ wrapper', () => {
  it('returns stdout on success', async () => {
    const r = await $`echo hello`;
    expect(r.stdout.trim()).toBe('hello');
    expect(r.exitCode).toBe(0);
  });

  it('throws ShellError with exit code on failure', async () => {
    let caught: unknown;
    try {
      await $`sh -c "echo boom >&2; exit 1"`;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ShellError);
    expect((caught as ShellError).exitCode).toBe(1);
  });
});

describe('buildSshCommand', () => {
  it('produces an ssh invocation with StrictHostKeyChecking and trailing remote command', () => {
    const cmd = buildSshCommand({ host: 'deploy.example.com', user: 'root' }, 'uptime');
    expect(cmd[0]).toBe('ssh');
    expect(cmd).toContain('root@deploy.example.com');
    expect(cmd.some((a) => a.startsWith('StrictHostKeyChecking'))).toBe(true);
    expect(cmd.at(-1)).toBe('uptime');
  });

  it('includes -p PORT and -i IDENTITY when provided', () => {
    const cmd = buildSshCommand(
      { host: 'h', user: 'u', port: 2222, identityFile: '/tmp/key' },
      'ls',
    );
    expect(cmd).toContain('-p');
    expect(cmd).toContain('2222');
    expect(cmd).toContain('-i');
    expect(cmd).toContain('/tmp/key');
  });

  it('buildScpCommand uses -P for port and targets user@host:path', () => {
    const cmd = buildScpCommand({ host: 'h', user: 'u', port: 2222 }, './a.txt', '/tmp/b.txt');
    expect(cmd[0]).toBe('scp');
    expect(cmd).toContain('-P');
    expect(cmd.at(-1)).toBe('u@h:/tmp/b.txt');
  });
});

describe('daggerArgs', () => {
  it('serializes string/number flags followed by positional args', () => {
    const a = daggerArgs({ flags: { foo: 'bar', count: 3 }, positional: ['./app'] });
    expect(a).toEqual(['--foo', 'bar', '--count', '3', './app']);
  });

  it('drops boolean-false flags and emits bare flag for boolean-true', () => {
    const a = daggerArgs({ flags: { verbose: true, quiet: false } });
    expect(a).toEqual(['--verbose']);
  });
});
