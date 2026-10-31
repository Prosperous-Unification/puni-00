import { rejects, throws } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  requireSourceFrontendProducerSuccess,
  withSourceFrontendProducer,
} from '../fixtures/source-frontend-producer';
import { SOURCE_FRONTEND_PRODUCER_PROGRAM } from '../fixtures/source-frontend-producer-program';
import { readFields } from './managed-cohort';

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

test('actual failed Node producer preserves bounded child diagnostics in its refusal', () => {
  const node = Bun.which('node');
  if (node === null) throw new Error('Node diagnostic fixture runtime absent');
  const stdout = Buffer.from('diagnostic stdout ::error::\u001b[31m\n');
  const stderr = Buffer.from('diagnostic stderr\n');
  const started = performance.now();
  const child = Bun.spawnSync(
    [
      node,
      '-e',
      `process.stdout.write(${JSON.stringify(stdout.toString())}); process.stderr.write(${JSON.stringify(stderr.toString())}); process.exitCode = 23;`,
    ],
    {
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    },
  );
  const execution = { node, elapsedMs: performance.now() - started, timeoutMs: 5000 };
  expect(child.exitCode).toBe(23);
  expect(child.stdout).toEqual(stdout);
  expect(child.stderr).toEqual(stderr);
  throws(
    () => {
      requireSourceFrontendProducerSuccess(child, execution);
    },
    (failure: unknown) => {
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) return false;
      const prefix =
        'actual frontend producer failed or custody unproved\nsource-frontend-producer-child ';
      expect(failure.message.startsWith(prefix)).toBe(true);
      const diagnostic: unknown = JSON.parse(failure.message.slice(prefix.length));
      expect(diagnostic).toEqual({
        success: false,
        exitCode: 23,
        signal: null,
        ...execution,
        stdout: {
          bytes: stdout.byteLength,
          sha256: createHash('sha256').update(stdout).digest('hex'),
          truncated: false,
          base64: stdout.toString('base64'),
        },
        stderr: {
          bytes: stderr.byteLength,
          sha256: createHash('sha256').update(stderr).digest('hex'),
          truncated: false,
          base64: stderr.toString('base64'),
        },
      });
      return true;
    },
  );
});

test('producer refusal diagnostics bound oversized non-UTF8 bytes and model signal metadata', () => {
  const stdout = Buffer.alloc(40 * 1024, 0xff);
  stdout.set(Buffer.from('head'), 0);
  stdout.set(Buffer.from('tail'), stdout.byteLength - 4);
  const child = {
    success: true,
    exitCode: 0,
    signalCode: 'SIGTERM',
    stdout,
    stderr: Buffer.alloc(0),
  };
  throws(
    () => {
      requireSourceFrontendProducerSuccess(child, {
        node: '/modeled/node',
        elapsedMs: 90,
        timeoutMs: 90000,
      });
    },
    (failure: unknown) => {
      if (!(failure instanceof Error)) return false;
      const prefix =
        'actual frontend producer failed or custody unproved\nsource-frontend-producer-child ';
      expect(failure.message.startsWith(prefix)).toBe(true);
      expect(failure.message.split('\n')).toHaveLength(2);
      const diagnostic: unknown = JSON.parse(failure.message.slice(prefix.length));
      expect(diagnostic).toEqual({
        success: true,
        exitCode: 0,
        signal: 'SIGTERM',
        node: '/modeled/node',
        elapsedMs: 90,
        timeoutMs: 90000,
        stdout: {
          bytes: stdout.byteLength,
          sha256: createHash('sha256').update(stdout).digest('hex'),
          truncated: true,
          base64: Buffer.concat([
            stdout.subarray(0, 16 * 1024),
            stdout.subarray(-16 * 1024),
          ]).toString('base64'),
        },
        stderr: {
          bytes: 0,
          sha256: createHash('sha256').update(Buffer.alloc(0)).digest('hex'),
          truncated: false,
          base64: '',
        },
      });
      return true;
    },
  );
});

