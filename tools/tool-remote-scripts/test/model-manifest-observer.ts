import { writeSync } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { basename, relative } from 'node:path';

import { mock } from 'bun:test';

const captured = { ...filesystem };
const RECORD_BYTES = 4096;
const RING_LENGTH = 32;
const ANOMALY_LENGTH = 4;
export const MODEL_MANIFEST_TRACE = 'full-model-first-three-v1';
const TRACE_KEY = 'PUNI_TEST_MODEL_MANIFEST_TRACE';
export const MODEL_COMMAND = [
  process.execPath,
  'test',
  'test/dependency-product-process-model-child.test.ts',
  '-t',
  '^modeled ',
  '--preload',
  '../test/scratch/preload.ts',
  '--timeout=300000',
] as const;

function commandForFilter(filter: string): readonly string[] {
  return MODEL_COMMAND.map((argument, index) => (index === 4 ? filter : argument));
}

export const MANIFEST_CONTEXTS = {
  [MODEL_MANIFEST_TRACE]: { command: MODEL_COMMAND, limit: 3, label: 'full-model' },
  'readiness-none-v1': {
    command: commandForFilter('^readiness actual HTTP and full observer brackets: none$'),
    limit: 1,
    label: 'readiness-none',
  },
  'readiness-after-health-v1': {
    command: commandForFilter('^readiness actual HTTP and full observer brackets: after-health$'),
    limit: 1,
    label: 'readiness-after-health',
  },
  'readiness-after-capability-v1': {
    command: commandForFilter(
      '^readiness actual HTTP and full observer brackets: after-capability$',
    ),
    limit: 1,
    label: 'readiness-after-capability',
  },
  'barrier-pre-evidence-v1': {
    command: commandForFilter('^readiness retained state barrier: pre-evidence$'),
    limit: 1,
    label: 'barrier-pre-evidence',
  },
  'barrier-pre-artifact-v1': {
    command: commandForFilter('^readiness retained state barrier: pre-artifact$'),
    limit: 1,
    label: 'barrier-pre-artifact',
  },
  'barrier-pre-stores-v1': {
    command: commandForFilter('^readiness retained state barrier: pre-stores$'),
    limit: 1,
    label: 'barrier-pre-stores',
  },
  'barrier-post-evidence-v1': {
    command: commandForFilter('^readiness retained state barrier: post-evidence$'),
    limit: 1,
    label: 'barrier-post-evidence',
  },
  'barrier-post-artifact-v1': {
    command: commandForFilter('^readiness retained state barrier: post-artifact$'),
    limit: 1,
    label: 'barrier-post-artifact',
  },
  'barrier-post-stores-v1': {
    command: commandForFilter('^readiness retained state barrier: post-stores$'),
    limit: 1,
    label: 'barrier-post-stores',
  },
  'barrier-post-ingress-v1': {
    command: commandForFilter('^readiness retained state barrier: post-ingress$'),
    limit: 1,
    label: 'barrier-post-ingress',
  },
  'barrier-post-context-v1': {
    command: commandForFilter('^readiness retained state barrier: post-context$'),
    limit: 1,
    label: 'barrier-post-context',
  },
} as const;
export type ManifestContext = keyof typeof MANIFEST_CONTEXTS;
type ContextLabel = (typeof MANIFEST_CONTEXTS)[ManifestContext]['label'];

function isManifestContext(selection: string): selection is ManifestContext {
  return Object.hasOwn(MANIFEST_CONTEXTS, selection);
}

function readSelection(selection: unknown): ManifestContext | undefined {
  if (selection === undefined) return undefined;
  if (typeof selection === 'string' && isManifestContext(selection)) return selection;
  throw new Error('source observer selection invalid');
}

