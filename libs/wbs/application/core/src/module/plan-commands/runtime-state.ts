import type {
  AuthenticatedUser,
  RuntimeBasis,
  RuntimeObservation,
  RuntimeReadRefusal,
} from '@wbs/contracts';
import { describeRuntimeBasis, type RuntimeBasisInput } from '@wbs/domain';

import type { ResourceAccess } from '../../ports/organization-access';
import type { Digest } from '../../ports/runtime';

export type { RuntimeObservation, RuntimeReadRefusal } from '@wbs/contracts';

/** Authenticated request context; scope comes from existing server-resolved access. */
export interface RuntimeContext {
  readonly projectId: string;
  readonly personId: string;
  readonly actor: AuthenticatedUser;
  readonly access: ResourceAccess;
}

/** Hashes exactly the canonical UTF-8 basis bytes through the host's Digest adapter. */
export async function digestRuntimeBasis(
  input: RuntimeBasisInput,
  digest: Digest,
): Promise<RuntimeBasis> {
  return `rb1:${await digest.sha256(describeRuntimeBasis(input))}`;
}

/**
 * A raw local read over composition's admitted transaction, without write or ledger capabilities.
 * Missing capabilities and unreadable trusted state throw through capture.
 */
export class RuntimeState {
  constructor(
    private readonly capture: (
      context: RuntimeContext,
    ) => Promise<RuntimeObservation | RuntimeReadRefusal>,
  ) {}

  /** Captures current authorization, project revision, complete local rows and steps in one turn. */
  captureRuntimeObservation(
    context: RuntimeContext,
  ): Promise<RuntimeObservation | RuntimeReadRefusal> {
    return this.capture(context);
  }
}
