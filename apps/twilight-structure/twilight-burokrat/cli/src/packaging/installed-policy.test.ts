import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, afterEach, beforeAll, expect, it } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { verifyActivation } from '../policy/activation';
import { buildPuniAssets } from '../policy/build-bun-toolkit';
import { writeCandidateCheckRuns } from '../policy/check-run-fixtures';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  prepareBaseActivation,
} from '../policy/relocation-fixtures';
import { disposeRelocationFixtures } from '../policy/relocation-fixtures';
import { createCapturedWorkspace } from '../testing/captured-workspace';
import {
  createFixture,
  exactTuple,
  satisfyApplication,
  scratchPaths,
  writeActivation,
} from '../testing/trusted-policy.test.fixture';

const roots: string[] = [];
let directory: string, validator: string, snapshotter: string, toolkitIdentity: string;
beforeAll(async () => {
  const fixture = await createCapturedWorkspace(roots);
  const built = await buildPuniAssets(fixture.source, fixture.request, fixture.context);
  if (built.kind !== 'built')
    throw new Error('actual current policy package unexpectedly cancelled');
  toolkitIdentity = built.toolkit.digest;
  directory = join(fixture.request.destination, 'dist');
  validator = join(directory, 'toolkit/validator.mjs');
  snapshotter = join(directory, 'toolkit/snapshotter.ts');
}, 180000);
afterEach(() => {
  for (const path of scratchPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function bind(fixture: ReturnType<typeof createFixture>, path = validator) {
  const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
    validator: { artifacts: { path: string; sha256: string }[] };
  };
  binding.validator.artifacts = [
    { path: realpathSync.native(path), sha256: hashBytes(readFileSync(path)) },
  ];
  writeFileSync(fixture.bindingPath, JSON.stringify(binding));
}
function invoke(
  fixture: ReturnType<typeof createFixture>,
  args: string[],
  entry = join(directory, 'puni.mjs'),
  environment: Record<string, string> = {},
) {
  return Bun.spawnSync([...createLaunch(process.execPath, entry), ...args], {
    cwd: fixture.repository,
    env: {
      PATH: '/usr/bin:/bin',
      TOOL_WIKI_TRUSTED_NODE_MODULES: join(directory, 'toolkit/trusted-node-modules'),
      ...environment,
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20000,
  });
}
function localArgs(fixture: ReturnType<typeof createFixture>, root = true) {
  return [
    ...(root ? ['b'] : []),
    'lint-local',
    'observe',
    'committed',
    fixture.repository,
    fixture.revision,
    fixture.bindingPath,
    fixture.evidencePath,
  ];
}
it('runs actual installed observe policy against its emitted validator bundle and all five deterministic checks', () => {
  const fixture = createFixture('observe');
  bind(fixture);
  const child = invoke(fixture, localArgs(fixture));
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toMatchObject({
    mode: 'observe',
    accepted: true,
    certified: false,
    debtObligationIds: ['obligation.application'],
    deterministicChecks: [
      { kind: 'inventory' },
      { kind: 'classification' },
      { kind: 'schema' },
      { kind: 'metadata-links' },
      { kind: 'selector-input-coverage' },
    ],
  });
});
it('runs actual installed CI policy with complete enforce evidence and full certification', () => {
  const fixture = createFixture('enforce');
  satisfyApplication(fixture);
  bind(fixture);
  const child = invoke(
    fixture,
    ['bur', 'lint-ci', 'committed', fixture.repository, fixture.revision, fixture.evidencePath],
    undefined,
    { TOOL_WIKI_CI_TRUSTED_BINDING: fixture.bindingPath },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toMatchObject({
    mode: 'enforce',
    trustProvenance: 'ci-preselected',
    accepted: true,
    certified: true,
  });
});
it('preserves snapshot manifest precedence over the marked standalone validator path', () => {
  const fixture = createFixture('observe');
  bind(fixture);
  const snapshot = join(fixture.trustDirectory, 'snapshot.mjs');
  const built = Bun.spawnSync(
    [
      ...createLaunch(process.execPath, snapshotter),
      fixture.bindingPath,
      validator,
      fixture.repository,
      snapshot,
    ],
    {
      cwd: fixture.repository,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    },
  );
  expect(built.exitCode, built.stderr.toString()).toBe(0);
  const child = invoke(fixture, localArgs(fixture, false), snapshot);
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toMatchObject({
    mode: 'observe',
    accepted: true,
    certified: false,
    debtObligationIds: ['obligation.application'],
  });
});
for (const fault of ['omitted', 'changed', 'same-bytes-other-path'] as const)
  it('refuses ' + fault + ' installed validator binding references', () => {
    const fixture = createFixture('observe');
    bind(fixture);
    if (fault === 'same-bytes-other-path') {
      const copy = join(fixture.trustDirectory, 'same-bytes-validator.mjs');
      cpSync(validator, copy);
      bind(fixture, copy);
    } else {
      const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
        validator: { artifacts: { path: string; sha256: string }[] };
      };
      if (fault === 'omitted') binding.validator.artifacts = [];
      else binding.validator.artifacts = [{ path: validator, sha256: 'f'.repeat(64) }];
      writeFileSync(fixture.bindingPath, JSON.stringify(binding));
    }
    const child = invoke(fixture, localArgs(fixture));
    expect(child.exitCode).toBe(1);
    expect(child.stdout.length).toBe(0);
    expect(child.stderr.toString()).not.toContain('ENOENT');
  });
it('validates installed policy activation retaining identities and reselection obligations', () => {
  const fixture = createFixture('enforce');
  bind(fixture);
  const next = writeActivation(
    fixture,
    (policy) => {
      const boundaries = policy['boundaries'] as object[],
        obligations = policy['obligations'] as object[];
      boundaries.push({
        boundaryId: 'boundary.docs',
        selector: { kind: 'path', value: 'README.md' },
        baselineEntries: [exactTuple(fixture.repository, fixture.revision, 'README.md')],
        obligationIds: ['obligation.docs'],
      });
      obligations.push({
        obligationId: 'obligation.docs',
        boundaryId: 'boundary.docs',
        checkIds: ['check.docs'],
        reviewIds: ['review.docs'],
      });
    },
    {
      addedBoundaryIds: ['boundary.docs'],
      changedBoundaryIds: [],
      addedObligationIds: ['obligation.docs'],
      removedExemptionIds: [],
      validatorChanged: false,
    },
  );
  const child = invoke(fixture, [
    'burokrat',
    'validate-policy-activation',
    fixture.repository,
    fixture.bindingPath,
    next,
  ]);
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toMatchObject({
    compatible: true,
    previous: { bindingId: 'binding.enforce.v1', policyId: 'policy.trusted.v1' },
    next: { bindingId: 'binding.next.v1', policyId: 'policy.trusted.v1' },
    reselectedCheckIds: [
      'check.application',
      'check.docs',
      'check.exemptions',
      'check.policy',
      'check.validator',
    ],
    reselectedReviewIds: [
      'review.application',
      'review.docs',
      'review.exemptions',
      'review.policy',
      'review.validator',
    ],
  });
});
for (const transport of ['root', 'standalone'] as const)
  it(
    transport === 'root'
      ? 'certifies and archives through the actual PUNI root with the produced marked validator'
      : 'certifies and archives through the produced standalone normal role',
    () => {
      const candidate = createRelocationCandidate({ reproducible: true });
      const root = mkdtempSync(join(tmpdir(), 'puni real semantic preparation '));
      roots.push(root);
      const strata = join(root, 'strata.json'),
        review = join(root, 'review.json'),
        checks = join(root, 'check-runs');
      writeFileSync(
        strata,
        JSON.stringify({
          strata: [
            {
              stratumId: 'risk.public-admission',
              sampleRateBps: 10000,
              disagreementTriggerBps: 10000,
            },
          ],
          obligations: { 'review.fixture.module': 'risk.public-admission' },
        }),
      );
      writeFileSync(
        review,
        JSON.stringify(
          auditReview(
            'review.fixture.module',
            candidate.candidateRevision,
            candidateIdentityAt(candidate.repository, candidate.candidateRevision),
          ),
        ),
      );
      writeCandidateCheckRuns(checks, {
        repository: candidate.repository,
        revision: candidate.candidateRevision,
        policyPath: 'docs/wiki-policy/policy.json',
      });
      const request = {
        candidateRepository: candidate.repository,
        candidateSha: candidate.candidateRevision,
        candidatePolicy: 'docs/wiki-policy/policy.json',
        candidateMapping: 'docs/wiki-policy/modules.json',
        auditStrata: strata,
        reviewRecord: review,
        destination: join(root, 'activation'),
        work: join(root, 'work'),
        resourceLane: 'lane.consumer-fixture',
        cwdIdentity: 'cwd.consumer-fixture',
        checkRuns: checks,
      };
      const args = [
        'b',
        'prepare-activation',
        '--candidate-repository',
        request.candidateRepository,
        '--candidate-sha',
        request.candidateSha,
        '--candidate-policy',
        request.candidatePolicy,
        '--candidate-mapping',
        request.candidateMapping,
        '--audit-strata',
        request.auditStrata,
        '--review-record',
        request.reviewRecord,
        '--destination',
        request.destination,
        '--work',
        request.work,
        '--resource-lane',
        request.resourceLane,
        '--cwd-identity',
        request.cwdIdentity,
        '--check-runs',
        request.checkRuns,
      ];
      const argv =
        transport === 'root'
          ? [...createLaunch(process.execPath, join(directory, 'puni.mjs')), ...args]
          : [
              ...createLaunch(process.execPath, join(directory, 'toolkit/prepare-activation.mjs')),
              '--puni-preparation-v1',
            ];
      const input =
        transport === 'root'
          ? ('ignore' as const)
          : Buffer.from(
              JSON.stringify({
                version: 1,
                callerDirectory: root,
                toolkitDirectory: join(directory, 'toolkit'),
                expectedToolkitIdentity: toolkitIdentity,
                request: { command: 'prepare-activation', ...request },
              }),
            );
      const child = Bun.spawnSync(argv, {
        cwd: root,
        env: { PATH: '/usr/bin:/bin' },
        stdin: input,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120000,
      });
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stderr.length).toBe(0);
      const lines = child.stdout.toString().split('\n'),
        check = lines.find((line) => line.startsWith('self-check: ')),
        version = lines.find((line) => line.startsWith('version directory: '));
      if (check === undefined || version === undefined)
        throw new Error('real preparation completion facts absent');
      expect(JSON.parse(check.slice('self-check: '.length))).toMatchObject({
        schemaVersion: 1,
        mode: 'enforce',
        trustProvenance: 'ci-preselected',
        accepted: true,
        certified: true,
      });
      expect(
        verifyActivation(version.slice('version directory: '.length)).manifest.schemaVersion,
      ).toBe(4);
      expect(
        existsSync(
          join(request.work, 'puni-activation-' + request.candidateSha.slice(0, 8) + '.tar'),
        ),
      ).toBe(true);
    },
    180000,
  );
for (const transport of ['root', 'standalone'] as const)
  it(
    transport === 'root'
      ? 'relocates and certifies through the actual PUNI root with captured marked programs'
      : 'relocates and certifies through the produced standalone relocation role',
    () => {
      const candidate = createRelocationCandidate({ reproducible: true }),
        base = prepareBaseActivation(candidate);
      const root = mkdtempSync(join(tmpdir(), 'puni real semantic relocation '));
      roots.push(root);
      cpSync(validator, join(candidate.repository, 'src/new/cli.ts'));
      cpSync(
        join(directory, 'toolkit/launcher.mjs'),
        join(candidate.repository, 'src/new/launcher.ts'),
      );
      cpSync(snapshotter, join(candidate.repository, 'src/new/policy/snapshot-validator.ts'));
      const readme = join(candidate.repository, 'src/new/README.md'),
        text = readFileSync(readme, 'utf8'),
        match = /<!-- module-index ([^\n]+) -->/u.exec(text);
      if (match?.[1] === undefined) throw new Error('semantic relocation fixture index absent');
      const metadata = JSON.parse(match[1]) as { memberships: object[] };
      metadata.memberships.push({ kind: 'path', path: 'launcher.ts' });
      writeFileSync(
        readme,
        text.replace(match[0], () => '<!-- module-index ' + JSON.stringify(metadata) + ' -->'),
      );
      function git(args: string[]) {
        const child = Bun.spawnSync(['/usr/bin/git', '-C', candidate.repository, ...args], {
          env: {
            PATH: '/usr/bin:/bin',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_SYSTEM: '/dev/null',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        if (child.exitCode !== 0) throw new Error(child.stderr.toString());
        return child.stdout.toString().trim();
      }
      git(['add', '--all']);
      git(['commit', '-m', 'capture marked semantic relocation programs']);
      const revision = git(['rev-parse', 'HEAD']);
      const review = join(root, 'review.json'),
        checks = join(root, 'check-runs'),
        work = join(root, 'work'),
        destination = join(root, 'activation');
      writeFileSync(
        review,
        JSON.stringify(
          auditReview(
            'review.fixture.module',
            revision,
            candidateIdentityAt(candidate.repository, revision),
          ),
        ),
      );
      writeCandidateCheckRuns(checks, {
        repository: candidate.repository,
        revision,
        policyPath: 'docs/wiki-policy/policy.json',
      });
      const args = [
        'b',
        'prepare-relocation-activation',
        '--candidate-repository',
        candidate.repository,
        '--candidate-sha',
        revision,
        '--base-activation',
        base.directory,
        '--candidate-policy',
        'docs/wiki-policy/policy.json',
        '--candidate-launcher',
        'src/new/launcher.ts',
        '--validator-entry',
        'src/new/cli.ts',
        '--review-record',
        review,
        '--destination',
        destination,
        '--work',
        work,
        '--resource-lane',
        'lane.relocation-fixture',
        '--cwd-identity',
        'cwd.relocation-fixture',
        '--check-runs',
        checks,
      ];
      const argv =
        transport === 'root'
          ? [...createLaunch(process.execPath, join(directory, 'puni.mjs')), ...args]
          : [
              ...createLaunch(
                process.execPath,
                join(directory, 'toolkit/prepare-relocation-activation.mjs'),
              ),
              '--puni-preparation-v1',
            ];
      const input =
        transport === 'root'
          ? ('ignore' as const)
          : Buffer.from(
              JSON.stringify({
                version: 1,
                callerDirectory: root,
                toolkitDirectory: join(directory, 'toolkit'),
                expectedToolkitIdentity: toolkitIdentity,
                request: {
                  command: 'prepare-relocation-activation',
                  candidateRepository: candidate.repository,
                  candidateSha: revision,
                  baseActivation: base.directory,
                  candidatePolicy: 'docs/wiki-policy/policy.json',
                  candidateLauncher: 'src/new/launcher.ts',
                  validatorEntry: 'src/new/cli.ts',
                  reviewRecord: review,
                  destination,
                  work,
                  resourceLane: 'lane.relocation-fixture',
                  cwdIdentity: 'cwd.relocation-fixture',
                  checkRuns: checks,
                },
              }),
            );
      const child = Bun.spawnSync(argv, {
        cwd: root,
        env: { PATH: '/usr/bin:/bin' },
        stdin: input,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120000,
      });
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stderr.length).toBe(0);
      const lines = child.stdout.toString().split('\n'),
        check = lines.find((line) => line.startsWith('self-check: ')),
        version = lines.find((line) => line.startsWith('version directory: '));
      if (check === undefined || version === undefined)
        throw new Error('real relocation completion facts absent');
      expect(JSON.parse(check.slice('self-check: '.length))).toMatchObject({
        schemaVersion: 1,
        mode: 'enforce',
        trustProvenance: 'ci-preselected',
        accepted: true,
        certified: true,
      });
      expect(
        verifyActivation(version.slice('version directory: '.length)).manifest.schemaVersion,
      ).toBe(4);
      expect(existsSync(join(work, 'puni-activation-' + revision.slice(0, 8) + '.tar'))).toBe(true);
    },
    180000,
  );
it('keeps an unmarked bundle in the source profile instead of implicitly authenticating its own file', async () => {
  const fixture = createFixture('observe'),
    entry = join(fixture.trustDirectory, 'unmarked-validator.mjs');
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, '../cli.ts')],
    target: 'bun',
    format: 'esm',
  });
  expect(built.success).toBe(true);
  expect(built.outputs.length).toBe(1);
  const artifact = built.outputs.at(0);
  if (artifact === undefined) throw new Error('unmarked source-profile bundle absent');
  writeFileSync(entry, new Uint8Array(await artifact.arrayBuffer()));
  bind(fixture, entry);
  const child = invoke(fixture, localArgs(fixture, false), entry);
  expect(child.exitCode).toBe(1);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.toString()).toContain('cli.ts');
  expect(child.stderr.toString()).toContain('ENOENT');
}, 30000);
