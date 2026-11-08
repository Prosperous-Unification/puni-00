import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { expect, test } from 'bun:test';
import ts from 'typescript';

import { SOURCE_FRONTEND_PRODUCER_PROGRAM } from '../fixtures/source-frontend-producer-program';

type Probe = (bindings: Record<string, unknown>) => Promise<unknown>;
type ProbeSettlement =
  { status: 'fulfilled'; capture: unknown } | { status: 'rejected'; failure: unknown };

async function settleProbe(
  probe: Probe,
  bindings: Record<string, unknown>,
): Promise<ProbeSettlement> {
  try {
    return { status: 'fulfilled', capture: await probe(bindings) };
  } catch (failure) {
    return { status: 'rejected', failure };
  }
}

/** Extracts the real producer's package/idle tail, catch, and cleanup from its JavaScript AST. */
function extractProbe(): Probe {
  const source = ts.createSourceFile(
    'probe.mjs',
    SOURCE_FRONTEND_PRODUCER_PROGRAM,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const lifecycle = source.statements.find(ts.isTryStatement);
  assert.ok(lifecycle?.catchClause !== undefined);
  assert.ok(lifecycle.finallyBlock !== undefined);
  const start = lifecycle.tryBlock.statements.findIndex(
    (statement) => statement.getText(source) === "phase = 'package-observations';",
  );
  assert.ok(start >= 0);
  const tail = lifecycle.tryBlock.statements
    .slice(start)
    .map((statement) => statement.getText(source))
    .join('\n');
  const terminal = source.statements.at(-1);
  assert.ok(terminal !== undefined && ts.isIfStatement(terminal));
  const lifecycleSource = `try { ${tail} } ${lifecycle.catchClause.getText(source)} finally ${lifecycle.finallyBlock.getText(source)}\n${terminal.getText(source)} return capture;`;
  const prototype: unknown = Object.getPrototypeOf(settleProbe);
  assert.ok(typeof prototype === 'object' && prototype !== null);
  const constructor: unknown = Reflect.get(prototype, 'constructor');
  assert.ok(typeof constructor === 'function');
  // Trusted generated probe source is the only constructor input in this inert test.
  return Reflect.construct(constructor, [
    'bindings',
    `with (bindings) { ${lifecycleSource} }`,
  ]) as Probe;
}

function createFixture() {
  const events: string[] = [];
  const idle = Promise.withResolvers<undefined>();
  const firstBoundary = Promise.withResolvers<'idle' | 'close'>();
  const watcher = {
    closed: false,
    close() {
      events.push('watcher-close');
      this.closed = true;
      return Promise.resolve();
    },
    getWatched: () => ({}),
  };
  const server = {
    watcher,
    httpServer: { listening: false },
    waitForRequestsIdle() {
      events.push('idle-entered');
      firstBoundary.resolve('idle');
      return idle.promise;
    },
    close() {
      events.push('close-entered');
      firstBoundary.resolve('close');
      watcher.closed = true;
      return Promise.resolve();
    },
  };
  const capture: Record<string, unknown> = {
    responses: [{}, {}],
    requestAudit: [{}, {}],
    cleanup: {},
  };
  const bindings = {
    assert,
    capture,
    console: { log: () => undefined },
    digest: (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex'),
    failure: undefined,
    packet: '/inert',
    phase: 'entry',
    publishPreCleanupDiagnostic: () => ({ status: 'written' }),
    observeCloseBoundaries: () => events.push('observe-close'),
    readFile: () => Promise.resolve(Buffer.from('{"version":"inert"}')),
    realpath: (path: string) => Promise.resolve(path),
    resolve,
    server,
    snapshot: '/inert/snapshot',
    writeFile: () => {
      events.push('observation-written');
      return Promise.resolve();
    },
  };
  return { bindings, capture, events, idle, firstBoundary: firstBoundary.promise };
}

test('generated producer awaits idle before cleanup without losing capture', async () => {
  const fixture = createFixture();
  const settled = settleProbe(extractProbe(), fixture.bindings);
  try {
    expect(await fixture.firstBoundary).toBe('idle');
    expect(fixture.events).toEqual(['idle-entered']);
    fixture.idle.resolve(undefined);
    expect(await settled).toEqual({ status: 'fulfilled', capture: fixture.capture });
  } finally {
    fixture.idle.resolve(undefined);
    await settled;
  }
  expect(fixture.events).toEqual([
    'idle-entered',
    'observe-close',
    'close-entered',
    'watcher-close',
    'observation-written',
  ]);
  expect((fixture.capture['cleanup'] as Record<string, unknown>)['closeReturned']).toBe(true);
  expect(fixture.capture['responses']).toHaveLength(2);
}, 5000);

test('generated producer preserves idle refusal and still proves cleanup', async () => {
  const fixture = createFixture();
  const refusal = new Error('inert idle refusal');
  const settled = settleProbe(extractProbe(), fixture.bindings);
  try {
    expect(await fixture.firstBoundary).toBe('idle');
    expect(fixture.events).toEqual(['idle-entered']);
    fixture.idle.reject(refusal);
    const outcome = await settled;
    if (outcome.status !== 'rejected') throw new Error('inert idle refusal was swallowed');
    expect(outcome.failure).toBe(refusal);
  } finally {
    fixture.idle.resolve(undefined);
    await settled;
  }
  expect(fixture.events).toEqual([
    'idle-entered',
    'observe-close',
    'close-entered',
    'watcher-close',
    'observation-written',
  ]);
  expect((fixture.capture['cleanup'] as Record<string, unknown>)['closeReturned']).toBe(true);
  expect(fixture.capture['responses']).toHaveLength(2);
}, 5000);