/** Scrubs inherited selection from every child; only an exact closed context-command pair may opt in. */
export function modelChildEnvironment(
  command: readonly string[],
  environment: NodeJS.ProcessEnv,
  selection?: ManifestContext,
): NodeJS.ProcessEnv {
  const copied: NodeJS.ProcessEnv = { ...environment, FORCE_COLOR: '0' };
  // Proof: omitting this scrub failed polluted-ambient and filtered-descendant inert controls.
  delete copied['PUNI_TEST_MODEL_MANIFEST_TRACE'];
  const requested = readSelection(selection);
  if (requested !== undefined) {
    // Proof: omitting this guard admitted a mismatched context-command pair; all-context selector control failed.
    if (
      command.length !== MANIFEST_CONTEXTS[requested].command.length ||
      command.some((argument, index) => argument !== MANIFEST_CONTEXTS[requested].command[index])
    )
      throw new Error('source observer command selection invalid');
    copied[TRACE_KEY] = requested;
  }
  return copied;
}

/** Consumes test selection before fixture imports, so no descendant inherits the observer marker. */
export function consumeManifestTrace(environment: NodeJS.ProcessEnv): ManifestContext | undefined {
  const selection = environment[TRACE_KEY];
  delete environment['PUNI_TEST_MODEL_MANIFEST_TRACE'];
  return readSelection(selection);
}
const METADATA_KEYS = ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'] as const;
type Operation =
  'lstat' | 'stat' | 'open' | 'readdir' | 'readlink' | 'realpath' | 'mkdtemp' | 'descriptor-stat';
interface Observation {
  operation: Operation;
  path: string;
  metadata?: Partial<Record<(typeof METADATA_KEYS)[number], number | string>>;
  errno?: string;
}
interface Restoration {
  module: boolean;
  descriptors: boolean;
}
export interface Refusal {
  diagnostic: 'source-construction-observer';
  context: ContextLabel;
  ordinal: number;
  usable: boolean;
  restored: Restoration;
  observed: number;
  omitted: number;
  anomalies: Observation[];
  latest: Observation[];
}

/** Bounds test-owned metadata without accepting free-form error messages or absolute paths. */
export function encodeRefusal(receipt: Refusal): string {
  const bounded = {
    ...receipt,
    anomalies: receipt.anomalies.slice(-4),
    latest: receipt.latest.slice(-8),
  };
  bounded.omitted += receipt.latest.length - bounded.latest.length;
  let encoded = JSON.stringify(bounded) + '\n';
  while (Buffer.byteLength(encoded) > RECORD_BYTES) {
    if (bounded.latest.length > 1) bounded.latest.shift();
    else if (bounded.anomalies.length > 0) bounded.anomalies.shift();
    else throw new Error('source observer receipt cannot fit');
    bounded.omitted++;
    encoded = JSON.stringify(bounded) + '\n';
  }
  return encoded;
}

function emitReceipt(receipt: string): void {
  const bytes = Buffer.from(receipt);
  if (writeSync(2, bytes) !== bytes.length) throw new Error('source observer receipt incomplete');
}

function closedErrno(cause: unknown): string {
  const code: unknown =
    cause !== null && typeof cause === 'object' ? Reflect.get(cause, 'code') : undefined;
  return [
    'ENOENT',
    'EACCES',
    'EPERM',
    'EIO',
    'EMFILE',
    'ENFILE',
    'ELOOP',
    'ENOTDIR',
    'EROFS',
    'EINVAL',
    'EBADF',
  ].includes(String(code))
    ? String(code)
    : 'OTHER';
}

