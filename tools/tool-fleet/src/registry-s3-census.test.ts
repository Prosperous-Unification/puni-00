import { describe, expect, test } from 'bun:test';

import { createRegistryS3Store } from './registry-s3-census';
import {
  createWire,
  encodedPrefix,
  marker,
  part,
  parts,
  scope,
  upload,
  uploads,
  version,
  versioning,
  versions,
} from './registry-s3-census.fixture';

describe('bounded SDK S3 backup census', () => {
  test('counts all historical versions, markers and multipart pages with configured signing scope', async () => {
    const wire = createWire([
      versioning,
      versions(
        version('a', 'opaque-z') + marker,
        `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}b</NextKeyMarker><NextVersionIdMarker>marker</NextVersionIdMarker>`,
      ),
      versions(
        version('b', 'opaque-a', 'false', '<Size>11</Size>'),
        `<KeyMarker>${encodedPrefix}b</KeyMarker><VersionIdMarker>marker</VersionIdMarker><IsTruncated>false</IsTruncated>`,
      ),
      uploads(upload()),
      parts(
        part(1, 13),
        '<IsTruncated>true</IsTruncated><NextPartNumberMarker>1</NextPartNumberMarker>',
      ),
      parts(part(3, 17), '<PartNumberMarker>1</PartNumberMarker><IsTruncated>false</IsTruncated>'),
    ]);
    const census = await createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census();
    expect(census).toEqual({
      versions: [
        {
          kind: 'object',
          key: 'backups/registry/a',
          versionId: 'opaque-z',
          visible: true,
          bytes: 7,
        },
        { kind: 'delete-marker', key: 'backups/registry/b', versionId: 'marker', visible: true },
        {
          kind: 'object',
          key: 'backups/registry/b',
          versionId: 'opaque-a',
          visible: false,
          bytes: 11,
        },
      ],
      uploads: [
        {
          key: 'backups/registry/c',
          uploadId: 'upload-z',
          parts: [
            { number: 1, bytes: 13 },
            { number: 3, bytes: 17 },
          ],
        },
      ],
      payloadBytes: 48,
      accounting: 'payload-only',
    });
    expect(wire.remaining()).toBe(0);
    for (const request of wire.requests) {
      expect(request.url.startsWith(`${scope.endpoint}/${scope.bucket}`)).toBe(true);
      expect(request.redirect).toBe('error');
      expect(request.headers.get('authorization')).toContain('Credential=fixture-access/');
      expect(request.headers.get('authorization')).toContain('/eu-test-1/s3/aws4_request');
      expect(new URL(request.url).searchParams.has('delimiter')).toBe(false);
    }
    expect(new URL(wire.requests[1].url).searchParams.get('max-keys')).toBe('1000');
    expect(new URL(wire.requests[4].url).searchParams.get('max-parts')).toBe('1000');
  });
  test('accepts protocol-defined empty collections after complete response validation', async () => {
    const wire = createWire([versioning, versions(), uploads()]);
    expect(
      await createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
    ).toEqual({ versions: [], uploads: [], payloadBytes: 0, accounting: 'payload-only' });
  });
});

