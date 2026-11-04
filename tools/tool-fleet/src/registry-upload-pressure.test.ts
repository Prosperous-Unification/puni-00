import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { requireRejection } from './registry-rejection.fixture';

const body = Buffer.from('owned pressure payload');
const digest = 'sha256:' + createHash('sha256').update(body).digest('hex');
const uuid = 'aabbccdd-1234-4234-8234-aabbccddeeff';
const pathname = '/v2/pressure/full/blobs/uploads/' + uuid;
const endpoint = 'http://127.0.0.1:5053';
const responseBody = JSON.stringify({
  errors: [
    {
      code: 'UNKNOWN',
      message: 'unknown error',
      detail: {
        Op: 'write',
        Path:
          '/var/lib/puni-registry/registry/contents/docker/registry/v2/repositories/pressure/full/_uploads/' +
          uuid +
          '/data',
        Err: 28,
      },
    },
  ],
});

const request = (suffix = '?digest=' + digest, bytes: Uint8Array = body) =>
  new Request(endpoint + pathname + suffix, { method: 'PUT', body: Buffer.from(bytes) });
const failureResponse = () =>
  new Response(responseBody, { status: 500, headers: { 'content-type': 'application/json' } });
const create = async (
  fill: () => Promise<void> = () => Promise.resolve(),
  forward: (request: Request) => Promise<Response> = () => Promise.resolve(failureResponse()),
) => {
  const { createRegistryUploadPressure } = await import('./registry-upload-pressure.fixture');
  return createRegistryUploadPressure({ digest, size: body.length }, fill, forward);
};

test('upload pressure forwards the exact admitted body only after allocation', async () => {
  const observations: string[] = [];
  const proxy = await create(
    () => {
      observations.push('fill');
      return Promise.resolve();
    },
    async (forwarded) => {
      observations.push('forward');
      expect(forwarded.url).toBe(endpoint + pathname + '?digest=' + digest);
      expect(forwarded.method).toBe('PUT');
      expect(new Uint8Array(await forwarded.arrayBuffer())).toEqual(body);
      return failureResponse();
    },
  );
  const response = await proxy.fetch(request());
  expect(observations).toEqual(['fill', 'forward']);
  expect(response.status).toBe(500);
  expect(response.headers.get('content-type')).toBe('application/json');
  expect(await response.text()).toBe(responseBody);
  expect(proxy.verify()).toEqual({
    status: 500,
    bytes: 22,
    allocationBeforeBody: true,
    enospc: true,
  });
});

test('upload pressure holds forwarding until allocation settles', async () => {
  const allocation = Promise.withResolvers<undefined>();
  let forwarded = false;
  const proxy = await create(
    () => allocation.promise,
    () => {
      forwarded = true;
      return Promise.resolve(failureResponse());
    },
  );
  const pending = proxy.fetch(request());
  await Bun.sleep(10);
  expect(forwarded).toBe(false);
  expect(() => proxy.verify()).toThrow();
  allocation.resolve(undefined);
  await pending;
  expect(forwarded).toBe(true);
  expect(proxy.verify().status).toBe(500);
});

for (const [name, suffix, bytes] of [
  ['missing digest', '', body],
  ['foreign digest', '?digest=sha256:' + '0'.repeat(64), body],
  ['duplicate digest', '?digest=' + digest + '&digest=' + digest, body],
  ['short body', '?digest=' + digest, body.subarray(1)],
  ['changed body', '?digest=' + digest, Buffer.alloc(body.length, 0x20)],
  ['oversized body', '?digest=' + digest, Buffer.concat([body, Buffer.from('!')])],
] as const) {
  test('upload pressure refuses ' + name + ' before allocation', async () => {
    let allocated = false;
    let forwarded = false;
    const proxy = await create(
      () => {
        allocated = true;
        return Promise.resolve();
      },
      () => {
        forwarded = true;
        return Promise.resolve(failureResponse());
      },
    );
    expect((await requireRejection(proxy.fetch(request(suffix, bytes)))).throwCause).toThrow();
    expect(allocated).toBe(false);
    expect(forwarded).toBe(false);
    expect(() => proxy.verify()).toThrow();
  });
}

