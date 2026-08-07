/**
 * How a project turns its three-point estimates into the one number it plans
 * with. Mirrors `EstimateMethod` in `libs/domain`.
 *
 * Declared here rather than imported, like every other wire type in this file:
 * `libs/domain` pulls in arktype for its runtime validation, and none of that
 * belongs in a browser bundle. be-01 validates the value at its boundary — the
 * client's copy is a description of what comes back, not the rule.
 */
export const ESTIMATE_METHODS = ['pert', 'optimistic', 'realistic', 'pessimistic'] as const;
export type EstimateMethod = (typeof ESTIMATE_METHODS)[number];

/** Whether `value` is one of the four, for reading a `<select>`'s string back. */
export function isEstimateMethod(value: string): value is EstimateMethod {
  return (ESTIMATE_METHODS as readonly string[]).includes(value);
}

export interface Days {
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

/**
 * When a work item can happen, in whole days from the project's day zero.
 *
 * No dates: a calendar brings weekends, holidays and timezones, and none of them
 * are needed to answer what is waiting on what. `estimated` is what stops a
 * zero-day row being read as instant when it means nobody has looked.
 */
export interface ScheduleView {
  duration: number;
  estimated: boolean;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  float: number;
  critical: boolean;
}

export interface WorkItemView {
  id: string;
  parentId: string | null;
  /**
   * How many times be-01 has written to this work item, counting writes to its
   * estimates, assignees and dependencies.
   *
   * Nothing on screen uses it yet, and nothing sends it back. It is here so a
   * client that holds a row can later say "apply this only if it has not moved
   * since I read it" — the primitive conditional undo and write preconditions
   * are both built on. be-01 owns the rule; this is a description of what
   * arrives.
   *
   * It does **not** move when {@link WorkItemView.number} does. A create
   * anywhere above renumbers rows nobody wrote to, and the table already
   * refetches for that.
   */
  revision: number;
  number: string;
  name: string;
  notes: string;
  frozenNumber: string | null;
  /** True when the estimates are sums of descendants and so not editable here. */
  rolledUp: boolean;
  estimates: Record<string, Days>;
  /** The work items this one waits for, by id. Either end may be a parent. */
  dependsOn: string[];
  /**
   * The one number this row is planned with, per role, and their sum — the
   * project's estimate method applied to the trio above.
   *
   * be-01 computes both, from the same call the schedule's durations come
   * from. Working them out here instead would be a second implementation of
   * "the final estimate" sitting one column away from the dates it must agree
   * with.
   */
  finalDays: Record<string, number>;
  finalTotal: number;
  /**
   * When this happens on a calendar, or null while the project has no start
   * date or the schedule could not be computed.
   *
   * Working days only, and `endsOn` is the last day the work is still on
   * rather than the day after. Computed by be-01 with the project's start
   * date; the client renders it and counts nothing.
   */
  dates: { startsOn: string; endsOn: string } | null;
  /** A day this item may not start before — a floor the dependencies can push past. */
  startNoEarlierThan: string | null;
  /** The team this work is labelled with, or null. Never constrains who is assigned it. */
  serviceTeamId: string | null;
  /**
   * Who does this work, by role id.
   *
   * `string | undefined` rather than `string`: a role nobody is assigned to is
   * **absent** from this object, and a type saying otherwise would have every
   * reader believing an index always finds somebody.
   */
  assignees: Record<string, string | undefined>;
  /** The one person assumed to do every phase, when exactly one is assigned. */
  doesEveryPhase: string | null;
  /**
   * `estimates` is **effort** and this is **span**. For a parent they differ:
   * two independent children of 3 and 4 days are 7 days of work in a 4-day
   * branch. Both are true, and the table labels them so.
   */
  schedule: ScheduleView;
}

export interface RoleView {
  id: string;
  name: string;
}

/** A service or team, global to this deployment. */
export interface TeamView {
  id: string;
  name: string;
}

/** Somebody who does work, and the teams they belong to. Empty means a free agent. */
export interface PersonView {
  id: string;
  name: string;
  teamIds: string[];
}

export interface DeleteOptions {
  strategy?: 'cascade' | 'promote';
}

/**
 * What came of walking one step along the undo stack.
 *
 * A refusal is a **modeled answer** rather than a thrown error, because both
 * of them are ordinary states of a shared plan rather than faults: a stack
 * with nothing left in it, and a change somebody else has since written over.
 * A network failure still throws — that is the caller's to report as a failed
 * request, and it says nothing about the stack.
 */
export type UndoResult =
  | {
      ok: true;
      /** What was reversed, as be-01 phrased it: `rename “Strip”`. */
      done: string;
      /** What could not be put back exactly, or null when everything was. */
      detail: string | null;
    }
  | {
      ok: false;
      reason: 'nothing_to_undo' | 'stale_undo';
      /** Which change stood in the way, for `stale_undo`. */
      detail: string | null;
    };

/**
 * Everything the table does to a project.
 *
 * An interface rather than bare functions so the table can be driven by a fake
 * in tests: the keyboard behaviour is the part worth proving, and asserting it
 * through a real fetch would test the network instead.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  restricted: boolean;
  /** When this account last opened it, or null if it never has. */
  lastOpenedAt: number | null;
}

