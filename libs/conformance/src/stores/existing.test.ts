import { describe, expect, it } from 'bun:test';

import { existingStoreRegistrations } from '../source-conformance';

describe('the migrated existing store kits', () => {
  it('preserves the original IDs and adds project, user, configuration, and marker cases', () => {
    const unopened = () => Promise.reject(new Error('ID inventory must not open a fixture'));
    const registrations = existingStoreRegistrations({
      projects: unopened,
      users: unopened,
      capacity: unopened,
      priorityBands: unopened,
      calendarMarkers: unopened,
      steps: unopened,
      estimates: unopened,
      directory: unopened,
      eventLog: unopened,
    });

    // Proof: before calendarMarkerRegistrations joined the production catalog,
    // this failed with both calendarMarkers IDs absent (Expected -2 / Received +0).
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
      'steps.add',
      'steps.rename',
      'steps.rename:unknown',
      'estimates.set',
      'estimates.set:replace',
      'estimates.set:unknown_step',
      'estimates.remove',
      'directory.addTag',
      'directory.assign:unknown_person',
      'eventLog.recordEvent',
      'eventLog.rangeSince',
      'eventLog.pruneBeyond',
    ]);
  });
});
