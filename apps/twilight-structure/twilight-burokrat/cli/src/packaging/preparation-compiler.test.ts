import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, expect, it, spyOn } from 'bun:test';

import * as derivative from './compiler-derivative';
import { prepareCompiler } from './preparation-compiler';

const require = createRequire(import.meta.url),
  upstreamPath = require.resolve('@typescript/old/lib/typescript.js'),
  upstream = readFileSync(upstreamPath, 'utf8'),
  license = readFileSync(join(dirname(upstreamPath), '../LICENSE.txt')),
  notice = readFileSync(join(dirname(upstreamPath), '../ThirdPartyNoticeText.txt'));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
interface Compiler {
  version: string;
  sys: {
    require: (
      baseDir: string,
      moduleName: string,
    ) => { module: unknown; modulePath: string | undefined; error: Error | undefined };
  };
}

it('preserves normal compiler use while refusing the actual plugin loader before execution', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni compiler policy '));
  roots.push(root);
  const controlMarker = join(root, 'control.executed'),
    disabledMarker = join(root, 'disabled.executed'),
    control = join(root, 'control.cjs'),
    disabled = join(root, 'disabled.cjs');
  for (const [path, marker] of [
    [control, controlMarker],
    [disabled, disabledMarker],
  ])
    writeFileSync(
      path,
      'require("node:fs").writeFileSync(' +
        JSON.stringify(marker) +
        ',"executed");module.exports={loaded:true};',
    );
  const original = require(upstreamPath) as Compiler;
  expect(original.sys.require(root, control).error).toBeUndefined();
  expect(existsSync(controlMarker)).toBe(true);
  const prepared = prepareCompiler(upstream, license, notice),
    path = join(root, 'prepared.cjs');
  writeFileSync(path, prepared.source);
  const compiler = require(path) as Compiler;
  expect(compiler.version).toBe(original.version);
  const refused = compiler.sys.require(root, disabled);
  expect(refused.module).toBeUndefined();
  expect(refused.modulePath).toBeUndefined();
  expect(refused.error?.message).toBe('PUNI language-service plugin loading disabled');
  expect(existsSync(disabledMarker)).toBe(false);
  expect(Buffer.from(prepared.license)).toEqual(license);
  expect(Buffer.from(prepared.notice).toString()).toContain(notice.toString());
  expect(Buffer.from(prepared.notice).toString()).toContain(
    'Modified by Prosperous Unification: language-service plugin loading disabled',
  );
});

it('refuses changed compiler upstream bytes', () => {
  expect(() => prepareCompiler(upstream + '\n// changed upstream', license, notice)).toThrow(
    'upstream identity differs',
  );
});

it('refuses a missing compiler loader site instead of emitting an incomplete policy', () => {
  expect(() =>
    prepareCompiler(
      upstream.replace(
        'require: (baseDir, moduleName) => {',
        'require: (_baseDir, moduleName) => {',
      ),
      license,
      notice,
    ),
  ).toThrow('section must occur exactly once');
});

it('refuses duplicate compiler loader sites instead of patching one', () => {
  expect(() => prepareCompiler(upstream + upstream, license, notice)).toThrow(
    'section must occur exactly once',
  );
});

it('refuses a broken transform dependency before returning compiler bytes', () => {
  const probe = spyOn(derivative, 'replaceCompilerSection').mockImplementation((source) => source);
  try {
    expect(() => prepareCompiler(upstream, license, notice)).toThrow('output identity differs');
  } finally {
    probe.mockRestore();
  }
});

for (const boundary of ['license', 'notice'] as const) {
  it('refuses changed compiler ' + boundary + ' bytes', () => {
    expect(() =>
      prepareCompiler(
        upstream,
        boundary === 'license' ? Buffer.from('changed') : license,
        boundary === 'notice' ? Buffer.from('changed') : notice,
      ),
    ).toThrow(boundary + ' identity differs');
  });
}
