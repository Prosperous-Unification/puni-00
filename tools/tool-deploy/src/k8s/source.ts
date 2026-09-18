function isAncestor(repository: string, ancestor: string, descendant: string): boolean {
  const child = Bun.spawnSync({
    cmd: ['git', '-C', repository, 'merge-base', '--is-ancestor', ancestor, descendant],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000,
  });
  if (child.exitCode === 0) return true;
  if (child.exitCode === 1) return false;
  throw new Error(
    `git merge-base --is-ancestor ${ancestor} ${descendant} in ${repository} failed: ` +
      child.stderr.toString().trim(),
  );
}

/**
 * The descriptor's source must be on main's history (`mainRef`, e.g. `origin/main` in a
 * full-depth checkout): a green run on a commit that main never took proves nothing about main.
 * @throws when it is not, or when git cannot answer (an unknown commit is not "not an ancestor").
 */
export function assertOnMainline(repository: string, sourceSha: string, mainRef: string): void {
  // Proof: source.test.ts `refuses a commit main never took`; with this check removed a side
  // branch's commit passed as releasable.
  if (!isAncestor(repository, sourceSha, mainRef)) {
    throw new Error(`${sourceSha} is not on ${mainRef}'s history`);
  }
}

/**
 * A promotion must not move the environment back to an older commit of main unless the operator
 * asked for exactly that (`--allow-downgrade`).
 */
export function assertNotDowngrade(
  repository: string,
  candidate: string,
  current: string,
  allowDowngrade: boolean,
): void {
  if (candidate === current || allowDowngrade) return;
  // Proof: source.test.ts `refuses to promote an ancestor of the running release`; with this
  // check removed the older commit planned a release.
  if (isAncestor(repository, candidate, current)) {
    throw new Error(
      `${candidate} is an ancestor of the running ${current}; pass --allow-downgrade to go back`,
    );
  }
}
