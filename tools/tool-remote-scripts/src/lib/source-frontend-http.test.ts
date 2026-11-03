import { rejects } from 'node:assert/strict';
import { cp, mkdir } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { withSourceFrontendProducer } from '../fixtures/source-frontend-producer';

test('actual pinned Vite producer reaches the complete frontend document and entry inspectors', async () => {
  await withSourceFrontendProducer(async (observations, directory) => {
    const evidence = process.env['SOURCE_FRONTEND_PRODUCER_EVIDENCE'];
    if (evidence !== undefined) {
      await mkdir(evidence, { recursive: true });
      await cp(directory, `${evidence}/capture`, { recursive: true, verbatimSymlinks: true });
    }
    console.error(
      'actual Vite producer: two observations captured; original Node child/pipes, requests, server and watcher joined',
    );
    const inspectors = await import('./source-frontend-http');
    expect(inspectors.inspectSourceFrontendDocument(observations.document).sha256).toBe(
      '09ab3b528f1a147d34addea248fa08925801d66ee9f384bb634112b9abc30e2f',
    );
    expect(inspectors.inspectSourceFrontendEntry(observations.entry).sha256).toBe(
      'e990c7ae6b545d4177b27560878bd41d34843b32109a21af190794d73e45ee08',
    );
  });
}, 130000);

const DOCUMENT_SHA256 = '09ab3b528f1a147d34addea248fa08925801d66ee9f384bb634112b9abc30e2f';
const ENTRY_SHA256 = 'e990c7ae6b545d4177b27560878bd41d34843b32109a21af190794d73e45ee08';

async function readModeledResponse(body: string, contentType: string, status = 200) {
  let requests = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++;
      return new Response(body, { status, headers: { 'content-type': contentType } });
    },
  });
  try {
    const port = server.port;
    if (port === undefined || [3100, 3200, 3300, 4200].includes(port))
      throw new Error('modeled frontend ephemeral port unsupported');
    const { readParticipantHttp } = await import('./dependency-participant-http');
    return await readParticipantHttp('127.0.0.1', port, '/', performance.now() + 5000);
  } finally {
    await server.stop(true);
    expect(requests).toBe(1);
  }
}

test('immutable captured frontend text preserves complete encoded identity', async () => {
  const { SOURCE_FRONTEND_DOCUMENT, SOURCE_FRONTEND_ENTRY } =
    await import('../fixtures/source-frontend-responses');
  const { inspectSourceFrontendDocument, inspectSourceFrontendEntry } =
    await import('./source-frontend-http');
  expect(Buffer.byteLength(SOURCE_FRONTEND_DOCUMENT)).toBe(2539);
  expect(Buffer.byteLength(SOURCE_FRONTEND_ENTRY)).toBe(1582);
  expect(
    inspectSourceFrontendDocument(
      await readModeledResponse(SOURCE_FRONTEND_DOCUMENT, 'text/html; charset=utf-8'),
    ).sha256,
  ).toBe(DOCUMENT_SHA256);
  expect(
    inspectSourceFrontendEntry(await readModeledResponse(SOURCE_FRONTEND_ENTRY, 'TEXT/JAVASCRIPT'))
      .sha256,
  ).toBe(ENTRY_SHA256);
});

test('complete document refuses injected script, root, target, prefix, suffix and fallback over actual HTTP', async () => {
  const { SOURCE_FRONTEND_DOCUMENT, SOURCE_FRONTEND_ENTRY } =
    await import('../fixtures/source-frontend-responses');
  const { inspectSourceFrontendDocument } = await import('./source-frontend-http');
  for (const body of [
    SOURCE_FRONTEND_DOCUMENT.replace(
      '</head>',
      '<script>throw new Error("PRIVATE_INJECTED_SCRIPT")</script></head>',
    ),
    SOURCE_FRONTEND_DOCUMENT.replace(
      '<div id="root"></div>',
      '<div id="root"></div><div id="root"></div>',
    ),
    SOURCE_FRONTEND_DOCUMENT.replace('/src/main.tsx', '/src/other.tsx'),
    'prefix' + SOURCE_FRONTEND_DOCUMENT,
    SOURCE_FRONTEND_DOCUMENT + 'suffix',
    SOURCE_FRONTEND_ENTRY,
    '<html><head><script type="module" src="/@vite/client"></script></head><body>PRIVATE_VITE_ERROR</body></html>',
  ]) {
    const observation = await readModeledResponse(body, 'text/html');
    expect(() => inspectSourceFrontendDocument(observation)).toThrow(
      'source frontend document unsupported',
    );
  }
});

