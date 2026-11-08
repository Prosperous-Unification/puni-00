import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';
import ts from 'typescript';

const storagePath =
  process.env['STORE_FINITE_SOURCE'] ?? join(import.meta.dir, 'dependency-activation-storage.ts');
const storageSource = readFileSync(storagePath, 'utf8');

function selectSourceMutation(source: string): string {
  const mutation = process.env['STORE_FINITE_MUTANT'];
  if (mutation === undefined) return source;
  const faults = new Map<string, [string, string, number]>(
    Object.entries({
      mode: [
        'if (isInitial) closeRaw();\n        else checkDeadline();',
        'if (false) closeRaw();\n        else checkDeadline();',
        2,
      ],
      closed: [
        "if (isClosed) throw new Error('activation evidence monitor closed');",
        "if (false) throw new Error('activation evidence monitor closed');",
        1,
      ],
      closure: ['raw.verifyClosure();', 'void 0;', 1],
      stability: ['raw.assertStable();', 'void 0;', 1],
      deadline: [
        "if (performance.now() >= deadline) throw new Error('activation deadline exceeded');",
        "if (false) throw new Error('activation deadline exceeded');",
        1,
      ],
    }),
  );
  const fault = faults.get(mutation);
  if (fault === undefined) throw new Error(`unknown finite source mutation: ${mutation}`);
  const [before, after, expectedCount] = fault;
  assert.equal(source.split(before).length - 1, expectedCount);
  return source.replaceAll(before, after);
}

function extractObservationSites(sourceText: string) {
  const source = ts.createSourceFile(
    'dependency-activation-storage.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const activation = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'activateDependencyStores',
  );
  assert.ok(activation?.body !== undefined);
  const body = activation.body;
  const closeRaw = body.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'closeRaw',
  );
  assert.ok(closeRaw !== undefined);
  const declaration = (name: string) => {
    const found: ts.VariableDeclaration[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
        found.push(node);
      ts.forEachChild(node, visit);
    };
    visit(body);
    assert.equal(found.length, 1);
    const selected = found.at(0);
    assert.ok(selected?.initializer !== undefined);
    return selected;
  };
  const deadline = declaration('checkDeadline');
  const inspect = declaration('inspectStores');
  const initializer = inspect.initializer;
  assert.ok(
    initializer !== undefined && ts.isArrowFunction(initializer) && ts.isBlock(initializer.body),
  );
  const lifecycle = initializer.body.statements.at(0);
  assert.ok(lifecycle !== undefined && ts.isTryStatement(lifecycle));
  const steps = lifecycle.tryBlock.statements;
  assert.equal(steps.length, 7);
  for (const index of [0, 1, 4, 5]) {
    const statement = steps.at(index);
    assert.ok(statement !== undefined && ts.isExpressionStatement(statement));
    assert.ok(ts.isAwaitExpression(statement.expression));
    const call = statement.expression.expression;
    assert.ok(ts.isCallExpression(call) && ts.isIdentifier(call.expression));
    assert.equal(call.expression.text, 'assertDependencyOwner');
  }
  const middle = steps.at(3);
  assert.ok(middle !== undefined && ts.isForOfStatement(middle));
  const branches = [steps.at(2), steps.at(6)];
  return {
    closeRaw: closeRaw.getText(source),
    checkDeadline: `const ${deadline.getText(source)};`,
    branches: branches.map((branch) => {
      assert.ok(branch !== undefined && ts.isIfStatement(branch));
      return branch.getText(source);
    }),
  };
}

interface Observation {
  isInitial: boolean;
  isClosed: boolean;
  now: number;
  deadline: number;
  raw?: { verifyClosure: () => void; assertStable: () => void };
}

function runObservation(site: number, observation: Observation) {
  const cuts = extractObservationSites(selectSourceMutation(storageSource));
  const branch = cuts.branches.at(site);
  assert.ok(branch !== undefined);
  const statements = `${cuts.closeRaw}\n${cuts.checkDeadline}\n${branch}`;
  // The trusted local TypeScript AST is the sole dynamic-function input; its cut contains no imports or IO.
  const execute = Reflect.construct(Function, [
    'bindings',
    `with (bindings) { ${statements} }`,
  ]) as (bindings: Record<string, unknown>) => void;
  execute({ raw: undefined, ...observation, performance: { now: () => observation.now } });
}

function captureRawRefusal(observe: () => void): unknown {
  try {
    observe();
  } catch (failure) {
    return failure;
  }
  throw new Error('finite source cut admitted raw refusal');
}

for (const site of [0, 1]) {
  test(`finite store observation site ${String(site + 1)} keeps initial raw custody`, () => {
    const events: string[] = [];
    runObservation(site, {
      isInitial: true,
      isClosed: false,
      now: 9,
      deadline: 10,
      raw: {
        verifyClosure: () => events.push('closure'),
        assertStable: () => events.push('stable'),
      },
    });
    // Proof: replacing the mode branch or either raw check in the source cut loses this observed sequence.
    expect(events).toEqual(['closure', 'stable']);
  });

  test(`finite store observation site ${String(site + 1)} refuses a closed initial monitor`, () => {
    const events: string[] = [];
    expect(() => {
      runObservation(site, {
        isInitial: true,
        isClosed: true,
        now: 9,
        deadline: 10,
        raw: {
          verifyClosure: () => events.push('closure'),
          assertStable: () => events.push('stable'),
        },
      });
    }).toThrow('activation evidence monitor closed');
    // Proof: removing the source cut's closed-monitor guard admits raw checks and fails this refusal.
    expect(events).toEqual([]);
  });

  test(`finite store observation site ${String(site + 1)} retains the original raw refusal`, () => {
    const closureFailure = new Error('inert closure refusal');
    const stabilityFailure = new Error('inert stability refusal');
    const observedClosure = captureRawRefusal(() => {
      runObservation(site, {
        isInitial: true,
        isClosed: false,
        now: 9,
        deadline: 10,
        raw: {
          verifyClosure: () => {
            throw closureFailure;
          },
          assertStable: () => undefined,
        },
      });
    });
    expect(observedClosure).toBe(closureFailure);
    const observedStability = captureRawRefusal(() => {
      runObservation(site, {
        isInitial: true,
        isClosed: false,
        now: 9,
        deadline: 10,
        raw: {
          verifyClosure: () => undefined,
          assertStable: () => {
            throw stabilityFailure;
          },
        },
      });
    });
    expect(observedStability).toBe(stabilityFailure);
  });

  test(`finite store observation site ${String(site + 1)} checks restoration deadline without raw custody`, () => {
    expect(() => {
      runObservation(site, { isInitial: false, isClosed: true, now: 9, deadline: 10 });
    }).not.toThrow();
    expect(() => {
      runObservation(site, { isInitial: false, isClosed: true, now: 10, deadline: 10 });
    }).toThrow('activation deadline exceeded');
    expect(() => {
      runObservation(site, { isInitial: true, isClosed: false, now: 10, deadline: 10 });
    }).toThrow('activation deadline exceeded');
    // Proof: removing the original deadline guard makes both expired observations succeed.
  });
}
