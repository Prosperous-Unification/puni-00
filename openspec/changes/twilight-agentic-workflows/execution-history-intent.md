# Durable execution history intent

## Problem

RunStore retains admission and thin claim/launch facts, but the prepared executor's complete
identity, exact scoped claim acceptance and immutable turn requests/replies are not composed
in one restart-readable history. Current continuation can lose the session identity, and
claim-first fixtures do not enforce preparation before claiming.

## Outcome

Retain preparation, complete locator, exact claim stage/acceptance and turn intent/observation
through the existing attempt history. Couple claim scope and attempt changes atomically in
memory and SQLite. Verify retained manifest, WBS target and receipt artifacts through their
existing owners. Preserve original replies, local-owner provenance, uncertainty and capacity
through continuation and takeover. Version the changed portable records and adapter format.

## Non-goals

No dispatcher, executor calls, WBS transport, provider construction, credentials, limits policy,
CTT adoption, topology discovery, exact outcome/write/release protocol, live spend, deployment
or production activation. This does not complete parent6a.5 or S0/S7a acceptance.

## Constraints

Bun/Nx only, including edit scripts, evidence capture and fault orchestration. Preserve the
accepted authority and binding contracts, original migration bytes and unchanged portable
records. Use one attempt state/revision and the existing scope pending slot. Never infer
current execution permission from static acceptance, old acknowledgements or a stored locator.
Every changed safety check needs an observed production-path negative and truthful Proof.
Both providers and existing affected invariants must agree; no legacy execution bypass.

The [design](execution-history-design.md), [delta requirements](specs/twilight/run-coordination/spec.md),
[ordered tasks](execution-history-tasks.md) and [verification record](verify.md) carry this phase.
