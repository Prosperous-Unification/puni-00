import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { hashBytes, hashCanonical } from './content-manifest';
import type { inspectLevelFacts } from './level-facts';

const scratch: string[] = [];
const projectRoot = 'apps/example';
const manifestPath = `${projectRoot}/project.json`;
const declarationPath = `${projectRoot}/playwright.performance.cases.json`;
const configPath = `${projectRoot}/playwright.performance.config.ts`;
const fixturePath = `${projectRoot}/e2e-performance/cells.perf.spec.ts`;

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
function file(repository: string, path: string, source: string): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, source);
}
function fixture(
  conformanceTarget = false,
  fixtureKind: 'regular' | 'symlink' | 'missing' = 'regular',
) {
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
                command: 'bun test src/example.test.ts --timeout=1000',
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
  const pin = (path: keyof typeof sources) => ({ path, digest: hashBytes(sources[path]) });
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
function recommit(selected: ReturnType<typeof fixture>, path: string, source: string) {
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
  expect(invocation.stderr).toContain('committed Conformance source is unsupported');
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

test('[TEST-AXES-078] unknown authority keys and committed Architecture are refused', async () => {
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
  expect(invocation.stderr).toContain('committed Architecture source is unsupported');
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
