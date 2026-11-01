import { rejects, throws } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import type * as ProducerModule from '../fixtures/source-frontend-producer';
import {
  requireSourceFrontendProducerSuccess,
  withSourceFrontendProducer,
} from '../fixtures/source-frontend-producer';
import { SOURCE_FRONTEND_PRODUCER_PROGRAM } from '../fixtures/source-frontend-producer-program';
import { prepareSourceFrontendProfile } from '../fixtures/source-frontend-profile';
import { artifact, configuration, git, modes, roots } from '../fixtures/source-startup';
import { readFields } from './managed-cohort';
import { selectSourceFrontendProfile } from './source-frontend-profile';
import {
  createSourceStartupManifest,
  decodeSourceStartupManifest,
} from './source-startup-manifest';

const CAPTURED_INPUTS = {
  'apps/wbs/fe-01/index.html': {
    bytes: 2482,
    sha256: '12a941b6fbccfe6530b333b9e9c59bd77d6246001e72f90f76ce3fdfbdd62ae7',
  },
  'apps/wbs/fe-01/src/main.tsx': {
    bytes: 527,
    sha256: '9da12f96ac12958e268241fe0c8c6cdd6cbcb0f56db569830af1ced291a7200e',
  },
  'apps/wbs/fe-01/vite.config.ts': {
    bytes: 19302,
    sha256: '0cd1af512952d71c83929cbff1e6ead7e8c2a80edd69ce66bfeb619df189de1b',
  },
  'apps/wbs/fe-01/project.json': {
    bytes: 8117,
    sha256: '9b28a0981a67d3d8397d60bf0eacfea15ce0d5043dceba8097e63f3cff74cc7e',
  },
  'deploy/dev-src/Dockerfile': {
    bytes: 1721,
    sha256: '431666ddc8762b08feaa201642c95df6d4b7de983d002b09d32e360161167fcc',
  },
  'deploy/dev-src/compose.yml': {
    bytes: 3762,
    sha256: '7c8d1168a38f89c4bf3390c12664d769d8d5f447041b7125ec4e99be4366b5b1',
  },
  'node_modules/vite/package.json': {
    bytes: 5093,
    sha256: '4e41dd20c7a12e7e70915b235c0bf5b5158ec6709c1390804128af0867d6d6d9',
  },
  'node_modules/vite/dist/node/chunks/node.js': {
    bytes: 1354063,
    sha256: 'f64038f08022030b77efee87b6baa81933a7b77d820aaa64bc3262fda44d80b0',
  },
  'node_modules/vite/dist/node/index.js': {
    bytes: 2670,
    sha256: 'c7ea52906f843318d7971209ce62bd24bab60590275e8f415c5564fa35cb82dc',
  },
  'node_modules/@vitejs/plugin-react/package.json': {
    bytes: 2246,
    sha256: 'c5420bbbe5ea17fec4b09d44114f9eedd774efbfcc6f9a1d6228103b590af705',
  },
  'node_modules/@vitejs/plugin-react/dist/index.js': {
    bytes: 9466,
    sha256: '843c8567286d06945301c9c5568cad44b1a2f74cd00969152cbd210c2ff07117',
  },
  'node_modules/@tailwindcss/vite/package.json': {
    bytes: 992,
    sha256: 'cba2bb8613106ca608bbd757998b2cf56a464584e3848310338fe3fe3b4761aa',
  },
  'node_modules/@tailwindcss/vite/dist/index.mjs': {
    bytes: 8351,
    sha256: 'f80662823db60a7d2060ae37bedb98ab3a5039a32f9ab88a2a0c9c39e79f4d28',
  },
  'node_modules/react/package.json': {
    bytes: 1242,
    sha256: 'e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6',
  },
  'node_modules/react-dom/package.json': {
    bytes: 3057,
    sha256: '7c82f0967114d4b5d38b1f07e543af87c9919e8d3243f9604004819319cb2200',
  },
  'node_modules/rolldown/package.json': {
    bytes: 6127,
    sha256: '4a001feffe9d32b5fb63860d4faa8725f8a4d7a13c2c37b92587234ab3d66c23',
  },
  'package.json': {
    bytes: 4930,
    sha256: '74ba36c471df0f1dd7ca4221a49f1dd9bab2c7feb7d022a5ff6be39a3aff0e8a',
  },
  'bun.lock': {
    bytes: 533521,
    sha256: 'e3e915704bce2282142eae1f2374cd6217f408d1fed38ae116579a4f6fb1025d',
  },
};

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
    const packet: unknown = JSON.parse(
      await readFile(join(directory, 'source-manifest.json'), 'utf8'),
    );
    const fields = readFields(packet);
    const selectedInputs = readFields(fields['selectedInputs']);
    const sourceFiles = readFields(fields['files']);
    expect(fields['epoch']).toBe('ctt-0.12.0');
    expect(Object.keys(selectedInputs).sort()).toEqual(Object.keys(CAPTURED_INPUTS).sort());
    const captured = new Map<string, Buffer>();
    for (const [path, expected] of Object.entries(CAPTURED_INPUTS)) {
      const bytes = await readFile(join(directory, 'snapshot', path));
      const observed = {
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      expect(observed).toEqual(expected);
      expect(selectedInputs[path]).toEqual(observed);
      if (!path.startsWith('node_modules/')) {
        const file = readFields(sourceFiles[path]);
        expect({ bytes: file['bytes'], sha256: file['sha256'] }).toEqual(observed);
        expect(file['gitBlob']).toMatch(/^[a-f0-9]{40}$/);
      }
      captured.set(path, bytes);
    }
    const prepared = await artifact();
    const registration = roots.indexOf(prepared.root);
    if (registration < 0) throw new Error('canonical fixture root unregistered');
    try {
      for (const [path, bytes] of captured) {
        const selected = path.replace('node_modules/vite/', 'node_modules/.frontend-profile/vite/');
        await mkdir(dirname(join(prepared.root, selected)), { recursive: true });
        await writeFile(join(prepared.root, selected), bytes);
      }
      await symlink('.frontend-profile/vite', join(prepared.root, 'node_modules/vite'));
      await modes(prepared.root);
      await git(prepared.root, 'add', '.');
      await git(
        prepared.root,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'actual captured frontend inputs',
      );
      await modes(prepared.root);
      const sourceSha = await git(prepared.root, 'rev-parse', 'HEAD');
      expect(sourceSha).not.toBe(fields['head']);
      const generated = await createSourceStartupManifest(prepared.root, sourceSha, configuration);
      const manifest = decodeSourceStartupManifest(generated.contents, {
        ...prepared.pins,
        sourceSha,
        manifestSha256: generated.sha256,
      });
      for (const [path, bytes] of captured) {
        expect(Uint8Array.from(await readFile(join(prepared.root, path)))).toEqual(
          Uint8Array.from(bytes),
        );
        const selected = path.replace('node_modules/vite/', 'node_modules/.frontend-profile/vite/');
        const entry = manifest.entries.find(
          (entry) =>
            (entry.root === 'dependencies' ? `node_modules/${entry.path}` : entry.path) ===
            selected,
        );
        if (entry?.kind !== 'file') throw new Error('captured canonical input absent');
        expect({ bytes: entry.size, sha256: entry.sha256 }).toEqual(
          CAPTURED_INPUTS[path as keyof typeof CAPTURED_INPUTS],
        );
      }
      expect(selectSourceFrontendProfile(manifest)).toBe('wbs-source-frontend-wire-v1');
      expect(observations.document.body).toBe(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readFile(join(directory, 'index.response.html')),
        ),
      );
      expect(observations.entry.body).toBe(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readFile(join(directory, 'main.response.js')),
        ),
      );
      if (evidence !== undefined) {
        await writeFile(join(evidence, 'canonical-manifest.json'), generated.contents);
        await writeFile(
          join(evidence, 'canonical-pins.json'),
          JSON.stringify(
            {
              ...prepared.pins,
              sourceSha,
              manifestSha256: generated.sha256,
              producerSha: fields['head'],
            },
            null,
            2,
          ),
        );
      }
    } finally {
      await rm(prepared.root, { recursive: true });
      roots.splice(registration, 1);
    }
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

