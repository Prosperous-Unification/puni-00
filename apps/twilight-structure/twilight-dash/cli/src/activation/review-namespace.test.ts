import * as fs from 'node:fs';
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
import { afterEach, expect, spyOn, test } from 'bun:test';

import { monotonicClock } from '../clock';
import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import { createRetainedNamespace, readRetainedNamespaceProvenance } from './review-namespace';
import * as runtimeModule from './review-runtime';
import { readReviewRuntime, readReviewRuntimeProvenance } from './review-runtime';
import * as ownership from './review-selection-objects';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(repository: string, ...args: string[]) {
  const invocation = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args]);
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
function fixture(
  format: 'sha1' | 'sha256' = 'sha1',
  runtimePaths = ['node_modules/pkg/index.d.ts', 'parser.js', 'private.txt'],
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
  writeFileSync(join(sourceRepository, 'a.ts'), 'export {};');
  symlinkSync('a.ts', join(sourceRepository, 'link'));
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
  const policy = parseOrThrow(
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
  const files = runtimePaths
    .map((path) => {
      mkdirSync(dirname(join(runtimeRoot, path)), { recursive: true });
      writeFileSync(join(runtimeRoot, path), 'x');
      return {
        path,
        role: path === 'parser.js' ? ('program' as const) : ('dependency' as const),
        identity: hashBytes(Buffer.from('x')),
        byteLength: 1,
      };
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const closure = {
    schemaVersion: 1,
    kind: 'review-runtime-closure',
    parserProgramIdentity: pin,
    compilerHostIdentity: pin,
    resolutionPolicyIdentity: 'b'.repeat(64),
    files,
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
const limits = {
  maximumEntries: 100,
  maximumNodes: 100,
  maximumPathBytes: 1024,
  maximumTotalPathBytes: 10000,
};

test.each(['sha1', 'sha256'] as const)(
  'retains %s exact tuples after source/store/runtime removal without content IO',
  (format) => {
    const f = fixture(format);
    rmSync(f.sourceRepository, { recursive: true });
    rmSync(f.storeBase, { recursive: true });
    rmSync(f.runtimeRoot, { recursive: true });
    const traps = [
      spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('forbidden fs');
      }),
      spyOn(fs, 'openSync').mockImplementation(() => {
        throw new Error('forbidden open');
      }),
      ...(
        [
          'statSync',
          'lstatSync',
          'readdirSync',
          'readlinkSync',
          'realpathSync',
          'existsSync',
        ] as const
      ).map((name) =>
        spyOn(fs, name).mockImplementation(() => {
          throw new Error('forbidden filesystem metadata');
        }),
      ),
      spyOn(Bun, 'spawnSync').mockImplementation(() => {
        throw new Error('forbidden Git');
      }),
    ];
    try {
      expect(() => fs.readFileSync('/forbidden')).toThrow('forbidden fs');
      expect(() => fs.openSync('/forbidden', 'r')).toThrow('forbidden open');
      expect(() => fs.statSync('/forbidden')).toThrow('forbidden filesystem metadata');
      expect(() => fs.lstatSync('/forbidden')).toThrow('forbidden filesystem metadata');
      expect(() => fs.readdirSync('/forbidden')).toThrow('forbidden filesystem metadata');
      expect(() => fs.readlinkSync('/forbidden')).toThrow('forbidden filesystem metadata');
      expect(() => fs.realpathSync('/forbidden')).toThrow('forbidden filesystem metadata');
      expect(() => fs.existsSync('/forbidden')).toThrow('forbidden filesystem metadata');
      expect(() => Bun.spawnSync(['/usr/bin/git'])).toThrow('forbidden Git');
      const namespace = createRetainedNamespace(f.candidate, f.runtime, limits);
      expect(namespace.workingDirectory).toBe('/__puni_review__/candidate');
      expect(namespace.libraryDirectory).toBe(
        '/__puni_review__/candidate/node_modules/typescript/lib',
      );
      expect(namespace.caseSensitive).toBe(true);
      expect(namespace.nodes.map((node) => node.path)).toEqual([
        '/',
        '/__puni_review__',
        '/__puni_review__/candidate',
        '/__puni_review__/candidate/a.ts',
        '/__puni_review__/candidate/link',
        '/__puni_review__/candidate/node_modules',
        '/__puni_review__/candidate/node_modules/pkg',
        '/__puni_review__/candidate/node_modules/pkg/index.d.ts',
      ]);
      expect(namespace.nodes.find((node) => node.kind === 'candidate-file')?.source).toEqual(
        f.candidate.snapshot.entries.find((entry) => entry.path === 'a.ts'),
      );
      expect(namespace.nodes.find((node) => node.kind === 'candidate-symlink')?.source).toEqual(
        f.candidate.snapshot.entries.find((entry) => entry.path === 'link'),
      );
      expect(namespace.nodes.find((node) => node.kind === 'runtime-file')?.source).toEqual(
        f.runtime.closure.files.find((file) => file.path.startsWith('node_modules/')),
      );
      expect(namespace).not.toHaveProperty('readFile');
      expect(namespace).not.toHaveProperty('realpath');
      const proof = readRetainedNamespaceProvenance(namespace);
      expect(proof.snapshotIdentity).toBe(
        ownership.readRetainedCandidateProvenance(f.candidate).snapshotIdentity,
      );
      expect(proof.classificationPolicyIdentity).toBe(
        ownership.readRetainedCandidateProvenance(f.candidate).classificationPolicyIdentity,
      );
      expect(proof.runtimeClosureIdentity).toBe(f.runtime.runtimeClosureIdentity);
      expect(Object.isFrozen(readReviewRuntimeProvenance(f.runtime))).toBe(true);
      expect(proof.runtimeTrust).toBe('unverified');
      expect(proof.resolutionPolicyIdentity).toBe('b'.repeat(64));
      expect(proof.namespacePolicyIdentity).toMatch(/^[0-9a-f]{64}$/);
      expect(proof.namespacePolicyIdentity).not.toBe(proof.resolutionPolicyIdentity);
      expect(Object.isFrozen(namespace)).toBe(true);
      expect(Object.isFrozen(namespace.nodes)).toBe(true);
      expect(Object.isFrozen(proof)).toBe(true);
      for (const node of namespace.nodes) {
        expect(Object.isFrozen(node)).toBe(true);
        if ('source' in node) {
          expect(Object.isFrozen(node.source)).toBe(true);
          expect(() => Object.assign(node.source, { path: '/changed' })).toThrow();
        }
      }
      expect(() => readRetainedNamespaceProvenance({ ...namespace })).toThrow(
        'owned retained namespace',
      );
      expect(() => Object.assign(namespace.nodes[3], { path: '/changed' })).toThrow();
    } finally {
      for (const trap of traps) trap.mockRestore();
    }
  },
);
test('rejects copied candidate before accessing either census', () => {
  const f = fixture();
  const fakeCandidate = {
    ...f.candidate,
    get snapshot() {
      throw new Error('candidate census accessed');
    },
  };
  expect(() => createRetainedNamespace(fakeCandidate, f.runtime, limits)).toThrow(
    'owned retained candidate',
  );
});
test('rejects copied runtime before accessing either census', () => {
  const f = fixture();
  const fakeRuntime = {
    ...f.runtime,
    get closure() {
      throw new Error('runtime census accessed');
    },
  };
  expect(() => createRetainedNamespace(f.candidate, fakeRuntime, limits)).toThrow(
    'owned review runtime',
  );
  expect(() => readReviewRuntimeProvenance({ ...f.runtime })).toThrow('owned review runtime');
});
test('rejects false-empty candidate census', () => {
  const f = fixture();
  expect(() =>
    createRetainedNamespace(
      { ...f.candidate, snapshot: { ...f.candidate.snapshot, entries: [] } },
      f.runtime,
      limits,
    ),
  ).toThrow('owned retained candidate');
});
test('rejects false-empty runtime census', () => {
  const f = fixture();
  expect(() =>
    createRetainedNamespace(
      f.candidate,
      { ...f.runtime, closure: { ...f.runtime.closure, files: [] } },
      limits,
    ),
  ).toThrow('owned review runtime');
});
// Inject malformed census at the authenticated metadata boundary: Git cannot emit these tuples.
function injectEntries(
  f: ReturnType<typeof fixture>,
  entries: readonly { path: string; mode: string; blob: string }[],
) {
  const proof = ownership.readRetainedCandidateProvenance(f.candidate);
  const trap = spyOn(ownership, 'readRetainedCandidateProvenance').mockReturnValue(proof);
  return {
    candidate: Object.freeze({
      ...f.candidate,
      snapshot: Object.freeze({
        ...f.candidate.snapshot,
        entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
      }),
    }) as ownership.RetainedCandidate,
    restore: () => {
      trap.mockRestore();
    },
  };
}
for (const path of [
  '',
  '/a',
  'a/',
  'a//b',
  '.',
  '..',
  'a/./b',
  'a/../b',
  'a\\b',
  'a\0b',
  'a\ud800b',
  'a\udc00b',
  '.git/config',
  'a/.git/x',
  'node_modules/a',
  'a/node_modules/x',
])
  test(`rejects candidate path ${JSON.stringify(path)}`, () => {
    const f = fixture();
    const injected = injectEntries(f, [{ path, mode: '100644', blob: 'a'.repeat(40) }]);
    try {
      expect(() => createRetainedNamespace(injected.candidate, f.runtime, limits)).toThrow(
        /namespace (path malformed|candidate path forbidden)/,
      );
    } finally {
      injected.restore();
    }
  });
for (const mode of ['160000', '040000', '100664'])
  test(`rejects unsupported candidate mode ${mode}`, () => {
    const f = fixture();
    const injected = injectEntries(f, [{ path: 'a', mode, blob: 'a'.repeat(40) }]);
    try {
      expect(() => createRetainedNamespace(injected.candidate, f.runtime, limits)).toThrow(
        'namespace candidate mode',
      );
    } finally {
      injected.restore();
    }
  });
test('rejects duplicate mounts and file or opaque symlink ancestors', () => {
  const f = fixture();
  for (const mode of ['100644', '120000'])
    for (const paths of [
      ['a', 'a'],
      ['a', 'a-b', 'a/child'],
    ]) {
      const injected = injectEntries(
        f,
        paths.map((path) => ({ path, mode, blob: 'a'.repeat(40) })),
      );
      try {
        expect(() => createRetainedNamespace(injected.candidate, f.runtime, limits)).toThrow(
          'namespace mount conflict',
        );
      } finally {
        injected.restore();
      }
    }
});
test('rejects visible runtime .git paths but excludes programs and other dependencies', () => {
  const f = fixture('sha1', ['node_modules/.git/config', 'parser.js']);
  expect(() => createRetainedNamespace(f.candidate, f.runtime, limits)).toThrow(
    'namespace runtime path forbidden',
  );
});
for (const bound of Object.keys(limits) as (keyof typeof limits)[])
  test(`validates ${bound} positive safe integer`, () => {
    const f = fixture();
    for (const value of [undefined, 0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        createRetainedNamespace(f.candidate, f.runtime, {
          ...limits,
          [bound]: value,
        }),
      ).toThrow('positive safe integer');
  });
test('counts all runtime entries before visibility filtering', () => {
  const f = fixture();
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumEntries: 4 }),
  ).toThrow('namespace entry ceiling');
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumEntries: 5 }),
  ).not.toThrow();
});
test('counts root and every derived directory in node ceiling', () => {
  const f = fixture();
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumNodes: 7 }),
  ).toThrow('namespace node ceiling');
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumNodes: 8 }),
  ).not.toThrow();
});
test('caps source and virtual paths before UTF8 or concatenation allocation', () => {
  const f = fixture();
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumPathBytes: 53 }),
  ).toThrow('namespace path ceiling');
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumPathBytes: 54 }),
  ).not.toThrow();
  const injected = injectEntries(f, [
    { path: 'x'.repeat(2000), mode: '100644', blob: 'a'.repeat(40) },
  ]);
  try {
    expect(() => createRetainedNamespace(injected.candidate, f.runtime, limits)).toThrow(
      'namespace path ceiling',
    );
  } finally {
    injected.restore();
  }
});
test('caps aggregate retained node and source path fields exactly', () => {
  const f = fixture();
  const namespace = createRetainedNamespace(f.candidate, f.runtime, limits);
  const count = namespace.nodes.reduce(
    (total, node) =>
      total +
      Buffer.byteLength(node.path) +
      ('source' in node ? Buffer.byteLength(node.source.path) : 0),
    0,
  );
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, {
      ...limits,
      maximumTotalPathBytes: count - 1,
    }),
  ).toThrow('namespace total path ceiling');
  expect(() =>
    createRetainedNamespace(f.candidate, f.runtime, { ...limits, maximumTotalPathBytes: count }),
  ).not.toThrow();
});
test('snapshots each installed limit once', () => {
  const f = fixture();
  const calls = new Map<string, number>();
  const installed = { ...limits };
  for (const bound of Object.keys(limits) as (keyof typeof limits)[])
    Object.defineProperty(installed, bound, {
      get() {
        const count = (calls.get(bound) ?? 0) + 1;
        calls.set(bound, count);
        return count === 1 ? limits[bound] : 1;
      },
    });
  expect(() => createRetainedNamespace(f.candidate, f.runtime, installed)).not.toThrow();
  expect([...calls.values()]).toEqual([1, 1, 1, 1]);
});

