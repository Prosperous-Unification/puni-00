import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ValidationError } from '@shared/validation';
import { afterAll, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import {
  prepareActivation,
  readBunActivation,
  selectActivation,
  verifyActivation,
} from './activation';

const scratch: string[] = [];
const workspace = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
afterAll(() => {
  for (const path of scratch) rmSync(path, { force: true, recursive: true });
});

function fixture(version: string) {
  const source = mkdtempSync(join(tmpdir(), `wiki-activation-source-${version}-`));
  const store = mkdtempSync(join(tmpdir(), `wiki-activation-store-${version}-`));
  const candidate = mkdtempSync(join(tmpdir(), `wiki-activation-candidate-${version}-`));
  scratch.push(source, store, candidate);
  const names = {
    authority: 'authority.json',
    ciBinding: 'ci-binding.json',
    evidence: 'evidence.json',
    launcher: 'launcher.sh',
    localBinding: 'local-binding.json',
    mapping: 'mapping.json',
    policy: 'policy.json',
    reviewReceipt: 'review-receipt.json',
    snapshotter: 'snapshotter.ts',
    validator: 'validator.mjs',
  } as const;
  const roleSources = Object.fromEntries(
    Object.entries(names).map(([role, name]) => {
      const path = join(source, name);
      writeFileSync(path, `${version}:${name}\n`);
      return [role, path];
    }),
  ) as Record<keyof typeof names, string>;
  const binding = `${JSON.stringify({
    policy: { path: 'policy.json', sha256: hashBytes(readFileSync(roleSources.policy)) },
    authority: {
      artifact: {
        path: 'authority.json',
        sha256: hashBytes(readFileSync(roleSources.authority)),
      },
    },
    validator: {
      artifacts: [
        { path: 'validator.mjs', sha256: hashBytes(readFileSync(roleSources.validator)) },
      ],
    },
  })}\n`;
  writeFileSync(roleSources.ciBinding, binding);
  writeFileSync(roleSources.localBinding, binding);
  const request = {
    candidateRepository: candidate,
    mappingIdentity: hashBytes(readFileSync(roleSources.mapping)),
    policyIdentity: hashBytes(readFileSync(roleSources.policy)),
    reviewReceiptIdentity: hashBytes(readFileSync(roleSources.reviewReceipt)),
    roleSources,
    sourceRevision: '4'.repeat(40),
    validatorIdentity: hashBytes(readFileSync(roleSources.validator)),
  };
  return { candidate, request, roleSources, source, store };
}

test('prepares a role-complete immutable activation and selects its expected identity', () => {
  const subject = fixture('v1');
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'activation-v1'),
  });
  expect(verifyActivation(prepared.directory).identity).toBe(prepared.identity);
  const selected = selectActivation(subject.store, prepared.directory, prepared.identity);
  expect(selected.identity).toBe(prepared.identity);
  expect(selectActivation(subject.store, prepared.directory, prepared.identity)).toEqual(selected);
  writeFileSync(subject.roleSources.validator, 'changed\n');
  expect(() => prepareActivation({ ...prepared.request, destination: prepared.directory })).toThrow(
    'activation validator identity differs from its artifact',
  );
  expect(verifyActivation(selected.directory).identity).toBe(prepared.identity);
});

test('packages the real launcher and a standalone build of the real validator', () => {
  const subject = fixture('real');
  const validator = join(subject.source, 'real-validator.mjs');
  const build = Bun.spawnSync(
    [
      'bun',
      'build',
      join(workspace, 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts'),
      '--target=bun',
      '--format=esm',
      `--outfile=${validator}`,
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  expect(build.exitCode, build.stderr.toString('utf8')).toBe(0);
  for (const role of ['ciBinding', 'localBinding'] as const)
    writeFileSync(
      subject.roleSources[role],
      `${JSON.stringify({
        policy: {
          path: 'policy.json',
          sha256: hashBytes(readFileSync(subject.roleSources.policy)),
        },
        authority: {
          artifact: {
            path: 'authority.json',
            sha256: hashBytes(readFileSync(subject.roleSources.authority)),
          },
        },
        validator: {
          artifacts: [{ path: 'validator.mjs', sha256: hashBytes(readFileSync(validator)) }],
        },
      })}\n`,
    );
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'real'),
    roleSources: {
      ...subject.roleSources,
      launcher: join(workspace, 'bin/tool-wiki-lint.sh'),
      snapshotter: join(
        workspace,
        'apps/twilight-structure/twilight-burokrat/cli/src/policy/snapshot-validator.ts',
      ),
      validator,
    },
    validatorIdentity: hashBytes(readFileSync(validator)),
  });
  expect(verifyActivation(prepared.directory).manifest.roles.launcher).toBe(
    'artifacts/launcher.sh',
  );
});

