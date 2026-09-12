import { describe, expect, it } from 'bun:test';

import { CASE_MANIFEST } from './case-manifest';
import { type ExecutionReport, runCases } from './case-runner';
import { certifyExecution } from './certification';
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
    } as unknown as ExecutionReport;

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

  it('refuses a declaration-only case relabeled as passed', async () => {
    const declaration = offeredDeclaration();
    const registrations = passingRegistrations(declaration).map((registration, index) =>
      index === 0 ? { family: registration.family, caseId: registration.caseId } : registration,
    );
    const execution = await runCases(registrations);
    const report = {
      ...execution,
      cases: execution.cases.map((record, index) =>
        index === 0 ? { ...record, status: 'passed' } : record,
      ),
    } as unknown as ExecutionReport;

    expect(() => {
      certifyExecution({ declaration, registrations, report });
    }).toThrow('invalid execution evidence');
  });

  it('refuses a passed case with missing lifecycle evidence', async () => {
    const declaration = offeredDeclaration();
    const registrations = passingRegistrations(declaration);
    const execution = await runCases(registrations);
    const report = {
      ...execution,
      cases: execution.cases.map((record, index) =>
        index === 0
          ? {
              family: record.family,
              caseId: record.caseId,
              status: 'passed',
              executed: true,
            }
          : record,
      ),
    } as unknown as ExecutionReport;

    expect(() => {
      certifyExecution({ declaration, registrations, report });
    }).toThrow('invalid execution evidence');
  });

  it('refuses passed evidence paired with a declaration-only registration', async () => {
    const declaration = offeredDeclaration();
    const executedRegistrations = passingRegistrations(declaration);
    const report = await runCases(executedRegistrations);
    const registrations = executedRegistrations.map((registration, index) =>
      index === 0 ? { family: registration.family, caseId: registration.caseId } : registration,
    );

    // Proof: removing the body-presence check certified this untouched pass;
    // expected `invalid execution evidence`, received no throw.
    expect(() => {
      certifyExecution({ declaration, registrations, report });
    }).toThrow('invalid execution evidence');
  });

  it('refuses a pass recorded before successful cleanup', async () => {
    const declaration = offeredDeclaration();
    const registrations = passingRegistrations(declaration);
    const execution = await runCases(registrations);
    const report = {
      ...execution,
      cases: execution.cases.map((record, index) =>
        index === 0 ? { ...record, assertionPhase: 'assertion' } : record,
      ),
    } as unknown as ExecutionReport;

    expect(() => {
      certifyExecution({ declaration, registrations, report });
    }).toThrow('invalid execution evidence');
  });
});
