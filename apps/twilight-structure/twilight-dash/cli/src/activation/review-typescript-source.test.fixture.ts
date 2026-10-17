import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import {
  ClassificationPolicy,
  hashBytes,
  hashCanonical,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterEach } from 'bun:test';

import { monotonicClock } from '../clock';
import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import { readReviewRuntime } from './review-runtime';
import * as ownership from './review-selection-objects';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  Bun.gc(true);
});
function git(repository: string, ...args: string[]) {
  const invocation = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args]);
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
export function fixture(
  format: 'sha1' | 'sha256' = 'sha1',
  runtimePaths = ['node_modules/pkg/index.d.ts', 'parser.js', 'private.txt'],
  files: Record<string, string | Uint8Array> = {
    'a.ts': 'export {};',
    'src/b.ts': 'export const b = 1;',
  },
  links: Record<string, string> = { link: 'a.ts' },
  runtimeContent: Uint8Array | Record<string, string | undefined> = Buffer.from('x'),
) {
  const root = mkdtempSync(join(tmpdir(), 'namespace-'));
  roots.push(root);
  const sourceRepository = join(root, 'source');
  const storeBase = join(root, 'store');
  const runtimeRoot = join(root, 'runtime');
  for (const path of [sourceRepository, storeBase, runtimeRoot]) mkdirSync(path, { mode: 0o700 });
  chmodSync(storeBase, 0o700);
  git(sourceRepository, 'init', '-q', `--object-format=${format}`);
  git(sourceRepository, 'config', 'user.email', 'test@example.invalid');
  git(sourceRepository, 'config', 'user.name', 'Test');
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(sourceRepository, path)), { recursive: true });
    writeFileSync(join(sourceRepository, path), bytes);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(sourceRepository, path)), { recursive: true });
    symlinkSync(target, join(sourceRepository, path));
  }
  git(sourceRepository, 'add', '--all');
  git(sourceRepository, 'commit', '-qm', 'candidate');
  const revision = git(sourceRepository, 'rev-parse', 'HEAD');
  const pin = 'a'.repeat(64);
  const binding = validateGitHubRepositoryBinding({
    repositoryId: 123,
    owner: 'example',
    name: 'review',
    targetRef: 'refs/heads/main',
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    readDeadlineMs: 10000,
  });
  const { request } = createActivationRequest({
    repositoryId: 123,
    subject: { kind: 'pull-request', number: 7 },
    targetRef: binding.targetRef,
    headSha: revision,
    baseSha: revision,
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    authorityIdentity: pin,
    auditGeneration: 1,
  });
  const baseline = parseOrThrow(
    ClassificationPolicy,
    JSON.parse(
      readFileSync(
        join(
          import.meta.dir,
          '../../../../twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
        ),
        'utf8',
      ),
    ),
  );
  const policy = parseOrThrow(ClassificationPolicy, {
    ...baseline,
    contentRules: baseline.contentRules.map((rule) => ({
      ...rule,
      include:
        rule.contentClass === 'source'
          ? Object.keys(files).map((path) => ({ kind: 'path', value: path }))
          : [{ kind: 'path', value: `unselected/${rule.contentClass}` }],
      exclude: [],
    })),
  });
  const owner = ownership.installLocalReviewSource({
    binding,
    sourceRepository,
    storeBase,
    gitExecutablePath: '/usr/bin/git',
    gitExecutableIdentity: hashBytes(readFileSync('/usr/bin/git')),
    gitObjectFormat: format,
    classificationPolicy: policy,
    maximumPreparationMs: 10000,
    monotonic: monotonicClock(),
    maximumCandidateEntries: 20,
    maximumCandidateBytes: 10000,
    maximumParserReads: 100,
    maximumParserReadBytes: 10000,
  });
  const prepared = owner.prepare(request);
  const candidate = owner.open(request, prepared.snapshotIdentity);
  const runtimeFiles = runtimePaths
    .map((path) => {
      mkdirSync(dirname(join(runtimeRoot, path)), { recursive: true });
      let bytes: Uint8Array;
      if (runtimeContent instanceof Uint8Array) bytes = runtimeContent;
      else {
        const text = runtimeContent[path];
        if (text === undefined) throw new Error('runtime fixture content absent');
        bytes = Buffer.from(text);
      }
      writeFileSync(join(runtimeRoot, path), bytes);
      return {
        path,
        role: path === 'parser.js' ? ('program' as const) : ('dependency' as const),
        identity: hashBytes(bytes),
        byteLength: bytes.byteLength,
      };
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const closure = {
    schemaVersion: 1,
    kind: 'review-runtime-closure',
    parserProgramIdentity: pin,
    compilerHostIdentity: pin,
    resolutionPolicyIdentity: 'b'.repeat(64),
    files: runtimeFiles,
  };
  const runtime = readReviewRuntime({
    runtimeRoot,
    candidateRoot: sourceRepository,
    closureBytes: Buffer.from(serializeCanonical(closure)),
    runtimeClosureIdentity: hashCanonical(closure),
    limits: {
      maximumManifestBytes: 10000,
      maximumEntries: 100,
      maximumPathBytes: 1024,
      maximumReads: 100,
      maximumBytes: 10000,
      maximumProbes: 1000,
      maximumReadBytes: 10000,
      maximumOwnedBytes: 10000,
    },
  });
  return { root, sourceRepository, storeBase, runtimeRoot, candidate, runtime };
}
