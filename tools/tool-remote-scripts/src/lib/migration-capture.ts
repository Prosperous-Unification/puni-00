import { z } from 'zod';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const applied = z.object({ name: z.string().min(1), hash });
const pending = applied.extend({ downHash: hash });
const capture = z.object({
  format: z.literal('applied-migration-set'),
  version: z.literal(1),
  target: z.string().min(1),
  attempt: z.string().min(1),
  candidate: z.string().min(1),
  applied: z.array(applied),
  pending: z.array(pending),
});

export type MigrationSetCapture = z.infer<typeof capture>;
export type MigrationSetIdentity = Pick<MigrationSetCapture, 'target' | 'attempt' | 'candidate'>;

/** The swap's transport-boundary view of the backend's versioned capture. */
export function parseMigrationSetCapture(
  raw: unknown,
  identity: MigrationSetIdentity,
): MigrationSetCapture {
  // Proof: bypassing schema parsing made the production swap status-capture test
  // accept legacy format and run the forward migration.
  const parsed = capture.parse(raw);
  // Proof: removing identity comparison made the same test accept another attempt.
  if (
    parsed.target !== identity.target ||
    parsed.attempt !== identity.attempt ||
    parsed.candidate !== identity.candidate
  ) {
    throw new Error('migration capture belongs to another target, attempt or candidate');
  }
  const names = [...parsed.applied, ...parsed.pending].map((entry) => entry.name);
  // Proof: removing uniqueness made the same test accept a name in baseline and pending.
  if (new Set(names).size !== names.length)
    throw new Error('migration capture has duplicate names');
  const pendingNames = parsed.pending.map((entry) => entry.name);
  // Proof: removing this order check made the same test accept reversed pending scripts.
  if (pendingNames.some((name, index) => index > 0 && name < pendingNames[index - 1])) {
    throw new Error('migration capture pending order differs from forward order');
  }
  return parsed;
}
