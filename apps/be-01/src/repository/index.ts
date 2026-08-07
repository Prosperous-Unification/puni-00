import type { EstimateMethod, IsoDate } from '@wbs/domain';

export interface Example {
  id: string;
  label: string;
  createdAt: number;
}

export interface ExampleRepo {
  create(ex: Example): Promise<void>;
  findById(id: string): Promise<Example | null>;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface UserStore {
  /** Returns null when the username is already taken. */
  create(user: User): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  restricted: boolean;
  /** How this project turns its three-point estimates into one planning number. */
  estimateMethod: EstimateMethod;
  /** The calendar day the plan begins, or null for a plan not yet on a calendar. */
  startDate: IsoDate | null;
  /**
   * How many times this project has been written to. Moves on its own stored
   * fields and on its roles; never on a work item beneath it, and never on
   * somebody opening it. See `schema.ts` for the rule and why it is bumped in
   * SQL rather than in this process.
   */
  revision: number;
  createdAt: number;
}

/** A project as one account sees it: null when that account has never opened it. */
export interface ProjectWithAccess extends Project {
  lastOpenedAt: number | null;
}

export interface Role {
  id: string;
  projectId: string;
  name: string;
}

export interface ProjectPatch {
  name?: string;
  restricted?: boolean;
  estimateMethod?: EstimateMethod;
  /** `null` takes the plan back off the calendar. */
  startDate?: IsoDate | null;
}

export interface WorkItem {
  id: string;
  projectId: string;
  parentId: string | null;
  position: number;
  name: string;
  notes: string;
  frozenNumber: string | null;
  /** A day this item may not start before — a floor, never a pin. */
  startNoEarlierThan: IsoDate | null;
  /** The service or team this work is labelled with, or null. */
  serviceTeamId: string | null;
  /**
   * How many times this work item has been written to, counting writes to its
   * estimates, assignments and dependencies — and not counting a change to the
   * number derived for it. See `schema.ts` for the whole rule.
   */
  revision: number;
}

export interface WorkItemPatch {
  name?: string;
  notes?: string;
  /** `null` removes the constraint and lets the dependencies alone decide. */
  startNoEarlierThan?: IsoDate | null;
  /** `null` takes the label off. Never constrains who may be assigned the work. */
  serviceTeamId?: string | null;
}

/** A position write the caller has already worked out, applied with whatever prompted it. */
export interface Repositioned {
  id: string;
  position: number;
}

/** A promoted child: a new parent and a new place among its new siblings. */
export interface Reparented extends Repositioned {
  parentId: string | null;
}

export interface FrozenNumber {
  id: string;
  frozenNumber: string | null;
}

export interface WorkItemStore {
  listByProject(projectId: string): Promise<WorkItem[]>;
  findById(id: string): Promise<WorkItem | null>;
  /**
   * Inserts, and respaces the sibling group in the same transaction when the
   * insertion had no gap to take. Two calls would leave a window in which two
   * siblings share a position, and the number derived in that window would be
   * wrong for whoever read it.
   */
  insert(workItem: WorkItem, respaced: readonly Repositioned[]): Promise<void>;
  patch(id: string, patch: WorkItemPatch): Promise<WorkItem | null>;
  move(
    id: string,
    parentId: string | null,
    position: number,
    respaced: readonly Repositioned[],
  ): Promise<void>;
  /**
   * Writes or clears stored numbers. `null` returns a work item to deriving.
   *
   * A freeze is one call rather than a write per work item: a project half
   * frozen is a project where some numbers moved and some did not, and nobody
   * reading it could tell which.
   */
  setFrozenNumbers(updates: readonly FrozenNumber[]): Promise<void>;
  /** Removes `ids` and applies `promoted` together, so a promotion cannot outlive its parent. */
  remove(ids: readonly string[], promoted: readonly Reparented[]): Promise<void>;
}

export interface StoredEstimate {
  workItemId: string;
  roleId: string;
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

export interface EstimateStore {
  listByProject(projectId: string): Promise<StoredEstimate[]>;
  /** Writes one work item's estimate for one role, replacing any earlier one. */
  set(estimate: StoredEstimate): Promise<void>;
  /**
   * Takes away one work item's estimate for one role, leaving every other
   * role on that work item and that role on every other work item alone.
   *
   * Removing one that is not stored is not an error: the state asked for is
   * the state left, and two people emptying the same three boxes must not turn
   * the second one into a failure on screen.
   */
  remove(workItemId: string, roleId: string): Promise<void>;
  /**
   * Moves every estimate from one work item to another.
   *
   * Used in both directions by the same rule: an estimated work item that gains
   * its first child hands the estimate down, and a work item whose last child is
   * deleted takes it back. Neither is a merge — a parent never holds estimates of
   * its own while it has children.
   */
  moveAll(fromWorkItemId: string, toWorkItemId: string): Promise<void>;
}

/** A finish-to-start edge as it is stored: either end may be a parent. */
export interface StoredDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
}

export interface DependencyStore {
  listByProject(projectId: string): Promise<StoredDependency[]>;
  /**
   * Writes the edge, or does nothing if it is already there.
   *
   * Idempotent at the database through the unique pair rather than by asking
   * first: two clients drawing the same arrow at once would both see "not there"
   * and both insert.
   */
  add(dependency: StoredDependency): Promise<void>;
  remove(predecessorId: string, successorId: string): Promise<void>;
  /** Every edge touching a work item, so deleting the row can take them with it. */
  removeAllFor(workItemId: string): Promise<void>;
}

/** A service or team work can be labelled with. Global, shared by every project. */
export interface ServiceTeam {
  id: string;
  name: string;
}

/** Somebody who does work. Not an account on this tool. */
export interface Person {
  id: string;
  name: string;
}

/** A person and the teams they belong to — empty means a free agent. */
export interface PersonWithTeams extends Person {
  teamIds: string[];
}

/** Who is doing one work item's work for one role. */
export interface Assignment {
  workItemId: string;
  roleId: string;
  personId: string;
}

export interface DirectoryStore {
  listTeams(): Promise<ServiceTeam[]>;
  /**
   * Adds a team, or returns the one that already has that name.
   *
   * Idempotent by name at the database rather than by asking first: this list
   * is typed into by everybody, and two people adding `Platform` at once both
   * pass a check-then-insert.
   */
  addTeam(team: ServiceTeam): Promise<ServiceTeam>;
  listPeople(): Promise<PersonWithTeams[]>;
  /** Adds a person, or returns the one with that name, joining them to `teamIds`. */
  addPerson(toAdd: Person, teamIds: readonly string[]): Promise<Person>;
  assignmentsOf(workItemIds: readonly string[]): Promise<Assignment[]>;
  /** Sets, replaces or (with `null`) removes one work item's assignee for one role. */
  assign(workItemId: string, roleId: string, personId: string | null): Promise<void>;
}

/**
 * A duplicated subtree, ready to be written: every copied row and everything
 * that hangs off it, already carrying its new ids.
 *
 * It arrives as one value because it is written as one act — see
 * {@link SubtreeStore.insertSubtree}. The caller has already decided every id,
 * so nothing here is generated on the way in.
 */
export interface SubtreeCopy {
  /**
   * The copies, **parents before children**. `work_item.parent_id` references
   * `work_item.id`, so any other order is refused by the database rather than
   * silently reordered.
   */
  rows: readonly WorkItem[];
  /** Existing siblings of the copied root whose positions the placement moved. */
  respaced: readonly Repositioned[];
  estimates: readonly StoredEstimate[];
  assignments: readonly Assignment[];
  /** Only the edges with both ends inside the subtree, remapped to the copies. */
  dependencies: readonly StoredDependency[];
}

export interface SubtreeStore {
  /**
   * Writes a whole {@link SubtreeCopy} in one transaction, across all four
   * tables it touches.
   *
   * Wider than any other store here on purpose. A copy applied in pieces can
   * fail between them and leave rows that look like real work with no
   * estimates and nobody assigned — a plan that is quietly wrong rather than
   * visibly incomplete, and nothing in the tree says which rows they are.
   *
   * Throws whatever the database throws. A rejected write means **nothing**
   * was written, which `work-item.test.ts` asserts against a deliberately
   * broken foreign key rather than claiming it here.
   */
  insertSubtree(copy: SubtreeCopy): Promise<void>;
}

export interface ProjectStore {
  /**
   * Writes the project and its starting roles together. A project that existed
   * for even one request without roles would accept an estimate that had no
   * role to belong to, so the two are one transaction rather than two calls.
   */
  create(project: Project, roles: readonly Role[]): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  /** Every project, newest first. Readable by any account, so it is not filtered by owner. */
  list(): Promise<Project[]>;
  /**
   * Every project in `userId`'s own order: the ones that account has opened
   * first, most recent before less recent, then the ones it never opened,
   * newest created first.
   *
   * Not a filter — every account still sees every project, because reading is
   * open. Only the order and the extra `lastOpenedAt` differ per caller.
   */
  listFor(userId: string): Promise<ProjectWithAccess[]>;
  /**
   * Records `userId` as having opened `projectId` at `at`, replacing whatever
   * moment was recorded before. Idempotent by the primary key rather than by
   * asking first: two tabs opening one project at once would both see "no row"
   * and both insert.
   */
  recordOpen(userId: string, projectId: string, at: number): Promise<void>;
  /** Returns null when the project is gone. */
  update(id: string, patch: ProjectPatch): Promise<Project | null>;
  rolesOf(projectId: string): Promise<Role[]>;
}
