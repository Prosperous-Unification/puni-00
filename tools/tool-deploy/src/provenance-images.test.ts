import { createHash } from 'node:crypto';

import { afterEach, expect, it, spyOn } from 'bun:test';

import { fakeRegistry } from './k8s/fake-registry';
import type { ReleaseImage } from './provenance';
import { verifyImageProvenance } from './provenance-images';

const revision = 'a'.repeat(40);
const secret = 'secret-sentinel-3';
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

function image(role: string, reference: string): ReleaseImage {
  return {
    role,
    revision,
    reference,
    digest: reference.slice(reference.lastIndexOf('@') + 1),
    taggedReference: `${reference.slice(0, reference.lastIndexOf('@'))}:${revision}`,
  };
}

function registry(
  labels: Record<string, string | null>,
  options: { user?: string; lie?: boolean } = {},
) {
  const fake = fakeRegistry(labels, options);
  stops.push(fake.stop);
  return fake;
}

function authority(reference: string): string {
  return reference.slice(0, reference.indexOf('/'));
}

async function refusal(
  images: readonly ReleaseImage[],
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  return verifyImageProvenance(revision, images, environment).then(
    () => 'accepted',
    (error: unknown) => String(error),
  );
}

it('reports verified config identity for every selected image anonymously', async () => {
  const fake = registry({ backend: revision, gateway: revision, frontend: revision });
  const images = ['backend', 'gateway', 'frontend'].map((role) => image(role, fake.ref(role)));
  expect(await verifyImageProvenance(revision, images, {})).toEqual(
    images.map((selected) => ({
      role: selected.role,
      reference: selected.reference,
      configDigest: `sha256:${createHash('sha256')
        .update(JSON.stringify({ config: { Labels: { WBS_SHA: revision } }, name: selected.role }))
        .digest('hex')}`,
    })),
  );
});

for (const label of [null, 'b'.repeat(40)]) {
  it(`refuses frontend revision ${String(label)} after valid backend and gateway`, async () => {
    const fake = registry({ backend: revision, gateway: revision, frontend: label });
    const images = ['backend', 'gateway', 'frontend'].map((role) => image(role, fake.ref(role)));
    expect(await refusal(images, {})).toContain('revision');
  });
}

it('refuses an empty selected image set', async () => {
  expect(await refusal([], {})).toContain('selection');
});

for (const credentials of [
  { PUNI_REGISTRY_AUTH: `u:${secret}` },
  { REGISTRY_USER: 'u', REGISTRY_PASS: secret },
]) {
  it(`uses ${Object.keys(credentials)[0]} only for explicitly bound namespaced images`, async () => {
    const fake = registry({ 'team/frontend': revision }, { user: `u:${secret}` });
    const reference = fake.ref('team/frontend');
    const observations = await verifyImageProvenance(revision, [image('frontend', reference)], {
      ...credentials,
      REGISTRY: `${authority(reference)}/team`,
    });
    expect(observations).toHaveLength(1);
    expect(JSON.stringify(observations)).not.toContain(secret);
  });
}

it('prechecks every selected authority before any credentialed request', async () => {
  const requests: string[] = [];
  const intended = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push(request.url);
      return new Response('', { status: 401 });
    },
  });
  stops.push(() => intended.stop(true));
  const foreign = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push(request.url);
      return new Response('', { status: 401 });
    },
  });
  stops.push(() => foreign.stop(true));
  const digest = `sha256:${'1'.repeat(64)}`;
  const bound = `127.0.0.1:${String(intended.port)}`;
  const message = await refusal(
    [
      image('backend', `${bound}/backend@${digest}`),
      image('frontend', `127.0.0.1:${String(foreign.port)}/frontend@${digest}`),
    ],
    { REGISTRY: bound, PUNI_REGISTRY_AUTH: `u:${secret}` },
  );
  expect(message).toContain('authority');
  expect(message).not.toContain(secret);
  expect(requests).toEqual([]);
});

for (const [index, reference] of [
  `u:${secret}@registry.test/frontend@sha256:${'1'.repeat(64)}`,
  `registry.test/frontend@sha256:${'1'.repeat(64)}\n`,
  `registry.test/frontend?query=x@sha256:${'1'.repeat(64)}`,
  `registry.test/../frontend@sha256:${'1'.repeat(64)}`,
  `registry.test/frontend:tag@sha256:${'1'.repeat(64)}`,
  `127.0.0.1:99999/frontend@sha256:${'1'.repeat(64)}`,
].entries()) {
  it(`refuses malformed reference before accessing credentials case ${String(index)}`, async () => {
    let reads = 0;
    const environment = {
      get PUNI_REGISTRY_AUTH(): string {
        reads += 1;
        throw new Error(secret);
      },
    };
    const message = await refusal([image('frontend', reference)], environment);
    expect(message).toContain('reference');
    expect(message).not.toContain(secret);
    expect(reads).toBe(0);
  });
}

