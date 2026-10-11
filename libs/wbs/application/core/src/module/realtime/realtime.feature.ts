import type { AuthenticatedUser, InternalIdentity } from '@wbs/contracts';

import type { ReplayOrchestrator, ReplayOutcome } from './replay-orchestrator';

export interface ReplayGraph {
  replay(resumePoints: Record<string, number>): Promise<Record<string, ReplayOutcome>>;
}

export interface ReplayInput {
  readonly resumePoints: Record<string, number>;
  readonly principal: InternalIdentity | AuthenticatedUser;
}

export type ReplayUseCaseOutcome =
  Record<string, ReplayOutcome> | { readonly status: 'denied'; readonly reason: 'noninternal' };

/** Replays only for a principal admitted by the internal authentication adapter. */
export function replay(
  graph: ReplayGraph | Pick<ReplayOrchestrator, 'replay'>,
  input: ReplayInput,
): Promise<ReplayUseCaseOutcome> {
  if (!('kind' in input.principal)) {
    return Promise.resolve({ status: 'denied', reason: 'noninternal' });
  }
  return graph.replay(input.resumePoints);
}

/** A replay outcome, or a subscription the requesting principal may not read. */
export type AuthorizedReplayOutcome =
  ReplayOutcome | { readonly status: 'denied'; readonly reason: 'forbidden' };

/**
 * Replays only the subscriptions `isReadable` admits for the requesting
 * principal; every other one is denied `forbidden` and never read from the log.
 */
export async function replayReadable(
  graph: {
    replay(resumePoints: Record<string, number>): Promise<Record<string, AuthorizedReplayOutcome>>;
  },
  resumePoints: Record<string, number>,
  isReadable: (subscription: string) => Promise<boolean>,
): Promise<Record<string, AuthorizedReplayOutcome>> {
  const admitted: Record<string, number> = {};
  const outcomes: Record<string, AuthorizedReplayOutcome> = {};
  for (const [subscription, sinceSeq] of Object.entries(resumePoints)) {
    if (await isReadable(subscription)) admitted[subscription] = sinceSeq;
    else outcomes[subscription] = { status: 'denied', reason: 'forbidden' };
  }
  return { ...(await graph.replay(admitted)), ...outcomes };
}
