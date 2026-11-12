import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  type CompilerDerivativeMembers,
  hashBytes,
  hashCanonical,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterAll, beforeAll } from 'bun:test';

import {
  readReviewRuntime,
  type ReviewRuntimeInput,
  type ReviewRuntimeLimits,
} from './review-runtime';
import { fixture } from './review-typescript-source.test.fixture';

export const names = ['LICENSE.txt', 'NOTICE', 'compiler.cjs', 'manifest.json'] as const;
export const artifactLimits = {
  maximumMemberBytes: 10000000,
  maximumTotalBytes: 10000000,
  maximumOwnedBytes: 100000000,
  maximumLoadMilliseconds: 10000,
};
export const namespaceLimits = {
  maximumEntries: 100,
  maximumNodes: 100,
  maximumPathBytes: 1024,
  maximumTotalPathBytes: 10000,
};
export const sourceLimits = {
  maximumNodes: 100,
  maximumProbes: 10000,
  maximumSteps: 10000,
  maximumReads: 100,
  maximumReadBytes: 10000000,
  maximumReadEntries: 100,
  maximumReadLedgerBytes: 100000,
  maximumPathBytes: 1024,
  maximumTargetBytes: 1024,
  maximumExpandedPathBytes: 4096,
  maximumLinkExpansions: 20,
  maximumDirectoryDepth: 30,
  maximumPatterns: 200,
  maximumPatternBytes: 4096,
  maximumEnumeratedEntries: 1000,
  maximumReturnedPathBytes: 10000,
};
export let members: CompilerDerivativeMembers;
export const sourceIdentities: Record<string, string> = {};
let image: string | undefined;
beforeAll(() => {
  image = mkdtempSync(join(tmpdir(), 'derivative-cli-'));
  const packaging = join(image, 'cli/src/packaging');
  mkdirSync(packaging, { recursive: true });
  symlinkSync(
    resolve(import.meta.dir, '../../../../../../node_modules'),
    join(image, 'node_modules'),
  );
  for (const file of [
    'compiler-derivative-cli.ts',
    'compiler-derivative.ts',
    'compiler-derivative-pins.ts',
  ]) {
    const source = resolve(
      import.meta.dir,
      '../../../../twilight-burokrat/cli/src/packaging',
      file,
    );
    sourceIdentities[file] = hashBytes(readFileSync(source));
    copyFileSync(source, join(packaging, file));
    if (hashBytes(readFileSync(join(packaging, file))) !== sourceIdentities[file])
      throw new Error('source image bytes differ');
  }
  const directory = join(image, 'cli/dist/compiler-derivative');
  if (existsSync(directory)) throw new Error('fixture destination already exists');
  const child = Bun.spawnSync([process.execPath, join(packaging, 'compiler-derivative-cli.ts')]);
  if (child.exitCode !== 0)
    throw new Error(`owning derivative CLI failed: ${child.stderr.toString()}`);
  console.info(JSON.stringify({ owningCliSourceIdentities: sourceIdentities }));
  members = {
    'LICENSE.txt': readFileSync(join(directory, 'LICENSE.txt')),
    NOTICE: readFileSync(join(directory, 'NOTICE')),
    'compiler.cjs': readFileSync(join(directory, 'compiler.cjs')),
    'manifest.json': readFileSync(join(directory, 'manifest.json')),
  };
  console.info(
    JSON.stringify({
      owningCliRawMembers: names.map((path) => ({
        path,
        identity: hashBytes(members[path]),
        byteLength: members[path].byteLength,
      })),
    }),
  );
});
afterAll(() => {
  if (image !== undefined) rmSync(image, { recursive: true, force: true });
});

export function runtimeFixture(
  options: {
    change?: (
      files: {
        path: string;
        role: 'program' | 'dependency';
        identity: string;
        byteLength: number;
      }[],
      bytes: Record<string, Uint8Array | undefined>,
    ) => void;
    limits?: Partial<ReviewRuntimeLimits>;
    beforeCapture?: (input: ReviewRuntimeInput) => void;
  } = {},
) {
  const f = fixture(
    'sha1',
    ['parser.js'],
    { 'a.ts': 'export {};', 'tsconfig.json': '{"files":["a.ts"]}' },
    {},
  );
  const bytes: Record<string, Uint8Array | undefined> = {
    'parser.js': Buffer.from('P'),
    'zz-sentinel.txt': Buffer.from('S'),
  };
  for (const path of names) bytes[`compiler-derivative/${path}`] = members[path];
  const files = Object.entries(bytes).map(([path, content]) => {
    if (content === undefined) throw new Error('fixture bytes absent');
    return {
      path,
      role:
        path === 'parser.js' || path === 'compiler-derivative/compiler.cjs'
          ? ('program' as const)
          : ('dependency' as const),
      identity: hashBytes(content),
      byteLength: content.byteLength,
    };
  });
  options.change?.(files, bytes);
  files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  for (const file of files) {
    const content = bytes[file.path];
    if (content === undefined) throw new Error('fixture bytes absent');
    mkdirSync(dirname(join(f.runtimeRoot, file.path)), { recursive: true });
    writeFileSync(join(f.runtimeRoot, file.path), content);
  }
  const closure = {
    schemaVersion: 1,
    kind: 'review-runtime-closure',
    parserProgramIdentity: 'a'.repeat(64),
    compilerHostIdentity: 'a'.repeat(64),
    resolutionPolicyIdentity: 'b'.repeat(64),
    files,
  };
  const input: ReviewRuntimeInput = {
    runtimeRoot: f.runtimeRoot,
    candidateRoot: f.sourceRepository,
    closureBytes: Buffer.from(serializeCanonical(closure)),
    runtimeClosureIdentity: hashCanonical(closure),
    limits: {
      maximumManifestBytes: 10000,
      maximumEntries: 100,
      maximumPathBytes: 1024,
      maximumReads: 100,
      maximumBytes: 100000000,
      maximumProbes: 1000,
      maximumReadBytes: 100000000,
      maximumOwnedBytes: 100000000,
      ...options.limits,
    },
  };
  options.beforeCapture?.(input);
  const runtime = readReviewRuntime(input);
  const sentinel = runtime.closure.files.find((file) => file.path === 'zz-sentinel.txt');
  if (sentinel === undefined) throw new Error('sentinel absent');
  return { ...f, runtime, input, sentinel };
}