test('a malformed successor cannot replace the prior selected activation', () => {
  const first = fixture('first');
  const selected = prepareActivation({
    ...first.request,
    destination: join(first.store, 'activation-first'),
  });
  selectActivation(first.store, selected.directory, selected.identity);
  const successor = fixture('successor');
  const prepared = prepareActivation({
    ...successor.request,
    destination: join(first.store, 'activation-successor'),
  });
  chmodSync(join(prepared.directory, 'artifacts', 'validator.mjs'), 0o600);
  writeFileSync(join(prepared.directory, 'artifacts', 'validator.mjs'), 'tampered\n');
  expect(() => selectActivation(first.store, prepared.directory, prepared.identity)).toThrow(
    'activation artifact digest mismatch: artifacts/validator.mjs',
  );
  const descriptor = JSON.parse(readFileSync(join(first.store, 'selected.json'), 'utf8')) as {
    identity: string;
  };
  expect(descriptor.identity).toBe(selected.identity);
});

test('activation verification refuses a missing required role artifact', () => {
  const subject = fixture('missing');
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'activation-missing'),
  });
  rmSync(join(prepared.directory, 'artifacts', 'snapshotter.ts'));
  expect(() => verifyActivation(prepared.directory)).toThrow(
    'cannot read activation artifact: artifacts/snapshotter.ts',
  );
});

test('selection refuses a canonical empty or unknown-field package and a wrong expected identity', () => {
  const subject = fixture('strict');
  const empty = join(subject.store, 'empty');
  mkdirSync(empty);
  writeFileSync(
    join(empty, 'manifest.json'),
    serializeCanonical({
      artifacts: [],
      mappingIdentity: '1'.repeat(64),
      policyIdentity: '2'.repeat(64),
      reviewReceiptIdentity: '3'.repeat(64),
      roles: {},
      schemaVersion: 3,
      sourceRevision: '4'.repeat(40),
      unknownTrustedField: true,
      validatorIdentity: '5'.repeat(64),
    }),
  );
  expect(() => selectActivation(subject.store, empty, hashBytes('empty'))).toThrow();
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'complete'),
  });
  expect(() => selectActivation(subject.store, prepared.directory, 'f'.repeat(64))).toThrow(
    'activation package differs from selected identity',
  );
});

test('strict manifest decoding rejects unknown fields, duplicate roles, and omitted roles', () => {
  const subject = fixture('manifest');
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'manifest'),
  });
  const manifestPath = join(prepared.directory, 'manifest.json');
  chmodSync(manifestPath, 0o600);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown> & {
    artifacts: unknown[];
  };
  writeFileSync(manifestPath, serializeCanonical({ ...manifest, unknownTrustedField: true }));
  expect(() => verifyActivation(prepared.directory)).toThrow();
  writeFileSync(
    manifestPath,
    serializeCanonical({
      ...manifest,
      artifacts: [...manifest.artifacts.slice(0, -1), manifest.artifacts[0]],
    }),
  );
  expect(() => verifyActivation(prepared.directory)).toThrow(
    'activation artifacts contain a duplicate role or path',
  );
  writeFileSync(
    manifestPath,
    serializeCanonical({ ...manifest, artifacts: manifest.artifacts.slice(1) }),
  );
  expect(() => verifyActivation(prepared.directory)).toThrow(
    'activation artifact set is incomplete',
  );
});

test('preparation refuses a validator source with an omitted relative dependency', () => {
  const subject = fixture('dependency');
  writeFileSync(subject.roleSources.validator, "import './dependency.js';\n");
  writeFileSync(join(subject.source, 'dependency.js'), 'export const dependency = true;\n');
  expect(() =>
    prepareActivation({
      ...subject.request,
      destination: join(subject.store, 'incomplete'),
      validatorIdentity: hashBytes(readFileSync(subject.roleSources.validator)),
    }),
  ).toThrow('activation validator is not standalone: ./dependency.js');
});

test('activation preparation refuses candidate-local and dot-prefixed child destinations', () => {
  const subject = fixture('candidate-local');
  for (const destination of [
    join(subject.candidate, 'activation-v1'),
    join(subject.candidate, '..inside'),
  ]) {
    expect(() => prepareActivation({ ...subject.request, destination })).toThrow(
      'activation package destination must be outside the candidate repository',
    );
  }
});

