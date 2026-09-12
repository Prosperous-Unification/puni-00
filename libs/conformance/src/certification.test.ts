import { describe, expect, it } from 'bun:test';

import { CASE_MANIFEST } from './case-manifest';
import { runCases } from './case-runner';
import { certifyExecution, certifySourceReport, SOURCE_CONFORMANCE_CASES } from './certification';
import { offeredDeclaration, passingRegistrations } from './source-declaration.test-support';

describe('terminal certification', () => {
  it('rejects not-offered status for an offered case', async () => {
    const declaration = offeredDeclaration();
    const registrations = passingRegistrations(declaration);
    const execution = await runCases(registrations);
    const report = {
      ...execution,
      cases: execution.cases.map((record, index) =>
        index === 0 ? { ...record, status: 'not-offered' as const } : record,
      ),
    };

    // Proof: removing capability/status correlation failed here: expected
    // `capability status mismatch`; function did not throw.
    expect(() => {
      certifyExecution({
        declaration,
        registrations,
        report,
      });
    }).toThrow('capability status mismatch');
  });

  it('refuses a body that was declared but never invoked', async () => {
    const declaration = offeredDeclaration();
    const registrations = passingRegistrations(declaration).map((registration) =>
      registration.caseId === CASE_MANIFEST.projects[0]
        ? { family: registration.family, caseId: registration.caseId }
        : registration,
    );
    const report = await runCases(registrations);

    // Proof: removing the incomplete-status refusal after skipping body
    // invocation failed here: expected `incomplete cases`; function did not throw.
    expect(() => {
      certifyExecution({
        declaration,
        registrations,
        report,
      });
    }).toThrow('incomplete cases');
  });
});

describe('source certification coverage', () => {
  it('names the source and every missing case when a kit registration disappears', () => {
    const registered = SOURCE_CONFORMANCE_CASES.slice(3);

    // Proof: deleting the step kit registration from `sourceConformance`
    // failed the real memory-source report on `in-memory certification missing
    // cases: steps.add, steps.rename, steps.rename:unknown`.
    expect(() => {
      certifySourceReport('memory', {
        ran: [...registered],
        skipped: [],
      });
    }).toThrow('memory certification missing cases: steps.add, steps.rename, steps.rename:unknown');
  });
});
