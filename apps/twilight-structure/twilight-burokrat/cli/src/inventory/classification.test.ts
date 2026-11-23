import { Buffer } from 'node:buffer';
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

import { afterEach, describe, expect, test } from 'bun:test';

import { ClassificationPolicy } from '../contracts/records';
import { type CliInvocation, invokeCli } from '../invoke-cli';
import type { ContentClassification } from './classify-entries';

const repositories: string[] = [];
const shippedPolicyPath = join(
  import.meta.dir,
  '..',
  'contracts',
  'fixtures',
  'classification-policy.v1.json',
);
const wasmHeader = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderr = invocation.stderr.toString('utf8');
  expect(invocation.exitCode, stderr).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-classification-'));
  repositories.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'classification@example.test']);
  runGit(repository, ['config', 'user.name', 'Classification Fixture']);
  return repository;
}

function write(repository: string, path: string, source: string | Uint8Array): void {
  const absolutePath = join(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function hash(repository: string, path: string): string {
  return runGit(repository, ['hash-object', path]);
}

function commitAll(repository: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', 'classification fixture']);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

function policy(gitlinkObject: string, includeGitlink = true): object {
  return {
    schemaVersion: 1,
    policyId: 'classification.test.v1',
    selectorVersion: 1,
    contentClasses: [
      'source',
      'test',
      'config',
      'script',
      'migration',
      'fixture',
      'generated',
      'vendored',
      'placeholder',
      'document',
      'openspec',
    ],
    contentRules: [
      {
        contentClass: 'test',
        include: [
          { kind: 'suffix', value: '.test.ts' },
          { kind: 'suffix', value: '.spec.ts' },
          { kind: 'segment', value: 'e2e' },
        ],
        exclude: [],
      },
      {
        contentClass: 'generated',
        include: [{ kind: 'segment', value: 'generated' }],
        exclude: [],
      },
      {
        contentClass: 'vendored',
        include: [{ kind: 'segment', value: 'vendor' }],
        exclude: [],
      },
      {
        contentClass: 'fixture',
        include: [{ kind: 'segment', value: 'fixtures' }],
        exclude: [],
      },
      {
        contentClass: 'migration',
        include: [{ kind: 'segment', value: 'migrations' }],
        exclude: [],
      },
      {
        contentClass: 'openspec',
        include: [{ kind: 'prefix', value: 'openspec' }],
        exclude: [],
      },
      {
        contentClass: 'placeholder',
        include: [{ kind: 'name', value: '.gitkeep' }],
        exclude: [],
      },
      {
        contentClass: 'script',
        include: [{ kind: 'suffix', value: '.sh' }],
        exclude: [],
      },
      {
        contentClass: 'config',
        include: [
          { kind: 'name', value: 'project.json' },
          { kind: 'suffix', value: '.config.ts' },
        ],
        exclude: [],
      },
      {
        contentClass: 'source',
        include: [
          { kind: 'suffix', value: '.ts' },
          { kind: 'suffix', value: '.js' },
          { kind: 'suffix', value: '.svg' },
        ],
        exclude: [
          { kind: 'suffix', value: '.test.ts' },
          { kind: 'suffix', value: '.spec.ts' },
          { kind: 'segment', value: 'e2e' },
          { kind: 'segment', value: 'fixtures' },
          { kind: 'segment', value: 'generated' },
          { kind: 'segment', value: 'vendor' },
        ],
      },
      {
        contentClass: 'document',
        include: [
          { kind: 'suffix', value: '.md' },
          { kind: 'suffix', value: '.txt' },
        ],
        exclude: [{ kind: 'prefix', value: 'openspec' }],
      },
    ],
    evidenceRoots: [
      {
        path: 'docs/review-evidence',
        allowedRecordKinds: ['review-receipt', 'opaque-transcript'],
      },
      {
        path: 'docs/experiment-evidence',
        allowedRecordKinds: ['benchmark-corpus', 'candidate-inventory', 'experiment-manifest'],
      },
    ],
    binaryDeclarations: [
      {
        path: 'assets/module.wasm',
        format: 'application/wasm',
        consumer: 'apps/fe-01',
        regenerationAuthority: { kind: 'source', path: 'tools/assets/module-source.ts' },
      },
    ],
    gitlinkBoundaries: includeGitlink
      ? [
          {
            path: 'external/tool',
            object: gitlinkObject,
            boundaryId: 'external.tool.v1',
            repository: 'https://example.test/tool.git',
          },
        ]
      : [],
    symlinks: 'inventory-only',
    gitlinks: 'declared-external-boundary',
  };
}

function writePolicy(repository: string, policyRecord: object): string {
  const path = join(repository, '.classification-policy.json');
  writeFileSync(path, `${JSON.stringify(policyRecord)}\n`, 'utf8');
  return path;
}

async function classify(
  repository: string,
  revision: string,
  policyPath: string,
): Promise<CliInvocation> {
  return await invokeCli(['classify-candidate', 'committed', repository, revision, policyPath]);
}

function output(invocation: CliInvocation): string {
  return `${invocation.stdout}${invocation.stderr}`;
}

function standardOutput(invocation: CliInvocation): string {
  return invocation.stdout;
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe('entry classification production CLI', () => {
  test('partitions every exact candidate tuple into ordinary content or an allowlisted evidence schema', async () => {
    const repository = createRepository();
    const external = createRepository();
    write(external, 'README.md', 'external boundary\n');
    const gitlinkObject = commitAll(external);

    const ordinary: readonly (readonly [string, string, string])[] = [
      ['src/main.ts', 'export const main = true;\n', 'source'],
      ['src/main.test.ts', 'test("main", () => {});\n', 'test'],
      ['project.json', '{"name":"fixture"}\n', 'config'],
      ['bin/check.sh', '#!/bin/sh\nexit 0\n', 'script'],
      ['migrations/001/migration.sql', 'CREATE TABLE example(id TEXT);\n', 'migration'],
      ['fixtures/sample.json', '{"fixture":true}\n', 'fixture'],
      ['generated/client.ts', 'export const generated = true;\n', 'generated'],
      ['vendor/library.js', 'export const vendored = true;\n', 'vendored'],
      ['.gitkeep', '', 'placeholder'],
      ['README.md', '# Candidate\n', 'document'],
      ['openspec/changes/demo/proposal.md', '## Why\n\nBecause.\n', 'openspec'],
    ];
    for (const [path, source] of ordinary) write(repository, path, source);
    chmodSync(join(repository, 'bin/check.sh'), 0o755);
    write(repository, 'assets/module.wasm', wasmHeader);
    write(repository, 'tools/assets/module-source.ts', 'export const moduleSource = true;\n');
    symlinkSync('README.md', join(repository, 'readme-link'));
    write(
      repository,
      'docs/review-evidence/transcript.v1.json',
      JSON.stringify({
        schemaVersion: 1,
        recordKind: 'opaque-transcript',
        invocationId: 'invocation.test.v1',
        mediaType: 'text/plain',
        payload: 'opaque model prose\nwith no schema of its own',
      }),
    );
    write(
      repository,
      'docs/experiment-evidence/corpus.v1.json',
      JSON.stringify({
        schemaVersion: 1,
        corpusId: 'corpus.test.v1',
        acceptanceId: 'acceptance.test.v1',
        repository: {
          revision: '1'.repeat(40),
          tree: '2'.repeat(40),
          inventoryId: 'inventory.test.v1',
        },
        outcomes: [
          {
            outcomeId: 'outcome.test.v1',
            title: 'Test outcome',
            stratum: 'independent-module',
            heldOut: false,
            acceptanceCriteria: ['the named test passes'],
          },
        ],
      }),
    );
    runGit(repository, ['add', '--all']);
    runGit(repository, [
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${gitlinkObject},external/tool`,
    ]);
    runGit(repository, ['commit', '--message', 'classification fixture']);
    const revision = runGit(repository, ['rev-parse', 'HEAD']);
    const tree = runGit(repository, ['rev-parse', 'HEAD^{tree}']);
    const policyPath = writePolicy(repository, policy(gitlinkObject));

    const invocation = await classify(repository, revision, policyPath);
    const stdout = invocation.stdout;
    expect(invocation.exitCode, output(invocation)).toBe(0);
    const expectedEntries = [
      ...ordinary.map(([path, , contentClass]) => ({
        path,
        mode: path === 'bin/check.sh' ? '100755' : '100644',
        blob: hash(repository, path),
        classification: { kind: 'content', contentClass },
      })),
      {
        path: 'assets/module.wasm',
        mode: '100644',
        blob: hash(repository, 'assets/module.wasm'),
        classification: {
          kind: 'content',
          contentClass: 'binary',
          format: 'application/wasm',
          consumer: 'apps/fe-01',
          regenerationAuthority: { kind: 'source', path: 'tools/assets/module-source.ts' },
        },
      },
      {
        path: 'docs/experiment-evidence/corpus.v1.json',
        mode: '100644',
        blob: hash(repository, 'docs/experiment-evidence/corpus.v1.json'),
        classification: {
          kind: 'evidence',
          evidenceRoot: 'docs/experiment-evidence',
          recordKind: 'benchmark-corpus',
        },
      },
      {
        path: 'docs/review-evidence/transcript.v1.json',
        mode: '100644',
        blob: hash(repository, 'docs/review-evidence/transcript.v1.json'),
        classification: {
          kind: 'evidence',
          evidenceRoot: 'docs/review-evidence',
          recordKind: 'opaque-transcript',
        },
      },
      {
        path: 'external/tool',
        mode: '160000',
        blob: gitlinkObject,
        classification: {
          kind: 'content',
          contentClass: 'gitlink',
          boundaryId: 'external.tool.v1',
          repository: 'https://example.test/tool.git',
        },
      },
      {
        path: 'readme-link',
        mode: '120000',
        blob: runGit(repository, ['rev-parse', 'HEAD:readme-link']),
        classification: {
          kind: 'content',
          contentClass: 'symlink',
          target: 'README.md',
          resolvedTarget: 'README.md',
        },
      },
      {
        path: 'tools/assets/module-source.ts',
        mode: '100644',
        blob: hash(repository, 'tools/assets/module-source.ts'),
        classification: { kind: 'content', contentClass: 'source' },
      },
    ].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    expect(JSON.parse(stdout) as unknown).toEqual({
      selection: { kind: 'committed', revision, tree },
      entries: expectedEntries,
      untracked: [],
      policyId: 'classification.test.v1',
    });
  });

  test('refuses disguised or malformed reserved evidence and undeclared Gitlinks', async () => {
    const cases: readonly (readonly [string, (repository: string) => string, string])[] = [
      [
        'hidden source',
        (repository) => {
          write(
            repository,
            'docs/review-evidence/hidden.ts',
            JSON.stringify({
              schemaVersion: 1,
              recordKind: 'opaque-transcript',
              invocationId: 'invocation.hidden.v1',
              mediaType: 'text/plain',
              payload: 'export const hidden = true;',
            }),
          );
          return 'source-like path is not an evidence schema';
        },
        'source-like path is not an evidence schema',
      ],
      [
        'executable evidence',
        (repository) => {
          write(
            repository,
            'docs/review-evidence/executable.v1.json',
            JSON.stringify({
              schemaVersion: 1,
              recordKind: 'opaque-transcript',
              invocationId: 'invocation.executable.v1',
              mediaType: 'text/plain',
              payload: 'executable evidence',
            }),
          );
          chmodSync(join(repository, 'docs/review-evidence/executable.v1.json'), 0o755);
          return 'reserved evidence must use mode 100644';
        },
        'reserved evidence must use mode 100644',
      ],
      [
        'unknown evidence schema',
        (repository) => {
          write(
            repository,
            'docs/review-evidence/unknown.v1.json',
            '{"schemaVersion":1,"recordKind":"unknown"}\n',
          );
          return 'does not match exactly one allowlisted evidence schema';
        },
        'does not match exactly one allowlisted evidence schema',
      ],
      [
        'unenveloped prose',
        (repository) => {
          write(repository, 'docs/review-evidence/prose.v1.json', 'an unwrapped transcript\n');
          return 'is not JSON';
        },
        'is not JSON',
      ],
      [
        'undeclared Gitlink',
        (repository) => {
          const external = createRepository();
          write(external, 'README.md', 'external\n');
          const object = commitAll(external);
          runGit(repository, [
            'update-index',
            '--add',
            '--cacheinfo',
            `160000,${object},external/tool`,
          ]);
          return object;
        },
        'has no declared external boundary',
      ],
    ];

    for (const [name, arrange, expected] of cases) {
      const repository = createRepository();
      write(repository, 'README.md', `# ${name}\n`);
      runGit(repository, ['add', '--all']);
      const arranged = arrange(repository);
      const gitlinkObject = name === 'undeclared Gitlink' ? arranged : '1'.repeat(40);
      if (name !== 'undeclared Gitlink') runGit(repository, ['add', '--all']);
      runGit(repository, ['commit', '--message', name]);
      const revision = runGit(repository, ['rev-parse', 'HEAD']);
      const policyPath = writePolicy(
        repository,
        policy(gitlinkObject, name !== 'undeclared Gitlink'),
      );
      const invocation = await classify(repository, revision, policyPath);
      expect(invocation.exitCode, `${name}: ${output(invocation)}`).toBe(1);
      expect(output(invocation)).toContain(expected);
    }
    // Proof: PR run 34694906449 timed this production path out at 5023.00ms under
    // Bun's 5-second default, after its child was still running (`Received: null`).
  }, 20_000);

  test('refuses unknown selector versions, changed evidence roots and silently dropped classes', async () => {
    const repository = createRepository();
    write(repository, 'README.md', '# Policy boundary\n');
    const revision = commitAll(repository);
    const unknownVersion = structuredClone(policy('1'.repeat(40))) as {
      selectorVersion: number;
    };
    unknownVersion.selectorVersion = 99;
    const versionInvocation = await classify(
      repository,
      revision,
      writePolicy(repository, unknownVersion),
    );
    expect(versionInvocation.exitCode, output(versionInvocation)).toBe(1);
    expect(output(versionInvocation)).toContain('selectorVersion must be 1');

    const changedRoots = structuredClone(policy('1'.repeat(40))) as {
      evidenceRoots: { path: string; allowedRecordKinds: string[] }[];
    };
    changedRoots.evidenceRoots = changedRoots.evidenceRoots.filter(
      (root) => root.path !== 'docs/review-evidence',
    );
    const rootsInvocation = await classify(
      repository,
      revision,
      writePolicy(repository, changedRoots),
    );
    expect(rootsInvocation.exitCode, output(rootsInvocation)).toBe(1);
    expect(output(rootsInvocation)).toContain('the two reserved evidence roots');

    const incomplete = structuredClone(policy('1'.repeat(40))) as {
      contentClasses: string[];
      contentRules: { contentClass: string }[];
    };
    incomplete.contentClasses = incomplete.contentClasses.filter(
      (contentClass) => contentClass !== 'source',
    );
    incomplete.contentRules = incomplete.contentRules.filter(
      (rule) => rule.contentClass !== 'source',
    );
    const invocation = await classify(repository, revision, writePolicy(repository, incomplete));

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain('exactly one rule for every supported content class');
  });

  test('routes a reserved-root symlink through evidence validation', async () => {
    const repository = createRepository();
    write(repository, 'README.md', '# Evidence symlink target\n');
    mkdirSync(join(repository, 'docs/review-evidence'), { recursive: true });
    symlinkSync('../../README.md', join(repository, 'docs/review-evidence/link.v1.json'));
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain('reserved evidence must use mode 100644');
  });

  test('routes a reserved-root Gitlink through evidence validation', async () => {
    const repository = createRepository();
    const external = createRepository();
    write(external, 'README.md', '# Evidence Gitlink target\n');
    const gitlinkObject = commitAll(external);
    runGit(repository, [
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${gitlinkObject},docs/experiment-evidence/external.v1.json`,
    ]);
    runGit(repository, ['commit', '--message', 'reserved Gitlink']);
    const revision = runGit(repository, ['rev-parse', 'HEAD']);
    const policyRecord = structuredClone(policy(gitlinkObject)) as {
      gitlinkBoundaries: {
        path: string;
        object: string;
        boundaryId: string;
        repository: string;
      }[];
    };
    policyRecord.gitlinkBoundaries = [
      {
        path: 'docs/experiment-evidence/external.v1.json',
        object: gitlinkObject,
        boundaryId: 'evidence.external.v1',
        repository: 'https://example.test/evidence.git',
      },
    ];
    const invocation = await classify(repository, revision, writePolicy(repository, policyRecord));

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain('reserved evidence must use mode 100644');
  });

  test('preserves a leading BOM byte sequence in a symlink target', async () => {
    const repository = createRepository();
    const target = '\uFEFFREADME.md';
    write(repository, target, '# BOM target\n');
    symlinkSync(target, join(repository, 'bom-link'));
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(0);
    const classified = JSON.parse(standardOutput(invocation)) as {
      entries: { path: string; mode: string; blob: string; classification: unknown }[];
    };
    expect(classified.entries.find((entry) => entry.path === 'bom-link')?.classification).toEqual({
      kind: 'content',
      contentClass: 'symlink',
      target,
      resolvedTarget: target,
    });
  });

  test('uses the shipped policy to classify a real TSX test suffix as test content', async () => {
    const repository = createRepository();
    const path = 'apps/fe-01/src/app.test.tsx';
    write(repository, path, 'export const tested = true;\n');
    const revision = commitAll(repository);
    const invocation = await classify(repository, revision, shippedPolicyPath);

    expect(invocation.exitCode, output(invocation)).toBe(0);
    const classified = JSON.parse(standardOutput(invocation)) as {
      entries: { path: string; mode: string; blob: string; classification: unknown }[];
    };
    // Proof: removing `.test.tsx`/`.spec.tsx` from the shipped test includes and source
    // exclusions changed this production CLI tuple's received content class to `source`.
    expect(classified.entries).toEqual([
      {
        path,
        mode: '100644',
        blob: hash(repository, path),
        classification: { kind: 'content', contentClass: 'test' },
      },
    ]);
  });

  test.each([
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
    'docs/code-organization/rule-policy.json',
    'apps/twilight-structure/twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
  ])('classifies only the reviewed frontend lint declaration with %s', async (policyPath) => {
    const workspace = join(import.meta.dir, '../../../../../..');
    const envelope = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8')) as
      ClassificationPolicy | { classificationPolicy: ClassificationPolicy };
    const classification =
      'classificationPolicy' in envelope ? envelope.classificationPolicy : envelope;
    const name = 'apps/wbs/fe-01/tools/owner-lint-plan.d.mts';
    const bytes = readFileSync(join(workspace, name));
    const repository = createRepository();
    write(repository, name, bytes);
    const revision = commitAll(repository);
    const selected = await classify(repository, revision, writePolicy(repository, classification));
    expect(selected.exitCode, output(selected)).toBe(0);
    const classified = JSON.parse(standardOutput(selected)) as { entries: unknown };
    expect(classified.entries).toEqual([
      {
        path: name,
        mode: '100644',
        blob: hash(repository, name),
        classification: { kind: 'content', contentClass: 'source' },
      },
    ]);

    // Proof: deleting just this exact source selector makes the unchanged real declaration refuse.
    const omitted = {
      ...classification,
      contentRules: classification.contentRules.map((rule) =>
        rule.contentClass === 'source'
          ? {
              ...rule,
              include: rule.include.filter(
                (entry) => entry.kind !== 'path' || entry.value !== name,
              ),
            }
          : rule,
      ),
    };
    const refused = await classify(repository, revision, writePolicy(repository, omitted));
    expect(refused.exitCode, output(refused)).toBe(1);
    expect(output(refused)).toContain(`ordinary content ${name} matched 0 classification rules`);
    const restored = await classify(repository, revision, writePolicy(repository, classification));
    expect(restored.exitCode, output(restored)).toBe(0);
    expect(standardOutput(restored)).toEqual(standardOutput(selected));

    const sibling = 'apps/wbs/fe-01/tools/unreviewed-lint-plan.d.mts';
    const siblingRepo = createRepository();
    write(siblingRepo, sibling, bytes);
    const siblingRevision = commitAll(siblingRepo);
    const unlisted = await classify(
      siblingRepo,
      siblingRevision,
      writePolicy(siblingRepo, classification),
    );
    expect(unlisted.exitCode, output(unlisted)).toBe(1);
    expect(output(unlisted)).toContain(
      `ordinary content ${sibling} matched 0 classification rules`,
    );
  });

  test.each([
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
    'docs/code-organization/rule-policy.json',
    'apps/twilight-structure/twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
  ])(
    'classifies registry systemd units and refuses an omitted timer selector with %s',
    async (policyPath) => {
      const repository = createRepository();
      const workspace = join(import.meta.dir, '../../../../../..');
      const unitPaths = [
        'infra/systemd/registry-backup/puni-registry-backup.service',
        'infra/systemd/registry-backup/puni-registry-backup.timer',
      ];
      for (const path of unitPaths) write(repository, path, readFileSync(join(workspace, path)));
      const revision = commitAll(repository);
      interface Policy {
        contentRules: {
          contentClass: string;
          include: { kind: string; value: string }[];
        }[];
      }
      const envelope = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8')) as Policy & {
        classificationPolicy?: Policy;
      };
      const classificationPolicy = envelope.classificationPolicy ?? envelope;
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, classificationPolicy),
      );
      expect(invocation.exitCode, output(invocation)).toBe(0);
      const classified = JSON.parse(standardOutput(invocation)) as {
        entries: { path: string; classification: { contentClass: string } }[];
      };
      expect(
        classified.entries.map(({ path, classification }) => [path, classification.contentClass]),
      ).toEqual(unitPaths.map((path) => [path, 'config']));

      const configRule = classificationPolicy.contentRules.find(
        (rule) => rule.contentClass === 'config',
      );
      if (configRule === undefined) throw new Error('trusted config rule missing');
      configRule.include = configRule.include.filter(
        (selector) => selector.kind !== 'suffix' || selector.value !== '.timer',
      );
      const omitted = await classify(
        repository,
        revision,
        writePolicy(repository, classificationPolicy),
      );
      // Proof: removing .timer from each shipped config rule makes this production CLI refuse
      // the actual registry timer, while the unchanged .service selector still classifies its sibling.
      expect(omitted.exitCode, output(omitted)).toBe(1);
      expect(output(omitted)).toContain(
        `ordinary content ${unitPaths[1]} matched 0 classification rules`,
      );
    },
  );

  test.each([
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
    'docs/code-organization/rule-policy.json',
    'apps/twilight-structure/twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
  ])('classifies bounded registry storage paths exactly once with %s', async (policyPath) => {
    const repository = createRepository();
    const workspace = join(import.meta.dir, '../../../../../..');
    const paths = [
      ['infra/ansible/roles/registry_client/templates/registries.yaml.j2', 'config'],
      ['infra/ansible/roles/registry_endpoint/templates/puni-registry.service.j2', 'config'],
      ['infra/ansible/roles/registry_endpoint/templates/puni-registry.socket.j2', 'config'],
      ['infra/ansible/roles/registry_storage/files/authority.sh', 'script'],
      ['infra/ansible/roles/registry_storage/files/identity.sh', 'script'],
      ['infra/ansible/roles/registry_storage/files/k3s-storage.conf', 'config'],
      ['infra/ansible/roles/registry_storage/files/maintenance.sudoers', 'config'],
      ['infra/ansible/roles/registry_storage/files/maintenance.tmpfiles', 'config'],
      ['infra/ansible/roles/registry_storage/files/storage.sh', 'script'],
      ['infra/ansible/roles/registry_storage/tasks/authority.yml', 'config'],
      ['infra/ansible/roles/registry_storage/templates/pulls.json.j2', 'config'],
      [
        'infra/ansible/roles/registry_storage/templates/puni-registry-pressure.service.j2',
        'config',
      ],
      ['infra/ansible/roles/registry_storage/templates/puni-registry-pulls.service.j2', 'config'],
      ['infra/ansible/roles/registry_storage/templates/puni-registry-storage.service.j2', 'config'],
      ['infra/ansible/roles/registry_storage/templates/storage.json.j2', 'config'],
      ['infra/ansible/tests/registry-capacity-fixture.ts', 'test'],
      ['infra/ansible/tests/registry-capacity-rehearsal.test.sh', 'test'],
      ['infra/ansible/tests/registry-capacity.test.ts', 'test'],
      ['infra/ansible/tests/registry-storage-rehearsal.sh', 'test'],
      ['infra/platform/registry/production/startup.sh', 'script'],
      ['infra/platform/registry/production/storage-patch.yaml', 'config'],
      ['tools/tool-fleet/src/fixtures/dagger-0.21.9.oci.tar', 'binary'],
      ['tools/tool-fleet/src/fixtures/docker-29.1.3-containerd.oci.tar', 'binary'],
    ] as const;
    const binaryDeclarations = [
      {
        path: 'tools/tool-fleet/src/fixtures/dagger-0.21.9.oci.tar',
        format: 'application/x-tar',
        consumer: 'tools/tool-fleet/src/registry-artifact.test.ts',
        regenerationAuthority: {
          kind: 'external',
          authority:
            'Pinned external Dagger 0.21.9 SDK/CLI and engine OCI export; retained provenance in openspec/changes/bound-registry-storage/verify.md. Re-export and characterize the pinned output before replacing this archive.',
        },
      },
      {
        path: 'tools/tool-fleet/src/fixtures/docker-29.1.3-containerd.oci.tar',
        format: 'application/x-tar',
        consumer: 'tools/tool-fleet/src/registry-docker.test.ts',
        regenerationAuthority: {
          kind: 'external',
          authority:
            'External pinned Docker 29.1.3 containerd image-store OCI export. Regenerate with that exporter and re-characterize the root and metadata against tools/tool-fleet/src/registry-docker.test.ts before replacing this archive.',
        },
      },
    ] satisfies ClassificationPolicy['binaryDeclarations'];
    for (const [path] of paths) write(repository, path, readFileSync(join(workspace, path)));
    const revision = commitAll(repository);
    interface Policy {
      contentRules: { contentClass: string; include: { kind: string; value: string }[] }[];
      binaryDeclarations: typeof binaryDeclarations;
    }
    const envelope = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8')) as Policy & {
      classificationPolicy?: Policy;
    };
    const classificationPolicy = envelope.classificationPolicy ?? envelope;
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, classificationPolicy),
    );
    expect(invocation.exitCode, output(invocation)).toBe(0);
    const classified = JSON.parse(standardOutput(invocation)) as {
      entries: { path: string; classification: ContentClassification }[];
    };
    expect(
      classified.entries.map(({ path, classification }) => [path, classification.contentClass]),
    ).toEqual(paths.map(([path, contentClass]) => [path, contentClass]));
    for (const { path, ...classification } of binaryDeclarations)
      expect(classified.entries.find((entry) => entry.path === path)?.classification).toEqual({
        kind: 'content',
        contentClass: 'binary',
        ...classification,
      });
    const exactPaths = [
      'infra/ansible/roles/registry_storage/files/maintenance.sudoers',
      'infra/ansible/roles/registry_storage/files/maintenance.tmpfiles',
    ];
    if (
      policyPath.includes('bootstrap-policy') ||
      policyPath.endsWith('classification-policy.v1.json')
    )
      exactPaths.push(
        ...[
          'infra/ansible/roles/registry_client/templates/registries.yaml.j2',
          'infra/ansible/roles/registry_endpoint/templates/puni-registry.service.j2',
          'infra/ansible/roles/registry_endpoint/templates/puni-registry.socket.j2',
          'infra/ansible/roles/registry_storage/templates/pulls.json.j2',
          'infra/ansible/roles/registry_storage/templates/puni-registry-pulls.service.j2',
        ],
      );
    // Proof: all18 newly required exact-selector omissions and8 binary-declaration omissions refuse their named real paths across these four policies; every restored policy returns the complete original classification. Existing k3s refusal remains.
    for (const path of [
      ...exactPaths,
      'infra/ansible/roles/registry_storage/files/k3s-storage.conf',
    ]) {
      const fault = structuredClone(classificationPolicy);
      const config = fault.contentRules.find((rule) => rule.contentClass === 'config');
      if (config === undefined) throw new Error('Trusted config rule missing');
      const before = config.include.length;
      config.include = config.include.filter(
        (selector) => selector.kind !== 'path' || selector.value !== path,
      );
      expect(config.include.length).toBe(before - 1);
      const omitted = await classify(repository, revision, writePolicy(repository, fault));
      expect(omitted.exitCode, output(omitted)).toBe(1);
      expect(output(omitted)).toContain(`ordinary content ${path} matched 0 classification rules`);
      const restored = await classify(
        repository,
        revision,
        writePolicy(repository, classificationPolicy),
      );
      expect(restored.exitCode, output(restored)).toBe(0);
      expect(JSON.parse(standardOutput(restored))).toEqual(JSON.parse(standardOutput(invocation)));
    }
    for (const { path } of binaryDeclarations) {
      const fault = structuredClone(classificationPolicy);
      fault.binaryDeclarations = fault.binaryDeclarations.filter(
        (declaration) => declaration.path !== path,
      );
      expect(fault.binaryDeclarations.length).toBe(
        classificationPolicy.binaryDeclarations.length - 1,
      );
      const omitted = await classify(repository, revision, writePolicy(repository, fault));
      expect(omitted.exitCode, output(omitted)).toBe(1);
      expect(output(omitted)).toContain(`undeclared binary content at ${path}`);
      const restored = await classify(
        repository,
        revision,
        writePolicy(repository, classificationPolicy),
      );
      expect(restored.exitCode, output(restored)).toBe(0);
      expect(JSON.parse(standardOutput(restored))).toEqual(JSON.parse(standardOutput(invocation)));
    }
    // Proof: all four policies refuse the same archive bytes at an unlisted sibling and unlisted same-directory sudoers/tmpfiles; no suffix or directory fallback is admitted.
    for (const [path, source, diagnostic] of [
      [
        'tools/tool-fleet/src/fixtures/unlisted.oci.tar',
        readFileSync(join(workspace, binaryDeclarations[0].path)),
        'undeclared binary content at',
      ],
      [
        'infra/ansible/roles/registry_storage/files/unlisted.sudoers',
        'no grant\n',
        'ordinary content',
      ],
      [
        'infra/ansible/roles/registry_storage/files/unlisted.tmpfiles',
        'no grant\n',
        'ordinary content',
      ],
    ] as const) {
      const unlisted = createRepository();
      write(unlisted, path, source);
      const unlistedRevision = commitAll(unlisted);
      const refused = await classify(
        unlisted,
        unlistedRevision,
        writePolicy(unlisted, classificationPolicy),
      );
      expect(refused.exitCode, output(refused)).toBe(1);
      expect(output(refused)).toContain(`${diagnostic} ${path}`);
      if (diagnostic === 'ordinary content')
        expect(output(refused)).toContain('matched 0 classification rules');
    }
  });

  // Proof: before the six exact shipped-policy exclusions, all six real retained-tuple CLI cases refused matched 2 classification rules; the same tuples passed afterward.
  for (const policyName of ['policy.json', 'bootstrap-policy.json']) {
    const retained = [
      [
        'openspec/changes/cross-project-dependencies/evidence/source-role-observer/baseline/tools/tool-remote-scripts/src/fixtures/product-readiness-byte-transport.ts.txt',
        '01a81c963b54de4f02404608decdf914d06f2bf6',
      ],
      [
        'openspec/changes/cross-project-dependencies/evidence/source-role-observer/baseline/tools/tool-remote-scripts/src/fixtures/source-role-process.ts.txt',
        '3967718006f049e2983530cbc92f99c17bb09425',
      ],
      [
        'openspec/changes/cross-project-dependencies/evidence/source-role-observer/baseline/tools/tool-remote-scripts/test/source-role-process-model-child.test.ts.txt',
        'fe4bb3ab18ff5fba8e43158fb3493d7ea2c29a3e',
      ],
    ] as const;
    for (const [path, blob] of retained)
      test(`classifies exact retained source snapshot ${policyName}: ${path}`, async () => {
        const repository = createRepository();
        write(repository, path, readFileSync(join(import.meta.dir, '../../../../../..', path)));
        const revision = commitAll(repository);
        const trustedPolicy = JSON.parse(
          readFileSync(
            join(import.meta.dir, '../../../../../../docs/wiki-policy', policyName),
            'utf8',
          ),
        ) as { classificationPolicy: object };
        const invocation = await classify(
          repository,
          revision,
          writePolicy(repository, trustedPolicy.classificationPolicy),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified = JSON.parse(standardOutput(invocation)) as { entries: unknown[] };
        expect(classified.entries).toEqual([
          {
            path,
            mode: '100644',
            blob,
            classification: { kind: 'content', contentClass: 'openspec' },
          },
        ]);
      });

    test(`retained source snapshot boundary preserves ambiguity and active classes ${policyName}`, async () => {
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../../docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as { classificationPolicy: object };
      const repository = createRepository();
      const unlisted =
        'openspec/changes/cross-project-dependencies/evidence/source-role-observer/baseline/tools/tool-remote-scripts/src/fixtures/unlisted-source-role-process.ts.txt';
      write(
        repository,
        unlisted,
        readFileSync(join(import.meta.dir, '../../../../../..', retained[0][0])),
      );
      const revision = commitAll(repository);
      const refused = await classify(
        repository,
        revision,
        writePolicy(repository, trustedPolicy.classificationPolicy),
      );
      expect(refused.exitCode, output(refused)).toBe(1);
      expect(output(refused)).toContain(
        `ordinary content ${unlisted} matched 2 classification rules`,
      );

      const active = createRepository();
      const controls = [
        ['tools/tool-remote-scripts/src/fixtures/product-readiness-byte-transport.ts', 'fixture'],
        ['tools/tool-remote-scripts/test/source-role-process-model-child.test.ts', 'test'],
      ] as const;
      for (const [path] of controls)
        write(active, path, readFileSync(join(import.meta.dir, '../../../../../..', path)));
      const activeRevision = commitAll(active);
      const accepted = await classify(
        active,
        activeRevision,
        writePolicy(active, trustedPolicy.classificationPolicy),
      );
      expect(accepted.exitCode, output(accepted)).toBe(0);
      const classified = JSON.parse(standardOutput(accepted)) as { entries: unknown[] };
      expect(classified.entries).toEqual(
        controls.map(([path, contentClass]) => ({
          path,
          mode: '100644',
          blob: hash(active, path),
          classification: { kind: 'content', contentClass },
        })),
      );
    });
  }

  // Proof: missing exact patch selectors made both production CLI cases fail
  // (0 pass / 2 fail); registration restored both, including unlisted-patch refusal.
  test.each(['policy.json', 'bootstrap-policy.json'])(
    'classifies only the declared dependency patch with docs/wiki-policy/%s',
    async (policyName) => {
      const repository = createRepository();
      const patchPath = 'patches/@ark%2Fschema@0.56.2.patch';
      const patchBytes = readFileSync(
        join(import.meta.dir, '../../../../../..', patchPath),
        'utf8',
      );
      write(repository, patchPath, patchBytes);
      const revision = commitAll(repository);
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../..', 'docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as { classificationPolicy: object };
      const policyPath = writePolicy(repository, trustedPolicy.classificationPolicy);
      const accepted = await classify(repository, revision, policyPath);
      expect(accepted.exitCode, output(accepted)).toBe(0);
      const classified = JSON.parse(standardOutput(accepted)) as {
        entries: {
          path: string;
          mode: string;
          blob: string;
          classification: { kind: string; contentClass: string };
        }[];
      };
      expect(classified.entries).toEqual([
        {
          path: patchPath,
          mode: '100644',
          blob: hash(repository, patchPath),
          classification: { kind: 'content', contentClass: 'vendored' },
        },
      ]);

      const unlistedPatch = 'patches/unlisted.patch';
      write(repository, unlistedPatch, patchBytes);
      rmSync(policyPath);
      const unlistedRevision = commitAll(repository);
      writePolicy(repository, trustedPolicy.classificationPolicy);
      const refused = await classify(repository, unlistedRevision, policyPath);
      expect(refused.exitCode).not.toBe(0);
      expect(output(refused)).toContain(
        `ordinary content ${unlistedPatch} matched 0 classification rules`,
      );
    },
  );

  test.each(['policy.json', 'bootstrap-policy.json'])(
    'classifies fleet Containerfiles and package NOTICE with docs/wiki-policy/%s',
    async (policyName) => {
      const repository = createRepository();
      const containerfile = 'infra/controller/Containerfile';
      const notice = 'apps/twilight-structure/twilight-burokrat/cli/NOTICE';
      write(repository, containerfile, 'FROM scratch\n');
      write(repository, notice, 'Third-party notices\n');
      const revision = commitAll(repository);
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../..', 'docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as { classificationPolicy: object };
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, trustedPolicy.classificationPolicy),
      );

      // Proof: before the explicit names were added, the production CLI refused the fleet
      // candidate at `ordinary content infra/controller/Containerfile matched 0 classification
      // rules`; removing NOTICE then moves the same refusal to
      // `apps/twilight-structure/twilight-burokrat/cli/NOTICE`.
      expect(invocation.exitCode, output(invocation)).toBe(0);
      const classified = JSON.parse(standardOutput(invocation)) as {
        entries: { path: string; classification: { contentClass: string } }[];
      };
      expect(
        classified.entries.map(({ path, classification }) => [path, classification.contentClass]),
      ).toEqual([
        [notice, 'document'],
        [containerfile, 'config'],
      ]);
    },
  );

  test.each(['policy.json', 'bootstrap-policy.json'])(
    'partitions fixture segments inside test directories with docs/wiki-policy/%s',
    async (policyName) => {
      const repository = createRepository();
      const runtimeFixture = 'tools/tool-observability-stack/test/fixtures/runtime.json';
      const neighboringTest = 'tools/tool-observability-stack/test/runtime.test.ts';
      write(repository, runtimeFixture, '{"runtime":true}\n');
      write(
        repository,
        neighboringTest,
        'throw new Error("classification must not execute tests");\n',
      );
      write(repository, 'tests/__fixtures__/sample.json', '{"fixture":true}\n');
      write(
        repository,
        'e2e/fixtures/sample.ts',
        'throw new Error("classification must not execute fixtures");\n',
      );
      write(repository, 'src/main.ts', 'export const main = true;\n');
      const revision = commitAll(repository);
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../..', 'docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as { classificationPolicy: object };
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, trustedPolicy.classificationPolicy),
      );

      // Proof: omitting either fixture-segment test exclusion from either shipped policy
      // made this positive hit `matched 2 classification rules` (four controlled faults).
      expect(invocation.exitCode, output(invocation)).toBe(0);
      const classified = JSON.parse(standardOutput(invocation)) as {
        entries: { path: string; classification: { kind: string; contentClass: string } }[];
      };
      expect(
        classified.entries.map(({ path, classification }) => ({ path, classification })),
      ).toEqual([
        {
          path: 'e2e/fixtures/sample.ts',
          classification: { kind: 'content', contentClass: 'fixture' },
        },
        {
          path: 'src/main.ts',
          classification: { kind: 'content', contentClass: 'source' },
        },
        {
          path: 'tests/__fixtures__/sample.json',
          classification: { kind: 'content', contentClass: 'fixture' },
        },
        {
          path: runtimeFixture,
          classification: { kind: 'content', contentClass: 'fixture' },
        },
        {
          path: neighboringTest,
          classification: { kind: 'content', contentClass: 'test' },
        },
      ]);
    },
  );

  test.each([
    ['fixtures', 'policy.json', 'tools/tool-observability-stack/test/fixtures/runtime.json'],
    ['__fixtures__', 'policy.json', 'tests/__fixtures__/sample.json'],
    [
      'fixtures',
      'bootstrap-policy.json',
      'tools/tool-observability-stack/test/fixtures/runtime.json',
    ],
    ['__fixtures__', 'bootstrap-policy.json', 'tests/__fixtures__/sample.json'],
  ])(
    'refuses missing %s test exclusion with docs/wiki-policy/%s',
    async (segment, policyName, path) => {
      const repository = createRepository();
      write(repository, path, '{"fixture":true}\n');
      const revision = commitAll(repository);
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../..', 'docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as {
        classificationPolicy: {
          contentRules: { contentClass: string; exclude: { kind: string; value: string }[] }[];
        };
      };
      const testRule = trustedPolicy.classificationPolicy.contentRules.find(
        ({ contentClass }) => contentClass === 'test',
      );
      if (testRule === undefined) throw new Error('trusted test rule missing');
      expect(testRule.exclude).toContainEqual({ kind: 'segment', value: segment });
      testRule.exclude = testRule.exclude.filter(
        (selector) => selector.kind !== 'segment' || selector.value !== segment,
      );
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, trustedPolicy.classificationPolicy),
      );

      expect(invocation.exitCode, output(invocation)).toBe(1);
      expect(output(invocation).trim()).toBe(
        `ordinary content ${path} matched 2 classification rules`,
      );
    },
  );

  test.each(['policy.json', 'bootstrap-policy.json'])(
    'classifies OpenSpec codec review scripts without absorbing runtime source with %s',
    async (policyName) => {
      const repository = createRepository();
      const reviewPath =
        'openspec/changes/organization-authoritative-dns/codec-review/reproduce.mjs';
      const sourcePath = 'apps/wbs/be-01/src/runtime/codec.mjs';
      write(repository, reviewPath, 'throw new Error("classification must never execute me");\n');
      write(repository, sourcePath, 'export const codec = true;\n');
      const revision = commitAll(repository);
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../..', 'docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as { classificationPolicy: object };
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, trustedPolicy.classificationPolicy),
      );

      // Proof: without each policy's source exclusion for openspec, this production CLI
      // refused reproduce.mjs with `matched 2 classification rules` (0/1 in both copies).
      expect(invocation.exitCode, output(invocation)).toBe(0);
      const classified = JSON.parse(standardOutput(invocation)) as {
        entries: { path: string; classification: { contentClass: string } }[];
      };
      expect(
        classified.entries.map(({ path, classification }) => [path, classification.contentClass]),
      ).toEqual([
        [sourcePath, 'source'],
        [reviewPath, 'openspec'],
      ]);
    },
  );

  test.each(['policy.json', 'bootstrap-policy.json'])(
    'refuses an injected OpenSpec/source overlap with %s',
    async (policyName) => {
      const repository = createRepository();
      const path = 'openspec/changes/organization-authoritative-dns/codec-review/reproduce.mjs';
      write(repository, path, 'export const review = true;\n');
      const revision = commitAll(repository);
      const trustedPolicy = JSON.parse(
        readFileSync(
          join(import.meta.dir, '../../../../../..', 'docs/wiki-policy', policyName),
          'utf8',
        ),
      ) as {
        classificationPolicy: {
          contentRules: { contentClass: string; exclude: { kind: string; value: string }[] }[];
        };
      };
      const sourceRule = trustedPolicy.classificationPolicy.contentRules.find(
        ({ contentClass }) => contentClass === 'source',
      );
      if (sourceRule === undefined) throw new Error('trusted source rule missing');
      sourceRule.exclude = sourceRule.exclude.filter(
        (selector) => selector.kind !== 'prefix' || selector.value !== 'openspec',
      );
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, trustedPolicy.classificationPolicy),
      );

      // Proof: weakening production's multiple-match refusal to >2 made both policy
      // negatives exit 0 and accept the injected overlap as openspec (expected 1, received 0).
      expect(invocation.exitCode, output(invocation)).toBe(1);
      expect(output(invocation)).toContain(
        `ordinary content ${path} matched 2 classification rules`,
      );
    },
  );

  test('refuses an ordinary path that matches no selector', async () => {
    const repository = createRepository();
    write(repository, 'unknown.zzz', 'unknown\n');
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain(
      'ordinary content unknown.zzz matched 0 classification rules',
    );
  });

  test('refuses an ordinary path that matches multiple selectors', async () => {
    const repository = createRepository();
    const path = 'src/ambiguous.ts';
    write(repository, path, 'export const ambiguous = true;\n');
    const revision = commitAll(repository);
    const policyRecord = structuredClone(policy('1'.repeat(40))) as {
      contentRules: { contentClass: string; include: { kind: string; value: string }[] }[];
    };
    const testRule = policyRecord.contentRules.find((rule) => rule.contentClass === 'test');
    if (testRule === undefined) throw new Error('test rule missing from fixture');
    testRule.include.push({ kind: 'suffix', value: '.ts' });
    const invocation = await classify(repository, revision, writePolicy(repository, policyRecord));

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain(`ordinary content ${path} matched 2 classification rules`);
  });

  test('refuses a Gitlink whose object differs from its pinned boundary', async () => {
    const repository = createRepository();
    const external = createRepository();
    write(external, 'README.md', '# External\n');
    const gitlinkObject = commitAll(external);
    runGit(repository, [
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${gitlinkObject},external/tool`,
    ]);
    runGit(repository, ['commit', '--message', 'mismatched Gitlink']);
    const revision = runGit(repository, ['rev-parse', 'HEAD']);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain(
      `Gitlink external/tool object ${gitlinkObject} differs from declared object ${'1'.repeat(40)}`,
    );
  });

  test('refuses a symlink target that escapes the repository', async () => {
    const repository = createRepository();
    mkdirSync(join(repository, 'links'), { recursive: true });
    symlinkSync('../../outside', join(repository, 'links/escape'));
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain(
      'symlink links/escape escapes the repository: ../../outside',
    );
  });

  test('refuses an undeclared NUL-bearing binary at a source path', async () => {
    const repository = createRepository();
    const path = 'src/undeclared.ts';
    write(repository, path, wasmHeader);
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain(`undeclared binary content at ${path}`);
  });

  test('bounds the NUL sniff so a later literal NUL remains UTF-8 source', async () => {
    const repository = createRepository();
    const path = 'src/late-nul.test.ts';
    write(repository, path, `${'a'.repeat(8192)}\u0000`);
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(0);
    const classified = JSON.parse(standardOutput(invocation)) as {
      entries: { path: string; mode: string; blob: string; classification: unknown }[];
    };
    expect(classified.entries[0]?.classification).toEqual({
      kind: 'content',
      contentClass: 'test',
    });
  });

  test('refuses invalid UTF-8 beyond the bounded NUL sniff', async () => {
    const repository = createRepository();
    const path = 'src/invalid-utf8.ts';
    const bytes = new Uint8Array(8_002);
    bytes.fill(97);
    bytes[8_001] = 0xff;
    write(repository, path, bytes);
    const revision = commitAll(repository);
    const invocation = await classify(
      repository,
      revision,
      writePolicy(repository, policy('1'.repeat(40))),
    );

    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain(`undeclared binary content at ${path}`);
  });
});

describe('shipped bin classification boundaries', () => {
  const workspace = join(import.meta.dir, '../../../../../..');
  // Proof: bin-classification-red-v336 observed all eighteen isolated path/policy cases
  // refuse their original two-rule ambiguity. The six exact exclusions per policy made
  // those cases and twelve refusal/neighbor controls pass in bin-classification-green-controls-v337.
  const policyPaths = [
    'docs/code-organization/rule-policy.json',
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
  ] as const;
  const reviewed = [
    ['bin/assert-rename-window.ts', 'script'],
    ['bin/dev-be-probe.ts', 'script'],
    ['bin/dev-ports.ts', 'script'],
    ['bin/dev.ts', 'script'],
    ['bin/tool-wiki-lint.ts', 'script'],
    ['bin/tsconfig.json', 'config'],
  ] as const;

  function readClassificationPolicy(path: string): object {
    const envelope: unknown = JSON.parse(readFileSync(join(workspace, path), 'utf8'));
    if (envelope === null || typeof envelope !== 'object' || !('classificationPolicy' in envelope))
      throw new Error('shipped policy lacks its classification boundary: ' + path);
    const selected = envelope.classificationPolicy;
    if (selected === null || typeof selected !== 'object' || Array.isArray(selected))
      throw new Error('shipped classification policy is malformed: ' + path);
    return selected;
  }

  for (const policyPath of policyPaths) {
    test.each(reviewed)(
      'classifies reviewed %s as %s with ' + policyPath,
      async (path, contentClass) => {
        const repository = createRepository();
        write(repository, path, readFileSync(join(workspace, path)));
        const revision = commitAll(repository);
        const invocation = await classify(
          repository,
          revision,
          writePolicy(repository, readClassificationPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        expect(classified).toMatchObject({
          entries: [
            {
              path,
              mode: '100644',
              blob: hash(repository, path),
              classification: { kind: 'content', contentClass },
            },
          ],
        });
      },
    );

    test.each([
      ['bin/unreviewed.ts', 2],
      ['bin/unreviewed.json', 2],
      ['unknown.zzz', 0],
    ] as const)('refuses unreviewed %s with ' + policyPath, async (path, count) => {
      const repository = createRepository();
      write(repository, path, 'unreviewed ordinary text\n');
      const revision = commitAll(repository);
      const invocation = await classify(
        repository,
        revision,
        writePolicy(repository, readClassificationPolicy(policyPath)),
      );
      expect(invocation.exitCode, output(invocation)).toBe(1);
      expect(output(invocation)).toContain(
        'ordinary content ' + path + ' matched ' + String(count) + ' classification rules',
      );
    });

    test(
      'preserves neighboring script, test, source and config classes with ' + policyPath,
      async () => {
        const repository = createRepository();
        const controls = [
          ['bin/dev.sh', 'script'],
          ['bin/dev.test.sh', 'test'],
          ['src/main.ts', 'source'],
          ['src/tsconfig.json', 'config'],
          ['binary/main.ts', 'source'],
          ['bins/main.ts', 'source'],
        ] as const;
        for (const [path] of controls) write(repository, path, '{}\n');
        const revision = commitAll(repository);
        const invocation = await classify(
          repository,
          revision,
          writePolicy(repository, readClassificationPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        expect(classified).toMatchObject({
          entries: controls
            .map(([path, contentClass]) => ({
              path,
              mode: '100644',
              blob: hash(repository, path),
              classification: { kind: 'content', contentClass },
            }))
            .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))),
        });
      },
    );
  }
});

describe.each(['progress', 'rename'] as const)(
  'shipped historical Memory %s binary boundary',
  (kind) => {
    // Proof: memory-progress-real-red-v346 observed all three undeclared-archive refusals.
    // memory-progress-green-controls-v346 then passed exact binary metadata, each owned
    // declaration omission/restoration, same-byte unlisted sibling and ordinary-text refusals.
    // Proof: memory-rename-real-red-v351 observed all three missing rename declarations.
    // memory-both-green-controls-v352 passed both captures and all six policy/capture
    // declaration omissions/restorations, unlisted siblings and ordinary-text refusals.
    // This classifies retained bytes; archive integrity and replay remain consumer responsibilities.
    const workspace = join(import.meta.dir, '../../../../../..');
    const path =
      'libs/wbs/adapters/store-memory/src/testing/fixtures/legacy-laundering-' + kind + '.json.gz';
    const classification = {
      kind: 'content',
      contentClass: 'binary',
      format: 'application/gzip',
      consumer: 'libs/wbs/adapters/store-memory/src/testing/legacy-memory-history.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor Memory capture pinned by libs/wbs/adapters/store-memory/src/testing/fixtures/legacy-memory-history.json and openspec/changes/wbs-step-catalogue/verification-genuine-memory-history-20261121.json; repeating the retained producer at c8018843e6ff6827f7d97b67ff986cc717656578 creates a new capture.',
      },
    };

    function readPolicy(policyPath: string): ClassificationPolicy {
      const envelope: unknown = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8'));
      if (
        envelope === null ||
        typeof envelope !== 'object' ||
        !('classificationPolicy' in envelope)
      )
        throw new Error('Shipped policy lacks its classification boundary: ' + policyPath);
      return ClassificationPolicy.assert(envelope.classificationPolicy);
    }

    async function expectCapture(
      repository: string,
      revision: string,
      policy: ClassificationPolicy,
    ) {
      const invocation = await classify(repository, revision, writePolicy(repository, policy));
      expect(invocation.exitCode, output(invocation)).toBe(0);
      const classified: unknown = JSON.parse(standardOutput(invocation));
      if (classified === null || typeof classified !== 'object' || !('entries' in classified))
        throw new Error('CLI classification lacks its entries');
      expect(classified.entries).toEqual([
        { path, mode: '100644', blob: hash(repository, path), classification },
      ]);
      return classified;
    }

    for (const policyPath of [
      'docs/code-organization/rule-policy.json',
      'docs/wiki-policy/policy.json',
      'docs/wiki-policy/bootstrap-policy.json',
    ]) {
      test('classifies the retained ' + kind + ' capture with ' + policyPath, async () => {
        const repository = createRepository();
        write(repository, path, readFileSync(join(workspace, path)));
        await expectCapture(repository, commitAll(repository), readPolicy(policyPath));
      });

      test(
        'refuses an absent declaration and restores the exact capture with ' + policyPath,
        async () => {
          const repository = createRepository();
          write(repository, path, readFileSync(join(workspace, path)));
          const revision = commitAll(repository);
          const policy = readPolicy(policyPath);
          const qualified = await expectCapture(repository, revision, policy);
          const omitted = structuredClone(policy);
          omitted.binaryDeclarations = omitted.binaryDeclarations.filter(
            (entry) => entry.path !== path,
          );
          expect(omitted.binaryDeclarations.length).toBe(policy.binaryDeclarations.length - 1);
          const refusal = await classify(repository, revision, writePolicy(repository, omitted));
          expect(refusal.exitCode, output(refusal)).toBe(1);
          expect(output(refusal)).toContain('undeclared binary content at ' + path);
          expect(await expectCapture(repository, revision, policy)).toEqual(qualified);
        },
      );

      test('refuses the same gzip bytes at an unlisted sibling with ' + policyPath, async () => {
        const repository = createRepository();
        const sibling =
          'libs/wbs/adapters/store-memory/src/testing/fixtures/unlisted-' + kind + '.json.gz';
        write(repository, sibling, readFileSync(join(workspace, path)));
        const refusal = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(refusal.exitCode, output(refusal)).toBe(1);
        expect(output(refusal)).toContain('undeclared binary content at ' + sibling);
      });

      test('refuses ordinary UTF-8 at the declared capture path with ' + policyPath, async () => {
        const repository = createRepository();
        write(repository, path, '{}\n');
        const refusal = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(refusal.exitCode, output(refusal)).toBe(1);
        expect(output(refusal)).toContain(
          'declared binary ' + path + ' contains ordinary UTF-8 text',
        );
      });
    }
  },
);

describe('shipped current-PR historical SQLite archive boundaries', () => {
  // Proof: current-pr-archives-real-red-v359 observed108 distinct named archive/policy
  // undeclared-binary failures before their exact rows were appended. The v360 green
  // controls passed108 literal metadata oracles and24 strict unlisted-byte/ordinary-text
  // counterexamples (one representative per four manifest groups and three policies).
  // Historical bytes stay unchanged; opaque classification grants no replay authority.
  const workspace = join(import.meta.dir, '../../../../../..');
  const fixtureRoot = 'libs/wbs/adapters/store-sqlite/src/testing/fixtures/';
  const groups = {
    delete: {
      consumer: 'libs/wbs/adapters/store-sqlite/src/testing/legacy-delete-database.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor SQLite capture pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/legacy-delete.json and openspec/changes/wbs-step-catalogue/verification-historical-parent-undo-20261120.json; retained producer uses Source c8018843e6ff6827f7d97b67ff986cc717656578. Repeating that workflow creates a new capture.',
      },
    },
    move: {
      consumer: 'libs/wbs/adapters/store-sqlite/src/testing/legacy-move-database.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor SQLite capture pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/legacy-move.json and openspec/changes/wbs-step-catalogue/verification-genuine-move-history-20261121.json; retained producer uses Source c8018843e6ff6827f7d97b67ff986cc717656578. Repeating that workflow creates a new capture.',
      },
    },
    replay: {
      consumer: 'libs/wbs/adapters/store-sqlite/src/testing/legacy-replay-database.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor SQLite capture pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/legacy-replay.json and openspec/changes/wbs-step-catalogue/verification-genuine-replay-cutover-20261121.json; retained producer uses Source c8018843e6ff6827f7d97b67ff986cc717656578. Repeating that workflow creates a new capture.',
      },
    },
    parent: {
      consumer: 'libs/wbs/adapters/store-sqlite/src/legacy-parent-migration.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical SQLite E37 backup after actual110\u2192116 migration, pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/legacy-parent-progress.json and openspec/changes/wbs-step-catalogue/verification-legacy-parent-admission-20261120.json; predecessor Source c8018843e6ff6827f7d97b67ff986cc717656578. Repeating that workflow creates a new capture.',
      },
    },
  };
  const archives = [
    ['legacy-delete-leaf-only.sqlite.gz', 'delete'],
    ['legacy-delete-parent-progress.sqlite.gz', 'delete'],
    ['legacy-destination-redo-missing.control.json.gz', 'replay'],
    ['legacy-destination-redo-missing.producer.json.gz', 'replay'],
    ['legacy-destination-redo-missing.sqlite.gz', 'replay'],
    ['legacy-destination-redo-state.control.json.gz', 'replay'],
    ['legacy-destination-redo-state.producer.json.gz', 'replay'],
    ['legacy-destination-redo-state.sqlite.gz', 'replay'],
    ['legacy-destination-redo-time.control.json.gz', 'replay'],
    ['legacy-destination-redo-time.producer.json.gz', 'replay'],
    ['legacy-destination-redo-time.sqlite.gz', 'replay'],
    ['legacy-handup-new-progress.control.json.gz', 'replay'],
    ['legacy-handup-new-progress.producer.json.gz', 'replay'],
    ['legacy-handup-new-progress.sqlite.gz', 'replay'],
    ['legacy-parent-drift-extra.control.json.gz', 'replay'],
    ['legacy-parent-drift-extra.producer.json.gz', 'replay'],
    ['legacy-parent-drift-extra.sqlite.gz', 'replay'],
    ['legacy-parent-drift-missing.control.json.gz', 'replay'],
    ['legacy-parent-drift-missing.producer.json.gz', 'replay'],
    ['legacy-parent-drift-missing.sqlite.gz', 'replay'],
    ['legacy-parent-drift-state.control.json.gz', 'replay'],
    ['legacy-parent-drift-state.producer.json.gz', 'replay'],
    ['legacy-parent-drift-state.sqlite.gz', 'replay'],
    ['legacy-parent-drift-time.control.json.gz', 'replay'],
    ['legacy-parent-drift-time.producer.json.gz', 'replay'],
    ['legacy-parent-drift-time.sqlite.gz', 'replay'],
    ['legacy-parent-last-child.control.json.gz', 'replay'],
    ['legacy-parent-last-child.producer.json.gz', 'replay'],
    ['legacy-parent-last-child.sqlite.gz', 'replay'],
    ['legacy-parent-progress.sqlite.gz', 'parent'],
    ['legacy-restore-progress-blockage.control.json.gz', 'move'],
    ['legacy-restore-progress-blockage.producer.json.gz', 'move'],
    ['legacy-restore-progress-blockage.sqlite.gz', 'move'],
    ['legacy-restore-progress.control.json.gz', 'move'],
    ['legacy-restore-progress.producer.json.gz', 'move'],
    ['legacy-restore-progress.sqlite.gz', 'move'],
  ] as const;
  const representatives = [
    'legacy-delete-leaf-only.sqlite.gz',
    'legacy-restore-progress.control.json.gz',
    'legacy-parent-last-child.producer.json.gz',
    'legacy-parent-progress.sqlite.gz',
  ];

  function readPolicy(policyPath: string): ClassificationPolicy {
    const envelope: unknown = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8'));
    if (envelope === null || typeof envelope !== 'object' || !('classificationPolicy' in envelope))
      throw new Error('Shipped policy lacks its classification boundary: ' + policyPath);
    return ClassificationPolicy.assert(envelope.classificationPolicy);
  }

  for (const policyPath of [
    'docs/code-organization/rule-policy.json',
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
  ]) {
    test.each(archives)(
      'classifies reviewed PR archive %s with ' + policyPath,
      async (filename, group) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, readFileSync(join(workspace, path)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        if (classified === null || typeof classified !== 'object' || !('entries' in classified))
          throw new Error('CLI classification lacks its entries');
        expect(classified.entries).toEqual([
          {
            path,
            mode: '100644',
            blob: hash(repository, path),
            classification: {
              kind: 'content',
              contentClass: 'binary',
              format: 'application/gzip',
              ...groups[group],
            },
          },
        ]);
      },
    );

    test.each(representatives)(
      'refuses reviewed PR archive bytes at unlisted %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + 'unlisted-' + filename;
        write(repository, path, readFileSync(join(workspace, fixtureRoot + filename)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(1);
        expect(output(invocation)).toContain('undeclared binary content at ' + path);
      },
    );

    test.each(representatives)(
      'refuses ordinary UTF-8 at reviewed PR archive %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, '{}\n');
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(1);
        expect(output(invocation)).toContain(
          'declared binary ' + path + ' contains ordinary UTF-8 text',
        );
      },
    );
  }
});

describe('shipped predecessor Memory archives', () => {
  // Proof: removing the extra-qa wiki policy declaration made the classifier refuse its actual gzip.
  const workspace = join(import.meta.dir, '../../../../../..');
  const fixtureRoot = 'libs/wbs/adapters/store-memory/src/testing/fixtures/';

  for (const policyPath of [
    'docs/code-organization/rule-policy.json',
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
  ]) {
    test.each(['extra-qa', 'mixed-progress-patch'])(
      'classifies Memory laundering archive %s with ' + policyPath,
      async (scenario) => {
        const envelope: unknown = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8'));
        if (
          envelope === null ||
          typeof envelope !== 'object' ||
          !('classificationPolicy' in envelope)
        )
          throw new Error('Shipped policy lacks its classification boundary: ' + policyPath);
        const repository = createRepository();
        const path = fixtureRoot + 'legacy-laundering-' + scenario + '.json.gz';
        write(repository, path, readFileSync(join(workspace, path)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, ClassificationPolicy.assert(envelope.classificationPolicy)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        expect(classified).toMatchObject({
          entries: [
            {
              path,
              blob: hash(repository, path),
              classification: {
                kind: 'content',
                contentClass: 'binary',
                format: 'application/gzip',
                consumer: 'libs/wbs/adapters/store-memory/src/testing/legacy-memory-history.ts',
                regenerationAuthority: { kind: 'external' },
              },
            },
          ],
        });
      },
    );
  }
});

describe('shipped current-PR raw SQLite fixture boundaries', () => {
  // Proof: current-pr-raw-fixtures-real-red-v368 observed all fifteen exact missing
  // declarations. current-pr-raw-fixtures-green-controls-v369 passed fifteen exact
  // metadata positives and eighteen same-byte unlisted/ordinary-text role controls.
  // before117 names its retained historical consumer; no current replay authority is asserted.
  const workspace = join(import.meta.dir, '../../../../../..');
  const fixtureRoot = 'libs/wbs/adapters/store-sqlite/src/testing/fixtures/';
  const groups = {
    pre117: {
      consumer:
        'libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/producer.source.txt',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical pre-117 E37 snapshot pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/acquisition.json and libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/before117.window.json; retained consumer libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/producer.source.txt. Repeating that workflow creates a new capture; historical backup paths confer no current authority.',
      },
    },
    merged117: {
      consumer:
        'libs/wbs/adapters/store-sqlite/src/testing/resource-use-location-migration.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical schema-117 fixture capture pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/manifest.json and libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/acquisition.json; retained producer libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117-merged/producer.source.txt. Repeating that workflow creates a new capture; historical backup paths confer no current authority.',
      },
    },
    ordinary117: {
      consumer:
        'libs/wbs/adapters/store-sqlite/src/testing/resource-use-location-migration.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical schema-117 fixture capture pinned by libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117/manifest.json and libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117/acquisition.json; retained producer libs/wbs/adapters/store-sqlite/src/testing/fixtures/resource-use-117/producer.source.txt. Repeating that workflow creates a new capture; historical backup paths confer no current authority.',
      },
    },
  };
  const databases = [
    ['resource-use-117-merged/before117.db', 'pre117'],
    ['resource-use-117-merged/merged-bound.db', 'merged117'],
    ['resource-use-117/ambiguous-attempt.db', 'ordinary117'],
    ['resource-use-117/bound-moved.db', 'ordinary117'],
    ['resource-use-117/unassociated.db', 'ordinary117'],
  ] as const;
  const representatives = [
    'resource-use-117-merged/before117.db',
    'resource-use-117-merged/merged-bound.db',
    'resource-use-117/unassociated.db',
  ];

  function readPolicy(policyPath: string): ClassificationPolicy {
    const envelope: unknown = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8'));
    if (envelope === null || typeof envelope !== 'object' || !('classificationPolicy' in envelope))
      throw new Error('Shipped policy lacks its classification boundary: ' + policyPath);
    return ClassificationPolicy.assert(envelope.classificationPolicy);
  }

  for (const policyPath of [
    'docs/code-organization/rule-policy.json',
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
  ]) {
    test.each(databases)(
      'classifies reviewed raw SQLite %s with ' + policyPath,
      async (filename, group) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, readFileSync(join(workspace, path)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        if (classified === null || typeof classified !== 'object' || !('entries' in classified))
          throw new Error('CLI classification lacks its entries');
        expect(classified.entries).toEqual([
          {
            path,
            mode: '100644',
            blob: hash(repository, path),
            classification: {
              kind: 'content',
              contentClass: 'binary',
              format: 'application/vnd.sqlite3',
              ...groups[group],
            },
          },
        ]);
      },
    );

    test.each(representatives)(
      'refuses reviewed raw SQLite bytes at unlisted %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + 'unlisted-' + filename;
        write(repository, path, readFileSync(join(workspace, fixtureRoot + filename)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(1);
        expect(output(invocation)).toContain('undeclared binary content at ' + path);
      },
    );

    test.each(representatives)(
      'refuses ordinary UTF-8 at reviewed raw SQLite %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, '{}\n');
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(1);
        expect(output(invocation)).toContain(
          'declared binary ' + path + ' contains ordinary UTF-8 text',
        );
      },
    );
  }
});

describe('shipped delivery fixture and fleet class boundaries', () => {
  // Proof: openspec-fixture-collision-real-red-v378 observed all123 exact path/policy
  // two-match refusals. openspec-fixture-collision-green-controls-v379 passed them as
  // fixtures, retained unreviewed/nested refusals and preserved neighboring classes.
  // Original duplicate recipes and capture bytes are read verbatim, never normalized.
  const workspace = join(import.meta.dir, '../../../../../..');
  const fixtureRoot = 'openspec/changes/wbs-work-packages/fixtures/';
  const fixtures = [
    'command-json-duplicates.json',
    'command-json.json',
    'legacy-comparison-captures.json',
    'legacy-comparison-certificate-input10.txt',
    'legacy-comparison-certificate-schedule2.txt',
    'legacy-comparison-connected-input10.txt',
    'legacy-comparison-local-input9.txt',
    'legacy-comparison-local-schedule1.txt',
    'legacy-comparison-ready-input10.txt',
    'legacy-comparison-ready-schedule2.txt',
    'legacy-connected-history-helper-capture.json',
    'legacy-connected-history-helper10-2.txt',
    'legacy-dash-runtime6.json',
    'legacy-document-captures.json',
    'legacy-document11-ordinary.txt',
    'legacy-document12-connected.txt',
    'legacy-input-captures.json',
    'legacy-input10-connected.txt',
    'legacy-input10-local.txt',
    'legacy-input9-local.txt',
    'legacy-resource-capture.json',
    // Proof: all three policies without this exact exclusion refused the capture with two matches.
    'legacy-resource-cleaned-capture.json',
    'legacy-resource-database1.txt',
    'legacy-resource-terminal-capture.json',
    'legacy-resource-terminal1.txt',
    'legacy-runtime-acceptance1.txt',
    'legacy-runtime-captures.json',
    'legacy-runtime-database-capture.json',
    'legacy-runtime-database1.txt',
    'legacy-schedule-captures.json',
    'legacy-schedule1-elsewhere.txt',
    'legacy-schedule1-first-writer.txt',
    'legacy-schedule1-local.txt',
    'legacy-schedule2-connected.txt',
    'legacy-schedule2-questions.txt',
    'legacy-shared-people-recovery1.json',
    'legacy-shared-people-save1.json',
    'outgoing-store.json',
    'rename-before.json',
    'rename-integrity.json',
    'schema-exceptions.json',
    'shared-people-save2.json',
  ];

  function readPolicy(policyPath: string): ClassificationPolicy {
    const envelope: unknown = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8'));
    if (envelope === null || typeof envelope !== 'object' || !('classificationPolicy' in envelope))
      throw new Error('Shipped policy lacks its classification boundary: ' + policyPath);
    return ClassificationPolicy.assert(envelope.classificationPolicy);
  }

  for (const policyPath of [
    'docs/code-organization/rule-policy.json',
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
  ]) {
    test.each(fixtures)(
      'classifies reviewed OpenSpec fixture %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, readFileSync(join(workspace, path)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        if (classified === null || typeof classified !== 'object' || !('entries' in classified))
          throw new Error('CLI classification lacks its entries');
        expect(classified.entries).toEqual([
          {
            path,
            mode: '100644',
            blob: hash(repository, path),
            classification: { kind: 'content', contentClass: 'fixture' },
          },
        ]);
      },
    );

    test.each([
      'openspec/changes/wbs-work-packages/fixtures/unreviewed.json',
      'openspec/changes/wbs-work-packages/fixtures/nested/command-json-duplicates.json',
    ])('refuses unreviewed OpenSpec fixture %s with ' + policyPath, async (path) => {
      const repository = createRepository();
      write(repository, path, '{}\n');
      const invocation = await classify(
        repository,
        commitAll(repository),
        writePolicy(repository, readPolicy(policyPath)),
      );
      expect(invocation.exitCode, output(invocation)).toBe(1);
      expect(output(invocation)).toContain(
        'ordinary content ' + path + ' matched 2 classification rules',
      );
    });

    // Proof: without the exact rows, all three classifiers matched zero rules for HuJSON
    // and both the script and test rules for the controller exercise.
    test.each([
      ['infra/access/policy.hujson', 'config', '100644'],
      ['infra/ansible/tests/controller-run.sh', 'test', '100755'],
    ] as const)(
      'classifies merged fleet %s as %s with ' + policyPath,
      async (path, contentClass, mode) => {
        const repository = createRepository();
        write(repository, path, readFileSync(join(workspace, path)));
        chmodSync(join(repository, path), mode === '100755' ? 0o755 : 0o644);
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        if (classified === null || typeof classified !== 'object' || !('entries' in classified))
          throw new Error('CLI classification lacks its entries');
        expect(classified.entries).toEqual([
          {
            path,
            mode,
            blob: hash(repository, path),
            classification: { kind: 'content', contentClass },
          },
        ]);
      },
    );

    test.each([
      ['openspec/changes/wbs-work-packages/proposal.md', 'openspec'],
      ['libs/example/fixtures/command-json-duplicates.json', 'fixture'],
    ] as const)('preserves ordinary %s as %s with ' + policyPath, async (path, contentClass) => {
      const repository = createRepository();
      write(repository, path, 'ordinary text\n');
      const invocation = await classify(
        repository,
        commitAll(repository),
        writePolicy(repository, readPolicy(policyPath)),
      );
      expect(invocation.exitCode, output(invocation)).toBe(0);
      const classified: unknown = JSON.parse(standardOutput(invocation));
      if (classified === null || typeof classified !== 'object' || !('entries' in classified))
        throw new Error('CLI classification lacks its entries');
      expect(classified.entries).toEqual([
        {
          path,
          mode: '100644',
          blob: hash(repository, path),
          classification: { kind: 'content', contentClass },
        },
      ]);
    });
  }
});

describe('shipped current-PR OpenSpec gzip fixture boundaries', () => {
  // Proof: openspec-gzip-real-red-v384 observed all eighteen exact missing archive
  // declarations. openspec-gzip-green-controls-v385 passed their exact metadata and
  // thirty strict unlisted-byte/ordinary-text controls across five capture manifests.
  // The unchanged predecessor snapshots confer no new current replay or host authority.
  const workspace = join(import.meta.dir, '../../../../../..');
  const fixtureRoot = 'openspec/changes/wbs-work-packages/fixtures/';
  const groups = {
    dash: {
      consumer:
        'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/runtime-rename.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor capture pinned by openspec/changes/wbs-work-packages/fixtures/legacy-dash-runtime6.json at Source 7bdb31fd592eba83e696f570fbf9d2e1d9f26ebf. Replacing this archive requires a newly characterized capture; historical receipts confer no current runtime or host authority.',
      },
    },
    resource: {
      consumer: 'apps/wbs/be-01/src/controller/resource-legacy-rename.controller.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor capture pinned by openspec/changes/wbs-work-packages/fixtures/legacy-resource-capture.json at Source 7bdb31fd592eba83e696f570fbf9d2e1d9f26ebf. Replacing this archive requires a newly characterized capture; historical receipts confer no current runtime or host authority.',
      },
    },
    cleanedResource: {
      consumer: 'apps/wbs/be-01/src/controller/resource-legacy-rename.controller.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Outgoing runtime cleanup capture pinned by openspec/changes/wbs-work-packages/fixtures/legacy-resource-cleaned-capture.json at source 1816f5848e11c40786f7919388f98abeb330ebeb. Replacing this archive requires a newly characterized capture; historical receipts confer no current runtime or host authority.',
      },
    },
    terminal: {
      consumer:
        'apps/wbs/be-01/src/controller/resource-terminal-legacy-rename.controller.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor capture pinned by openspec/changes/wbs-work-packages/fixtures/legacy-resource-terminal-capture.json at Source 7bdb31fd592eba83e696f570fbf9d2e1d9f26ebf. Replacing this archive requires a newly characterized capture; historical receipts confer no current runtime or host authority.',
      },
    },
    runtime: {
      consumer: 'apps/twilight-structure/twilight-dash/cli/src/runs/testing/recovery-receiver.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor capture pinned by openspec/changes/wbs-work-packages/fixtures/legacy-runtime-database-capture.json at Source 7bdb31fd592eba83e696f570fbf9d2e1d9f26ebf. Replacing this archive requires a newly characterized capture; historical receipts confer no current runtime or host authority.',
      },
    },
    recovery: {
      consumer: 'libs/wbs/adapters/store-sqlite/src/shared-people-recovery-rename.db.test.ts',
      regenerationAuthority: {
        kind: 'external',
        authority:
          'Historical predecessor capture pinned by openspec/changes/wbs-work-packages/fixtures/legacy-shared-people-recovery1.json at Source 7bdb31fd592eba83e696f570fbf9d2e1d9f26ebf. Replacing this archive requires a newly characterized capture; historical receipts confer no current runtime or host authority.',
      },
    },
  };
  const archives = [
    ['legacy-dash-runtime6.sqlite.gz', 'dash'],
    // Proof: all three policies without this declaration refused the exact archive as undeclared;
    // the ordinary-text control also missed its required declared-binary refusal.
    ['legacy-resource-cleaned1.sqlite.gz', 'cleanedResource'],
    ['legacy-resource-database1.sqlite.gz', 'resource'],
    ['legacy-resource-terminal1.sqlite.gz', 'terminal'],
    ['legacy-runtime-database1.sqlite.gz', 'runtime'],
    ['legacy-shared-people-completed1.sqlite.gz', 'recovery'],
    ['legacy-shared-people-pending1.sqlite.gz', 'recovery'],
  ] as const;
  const representatives = [
    'legacy-dash-runtime6.sqlite.gz',
    'legacy-resource-cleaned1.sqlite.gz',
    'legacy-resource-database1.sqlite.gz',
    'legacy-resource-terminal1.sqlite.gz',
    'legacy-runtime-database1.sqlite.gz',
    'legacy-shared-people-completed1.sqlite.gz',
  ];

  function readPolicy(policyPath: string): ClassificationPolicy {
    const envelope: unknown = JSON.parse(readFileSync(join(workspace, policyPath), 'utf8'));
    if (envelope === null || typeof envelope !== 'object' || !('classificationPolicy' in envelope))
      throw new Error('Shipped policy lacks its classification boundary: ' + policyPath);
    return ClassificationPolicy.assert(envelope.classificationPolicy);
  }

  for (const policyPath of [
    'docs/code-organization/rule-policy.json',
    'docs/wiki-policy/policy.json',
    'docs/wiki-policy/bootstrap-policy.json',
  ]) {
    test.each(archives)(
      'classifies reviewed OpenSpec gzip %s with ' + policyPath,
      async (filename, group) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, readFileSync(join(workspace, path)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(0);
        const classified: unknown = JSON.parse(standardOutput(invocation));
        if (classified === null || typeof classified !== 'object' || !('entries' in classified))
          throw new Error('CLI classification lacks its entries');
        expect(classified.entries).toEqual([
          {
            path,
            mode: '100644',
            blob: hash(repository, path),
            classification: {
              kind: 'content',
              contentClass: 'binary',
              format: 'application/gzip',
              ...groups[group],
            },
          },
        ]);
      },
    );

    test.each(representatives)(
      'refuses reviewed OpenSpec gzip bytes at unlisted %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + 'unlisted-' + filename;
        write(repository, path, readFileSync(join(workspace, fixtureRoot + filename)));
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(1);
        expect(output(invocation)).toContain('undeclared binary content at ' + path);
      },
    );

    test.each(representatives)(
      'refuses ordinary UTF-8 at reviewed OpenSpec gzip %s with ' + policyPath,
      async (filename) => {
        const repository = createRepository();
        const path = fixtureRoot + filename;
        write(repository, path, '{}\n');
        const invocation = await classify(
          repository,
          commitAll(repository),
          writePolicy(repository, readPolicy(policyPath)),
        );
        expect(invocation.exitCode, output(invocation)).toBe(1);
        expect(output(invocation)).toContain(
          'declared binary ' + path + ' contains ordinary UTF-8 text',
        );
      },
    );
  }
});
