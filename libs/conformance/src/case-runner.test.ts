import { describe, expect, it } from 'bun:test';

import { CASE_MANIFEST, type CaseRegistration } from './case-manifest';
import { runCases } from './case-runner';
import { certifyExecution } from './certification';
import { offeredDeclaration, passingRegistrations } from './source-declaration.test-support';

describe('case execution', () => {
  it('a declared body is not a passed body', async () => {
    const report = await runCases([{ family: 'projects', caseId: CASE_MANIFEST.projects[0] }]);

    // Proof: marking a declaration with no body passed failed here on
    // `Expected status: "incomplete"; Received: "passed"`.
    expect(report.cases).toEqual([
      expect.objectContaining({
        caseId: CASE_MANIFEST.projects[0],
        status: 'incomplete',
        executed: false,
      }),
    ]);
  });

  it('a failed close cannot certify its case', async () => {
    let assertionRan = false;
    const registration: CaseRegistration = {
      family: 'projects',
      caseId: CASE_MANIFEST.projects[0],
      openAndRun: () =>
        Promise.resolve({
          fixtureId: 'fixture:close-failure',
          assert: () => {
            assertionRan = true;
            return Promise.resolve();
          },
          close: () => Promise.reject(new Error('injected close failure')),
        }),
    };
    const declaration = offeredDeclaration();
    const registrations = passingRegistrations(declaration).map((candidate) =>
      candidate.caseId === registration.caseId ? registration : candidate,
    );
    const report = await runCases(registrations);

    expect(assertionRan).toBe(true);
    // Proof: marking the case passed in the cleanup-failure branch failed here:
    // expected `failed cases ... (cleanup: injected close failure)`; no throw.
    expect(() => {
      certifyExecution({
        declaration,
        registrations,
        report,
      });
    }).toThrow('failed cases: projects: projects.create:steps (cleanup: injected close failure)');
    expect(report.cases[0]?.status).toBe('failed');
    expect(report.cases[0]?.assertionPhase).toBe('cleanup');
    expect(report.cases[0]?.failure).toBe('injected close failure');
  });

  it('focused execution reports partial', async () => {
    const first = CASE_MANIFEST.projects[0];
    const second = CASE_MANIFEST.projects[1];
    const registrations: CaseRegistration[] = [first, second].map((caseId) => ({
      family: 'projects',
      caseId,
      openAndRun: () =>
        Promise.resolve({
          fixtureId: `fixture:${caseId}`,
          assert: () => Promise.resolve(),
          close: () => Promise.resolve(),
        }),
    }));
    const report = await runCases(registrations, { focus: [first] });

    // Proof: reporting every run as full failed here on
    // `Expected: "partial"; Received: "full"`.
    expect(report.kind).toBe('partial');
    expect(report.cases.map(({ caseId }) => caseId)).toEqual([first]);
  });
});
