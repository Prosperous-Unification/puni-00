import * as filesystem from 'node:fs';
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
  extractDeclaredRelationships,
  hashBytes,
  hashCanonical,
  RelationshipRequest,
} from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { monotonicClock } from '../clock';
import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import { extractRetainedDeclarations, type RetainedDeclarationInput } from './review-declarations';
import { installLocalReviewSource } from './review-selection-objects';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function fixture(gitObjectFormat: 'sha1' | 'sha256' = 'sha1') {
  const root = mkdtempSync(join(tmpdir(), 'review-owned-'));
  roots.push(root);
  const sourceRepository = join(root, 'source');
  const storeBase = join(root, 'owned');
  mkdirSync(sourceRepository, { mode: 0o700 });
  mkdirSync(storeBase, { mode: 0o700 });
  chmodSync(storeBase, 0o700);
  git(sourceRepository, 'init', '--quiet', `--object-format=${gitObjectFormat}`);
  git(sourceRepository, 'config', 'user.email', 'test@example.invalid');
  git(sourceRepository, 'config', 'user.name', 'Test');
  writeFileSync(join(sourceRepository, 'README.md'), '# exact base\n');
  git(sourceRepository, 'add', '--all');
  git(sourceRepository, 'commit', '--quiet', '-m', 'base');
  const baseSha = git(sourceRepository, 'rev-parse', 'HEAD');
  writeFileSync(join(sourceRepository, 'src.ts'), 'export const exact = 1;\n');
  git(sourceRepository, 'add', '--all');
  git(sourceRepository, 'commit', '--quiet', '-m', 'head');
  const headSha = git(sourceRepository, 'rev-parse', 'HEAD');
  const pin = 'a'.repeat(64);
  const binding = validateGitHubRepositoryBinding({
    repositoryId: 123,
    owner: 'example',
    name: 'review',
    targetRef: 'refs/heads/main',
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    readDeadlineMs: 10_000,
  });
  const { request } = createActivationRequest({
    repositoryId: binding.repositoryId,
    subject: { kind: 'pull-request', number: 7 },
    targetRef: binding.targetRef,
    headSha,
    baseSha,
    policyIdentity: binding.policyIdentity,
    mappingIdentity: binding.mappingIdentity,
    toolkitIdentity: binding.toolkitIdentity,
    authorityIdentity: 'b'.repeat(64),
    auditGeneration: 1,
  });
  const classificationBytes = readFileSync(
    join(
      import.meta.dir,
      '../../../../twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
    ),
  );
  const classificationPolicy = parseOrThrow(
    ClassificationPolicy,
    JSON.parse(classificationBytes.toString()),
  );
  return {
    request,
    binding,
    sourceRepository,
    storeBase,
    classificationPolicy,
    gitExecutablePath: '/usr/bin/git',
    gitExecutableIdentity: hashBytes(readFileSync('/usr/bin/git')),
    gitObjectFormat,
    maximumPreparationMs: 10_000,
    monotonic: monotonicClock(),
    maximumCandidateEntries: 10,
    maximumCandidateBytes: 1024,
    maximumParserReads: 100,
    maximumParserReadBytes: 10_000,
  };
}

function refuseAmbientReads(): () => void {
  const probes = [
    spyOn(Bun, 'spawnSync'),
    spyOn(Bun, 'spawn'),
    spyOn(filesystem, 'readFileSync'),
    spyOn(filesystem, 'existsSync'),
    spyOn(filesystem, 'statSync'),
    spyOn(filesystem, 'lstatSync'),
    spyOn(filesystem, 'readdirSync'),
    spyOn(filesystem, 'realpathSync'),
    spyOn(filesystem, 'openSync'),
  ];
  const refuse = () => {
    throw new Error('forbidden ambient read or execution');
  };
  const refuseNative = Object.assign(refuse, { native: refuse });
  for (const probe of probes) probe.mockImplementation(refuseNative);
  return () => {
    for (const probe of probes) probe.mockRestore();
  };
}

