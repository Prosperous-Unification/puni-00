import { rejects, throws } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import type * as ProducerModule from '../fixtures/source-frontend-producer';
import {
  consumeSourceFrontendCapture,
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
    bytes: 4992,
    sha256: '0b635ebde6513e9bce36d000bbd04fc3cc817ff49074af8e5e3219910a97f131',
  },
  'bun.lock': {
    bytes: 534113,
    sha256: '48b5cea4e2ac740d300f4e41cc705dfb5213210c4db378f8cdf65640fb695adb',
  },
};

test('fourth current frontend pair materializes and selects without Vite', async () => {
  const prepared = await artifact();
  const registration = roots.indexOf(prepared.root);
  if (registration < 0) throw new Error('canonical fixture root unregistered');
  try {
    await prepareSourceFrontendProfile(prepared.root);
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
      'fourth frontend pair',
    );
    await modes(prepared.root);
    const sourceSha = await git(prepared.root, 'rev-parse', 'HEAD');
    const generated = await createSourceStartupManifest(prepared.root, sourceSha, configuration);
    const manifest = decodeSourceStartupManifest(generated.contents, {
      ...prepared.pins,
      sourceSha,
      manifestSha256: generated.sha256,
    });
    for (const path of ['package.json', 'bun.lock'] as const) {
      const bytes = await readFile(join(prepared.root, path));
      const observed = {
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      expect(observed).toEqual(CAPTURED_INPUTS[path]);
      const entry = manifest.entries.find(
        (candidate) => candidate.root === 'source' && candidate.path === path,
      );
      if (entry?.kind !== 'file') throw new Error('canonical frontend pair absent');
      expect({ bytes: entry.size, sha256: entry.sha256 }).toEqual(observed);
    }
    expect(selectSourceFrontendProfile(manifest)).toBe('wbs-source-frontend-wire-v1');
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
    roots.splice(registration, 1);
  }
}, 30000);

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
    expect(fields['epoch']).toBe('fresh-main-20261105-ctt-0.13.0');
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

type ClosingCapture = Pick<ReturnType<typeof Bun.spawnSync>, 'success' | 'signalCode' | 'exitCode'>;

/** Keeps the original child untouched; only a successful unsignalled exit-zero capture may mutate the epoch. */
function mutateClosingEpoch<Capture extends ClosingCapture>(
  child: Capture,
  mutate: () => void,
): Capture {
  // Proof: G1 removed this return and G3 copied the capture; "closing spy inert failed
  // child preserves original refusal before mutation or consumer" failed, then restores passed.
  if (!child.success || child.signalCode !== undefined || child.exitCode !== 0) return child;
  mutate();
  return child;
}

/** Propagates the original infrastructure refusal before the intended epoch-negative oracle. */
function propagateClosingFailure(fault: unknown, child: ClosingCapture | undefined): void {
  if (
    child !== undefined &&
    (!child.success || child.signalCode !== undefined || child.exitCode !== 0)
  )
    // Proof: G2 removed this rethrow; "closing spy inert failed child preserves original
    // refusal before mutation or consumer" failed at missing exception, then restored PASS.
    throw fault;
}

type CloseStubMode = 'close-contract' | 'close-rejections' | 'close-sink-failure' | 'close-caps';

