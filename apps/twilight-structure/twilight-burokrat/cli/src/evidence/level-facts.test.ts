import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { decodePerformanceCases } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { hashBytes, hashCanonical } from './content-manifest';
import type { inspectLevelFacts } from './level-facts';

const scratch: string[] = [];
const projectRoot = 'apps/example';
const manifestPath = `${projectRoot}/project.json`;
const declarationPath = `${projectRoot}/playwright.performance.cases.json`;
const configPath = `${projectRoot}/playwright.performance.config.ts`;
const fixturePath = `${projectRoot}/e2e-performance/cells.perf.test.ts`;

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
function file(repository: string, path: string, source: string | Uint8Array): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, source);
}
function fixture(
  conformanceTarget = false,
  fixtureKind: 'regular' | 'symlink' | 'missing' = 'regular',
  fixtureRoot = projectRoot,
) {
  const projectRoot = fixtureRoot;
  const manifestPath = `${projectRoot}/project.json`;
  const declarationPath = `${projectRoot}/playwright.performance.cases.json`;
  const configPath = `${projectRoot}/playwright.performance.config.ts`;
  const fixturePath = `${projectRoot}/e2e-performance/cells.perf.test.ts`;
  const base = mkdtempSync(join(tmpdir(), 'level-facts-'));
  scratch.push(base);
  const repository = join(base, 'candidate');
  mkdirSync(repository);
  git(repository, 'init');
  git(repository, 'config', 'user.name', 'Facts Fixture');
  git(repository, 'config', 'user.email', 'facts@example.invalid');
  const sources = {
    [manifestPath]: JSON.stringify({
      name: 'example',
      root: projectRoot,
      targets: conformanceTarget
        ? {
            'test:conformance': {
              executor: 'nx:run-commands',
              options: {
                command: 'bun test ./src/example.test.ts --timeout=1000',
                cwd: projectRoot,
                forwardAllArgs: false,
              },
            },
          }
        : {},
    }),
    [declarationPath]: JSON.stringify({
      schemaVersion: 1,
      config: configPath,
      project: 'chromium',
      cases: [
        {
          caseId: 'cells',
          fixture: fixturePath,
          titlePath: ['renders cells'],
          measurement: 'mounted-cells',
          unit: 'count',
          operator: 'lte',
          threshold: 20,
        },
      ],
    }),
    [configPath]: 'throw new Error("candidate code executed");\n',
    [fixturePath]: 'throw new Error("candidate code executed");\n',
  };
  for (const [path, source] of Object.entries(sources)) {
    if (path === fixturePath && fixtureKind === 'missing') continue;
    if (path === fixturePath && fixtureKind === 'symlink') {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      symlinkSync('../playwright.performance.config.ts', join(repository, path));
      continue;
    }
    file(repository, path, source);
  }
  git(repository, 'add', '.');
  git(repository, 'commit', '-m', 'candidate');
  const revision = git(repository, 'rev-parse', 'HEAD');
  const selected = readCandidate(repository, { kind: 'committed', revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const pin = (path: string) => ({ path, digest: hashBytes(sources[path]) });
  const authority = {
    schemaVersion: 1,
    revision,
    candidate,
    scope: {
      projectRoot,
      projectManifest: pin(manifestPath),
      declaration: pin(declarationPath),
      config: pin(configPath),
      project: 'chromium',
      fixtures: [fixturePath],
    },
    manual: { kind: 'reviewed-empty' },
    conformance: { kind: 'reviewed-empty' },
    architecture: { kind: 'reviewed-empty' },
  };
  const authorityPath = join(base, 'authority.json');
  const writeAuthority = () => {
    writeFileSync(authorityPath, JSON.stringify(authority));
  };
  writeAuthority();
  const inspect = (requested = revision) =>
    invokeCli(['inspect-level-facts', repository, requested, authorityPath]);
  return { repository, revision, authority, authorityPath, writeAuthority, inspect };
}
function recommit(selected: ReturnType<typeof fixture>, path: string, source: string | Uint8Array) {
  file(selected.repository, path, source);
  git(selected.repository, 'add', '.');
  git(selected.repository, 'commit', '-m', 'changed source');
  const revision = git(selected.repository, 'rev-parse', 'HEAD');
  const snapshot = readCandidate(selected.repository, { kind: 'committed', revision });
  selected.authority.revision = revision;
  selected.authority.candidate = hashCanonical({
    selection: snapshot.selection,
    entries: snapshot.entries,
    untracked: snapshot.untracked,
  });
  const pin = [
    selected.authority.scope.projectManifest,
    selected.authority.scope.declaration,
    selected.authority.scope.config,
  ].find((candidatePin) => candidatePin.path === path);
  if (pin !== undefined) pin.digest = hashBytes(source);
  selected.writeAuthority();
  return revision;
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('[TEST-AXES-077] facts bind explicit reviewed empties and committed scope without executing candidate code', async () => {
  const selected = fixture();
  file(selected.repository, fixturePath, 'working replacement\n');
  const invocation = await selected.inspect();
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr).toBe('');
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.revision).toBe(selected.revision);
  expect(observation.candidate).toBe(selected.authority.candidate);
  expect(observation.scope.fixtures).toEqual([fixturePath]);
  expect(observation.memberships).toEqual({
    manual: { kind: 'reviewed-empty' },
    conformance: { kind: 'reviewed-empty' },
    architecture: { kind: 'reviewed-empty' },
    performance: [fixturePath],
  });
  expect(
    observation.sources.find((source: { path: string }) => source.path === fixturePath)
      ?.contentDigest,
  ).toBe(hashBytes('throw new Error("candidate code executed");\n'));
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  expect(observation).not.toHaveProperty('level');
  expect(observation).not.toHaveProperty('coverage');
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-078] missing or unsupported Manual and changed pins refuse without JSON', async () => {
  const selected = fixture();
  for (const manual of [
    undefined,
    { kind: 'committed', path: 'manual.json', digest: '0'.repeat(64) },
  ]) {
    const altered = { ...selected.authority, manual };
    writeFileSync(selected.authorityPath, JSON.stringify(altered));
    const invocation = await selected.inspect();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toMatch(/manual/i);
  }
  selected.authority.manual = { kind: 'reviewed-empty' };
  selected.authority.scope.config.digest = '0'.repeat(64);
  selected.writeAuthority();
  const mismatch = await selected.inspect();
  expect(mismatch.exitCode).toBe(1);
  expect(mismatch.stdout).toBe('');
  expect(mismatch.stderr).toContain('config digest');
});

