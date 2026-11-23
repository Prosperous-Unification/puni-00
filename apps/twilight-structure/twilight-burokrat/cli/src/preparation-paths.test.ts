import { describe, expect, it } from 'bun:test';

import type { Request } from './grammar-facade';
import { anchorPreparation } from './preparation-paths';

type Activation = Extract<Request, { command: 'prepare-activation' }>;
type Relocation = Extract<Request, { command: 'prepare-relocation-activation' }>;
const callerDirectory = '/captured caller = context';
const activation: Activation = {
  command: 'prepare-activation',
  candidateRepository: './candidate/../repository',
  candidateSha: 'a'.repeat(40),
  toolkit: './toolkit/../selected',
  candidatePolicy: 'policy/../candidate-policy.json',
  candidateMapping: 'mapping/../candidate-mapping.json',
  reviewRecord: '../review.json',
  auditStrata: './audit-strata.json',
  destination: 'destination',
  work: './work/../selected-work',
  resourceLane: 'operator lane',
  cwdIdentity: 'opaque cwd identity',
  checkRuns: './check-runs.json',
};
const relocation: Relocation = {
  command: 'prepare-relocation-activation',
  candidateRepository: './candidate/../repository',
  candidateSha: 'b'.repeat(40),
  baseActivation: './base/../activation',
  reviewRecord: '../review.json',
  destination: 'destination',
  work: './work/../selected-work',
  resourceLane: 'operator lane',
  cwdIdentity: 'opaque cwd identity',
  checkRuns: './check-runs.json',
  candidatePolicy: 'policy/../candidate-policy.json',
  candidateLauncher: 'bin/../launcher.ts',
  validatorEntry: 'src/../validator.ts',
};

describe('typed preparation caller paths', () => {
  it('anchors toolkit host paths while retaining repository selectors and opaque identities', () => {
    expect(anchorPreparation(activation, callerDirectory)).toEqual({
      ...activation,
      candidateRepository: callerDirectory + '/./candidate/../repository',
      toolkit: callerDirectory + '/./toolkit/../selected',
      reviewRecord: callerDirectory + '/../review.json',
      auditStrata: callerDirectory + '/./audit-strata.json',
      destination: callerDirectory + '/destination',
      work: callerDirectory + '/./work/../selected-work',
      checkRuns: callerDirectory + '/./check-runs.json',
    });
  });

  it('anchors relocation host paths while retaining its three repository selectors', () => {
    expect(anchorPreparation(relocation, callerDirectory)).toEqual({
      ...relocation,
      candidateRepository: callerDirectory + '/./candidate/../repository',
      baseActivation: callerDirectory + '/./base/../activation',
      reviewRecord: callerDirectory + '/../review.json',
      destination: callerDirectory + '/destination',
      work: callerDirectory + '/./work/../selected-work',
      checkRuns: callerDirectory + '/./check-runs.json',
    });
  });

  it('does not mutate the parsed request or invent a toolkit selection', () => {
    const request: Activation = { ...activation, toolkit: undefined };
    const before = structuredClone(request);
    const anchored = anchorPreparation(request, callerDirectory);
    expect(request).toEqual(before);
    expect(Object.hasOwn(anchored, 'toolkit')).toBe(true);
    expect(anchored.toolkit).toBeUndefined();
  });

  it('preserves parser-owned undefined options and relocation provider defaults', () => {
    const request: Relocation = {
      ...relocation,
      candidatePolicy: undefined,
      candidateLauncher: undefined,
      validatorEntry: undefined,
    };
    const anchored = anchorPreparation(request, callerDirectory);
    for (const field of ['candidatePolicy', 'candidateLauncher', 'validatorEntry'] as const) {
      expect(Object.hasOwn(anchored, field)).toBe(true);
      expect(anchored[field]).toBeUndefined();
    }
    const withUndefined = anchorPreparation({ ...activation, toolkit: undefined }, callerDirectory);
    expect(Object.hasOwn(withUndefined, 'toolkit')).toBe(true);
    expect(withUndefined.toolkit).toBeUndefined();
  });

  it('retains already absolute host inputs verbatim', () => {
    const request: Activation = {
      ...activation,
      candidateRepository: '/selected/../repository',
      toolkit: '/trusted/../toolkit',
      reviewRecord: '/review/../record.json',
      auditStrata: '/audit/../strata.json',
      destination: '/output/../destination',
      work: '/output/../work',
      checkRuns: '/checks/../runs.json',
    };
    expect(anchorPreparation(request, callerDirectory)).toEqual(request);
  });
});
