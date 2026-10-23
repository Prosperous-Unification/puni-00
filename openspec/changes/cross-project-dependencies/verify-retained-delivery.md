# Awaitable retained delivery prerequisite (2026-10-23)

Base: `018427f8e`. Packet branch: `retained-delivery`, isolated worktree
`/tmp/puni-awaitable-delivery`. No backend, SCIM, frontend, import or domain code
changes. This packet prepares application transport only. Task 10.1 stays open:
there is no retained-session authority inspection, activation, semantic
advertisement, client claim or authoring enablement.

## Contract and proof boundaries

Every application producer uses `Promise<DeliveryOutcome>` through the same
per-connection `SocketDelivery`. Production supplies the existing synchronous
`socketWriter` as its required writer. Bun positive sends count as `sent`, `-1`
as accepted `backpressured`, and `0`/throw as a physical drop and retirement.
Internal push counts accepted outcomes after waiting for every recipient; this
is transport acceptance, not a browser receipt. The application queue allows
64 pending frames and a five-second budget including queue time. Existing native
Bun buffering is separate and not retried here.

Tests inject deferred writers at the required service boundary, not through an
optional buildApp test hook. The asynchronous push integration mounts the real
internal controller over localhost HTTP, combining a rejecting `SocketDelivery`
with a healthy recipient. Replay/presence integrations exercise their production
controllers/services. Existing real-WebSocket fanout/composition/lifetime tests
cover application wiring to the terminal physical socket writer. These layers do
not claim to inject delayed authority into buildApp or prove semantic fencing.
A signal-ignoring writer may outlive cancellation settlement; production's
terminal socket writer is synchronous, and cooperative asynchronous adapters must
check their cancellation before any physical write.

## TDD and independently watched R5 faults

The first controller run observed premature push completion, replay seq2/ack
before blocked seq1, and detached presence rejection: 0 passed, 3 failed.
After restoring awaited delivery, the focused four-file control passed 59 tests.
A separate lease-revocation red observed 7 passed, 1 failed plus its detached
rejection; awaiting/reporting its callback restored 8 passed, 0 failed.

Every fault below was injected independently into the production consuming path,
ran with `bun test --timeout 200 <focused-file>`, exited 1 with the named test
failure, and was restored. Fault receipts were captured under
`/tmp/retained-delivery-fault-*.log`; adjacent `Proof:` comments identify them.

| Injected fault                                     | Observed negative                                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start a writer without waiting for its predecessor | `orders producers and counts Bun backpressure as accepted without retry` writes ack before replay                                                        |
| Remove pending-capacity retirement                 | `overflow retires once and cancels every queued write` waits for expiry instead of immediate overflow                                                    |
| Replace configured deadline with 5000ms            | `bounds a signal-ignoring writer by deadline and never starts its queued successor` exceeds the independent 200ms test budget                            |
| Remove the parent cancellation signal              | `connection cancellation settles a stalled delivery and blocks later writes` exceeds its independent 25ms observation; stalled successor test also fails |
| Ignore an already-aborted connection               | `an already closed connection starts no physical writer` starts a forbidden writer                                                                       |
| Remove the retired-send shortcut                   | `an already closed connection starts no physical writer` spuriously retires an already-closed queue while bulk calls are settling                        |
| Remove the post-queue cancellation check           | `bounds a signal-ignoring writer by deadline and never starts its queued successor` starts its forbidden successor                                       |
| Report cancellation again as a new failure         | Overflow/cancellation tests observe duplicate failure retirement                                                                                         |
| Return acceptance after writer rejection           | `writer rejection and physical drop retire without false acceptance or detached rejection` observes false acceptance                                     |
| Discard the original rejected-writer error         | The same test loses the original transport failure                                                                                                       |
| Ignore the physical dropped outcome                | The same test observes dropped instead of retired                                                                                                        |
| Remove finite positive configuration validation    | `invalid queue limits cannot disable delivery bounds` accepts invalid capacity/deadline                                                                  |
| Count push recipients instead of accepted outcomes | `push awaits asynchronous recipient outcome and never counts a failed send` reports two instead of one                                                   |
| Remove replay-event await                          | `delayed replay reaches its recipient before later replay and resume acknowledgement` writes seq2/ack before seq1                                        |
| Continue replay after retirement                   | `a retired replay stops before any later event or acknowledgement` attempts seq2 and ack                                                                 |
| Detach the presence aggregate promise              | `presence exposes asynchronous delivery failure while reaching healthy recipients` loses the surfaced rejection                                          |
| Omit lease callback rejection reporting            | `reports a rejected asynchronous revocation and retires its lease` sees no report, a retained timer and detached error (the TDD red)                     |

