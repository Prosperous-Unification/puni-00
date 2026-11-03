import { createHash } from 'node:crypto';
import { basename, dirname } from 'node:path';

import {
  type DependencyCapabilityObservation,
  observeDependencyCapabilities,
} from './dependency-preflight';
import { type RunDocker, runDockerBefore, runDockerCli } from './docker-deadline';
import {
  assertDependencyOwner,
  assertNoCommittedDependencyOwner,
  decodeDependencyOwnerPublication,
  type DependencyOwner,
  ownerDockerHashed,
  retainSolverRecord,
} from './edge-ownership';
import {
  captureEdgePolicy,
  captureEdgeRecord,
  type EdgePolicySnapshot,
  type EdgeRecordSnapshot,
} from './edge-policy';
import { envLayout } from './env';
import { assertSame, readClosed, readDigest, readString } from './managed-cohort';
import type { SolverLayouts } from './solver-exclusion';
import { assertExecutingSolver } from './solver-execution';
import {
  captureSolverFile,
  captureSolverTuple,
  decodeSolverPins,
  type SolverPins,
  type SolverPorts,
} from './solver-host';

export interface SolverRestorationImage {
  readonly image: string;
  readonly imageId: string;
  readonly semantics: readonly ['cross-project-dependencies-v1'];
}
export interface SolverRestorationEnvelope {
  readonly owner: string;
  readonly record: {
    readonly format: 'dependency-solver-restoration';
    readonly version: 1;
    readonly operation: 'restore-solver-only';
    readonly pins: SolverPins;
    readonly images: readonly SolverRestorationImage[];
  };
}

/** Closed intent only: semantic observations are produced by the live owner, never accepted as coordinator input. */
export function decodeSolverRestoration(value: unknown): SolverRestorationEnvelope {
  const envelope = readClosed(value, ['owner', 'record']);
  const owner = readString(envelope['owner']);
  const record = readClosed(envelope['record'], [
    'format',
    'version',
    'operation',
    'pins',
    'images',
  ]);
  // Proof: intent-format omission admitted restore operation substitution; decoder refusal test failed (exit 1).
  if (
    record['format'] !== 'dependency-solver-restoration' ||
    record['version'] !== 1 ||
    record['operation'] !== 'restore-solver-only'
  )
    throw new Error('solver restoration intent format is unsupported');
  const pins = decodeSolverPins(record['pins']);
  const configured = record['images'];
  // Proof: intent-nonempty-images omission admitted empty coverage; decoder refusal test failed (exit 1).
  if (!Array.isArray(configured) || configured.length === 0)
    throw new Error('solver restoration image coverage is absent');
  const images: SolverRestorationImage[] = [];
  for (const raw of configured) {
    const fields = readClosed(raw, ['image', 'imageId', 'semantics']);
    const image = readString(fields['image']);
    const imageId = readDigest(fields['imageId']);
    const semantics = fields['semantics'];
    const previous = images.at(-1);
    // Proof: intent-image-validation omission admitted invalid semantics/order; decoder refusal test failed (exit 1).
    if (
      !/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(image) ||
      !Array.isArray(semantics) ||
      semantics.length !== 1 ||
      semantics[0] !== 'cross-project-dependencies-v1' ||
      (previous !== undefined && previous.image >= image)
    )
      throw new Error('solver restoration image identity, semantics or order differs');
    images.push({ image, imageId, semantics: ['cross-project-dependencies-v1'] });
  }
  return {
    owner,
    record: {
      format: 'dependency-solver-restoration',
      version: 1,
      operation: 'restore-solver-only',
      pins,
      images,
    },
  };
}

export interface RetainedSolverRestoration {
  readonly path: string;
  readonly contents: string;
}
const retainedIntents = new WeakMap<
  RetainedSolverRestoration,
  { owner: DependencyOwner; layouts: SolverLayouts; snapshot: EdgeRecordSnapshot }
>();

