import { rejects } from 'node:assert/strict';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, mock, test } from 'bun:test';

import type { Refusal } from './model-manifest-observer';
import { constructProbe, importedFilesystem } from './model-manifest-observer-probe';

const original = { ...filesystem };
const project = new URL('..', import.meta.url).pathname;

if (process.env['PUNI_MODEL_OBSERVER_CONTROL'] === '1') {
  const sentinel = new Error('owned observer sentinel');
  const captures: {
    open?: unknown;
    openPrototype?: unknown;
    metadata?: unknown;
    stat?: unknown;
    statThis?: unknown;
    statOptions?: unknown[];
    lstatOptions?: unknown[];
  } = {};
  const nativeDescriptors: (() => void)[] = [];
  const descriptorProperties = new WeakMap<
    object,
    { stat?: PropertyDescriptor; close?: PropertyDescriptor }
  >();
  let sentinelPath = '';
  const installed = {
    ...original,
    lstat: async (...args: unknown[]) => {
      captures.lstatOptions = args;
      if (args[0] === sentinelPath) throw sentinel;
      const metadata: unknown = await Reflect.apply(original.lstat, original, args);
      captures.metadata = metadata;
      return metadata;
    },
    open: async (...args: unknown[]) => {
      const opened = (await Reflect.apply(original.open, original, args)) as Awaited<
        ReturnType<typeof original.open>
      >;
      captures.open = opened;
      captures.openPrototype = Object.getPrototypeOf(opened);
      const own = Object.getOwnPropertyDescriptor(opened, 'stat');
      const stat = opened.stat.bind(opened);
      Object.defineProperty(opened, 'stat', {
        configurable: true,
        writable: true,
        value: async function (this: unknown, ...options: unknown[]) {
          captures.statThis = this;
          captures.statOptions = options;
          const metadata: unknown = await Reflect.apply(stat, this, options);
          captures.stat = metadata;
          return metadata;
        },
      });
      descriptorProperties.set(opened, {
        stat: Object.getOwnPropertyDescriptor(opened, 'stat'),
        close: Object.getOwnPropertyDescriptor(opened, 'close'),
      });
      nativeDescriptors.push(() =>
        own === undefined
          ? Reflect.deleteProperty(opened, 'stat')
          : Object.defineProperty(opened, 'stat', own),
      );
      return opened;
    },
  };
  const preimported = importedFilesystem();
  await mock.module('node:fs/promises', () => installed);
  expect(importedFilesystem().lstat === installed.lstat).toBe(true);
  expect(importedFilesystem().lstat === preimported.lstat).toBe(false);
  const {
    observeConstructions,
    encodeRefusal,
    MODEL_COMMAND,
    MODEL_MANIFEST_TRACE,
    MANIFEST_CONTEXTS,
    modelChildEnvironment,
    consumeManifestTrace,
  } = await import('./model-manifest-observer');
  const unrelated = () => Promise.resolve('unrelated mock retained');
  await mock.module('../src/lib/product-host-proc', () => ({ readProductHostProc: unrelated }));
  const { readProductHostProc } = await import('../src/lib/product-host-proc');
  // Only the three existing pure summary negatives are selected; none of the registered model/host cases run.
  await import('../src/lib/dependency-product-process-model.test');

  afterAll(async () => {
    for (const restore of nativeDescriptors.reverse()) restore();
    await mock.module('node:fs/promises', () => original);
  });

  const expectedContexts = [
    [MODEL_MANIFEST_TRACE, '^modeled ', 3, 'full-model'],
    [
      'readiness-none-v1',
      '^readiness actual HTTP and full observer brackets: none$',
      1,
      'readiness-none',
    ],
    [
      'readiness-after-health-v1',
      '^readiness actual HTTP and full observer brackets: after-health$',
      1,
      'readiness-after-health',
    ],
    [
      'readiness-after-capability-v1',
      '^readiness actual HTTP and full observer brackets: after-capability$',
      1,
      'readiness-after-capability',
    ],
    [
      'barrier-pre-evidence-v1',
      '^readiness retained state barrier: pre-evidence$',
      1,
      'barrier-pre-evidence',
    ],
    [
      'barrier-pre-artifact-v1',
      '^readiness retained state barrier: pre-artifact$',
      1,
      'barrier-pre-artifact',
    ],
    [
      'barrier-pre-stores-v1',
      '^readiness retained state barrier: pre-stores$',
      1,
      'barrier-pre-stores',
    ],
    [
      'barrier-post-evidence-v1',
      '^readiness retained state barrier: post-evidence$',
      1,
      'barrier-post-evidence',
    ],
    [
      'barrier-post-artifact-v1',
      '^readiness retained state barrier: post-artifact$',
      1,
      'barrier-post-artifact',
    ],
    [
      'barrier-post-stores-v1',
      '^readiness retained state barrier: post-stores$',
      1,
      'barrier-post-stores',
    ],
    [
      'barrier-post-ingress-v1',
      '^readiness retained state barrier: post-ingress$',
      1,
      'barrier-post-ingress',
    ],
    [
      'barrier-post-context-v1',
      '^readiness retained state barrier: post-context$',
      1,
      'barrier-post-context',
    ],
  ] as const;

  test('observer inert child admits all twelve exact context commands and rejects every mismatch', () => {
    const key = 'PUNI_TEST_MODEL_MANIFEST_TRACE';
    expect(Object.keys(MANIFEST_CONTEXTS)).toEqual(expectedContexts.map(([context]) => context));
    for (const [context, filter, limit, label] of expectedContexts) {
      const configuration = MANIFEST_CONTEXTS[context];
      const command = [
        process.execPath,
        'test',
        'test/dependency-product-process-model-child.test.ts',
        '-t',
        filter,
        '--preload',
        '../test/scratch/preload.ts',
        '--timeout=300000',
      ];
      expect(JSON.stringify(configuration.command)).toBe(JSON.stringify(command));
      expect(configuration.limit).toBe(limit);
      expect(configuration.label).toBe(label);
      expect(observeConstructions(context, () => Promise.resolve(undefined)).inspect().limit).toBe(
        limit,
      );
      expect(modelChildEnvironment(command, {}, context)[key]).toBe(context);
      for (const [other] of expectedContexts) {
        if (other !== context)
          expect(() => {
            modelChildEnvironment(command, {}, other);
          }).toThrow('source observer command selection invalid');
      }
      for (let index = 0; index < command.length; index++) {
        const changed = [...command];
        changed[index] = 'invalid-owned-token';
        expect(() => {
          modelChildEnvironment(changed, {}, context);
        }).toThrow('source observer command selection invalid');
      }
    }
    for (const invalid of ['', 'unknown'])
      expect(() => {
        Reflect.apply(modelChildEnvironment, undefined, [MODEL_COMMAND, {}, invalid]);
      }).toThrow('source observer selection invalid');
  });

  test('observer inert child scrubs polluted ambient context without mutating caller environment', () => {
    const key = 'PUNI_TEST_MODEL_MANIFEST_TRACE';
    for (const inherited of [...expectedContexts.map(([context]) => context), 'unknown', '']) {
      const environment = { [key]: inherited, FORCE_COLOR: '1', CONTROL_UNRELATED: 'retained' };
      const before = { ...environment };
      const disabled = modelChildEnvironment(MODEL_COMMAND, environment);
      expect(Object.hasOwn(disabled, key)).toBe(false);
      expect(disabled['CONTROL_UNRELATED']).toBe('retained');
      expect(disabled['FORCE_COLOR']).toBe('0');
      expect(environment).toEqual(before);
      const enabled = modelChildEnvironment(MODEL_COMMAND, environment, MODEL_MANIFEST_TRACE);
      expect(enabled[key]).toBe(MODEL_MANIFEST_TRACE);
      expect(environment).toEqual(before);
    }
  });

  test('observer inert child consumes every exact context before continuation and refuses unknown values', () => {
    const key = 'PUNI_TEST_MODEL_MANIFEST_TRACE';
    expect(consumeManifestTrace({})).toBeUndefined();
    for (const [context] of expectedContexts) {
      const environment = { [key]: context };
      expect(consumeManifestTrace(environment)).toBe(context);
      expect(Object.hasOwn(environment, key)).toBe(false);
    }
    for (const value of ['', 'unknown']) {
      const invalid = { [key]: value };
      expect(() => {
        consumeManifestTrace(invalid);
      }).toThrow('source observer selection invalid');
      expect(Object.hasOwn(invalid, key)).toBe(false);
    }
  });

  test('observer inert child transports full and filtered context while unselected descendants remain disabled', async () => {
    const key = 'PUNI_TEST_MODEL_MANIFEST_TRACE';
    const helper = new URL('./model-manifest-observer.ts', import.meta.url).href;
    const program = `const { consumeManifestTrace } = await import(${JSON.stringify(helper)}); const context = consumeManifestTrace(process.env); const continuation = () => ({ context: context ?? null, consumed: !Object.hasOwn(process.env, 'PUNI_TEST_MODEL_MANIFEST_TRACE') }); await Bun.write(Bun.stdout, JSON.stringify(continuation()));`;
    const ambient = { ...process.env, [key]: MODEL_MANIFEST_TRACE };
    for (const selection of [
      undefined,
      MODEL_MANIFEST_TRACE,
      'readiness-after-health-v1',
    ] as const) {
      const context = selection ?? 'barrier-post-context-v1';
      const environment = modelChildEnvironment(
        MANIFEST_CONTEXTS[context].command,
        ambient,
        selection,
      );
      const child = Bun.spawn([process.execPath, '-e', program], {
        cwd: project,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      try {
        const [stdout, stderr, exit] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(exit).toBe(0);
        expect(child.signalCode).toBeNull();
        expect(stderr).toBe('');
        expect(JSON.parse(stdout) as unknown).toEqual({
          context: selection ?? null,
          consumed: true,
        });
        expect(ambient[key]).toBe(MODEL_MANIFEST_TRACE);
      } finally {
        child.kill('SIGKILL');
        await child.exited;
      }
    }
  });

  for (const refuse of [false, true])
    test(`observer inert child restores live exports and descriptors after ${refuse ? 'refusal' : 'return'}`, async () => {
      let root: string | undefined;
      let opened: Awaited<ReturnType<typeof original.open>> | undefined;
      let statDescriptor: PropertyDescriptor | undefined;
      let closeDescriptor: PropertyDescriptor | undefined;
      const receipts: string[] = [];
      const before = importedFilesystem();
      const token = Object.freeze({ retained: true });
      const selected = observeConstructions(
        MODEL_MANIFEST_TRACE,
        async (argument: object) => {
          expect(argument).toBe(token);
          expect(importedFilesystem().open).not.toBe(before.open);
          root = await filesystem.mkdtemp(join(tmpdir(), 'source-pins-observer-'));
          const leaf = join(root, 'owned.txt');
          await original.writeFile(leaf, 'ordinary owned control');
          const options = { bigint: true } as const;
          const metadata = await importedFilesystem().lstat(leaf, options);
          expect(metadata === captures.metadata).toBe(true);
          expect(captures.lstatOptions).toEqual([leaf, options]);
          expect(captures.lstatOptions?.[1]).toBe(options);
          expect(Object.getPrototypeOf(metadata)).toBe(
            Object.getPrototypeOf(await original.lstat(leaf, options)),
          );
          opened = await importedFilesystem().open(leaf, 'r');
          expect(opened === captures.open).toBe(true);
          expect(Object.getPrototypeOf(opened)).toBe(captures.openPrototype);
          // The spy owns stat before the observer; compare that exact descriptor after restoration.
          statDescriptor = descriptorProperties.get(opened)?.stat;
          const nativeStat = nativeDescriptors.length;
          expect(nativeStat).toBeGreaterThan(0);
          closeDescriptor = descriptorProperties.get(opened)?.close;
          const observed = await opened.stat(options);
          expect(observed === captures.stat).toBe(true);
          expect(captures.statThis).toBe(opened);
          expect(captures.statOptions?.[0]).toBe(options);
          expect(typeof observed.ino).toBe('bigint');
          expect(Object.getPrototypeOf(observed)).toBe(
            Object.getPrototypeOf(await original.lstat(leaf, options)),
          );
          sentinelPath = join(root, 'sentinel');
          await rejects(importedFilesystem().lstat(sentinelPath), (cause) => cause === sentinel);
          if (refuse) throw sentinel;
          return token;
        },
        (receipt) => {
          receipts.push(receipt);
        },
      );
      try {
        if (refuse) await rejects(selected.call(token), (cause) => cause === sentinel);
        else expect(await selected.call(token)).toBe(token);
        expect(importedFilesystem()).toEqual(before);
        expect(opened).toBeDefined();
        const current = Object.getOwnPropertyDescriptor(opened!, 'stat');
        expect(current).toEqual(statDescriptor);
        // A restored method is the test's native pass-through spy, not the observer's wrapper.
        const count = selected.inspect().observations;
        await opened!.stat();
        expect(selected.inspect().observations).toBe(count);
        expect(Object.getOwnPropertyDescriptor(opened!, 'close')).toEqual(closeDescriptor);
        expect(readProductHostProc).toBe(unrelated);
        expect(await readProductHostProc('ignored', 1, 1)).toBe('unrelated mock retained');
        expect(receipts.length).toBe(refuse ? 1 : 0);
        if (refuse) {
          const receipt = JSON.parse(receipts[0] ?? 'invalid') as Refusal;
          expect(receipt.restored).toEqual({ module: true, descriptors: true });
          expect(receipt.latest.some((entry: { errno?: string }) => entry.errno === 'OTHER')).toBe(
            true,
          );
        }
        selected.assertUsable();
      } finally {
        if (opened !== undefined) await opened.close();
        if (root !== undefined) await original.rm(root, { recursive: true });
      }
    });

  for (const [context, limit, refuseAt] of [
    [MODEL_MANIFEST_TRACE, 3, 2],
    ['readiness-after-health-v1', 1, 1],
  ] as const)
    test(`observer inert child enforces limit${String(limit)} and restores before continuation`, async () => {
      const token = Object.freeze({ exact: true });
      const before = importedFilesystem();
      const receipts: string[] = [];
      let calls = 0;
      const realConstruct = constructProbe;
      const selected = observeConstructions(
        context,
        async (...args: [object, number, Error, number]) => {
          calls++;
          expect(args).toEqual([token, calls, sentinel, refuseAt]);
          expect(args[0]).toBe(token);
          expect(importedFilesystem().lstat === before.lstat).toBe(calls > limit);
          return realConstruct(...args);
        },
        (receipt) => {
          receipts.push(receipt);
        },
      );
      expect(selected.inspect().limit).toBe(limit);
      await mock.module('./model-manifest-observer-probe', () => ({
        importedFilesystem,
        constructProbe: selected.call,
      }));
      try {
        for (let ordinal = 1; ordinal <= limit + 1; ordinal++) {
          if (ordinal === refuseAt)
            await rejects(
              constructProbe(token, ordinal, sentinel, refuseAt),
              (cause) => cause === sentinel,
            );
          else expect(await constructProbe(token, ordinal, sentinel, refuseAt)).toBe(token);
          expect(importedFilesystem()).toEqual(before);
          expect(selected.inspect().active).toBe(false);
          expect(selected.inspect().completed).toBe(Math.min(ordinal, limit));
        }
      } finally {
        await mock.module('./model-manifest-observer-probe', () => ({
          importedFilesystem,
          constructProbe: realConstruct,
        }));
      }
      expect(receipts.map((receipt) => (JSON.parse(receipt) as Refusal).ordinal)).toEqual([
        refuseAt,
      ]);
      expect(receipts.map((receipt) => (JSON.parse(receipt) as Refusal).context)).toEqual([
        MANIFEST_CONTEXTS[context].label,
      ]);
      expect(selected.inspect().emittedBytes).toBeLessThanOrEqual(limit * 4096);
      selected.assertUsable();
    });

  test('observer inert child refuses overlap and marks emission failure unusable without replacing sentinel', async () => {
    let resume: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const overlap = observeConstructions(MODEL_MANIFEST_TRACE, () => pending);
    const first = overlap.call();
    await rejects(overlap.call(), /observer overlap/);
    resume!();
    await rejects(first, /diagnostic unusable/);
    expect(() => {
      overlap.assertUsable();
    }).toThrow('diagnostic unusable');
    const brokenEmission = observeConstructions(
      MODEL_MANIFEST_TRACE,
      () => Promise.reject(sentinel),
      () => {
        throw new Error('owned output fault');
      },
    );
    await rejects(brokenEmission.call(), (cause) => cause === sentinel);
    expect(brokenEmission.inspect().usable).toBe(false);
    expect(() => {
      brokenEmission.assertUsable();
    }).toThrow('diagnostic unusable');
    expect(importedFilesystem().lstat === installed.lstat).toBe(true);
  });

  test('observer inert child keeps refusal primary when module restoration and emission both fail', async () => {
    const moduleDescriptor = Object.getOwnPropertyDescriptor(mock, 'module');
    const register = mock.module.bind(mock);
    let restorationAttempts = 0;
    let emissionAttempts = 0;
    const selected = observeConstructions(
      MODEL_MANIFEST_TRACE,
      () => {
        Object.defineProperty(mock, 'module', {
          configurable: true,
          writable: true,
          value: () => {
            restorationAttempts++;
            throw new Error('owned module restoration fault');
          },
        });
        return Promise.reject(sentinel);
      },
      () => {
        emissionAttempts++;
        throw new Error('owned emission fault');
      },
    );
    try {
      await rejects(selected.call(), (cause) => cause === sentinel);
      expect(restorationAttempts).toBe(1);
      expect(emissionAttempts).toBe(1);
      expect(selected.inspect().usable).toBe(false);
      expect(() => {
        selected.assertUsable();
      }).toThrow('source construction diagnostic unusable');
    } finally {
      if (moduleDescriptor === undefined) Reflect.deleteProperty(mock, 'module');
      else Object.defineProperty(mock, 'module', moduleDescriptor);
      await register('node:fs/promises', () => installed);
    }
  });

  test('observer inert child bounds worst-case refusal JSON without reporter spoofing', () => {
    const longestContext = Object.values(MANIFEST_CONTEXTS)
      .map((configuration) => configuration.label)
      .reduce((longest, label) => (label.length > longest.length ? label : longest));
    const observation = {
      operation: 'lstat' as const,
      path: 'artifact/' + '\u0800'.repeat(160),
      metadata: {
        dev: '9'.repeat(20),
        ino: '8'.repeat(20),
        size: 999999999,
        mode: 33188,
        nlink: 2,
        mtimeMs: 9999999999999,
        ctimeMs: 9999999999999,
      },
    };
    const encoded = encodeRefusal({
      diagnostic: 'source-construction-observer',
      context: longestContext,
      ordinal: 1,
      usable: true,
      restored: { module: true, descriptors: true },
      observed: 999999,
      omitted: 999900,
      anomalies: Array.from({ length: 4 }, () => observation),
      latest: Array.from({ length: 32 }, () => observation),
    });
    expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(4096);
    expect(Buffer.byteLength(encoded.repeat(3))).toBeLessThanOrEqual(12288);
    expect(JSON.parse(encoded) as unknown).toMatchObject({ context: longestContext });
    const matrixBytes = expectedContexts.reduce(
      (bytes, [, , limit]) => bytes + Buffer.byteLength(encoded) * limit,
      0,
    );
    expect(matrixBytes).toBeLessThanOrEqual(57344);
    expect(expectedContexts.reduce((count, [, , limit]) => count + limit, 0)).toBe(14);
    for (const [, , limit] of expectedContexts)
      expect(Buffer.byteLength(encoded) * limit).toBeLessThanOrEqual(limit === 3 ? 12288 : 4096);
    expect((JSON.parse(encoded) as Refusal).omitted).toBeGreaterThan(999900);
    expect(encoded).not.toMatch(/^\(pass\)|^16 pass$|^0 fail$/m);
    const spoof = encodeRefusal({
      diagnostic: 'source-construction-observer',
      context: longestContext,
      ordinal: 1,
      usable: true,
      restored: { module: true, descriptors: true },
      observed: 1,
      omitted: 0,
      anomalies: [],
      latest: [
        {
          operation: 'lstat',
          path: 'artifact/\n(pass) modeled impostor [1ms]\n16 pass\n0 fail\n::error::impostor\n',
        },
      ],
    });
    expect(spoof.split('\n')).toHaveLength(2);
    expect(spoof).not.toMatch(/^\(pass\)|^16 pass$|^0 fail$|^::error/m);
    const maximumTranscript = '(pass) modeled control [1ms]\n'.repeat(1000);
    expect(maximumTranscript.length + encoded.repeat(3).length).toBeLessThan(65536);
  });

  test('observer inert child awaits three bounded default stderr records and preserves sentinel', async () => {
    const roots: string[] = [];
    const selected = observeConstructions(MODEL_MANIFEST_TRACE, async () => {
      const root = await filesystem.mkdtemp(join(tmpdir(), 'source-pins-observer-output-'));
      roots.push(root);
      const leaf = join(root, 'x'.repeat(150));
      await original.writeFile(leaf, 'owned ordinary leaf');
      await original.link(leaf, join(root, 'owned-alias'));
      for (let index = 0; index < 64; index++) await importedFilesystem().lstat(leaf);
      throw sentinel;
    });
    try {
      for (let ordinal = 1; ordinal <= 3; ordinal++)
        await rejects(selected.call(), (cause) => cause === sentinel);
      expect(selected.inspect().emittedBytes).toBeLessThanOrEqual(12288);
      expect(selected.inspect().emittedBytes).toBeGreaterThan(0);
      selected.assertUsable();
    } finally {
      for (const root of roots) await original.rm(root, { recursive: true });
    }
  });
} else {
  test('observer inert controls run in an isolated ordinary Bun child with scratch preload', async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        'test/model-manifest-observer.test.ts',
        '-t',
        '^(observer inert child|modeled summary|model summary)',
        '--preload',
        '../test/scratch/preload.ts',
        '--timeout=10000',
      ],
      {
        cwd: project,
        env: { ...process.env, PUNI_MODEL_OBSERVER_CONTROL: '1', FORCE_COLOR: '0' },
        stdout: 'ignore',
        stderr: 'pipe',
        stdin: 'ignore',
      },
    );
    const [output, exit] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    if (exit !== 0) throw new Error(output);
    expect(child.signalCode).toBeNull();
    expect(output).toContain('15 pass');
    expect(output).toContain('0 fail');
    expect(output).toContain('scratch cleanup source=afterAll event=return');
    const records = output
      .split('\n')
      .filter((line) => line.startsWith('{"diagnostic":"source-construction-observer"'));
    expect(records).toHaveLength(3);
    expect(
      records.reduce((bytes, line) => bytes + Buffer.byteLength(line + '\n'), 0),
    ).toBeLessThanOrEqual(12288);
    for (const [index, line] of records.entries()) {
      expect(Buffer.byteLength(line + '\n')).toBeLessThanOrEqual(4096);
      const receipt = JSON.parse(line) as Refusal;
      expect(receipt.ordinal).toBe(index + 1);
      expect(receipt.context).toBe('full-model');
      expect(receipt.usable).toBe(true);
      expect(
        receipt.anomalies.every(
          (entry) =>
            (Number(entry.metadata?.mode) & 0o170000) === 0o100000 &&
            Number(entry.metadata?.nlink) === 2,
        ),
      ).toBe(true);
    }
  });
}