export interface ProjectApi {
  /**
   * Every project, in this account's own order: opened first by recency, then
   * never-opened by creation date. The order is be-01's and is used as given —
   * sorting again on the client would be a second implementation of the rule,
   * and the two would eventually disagree.
   */
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<ProjectSummary>;
  /** Records this account as having opened the project, which is what sorts the picker. */
  openProject(id: string): Promise<void>;
  /** Renames the project. be-01 answers `forbidden` on a restricted one. */
  renameProject(id: string, name: string): Promise<void>;
  /**
   * The project's work items, and the event sequence they were read at.
   *
   * The sequence is what a socket resumes from, so it belongs to the read that
   * produced the rows: taken separately it would describe a different moment
   * than the tree on screen.
   */
  tree(projectId: string): Promise<{
    workItems: WorkItemView[];
    seq: number;
    scheduleError: 'cycle' | null;
    estimateMethod: EstimateMethod;
    startDate: string | null;
    /**
     * The project row's own revision: its name, restriction, estimate method,
     * start date and roles. It does not move when a work item does — each
     * carries its own.
     */
    projectRevision: number;
    /**
     * Whether **this account** has anything to undo or redo on this project.
     *
     * Carried on the tree rather than asked for separately: the tree is
     * already reread after every change this client makes and every event from
     * anybody else, which is exactly when these can have moved. A second
     * endpoint would be a second round trip at the same moments.
     */
    undoable: boolean;
    redoable: boolean;
  }>;
  /**
   * Reverses this account's last change to the project, **if nothing it
   * touched has been written to since**.
   *
   * be-01 owns the condition and the wording of what it did; this is a
   * description of what comes back. A refused step also discards the entry it
   * refused, so the caller reads the tree again afterwards either way.
   */
  undo(projectId: string): Promise<UndoResult>;
  /** Puts back what {@link ProjectApi.undo} took away, under the same condition. */
  redo(projectId: string): Promise<UndoResult>;
  /** Changes how the project turns its three-point estimates into one number. */
  setEstimateMethod(projectId: string, method: EstimateMethod): Promise<void>;
  /** Puts the plan on a calendar, or `null` to take it off again. */
  setStartDate(projectId: string, startDate: string | null): Promise<void>;
  roles(projectId: string): Promise<RoleView[]>;
  create(
    projectId: string,
    input: { parentId: string | null; afterId: string | null; name?: string },
  ): Promise<{ id: string }>;
  patch(
    id: string,
    patch: {
      name?: string;
      notes?: string;
      startNoEarlierThan?: string | null;
      serviceTeamId?: string | null;
    },
  ): Promise<void>;
  /** The global team list, and adding to it — idempotent by name at be-01. */
  listTeams(): Promise<TeamView[]>;
  addTeam(name: string): Promise<TeamView>;
  listPeople(): Promise<PersonView[]>;
  /** Adds a person; no teams means a free agent. */
  addPerson(name: string, teamIds: readonly string[]): Promise<PersonView>;
  /** Sets or (with `null`) clears who does one work item's work for one role. */
  assign(workItemId: string, roleId: string, personId: string | null): Promise<void>;
  move(id: string, parentId: string | null, afterId: string | null): Promise<void>;
  /**
   * Copies a work item and everything under it, as the next sibling of the
   * original, answering the copy's id.
   *
   * One call rather than a create per row: be-01 writes the whole branch in one
   * transaction, so nobody watching ever sees half a copy, and the copied
   * dependencies point at the copies. What is and is not carried over — no
   * frozen numbers, no edges leaving the branch — is be-01's rule, stated in
   * `openspec/changes/duplicate-subtree/`.
   */
  duplicate(id: string): Promise<{ id: string }>;
  remove(id: string, options?: DeleteOptions): Promise<void>;
  setEstimate(id: string, roleId: string, days: Days): Promise<void>;
  /**
   * Takes one work item's stored trio for one role back off.
   *
   * Idempotent at be-01, which is what lets the table call it from a gesture —
   * emptying three boxes — rather than from a button that has to know whether
   * there is anything there to remove.
   */
  clearEstimate(id: string, roleId: string): Promise<void>;
  freeze(projectId: string): Promise<void>;
  unfreezeProject(projectId: string): Promise<void>;
  unfreeze(id: string): Promise<void>;
  /** Records "`predecessorId` must finish before this starts". */
  addDependency(id: string, predecessorId: string): Promise<void>;
  removeDependency(id: string, predecessorId: string): Promise<void>;
}

