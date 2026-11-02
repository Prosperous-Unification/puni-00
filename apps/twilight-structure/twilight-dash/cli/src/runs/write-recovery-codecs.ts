import { type } from '@shared/validation';

import { intentCodec } from './runtime-codecs';
import {
  AttemptIdCodec,
  ExecutionCommandIdCodec,
  Integer,
  OwnerIdCodec,
  Positive,
  RunIdCodec,
} from './value-codecs';
const closed = { '+': 'reject' } as const;
// Proof: C02 opening this owned target admitted an unknown field in actual provider beginRecovery. Exact restoration passed.
export const WriteRecoveryTargetCodec = type({
  ...closed,
  kind: "'write'",
  original: intentCodec,
  runId: RunIdCodec,
  attemptId: AttemptIdCodec,
  stageCommandId: ExecutionCommandIdCodec,
  acceptanceCommandId: ExecutionCommandIdCodec,
});
// Proof: C01 widening this new version admitted a future-version intent in actual provider beginRecovery. Exact restoration passed.
export const WriteRecoveryIntentCodec = type({
  ...closed,
  version: '2',
  recoveryId: 'string>=1',
  target: WriteRecoveryTargetCodec,
  begunScopeRevision: Integer,
  resolver: { ...closed, ownerId: OwnerIdCodec, epoch: Positive },
});
