import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { main } from './deploy-k3s';
import { descriptorSha256, renderDescriptor, sealDescriptor } from './descriptor';
import { fileJournal } from './journal';
import { checkDescriptor, readDeliveryTarget, requestFor } from './promotion';
import { initialState } from './release';

const ROOT = resolve(import.meta.dir, '../../../..');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const sourceSha = 'a'.repeat(40);
const image = (name: string, hex: string): string =>
  `registry.example/${name}@sha256:${hex.repeat(64)}`;
function admission() {
  const activation = 'e'.repeat(40);
  return {
    schemaVersion: 1,
    sourceSha,
    package: {
      name: 'twilight-bureaucrat',
      version: '0.1.0',
      integrity: `sha512-${'c'.repeat(86)}==`,
      toolkitIdentity: 'd'.repeat(64),
    },
    activation: { version: activation, manifestIdentity: 'f'.repeat(64) },
  };
}
const descriptor = sealDescriptor(
  {
    schemaVersion: 1,
    sourceSha,
    images: {
      backend: image('wbs-be-01', '1'),
      gateway: image('wbs-gw-01', '2'),
      frontend: image('wbs-fe-01', '3'),
      mcp: image('wbs-mcp-01', '4'),
    },
    gateRunId: 7,
  },
  admission(),
  {
    id: 7,
    head_sha: sourceSha,
    path: '.github/workflows/ci.yml',
    event: 'push',
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
});