test('[TEST-AXES-080] symbolic and annotated tag objects refuse exact committed selection', async () => {
  const selected = fixture();
  const symbolic = await selected.inspect('HEAD');
  expect(symbolic.exitCode).toBe(1);
  expect(symbolic.stdout).toBe('');
  expect(symbolic.stderr).toContain('full committed SHA');
  git(selected.repository, 'tag', '-a', 'release', '-m', 'release', selected.revision);
  const tag = git(selected.repository, 'rev-parse', 'release^{tag}');
  const annotated = await selected.inspect(tag);
  expect(annotated.exitCode).toBe(1);
  expect(annotated.stdout).toBe('');
  expect(annotated.stderr).toContain('selected revision differs');
});

test('[TEST-AXES-078] reviewed-empty Conformance contradicts a present target', async () => {
  const selected = fixture(true);
  const invocation = await selected.inspect();
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('Conformance reviewed-empty contradicts committed target');
});

test('[TEST-AXES-079] an absent selected blob refuses despite a working-tree replacement', async () => {
  const selected = fixture();
  const blob = git(selected.repository, 'rev-parse', `${selected.revision}:${fixturePath}`);
  unlinkSync(join(selected.repository, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  file(selected.repository, fixturePath, 'working repair\n');
  const invocation = await selected.inspect();
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('cannot read selected blob');
});

test('[TEST-AXES-079] missing and symlinked committed fixtures refuse despite working repairs', async () => {
  for (const kind of ['missing', 'symlink'] as const) {
    const selected = fixture(false, kind);
    const invocation = await selected.inspect();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('not a selected regular blob');
  }
});

test('[TEST-AXES-078] source and scope mismatches refuse before facts', async () => {
  const selected = fixture();
  selected.authority.candidate = '0'.repeat(64);
  selected.writeAuthority();
  let invocation = await selected.inspect();
  expect(invocation.stderr).toContain('authority candidate differs');
  selected.authority.candidate = hashCanonical(
    (() => {
      const snapshot = readCandidate(selected.repository, {
        kind: 'committed',
        revision: selected.revision,
      });
      return {
        selection: snapshot.selection,
        entries: snapshot.entries,
        untracked: snapshot.untracked,
      };
    })(),
  );
  selected.authority.scope.projectManifest.path = configPath;
  selected.writeAuthority();
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('project manifest differs');
  selected.authority.scope.projectManifest.path = manifestPath;
  selected.authority.scope.config.path = declarationPath;
  selected.writeAuthority();
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('conflicting source paths');
  selected.authority.scope.config.path = configPath;
  writeFileSync(
    selected.authorityPath,
    JSON.stringify({
      ...selected.authority,
      conformance: { kind: 'committed', path: manifestPath, digest: '0'.repeat(64) },
    }),
  );
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('Conformance pin differs from project manifest');
});

test('[TEST-AXES-079] malformed committed manifest and declaration mismatch refuse', async () => {
  const malformed = fixture();
  const revision = recommit(malformed, manifestPath, '{}');
  let invocation = await malformed.inspect(revision);
  expect(invocation.stderr).toContain('project manifest is malformed');
  const arrayRevision = recommit(malformed, manifestPath, '{"targets":[]}');
  invocation = await malformed.inspect(arrayRevision);
  expect(invocation.stderr).toContain('project manifest is malformed');
  const mismatch = fixture();
  const altered = JSON.stringify({
    schemaVersion: 1,
    config: configPath,
    project: 'webkit',
    cases: [
      {
        caseId: 'cells',
        fixture: fixturePath,
        titlePath: ['renders cells'],
        measurement: 'mounted-cells',
        unit: 'count',
        operator: 'lte',
        threshold: 20,
      },
    ],
  });
  const revised = recommit(mismatch, declarationPath, altered);
  invocation = await mismatch.inspect(revised);
  expect(invocation.stderr).toContain('Performance declaration differs');
});

test('[TEST-AXES-079] invalid UTF-8 inside a pinned committed manifest refuses by name', async () => {
  const selected = fixture();
  const invalidManifest = Uint8Array.from([
    ...new TextEncoder().encode('{"targets":{},"name":"'),
    0xff,
    ...new TextEncoder().encode('"}'),
  ]);
  const revision = recommit(selected, manifestPath, invalidManifest);
  const invocation = await selected.inspect(revision);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('level facts project manifest is not UTF-8');
});

test('[TEST-AXES-078] a declaration omitting an authority fixture refuses completeness', async () => {
  const selected = fixture();
  const revised = recommit(
    selected,
    declarationPath,
    JSON.stringify({
      schemaVersion: 1,
      config: configPath,
      project: 'chromium',
      cases: [
        {
          caseId: 'other',
          fixture: `${projectRoot}/e2e-performance/other.perf.spec.ts`,
          titlePath: ['other'],
          measurement: 'mounted-cells',
          unit: 'count',
          operator: 'lte',
          threshold: 20,
        },
      ],
    }),
  );
  const invocation = await selected.inspect(revised);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('fixtures differ from complete declaration');
});

test('[TEST-AXES-078] external authority and command shape refuse malformed input', async () => {
  const selected = fixture();
  rmSync(selected.authorityPath);
  let invocation = await selected.inspect();
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('level facts authority');
  writeFileSync(selected.authorityPath, '{');
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('authority JSON is malformed');
  selected.writeAuthority();
  const extra = await invokeCli([
    'inspect-level-facts',
    selected.repository,
    selected.revision,
    selected.authorityPath,
    'extra',
  ]);
  expect(extra.exitCode).toBe(1);
  expect(extra.stdout).toBe('');
  expect(extra.stderr).toContain('usage: twilight-burokrat inspect-level-facts');
});

test('[TEST-AXES-078] unknown authority keys and wrong committed Architecture path are refused', async () => {
  const selected = fixture();
  writeFileSync(selected.authorityPath, JSON.stringify({ ...selected.authority, unknown: true }));
  let invocation = await selected.inspect();
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('unknown');
  writeFileSync(
    selected.authorityPath,
    JSON.stringify({
      ...selected.authority,
      architecture: {
        kind: 'committed',
        path: manifestPath,
        digest: selected.authority.scope.projectManifest.digest,
      },
    }),
  );
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('Architecture policy pin differs from fixed runner path');
});

test('[TEST-AXES-078] incomplete, duplicate and outside scope refuse by name', async () => {
  const selected = fixture();
  selected.authority.scope.fixtures = [];
  selected.writeAuthority();
  let invocation = await selected.inspect();
  expect(invocation.stderr).toContain('unique nonempty fixtures');
  expect(invocation.stdout).toBe('');
  selected.authority.scope.fixtures = [fixturePath, fixturePath];
  selected.writeAuthority();
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('unique nonempty fixtures');
  selected.authority.scope.fixtures = ['other/cells.perf.spec.ts'];
  selected.writeAuthority();
  invocation = await selected.inspect();
  expect(invocation.stderr).toContain('escapes declared project scope');
});

test('[TEST-AXES-080] authority byte identity changes the digest without promoting coverage', async () => {
  const selected = fixture();
  const original = JSON.parse((await selected.inspect()).stdout) as ReturnType<
    typeof inspectLevelFacts
  >;
  writeFileSync(selected.authorityPath, `\n${JSON.stringify(selected.authority)}\n`);
  const changed = JSON.parse((await selected.inspect()).stdout) as ReturnType<
    typeof inspectLevelFacts
  >;
  expect(changed.authorityDigest).not.toBe(original.authorityDigest);
  expect(changed.observationDigest).not.toBe(original.observationDigest);
  expect(changed.certifies).toBe(false);
  expect(changed).not.toHaveProperty('coverage');
});

function conformanceTarget(
  command = 'bun test ./e2e-performance/cells.perf.test.ts ./src/other.test.ts --timeout=1000',
) {
  return {
    executor: 'nx:run-commands',
    cache: false,
    inputs: ['default', '^production'],
    options: { command, cwd: projectRoot, forwardAllArgs: false },
  };
}
function committedConformance(target: unknown = conformanceTarget(), projectRoot = 'apps/example') {
  const manifestPath = `${projectRoot}/project.json`;
  const selected = fixture(false, 'regular', projectRoot);
  file(
    selected.repository,
    `${projectRoot}/src/other.test.ts`,
    'throw new Error("candidate executed");\n',
  );
  const revision = recommit(
    selected,
    manifestPath,
    JSON.stringify({
      targets: { 'test:conformance': target, 'test:conformance:level': { executor: 'ignored' } },
    }),
  );
  const committed = { kind: 'committed', ...selected.authority.scope.projectManifest };
  const writeCommitted = (pin = committed) => {
    writeFileSync(
      selected.authorityPath,
      JSON.stringify({
        ...selected.authority,
        conformance: pin,
      }),
    );
  };
  writeCommitted();
  return { ...selected, writeCommitted, inspectCommitted: () => selected.inspect(revision) };
}

test('[TEST-AXES-081] committed Conformance binds complete selected sources and preserves Performance overlap', async () => {
  const selected = committedConformance();
  file(selected.repository, `${projectRoot}/src/other.test.ts`, 'working replacement');
  const invocation = await selected.inspectCommitted();
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr).toBe('');
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.memberships.conformance).toEqual({
    kind: 'committed',
    ...selected.authority.scope.projectManifest,
    files: [fixturePath],
  });
  expect(observation.memberships.performance).toEqual([fixturePath]);
  expect(observation.sources.map((source) => source.path)).toEqual(
    [
      fixturePath,
      declarationPath,
      configPath,
      manifestPath,
      `${projectRoot}/src/other.test.ts`,
    ].sort(),
  );
  expect(
    observation.sources.find((source) => source.path.endsWith('other.test.ts'))?.contentDigest,
  ).toBe(hashBytes('throw new Error("candidate executed");\n'));
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  expect(observation).not.toHaveProperty('coverage');
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
  const reordered = committedConformance(
    conformanceTarget(
      'bun test ./src/other.test.ts ./e2e-performance/cells.perf.test.ts --timeout=1000',
    ),
  );
  const second = JSON.parse((await reordered.inspectCommitted()).stdout) as ReturnType<
    typeof inspectLevelFacts
  >;
  expect(second.memberships.conformance).toEqual({
    kind: 'committed',
    ...reordered.authority.scope.projectManifest,
    files: [fixturePath],
  });
  expect(second.sources.map((source) => source.path)).toEqual(
    observation.sources.map((source) => source.path),
  );
});