const extractorBytes = readFileSync(
  join(import.meta.dir, '../../../../twilight-burokrat/cli/src/relationships/declarations.ts'),
);
const extractor = {
  extractorId: 'relationship-declarations',
  version: 'v1',
  blob: hashCanonical({ implementation: extractorBytes.toString('base64'), version: 1 }),
};
const nx = { projects: [], dependencies: [], targets: [] };
const limits = {
  maximumDeclarationPaths: 8,
  maximumDeclarationBytes: 16384,
  maximumDeclarationFacts: 32,
  maximumHistoricalSelections: 8,
  maximumReads: 128,
  maximumReadBytes: 65536,
  maximumOutputBytes: 65536,
};

function declarationFixture(
  format: 'sha1' | 'sha256' = 'sha1',
  mutate?: (repository: string, facts: Record<string, unknown>[]) => void,
  declarationPath = 'relationships.json',
) {
  const input = fixture(format);
  const revision = git(input.sourceRepository, 'rev-parse', 'HEAD');
  const historicalBlob = git(input.sourceRepository, 'rev-parse', `${revision}:src.ts`);
  writeFileSync(join(input.sourceRepository, 'src.ts'), 'export const exact = 3;\n');
  writeFileSync(join(input.sourceRepository, '.env.example'), 'PORT=3100\n');
  symlinkSync('.env.example', join(input.sourceRepository, 'env-link'));
  const currentBlob = git(input.sourceRepository, 'hash-object', '.env.example');
  const facts: Record<string, unknown>[] = [
    {
      factId: 'old',
      family: 'generated',
      kind: 'generated-blob',
      at: { kind: 'historical', revision },
      path: 'src.ts',
      expectedBlob: historicalBlob,
    },
    {
      factId: 'port',
      family: 'ports',
      kind: 'port',
      at: { kind: 'current' },
      path: 'env-link',
      name: 'PORT',
      expected: 3100,
    },
    {
      factId: 'blob',
      family: 'generated',
      kind: 'generated-blob',
      at: { kind: 'current' },
      path: 'env-link',
      expectedBlob: currentBlob,
    },
  ];
  mutate?.(input.sourceRepository, facts);
  writeFileSync(
    join(input.sourceRepository, 'relationships.json'),
    JSON.stringify({
      schemaVersion: 1,
      declarationId: 'selected',
      selectorVersion: 1,
      coverage: 'selected-facts-only',
      facts,
      edges: [],
    }),
  );
  symlinkSync('relationships.json', join(input.sourceRepository, 'declaration-spare.json'));
  if (declarationPath !== 'relationships.json')
    symlinkSync('relationships.json', join(input.sourceRepository, declarationPath));
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'declared head');
  const { requestIdentity: _identity, schemaVersion: _version, ...fields } = input.request;
  const request = createActivationRequest({
    ...fields,
    headSha: git(input.sourceRepository, 'rev-parse', 'HEAD'),
  }).request;
  const selected = parseOrThrow(RelationshipRequest, {
    schemaVersion: 1,
    declarationPaths: [declarationPath],
    typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src.ts'] },
  });
  const { request: _request, ...configuration } = input;
  const history = {
    ...limits,
    request: selected,
    policyIdentity: 'c'.repeat(64),
    maximumHistoricalRevisions: 8,
    maximumHistoricalTreeDepth: 8,
    maximumHistoricalProofEdges: 64,
    maximumRetainedObjects: 100,
    maximumObjectBytes: 65536,
    maximumRetainedBytes: 131072,
    maximumHistoricalManifestBytes: 65536,
    assertOwner: () => undefined,
  };
  const classificationPolicy = {
    ...configuration.classificationPolicy,
    contentRules: configuration.classificationPolicy.contentRules.map((rule) =>
      rule.contentClass === 'config'
        ? {
            ...rule,
            exclude: [
              ...rule.exclude,
              { kind: 'segment' as const, value: 'generated' },
              { kind: 'segment' as const, value: 'vendor' },
            ],
          }
        : rule,
    ),
  };
  const owner = installLocalReviewSource({
    ...configuration,
    classificationPolicy,
    maximumCandidateEntries: 100,
    maximumCandidateBytes: 65536,
    maximumParserReads: 1024,
    maximumParserReadBytes: 1048576,
    history,
  });
  const prepared = owner.prepare(request);
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  const extraction: RetainedDeclarationInput = {
    candidate,
    request: selected,
    extractorBytes,
    extractor,
    gitObjectFormat: format,
    nx,
    limits,
  };
  return { input, request, selected, candidate, extraction, owner, prepared };
}