test('bounds code units before UTF8 measurement and bytes before grammar allocation', () => {
  const f = fixture();
  for (const path of ['x'.repeat(2000), 'é'.repeat(600)]) {
    const injected = injectEntries(f, [{ path, mode: '100644', blob: 'a'.repeat(40) }]);
    const measure = Buffer.byteLength.bind(Buffer);
    const split = String.prototype.split; // eslint-disable-line @typescript-eslint/unbound-method -- Capture the explicit-receiver grammar boundary before installing its trap.
    const byteTrap = spyOn(Buffer, 'byteLength').mockImplementation((text, ...args) => {
      if (text === path && path.length > 1024) throw new Error('forbidden UTF8 measurement');
      return measure(text, ...args);
    });
    const grammarTrap = spyOn(String.prototype, 'split').mockImplementation(function (
      this: string,
      ...args: Parameters<typeof split>
    ) {
      if (this === path) throw new Error('forbidden grammar allocation');
      return split.apply(this, args);
    });
    try {
      expect(() => createRetainedNamespace(injected.candidate, f.runtime, limits)).toThrow(
        'namespace path ceiling',
      );
    } finally {
      byteTrap.mockRestore();
      grammarTrap.mockRestore();
      injected.restore();
    }
  }
});
test('keeps programs outside compiler visibility even under node_modules', () => {
  const f = fixture('sha1', ['node_modules/pkg/index.d.ts', 'parser.js', 'private.txt']);
  // Inject only a role change after authentic runtime ownership, leaving file tuples immutable.
  const proof = readReviewRuntimeProvenance(f.runtime);
  const trap = spyOn(runtimeModule, 'readReviewRuntimeProvenance').mockReturnValue(proof);
  const runtime = Object.freeze({
    ...f.runtime,
    closure: Object.freeze({
      ...f.runtime.closure,
      files: Object.freeze(
        f.runtime.closure.files.map((file) => Object.freeze({ ...file, role: 'program' as const })),
      ),
    }),
  });
  try {
    expect(
      createRetainedNamespace(f.candidate, runtime, limits).nodes.some(
        (node) => node.kind === 'runtime-file',
      ),
    ).toBe(false);
  } finally {
    trap.mockRestore();
  }
});
test('sorts by UTF8 bytes, preserves case and copies exact tuples', () => {
  const f = fixture();
  const entries = ['é.ts', 'z.ts', 'Z.ts'].map((path) => ({
    path,
    mode: '100755',
    blob: 'a'.repeat(40),
  }));
  const injected = injectEntries(f, entries);
  try {
    const namespace = createRetainedNamespace(injected.candidate, f.runtime, limits);
    expect(
      namespace.nodes.filter((node) => node.kind === 'candidate-file').map((node) => node.path),
    ).toEqual([
      '/__puni_review__/candidate/Z.ts',
      '/__puni_review__/candidate/z.ts',
      '/__puni_review__/candidate/é.ts',
    ]);
    for (const node of namespace.nodes)
      if ('source' in node)
        expect(entries.includes(node.source as (typeof entries)[number])).toBe(false);
  } finally {
    injected.restore();
  }
});

