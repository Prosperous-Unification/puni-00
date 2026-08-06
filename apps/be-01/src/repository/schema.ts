import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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

/**
 * One work breakdown structure and the scope of everything below it.
 *
 * `restricted` gates writes only: every authenticated account may read every
 * project, and only the owner may edit a restricted one. `ownerId` is the
 * account that created it and never changes, so a restricted project whose
 * owner is gone can be read by all and edited by none.
 */
export const project = sqliteTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  restricted: integer('restricted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export type ProjectRow = typeof project.$inferSelect;

/**
 * One unit of work, placed in a tree by `parentId` and among its siblings by
 * `position`.
 *
 * `position` is spaced in gaps of ten so an insertion writes one row instead of
 * renumbering the group; when a gap runs out the group is renumbered inside the
 * same transaction. It is an input, never displayed — the number the user sees
 * is derived from it on read.
 *
 * `frozenNumber` is the entire freeze mechanism. Null means the number is
 * derived; set means it was written down by a freeze because it had left the
 * tool, and it is then reported verbatim regardless of position. A row with it
 * set refuses to move until unfrozen.
 *
 * `id` is immutable for the life of the row. Dependencies between work items
 * will address it, and numbers are repadded and re-derived too often to be an
 * identity.
 */
export const workItem = sqliteTable(
  'work_item',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    parentId: text('parent_id').references((): AnySQLiteColumn => workItem.id),
    position: integer('position').notNull(),
    name: text('name').notNull().default(''),
    notes: text('notes').notNull().default(''),
    frozenNumber: text('frozen_number'),
  },
  (t) => [index('work_item_siblings').on(t.projectId, t.parentId, t.position)],
);

export type WorkItemRow = typeof workItem.$inferSelect;

/** A kind of work a project estimates separately. Every project starts with `Dev` and `QA`. */
export const role = sqliteTable(
  'role',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('role_project_name').on(t.projectId, t.name)],
);

export type RoleRow = typeof role.$inferSelect;

/**
 * Three durations in days for one work item and one role.
 *
 * Its own table rather than columns on `work_item` because a project chooses
 * how many roles it estimates: columns would cap that number and make adding
 * `Design` a migration.
 *
 * Rows exist only for leaves. A work item with children reports the sums of its
 * descendants, computed on read and never stored, so there is no second copy to
 * fall out of date.
 */
export const estimate = sqliteTable(
  'estimate',
  {
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItem.id),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id),
    optimistic: real('optimistic').notNull(),
    realistic: real('realistic').notNull(),
    pessimistic: real('pessimistic').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workItemId, t.roleId] })],
);

export type EstimateRow = typeof estimate.$inferSelect;

/**
 * A finish-to-start dependency: `successor` cannot start until `predecessor`
 * finishes.
 *
 * Either end may be a parent, and that is the point — "the whole of 010 before
 * 020" is what a planner writes, and drawing an edge from every leaf under 010
 * would be tedious and wrong the moment a leaf is added. The expansion to leaves
 * happens when the schedule is computed, not here; storing it would be a second
 * copy to fall out of date with the tree.
 *
 * `projectId` is denormalised from the two work items so a project's edges are
 * one indexed read rather than a join, and so a cross-project edge is impossible
 * to represent rather than merely refused.
 *
 * The unique pair is what makes adding the same dependency twice a no-op at the
 * database rather than a decision in the service.
 */
export const dependency = sqliteTable(
  'dependency',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    predecessorId: text('predecessor_id')
      .notNull()
      .references((): AnySQLiteColumn => workItem.id),
    successorId: text('successor_id')
      .notNull()
      .references((): AnySQLiteColumn => workItem.id),
  },
  (t) => [
    index('dependency_project').on(t.projectId),
    uniqueIndex('dependency_pair').on(t.predecessorId, t.successorId),
  ],
);

export type DependencyRow = typeof dependency.$inferSelect;
