import type { SelectedActivity } from '@twilight-burokrat/contracts';
import type { ModelMessage, ToolSet } from 'ai';

import { equalRecords } from '../runs/record-codecs';
import type { AgentRunId } from '../runs/records';
import {
  type ActivityExecutor,
  type ActivitySession,
  type OpenReply,
  snapshotExecutorLocator,
  snapshotPreparation,
  snapshotTurnRequest,
  type TurnReply,
  type TurnRequest,
} from './activity-executor';
import { type ApiModelRegistry, resolveApiModelSettings } from './api-model-settings';
import { runApiModelTurn } from './api-model-turn';

interface Delivery {
  readonly request: TurnRequest;
  settlement:
    { kind: 'active' } | { kind: 'replied'; reply: TurnReply } | { kind: 'threw'; cause: unknown };
}
interface Conversation {
  readonly attachment: ActivitySession;
  readonly turns: Map<string, Delivery>;
  history: readonly ModelMessage[];
  active: AbortController | undefined;
  closed: boolean;
  quarantined: boolean;
}

/**
 * Composes one process-local conversation adapter from accepted selection and live SDK capabilities.
 * Exact-key caches belong only to this instance; recovery and physical quiescence remain unsupported.
 * @throws For malformed trusted identities, foreign/closed attachments, conflicting keys or invalid continuation causes.
 */