test.each(['package.json', 'bun.lock'] as const)(
  'producer fixed-root boundary refuses mixed historical %s before consumer or runtime',
  async (path) => {
    const root = await mkdtemp(join(tmpdir(), 'frontend-producer-boundary-'));
    try {
      await prepareSourceFrontendProfile(root);
      const historical = reconstructHistoricalInput(path, await readFile(join(root, path)));
      await writeFile(join(root, path), historical);
      const copied = join(
        root,
        'tools/tool-remote-scripts/src/fixtures/source-frontend-producer.ts',
      );
      await mkdir(dirname(copied), { recursive: true });
      const source = await readFile(
        resolve(import.meta.dir, '../fixtures/source-frontend-producer.ts'),
      );
      await writeFile(copied, source);
      expect(await readFile(copied)).toEqual(source);
      await cp(resolve(import.meta.dir), join(root, 'tools/tool-remote-scripts/src/lib'), {
        recursive: true,
      });
      await cp(
        resolve(import.meta.dir, '../fixtures/source-frontend-producer-program.ts'),
        join(dirname(copied), 'source-frontend-producer-program.ts'),
      );
      expect(await readFile(join(dirname(copied), 'source-frontend-producer-program.ts'))).toEqual(
        await readFile(resolve(import.meta.dir, '../fixtures/source-frontend-producer-program.ts')),
      );
      const destination = join(root, 'consumer-not-called');
      await rejects(access(destination), { code: 'ENOENT' });
      console.error(
        JSON.stringify({
          boundary: 'producer',
          root,
          destination,
          copied,
          sha256: createHash('sha256').update(source).digest('hex'),
          fault: path,
        }),
      );
      // The owned module bytes equal the known producer above; only its fixed ROOT differs.
      const producer = (await import(copied)) as typeof ProducerModule;
      let consumed = false;
      await rejects(
        producer.withSourceFrontendProducer(async () => {
          consumed = true;
          await writeFile(destination, 'unexpected');
        }),
        /unsupported source frontend producer inputs/,
      );
      expect(consumed).toBe(false);
      await rejects(access(destination), { code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true });
    }
  },
  30000,
);

