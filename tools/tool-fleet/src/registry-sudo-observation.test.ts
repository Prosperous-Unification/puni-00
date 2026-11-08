import { readFile } from 'node:fs/promises';

import { type } from 'arktype';
import { expect, test } from 'bun:test';
import ts from 'typescript';

interface Observation {
  mode: string;
  code: number;
  error: string;
  output: string;
}

/** Execute the actual contender acceptance branch; root processes, flock and teardown are outside this input-boundary test. */
async function fixture(observation: Observation) {
  const source = await readFile(
    new URL('./registry-maintenance-sudo.native.ts', import.meta.url),
    'utf8',
  );
  const output = source.indexOf('      const competingOutput =');
  const start = source.indexOf("      if (mode === 'early-drop') {", output);
  const end = source.indexOf('      const deadline = Date.now() + 10000;', start);
  if (output < 0 || start < output || end < start)
    throw new Error('Missing actual contender observation boundary');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(start, end));
  let decodes = 0;
  const decoder = {
    parse(text: string): unknown {
      decodes++;
      return JSON.parse(text);
    },
  };
  // Boundary: the selected actual caller branch runs with modeled observations and the real JSON/ArkType decoders; no privileged effect is reachable.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const invoke = new Function(
    'mode',
    'competingCode',
    'competingError',
    'competingOutput',
    'type',
    'JSON',
    body + '; return "continued";',
  ) as (...ports: unknown[]) => unknown;
  return {
    run: () =>
      invoke(
        observation.mode,
        observation.code,
        observation.error,
        observation.output,
        type,
        decoder,
      ),
    decodes: () => decodes,
  };
}

function requireRefusal(observation: Awaited<ReturnType<typeof fixture>>): void {
  let accepted = false;
  try {
    observation.run();
    accepted = true;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
  }
  expect(accepted).toBe(false);
}

const normal = { acquired: true, effect: 'absent-under-lock', fenced: true };

for (const output of [JSON.stringify(normal), '  ' + JSON.stringify(normal) + '\n'])
  test(
    'actual contender caller accepts the complete proof and decodes once: ' +
      String(output.startsWith(' ')),
    async () => {
      const proof = await fixture({ mode: 'kill', code: 0, error: '', output });
      expect(proof.run()).toBe('continued');
      expect(proof.decodes()).toBe(1);
    },
  );

for (const [name, payload] of [
  ['missing-acquisition', { effect: 'absent-under-lock', fenced: true }],
  ['false-acquisition', { ...normal, acquired: false }],
  ['numeric-acquisition', { ...normal, acquired: 1 }],
  ['string-acquisition', { ...normal, acquired: 'true' }],
  ['missing-fence', { acquired: true, effect: 'absent-under-lock' }],
  ['false-fence', { ...normal, fenced: false }],
  ['numeric-fence', { ...normal, fenced: 1 }],
  ['string-fence', { ...normal, fenced: 'true' }],
  ['object-fence', { ...normal, fenced: {} }],
  ['wrong-effect', { ...normal, effect: 'present' }],
  ['missing-effect', { acquired: true, fenced: true }],
  ['foreign-field', { ...normal, unexpected: true }],
  ['null', null],
  ['array', []],
] as const)
  test('actual contender caller refuses malformed proof: ' + name, async () => {
    requireRefusal(
      await fixture({ mode: 'kill', code: 0, error: '', output: JSON.stringify(payload) }),
    );
  });

test('actual contender caller refuses missing output', async () => {
  requireRefusal(await fixture({ mode: 'kill', code: 0, error: '', output: '' }));
});

test('actual contender caller refuses malformed JSON', async () => {
  requireRefusal(await fixture({ mode: 'kill', code: 0, error: '', output: '{"acquired":' }));
});

for (const [name, code, error] of [
  ['exit', 1, ''],
  ['diagnostic', 0, 'unexpected'],
] as const)
  test('actual contender caller rejects ' + name + ' before decoding stdout', async () => {
    const proof = await fixture({ mode: 'kill', code, error, output: JSON.stringify(normal) });
    requireRefusal(proof);
    expect(proof.decodes()).toBe(0);
  });

test('actual early-drop witness keeps its explicit nonzero marker route', async () => {
  const proof = await fixture({
    mode: 'early-drop',
    code: 1,
    error: 'expected effect-alive diagnostic',
    output: 'acquired-with-live-effect\n',
  });
  expect(proof.run()).toBe('continued');
  expect(proof.decodes()).toBe(0);
});

for (const [code, output] of [
  [0, 'acquired-with-live-effect'],
  [1, JSON.stringify(normal)],
] as const)
  test('actual early-drop witness refuses the wrong exit or marker: ' + String(code), async () => {
    const proof = await fixture({ mode: 'early-drop', code, error: '', output });
    requireRefusal(proof);
    expect(proof.decodes()).toBe(0);
  });

for (const fenced of [true, false])
  test('actual contender emitter and caller agree on fenced state: ' + String(fenced), async () => {
    const source = await readFile(
      new URL('./registry-maintenance-sudo.native.ts', import.meta.url),
      'utf8',
    );
    const module = ts.createSourceFile('native.ts', source, ts.ScriptTarget.Latest, true);
    const emitters: ts.CallExpression[] = [];
    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(module) === 'JSON.stringify' &&
        node.arguments.length === 1 &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        const fields = node.arguments[0].properties;
        if (
          fields.some(
            (field) => ts.isPropertyAssignment(field) && field.name.getText(module) === 'acquired',
          )
        )
          emitters.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(module);
    if (emitters.length !== 1) throw new Error('Missing unique actual contender emitter');
    const emitter = emitters.at(0);
    if (emitter === undefined) throw new Error('Actual contender emitter absent');
    // Boundary: execute only the actual producer expression with modeled canonical fenced state, then the actual consumer branch.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const emit = new Function('current', 'return ' + emitter.getText(module) + ';') as (current: {
      state: { fenced: boolean };
    }) => string;
    const proof = await fixture({
      mode: 'kill',
      code: 0,
      error: '',
      output: emit({ state: { fenced } }),
    });
    if (fenced) expect(proof.run()).toBe('continued');
    else requireRefusal(proof);
  });
