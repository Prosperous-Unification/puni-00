import { chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as judge from '@twilight-burokrat/judge';
import { expect, spyOn, test } from 'bun:test';

import {
  prepareRetainedDerivativeTypeScriptSource,
  readRetainedCompilerDerivative,
  readRetainedCompilerDerivativeAcquisition,
  requireRetainedCompilerDerivative,
} from './review-compiler';
import {
  artifactLimits,
  members,
  names,
  namespaceLimits,
  runtimeFixture,
  sourceIdentities,
  sourceLimits,
} from './review-compiler.test.fixture';
import { createRetainedNamespace } from './review-namespace';
import { readReviewRuntime } from './review-runtime';
import { readRetainedTypeScriptExtractionProvenance } from './review-typescript';
import * as sourceModule from './review-typescript-source';

test('actual isolated owning CLI matches compiled metadata and retained acquisition survives root removal', () => {
  expect(Object.keys(sourceIdentities).sort()).toEqual([
    'compiler-derivative-cli.ts',
    'compiler-derivative-pins.ts',
    'compiler-derivative.ts',
  ]);
  expect(judge.listCompilerDerivativeMembers()).toEqual(
    names.map((path) => ({
      path,
      identity: judge.hashBytes(members[path]),
      byteLength: members[path].byteLength,
    })),
  );
  const f = runtimeFixture();
  rmSync(f.runtimeRoot, { recursive: true });
  rmSync(f.sourceRepository, { recursive: true });
  const binding = readRetainedCompilerDerivative(f.runtime, artifactLimits);
  expect(Object.isFrozen(binding)).toBe(true);
  const artifact = requireRetainedCompilerDerivative(binding, f.runtime);
  expect(judge.readCompilerDerivativeProvenance(artifact).members).toEqual(
    judge.listCompilerDerivativeMembers(),
  );
  const acquisitions = readRetainedCompilerDerivativeAcquisition(binding);
  expect(acquisitions).toEqual(
    judge.listCompilerDerivativeMembers().map((member) => ({
      ...member,
      path: `compiler-derivative/${member.path}`,
      role: member.path === 'compiler.cjs' ? 'program' : 'dependency',
    })),
  );
  expect(Object.isFrozen(acquisitions)).toBe(true);
  expect(acquisitions.every(Object.isFrozen)).toBe(true);
  for (const acquisition of acquisitions)
    expect(acquisition).not.toBe(
      f.runtime.closure.files.find((file) => file.path === acquisition.path),
    );
  expect(() => requireRetainedCompilerDerivative({ ...binding }, f.runtime)).toThrow(
    'owned retained compiler derivative',
  );
  const poison = new Proxy(binding, {
    get() {
      throw new Error('derivative token touched');
    },
  });
  expect(() => requireRetainedCompilerDerivative(poison, f.runtime)).toThrow(
    'owned retained compiler derivative',
  );
  expect(() => readRetainedCompilerDerivativeAcquisition(poison)).toThrow(
    'owned retained compiler derivative',
  );
});

test('derivative binding requires exact runtime despite equal closure identity', () => {
  const f = runtimeFixture();
  const other = readReviewRuntime(f.input);
  const binding = readRetainedCompilerDerivative(f.runtime, artifactLimits);
  expect(other.closure).toEqual(f.runtime.closure);
  expect(() => requireRetainedCompilerDerivative(binding, other)).toThrow(
    'derivative runtime owner differs',
  );
  const poison = new Proxy(f.runtime, {
    get() {
      throw new Error('runtime property touched');
    },
  });
  expect(() => readRetainedCompilerDerivative(poison, artifactLimits)).toThrow(
    'owned review runtime',
  );
});

for (const fault of ['missing', 'path', 'role', 'hash', 'length'] as const) {
  test(`all tuple preflight ${fault} preserves real remaining acquisition allowance`, () => {
    let alteredHash = '';
    const f = runtimeFixture({
      limits: { maximumReads: fault === 'missing' ? 11 : 13 },
      change(files, bytes) {
        const file = files.find((entry) => entry.path === 'compiler-derivative/manifest.json');
        if (file === undefined) throw new Error('manifest tuple absent');
        if (fault === 'missing') files.splice(files.indexOf(file), 1);
        if (fault === 'path') {
          bytes['elsewhere/manifest.json'] = bytes[file.path];
          file.path = 'elsewhere/manifest.json';
        }
        if (fault === 'role') file.role = 'program';
        if (fault === 'hash' || fault === 'length') {
          const wrong =
            fault === 'hash'
              ? Uint8Array.from(members['manifest.json'])
              : Buffer.concat([members['manifest.json'], Buffer.from(' ')]);
          if (fault === 'hash') wrong[0] ^= 1;
          bytes[file.path] = wrong;
          file.identity = judge.hashBytes(wrong);
          file.byteLength = wrong.byteLength;
          alteredHash = file.identity;
        }
      },
    });
    const original = judge.listCompilerDerivativeMembers();
    const override =
      fault === 'length'
        ? spyOn(judge, 'listCompilerDerivativeMembers').mockReturnValue(
            original.map((member) =>
              member.path === 'manifest.json' ? { ...member, identity: alteredHash } : member,
            ),
          )
        : undefined;
    try {
      let failure: unknown;
      try {
        readRetainedCompilerDerivative(f.runtime, artifactLimits);
      } catch (error) {
        failure = error;
      }
      // Observe forbidden real read/copy admission before inspecting any subsequent raw-pin error.
      expect(f.runtime.readFile(f.sentinel)).toEqual(Buffer.from('S'));
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain('compiler derivative tuple differs');
    } finally {
      override?.mockRestore();
    }
  });
}

test('repeated acquisition charges the same runtime lifetime read allowance', () => {
  const f = runtimeFixture({ limits: { maximumReads: 16 } });
  readRetainedCompilerDerivative(f.runtime, artifactLimits);
  expect(() => readRetainedCompilerDerivative(f.runtime, artifactLimits)).toThrow(
    'runtime read ceiling',
  );
});

function preparedFixture() {
  const f = runtimeFixture();
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  const derivative = readRetainedCompilerDerivative(f.runtime, artifactLimits);
  const input = {
    namespace,
    candidate: f.candidate,
    runtime: f.runtime,
    derivative,
    request: { configPaths: ['tsconfig.json'], publicEntrypoints: ['a.ts'] },
    sourceLimits: { ...sourceLimits },
    compilerLimits: {
      maximumProbes: 10000,
      maximumReadBytes: 10000000,
      maximumDirectoryEntries: 10000,
      maximumObservedOutputBytes: 1000000,
      maximumOutputBytes: 1000000,
    },
    requestLimits: {
      maximumConfigPaths: 10,
      maximumPublicEntrypoints: 10,
      maximumPathBytes: 1024,
      maximumTotalPathBytes: 10000,
      maximumOutputBytes: 1000000,
    },
  };
  return { ...f, runtimeInput: f.input, input };
}

test('real derivative preparation snapshots full request and captures top-level references once without execution', () => {
  const f = preparedFixture();
  const reads = new Map<PropertyKey, number>();
  const input = new Proxy(f.input, {
    get(target, property, receiver) {
      const count = (reads.get(property) ?? 0) + 1;
      reads.set(property, count);
      if (count !== 1) throw new Error(`second top-level read ${String(property)}`);
      const value: unknown = Reflect.get(target, property, receiver);
      return value;
    },
  });
  const prepared = prepareRetainedDerivativeTypeScriptSource(input);
  expect([...reads.keys()].sort()).toEqual(Object.keys(f.input).sort());
  expect([...reads.values()].every((count) => count === 1)).toBe(true);
  f.input.request.configPaths[0] = 'missing.json';
  f.input.sourceLimits.maximumReads = 1;
  f.input.compilerLimits.maximumProbes = 0;
  f.input.requestLimits.maximumOutputBytes = 0;
  expect(prepared.request.configPaths).toEqual(['tsconfig.json']);
  expect(prepared.sourceLimits.maximumReads).toBe(100);
  expect(prepared.compilerLimits.maximumProbes).toBe(10000);
  expect(prepared.requestLimits.maximumOutputBytes).toBe(1000000);
  for (const record of [
    prepared,
    prepared.request,
    prepared.request.configPaths,
    prepared.request.publicEntrypoints,
    prepared.sourceLimits,
    prepared.compilerLimits,
    prepared.requestLimits,
  ])
    expect(Object.isFrozen(record)).toBe(true);
  expect(Object.isFrozen(f.input.request)).toBe(false);
  expect(prepared.source.readFile('/__puni_review__/candidate/a.ts')).toBe('export {};');
  expect(prepared.artifact).toBe(requireRetainedCompilerDerivative(f.input.derivative, f.runtime));
});

test('preparation refuses genuine wrong namespace and derivative runtime before source construction', () => {
  const f = preparedFixture();
  const otherRuntime = readReviewRuntime(f.runtimeInput);
  const namespace = createRetainedNamespace(f.candidate, otherRuntime, namespaceLimits);
  expect(() => prepareRetainedDerivativeTypeScriptSource({ ...f.input, namespace })).toThrow(
    'namespace runtime owner differs',
  );
  expect(() =>
    prepareRetainedDerivativeTypeScriptSource({ ...f.input, runtime: otherRuntime }),
  ).toThrow('derivative runtime owner differs');
});

test('wrong genuine constructed source is refused immediately before any callback', () => {
  const f = preparedFixture();
  const otherRuntime = readReviewRuntime(f.runtimeInput);
  const mixed = sourceModule.createRetainedTypeScriptSource(
    f.input.namespace,
    f.candidate,
    otherRuntime,
    sourceLimits,
  );
  const construct = spyOn(sourceModule, 'createRetainedTypeScriptSource').mockReturnValue(mixed);
  try {
    expect(() => prepareRetainedDerivativeTypeScriptSource(f.input)).toThrow(
      'source runtime owner differs',
    );
  } finally {
    construct.mockRestore();
  }
});

test('failed artifact capture never registers a retained binding', () => {
  const f = runtimeFixture();
  const keys: unknown[] = [];
  const set: unknown = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value;
  if (typeof set !== 'function') throw new Error('WeakMap setter absent');
  const registration = spyOn(WeakMap.prototype, 'set').mockImplementation(function (
    this: WeakMap<object, unknown>,
    key: object,
    value: unknown,
  ) {
    keys.push(key);
    Reflect.apply(set, this, [key, value]);
    return this;
  });
  const capture = spyOn(judge, 'captureCompilerDerivative').mockImplementation(() => {
    throw new Error('capture failure');
  });
  try {
    expect(() => readRetainedCompilerDerivative(f.runtime, artifactLimits)).toThrow(
      'capture failure',
    );
    expect(keys).toEqual([]);
  } finally {
    capture.mockRestore();
    registration.mockRestore();
  }
});

for (const limit of Object.keys(artifactLimits) as (keyof typeof artifactLimits)[]) {
  test(`captures and validates derivative limit ${limit} before real reads`, () => {
    const f = runtimeFixture({ limits: { maximumReads: 13 } });
    let reads = 0;
    const limits = {
      ...artifactLimits,
      get [limit]() {
        reads++;
        return reads === 1 ? 0 : artifactLimits[limit];
      },
    };
    expect(() => readRetainedCompilerDerivative(f.runtime, limits)).toThrow(
      `compiler derivative ${limit} must be a positive safe integer`,
    );
    expect(f.runtime.readFile(f.sentinel)).toEqual(Buffer.from('S'));
    expect(reads).toBe(1);
  });
}

test('all supplied derivative limit getters are captured once on successful acquisition', () => {
  const f = runtimeFixture();
  const reads = new Map<PropertyKey, number>();
  const limits = new Proxy(artifactLimits, {
    get(target, property, receiver) {
      const count = (reads.get(property) ?? 0) + 1;
      reads.set(property, count);
      if (count !== 1) throw new Error('second derivative limit read');
      const value: unknown = Reflect.get(target, property, receiver);
      return value;
    },
  });
  readRetainedCompilerDerivative(f.runtime, limits);
  expect([...reads.keys()].sort()).toEqual(Object.keys(artifactLimits).sort());
});

for (const fault of ['absent', 'unreadable'] as const) {
  test(`actual derivative bootstrap ${fault} fails before retained acquisition`, () => {
    expect(() =>
      runtimeFixture({
        beforeCapture(input) {
          const path = join(input.runtimeRoot, 'compiler-derivative/manifest.json');
          if (fault === 'absent') rmSync(path);
          else chmodSync(path, 0);
        },
      }),
    ).toThrow(`runtime file ${fault}`);
  });
}

for (const ceiling of ['maximumBytes', 'maximumReadBytes'] as const) {
  test(`repeated derivative acquisition charges same runtime lifetime ${ceiling}`, () => {
    const total = 9192355;
    const bootstrap = total + 2 + (ceiling === 'maximumBytes' ? 6 : 0);
    const f = runtimeFixture({ limits: { [ceiling]: bootstrap + 2 * total } });
    readRetainedCompilerDerivative(f.runtime, artifactLimits);
    readRetainedCompilerDerivative(f.runtime, artifactLimits);
    expect(() => readRetainedCompilerDerivative(f.runtime, artifactLimits)).toThrow(
      ceiling === 'maximumBytes' ? 'runtime byte ceiling' : 'runtime read byte ceiling',
    );
  });
}

test('all derivative limits require safe integers before acquisition', () => {
  for (const limit of Object.keys(artifactLimits) as (keyof typeof artifactLimits)[]) {
    const f = runtimeFixture({ limits: { maximumReads: 13 } });
    expect(() =>
      readRetainedCompilerDerivative(f.runtime, { ...artifactLimits, [limit]: 1.5 }),
    ).toThrow(`compiler derivative ${limit} must be a positive safe integer`);
    expect(f.runtime.readFile(f.sentinel)).toEqual(Buffer.from('S'));
  }
});

test('derivative preparation captures every nested request and limit getter exactly once', () => {
  const f = preparedFixture();
  const counts: number[] = [];
  function once<T extends object>(record: T): T {
    const reads = new Map<PropertyKey, number>();
    return new Proxy(record, {
      get(target, property, receiver) {
        const count = (reads.get(property) ?? 0) + 1;
        reads.set(property, count);
        counts.push(count);
        if (count !== 1) throw new Error(`second captured getter ${String(property)}`);
        const value: unknown = Reflect.get(target, property, receiver);
        return value;
      },
    });
  }
  const request = once({ configPaths: once(['tsconfig.json']), publicEntrypoints: once(['a.ts']) });
  const prepared = prepareRetainedDerivativeTypeScriptSource({
    ...f.input,
    request,
    sourceLimits: once(f.input.sourceLimits),
    compilerLimits: once(f.input.compilerLimits),
    requestLimits: once(f.input.requestLimits),
  });
  expect(prepared.request).toEqual({ configPaths: ['tsconfig.json'], publicEntrypoints: ['a.ts'] });
  expect(counts).toHaveLength(32);
  expect(counts.every((count) => count === 1)).toBe(true);
});

test('preparation publishes no extraction and leaves the real source byte census untouched', () => {
  const f = preparedFixture();
  const prepared = prepareRetainedDerivativeTypeScriptSource(f.input);
  expect(sourceModule.sealRetainedTypeScriptReads(prepared.source).entries).toEqual([]);
  expect(() => readRetainedTypeScriptExtractionProvenance(prepared)).toThrow(
    'owned retained TypeScript extraction',
  );
  expect(prepared.provenance.runtimeTrust).toBe('unverified');
});
