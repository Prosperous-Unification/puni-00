import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPromise } from 'node:util/types';

import { mock } from 'bun:test';

import { readRegistryWriters } from './registry-maintenance-writers';

// Boundary: the isolated subprocess requires an actual CLI case, despite unchecked argv index typing.
const mode = process.argv[2] as string | undefined;
const allowed = new Set([
  'normal',
  'compile',
  'observation',
  'close',
  'binary',
  'remove',
  'observation+binary',
  'observation+close',
  'observation+close+binary+remove',
  'observation-undefined',
  'dead-undefined',
  'dead-null',
  'dead-string',
  'dead-writers',
  'exit',
  'survivor',
  'observation+exit+survivor+binary',
]);
if (mode === undefined || !allowed.has(mode))
  throw new Error('Unknown owned writer completion case');
const faults = new Set(mode.split('+'));
const original = { ...filesystem };
const census = readRegistryWriters;
const primary: unknown = mode.endsWith('undefined')
  ? undefined
  : mode === 'dead-null'
    ? null
    : mode === 'dead-string'
      ? 'owned primitive'
      : new Error('owned writer observation failure');
const closing = new Error('owned writer close failure');
const removal = new Error('owned writer removal failure');
const compilation = new Error('owned writer compilation failure');
const spawn = Bun.spawn;
const parents: ReturnType<typeof spawn>[] = [];
const descendants = new Set<string>();
const drains: Promise<void>[] = [];
let directory: string | undefined;

async function invokeFilesystem(
  operation:
    | typeof original.readFile
    | typeof original.realpath
    | typeof original.rm
    | typeof original.mkdtemp
    | typeof original.readdir,
  arguments_: unknown[],
): Promise<unknown> {
  const pending: unknown = Reflect.apply(operation, undefined, arguments_);
  if (!isPromise(pending)) throw new Error('Native filesystem adapter did not return a Promise');
  return await pending;
}

function rejectPrimary(): Promise<never> {
  // Boundary: this isolated negative intentionally injects undefined/null/string filesystem or census rejections.
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return Promise.reject(primary);
}

await mock.module('node:fs/promises', () => ({
  ...original,
  async mkdtemp(...arguments_: unknown[]) {
    const created = await invokeFilesystem(original.mkdtemp, arguments_);
    if (typeof created !== 'string' || !created.startsWith(join(tmpdir(), 'puni-task8-writer-')))
      throw new Error('Unexpected native fixture directory');
    directory = created;
    return created;
  },
  async readFile(...arguments_: unknown[]) {
    const path = arguments_[0];
    if (typeof path === 'string') {
      const matched = /^\/proc\/([1-9]\d*)\/status$/.exec(path);
      if (matched !== null) {
        const pid = matched.at(1);
        if (pid === undefined) throw new Error('Missing exact observed descendant');
        descendants.add(pid);
        if (mode.startsWith('observation')) return await rejectPrimary();
      }
    }
    return await invokeFilesystem(original.readFile, arguments_);
  },
  async realpath(...arguments_: unknown[]) {
    const observed = await invokeFilesystem(original.realpath, arguments_);
    if (directory === undefined)
      throw new Error('Native fixture binary observed before its workspace');
    if (faults.has('binary') && arguments_[0] === join(directory, 'thread-proof'))
      return String(observed) + '/foreign';
    return observed;
  },
  async readdir(...arguments_: unknown[]) {
    const observed = await invokeFilesystem(original.readdir, arguments_);
    if (faults.has('survivor') && arguments_[0] === '/proc') {
      const descendant = [...descendants].at(-1);
      if (descendant === undefined || !Array.isArray(observed))
        throw new Error('Missing exact native process observation');
      const processes: string[] = [];
      observed.forEach((pid: unknown) => {
        if (typeof pid !== 'string') throw new Error('Invalid native process entry');
        processes.push(pid);
      });
      return [...processes, descendant];
    }
    return observed;
  },
  async rm(...arguments_: unknown[]) {
    await invokeFilesystem(original.rm, arguments_);
    if (faults.has('remove') && arguments_[0] === directory) throw removal;
  },
}));
await mock.module('./registry-maintenance-writers', () => ({
  async readRegistryWriters(...arguments_: Parameters<typeof census>) {
    const writers = await census(...arguments_);
    const proc = arguments_[2];
    if (proc === undefined) throw new Error('Native census omitted its exact process root');
    if (proc.endsWith('/dead')) {
      if (mode.startsWith('dead-') && mode !== 'dead-writers') return await rejectPrimary();
      if (mode === 'dead-writers') return [{ pid: 42, reason: 'writable-descriptor' as const }];
    }
    return writers;
  },
}));