## Verification receipts

- `bun test apps/wbs/gw-01/src/delivery.integration.test.ts apps/wbs/gw-01/src/service/delivery.test.ts apps/wbs/gw-01/src/service/presence.test.ts apps/wbs/gw-01/src/controller/ws.controller.test.ts`: initial restored control, 59 passed, 0 failed. Additional retirement/closed/limit cases were added afterward; final configured test is recorded below when available.
- `bun test apps/wbs/gw-01/src/fan-out.integration.test.ts apps/wbs/gw-01/src/composition.integration.test.ts apps/wbs/gw-01/src/presence-race.integration.test.ts apps/wbs/gw-01/src/controller/ws-cancellation.test.ts apps/wbs/gw-01/src/service/connection-access.test.ts`: 21 passed, 0 failed before adding the lease-rejection case; real sockets and application lifecycle controls.
- `bun test apps/wbs/gw-01/src/service/connection-access.test.ts`: final lease control, 8 passed, 0 failed.
- `bunx tsc --build --force apps/wbs/gw-01/tsconfig.json`: exit 0 after strict awaitable test-sink migration and lease-rejection handling.
- Focused ESLint fixes/check: no code diagnostics after fixes; its module-boundary rule reported no cached ProjectGraph and was explicitly skipped. This is not configured Nx lint acceptance.
- `bunx openspec validate cross-project-dependencies --json`: exit 0, one passed change, 18 existing warnings.
- `bunx openspec validate cross-project-dependencies --strict --json`: exit 1, solely those 18 existing requirement-length warnings. Repeating strict validation with the base revision's changed spec restored temporarily produced an identical issue array. This packet adds no warning; unrelated requirement prose was preserved.

- Final focused control: `bun test` over delivery integration, delivery, presence, WS controller, fan-out, composition, presence-race, WS cancellation and connection-access suites: **84 passed, 0 failed, 3267 assertions across nine files**, exit 0.
- Final changed-file Prettier and `git diff --check` passed with exit 0 before this packet commit; normal hooks run without bypass. The coordinator explicitly requested this focused-verified commit before configured Nx acceptance to free the lane for independent Astra High review.

Configured gateway Nx test/lint/typecheck/build, independent review and the integrated isolated host gate remain pending. Broad Nx
checks are deliberately staggered behind the coordinator's active frontend
diagnostic. No full host gate or production/runtime semantic readiness is claimed.

## Astra review correction: synchronous pre-write expiry

Review of `732c7e79baa1a931ce08045a7acfc44772570c34` identified that the timer
and the post-operation clock check bounded settlement but could still allow an
expired queued frame to reach the physical writer when the event loop delayed
the timer callback. The queue now captures its absolute enqueue expiry and checks
the injected monotonic clock after awaiting its predecessor, immediately before
invoking the writer. The existing cancellation check remains in place.

The deterministic regression `withheld deadline callbacks never allow an expired
queued frame to reach its writer` withholds timer callbacks and advances the
clock to the exact five-millisecond expiry and beyond it to 25ms while delivery
awaits its predecessor. Both cases require `retired`, one deadline retirement and
zero writer calls. Before the correction, the real delivery service returned
`retired` but had already called the writer once: 7 passed, 1 failed. After the
correction: 8 passed, 0 failed, 40 assertions. Removing only the new pre-write
clock guard independently reproduced that same zero-versus-one writer failure
(exit 1); the guard was restored. Its adjacent `Proof:` records this negative.

A signal-ignoring asynchronous adapter remains responsible for cancellation
before its own later side effects. This check synchronously fences entry to the
production writer, which remains synchronous; it introduces no authority checks,
activation or retained-session semantic claim. Broad configured Nx acceptance
and integrated host gate remain deferred to the coordinator's serialized lane.

Correction control: the same nine-file focused gateway command recorded above
passed **85 tests, 0 failures, 3273 assertions**, exit 0. Fresh
`bunx tsc --build --force apps/wbs/gw-01/tsconfig.json` also exited 0. Normal
commit hooks and changed-file formatting are required for the correction commit;
configured Nx targets remain pending rather than inferred from these checks.