test('upload pressure refuses malformed upload UUID before allocation', async () => {
  let allocated = false;
  const proxy = await create(() => {
    allocated = true;
    return Promise.resolve();
  });
  expect(
    (
      await requireRejection(
        proxy.fetch(
          new Request(endpoint + '/v2/pressure/full/blobs/uploads/foreign?digest=' + digest, {
            method: 'PUT',
            body,
          }),
        ),
      )
    ).throwCause,
  ).toThrow();
  expect(allocated).toBe(false);
  expect(() => proxy.verify()).toThrow();
});

test('upload pressure forwards other requests without claiming an exhaustion witness', async () => {
  let allocated = false;
  const expected = new Response(null, { status: 202 });
  const original = new Request(endpoint + '/v2/pressure/full/blobs/uploads/', { method: 'POST' });
  const proxy = await create(
    () => {
      allocated = true;
      return Promise.resolve();
    },
    (forwarded) => {
      expect(forwarded).toBe(original);
      return Promise.resolve(expected);
    },
  );
  expect(await proxy.fetch(original)).toBe(expected);
  expect(allocated).toBe(false);
  expect(() => proxy.verify()).toThrow();
});

for (const [name, status, content] of [
  ['successful allocation', 201, responseBody],
  ['foreign error status', 503, responseBody],
  ['unrelated server failure', 500, '{"errors":[{"code":"UNKNOWN","detail":"permission denied"}]}'],
  ['oversized server failure', 500, responseBody + ' '.repeat(4096)],
] as const) {
  test('upload pressure cannot claim ' + name + ' as physical exhaustion', async () => {
    const proxy = await create(undefined, () => Promise.resolve(new Response(content, { status })));
    expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow();
    expect(() => proxy.verify()).toThrow();
  });
}

for (const stage of ['allocation', 'forward'] as const) {
  test('upload pressure preserves the exact ' + stage + ' failure', async () => {
    const failure = new Error(stage);
    let forwarded = false;
    const proxy = await create(
      () => (stage === 'allocation' ? Promise.reject(failure) : Promise.resolve()),
      () => {
        forwarded = true;
        return Promise.reject(failure);
      },
    );
    expect((await requireRejection(proxy.fetch(request()))).cause).toBe(failure);
    expect(forwarded).toBe(stage === 'forward');
    expect(() => proxy.verify()).toThrow(failure);
  });
}

test('upload pressure consumes the one-shot before awaiting allocation', async () => {
  const allocation = Promise.withResolvers<undefined>();
  let fills = 0;
  const proxy = await create(() => {
    fills++;
    return allocation.promise;
  });
  const first = proxy.fetch(request());
  await Bun.sleep(10);
  expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow();
  allocation.resolve(undefined);
  await first;
  expect(fills).toBe(1);
  expect(() => proxy.verify()).toThrow();
});

test('upload pressure cannot replace an earlier witness with a second body', async () => {
  let fills = 0;
  const proxy = await create(() => {
    fills++;
    return Promise.resolve();
  });
  await proxy.fetch(request());
  expect(proxy.verify().enospc).toBe(true);
  expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow();
  expect(fills).toBe(1);
  expect(() => proxy.verify()).toThrow();
});

test('upload pressure remembers a failed request before another forward', async () => {
  const failure = new Error('first upstream failure');
  let forwarded = 0;
  const proxy = await create(undefined, () => {
    forwarded++;
    return Promise.reject(failure);
  });
  const ping = () => new Request(endpoint + '/v2/');
  expect((await requireRejection(proxy.fetch(ping()))).cause).toBe(failure);
  expect((await requireRejection(proxy.fetch(ping()))).cause).toBe(failure);
  expect(forwarded).toBe(1);
  expect(() => proxy.verify()).toThrow(failure);
});

test('upload pressure forwards a foreign repository without allocating', async () => {
  let allocated = false;
  const expected = new Response(null, { status: 201 });
  const original = new Request(
    endpoint + '/v2/foreign/image/blobs/uploads/' + uuid + '?digest=' + digest,
    {
      method: 'PUT',
      body,
    },
  );
  const proxy = await create(
    () => {
      allocated = true;
      return Promise.resolve();
    },
    (forwarded) => {
      expect(forwarded).toBe(original);
      return Promise.resolve(expected);
    },
  );
  expect(await proxy.fetch(original)).toBe(expected);
  expect(allocated).toBe(false);
  expect(() => proxy.verify()).toThrow();
});

