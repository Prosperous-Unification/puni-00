import type { Database } from 'bun:sqlite';

/** One exclusive delivery attempt. The random token fences acknowledgement after lease recovery. */
export interface RequestNotificationLease {
  submissionId: string;
  token: string;
  attempts: number;
}

/**
 * Claims one due obligation for sixty seconds in a single atomic SQLite write. A crashed
 * worker loses only its lease, never the obligation. Callers open a verified, existing database
 * with {@link openMaintenanceDatabase}; no request content is read or copied here.
 */
export function claimRequestNotification(
  database: Database,
  now: number,
): RequestNotificationLease | null {
  const token = crypto.randomUUID();
  // Proof: bypassing either due-time or delivered-state selection failed the restart/lease test.
  const claimed = database
    .query<{ submission_id: string; attempts: number }, [number, string, number]>(
      `UPDATE request_notification SET attempts = attempts + 1, available_at = ?, lease_token = ?
       WHERE submission_id = (SELECT submission_id FROM request_notification
         WHERE delivered_at IS NULL AND available_at <= ? ORDER BY available_at, submission_id LIMIT 1)
       RETURNING submission_id, attempts`,
    )
    .get(now + 60_000, token, now);
  return claimed
    ? { submissionId: claimed.submission_id, token, attempts: claimed.attempts }
    : null;
}

/**
 * Records provider acceptance, or schedules another attempt after 1, 2, 4… minutes capped at
 * one hour. Retrying never exhausts the obligation. Erasure can cancel a leased obligation;
 * every other missing/expired/replaced lease throws instead of acknowledging another worker.
 */
export function finishRequestNotification(
  database: Database,
  lease: RequestNotificationLease,
  delivery: 'accepted' | 'failed',
  now: number,
): 'recorded' | 'cancelled' {
  // Proof: replacing the retry delay with one millisecond failed the capped-exponential-retry test.
  const retryDelay = Math.min(3_600_000, 60_000 * 2 ** Math.min(lease.attempts - 1, 6));
  // Proof: separately removing the token and expiry predicates failed stale-acknowledgement tests.
  const write = database
    .query(
      `UPDATE request_notification SET delivered_at = ?, available_at = ?, lease_token = NULL
       WHERE submission_id = ? AND lease_token = ? AND available_at > ? AND delivered_at IS NULL`,
    )
    .run(
      delivery === 'accepted' ? now : null,
      delivery === 'accepted' ? now : now + retryDelay,
      lease.submissionId,
      lease.token,
      now,
    );
  // Proof: unconditional acknowledgement failed the replaced-lease test instead of throwing.
  if (write.changes === 1) return 'recorded';
  const remaining = database
    .query<{ submission_id: string }, [string]>(
      'SELECT submission_id FROM request_notification WHERE submission_id = ?',
    )
    .get(lease.submissionId);
  // Proof: removing this cancellation branch failed erasure during a leased send.
  if (remaining === null) return 'cancelled';
  throw new Error('Request notification lease expired or was replaced');
}
