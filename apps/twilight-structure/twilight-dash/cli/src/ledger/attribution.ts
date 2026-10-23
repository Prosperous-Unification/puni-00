import type { AcceptedOutcome } from './accepted-outcomes';
import type { HarnessUsageRow, SessionFacts } from './harness-usage';

export type UnattributedReason =
  'on-default-branch' | 'no-branch' | 'branch-not-accepted' | 'ambiguous-references';

export type Attribution =
  | {
      readonly kind: 'outcome';
      readonly mergeSha: string;
      readonly rule: 'pull-request-reference' | 'branch';
    }
  | { readonly kind: 'unattributed'; readonly reason: UnattributedReason };

const DEFAULT_BRANCH = 'main';

/**
 * Assigns one row to at most one outcome by the rules of design A3: a session that referenced
 * exactly one accepted pull request wins, then the row's branch against the outcomes' head and
 * member branches; everything else is unattributed with its reason. A branch reused by several
 * outcomes goes to the first outcome merged at or after the row, else the latest.
 */
export function attributeRow(
  row: HarnessUsageRow,
  session: SessionFacts | undefined,
  outcomes: readonly AcceptedOutcome[],
): Attribution {
  const byPullRequest = new Map<number, AcceptedOutcome>();
  const byBranch = new Map<string, AcceptedOutcome[]>();
  for (const outcome of outcomes) {
    if (outcome.pullRequest !== null) byPullRequest.set(outcome.pullRequest, outcome);
    for (const nested of outcome.nestedPullRequests) byPullRequest.set(nested, outcome);
    for (const branch of [outcome.headBranch, ...outcome.memberBranches]) {
      if (branch === null) continue;
      byBranch.set(branch, [...(byBranch.get(branch) ?? []), outcome]);
    }
  }
  const referenced = new Set<string>();
  for (const number of session?.pullRequestReferences ?? []) {
    const outcome = byPullRequest.get(number);
    if (outcome !== undefined) referenced.add(outcome.mergeSha);
  }
  const [single] = referenced;
  if (referenced.size === 1) {
    return { kind: 'outcome', mergeSha: single, rule: 'pull-request-reference' };
  }
  // Proof: attributing an ambiguous session to its first reference failed
  // `a session that opened two pull requests` (2026-10-22).
  if (referenced.size > 1) return { kind: 'unattributed', reason: 'ambiguous-references' };
  if (row.branch === null) return { kind: 'unattributed', reason: 'no-branch' };
  if (row.branch === DEFAULT_BRANCH) return { kind: 'unattributed', reason: 'on-default-branch' };
  const candidates = byBranch.get(row.branch);
  if (candidates === undefined) return { kind: 'unattributed', reason: 'branch-not-accepted' };
  const chosen = candidates.find((outcome) => outcome.mergedAt >= row.instant) ?? candidates.at(-1);
  if (chosen === undefined) return { kind: 'unattributed', reason: 'branch-not-accepted' };
  return { kind: 'outcome', mergeSha: chosen.mergeSha, rule: 'branch' };
}
