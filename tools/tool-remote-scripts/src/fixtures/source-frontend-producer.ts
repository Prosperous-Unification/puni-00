import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import type { ParticipantHttpObservation } from '../lib/dependency-participant-health';
import { readFields } from '../lib/managed-cohort';
import { SOURCE_FRONTEND_PRODUCER_PROGRAM } from './source-frontend-producer-program';

const ROOT = resolve(import.meta.dir, '../../../..');
const CURATED = [
  'apps/wbs/fe-01',
  'libs/wbs/domain',
  'libs/shared/domain',
  'libs/shared/adapters/ui-core-01',
  'libs/shared/adapters/ui-saas-01',
  'package.json',
  'bun.lock',
  'tsconfig.base.json',
  'nx.json',
];
// These reviewed tuples select this producer epoch; they are not the full installed producer closure.
const PINS = {
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
  'bun.lock': {
    bytes: 533044,
    sha256: 'bf54a6c6202a5d8f54f9bb8fe7e76935a8f4c667c660da720db3fd5f16391383',
  },
  'package.json': {
    bytes: 4885,
    sha256: 'bf45a6e5f8f806d2762dfb22af77375a9ad55d806781a34812812de31f07eb74',
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
};
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function git(args: string[], input?: Buffer): Buffer {
  const child = Bun.spawnSync(['git', ...args], {
    cwd: ROOT,
    stdin: input,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15000,
  });
  if (
    !child.success ||
    child.signalCode !== undefined ||
    child.stdout.byteLength > 32 * 1024 * 1024
  )
    throw new Error('curated producer Git read failed');
  return child.stdout;
}
async function inspectPins(): Promise<void> {
  for (const [path, expected] of Object.entries(PINS)) {
    const bytes = await readFile(join(ROOT, path));
    if (bytes.byteLength !== expected.bytes || digest(bytes) !== expected.sha256)
      throw new Error('unsupported source frontend producer inputs');
  }
}
function readObservation(
  observation: unknown,
  index: number,
  body: string,
): ParticipantHttpObservation {
  const responses = readFields(observation)['responses'];
  if (!Array.isArray(responses) || responses.length !== 2)
    throw new Error('producer response census differs');
  const response = readFields(responses[index]);
  const headers = readFields(response['headers']);
  const lifecycle = readFields(response['lifecycle']);
  if (
    response['status'] !== 200 ||
    response['complete'] !== true ||
    lifecycle['requestClosed'] !== true ||
    lifecycle['responseClosed'] !== true ||
    typeof headers['content-type'] !== 'string'
  )
    throw new Error('producer HTTP custody differs');
  return { status: 200, contentType: headers['content-type'], body };
}

/** Captures only tracked public blobs in the admitted layout, then joins the actual Node/Vite child and both pipes before invoking a consumer. Unknown producer/cleanup outcomes retain scratch and throw. */
export async function withSourceFrontendProducer<T>(
  consume: (
    observations: { document: ParticipantHttpObservation; entry: ParticipantHttpObservation },
    directory: string,
  ) => Promise<T>,
): Promise<T> {
  await inspectPins();
  const directory = await mkdtemp(join(tmpdir(), 'puni-source-frontend-wire-'));
  let settled = false;
  try {
    const snapshot = join(directory, 'snapshot');
    await mkdir(snapshot);
    const listing = git(['ls-tree', '-rz', '--full-tree', 'HEAD', ...CURATED]).toString();
    const entries = listing
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
        if (match === null) throw new Error('unsupported curated producer entry');
        const mode = match.at(1),
          blob = match.at(2),
          path = match.at(3);
        if (
          mode === undefined ||
          blob === undefined ||
          path === undefined ||
          isAbsolute(path) ||
          path.split('/').includes('..')
        )
          throw new Error('invalid curated producer path');
        return { mode, blob, path };
      })
      .filter(({ path }) => !basename(path).startsWith('.env'));
    const bytes = git(
      ['cat-file', '--batch'],
      Buffer.from(entries.map(({ blob }) => blob + '\n').join('')),
    );
    let offset = 0;
    const sourcePins: Record<string, { gitBlob: string; bytes: number; sha256: string }> = {};
    for (const { mode, blob, path } of entries) {
      const end = bytes.indexOf(10, offset);
      const header = /^([a-f0-9]{40}) blob (\d+)$/.exec(bytes.subarray(offset, end).toString());
      const length = Number(header?.[2]);
      if (
        end < 0 ||
        header?.[1] !== blob ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        end + 2 + length > bytes.byteLength
      )
        throw new Error('invalid curated Git blob');
      const content = bytes.subarray(end + 1, end + 1 + length);
      offset = end + 2 + length;
      if (bytes[offset - 1] !== 10 || content.byteLength !== length)
        throw new Error('incomplete curated Git blob');
      const pathToWrite = join(snapshot, path);
      await mkdir(dirname(pathToWrite), { recursive: true });
      await writeFile(pathToWrite, content);
      await chmod(pathToWrite, mode === '100755' ? 0o755 : 0o644);
      sourcePins[path] = { gitBlob: blob, bytes: length, sha256: digest(content) };
    }
    if (offset !== bytes.byteLength || entries.length === 0)
      throw new Error('curated Git census differs');
    await mkdir(join(snapshot, 'node_modules'));
    for (const name of await readdir(join(ROOT, 'node_modules')))
      if (!name.startsWith('.'))
        await symlink(join(ROOT, 'node_modules', name), join(snapshot, 'node_modules', name));
    const frontend = join(snapshot, 'apps/wbs/fe-01');
    await writeFile(
      join(frontend, '.env'),
      'VITE_BE_URL=http://127.0.0.1:9\nVITE_GW_URL=ws://127.0.0.1:9\n',
      { mode: 0o600 },
    );
    await writeFile(join(directory, 'probe.mjs'), SOURCE_FRONTEND_PRODUCER_PROGRAM);
    await writeFile(
      join(directory, 'source-manifest.json'),
      JSON.stringify(
        {
          head: git(['rev-parse', 'HEAD']).toString().trim(),
          files: sourcePins,
          selectedInputs: PINS,
          excluded: 'all tracked basenames beginning .env; ignored/private env never enumerated',
          fakeEnv: ['VITE_BE_URL=http://127.0.0.1:9', 'VITE_GW_URL=ws://127.0.0.1:9'],
        },
        null,
        2,
      ),
    );
    const selectedNode = Bun.which('node');
    if (selectedNode === null) throw new Error('Node producer runtime absent');
    const resolvedNode = Bun.spawnSync([selectedNode, '-p', 'process.execPath'], {
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    if (!resolvedNode.success || resolvedNode.signalCode !== undefined)
      throw new Error('Node producer resolution failed');
    const node = resolvedNode.stdout.toString().trim();
    if (!isAbsolute(node) || node.includes('\n'))
      throw new Error('Node producer resolution malformed');
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
      timeout: 90000,
      killSignal: 'SIGKILL',
    });
    await writeFile(join(directory, 'stdout.log'), child.stdout);
    await writeFile(join(directory, 'stderr.log'), child.stderr);
    await writeFile(
      join(directory, 'supervisor.json'),
      JSON.stringify(
        {
          node,
          exit: child.exitCode,
          signal: child.signalCode,
          elapsedMs: performance.now() - started,
          childAndPipesJoined: true,
          timeoutMs: 90000,
        },
        null,
        2,
      ),
    );
    if (!child.success || child.signalCode !== undefined)
      throw new Error('actual frontend producer failed or custody unproved');
    const observation: unknown = JSON.parse(
      await readFile(join(directory, 'observation.json'), 'utf8'),
    );
    const cleanup = readFields(readFields(observation)['cleanup']);
    if (
      cleanup['closeReturned'] !== true ||
      cleanup['explicitWatcherCloseReturned'] !== true ||
      cleanup['httpListening'] !== false ||
      cleanup['watcherClosed'] !== true ||
      cleanup['watchedDirectoryCount'] !== 0
    )
      throw new Error('actual frontend producer cleanup unproved');
    for (const [path, expected] of Object.entries(sourcePins)) {
      const content = await readFile(join(snapshot, path));
      if (content.byteLength !== expected.bytes || digest(content) !== expected.sha256)
        throw new Error('curated source changed');
    }
    await inspectPins();
    const document = new TextDecoder('utf-8', { fatal: true }).decode(
      await readFile(join(directory, 'index.response.html')),
    );
    const entry = new TextDecoder('utf-8', { fatal: true }).decode(
      await readFile(join(directory, 'main.response.js')),
    );
    const observations = {
      document: readObservation(observation, 0, document),
      entry: readObservation(observation, 1, entry),
    };
    // A legitimate new producer output is unsupported; no repinning or normalization here.
    if (
      digest(Buffer.from(document)) !==
        '09ab3b528f1a147d34addea248fa08925801d66ee9f384bb634112b9abc30e2f' ||
      digest(Buffer.from(entry)) !==
        'e990c7ae6b545d4177b27560878bd41d34843b32109a21af190794d73e45ee08'
    )
      throw new Error('actual source frontend transported text unsupported');
    settled = true;
    return await consume(observations, directory);
  } catch (cause) {
    if (!settled) throw new Error(`frontend producer scratch retained: ${directory}`, { cause });
    throw cause;
  } finally {
    if (settled) await rm(directory, { recursive: true });
  }
}