test('[TEST-AXES-081] committed Conformance empty intersection is explicit and optional metadata can be absent', async () => {
  const { cache, inputs, ...target } = conformanceTarget(
    'bun test ./src/other.test.ts --timeout=1',
  );
  const selected = committedConformance(target);
  const invocation = await selected.inspectCommitted();
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.memberships.conformance).toEqual({
    kind: 'committed',
    ...selected.authority.scope.projectManifest,
    files: [],
  });
  expect(observation.sources.some((source) => source.path.endsWith('other.test.ts'))).toBe(true);
});

test('[TEST-AXES-082] committed Conformance pin must equal the scope manifest', async () => {
  const selected = committedConformance();
  for (const pin of [
    {
      kind: 'committed',
      path: configPath,
      digest: selected.authority.scope.projectManifest.digest,
    },
    { kind: 'committed', path: manifestPath, digest: '0'.repeat(64) },
  ]) {
    selected.writeCommitted(pin);
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('Conformance pin differs from project manifest');
  }
});

test('[TEST-AXES-082] committed Conformance requires the exact supported target shape', async () => {
  const target = conformanceTarget();
  for (const malformed of [
    undefined,
    [],
    null,
    { ...target, executor: 'foreign:executor' },
    { ...target, cache: true },
    { ...target, inputs: ['default'] },
    { ...target, inputs: ['default', '^production', 'extra'] },
    { ...target, configurations: {} },
    { ...target, dependsOn: ['test'] },
    { ...target, options: { ...target.options, cwd: '.' } },
    { ...target, options: { ...target.options, forwardAllArgs: true } },
    { ...target, options: { ...target.options, env: {} } },
    { ...target, options: { cwd: projectRoot, forwardAllArgs: false } },
  ]) {
    const selected = committedConformance(malformed);
    // Explicit undefined removes the key rather than invoking the helper default.
    if (malformed === undefined) {
      const revision = recommit(
        selected,
        manifestPath,
        '{"targets":{"test:conformance:level":{}}}',
      );
      selected.writeCommitted({ kind: 'committed', ...selected.authority.scope.projectManifest });
      const invocation = await selected.inspect(revision);
      expect(invocation.stderr).toContain('Conformance target is unsupported');
      continue;
    }
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('Conformance target is unsupported');
  }
});

