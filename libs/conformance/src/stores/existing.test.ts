import { describe, expect, it } from 'bun:test';

import { existingStoreRegistrations } from '../source-conformance';

describe('the migrated existing store kits', () => {
  it('preserves the original IDs and adds each completed family inventory', () => {
    const unopened = () => Promise.reject(new Error('ID inventory must not open a fixture'));
    const registrations = existingStoreRegistrations({
      projects: unopened,
      users: unopened,
      capacity: unopened,
      priorityBands: unopened,
      calendarMarkers: unopened,
      workItems: unopened,
      steps: unopened,
      estimates: unopened,
      actuals: unopened,
      directory: unopened,
      eventLog: unopened,
    });

    // Proof: before estimate ownership and actualRegistrations joined the
    // production catalog, this failed with their five IDs absent
    // (`Expected - 5 / Received + 0`).
    expect(registrations.map(({ caseId }) => caseId)).toEqual([
      'projects.create:steps',
      'projects.update:scope',
      'projects.recordOpen:reader-order',
      'users.create:unique-name',
      'users.find:identity',
      'users.resolveOidcIdentity:issuer-subject',
      'users.resolveOidcIdentity:verified-conflict',
      'capacity.set:project-team-key',
      'capacity.set:clear',
      'capacity.set:missing-reference',
      'priorityBands.listFor:defaults',
      'priorityBands.replace:whole-project',
      'priorityBands.replace:missing-project',
      'calendarMarkers.listFor:total-order',
      'calendarMarkers.write:project-scope',
      'workItems.insert:respace',
      'workItems.patch:refusal-atomic',
      'workItems.move:parent-position',
      'workItems.remove:promotion',
      'workItems.setFrozenNumbers:clear',
      'steps.add',
      'steps.rename',
      'steps.rename:unknown',
      'estimates.set',
      'estimates.set:replace',
      'estimates.set:unknown_step',
      'estimates.remove',
      'estimates.moveAll:ownership',
      'actuals.set:replace',
      'actuals.remove:pair',
      'actuals.moveAll:ownership',
      'actuals.set:unknown_step',
      'directory.addTag',
      'directory.assign:unknown_person',
      'eventLog.recordEvent',
      'eventLog.rangeSince',
      'eventLog.pruneBeyond',
    ]);
  });
});