/** The header the edge does not read; see `lib/api.ts` for why it is never `Authorization`. */
const auth = (token: string) => ({ 'content-type': 'application/json', 'x-wbs-token': token });

async function send<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: auth(token) });
  const text = await res.text();
  if (!res.ok) {
    let code = `http_${String(res.status)}`;
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? code;
    } catch {
      // A proxy error page rather than our JSON — the status is all there is.
    }
    throw new Error(code);
  }
  return (text === '' ? null : JSON.parse(text)) as T;
}

/**
 * One step along the undo stack, with be-01's two refusals read out of the 409
 * rather than turned into a thrown code.
 *
 * `send` throws the `error` field for every non-2xx, which loses the `detail`
 * beside it — and the detail is the whole value of a `stale_undo`: it names the
 * change that stood in the way. Anything that is not one of the two modeled
 * refusals still throws, through the same path as every other call.
 */
async function stepStack(path: string, token: string): Promise<UndoResult> {
  const res = await fetch(path, { method: 'POST', headers: auth(token) });
  const text = await res.text();
  if (res.status === 409) {
    const body = JSON.parse(text) as { error?: string; detail?: string | null };
    if (body.error === 'nothing_to_undo' || body.error === 'stale_undo') {
      return { ok: false, reason: body.error, detail: body.detail ?? null };
    }
  }
  if (!res.ok) {
    let code = `http_${String(res.status)}`;
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? code;
    } catch {
      // A proxy error page rather than our JSON — the status is all there is.
    }
    throw new Error(code);
  }
  const body = JSON.parse(text) as { done: string; detail: string | null };
  return { ok: true, done: body.done, detail: body.detail };
}

