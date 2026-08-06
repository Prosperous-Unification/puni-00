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

export interface DeleteOptions {
  strategy?: 'cascade' | 'promote';
}

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
  }>;
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
    patch: { name?: string; notes?: string; startNoEarlierThan?: string | null },
  ): Promise<void>;
  move(id: string, parentId: string | null, afterId: string | null): Promise<void>;
  remove(id: string, options?: DeleteOptions): Promise<void>;
  setEstimate(id: string, roleId: string, days: Days): Promise<void>;
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
      }>(`/api/projects/${projectId}/work-items`, token);
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