async function observeFilesystem() {
  const roots: { path: string; kind: string }[] = [];
  const descriptors = new Map<number, string>();
  const restoreDescriptors: (() => void)[] = [];
  const ring: Observation[] = [];
  const anomalies: Observation[] = [];
  let observed = 0;
  let restored = false;
  function resolveOwned(path: unknown): string | undefined {
    if (typeof path !== 'string') return undefined;
    const alias = /^\/proc\/self\/fd\/(\d+)(.*)$/.exec(path);
    if (alias === null) return path;
    const parent = descriptors.get(Number(alias[1]));
    return parent === undefined ? undefined : parent + alias[2];
  }
  function record(operation: Operation, path: unknown, metadata?: unknown, cause?: unknown): void {
    const absolute = resolveOwned(path);
    if (absolute === undefined) return;
    const root = roots.find(
      (candidate) => absolute === candidate.path || absolute.startsWith(candidate.path + '/'),
    );
    if (root === undefined) return;
    const entry: Observation = {
      operation,
      path: (root.kind + '/' + relative(root.path, absolute)).slice(0, 160),
    };
    if (metadata !== undefined && metadata !== null && typeof metadata === 'object') {
      entry.metadata = {};
      for (const key of METADATA_KEYS) {
        const value: unknown = Reflect.get(metadata, key);
        if (typeof value === 'number' || typeof value === 'bigint')
          entry.metadata[key] = typeof value === 'bigint' ? value.toString() : value;
      }
    }
    if (cause !== undefined) entry.errno = closedErrno(cause);
    observed++;
    if (ring.length === RING_LENGTH) ring.shift();
    ring.push(entry);
    const mode = entry.metadata?.mode;
    const links = entry.metadata?.nlink;
    if (
      entry.errno !== undefined ||
      (mode !== undefined && (Number(mode) & 0o170000) === 0o100000 && Number(links) > 1)
    ) {
      if (anomalies.length === ANOMALY_LENGTH) anomalies.shift();
      anomalies.push(entry);
    }
  }
  function override(
    opened: object,
    name: 'stat' | 'close',
    replacement: (...args: unknown[]) => Promise<unknown>,
  ): void {
    const own = Object.getOwnPropertyDescriptor(opened, name);
    Object.defineProperty(opened, name, { value: replacement, configurable: true, writable: true });
    restoreDescriptors.push(() => {
      if (own === undefined) {
        if (!Reflect.deleteProperty(opened, name))
          throw new Error('source observer descriptor deletion failed');
      } else Object.defineProperty(opened, name, own);
    });
  }
  const replacement = { ...captured };
  for (const operation of [
    'lstat',
    'stat',
    'open',
    'readdir',
    'readlink',
    'realpath',
    'mkdtemp',
  ] as const) {
    const original = captured[operation];
    Reflect.set(replacement, operation, async function (...args: unknown[]) {
      try {
        const returned: unknown = await Reflect.apply(original, captured, args);
        if (operation === 'mkdtemp' && typeof returned === 'string') {
          const kind = /^source-(pins|database)-[^/]+$/.exec(basename(returned))?.[1];
          if (kind !== undefined)
            roots.push({ path: returned, kind: kind === 'pins' ? 'artifact' : 'database' });
        }
        if (operation === 'open' && returned !== null && typeof returned === 'object') {
          const fd: unknown = Reflect.get(returned, 'fd');
          const path = resolveOwned(args[0]);
          if (
            path === undefined ||
            !roots.some((root) => path === root.path || path.startsWith(root.path + '/'))
          )
            return returned;
          if (typeof fd !== 'number') throw new Error('source observer opened descriptor invalid');
          descriptors.set(fd, path);
          const stat: unknown = Reflect.get(returned, 'stat');
          const close: unknown = Reflect.get(returned, 'close');
          if (typeof stat !== 'function' || typeof close !== 'function')
            throw new Error('source observer descriptor methods invalid');
          override(returned, 'stat', async function (this: unknown, ...statArgs: unknown[]) {
            try {
              const metadata: unknown = await Reflect.apply(stat, this, statArgs);
              record('descriptor-stat', path, metadata);
              return metadata;
            } catch (cause) {
              record('descriptor-stat', path, undefined, cause);
              throw cause;
            }
          });
          override(returned, 'close', async function (this: unknown, ...closeArgs: unknown[]) {
            try {
              const closed: unknown = await Reflect.apply(close, this, closeArgs);
              return closed;
            } finally {
              descriptors.delete(fd);
            }
          });
        }
        record(
          operation,
          operation === 'mkdtemp' ? returned : args[0],
          operation === 'lstat' || operation === 'stat' ? returned : undefined,
        );
        return returned;
      } catch (cause) {
        record(operation, args[0], undefined, cause);
        throw cause;
      }
    });
  }
  await mock.module('node:fs/promises', () => replacement);
  return {
    snapshot: () => ({ observed, ring: [...ring], anomalies: [...anomalies], restored }),
    async restore(): Promise<Restoration> {
      const status = { module: false, descriptors: true };
      // Proof: omitting descriptor restoration failed both return/refusal own-property controls.
      for (const restore of restoreDescriptors.reverse()) {
        try {
          restore();
        } catch {
          status.descriptors = false;
        }
      }
      try {
        // Proof: omitting module restoration failed the preimported named-consumer controls.
        await mock.module('node:fs/promises', () => captured);
        status.module = true;
      } catch {
        status.module = false;
      }
      restored = status.module && status.descriptors;
      return status;
    },
  };
}

