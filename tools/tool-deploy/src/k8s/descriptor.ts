import { createHash } from 'node:crypto';

import {
  type ActivationIdentity,
  type PackageIdentity,
  requireDeploymentAdmission,
} from '@tools/bureaucrat-consumer';
import { IMAGE_NAME } from '@tools/deploy-contract';

import { K8S_TIERS, type K8sTier, type ReleaseIdentity } from './release';

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const DIGEST_REF = /^[a-z0-9][a-z0-9.\-/:]*@(sha256:[0-9a-f]{64})$/;

/** Where each coordinator tier comes from in tool-dagger's `release.json`, and its image name. */
const PUBLISHED_TIERS: Readonly<Record<K8sTier, { key: string; name: string }>> = {
  backend: { key: 'be', name: IMAGE_NAME.be },
  gateway: { key: 'gw', name: IMAGE_NAME.gw },
  frontend: { key: 'fe', name: IMAGE_NAME.fe },
  // No Dagger target publishes MCP yet; its entry takes the same shape (cutover prerequisite).
  mcp: { key: 'mcp', name: 'wbs-mcp-01' },
};

/**
 * What the operator hands staging, parsed: the digest per tier from tool-dagger's
 * `dist/tool-dagger/release.json` entries (each built from `sourceSha`), and the CI run that
 * gated the source. It carries no admission identity: those come only from the admission job.
 */
export interface ReleaseCandidate {
  readonly schemaVersion: 1;
  readonly sourceSha: string;
  readonly images: Readonly<Record<K8sTier, string>>;
  /** The `ci` workflow run whose `gate` and `pixels` jobs passed on `sourceSha`. */
  readonly gateRunId: number;
}

/** The `ci` run and its jobs as the GitHub API reports them. */
export interface ObservedGateRun {
  readonly id: number;
  readonly head_sha: string;
  readonly path: string;
  readonly event: string;
  readonly head_branch: string | null;
  readonly status: string;
  readonly conclusion: string | null;
  readonly jobs: readonly { name: string; conclusion: string | null }[];
}

/**
 * The immutable release descriptor. Staging deploys it; production promotes the same bytes,
 * identified by {@link descriptorSha256}.
 */
