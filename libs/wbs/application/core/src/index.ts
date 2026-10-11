/**
 * `@wbs/core` — the application ring: what be-01 does, with nothing about how.
 *
 * Ports and services live here and adapters do not: a file in this project may
 * import `@wbs/domain`, `@wbs/contracts` and its own peers, and nothing else
 * (`eslint.config.js`'s ring constraints, watched in this change's `verify.md`).
 * What that buys is the composition `compose.test.ts` will make — this graph
 * over the in-memory source and the portable runtime, with no Bun, no SQLite
 * and no HTTP in it.
 *
 * It is being filled a slice at a time, and what is here is what has no adapter
 * in its signature. The store ports follow once two of them stop naming
 * drizzle's own types — `EventLogStore.recordEventIn(tx)` and
 * `SavedPlanStore.holdingOf(db)` — which is `tasks.md` 2.2's first job rather
 * than a move.
 */
export * from './compose';
export * from './http/import.routes';
export * from './module/authentication/contract';
export * from './module/authentication/module';
export * from './module/bounded-replay-sweep/contract';
export * from './module/bounded-replay-sweep/module';
export * from './module/calendar-marker/contract';
export * from './module/calendar-marker/module';
export * from './module/capacity/contract';
export * from './module/capacity/module';
export * from './module/directory/contract';
export * from './module/directory/module';
export * from './module/event-log/contract';
export * from './module/event-log/event-log.resource';
export * from './module/event-log/module';
export * from './module/plan-commands/contract';
export * from './module/plan-commands/module';
export * from './module/plan-document/contract';
export * from './module/plan-document/module';
export * from './module/plan-event/contract';
export * from './module/plan-event/module';
export * from './module/plan-event/plan-event.resource';
export * from './module/plan-history/contract';
export * from './module/plan-history/module';
export * from './module/plan-import/contract';
export * from './module/plan-import/module';
export * from './module/priority-band/contract';
export * from './module/priority-band/module';
export * from './module/project/contract';
export * from './module/project/module';
export * from './module/realtime/contract';
export * from './module/realtime/module';
export * from './module/saved-plans/contract';
export * from './module/saved-plans/module';
export * from './module/step/contract';
export * from './module/step/module';
export * from './module/work-item/contract';
export * from './module/work-item/module';
export * from './ports/actual-store';
export * from './ports/announcement-collector';
// The owner-neutral marker read: `CalendarMarkerReader` and the list outcome it answers with.
export * from './ports/calendar-marker-read';
export * from './ports/calendar-marker-store';
export * from './ports/capacity-store';
export { type Clock, clockOf } from './ports/clock';
export * from './ports/command-journal-store';
export * from './ports/dependency-store';
export * from './ports/directory-store';
export * from './ports/domain-challenges';
export * from './ports/edit-admission';
export * from './ports/estimate-store';
export type { EventLogStore, RecordedEvent } from './ports/event-log-store';
export * from './ports/measure-store';
export type { OidcVerifier } from './ports/oidc-verifier';
export * from './ports/plan-event-store';
export * from './ports/priority-band-store';
export * from './ports/progress-store';
export * from './ports/typed-dependency-store';
// The neutral project-event port: `Broadcaster`, `ProjectEvent` and `subscriptionFor`.
export * from './module/calendar-marker/calendar-marker.resource';
export * from './module/capacity/capacity.resource';
export * from './module/directory/directory.resource';
export * from './module/plan-commands/command-bindings';
export * from './module/realtime/gateway-broadcaster';
export * from './ports/email-delivery';
export * from './ports/email-verification';
export * from './ports/invitation';
export * from './ports/join-request';
export * from './ports/membership-administration';
export * from './ports/onboarding';
export * from './ports/organization-access';
export * from './ports/project-event';
export * from './ports/project-rank-store';
export * from './ports/project-store';
export type { PushTransport } from './ports/push-transport';
export type { Digest, PasswordHasher, SessionClaims, TokenCodec } from './ports/runtime';
export type { PlanInputReads, SavedPlanCaptureStore } from './ports/saved-plan-capture-store';
export type {
  SavedPlanBodyWrite,
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanScheduleWrite,
  SavedPlanStore,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  StoredSavedPlan,
} from './ports/saved-plan-store';
export * from './ports/scheduler';
export * from './ports/source';
export * from './ports/space-store';
export * from './ports/step-store';
export * from './ports/stores';
export * from './ports/subtree-store';
export type { Intervals, Timers } from './ports/timers';
export type { Decision, Scope, UnitOfWork } from './ports/unit-of-work';
export * from './ports/user-store';
export * from './ports/work-item-store';
export type { WriteStamp } from './ports/write-stamp';
export { DeadlineExceeded, delay, untilAborted, withinDeadline } from './runtime/deadline';
export * from './service/auth.service';
export * from './service/compensating';
export * from './service/directory-usage';
// Compatibility export: these domain rules moved to `@wbs/domain` (task 6.1) and keep their
// barrel names until importers name the domain library; task 7.1 retires it.
export {
  assumedAssignee,
  type AssumedAssigneeFlip,
  assumedAssigneeFlips,
  bodyBytesRefusal,
  buildScheduleBody,
  canDepend,
  canReparent,
  cleanName,
  type DatedTiming,
  type Days,
  DEFAULT_SAVED_PLAN_QUOTA,
  defaultSavedPlanName,
  type DependencyRefusal,
  holdingRefusal,
  planInputRowsOf,
  rollUp,
  rollUpActuals,
  rollUpFinals,
  rollUpMeasures,
  rollUpProgress,
  rollUpWorkItemStatuses,
  type SavedPlanHolding,
  type SavedPlanLimit,
  type SavedPlanQuota,
  type SavedPlanQuotaRefusal,
  SCHEDULE_BODY_SCHEMA_VERSION,
  type ScheduleBody,
  serialiseScheduleBody,
  type SpanDates,
  workedStepsOf,
} from '@wbs/domain';
// Compatibility export: Plan history's symbols keep their barrel names.
export * from './module/authentication/login-throttle';
export * from './module/bounded-replay-sweep/bounded-replay-sweep.feature';
export * from './module/bounded-replay-sweep/retention-job';
export * from './module/bounded-replay-sweep/retention-timer';
export * from './module/plan-commands/plan-commands.feature';
export * from './module/plan-commands/run-command-batch';
export * from './module/plan-commands/working-plan.resource';
export * from './module/plan-document/plan-document.resource';
export * from './module/plan-history/plan-history.feature';
export * from './module/plan-import/plan-import.feature';
export * from './module/plan-import/prepare-import';
export * from './module/priority-band/priority-band.resource';
export * from './module/project/project.resource';
export * from './module/realtime/realtime.feature';
export * from './module/realtime/replay-buffer';
export * from './module/realtime/replay-orchestrator';
export * from './module/saved-plans/save-plan';
export * from './module/saved-plans/saved-plan-integrity';
export * from './module/step/step.resource';
export * from './module/work-item/work-item.resource';
export * from './ports/chain-snapshot-store';
export * from './ports/shared-people-values';
export * from './service/numbered-work-item';
export * from './service/optimizer-trigger-broadcaster';
export * from './service/person-load.feature';
export * from './service/plan-command';
export * from './service/saved-plan.service';
export * from './service/saved-plan-schedule';
export * from './service/shared-people';
export * from './service/space.resource';
