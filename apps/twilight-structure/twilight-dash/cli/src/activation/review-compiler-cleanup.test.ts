import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { captureCompilerDerivative } from '@twilight-burokrat/judge';
import { afterEach, expect, test } from 'bun:test';

import type { Monotonic } from '../clock';
import { createLimits, createMembers } from './review-compiler-fixture.test-support';
import type * as Runtime from './review-compiler-runtime';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  Bun.gc(true);
});
async function observeLoader(fault: string) {
  const root = await mkdtemp(join(tmpdir(), 'clock-loader-cleanup-'));
  roots.push(root);
  let source = await readFile(new URL('./review-compiler-runtime.ts', import.meta.url), 'utf8');
  source = source.replace(
    "from '@twilight-burokrat/judge'",
    `from '${import.meta.resolve('@twilight-burokrat/judge')}'`,
  );
  const site = '    try {';
  expect(source.split(site)).toHaveLength(2);
  source =
    'export const observedLifetimes: unknown[] = [];\n' +
    source.replace(site, '    observedLifetimes.push(lifetime);\n' + site);
  if (fault === 'policy') source = source.replace('strings: false', 'strings: true');
  if (fault === 'evaluation')
    source = source.replace(
      'new Script(source,',
      'new Script("throw new Error(\'evaluation failure\');",',
    );
  if (fault === 'compatibility')
    source = source.replace(
      'lifetime.compiler = requireCompiler(',
      'new Script("module.exports = null;").runInContext(lifetime.context, { timeout: remaining() });\n      lifetime.compiler = requireCompiler(',
    );
  const path = join(root, 'runtime.ts');
  await writeFile(path, source);
  return import(path) as Promise<
    typeof Runtime & { observedLifetimes: readonly { context?: unknown; compiler?: unknown }[] }
  >;
}
for (const fault of [
  'timing',
  'final-timing',
  'policy',
  'evaluation',
  'compatibility',
  'consumer',
] as const) {
  test(`loader finally clears actual references after ${fault} failure`, async () => {
    const loader = await observeLoader(fault);
    const failure = new Error(`${fault} failure`);
    let samples = 0;
    const timing: Monotonic = {
      now() {
        samples++;
        if ((fault === 'timing' && samples === 2) || (fault === 'final-timing' && samples === 5))
          throw failure;
        return 0;
      },
    };
    let consumerCalls = 0;
    expect(() =>
      loader.withCompilerDerivative(
        captureCompilerDerivative(createMembers(), createLimits()),
        timing,
        () => {
          consumerCalls++;
          throw failure;
        },
      ),
    ).toThrow();
    expect(loader.observedLifetimes).toHaveLength(1);
    expect(loader.observedLifetimes[0]).toEqual({ context: undefined, compiler: undefined });
    expect(consumerCalls).toBe(fault === 'consumer' ? 1 : 0);
  });
}