/** Checks this process's newly retained intent identity; serialized claims cannot authorize publication. */
export async function assertRetainedSolverRestoration(
  owner: DependencyOwner,
  retained: RetainedSolverRestoration,
): Promise<SolverRestorationEnvelope> {
  const scope = retainedIntents.get(retained);
  // Proof: retained-intent-object omission lost the opaque-object refusal; owner publisher test failed (exit 1).
  if (scope?.owner !== owner)
    throw new Error('solver restoration intent is not retained by this live owner');
  await assertDependencyOwner(owner, scope.layouts.prod);
  await assertDependencyOwner(owner, scope.layouts.dev);
  // Proof: retained-intent-identity omission admitted same-byte intent replacement after startup; intent-resumed test failed (exit 1).
  assertSame(
    scope.snapshot,
    await captureEdgeRecord(dirname(scope.snapshot.path), basename(retained.path), 65536),
    'newly retained restoration intent',
  );
  return decodeSolverRestoration(JSON.parse(retained.contents));
}

/** Constructs compatibility evidence from independently pinned files and owner-bound actual immutable-image probes. */
export async function retainCompatibleSolverIntent(
  owner: DependencyOwner,
  layouts: SolverLayouts,
  suppliedPins: SolverPins,
  ports: SolverPorts,
  deadline: number,
): Promise<RetainedSolverRestoration> {
  const pins = decodeSolverPins(suppliedPins);
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const installed = await captureSolverTuple(pins, ports.captureFile);
  const docker: RunDocker = ownerDockerHashed(owner, layouts.prod, async (args, signal) => {
    await assertDependencyOwner(owner, layouts.dev);
    const response = await ports.runDocker(args, signal);
    await assertDependencyOwner(owner, layouts.dev);
    return response;
  });
  const images = await resolveSolverImages(
    installed.flatMap((file) => file.solverImages ?? []),
    docker,
    deadline,
  );
  for (const image of images) {
    const capabilities = await observeSolverCapabilities(image.image, docker, deadline);
    // Proof: semantic-observation omission admitted incapable images; composed incapable test failed (exit 1).
    if (capabilities.semantics.length !== 1)
      throw new Error('solver restoration image lacks required semantics');
  }
  assertSame(
    installed,
    await captureSolverTuple(pins, ports.captureFile),
    'solver restoration installed tuple',
  );
  assertSame(
    images,
    await resolveSolverImages(
      images.map((image) => image.image),
      docker,
      deadline,
    ),
    'solver restoration immutable images',
  );
  const retained = await retainSolverRecord(owner, layouts, 'restore-intent', {
    format: 'dependency-solver-restoration',
    version: 1,
    operation: 'restore-solver-only',
    pins,
    images,
  });
  if (Buffer.byteLength(retained.contents) > 65536)
    throw new Error('solver restoration intent exceeds bound');
  decodeSolverRestoration(JSON.parse(retained.contents));
  retainedIntents.set(retained, {
    owner,
    layouts: structuredClone(layouts),
    snapshot: await captureEdgeRecord(ports.edgeState, basename(retained.path), 65536),
  });
  return retained;
}

/** Resolves the complete distinct configured set; no observed identity becomes an expected pin. */
export async function resolveSolverImages(
  references: readonly string[],
  docker: RunDocker,
  deadline: number,
): Promise<SolverRestorationImage[]> {
  const configured = [...new Set(references)].sort();
  if (configured.length === 0)
    throw new Error('solver restoration configured image coverage is absent');
  const images: SolverRestorationImage[] = [];
  for (const image of configured) {
    if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(image))
      throw new Error('solver restoration image is not pinned');
    const response = await runDockerBefore(
      ['image', 'inspect', '--format', '{{.Id}}', image],
      docker,
      deadline,
    );
    if (!/^sha256:[a-f0-9]{64}\n?$/.test(response))
      throw new Error('solver restoration immutable image identity is malformed');
    images.push({
      image,
      imageId: readDigest(response.trim()),
      semantics: ['cross-project-dependencies-v1'],
    });
  }
  return images;
}

/** Computes only the fixed policy reference; it grants no live ownership. */
export function solverRestorationReference(retained: RetainedSolverRestoration): {
  name: string;
  sha256: string;
} {
  return {
    name: basename(retained.path),
    sha256: createHash('sha256').update(retained.contents).digest('hex'),
  };
}

