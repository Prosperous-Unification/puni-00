import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findClockReads } from '@tools/test-clock-reads';
import { expect, test } from 'bun:test';
import ts from 'typescript';

const sourceRoot = import.meta.dir;
const clockFactories = new Set(['wallClock', 'monotonicClock']);

/**
 * Every production module: each `.ts` under `src/` except tests and anything under a `testing/`
 * directory. Not scanned: modules in a `testing/` segment (fixtures and child processes may read
 * real clocks) and non-`.ts` sources such as `.tmpl` files, which hold no code.
 */
function readProductionModules(): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: sourceRoot })]
    .filter((path) => !path.endsWith('.test.ts') && !path.split('/').includes('testing'))
    .sort();
}

/** True when the module calls `wallClock()` or `monotonicClock()`; a type or import is no call. */
function isComposer(path: string): boolean {
  const file = ts.createSourceFile(
    path,
    readFileSync(join(sourceRoot, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let composes = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      clockFactories.has(node.expression.text)
    ) {
      composes = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return composes;
}

test('only clock.ts reads the wall clock', () => {
  const modules = readProductionModules();
  // A scan that finds nothing passes whatever the modules read.
  expect(modules).toContain('clock.ts');
  expect(modules).toContain('activation/observation-tick.ts');
  expect(modules).not.toContain('activation/testing/observation-close-process.ts');
  const readers = [
    ...new Set(
      modules.flatMap((path) =>
        findClockReads(path, readFileSync(join(sourceRoot, path), 'utf8')).map((read) => read.path),
      ),
    ),
  ];
  // Proof: appending `performance.now()` to activation/observation-tick.ts failed this assertion
  // with `+ "activation/observation-tick.ts"` (2026-10-12).
  expect(readers).toEqual(['clock.ts']);
});

test('only the two composition roots compose the clocks', () => {
  const composers = readProductionModules().filter(isComposer);
  // Proof: defaulting `runObservationService`'s clock to `options.monotonic ?? monotonicClock()`
  // failed this assertion with `+ "activation/observation-service.ts"` (2026-10-12).
  expect(composers).toEqual(['activation/observation-service-cli.ts', 'entrypoint.ts']);
});