/** Owns only inert close functions/native promises; the generated production probe supplies the instrumenter. */
function createCloseStub(mode: CloseStubMode, events: string): string {
  return `
import assert from 'node:assert/strict';
import fs, { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const mode=${JSON.stringify(mode)};
const events=${JSON.stringify(events)};
const counts={watcher:0,ws:0,client:0,ssr:0,runner:0,http:0};
const sentinel={};
const argumentsExpected=[sentinel,undefined,Symbol('TEST close argument')];
const rejected=new Error('TEST original close rejection');
const callbackFault=new Error('TEST original callback throw');
const callbackReceiver={};
const callbackArguments=[undefined,sentinel,undefined];
const callbackReturn={};
const repeat=mode==='close-caps'?3:1;
let unhandled=0;
let identities=0;
let callbackReturns=0;
let callbackThrows=0;
process.on('unhandledRejection',()=>{unhandled++;throw new Error('TEST unexpected observer rejection');});
if(mode==='close-sink-failure'){
 const writeSync=fs.writeSync;
 fs.writeSync=(fd,bytes,...args)=>{
  if(fd===2&&typeof bytes==='string'&&(bytes.startsWith('SOURCE_FRONTEND_CLOSE: ')||bytes.startsWith('SOURCE_FRONTEND_CLOSE_ROSTER: ')))throw new Error('TEST close sink unavailable');
  return writeSync(fd,bytes,...args);
 };
 syncBuiltinESMExports();
}
function boundary(name){
 const owner={last:undefined,close(...args){
  assert.equal(this,owner,'TEST close contract: method receiver');
  counts[name]++;
  if(name==='watcher'&&args.length===0){assert.equal(counts.watcher,repeat+1);owner.closed=true;}
  else {assert.equal(args.length,3,'TEST close contract: method arguments length');args.forEach((argument,index)=>assert.equal(argument,argumentsExpected[index],'TEST close contract: method argument identity'));}
  owner.last=mode==='close-rejections'&&name==='ws'?Promise.reject(rejected):Promise.resolve(sentinel);
  return owner.last;
 }};
 return owner;
}
export const version='TEST inert close contract stub';
export async function createServer(options){
 const watcher=boundary('watcher');watcher.closed=false;
 const ws=boundary('ws'),client=boundary('client'),ssr=boundary('ssr'),runner=boundary('runner');
 const http={listening:false,last:undefined,close(callback,...args){
  assert.equal(this,http,'TEST close contract: method receiver');counts.http++;http.last=sentinel;
  assert.equal(args.length,3,'TEST close contract: method arguments length');args.forEach((argument,index)=>assert.equal(argument,argumentsExpected[index],'TEST close contract: method argument identity'));
  const completion=Reflect.apply(callback,callbackReceiver,callbackArguments);
  assert.equal(completion,callbackReturn,'TEST close contract: callback return identity');callbackReturns++;
  return http.last;
 }};
 watcher.getWatched=()=>{
  appendFileSync(events,JSON.stringify({counts,identities,callbackReturns,callbackThrows,unhandled})+'\\n');
  return {};
 };
 return {config:{root:options.root,envDir:options.envDir,server:{host:'127.0.0.1',port:0,strictPort:true,hmr:true,open:false},env:{VITE_BE_URL:'http://127.0.0.1:9',VITE_GW_URL:'ws://127.0.0.1:9'}},watcher,ws,httpServer:http,environments:{client,ssr},_ssrCompatModuleRunner:runner,
 async close(){
  for(let turn=0;turn<repeat;turn++){
   for(const owner of [watcher,ws,client,ssr,runner]){
    const completion=owner.close(...argumentsExpected);assert.equal(completion,owner.last,'TEST close contract: promise return identity');identities++;
    if(mode==='close-rejections'&&owner===ws)await assert.rejects(completion,(cause)=>cause===rejected,'TEST close contract: promise rejection identity');
    else assert.equal(await completion,sentinel,'TEST close contract: promise fulfillment identity');
   }
   const callback=function(...args){
    assert.equal(this,callbackReceiver,'TEST close contract: callback receiver');assert.equal(args.length,3,'TEST close contract: callback arguments length');
    args.forEach((argument,index)=>assert.equal(argument,callbackArguments[index],'TEST close contract: callback argument identity'));
    if(mode==='close-rejections')throw callbackFault;
    return callbackReturn;
   };
   if(mode==='close-rejections'){
    assert.throws(()=>http.close(callback,...argumentsExpected),(cause)=>cause===callbackFault,'TEST close contract: callback throw identity');callbackThrows++;
   }else {assert.equal(http.close(callback,...argumentsExpected),http.last,'TEST close contract: http return identity');identities++;}
  }
  // Stub-only one-turn checkpoint lets a rejected observer promise reach the throwing guard.
  await new Promise((complete)=>setImmediate(complete));
  assert.equal(unhandled,0);
  if(mode==='close-rejections')throw rejected;
 }};
}
`;
}

