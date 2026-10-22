import type { ScopedDependencyEndpoint } from '@wbs/domain';

import type { DependencyGraphGuard } from '../service/dependency-graph';
import type { EditAdmission } from './edit-admission';
import type { ResourceAccess } from './organization-access';
import type { Step } from './step-store';

/** An exact work-item identity; row IDs alone never establish project authority. */
export interface WorkItemAddress {
  readonly projectId: string;
  readonly workItemId: string;
}

/** A detached revision checked through the same endpoint authority as an authored link. */
export interface ScopedRevision extends WorkItemAddress {
  readonly revision: number;
}

/** Detached endpoint facts; no writer, public tree, scheduler or live service escapes. */
export interface EndpointEvidence {
  readonly endpoint: ScopedDependencyEndpoint;
  readonly isLeaf: boolean;
  readonly revision: number;
  readonly name: string;
  readonly projectAbbreviation: string;
  readonly workItemNumber: string;
  readonly step: Pick<Step, 'id' | 'name' | 'code' | 'position'> | null;
}

/** Read authority bound to one admitted owner, actor and observation lifetime. */
export interface DependencyEndpointEvidence {
  readEndpoint(
    endpoint: ScopedDependencyEndpoint,
  ): Promise<
    | { readonly ok: true; readonly evidence: EndpointEvidence }
    | { readonly ok: false; readonly reason: 'not_found' | 'forbidden' | 'unknown_step' }
  >;
  readRevisions(
    addresses: readonly WorkItemAddress[],
  ): Promise<
    | { readonly ok: true; readonly revisions: readonly ScopedRevision[] }
    | { readonly ok: false; readonly reason: 'not_found' | 'forbidden' }
  >;
}

/** Fresh authority already established inside the current writer observation. */
export interface CommandGraphAuthority {
  readonly projectId: string | null;
  readonly actorId: string;
  readonly access: ResourceAccess;
  readonly admission: EditAdmission;
}

/** Exact capabilities installed into one command graph. */
export interface DependencyContext {
  readonly graph: DependencyGraphGuard;
  readonly endpoints: DependencyEndpointEvidence;
  /** Throws for a different owner/actor or a closed graph/observation. */
  assertUsable(projectId: string, actorId: string): void;
}

/** Process services open explicit local observations; admitted services retain their exact context. */
export type ServiceDependencyContext =
  | { readonly kind: 'bound'; readonly context: DependencyContext }
  | {
      readonly kind: 'local-only';
      readonly withContext: <T>(
        projectId: string,
        actorId: string,
        act: (context: DependencyContext) => Promise<T>,
      ) => Promise<T>;
    };

/** Runs under an exact bound context or a fresh explicitly local operation lifetime. */
export async function withDependencyContext<T>(
  source: ServiceDependencyContext,
  projectId: string,
  actorId: string,
  act: (context: DependencyContext) => Promise<T>,
): Promise<T> {
  switch (source.kind) {
    case 'bound': {
      source.context.assertUsable(projectId, actorId);
      const value = await act(source.context);
      source.context.assertUsable(projectId, actorId);
      return value;
    }
    case 'local-only':
      return source.withContext(projectId, actorId, act);
    default:
      throw new Error('unknown service dependency context');
  }
}
