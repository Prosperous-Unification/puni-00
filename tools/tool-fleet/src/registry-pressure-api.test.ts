import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { registryClusterFixture } from './registry-maintenance-cluster.fixture';
import { respondRegistryFixture } from './registry-maintenance-namespace-api.fixture';
import { readRegistryBytes } from './registry-stream';

const request = () => [
  'kubectl',
  '--kubeconfig',
  '/etc/puni/registry-maintenance-production.kubeconfig',
  '--request-timeout=15s',
  'patch',
  '--namespace',
  'puni-registry',
  'Deployment',
  'registry',
  '--type=json',
  '--patch-file=/dev/stdin',
  '--output=json',
];
const state = () =>
  JSON.stringify({
    resources: [...registryClusterFixture().resources.values()].map((resource) => ({
      ...resource,
      metadata: { ...resource.metadata, resourceVersion: '1' },
    })),
  });
const patch = (replicas = 0) => [
  { op: 'test', path: '/metadata/uid', value: 'registry' },
  { op: 'test', path: '/metadata/resourceVersion', value: '1' },
  { op: 'add', path: '/spec/replicas', value: replicas },
];

test('validated zero-replica patch carries exact pre-advance stop selection', () => {
  const reply = respondRegistryFixture(request(), state(), patch());
  expect(reply).toHaveProperty('stopSelection', { uid: 'registry', resourceVersion: '1' });
  expect(reply.response).toMatchObject({
    metadata: { resourceVersion: '2' },
    spec: { replicas: 0 },
  });
  expect(respondRegistryFixture(request(), state(), patch(1))).not.toHaveProperty('stopSelection');
});