test('[TEST-AXES-083] Conformance command rejects unsafe grammar and duplicate selectors', async () => {
  for (const command of [
    'bun test --timeout=1000',
    'bun test ./src/other.test.ts --timeout=0',
    'bun test ./src/other.test.ts --timeout=01',
    'bun test ./src/other.test.ts --timeout=1.5',
    'bun test ./src/other.test.ts --timeout=+1',
    'bun test ./src/other.test.ts --timeout=1 extra',
    'bun test ./src/other.test.ts --coverage --timeout=1000',
    'bun test ./src/other.test.ts ./src/other.test.ts --timeout=1000',
    'bun test ../other.test.ts --timeout=1000',
    'bun test src/other.test.ts --timeout=1000',
    'bun test ././src/other.test.ts --timeout=1000',
    'bun test /src/other.test.ts --timeout=1000',
    'bun test ./src//other.test.ts --timeout=1000',
    'bun test ./src/../other.test.ts --timeout=1000',
    'bun test ./src/*.test.ts --timeout=1000',
    'bun test "src/other.test.ts" --timeout=1000',
    'bun test ./src/other.test.ts;echo --timeout=1000',
    'bun test ./src/$(whoami).test.ts --timeout=1000',
    'bun test -other.test.ts --timeout=1000',
    'bun test ./src/other.spec.ts --timeout=1000',
    'bun  test ./src/other.test.ts --timeout=1000',
    'bun test ./src/other.test.ts\t--timeout=1000',
    'bun test ./src/other.test.ts --timeout=1000\n',
  ]) {
    const selected = committedConformance(conformanceTarget(command));
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('Conformance command is unsupported');
  }
});

