export type VerificationOutcome = 'passed' | 'failed' | 'cancelled' | 'skipped' | 'unknown';
export interface VerificationCheck {
  readonly name: string;
  readonly completed: boolean;
  readonly outcome: VerificationOutcome;
  readonly origin: {
    readonly executionId: string;
    readonly attempt: number;
    readonly checkId: string;
  };
}
export interface DeploymentVerification {
  readonly source: {
    readonly repository: string;
    readonly revision: string;
    readonly ref: string | null;
  };
  readonly pipeline: string;
  readonly trigger: 'source-update' | 'change-request' | 'other';
  readonly completed: boolean;
  readonly outcome: VerificationOutcome;
  readonly checks: readonly VerificationCheck[];
  readonly origin: {
    readonly provider: string;
    readonly executionId: string;
    readonly attempt: number;
    readonly url: string;
  };
}
export interface VerificationPolicy {
  readonly source: { readonly repository: string; readonly revision: string; readonly ref: string };
  readonly pipeline: string;
  readonly checks: readonly string[];
}
export interface ReleaseImage {
  readonly role: string;
  readonly revision: string;
  readonly digest: string;
  readonly reference: string;
  readonly taggedReference: string;
}
/**
 * Admits normalized evidence only for the exact source and pipeline, a completed passing
 * source update, and one completed passing observation per required check. Revisions are
 * opaque; provider adapters own external parsing and execution freshness. Required checks
 * must identify this execution and a positive attempt no later than its current attempt;
 * explicitly carried passing checks from earlier attempts remain admissible.
 * @throws when policy names or provenance are incomplete, or required evidence disagrees.
 */
