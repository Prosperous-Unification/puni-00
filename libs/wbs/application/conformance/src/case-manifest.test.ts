import { describe, expect, it } from 'bun:test';

import {
  CASE_MANIFEST,
  type CaseRegistration,
  type ExpectedCase,
  expectedCasesFor,
  SUPPLEMENTAL_CASE_MANIFEST,
} from './case-manifest';
import { runCases } from './case-runner';
import { certifyExecution } from './certification';
import { offeredDeclaration } from './source-declaration.test-support';

function passingRegistration(
  family: CaseRegistration['family'],
  caseId: CaseRegistration['caseId'],
): CaseRegistration {
  return {
    family,
    caseId,
    openAndRun: () =>
      Promise.resolve({
        fixtureId: `${family}:${caseId}`,
        assert: () => Promise.resolve(),
        close: () => Promise.resolve(),
      }),
  };
}

describe('the closed case manifest', () => {
  it('rejects a missing family', async () => {
    const declaration = offeredDeclaration();
    const expected = expectedCasesFor(declaration.historyAdmission);
    const registrations = expected
      .filter(({ family }) => family !== 'workPackages')
      .map(({ family, caseId }) => passingRegistration(family, caseId));
    const report = await runCases(registrations);

    // Proof: removing the registration exact-set check after the work packages kit
    // was removed failed here: expected `missing registered cases`, received
    // `missing case reports: workPackages: workPackages.create:steps`.
    expect(() => {
      certifyExecution({ declaration, registrations, report });
    }).toThrow('missing registered cases: workPackages: workPackages.create:steps');
  });

  it('rejects a duplicated case', async () => {
    const declaration = offeredDeclaration();
    const expected = expectedCasesFor(declaration.historyAdmission);
    const registrations = expected.map(({ family, caseId }) => passingRegistration(family, caseId));
    registrations.push(passingRegistration(expected[0].family, expected[0].caseId));
    const report = await runCases(registrations);

    // Proof: removing the registration duplicate check after duplicating the
    // first case failed here: expected `duplicate registered cases`, received
    // `duplicate case reports: workPackages: workPackages.create:steps`.
    expect(() => {
      certifyExecution({ declaration, registrations, report });
    }).toThrow('duplicate registered cases');
  });

  it('contains the complete source families and exact history mechanisms', () => {
    // Proof (2026-10-14): deleting the production blockage family failed this inventory;
    // replacing its case ID with blockages.set:broken failed the exact case assertion below.
    expect(Object.keys(CASE_MANIFEST)).toEqual([
      'livePlans',
      'workPackages',
      'spaces',
      'workPackageRanks',
      'accessDecisions',
      'users',
      'directory',
      'organizationLimits',
      'capacity',
      'resourceCapacity',
      'priorityBands',
      'settings',
      'calendarMarkers',
      'eventLog',
      'planEvents',
      'stepCatalogue',
      'steps',
      'workItems',
      'estimates',
      'actuals',
      'measures',
      'measureEstimates',
      'budgets',
      'progress',
      'attempts',
      'blockages',
      'stepParallels',
      'runtimeCommands',
      'claims',
      'demands',
      'dependencies',
      'typedDependencies',
      'subtrees',
      'journal',
      'savedPlans',
      'savedPlanCapture',
    ]);
    expect(CASE_MANIFEST.runtimeCommands).toEqual(['runtimeCommands.write:permanent-history']);
    expect(CASE_MANIFEST.stepParallels).toEqual(['stepParallels.set:sparse-replace-remove']);
    expect(CASE_MANIFEST.blockages).toEqual(['blockages.set:read-remove']);
    expect(CASE_MANIFEST.claims).toEqual([
      'claims.add:taken-stated-remove',
      'claims.listStampedByWorkPackage:write-instant',
      'claims.remove:delegated-cascade',
      'claims.moveAll:in-place',
      'claims.lease:write-renew-expire',
      'claims.observeWorkPackage:legacy-observation',
      'claims.lease:revoked-instant-read',
      'claims.lease:run-scoped',
      'claims.occupancy:hold-read-cascade',
      'claims.occupancy:organization-scope',
    ]);
    expect(SUPPLEMENTAL_CASE_MANIFEST).toEqual({
      common: ['history.batch:independent-commit', 'history.batch:independent-rollback'],
      immediateBusy: ['history.batch:busy-does-not-wait'],
      independentWrite: ['history.batch:interleaved-success-survives'],
    });
  });
});

it('requires executable settings cases in both source admission manifests', () => {
  const required: ExpectedCase[] = [
    { family: 'settings', caseId: 'settings.readTarget:actual-chain-and-scope' },
    { family: 'settings', caseId: 'settings.capture:inherited-and-detached' },
    { family: 'settings', caseId: 'settings.write:refusal-and-clear' },
    { family: 'settings', caseId: 'settings.packageIds:descendants-and-touch' },
  ];
  for (const admission of ['independent-write', 'immediate-busy'] as const) {
    const registered = expectedCasesFor(admission).filter(({ family }) => family === 'settings');
    expect(registered).toEqual(required);
  }
});