/** Executes the exact generated program against a clearly test-owned Vite module; this qualifies diagnostic ordering only. */
async function withStubFrontendProducer(
  mode:
    | 'unsettled'
    | 'settled'
    | 'secondary-failure'
    | 'telemetry-unavailable'
    | 'bounded-primary'
    | CloseStubMode,
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
      mode === 'close-contract' ||
        mode === 'close-rejections' ||
        mode === 'close-sink-failure' ||
        mode === 'close-caps'
        ? createCloseStub(mode, join(directory, 'stub-close-events.log'))
        : `
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

test('closing spy inert failed child preserves original refusal before mutation or consumer', () => {
  const node = Bun.which('node');
  if (node === null) throw new Error('Node closing-spy fixture runtime absent');
  const stderr = Buffer.from('TEST closing-spy original child\n');
  const started = performance.now();
  const child = Bun.spawnSync(
    [node, '-e', "process.stderr.write('TEST closing-spy original child\\n');process.exitCode=23;"],
    {
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    },
  );
  const execution = { node, elapsedMs: performance.now() - started, timeoutMs: 5000 };
  expect(child.success).toBe(false);
  expect(child.exitCode).toBe(23);
  expect(child.signalCode).toBeUndefined();
  expect(child.stdout.byteLength).toBe(0);
  expect(child.stderr).toEqual(stderr);
  let mutations = 0;
  let consumers = 0;
  let epochAcceptances = 0;
  let originalRefusal: Error | undefined;
  const returned = mutateClosingEpoch(child, () => {
    mutations++;
  });
  expect(returned).toBe(child);
  expect(mutations).toBe(0);
  throws(
    () => {
      expect(returned).toBe(child);
      requireSourceFrontendProducerSuccess(returned, execution);
      consumers++;
    },
    (fault: unknown) => {
      if (!(fault instanceof Error)) return false;
      originalRefusal = fault;
      const prefix =
        'actual frontend producer failed or custody unproved\nsource-frontend-producer-child ';
      expect(fault.message.startsWith(prefix)).toBe(true);
      const diagnostic = readFields(JSON.parse(fault.message.slice(prefix.length)));
      expect(diagnostic['exitCode']).toBe(23);
      expect(diagnostic['stderr']).toEqual({
        bytes: stderr.byteLength,
        sha256: createHash('sha256').update(stderr).digest('hex'),
        truncated: false,
        base64: stderr.toString('base64'),
      });
      return true;
    },
  );
  if (originalRefusal === undefined) throw new Error('original closing child refusal absent');
  const retainedRefusal = originalRefusal;
  throws(
    () => {
      propagateClosingFailure(retainedRefusal, returned);
      epochAcceptances++;
    },
    (fault: unknown) => fault === retainedRefusal,
  );
  expect(consumers).toBe(0);
  expect(epochAcceptances).toBe(0);
  expect(returned.stderr).toEqual(stderr);
}, 10000);

for (const mode of [
  'close-contract',
  'close-rejections',
  'close-sink-failure',
  'close-caps',
] as const)
  test(`generated producer inert close proof ${mode}`, async () => {
    await withStubFrontendProducer(mode, async (child, execution, directory) => {
      expect(child.exitCode).toBe(1);
      expect(child.signalCode).toBeUndefined();
      expect(child.stderr.toString()).not.toContain('TEST close contract: ');
      expect(child.stderr.toString()).not.toContain('TEST close sink unavailable');
      expect(child.stderr.toString()).not.toContain('TEST unexpected observer rejection');
      expect(child.stderr.toString()).not.toContain('Detected unsettled top-level await');
      const observation = readFields(
        JSON.parse(await readFile(join(directory, 'observation.json'), 'utf8')),
      );
      const cleanup = readFields(observation['cleanup']);
      expect(readFields(observation['failure'])['name']).toBe('AssertionError');
      expect(readFields(observation['failure'])['message']).toContain('true !== false');
      expect(observation['diagnostic']).toEqual({ status: 'written' });
      expect(cleanup['closeReturned']).toBe(mode === 'close-rejections' ? undefined : true);
      expect(cleanup['explicitWatcherCloseReturned']).toBe(true);
      expect(cleanup['httpListening']).toBe(false);
      expect(cleanup['watcherClosed']).toBe(true);
      expect(cleanup['watchedDirectoryCount']).toBe(0);
      const repeat = mode === 'close-caps' ? 3 : 1;
      expect(JSON.parse(await readFile(join(directory, 'stub-close-events.log'), 'utf8'))).toEqual({
        counts: {
          watcher: repeat + 1,
          ws: repeat,
          client: repeat,
          ssr: repeat,
          runner: repeat,
          http: repeat,
        },
        identities: repeat * (mode === 'close-rejections' ? 5 : 6),
        callbackReturns: mode === 'close-rejections' ? 0 : repeat,
        callbackThrows: mode === 'close-rejections' ? repeat : 0,
        unhandled: 0,
      });
      const diagnostic = readFields(observation['closeDiagnostic']);
      expect(diagnostic['status']).toBe(
        mode === 'close-sink-failure' ? 'unavailable' : 'available',
      );
      expect(diagnostic['boundaries']).toEqual({
        watcher: 'installed',
        ws: 'installed',
        'environment-client': 'installed',
        'environment-ssr': 'installed',
        'ssr-runner': 'installed',
        http: 'installed',
      });
      const records = child.stderr
        .toString()
        .split('\n')
        .filter((line) => line.startsWith('SOURCE_FRONTEND_CLOSE: '));
      const rosters = child.stderr
        .toString()
        .split('\n')
        .filter((line) => line.startsWith('SOURCE_FRONTEND_CLOSE_ROSTER: '));
      if (mode === 'close-sink-failure') {
        expect(records).toHaveLength(0);
        expect(rosters).toHaveLength(0);
      } else {
        expect(rosters).toHaveLength(1);
        expect(records.length + rosters.length).toBeLessThanOrEqual(25);
        const events = records.map((line) =>
          readFields(JSON.parse(line.slice('SOURCE_FRONTEND_CLOSE: '.length))),
        );
        const labels = [
          'watcher',
          'ws',
          'environment-client',
          'environment-ssr',
          'ssr-runner',
          'http',
        ];
        expect([...new Set(events.map((event) => event['boundary']))].sort()).toEqual(
          [...labels].sort(),
        );
        for (const label of labels) {
          const selected = events.filter((event) => event['boundary'] === label);
          expect(selected.filter((event) => event['event'] === 'entered')).toHaveLength(
            label === 'watcher' ? 2 : 1,
          );
          expect(
            selected.filter(
              (event) =>
                event['event'] ===
                (mode === 'close-rejections' && label === 'ws' ? 'rejected' : 'fulfilled'),
            ),
          ).toHaveLength(label === 'watcher' ? 2 : 1);
        }
        expect(events.filter((event) => event['event'] === 'threw')).toHaveLength(
          mode === 'close-rejections' ? 1 : 0,
        );
        expect(records).toHaveLength(mode === 'close-rejections' ? 15 : 14);
      }
      if (mode === 'close-rejections') {
        expect(child.stderr.toString()).toContain(
          'AggregateError: producer refusal or cleanup unproved',
        );
        expect(child.stderr.toString()).toContain('TEST original close rejection');
        expect(child.stderr.toString().indexOf('AssertionError')).toBeLessThan(
          child.stderr.toString().indexOf('TEST original close rejection'),
        );
      }
      throws(() => {
        requireSourceFrontendProducerSuccess(child, execution);
      }, /actual frontend producer failed or custody unproved/);
    });
  });

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
const CTT_PAIR = {
  'package.json': {
    bytes: 4930,
    sha256: '74ba36c471df0f1dd7ca4221a49f1dd9bab2c7feb7d022a5ff6be39a3aff0e8a',
  },
  'bun.lock': {
    bytes: 533521,
    sha256: 'e3e915704bce2282142eae1f2374cd6217f408d1fed38ae116579a4f6fb1025d',
  },
};
const PREVIOUS_MAIN_PAIR = {
  'package.json': {
    bytes: 4992,
    sha256: '6482624ce19f7d9ea6cd919328f839e3bb7bb8c48ae120a4f5c3104e9a87c381',
  },
  'bun.lock': {
    bytes: 534113,
    sha256: '129512f0a0fc719b814e7998353190f8827d96085f99000c418c6988ebbbb728',
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

/** Optional synchronous owned-root chronology; absence is observed, never accepted as cleanup. */
function publishProvenanceRoot(
  owner: 'provenance' | 'producer',
  event: 'allocated' | 'prepared' | 'pre-remove' | 'post-remove' | 'remove-failed',
  root: string,
) {
  let identity:
    | { kind: 'directory' | 'symlink' | 'file' | 'other'; device: string; inode: string }
    | { kind: 'unavailable'; reason: 'ENOENT' | 'EACCES' | 'other' };
  try {
    const status = lstatSync(root, { bigint: true });
    identity = {
      kind: status.isDirectory()
        ? 'directory'
        : status.isSymbolicLink()
          ? 'symlink'
          : status.isFile()
            ? 'file'
            : 'other',
      device: String(status.dev),
      inode: String(status.ino),
    };
  } catch (cause) {
    const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
    identity = {
      kind: 'unavailable',
      reason: code === 'ENOENT' || code === 'EACCES' ? code : 'other',
    };
  }
  try {
    const line =
      'SOURCE_FRONTEND_ROOT: ' +
      JSON.stringify({ owner, event, root, atMs: performance.now(), identity }) +
      '\n';
    return { status: writeSync(2, line) === Buffer.byteLength(line) ? 'written' : 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Preserves the original required rm, its error object, and the caller's sequential cleanup order. */
async function removeProvenanceRoot(owner: 'provenance' | 'producer', root: string) {
  const before = publishProvenanceRoot(owner, 'pre-remove', root);
  const status = (after: { status: string }) => {
    try {
      writeSync(
        2,
        JSON.stringify({ boundary: 'provenance-cleanup-telemetry', owner, before, after }) + '\n',
      );
    } catch {
      /* Optional telemetry remains unavailable; required rm/error propagation below is unchanged. */
    }
  };
  try {
    await rm(root, { recursive: true });
  } catch (cause) {
    const failed = publishProvenanceRoot(owner, 'remove-failed', root);
    status(failed);
    throw cause;
  }
  const after = publishProvenanceRoot(owner, 'post-remove', root);
  status(after);
}

type FrontendRootOwner = 'provenance' | 'producer';

/** Attempts the fixed settled pair once in order, retaining each original failure until both attempts finish. */
async function removeFrontendRoots(
  provenance: string,
  producer: string | undefined,
  remove: (owner: FrontendRootOwner, root: string) => Promise<void>,
): Promise<void> {
  const failures: unknown[] = [];
  try {
    await remove('provenance', provenance);
  } catch (failure) {
    // Proof: FRC1 restored fail-fast here; 'frontend cleanup accounting settled roots first-missing'
    // found the real second root retained; exact attempt-all restoration passed (2026-11-02).
    failures.push(failure);
  }
  if (producer !== undefined) {
    try {
      await remove('producer', producer);
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length === 2)
    throw new AggregateError(failures, 'frontend owned root removals failed');
}

async function prepareOwnedProducer(historicalCommit: boolean) {
  const repository = resolve(import.meta.dir, '../../../..');
  const root = await mkdtemp(join(tmpdir(), 'frontend-owned-provenance-'));
  const allocationDiagnostic = publishProvenanceRoot('provenance', 'allocated', root);
  console.error(JSON.stringify({ boundary: 'provenance-preparation', root, allocationDiagnostic }));
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
      rootDiagnostic: publishProvenanceRoot('provenance', 'prepared', root),
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
      await removeFrontendRoots(prepared.root, retained, removeProvenanceRoot);
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
      return mutateClosingEpoch(child, () => {
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
      });
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
        propagateClosingFailure(fault, returned);
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
    expect(packet['epoch']).toBe('fresh-main-20261105-ctt-0.13.0');
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
      await removeFrontendRoots(prepared.root, retained, (_owner, root) =>
        rm(root, { recursive: true }),
      );
    }
  }
}, 130000);
const CURRENT_REVERSALS = {
  'package.json': [
    [
      '    "configurable-tree-traversal": "0.13.0",\n',
      '    "configurable-tree-traversal": "0.12.0",\n',
    ],
  ],
  'bun.lock': [
    [
      '        "configurable-tree-traversal": "0.13.0",\n',
      '        "configurable-tree-traversal": "0.12.0",\n',
    ],
    [
      '    "configurable-tree-traversal": ["configurable-tree-traversal@0.13.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-7bEo36spuSbjIvDflzcr+DrZ9MQhZeYHRPW72rtQuL0KfgD5VGzIEMENLsgVTkn+JzqXIT/7qvl+J3Lbbl8vNA=="],\n',
      '    "configurable-tree-traversal": ["configurable-tree-traversal@0.12.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-AsAFLmDPdtEvYZ0sQPIgavYba8SKUgLqS+snyW0DlPE7wwYuXguj+UdvQRgbfPRvjWHVowFxaBowDX2otO+rlQ=="],\n',
    ],
  ],
} as const;

const HISTORICAL_REVERSALS = {
  'package.json': [
    ['  "name": "@puni-mono/workspace",\n', '  "name": "@puni/workspace",\n'],
    [
      '    "test:queued": "bin/test-queued.sh",\n',
      '    "test:queued": "bin/with-heavy-lock.sh -- nx run-many -t test",\n',
    ],
    ['    "@optique/core": "1.3.6",\n    "@optique/run": "1.3.6",\n', ''],
    ['    "application-exception": "0.9.0",\n', '    "application-exception": "0.7.0",\n'],
    [
      '    "caught-object-report-json": "15.0.0",\n',
      '    "caught-object-report-json": "13.0.0",\n',
    ],
    ['    "di-bag": "0.5.2",\n', '    "di-bag": "0.5.1",\n'],
    ['    "mmdb-lib": "3.0.3",\n', ''],
  ],
  'bun.lock': [
    ['        "@optique/core": "1.3.6",\n        "@optique/run": "1.3.6",\n', ''],
    ['        "application-exception": "0.9.0",\n', '        "application-exception": "0.7.0",\n'],
    [
      '        "caught-object-report-json": "15.0.0",\n',
      '        "caught-object-report-json": "13.0.0",\n',
    ],
    ['        "di-bag": "0.5.2",\n', '        "di-bag": "0.5.1",\n'],
    ['        "mmdb-lib": "3.0.3",\n', ''],
    [
      '    "@optique/core": ["@optique/core@1.3.6", "", {}, "sha512-BXVuVyxP9bg8FbyvBYrSHisnAeG3XTf1xcuUjAWgDWKfzZssMGbSrMdiv4tA+BK3+CrSo6no+uHWpiHh4HMKeg=="],\n\n    "@optique/run": ["@optique/run@1.3.6", "", { "dependencies": { "@optique/core": "1.3.6" } }, "sha512-uxlHO8vG/5ni1V+t+jdmYqiyYYY5uOevO/6U866oBpnlOxOGn2ZWIlPpDXAU3e5GRu4VecbeXoNff18yRDGoQw=="],\n\n',
      '',
    ],
    [
      '    "application-exception": ["application-exception@0.9.0", "", { "dependencies": { "caught-object-report-json": "^15.0.0", "nanoid": "^3.3.19" } }, "sha512-ly7CqHHmvqcQ2BnjdpX1wjEXi/jBBWy2ekBuDvkDOj3RlKeLC9zsU6e9pykFfIS/VzPHfhPGz0IXhOGHDcXesA=="],\n',
      '    "application-exception": ["application-exception@0.7.0", "", { "dependencies": { "caught-object-report-json": "^13.0.0", "nanoid": "^3.3.19" } }, "sha512-kxx0XcOZ2wDcW1/G/s9izPg5ESzuD2SzqAdbZ8wCVMibsGd9IRTvFBZYIi1Z3QGMnJJo41IGQ9/3dqJQ9j9RWA=="],\n',
    ],
    [
      '    "caught-object-report-json": ["caught-object-report-json@15.0.0", "", {}, "sha512-LUykHhgBgVLiIy4m3raMlIFrRH+LPvGUl4MqJHeVF3gryc21vtCJcCmC1vcH0fYqmEadrVkbhk/682YcjKkheg=="],\n',
      '    "caught-object-report-json": ["caught-object-report-json@13.0.0", "", {}, "sha512-iH0UiWMMlAcNWcCQUFH/fEexacjojkd2eXvVG/czarM7MsFLOKeTcmbZPa6X8aWtJh/EhmvstlKeEjfF5L+hAQ=="],\n',
    ],
    [
      '    "di-bag": ["di-bag@0.5.2", "", {}, "sha512-JzsbaXpNbRuYkGXaNwfPK+EmM2yR7lF7OVaXLFFnJN0K25lEGpr4Y2621pm/smYJyGp55yjhqwcAROJ5vLuWAQ=="],\n',
      '    "di-bag": ["di-bag@0.5.1", "", {}, "sha512-rzG0NI9/M+/F1lYDRs+Get/jqZ6+X3mKPqe96WgCDOa1CJrFY+5I1/T+Vfnw3ffEcLPy5YS9++tTksauLadw3w=="],\n',
    ],
    [
      '\n    "mmdb-lib": ["mmdb-lib@3.0.3", "", {}, "sha512-xQPoBXcNjjHiOvOraFBKtA++uNWF6aCVHL9dRKFXEov8eI3QJwtgiw3qApsonFT5SpoqsEVISUTg3HIDs2DiXw=="],\n',
      '',
    ],
  ],
} as const;

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
  // Reverse only the exact CTT pin and resolved lock identity before older historical hunks.
  let contents = Buffer.from(bytes).toString('utf8');
  for (const [present, prior] of CURRENT_REVERSALS[path]) {
    expect(contents.split(present).length - 1).toBe(1);
    contents = contents.replace(present, prior);
  }
  expect(describeBytes(Buffer.from(contents))).toEqual(PREVIOUS_MAIN_PAIR[path]);
  // Restore the reviewed CTT pair before removing its additions. Exact hashes
  // at both boundaries keep the owned negatives independent of CI history.
  for (const [present, prior] of HISTORICAL_REVERSALS[path]) {
    expect(contents.split(present).length - 1).toBe(1);
    contents = contents.replace(present, prior);
  }
  expect(describeBytes(Buffer.from(contents))).toEqual(CTT_PAIR[path]);
  for (const hunk of HISTORICAL_REMOVALS[path]) {
    expect(contents.split(hunk).length - 1).toBe(1);
    contents = contents.replace(hunk, '');
  }
  const reconstructed = Buffer.from(contents);
  expect(describeBytes(reconstructed)).toEqual(HISTORICAL_PAIR[path]);
  return reconstructed;
}

/** Test-owned existence observation; only exact ENOENT denotes a known already-removed root. */
async function hasFrontendCleanupRoot(root: string): Promise<boolean> {
  try {
    await access(root);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}

async function removeFrontendTestRoot(root: string): Promise<void> {
  if (await hasFrontendCleanupRoot(root)) await rm(root, { recursive: true });
}

type FrontendCleanupOutcome =
  | { readonly kind: 'returned'; readonly value: unknown }
  | { readonly kind: 'threw'; readonly failure: unknown };

const frontendCaptureCleanupCases = [
  'success',
  'primary-only',
  'cleanup-only-missing-root',
  'both-errors',
  'undefined-primary',
  'undefined-cleanup',
] as const;
test.each([...frontendCaptureCleanupCases])(
  'frontend cleanup accounting settled capture %s',
  async (fault) => {
    const root = await mkdtemp(join(tmpdir(), 'frontend-capture-cleanup-case-'));
    const value = Object.freeze({ marker: 'same private consumer object' });
    const primary: unknown =
      fault === 'undefined-primary' ? undefined : new Error('modeled private consumer refusal');
    const cleanup: unknown =
      fault === 'undefined-cleanup' ? undefined : new Error('modeled removal dependency refusal');
    const calls: string[] = [];
    let consumeCalls = 0;
    let cleanupCalls = 0;
    const cleanupFailures: unknown[] = [];
    try {
      let outcome: FrontendCleanupOutcome;
      try {
        const returned = await consumeSourceFrontendCapture(
          async () => {
            consumeCalls++;
            calls.push('consume');
            if (fault === 'cleanup-only-missing-root') await rm(root, { recursive: true });
            if (fault !== 'success' && fault !== 'cleanup-only-missing-root') throw primary;
            return value;
          },
          async () => {
            cleanupCalls++;
            calls.push('cleanup');
            try {
              await rm(root, { recursive: true });
              // These three dependency refusals are modeled after an actual successful root removal.
              if (
                fault === 'both-errors' ||
                fault === 'undefined-primary' ||
                fault === 'undefined-cleanup'
              )
                throw cleanup;
            } catch (failure) {
              cleanupFailures.push(failure);
              throw failure;
            }
          },
        );
        outcome = { kind: 'returned', value: returned };
      } catch (failure) {
        outcome = { kind: 'threw', failure };
      }
      expect(await hasFrontendCleanupRoot(root), 'required settled capture root removal').toBe(
        false,
      );
      expect(consumeCalls, 'settled consumer invocation count').toBe(1);
      expect(cleanupCalls, 'settled removal invocation count').toBe(1);
      expect(calls).toEqual(['consume', 'cleanup']);
      if (fault === 'success') {
        expect(outcome.kind).toBe('returned');
        if (outcome.kind !== 'returned') throw new Error('settled capture unexpectedly refused');
        expect(outcome.value === value, 'same consumer value after cleanup').toBe(true);
        expect(cleanupFailures).toHaveLength(0);
      } else {
        expect(outcome.kind).toBe('threw');
        if (outcome.kind !== 'threw') throw new Error('required settled capture refusal absent');
        if (fault === 'primary-only') {
          expect(outcome.failure === primary, 'original primary-only identity').toBe(true);
          expect(cleanupFailures).toHaveLength(0);
        } else {
          expect(cleanupFailures).toHaveLength(1);
          if (fault === 'cleanup-only-missing-root') {
            expect(
              outcome.failure === cleanupFailures[0],
              'original actual missing-root rejection identity',
            ).toBe(true);
            expect(
              outcome.failure instanceof Error &&
                'code' in outcome.failure &&
                outcome.failure.code === 'ENOENT',
              'actual missing-root refusal',
            ).toBe(true);
          } else {
            expect(
              outcome.failure instanceof AggregateError,
              'both settled failures retained privately',
            ).toBe(true);
            if (!(outcome.failure instanceof AggregateError))
              throw new Error('dual settled failure aggregate absent');
            expect(
              outcome.failure.message === 'settled frontend capture and removal failed',
              'fixed private aggregate message',
            ).toBe(true);
            expect(
              outcome.failure.errors[0] === primary,
              'original primary identity retained first',
            ).toBe(true);
            expect(
              outcome.failure.errors[1] === cleanupFailures[0],
              'original cleanup identity retained second',
            ).toBe(true);
            expect(outcome.failure.errors.length).toBe(2);
          }
        }
      }
    } finally {
      await removeFrontendTestRoot(root);
    }
  },
);

const frontendPairCleanupCases = [
  'both-success',
  'first-missing',
  'second-missing',
  'both-missing',
  'no-retained-producer',
] as const;
test.each([...frontendPairCleanupCases])(
  'frontend cleanup accounting settled roots %s',
  async (fault) => {
    const provenance = await mkdtemp(join(tmpdir(), 'frontend-provenance-cleanup-case-'));
    const producer =
      fault === 'no-retained-producer'
        ? undefined
        : await mkdtemp(join(tmpdir(), 'frontend-producer-cleanup-case-'));
    const calls: { owner: FrontendRootOwner; root: string }[] = [];
    const failures = new Map<FrontendRootOwner, unknown>();
    try {
      if (fault === 'first-missing' || fault === 'both-missing')
        await rm(provenance, { recursive: true });
      if (fault === 'second-missing' || fault === 'both-missing') {
        if (producer === undefined) throw new Error('required missing-producer fixture absent');
        await rm(producer, { recursive: true });
      }
      let outcome: FrontendCleanupOutcome;
      try {
        await removeFrontendRoots(provenance, producer, async (owner, root) => {
          calls.push({ owner, root });
          try {
            await rm(root, { recursive: true });
          } catch (failure) {
            failures.set(owner, failure);
            throw failure;
          }
        });
        outcome = { kind: 'returned', value: undefined };
      } catch (failure) {
        outcome = { kind: 'threw', failure };
      }
      expect(await hasFrontendCleanupRoot(provenance), 'required provenance root removal').toBe(
        false,
      );
      if (producer !== undefined)
        expect(
          await hasFrontendCleanupRoot(producer),
          'attempt-all producer root after provenance failure',
        ).toBe(false);
      expect(calls.map((call) => call.owner)).toEqual(
        producer === undefined ? ['provenance'] : ['provenance', 'producer'],
      );
      expect(calls.at(0)?.root === provenance, 'original provenance root argument').toBe(true);
      if (producer !== undefined)
        expect(calls.at(1)?.root === producer, 'original producer root argument').toBe(true);
      if (fault === 'both-success' || fault === 'no-retained-producer') {
        expect(outcome.kind).toBe('returned');
        expect(failures.size).toBe(0);
      } else {
        expect(outcome.kind).toBe('threw');
        if (outcome.kind !== 'threw') throw new Error('required root-removal refusal absent');
        if (fault === 'both-missing') {
          expect(failures.has('provenance')).toBe(true);
          expect(failures.has('producer')).toBe(true);
          expect(
            outcome.failure instanceof AggregateError,
            'both original root failures retained',
          ).toBe(true);
          if (!(outcome.failure instanceof AggregateError))
            throw new Error('dual root-removal aggregate absent');
          expect(
            outcome.failure.message === 'frontend owned root removals failed',
            'fixed private root aggregate message',
          ).toBe(true);
          expect(outcome.failure.errors.length).toBe(2);
          expect(
            outcome.failure.errors[0] === failures.get('provenance'),
            'first original removal identity',
          ).toBe(true);
          expect(
            outcome.failure.errors[1] === failures.get('producer'),
            'second original removal identity',
          ).toBe(true);
        } else {
          const owner = fault === 'first-missing' ? 'provenance' : 'producer';
          expect(failures.size).toBe(1);
          expect(failures.has(owner)).toBe(true);
          expect(
            outcome.failure === failures.get(owner),
            'single original removal failure identity',
          ).toBe(true);
        }
      }
    } finally {
      await removeFrontendTestRoot(provenance);
      if (producer !== undefined) await removeFrontendTestRoot(producer);
    }
  },
);
