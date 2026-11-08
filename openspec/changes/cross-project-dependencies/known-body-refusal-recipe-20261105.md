# UC2 known body-refusal correction — one finite recipe

**A standalone owner-core correction and real known-resource control are feasible.** They need no storage enrollment, successful storage/context packet, helper, private constructor or intentional UNKNOWN/HOLD. This is a source/test recipe for a later lease, not execution performed or authorized by this review. Read only committed a0cb2f48c owner and actual complete callers; no mutable Sol fixture/test was read.

## Exact correction

In `assertPreparationCompletion`, preserve the current original body/observer joins, operation original/observer joins, missing-original poisoning and both sticky-UNKNOWN keeper checks. Immediately after those joins/UNKNOWN checks, before the existing success-only conjunction, add a fixed `body.outcome.phase === 'rejected'` branch:

1. Require the same live owner/ownership association, active owner and genuinely bound projection original/observer. Do not await the projection that is making this call.
2. Require `closeRequested`, capsule phase `closed`, every enrolled original `closed`, and no prepared/context object that could still be exposed. If a runtime lock was actually entered, require its `runtimeReleased` flag; absent runtime is valid for an early pre-runtime refusal. Check actual outer/runtime association with the existing shared validator, which already avoids re-observing a released runtime fd.
3. Starting/pending or missing operations are never accepted; the existing joins/recorded terminal outcomes must be established. A rejected operation is retained failure evidence, not an automatic native-close uncertainty; do not require every operation to have fulfilled or failures.length to be zero in this rejection branch.
4. Once cleanup is known, `throw body.outcome.cause` exactly. Do not wrap, stringify, default or return it. The branch never fulfills or grants successful completion. Preserve all retained failures. No deadline renewal occurs; reporting a known failure after completed cleanup must not replace that failure merely because work time expired.

On absent association/incomplete known cleanup, throw a specific completion/refusal-incomplete error; on already-sticky UNKNOWN or missing required original retain the existing keeper behavior. Do not manufacture UNKNOWN merely from an ordinary primary error. Keep all successful fenced/prepared acceptance requirements unchanged. Do not invent a runtime/storage packet to pass a success guard for this refusal path.

Current complete captures actual primary failures into its safe refusal, closes observations, then throws. Its future genuine projection must route both body success and body rejection through this fixed method, after binding the projection immediately. A rejection branch invokes the check and can only reject; it must not bypass it with a catch that blindly rethrows before cleanup or convert the refusal to a successful packet. Actual post-runtime/storage integration and the no-exposable-context condition remain coupled work; this early-refusal control proves neither.

## One concrete known-resource test

Proposed literal title: `UC2 completion preserves the original body refusal after known cleanup` (explicit10000 ms).

Use the ordinary scratch owner fixture and actual canonical owner locks. Create one small existing file and choose one genuinely absent file path. Inside the owner action:

1. Enroll exactly one fenced capsule. Immediately start `body = readFile(absentPath)` and bind that SAME original as composition, before any fallible assertion/acquisition. The body's rejection is the actual filesystem ENOENT object; do not use a fabricated completed/rejected Promise or successful storage packet.
2. Open the existing file with actual openSync and retain that exact descriptor as a known evidence original. Begin one `evidence-inspection` operation, start actual `readFile(existingPath)`, bind that SAME original, and immediately retain a separate fulfillment/rejection observer that records terminality. This separate read is a mechanical operation control, not a claim it borrows the enrolled descriptor.
3. Create the genuine caller projection with `body.then(successRefusal, async originalCause => { save originalCause; await assertPreparationCompletion(preparation); throw unexpectedAcceptance; })`. Here successRefusal throws an unexpected-body-success error. Immediately bind that actual returned projection before requesting close. Retain a separate projection observer that saves the actual rejection object plus a synchronous snapshot of operation terminality and descriptor closure at rejection. Save the original ENOENT object from the body rejection branch, not from a message parser.
4. Call `requestPreparationClose(preparation, 'operation')` while body/operation reactions have not settled; this synchronously revokes work and requests the ordinary deferred cleanup. Do not start new work afterward.
5. Await/observe the projection and its observer while the owner action remains active. Assert the projection rejected with `toBe(savedOriginalCause)`, that the saved original is an actual ENOENT filesystem refusal, that the actual existing-file operation fulfilled with its exact fixture bytes, and that its terminality and closed-descriptor observations were already recorded at projection rejection. Preserve joins of body, operation, projection and all fixture observers in finally even when assertions fail. Never call public close again as fallback.
6. After withDependencyOwner returns, actual edge/deploy contender calls must succeed. Do not claim that this later acquisition observes exact native close order within the earlier wrapper.

Prefer a small explicit local outcome record over throwing assertions inside the projection observer; preserve the captured observation even if a later assertion fails. The fixture observer is additional to the core's retained observer, not a substitute called the same original. The original returned readFile and projection identities are never replaced by async forwarding wrappers.

## Expected RED/GREEN and safety

With current a0cb2f48c code, body/operation settlement drives requested ordinary cleanup to closed, but the success-only conjunction rejects with `dependency preparation completion refused`. The unchanged identity assertion must therefore fail: actual ENOENT original versus generic completion error. Owner finalization then joins the settled originals and releases its real locks. No entered runtime, unbound body, unresolved artificial gate, injected close failure or native uncertainty is needed.

After the fixed rejection branch, the exact same test should reject with the original ENOENT object and pass its already-closed/terminal snapshots. The body and operation may settle in either order; do not assume native I/O remains pending from a same-stack flag. This control demonstrates the retained original refusal at the observed post-join/known-cleanup boundary. It does not independently prove every join is necessary: native work may finish naturally before an omitted join. A later physical omission of only this rejection branch can qualify the narrow original-refusal preservation, but no such mutation is approved/executed here.

No source change or test was run. Actual source freeze and concrete test review precede any lease. The future storage/complete caller use, successful acceptance, rejected body after real runtime transfer, UNKNOWN projection parking, operation-specific join necessity and full resource-order proofs remain pending. This finite early-refusal correction is useful independently and does not rely on producer-P acceptance.