test('[TEST-AXES-083] Conformance files outside the intersection must be selected regular readable blobs', async () => {
  for (const kind of ['missing', 'symlink', 'unreadable'] as const) {
    const selected = committedConformance();
    const path = `${projectRoot}/src/other.test.ts`;
    let revision = selected.authority.revision;
    if (kind === 'unreadable') {
      const blob = git(selected.repository, 'rev-parse', `${revision}:${path}`);
      unlinkSync(join(selected.repository, '.git/objects', blob.slice(0, 2), blob.slice(2)));
    } else {
      unlinkSync(join(selected.repository, path));
      if (kind === 'symlink')
        symlinkSync('../playwright.performance.config.ts', join(selected.repository, path));
      revision = recommit(selected, configPath, 'changed sentinel');
      selected.writeCommitted({ kind: 'committed', ...selected.authority.scope.projectManifest });
    }
    if (kind === 'symlink') unlinkSync(join(selected.repository, path));
    file(selected.repository, path, 'working repair');
    const invocation = await selected.inspect(revision);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(
      kind === 'unreadable' ? 'cannot read selected blob' : 'not a selected regular blob',
    );
  }
});

test('[TEST-AXES-081] installed executable accepts committed Conformance facts without candidate execution', async () => {
  const selected = committedConformance();
  const packageRoot = mkdtempSync(join(tmpdir(), 'level-facts-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      join(packageRoot, 'dist/bin.mjs'),
      'inspect-level-facts',
      selected.repository,
      selected.authority.revision,
      selected.authorityPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr.toString()).toBe('');
  const observation = JSON.parse(invocation.stdout.toString()) as ReturnType<
    typeof inspectLevelFacts
  >;
  expect(observation.memberships.conformance).toEqual({
    kind: 'committed',
    ...selected.authority.scope.projectManifest,
    files: [fixturePath],
  });
  expect(observation.certifies).toBe(false);
}, 120_000);

test('[TEST-AXES-081] multiple committed overlaps have canonical order and unique complete source tuples', async () => {
  const alphaPath = `${projectRoot}/e2e-performance/alpha.perf.test.ts`;
  const selected = committedConformance(
    conformanceTarget(
      'bun test ./e2e-performance/cells.perf.test.ts ./src/other.test.ts ./e2e-performance/alpha.perf.test.ts --timeout=1000',
    ),
  );
  file(selected.repository, alphaPath, 'throw new Error("alpha candidate executed");');
  const declaration = decodePerformanceCases(
    JSON.parse(readFileSync(join(selected.repository, declarationPath), 'utf8')) as unknown,
  );
  declaration.cases.push({
    ...declaration.cases[0],
    caseId: 'alpha',
    fixture: alphaPath,
    titlePath: ['alpha'],
  });
  selected.authority.scope.fixtures = [fixturePath, alphaPath];
  const revision = recommit(selected, declarationPath, JSON.stringify(declaration));
  selected.writeCommitted();
  const invocation = await selected.inspect(revision);
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.memberships.conformance).toEqual({
    kind: 'committed',
    ...selected.authority.scope.projectManifest,
    files: [alphaPath, fixturePath],
  });
  expect(observation.memberships.performance).toEqual([alphaPath, fixturePath]);
  const paths = observation.sources.map((source) => source.path);
  expect(paths).toEqual([...new Set(paths)].sort());
  expect(paths).toHaveLength(6);
});

const sqliteRoot = 'libs/wbs/adapters/store-sqlite';
const sqliteInputs = ['default', '^production', '{workspaceRoot}/apps/wbs/be-01/drizzle'];

test('[TEST-AXES-081] exact Memory and SQLite target envelopes preserve command-only membership', async () => {
  for (const root of ['libs/wbs/adapters/store-memory', sqliteRoot]) {
    const relative =
      root === sqliteRoot
        ? 'src/testing/source-conformance.db.test.ts'
        : 'src/testing/source-conformance.test.ts';
    const timeout = root === sqliteRoot ? 30000 : 10000;
    const manifest = JSON.parse(
      readFileSync(new URL(`../../../../../../${root}/project.json`, import.meta.url), 'utf8'),
    ) as { targets: Record<string, unknown> };
    const target = manifest.targets['test:conformance'];
    expect(target).toEqual({
      executor: 'nx:run-commands',
      cache: false,
      inputs: root === sqliteRoot ? sqliteInputs : ['default', '^production'],
      options: {
        command: `bun test ./${relative} --timeout=${String(timeout)}`,
        cwd: root,
        forwardAllArgs: false,
      },
    });
    const selected = committedConformance(target, root);
    const path = `${root}/${relative}`;
    const revision = recommit(selected, path, 'throw new Error("committed source executed");');
    selected.writeCommitted();
    const invocation = await selected.inspect(revision);
    expect(invocation.exitCode).toBe(0);
    const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
    expect(observation.memberships.conformance).toEqual({
      kind: 'committed',
      ...selected.authority.scope.projectManifest,
      files: [],
    });
    expect(observation.sources.map((source) => source.path)).toContain(path);
    expect(observation.sources).toHaveLength(5);
    expect(observation.sources.some((source) => source.path.includes('drizzle'))).toBe(false);
  }
});

