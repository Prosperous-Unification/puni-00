import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const examples = sqliteTable('examples', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type ExampleRow = typeof examples.$inferSelect;

/**
 * `passwordHash` holds an argon2id digest from `Bun.password`, never a
 * password. `username` is unique at the database level rather than only in the
 * service: two concurrent registrations of the same name both pass a
 * check-then-insert, and only a constraint stops the second one.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_username').on(t.username)],
);

export type UserRow = typeof users.$inferSelect;

export const eventSequencer = sqliteTable('event_sequencer', {
  subscription: text('subscription').primaryKey(),
  nextSeq: integer('next_seq').notNull().default(0),
});

export const eventLog = sqliteTable(
  'event_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subscription: text('subscription').notNull(),
    seq: integer('seq').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('event_log_sub_seq').on(t.subscription, t.seq)],
);

export type EventLogRow = typeof eventLog.$inferSelect;