export function httpProjectApi(token: string): ProjectApi {
  return {
    async listProjects() {
      const body = await send<{ projects: ProjectSummary[] }>('/api/projects', token);
      return body.projects;
    },
    async createProject(name) {
      const body = await send<{ project: ProjectSummary }>('/api/projects', token, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      return body.project;
    },
    async openProject(id) {
      await send(`/api/projects/${id}/opened`, token, { method: 'POST' });
    },
    async renameProject(id, name) {
      await send(`/api/projects/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    },
    tree(projectId) {
      return send<{
        workItems: WorkItemView[];
        seq: number;
        scheduleError: 'cycle' | null;
        estimateMethod: EstimateMethod;
        startDate: string | null;
        projectRevision: number;
        undoable: boolean;
        redoable: boolean;
      }>(`/api/projects/${projectId}/work-items`, token);
    },
    undo(projectId) {
      return stepStack(`/api/projects/${projectId}/undo`, token);
    },
    redo(projectId) {
      return stepStack(`/api/projects/${projectId}/redo`, token);
    },
    async listTeams() {
      const body = await send<{ teams: TeamView[] }>('/api/teams', token);
      return body.teams;
    },
    async addTeam(name) {
      const body = await send<{ team: TeamView }>('/api/teams', token, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      return body.team;
    },
    async listPeople() {
      const body = await send<{ people: PersonView[] }>('/api/people', token);
      return body.people;
    },
    async addPerson(name, teamIds) {
      const body = await send<{ person: PersonView }>('/api/people', token, {
        method: 'POST',
        body: JSON.stringify({ name, teamIds }),
      });
      return body.person;
    },
    async assign(workItemId, roleId, personId) {
      await send(`/api/work-items/${workItemId}/assignees/${roleId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ personId }),
      });
    },
    async setStartDate(projectId, startDate) {
      await send(`/api/projects/${projectId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ startDate }),
      });
    },
    async setEstimateMethod(projectId, method) {
      await send(`/api/projects/${projectId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ estimateMethod: method }),
      });
    },
    async roles(projectId) {
      const body = await send<{ roles: RoleView[] }>(`/api/projects/${projectId}`, token);
      return body.roles;
    },
    create(projectId, input) {
      return send<{ id: string }>(`/api/projects/${projectId}/work-items`, token, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    async patch(id, patch) {
      await send(`/api/work-items/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    async move(id, parentId, afterId) {
      await send(`/api/work-items/${id}/move`, token, {
        method: 'POST',
        body: JSON.stringify({ parentId, afterId }),
      });
    },
    duplicate(id) {
      return send<{ id: string }>(`/api/work-items/${id}/duplicate`, token, { method: 'POST' });
    },
    async remove(id, options) {
      const query = options?.strategy === undefined ? '' : `?strategy=${options.strategy}`;
      await send(`/api/work-items/${id}${query}`, token, { method: 'DELETE' });
    },
    async setEstimate(id, roleId, days) {
      await send(`/api/work-items/${id}/estimates/${roleId}`, token, {
        method: 'PUT',
        body: JSON.stringify(days),
      });
    },
    async clearEstimate(id, roleId) {
      await send(`/api/work-items/${id}/estimates/${roleId}`, token, { method: 'DELETE' });
    },
    async freeze(projectId) {
      await send(`/api/projects/${projectId}/freeze`, token, { method: 'POST' });
    },
    async unfreezeProject(projectId) {
      await send(`/api/projects/${projectId}/unfreeze`, token, { method: 'POST' });
    },
    async unfreeze(id) {
      await send(`/api/work-items/${id}/unfreeze`, token, { method: 'POST' });
    },
    async addDependency(id, predecessorId) {
      await send(`/api/work-items/${id}/dependencies`, token, {
        method: 'POST',
        body: JSON.stringify({ predecessorId }),
      });
    },
    async removeDependency(id, predecessorId) {
      await send(`/api/work-items/${id}/dependencies/${predecessorId}`, token, {
        method: 'DELETE',
      });
    },
  };
}

/** How deep a work item sits, read off its number rather than by walking parents. */
export function depthOf(workItem: WorkItemView): number {
  return workItem.number.split('.').length - 1;
}
