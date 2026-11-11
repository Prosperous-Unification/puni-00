import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { copyTrustedModules, hashSelectedModules, hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function write(path: string, bytes: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni selected dependencies '));
  roots.push(root);
  const modules = join(root, 'node_modules');
  write(join(modules, 'consumer/index.js'), 'export const selected="consumer";');
  write(join(modules, 'consumer/package.json'), '{"name":"consumer","version":"1.0.0"}');
  write(
    join(modules, 'consumer/node_modules/dependency/index.js'),
    'export const selected="nested";',
  );
  write(
    join(modules, 'consumer/node_modules/dependency/package.json'),
    '{"name":"dependency","version":"1.0.0"}',
  );
  write(
    join(modules, 'consumer/node_modules/unrelated/poison.js'),
    'throw new Error("not selected");',
  );
  write(join(modules, 'unrelated/poison.js'), 'throw new Error("not selected");');
  write(join(modules, 'elysia/index.js'), 'export const selected="elysia";');
  write(join(modules, 'elysia/package.json'), '{"name":"elysia","version":"1.0.0"}');
  write(join(modules, 'elysia/bunfig.toml'), 'preload=["./must-not-run.ts"]');
  return { root, modules, names: ['consumer', 'consumer/node_modules/dependency', 'elysia'] };
}

it('pins exactly the selected copied dependency bytes and nested instance topology', () => {
  const fixture = createFixture(),
    destination = join(fixture.root, 'closure');
  const expected = hashSelectedModules(fixture.modules, fixture.names);
  copyTrustedModules(destination, fixture.modules, fixture.names);
  expect(hashTrustedModules(destination)).toBe(expected);
  write(join(fixture.modules, 'unrelated/poison.js'), 'changed unrelated');
  write(join(fixture.modules, 'consumer/node_modules/unrelated/poison.js'), 'changed unrelated');
  write(join(fixture.modules, 'elysia/bunfig.toml'), 'changed omitted metadata');
  expect(hashSelectedModules(fixture.modules, fixture.names)).toBe(expected);
  write(join(fixture.modules, 'consumer/node_modules/dependency/index.js'), 'changed selected');
  expect(hashSelectedModules(fixture.modules, fixture.names)).not.toBe(expected);
});

it('refuses a selected dependency symlink rather than pinning an external target', () => {
  const fixture = createFixture(),
    outside = join(fixture.root, 'outside.js');
  writeFileSync(outside, 'external');
  symlinkSync(outside, join(fixture.modules, 'consumer/external.js'));
  expect(() => hashSelectedModules(fixture.modules, fixture.names)).toThrow('non-regular');
});

it('refuses a missing selected dependency instead of weakening its closure', () => {
  const fixture = createFixture();
  expect(() => hashSelectedModules(fixture.modules, [...fixture.names, 'absent'])).toThrow(
    'absent or a symlink',
  );
});