const HISTORICAL_PAIR = {
  'package.json': {
    bytes: 4885,
    sha256: 'bf45a6e5f8f806d2762dfb22af77375a9ad55d806781a34812812de31f07eb74',
  },
  'bun.lock': {
    bytes: 533044,
    sha256: 'bf54a6c6202a5d8f54f9bb8fe7e76935a8f4c667c660da720db3fd5f16391383',
  },
};
const CURATED_SOURCE = [
  'apps/wbs/fe-01',
  'libs/wbs/domain',
  'libs/shared/domain',
  'libs/shared/adapters/ui-core-01',
  'libs/shared/adapters/ui-saas-01',
  'package.json',
  'bun.lock',
  'deploy/dev-src/Dockerfile',
  'deploy/dev-src/compose.yml',
  'tsconfig.base.json',
  'nx.json',
];
const describeBytes = (bytes: Uint8Array) => ({
  bytes: bytes.byteLength,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});

async function prepareOwnedProducer(historicalCommit: boolean) {
  const repository = resolve(import.meta.dir, '../../../..');
  const root = await mkdtemp(join(tmpdir(), 'frontend-owned-provenance-'));
  console.error(JSON.stringify({ boundary: 'provenance-preparation', root }));
  const archive = Bun.spawnSync(['git', 'archive', 'HEAD', ...CURATED_SOURCE], {
    cwd: repository,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15000,
  });
  expect(archive.success).toBe(true);
  expect(archive.signalCode).toBeUndefined();
  expect(archive.stderr.byteLength).toBe(0);
  expect(archive.stdout.byteLength).toBeLessThan(32 * 1024 * 1024);
  const extracted = Bun.spawnSync(['tar', '-xf', '-', '-C', root], {
    stdin: archive.stdout,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15000,
  });
  expect(extracted.success).toBe(true);
  expect(extracted.signalCode).toBeUndefined();
  expect(extracted.stderr.byteLength).toBe(0);
  const current = new Map<string, Buffer>();
  const historical = new Map<string, Buffer>();
  for (const path of ['package.json', 'bun.lock'] as const) {
    const bytes = await readFile(join(root, path));
    expect(describeBytes(bytes)).toEqual(CAPTURED_INPUTS[path]);
    current.set(path, bytes);
    const old = reconstructHistoricalInput(path, bytes);
    historical.set(path, old);
    if (historicalCommit) await writeFile(join(root, path), old);
  }
  await writeFile(join(root, '.gitignore'), 'node_modules/\n');
  await git(root, 'init', '-q');
  await git(root, 'add', '.');
  await git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'owned producer source',
  );
  const sourceSha = await git(root, 'rev-parse', 'HEAD');
  const roster = await git(root, 'ls-tree', '-r', '--full-tree', sourceSha, ...CURATED_SOURCE);
  for (const [path, bytes] of current) await writeFile(join(root, path), bytes);
  await mkdir(join(root, 'node_modules'));
  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir(join(repository, 'node_modules')))
    if (!name.startsWith('.'))
      await symlink(join(repository, 'node_modules', name), join(root, 'node_modules', name));
  for (const [path, expected] of Object.entries(CAPTURED_INPUTS))
    expect(describeBytes(await readFile(join(root, path)))).toEqual(expected);
  const copied = join(root, 'tools/tool-remote-scripts/src/fixtures/source-frontend-producer.ts');
  await mkdir(dirname(copied), { recursive: true });
  const source = await readFile(
    resolve(import.meta.dir, '../fixtures/source-frontend-producer.ts'),
  );
  await writeFile(copied, source);
  expect(await readFile(copied)).toEqual(source);
  await cp(resolve(import.meta.dir), join(root, 'tools/tool-remote-scripts/src/lib'), {
    recursive: true,
  });
  const program = await readFile(
    resolve(import.meta.dir, '../fixtures/source-frontend-producer-program.ts'),
  );
  await writeFile(join(dirname(copied), 'source-frontend-producer-program.ts'), program);
  expect(await readFile(join(dirname(copied), 'source-frontend-producer-program.ts'))).toEqual(
    program,
  );
  console.error(
    JSON.stringify({
      boundary: 'provenance-prepared',
      root,
      copied,
      source: describeBytes(source),
      program: describeBytes(program),
      archive: describeBytes(archive.stdout),
      sourceSha,
      historicalCommit,
      rosterSha256: describeBytes(Buffer.from(roster)).sha256,
    }),
  );
  // The copied source and program equal the frozen actual modules; its owned fixed ROOT is the only relocation.
  const producer = (await import(copied)) as typeof ProducerModule;
  return { root, producer, current, historical, sourceSha, roster };
}

