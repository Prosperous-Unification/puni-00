import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

import type { InstalledRequest } from '../cli-parser';
import { hashBytes } from '../evidence/content-manifest';
import { readLintRuntime } from '../lint-runtime';
import { prepareBunActivation, verifyActivation } from '../policy/activation';
import { buildLintLauncher } from '../policy/build-lint-launcher';
import { planBunToolkit } from '../policy/bun-release';
import { writeCandidateCheckRuns } from '../policy/check-run-fixtures';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  prepareBaseActivation,
} from '../policy/relocation-fixtures';
import { hashTrustedModules } from '../policy/trusted-modules';

function commitCandidate(repository: string): string {
  for (const args of [
    ['add', '--all'],
    ['commit', '-m', 'current Bun relocation roles'],
    ['rev-parse', 'HEAD'],
  ]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    if (args[0] === 'rev-parse') return child.stdout.toString().trim();
  }
  throw new Error('candidate revision was not read');
}
export async function createRelocationFixture(
  roots: string[],
  options: {
    readonly compiler?: boolean;
    readonly baseVersion?: 3 | 4;
    readonly certified?: boolean;
  } = {},
) {
  const fixture = createRelocationCandidate({ reproducible: true });
  const root = mkdtempSync(join(tmpdir(), 'puni Bun relocation '));
  roots.push(root);
  const historicalSentinel = join(root, 'historical.executed');
  writeFileSync(
    join(fixture.repository, 'bin/tool-wiki-lint.sh'),
    '#!/usr/bin/env bash\nprintf executed > ' + JSON.stringify(historicalSentinel) + '\nexit 79\n',
  );
  let base = prepareBaseActivation(fixture);
  if (options.baseVersion === 4) {
    const previous = verifyActivation(base.directory);
    const launcher = join(root, 'historical.mjs');
    writeFileSync(launcher, 'throw new Error("historical Bun launcher must not run");');
    const roleSources = {
      ...Object.fromEntries(
        Object.entries(previous.manifest.roles).map(([role, path]) => [
          role,
          join(base.directory, path),
        ]),
      ),
      launcher,
    };
    // Object.fromEntries loses the fixed manifest keys at this test fixture boundary.
    const prepared = prepareBunActivation({
      candidateRepository: fixture.repository,
      destination: join(root, 'base4'),
      sourceRevision: previous.manifest.sourceRevision,
      policyIdentity: previous.manifest.policyIdentity,
      mappingIdentity: previous.manifest.mappingIdentity,
      validatorIdentity: previous.manifest.validatorIdentity,
      reviewReceiptIdentity: previous.manifest.reviewReceiptIdentity,
      roleSources: roleSources as Record<keyof typeof previous.manifest.roles, string>,
    });
    base = { root, directory: prepared.directory };
  }
  // The actual current launcher and snapshotter execute a controlled certificate peer. This
  // checks relocation orchestration and lineage isolation, not semantic validator coverage.
  writeFileSync(join(fixture.repository, 'src/new/launcher.ts'), await buildLintLauncher());
  writeFileSync(
    join(fixture.repository, 'src/new/policy/snapshot-validator.ts'),
    readFileSync(join(import.meta.dir, '../policy/snapshot-validator.ts')),
  );
  writeFileSync(
    join(fixture.repository, 'src/new/cli.ts'),
    (options.compiler === true ? 'import ts from "typescript";' : '') +
      'process.stdout.write(JSON.stringify({schemaVersion:1,mode:"enforce",trustProvenance:"ci-preselected",accepted:true,certified:' +
      JSON.stringify(options.certified !== false) +
      ',source:"current-candidate"' +
      (options.compiler === true ? ',compiler:ts.version' : '') +
      '}));',
  );
  const revision = commitCandidate(fixture.repository);
  const toolkit = join(root, 'toolkit'),
    closure = join(toolkit, 'trusted-node-modules'),
    runtime = join(root, 'runtime');
  mkdirSync(closure, { recursive: true });
  mkdirSync(runtime);
  const workspace = resolve(import.meta.dir, '../../../../../..');
  cpSync(join(workspace, 'node_modules/typescript'), join(closure, 'typescript'), {
    recursive: true,
  });
  mkdirSync(join(closure, '@typescript'));
  cpSync(join(workspace, 'node_modules/@typescript/old'), join(closure, '@typescript/old'), {
    recursive: true,
  });
  for (const name of ['source-map-support', 'source-map', 'buffer-from'])
    cpSync(join(workspace, 'node_modules', name), join(closure, name), { recursive: true });
  const roleBytes = {
    'launcher.mjs': Buffer.from('throw new Error("toolkit launcher must not run");'),
    'snapshotter.ts': Buffer.from('throw new Error("toolkit snapshotter must not run");'),
    'validator.mjs': Buffer.from('throw new Error("toolkit validator must not run");'),
    'prepare-activation.mjs': Buffer.from('export{};'),
    'prepare-relocation-activation.mjs': Buffer.from('export{};'),
  };
  for (const [name, bytes] of Object.entries(roleBytes)) writeFileSync(join(toolkit, name), bytes);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: [
      'typescript',
      '@typescript/old',
      'source-map-support',
      'source-map',
      'buffer-from',
    ],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const review = join(root, 'review.json'),
    checkRuns = join(root, 'check-runs');
  writeFileSync(
    review,
    JSON.stringify(
      auditReview(
        'review.fixture.module',
        revision,
        candidateIdentityAt(fixture.repository, revision),
      ),
    ),
  );
  writeCandidateCheckRuns(checkRuns, {
    repository: fixture.repository,
    revision,
    policyPath: 'docs/wiki-policy/policy.json',
  });
  const request: InstalledRequest<'prepare-relocation-activation'> = {
    command: 'prepare-relocation-activation',
    candidateRepository: fixture.repository,
    candidateSha: revision,
    baseActivation: base.directory,
    reviewRecord: review,
    candidatePolicy: 'docs/wiki-policy/policy.json',
    candidateLauncher: 'src/new/launcher.ts',
    validatorEntry: 'src/new/cli.ts',
    checkRuns,
    destination: join(root, 'activation'),
    work: join(root, 'work'),
    resourceLane: 'lane.relocation-fixture',
    cwdIdentity: 'cwd.relocation-fixture',
  };
  const listeners = new Set<(signal: 'SIGINT' | 'SIGTERM') => void>();
  let first: 'SIGINT' | 'SIGTERM' | undefined;
  const interrupt = (signal: 'SIGINT' | 'SIGTERM') => {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  };
  const context = {
    callerDirectory: root,
    toolkitDirectory: toolkit,
    expectedToolkitIdentity: hashBytes(plan.descriptor),
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    launch: (entry: string) => createLaunch(process.execPath, entry),
    subscribeInterrupts: (listener: (signal: 'SIGINT' | 'SIGTERM') => void) => {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    root,
    fixture,
    base,
    request,
    context,
    historicalSentinel,
    revision,
    interrupt,
    listeners,
  };
}

/** Actual launcher/snapshotter with a controlled certificate peer for normal preparation. */
export async function createToolkitFixture(roots: string[]) {
  const fixture = await createRelocationFixture(roots);
  const toolkit = fixture.context.toolkitDirectory;
  const roleBytes = {
    'launcher.mjs': await buildLintLauncher(),
    'snapshotter.ts': readFileSync(join(import.meta.dir, '../policy/snapshot-validator.ts')),
    'validator.mjs': Buffer.from(
      'process.stdout.write(JSON.stringify({schemaVersion:1,mode:"enforce",trustProvenance:"ci-preselected",accepted:true,certified:true,source:"current-toolkit"}));',
    ),
    'prepare-activation.mjs': Buffer.from('export{};'),
    'prepare-relocation-activation.mjs': Buffer.from('export{};'),
  };
  for (const [name, bytes] of Object.entries(roleBytes)) writeFileSync(join(toolkit, name), bytes);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: [
      'typescript',
      '@typescript/old',
      'source-map-support',
      'source-map',
      'buffer-from',
    ],
    trustedNodeModulesIdentity: hashTrustedModules(join(toolkit, 'trusted-node-modules')),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const auditStrata = join(fixture.root, 'audit-strata.json');
  writeFileSync(
    auditStrata,
    JSON.stringify({
      strata: [
        { stratumId: 'risk.public-admission', sampleRateBps: 10000, disagreementTriggerBps: 10000 },
      ],
      obligations: { 'review.fixture.module': 'risk.public-admission' },
    }),
  );
  const request: InstalledRequest<'prepare-activation'> = {
    command: 'prepare-activation',
    candidateRepository: fixture.request.candidateRepository,
    candidateSha: fixture.request.candidateSha,
    toolkit: undefined,
    candidatePolicy: 'docs/wiki-policy/policy.json',
    candidateMapping: 'docs/wiki-policy/modules.json',
    auditStrata,
    reviewRecord: fixture.request.reviewRecord,
    destination: fixture.request.destination,
    work: fixture.request.work,
    resourceLane: fixture.request.resourceLane,
    cwdIdentity: fixture.request.cwdIdentity,
    checkRuns: fixture.request.checkRuns,
  };
  return {
    ...fixture,
    request,
    context: { ...fixture.context, expectedToolkitIdentity: hashBytes(plan.descriptor) },
  };
}
