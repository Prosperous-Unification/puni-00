> **Superseded 2026-08-05 by `resume-and-reconnect`.** Every unchecked item below
> is either done differently or no longer wanted, and none of them should be
> picked up as written:
>
> - The `EventBus` this proposed never appeared. `GatewayBroadcaster` took its
>   place when the domain landed — same job (record, buffer, push, swallow a
>   failed push), reached through the `Broadcaster` port the work item service
>   already depends on.
> - `ReplayOrchestrator` exists, but replays through the resume **response**
>   rather than back through `PushClient`. `/internal/push` fans out to every
>   socket on a subscription, so the design here would have made one client's
>   reconnect refetch every other open browser. See that change's `design.md` D1.
> - ~~`RetentionTimer` is still absent~~ **Stale since the banner was written:**
>   `RetentionTimer` landed later — `apps/be-01/src/service/retention-timer.ts`
>   (+ its test), constructed in `services.ts`, started by `boot.ts` after the
>   port binds, awaited on shutdown.
> - The `onForward` pure ack landed as proposed, with a test that it records
>   nothing (`controller/internal.integration.test.ts`, "records no event and
>   pushes nothing").
>
> **Reconciled against `main` 2026-08-10 (Lane B of
> `docs/plans/2026-08-10-ux-batch-and-roadmap.md`).** Each task was checked
> against the shipped code by inspection. `[x]` below means _closed_, not "done
> as written": either the note names where the equivalent shipped, or the item
> is struck as superseded. Verification is code inspection plus the named test
> files existing on `main` — no test runs or fault injections were performed
> for this reconciliation.

## 1. Test fixture and service skeletons

- [x] 1.1 ~~Create `apps/be-01/src/__tests__/build-services.ts` exporting `buildTestServices(overrides?)` …~~ — struck: that file never existed. The role shipped as `buildServices` in `apps/be-01/src/services.ts` (production wiring, asserted by `services.test.ts`) plus per-domain fixtures under `apps/be-01/src/testing/` (`replay-fixture.ts`, `broadcast-fixture.ts`, …).
- [x] 1.2 A typed `BeServices` interface exists — in `apps/be-01/src/services.ts`, not `app.ts`, and with a different shape: `{ auth, projects, roles, directory, workItems, replay, retention }`. There is no `eventBus` member because `EventBus` never existed (see banner).
- [x] 1.3 ~~Create skeleton files for the three new services…~~ — struck: `event-bus.ts` was never created (`service/gateway-broadcaster.ts` took the job); `service/replay-orchestrator.ts` and `service/retention-timer.ts` exist but were written whole in later changes, not as skeletons here.

## 2. EventBus

- [x] 2.1–2.3 ~~`EventBus.broadcast` tests and implementation~~ — struck, superseded: `GatewayBroadcaster` (`service/gateway-broadcaster.ts` + `gateway-broadcaster.test.ts`) records via `EventSequencer`, fills the shared `ReplayBuffer`, pushes via `PushClient`, and swallows a failed push. The metric counters named in 2.2 (`broadcast_push_failed_total`, `broadcast_delivered_total`) exist nowhere in the repo (grep, 2026-08-10) — see section 7.

## 3. ReplayOrchestrator

- [x] 3.1 `service/replay-orchestrator.test.ts` exists and covers buffer-first, log fallback, `out_of_range` denial and the max-events refusal — for the shipped response-based design. The push-failure-mid-replay and pushed-in-seq-order cases written here are meaningless under that design (no push happens).
- [x] 3.2 ~~Implement `ReplayOrchestrator.replay(points, ctx)` pushing through `PushClient`~~ — struck: the shipped orchestrator (`service/replay-orchestrator.ts`) returns the events **in the resume response** and never touches `PushClient`; pushing would fan out one client's replay to every socket on the subscription (`resume-and-reconnect` design.md D1). The `denied`/`out_of_range` half shipped as specified.
- [x] 3.3 Covered by the shipped test file.

## 4. RetentionTimer

- [x] 4.1 `service/retention-timer.test.ts` exists, with an injected scheduler as this task asked.
- [x] 4.2 `RetentionTimer` shipped (`service/retention-timer.ts`): started by `boot.ts` after the port binds, `stop()` awaited during shutdown. Constants differ from this task's draft: 10-minute interval and `maxPerSubscription: 1000` (`services.ts`), not 60 s / 10 000.
- [x] 4.3 Covered by the shipped test file.

## 5. Wire `BeServices` into `buildApp`

- [x] 5.1 ~~`AppOptions` gains `services: BeServices`~~ — done differently: `AppOptions` (`app.ts`) grew **required per-service fields** (`auth`, `projects`, `workItems`, `roles`, `directory`, `replay`, …), each with a JSDoc naming why absence must not be representable, rather than one bundle.
- [x] 5.2 `onForward` is the pure ack — `app.ts` (`onForward: () => Promise.resolve({ push_responses: [] })`), ack composed by the internal controller.
- [x] 5.3 `onResume` delegates to the real orchestrator — `app.ts` (`onResume: (points) => opts.replay.replay(points)`); no `ctx` argument exists in the shipped signature.
- [x] 5.4 Done differently: controller tests build their own harnesses (`controller/internal.integration.test.ts` `buildHarness`), and `services.test.ts`/`boot.test.ts` assert the production wiring.
- [x] 5.5 `controller/internal.integration.test.ts` runs the resume routes against a real `ReplayOrchestrator` over an in-memory log, as this task asked; the auth refusals are covered in the same file.
- [x] 5.6 ~~New `forward-pure-ack.integration.test.ts`~~ — struck as a separate file: the case lives in `controller/internal.integration.test.ts` ("records no event and pushes nothing"), asserting the log is untouched.
- [x] 5.7 Subsumed by the repo gate running green on `main` (CI on every push).

## 6. Wire `main.ts` composition

- [x] 6.1 Done differently: composition lives in `buildServices` (`services.ts`) called from `boot.ts`; `main.ts` is a thin entry that installs signal handling. The bundle passed to `buildApp` is the per-service `AppOptions`, not a `services` option.
- [x] 6.2 `boot.ts` starts retention after `listen` succeeds (deliberately after the port binds — see its comment) and logs readiness.
- [x] 6.3 `main.ts` installs `SIGTERM` and `SIGINT` handlers; shutdown awaits `retention.stop()` then closes the DB through the handle `openConnection` returned (`boot.ts`).
- [x] 6.4 Not re-verified during this reconciliation; dev serves this exact composition live (`bin/dev-deploy.sh` source-run), and `boot.test.ts` covers the boot path. `/metrics` never existed — see section 7.

## 7. BE Layer-A metrics

- [x] 7.1–7.3 ~~`BeMetrics`, the four counters, `/metrics` exposition~~ — struck, **never implemented**: there is no `service/metrics.ts`, no `/metrics` route in be-01, and none of `event_log_rows_total`, `resume_replays_total`, `broadcast_delivered_total`, `broadcast_push_failed_total` appear anywhere in the repo (grep, 2026-08-10). If BE metrics are wanted they are their own change; nothing tracks this elsewhere.

## 8. End-to-end validation against gw-01

- [x] 8.1–8.2 ~~`resume-vs-gw.integration.test.ts` push-order and partial-failure proofs~~ — struck: the file does not exist, and the push-based replay it would exercise was never shipped (see 3.2). The shipped resume path is proven at the HTTP boundary in `controller/internal.integration.test.ts`.

## 9. Type, lint, format, validate

- [x] 9.1–9.4 Subsumed by the repo gate (`bunx nx run-many -t test lint typecheck build`) running green on `main` in CI; not re-run for this reconciliation.
- [x] 9.5 `openspec validate --all --json` run green during the 2026-08-10 Lane B reconciliation (62 items, 0 invalid).
