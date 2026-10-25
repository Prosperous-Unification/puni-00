/** A first-parent merge into the default branch that names a pull request (design A1). */
export interface AcceptedOutcome {
  readonly pullRequest: number | null;
  readonly headBranch: string | null;
  /** Head branches of merges nested inside this one, for pull requests merged into a plan branch. */
  readonly memberBranches: readonly string[];
  readonly nestedPullRequests: readonly number[];
  readonly mergedAt: string;
  readonly mergeSha: string;
  readonly subject: string;
}

const MERGE_SUBJECT = /^Merge pull request #(\d+) from ([^/\s]+)\/(\S+)/;

export type GitRunner = (repository: string, argv: readonly string[]) => string;

/** Runs git in `repository` and returns stdout; a non-zero exit refuses with git's stderr. */
export function runGit(repository: string, argv: readonly string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    throw new Error(
      `git ${argv[0] ?? ''} failed in ${JSON.stringify(repository)}: ${invocation.stderr.toString('utf8').trim()}`,
    );
  }
  return invocation.stdout.toString('utf8');
}

/** `owner/name` from the `origin` remote, for recognizing pull request links in logs. */
export function readRepositorySlug(repository: string, git: GitRunner = runGit): string {
  const url = git(repository, ['remote', 'get-url', 'origin']).trim();
  const match = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(url);
  if (match === null) {
    throw new Error(`origin is not a GitHub repository URL: ${JSON.stringify(url)}`);
  }
  return match[1];
}

function toInstant(epochSeconds: string): string {
  const seconds = Number(epochSeconds);
  if (!Number.isSafeInteger(seconds)) {
    throw new Error(`git printed a non-integer time: ${epochSeconds}`);
  }
  return new Date(seconds * 1000).toISOString();
}

/**
 * Lists accepted outcomes merged into `main` within `[since, until)`, oldest first, with the
 * head branches of merges nested inside each one. A merge whose subject names no pull request
 * is kept with no branches, so the count of outcomes is still the count of merges.
 *
 * @throws when `repository` is not a git repository, has no `main`, or git prints an unexpected
 * line.
 */
export function listAcceptedOutcomes(
  repository: string,
  period: { readonly since: string; readonly until: string },
  git: GitRunner = runGit,
): AcceptedOutcome[] {
  const output = git(repository, [
    'log',
    'main',
    '--first-parent',
    '--merges',
    '--format=%H%x1f%ct%x1f%s',
  ]);
  const outcomes: AcceptedOutcome[] = [];
  for (const record of output.split('\n')) {
    if (record.length === 0) continue;
    const fields = record.split('\x1f');
    const sha = fields.at(0);
    const time = fields.at(1);
    const subject = fields.at(2);
    if (sha === undefined || time === undefined || subject === undefined) {
      throw new Error(`git printed an unexpected log line: ${JSON.stringify(record)}`);
    }
    const mergedAt = toInstant(time);
    if (mergedAt < period.since || mergedAt >= period.until) continue;
    const match = MERGE_SUBJECT.exec(subject);
    const nestedBranches: string[] = [];
    const nestedPullRequests: number[] = [];
    // Proof: dropping this nested walk left `a plan branch carries nested pull requests` without
    // its member branches (2026-10-22).
    const nested = git(repository, ['log', `${sha}^1..${sha}`, '--merges', '--format=%H%x1f%s']);
    for (const line of nested.split('\n')) {
      const nestedFields = line.split('\x1f');
      const nestedSha = nestedFields.at(0);
      const nestedSubject = nestedFields.at(1);
      if (nestedSha === undefined || nestedSha === sha || nestedSubject === undefined) continue;
      const inner = MERGE_SUBJECT.exec(nestedSubject);
      if (inner === null) continue;
      nestedPullRequests.push(Number(inner[1]));
      nestedBranches.push(inner[3]);
    }
    outcomes.push({
      pullRequest: match === null ? null : Number(match[1]),
      headBranch: match === null ? null : match[3],
      memberBranches: [...new Set(nestedBranches)],
      nestedPullRequests: [...new Set(nestedPullRequests)].sort((left, right) => left - right),
      mergedAt,
      mergeSha: sha,
      subject,
    });
  }
  return outcomes.sort((left, right) => (left.mergedAt < right.mergedAt ? -1 : 1));
}