test('complete entry refuses changed map, suffix and HTML over actual HTTP', async () => {
  const { SOURCE_FRONTEND_DOCUMENT, SOURCE_FRONTEND_ENTRY } =
    await import('../fixtures/source-frontend-responses');
  const { inspectSourceFrontendEntry } = await import('./source-frontend-http');
  const delimiter = '//# sourceMappingURL=data:application/json;base64,';
  const pieces = SOURCE_FRONTEND_ENTRY.split(delimiter);
  const code = pieces.at(0);
  const encoded = pieces.at(1);
  if (code === undefined || encoded === undefined) throw new Error('captured entry map absent');
  const map: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString());
  const { readFields } = await import('./managed-cohort');
  const changedMap = { ...readFields(map), sourcesContent: ['PRIVATE_CHANGED_SOURCE_CONTENT'] };
  for (const body of [
    code + delimiter + Buffer.from(JSON.stringify(changedMap)).toString('base64'),
    SOURCE_FRONTEND_ENTRY + '\n// suffix',
    'prefix' + SOURCE_FRONTEND_ENTRY,
    SOURCE_FRONTEND_DOCUMENT,
  ]) {
    const observation = await readModeledResponse(body, 'text/javascript');
    expect(() => inspectSourceFrontendEntry(observation)).toThrow(
      'source frontend entry unsupported',
    );
  }
});

test('frontend envelopes refuse unsupported role MIME and status with exact otherwise-valid text', async () => {
  const { SOURCE_FRONTEND_DOCUMENT, SOURCE_FRONTEND_ENTRY } =
    await import('../fixtures/source-frontend-responses');
  const { inspectSourceFrontendDocument, inspectSourceFrontendEntry } =
    await import('./source-frontend-http');
  for (const [body, contentType, inspect] of [
    [SOURCE_FRONTEND_DOCUMENT, 'text/javascript', inspectSourceFrontendDocument],
    [SOURCE_FRONTEND_ENTRY, 'text/html', inspectSourceFrontendEntry],
    [SOURCE_FRONTEND_ENTRY, 'application/javascript', inspectSourceFrontendEntry],
  ] as const) {
    const observation = await readModeledResponse(body, contentType);
    expect(() => inspect(observation)).toThrow('source frontend HTTP envelope unsupported');
  }
  expect(() =>
    inspectSourceFrontendDocument({
      status: 500,
      contentType: 'text/html',
      body: SOURCE_FRONTEND_DOCUMENT,
    }),
  ).toThrow('source frontend HTTP envelope unsupported');
  expect(() =>
    inspectSourceFrontendEntry({
      status: 503,
      contentType: 'text/javascript',
      body: SOURCE_FRONTEND_ENTRY,
    }),
  ).toThrow('source frontend HTTP envelope unsupported');
  await rejects(
    readModeledResponse('PRIVATE_PRODUCER_ERROR', 'text/html', 500),
    /participant HTTP/,
  );
});

test('frontend transported text follows the existing BOM-removing HTTP representation', async () => {
  const { SOURCE_FRONTEND_DOCUMENT } = await import('../fixtures/source-frontend-responses');
  const { inspectSourceFrontendDocument } = await import('./source-frontend-http');
  const transported = await readModeledResponse('\ufeff' + SOURCE_FRONTEND_DOCUMENT, 'text/html');
  expect(transported.body).toBe(SOURCE_FRONTEND_DOCUMENT);
  expect(inspectSourceFrontendDocument(transported).sha256).toBe(DOCUMENT_SHA256);
});

test('complete entry refuses changed executable retaining its exact original map over actual HTTP', async () => {
  const { SOURCE_FRONTEND_ENTRY } = await import('../fixtures/source-frontend-responses');
  const { inspectSourceFrontendEntry } = await import('./source-frontend-http');
  const body = SOURCE_FRONTEND_ENTRY.replace(
    'void bootstrapApplication(el);',
    'void bootstrapApplication(null);',
  );
  const observation = await readModeledResponse(body, 'text/javascript');
  expect(() => inspectSourceFrontendEntry(observation)).toThrow(
    'source frontend entry unsupported',
  );
});