test('[TEST-AXES-082] SQLite dependency inputs require the exact tuple and exact SQLite project root', async () => {
  for (const [root, inputs] of [
    [projectRoot, sqliteInputs],
    ['libs/wbs/adapters/store-memory', sqliteInputs],
    [sqliteRoot, ['default', '^production', '{workspaceRoot}/apps/wbs/be-01/drizzle/']],
    [sqliteRoot, ['default', '{workspaceRoot}/apps/wbs/be-01/drizzle', '^production']],
    [sqliteRoot, [...sqliteInputs, 'extra']],
    [sqliteRoot, ['default', '^production', { fileset: '{workspaceRoot}/apps/wbs/be-01/drizzle' }]],
  ] as const) {
    const target = conformanceTarget('bun test ./src/other.test.ts --timeout=1000');
    const selected = committedConformance(
      { ...target, inputs, options: { ...target.options, cwd: root } },
      root,
    );
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('Conformance target is unsupported');
  }
});

test('[TEST-AXES-083] Conformance true end constraint refuses trailing newlines and suffixes', async () => {
  for (const suffix of ['\n', '\r\n', ' extra']) {
    const selected = committedConformance(
      conformanceTarget(`bun test ./src/other.test.ts --timeout=1000${suffix}`),
    );
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('Conformance command is unsupported');
  }
});

test('[TEST-AXES-083] bare Conformance filters refuse despite an exact file and a nested matching decoy', async () => {
  const selected = committedConformance(
    conformanceTarget('bun test src/other.test.ts --timeout=1000'),
  );
  const revision = recommit(
    selected,
    `${projectRoot}/nested/src/other.test.ts`,
    'throw new Error("decoy executed");',
  );
  selected.writeCommitted();
  const invocation = await selected.inspect(revision);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('Conformance command is unsupported');
});

test('[TEST-AXES-081] explicit Conformance file operand binds only the literal committed path despite a nested decoy', async () => {
  const selected = committedConformance(
    conformanceTarget('bun test ./src/other.test.ts --timeout=1000'),
  );
  const revision = recommit(
    selected,
    `${projectRoot}/nested/src/other.test.ts`,
    'throw new Error("decoy executed");',
  );
  selected.writeCommitted();
  const invocation = await selected.inspect(revision);
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.sources.map((source) => source.path)).toContain(
    `${projectRoot}/src/other.test.ts`,
  );
  expect(observation.sources.some((source) => source.path.includes('/nested/'))).toBe(false);
});

