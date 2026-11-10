import type {
  ResourceAuthority,
  ResourceCleanupRequest,
  ResourceRuntimeAdmission,
  ResourceRuntimeAdmissionReceipt,
  ResourceRuntimeEvent,
} from '@wbs/contracts';

import {
  assertResourceUseActor,
  type ResourceUseActor,
  type ResourceUseAnswer,
  retainResourceUseActor,
} from './resource-uses';
export interface ResourceRuntimeActor extends ResourceUseActor {
  credentialId: string | null;
}
/** Rejects trusted key substitution before reading the authority; account/consent have no runtime machine key. */
export function assertResourceRuntimeActor(actor: ResourceRuntimeActor): void {
  assertResourceUseActor(actor);
  const authentication = actor.principal.authentication;
  const credentialId = authentication?.kind === 'machine' ? authentication.credentialId : null;
  // Proof: tuple-runtime-key.
  // The recorded fault broke `rejects direct runtime requests account credential mismatch before reads`; restored GREEN.
  if (actor.credentialId !== credentialId)
    throw new Error('resource runtime credential differs from the authenticated principal');
}

/** Detaches a previously checked runtime actor before queueing; no credential binding or token fields are copied. */
export function retainResourceRuntimeActor(actor: ResourceRuntimeActor): ResourceRuntimeActor {
  return { ...retainResourceUseActor(actor), credentialId: actor.credentialId };
}

/**
 * Credential-bound runtime attestation and durable request consumption.
 * Personal bind/read requires current manage_directory; fresh live admission and
 * live planning mutations additionally require the actual credential's package.write.
 * Exact replay, first provisional confirmation, deleted-package cleanup, host jobs
 * and requests retain only current bound infrastructure authority, even after grants
 * or planning references disappear. No personal orphan permission applies to them.
 */
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