test('activation preparation refuses a candidate-owned role source', () => {
  const subject = fixture('candidate-source');
  const candidateValidator = join(subject.candidate, 'validator.mjs');
  writeFileSync(candidateValidator, 'export const candidate = true;\n');
  expect(() =>
    prepareActivation({
      ...subject.request,
      destination: join(subject.store, 'candidate-source'),
      roleSources: { ...subject.roleSources, validator: candidateValidator },
      validatorIdentity: hashBytes(readFileSync(candidateValidator)),
    }),
  ).toThrow('activation validator source must be outside the candidate repository');
});

test.each(['policy', 'authority', 'validator', 'mapping'] as const)(
  'activation preparation refuses an unlisted %s binding reference',
  (target) => {
    const subject = fixture(`unlisted${target}`);
    const binding = JSON.parse(readFileSync(subject.roleSources.ciBinding, 'utf8')) as {
      policy: { path: string; sha256: string };
      authority: { artifact: { path: string; sha256: string } };
      validator: { artifacts: { path: string; sha256: string }[] };
      pilotModuleMapping?: { artifact: { path: string; sha256: string } };
    };
    if (target === 'policy') binding.policy.path = 'unlisted-policy.json';
    else if (target === 'authority') binding.authority.artifact.path = 'unlisted-authority.json';
    else if (target === 'validator')
      binding.validator.artifacts[0] = {
        ...binding.validator.artifacts[0],
        path: 'unlisted-validator.mjs',
      };
    else
      binding.pilotModuleMapping = {
        artifact: {
          path: 'unlisted-mapping.json',
          sha256: hashBytes(readFileSync(subject.roleSources.mapping)),
        },
      };
    writeFileSync(subject.roleSources.ciBinding, `${JSON.stringify(binding)}\n`);

    expect(() =>
      prepareActivation({
        ...subject.request,
        destination: join(subject.store, `unlisted-${target}`),
      }),
    ).toThrow(
      target === 'validator'
        ? 'activation ciBinding validator references differ from authenticated validator role'
        : `activation ciBinding ${target} reference differs from authenticated ${target} role`,
    );
  },
);

function rewriteActivation(directory: string, path: string, bytes: string): void {
  chmodSync(join(directory, path), 0o644);
  writeFileSync(join(directory, path), bytes);
}

/** Reader-only schema4 fixture; the production writer intentionally remains schema3 here. */
function createBunReaderFixture() {
  const subject = fixture('bunReader');
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'bun-reader'),
  });
  renameSync(
    join(prepared.directory, 'artifacts/launcher.sh'),
    join(prepared.directory, 'artifacts/launcher.mjs'),
  );
  const manifest = {
    ...prepared.manifest,
    schemaVersion: 4 as const,
    roles: { ...prepared.manifest.roles, launcher: 'artifacts/launcher.mjs' },
    artifacts: prepared.manifest.artifacts.map((artifact) =>
      artifact.role === 'launcher' ? { ...artifact, path: 'artifacts/launcher.mjs' } : artifact,
    ),
  };
  rewriteActivation(prepared.directory, 'launcher-path', 'artifacts/launcher.mjs\n');
  rewriteActivation(prepared.directory, 'manifest.json', serializeCanonical(manifest));
  const entries = manifest.artifacts.map((artifact) => ({
    path: artifact.path,
    identity: artifact.identity,
  }));
  for (const path of [
    'active-v1',
    'ci-binding-path',
    'evidence-path',
    'launcher-path',
    'local-binding-path',
    'snapshotter-path',
    'validator-path',
  ]) {
    entries.push({ path, identity: hashBytes(readFileSync(join(prepared.directory, path))) });
  }
  rewriteActivation(
    prepared.directory,
    'checksums.sha256',
    entries
      .sort((left, right) => (left.path < right.path ? -1 : 1))
      .map((entry) => entry.identity + '  ' + entry.path)
      .join('\n') + '\n',
  );
  return { ...subject, directory: prepared.directory, manifest };
}

test('historical activation identity remains verifiable but Bun execution refuses schema3', () => {
  const subject = fixture('historicalReader');
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'historical'),
  });
  const before = readFileSync(join(prepared.directory, 'manifest.json'));
  expect(verifyActivation(prepared.directory).identity).toBe(hashBytes(before));
  expect(() => readBunActivation(prepared.directory)).toThrow(
    'Bun execution requires activation schema 4',
  );
  expect(readFileSync(join(prepared.directory, 'manifest.json'))).toEqual(before);
});

