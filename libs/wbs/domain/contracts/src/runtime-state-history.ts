import { type } from 'arktype';

import { runtimeState2 } from './http/runtime-command-shapes';
import { responseSchema } from './http/schema-shape';
import type { RuntimeScope, RuntimeState } from './runtime-command-values';
import type { RuntimeState1 } from './runtime-history1';
const identity = type('string > 0');
const count = type('0 <= number.integer <= 9007199254740991');
const generation = type('0 < number.integer <= 9007199254740991');
const basis = type(/^rb1:[0-9a-f]{64}$/);
const claim = type({
  claimId: identity,
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution: {
    storeId: identity,
    runId: identity,
    attemptId: identity,
    sessionId: '0 < string <= 256',
  },
});
const liveClaim = type({
  id: identity,
  workItemId: identity,
  stepId: identity.or('null'),
  personId: identity,
  runId: identity.or('null'),
  parentClaimId: identity.or('null'),
  accountId: identity,
});
// Proof: dash-frozen-state1-full-grammar: replacing the full frozen state1 grammar with a version-only grammar.
// 'retained state1 validates full original ledger' failed; exact restoration passed.
// 'retained state1 validates full original basis' failed; exact restoration passed.
// 'retained state1 validates full original person' failed; exact restoration passed.
// 'retained state1 validates full original work id' failed; exact restoration passed.
// 'retained state1 validates full original work parent' failed; exact restoration passed.
// 'retained state1 validates full original work revision' failed; exact restoration passed.
// 'retained state1 validates full original external refs' failed; exact restoration passed.
// 'retained state1 validates full original step id' failed; exact restoration passed.
// 'retained state1 validates full original step code' failed; exact restoration passed.
// 'retained state1 validates full original step position' failed; exact restoration passed.
// 'retained state1 validates full original authority owner' failed; exact restoration passed.
// 'retained state1 validates full original authority generation' failed; exact restoration passed.
// 'retained state1 validates full original claim identity' failed; exact restoration passed.
// 'retained state1 validates full original claim account' failed; exact restoration passed.
// 'retained state1 validates full original runtime binding' failed; exact restoration passed.
// 'recovery retained state1 rejects invalid revision before raw pair publication' failed; exact restoration passed.
// 'embedded retained state1 rejects invalid revision before later artifact verification' failed; exact restoration passed.
// One grammar fault with17 named observations, not17 independent guards.
// Proof: dash-retained-unknown-state3: admitting unsupported3 through the legacy state grammar.
// 'Dash retained state refuses unknown version 3' failed; exact restoration passed.
const runtimeState1 = type({
  schemaVersion: '1',
  ledgerId: identity,
  scope: type({
    organizationId: identity,
    projectId: identity,
    personId: identity,
    'workPackageId?': 'never',
  }),
  basis,
  facts: {
    projectRevision: count,
    'workPackageRevision?': 'never',
    workItems: type({
      id: identity,
      parentId: identity.or('null'),
      revision: count,
      externalRefs: type({
        id: identity,
        systemId: identity,
        url: 'string',
        name: 'string',
      }).array(),
    }).array(),
    steps: type({ id: identity, code: 'string | null', position: 'number' }).array(),
  },
  authority: type({ kind: '"uninitialized"' }).or({
    kind: '"held"',
    ownerId: identity,
    generation,
  }),
  claims: type({ kind: '"ordinary"', claim: liveClaim })
    .or({ kind: '"runtime"', claim: liveClaim, binding: claim })
    .array(),
});
/** Raw evidence stays in its original generation; it is never a current writable observation. */
export type RetainedRuntimeState = RuntimeState1 | RuntimeState;
/** Full retained state grammar preserves public additions while refusing competing owner/revision spellings. Live HTTP remains state2-only. */
export const retainedRuntimeState = runtimeState1
  .or(
    // Proof: dash-retained-state2-competing-spellings: omitting the grouped competing owner/revision spelling exclusions.
    // 'Dash retained state2 rejects competing owner spelling' failed; exact restoration passed.
    // 'Dash retained state2 rejects competing revision spelling' failed; exact restoration passed.
    // One grouped spelling exclusion with two observations.
    runtimeState2.and(
      type({ scope: { 'projectId?': 'never' }, facts: { 'projectRevision?': 'never' } }),
    ),
  )
  .onDeepUndeclaredKey('ignore');
/** Async public artifact boundary shares exactly the synchronous embedded-evidence grammar. */
export const retainedRuntimeStateSchema = responseSchema(retainedRuntimeState);
/** Projects only a validated retained address without changing the raw wire evidence or establishing authority. */
export function readRuntimeStateScope(state: RetainedRuntimeState): RuntimeScope {
  return state.schemaVersion === 2
    ? // Proof: dash-retained-state2-scope-projection: projecting a different current owner from validated state2.
      // 'Dash recovery state2 keeps original raw body through embedded decoding' failed; exact restoration passed.
      // Valid recovery-pair consistency refusal at fault-era recovery-evidence.ts153; no admission bypass.
      { ...state.scope }
    : {
        organizationId: state.scope.organizationId,
        // Proof: dash-retained-state1-scope-projection: projecting a different current owner from validated state1.
        // 'Dash retained state1 preserves raw full fields and additive values' failed; exact restoration passed.
        // First current-view owner equality after two healthy raw-state assertions.
        workPackageId: state.scope.projectId,
        personId: state.scope.personId,
      };
}
/** Unversioned semantic observation; callers must retain raw evidence separately and never persist this view as its original body. */
export function readRuntimeStateView(
  state: RetainedRuntimeState,
): Omit<RuntimeState, 'schemaVersion'> {
  if (state.schemaVersion === 2) {
    const { schemaVersion: _version, ...view } = state;
    // Proof: dash-state2-view-envelope: returning the wire tag in the unversioned state view.
    // 'Dash retained state2 preserves raw full fields and additive values' failed; exact restoration passed.
    return structuredClone(view);
  }
  const { projectRevision, ...facts } = state.facts;
  return structuredClone({
    ledgerId: state.ledgerId,
    scope: readRuntimeStateScope(state),
    basis: state.basis,
    // Proof: dash-state1-view-revision: incrementing the projected captured revision.
    // 'Dash retained state1 preserves raw full fields and additive values' failed; exact restoration passed.
    facts: { ...facts, workPackageRevision: projectRevision },
    authority: state.authority,
    claims: state.claims,
  });
}
