import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';

import { main } from './deploy-k3s';
import { descriptorSha256, renderDescriptor, sealDescriptor } from './descriptor';
import { fakeRegistry } from './fake-registry';
import { fileJournal } from './journal';
import { checkDescriptor, readDeliveryTarget, requestFor } from './promotion';
import { initialState } from './release';

const ROOT = resolve(import.meta.dir, '../../../..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const sourceSha = 'a'.repeat(40);
const registry = fakeRegistry({
  'wbs-be-01': 'a'.repeat(40),
  'wbs-gw-01': 'a'.repeat(40),
  'wbs-fe-01': 'a'.repeat(40),
  'wbs-mcp-01': 'a'.repeat(40),
  'wbs-gw-01-other-commit': '9'.repeat(40),
});
afterAll(async () => {
  await registry.stop();
});
const image = (name: string): string => registry.ref(name);
function admission() {
  const activation = 'e'.repeat(40);
  return {
    schemaVersion: 1,
    sourceSha,
    package: {
      name: 'twilight-burokrat',
      version: '0.1.0',
      integrity: `sha512-${'c'.repeat(86)}==`,
      toolkitIdentity: 'd'.repeat(64),
    },
    activation: { version: activation, manifestIdentity: 'f'.repeat(64) },
  };
}
function candidateOf(sealed: { images: ReleaseIdentityImages }) {
  return { schemaVersion: 1 as const, sourceSha, images: sealed.images, gateRunId: 7 };
}
function gateRunOf() {
  return {
    id: 7,
    head_sha: sourceSha,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    jobs: [
      { name: 'gate', conclusion: 'success' },
      { name: 'pixels', conclusion: 'success' },
    ],
  };
}
type ReleaseIdentityImages = ReturnType<typeof sealDescriptor>['images'];
const descriptor = sealDescriptor(
  {
    schemaVersion: 1,
    sourceSha,
    images: {
      backend: image('wbs-be-01'),
      gateway: image('wbs-gw-01'),
      frontend: image('wbs-fe-01'),
      mcp: image('wbs-mcp-01'),
    },
    gateRunId: 7,
  },
  admission(),
  {
    id: 7,
    head_sha: sourceSha,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    jobs: [
      { name: 'gate', conclusion: 'success' },
      { name: 'pixels', conclusion: 'success' },
    ],
  },
);

/** A state directory holding a journal started against `recordedContext`, and a fake kubectl. */
function resumable(recordedContext: string) {
  const state = scratchSync('wbs-deploy-k3s-');
  roots.push(state);
  chmodSync(state, 0o700);
  const descriptorPath = join(state, 'descriptor.json');
  const admissionPath = join(state, 'admission.json');
  writeFileSync(descriptorPath, renderDescriptor(descriptor));
  writeFileSync(admissionPath, JSON.stringify(admission()));
  const recorded = requestFor(
    checkDescriptor({
      descriptorPath,
      expectedSha256: descriptorSha256(descriptor),
      admissionPath,
      environment: 'staging',
      stateDirectory: state,
      maxProofAgeDays: 14,
      now: new Date(),
    }),
    readDeliveryTarget(join(ROOT, 'deploy/k8s/wbs/overlays'), 'staging'),
    { context: recordedContext, uid: 'uid-staging' },
    { sourceSha: 'b'.repeat(40), images: descriptor.images },
    { previousRevision: '1'.repeat(40), desiredRevision: '2'.repeat(40) },
  );
  const journalPath = join(state, 'staging', 'journal', 'release.json');
  mkdirSync(join(state, 'staging', 'journal'), { recursive: true, mode: 0o700 });
  fileJournal(journalPath).write({
    schemaVersion: 1,
    request: recorded,
    state: { ...initialState(recorded), phase: 'writes-reopened', writesReopened: true },
    history: [{ phase: 'writes-reopened', at: '2026-09-18T00:00:00.000Z' }],
  });
  const kubectl = join(state, 'kubectl');
  writeFileSync(
    kubectl,
    [
      '#!/usr/bin/env bash',
      'case "$*" in',
      `  *"version --client -o json"*) echo '{"clientVersion":{"gitVersion":"v1.36.4"}}' ;;`,
      '  *"get namespace kube-system"*) printf uid-staging ;;',
      '  *) echo "unexpected kubectl $*" >&2; exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(kubectl, 0o755);
  return {
    args: [
      '--descriptor',
      descriptorPath,
      '--descriptor-sha256',
      descriptorSha256(descriptor),
      '--admission',
      admissionPath,
      '--environment',
      'staging',
      '--context',
      'staging',
      '--cluster-uid',
      'uid-staging',
      '--state',
      state,
      '--deploy-repo',
      state,
      '--kubectl',
      kubectl,
    ],
  };
}

describe('deploy-k3s descriptor mode', () => {
  it('resumes the request its journal recorded without re-reading the cluster', async () => {
    const { args } = resumable('staging');
    const logs: string[] = [];
    const spy = spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line);
    });
    try {
      await main(args, ROOT);
    } finally {
      spy.mockRestore();
    }
    expect(logs.join('\n')).toContain('resuming the request recorded in');
    expect(logs.join('\n')).toContain('reconcile-desired -> desired-reconciled');
  });

  it('refuses to resume a journal recorded against another cluster context', async () => {
    const { args } = resumable('staging-old');
    const spy = spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(
        await main(args, ROOT).then(
          () => 'resumed',
          (e: unknown) => String(e),
        ),
      ).toContain('cannot resume');
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses a descriptor whose image the registry labels with another commit', async () => {
    const { args } = resumable('staging');
    const relabelled = sealDescriptor(
      {
        ...candidateOf(descriptor),
        images: { ...descriptor.images, gateway: image('wbs-gw-01-other-commit') },
      },
      admission(),
      gateRunOf(),
    );
    const at = args.indexOf('--descriptor') + 1;
    writeFileSync(args[at], renderDescriptor(relabelled));
    args[args.indexOf('--descriptor-sha256') + 1] = descriptorSha256(relabelled);
    const spy = spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(
        await main(args, ROOT).then(
          () => 'deployed',
          (e: unknown) => String(e),
        ),
      ).toContain(`images are not built from ${sourceSha}: gateway`);
    } finally {
      spy.mockRestore();
    }
  });
});