test('upload pressure selects before the request stream finishes', async () => {
  const reading = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      reading.resolve(controller);
    },
  });
  let fills = 0;
  const proxy = await create(() => {
    fills++;
    return Promise.resolve();
  });
  const first = proxy.fetch(
    new Request(endpoint + pathname + '?digest=' + digest, { method: 'PUT', body: stream }),
  );
  const controller = await reading.promise;
  expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow('already selected');
  controller.enqueue(body);
  controller.close();
  await first;
  expect(fills).toBe(1);
  expect(() => proxy.verify()).toThrow();
});

for (const stage of ['request', 'response'] as const) {
  test('upload pressure bounds the unfinished ' + stage + ' stream', async () => {
    const rescue = new Error('independent unfinished stream rescue');
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          stage === 'request' ? Buffer.concat([body, Buffer.from('!')]) : Buffer.alloc(4097),
        );
        timer = setTimeout(() => {
          controller.error(rescue);
        }, 50);
      },
      cancel() {
        cancelled = true;
      },
    });
    let allocated = false;
    const proxy = await create(
      () => {
        allocated = true;
        return Promise.resolve();
      },
      () =>
        Promise.resolve(
          stage === 'response' ? new Response(stream, { status: 500 }) : failureResponse(),
        ),
    );
    try {
      const incoming =
        stage === 'request'
          ? new Request(endpoint + pathname + '?digest=' + digest, {
              method: 'PUT',
              body: stream,
            })
          : request();
      expect((await requireRejection(proxy.fetch(incoming))).throwCause).toThrow(
        stage === 'request'
          ? 'Pressure upload body exceeds 22 bytes'
          : 'Pressure upload failure exceeds 4096 bytes',
      );
      expect(cancelled).toBe(true);
      expect(allocated).toBe(stage === 'response');
      expect(() => proxy.verify()).toThrow();
    } finally {
      clearTimeout(timer);
    }
  });
}

test('upload pressure refuses a body shorter than its matching digest declaration', async () => {
  const { createRegistryUploadPressure } = await import('./registry-upload-pressure.fixture');
  let allocated = false;
  const proxy = createRegistryUploadPressure(
    { digest, size: body.length + 1 },
    () => {
      allocated = true;
      return Promise.resolve();
    },
    () => Promise.resolve(failureResponse()),
  );
  expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow('declared bytes');
  expect(allocated).toBe(false);
  expect(() => proxy.verify()).toThrow();
});

test('upload response observation is absent before the selected body', async () => {
  const proxy = await create(undefined, () => Promise.resolve(new Response(null, { status: 202 })));
  expect(proxy.observeResponse()).toEqual({ state: 'unobserved' });
  await proxy.fetch(new Request(endpoint + '/v2/pressure/full/blobs/uploads/', { method: 'POST' }));
  expect(proxy.observeResponse()).toEqual({ state: 'unobserved' });
  expect(() => proxy.verify()).toThrow();
});

for (const [name, status, text, bytes, hasEnospcText, hasErrno28Pattern, accepted] of [
  ['structured filesystem ENOSPC', 500, responseBody, 237, false, true, true],
  ['text ENOSPC', 500, 'no space left on device', 23, true, false, false],
  ['numeric Err28', 500, '{"Err":28}', 10, false, true, false],
  ['foreign HTTP status', 503, 'no space left on device', 23, true, false, false],
  ['private access failure', 500, 'PRIVATE: {"Err":13}', 19, false, false, false],
  ['string errno', 500, '{"Err":"28"}', 12, false, false, false],
  ['longer errno', 500, '{"Err":280}', 11, false, false, false],
] as const) {
  test('upload response observation records bounded facts for ' + name, async () => {
    const proxy = await create(undefined, () => Promise.resolve(new Response(text, { status })));
    if (accepted) await proxy.fetch(request());
    else expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow();
    const observed = proxy.observeResponse();
    expect(observed).toEqual({
      state: 'observed',
      status,
      bytes,
      hasEnospcText,
      hasErrno28Pattern,
    });
    expect(JSON.stringify(observed)).not.toContain('PRIVATE');
    if (accepted) expect(proxy.verify().enospc).toBe(true);
    else expect(() => proxy.verify()).toThrow();
  });
}

test('upload response observation is absent when the bounded body read fails', async () => {
  const proxy = await create(undefined, () =>
    Promise.resolve(new Response('x'.repeat(4097), { status: 500 })),
  );
  expect((await requireRejection(proxy.fetch(request()))).throwCause).toThrow('exceeds 4096 bytes');
  expect(proxy.observeResponse()).toEqual({ state: 'unobserved' });
  expect(() => proxy.verify()).toThrow();
});