test('producer refusal diagnostics retain exactly 32KiB without truncation', () => {
  const stdout = Buffer.alloc(32 * 1024, 0x80);
  throws(
    () => {
      requireSourceFrontendProducerSuccess(
        { success: false, exitCode: 1, stdout, stderr: Buffer.alloc(0) },
        { node: '/modeled/node', elapsedMs: 1, timeoutMs: 90000 },
      );
    },
    (failure: unknown) => {
      if (!(failure instanceof Error)) return false;
      expect(failure.message).toContain(
        JSON.stringify({
          bytes: stdout.byteLength,
          sha256: createHash('sha256').update(stdout).digest('hex'),
          truncated: false,
          base64: stdout.toString('base64'),
        }),
      );
      return true;
    },
  );
});

/** Decodes only a validated encoded field from the test-owned child/parent JSON boundaries. */
function decodeProducerField(value: unknown): Buffer {
  const field = readFields(value);
  const base64 = field['base64'];
  if (typeof base64 !== 'string') throw new Error('producer diagnostic encoded field missing');
  return Buffer.from(base64, 'base64');
}

/** Executes the exact generated program against a clearly test-owned Vite module; this qualifies diagnostic ordering only. */
async function withStubFrontendProducer(
  mode: 'unsettled' | 'settled' | 'secondary-failure' | 'telemetry-unavailable' | 'bounded-primary',
  consume: (
    child: Bun.SyncSubprocess<'pipe', 'pipe'>,
    execution: { node: string; elapsedMs: number; timeoutMs: number },
    directory: string,
  ) => void | Promise<void>,
) {
  const selectedNode = Bun.which('node');
  if (selectedNode === null) throw new Error('Node cleanup stub runtime absent');
  const runtime = Bun.spawnSync(
    [selectedNode, '-p', 'JSON.stringify({node:process.execPath,version:process.version})'],
    {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: '/usr/bin:/bin' },
      timeout: 5000,
    },
  );
  expect(runtime.exitCode).toBe(0);
  expect(runtime.signalCode).toBeUndefined();
  const identity = readFields(JSON.parse(runtime.stdout.toString()));
  const node = identity['node'];
  if (typeof node !== 'string') throw new Error('Node cleanup stub executable missing');
  expect(identity['version']).toBe('v24.20.0');
  const directory = await mkdtemp(join(tmpdir(), 'puni-vite-cleanup-TEST-stub-'));
  let isSettled = false;
  try {
    const frontend = join(directory, 'snapshot/apps/wbs/fe-01');
    const vite = join(directory, 'snapshot/node_modules/vite');
    await mkdir(frontend, { recursive: true });
    await mkdir(join(vite, 'dist/node'), { recursive: true });
    await writeFile(join(vite, 'package.json'), '{"type":"module"}');
    const close =
      mode === 'unsettled'
        ? 'return new Promise(() => {});'
        : mode === 'secondary-failure'
          ? "throw new Error('TEST secondary close failure');"
          : `appendFileSync(events,${JSON.stringify('close-return\n')}); return Promise.resolve();`;
    const oversized = {
      name: 'TEST name\n::error::' + 'n'.repeat(1024),
      message: 'TEST message\n::error::\u001b[31m' + 'm'.repeat(40000),
      stack: 'TEST stack\n' + 's'.repeat(16000),
    };
    const createFailure =
      mode === 'bounded-primary'
        ? `const cause=new Error(${JSON.stringify(oversized.message)});cause.name=${JSON.stringify(oversized.name)};cause.stack=${JSON.stringify(oversized.stack)};throw cause;`
        : '';
    await writeFile(
      join(vite, 'dist/node/index.js'),
      `
import fs, { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const events=${JSON.stringify(join(directory, 'stub-close-events.log'))};
${mode === 'telemetry-unavailable' ? "const writeSync=fs.writeSync;fs.writeSync=(fd,bytes,...args)=>{if(fd===2&&typeof bytes==='string'&&bytes.startsWith('SOURCE_FRONTEND_PRE_CLEANUP: '))throw Error('TEST telemetry sink unavailable');return writeSync(fd,bytes,...args);};syncBuiltinESMExports();" : ''}
export const version='TEST Vite cleanup stub';
export async function createServer(options) {
 ${createFailure}
 const watcher={closed:false,async close(){appendFileSync(events,${JSON.stringify('watcher-close\n')});watcher.closed=true;},getWatched(){return {};}};
 return {config:{root:options.root,envDir:options.envDir,server:{host:'127.0.0.1',port:0,strictPort:true,hmr:true,open:false},env:{VITE_BE_URL:'http://127.0.0.1:9',VITE_GW_URL:'ws://127.0.0.1:9'}},httpServer:{listening:false},watcher,close(){appendFileSync(events,${JSON.stringify('close-start\n')});${close}}};
}
`,
    );
    await writeFile(join(directory, 'probe.mjs'), SOURCE_FRONTEND_PRODUCER_PROGRAM);
    const started = performance.now();
    const child = Bun.spawnSync([node, join(directory, 'probe.mjs'), directory], {
      cwd: frontend,
      env: {
        PATH: '/usr/bin:/bin',
        NODE_ENV: 'development',
        WBS_PUBLIC_DEV: 'true',
        DEBUG: 'vite:env',
        TZ: 'UTC',
        FORCE_COLOR: '0',
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    const execution = {
      node: node,
      elapsedMs: performance.now() - started,
      timeoutMs: 5000,
    };
    isSettled = child.signalCode === undefined && child.exitedDueToTimeout !== true;
    console.error(
      'TEST_STUB_VITE_CHILD: ' +
        JSON.stringify({
          mode,
          ...execution,
          exitCode: child.exitCode,
          signal: child.signalCode ?? null,
          stdoutBytes: child.stdout.length,
          stderrBytes: child.stderr.length,
          stderrSHA256: createHash('sha256').update(child.stderr).digest('hex'),
          stderrTruncated: child.stderr.byteLength > 32 * 1024,
          stderrBase64: child.stderr.subarray(0, 32 * 1024).toString('base64'),
        }),
    );
    await consume(child, execution, directory);
  } finally {
    if (isSettled) await rm(directory, { recursive: true });
    else
      console.error(
        'TEST stub packet retained without known normal child settlement: ' + directory,
      );
  }
}

test('generated producer exposes its primary before an actually unsettled close', async () => {
  await withStubFrontendProducer('unsettled', async (child, execution, directory) => {
    expect(child.exitCode).toBe(13);
    expect(child.signalCode).toBeUndefined();
    expect(child.stderr.toString()).toContain('Detected unsettled top-level await');
    expect(child.stderr.toString()).toContain('await server.close()');
    expect(child.stdout.byteLength).toBe(0);
    expect(await readFile(join(directory, 'stub-close-events.log'), 'utf8')).toBe('close-start\n');
    const lines = child.stderr
      .toString()
      .split('\n')
      .filter((line) => line.startsWith('SOURCE_FRONTEND_PRE_CLEANUP: '));
    expect(lines).toHaveLength(1);
    const line = lines.at(0);
    if (line === undefined) throw new Error('pre-cleanup diagnostic missing');
    const diagnostic = readFields(JSON.parse(line.slice('SOURCE_FRONTEND_PRE_CLEANUP: '.length)));
    const primary = readFields(diagnostic['primary']);
    expect(diagnostic['phase']).toBe('config-checks');
    expect(primary['kind']).toBe('present');
    expect(decodeProducerField(primary['name']).toString()).toBe('AssertionError');
    expect(decodeProducerField(primary['message']).toString()).toContain('true !== false');
    expect(diagnostic['requests']).toBe(0);
    expect(diagnostic['responses']).toBe(0);
    expect(diagnostic['cleanup']).toEqual({ closeStarted: true, closeReturned: false });
    throws(
      () => {
        requireSourceFrontendProducerSuccess(child, execution);
      },
      (cause: unknown) => {
        if (!(cause instanceof Error)) return false;
        const prefix =
          'actual frontend producer failed or custody unproved\nsource-frontend-producer-child ';
        expect(cause.message.startsWith(prefix)).toBe(true);
        const captured = readFields(JSON.parse(cause.message.slice(prefix.length)));
        expect(decodeProducerField(captured['stderr']).toString()).toContain(line);
        return true;
      },
    );
  });
});

for (const mode of ['settled', 'secondary-failure', 'telemetry-unavailable'] as const)
  test(`generated producer preserves primary and cleanup with ${mode}`, async () => {
    await withStubFrontendProducer(mode, async (child, execution, directory) => {
      expect(child.exitCode).toBe(1);
      expect(child.signalCode).toBeUndefined();
      expect(child.stderr.toString()).not.toContain('Detected unsettled top-level await');
      const observation = readFields(
        JSON.parse(await readFile(join(directory, 'observation.json'), 'utf8')),
      );
      const failure = readFields(observation['failure']);
      const cleanup = readFields(observation['cleanup']);
      expect(failure['name']).toBe('AssertionError');
      expect(failure['message']).toContain('true !== false');
      expect(cleanup['closeStarted']).toBe(true);
      expect(cleanup['explicitWatcherCloseReturned']).toBe(true);
      expect(cleanup['watcherClosed']).toBe(true);
      expect(observation['diagnostic']).toEqual({
        status: mode === 'telemetry-unavailable' ? 'unavailable' : 'written',
      });
      expect(await readFile(join(directory, 'stub-close-events.log'), 'utf8')).toBe(
        mode === 'secondary-failure'
          ? 'close-start\nwatcher-close\n'
          : 'close-start\nclose-return\nwatcher-close\n',
      );
      if (mode === 'secondary-failure') {
        expect(child.stderr.toString()).toContain(
          'AggregateError: producer refusal or cleanup unproved',
        );
        expect(child.stderr.toString().indexOf('AssertionError')).toBeLessThan(
          child.stderr.toString().indexOf('TEST secondary close failure'),
        );
        expect(cleanup['closeReturned']).toBeUndefined();
      } else {
        expect(cleanup['closeReturned']).toBe(true);
      }
      throws(() => {
        requireSourceFrontendProducerSuccess(child, execution);
      }, /actual frontend producer failed or custody unproved/);
    });
  });

test('generated producer bounds encoded primary fields before cleanup', async () => {
  await withStubFrontendProducer('bounded-primary', (child, execution) => {
    expect(child.exitCode).toBe(1);
    expect(child.signalCode).toBeUndefined();
    const line = child.stderr
      .toString()
      .split('\n')
      .find((entry) => entry.startsWith('SOURCE_FRONTEND_PRE_CLEANUP: '));
    if (line === undefined) throw new Error('bounded primary diagnostic missing');
    expect(Buffer.byteLength(line)).toBeLessThan(16 * 1024);
    expect(line).not.toContain('::error::');
    expect(line).not.toContain('\u001b');
    const diagnostic = readFields(JSON.parse(line.slice('SOURCE_FRONTEND_PRE_CLEANUP: '.length)));
    const primary = readFields(diagnostic['primary']);
    expect(diagnostic['phase']).toBe('create');
    expect(diagnostic['cleanup']).toEqual({ closeStarted: false, closeReturned: false });
    for (const [field, limit] of [
      ['name', 128],
      ['message', 2048],
      ['stack', 6144],
    ] as const) {
      const encoded = readFields(primary[field]);
      expect(encoded['truncated']).toBe(true);
      expect(encoded['bytes']).toBeGreaterThan(limit);
      expect(decodeProducerField(encoded).byteLength).toBe(limit);
    }
    throws(
      () => {
        requireSourceFrontendProducerSuccess(child, execution);
      },
      (cause: unknown) => {
        if (!(cause instanceof Error)) return false;
        const prefix =
          'actual frontend producer failed or custody unproved\nsource-frontend-producer-child ';
        expect(cause.message.startsWith(prefix)).toBe(true);
        const captured = readFields(JSON.parse(cause.message.slice(prefix.length)));
        expect(decodeProducerField(captured['stderr']).toString()).toContain(line);
        return true;
      },
    );
  });
});