test.each(['sha1', 'sha256'] as const)(
  'retained %s declarations equal legacy after source removal without ambient reads',
  (format) => {
    const fixture = declarationFixture(format);
    const legacy = extractDeclaredRelationships(
      fixture.input.sourceRepository,
      fixture.input.sourceRepository,
      fixture.candidate.snapshot,
      fixture.selected,
      nx,
    );
    rmSync(fixture.input.sourceRepository, { recursive: true });
    const restoreReads = refuseAmbientReads();
    try {
      const extracted = extractRetainedDeclarations(fixture.extraction);
      expect(extracted).toEqual(legacy);
      expect(extracted.relationships.facts.find(({ factId }) => factId === 'port')?.actual).toBe(
        3100,
      );
    } finally {
      restoreReads();
    }
  },
);

test('retained declarations refuse legacy null history before reading', () => {
  const fixture = declarationFixture();
  const legacy = fixture.owner.open(
    fixture.request,
    fixture.prepared.snapshotIdentity,
    fixture.prepared.historyIdentity,
  );
  expect(() =>
    extractRetainedDeclarations({ ...fixture.extraction, candidate: { ...legacy, history: null } }),
  ).toThrow('complete history');
});

test.each(['bytes', 'id', 'version', 'blob'] as const)(
  'retained declarations refuse changed extractor %s',
  (field) => {
    const fixture = declarationFixture();
    const input =
      field === 'bytes'
        ? { ...fixture.extraction, extractorBytes: Buffer.from('changed extractor') }
        : {
            ...fixture.extraction,
            extractor: { ...extractor, [field === 'id' ? 'extractorId' : field]: 'changed' },
          };
    expect(() => extractRetainedDeclarations(input)).toThrow('extractor identity differs');
  },
);

test('retained declarations refuse an invalid pinned Git format', () => {
  const fixture = declarationFixture();
  expect(() =>
    extractRetainedDeclarations({ ...fixture.extraction, gitObjectFormat: 'md5' }),
  ).toThrow('Git object format unsupported');
});

test.each(['census', 'provenance', 'digest', 'proofs'] as const)(
  'retained declarations refuse changed history %s',
  (fault) => {
    const fixture = declarationFixture();
    const history = structuredClone(fixture.candidate.history);
    if (history === null) throw new Error('fixture history absent');
    if (fault === 'census') history.selections = [];
    if (fault === 'provenance') history.selections[0].uses = [];
    if (fault === 'digest') history.historicalSelectionsIdentity = 'f'.repeat(64);
    if (fault === 'proofs') history.proofs = [];
    expect(() =>
      extractRetainedDeclarations({
        ...fixture.extraction,
        candidate: { ...fixture.candidate, history },
      }),
    ).toThrow('history census differs');
  },
);

for (const limit of Object.keys(limits) as (keyof typeof limits)[]) {
  test(`retained declarations refuse invalid ${limit}`, () => {
    const fixture = declarationFixture();
    expect(() =>
      extractRetainedDeclarations({
        ...fixture.extraction,
        limits: { ...limits, [limit]: Number.NaN },
      }),
    ).toThrow('positive safe integer');
  });
}