const invalidPages: [string, string][] = [
  ['wrong root', versions().replaceAll('ListVersionsResult', 'Unexpected')],
  ['malformed XML', versions().replace('</ListVersionsResult>', '')],
  ['doctype', '<!DOCTYPE ListVersionsResult>' + versions()],
  ['wrong bucket', versions().replace('registry-backup', 'other-bucket')],
  ['wrong prefix', versions().replace(encodedPrefix, 'other%2F')],
  ['missing encoding', versions().replace('<EncodingType>url</EncodingType>', '')],
  ['missing truncation', versions().replace('<IsTruncated>false</IsTruncated>', '')],
  [
    'duplicate truncation',
    versions().replace(
      '<IsTruncated>false</IsTruncated>',
      '<IsTruncated>false</IsTruncated><IsTruncated>true</IsTruncated>',
    ),
  ],
  ['hidden common prefix', versions('<CommonPrefixes><Prefix>hidden/</Prefix></CommonPrefixes>')],
  ['missing version size', versions(version('a', 'v1', 'true', ''))],
  ['negative version size', versions(version('a', 'v1', 'true', '<Size>-1</Size>'))],
  ['unsafe version size', versions(version('a', 'v1', 'true', '<Size>9007199254740992</Size>'))],
  [
    'missing currentness',
    versions(version() + version('a', 'v2', 'false').replace('<IsLatest>false</IsLatest>', '')),
  ],
  ['missing identity', versions(version().replace('<VersionId>v1</VersionId>', ''))],
  [
    'duplicate identity',
    versions(version() + version('a', 'v2', 'false') + version('a', 'v2', 'false')),
  ],
  ['duplicate latest', versions(version() + version('a', 'v2'))],
  ['no latest', versions(version('a', 'v1', 'false'))],
  [
    'outside prefix',
    versions(version().replace(encodedPrefix + 'a', 'outside%2Fvery-long-foreign-key')),
  ],
  ['noncanonical key', versions(version('../a'))],
  ['invalid encoded key', versions(version('%ZZ'))],
  ['missing continuation', versions(version(), '<IsTruncated>true</IsTruncated>')],
  [
    'unexpected final continuation',
    versions(
      version(),
      `<IsTruncated>false</IsTruncated><NextKeyMarker>${encodedPrefix}a</NextKeyMarker><NextVersionIdMarker>v1</NextVersionIdMarker>`,
    ),
  ],
  [
    'response marker changed',
    versions(version(), '<KeyMarker>wrong</KeyMarker><IsTruncated>false</IsTruncated>'),
  ],
  [
    'payload total overflow',
    versions(version('a', 'v1', 'true', '<Size>9007199254740991</Size>') + version('b')),
  ],
];
for (const [name, page] of invalidPages) {
  test(`refuses ${name} without reporting a complete census`, async () => {
    const wire = createWire([versioning, page, uploads()]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
for (const status of ['', '<Status>Suspended</Status>']) {
  test(`requires observed enabled versioning (${status})`, async () => {
    const wire = createWire([
      `<VersioningConfiguration>${status}</VersioningConfiguration>`,
      versions(),
      uploads(),
    ]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
test('continues multipart uploads with opaque IDs and counts every upload', async () => {
  const wire = createWire([
    versioning,
    versions(),
    uploads(
      upload(),
      `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}c</NextKeyMarker><NextUploadIdMarker>upload-z</NextUploadIdMarker>`,
    ),
    uploads(
      upload('c', 'upload-a'),
      `<KeyMarker>${encodedPrefix}c</KeyMarker><UploadIdMarker>upload-z</UploadIdMarker><IsTruncated>false</IsTruncated>`,
    ),
    parts(part(1, 5)),
    parts(part(1, 9)).replace('upload-z', 'upload-a'),
  ]);
  const census = await createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  }).census();
  expect(census.payloadBytes).toBe(14);
  expect(census.uploads).toHaveLength(2);
  expect(new URL(wire.requests[3].url).searchParams.get('upload-id-marker')).toBe('upload-z');
});
for (const [name, page] of [
  ['upload missing identity', uploads(upload().replace('<UploadId>upload-z</UploadId>', ''))],
  ['upload duplicate identity', uploads(upload() + upload())],
  ['upload missing continuation', uploads(upload(), '<IsTruncated>true</IsTruncated>')],
  ['upload wrong scope', uploads().replace('registry-backup', 'foreign')],
] as const) {
  test(`refuses ${name}`, async () => {
    const wire = createWire([versioning, versions(), page]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
for (const [name, page] of [
  ['part wrong scope', parts().replace('backups/registry/c', 'foreign/c')],
  ['part missing size', parts('<Part><PartNumber>1</PartNumber></Part>')],
  ['part invalid number', parts(part(0, 3))],
  ['part duplicate number', parts(part(1, 3) + part(1, 3))],
  ['part missing continuation', parts(part(1, 3), '<IsTruncated>true</IsTruncated>')],
  [
    'part unobserved continuation',
    parts(
      part(1, 3),
      '<IsTruncated>true</IsTruncated><NextPartNumberMarker>2</NextPartNumberMarker>',
    ),
  ],
] as const) {
  test(`refuses ${name}`, async () => {
    const wire = createWire([versioning, versions(), uploads(upload()), page]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
test('reads and deletes only an exact version and verifies returned identity', async () => {
  const wire = createWire([
    versioning,
    new Response('encrypted', { headers: { 'x-amz-version-id': 'v +/', 'content-length': '9' } }),
    versioning,
    new Response(null, { status: 204, headers: { 'x-amz-version-id': 'v +/' } }),
  ]);
  const store = createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  });
  expect(
    new TextDecoder().decode(await store.readVersion('backups/registry/locks/a', 'v +/')),
  ).toBe('encrypted');
  await store.deleteVersion('backups/registry/locks/a', 'v +/');
  expect(wire.requests.map((request) => request.method)).toEqual(['GET', 'GET', 'GET', 'DELETE']);
  for (const request of [wire.requests[1], wire.requests[3]]) {
    expect(new URL(request.url).searchParams.get('versionId')).toBe('v +/');
    expect(new URL(request.url).pathname).toBe('/registry-backup/backups/registry/locks/a');
  }
});
for (const [name, headers] of [
  ['missing version', { 'content-length': '9' }],
  ['different version', { 'content-length': '9', 'x-amz-version-id': 'other' }],
  ['missing length', { 'x-amz-version-id': 'v1' }],
  ['wrong length', { 'content-length': '1', 'x-amz-version-id': 'v1' }],
] as const) {
  test(`refuses version read with ${name}`, async () => {
    const wire = createWire([versioning, new Response('encrypted', { headers })]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).readVersion('backups/registry/a', 'v1'),
      { code: 'invalid-response' },
    );
  });
}
test('refuses a delete whose response omits exact version identity', async () => {
  const wire = createWire([versioning, new Response(null, { status: 204 })]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).deleteVersion('backups/registry/a', 'v1'),
    { code: 'invalid-response' },
  );
});

test('keeps same-key opaque historical IDs without sorting and accepts zero-byte objects/parts', async () => {
  const wire = createWire([
    versioning,
    versions(version('a', 'z') + version('a', 'a', 'false', '<Size>0</Size>')),
    uploads(upload()),
    parts(part(1, 0)),
  ]);
  const census = await createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  }).census();
  expect(census.versions.map((version) => version.versionId)).toEqual(['z', 'a']);
  expect(census.payloadBytes).toBe(7);
});
test('refuses a stalled parts continuation without taking a third parts page', async () => {
  const wire = createWire([
    versioning,
    versions(),
    uploads(upload()),
    parts(
      part(1, 3),
      '<IsTruncated>true</IsTruncated><NextPartNumberMarker>1</NextPartNumberMarker>',
    ),
    parts(
      '',
      '<PartNumberMarker>1</PartNumberMarker><IsTruncated>true</IsTruncated><NextPartNumberMarker>1</NextPartNumberMarker>',
    ),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'invalid-response' },
  );
  expect(wire.requests).toHaveLength(5);
});
for (const [name, page] of [
  [
    'backwards key',
    versions(
      version('a', 'v2', 'false'),
      `<KeyMarker>${encodedPrefix}b</KeyMarker><VersionIdMarker>marker</VersionIdMarker><IsTruncated>false</IsTruncated>`,
    ),
  ],
  ['missing echoed markers', versions(version('b', 'v2', 'false'))],
  [
    'repeated version cursor',
    versions(
      version('b', 'marker', 'false'),
      `<KeyMarker>${encodedPrefix}b</KeyMarker><VersionIdMarker>marker</VersionIdMarker><IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}b</NextKeyMarker><NextVersionIdMarker>marker</NextVersionIdMarker>`,
    ),
  ],
] as const) {
  test(`refuses ${name} in a later version page`, async () => {
    const wire = createWire([
      versioning,
      versions(
        marker,
        `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}b</NextKeyMarker><NextVersionIdMarker>marker</NextVersionIdMarker>`,
      ),
      page,
      uploads(),
    ]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
for (const configuration of [
  { ...scope, endpoint: 'http://objects.example.invalid' },
  { ...scope, endpoint: 'https://secret:password@objects.example.invalid' },
  { ...scope, endpoint: 'https://objects.example.invalid/scope' },
  { ...scope, endpoint: 'https://objects.example.invalid?secret=value' },
  { ...scope, bucket: 'registry--zone--x-s3' },
  { ...scope, prefix: 'backups/../registry/' },
  { ...scope, prefix: 'backups/registry' },
  { ...scope, region: '' },
  { ...scope, credentials: { accessKeyId: '', secretAccessKey: 'secret' } },
  { ...scope, credentials: undefined },
  { ...scope, prefix: undefined },
] as const) {
  test('refuses malformed trusted configuration before any HTTP request', () => {
    try {
      createRegistryS3Store({ ...configuration, signal: new AbortController().signal } as never);
      throw new Error('unexpected success');
    } catch (cause) {
      expect(cause).toMatchObject({ code: 'configuration' });
    }
  });
}
for (const [name, response, code] of [
  ['absent', new Response(null, { status: 404 }), 'not-found'],
  ['unreadable', new Response('AccessDenied fixture-secret', { status: 403 }), 'unavailable'],
  [
    'redirect',
    new Response(null, {
      status: 301,
      headers: { location: 'https://foreign.invalid', 'x-amz-bucket-region': 'another-region' },
    }),
    'unavailable',
  ],
  [
    'malformed length',
    new Response(versioning, { headers: { 'content-length': '88junk' } }),
    'invalid-response',
  ],
  [
    'mismatched length',
    new Response(versioning, { headers: { 'content-length': '1' } }),
    'invalid-response',
  ],
] as const) {
  test(`refuses ${name} response without leaking secrets or retrying`, async () => {
    const wire = createWire([response]);
    try {
      await createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census();
      throw new Error('unexpected success');
    } catch (cause) {
      expect(cause).toMatchObject({ code });
      expect(String(cause)).not.toContain('fixture-secret');
      expect((cause as Error).cause).toBeUndefined();
    }
    expect(wire.requests).toHaveLength(1);
  });
}
test('sanitizes an SDK transport failure without retries', async () => {
  const wire = createWire([
    () => Promise.reject(new Error('fixture-secret signed Authorization=sensitive')),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'unavailable', message: 'Registry S3 operation refused: unavailable' },
  );
  expect(wire.requests).toHaveLength(1);
});
test('cancels and awaits oversized response cleanup before refusing', async () => {
  let release: () => void = () => {
    throw new Error('no cancellation');
  };
  let cancelled = false;
  let settled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 ** 2 + 1));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    }),
  );
  const wire = createWire([response]);
  const operation = createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  })
    .census()
    .then(
      () => {
        settled = true;
        throw new Error('unexpected success');
      },
      (cause: unknown) => {
        settled = true;
        throw cause;
      },
    );
  await Bun.sleep(25);
  expect(cancelled).toBe(true);
  expect(settled).toBe(false);
  release();
  await expectFailure(operation, { code: 'limit' });
});
test('aborts a waiting body and awaits cancellation cleanup', async () => {
  let release: () => void = () => {
    throw new Error('no cancellation');
  };
  let cancelled = false;
  let settled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    }),
  );
  const controller = new AbortController();
  const wire = createWire([response]);
  const operation = createRegistryS3Store({
    ...scope,
    signal: controller.signal,
    fetch: wire.fetch,
  })
    .census()
    .finally(() => {
      settled = true;
    });
  await Bun.sleep(20);
  controller.abort();
  await Bun.sleep(20);
  expect(cancelled).toBe(true);
  expect(settled).toBe(false);
  release();
  await expectFailure(operation, { code: 'cancelled' });
});
test('already-aborted invocation sends no HTTP request', async () => {
  const controller = new AbortController();
  controller.abort();
  const wire = createWire([]);
  await expectFailure(
    createRegistryS3Store({ ...scope, signal: controller.signal, fetch: wire.fetch }).census(),
    { code: 'cancelled' },
  );
  expect(wire.requests).toHaveLength(0);
});
test('a failed cancellation cannot report successful completion', async () => {
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 ** 2 + 1));
      },
      cancel() {
        throw new Error('secret cancellation failure');
      },
    }),
  );
  const wire = createWire([response]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { errors: [{ code: 'limit' }, { code: 'unavailable' }] },
  );
});
test('refuses missing successful required response body', async () => {
  const wire = createWire([new Response(null)]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'invalid-response' },
  );
});

