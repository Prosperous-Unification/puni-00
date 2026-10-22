import { describe, expect, it } from 'bun:test';

import type { CaseId } from '../case-manifest';
import { SOURCE_CONFORMANCE_CASES } from '../certification';
import {
  type SourceConformanceOpeners,
  sourceConformanceRegistrations,
} from '../source-conformance';

describe('the migrated existing store kits', () => {
  it('preserves the original IDs and adds each completed family inventory', () => {
    const unopened = () => Promise.reject(new Error('ID inventory must not open a fixture'));
    const openers = {
      projects: unopened,
      users: unopened,
      capacity: unopened,
      resourceCapacity: unopened,
      priorityBands: unopened,
      calendarMarkers: unopened,
      workItems: unopened,
      steps: unopened,
      estimates: unopened,
      actuals: unopened,
      measures: unopened,
      progress: unopened,
      attempts: unopened,
      blockages: unopened,
      stepParallels: unopened,
      claims: unopened,
      demands: unopened,
      dependencies: unopened,
      typedDependencies: unopened,
      directory: unopened,
      eventLog: unopened,
      planEvents: unopened,
      subtrees: unopened,
      journal: unopened,
      savedPlans: unopened,
      savedPlanCapture: unopened,
      historyBatch: unopened,
    } satisfies SourceConformanceOpeners;
    const memoryRegistrations = sourceConformanceRegistrations(
      { historyAdmission: 'independent-write' },
      openers,
    );
    const sqliteRegistrations = sourceConformanceRegistrations(
      { historyAdmission: 'immediate-busy' },
      openers,
    );
    const registrations = memoryRegistrations.slice(0, -3);

    // Proof: before subtreeRegistrations joined the production catalog, this
    // failed with both subtree IDs absent (`Expected - 2 / Received + 0`).
    // Proof: removing journalRegistrations from the production catalog failed
    // here with both journal IDs absent (`Expected - 2 / Received + 0`).
    // Proof: before Task 5.2's three registrations existed, this failed with
    // exactly those three IDs absent (`Expected - 3 / Received + 0`).
    // Proof: before savedPlanRegistrations joined the production catalog, this
    // failed with exactly the two Task 6.1 IDs absent (`Expected - 2 / Received + 0`).
    // Proof: removing the production sparse registration failed this exact inventory (2026-10-17).
    // Proof: with both claim IDs absent from SOURCE_CONFORMANCE_CASES, the implemented
    // inventory below failed `Expected - 2 / Received + 0`; watched 2026-10-19.
    expect(registrations.map(({ caseId }) => caseId)).toEqual([
      'livePlans.read:legacy-and-absence',
      'projects.create:steps',
      'projects.update:scope',
      'projects.recordOpen:reader-order',
      'projectRanks.orderIn:scoped-move',
      'users.create:unique-name',
      'users.find:identity',
      'users.resolveOidcIdentity:issuer-subject',
      'users.resolveOidcIdentity:verified-conflict',
      'capacity.set:project-team-key',
      'capacity.set:clear',
      'capacity.set:missing-reference',
      'resourceCapacity.set:stated-zero-cleared',
      'resourceCapacity.set:missing-reference',
      'priorityBands.listFor:defaults',
      'priorityBands.replace:whole-project',
      'priorityBands.replace:missing-project',
      'calendarMarkers.listFor:total-order',
      'calendarMarkers.write:project-scope',
      'workItems.listByIds:labels-scope',
      'workItems.listPlacements:source-order',
      'workItems.insert:respace',
      'workItems.patch:refusal-atomic',
      'workItems.move:parent-position',
      'workItems.remove:promotion',
      'workItems.setFrozenNumbers:clear',
      'steps.add',
      'steps.rename',
      'steps.rename:unknown',
      'estimates.listByWorkItems:scope-order',
      'estimates.listPlacements:source-order',
      'estimates.set',
      'estimates.set:replace',
      'estimates.set:unknown_step',
      'estimates.remove',
      'estimates.moveAll:ownership',
      'actuals.listPlacements:source-order',
      'actuals.listByWorkItems:scope-order',
      'actuals.set:replace',
      'actuals.remove:pair',
      'actuals.moveAll:ownership',
      'actuals.set:unknown_step',
      'measures.listPlacements:source-order',
      'measures.listByWorkItems:scope-order',
      'measures.set:metric-key',
      'measures.remove:metric-key',
      'measures.moveAll:all-metrics',
      'measures.set:unknown_step',
      'progress.listPlacements:source-order',
      'progress.listByWorkItems:scope-order',
      'progress.set:replace',
      'progress.remove:absence',
      'progress.moveAll:ownership',
      'progress.set:unknown_step',
      'attempts.start:number-and-running',
      'attempts.start:never-reuses',
      'attempts.moveAll:ownership',
      'attempts.moveAll:issued',
      'blockages.set:read-remove',
      'stepParallels.set:sparse-replace-remove',
      'claims.add:taken-stated-remove',
      'claims.listStampedByProject:write-instant',
      'claims.remove:delegated-cascade',
      'claims.moveAll:in-place',
      'claims.occupancy:hold-read-cascade',
      'demands.set:replace-clear-scope',
      'demands.set:missing-reference',
      'dependencies.listByWorkItems:incident-scope',
      'dependencies.add:idempotent-pair',
      'dependencies.remove:pair',
      'dependencies.removeAllFor:touching-set',
      'typedDependencies.write:identity-and-bulk',
      'directory.addTag',
      'directory.assign:unknown_person',
      'directory.assign:scope-replace-clear',
      'directory.patchTeam:atomic-refusal',
      'directory.patchPerson:account-binding',
      'directory.patchPerson:owned-binding',
      'directory.credentialPinOf:unlinked',
      'directory.removePerson:claims-in-use',
      'directory.removePerson:delegated-claims',
      'directory.removePerson:pinned-credential',
      'directory.addResource:taken',
      'directory.setResourceProvider:unknown-and-clear',
      'directory.removeResource:in-use-cascade',
      'eventLog.recordEvent',
      'eventLog.rangeSince',
      'eventLog.pruneBeyond',
      'eventLog.pruneBeyond:empty-sequence',
      'planEvents.listFor:filters-order',
      'planEvents.pruneOlderThan:strict-cutoff',
      'subtrees.insertSubtree:complete-copy',
      'subtrees.insertSubtree:late-failure',
      'journal.append:history-atomic',
      'journal.append:account-redo-depth',
      'journal.flip:preconditions',
      'savedPlans.write:bytes-and-bodies',
      'savedPlans.write:quota-refusal',
      'savedPlans.write:quota-window',
      'savedPlans.touch:principals-scope',
      'savedPlans.write:late-body-failure',
      'savedPlanCapture.readPlanInput:complete',
      'savedPlanCapture.readPlanInput:coherent-interleave',
      'savedPlanCapture.readPlanInput:missing-project',
      'savedPlanCapture.readPlanInput:detached',
    ]);
    // Proof: before the independent implemented inventory was repaired, this
    // complete equality failed with the five work-item and two directory IDs absent.
    // Proof: removing the independent sparse ID failed this equality (2026-10-17).
    const implementedCaseIds: CaseId[] = [...SOURCE_CONFORMANCE_CASES];
    expect(implementedCaseIds).toEqual([
      ...sqliteRegistrations.map(({ caseId }) => caseId),
      'history.batch:interleaved-success-survives',
    ]);
  });
});
