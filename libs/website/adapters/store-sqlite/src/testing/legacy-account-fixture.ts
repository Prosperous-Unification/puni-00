import { Database } from 'bun:sqlite';

/** One `provider_call` row as the retired account chat left it; `settledMicroUsd` null is unsettled. */
export interface LegacyProviderCall {
  utcDay: string;
  reservedMicroUsd: number;
  settledMicroUsd: number | null;
}

/**
 * Seeds the account rows that prospect sign-in (retired by ADR 0039) wrote and a deployed
 * database may still hold, now that no store method writes them. Opens and closes its own
 * connection, so the store under test must already have applied the migrations.
 */
export function seedLegacyAccount(
  databasePath: string,
  calls: LegacyProviderCall[] = [],
  createdAt = 0,
): string {
  const database = new Database(databasePath);
  try {
    database.run('PRAGMA foreign_keys = ON');
    const accountId = crypto.randomUUID();
    database.transaction(() => {
      database
        .query('INSERT INTO prospect_account (id, email, created_at) VALUES (?, ?, ?)')
        .run(accountId, `${accountId}@example.test`, createdAt);
      for (const call of calls)
        database
          .query(
            'INSERT INTO provider_call (id, account_id, utc_day, reserved_micro_usd, settled_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            crypto.randomUUID(),
            accountId,
            call.utcDay,
            call.reservedMicroUsd,
            call.settledMicroUsd,
            createdAt,
          );
    })();
    return accountId;
  } finally {
    database.close();
  }
}

/** The text and lineage of one seeded legacy `software_request`. */
export interface LegacyRequest {
  draftId?: string;
  description?: string;
  brief?: string;
  createdAt: number;
}

/**
 * Seeds one account and one unsubmitted `software_request` without a retention subject; the next
 * `WebsiteStore` open backfills its subject.
 */
export function seedLegacyRequest(
  databasePath: string,
  request: LegacyRequest,
): { accountId: string; requestId: string } {
  const accountId = seedLegacyAccount(databasePath, [], request.createdAt);
  const requestId = crypto.randomUUID();
  const database = new Database(databasePath);
  try {
    database.run('PRAGMA foreign_keys = ON');
    database
      .query(
        'INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        requestId,
        accountId,
        request.draftId ?? null,
        request.description ?? '',
        request.brief ?? '',
        request.createdAt,
      );
    return { accountId, requestId };
  } finally {
    database.close();
  }
}