test('does not call candidate or runtime content readers', () => {
  const f = fixture();
  const candidateProof = ownership.readRetainedCandidateProvenance(f.candidate);
  const runtimeProof = readReviewRuntimeProvenance(f.runtime);
  const candidateTrap = spyOn(ownership, 'readRetainedCandidateProvenance').mockReturnValue(
    candidateProof,
  );
  const runtimeTrap = spyOn(runtimeModule, 'readReviewRuntimeProvenance').mockReturnValue(
    runtimeProof,
  );
  const refuse = () => {
    throw new Error('forbidden retained content');
  };
  const candidate: ownership.RetainedCandidate = Object.freeze({
    ...f.candidate,
    read: refuse,
    readBlob: refuse,
    readHistorical: refuse,
  });
  const runtime: runtimeModule.ReviewRuntime = Object.freeze({ ...f.runtime, readFile: refuse });
  try {
    expect(() => candidate.readBlob('a', 'b')).toThrow('forbidden retained content');
    expect(() => runtime.readFile(f.runtime.closure.files[0])).toThrow(
      'forbidden retained content',
    );
    expect(() => createRetainedNamespace(candidate, runtime, limits)).not.toThrow();
  } finally {
    candidateTrap.mockRestore();
    runtimeTrap.mockRestore();
  }
});

