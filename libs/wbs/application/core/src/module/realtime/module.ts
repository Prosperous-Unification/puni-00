import { DiBag } from 'di-bag';

import type { Clock } from '../../ports/clock';
import type { EventLogStore } from '../../ports/event-log-store';
import type { PushTransport } from '../../ports/push-transport';
import { REALTIME_LABEL } from './contract';
import { GatewayBroadcaster, type GatewayBroadcasterOptions } from './gateway-broadcaster';
import { ReplayBuffer } from './replay-buffer';
import { ReplayOrchestrator, type ReplayOrchestratorOptions } from './replay-orchestrator';

/**
 * Realtime as a sealed DI Bag module.
 *
 * `replayBuffer` is exported directly: it needs no assembly beyond its own
 * three host-supplied fields, and the map records it as a current
 * compatibility export rather than a private implementation detail.
 * `broadcasterOptions` and `replayOptions` stay private — a host cannot name
 * either, so a requirement it forgets is reported against
 * `application.realtime/broadcasterOptions` or `application.realtime/replayOptions`
 * rather than against an anonymous binding. Both classes read the same
 * `replayBuffer` instance, so `broadcaster` and `replay` are registered after
 * it in the same stage rather than in parallel private ones.
 *
 * The module registers no disposer: `ReplayBuffer` owns no resource,
 * `GatewayBroadcaster` and `ReplayOrchestrator` hold no handle either, and
 * nothing in this module starts a timer or a connection of its own.
 */
export const realtimeModule = DiBag.createBuilder()
  .withServices({
    replayBuffer: DiBag.createProvider(
      ({
        maxPerSubscription,
        maxAgeMs,
        clock,
      }: {
        maxPerSubscription: number;
        maxAgeMs: number;
        clock: Clock;
      }): ReplayBuffer =>
        new ReplayBuffer({ maxPerSubscription, maxAgeMs, now: () => clock.now() }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    broadcasterOptions: DiBag.createProvider(
      ({
        eventLog,
        clock,
        push,
        replayBuffer,
        onPushFailed,
      }: {
        eventLog: EventLogStore;
        clock: Clock;
        push: PushTransport;
        replayBuffer: ReplayBuffer;
        onPushFailed: ((err: unknown, subscription: string) => void) | undefined;
      }): GatewayBroadcasterOptions => ({
        eventLog,
        clock,
        push,
        buffer: replayBuffer,
        ...(onPushFailed === undefined ? {} : { onPushFailed }),
      }),
      { factoryReturnKind: 'sync-value' },
    ),
    replayOptions: DiBag.createProvider(
      ({
        eventLog,
        replayBuffer,
        maxEvents,
      }: {
        eventLog: EventLogStore;
        replayBuffer: ReplayBuffer;
        maxEvents: number | undefined;
      }): ReplayOrchestratorOptions => ({
        log: eventLog,
        buffer: replayBuffer,
        ...(maxEvents === undefined ? {} : { maxEvents }),
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    broadcaster: DiBag.createProvider(
      ({ broadcasterOptions }: { broadcasterOptions: GatewayBroadcasterOptions }) =>
        new GatewayBroadcaster(broadcasterOptions),
      { factoryReturnKind: 'sync-value' },
    ),
    replay: DiBag.createProvider(
      ({ replayOptions }: { replayOptions: ReplayOrchestratorOptions }) =>
        new ReplayOrchestrator(replayOptions),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-23): widening the key tuple to
  // `['replayBuffer', 'broadcaster', 'replay', 'broadcasterOptions']` left `keeps its private
  // bindings out of a host graph`'s first assertion, `labels its private bindings with the module
  // name`'s first assertion and `names itself when a host omits a requirement` failing (3 pass, 3
  // fail) — `resolve('broadcasterOptions')` returned the raw options object instead of throwing,
  // and `inspectGraph()` reported the bare key `broadcasterOptions` with no label prefix.
  // Proof (2026-09-23): widening the key tuple to
  // `['replayBuffer', 'broadcaster', 'replay', 'replayOptions']` instead, independently, left only
  // `keeps its private bindings out of a host graph`'s SECOND assertion and `labels its private
  // bindings with the module name`'s SECOND assertion failing (4 pass, 2 fail) —
  // `resolve('replayOptions')` returned the raw options object and `inspectGraph()` reported the
  // bare key `replayOptions`; `broadcasterOptions` stayed correctly hidden and labelled, proving
  // each private binding's privacy independently of the other.
  // Proof (2026-09-23): dropping `{ label: REALTIME_LABEL }` left only the two label assertions
  // failing (4 pass, 2 fail): `inspectGraph()` reported both `broadcasterOptions` and
  // `replayOptions` unlabelled, and a missing requirement's message named `broadcasterOptions`
  // instead of `application.realtime/broadcasterOptions`.
  .buildModule({
    exportedServiceKeys: ['replayBuffer', 'broadcaster', 'replay'],
    moduleLabel: REALTIME_LABEL,
  });
