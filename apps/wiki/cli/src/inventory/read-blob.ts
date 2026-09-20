/**
 * Reads one selected blob by its object identity, never from the working tree.
 * @throws Error naming the blob and the path Git could not read.
 */
export function readCandidateBlob(repository: string, blob: string, path: string): Uint8Array {
  const invocation = Bun.spawnSync(['git', '-C', repository, 'cat-file', 'blob', blob], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    // Proof: an injected exit 23 made artifact validation refuse
    // `docs/review-evidence/second.v1.json: injected unreadable artifact` at this boundary.
    const detail = invocation.stderr.toString('utf8').trim();
    throw new Error(
      `cannot read selected blob ${blob} for ${path}: ${detail.length === 0 ? `git exited ${String(invocation.exitCode)}` : detail}`,
    );
  }
  return invocation.stdout;
}
