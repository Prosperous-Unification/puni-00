import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

import { hashBytes } from '../evidence/content-manifest';
import type { LintWrite } from '../lint-output';
import { prepareBunActivation, selectActivation } from '../policy/activation';

export function createLintFixture(
  validator: string | ((root: string) => string),
  snapshotter?: string | ((root: string) => string),
) {
  const root = mkdtempSync(join(tmpdir(), 'puni-run-lint-'));
  const candidate = join(root, 'candidate');
  const source = join(root, 'reviewed');
  const archive = join(root, 'archive');
  const scratch = join(root, 'scratch');
  for (const path of [candidate, source, archive, scratch]) mkdirSync(path);
  const init = Bun.spawnSync(['git', 'init', '-q', candidate], { stdout: 'pipe', stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error('fixture Git initialization failed');
  mkdirSync(join(archive, 'trusted-node-modules/typescript'), { recursive: true });
  writeFileSync(join(archive, 'trusted-node-modules/typescript/package.json'), '{}');
  const roleSources = {
    authority: join(source, 'authority.json'),
    ciBinding: join(source, 'ci-binding.json'),
    evidence: join(source, 'evidence.json'),
    launcher: join(source, 'launcher.mjs'),
    localBinding: join(source, 'local-binding.json'),
    mapping: join(source, 'mapping.json'),
    policy: join(source, 'policy.json'),
    reviewReceipt: join(source, 'review-receipt.json'),
    snapshotter: join(source, 'snapshotter.ts'),
    validator: join(source, 'validator.mjs'),
  };
  for (const path of Object.values(roleSources)) writeFileSync(path, '{}\n');
  writeFileSync(
    roleSources.launcher,
    'throw new Error("selected launcher must not be recursively executed");',
  );
  writeFileSync(
    roleSources.validator,
    typeof validator === 'function' ? validator(root) : validator,
  );
  writeFileSync(
    roleSources.snapshotter,
    typeof snapshotter === 'function'
      ? snapshotter(root)
      : (snapshotter ?? readFileSync(join(import.meta.dir, '../policy/snapshot-validator.ts'))),
  );
  const binding = JSON.stringify({
    policy: { path: 'policy.json', sha256: hashBytes(readFileSync(roleSources.policy)) },
    authority: {
      artifact: { path: 'authority.json', sha256: hashBytes(readFileSync(roleSources.authority)) },
    },
    validator: {
      artifacts: [
        { path: 'validator.mjs', sha256: hashBytes(readFileSync(roleSources.validator)) },
      ],
    },
  });
  writeFileSync(roleSources.ciBinding, binding);
  writeFileSync(roleSources.localBinding, binding);
  const prepared = prepareBunActivation({
    candidateRepository: candidate,
    destination: join(archive, 'v1'),
    roleSources,
    sourceRevision: 'a'.repeat(40),
    policyIdentity: hashBytes(readFileSync(roleSources.policy)),
    mappingIdentity: hashBytes(readFileSync(roleSources.mapping)),
    validatorIdentity: hashBytes(readFileSync(roleSources.validator)),
    reviewReceiptIdentity: hashBytes(readFileSync(roleSources.reviewReceipt)),
  });
  selectActivation(archive, prepared.directory, prepared.identity);
  const stdout: Uint8Array[] = [];
  const stderr: Uint8Array[] = [];
  const context = {
    runtimeDirectory: root,
    path: '/usr/bin:/bin',
    activationRoot: archive,
    trustedNodeModules: undefined,
    required: false,
    scratchDirectory: scratch,
    launch: (entrypoint: string) => createLaunch(process.execPath, entrypoint),
    stdout: (bytes: Uint8Array): LintWrite => {
      stdout.push(bytes.slice());
      return { kind: 'written' };
    },
    stderr: (bytes: Uint8Array): LintWrite => {
      stderr.push(bytes.slice());
      return { kind: 'written' };
    },
    subscribeInterrupts: () => () => undefined,
  };
  const invocation = {
    version: 1 as const,
    callerDirectory: root,
    request: {
      command: 'lint' as const,
      kind: 'working' as const,
      repository: candidate,
      revision: 'opaque revision',
    },
  };
  return { root, candidate, archive, scratch, prepared, stdout, stderr, context, invocation };
}