test.each([
  ['maximumDeclarationPaths', 'path'],
  ['maximumDeclarationBytes', 'byte'],
  ['maximumDeclarationFacts', 'fact'],
  ['maximumReads', 'read count'],
  ['maximumReadBytes', 'read byte'],
  ['maximumOutputBytes', 'output byte'],
] as const)('retained declarations enforce %s', (limit, diagnostic) => {
  const fixture = declarationFixture();
  const request =
    limit === 'maximumDeclarationPaths'
      ? { ...fixture.selected, declarationPaths: ['relationships.json', 'declaration-spare.json'] }
      : fixture.selected;
  expect(() =>
    extractRetainedDeclarations({
      ...fixture.extraction,
      request,
      limits: { ...limits, [limit]: 1 },
    }),
  ).toThrow(diagnostic);
});

test('retained declarations preserve BOM filenames through current symlinks', () => {
  const fixture = declarationFixture('sha256', (repository, facts) => {
    writeFileSync(join(repository, '\uFEFFauthority.txt'), 'PORT=3100\n');
    rmSync(join(repository, 'env-link'));
    symlinkSync('\uFEFFauthority.txt', join(repository, 'env-link'));
    facts.pop();
  });
  const legacy = extractDeclaredRelationships(
    fixture.input.sourceRepository,
    fixture.input.sourceRepository,
    fixture.candidate.snapshot,
    fixture.selected,
    nx,
  );
  rmSync(fixture.input.sourceRepository, { recursive: true });
  expect(extractRetainedDeclarations(fixture.extraction)).toEqual(legacy);
});

test.each(['escape', 'cycle', 'missing', 'absolute', 'malformed'] as const)(
  'retained declarations refuse a current symlink %s without ambient reads',
  (fault) => {
    const fixture = declarationFixture();
    rmSync(fixture.input.sourceRepository, { recursive: true });
    const targets = {
      escape: '../outside',
      cycle: 'env-link',
      missing: 'missing.env',
      absolute: '/etc/passwd',
      malformed: '',
    };
    // Inject malformed retained dependency bytes after real capture: acquisition rejects these links earlier.
    const candidate = {
      ...fixture.candidate,
      readBlob: (blob: string, path: string) =>
        path === 'env-link'
          ? fault === 'malformed'
            ? Uint8Array.of(255)
            : Buffer.from(targets[fault])
          : fixture.candidate.readBlob(blob, path),
    };
    expect(() => extractRetainedDeclarations({ ...fixture.extraction, candidate })).toThrow(
      {
        escape: 'escapes candidate',
        cycle: 'symlink cycle',
        missing: 'absent',
        absolute: 'target invalid',
        malformed: 'symlink malformed',
      }[fault],
    );
  },
);