/**
 * Observes the selected closed context's constructor allowance, restoring before callers resume.
 * A refusal keeps the identical error primary; diagnostic failure makes the separate control state unusable.
 */
export function observeConstructions<Args extends unknown[], Value>(
  context: ManifestContext,
  construct: (...args: Args) => Promise<Value>,
  emit: (receipt: string) => void | Promise<void> = emitReceipt,
) {
  const configuration = MANIFEST_CONTEXTS[context];
  let ordinal = 0;
  let active = false;
  let usable = true;
  let emittedBytes = 0;
  let observations = 0;
  let completed = 0;
  return {
    inspect: () => ({
      ordinal,
      active,
      usable,
      emittedBytes,
      observations,
      completed,
      limit: configuration.limit,
      context: configuration.label,
    }),
    assertUsable: (): void => {
      if (!usable || active) throw new Error('source construction diagnostic unusable');
    },
    call: async (...args: Args): Promise<Value> => {
      const selected = ++ordinal;
      if (active) {
        usable = false;
        throw new Error('source construction observer overlap');
      }
      // Proof: replacing the context limit with3 failed the one-constructor inert forwarding control.
      if (selected > configuration.limit) return construct(...args);
      active = true;
      let observer: Awaited<ReturnType<typeof observeFilesystem>>;
      try {
        observer = await observeFilesystem();
      } catch (cause) {
        active = false;
        usable = false;
        throw cause;
      }
      let refused = false;
      let refusal: unknown;
      let returned: Value | undefined;
      let restoration: Restoration;
      try {
        returned = await construct(...args);
      } catch (cause) {
        refused = true;
        refusal = cause;
      } finally {
        restoration = await observer.restore();
        active = false;
        completed++;
      }
      const snapshot = observer.snapshot();
      observations += snapshot.observed;
      if (!restoration.module || !restoration.descriptors) usable = false;
      if (refused) {
        try {
          const receipt = encodeRefusal({
            diagnostic: 'source-construction-observer',
            context: configuration.label,
            ordinal: selected,
            usable,
            restored: restoration,
            observed: snapshot.observed,
            omitted: snapshot.observed - snapshot.ring.length,
            anomalies: snapshot.anomalies,
            latest: snapshot.ring,
          });
          emittedBytes += Buffer.byteLength(receipt);
          if (emittedBytes > configuration.limit * RECORD_BYTES)
            throw new Error('source observer total bound exceeded');
          await emit(receipt);
        } catch {
          usable = false;
        }
        throw refusal;
      }
      if (!usable) throw new Error('source construction diagnostic unusable');
      // The constructor completed without throwing; undefined is a valid forwarded return value.
      return returned as Value;
    },
  };
}
