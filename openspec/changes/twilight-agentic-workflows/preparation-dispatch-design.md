# Durable session preparation dispatch

## Intent

The merged foundation retains preparation and session observations but no production host
connects them to `ActivityExecutor.open`. Add that connection without losing the crash
boundary between intent, external session creation and locator persistence. This is the
first dispatch slice toward S0/S7a, not a replacement for their full acceptance scope.

Only a newly committed preparation intent authorizes one open invocation. Exact replay is
historical evidence, never permission to create another session. Unsupported recovery leaves
the original attempt and capacity reservation pending. No WBS transport, claim, turn,
provider construction, credentials, CTT, scheduler, new storage format or activation changes.

## Contract

Add `runs/prepare-activity.ts`, consuming the existing RunStore/ArtifactStore and an injected
ActivityExecutor. Export `prepareActivity(runs, artifacts, executor, guard, input, signal)`.
`input` contains `preparation: PreparationInput` and `openedCommandId: ExecutionCommandId`.
The store interface is a Pick of only the existing methods actually used; no SQL escapes.

The returned union is:

- `prepared`: original opaque ActivitySession and the committed prepared Attempt.
- `pending`: retained Attempt and reason `preparation_already_recorded`,
  `cancelled_before_dispatch` or `executor_unresolved`; no live session is exposed.
- `refused`: the existing StoreRefusal before an external session was created.

`PreparationDispatchError` carries a detached Preparation and optional known ExecutorLocator
(`null` until one was returned), plus the original standard cause. Its fixed message must
not include prompt content or credentials. Exceptions after dispatch, including failed
locator persistence, throw this correlated error. They never turn into success, interruption
or quiescence. Pre-dispatch trusted-state failures propagate unchanged.

## Sequence and authority

The pending Attempt is the original preparation acknowledgement, not a promise that its
checkpoint is current after later transitions. Current inspection uses verified history.

1. Detach guard and all serializable input before the first await. Validate command identity
   before opening and require openedCommandId to differ from preparation.commandId: both
   share the store-wide execution-command namespace. Preserve the AbortSignal and adapter's
   live object identity.
2. Compare actual injected executor kind/version with the requested pin before retaining
   preparation; the existing verified `recordPreparation` checks accepted binding, artifacts
   and target. A wrong adapter throws without intent or external calls.
3. Invoke `recordPreparation`. A refusal returns unchanged. A duplicate returns pending and
   invokes no executor methods, even if the adapter has a local exact-open cache. Only
   `applied` elects this caller to open. The accepted attempt must carry the preparing
   checkpoint; use its retained Preparation, not mutable submitted input.
4. Honor cancellation before dispatch. Revalidate live local ownership through the existing
   `renewOwnership` immediately before open. Check cancellation again after that await.
   Refusal prevents open. This check does not fence
   external work against a later takeover or turn intent into execution authority.
5. Call open once. `not_started` and `unresolved` remain pending with the preparing checkpoint
   and capacity held. Check an unresolved reply's preparation correspondence. A thrown open
   retains preparing and throws PreparationDispatchError; retries cannot blindly reopen.
6. For opened, snapshot/validate its complete locator and use the existing provider's
   session_prepared correspondence checks. Persist the locator with the original preparation
   owner and the supplied openedCommandId. Use exact post-preparation expected revisions,
   not automatically refreshed revisions that could bless intervening changes. After any
   refusal/throw, expose no usable live session; throw correlated error with known locator.
7. Return the original opaque session only after successful locator persistence. Preserve
   portable locator snapshot separately from that live object. No automatic close or cancel:
   cleanup acknowledgements cannot establish physical quiescence.

The same-ID duplicate election and different-ID attempt-state conflict are provided by the
existing atomic RunStore transition. A second coordinator cannot obtain permission to open
from old history. A later recovery phase must use supported lookup/resume and explicit
current-owner reattachment before turns. API-model currently supports no durable recovery.

## Evidence

Exercise the production helper with real semantic memory and SQLite stores and accepted
binding/state fixtures. Deferred adapter calls make intent-before-open and
locator-before-return observable. Prove concurrent same/different commands, changed input,
missing/corrupt evidence, mismatched adapter/locator, cancellation, owner takeover before
and during open, persistence refusal/throw, and unsupported restart recovery. A SQLite
close/reopen proves committed intent survives host replacement; do not call that a
power-loss or physical-worker proof. New checks require isolated production-path removal
or dependency-fault negatives and adjacent truthful Proof comments. Existing guards and
migration bytes remain intact. No live model calls or credential reads.