test('validates hidden runtime source paths before filtering', () => {
  const f = fixture();
  const proof = readReviewRuntimeProvenance(f.runtime);
  const trap = spyOn(runtimeModule, 'readReviewRuntimeProvenance').mockReturnValue(proof);
  const runtime = Object.freeze({
    ...f.runtime,
    closure: Object.freeze({
      ...f.runtime.closure,
      files: Object.freeze([
        Object.freeze({
          ...f.runtime.closure.files[0],
          path: '../hidden.js',
          role: 'program' as const,
        }),
      ]),
    }),
  });
  try {
    expect(() => createRetainedNamespace(f.candidate, runtime, limits)).toThrow(
      'namespace path malformed',
    );
  } finally {
    trap.mockRestore();
  }
});
test('keeps namespace recipe identity independent of opaque resolution policy', () => {
  const f = fixture();
  const first = createRetainedNamespace(f.candidate, f.runtime, limits);
  const proof = readReviewRuntimeProvenance(f.runtime);
  const trap = spyOn(runtimeModule, 'readReviewRuntimeProvenance').mockReturnValue(
    Object.freeze({ ...proof, resolutionPolicyIdentity: 'c'.repeat(64) }),
  );
  try {
    const second = createRetainedNamespace(f.candidate, f.runtime, limits);
    expect(readRetainedNamespaceProvenance(second).namespacePolicyIdentity).toBe(
      readRetainedNamespaceProvenance(first).namespacePolicyIdentity,
    );
    expect(readRetainedNamespaceProvenance(second).resolutionPolicyIdentity).toBe('c'.repeat(64));
  } finally {
    trap.mockRestore();
  }
});

test('does not consult environment', () => {
  const f = fixture();
  const descriptor = Object.getOwnPropertyDescriptor(process, 'env');
  if (descriptor === undefined) throw new Error('environment descriptor absent');
  Object.defineProperty(process, 'env', {
    configurable: true,
    get() {
      throw new Error('forbidden environment');
    },
  });
  try {
    expect(() => process.env).toThrow('forbidden environment');
    expect(() => createRetainedNamespace(f.candidate, f.runtime, limits)).not.toThrow();
  } finally {
    Object.defineProperty(process, 'env', descriptor);
  }
});
