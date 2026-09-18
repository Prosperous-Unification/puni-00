const sha1Hex = /^[0-9a-f]{40}$/;
const sha256Hex = /^[0-9a-f]{64}$/;

/** The installed package identity: registry coordinate, tarball integrity and toolkit digest. */
export interface PackageIdentity {
  readonly name: 'twilight-bureaucrat';
  readonly version: string;
  readonly integrity: string;
  readonly toolkitIdentity: string;
}

/** The externally selected activation: the commit it certifies and its manifest digest. */
export interface ActivationIdentity {
  readonly version: string;
  readonly manifestIdentity: string;
}

/**
 * The record `infra/ci/bureaucrat/admit.sh` writes to `<scratch>/admission.json` after the
 * installed package certified a candidate against the externally selected activation. Every field
 * is read from trusted state — the base-owned lock, the installed package manifest and the
 * activation archive — never from a launcher's or wrapper's report, which a candidate can edit.
 */
export interface TrustedAdmission {
  readonly schemaVersion: 1;
  readonly sourceSha: string;
  readonly package: PackageIdentity;
  readonly activation: ActivationIdentity;
}

/** The four identities deployment preparation must carry together; F11 consumes this. */
export interface DeploymentAdmission {
  readonly sourceSha: string;
  readonly package: PackageIdentity;
  readonly activation: ActivationIdentity;
  readonly imageDigest: string;
}

/** What deployment preparation observed about the release it is about to stage. */
export interface DeploymentSubject {
  readonly sourceSha: string;
  readonly imageDigest: string;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasExactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(input).sort()) === JSON.stringify([...keys].sort());
}

function matches(input: unknown, pattern: RegExp): input is string {
  return typeof input === 'string' && pattern.test(input);
}

function isPackageIdentity(input: unknown): input is PackageIdentity {
  return (
    isRecord(input) &&
    hasExactKeys(input, ['name', 'version', 'integrity', 'toolkitIdentity']) &&
    input['name'] === 'twilight-bureaucrat' &&
    matches(input['version'], /^[0-9]+\.[0-9]+\.[0-9]+$/) &&
    matches(input['integrity'], /^sha512-[A-Za-z0-9+/]{86}==$/) &&
    matches(input['toolkitIdentity'], sha256Hex)
  );
}

function isActivationIdentity(input: unknown): input is ActivationIdentity {
  return (
    isRecord(input) &&
    hasExactKeys(input, ['version', 'manifestIdentity']) &&
    matches(input['version'], sha1Hex) &&
    matches(input['manifestIdentity'], sha256Hex)
  );
}

/**
 * Validates an admission record at the boundary where deployment preparation reads it.
 * @throws when any identity is absent, malformed, or accompanied by an undeclared claim.
 */
export function parseTrustedAdmission(input: unknown): TrustedAdmission {
  // Proof: bureaucrat-consumer.test.ts removed the activation and then the package shape check;
  // a `main` activation version and a sha1 package integrity each yielded a descriptor.
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['schemaVersion', 'sourceSha', 'package', 'activation']) ||
    input['schemaVersion'] !== 1 ||
    !matches(input['sourceSha'], sha1Hex) ||
    !isPackageIdentity(input['package']) ||
    !isActivationIdentity(input['activation'])
  ) {
    throw new Error('admission record lacks the source, package or activation identity');
  }
  return {
    schemaVersion: 1,
    sourceSha: input['sourceSha'],
    package: input['package'],
    activation: input['activation'],
  };
}

/**
 * Joins a trusted admission record to the release being deployed.
 *
 * @throws when the record is not a complete admission record (a certified-looking launcher report
 *   carries none of the package or activation identities), when it admitted another source commit,
 *   or when the staged image digest is not an immutable `sha256:` digest.
 */
export function requireDeploymentAdmission(
  record: unknown,
  subject: DeploymentSubject,
): DeploymentAdmission {
  const admission = parseTrustedAdmission(record);
  // Proof: with this comparison removed the admission for `aaaa…` deployed source `9999…`.
  if (admission.sourceSha !== subject.sourceSha) {
    throw new Error(
      `admission certified ${admission.sourceSha}, not the deployed source ${subject.sourceSha}`,
    );
  }
  // Proof: with this check removed a `:latest` tag passed as the staged image.
  if (!/^sha256:[0-9a-f]{64}$/.test(subject.imageDigest)) {
    throw new Error(`staged image digest is not immutable: ${subject.imageDigest}`);
  }
  return {
    sourceSha: admission.sourceSha,
    package: admission.package,
    activation: admission.activation,
    imageDigest: subject.imageDigest,
  };
}