async function expectFailure(operation: Promise<unknown>, expected: object): Promise<void> {
  let failure: unknown;
  try {
    await operation;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toMatchObject(expected);
}

for (const scalar of ['<Size/>', '<Size> </Size>', '<Size>0.1</Size>', '<Size>1e2</Size>']) {
  test(`rejects ambiguous lexical version size ${scalar}`, async () => {
    const wire = createWire([versioning, versions(version('a', 'v1', 'true', scalar)), uploads()]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
for (const [name, page] of [
  ['empty latest', versions(version().replace('<IsLatest>true</IsLatest>', '<IsLatest/>'))],
  ['empty truncated', versions().replace('<IsTruncated>false</IsTruncated>', '<IsTruncated/>')],
  [
    'whitespace truncated',
    versions().replace('<IsTruncated>false</IsTruncated>', '<IsTruncated> </IsTruncated>'),
  ],
  [
    'noncanonical boolean',
    versions().replace('<IsTruncated>false</IsTruncated>', '<IsTruncated>0</IsTruncated>'),
  ],
] as const) {
  test(`rejects lexical ${name} before SDK normalization`, async () => {
    const wire = createWire([versioning, page, uploads()]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
for (const scalar of [
  '<PartNumber/>',
  '<PartNumber> </PartNumber>',
  '<PartNumber>1e0</PartNumber>',
]) {
  test(`rejects lexical part number ${scalar}`, async () => {
    const wire = createWire([
      versioning,
      versions(),
      uploads(upload()),
      parts(`<Part>${scalar}<Size>0</Size></Part>`),
    ]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}
test('rejects lexical empty part size before SDK coercion', async () => {
  const wire = createWire([
    versioning,
    versions(),
    uploads(upload()),
    parts('<Part><PartNumber>1</PartNumber><Size/></Part>'),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'invalid-response' },
  );
});
test('cancels an oversized header response without reading its body', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { 'x-large': 'a'.repeat(65537) } },
  );
  const wire = createWire([response]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'limit' },
  );
  expect(cancelled).toBe(true);
});
test('bounds records even across individually valid thousand-entry pages', async () => {
  let pageNumber = 0;
  let calls = 0;
  const fetch = (request: Request): Promise<Response> => {
    calls++;
    const query = new URL(request.url).searchParams;
    if (query.has('versioning')) return Promise.resolve(new Response(versioning));
    const pageStart = pageNumber * 1000;
    const children = Array.from({ length: 1000 }, (_, offset) =>
      version(`k${String(pageStart + offset).padStart(6, '0')}`),
    ).join('');
    const previous =
      pageNumber === 0
        ? ''
        : `<KeyMarker>${encodedPrefix}k${String(pageStart - 1).padStart(6, '0')}</KeyMarker><VersionIdMarker>v1</VersionIdMarker>`;
    pageNumber++;
    return Promise.resolve(
      new Response(
        versions(
          children,
          `${previous}<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}k${String(pageStart + 999).padStart(6, '0')}</NextKeyMarker><NextVersionIdMarker>v1</NextVersionIdMarker>`,
        ),
      ),
    );
  };
  await expectFailure(
    createRegistryS3Store({ ...scope, signal: new AbortController().signal, fetch }).census(),
    { code: 'limit' },
  );
  expect(calls).toBe(67);
}, 15000);
test('bounds total requests even when each page makes fresh progress', async () => {
  let calls = 0;
  let prior: string | undefined;
  const fetch = (request: Request): Promise<Response> => {
    calls++;
    if (calls > 4096) throw new Error('Wire refuses an unadmitted extra request');
    if (new URL(request.url).searchParams.has('versioning'))
      return Promise.resolve(new Response(versioning));
    const key = `k${String(calls).padStart(6, '0')}`;
    const previous =
      prior === undefined
        ? ''
        : `<KeyMarker>${encodedPrefix}${prior}</KeyMarker><VersionIdMarker>v1</VersionIdMarker>`;
    prior = key;
    return Promise.resolve(
      new Response(
        versions(
          version(key),
          `${previous}<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${key}</NextKeyMarker><NextVersionIdMarker>v1</NextVersionIdMarker>`,
        ),
      ),
    );
  };
  await expectFailure(
    createRegistryS3Store({ ...scope, signal: new AbortController().signal, fetch }).census(),
    { code: 'limit' },
  );
  expect(calls).toBe(4096);
}, 15000);
test('bounds cumulative XML and census output independently of entry count', async () => {
  let calls = 0;
  let prior: string | undefined;
  const fetch = (request: Request): Promise<Response> => {
    calls++;
    if (new URL(request.url).searchParams.has('versioning'))
      return Promise.resolve(new Response(versioning));
    const stem = `k${String(calls).padStart(6, '0')}`;
    const children = Array.from({ length: 1000 }, (_, index) =>
      version(`${stem}-${String(index).padStart(4, '0')}-${'a'.repeat(800)}`),
    ).join('');
    const previous =
      prior === undefined
        ? ''
        : `<KeyMarker>${encodedPrefix}${prior}</KeyMarker><VersionIdMarker>v1</VersionIdMarker>`;
    prior = `${stem}-0999-${'a'.repeat(800)}`;
    return Promise.resolve(
      new Response(
        versions(
          children,
          `${previous}<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${prior}</NextKeyMarker><NextVersionIdMarker>v1</NextVersionIdMarker>`,
        ),
      ),
    );
  };
  await expectFailure(
    createRegistryS3Store({ ...scope, signal: new AbortController().signal, fetch }).census(),
    { code: 'limit' },
  );
  expect(calls).toBeLessThan(50);
}, 15000);
test('request deadline aborts a stalled body and waits for its cleanup', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const wire = createWire([response]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'limit' },
  );
  expect(cancelled).toBe(true);
}, 6500);

test('counts leading-zero and whitespace integer values without narrowing XML integer syntax', async () => {
  const wire = createWire([
    versioning,
    versions(version('a', 'v1', 'true', '<Size> 0007 </Size>')),
    uploads(upload()),
    parts('<Part><PartNumber> 0001 </PartNumber><Size> +0003 </Size></Part>'),
  ]);
  const census = await createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  }).census();
  expect(census.payloadBytes).toBe(10);
  expect(census.uploads[0].parts).toEqual([{ number: 1, bytes: 3 }]);
});
for (const page of [
  versions(version().replace('<Size>7</Size>', '').replace('<Version>', '<Version Size="7">')),
  versions()
    .replace('<Prefix>backups%2Fregistry%2F</Prefix>', '')
    .replace('<ListVersionsResult>', '<ListVersionsResult Prefix="backups%2Fregistry%2F">'),
]) {
  test('refuses XML attributes that SDK could reinterpret as required response elements', async () => {
    const wire = createWire([versioning, page, uploads()]);
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
  });
}

test('whole-method deadline refuses otherwise progressing pages below each request deadline', async () => {
  let calls = 0;
  let prior: string | undefined;
  let aborted = false;
  const fetch = async (request: Request) => {
    calls++;
    if (new URL(request.url).searchParams.has('versioning')) return new Response(versioning);
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        aborted = true;
        clearTimeout(timer);
        reject(new Error('fixture transport aborted'));
      };
      const timer = setTimeout(() => {
        request.signal.removeEventListener('abort', cancel);
        resolve();
      }, 4200);
      request.signal.addEventListener('abort', cancel, { once: true });
    });
    const key = `k${String(calls).padStart(6, '0')}`;
    const previous =
      prior === undefined
        ? ''
        : `<KeyMarker>${encodedPrefix}${prior}</KeyMarker><VersionIdMarker>v1</VersionIdMarker>`;
    prior = key;
    return new Response(
      versions(
        version(key),
        `${previous}<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${key}</NextKeyMarker><NextVersionIdMarker>v1</NextVersionIdMarker>`,
      ),
    );
  };
  await expectFailure(
    createRegistryS3Store({ ...scope, signal: new AbortController().signal, fetch }).census(),
    { code: 'limit' },
  );
  expect(aborted).toBe(true);
  expect(calls).toBeGreaterThan(14);
  expect(calls).toBeLessThan(17);
}, 65000);

test('accepts an observed upload with no parts while retaining its identity', async () => {
  const wire = createWire([versioning, versions(), uploads(upload()), parts()]);
  expect(
    await createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
  ).toEqual({
    versions: [],
    uploads: [{ key: 'backups/registry/c', uploadId: 'upload-z', parts: [] }],
    payloadBytes: 0,
    accounting: 'payload-only',
  });
});

test('disappearance of a listed multipart upload refuses the whole census', async () => {
  const wire = createWire([
    versioning,
    versions(version()),
    uploads(upload()),
    new Response(null, { status: 404 }),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'not-found' },
  );
});
test('snapshots endpoint, credentials and fixed scope before a caller can mutate configuration', async () => {
  const wire = createWire([versioning, versions(), uploads()]);
  const configuration = {
    ...scope,
    credentials: { ...scope.credentials },
    signal: new AbortController().signal,
    fetch: wire.fetch,
  };
  const store = createRegistryS3Store(configuration);
  configuration.endpoint = 'https://foreign.invalid';
  configuration.bucket = 'foreign';
  configuration.prefix = 'foreign/';
  configuration.region = 'foreign';
  configuration.credentials.accessKeyId = 'foreign';
  configuration.credentials.secretAccessKey = 'foreign';
  expect((await store.census()).payloadBytes).toBe(0);
  expect(wire.requests[0].url.startsWith(scope.endpoint)).toBe(true);
  expect(wire.requests[0].headers.get('authorization')).toContain('Credential=fixture-access/');
});

test('decodes percent, plus and Unicode keys and continuation exactly once before exact-version access', async () => {
  const key = 'backups/registry/a%2F+b-ї';
  const encoded = 'a%252F%2Bb-%D1%97';
  const id = 'v+/%2F';
  const wire = createWire([
    versioning,
    versions(
      version(encoded, id),
      `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${encoded}</NextKeyMarker><NextVersionIdMarker>${id}</NextVersionIdMarker>`,
    ),
    versions(
      version(encoded, 'older', 'false'),
      `<KeyMarker>${encodedPrefix}${encoded}</KeyMarker><VersionIdMarker>${id}</VersionIdMarker><IsTruncated>false</IsTruncated>`,
    ),
    uploads(),
    versioning,
    new Response('encrypted', { headers: { 'content-length': '9', 'x-amz-version-id': id } }),
    versioning,
    new Response(null, { status: 204, headers: { 'x-amz-version-id': id } }),
  ]);
  const store = createRegistryS3Store({
    ...scope,
    signal: new AbortController().signal,
    fetch: wire.fetch,
  });
  const census = await store.census();
  expect(census.versions.map((version) => version.key)).toEqual([key, key]);
  expect(new URL(wire.requests[2].url).searchParams.get('key-marker')).toBe(key);
  expect(new URL(wire.requests[2].url).searchParams.get('version-id-marker')).toBe(id);
  await store.readVersion(key, id);
  await store.deleteVersion(key, id);
  for (const request of [wire.requests[5], wire.requests[7]]) {
    const address = new URL(request.url);
    expect(decodeURIComponent(address.pathname)).toBe('/registry-backup/' + key);
    expect(address.pathname).toContain('a%252F%2Bb-%D1%97');
    expect(address.searchParams.get('versionId')).toBe(id);
  }
});

test('refuses a partial version response even when its declared length matches the partial body', async () => {
  const wire = createWire([
    versioning,
    new Response('enc', {
      status: 206,
      headers: { 'content-length': '3', 'content-range': 'bytes 0-2/9', 'x-amz-version-id': 'v1' },
    }),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).readVersion('backups/registry/a', 'v1'),
    { code: 'invalid-response' },
  );
});

for (const [mode, codes] of [
  ['constructor', ['unavailable']],
  ['destroy', ['unavailable']],
  ['both', ['invalid-response', 'unavailable']],
  ['ambient', []],
] as const) {
  test(`owns timer and preserves sanitized SDK ${mode} failures`, async () => {
    const fixture = new URL('./registry-s3-lifecycle.fixture.ts', import.meta.url);
    const child = Bun.spawn([process.execPath, fixture.pathname, mode], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const completion = child.exited;
    const timeout = new AbortController();
    const deadline = setTimeout(() => {
      timeout.abort();
      child.kill();
    }, 1500);
    try {
      const [status, stdout, stderr] = await Promise.all([
        completion,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(timeout.signal.aborted).toBe(false);
      expect(status).toBe(0);
      expect(stderr).toBe('');
      const report: unknown = JSON.parse(stdout);
      expect(report).toMatchObject({ codes });
      expect(stdout).not.toContain('fixture-secret');
      if (mode === 'both') expect(report).toMatchObject({ primary: 'invalid-response' });
      if (mode === 'ambient')
        expect(report).toMatchObject({ payloadBytes: 0, ambientAgent: false });
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null) child.kill();
      await completion;
    }
  }, 2500);
}

test('keeps cancellation and failed reader cleanup as separate sanitized failures', async () => {
  const controller = new AbortController();
  const wire = createWire([
    new Response(
      new ReadableStream({
        cancel() {
          throw new Error('fixture-secret cleanup');
        },
      }),
    ),
  ]);
  const operation = createRegistryS3Store({
    ...scope,
    signal: controller.signal,
    fetch: wire.fetch,
  }).census();
  await Bun.sleep(20);
  controller.abort();
  await expectFailure(operation, {
    errors: [{ code: 'cancelled' }, { code: 'unavailable' }],
    cause: { code: 'cancelled' },
  });
});
test('keeps an oversized header refusal and failed cancellation together', async () => {
  const wire = createWire([
    new Response(
      new ReadableStream({
        cancel() {
          throw new Error('fixture-secret header cleanup');
        },
      }),
      { headers: { 'x-large': 'a'.repeat(65537) } },
    ),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { errors: [{ code: 'limit' }, { code: 'unavailable' }], cause: { code: 'limit' } },
  );
});
test('cancels a response even when cumulative header charging fails before its per-header check', async () => {
  let cancelled = false;
  const wire = createWire([
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { 'x-large': 'a'.repeat(64 * 1024 ** 2 + 1) } },
    ),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'limit' },
  );
  expect(cancelled).toBe(true);
});
test('refuses a multipart response containing more than a thousand parts', async () => {
  const wire = createWire([
    versioning,
    versions(),
    uploads(upload()),
    parts(Array.from({ length: 1001 }, (_, index) => part(index + 1, 1)).join('')),
  ]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'invalid-response' },
  );
});
test('refuses a combined version and marker page larger than its thousand-entry request', async () => {
  const children = Array.from({ length: 1000 }, (_, index) =>
    version(`a${String(index).padStart(4, '0')}`),
  ).join('');
  const wire = createWire([versioning, versions(children + marker), uploads()]);
  await expectFailure(
    createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census(),
    { code: 'invalid-response' },
  );
});

for (const [name, key, id, following] of [
  [
    'first-unreturned greater key',
    'b',
    'first-b',
    version('b', 'first-b', 'true', '<Size>11</Size>'),
  ],
  [
    'same-key opaque unreturned ID',
    'a',
    'opaque-a-unreturned',
    version('a', 'older', 'false', '<Size>11</Size>'),
  ],
  ['formerly rejected unobserved continuation', 'a', 'unknown', ''],
] as const) {
  test(`accepts documented versions ${name}`, async () => {
    const wire = createWire([
      versioning,
      versions(
        version('a', 'returned-z'),
        `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${key}</NextKeyMarker><NextVersionIdMarker>${id}</NextVersionIdMarker>`,
      ),
      versions(
        following,
        `<KeyMarker>${encodedPrefix}${key}</KeyMarker><VersionIdMarker>${id}</VersionIdMarker><IsTruncated>false</IsTruncated>`,
      ),
      uploads(),
    ]);
    const census = await createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census();
    expect(census.payloadBytes).toBe(following === '' ? 7 : 18);
    expect(new URL(wire.requests[2].url).searchParams.get('key-marker')).toBe(
      'backups/registry/' + key,
    );
    expect(new URL(wire.requests[2].url).searchParams.get('version-id-marker')).toBe(id);
    expect(wire.remaining()).toBe(0);
  });
}
for (const [name, key, id] of [
  ['first-unreturned greater key', 'd', 'opaque-cursor-z'],
  ['same-key opaque unreturned ID', 'c', 'opaque-cursor-a'],
] as const) {
  test(`accepts multipart ${name} without requiring returned-page membership`, async () => {
    const wire = createWire([
      versioning,
      versions(),
      uploads(
        upload(),
        `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}${key}</NextKeyMarker><NextUploadIdMarker>${id}</NextUploadIdMarker>`,
      ),
      uploads(
        upload(key, 'upload-a'),
        `<KeyMarker>${encodedPrefix}${key}</KeyMarker><UploadIdMarker>${id}</UploadIdMarker><IsTruncated>false</IsTruncated>`,
      ),
      parts(part(1, 5)),
      parts(part(1, 9))
        .replace('backups/registry/c', 'backups/registry/' + key)
        .replace('upload-z', 'upload-a'),
    ]);
    const census = await createRegistryS3Store({
      ...scope,
      signal: new AbortController().signal,
      fetch: wire.fetch,
    }).census();
    expect(census.payloadBytes).toBe(14);
    expect(census.uploads).toHaveLength(2);
    expect(new URL(wire.requests[3].url).searchParams.get('key-marker')).toBe(
      'backups/registry/' + key,
    );
    expect(new URL(wire.requests[3].url).searchParams.get('upload-id-marker')).toBe(id);
    expect(wire.remaining()).toBe(0);
  });
}
for (const kind of ['versions', 'uploads'] as const) {
  test(`refuses ${kind} backward cursor on an empty truncated page before another request`, async () => {
    const versionList = kind === 'versions';
    const wrap = versionList ? versions : uploads;
    const markerName = versionList ? 'VersionIdMarker' : 'UploadIdMarker';
    const initial = versionList ? version('b') : upload('b');
    const pages = [
      wrap(
        initial,
        `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}b</NextKeyMarker><Next${markerName}>cursor-z</Next${markerName}>`,
      ),
      wrap(
        '',
        `<KeyMarker>${encodedPrefix}b</KeyMarker><${markerName}>cursor-z</${markerName}><IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}a</NextKeyMarker><Next${markerName}>cursor-a</Next${markerName}>`,
      ),
      wrap(
        '',
        `<KeyMarker>${encodedPrefix}a</KeyMarker><${markerName}>cursor-a</${markerName}><IsTruncated>false</IsTruncated>`,
      ),
    ];
    const wire = createWire(
      versionList
        ? [versioning, ...pages, uploads()]
        : [
            versioning,
            versions(),
            ...pages,
            parts().replace('backups/registry/c', 'backups/registry/b'),
          ],
    );
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
    expect(wire.requests).toHaveLength(versionList ? 3 : 4);
  });
  test(`refuses ${kind} opaque cursor cycles without relying on duplicate entries`, async () => {
    const versionList = kind === 'versions';
    const wrap = versionList ? versions : uploads;
    const markerName = versionList ? 'VersionIdMarker' : 'UploadIdMarker';
    const first = versionList ? version('c', 'current') : upload();
    const second = versionList ? version('c', 'history', 'false') : upload('c', 'upload-a');
    const tail = (prior: string | undefined, next: string | undefined) =>
      `${prior === undefined ? '' : `<KeyMarker>${encodedPrefix}c</KeyMarker><${markerName}>${prior}</${markerName}>`}<IsTruncated>${next === undefined ? 'false' : 'true'}</IsTruncated>${next === undefined ? '' : `<NextKeyMarker>${encodedPrefix}c</NextKeyMarker><Next${markerName}>${next}</Next${markerName}>`}`;
    const pages = [
      wrap(first, tail(undefined, 'cursor-z')),
      wrap(second, tail('cursor-z', 'cursor-a')),
      wrap('', tail('cursor-a', 'cursor-z')),
      wrap('', tail('cursor-z', undefined)),
    ];
    const wire = createWire(
      versionList
        ? [versioning, ...pages, uploads()]
        : [versioning, versions(), ...pages, parts(), parts().replace('upload-z', 'upload-a')],
    );
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
    expect(wire.requests).toHaveLength(versionList ? 4 : 5);
  });
  for (const missing of ['key', 'id'] as const) {
    test(`refuses ${kind} continuation missing only its ${missing}`, async () => {
      const versionList = kind === 'versions';
      const wrap = versionList ? versions : uploads;
      const markerName = versionList ? 'VersionIdMarker' : 'UploadIdMarker';
      const tail = `<IsTruncated>true</IsTruncated>${missing === 'key' ? '' : `<NextKeyMarker>${encodedPrefix}c</NextKeyMarker>`}${missing === 'id' ? '' : `<Next${markerName}>cursor</Next${markerName}>`}`;
      const wire = createWire(
        versionList
          ? [versioning, wrap(version('c'), tail), uploads()]
          : [versioning, versions(), wrap(upload(), tail)],
      );
      await expectFailure(
        createRegistryS3Store({
          ...scope,
          signal: new AbortController().signal,
          fetch: wire.fetch,
        }).census(),
        { code: 'invalid-response' },
      );
      expect(wire.requests).toHaveLength(versionList ? 2 : 3);
    });
  }
}

for (const kind of ['versions', 'uploads'] as const) {
  test(`refuses ${kind} continuation behind the current page's greatest key before followup`, async () => {
    const versionList = kind === 'versions';
    const wrap = versionList ? versions : uploads;
    const markerName = versionList ? 'VersionIdMarker' : 'UploadIdMarker';
    const pages = [
      wrap(
        versionList ? version('c') : upload(),
        `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}b</NextKeyMarker><Next${markerName}>unreturned-id</Next${markerName}>`,
      ),
      wrap(
        '',
        `<KeyMarker>${encodedPrefix}b</KeyMarker><${markerName}>unreturned-id</${markerName}><IsTruncated>false</IsTruncated>`,
      ),
    ];
    const wire = createWire(
      versionList ? [versioning, ...pages, uploads()] : [versioning, versions(), ...pages, parts()],
    );
    await expectFailure(
      createRegistryS3Store({
        ...scope,
        signal: new AbortController().signal,
        fetch: wire.fetch,
      }).census(),
      { code: 'invalid-response' },
    );
    expect(wire.requests).toHaveLength(versionList ? 2 : 3);
  });
  for (const changed of ['key', 'id'] as const) {
    test(`refuses ${kind} changed echoed ${changed} after an unreturned opaque cursor`, async () => {
      const versionList = kind === 'versions';
      const wrap = versionList ? versions : uploads;
      const markerName = versionList ? 'VersionIdMarker' : 'UploadIdMarker';
      const pages = [
        wrap(
          versionList ? version('c') : upload(),
          `<IsTruncated>true</IsTruncated><NextKeyMarker>${encodedPrefix}c</NextKeyMarker><Next${markerName}>unreturned-id</Next${markerName}>`,
        ),
        wrap(
          '',
          `<KeyMarker>${encodedPrefix}${changed === 'key' ? 'd' : 'c'}</KeyMarker><${markerName}>${changed === 'id' ? 'changed-id' : 'unreturned-id'}</${markerName}><IsTruncated>false</IsTruncated>`,
        ),
      ];
      const wire = createWire(
        versionList
          ? [versioning, ...pages, uploads()]
          : [versioning, versions(), ...pages, parts()],
      );
      await expectFailure(
        createRegistryS3Store({
          ...scope,
          signal: new AbortController().signal,
          fetch: wire.fetch,
        }).census(),
        { code: 'invalid-response' },
      );
      expect(wire.requests).toHaveLength(versionList ? 3 : 4);
    });
  }
}
