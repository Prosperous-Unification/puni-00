/** Exact coordinator attribution for irreversible dependency semantic admission. */
export interface DependencyActivationReceipt {
  protocol: 'wbs-dependency-activation';
  version: 1;
  activationId: string;
  databaseIdentity: string;
  candidateImage: string;
  rollbackImage: string;
  participantProofSha256: string;
  migrationCaptureSha256: string;
  activatedAt: number;
}

/** Activation persists after the final live relationship is removed. */
export type DependencyActivation =
  { state: 'DISABLED'; receipt: null } | { state: 'ENABLED'; receipt: DependencyActivationReceipt };

const IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEYS = [
  'protocol',
  'version',
  'activationId',
  'databaseIdentity',
  'candidateImage',
  'rollbackImage',
  'participantProofSha256',
  'migrationCaptureSha256',
  'activatedAt',
];

/** Validates exact persisted receipt shape; this does not prove the coordinator's observations. */
export function parseDependencyReceipt(receipt: unknown): DependencyActivationReceipt {
  // Proof: removing each field boundary and the key-set check separately accepted its invalid receipt test (2026-10-22).
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    Array.isArray(receipt) ||
    Object.keys(receipt).length !== KEYS.length ||
    Object.keys(receipt).some((key) => !KEYS.includes(key)) ||
    !('protocol' in receipt) ||
    receipt.protocol !== 'wbs-dependency-activation' ||
    !('version' in receipt) ||
    receipt.version !== 1 ||
    !('activationId' in receipt) ||
    typeof receipt.activationId !== 'string' ||
    receipt.activationId.trim() === '' ||
    !('databaseIdentity' in receipt) ||
    typeof receipt.databaseIdentity !== 'string' ||
    receipt.databaseIdentity.trim() === '' ||
    !('candidateImage' in receipt) ||
    typeof receipt.candidateImage !== 'string' ||
    !IMAGE.test(receipt.candidateImage) ||
    !('rollbackImage' in receipt) ||
    typeof receipt.rollbackImage !== 'string' ||
    !IMAGE.test(receipt.rollbackImage) ||
    !('participantProofSha256' in receipt) ||
    typeof receipt.participantProofSha256 !== 'string' ||
    !SHA256.test(receipt.participantProofSha256) ||
    !('migrationCaptureSha256' in receipt) ||
    typeof receipt.migrationCaptureSha256 !== 'string' ||
    !SHA256.test(receipt.migrationCaptureSha256) ||
    !('activatedAt' in receipt) ||
    typeof receipt.activatedAt !== 'number' ||
    !Number.isSafeInteger(receipt.activatedAt) ||
    receipt.activatedAt < 0
  )
    throw new Error('invalid dependency activation receipt');
  return {
    protocol: receipt.protocol,
    version: receipt.version,
    activationId: receipt.activationId,
    databaseIdentity: receipt.databaseIdentity,
    candidateImage: receipt.candidateImage,
    rollbackImage: receipt.rollbackImage,
    participantProofSha256: receipt.participantProofSha256,
    migrationCaptureSha256: receipt.migrationCaptureSha256,
    activatedAt: receipt.activatedAt,
  };
}