test('verifies manually assembled schema4 role paths, original identity and unchanged selection protocol', () => {
  const subject = createBunReaderFixture();
  const verified = readBunActivation(subject.directory);
  expect(verified.manifest.schemaVersion).toBe(4);
  expect(verified.manifest.roles.launcher).toBe('artifacts/launcher.mjs');
  expect(verified.identity).toBe(hashBytes(readFileSync(join(subject.directory, 'manifest.json'))));
  expect(selectActivation(subject.store, subject.directory, verified.identity).identity).toBe(
    verified.identity,
  );
  expect(JSON.parse(readFileSync(join(subject.store, 'selected.json'), 'utf8'))).toMatchObject({
    schemaVersion: 1,
    identity: verified.identity,
  });
});

test('refuses the legacy launcher path under schema4 even with its internally consistent hashes', () => {
  const subject = fixture('mixedReader');
  const prepared = prepareActivation({
    ...subject.request,
    destination: join(subject.store, 'mixed'),
  });
  rewriteActivation(
    prepared.directory,
    'manifest.json',
    serializeCanonical({ ...prepared.manifest, schemaVersion: 4 }),
  );
  expect(() => verifyActivation(prepared.directory)).toThrow(
    'activation role path is invalid: launcher',
  );
});

test('refuses the Bun launcher path relabeled as historical schema3', () => {
  const subject = createBunReaderFixture();
  rewriteActivation(
    subject.directory,
    'manifest.json',
    serializeCanonical({ ...subject.manifest, schemaVersion: 3 }),
  );
  expect(() => verifyActivation(subject.directory)).toThrow(
    'activation role path is invalid: launcher',
  );
});

for (const damage of [
  'unknown-version',
  'unknown-field',
  'noncanonical',
  'marker',
  'descriptor',
  'checksum',
  'role-bytes',
  'missing-role',
  'duplicate-role',
  'extra-role',
] as const) {
  test('refuses schema4 ' + damage, () => {
    const subject = createBunReaderFixture();
    switch (damage) {
      case 'unknown-version':
        rewriteActivation(
          subject.directory,
          'manifest.json',
          serializeCanonical({ ...subject.manifest, schemaVersion: 999 }),
        );
        break;
      case 'unknown-field':
        rewriteActivation(
          subject.directory,
          'manifest.json',
          serializeCanonical({ ...subject.manifest, unreviewed: true }),
        );
        break;
      case 'noncanonical':
        rewriteActivation(
          subject.directory,
          'manifest.json',
          JSON.stringify(subject.manifest, null, 2),
        );
        break;
      case 'marker':
        rewriteActivation(subject.directory, 'active-v1', 'unreviewed\n');
        break;
      case 'descriptor':
        rewriteActivation(subject.directory, 'launcher-path', 'artifacts/launcher.sh\n');
        break;
      case 'checksum':
        rewriteActivation(subject.directory, 'checksums.sha256', 'unreviewed\n');
        break;
      case 'role-bytes':
        rewriteActivation(subject.directory, 'artifacts/launcher.mjs', 'changed\n');
        break;
      case 'missing-role':
        rewriteActivation(
          subject.directory,
          'manifest.json',
          serializeCanonical({
            ...subject.manifest,
            artifacts: subject.manifest.artifacts.filter(
              (artifact) => artifact.role !== 'launcher',
            ),
          }),
        );
        break;
      case 'duplicate-role':
        rewriteActivation(
          subject.directory,
          'manifest.json',
          serializeCanonical({
            ...subject.manifest,
            artifacts: subject.manifest.artifacts.map((artifact) =>
              artifact.role === 'launcher' ? subject.manifest.artifacts[0] : artifact,
            ),
          }),
        );
        break;
      case 'extra-role':
        rewriteActivation(
          subject.directory,
          'manifest.json',
          serializeCanonical({
            ...subject.manifest,
            artifacts: [
              ...subject.manifest.artifacts,
              { role: 'unknown', path: 'artifacts/unknown', identity: 'a'.repeat(64) },
            ],
          }),
        );
        break;
    }
    const expected = {
      'unknown-version': ValidationError,
      'unknown-field': ValidationError,
      noncanonical: 'activation manifest is not canonical',
      marker: 'activation marker differs from its package contract',
      descriptor: 'activation launcher descriptor differs from its package contract',
      checksum: 'activation checksum manifest differs from roles',
      'role-bytes': 'activation artifact digest mismatch: artifacts/launcher.mjs',
      'missing-role': 'activation artifact set is incomplete',
      'duplicate-role': 'activation artifacts contain a duplicate role or path',
      'extra-role': ValidationError,
    }[damage];
    expect(() => readBunActivation(subject.directory)).toThrow(expected);
  });
}
