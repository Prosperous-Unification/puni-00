import { parseOrThrow, type } from '@shared/validation';

import { type ActivationControllerOptions, type ObservedCandidate } from './controller';
import { type ActivationSubject } from './request';

const GitCommit = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const Sha256 = /^[0-9a-f]{64}$/;
const RepositoryBinding = type({
  repositoryId: 'number.integer>=1',
  owner: /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/,
  name: /^[A-Za-z0-9._-]+$/,
  targetRef: /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  policyIdentity: Sha256,
  mappingIdentity: Sha256,
  toolkitIdentity: Sha256,
}).onUndeclaredKey('reject');
export type GitHubRepositoryBinding = typeof RepositoryBinding.infer;

const Pull = type({
  number: 'number.integer>=1',
  state: "'open'|'closed'",
  draft: 'boolean',
  head: { sha: GitCommit, repo: { id: 'number.integer>=1' } },
  base: {
    sha: GitCommit,
    ref: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    repo: { id: 'number.integer>=1' },
  },
});
type Pull = typeof Pull.infer;

const PullPage = type({ pulls: Pull.array(), nextPage: 'number.integer>=1|null' });

/**
 * Authenticated GitHub API reads supplied by the independently controlled controller runtime.
 * A missing/404/failed read throws; it is never represented as a closed pull request.
 */
export interface GitHubPullRequestReader {
  listOpenPullRequests(owner: string, name: string, page: number): Promise<unknown>;
  getPullRequest(owner: string, name: string, number: number): Promise<unknown>;
}

function checkedPull(raw: unknown, binding: GitHubRepositoryBinding): Pull {
  const pull = parseOrThrow(Pull, raw);
  // Proof: a foreign base repository response must not become this repository's PR candidate.
  if (pull.base.repo.id !== binding.repositoryId) {
    throw new Error('GitHub PR base repository differs from pinned repository');
  }
  // A fork's head repository is not represented in ActivationRequest v1. Refuse instead of
  // aliasing a foreign repository's commit with an in-repository commit of the same SHA.
  // Proof: the mounted fork-head negative fails if this refusal is removed.
  if (pull.head.repo.id !== binding.repositoryId) {
    throw new Error('GitHub PR fork head is unsupported by request identity');
  }
  return pull;
}

function candidate(pull: Pull, binding: GitHubRepositoryBinding): ObservedCandidate {
  return {
    repositoryId: binding.repositoryId,
    subject: { kind: 'pull-request', number: pull.number },
    targetRef: binding.targetRef,
    headSha: pull.head.sha,
    baseSha: pull.base.sha,
    policyIdentity: binding.policyIdentity,
    mappingIdentity: binding.mappingIdentity,
    toolkitIdentity: binding.toolkitIdentity,
  };
}

function isEligible(pull: Pull, binding: GitHubRepositoryBinding): boolean {
  // Proof: independently omitting open, draft, or target checks admitted the mounted ineligible PR.
  return (
    pull.state === 'open' && !pull.draft && `refs/heads/${pull.base.ref}` === binding.targetRef
  );
}

/**
 * Supplies discovery hints and fresh current PR observations to the durable controller.
 * The configured repository and identities come from trusted bootstrap, never a PR payload.
 * Listing never authorizes a request: reconcileReady refetches every hinted and active subject.
 */
export function createGitHubPullRequestSource(
  rawBinding: GitHubRepositoryBinding,
  reader: GitHubPullRequestReader,
): Pick<ActivationControllerOptions, 'readyCandidates' | 'currentCandidate'> {
  const binding = parseOrThrow(RepositoryBinding, rawBinding);
  return {
    readyCandidates: async () => {
      const candidates: ObservedCandidate[] = [];
      const seen = new Set<number>();
      for (let page = 1; page <= 100; page += 1) {
        const response = await reader.listOpenPullRequests(binding.owner, binding.name, page);
        const listed = parseOrThrow(PullPage, response);
        // Proof: accepting a provider-selected cursor could omit later ready PRs or loop forever.
        if (listed.nextPage !== null && listed.nextPage !== page + 1) {
          throw new Error('GitHub PR pagination cursor changed');
        }
        // Proof: omitting the page cap changed the mounted oversized-page refusal to a later PR mismatch.
        if (listed.pulls.length > 100) throw new Error('GitHub PR page exceeds 100 pulls');
        for (const rawPull of listed.pulls) {
          const pull = checkedPull(rawPull, binding);
          // Proof: duplicate PR numbers across pages must refuse rather than hide a changed tuple.
          if (seen.has(pull.number)) throw new Error('GitHub PR listing repeats a subject');
          seen.add(pull.number);
          if (isEligible(pull, binding)) candidates.push(candidate(pull, binding));
        }
        if (listed.nextPage === null) return candidates;
      }
      // Proof: returning here let a continuing 100-page scan silently report an incomplete list.
      throw new Error('GitHub PR pagination exceeds bounded scan');
    },
    currentCandidate: async (repositoryId: number, subject: ActivationSubject) => {
      // Proof: a foreign repo/subject locator must not trigger a read under this credential.
      if (repositoryId !== binding.repositoryId || subject.kind !== 'pull-request') {
        throw new Error('GitHub source cannot observe this repository subject');
      }
      const response = await reader.getPullRequest(binding.owner, binding.name, subject.number);
      const pull = checkedPull(response, binding);
      // Proof: a response for another PR number must never select this subject's request.
      if (pull.number !== subject.number) throw new Error('GitHub PR read differs from subject');
      return isEligible(pull, binding)
        ? { kind: 'ready' as const, candidate: candidate(pull, binding) }
        : { kind: 'closed' as const };
    },
  };
}
