import type {
  ResourceUse,
  ResourceUseEvent,
  ResourceUseEventDraft,
  ResourceUseRegistration,
  ResourceUseState,
} from '@wbs/domain';

import type { ResourceAccess } from './organization-access';
/** Verified request identity. The fingerprint distinguishes machine credentials from their issuing account. */
export interface ResourceUseActor {
  id: string;
  fingerprint: string;
  personId: string | null;
  access: ResourceAccess;
}
export type ResourceUseRefusal = 'not_found' | 'forbidden' | 'conflict' | 'invalid_body';
export type ResourceUseAnswer<T> =
  { ok: true; value: T } | { ok: false; reason: ResourceUseRefusal };
export interface ResourceUsePage {
  cursor?: string;
  limit: number;
  workItemId?: string;
  state?: ResourceUseState;
}
/** Durable reported uses, outside plan undo and capacity. Each write rechecks access and commits projection and history together. */
export interface ResourceUses {
  register(
    projectId: string,
    actor: ResourceUseActor,
    draft: ResourceUseRegistration,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceUse>>;
  append(
    projectId: string,
    useId: string,
    actor: ResourceUseActor,
    draft: ResourceUseEventDraft,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceUse>>;
  list(
    projectId: string,
    actor: ResourceUseActor,
    page: ResourceUsePage,
  ): Promise<ResourceUseAnswer<{ uses: ResourceUse[]; nextCursor: string | null }>>;
  history(
    projectId: string,
    useId: string,
    actor: ResourceUseActor,
    page: ResourceUsePage,
  ): Promise<ResourceUseAnswer<{ events: ResourceUseEvent[]; nextCursor: string | null }>>;
}