const architecturePolicyPath = `${projectRoot}/src/architecture-fixtures.json`;
const architectureFile = `${projectRoot}/src/architecture/f7.architecture.test.ts`;
function committedArchitecture(
  policy: unknown = {
    schemaVersion: 1,
    fixtures: [{ ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' }],
  },
  overlap = false,
) {
  const selected = fixture();
  file(
    selected.repository,
    architectureFile,
    'throw new Error("architecture candidate executed");',
  );
  if (overlap) {
    const declaration = decodePerformanceCases(
      JSON.parse(readFileSync(join(selected.repository, declarationPath), 'utf8')) as unknown,
    );
    declaration.cases.push({
      ...declaration.cases[0],
      caseId: 'architecture',
      fixture: architectureFile,
      titlePath: ['architecture'],
    });
    file(selected.repository, declarationPath, JSON.stringify(declaration));
    selected.authority.scope.declaration.digest = hashBytes(JSON.stringify(declaration));
    selected.authority.scope.fixtures.push(architectureFile);
  }
  recommit(
    selected,
    architecturePolicyPath,
    typeof policy === 'string' || policy instanceof Uint8Array ? policy : JSON.stringify(policy),
  );
  const writeCommitted = (
    pin: unknown = {
      kind: 'committed',
      path: architecturePolicyPath,
      digest: hashBytes(readFileSync(join(selected.repository, architecturePolicyPath))),
    },
  ) => {
    writeFileSync(
      selected.authorityPath,
      JSON.stringify({ ...selected.authority, architecture: pin }),
    );
  };
  writeCommitted();
  const inspectCommitted = () => selected.inspect(selected.authority.revision);
  return { ...selected, writeCommitted, inspectCommitted };
}

test('[TEST-AXES-084] Architecture policy membership binds complete sources and overlap without candidate execution', async () => {
  for (const overlap of [false, true]) {
    const selected = committedArchitecture(undefined, overlap);
    file(selected.repository, architectureFile, 'working replacement');
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stderr).toBe('');
    const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
    expect(observation.memberships.architecture).toEqual({
      kind: 'committed',
      path: architecturePolicyPath,
      digest: hashBytes(readFileSync(join(selected.repository, architecturePolicyPath))),
      files: overlap ? [architectureFile] : [],
    });
    const paths = observation.sources.map((source) => source.path);
    expect(paths).toEqual([...new Set(paths)].sort());
    expect(paths).toContain(architectureFile);
    expect(paths).toContain(architecturePolicyPath);
    expect(
      observation.sources.find((source) => source.path === architectureFile)?.contentDigest,
    ).toBe(hashBytes('throw new Error("architecture candidate executed");'));
    expect(observation.authentication).toEqual({ kind: 'absent' });
    expect(observation.certifies).toBe(false);
    expect(observation).not.toHaveProperty('coverage');
    const { observationDigest, ...payload } = observation;
    expect(observationDigest).toBe(hashCanonical(payload));
  }
});

test('[TEST-AXES-085] Architecture pins and closed policies refuse by name', async () => {
  const selected = committedArchitecture();
  for (const pin of [
    {
      kind: 'committed',
      path: configPath,
      digest: hashBytes(readFileSync(join(selected.repository, architecturePolicyPath))),
    },
    { kind: 'committed', path: architecturePolicyPath, digest: '0'.repeat(64) },
  ]) {
    selected.writeCommitted(pin);
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('Architecture policy pin');
  }
  for (const [policy, message] of [
    ['{', 'JSON'],
    [Uint8Array.from([0xff]), 'UTF-8'],
    [{ schemaVersion: 2, fixtures: [] }, 'schemaVersion'],
    [{ schemaVersion: 1, fixtures: [], extra: true }, 'extra'],
    [
      {
        schemaVersion: 1,
        fixtures: [{ ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts', extra: true }],
      },
      'extra',
    ],
    [{ schemaVersion: 1, fixtures: [] }, 'no-cases'],
    [
      { schemaVersion: 1, fixtures: [{ ruleId: 'F7', file: 'src/unit.test.ts' }] },
      'cannot collect Unit',
    ],
    [
      {
        schemaVersion: 1,
        fixtures: [{ ruleId: 'F7', file: 'src/architecture/mod-index.architecture.test.ts' }],
      },
      'needs its own fixture',
    ],
    [
      {
        schemaVersion: 1,
        fixtures: [{ ruleId: 'UNKNOWN', file: 'src/architecture/unknown.architecture.test.ts' }],
      },
      'unknown rule',
    ],
    [
      {
        schemaVersion: 1,
        fixtures: [
          { ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' },
          { ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' },
        ],
      },
      'mapped twice',
    ],
  ] as const) {
    const malformed = committedArchitecture(policy);
    const invocation = await malformed.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(message);
  }
});

test('[TEST-AXES-085] Architecture validates every selected mapping even outside intersection', async () => {
  for (const kind of ['missing', 'symlink', 'unreadable', 'directory'] as const) {
    const selected = committedArchitecture();
    if (kind === 'unreadable') {
      const blob = git(
        selected.repository,
        'rev-parse',
        `${selected.authority.revision}:${architectureFile}`,
      );
      unlinkSync(join(selected.repository, '.git/objects', blob.slice(0, 2), blob.slice(2)));
    } else {
      unlinkSync(join(selected.repository, architectureFile));
      if (kind === 'symlink')
        symlinkSync(
          '../../playwright.performance.config.ts',
          join(selected.repository, architectureFile),
        );
      if (kind === 'directory') file(selected.repository, `${architectureFile}/child`, 'child');
      recommit(selected, configPath, 'changed sentinel');
      selected.writeCommitted();
      rmSync(join(selected.repository, architectureFile), { recursive: true, force: true });
    }
    file(selected.repository, architectureFile, 'working repair');
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(
      kind === 'unreadable' ? 'cannot read selected blob' : 'not a selected regular blob',
    );
  }
});

test('[TEST-AXES-086] Architecture discovers immediate suffix children including directories but ignores nested ordinary fixtures', async () => {
  for (const suffix of [
    'extra.architecture.test.ts',
    'extra.architecture.test.ts/child',
    'nested/extra.architecture.test.ts',
  ]) {
    const selected = committedArchitecture();
    recommit(
      selected,
      `${projectRoot}/src/architecture/${suffix}`,
      'throw new Error("decoy executed");',
    );
    selected.writeCommitted();
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(suffix.startsWith('nested/') ? 0 : 1);
    if (!suffix.startsWith('nested/'))
      expect(invocation.stderr).toContain('unmapped architecture fixture');
  }
});

test('[TEST-AXES-086] Architecture reviewed-empty refuses a committed policy or target', async () => {
  const policy = committedArchitecture();
  policy.writeCommitted({ kind: 'reviewed-empty' });
  const invocation = await policy.inspectCommitted();
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('Architecture reviewed-empty contradicts');
  const target = fixture();
  const revision = recommit(
    target,
    manifestPath,
    JSON.stringify({ targets: { 'test:architecture:level': {} } }),
  );
  const refused = await target.inspect(revision);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('Architecture reviewed-empty contradicts');
});

test('[TEST-AXES-086] Architecture reviewed-empty refuses a directory at the fixed policy path', async () => {
  const selected = fixture();
  const revision = recommit(selected, `${architecturePolicyPath}/child.json`, '{}');
  const invocation = await selected.inspect(revision);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(
    'Architecture reviewed-empty contradicts committed policy or target',
  );
});

test('[TEST-AXES-084] three-way overlap sorts Architecture files and deduplicates complete source tuples', async () => {
  const selected = committedArchitecture(
    {
      schemaVersion: 1,
      fixtures: [
        { ruleId: 'MOD-INDEX', file: 'src/architecture/mod-index.architecture.test.ts' },
        { ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' },
      ],
    },
    true,
  );
  const second = `${projectRoot}/src/architecture/mod-index.architecture.test.ts`;
  file(selected.repository, second, 'throw new Error("second architecture executed");');
  const declaration = decodePerformanceCases(
    JSON.parse(readFileSync(join(selected.repository, declarationPath), 'utf8')) as unknown,
  );
  declaration.cases.push({
    ...declaration.cases[0],
    caseId: 'second',
    fixture: second,
    titlePath: ['second'],
  });
  selected.authority.scope.fixtures.push(second);
  file(selected.repository, declarationPath, JSON.stringify(declaration));
  selected.authority.scope.declaration.digest = hashBytes(JSON.stringify(declaration));
  const manifest = JSON.stringify({
    targets: {
      'test:conformance': conformanceTarget(
        'bun test ./src/architecture/mod-index.architecture.test.ts ./src/architecture/f7.architecture.test.ts --timeout=1000',
      ),
    },
  });
  recommit(selected, manifestPath, manifest);
  writeFileSync(
    selected.authorityPath,
    JSON.stringify({
      ...selected.authority,
      architecture: {
        kind: 'committed',
        path: architecturePolicyPath,
        digest: hashBytes(readFileSync(join(selected.repository, architecturePolicyPath))),
      },
      conformance: { kind: 'committed', ...selected.authority.scope.projectManifest },
    }),
  );
  const invocation = await selected.inspectCommitted();
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.memberships.architecture).toHaveProperty('files', [architectureFile, second]);
  expect(observation.memberships.conformance).toHaveProperty('files', [architectureFile, second]);
  expect(observation.memberships.performance).toEqual(
    [fixturePath, architectureFile, second].sort(),
  );
  const paths = observation.sources.map((source) => source.path);
  expect(paths).toEqual([...new Set(paths)].sort());
  expect(paths).toHaveLength(7);
});

test('[TEST-AXES-084] packaged executable inspects declared Architecture without executing candidate code', async () => {
  const selected = committedArchitecture(undefined, true);
  const packageRoot = mkdtempSync(join(tmpdir(), 'architecture-facts-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      join(packageRoot, 'dist/bin.mjs'),
      'inspect-level-facts',
      selected.repository,
      selected.authority.revision,
      selected.authorityPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr.toString()).toBe('');
  const observation = JSON.parse(invocation.stdout.toString()) as ReturnType<
    typeof inspectLevelFacts
  >;
  expect(observation.memberships.architecture).toHaveProperty('files', [architectureFile]);
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
}, 120_000);

test('[TEST-AXES-085] fixed Architecture policy itself must be a readable selected regular blob despite working repair', async () => {
  for (const kind of ['missing', 'symlink', 'unreadable'] as const) {
    const selected = committedArchitecture();
    const pin = {
      kind: 'committed',
      path: architecturePolicyPath,
      digest: hashBytes(readFileSync(join(selected.repository, architecturePolicyPath))),
    };
    if (kind === 'unreadable') {
      const blob = git(
        selected.repository,
        'rev-parse',
        `${selected.authority.revision}:${architecturePolicyPath}`,
      );
      unlinkSync(join(selected.repository, '.git/objects', blob.slice(0, 2), blob.slice(2)));
    } else {
      unlinkSync(join(selected.repository, architecturePolicyPath));
      if (kind === 'symlink')
        symlinkSync(
          '../playwright.performance.config.ts',
          join(selected.repository, architecturePolicyPath),
        );
      recommit(selected, configPath, 'changed sentinel');
      selected.writeCommitted(pin);
      if (kind === 'symlink') unlinkSync(join(selected.repository, architecturePolicyPath));
    }
    file(selected.repository, architecturePolicyPath, '{"schemaVersion":1,"fixtures":[]}');
    const invocation = await selected.inspectCommitted();
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(
      kind === 'unreadable' ? 'cannot read selected blob' : 'not a selected regular blob',
    );
  }
});

test('[TEST-AXES-084] actual Burokrat Architecture policy binds all fourteen declared fixtures', async () => {
  const policy = JSON.parse(
    readFileSync(new URL('../architecture-fixtures.json', import.meta.url), 'utf8'),
  ) as { schemaVersion: number; fixtures: { ruleId: string; file: string }[] };
  expect(policy.fixtures).toHaveLength(14);
  const selected = committedArchitecture(policy);
  for (const mapping of policy.fixtures)
    file(
      selected.repository,
      `${projectRoot}/${mapping.file}`,
      'throw new Error("adopted candidate executed");',
    );
  recommit(selected, configPath, 'throw new Error("config candidate executed");');
  selected.writeCommitted();
  const invocation = await selected.inspectCommitted();
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectLevelFacts>;
  expect(observation.memberships.architecture).toHaveProperty('files', []);
  for (const mapping of policy.fixtures)
    expect(observation.sources.map((source) => source.path)).toContain(
      `${projectRoot}/${mapping.file}`,
    );
  expect(observation.sources).toHaveLength(19);
});