for (const fault of [
  'none',
  'bootstrap',
  'other-mode',
  'root',
  'wrong-uid',
  'wrong-revision',
  'status',
  'malformed',
  'extra',
  'group',
  'body-bound',
  'held',
  'endpoint-missing',
  'body-error',
  'body-timeout',
  'fetch-timeout',
  'bootstrap-extra',
  'restore-one',
  'natural-exit',
] as const)
  test(`private API holds selected patch through Unix closure ${fault}`, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-namespace-api.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('type Fields =');
    const end = source.lastIndexOf('if (import.meta.main)');
    if (start < 0 || end < start) throw new Error('Missing actual namespace API body');
    const body =
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        source.slice(start, end).replaceAll('export function', 'function'),
      ) + '\nreturn main;';
    const effects: string[] = [];
    let written: string | undefined;
    let output: unknown;
    const failure = Object.assign(new Error('Private Unix dependency failed'), { code: 'ENOENT' });
    let rescued = false;
    let rescue: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const selectedPatch = patch(fault === 'restore-one' ? 1 : 0);
    if (fault === 'wrong-uid') selectedPatch[0].value = 'foreign';
    if (fault === 'wrong-revision') selectedPatch[1].value = '0';
    const bytes = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    let release: () => void = () => {
      throw new Error('Missing response release');
    };
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Boundary: actual parsed API/controller body, modeled fixed files/socket fetch, real patch/resource validators and bounded response reader.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'writeFile',
      'Bun',
      'readRegistryBytes',
      'fetch',
      'console',
      'AbortSignal',
      body,
    ) as (...ports: unknown[]) => () => Promise<void>;
    const run = compile(
      { getuid: () => (fault === 'root' ? 1 : 0), argv: ['bun', 'api', ...request()] },
      (path: string) =>
        Promise.resolve(
          path === '/root/task8-fixture/kubernetes.json'
            ? state()
            : fault === 'other-mode'
              ? '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-index\0'
              : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      (path: string, serialized: string, options: unknown) => {
        effects.push('write');
        expect(path).toBe('/root/task8-fixture/kubernetes.json');
        expect(options).toEqual({ mode: 0o600 });
        written = serialized;
        return Promise.resolve();
      },
      { stdin: { stream: () => bytes(JSON.stringify(selectedPatch)) } },
      readRegistryBytes,
      async (
        url: string,
        options: { unix: string; method: string; body: string; signal?: AbortSignal },
      ) => {
        effects.push('fetch');
        expect(url).toBe('http://localhost/stop');
        expect(options.unix).toBe('/root/task8-fixture/pressure-stop.sock');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({ uid: 'registry', resourceVersion: '1' });
        if (fault !== 'fetch-timeout') expect(options.signal).toBeInstanceOf(AbortSignal);
        if (fault === 'held') await held;
        if (fault === 'endpoint-missing') throw failure;
        if (fault === 'fetch-timeout')
          await new Promise<void>((resolve, reject) => {
            options.signal?.addEventListener(
              'abort',
              () => {
                reject(options.signal?.reason as Error);
              },
              { once: true },
            );
            rescue = setTimeout(() => {
              rescued = true;
              reject(failure);
            }, 50);
          });
        if (fault === 'body-error')
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(failure);
              },
            }),
          );
        if (fault === 'body-timeout')
          return new Response(
            new ReadableStream({
              start(controller) {
                rescue = setTimeout(() => {
                  rescued = true;
                  controller.close();
                }, 50);
              },
            }),
          );
        const response =
          fault === 'bootstrap' || fault === 'bootstrap-extra'
            ? { scope: 'bootstrap', ...(fault === 'bootstrap-extra' ? { extra: true } : {}) }
            : {
                scope: 'pressure',
                pid: 42,
                startTicks: '123',
                exitCode: fault === 'natural-exit' ? 0 : 143,
                signal: fault === 'natural-exit' ? null : 'SIGTERM',
                groupAbsent: fault !== 'group',
                allocation: 'ENOSPC',
                stage: 'open',
                instanceSha256: 'a'.repeat(64),
                requestSha256: 'b'.repeat(64),
                ...(fault === 'extra' ? { extra: true } : {}),
              };
        return new Response(
          fault === 'malformed'
            ? 'bad-json'
            : (fault === 'body-bound' ? ' '.repeat(4096) : '') + JSON.stringify(response),
          { status: fault === 'status' ? 500 : 200 },
        );
      },
      {
        log: (serialized: string) => {
          effects.push('response');
          output = JSON.parse(serialized);
        },
      },
      {
        timeout: (milliseconds: number) => {
          expect(milliseconds).toBe(10000);
          const cancellation = new AbortController();
          if (fault === 'body-timeout' || fault === 'fetch-timeout')
            timer = setTimeout(() => {
              cancellation.abort(failure);
            }, 5);
          return cancellation.signal;
        },
      },
    );
    const pending = run();
    if (fault === 'held') {
      for (let count = 0; count < 20 && !effects.includes('fetch'); count++)
        await new Promise((resolve) => setTimeout(resolve, 1));
      const before = [...effects];
      release();
      await pending;
      expect(before).toEqual(['fetch']);
      expect(effects).toEqual(['fetch', 'write', 'response']);
      return;
    }
    let refused: unknown;
    try {
      await pending;
    } catch (cause) {
      refused = cause;
    } finally {
      clearTimeout(timer);
      clearTimeout(rescue);
    }
    if (['none', 'bootstrap', 'other-mode', 'restore-one', 'natural-exit'].includes(fault)) {
      expect(refused).toBeUndefined();
      expect(effects).toEqual(
        fault === 'other-mode' || fault === 'restore-one'
          ? ['write', 'response']
          : ['fetch', 'write', 'response'],
      );
      expect(written).toBeDefined();
      expect(output).toMatchObject({
        metadata: { resourceVersion: '2' },
        status: { readyReplicas: fault === 'restore-one' ? 1 : 0 },
      });
      return;
    }
    expect(refused).toBeInstanceOf(Error);
    if (fault === 'endpoint-missing') expect(refused).toBe(failure);
    if (fault === 'body-error') {
      expect(refused).toBeInstanceOf(AggregateError);
      expect((refused as AggregateError).errors).toContain(failure);
    }
    if (fault === 'body-timeout' || fault === 'fetch-timeout') expect(rescued).toBe(false);
    expect(written).toBeUndefined();
    expect(output).toBeUndefined();
    expect(effects).toEqual(
      ['root', 'wrong-uid', 'wrong-revision'].includes(fault) ? [] : ['fetch'],
    );
  });
