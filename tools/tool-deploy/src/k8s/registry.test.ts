import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'bun:test';

import { fakeRegistry } from './fake-registry';
import { assertImageRevisions, registryImageReader, registryRevisionReader } from './registry';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

function registry(
  labels: Record<string, string | null>,
  options: { lie?: boolean; user?: string } = {},
) {
  const fake = fakeRegistry(labels, options);
  stops.push(fake.stop);
  return fake;
}

const source = 'a'.repeat(40);

describe('image revision labels read from the registry', () => {
  it('accepts images labelled with the source commit, through an index, with auth', async () => {
    const { ref } = registry({ 'wbs-be-01': source, 'wbs-gw-01': source }, { user: 'u:p' });
    await assertImageRevisions(
      { backend: ref('wbs-be-01'), gateway: ref('wbs-gw-01') },
      source,
      registryRevisionReader('u:p'),
    );
  });

  it('refuses an image built from another commit', async () => {
    const { ref } = registry({ 'wbs-be-01': source, 'wbs-gw-01': '9'.repeat(40) });
    expect(
      await assertImageRevisions(
        { backend: ref('wbs-be-01'), gateway: ref('wbs-gw-01') },
        source,
        registryRevisionReader(null),
      ).then(
        () => 'accepted',
        (e: unknown) => String(e),
      ),
    ).toContain(`gateway ${ref('wbs-gw-01')} is labelled WBS_SHA=${'9'.repeat(40)}`);
  });

  it('refuses an unlabelled image', async () => {
    const { ref } = registry({ 'wbs-mcp-01': null });
    expect(
      await assertImageRevisions(
        { mcp: ref('wbs-mcp-01') },
        source,
        registryRevisionReader(null),
      ).then(
        () => 'accepted',
        (e: unknown) => String(e),
      ),
    ).toContain('is labelled WBS_SHA=null');
  });

  it('refuses a registry that answers a digest with other bytes', async () => {
    const { ref } = registry({ 'wbs-be-01': source }, { lie: true });
    expect(
      await registryRevisionReader(null)(ref('wbs-be-01')).then(
        () => 'read',
        (e: unknown) => String(e),
      ),
    ).toContain('returned bytes that are not');
  });
});

it('returns verified config identity independently of revision labels', async () => {
  const { ref } = registry({ 'wbs-be-01': null });
  const config = JSON.stringify({ config: { Labels: null }, name: 'wbs-be-01' });
  expect(await registryImageReader(null)(ref('wbs-be-01'), 1000)).toEqual({
    revision: null,
    configDigest: `sha256:${createHash('sha256').update(config).digest('hex')}`,
  });
});

function chain(fault: string) {
  const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
  const config = JSON.stringify({ config: { Labels: { WBS_SHA: source } } });
  const manifest = JSON.stringify({
    config:
      fault === 'missing-config'
        ? undefined
        : { digest: fault === 'malformed-config' ? 'invalid' : hash(config) },
  });
  const index = JSON.stringify({
    manifests: [
      {
        digest: fault === 'malformed-child' ? 'invalid' : hash(manifest),
        platform: { os: 'linux', architecture: 'amd64' },
      },
    ],
  });
  const bodies = new Map([
    [hash(index), { stage: 'index', bytes: index }],
    [hash(manifest), { stage: 'child', bytes: manifest }],
    [hash(config), { stage: 'config', bytes: config }],
  ]);
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      const body = bodies.get(path.split('/').at(-1) ?? '');
      if (body === undefined) return new Response('', { status: 404 });
      if (fault === 'deadline') await Bun.sleep(100);
      if (fault === 'body-deadline' && body.stage === 'config')
        return new Response(
          new ReadableStream({
            async pull(controller) {
              await Bun.sleep(200);
              controller.enqueue(new TextEncoder().encode(body.bytes));
              controller.close();
            },
          }),
        );
      return new Response(body.bytes + (body.stage === fault ? ' ' : ''));
    },
  });
  stops.push(() => server.stop(true));
  return { ref: `127.0.0.1:${String(server.port)}/backend@${hash(index)}`, paths };
}

for (const stage of ['index', 'child', 'config']) {
  it(`refuses corrupted ${stage} bytes while resolving config identity`, async () => {
    const registry = chain(stage);
    expect(
      await registryImageReader(null)(registry.ref, 1000).then(
        () => 'accepted',
        (error: unknown) => String(error),
      ),
    ).toContain('returned bytes that are not');
  });
}
for (const fault of ['missing-config', 'malformed-config']) {
  it(`refuses ${fault} identity instead of creating an observation`, async () => {
    const registry = chain(fault);
    expect(
      await registryImageReader(null)(registry.ref, 1000).then(
        () => 'accepted',
        (error: unknown) => String(error),
      ),
    ).toContain('manifest names no valid config');
    expect(registry.paths.some((path) => path.includes('/blobs/'))).toBe(false);
  });
}
it('bounds the whole verified chain by one remaining deadline', async () => {
  const registry = chain('deadline');
  const start = performance.now();
  expect(
    await registryImageReader(null)(registry.ref, 150).then(
      () => 'accepted',
      (error: unknown) => String(error),
    ),
  ).not.toBe('accepted');
  expect(performance.now() - start).toBeLessThan(500);
});

it('bounds config body consumption by the remaining deadline', async () => {
  const registry = chain('body-deadline');
  const started = performance.now();
  expect(
    await registryImageReader(null)(registry.ref, 50).then(
      () => 'accepted',
      (error: unknown) => String(error),
    ),
  ).not.toBe('accepted');
  expect(performance.now() - started).toBeLessThan(500);
});
for (const timeout of [0, -1, NaN, 1.5]) {
  it(`refuses invalid registry deadline ${String(timeout)}`, async () => {
    expect(
      await registryImageReader(null)('irrelevant', timeout).then(
        () => 'accepted',
        (error: unknown) => String(error),
      ),
    ).toContain('invalid registry image deadline');
  });
}

it('refuses malformed child digest before requesting child bytes', async () => {
  const registry = chain('malformed-child');
  expect(
    await registryImageReader(null)(registry.ref, 1000).then(
      () => 'accepted',
      (error: unknown) => String(error),
    ),
  ).toContain('malformed registry digest');
  expect(registry.paths).toHaveLength(1);
});