export function createApiModelExecutor(options: {
  selection: SelectedActivity;
  models: ApiModelRegistry;
  tools: ToolSet;
  instanceId: string;
  newSessionId: () => AgentRunId;
}): ActivityExecutor {
  const settings = resolveApiModelSettings(options);
  const { instanceId, newSessionId } = options;
  const { bindingDigest, requestedType, matchedType, stepCode, className } = settings.selection;
  const preparations = new Map<string, Conversation>();
  const sessions = new Map<ActivitySession, Conversation>();
  const sessionIds = new Set<AgentRunId>();
  /** Checks live object ownership; portable locator equality cannot reattach an SDK conversation. */
  function requireConversation(attachment: ActivitySession): Conversation {
    // Proof: locator-key fallback admitted a foreign live attachment in the public ownership test.
    const conversation = sessions.get(attachment);
    if (conversation === undefined) throw new Error('foreign activity session');
    return conversation;
  }
  /** Closed identities remain recognizable for idempotent close/cancel, but cannot be reused. */
  function requireOpen(conversation: Conversation): void {
    // Proof: removing this check accepted cached turn reuse after close in the public closed-attachment test.
    if (conversation.closed) throw new Error('closed activity session');
  }
  return Object.freeze({
    kind: 'api-model',
    version: '1',
    capabilities: Object.freeze({
      locateSession: 'unsupported',
      resumeSession: 'unsupported',
      deduplicatePreparation: 'unsupported',
      deduplicateTurn: 'unsupported',
      inspectEffect: 'unsupported',
      cancelPhysicalWork: 'unsupported',
      observeQuiescence: 'unsupported',
    }),
    async open(input, signal) {
      const preparation = snapshotPreparation(input);
      // Proof: checking the new signal here first replaced an exact open replay with not_started.
      const existing = preparations.get(preparation.creationKey);
      if (existing !== undefined) {
        // Proof: removing payload comparison replayed an altered attempt under the same creation key.
        if (!equalRecords(existing.attachment.locator.preparation, preparation))
          throw new Error('conflicting creation key');
        requireOpen(existing);
        return { kind: 'opened', session: existing.attachment };
      }
      // Proof: removing fresh pre-abort refusal created a session in the public no-allocation test.
      if (signal.aborted) return { kind: 'not_started', reason: 'cancelled_before_dispatch' };
      const sessionId = newSessionId();
      // Proof: removing ID uniqueness accepted a second creation using the first session's ID.
      if (sessionIds.has(sessionId)) throw new Error('duplicate activity session ID');
      const attachment = Object.freeze({
        locator: snapshotExecutorLocator({
          version: 1,
          executor: 'api-model',
          executorVersion: '1',
          preparation,
          selection: { bindingDigest, requestedType, matchedType, stepCode, className },
          session: {
            version: 1,
            workerId: instanceId,
            sessionId,
            operationKey: preparation.identity.operationKey,
          },
        }),
      });
      const conversation: Conversation = {
        attachment,
        turns: new Map(),
        history: [],
        active: undefined,
        closed: false,
        quarantined: false,
      };
      sessions.set(attachment, conversation);
      sessionIds.add(sessionId);
      preparations.set(preparation.creationKey, conversation);
      return Promise.resolve<OpenReply>({
        kind: 'opened',
        session: attachment,
      });
    },
    async turn(attachment, input, control) {
      // Proof: retaining input directly broke exact replay after caller edits; freeze-only aliasing broke caller mutability.
      const request = snapshotTurnRequest(input);
      // Proof: rereading control.onPart routed actual delayed SDK chunks to the replacement callback.
      const { signal, onPart } = control;
      const conversation = requireConversation(attachment);
      requireOpen(conversation);
      const identity = Object.freeze({
        locator: conversation.attachment.locator,
        turnKey: request.turnKey,
        owner: request.owner,
      });
      const unresolved = (reason: 'turn_in_flight' | 'recovery_required'): TurnReply =>
        Object.freeze({
          kind: 'unresolved',
          identity,
          reason,
          text: '',
          usage: Object.freeze({ kind: 'unknown', reason: 'interrupted-before-usage' }),
        });
      // Proof: moving fresh cancellation before this lookup replaced a completed cached reply with not_started.
      const existing = conversation.turns.get(request.turnKey);
      if (existing !== undefined) {
        // Proof: removing payload comparison replayed changed input instead of rejecting its recorded key.
        if (!equalRecords(existing.request, request)) throw new Error('conflicting turn key');
        switch (existing.settlement.kind) {
          case 'active':
            return unresolved('turn_in_flight');
          case 'replied':
            return existing.settlement.reply;
          case 'threw':
            throw existing.settlement.cause;
        }
      }
      // Proof: binding this refusal's key rejected explicit changed-payload resubmission; removal returned interruption.
      if (signal.aborted)
        return Object.freeze({
          kind: 'not_started',
          identity,
          reason: 'cancelled_before_dispatch',
        });
      // Proof: removing exclusion dispatched twice at the real doStream barrier; binding busy keys rejected changed resubmission.
      // Proof: moving contention before fresh cancellation reported session_busy for a pre-aborted fresh request.
      if (conversation.active !== undefined)
        return Object.freeze({ kind: 'not_started', identity, reason: 'session_busy' });
      // Proof: removal completed a new turn after malformed usage, and redispatched after unresolved completion.
      if (conversation.quarantined) return unresolved('recovery_required');
      // Proof: removal admitted a decision first and a second initial cause in the public continuation tests.
      if ((conversation.turns.size === 0) !== (request.cause.kind === 'initial'))
        throw new Error('invalid activity continuation cause');
      const controller = new AbortController();
      const delivery: Delivery = { request, settlement: { kind: 'active' } };
      conversation.turns.set(request.turnKey, delivery);
      conversation.active = controller;
      try {
        const dispatched = await runApiModelTurn({
          settings,
          identity,
          request,
          history: conversation.history,
          // Proof: dropping the originating signal completed a real SDK turn after the caller aborted.
          signal: AbortSignal.any([signal, controller.signal]),
          abort: () => {
            controller.abort();
          },
          onPart: (part) => {
            // Proof: removal delivered actual converted text-end and abort chunks after public close.
            if (!conversation.closed) onPart(part);
          },
        });
        let reply: TurnReply;
        if (dispatched.kind === 'completed') {
          // Proof: replacing SDK responseMessages with text lost tool-call/tool-result history in a public decision turn.
          conversation.history = [
            ...conversation.history,
            { role: 'user', content: request.input },
            ...dispatched.responseMessages,
          ];
          // Proof: removing reply/usage freezing failed the immutable completed-replay test at the real port.
          reply = Object.freeze({
            kind: 'completed',
            identity,
            outcome: Object.freeze({
              ...dispatched.outcome,
              usage: Object.freeze({ ...dispatched.outcome.usage }),
            }),
          });
        } else {
          conversation.quarantined = true;
          reply = Object.freeze({ ...dispatched, usage: Object.freeze({ ...dispatched.usage }) });
        }
        delivery.settlement = { kind: 'replied', reply };
        return reply;
      } catch (cause) {
        conversation.quarantined = true;
        delivery.settlement = { kind: 'threw', cause };
        throw cause;
      } finally {
        conversation.active = undefined;
      }
    },
    async lookupSession(input, _signal) {
      return Promise.resolve(
        Object.freeze({
          kind: 'unresolved',
          preparation: snapshotPreparation(input),
          reason: 'unsupported',
        }),
      );
    },
    async resumeSession(input, _signal) {
      return Promise.resolve(
        Object.freeze({
          kind: 'unresolved',
          locator: snapshotExecutorLocator(input),
          reason: 'unsupported',
        }),
      );
    },
    async inspectEffect(input, _signal) {
      const request = snapshotTurnRequest({
        version: 1,
        turnKey: input.turnKey,
        owner: input.owner,
        cause: { kind: 'initial' },
        input: '',
      });
      const identity = Object.freeze({
        locator: snapshotExecutorLocator(input.locator),
        turnKey: request.turnKey,
        owner: request.owner,
      });
      return Promise.resolve(
        Object.freeze({ kind: 'unresolved', identity, reason: 'unsupported' }),
      );
    },
    async cancel(attachment) {
      const conversation = requireConversation(attachment);
      // Proof: skipping abort completed the pending SDK call; clearing active here dispatched a second call before settlement.
      conversation.active?.abort();
      return Promise.resolve(
        Object.freeze({ kind: 'requested', locator: conversation.attachment.locator }),
      );
    },
    async observeQuiescence(input, _signal) {
      return Promise.resolve(
        Object.freeze({
          kind: 'unresolved',
          locator: snapshotExecutorLocator(input),
          reason: 'unsupported',
        }),
      );
    },
    async close(attachment) {
      const conversation = requireConversation(attachment);
      conversation.closed = true;
      // Proof: skipping abort completed the public close-during-stream turn instead of reporting interruption.
      conversation.active?.abort();
      return Promise.resolve();
    },
  } satisfies ActivityExecutor);
}
