import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { LintUsageRefusal } from './lint-request';
import { readLintRuntime } from './lint-runtime';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture(name = 'runtime') {
  const root = mkdtempSync(join(tmpdir(), 'puni-lint-runtime-'));
  roots.push(root);
  const directory = join(root, name);
  mkdirSync(directory);
  return { root, directory };
}
describe('stable lint executable lookup', () => {
  it('freezes ordered relative and empty components against the trusted runtime cwd', () => {
    const fixture = createFixture();
    const runtime = readLintRuntime('./tools::/usr/bin:../bin:/', fixture.directory);
    expect(runtime.directory).toBe(fixture.directory);
    expect(runtime.environment['PATH']).toBe(
      fixture.directory +
        '/./tools:' +
        fixture.directory +
        ':/usr/bin:' +
        fixture.directory +
        '/../bin:/',
    );
    expect(runtime.environment['GIT_CONFIG_VALUE_0']).toBe('/dev/null');
    expect(runtime.environment['GIT_ALLOW_PROTOCOL']).toBe('');
  });
  it('keeps a wholly empty PATH confined to the trusted runtime cwd', () => {
    const fixture = createFixture();
    expect(readLintRuntime('', fixture.directory).environment['PATH']).toBe(fixture.directory);
  });
  it('preserves absolute components verbatim including native parent segments', () => {
    const fixture = createFixture();
    const path = '/trusted/alias/../bin:/usr/bin:/bin';
    expect(readLintRuntime(path, fixture.directory).environment['PATH']).toBe(path);
  });
  it('canonicalizes the trusted cwd with native symlink and parent semantics', () => {
    const fixture = createFixture();
    const native = join(fixture.root, 'native');
    mkdirSync(join(native, 'inner'), { recursive: true });
    const alias = join(fixture.root, 'alias');
    symlinkSync(join(native, 'inner'), alias);
    const runtime = readLintRuntime('.:/usr/bin', alias + '/..');
    expect(runtime.directory).toBe(native);
    expect(runtime.environment['PATH']).toBe(native + '/.:/usr/bin');
  });
  it('allows a delimiter-containing runtime cwd with wholly absolute PATH entries', () => {
    const fixture = createFixture('runtime:colon');
    expect(readLintRuntime('/usr/bin:/bin', fixture.directory).environment['PATH']).toBe(
      '/usr/bin:/bin',
    );
  });
  for (const path of ['', '.', 'relative:/usr/bin'])
    it('refuses an unrepresentable anchored PATH ' + JSON.stringify(path), () => {
      const fixture = createFixture('runtime:colon');
      expect(() => readLintRuntime(path, fixture.directory)).toThrow(LintUsageRefusal);
    });
  it('does not default a missing trusted runtime cwd', () => {
    const fixture = createFixture();
    expect(() => readLintRuntime('/usr/bin', join(fixture.root, 'absent'))).toThrow();
  });
});
