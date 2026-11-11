import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { mock } from 'bun:test';

import { parseDashRequest } from '../../cli-parser';
import type { WbsTools } from '../../mcp/wbs-tools';

interface Scenario {
  action: 'init' | 'watch' | 'run' | 'exec';
  faults: readonly string[];
  status: number;
  throwUndefined?: true;
  repeatGuardFailure?: true;
  gate?: 'guard stop' | 'transport close';
}
const scenarios: Record<string, Scenario | undefined> = {
  connect: { action: 'init', faults: ['connect'], status: 0 },
  'watch-gated-stop': { action: 'watch', faults: ['sweep'], status: 0, gate: 'guard stop' },
  'init-gated-transport': { action: 'init', faults: [], status: 0, gate: 'transport close' },
  'exec-creation-report': { action: 'exec', faults: ['report creation'], status: 23 },
  'connect-ledger': { action: 'init', faults: ['connect', 'ledger close'], status: 0 },
  'watch-all': {
    action: 'watch',
    faults: ['sweep', 'guard stop', 'ledger close', 'transport close'],
    status: 0,
  },
  'watch-single': { action: 'watch', faults: ['sweep'], status: 0 },
  'watch-repeated': {
    action: 'watch',
    faults: ['guard tick'],
    status: 0,
    repeatGuardFailure: true,
  },
  'watch-stop': { action: 'watch', faults: ['guard stop'], status: 0 },
  'init-both-closes': { action: 'init', faults: ['ledger close', 'transport close'], status: 0 },
  'init-transport': { action: 'init', faults: ['transport close'], status: 0 },
  'run-undefined': { action: 'run', faults: ['run'], status: 23, throwUndefined: true },
};
for (const action of ['init', 'watch', 'run', 'exec'] as const)
  scenarios[action + '-healthy'] = {
    action,
    faults: [],
    status: action === 'run' || action === 'exec' ? 23 : 0,
  };
for (const action of ['run', 'exec'] as const) {
  scenarios[action + '-primary'] = { action, faults: ['run'], status: 23 };
  scenarios[action + '-all'] = {
    action,
    faults: ['run', 'request cleanup', 'sweep', 'report after', 'ledger close', 'transport close'],
    status: 23,
  };
  for (const point of [
    'inspect before',
    'request cleanup',
    'sweep',
    'inspect after',
    'report after',
  ])
    scenarios[action + '-' + point] = { action, faults: ['run', point], status: 23 };
}
function readOperands() {
  const mode = process.argv.at(2),
    requestFile = process.argv.at(3);
  if (mode === undefined || requestFile === undefined)
    throw new Error('command fixture operands missing');
  return { mode, requestFile };
}
function readScenario(mode: string): Scenario {
  const selected = scenarios[mode];
  if (selected === undefined) throw new Error('command fixture scenario unknown');
  return selected;
}
const { mode, requestFile } = readOperands(),
  selected = readScenario(mode);
const events: string[] = [],
  faults = new Map(
    selected.faults.map((point) => [
      point,
      selected.throwUndefined === true && point === 'run'
        ? undefined
        : new Error(point + ' failed'),
    ]),
  );
function failAt(point: string): void {
  if (faults.has(point)) {
    const cause: unknown = faults.get(point);
    throw cause;
  }
}
async function settleGate(point: 'guard stop' | 'transport close'): Promise<void> {
  if (selected.gate !== point) return;
  const root = dirname(requestFile);
  writeFileSync(join(root, 'events.json'), JSON.stringify(events));
  writeFileSync(join(root, 'entered'), point, { flag: 'wx' });
  const deadline = performance.now() + 8000;
  while (!existsSync(join(root, 'release'))) {
    if (performance.now() >= deadline) throw new Error('owned cleanup gate was not released');
    await Bun.sleep(10);
  }
}
let inspections = 0,
  reports = 0;
