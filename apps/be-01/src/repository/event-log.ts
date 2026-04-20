import { sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export interface RecordedEvent {
  subscription: string;
  seq: number;
  message: unknown;
  createdAt: number;
}

export interface EventLogRepo {
  recordEvent(subscription: string, message: unknown, createdAt: number): Promise<RecordedEvent>;
  rangeSince(subscription: string, sinceSeq: number): Promise<RecordedEvent[]>;
  oldestSeq(subscription: string): Promise<number | null>;
  pruneBeyond(maxPerSubscription: number): Promise<number>;
}

export class DrizzleEventLogRepo implements EventLogRepo {
  constructor(private readonly db: BunSQLiteDatabase) {}

  async recordEvent(
    subscription: string,
    message: unknown,
    createdAt: number,
  ): Promise<RecordedEvent> {
    const payload = JSON.stringify(message);
    return this.db.transaction(async (tx) => {
      await Promise.resolve();
      tx.run(sql`
        INSERT INTO event_sequencer (subscription, next_seq) VALUES (${subscription}, 0)
        ON CONFLICT(subscription) DO NOTHING
      `);
      const rows = tx.all<{ next_seq: number }>(
        sql`UPDATE event_sequencer
            SET next_seq = next_seq + 1
            WHERE subscription = ${subscription}
            RETURNING next_seq - 1 AS next_seq`,
      );
      const seq = rows[0]?.next_seq ?? 0;
      tx.run(sql`
        INSERT INTO event_log (subscription, seq, message, created_at)
        VALUES (${subscription}, ${seq}, ${payload}, ${createdAt})
      `);
      return { subscription, seq, message, createdAt };
    });
  }

  async rangeSince(subscription: string, sinceSeq: number): Promise<RecordedEvent[]> {
    await Promise.resolve();
    const rows = this.db.all<{
      subscription: string;
      seq: number;
      message: string;
      created_at: number;
    }>(
      sql`SELECT subscription, seq, message, created_at
          FROM event_log
          WHERE subscription = ${subscription} AND seq > ${sinceSeq}
          ORDER BY seq ASC`,
    );
    return rows.map((r) => ({
      subscription: r.subscription,
      seq: r.seq,
      message: JSON.parse(r.message) as unknown,
      createdAt: r.created_at,
    }));
  }

  async oldestSeq(subscription: string): Promise<number | null> {
    await Promise.resolve();
    const rows = this.db.all<{ seq: number }>(
      sql`SELECT seq FROM event_log WHERE subscription = ${subscription} ORDER BY seq ASC LIMIT 1`,
    );
    return rows[0]?.seq ?? null;
  }

  async pruneBeyond(maxPerSubscription: number): Promise<number> {
    await Promise.resolve();
    const before = this.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM event_log`);
    this.db.run(
      sql`DELETE FROM event_log
          WHERE id IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY subscription ORDER BY seq DESC) AS rn
              FROM event_log
            )
            WHERE rn > ${maxPerSubscription}
          )`,
    );
    const after = this.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM event_log`);
    return (before[0]?.n ?? 0) - (after[0]?.n ?? 0);
  }
}
