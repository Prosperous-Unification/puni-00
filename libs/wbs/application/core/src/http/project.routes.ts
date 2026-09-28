import {
  createProject,
  exportProject,
  listProjects,
  patchProject,
  readProject,
  recordProjectOpen,
  retryProjectOptimization,
} from '@wbs/contracts';
import type { SolverObjectiveName } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import { installPlanDocument } from '../module/plan-document/check';
import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import type { Project } from '../ports/project-store';
import type { OptimizationVariantState } from '../ports/scheduler';
import type { CalendarMarkerService } from '../service/calendar-marker.service';
import type { DirectoryService } from '../service/directory.service';
import type { ProjectService } from '../service/project.service';
import type { WorkItemService } from '../service/work-item.service';
import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

export interface OptimizationRetry {
  /** Retries through an immediate store transaction; `scoped` rechecks the actor there. */
  retry(ask: {
    readonly projectId: string;
    readonly objective: SolverObjectiveName;
    readonly inputHash: string;
    readonly input: ScheduleInput;
    readonly scoped?: { readonly organizationId: string; readonly actorId: string };
  }):
    | { readonly kind: 'forbidden' | 'not_found' }
    | { readonly kind: 'stale-input-hash'; readonly currentInputHash: string }
    | { readonly kind: 'not-retryable'; readonly state: OptimizationVariantState['state'] }
    | { readonly kind: 'already-running' }
    | {
        readonly kind: 'accepted';
        readonly state: 'retrying';
        readonly generation: number;
        readonly inputHash: string;
      };
}

interface ExportedWorkItem {
  number: string;
  name: string;
  dates: { startsOn: string; endsOn: string } | null;
  schedule: { duration: number; critical: boolean };
}

// Proof: bypassing escaping made the mounted Markdown export contain Build | ship
// instead of the escaped Build \| ship cell.
const markdownCell = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll(/\r?\n/g, '<br>');

/** The human-readable projection of the same tree payload returned by JSON. */
export function projectMarkdown(project: Project, workItems: readonly ExportedWorkItem[]): string {
  const title = project.name.replaceAll(/\r?\n/g, ' ').trim();
  const rows = workItems.map((item) =>
    [
      item.number,
      item.name,
      item.dates?.startsOn ?? '—',
      item.dates?.endsOn ?? '—',
      String(item.schedule.duration),
      item.schedule.critical ? 'yes' : 'no',
    ]
      .map(markdownCell)
      .join(' | '),
  );
  return [
    `# ${title}`,
    '',
    '| WBS | Work item | Start | Finish | Duration | Critical |',
    '| --- | --- | --- | --- | ---: | :---: |',
    ...rows.map((row) => `| ${row} |`),
    '',
  ].join('\n');
}

/** Structural bodies retain 422; malformed JSON and other request parts use 400.
 * Proof: returning 400 for invalid_body made the mounted undeclared-create test receive 500 instead of 422. */
