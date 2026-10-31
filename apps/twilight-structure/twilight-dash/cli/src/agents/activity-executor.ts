import type { UIMessageChunk } from 'ai';

import type {
  EffectReply,
  ExecutorKind,
  ExecutorLocator,
  Preparation,
  QuiescenceReply,
  RecoveryCapabilities,
  SessionLookup,
  TurnIdentity,
  TurnReply,
  TurnRequest,
  Uncertainty,
} from './execution-records';

export {
  ActivityDispatchError,
  snapshotExecutorLocator,
  snapshotPreparation,
  snapshotTurnReply,
  snapshotTurnRequest,
} from './execution-codecs';
export type {
  DispatchOwner,
  EffectReply,
  ExecutorKind,
  ExecutorLocator,
  Preparation,
  QuiescenceReply,
  RecoveryCapabilities,
  SessionLookup,
  TurnIdentity,
  TurnOutcome,
  TurnReply,
  TurnRequest,
  Uncertainty,
  Usage,
} from './execution-records';

export interface ActivitySession {
  readonly locator: ExecutorLocator;
  // Opaque live identity: only the creating adapter instance accepts this object.
}
export type OpenReply =
  | { readonly kind: 'opened'; readonly session: ActivitySession }
  | { readonly kind: 'not_started'; readonly reason: 'cancelled_before_dispatch' }
  | {
      readonly kind: 'unresolved';
      readonly preparation: Preparation;
      readonly reason: Uncertainty;
    };
export type ResumeReply =
  | { readonly kind: 'attached'; readonly session: ActivitySession }
  | {
      readonly kind: 'unresolved';
      readonly locator: ExecutorLocator;
      readonly reason: Uncertainty;
    };
export interface ActivityExecutor {
  readonly kind: ExecutorKind;
  readonly version: string;
  readonly capabilities: RecoveryCapabilities;
  open(preparation: Preparation, signal: AbortSignal): Promise<OpenReply>;
  turn(
    session: ActivitySession,
    request: TurnRequest,
    control: { readonly signal: AbortSignal; readonly onPart: (part: UIMessageChunk) => void },
  ): Promise<TurnReply>;
  lookupSession(preparation: Preparation, signal: AbortSignal): Promise<SessionLookup>;
  resumeSession(locator: ExecutorLocator, signal: AbortSignal): Promise<ResumeReply>;
  inspectEffect(identity: TurnIdentity, signal: AbortSignal): Promise<EffectReply>;
  cancel(
    session: ActivitySession,
  ): Promise<{ readonly kind: 'requested'; readonly locator: ExecutorLocator }>;
  observeQuiescence(locator: ExecutorLocator, signal: AbortSignal): Promise<QuiescenceReply>;
  close(session: ActivitySession): Promise<void>;
}
