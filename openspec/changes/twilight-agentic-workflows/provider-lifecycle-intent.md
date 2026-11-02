# Provider lifecycle intent

Problem: provider bundles and fixtures expose close(): void, while the installed Bun SQL driver returns a Promise. Callers cannot await release. SQLite closes physically before marking the bundle closed; native failure therefore leaves it open and retryable.

Outcome: give existing provider bundles/factories close(): Promise<void>, outside RunStore and ArtifactStore. Calling close immediately fences new calls and operations waiting for their transaction turn. An operation already past the existing close check may finish, including its bounded busy retries. Closing drains previously accepted queue turns, then releases resources before fulfilling. Repeated calls share one completion and failure outcome. Disposal failure leaves ports fenced, rejects with its original cause, and cannot count as successful fixture deletion or permission to retry disposal.

This deliberately changes SQLite from immediate physical close to drain-before-close and from retryable native failure to sticky fenced failure. Memory retains synchronous publication and its immediate fence, returning resolved completion.

Non-goals: choosing/adding an engine/provider; changing semantic port methods, record/schema/migration versions, eager open/bootstrap/provider validation; authentication, credentials, limits, compute, activation, heartbeat, business outcomes, CTT, transfer or production. No planner, history, SQL integrity, owner or per-operation close guard is moved, removed or rewritten.

Constraints: signatures, adapters, shared contracts and cleanup callers form one coupled compiling unit. Await completion before reopening, fixture storage removal or graceful worker disconnect. Preserve existing all-22-method retained-connection and real SQLite contention/snapshot negatives; add queued-before-close, in-flight drain, failed-disposal and cleanup ordering proofs. Raw bun:sqlite Database.close stays synchronous; ActivityExecutor.close stays unchanged. Record actual mutation failures and restored passes before adding Proof comments. This is a provider-neutral S0 prerequisite, not second-provider conformance or portability.