function classifyBodyFailure(failure: RequestFailure) {
  switch (failure.code) {
    case 'invalid_body':
      return { ok: false, status: 422, body: { error: 'invalid_body' } } as const;
    case 'invalid_json':
      return { ok: false, status: 400, body: { error: 'invalid_json' } } as const;
    case 'invalid_params':
      return { ok: false, status: 400, body: { error: 'invalid_params' } } as const;
    case 'invalid_query':
      return { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
  }
}

/** Invalid format wins over query extras, matching the legacy format check before any read.
 * Proof: omitting this classifier changed the mounted export-format test from unsupported_format to invalid_query. */
function classifyExportFailure(failure: RequestFailure) {
  if (failure.part === 'query') {
    const format = failure.request.url.searchParams.getAll('format').at(-1);
    return format !== 'json' && format !== 'markdown'
      ? ({ ok: false, status: 400, body: { error: 'unsupported_format' } } as const)
      : ({ ok: false, status: 400, body: { error: 'invalid_query' } } as const);
  }
  return failure.part === 'params'
    ? ({ ok: false, status: 400, body: { error: 'invalid_params' } } as const)
    : ({ ok: false, status: 400, body: { error: 'invalid_body' } } as const);
}

/**
 * Project operations share wire declarations; ProjectService retains ownership
 * of access checks, semantic date/weight refusals and optimizer announcements.
 * Opening is caller navigation, so it bypasses canEdit while retaining write scope.
 */
export function projectRoutes(
  projects: ProjectService,
  organizations: OrganizationAccess,
  workItems: WorkItemService,
  directory: DirectoryService,
  calendarMarkers: CalendarMarkerService,
  clock: Pick<Clock, 'now'>,
  optimizer?: OptimizationRetry,
) {
  const { planDocuments } = installPlanDocument({ directory, markers: calendarMarkers, clock });
  return [
    bind(
      createProject,
      async ({ body, principal }): Promise<HttpReply<typeof createProject>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        const outcome = await projects.createWithin(body.name, principal.id, resolved.access);
        return outcome.ok
          ? { ok: true, status: 200, body: outcome.value }
          : { ok: false, status: 403, body: { error: outcome.reason } };
      },
      { classifyRequestFailure: classifyBodyFailure },
    ),
    bind(listProjects, async ({ principal }): Promise<HttpReply<typeof listProjects>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      return {
        ok: true,
        status: 200,
        body: { projects: await projects.listWithin(principal.id, resolved.access) },
      };
    }),
    // Proof: returning null instead of EMPTY made the mounted reader-open test receive 500 instead of 204.
    bind(
      recordProjectOpen,
      async ({ params, principal }): Promise<HttpReply<typeof recordProjectOpen>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        return (await projects.openWithin(params.id, principal.id, resolved.access))
          ? { ok: true, status: 204, body: EMPTY }
          : { ok: false, status: 404, body: { error: 'not_found' } };
      },
    ),
    bind(
      exportProject,
      async ({ params, query, principal }): Promise<HttpReply<typeof exportProject>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        // Proof: reading through `projects.read` instead made `answers 404 alike
        // for a foreign and an absent project, and changes nothing` in
        // `project-organization.controller.db.test.ts` answer 200 with the
        // foreign project's Markdown; watched 2026-09-27.
        const found = await projects.readWithin(params.id, resolved.access);
        if (found === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: reading the tree unscoped made `fails the export and the
        // optimizer retry closed over a crossing row` in
        // `schedule-organization.controller.db.test.ts` export with 200.
        const tree = await workItems.treeWithin(params.id, resolved.access);
        if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: removing this branch made both mounted unavailable export cases
        // receive 500 instead of 409, before either could inspect media or body.
        if ('kind' in tree)
          return {
            ok: false,
            status: 409,
            body: { error: tree.error, engine: tree.engine },
          };
        if (query.format === 'markdown')
          return {
            ok: true,
            status: 200,
            // Proof: returning this as a JSON body made the mounted Markdown export receive 500 instead of 200.
            text: projectMarkdown(found.project, tree.workItems),
          };
        const exported = await planDocuments.export(found.project, tree, resolved.access);
        if (!exported.ok)
          return {
            ok: false,
            status: 409,
            body: { error: exported.error, steps: exported.steps, command: exported.command },
          };
        return {
          ok: true,
          status: 200,
          body: exported.value,
          headers: [['content-type', 'application/json; charset=utf-8']],
        };
      },
      { classifyRequestFailure: classifyExportFailure },
    ),
    bind(readProject, async ({ params, principal }): Promise<HttpReply<typeof readProject>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const found = await projects.readWithin(params.id, resolved.access);
      return found === null
        ? { ok: false, status: 404, body: { error: 'not_found' } }
        : { ok: true, status: 200, body: found };
    }),
    bind(
      patchProject,
      async ({ params, body, principal }): Promise<HttpReply<typeof patchProject>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        const outcome = await projects.updateWithin(params.id, principal.id, body, resolved.access);
        if (outcome.ok) return { ok: true, status: 200, body: { project: outcome.value } };
        switch (outcome.reason) {
          case 'not_found':
            return { ok: false, status: 404, body: { error: outcome.reason } };
          case 'forbidden':
            return { ok: false, status: 403, body: { error: outcome.reason } };
          case 'bad_start_date':
          case 'bad_pert_weights':
            return { ok: false, status: 422, body: { error: outcome.reason } };
          // Proof: mapping this to 422 made the mounted unavailable-optimizer test receive 500 instead of 409.
          case 'optimizer_unavailable':
          case 'solution_taken':
            return { ok: false, status: 409, body: { error: outcome.reason } };
        }
      },
      { classifyRequestFailure: classifyBodyFailure },
    ),
    bind(
      retryProjectOptimization,
      async ({ params, body, principal }): Promise<HttpReply<typeof retryProjectOptimization>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        const authorization = await projects.authorizeRetry(
          params.id,
          principal.id,
          resolved.access,
        );
        if (!authorization.ok) {
          return authorization.reason === 'not_found'
            ? { ok: false, status: 404, body: { error: 'not_found' } }
            : { ok: false, status: 403, body: { error: 'forbidden' } };
        }
        // Proof: building the input unscoped made that case answer 409 instead
        // of 500, retrying over the crossing row.
        const input = await workItems.scheduleInputWithin(params.id, resolved.access);
        if (input === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        if (optimizer === undefined) {
          return {
            ok: false,
            status: 409,
            body: { code: 'not-retryable', state: 'idle' },
          };
        }
        const outcome = optimizer.retry({
          projectId: params.id,
          ...body,
          input,
          ...(resolved.access.kind === 'scoped'
            ? {
                scoped: {
                  organizationId: resolved.access.scope.organizationId,
                  actorId: principal.id,
                },
              }
            : {}),
        });
        switch (outcome.kind) {
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'stale-input-hash':
            return {
              ok: false,
              status: 409,
              body: {
                code: 'stale-input-hash',
                currentInputHash: outcome.currentInputHash,
              },
            };
          case 'not-retryable':
            return {
              ok: false,
              status: 409,
              body: { code: 'not-retryable', state: outcome.state },
            };
          case 'already-running':
            return { ok: false, status: 409, body: { code: 'already-running' } };
          case 'accepted':
            return {
              ok: true,
              status: 202,
              body: {
                state: outcome.state,
                generation: outcome.generation,
                inputHash: outcome.inputHash,
              },
            };
        }
      },
      { classifyRequestFailure: classifyBodyFailure },
    ),
  ] as const;
}
