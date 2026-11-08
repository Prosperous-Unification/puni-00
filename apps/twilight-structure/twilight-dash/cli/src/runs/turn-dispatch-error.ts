import { parseOrThrow } from '@shared/validation';

import { snapshotExecutorLocator, snapshotTurnRequest } from '../agents/activity-executor';
import type { TurnIntent } from './claim-records';
import { TurnIntentCodec } from './execution-codecs';
/** Unexpected post-stage failure retaining private cause and immutable portable provenance. */
export class TurnDispatchError extends Error {
  readonly intent: TurnIntent;
  constructor(intent: TurnIntent, cause: unknown) {
    super('Turn dispatch failed', { cause });
    this.name = 'TurnDispatchError';
    // Proof: T71–T75 removed detachment/deep freezes; 'correlated error detaches' failed. T86 bypassed the codec; node:assert throws caught accepted malformed version/claim while inherited request validation remained.
    const snapshot = structuredClone(parseOrThrow(TurnIntentCodec, intent));
    this.intent = Object.freeze({
      ...snapshot,
      locator: snapshotExecutorLocator(snapshot.locator),
      claim: Object.freeze(snapshot.claim),
      request: snapshotTurnRequest(snapshot.request),
    });
  }
}