// Boundary: the fixed native entry invokes the captured Bun.spawn overload unchanged; this hook only observes its compiler and owned child capabilities.
Bun.spawn = ((...arguments_: unknown[]) => {
  const command = arguments_[0];
  if (Array.isArray(command) && command[0] === '/usr/bin/cc' && faults.has('compile'))
    throw compilation;
  // Boundary: Reflect.apply erases the captured native spawn overload; the returned child is forwarded unchanged except for the isolated EOF fault.
  const child = Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof spawn>;
  parents.push(child);
  if (
    !Array.isArray(command) ||
    typeof command[0] !== 'string' ||
    !command[0].endsWith('/thread-proof') ||
    (!faults.has('close') && !faults.has('exit'))
  )
    return child;
  const sink: unknown = Reflect.get(child, 'stdin', child);
  if (
    sink === null ||
    typeof sink !== 'object' ||
    !('end' in sink) ||
    typeof sink.end !== 'function'
  )
    throw new Error('Missing owned child input');
  const end = sink.end;
  return new Proxy(child, {
    get(target, property): unknown {
      if (property === 'exited' && faults.has('exit')) return child.exited.then(() => 1);
      if (property !== 'stdin' || !faults.has('close'))
        return Reflect.get(target, property, target);
      return new Proxy(sink, {
        get(input, field): unknown {
          if (field !== 'end') return Reflect.get(input, field, input);
          return () => {
            const ended: unknown = Reflect.apply(end, sink, []);
            if (typeof ended !== 'number' && !isPromise(ended))
              throw new Error('Unexpected native EOF completion');
            const pending = Promise.resolve(ended).then(() => {
              throw closing;
            });
            // Observe the injected rejection independently so the old floating Promise is tested without an unrelated unhandled-rejection failure.
            drains.push(
              pending.then(
                () => undefined,
                () => undefined,
              ),
            );
            return pending;
          };
        },
      });
    },
  });
}) as typeof Bun.spawn;

function describeFailure(cause: unknown): string {
  if (cause === primary) return 'primary';
  if (cause === closing) return 'close';
  if (cause === removal) return 'remove';
  if (cause === compilation) return 'compile';
  if (cause instanceof Error && Object.hasOwn(cause, 'cause') && cause.cause === primary)
    return 'wrapped-primary';
  if (
    cause instanceof Error &&
    cause.message === 'Native thread fixture did not acknowledge exact child cleanup'
  )
    return 'exit';
  if (cause instanceof Error && cause.message === 'Owned native child survived cleanup')
    return 'survivor';
  if (cause instanceof Error && cause.message === 'Native fixture binary identity changed')
    return 'binary';
  if (cause instanceof Error && cause.message === 'Dead native fixture retained writer capability')
    return 'writer';
  return 'unexpected';
}
function flattenFailures(cause: unknown): string[] {
  if (!(cause instanceof AggregateError)) return [describeFailure(cause)];
  const nested: unknown = cause.errors;
  if (!Array.isArray(nested)) throw new Error('Aggregate failure has no component array');
  return nested.flatMap((failure: unknown) => flattenFailures(failure));
}
let completion: { kind: 'fulfilled' } | { kind: 'rejected'; cause: unknown };
try {
  await import('./registry-maintenance-writers.native');
  completion = { kind: 'fulfilled' };
} catch (cause) {
  completion = { kind: 'rejected', cause };
}
await Promise.all(drains);
const parentCodes = await Promise.all(parents.map((parent) => parent.exited));
const processes = await original.readdir('/proc');
if (directory === undefined) throw new Error('Native fixture did not create its owned directory');
let directoryRemained = true;
try {
  await original.lstat(directory);
} catch (cause) {
  if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
  directoryRemained = false;
}
// Red tests still remove their exact owned directory after measuring the missing production cleanup.
if (directoryRemained) await original.rm(directory, { recursive: true });
console.log(
  'task8-writer-completion:' +
    JSON.stringify({
      kind: completion.kind,
      failures: completion.kind === 'rejected' ? flattenFailures(completion.cause) : [],
      rootCause:
        completion.kind === 'rejected' && completion.cause instanceof AggregateError
          ? describeFailure(completion.cause.cause)
          : null,
      directoryRemained,
      parentsReaped: parentCodes.every((code) => code === 0),
      descendantsAbsent: [...descendants].every((pid) => !processes.includes(pid)),
      parentCount: parents.length,
      descendantCount: descendants.size,
    }),
);