const invalidCredentials: readonly Readonly<Record<string, string | undefined>>[] = [
  { PUNI_REGISTRY_AUTH: '' },
  { PUNI_REGISTRY_AUTH: secret },
  { PUNI_REGISTRY_AUTH: `:${secret}` },
  { PUNI_REGISTRY_AUTH: 'u:' },
  { PUNI_REGISTRY_AUTH: `u:${secret}\n` },
  { REGISTRY_USER: 'u' },
  { REGISTRY_PASS: secret },
  { REGISTRY_USER: '', REGISTRY_PASS: secret },
  { REGISTRY_USER: 'u', REGISTRY_PASS: '' },
  { REGISTRY_USER: 'u:x', REGISTRY_PASS: secret },
  { REGISTRY_USER: 'u', REGISTRY_PASS: `${secret}\r` },
  { PUNI_REGISTRY_AUTH: `u:${secret}`, REGISTRY_USER: 'u', REGISTRY_PASS: secret },
  { PUNI_REGISTRY_AUTH: `u:${secret}`, REGISTRY_USER: '' },
];
invalidCredentials.forEach((credentials, index) => {
  it(`refuses malformed or ambiguous provided credentials case ${String(index)}`, async () => {
    const fake = registry({ frontend: revision });
    const reference = fake.ref('frontend');
    const message = await refusal([image('frontend', reference)], {
      ...credentials,
      REGISTRY: authority(reference),
    });
    expect(message).toContain('credentials');
    expect(message).not.toContain(secret);
  });
});

for (const [index, configured] of [
  undefined,
  '',
  `u:${secret}@registry.test`,
  `registry.test?${secret}`,
  `registry.test#${secret}`,
  `registry.test/../${secret}`,
  `registry.test:99999`,
  `http://registry.test`,
  `registry.test\\${secret}`,
  `registry.test/%2e%2e`,
].entries()) {
  it(`refuses missing or malformed credential authority case ${String(index)}`, async () => {
    const fake = registry({ frontend: revision });
    const message = await refusal([image('frontend', fake.ref('frontend'))], {
      PUNI_REGISTRY_AUTH: `u:${secret}`,
      REGISTRY: configured,
    });
    expect(message).toContain('REGISTRY');
    expect(message).not.toContain(secret);
  });
}

for (const stage of ['manifest', 'config']) {
  it(`refuses tampered ${stage} bytes in selected images`, async () => {
    const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const config = JSON.stringify({ config: { Labels: { WBS_SHA: revision } } });
    const manifest = JSON.stringify({ config: { digest: hash(config) } });
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const manifestRequest = new URL(request.url).pathname.includes('/manifests/');
        const bytes = manifestRequest ? manifest : config;
        return new Response(
          bytes + ((manifestRequest ? 'manifest' : 'config') === stage ? ' ' : ''),
        );
      },
    });
    stops.push(() => server.stop(true));
    expect(
      await refusal(
        [image('frontend', `127.0.0.1:${String(server.port)}/frontend@${hash(manifest)}`)],
        {},
      ),
    ).toContain('returned bytes that are not');
  });
}

it('spends one 60s deadline across all selected images', async () => {
  const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const config = JSON.stringify({ config: { Labels: { WBS_SHA: revision } } });
  const manifest = JSON.stringify({ config: { digest: hash(config) } });
  let elapsed = 0;
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.includes('/blobs/')) elapsed += 40_000;
      return new Response(path.includes('/manifests/') ? manifest : config);
    },
  });
  stops.push(() => server.stop(true));
  const clock = spyOn(performance, 'now').mockImplementation(() => elapsed);
  try {
    const images = ['backend', 'gateway', 'frontend'].map((role) =>
      image(role, `127.0.0.1:${String(server.port)}/${role}@${hash(manifest)}`),
    );
    expect(await refusal(images, {})).toContain('deadline');
    expect(paths.some((path) => path.includes('/frontend/'))).toBe(false);
  } finally {
    clock.mockRestore();
  }
});

