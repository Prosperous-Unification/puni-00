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
  /**
   * Which of the four {@link EstimateMethod}s this project plans with. Text
   * rather than an integer so a database anyone opens says `pessimistic`
   * instead of `3`, and defaulted so every existing project keeps the PERT
   * behaviour it already had.
   */
  estimateMethod: text('estimate_method').notNull().default('pert'),
  /**
   * The calendar day the plan begins, as `YYYY-MM-DD`, or null for a project
   * that has not been placed on a calendar.
   *
   * Nullable rather than defaulted to the day the project was made: a plan
   * with no start date is an ordinary state — an estimate nobody has committed
   * to a date yet — and inventing one would put dates on screen that nobody
   * chose. Without it the schedule still answers in day offsets, as it always
   * has.
   */
  startDate: text('start_date'),
  createdAt: integer('created_at').notNull(),
});

export type ProjectRow = typeof project.$inferSelect;

/**
 * When one account last opened one project, and nothing else.
 *
 * The picker sorts by it, which is the whole reason it exists: "the project I
 * was in yesterday" is how people find their way back, and creation order
 * answers a question nobody asks. One row per pair, overwritten on each open —
 * a log would answer "how often" and "when before that", which nothing asks.
 *
 * Its own table rather than a column anywhere: the fact belongs to the pair,
 * not to the project (every account has a different answer) and not to the
 * account (it has one per project).
 */
export const projectAccess = sqliteTable(
  'project_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    lastOpenedAt: integer('last_opened_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })],
);

export type ProjectAccessRow = typeof projectAccess.$inferSelect;

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
    /**
     * A calendar day this work item may not start before, or null.
     *
     * A **constraint**, never a pin: the schedule takes the later of this and
     * whatever its dependencies allow, so a predecessor that slips still
     * pushes this item along. Dany's call, 2026-08-06 — "keeps systems
     * independent". A hard pin would let a date contradict the dependency tree
     * and leave nothing to say which of the two was right.
     */
    startNoEarlierThan: text('start_no_earlier_than'),
    /**
     * The service or team this work belongs to, or null. A label on the work,
     * not a constraint on who may be assigned it.
     */
    serviceTeamId: text('service_team_id'),
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
 * A service or team that work can be labelled with — global, not per project.
 *
 * Dany's ask, 2026-08-06: it behaves like a Jira label. Anyone may add one by
 * typing a name the list does not have, and every project draws from the same
 * list, because the same teams do work across projects and one list per
 * project would be the same names typed again and again with typos between
 * them.
 *
 * The name is unique at the database rather than only in the service: two
 * people creating `Platform` at the same moment both pass a check-then-insert,
 * and only a constraint stops the second.
 */
export const serviceTeam = sqliteTable(
  'service_team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('service_team_name').on(t.name)],
);

export type ServiceTeamRow = typeof serviceTeam.$inferSelect;

/**
 * Somebody who does work. Global, like the teams, and for the same reason.
 *
 * Not a `users` row: the people a plan assigns work to are mostly not accounts
 * on this tool, and requiring them to be would make the field unusable on the
 * day it is needed. If the two ever have to meet, they meet through a column
 * added then, not through a foreign key guessed at now.
 */
export const person = sqliteTable(
  'person',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('person_name').on(t.name)],
);

export type PersonRow = typeof person.$inferSelect;

/**
 * Which teams a person belongs to — several, deliberately.
 *
 * Dany, 2026-08-06: "one assignee might be from different service/teams". A
 * person with no rows here is a **free agent**, which is computed on read
 * rather than stored as membership of a magic team: a real "Free agents" row
 * could be renamed, deleted or assigned work of its own, and then the default
 * would mean whatever somebody last did to it.
 */
export const personTeam = sqliteTable(
  'person_team',
  {
    personId: text('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    serviceTeamId: text('service_team_id')
      .notNull()
      .references(() => serviceTeam.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.personId, t.serviceTeamId] })],
);

export type PersonTeamRow = typeof personTeam.$inferSelect;

/**
 * Who does one work item's work for one role — one person per phase.
 *
 * The primary key is the pair, so a work item has at most one Dev and at most
 * one QA. Dany, 2026-08-06: "one per dev, one per QA", and "when just one is
 * assigned it is assumed they do both" — that last part is a **reading** of an
 * absent row, not a second row written on somebody's behalf, so nobody is
 * recorded against work they were never given.
 *
 * The person is deliberately unconstrained by the work item's `serviceTeamId`:
 * Dany's call, "keep people and service/team lists decoupled for the work
 * item". A team labels the work; a person does it; the two need not match.
 */
export const assignment = sqliteTable(
  'assignment',
  {
    workItemId: text('work_item_id')
      .notNull()
      .references((): AnySQLiteColumn => workItem.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.workItemId, t.roleId] })],
);

export type AssignmentRow = typeof assignment.$inferSelect;

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
 * one indexed read rather than a join. It does **not** make a cross-project edge
 * unrepresentable — the three foreign keys are independent, and nothing ties
 * either endpoint's project to this one. `canDepend` refuses it, and the read
 * drops an edge whose predecessor is not in the project; enforcing it in the
 * schema would need composite keys. An earlier version of this comment claimed
 * the stronger thing, which a reviewer was right to call out.
 *
 * The work-item references cascade on delete. The application removes edges
 * before deleting a row, but blue and green share one SQLite file during a swap:
 * the outgoing release knows nothing about this table, and its plain
 * `DELETE FROM work_item` would hit a constraint it cannot see and answer 500.
 * The cascade is what keeps a migration applied under the old release safe.
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
      .references((): AnySQLiteColumn => workItem.id, { onDelete: 'cascade' }),
    successorId: text('successor_id')
      .notNull()
      .references((): AnySQLiteColumn => workItem.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('dependency_project').on(t.projectId),
    uniqueIndex('dependency_pair').on(t.predecessorId, t.successorId),
  ],
);

export type DependencyRow = typeof dependency.$inferSelect;
