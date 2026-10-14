import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { fixtureFirstStartRequest } from './first-start.fixture';
import {
  admitFirstStartSource,
  readFirstStartTree,
  resumeFirstStartSource,
  type SourcePort,
} from './first-start-source';

function fixture() {
  const request = fixtureFirstStartRequest();
  const calls: string[] = [];
  const spec = {
    interval: '10s',
    path: './clusters/local/wbs',
    prune: false,
    suspend: true,
    sourceRef: { kind: 'GitRepository', name: request.flux.gitRepository },
  };
  const ks = {
    metadata: { uid: 'ks', resourceVersion: '1', generation: 1 },
    spec,
    status: {
      observedGeneration: 1,
      lastAppliedRevision: `main@sha1:${request.flux.desiredRevision}`,
      conditions: [{ type: 'Ready', status: 'True', observedGeneration: 1 }],
    },
  };
  const git = {
    metadata: { uid: 'git', resourceVersion: '1', generation: 1 },
    spec: { url: 'http://fixture.invalid/repo', interval: '10s', ref: { branch: 'main' } },
    status: {
      observedGeneration: 1,
      artifact: {
        revision: `main@sha1:${request.flux.desiredRevision}`,
        digest: 'sha256:' + 'd'.repeat(64),
        url: 'http://source/artifact',
        path: 'artifact.tar.gz',
      },
      conditions: [{ type: 'Ready', status: 'True', observedGeneration: 1 }],
    },
  };
  const bytes =
    'kind: ConfigMap\napiVersion: v1\nmetadata:\n  name: accepted\n  namespace: wbs\ndata:\n  release: pinned\n';
  const port: SourcePort = {
    assertMutationAllowed: () => undefined,
    readKustomization: () => Promise.resolve(structuredClone(ks)),
    readGitRepository: () => Promise.resolve(structuredClone(git)),
    patchGitRepository: (patch) => {
      calls.push('pin');
      const replace = patch.find((p) => p.op === 'replace');
      Object.assign(git.spec, { ref: replace?.value });
      return Promise.resolve();
    },
    patchKustomization: () => {
      calls.push('resume');
      ks.spec.suspend = false;
      return Promise.resolve();
    },
    readTree: () => Promise.resolve({ bytes, tree: 'c'.repeat(40) }),
    trustedManifest: () => Promise.resolve(bytes),
    sleep: () => Promise.resolve(),
    timeoutMs: 5,
  };
  return { request, ks, git, bytes, port, calls };
}

