import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { PreparedRevisions } from './deploy-repo';
import {
  admissionStrings,
  assertAdmittedDescriptor,
  assertPromotable,
  descriptorSha256,
  parseDescriptor,
  parseStagingProof,
  type ReleaseDescriptor,
  releaseIdentityOf,
} from './descriptor';
import { type ReleaseIdentity, releaseIdOf, type ReleaseRequest } from './release';

/** `deploy/k8s/wbs/overlays/<env>/delivery.json`: where an environment's release goes. */
export interface DeliveryTarget {
  schemaVersion: 1;
  environment: 'staging' | 'prod';
  namespaces: { app: string; backend: string };
  flux: { namespace: string; kustomization: string; gitRepository: string };
  /** Path in the deploy repository whose content pins the release Flux applies. */
  deployManifestPath: string;
  publicUrl: string;
}

function readJson(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read ${label} at ${path}`, { cause });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`${label} at ${path} is not JSON`, { cause });
  }
}

export function readDeliveryTarget(
  overlays: string,
  environment: 'staging' | 'prod',
): DeliveryTarget {
  const path = join(overlays, environment, 'delivery.json');
  const input = readJson(path, 'delivery target') as Partial<DeliveryTarget> | null;
  if (
    input?.schemaVersion !== 1 ||
    input.environment !== environment ||
    typeof input.namespaces?.app !== 'string' ||
    typeof input.namespaces.backend !== 'string' ||
    typeof input.flux?.namespace !== 'string' ||
    typeof input.flux.kustomization !== 'string' ||
    typeof input.flux.gitRepository !== 'string' ||
    typeof input.deployManifestPath !== 'string' ||
    typeof input.publicUrl !== 'string'
  ) {
    throw new Error(`${path} is not a ${environment} delivery target`);
  }
  // Boundary: every field was checked above.
  return input as DeliveryTarget;
}

/**
 * The persistent protected state directory on the deploy runner: journals, requests,
 * descriptors and staging proofs live here across runs. It must be an absolute, real directory
 * that only this user can read, or a runner job could forge a staging proof or journal.
 */
export function assertProtectedStateDirectory(path: string, uid: number): void {
  if (!isAbsolute(path)) throw new Error(`state directory ${path} must be absolute`);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (cause) {
    throw new Error(`state directory ${path} does not exist; create it 0700 on the runner`, {
      cause,
    });
  }
  if (!stat.isDirectory()) throw new Error(`state directory ${path} is not a directory`);
  // Proof: promotion.test.ts `refuses a state directory others can read`; with this check
  // removed a 0755 directory was accepted as the home of staging proofs.
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      `state directory ${path} is mode ${(stat.mode & 0o777).toString(8)}; it must be 0700`,
    );
  }
  if (stat.uid !== uid) {
    throw new Error(
      `state directory ${path} is owned by uid ${String(stat.uid)}, not ${String(uid)}`,
    );
  }
}

export interface DescriptorInputs {
  descriptorPath: string;
  expectedSha256: string;
  admissionPath: string;
  environment: 'staging' | 'prod';
  stateDirectory: string;
}

export interface CheckedDescriptor {
  descriptor: ReleaseDescriptor;
  sha256: string;
}

/**
 * Everything decidable before touching a cluster: the descriptor is the one named, the trusted
 * admission job admitted exactly it, and a production run promotes only what staging proved.
 */
export function checkDescriptor(inputs: DescriptorInputs): CheckedDescriptor {
  const descriptor = parseDescriptor(readJson(inputs.descriptorPath, 'release descriptor'));
  const sha256 = descriptorSha256(descriptor);
  // Proof: promotion.test.ts `refuses a descriptor other than the one named`; with this
  // comparison removed a descriptor with a swapped digest deployed under the old identity.
  if (sha256 !== inputs.expectedSha256) {
    throw new Error(`descriptor is ${sha256}, not the requested ${inputs.expectedSha256}`);
  }
  assertAdmittedDescriptor(descriptor, readJson(inputs.admissionPath, 'admission record'));
  if (inputs.environment === 'prod') {
    const proofPath = stagingProofPath(inputs.stateDirectory, sha256);
    // Proof: promotion.test.ts `refuses production before staging proved the descriptor`; with
    // this read skipped the production request was built from an unproven descriptor.
    assertPromotable(descriptor, parseStagingProof(readJson(proofPath, 'staging proof')));
  }
  return { descriptor, sha256 };
}

export function stagingProofPath(stateDirectory: string, sha256: string): string {
  return join(stateDirectory, 'staging', 'proofs', `${sha256}.json`);
}

/** Builds the coordinator request for a checked descriptor and the observed cluster. */
export function requestFor(
  checked: CheckedDescriptor,
  target: DeliveryTarget,
  cluster: { context: string; uid: string },
  current: ReleaseIdentity,
  revisions: PreparedRevisions,
): ReleaseRequest {
  return {
    environment: target.environment,
    cluster,
    namespaces: target.namespaces,
    release: releaseIdentityOf(checked.descriptor),
    expectedCurrent: current,
    admission: admissionStrings(checked.descriptor),
    flux: { ...target.flux, ...revisions },
    recovers: null,
  };
}

/** The staging proof written once a staging promotion reached `lease-released`. */
export function stagingProofFor(
  checked: CheckedDescriptor,
  cluster: { context: string; uid: string },
  completedAt: Date,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      environment: 'staging',
      descriptorSha256: checked.sha256,
      releaseId: releaseIdOf(releaseIdentityOf(checked.descriptor)),
      cluster,
      images: checked.descriptor.images,
      completedAt: completedAt.toISOString(),
    },
    null,
    2,
  )}\n`;
}
