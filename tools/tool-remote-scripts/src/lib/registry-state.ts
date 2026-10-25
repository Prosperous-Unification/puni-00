import { parseRegistryHistory, type RegistryHistory } from '@tools/registry-publication';
import { type } from 'arktype';

const Reference = type({
  repository: 'string > 0',
  digest: /^sha256:[0-9a-f]{64}$/,
  '+': 'reject',
});
const Operation = type({
  operationId: 'string > 0',
  sha: 'string > 0',
  current: type('string[]').or('null'),
  images: { be: 'string > 0', gw: 'string > 0', fe: 'string > 0', '+': 'reject' },
  references: Reference.array().atLeastLength(1),
  phase: "'protected'|'promoted'",
  '+': 'reject',
});
const State = type({
  schemaVersion: '1',
  history: { source: 'string > 0' },
  operation: Operation.or('null'),
  '+': 'reject',
});
export interface ComposeRegistryState {
  schemaVersion: 1;
  history: RegistryHistory;
  operation: typeof Operation.infer | null;
}
/** Versioned ownership inside the existing backend state file; old marker/color semantics remain unchanged. */
export function parseComposeRegistry(input: unknown, source?: string): ComposeRegistryState {
  const state = State(input);
  if (state instanceof type.errors) throw new Error('Malformed Compose registry ownership');
  const history = parseRegistryHistory(state.history, source ?? state.history.source);
  if (
    state.operation?.phase === 'promoted' &&
    history.promotion?.operationId !== state.operation.operationId
  )
    throw new Error('Compose promotion differs from owner history');
  return { ...state, history };
}