it('prechecks later references before accessing any credentials', async () => {
  const fake = registry({ backend: revision });
  let reads = 0;
  const environment = {
    get PUNI_REGISTRY_AUTH(): string {
      reads += 1;
      throw new Error(secret);
    },
  };
  const message = await refusal(
    [
      image('backend', fake.ref('backend')),
      image('frontend', `registry.test/frontend?secret@sha256:${'1'.repeat(64)}`),
    ],
    environment,
  );
  expect(message).toContain('reference');
  expect(message).not.toContain(secret);
  expect(reads).toBe(0);
});

for (const [index, decorate] of [
  (bound: string) => `u:${secret}@${bound}`,
  (bound: string) => `${bound}/team?${secret}`,
].entries()) {
  it(`refuses malformed configured binding even when parsed host would match case ${String(index)}`, async () => {
    const fake = registry({ frontend: revision }, { user: `u:${secret}` });
    const reference = fake.ref('frontend');
    const message = await refusal([image('frontend', reference)], {
      PUNI_REGISTRY_AUTH: `u:${secret}`,
      REGISTRY: decorate(authority(reference)),
    });
    expect(message).toContain('REGISTRY');
    expect(message).not.toContain(secret);
  });
}

for (const { configured, selected } of [
  { configured: 'localhost', selected: 'LOCALHOST' },
  { configured: 'localhost:80', selected: 'LOCALHOST:443' },
  { configured: '127.0.0.1', selected: '127.1' },
  { configured: '127.0.0.1:80', selected: '2130706433:443' },
  { configured: 'localhost:30443', selected: 'LOCALHOST:30443' },
  { configured: '127.0.0.1:30443', selected: '127.1:30443' },
]) {
  it(`binds the effective registry origin before credentials can reach ${selected} for ${configured}`, async () => {
    const requests: { readonly origin: string; readonly authenticated: boolean }[] = [];
    const intercept = Object.assign(
      (request: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
        const url = request instanceof Request ? request.url : String(request);
        requests.push({
          origin: new URL(url).origin,
          authenticated: new Headers(options?.headers).has('authorization'),
        });
        throw new Error('Network boundary reached');
      },
      { preconnect: fetch.preconnect },
    );
    const transport = spyOn(globalThis, 'fetch').mockImplementation(intercept);
    try {
      const message = await refusal(
        [image('frontend', `${selected}/frontend@sha256:${'1'.repeat(64)}`)],
        { REGISTRY: configured, PUNI_REGISTRY_AUTH: `u:${secret}` },
      );
      expect(requests).toEqual([]);
      expect(message).toContain('authority');
      expect(message).not.toContain(secret);
    } finally {
      transport.mockRestore();
    }
  });
}

for (const { configured, selected, origin } of [
  { configured: 'localhost:80', selected: 'localhost', origin: 'http://localhost' },
  { configured: 'registry.test:443', selected: 'REGISTRY.TEST', origin: 'https://registry.test' },
  { configured: '2130706433', selected: '127.1:443', origin: 'https://127.0.0.1' },
]) {
  it(`accepts equivalent effective registry origins ${configured} and ${selected}`, async () => {
    const hash = (bytes: string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const config = JSON.stringify({ config: { Labels: { WBS_SHA: revision } } });
    const manifest = JSON.stringify({ config: { digest: hash(config) } });
    const requests: { readonly origin: string; readonly authorized: boolean }[] = [];
    const intercept = Object.assign(
      (request: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
        const url = new URL(request instanceof Request ? request.url : String(request));
        requests.push({
          origin: url.origin,
          authorized:
            new Headers(options?.headers).get('authorization') ===
            `Basic ${Buffer.from(`u:${secret}`).toString('base64')}`,
        });
        return Promise.resolve(
          new Response(url.pathname.includes('/manifests/') ? manifest : config),
        );
      },
      { preconnect: fetch.preconnect },
    );
    const transport = spyOn(globalThis, 'fetch').mockImplementation(intercept);
    try {
      const reference = `${selected}/frontend@${hash(manifest)}`;
      expect(
        await verifyImageProvenance(revision, [image('frontend', reference)], {
          REGISTRY: configured,
          PUNI_REGISTRY_AUTH: `u:${secret}`,
        }),
      ).toEqual([{ role: 'frontend', reference, configDigest: hash(config) }]);
      expect(requests).toEqual([
        { origin, authorized: true },
        { origin, authorized: true },
      ]);
    } finally {
      transport.mockRestore();
    }
  });
}
