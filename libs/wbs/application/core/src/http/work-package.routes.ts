import {
  createWorkPackage,
  exportWorkPackage,
  listWorkPackages,
  patchWorkPackage,
  readWorkPackage,
  recordWorkPackageOpen,
  retryWorkPackageOptimization,
} from '@wbs/contracts';
import type { Permission } from '@wbs/domain';
import type { SolverObjectiveName } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { admittedWrites } from '../module/plan-commands/admitted-write';
import { installPlanDocument } from '../module/plan-document/check';
import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { WorkPackageService } from '../module/work-package/work-package.resource';
import type { WorkPackageOpening } from '../module/work-package/work-package-opening';
import type { ScopedPrincipal } from '../ports/access-decisions';
import type { Clock } from '../ports/clock';
import type { OptimizationInput } from '../ports/optimization-input';
import type { OrganizationAccess } from '../ports/organization-access';
import type { PlanExportReader } from '../ports/plan-export-reader';
import type { OptimizationVariantState } from '../ports/scheduler';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import type { WorkPackage } from '../ports/work-package-store';
import { isPaged, type PageQueryInput, pageQueryOf } from '../service/list-query';
import { pageWorkPackages, workPackageKeyOf } from '../service/work-package-page';
import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { classifyParentBodyFailure } from './work-package-parent';

export interface OptimizationRetry {
  /** Awaits Retry admission after its shared writer turn commits; `scoped` rechecks the actor in that transaction. */
  retry(ask: {
    readonly workPackageId: string;
    readonly objective: SolverObjectiveName;
    readonly inputHash: string;
    readonly input: ScheduleInput | OptimizationInput;
    readonly scoped?: {
      readonly organizationId: string;
      readonly actorId: string;
      readonly principal: Readonly<ScopedPrincipal>;
    };
  }): Promise<
    | { readonly kind: 'forbidden'; readonly permission?: Permission }
    | { readonly kind: 'not_found' }
    | { readonly kind: 'stale-input-hash'; readonly currentInputHash: string }
    | {
        readonly kind: 'not-retryable';
        readonly state: OptimizationVariantState['state'] | 'boundary-infeasible';
      }
    | { readonly kind: 'already-running' }
    | {
        readonly kind: 'accepted';
        readonly state: 'retrying';
        readonly generation: number;
        readonly inputHash: string;
      }
  >;
}

interface ExportedWorkItem {
  number: string;
  name: string;
  dates: { startsOn: string; endsOn: string } | null;
  schedule: { duration: number; critical: boolean } | null;
}

// Proof: bypassing escaping made the mounted Markdown export contain Build | ship
// instead of the escaped Build \| ship cell.
const markdownCell = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll(/\r?\n/g, '<br>');