for (const fault of [
  'none',
  'public-open',
  'writer-open',
  'extra-resource',
  'symlink',
  'extra-build',
  'nested-tree',
] as const) {
  it(`actual observed Git URL and commit subtree ${fault === 'none' ? 'admits' : 'refuses'} ${fault}`, async () => {
    const root = scratchSync('first-start-source-git-');
    try {
      function git(args: string[]): string {
        const child = Bun.spawnSync({
          cmd: ['git', '-C', root, ...args],
          stdout: 'pipe',
          stderr: 'pipe',
        });
        if (child.exitCode !== 0) throw new Error(child.stderr.toString());
        return child.stdout.toString().trim();
      }
      git(['init', '--quiet']);
      git(['config', 'user.name', 'source-fixture']);
      git(['config', 'user.email', 'source@fixture.invalid']);
      const path = 'clusters/local/wbs';
      mkdirSync(join(root, path), { recursive: true });
      const resource = (name: string, namespace: string) => ({
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: { name, namespace },
        spec: {
          podSelector: { matchLabels: { 'puni.dev/writes': 'fenced' } },
          policyTypes: ['Ingress'],
          ingress: [{ from: [{}] }],
        },
      });
      const resources = [
        resource('wbs-backend-writers', 'wbs-solver'),
        resource('wbs-public-ingress', 'wbs'),
      ];
      const trusted = JSON.stringify({ apiVersion: 'v1', kind: 'List', items: resources });
      if (fault === 'public-open')
        resources[1].spec.podSelector.matchLabels['puni.dev/writes'] = 'open';
      if (fault === 'writer-open')
        resources[0].spec.podSelector.matchLabels['puni.dev/writes'] = 'open';
      if (fault === 'extra-resource') resources.push(resource('extra-allow', 'wbs'));
      if (fault === 'symlink') symlinkSync(trusted, join(root, path, 'release.yaml'));
      else
        writeFileSync(
          join(root, path, 'release.yaml'),
          JSON.stringify({ apiVersion: 'v1', kind: 'List', items: resources }),
        );
      if (fault === 'extra-build')
        writeFileSync(join(root, path, 'kustomization.yaml'), 'resources: [release.yaml]');
      if (fault === 'nested-tree') {
        mkdirSync(join(root, path, 'nested'));
        writeFileSync(join(root, path, 'nested', 'release.yaml'), trusted);
      }
      git(['add', '.']);
      git(['commit', '--quiet', '-m', 'source']);
      const revision = git(['rev-parse', 'HEAD']);
      const f = fixture();
      f.request.flux.desiredRevision = revision;
      f.git.spec.url = 'http://fixture.invalid/repo';
      f.git.status.artifact.revision = `main@sha1:${revision}`;
      f.port.readTree = (url, revision, path) => {
        expect(url).toBe(f.git.spec.url);
        return readFirstStartTree(root, `file://${root}`, revision, path);
      };
      f.port.trustedManifest = () => Promise.resolve(trusted);
      const admission = await admitFirstStartSource(f.request, f.port, null).then(
        (receipt) => receipt,
        (cause: unknown) => cause,
      );
      if (fault === 'none') expect(admission).toHaveProperty('sha256');
      else expect(admission).toBeInstanceOf(Error);
      expect(f.calls).not.toContain('resume');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
it('pins actual Git source, admits complete exact bytes and conditionally resumes its bound Kustomization', async () => {
  const f = fixture();
  const receipt = await admitFirstStartSource(f.request, f.port, null);
  expect(f.calls).toEqual(['pin']);
  await resumeFirstStartSource(f.request, f.port, receipt);
  expect(f.calls).toEqual(['pin', 'resume']);
});
for (const fault of [
  'postBuild',
  'path',
  'sourceRef',
  'source-url',
  'artifact',
  'manifest',
  'symlink',
  'kustomization-uid',
  'source-uid',
  'source-ref',
  'decryption',
  'images',
  'include',
  'force',
  'provider',
] as const) {
  it(`source admission refuses ${fault} before resume`, async () => {
    const f = fixture();
    const receipt = await admitFirstStartSource(f.request, f.port, null);
    f.calls.length = 0;
    if (fault === 'postBuild')
      Object.assign(f.ks.spec, { postBuild: { substitute: { IMAGE: 'foreign' } } });
    if (fault === 'path') f.ks.spec.path = './foreign';
    if (fault === 'sourceRef') f.ks.spec.sourceRef.name = 'foreign';
    if (fault === 'source-url') f.git.spec.url = 'http://foreign.invalid/repo';
    if (fault === 'artifact') f.git.status.artifact.digest = 'sha256:' + 'e'.repeat(64);
    if (fault === 'manifest')
      f.port.readTree = () =>
        Promise.resolve({ bytes: f.bytes.replace('pinned', 'open'), tree: 'c'.repeat(40) });
    if (fault === 'symlink')
      f.port.readTree = () => Promise.reject(new Error('nonregular release.yaml'));
    if (fault === 'kustomization-uid') f.ks.metadata.uid = 'other';
    if (fault === 'source-uid') f.git.metadata.uid = 'other';
    if (fault === 'source-ref') Object.assign(f.git.spec, { ref: { branch: 'mutable' } });
    if (fault === 'decryption') Object.assign(f.ks.spec, { decryption: { provider: 'sops' } });
    if (fault === 'images')
      Object.assign(f.ks.spec, { images: [{ name: 'backend', newTag: 'foreign' }] });
    if (fault === 'include')
      Object.assign(f.git.spec, { include: [{ repository: { name: 'foreign' } }] });
    if (fault === 'force') Object.assign(f.ks.spec, { force: true });
    if (fault === 'provider') Object.assign(f.git.spec, { provider: 'aws' });
    const refusal = await resumeFirstStartSource(f.request, f.port, receipt).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(refusal).toBeInstanceOf(Error);
    expect(f.calls).not.toContain('resume');
  });
}

it('requires current-generation artifact readiness before source admission', async () => {
  const f = fixture();
  f.git.metadata.generation = 2;
  const refusal = await admitFirstStartSource(f.request, { ...f.port, timeoutMs: 2 }, null).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain('did not converge');
});

it('conditionally pins and resumes by UID, resourceVersion and exact spec', async () => {
  const f = fixture();
  const pin = f.port.patchGitRepository.bind(f.port);
  const resume = f.port.patchKustomization.bind(f.port);
  f.port.patchGitRepository = (patch) => {
    expect(patch.slice(0, 3).map((test) => test.path)).toEqual([
      '/metadata/uid',
      '/metadata/resourceVersion',
      '/spec',
    ]);
    return pin(patch);
  };
  f.port.patchKustomization = (patch) => {
    expect(patch.slice(0, 3).map((test) => test.path)).toEqual([
      '/metadata/uid',
      '/metadata/resourceVersion',
      '/spec',
    ]);
    return resume(patch);
  };
  const receipt = await admitFirstStartSource(f.request, f.port, null);
  await resumeFirstStartSource(f.request, f.port, receipt);
});

for (const fault of [
  'postBuild',
  'decryption',
  'images',
  'include',
  'force',
  'provider',
] as const) {
  it(`initial source admission refuses unsupported ${fault}`, async () => {
    const f = fixture();
    if (fault === 'postBuild')
      Object.assign(f.ks.spec, { postBuild: { substitute: { IMAGE: 'foreign' } } });
    if (fault === 'decryption') Object.assign(f.ks.spec, { decryption: { provider: 'sops' } });
    if (fault === 'images')
      Object.assign(f.ks.spec, { images: [{ name: 'backend', newTag: 'foreign' }] });
    if (fault === 'include')
      Object.assign(f.git.spec, { include: [{ repository: { name: 'foreign' } }] });
    if (fault === 'force') Object.assign(f.ks.spec, { force: true });
    if (fault === 'provider') Object.assign(f.git.spec, { provider: 'aws' });
    const refusal = await admitFirstStartSource(f.request, f.port, null).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(refusal).toBeInstanceOf(Error);
    expect(f.calls).toEqual([]);
  });
}

it('refuses source pin when Lease is lost during awaited source observation', async () => {
  const f = fixture();
  let lost = false;
  const read = f.port.readGitRepository.bind(f.port);
  f.port.readGitRepository = async () => {
    const source = await read();
    lost = true;
    return source;
  };
  f.port.assertMutationAllowed = () => {
    if (lost) throw new Error('Lease lost');
  };
  const refusal = await admitFirstStartSource(f.request, f.port, null).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain('Lease lost');
  expect(f.calls).not.toContain('pin');
});
it('refuses Flux resume when Lease is lost during awaited final source observation', async () => {
  const f = fixture();
  const receipt = await admitFirstStartSource(f.request, f.port, null);
  let reads = 0;
  let lost = false;
  const read = f.port.readGitRepository.bind(f.port);
  f.port.readGitRepository = async () => {
    const source = await read();
    if (++reads === 3) lost = true;
    return source;
  };
  f.port.assertMutationAllowed = () => {
    if (lost) throw new Error('Lease lost');
  };
  const refusal = await resumeFirstStartSource(f.request, f.port, receipt).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain('Lease lost');
  expect(f.calls).not.toContain('resume');
});
