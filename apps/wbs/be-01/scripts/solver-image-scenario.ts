import { buildSolverRequest, type BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
import { parseSolverResponse } from '@wbs/contracts/solver/parse-solver-response';
import { quantisedFastBaseline } from '@wbs/contracts/solver/quantised-baseline';
import { revalidateSolverResult } from '@wbs/contracts/solver/revalidate-solver-result';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

/** The successful production builder's wire request. */
export type ImageSolverRequest = Extract<BuiltSolverRequest, { readonly ok: true }>['request'];

/** A one-slice target whose assigned person is booked by a higher-ranked plan until day 1.01. */
export function sharedPersonRequest(): ImageSolverRequest {
  const plan: ScheduleInput = {
    rows: [{ id: 'target', parentId: null, position: 0, frozenNumber: null, priority: null }],
    // Proof: replacing Ana with null made both scenario tests fail: the wire lost her identity
    // and an overlapping feasible answer no longer tripped the person constraint.
    slices: [
      { workItemId: 'target', stepId: null, days: 1, personId: 'ana', width: 1, poolIds: [] },
    ],
    edges: [],
    typed: [],
    reach: 'whole-item',
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
    // Proof: replacing the fixed interval with [] made both scenario tests fail: the wire lost
    // [0, 49] and the overlapping feasible answer was no longer rejected.
    elsewhere: new Map([
      ['ana', [{ start: 0, end: 1.01, projectId: 'higher', workItemId: 'held' }]],
    ]),
  };
  const baselineOffsets = quantisedFastBaseline(
    plan.rows,
    plan.edges,
    plan.slices,
    plan.notBefore,
    plan.poolSizes,
    plan.reach,
    plan.typed,
    plan.elsewhere,
    plan.resourceCapacities,
  );
  const built = buildSolverRequest(plan, 'pri', {
    baselineOffsets,
    solverVersion: '0.3.0',
    budgetMs: 30_000,
  });
  if (!built.ok) throw new Error(`shared-person image scenario: ${built.failure}: ${built.detail}`);
  return built.request;
}

/** The image smoke needs a publishable answer to the request it actually sent. */
export function verifyImageSolverResponse(request: ImageSolverRequest, stdout: string): void {
  const parsed = parseSolverResponse(stdout);
  if (!parsed.ok) throw new Error(`solver image response ${parsed.failure}: ${parsed.detail}`);
  // Proof: removing this status refusal made the unknown/infeasible test fail: it no longer
  // received the required non-publishing diagnosis.
  if (parsed.response.status !== 'feasible') {
    throw new Error(`solver image response is not feasible: ${parsed.response.status}`);
  }
  // Proof: replacing revalidation with an unconditional published verdict made the overlap
  // test fail; the real digest image with Python's fixed-booking insertion removed produced
  // unit 0 and this call rejected it as assignee-double-booked.
  const checked = revalidateSolverResult(request, parsed.response);
  if (!checked.ok) throw new Error(`solver image response ${checked.failure}: ${checked.detail}`);
}