function write(repository: string, path: string, source: string): void {
  const absolutePath = join(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

function currentFacts(repository: string): Record<string, unknown>[] {
  return [
    {
      factId: 'script.gate',
      family: 'scripts',
      at: { kind: 'current' },
      kind: 'package-script',
      path: 'package.json',
      name: 'gate',
      expected: 'nx run app:check',
    },
    {
      factId: 'ci.gate',
      family: 'ci',
      at: { kind: 'current' },
      kind: 'ci-step-command',
      path: '.github/workflows/ci.yml',
      job: 'gate',
      step: 'Gate',
      expected: 'bun run gate',
    },
    {
      factId: 'hook.gate',
      family: 'hooks',
      at: { kind: 'current' },
      kind: 'hook-command',
      path: 'lefthook.yml',
      hook: 'pre-commit',
      command: 'gate',
      expected: 'bun run gate',
    },
    {
      factId: 'docker.expose',
      family: 'docker',
      at: { kind: 'current' },
      kind: 'docker-instruction',
      path: 'Dockerfile',
      stage: 'runtime',
      instruction: 'EXPOSE',
      ordinal: 1,
      expected: '3100',
    },
    {
      factId: 'generated.openapi',
      family: 'generated',
      at: { kind: 'current' },
      kind: 'generated-blob',
      path: 'generated/openapi.json',
      expectedBlob: git(repository, 'hash-object', 'generated/openapi.json'),
    },
    {
      factId: 'environment.auth-mode',
      family: 'environment',
      at: { kind: 'current' },
      kind: 'environment-variable',
      path: '.env.example',
      name: 'AUTH_MODE',
      expected: 'local',
    },
    {
      factId: 'port.backend',
      family: 'ports',
      at: { kind: 'current' },
      kind: 'port',
      path: '.env.example',
      name: 'PORT',
      expected: 3100,
    },
    {
      factId: 'table.work-item',
      family: 'tables',
      at: { kind: 'current' },
      kind: 'drizzle-table',
      path: 'src/schema.ts',
      exportName: 'workItem',
      expected: 'work_item',
    },
    {
      factId: 'migration.work-item',
      family: 'migrations',
      at: { kind: 'current' },
      kind: 'migration-table',
      path: 'migrations/001_create_work_item/migration.sql',
      operation: 'create',
      occurrence: 1,
      expected: 'work_item',
    },
    {
      factId: 'http.list-work',
      family: 'http',
      at: { kind: 'current' },
      kind: 'http-endpoint',
      path: 'src/routes.ts',
      exportName: 'listWork',
      expectedMethod: 'GET',
      expectedPath: '/api/work-items',
    },
    {
      factId: 'target.check',
      family: 'targets',
      at: { kind: 'current' },
      kind: 'nx-target',
      project: 'app',
      target: 'check',
      expectedConfiguration: {
        executor: 'nx:run-commands',
        options: { command: 'bun test' },
        configurations: {},
        parallelism: true,
      },
    },
    {
      factId: 'lock.solver',
      family: 'vendored-locks',
      at: { kind: 'current' },
      kind: 'vendored-lock',
      path: 'vendor/requirements.lock',
      expectedBlob: git(repository, 'hash-object', 'vendor/requirements.lock'),
    },
    {
      factId: 'external.public-api',
      family: 'external-consumers',
      at: { kind: 'current' },
      kind: 'external-consumer',
      system: 'partner-automation',
      contract: 'GET /api/work-items',
      knowledgeLimit: 'operator declaration; no external repository access',
    },
  ];
}

test.each(['sha1', 'sha256'] as const)(
  'retained %s preserves all declared selector families and provenance',
  (format) => {
    const fixture = declarationFixture(format, (repository, facts) => {
      write(
        repository,
        'package.json',
        `${JSON.stringify({
          name: 'selector-fixture',
          private: true,
          scripts: { gate: 'nx run app:check' },
        })}\n`,
      );
      write(
        repository,
        'nx.json',
        `${JSON.stringify({ plugins: [], useInferencePlugins: false })}\n`,
      );
      write(
        repository,
        'tsconfig.json',
        `${JSON.stringify({
          compilerOptions: {
            declaration: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            target: 'ES2022',
          },
          include: ['src/index.ts'],
        })}\n`,
      );
      write(
        repository,
        'project.json',
        `${JSON.stringify({
          name: 'app',
          root: '.',
          sourceRoot: 'src',
          projectType: 'application',
          targets: {
            check: { executor: 'nx:run-commands', options: { command: 'bun test' } },
          },
        })}\n`,
      );
      write(repository, 'src/index.ts', "export const publicValue = 'fixture';\n");
      write(
        repository,
        'src/schema.ts',
        "const sqliteTable = <T>(name: string, columns: T) => ({ name, columns });\nconst text = (name: string) => name;\nexport const workItem = sqliteTable('work_item', { id: text('id') });\n",
      );
      write(
        repository,
        'src/routes.ts',
        "const defineEndpointShape = <T>(shape: T): T => shape;\nexport const listWork = defineEndpointShape({ method: 'GET', path: '/api/work-items' });\n",
      );
      write(
        repository,
        '.github/workflows/ci.yml',
        'name: ci\non: [push]\njobs:\n  gate:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Gate\n        run: bun run gate\n',
      );
      write(
        repository,
        'lefthook.yml',
        'pre-commit:\n  commands:\n    gate:\n      run: bun run gate\n',
      );
      write(
        repository,
        'Dockerfile',
        'FROM oven/bun:1.4.2 AS runtime\nCOPY generated/openapi.json /srv/openapi.json\nEXPOSE 3100\n',
      );
      write(repository, '.env.example', 'PORT=3100\nAUTH_MODE=local\n');
      write(repository, 'generated/openapi.json', '{"openapi":"3.1.0"}\n');
      write(repository, 'vendor/requirements.lock', 'solver==1.2.3 --hash=sha256:abcd\n');
      write(
        repository,
        'migrations/001_create_work_item/migration.sql',
        'CREATE TABLE `work_item` (`id` text PRIMARY KEY);\n',
      );
      const selectedBlob = facts.find((fact) => fact['factId'] === 'blob');
      if (selectedBlob === undefined) throw new Error('fixture selected blob absent');
      selectedBlob['expectedBlob'] = git(repository, 'hash-object', '.env.example');
      facts.push(...currentFacts(repository));
    });
    const configuration = {
      executor: 'nx:run-commands',
      options: { command: 'bun test' },
      configurations: {},
      parallelism: true,
    };
    const selectedNx = {
      ...nx,
      targets: [
        { project: 'app', target: 'check', configuration, extractor, identity: 'a'.repeat(64) },
      ],
    };
    const legacy = extractDeclaredRelationships(
      fixture.input.sourceRepository,
      fixture.input.sourceRepository,
      fixture.candidate.snapshot,
      fixture.selected,
      selectedNx,
    );
    rmSync(fixture.input.sourceRepository, { recursive: true });
    const restoreReads = refuseAmbientReads();
    try {
      const extracted = extractRetainedDeclarations({
        ...fixture.extraction,
        nx: selectedNx,
        limits: { ...limits, maximumReadBytes: 131072, maximumOutputBytes: 131072 },
      });
      expect(extracted).toEqual(legacy);
      expect(extracted.relationships.coverage[0].families).toEqual([
        'ci',
        'docker',
        'environment',
        'external-consumers',
        'generated',
        'hooks',
        'http',
        'migrations',
        'ports',
        'scripts',
        'tables',
        'targets',
        'vendored-locks',
      ]);
      expect(
        extracted.relationships.facts.every(
          ({ provenance }) =>
            provenance.declarationPath === 'relationships.json' &&
            provenance.extractor.blob === extractor.blob,
        ),
      ).toBe(true);
    } finally {
      restoreReads();
    }
  },
);

test('retained declarations enforce the historical selection ceiling', () => {
  const fixture = declarationFixture('sha1', (repository, facts) => {
    const revision = git(repository, 'rev-parse', 'HEAD');
    facts.push({
      factId: 'old-readme',
      family: 'generated',
      kind: 'generated-blob',
      at: { kind: 'historical', revision },
      path: 'README.md',
      expectedBlob: git(repository, 'rev-parse', `${revision}:README.md`),
    });
  });
  expect(() =>
    extractRetainedDeclarations({
      ...fixture.extraction,
      limits: { ...limits, maximumHistoricalSelections: 1 },
    }),
  ).toThrow('selection ceiling');
});

test.each(['revision', 'path'] as const)(
  'retained declarations refuse a changed history proof %s',
  (field) => {
    const fixture = declarationFixture();
    const history = structuredClone(fixture.candidate.history);
    if (history === null) throw new Error('fixture history absent');
    history.proofs[0][field] = field === 'revision' ? fixture.request.headSha : 'README.md';
    expect(() =>
      extractRetainedDeclarations({
        ...fixture.extraction,
        candidate: { ...fixture.candidate, history },
      }),
    ).toThrow('history census differs');
  },
);

test('retained declarations preserve historical symlink raw-target semantics', () => {
  const fixture = declarationFixture('sha256', (repository, facts) => {
    const oldRevision = git(repository, 'rev-parse', 'HEAD');
    symlinkSync('src.ts', join(repository, 'historical-link.txt'));
    git(repository, 'add', '--all');
    git(repository, 'commit', '--quiet', '-m', 'third historical link');
    const revision = git(repository, 'rev-parse', 'HEAD');
    expect(revision).not.toBe(oldRevision);
    facts.push({
      factId: 'historical-link',
      family: 'generated',
      kind: 'generated-blob',
      at: { kind: 'historical', revision },
      path: 'historical-link.txt',
      expectedBlob: git(repository, 'rev-parse', `${revision}:historical-link.txt`),
    });
  });
  const legacy = extractDeclaredRelationships(
    fixture.input.sourceRepository,
    fixture.input.sourceRepository,
    fixture.candidate.snapshot,
    fixture.selected,
    nx,
  );
  rmSync(fixture.input.sourceRepository, { recursive: true });
  expect(extractRetainedDeclarations(fixture.extraction)).toEqual(legacy);
});

test('retained declarations refuse a Git format differing from selected metadata', () => {
  const fixture = declarationFixture('sha256');
  expect(() =>
    extractRetainedDeclarations({ ...fixture.extraction, gitObjectFormat: 'sha1' }),
  ).toThrow('Git object format differs');
});

test.each(['', 'nul\0target'] as const)(
  'retained declarations refuse invalid current symlink target %j',
  (target) => {
    const fixture = declarationFixture();
    const candidate = {
      ...fixture.candidate,
      readBlob: (blob: string, path: string) =>
        path === 'env-link' ? Buffer.from(target) : fixture.candidate.readBlob(blob, path),
    };
    expect(() => extractRetainedDeclarations({ ...fixture.extraction, candidate })).toThrow(
      'target invalid',
    );
  },
);

test('retained declarations preserve the requested declaration symlink provenance', () => {
  const fixture = declarationFixture('sha1', undefined, 'declaration-link.json');
  const legacy = extractDeclaredRelationships(
    fixture.input.sourceRepository,
    fixture.input.sourceRepository,
    fixture.candidate.snapshot,
    fixture.selected,
    nx,
  );
  rmSync(fixture.input.sourceRepository, { recursive: true });
  const extracted = extractRetainedDeclarations(fixture.extraction);
  expect(extracted).toEqual(legacy);
  expect(
    extracted.relationships.facts.every(
      ({ provenance }) => provenance.declarationPath === 'declaration-link.json',
    ),
  ).toBe(true);
});

test('retained declarations accept a complete empty historical census', () => {
  const fixture = declarationFixture('sha1', (_repository, facts) => {
    facts.splice(0);
  });
  expect(extractRetainedDeclarations(fixture.extraction).relationships.facts).toEqual([]);
});

test('retained declarations refuse malformed selected declaration bytes', () => {
  const fixture = declarationFixture();
  const candidate = {
    ...fixture.candidate,
    readBlob: (blob: string, path: string) =>
      path === 'relationships.json'
        ? Buffer.from('{broken')
        : fixture.candidate.readBlob(blob, path),
  };
  expect(() => extractRetainedDeclarations({ ...fixture.extraction, candidate })).toThrow(
    'declaration malformed',
  );
});

for (const limit of Object.keys(limits) as (keyof typeof limits)[]) {
  test(`retained declarations refuse zero ${limit}`, () => {
    const fixture = declarationFixture();
    expect(() =>
      extractRetainedDeclarations({ ...fixture.extraction, limits: { ...limits, [limit]: 0 } }),
    ).toThrow('positive safe integer');
  });
}
