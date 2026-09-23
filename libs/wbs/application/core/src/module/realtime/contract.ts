import type { Clock } from '../../ports/clock';
import type { EventLogStore } from '../../ports/event-log-store';
import type { PushTransport } from '../../ports/push-transport';
import type { GatewayBroadcaster } from './gateway-broadcaster';
import type { ReplayBuffer } from './replay-buffer';
import type { ReplayOrchestrator } from './replay-orchestrator';

/**
 * What a host must supply to install {@link realtimeModule}.
 *
 * `eventLog` is a repository port, existing K3 debt this extraction preserves
 * rather than fixes — the same preserved debt
 * `libs/wbs/application/core/src/module/bounded-replay-sweep/contract.ts`
 * records for its own two stores. Closing it needs a resource-service over
 * this store that no accepted change supplies, so `adopt-di-composition`
 * records it as open and this module claims no K3 compliance either.
 *
 * `onPushFailed` is optional for the reason `gateway-broadcaster.ts`'s own
 * JSDoc gives: a failed push is logged and swallowed because the mutation it
 * describes already committed, and a process that does not care to log the
 * swallow still needs the swallow to happen. `maxEvents` is optional because
 * `ReplayOrchestrator` already defaults it.
 */
export interface RealtimeRequirements {
  readonly eventLog: EventLogStore;
  readonly clock: Clock;
  readonly push: PushTransport;
  readonly maxPerSubscription: number;
  readonly maxAgeMs: number;
  readonly maxEvents?: number;
  readonly onPushFailed?: (err: unknown, subscription: string) => void;
}

/**
 * What installing {@link realtimeModule} adds to a host graph.
 *
 * `broadcaster` is exported as the concrete {@link GatewayBroadcaster} class
 * rather than narrowed to the neutral `Broadcaster` port
 * (`ports/project-event.ts`): `apps/wbs/be-01/src/services.ts` calls its
 * `pushRecorded` method, which is not part of the `Broadcaster` contract and
 * has exactly one production caller outside this module. Composition may
 * still decorate the returned instance with `OptimizerTriggerBroadcaster`
 * exactly as before this module existed — that decoration only ever needed
 * the `Broadcaster` half of this surface, so widening `broadcaster`'s
 * declared type costs the decorator nothing. See the module's own README,
 * "Wiki registration," for the measurement this decision rests on.
 *
 * `replayBuffer` is exported for the same "current compatibility value"
 * reason `docs/superpowers/plans/2026-09-21-batch-4/040-6-backend-module-map.md`
 * names it: `compose.ts`'s `CommonServices` has carried this field since
 * before this module existed, and no accepted change asks this packet to
 * remove it, even though nothing outside `compose.ts` reads it today.
 */
export interface RealtimeExports {
  readonly replayBuffer: ReplayBuffer;
  readonly broadcaster: GatewayBroadcaster;
  readonly replay: ReplayOrchestrator;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s and
 * `module.application.bounded-replay-sweep`'s; the wiki module identifier is
 * `module.application.realtime` and the label drops the `module.` prefix.
 */
export const REALTIME_LABEL = 'application.realtime';