export function assertDeploymentVerification(
  policy: VerificationPolicy,
  observed: DeploymentVerification,
): void {
  // Proof: disabling this guard made provenance.test.ts
  // `refuses invalid required-check policy []` fail by admitting invalid evidence.
  if (policy.checks.length === 0) {
    throw new Error('Deployment verification policy requires named checks');
  }
  const names = new Set<string>();
  for (const name of policy.checks) {
    // Proof: disabling this guard made provenance.test.ts
    // `refuses invalid required-check policy [""]` fail by admitting invalid evidence.
    if (name.trim().length === 0) {
      throw new Error('Deployment verification policy contains an empty check name');
    }
    // Proof: disabling this guard made provenance.test.ts
    // `refuses invalid required-check policy ["compile","compile"]` fail by admitting invalid evidence.
    if (names.has(name)) {
      throw new Error(`Deployment verification policy repeats check ${name}`);
    }
    names.add(name);
  }

  // Proof: disabling this guard made provenance.test.ts
  // `refuses another source repository` fail by admitting invalid evidence.
  if (observed.source.repository !== policy.source.repository) {
    throw new Error('Deployment verification source repository differs from policy');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses another source revision` fail by admitting invalid evidence.
  if (observed.source.revision !== policy.source.revision) {
    throw new Error('Deployment verification source revision differs from policy');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses another source ref` fail by admitting invalid evidence.
  if (observed.source.ref !== policy.source.ref) {
    throw new Error('Deployment verification source reference differs from policy');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses another pipeline` fail by admitting invalid evidence.
  if (observed.pipeline !== policy.pipeline) {
    throw new Error('Deployment verification pipeline differs from policy');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses change-request evidence` fail by admitting invalid evidence.
  if (observed.trigger !== 'source-update') {
    throw new Error('Deployment verification requires a source-update trigger');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses an incomplete execution even with a passed outcome` fail by admitting invalid evidence.
  if (!observed.completed) {
    throw new Error('Deployment verification execution is incomplete');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses a failed execution` fail by admitting invalid evidence.
  if (observed.outcome !== 'passed') {
    throw new Error('Deployment verification execution did not pass');
  }

  for (const field of ['provider', 'executionId', 'url'] as const) {
    // Proof: disabling this guard made provenance.test.ts
    // `refuses blank origin provider ""` fail by admitting invalid evidence.
    if (observed.origin[field].trim().length === 0) {
      throw new Error(`Deployment verification origin requires ${field}`);
    }
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses invalid attempt 1.5` fail by admitting invalid evidence.
  if (!Number.isSafeInteger(observed.origin.attempt) || observed.origin.attempt <= 0) {
    throw new Error('Deployment verification attempt must be a positive safe integer');
  }

  for (const name of policy.checks) {
    const checks = observed.checks.filter((check) => check.name === name);
    // Proof: disabling this guard made provenance.test.ts
    // `refuses a missing required check` fail by admitting invalid evidence.
    if (checks.length !== 1) {
      throw new Error(`Deployment verification requires exactly one check ${name}`);
    }
    for (const check of checks) {
      // Proof: disabling this guard made provenance.test.ts
      // `refuses a blank required check identity ""` fail by admitting invalid evidence.
      if (check.origin.checkId.trim().length === 0) {
        throw new Error(`Deployment verification check ${name} requires an identity`);
      }
      // Proof: disabling this guard made provenance.test.ts
      // `refuses a required check from another execution` fail by admitting invalid evidence.
      if (check.origin.executionId !== observed.origin.executionId) {
        throw new Error(`Deployment verification check ${name} belongs to another execution`);
      }
      // Proof: disabling this guard made provenance.test.ts
      // `refuses an invalid required check attempt 0` fail by admitting invalid evidence.
      if (
        !Number.isSafeInteger(check.origin.attempt) ||
        check.origin.attempt <= 0 ||
        check.origin.attempt > observed.origin.attempt
      ) {
        throw new Error(`Deployment verification check ${name} has an invalid attempt`);
      }
      // Proof: disabling this guard made provenance.test.ts
      // `refuses an incomplete required check even with a passed outcome` fail by admitting invalid evidence.
      if (!check.completed) {
        throw new Error(`Deployment verification check ${name} is incomplete`);
      }
      // Proof: disabling this guard made provenance.test.ts
      // `refuses a failed required check` fail by admitting invalid evidence.
      if (check.outcome !== 'passed') {
        throw new Error(`Deployment verification check ${name} did not pass`);
      }
    }
  }
}

/**
 * Admits selected release claims for one nonempty opaque revision. Every role must have an
 * own repository-basename policy, a unique selection, and agreeing digest and tag references.
 * Namespace prefixes and registry ports are allowed. This validates claims; registry adapters
 * must independently verify image bytes and their application revision before deployment.
 * @throws when any selected image or its required repository policy is inconsistent.
 */
export function assertReleaseImages(
  revision: string,
  images: readonly ReleaseImage[],
  repositories: Readonly<Record<string, string>>,
): void {
  // Proof: disabling this guard made provenance.test.ts
  // `refuses a blank expected revision ""` fail by admitting invalid evidence.
  if (revision.trim().length === 0) {
    throw new Error('Release images require a nonempty source revision');
  }
  // Proof: disabling this guard made provenance.test.ts
  // `refuses an empty selected image list` fail by admitting invalid evidence.
  if (images.length === 0) {
    throw new Error('Release images require a nonempty selection');
  }
  const roles = new Set<string>();
  for (const image of images) {
    // Proof: disabling this guard made provenance.test.ts
    // `refuses duplicate roles` fail by admitting invalid evidence.
    if (roles.has(image.role)) {
      throw new Error(`Release images repeat role ${image.role}`);
    }
    roles.add(image.role);
    // Proof: disabling this guard made provenance.test.ts
    // `refuses another image revision` fail by admitting invalid evidence.
    if (image.revision !== revision) {
      throw new Error(`Release image ${image.role} source revision differs from deployment`);
    }
    const expectedRepository = repositories[image.role];
    // Proof: disabling this guard made provenance.test.ts
    // `refuses an inherited repository policy even when its basename matches` fail by admitting invalid evidence.
    if (!Object.hasOwn(repositories, image.role)) {
      throw new Error(`Release image ${image.role} has no own repository policy`);
    }
    // Proof: disabling this guard made provenance.test.ts
    // `refuses a malformed digest even when all claim fields agree` fail by admitting invalid evidence.
    if (
      !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]+)?|\[[0-9a-fA-F:]+\](?::[0-9]+)?)\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*@sha256:[0-9a-f]{64}(?![\s\S])/.test(
        image.reference,
      )
    ) {
      throw new Error(
        `Release image ${image.role} requires a valid digest-pinned registry reference`,
      );
    }
    const separator = image.reference.lastIndexOf('@');
    const repository = image.reference.slice(0, separator);
    // Proof: disabling this guard made provenance.test.ts
    // `refuses a digest claim different from the reference` fail by admitting invalid evidence.
    if (image.reference.slice(separator + 1) !== image.digest) {
      throw new Error(`Release image ${image.role} digest differs from its reference`);
    }
    // Proof: disabling this guard made provenance.test.ts
    // `refuses an empty role repository policy` fail by admitting invalid evidence.
    if (repository.slice(repository.lastIndexOf('/') + 1) !== expectedRepository) {
      throw new Error(`Release image ${image.role} repository differs from policy`);
    }
    // Proof: disabling this guard made provenance.test.ts
    // `refuses an inconsistent tagged reference registry.test/team/service-api:revision-41` fail by admitting invalid evidence.
    if (image.taggedReference !== `${repository}:${revision}`) {
      throw new Error(
        `Release image ${image.role} tagged reference differs from source or repository`,
      );
    }
  }
}