export interface ReleaseDescriptor {
  readonly schemaVersion: 1;
  readonly sourceSha: string;
  readonly images: Readonly<Record<K8sTier, string>>;
  readonly evidence: {
    readonly gate: { readonly runId: number; readonly job: 'gate' };
    readonly browser: { readonly runId: number; readonly job: 'pixels' };
  };
  readonly admission: {
    readonly package: PackageIdentity;
    readonly activation: ActivationIdentity;
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function exactKeys(input: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(input).sort().join(',');
  if (actual !== [...keys].sort().join(',')) {
    throw new Error(`${label} must have exactly [${keys.join(', ')}], got [${actual}]`);
  }
}

function parseImages(input: unknown, label: string): Record<K8sTier, string> {
  if (!isRecord(input)) throw new Error(`${label} must be an object`);
  exactKeys(input, K8S_TIERS, label);
  const images = {} as Record<K8sTier, string>;
  for (const tier of K8S_TIERS) {
    const ref = input[tier];
    // Proof: descriptor.test.ts `refuses a tag-only tier image`; with this check removed a
    // `wbs-gw-01:latest` gateway sealed into a descriptor.
    if (typeof ref !== 'string' || !DIGEST_REF.test(ref)) {
      throw new Error(`${label}.${tier} must be a digest-pinned image ref, got ${String(ref)}`);
    }
    images[tier] = ref;
  }
  return images;
}

function isPublishedImage(input: unknown): input is {
  sha: string;
  digest: string;
  ref: string;
  image: string;
} {
  return (
    isRecord(input) &&
    Object.keys(input).sort().join(',') === 'digest,image,ref,sha' &&
    typeof input['sha'] === 'string' &&
    typeof input['digest'] === 'string' &&
    typeof input['ref'] === 'string' &&
    typeof input['image'] === 'string'
  );
}

/**
 * Validates the operator's candidate at the workflow boundary: `{schemaVersion, sourceSha,
 * release, gateRunId}`, where `release` is tool-dagger's `release.json` (`be`, `gw`, `fe`) plus an
 * `mcp` entry of the same shape. Every entry must have been built from `sourceSha`, and its
 * digest-pinned image must name its own tier's repository and digest.
 */
export function parseReleaseCandidate(input: unknown): ReleaseCandidate {
  if (!isRecord(input)) throw new Error('release candidate must be a JSON object');
  exactKeys(input, ['schemaVersion', 'sourceSha', 'release', 'gateRunId'], 'release candidate');
  if (input['schemaVersion'] !== 1) throw new Error('release candidate schemaVersion must be 1');
  const sourceSha = input['sourceSha'];
  if (typeof sourceSha !== 'string' || !SHA1.test(sourceSha)) {
    throw new Error(`release candidate sourceSha must be a full commit, got ${String(sourceSha)}`);
  }
  const gateRunId = input['gateRunId'];
  if (typeof gateRunId !== 'number' || !Number.isSafeInteger(gateRunId) || gateRunId <= 0) {
    throw new Error(`release candidate gateRunId must be a positive integer`);
  }
  const release = input['release'];
  if (!isRecord(release)) throw new Error('release candidate release must be an object');
  exactKeys(
    release,
    K8S_TIERS.map((tier) => PUBLISHED_TIERS[tier].key),
    'release candidate release',
  );
  const images = {} as Record<K8sTier, string>;
  for (const tier of K8S_TIERS) {
    const { key, name } = PUBLISHED_TIERS[tier];
    const entry = release[key];
    if (!isPublishedImage(entry)) {
      throw new Error(`release.${key} must be a release.json entry {sha, digest, ref, image}`);
    }
    // Proof: descriptor.test.ts `refuses a tier built from another commit`; with this
    // comparison removed a gateway published from 9999… sealed into a descriptor for aaaa….
    if (entry.sha !== sourceSha) {
      throw new Error(`release.${key} was built from ${entry.sha}, not the source ${sourceSha}`);
    }
    const digest = DIGEST_REF.exec(entry.image)?.[1];
    const repository = entry.image.split('@')[0];
    if (
      digest !== entry.digest ||
      !repository.endsWith(`/${name}`) ||
      entry.ref !== `${repository}:${sourceSha}`
    ) {
      throw new Error(
        `release.${key} image ${entry.image} is not ${name}@${entry.digest} tagged ${sourceSha}`,
      );
    }
    images[tier] = entry.image;
  }
  return { schemaVersion: 1, sourceSha, images, gateRunId };
}

/**
 * The gate evidence must be a completed, successful `ci` run of a push to `main` on exactly
 * `sourceSha` whose `gate` job and `pixels` browser job both succeeded. That the commit is on
 * main's history is checked separately against the repository ({@link assertOnMainline}).
 */
export function assertGateEvidence(sourceSha: string, run: ObservedGateRun): void {
  const problems: string[] = [];
  if (run.path !== '.github/workflows/ci.yml') problems.push(`workflow is ${run.path}`);
  // Proof: descriptor.test.ts `refuses a pull_request gate run`; with this check removed a green
  // PR run (candidate-controlled workflow and merge ref) sealed the descriptor (review M1).
  if (run.event !== 'push' || run.head_branch !== 'main') {
    problems.push(`run is a ${run.event} on ${String(run.head_branch)}, not a push to main`);
  }
  // Proof: descriptor.test.ts `refuses gate evidence for another commit`; with this comparison
  // removed a green run on a sibling commit sealed the descriptor.
  if (run.head_sha !== sourceSha) problems.push(`run is for ${run.head_sha}`);
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    problems.push(`run is ${run.status}/${String(run.conclusion)}`);
  }
  for (const name of ['gate', 'pixels'] as const) {
    const job = run.jobs.find((each) => each.name === name);
    // Proof: descriptor.test.ts `refuses a run whose browser job did not pass`; with this check
    // removed a skipped `pixels` job sealed the descriptor.
    if (job?.conclusion !== 'success') {
      problems.push(`job ${name} is ${job === undefined ? 'absent' : String(job.conclusion)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `ci run ${String(run.id)} is not passing gate evidence for ${sourceSha}: ${problems.join('; ')}`,
    );
  }
}

function digestOf(ref: string): string {
  const digest = DIGEST_REF.exec(ref)?.[1];
  if (digest === undefined) throw new Error(`${ref} is not digest-pinned`);
  return digest;
}

/**
 * Joins the candidate, the trusted admission record and the observed gate run into a descriptor.
 * Every tier's digest goes through {@link requireDeploymentAdmission}, so a record that admitted
 * another commit, or a report without package and activation identities, seals nothing.
 */
export function sealDescriptor(
  candidate: ReleaseCandidate,
  admissionRecord: unknown,
  gateRun: ObservedGateRun,
): ReleaseDescriptor {
  assertGateEvidence(candidate.sourceSha, gateRun);
  if (gateRun.id !== candidate.gateRunId) {
    throw new Error(
      `observed run ${String(gateRun.id)} is not candidate run ${String(candidate.gateRunId)}`,
    );
  }
  // Proof: descriptor.test.ts `refuses an admission record for another commit`; with this call
  // replaced by a pass-through the record for 9999… sealed a descriptor for aaaa….
  const admitted = K8S_TIERS.map((tier) =>
    requireDeploymentAdmission(admissionRecord, {
      sourceSha: candidate.sourceSha,
      imageDigest: digestOf(candidate.images[tier]),
    }),
  );
  return {
    schemaVersion: 1,
    sourceSha: candidate.sourceSha,
    images: candidate.images,
    evidence: {
      gate: { runId: candidate.gateRunId, job: 'gate' },
      browser: { runId: candidate.gateRunId, job: 'pixels' },
    },
    admission: { package: admitted[0].package, activation: admitted[0].activation },
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The descriptor's identity: SHA-256 of its canonical JSON (sorted keys, no whitespace). */
export function descriptorSha256(descriptor: ReleaseDescriptor): string {
  return createHash('sha256').update(canonical(descriptor)).digest('hex');
}

/** Renders the descriptor as the canonical bytes whose hash is its identity. */
export function renderDescriptor(descriptor: ReleaseDescriptor): string {
  return `${canonical(descriptor)}\n`;
}

/**
 * Validates a descriptor read back from an artifact or the protected state directory. The
 * admission part is re-validated with {@link requireDeploymentAdmission}'s own parser by
 * re-joining it to the descriptor's source and every tier digest.
 */
export function parseDescriptor(input: unknown): ReleaseDescriptor {
  if (!isRecord(input)) throw new Error('descriptor must be a JSON object');
  exactKeys(input, ['schemaVersion', 'sourceSha', 'images', 'evidence', 'admission'], 'descriptor');
  if (input['schemaVersion'] !== 1) throw new Error('descriptor schemaVersion must be 1');
  const sourceSha = input['sourceSha'];
  if (typeof sourceSha !== 'string' || !SHA1.test(sourceSha)) {
    throw new Error('descriptor sourceSha must be a full commit');
  }
  const images = parseImages(input['images'], 'descriptor images');
  const evidence = input['evidence'];
  if (!isRecord(evidence)) throw new Error('descriptor evidence must be an object');
  exactKeys(evidence, ['gate', 'browser'], 'descriptor evidence');
  const gate = evidence['gate'];
  const browser = evidence['browser'];
  if (
    !isRecord(gate) ||
    !isRecord(browser) ||
    gate['job'] !== 'gate' ||
    browser['job'] !== 'pixels' ||
    typeof gate['runId'] !== 'number' ||
    gate['runId'] !== browser['runId']
  ) {
    throw new Error('descriptor evidence must name one ci run for the gate and pixels jobs');
  }
  const admission = input['admission'];
  if (!isRecord(admission)) throw new Error('descriptor admission must be an object');
  exactKeys(admission, ['package', 'activation'], 'descriptor admission');
  const record = { schemaVersion: 1, sourceSha, ...admission };
  for (const tier of K8S_TIERS) {
    requireDeploymentAdmission(record, { sourceSha, imageDigest: digestOf(images[tier]) });
  }
  const joined = requireDeploymentAdmission(record, {
    sourceSha,
    imageDigest: digestOf(images.backend),
  });
  return {
    schemaVersion: 1,
    sourceSha,
    images,
    evidence: {
      gate: { runId: gate['runId'], job: 'gate' },
      browser: { runId: gate['runId'], job: 'pixels' },
    },
    admission: { package: joined.package, activation: joined.activation },
  };
}

/**
 * Deploy-time admission: the record the trusted admission job produced for this run must admit
 * the descriptor's source and every tier digest, and carry exactly the descriptor's package and
 * activation identities. A production run re-admits, so an activation or package that changed
 * since staging blocks promotion.
 */
export function assertAdmittedDescriptor(descriptor: ReleaseDescriptor, record: unknown): void {
  for (const tier of K8S_TIERS) {
    const admitted = requireDeploymentAdmission(record, {
      sourceSha: descriptor.sourceSha,
      imageDigest: digestOf(descriptor.images[tier]),
    });
    // Proof: descriptor.test.ts `refuses a fresh admission from another activation`; with this
    // comparison removed production promoted under an activation staging never ran.
    if (canonical(admitted.package) !== canonical(descriptor.admission.package)) {
      throw new Error(
        `admission package ${canonical(admitted.package)} is not the descriptor's ` +
          canonical(descriptor.admission.package),
      );
    }
    if (canonical(admitted.activation) !== canonical(descriptor.admission.activation)) {
      throw new Error(
        `admission activation ${canonical(admitted.activation)} is not the descriptor's ` +
          canonical(descriptor.admission.activation),
      );
    }
  }
}

/** The release identity the coordinator moves to. */
export function releaseIdentityOf(descriptor: ReleaseDescriptor): ReleaseIdentity {
  return { sourceSha: descriptor.sourceSha, images: descriptor.images };
}

/** The request's `admission` strings: one line per identity, naming every field. */
export function admissionStrings(descriptor: ReleaseDescriptor): {
  package: string;
  activation: string;
} {
  const { package: pkg, activation } = descriptor.admission;
  return {
    package: `${pkg.name}@${pkg.version} ${pkg.integrity} toolkit ${pkg.toolkitIdentity}`,
    activation: `${activation.version} manifest ${activation.manifestIdentity}`,
  };
}

/** What staging leaves in the protected state directory after it promoted a descriptor. */
export interface StagingProof {
  readonly schemaVersion: 1;
  readonly environment: 'staging';
  readonly descriptorSha256: string;
  readonly releaseId: string;
  readonly cluster: { readonly context: string; readonly uid: string };
  readonly images: Readonly<Record<K8sTier, string>>;
  readonly completedAt: string;
}

export function parseStagingProof(input: unknown): StagingProof {
  if (!isRecord(input)) throw new Error('staging proof must be a JSON object');
  exactKeys(
    input,
    [
      'schemaVersion',
      'environment',
      'descriptorSha256',
      'releaseId',
      'cluster',
      'images',
      'completedAt',
    ],
    'staging proof',
  );
  const cluster = input['cluster'];
  if (
    input['schemaVersion'] !== 1 ||
    input['environment'] !== 'staging' ||
    typeof input['descriptorSha256'] !== 'string' ||
    !SHA256_HEX.test(input['descriptorSha256']) ||
    typeof input['releaseId'] !== 'string' ||
    typeof input['completedAt'] !== 'string' ||
    !isRecord(cluster) ||
    typeof cluster['context'] !== 'string' ||
    typeof cluster['uid'] !== 'string'
  ) {
    throw new Error('staging proof is malformed');
  }
  return {
    schemaVersion: 1,
    environment: 'staging',
    descriptorSha256: input['descriptorSha256'],
    releaseId: input['releaseId'],
    cluster: { context: cluster['context'], uid: cluster['uid'] },
    images: parseImages(input['images'], 'staging proof images'),
    completedAt: input['completedAt'],
  };
}

/**
 * Production promotes only what staging proved: the same descriptor bytes, and the same digest
 * per tier. Any rebuild changes a digest and is refused.
 */
export function assertPromotable(descriptor: ReleaseDescriptor, proof: StagingProof): void {
  const identity = descriptorSha256(descriptor);
  const differing = K8S_TIERS.filter((tier) => proof.images[tier] !== descriptor.images[tier]);
  // Proof: descriptor.test.ts `refuses a production digest staging did not prove`; with this
  // comparison removed a rebuilt frontend digest promoted to production.
  if (differing.length > 0) {
    throw new Error(
      `staging proved different digests for ${differing.join(', ')}; production promotes ` +
        'only the exact digests staging ran',
    );
  }
  if (proof.descriptorSha256 !== identity) {
    throw new Error(
      `staging proved descriptor ${proof.descriptorSha256}, not ${identity}; production ` +
        'promotes only the descriptor staging promoted',
    );
  }
}
