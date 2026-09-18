import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DeployRepository } from './execute';

const SHA = /^[0-9a-f]{40}$/;

/**
 * Fixed commit identity and dates: preparing the same manifest on the same parent yields the same
 * commit, so a rerun of `deploy:k3s` rebuilds the identical request its journal recorded.
 */
const COMMIT_ENV = {
  GIT_AUTHOR_NAME: 'puni-release',
  GIT_AUTHOR_EMAIL: 'release@puni.invalid',
  GIT_COMMITTER_NAME: 'puni-release',
  GIT_COMMITTER_EMAIL: 'release@puni.invalid',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
};

function git(
  repository: string,
  args: readonly string[],
  env: Record<string, string> = {},
  stdin: string | null = null,
): string {
  const child = Bun.spawnSync({
    cmd: ['git', '-C', repository, ...args],
    env: { ...process.env, ...env },
    stdin: stdin === null ? 'ignore' : new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  });
  if (child.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${child.stderr.toString().trim()}`);
  }
  return child.stdout.toString().trim();
}

export interface PreparedRevisions {
  /** The deploy branch head: the commit pinning the release the cluster runs now. */
  previousRevision: string;
  /** A local commit on top of it pinning the candidate; pushed only by `reconcile-desired`. */
  desiredRevision: string;
}

/**
 * Prepares, without pushing, the deploy-repository commit that pins a release: `manifestPath`
 * replaced by `manifest` on top of the fetched branch head. The commit exists only in the local
 * clone until the coordinator publishes it with the WBS Flux unit suspended.
 */
export function prepareDesiredRevision(
  repository: DeployRepository,
  manifestPath: string,
  manifest: string,
  releaseId: string,
): PreparedRevisions {
  git(repository.path, ['fetch', '--quiet', repository.remote, repository.branch]);
  const previousRevision = git(repository.path, ['rev-parse', 'FETCH_HEAD']);
  if (!SHA.test(previousRevision)) {
    throw new Error(`deploy branch head is not a commit: ${previousRevision}`);
  }
  const blob = git(repository.path, ['hash-object', '-w', '--stdin'], {}, manifest);
  const scratch = mkdtempSync(join(tmpdir(), 'wbs-deploy-index-'));
  try {
    const index = { GIT_INDEX_FILE: join(scratch, 'index') };
    git(repository.path, ['read-tree', previousRevision], index);
    git(
      repository.path,
      ['update-index', '--add', '--cacheinfo', `100644,${blob},${manifestPath}`],
      index,
    );
    const tree = git(repository.path, ['write-tree'], index);
    const desiredRevision = git(
      repository.path,
      ['commit-tree', tree, '-p', previousRevision, '-m', `wbs: release ${releaseId}`],
      COMMIT_ENV,
    );
    return { previousRevision, desiredRevision };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