function readProducerRefusal(fault: unknown): { directory: string; cause: Error } {
  if (!(fault instanceof Error) || !(fault.cause instanceof Error))
    throw new Error('producer refusal attribution absent', { cause: fault });
  const match =
    /^frontend producer scratch retained: (\/tmp\/puni-source-frontend-wire-[A-Za-z0-9]+)$/.exec(
      fault.message,
    );
  const directory = match?.at(1);
  if (directory === undefined)
    throw new Error('producer refusal directory absent', { cause: fault });
  return { directory, cause: fault.cause };
}

async function retainProvenanceEvidence(
  label: string,
  prepared: Awaited<ReturnType<typeof prepareOwnedProducer>>,
  directory: string,
) {
  const evidence = process.env['SOURCE_FRONTEND_PRODUCER_EVIDENCE'];
  if (evidence !== undefined) {
    const destination = join(evidence, label);
    await mkdir(destination, { recursive: true });
    await cp(directory, join(destination, 'capture'), { recursive: true, verbatimSymlinks: true });
    await writeFile(join(destination, 'owned-source-roster.txt'), prepared.roster);
    await writeFile(
      join(destination, 'attribution.json'),
      JSON.stringify({ root: prepared.root, sourceSha: prepared.sourceSha, directory }, null, 2),
    );
  }
}

test('producer rejects separately supported Git and live epochs before Node', async () => {
  const prepared = await prepareOwnedProducer(true);
  const actualSpawn = Bun.spawnSync;
  let probes = 0;
  let resolutions = 0;
  let retained: string | undefined;
  let settled = false;
  // The inspected producer uses the array overload; all calls delegate unchanged to the retained real function.
  const spy = spyOn(Bun, 'spawnSync').mockImplementation(((
    ...args: Parameters<typeof Bun.spawnSync>
  ) => {
    const [argv] = args;
    if (argv[1]?.endsWith('/probe.mjs')) probes++;
    if (argv[1] === '-p') resolutions++;
    return actualSpawn(...args);
  }) as typeof Bun.spawnSync);
  try {
    let consumed = false;
    await rejects(
      prepared.producer.withSourceFrontendProducer(() => {
        consumed = true;
        return Promise.resolve();
      }),
      (fault: unknown) => {
        const refusal = readProducerRefusal(fault);
        retained = refusal.directory;
        expect(refusal.cause.message).toBe('source frontend producer selected epoch changed');
        return true;
      },
    );
    expect(probes).toBe(0);
    expect(resolutions).toBe(0);
    expect(consumed).toBe(false);
    if (retained === undefined) throw new Error('opening refusal capture absent');
    for (const path of ['package.json', 'bun.lock'] as const) {
      expect(describeBytes(await readFile(join(prepared.root, path)))).toEqual(
        CAPTURED_INPUTS[path],
      );
      expect(describeBytes(await readFile(join(retained, 'snapshot', path)))).toEqual(
        HISTORICAL_PAIR[path],
      );
      expect(await git(prepared.root, 'rev-parse', `${prepared.sourceSha}:${path}`)).toMatch(
        /^[a-f0-9]{40}$/,
      );
    }
    await retainProvenanceEvidence('opening-epoch-mismatch', prepared, retained);
    settled = true;
  } finally {
    spy.mockRestore();
    if (settled) {
      await rm(prepared.root, { recursive: true });
      if (retained !== undefined) await rm(retained, { recursive: true });
    }
  }
}, 10000);

