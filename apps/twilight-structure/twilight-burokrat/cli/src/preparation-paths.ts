import type { Request } from './grammar-facade';
import { anchorPath } from './validator-paths';

type Activation = Extract<Request, { command: 'prepare-activation' }>;
type Relocation = Extract<Request, { command: 'prepare-relocation-activation' }>;
type Preparation = Activation | Relocation;

/**
 * Preserve captured caller context for host inputs without changing repository selectors or
 * opaque identities. Unselected options retain provider defaults. The typed preparers subsequently
 * apply their existing resolve semantics; this does not change their filesystem normalization.
 * Proof: independently removing each of 13 host anchors, anchoring five selectors/six identities,
 * inventing a default or dropping parser-owned undefined failed the named contracts in
 * preparation-paths.test.ts (26 restored faults).
 */
export function anchorPreparation(request: Activation, callerDirectory: string): Activation;
export function anchorPreparation(request: Relocation, callerDirectory: string): Relocation;
export function anchorPreparation(request: Preparation, callerDirectory: string): Preparation;
export function anchorPreparation(request: Preparation, callerDirectory: string): Preparation {
  switch (request.command) {
    case 'prepare-activation':
      return {
        ...request,
        candidateRepository: anchorPath(request.candidateRepository, callerDirectory),
        reviewRecord: anchorPath(request.reviewRecord, callerDirectory),
        auditStrata: anchorPath(request.auditStrata, callerDirectory),
        destination: anchorPath(request.destination, callerDirectory),
        work: anchorPath(request.work, callerDirectory),
        checkRuns: anchorPath(request.checkRuns, callerDirectory),
        ...(request.toolkit === undefined
          ? {}
          : { toolkit: anchorPath(request.toolkit, callerDirectory) }),
      };
    case 'prepare-relocation-activation':
      return {
        ...request,
        candidateRepository: anchorPath(request.candidateRepository, callerDirectory),
        baseActivation: anchorPath(request.baseActivation, callerDirectory),
        reviewRecord: anchorPath(request.reviewRecord, callerDirectory),
        destination: anchorPath(request.destination, callerDirectory),
        work: anchorPath(request.work, callerDirectory),
        checkRuns: anchorPath(request.checkRuns, callerDirectory),
      };
  }
}