const use = {
  id: 'owned-use',
  revision: 1,
  incarnation: 'owned-birth',
  sealed: false,
  state: 'held',
};
const runtime = {
  create(_request: unknown, tools: WbsTools) {
    if (tools !== transport) throw new Error('create received another transport');
    events.push('create');
    return Promise.resolve(use);
  },
  async run() {
    events.push('run');
    failAt('run');
    await Promise.resolve();
    return selected.status;
  },
  inspect() {
    const point = inspections++ === 0 ? 'inspect before' : 'inspect after';
    events.push(point);
    failAt(point);
    return point === 'inspect before' ? use : { ...use, state: 'released' };
  },
  requestCleanup() {
    events.push('request cleanup');
    failAt('request cleanup');
    return use;
  },
  sweep() {
    events.push('sweep');
    failAt('sweep');
    return { released: [] };
  },
  async synchronize(tools: WbsTools) {
    if (tools !== transport) throw new Error('watch received another transport');
    events.push('synchronize');
    await Promise.resolve();
  },
  close() {
    events.push('ledger close');
    if (selected.gate !== undefined)
      writeFileSync(join(dirname(requestFile), 'events.json'), JSON.stringify(events));
    failAt('ledger close');
  },
};
const transport: WbsTools = {
  call: () => Promise.reject(new Error('unexpected tool call')),
  async close() {
    events.push('transport close');
    await settleGate('transport close');
    failAt('transport close');
    await Promise.resolve();
    if (selected.gate === 'transport close') events.push('transport close end');
  },
};
class Unavailable extends Error {}
await mock.module(new URL('../runtime.ts', import.meta.url).href, () => ({
  ResourceWbsUnavailable: Unavailable,
  loadResourceConfiguration: () => ({
    endpoint: 'owned endpoint',
    credential: 'owned credential',
    root: 'owned root',
    authorityId: 'owned authority',
  }),
  linuxHostFacts: {},
  ResourceRuntime: {
    initialize: () => {
      events.push('ledger open');
      return runtime;
    },
    open: () => {
      events.push('ledger open');
      return runtime;
    },
  },
}));
await mock.module(new URL('../singleton-guard.ts', import.meta.url).href, () => ({
  SingletonGuard: class {
    constructor() {
      events.push('guard open');
    }
    async tick() {
      events.push('guard tick');
      failAt('guard tick');
      const delivered = new Promise<void>((resolve) =>
        process.once('SIGTERM', () => {
          resolve();
        }),
      );
      process.kill(process.pid, 'SIGTERM');
      await delivered;
    }
    async stop() {
      events.push('guard stop start');
      await settleGate('guard stop');
      await Promise.resolve();
      events.push('guard stop end');
      failAt('guard stop');
      if (selected.repeatGuardFailure === true) failAt('guard tick');
    }
  },
}));
const { runResources } = await import('../command');
const before = [process.listenerCount('SIGTERM'), process.listenerCount('SIGINT')];
const words = ['resources', selected.action, '--config', '/owned/config'];
if (selected.action === 'exec')
  words.push('--request', requestFile, '--', process.execPath, '--version');
if (selected.action === 'run') words.push('--use', use.id, '--', process.execPath, '--version');
const request = parseDashRequest('resources', words);
let completion: { kind: 'returned'; status: number } | { kind: 'threw'; cause: unknown };
try {
  const status = await runResources(
    request,
    { read: () => 0 },
    () => {
      const point =
        selected.action === 'exec' && reports++ === 0
          ? 'report creation'
          : selected.action === 'run' || selected.action === 'exec'
            ? 'report after'
            : 'report';
      events.push(point);
      failAt(point);
    },
    () => {
      events.push('connect');
      failAt('connect');
      return transport;
    },
    () => {
      throw new Error('mock guard must not resolve a native lock');
    },
  );
  completion = { kind: 'returned', status };
} catch (cause) {
  completion = { kind: 'threw', cause };
}
function describe(cause: unknown): string[] {
  if (cause instanceof AggregateError)
    return cause.errors.flatMap((nested: unknown) => describe(nested));
  return [cause instanceof Error ? cause.message : String(cause)];
}
const first = selected.faults.at(0);
process.stdout.write(
  JSON.stringify({
    completion: completion.kind,
    ...(completion.kind === 'returned' ? { status: completion.status } : {}),
    events,
    failures: completion.kind === 'threw' ? describe(completion.cause) : [],
    originalSingle:
      selected.faults.length === 1 &&
      first !== undefined &&
      completion.kind === 'threw' &&
      completion.cause === faults.get(first),
    primaryCause:
      first !== undefined &&
      completion.kind === 'threw' &&
      completion.cause instanceof AggregateError &&
      completion.cause.cause === faults.get(first),
    signalsRestored:
      before[0] === process.listenerCount('SIGTERM') &&
      before[1] === process.listenerCount('SIGINT'),
  }),
);
