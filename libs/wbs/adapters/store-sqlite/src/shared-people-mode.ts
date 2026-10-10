import type { CapacityMode } from '@wbs/domain';
import { eq } from 'drizzle-orm';

import type { Drizzle } from './db';
import { organization } from './schema';

/** Decodes SQLite's constrained integer without coercing malformed trusted rows. */
export function decodeSharedPeople(value: unknown): 0 | 1 {
  // Proof: bypassing the decoder makes the corrupt-row production read test fail.
  if (value !== 0 && value !== 1) throw new Error('invalid stored shared_people');
  return value;
}

/** Reads one organization's encoding; absence is a broken trusted reference, not isolated mode. */
export function readCapacityMode(
  db: Pick<Drizzle, 'select'>,
  organizationId: string,
): CapacityMode {
  const row = db
    .select({ mode: organization.sharedPeople })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .get();
  // Proof: removing this refusal loses the named missing-organization error in the strict-read test.
  if (row === undefined) throw new Error(`organization ${organizationId} is missing`);
  return decodeSharedPeople(row.mode) === 0 ? 'isolated' : 'shared';
}
