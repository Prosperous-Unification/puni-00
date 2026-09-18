import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { prepareDesiredRevision } from './deploy-repo';
import { kubectlEffects, publishRevision } from './execute';
import type { ReleaseRequest } from './release';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const child = Bun.spawnSync({ cmd: ['git', '-C', cwd, ...args], stdout: 'pipe', stderr: 'pipe' });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}

/** A bare "remote" with one commit on main and a clone of it, as the deploy runner holds. */
function deployRepository(): { root: string; remote: string; clone: string; initial: string } {
  const root = scratchSync('wbs-deploy-repo-');
  roots.push(root);
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const clone = join(root, 'clone');
  Bun.spawnSync({ cmd: ['git', 'init', '--quiet', '--bare', '-b', 'main', remote] });
  Bun.spawnSync({ cmd: ['git', 'init', '--quiet', '-b', 'main', seed] });
  writeFileSync(join(seed, 'README'), 'deploy\n');
  git(seed, 'add', 'README');
  git(seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'seed');
  git(seed, 'push', '--quiet', remote, 'main');
  Bun.spawnSync({ cmd: ['git', 'clone', '--quiet', remote, clone] });
  return { root, remote, clone, initial: git(remote, 'rev-parse', 'main') };
}

describe('prepareDesiredRevision', () => {
  it('commits the manifest on the branch head without pushing, deterministically', () => {
    const repo = deployRepository();
    const target = { path: repo.clone, remote: 'origin', branch: 'main' };
    const first = prepareDesiredRevision(
      target,
      'clusters/staging/wbs/release.yaml',
      'kind: X\n',
      'r1',
    );
    const second = prepareDesiredRevision(
      target,
      'clusters/staging/wbs/release.yaml',
      'kind: X\n',
      'r1',
    );
    expect(first.previousRevision).toBe(repo.initial);
    expect(git(repo.clone, 'rev-parse', 'refs/wbs/desired/r1')).toBe(first.desiredRevision);
    expect(second).toEqual(first);
    expect(git(repo.remote, 'rev-parse', 'main')).toBe(repo.initial);
    expect(
      git(repo.clone, 'show', `${first.desiredRevision}:clusters/staging/wbs/release.yaml`),
    ).toBe('kind: X');
  });
});

describe('publishRevision', () => {
  it('moves the branch from previous to desired, and is idempotent', async () => {
    const repo = deployRepository();
    const target = { path: repo.clone, remote: 'origin', branch: 'main' };
    const { previousRevision, desiredRevision } = prepareDesiredRevision(
      target,
      'a.yaml',
      'a\n',
      'r',
    );
    await publishRevision(target, desiredRevision, previousRevision);
    await publishRevision(target, desiredRevision, previousRevision);
    expect(git(repo.remote, 'rev-parse', 'main')).toBe(desiredRevision);
  });

  it('refuses to move a deploy branch someone else moved', async () => {
    const repo = deployRepository();
    const target = { path: repo.clone, remote: 'origin', branch: 'main' };
    const { previousRevision, desiredRevision } = prepareDesiredRevision(
      target,
      'a.yaml',
      'a\n',
      'r',
    );
    const other = prepareDesiredRevision(target, 'b.yaml', 'b\n', 'other');
    await publishRevision(target, other.desiredRevision, previousRevision);
    expect(
      await publishRevision(target, desiredRevision, previousRevision).then(
        () => 'published',
        (e: unknown) => String(e),
      ),
    ).toContain(`is at ${other.desiredRevision}, not the previous release ${previousRevision}`);
    expect(git(repo.remote, 'rev-parse', 'main')).toBe(other.desiredRevision);
  });
});

/**
 * kubectl stand-in for the Flux half of `reconcile-desired`: the WBS unit's suspend flag comes
 * from a file, and the GitRepository serves whatever the bare remote's main branch holds.
 */
function fluxKubectl(
  root: string,
  remote: string,
): { path: string; suspended: string; log: string } {
  const path = join(root, 'kubectl');
  const suspended = join(root, 'suspended');
  const log = join(root, 'calls.log');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> ${log}`,
      'case "$*" in',
      `  *"get kustomizations"*) cat ${suspended} ;;`,
      `  *"get gitrepositories"*) echo "main@sha1:$(git -C ${remote} rev-parse main)" ;;`,
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  writeFileSync(log, '');
  return { path, suspended, log };
}

function fluxRequest(previousRevision: string, desiredRevision: string): ReleaseRequest {
  const digest = `sha256:${'1'.repeat(64)}`;
  const identity = {
    sourceSha: 'a'.repeat(40),
    images: {
      backend: `r/b@${digest}`,
      gateway: `r/g@${digest}`,
      frontend: `r/f@${digest}`,
      mcp: `r/m@${digest}`,
    },
  };
  return {
    environment: 'staging',
    cluster: { context: 'staging', uid: 'u' },
    namespaces: { app: 'wbs', backend: 'wbs-solver' },
    release: identity,
    expectedCurrent: identity,
    admission: { package: 'p', activation: 'a' },
    flux: {
      namespace: 'flux-system',
      kustomization: 'wbs',
      gitRepository: 'wbs-deploy',
      previousRevision,
      desiredRevision,
    },
    recovers: null,
  };
}

describe('persist-release publishes the desired revision', () => {
  function effectsFor(repo: ReturnType<typeof deployRepository>, kubectl: string) {
    return kubectlEffects({
      kubectl,
      kubeconfig: null,
      context: 'staging',
      namespaces: { app: 'wbs', backend: 'wbs-solver' },
      stateDir: repo.root,
      overlay: repo.root,
      anonymousProjectsStatus: 401,
      rolloutTimeoutSeconds: 5,
      jobTimeoutSeconds: 5,
      drainTimeoutMs: 1000,
      leaseDurationSeconds: 20,
      deployRepository: { path: repo.clone, remote: 'origin', branch: 'main' },
      log: () => undefined,
    });
  }

  it('pushes only while the WBS unit is suspended, then waits for the source', async () => {
    const repo = deployRepository();
    const kubectl = fluxKubectl(repo.root, repo.remote);
    writeFileSync(kubectl.suspended, 'true');
    const target = { path: repo.clone, remote: 'origin', branch: 'main' };
    const revisions = prepareDesiredRevision(target, 'a.yaml', 'a\n', 'r');
    await effectsFor(repo, kubectl.path).publishDesired(
      fluxRequest(revisions.previousRevision, revisions.desiredRevision),
    );
    expect(git(repo.remote, 'rev-parse', 'main')).toBe(revisions.desiredRevision);
    expect(readFileSync(kubectl.log, 'utf8')).toContain('annotate --overwrite');
  });

  it('refuses to publish the desired revision while the WBS unit is not suspended', async () => {
    const repo = deployRepository();
    const kubectl = fluxKubectl(repo.root, repo.remote);
    writeFileSync(kubectl.suspended, 'false');
    const target = { path: repo.clone, remote: 'origin', branch: 'main' };
    const revisions = prepareDesiredRevision(target, 'a.yaml', 'a\n', 'r');
    const outcome = await effectsFor(repo, kubectl.path)
      .publishDesired(fluxRequest(revisions.previousRevision, revisions.desiredRevision))
      .then(
        () => 'published',
        (e: unknown) => String(e),
      );
    expect(outcome).toContain('is not suspended');
    expect(git(repo.remote, 'rev-parse', 'main')).toBe(repo.initial);
  });
});