/** Full runtime-only verifier: compatible immutable pins admit one supervisor, never a live DependencyOwner. */
export async function verifyRestoringSolverPolicy(snapshot: EdgePolicySnapshot): Promise<void> {
  const policy = snapshot.policy;
  // Proof: runtime-private-policy omission admitted public policy mode; public-policy runtime test failed (exit 1).
  if (policy.phase !== 'restoring' || snapshot.mode !== 0o600)
    throw new Error('solver restoration requires private restoring policy');
  const directory = policy.edgeState;
  const intent = await captureEdgeRecord(directory, policy.restorationIntent.name, 65536);
  const pending = await captureEdgeRecord(directory, 'edge-owner.pending', 65536);
  // Proof: runtime-intent-hash omission admitted a wrong intent hash; runtime policy-hash test failed (exit 1).
  if (
    createHash('sha256').update(intent.contents).digest('hex') !==
      policy.restorationIntent.sha256 ||
    createHash('sha256').update(pending.contents).digest('hex') !== policy.ownerPublicationSha256
  )
    throw new Error('solver restoration policy hash binding differs');
  const envelope = decodeSolverRestoration(parseRestorationJson(intent.contents));
  // Proof: runtime-owner-bytes omission admitted a foreign envelope owner; runtime foreign-owner test failed (exit 1).
  if (envelope.owner !== pending.contents)
    throw new Error('solver restoration pending owner bytes differ');
  const publication = decodeDependencyOwnerPublication(parseRestorationJson(pending.contents));
  for (const environment of ['prod', 'dev'] as const) {
    const selected = publication.plan.layouts.find((layout) => layout.env === environment);
    // Proof: runtime-owner-scope omission admitted changed binding; runtime owner-scope test failed (exit 1).
    assertSame(envLayout(environment), selected, 'solver restoration exact owner layout');
  }
  await assertNoCommittedDependencyOwner(directory);
  await assertExecutingSolver();
  const installed = await captureSolverTuple(envelope.record.pins, captureSolverFile);
  const references = installed.flatMap((file) => file.solverImages ?? []);
  // Proof: runtime-image-coverage omission admitted changed binding; runtime coverage test failed (exit 1).
  assertSame(
    envelope.record.images,
    await resolveSolverImages(references, runDockerCli, performance.now() + 15000),
    'solver restoration configured image coverage',
  );
  // Proof: runtime-tuple-readback omission admitted changed binding; runtime tuple-inode test failed (exit 1).
  assertSame(
    installed,
    await captureSolverTuple(envelope.record.pins, captureSolverFile),
    'solver restoration executing tuple readback',
  );
  // Proof: runtime-policy-readback omission admitted changed binding; runtime policy-drift test failed (exit 1).
  assertSame(snapshot, await captureEdgePolicy(directory), 'solver restoration policy readback');
  // Proof: runtime-intent-readback omission admitted changed binding; runtime intent-drift test failed (exit 1).
  assertSame(
    intent,
    await captureEdgeRecord(directory, policy.restorationIntent.name, 65536),
    'solver restoration intent readback',
  );
  // Proof: runtime-pending-readback omission admitted changed binding; runtime pending-drift test failed (exit 1).
  assertSame(
    pending,
    await captureEdgeRecord(directory, 'edge-owner.pending', 65536),
    'solver restoration pending readback',
  );
  await assertNoCommittedDependencyOwner(directory);
}

function parseRestorationJson(contents: string): unknown {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error('solver restoration record JSON is malformed');
  }
}

/** Keeps malformed capability transport excerpts out of the coordinator's public rejection. */
async function observeSolverCapabilities(
  image: string,
  docker: RunDocker,
  deadline: number,
): Promise<DependencyCapabilityObservation> {
  try {
    return await observeDependencyCapabilities(image, 'backend', docker, deadline);
  } catch {
    // Proof: the raw probe boundary exposed PRIVATE_CAPABILITY_SENTINEL; owner capability failure diagnostics failed (exit 1).
    throw new Error('solver restoration capability observation failed');
  }
}
