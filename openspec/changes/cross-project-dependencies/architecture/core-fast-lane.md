# Immediate core Fast/calendar lane decision

**Start the pure core worker now.** The approved `ConnectedPlanCapture` value is sufficient independently of capture's pending post-await lifetime fix. No SQLite capability or unfinished live wrapper is needed to derive and test detached values. This does not approve or bypass the outstanding capture fix.

The inspected integration checkout currently reports `712063f4f` and does not yet contain `connected-plan-values.ts` or `resolved-schedule-input.ts`. Root must give the worker a base containing reviewed domain commit `2f70f34f5` plus the **exact accepted** `ConnectedPlanCapture` definition from capture commit `467ad3f12`. Importing that reviewed value file alone is adequate; do not invent a duplicate interface, cast, SQL adapter or placeholder. Root handles eventual commit integration, including any identical-file overlap with the full capture commit.

## Minimal staged signature

Use this required signature in the worker's new `core/src/service/connected-plan.ts`:

```ts
export function deriveConnectedPlan(
  capture: ConnectedPlanCapture,
  scheduler: Pick<CapturedScheduler, 'supports'>,
  scheduleFast: (input: ResolvedScheduleInput) => Schedule,
): ConnectedPlanProjection;
```

The third parameter is mandatory and synchronous. Its type is the existing resolved Fast operation written inline, **not** a second scheduler abstraction or implementation. No optional parameter, default implementation, fallback, fake schedule or new capability object is introduced. A separate `ResolvedFastScheduler` named alias is unnecessary to unblock this lane; the later integrator may name this same function type in `ports/scheduler.ts` when adding its method.

The second parameter reads only the existing installed-engine predicate, needed for the agreed honest required-optimizer refusal. There is no call to ordinary local `scheduler.read`, and connected optimization remains explicitly unsupported until task 7. The core worker changes neither `CapturedScheduler` nor any capture factory/wrapper.

Focused core tests pass the **real domain `scheduleResolved`** as the third argument and an explicit `supports` predicate for the required-engine cases. Fixtures do not simulate placements. Tests must assert interleaving, reduced holds, project capacities/settings, common-axis calendar arithmetic, own-anchor projection and typed missing-calendar/engine outcomes through `deriveConnectedPlan` itself. This is meaningful detached production derivation even before the live observation calls it.

## Ownership and merge order

1. Root supplies the reviewed domain engine and accepted capture value on the worker base. Capture worker retains only its assigned chain/source/fanout lifetime fix and tests.
2. Core worker owns the new preparation/connected derivation/calendar/projection files and focused tests. It may adapt the existing captured saved-plan wrapper to the shared preparation helper. It supplies, but does not apply, the `work-item.resource.ts` canonical-preparation replacement hunk. The one integrator applies that hunk so the final tree has one preparation implementation, as already ruled.
3. Core worker does **not** edit `ports/scheduler.ts`, shared barrels, runtime constructor factories, `chain-snapshot.ts`, services/source/boot or live consumer switches. Keep exports private to direct module imports for its focused tests until the integrator owns the shared export hunk. It may supply proposed hunks separately.
4. After the capture lifetime fix is integrated, the designated integrator adds required `readResolvedFast` to Scheduler/CapturedScheduler, wires the real runtime function, updates all factories and applies the same irreversible lifetime checks in snapshot wrappers. The function type can then be named `ResolvedFastScheduler` without changing its meaning.
5. The real snapshot callback invokes:

```ts
deriveConnectedPlan(capture, snapshot.scheduler, (input) =>
  snapshot.scheduler.readResolvedFast(input),
);
```

This preserves the worker signature and ensures production placement crosses the snapshot's required lifetime guard. Do not wire bare domain `scheduleResolved` directly from a retained snapshot callback as a shortcut around that guard. Ordinary detached pure tests may call it directly because they borrow no observation.

The worker can therefore finish/test the pure core slice while capture is being repaired; actual connected LivePlanRead, runtime capability wiring, live preparation replacement, observation lifetime verification and activation remain explicit integrator work. No task is marked production-complete solely because the detached helper tests pass.

Read-only ruling; no code changes or tests were run.