test('producer rejects a different supported live epoch after the actual child closes', async () => {
  const prepared = await prepareOwnedProducer(false);
  const actualSpawn = Bun.spawnSync;
  let probes = 0;
  let node: string | undefined;
  let returned: ReturnType<typeof Bun.spawnSync> | undefined;
  let probeDirectory: string | undefined;
  let retained: string | undefined;
  let settled = false;
  // Only the real producer array overload is used; the spy preserves the actual function's returned object.
  const spy = spyOn(Bun, 'spawnSync').mockImplementation(((
    ...args: Parameters<typeof Bun.spawnSync>
  ) => {
    const [argv, options] = args;
    const probe = argv[1];
    const directory = argv[2];
    const isProbe =
      typeof probe === 'string' &&
      typeof directory === 'string' &&
      /^\/tmp\/puni-source-frontend-wire-[A-Za-z0-9]+$/.test(directory) &&
      probe === join(directory, 'probe.mjs') &&
      options?.cwd === join(directory, 'snapshot/apps/wbs/fe-01');
    if (isProbe) {
      if (node === undefined) throw new Error('actual Node probe resolution absent');
      expect(argv).toEqual([node, probe, directory]);
      expect(isAbsolute(probe)).toBe(true);
      expect(realpathSync(probe)).toBe(probe);
      expect(options).toEqual({
        cwd: join(directory, 'snapshot/apps/wbs/fe-01'),
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
        timeout: 90000,
        killSignal: 'SIGKILL',
      });
    }
    const child = actualSpawn(...args);
    if (argv[1] === '-p' && argv[2] === 'process.execPath') {
      if (!(child.stdout instanceof Uint8Array))
        throw new Error('actual Node resolution stream absent');
      node = Buffer.from(child.stdout).toString().trim();
    }
    if (isProbe) {
      probes++;
      returned = child;
      probeDirectory = directory;
      expect(child.success).toBe(true);
      expect(child.signalCode).toBeUndefined();
      expect(child.exitCode).toBe(0);
      for (const [path, bytes] of prepared.historical) {
        const target = join(prepared.root, path);
        expect(lstatSync(target).isFile()).toBe(true);
        expect(lstatSync(target).isSymbolicLink()).toBe(false);
        expect(realpathSync(target)).toBe(target);
        expect(realpathSync(prepared.root)).toBe(prepared.root);
        writeFileSync(target, bytes);
      }
    }
    return child;
  }) as typeof Bun.spawnSync);
  try {
    let consumed = false;
    await rejects(
      prepared.producer.withSourceFrontendProducer(() => {
        consumed = true;
        return Promise.resolve();
      }),
      (fault: unknown) => {
        const refusal = readProducerRefusal(fault);
        retained = refusal.directory;
        expect(refusal.cause.message).toBe('source frontend producer selected epoch changed');
        return true;
      },
    );
    expect(probes).toBe(1);
    expect(consumed).toBe(false);
    expect(returned).toBeDefined();
    expect(spy.mock.results.some((call) => call.type === 'return' && call.value === returned)).toBe(
      true,
    );
    expect(retained).toBe(probeDirectory);
    if (retained === undefined) throw new Error('closing refusal capture absent');
    const packet = readFields(
      JSON.parse(await readFile(join(retained, 'source-manifest.json'), 'utf8')),
    );
    expect(packet['head']).toBe(prepared.sourceSha);
    expect(packet['epoch']).toBe('ctt-0.12.0');
    expect(packet['selectedInputs']).toEqual(CAPTURED_INPUTS);
    for (const [path, expected] of Object.entries(CAPTURED_INPUTS))
      expect(describeBytes(await readFile(join(retained, 'snapshot', path)))).toEqual(expected);
    for (const path of ['package.json', 'bun.lock'] as const) {
      expect(describeBytes(await readFile(join(retained, 'snapshot', path)))).toEqual(
        CAPTURED_INPUTS[path],
      );
      expect(describeBytes(await readFile(join(prepared.root, path)))).toEqual(
        HISTORICAL_PAIR[path],
      );
    }
    const observation = readFields(
      JSON.parse(await readFile(join(retained, 'observation.json'), 'utf8')),
    );
    const cleanup = readFields(observation['cleanup']);
    expect(cleanup['closeReturned']).toBe(true);
    expect(cleanup['explicitWatcherCloseReturned']).toBe(true);
    expect(cleanup['httpListening']).toBe(false);
    expect(cleanup['watcherClosed']).toBe(true);
    expect(cleanup['watchedDirectoryCount']).toBe(0);
    const supervisor = readFields(
      JSON.parse(await readFile(join(retained, 'supervisor.json'), 'utf8')),
    );
    expect(supervisor['exit']).toBe(0);
    expect(supervisor['childAndPipesJoined']).toBe(true);
    const inspectors = await import('./source-frontend-http');
    const responses = observation['responses'];
    if (!Array.isArray(responses) || responses.length !== 2)
      throw new Error('closing probe response census absent');
    for (const [index, filename, inspect] of [
      [0, 'index.response.html', inspectors.inspectSourceFrontendDocument],
      [1, 'main.response.js', inspectors.inspectSourceFrontendEntry],
    ] as const) {
      const response = readFields(responses[index]);
      const headers = readFields(response['headers']);
      expect(response['status']).toBe(200);
      expect(response['complete']).toBe(true);
      expect(readFields(response['lifecycle'])).toEqual({
        requestClosed: true,
        responseClosed: true,
      });
      const contentType = headers['content-type'];
      if (typeof contentType !== 'string') throw new Error('closing probe MIME absent');
      inspect({
        status: 200,
        contentType,
        body: new TextDecoder('utf-8', { fatal: true }).decode(
          await readFile(join(retained, filename)),
        ),
      });
    }
    await retainProvenanceEvidence('closing-epoch-mismatch', prepared, retained);
    settled = true;
  } finally {
    spy.mockRestore();
    if (settled) {
      await rm(prepared.root, { recursive: true });
      if (retained !== undefined) await rm(retained, { recursive: true });
    }
  }
}, 130000);
const HISTORICAL_REMOVALS = {
  'package.json': ['    "configurable-tree-traversal": "0.12.0",\n'],
  'bun.lock': [
    '        "configurable-tree-traversal": "0.12.0",\n',
    '    "configurable-tree-traversal": ["configurable-tree-traversal@0.12.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-AsAFLmDPdtEvYZ0sQPIgavYba8SKUgLqS+snyW0DlPE7wwYuXguj+UdvQRgbfPRvjWHVowFxaBowDX2otO+rlQ=="],\n\n',
    '    "configurable-tree-traversal/uuid": ["uuid@14.0.3", "", { "bin": { "uuid": "dist-node/bin/uuid" } }, "sha512-Sc5u1VVln93y1Xnz4R+CunOZc7R9LUcTmhj7Rc7Eg3HVcf7rVn2FOoa812fe0W8p3jD7xeoGSYbfqCGGH2B6xw=="],\n\n',
  ],
};

function reconstructHistoricalInput(path: 'package.json' | 'bun.lock', bytes: Uint8Array): Buffer {
  expect(describeBytes(bytes)).toEqual(CAPTURED_INPUTS[path]);
  // Exact reviewed CTT additions are removed only for owned negative inputs, avoiding CI shallow-history dependence.
  let contents = Buffer.from(bytes).toString('utf8');
  for (const hunk of HISTORICAL_REMOVALS[path]) {
    expect(contents.split(hunk).length - 1).toBe(1);
    contents = contents.replace(hunk, '');
  }
  const reconstructed = Buffer.from(contents);
  expect(describeBytes(reconstructed)).toEqual(HISTORICAL_PAIR[path]);
  return reconstructed;
}
