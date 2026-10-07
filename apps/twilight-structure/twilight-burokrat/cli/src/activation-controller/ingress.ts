import { readBootstrapConfiguration, type TrustedBootstrapPin } from './bootstrap';
import {
  type ActivationRequest,
  type ActivationRequestInput,
  createActivationRequest,
  requireCurrentRequest,
} from './request';

export type ObservedActivationCandidate = Omit<
  ActivationRequestInput,
  'auditGeneration' | 'authorityIdentity'
>;

/**
 * Freezes controller-observed candidate identities with the generation of independently pinned
 * bootstrap bytes. A caller must acquire these observations through trusted repository APIs.
 */
export function prepareObservedRequest(
  bootstrapPath: string,
  pin: TrustedBootstrapPin,
  observed: ObservedActivationCandidate,
): ReturnType<typeof createActivationRequest> {
  const bootstrap = readBootstrapConfiguration(bootstrapPath, pin);
  return createActivationRequest({
    ...observed,
    authorityIdentity: pin.identity,
    auditGeneration: bootstrap.authorityGeneration,
  });
}

/** Re-observes pinned authority and candidate while retaining the persisted subject audit generation. */
export function assertObservedRequestCurrent(
  persisted: ActivationRequest,
  bootstrapPath: string,
  pin: TrustedBootstrapPin,
  observed: ObservedActivationCandidate,
): void {
  // Proof: reconstructing auditGeneration from bootstrap authorityGeneration rejected a valid reopened subject.
  readBootstrapConfiguration(bootstrapPath, pin);
  const current = createActivationRequest({
    ...observed,
    authorityIdentity: pin.identity,
    auditGeneration: persisted.auditGeneration,
  });
  requireCurrentRequest(persisted, current.request);
}
