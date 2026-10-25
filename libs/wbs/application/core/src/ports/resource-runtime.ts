import type {
  ResourceAuthority,
  ResourceCleanupRequest,
  ResourceRuntimeAdmission,
  ResourceRuntimeAdmissionReceipt,
  ResourceRuntimeEvent,
} from '@wbs/contracts';

import type { ResourceUseActor, ResourceUseAnswer } from './resource-uses';
export interface ResourceRuntimeActor extends ResourceUseActor {
  credentialId: string | null;
}
/** Credential-bound runtime attestation and durable request consumption, separate from worker reports. */
export interface ResourceRuntime {
  bind(
    authorityId: string,
    actor: ResourceRuntimeActor,
    binding: { providerId: string; credentialId: string; epoch: string },
    at: number,
  ): Promise<ResourceUseAnswer<ResourceAuthority>>;
  read(
    authorityId: string,
    actor: ResourceRuntimeActor,
  ): Promise<ResourceUseAnswer<ResourceAuthority>>;
  admit(
    authorityId: string,
    actor: ResourceRuntimeActor,
    admission: ResourceRuntimeAdmission,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceRuntimeAdmissionReceipt>>;
  ingest(
    authorityId: string,
    actor: ResourceRuntimeActor,
    event: ResourceRuntimeEvent,
    at: number,
  ): Promise<ResourceUseAnswer<{ acceptedSequence: number; useId: string; revision: number }>>;
  requests(
    authorityId: string,
    actor: ResourceRuntimeActor,
    after: number,
    limit: number,
  ): Promise<ResourceUseAnswer<{ requests: ResourceCleanupRequest[]; nextCursor: string | null }>>;
}
