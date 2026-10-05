import { createHash } from 'node:crypto';

import type { Elsewhere } from '@wbs/domain';
import {
  canonicalElsewhere,
  canonicalScheduleInput,
  type ScheduleInput,
} from '@wbs/domain/canonical-schedule-input';

/**
 * Returns the SQLite cache address for one exact scheduler input.
 *
 * The domain owns the canonical bytes. This repository adapter owns SHA-256
 * because the digest is a storage key beside `contractVersion` and `budgetMs`.
 */
export function scheduleInputHash(input: ScheduleInput): string {
  return createHash('sha256').update(canonicalScheduleInput(input), 'utf8').digest('hex');
}

/** Hashes exactly the incoming bookings that can displace one target. */
export function incomingCalendarHash(elsewhere: Elsewhere | undefined): string {
  return createHash('sha256').update(canonicalElsewhere(elsewhere), 'utf8').digest('hex');
}