/** The human-readable projection of the same tree payload returned by JSON. */
export function workPackageMarkdown(
  workPackage: WorkPackage,
  workItems: readonly ExportedWorkItem[],
): string {
  const title = workPackage.name.replaceAll(/\r?\n/g, ' ').trim();
  const rows = workItems.map((item) =>
    [
      item.number,
      item.name,
      item.dates?.startsOn ?? '—',
      item.dates?.endsOn ?? '—',
      // An on-hold row takes no part in the schedule, so it has neither.
      item.schedule === null ? '—' : String(item.schedule.duration),
      item.schedule === null ? '—' : item.schedule.critical ? 'yes' : 'no',
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
 * The paged contract's query, `undefined` when any parameter is outside the
 * grammar or the cursor is not a work package cursor (a typed 400 before any read).
 *
 * Proof, observed 2026-09-29: answering a foreign-shaped cursor as a walk from
 * the top made `refuses every value outside the grammar with 400` in
 * `work-package-list-paging.controller.db.test.ts` receive 200 for `{ v: 1, after }`.
 */
function workPackagePageQueryOf(query: PageQueryInput, url: URL) {
  const parsed = pageQueryOf(query, url);
  if (parsed === null) return undefined;
  const { cursor, ...rest } = parsed;
  if (cursor === null) return { ...rest, after: null };
  const after = workPackageKeyOf(cursor);
  return after === null ? undefined : { ...rest, after };
}

/**
 * Work package operations share wire declarations; WorkPackageService retains ownership
 * of access checks, semantic date/weight refusals and optimizer announcements.
 * Opening is caller navigation: its required writer checks package.read, retains write scope and bypasses canEdit.
 * Ordinary LIST/GET use the required observation owner; raw resource helpers retain their existing semantics.
 */
export function workPackageRoutes(
  workPackages: Pick<WorkPackageService, 'authorizeRetry'> & {
    openWithin: WorkPackageOpening['openWithin'];
    updateWithin: ReturnType<typeof admittedWrites>['updateWorkPackageWithin'];
    createWithin: ReturnType<typeof admittedWrites>['createWorkPackageWithin'];
  },
  organizations: OrganizationAccess,
  workItems: WorkItemService,
  clock: Pick<Clock, 'now'>,
  planExports: PlanExportReader,
  observation: WorkPackageObservation,
  optimizer?: OptimizationRetry,
) {
  const { planDocuments } = installPlanDocument({ clock });
  return [
    bind(
      createWorkPackage,
      async ({ body, principal }): Promise<HttpReply<typeof createWorkPackage>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const outcome = await workPackages.createWithin(
          body.name,
          body.projectId,
          principal,
          resolved.access,
          body.abbreviation,
        );
        if (outcome.ok) return { ok: true, status: 200, body: outcome.value };
        if ('refusal' in outcome) return organizationRefusal(outcome);
        if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
        switch (outcome.reason) {
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              body: {
                error: outcome.reason,
                ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
              },
            };
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'invalid_abbreviation':
            return { ok: false, status: 422, body: { error: outcome.reason } };
          case 'abbreviation_taken':
          case 'abbreviation_exhausted':
            return { ok: false, status: 409, body: { error: outcome.reason } };
        }
      },
      {
        classifyRequestFailure: (failure) =>
          failure.part === 'body'
            ? classifyParentBodyFailure(failure)
            : classifyBodyFailure(failure),
      },
    ),
    bind(
      listWorkPackages,
      async ({ principal, query, request }): Promise<HttpReply<typeof listWorkPackages>> => {
        const paged = isPaged(query) ? workPackagePageQueryOf(query, request.url) : null;
        // Proof, observed 2026-09-29: answering 200 here made `refuses every
        // value outside the grammar with 400` in
        // `work-package-list-paging.controller.db.test.ts` receive 200 for `limit=0`.
        if (paged === undefined)
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const retained = structuredClone(principal);
        const resolved = await organizations.resolve(retained);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Confined to the organization before anything is ordered, cut or
        // given a cursor: a page never counts a work package the caller cannot read.
        // Proof, observed 2026-09-29: listing with legacy access instead made
        // `pages only the caller’s organization, newest update first` in
        // `work-package-list-paging.controller.db.test.ts` answer org-b's work packages.
        const observed = await observation.list({
          kind: 'human',
          principal: retained,
          expectedAccess: resolved.access,
        });
        if (!observed.ok) return organizationRefusal(observed);
        const readable = observed.value;
        return {
          ok: true,
          status: 200,
          body:
            paged === null
              ? { workPackages: readable, nextCursor: null }
              : pageWorkPackages(readable, paged),
        };
      },
    ),
    // Proof: returning null instead of EMPTY made the mounted reader-open test receive 500 instead of 204.
    bind(
      recordWorkPackageOpen,
      async ({ params, principal }): Promise<HttpReply<typeof recordWorkPackageOpen>> => {
        // Proof: OPEN H1 (2026-11-14), Sharing the principal instead of cloning failed
        // `retains nested OPEN caller evidence before initial organization resolution and forwards its exact mutation expectation`
        // at nested evidence equality after 204; actor ID stayed unchanged through bind, no per-field authority claim.
        const retained = structuredClone(principal);
        const resolved = await organizations.resolve(retained);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: OPEN H2 (2026-11-14), Forwarding legacy instead of resolved access failed
        // `retains nested OPEN caller evidence before initial organization resolution and forwards its exact mutation expectation`
        // at captured scoped-access equality after 204; HTTP forwarding only, not database authority.
        const outcome = await workPackages.openWithin(params.id, retained, resolved.access);
        if (outcome.ok) return { ok: true, status: 204, body: EMPTY };
        // Proof: OPEN H3 (2026-11-14), Removing modeled-refusal projection failed
        // `forwards OPEN current refusal, hidden target and exact unknown failure without a legacy fallback`
        // at the first not_a_member 403 becoming not_found 404; later arms were not reached.
        if ('refusal' in outcome) return organizationRefusal(outcome);
        // Proof: OPEN H4 (2026-11-14), Removing scope-error projection failed
        // `forwards OPEN current refusal, hidden target and exact unknown failure without a legacy fallback`
        // at insufficient_scope 403 becoming 404 after four refusal assertions; hidden/unknown arms were not reached.
        if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
        return { ok: false, status: 404, body: { error: 'not_found' } };
      },
    ),
    bind(
      exportWorkPackage,
      async ({ params, query, principal }): Promise<HttpReply<typeof exportWorkPackage>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: reading through `workPackages.read` instead made `answers 404 alike
        // for a foreign and an absent work package, and changes nothing` in
        // `work-package-organization.controller.db.test.ts` answer 200 with the
        // foreign work package's Markdown; watched 2026-09-27.
        const captured = await workItems.exportWithin(params.id, resolved.access, planExports);
        if (captured.kind === 'access_refused') return organizationRefusal(captured.refusal);
        if (captured.kind === 'not_found')
          return { ok: false, status: 404, body: { error: 'not_found' } };
        if (captured.kind === 'engine_unavailable')
          return {
            ok: false,
            status: 409,
            body: { error: captured.error, engine: captured.engine },
          };
        if (query.format === 'markdown')
          return {
            ok: true,
            status: 200,
            text: workPackageMarkdown(captured.workPackage, captured.tree.workItems),
          };
        // Proof: independent work-package/catalog/marker rereads each failed mounted structured-export coherence.
        const exported =
          captured.kind === 'connected'
            ? planDocuments.exportConnectedCaptured(
                captured.workPackage,
                captured.tree,
                captured.observation,
              )
            : planDocuments.exportCaptured(captured.workPackage, captured.tree, captured.document);
        if (!exported.ok)
          return {
            ok: false,
            status: 409,
            body:
              // Proof: wrong shared mapping failed mounted sparse409 (mutation-shared-mapping.txt, 2026-10-17).
              exported.error === 'uncoded_steps'
                ? { error: exported.error, steps: exported.steps, command: exported.command }
                : { error: exported.error },
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
    bind(
      readWorkPackage,
      async ({ params, principal }): Promise<HttpReply<typeof readWorkPackage>> => {
        const retained = structuredClone(principal);
        const resolved = await organizations.resolve(retained);
        if (!resolved.ok) return organizationRefusal(resolved);
        const observed = await observation.read(
          { kind: 'human', principal: retained, expectedAccess: resolved.access },
          params.id,
        );
        if (!observed.ok) return organizationRefusal(observed);
        const found = observed.value;
        return found === null
          ? { ok: false, status: 404, body: { error: 'not_found' } }
          : { ok: true, status: 200, body: found };
      },
    ),
    bind(
      patchWorkPackage,
      async ({ params, body, principal }): Promise<HttpReply<typeof patchWorkPackage>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const outcome = await workPackages.updateWithin(
          params.id,
          principal,
          body,
          resolved.access,
        );
        if ('refusal' in outcome) return organizationRefusal(outcome);
        if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
        if (outcome.ok) return { ok: true, status: 200, body: { workPackage: outcome.value } };
        switch (outcome.reason) {
          case 'not_found':
            return { ok: false, status: 404, body: { error: outcome.reason } };
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              body: {
                error: outcome.reason,
                ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
              },
            };
          case 'not_overridable_here':
            return {
              ok: false,
              status: 409,
              body: { error: outcome.reason, key: outcome.key, level: outcome.level },
            };
          case 'bad_start_date':
          case 'bad_pert_weights':
          case 'invalid_abbreviation':
          case 'bad_budget_factor':
          case 'invalid_timezone':
            return { ok: false, status: 422, body: { error: outcome.reason } };
          // Proof: mapping this to 422 made the mounted unavailable-optimizer test receive 500 instead of 409.
          case 'optimizer_unavailable':
          case 'abbreviation_taken':
          case 'solution_taken':
            return { ok: false, status: 409, body: { error: outcome.reason } };
          case 'dependency_cycle':
            return { ok: false, status: 409, body: { error: outcome.reason } };
        }
      },
      { classifyRequestFailure: classifyBodyFailure },
    ),
    bind(
      retryWorkPackageOptimization,
      async ({
        params,
        body,
        principal,
      }): Promise<HttpReply<typeof retryWorkPackageOptimization>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const authorization = await workPackages.authorizeRetry(
          params.id,
          principal.id,
          resolved.access,
        );
        // Proof: bypassing authorization made the mounted foreign Retry open a connected read before its 404.
        if (!authorization.ok) {
          return authorization.reason === 'not_found'
            ? { ok: false, status: 404, body: { error: 'not_found' } }
            : {
                ok: false,
                status: 403,
                body: {
                  error: 'forbidden',
                  ...(authorization.permission === undefined
                    ? {}
                    : { permission: authorization.permission }),
                },
              };
        }
        // Proof: building input without this human scope made the crossing-row
        // Retry case answer 409 instead of 500 and could reveal a foreign chain.
        const captured = await workItems.optimizationInputWithin(params.id, resolved.access);
        if (captured.kind === 'access_refused') return organizationRefusal(captured.refusal);
        if (captured.kind === 'not_found')
          return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: bypassing this refusal attempted Retry with no canonical input
        // in the mounted engine/cycle/calendar-range cases. Injecting a live
        // optimizer read before it kept the 409 but wrote generation and slots;
        // the mounted full-state equality failed.
        if (captured.kind === 'unavailable')
          return {
            ok: false,
            status: 409,
            body: {
              code: 'schedule-input-unavailable',
              reason: captured.reason,
              workPackageId: captured.workPackageId,
            },
          };
        // Proof: removing this branch made mounted missing-calendar Retry return 500 instead of its typed 409.
        if (captured.kind === 'dependency_calendar_missing')
          return {
            ok: false,
            status: 409,
            body: {
              code: 'schedule-input-unavailable',
              reason: 'dependency_calendar_missing',
              workPackageId: params.id,
              workPackages: captured.workPackages,
            },
          };
        // Proof: removing idle handling made mounted held-target Retry return 500 instead of 409.
        if (captured.kind === 'idle' || optimizer === undefined) {
          return {
            ok: false,
            status: 409,
            body: { code: 'not-retryable', state: 'idle' },
          };
        }
        const outcome = await optimizer.retry({
          workPackageId: params.id,
          ...body,
          input: captured.input,
          ...(resolved.access.kind === 'scoped'
            ? {
                scoped: {
                  organizationId: resolved.access.scope.organizationId,
                  actorId: principal.id,
                  principal: resolved.access.principal,
                },
              }
            : {}),
        });
        switch (outcome.kind) {
          case 'forbidden':
            // Proof: omitting this permission failed mounted Retry after writer grant revocation, 2026-11-09.
            // Proof: retry-route-permission fault failed 'writer grant revocation' (connected-retry.controller.db.test.ts); restored GREEN, 2026-11-09.
            return {
              ok: false,
              status: 403,
              body: {
                error: 'forbidden',
                ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
              },
            };
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
