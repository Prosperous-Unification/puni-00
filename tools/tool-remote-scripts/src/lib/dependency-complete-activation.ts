import { activateCompleteDependenciesUnderOwner } from './complete-dependency-exclusion';
import { DependencyActivationFailure } from './dependency-activation-failure';
import {
  decodeDependencyMigrationPins,
  type DependencyMigrationPins,
} from './dependency-migration-artifact';
import { assertDigestPinnedRef } from './docker';
import { runDockerCli } from './docker-deadline';
import { runDockerExec } from './docker-exec';
import { spawnProductMetadata } from './docker-product-metadata';
import { inspectDependencyOwnerPublication } from './edge-ownership';
import { type DependencyOwnerPlan } from './edge-ownership';
import { withDependencyOwner } from './edge-ownership';
import { envLayout, type EnvName } from './env';
import { decodeInstalledAuthorityPins, type InstalledAuthorityPins } from './installed-authorities';
import { withAuthorityFiles } from './installed-authority-files';
import { collectAuthorityHost } from './installed-authority-supervision';
import { assertSame, readClosed, readString } from './managed-cohort';
import { decodeSolverPins, type SolverPins } from './solver-host';
import { SOLVER_EDGE_STATE, solverHostPorts } from './solver-host';
import { decodeSourceDevPins, type SourceDevPins } from './source-startup-manifest';
import type { Color } from './state';

/** Installed dormant profile only. The request supplies pins, never successful observations or live authority. */
export interface CompleteDependencyActivationRequest {
  readonly format: 'complete-dependency-activation';
  readonly version: 1;
  readonly owner: DependencyOwnerPlan;
  readonly activate: readonly EnvName[];
  readonly solver: SolverPins;
  readonly prod: {
    readonly backend: { readonly color: Color; readonly image: string };
    readonly gateway: { readonly color: Color; readonly image: string };
  };
  readonly source: {
    readonly pins: SourceDevPins;
    readonly manifestContents: string;
    readonly runtimeReference: string;
  };
  readonly authorities: {
    readonly pins: InstalledAuthorityPins;
    readonly writerManifestContents: string;
  };
  readonly migrations: DependencyMigrationPins;
}
/** Monotonic operation deadline. Synchronous SQLite work settles before its next deadline assertion. */
export function assertCompleteActivationDeadline(deadline: number): void {
  if (!Number.isFinite(deadline) || deadline <= performance.now())
    throw new Error('complete dependency activation deadline exceeded');
}
/** Closed boundary; validates cross-producer attribution and detaches all caller-owned values. */
export function decodeCompleteDependencyActivationRequest(
  value: unknown,
  deadline: number,
): CompleteDependencyActivationRequest {
  assertCompleteActivationDeadline(deadline);
  // Proof: omitting the upper bound admitted a finite oversized deadline; invalid-deadline test failed.
  if (deadline - performance.now() > 600000)
    throw new Error('complete dependency activation deadline exceeds bound');
  // Proof: bypassing readClosed admitted the extra-field request; binding-fault-extra test failed.
  const request = readClosed(value, [
    'format',
    'version',
    'owner',
    'activate',
    'solver',
    'prod',
    'source',
    'authorities',
    'migrations',
  ]);
  if (request['format'] !== 'complete-dependency-activation' || request['version'] !== 1)
    throw new Error('complete dependency activation request differs');
  const owner = readClosed(request['owner'], ['sha', 'layouts']);
  const sha = readString(owner['sha']);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('complete dependency activation SHA differs');
  const layouts = [envLayout('prod'), envLayout('dev')];
  assertSame(owner['layouts'], layouts, 'complete dependency activation canonical layouts');
  // Proof: removing roster validation admitted reversed, duplicate and empty selections; roster negatives failed.
  const raw = request['activate'];
  if (
    !Array.isArray(raw) ||
    !['["prod"]', '["dev"]', '["prod","dev"]'].includes(JSON.stringify(raw))
  )
    throw new Error('complete dependency activation roster differs');
  const activate: EnvName[] = raw.map((environment: unknown) => {
    if (environment !== 'prod' && environment !== 'dev')
      throw new Error('activation environment differs');
    return environment;
  });
  const solver = decodeSolverPins(request['solver']);
  const prod = readClosed(request['prod'], ['backend', 'gateway']);
  function participant(value: unknown, tier: 'be' | 'gw'): { color: Color; image: string } {
    const fields = readClosed(value, ['color', 'image']);
    const color = fields['color'];
    if (color !== 'blue' && color !== 'green') throw new Error('activation selected color differs');
    return { color, image: assertDigestPinnedRef(readString(fields['image']), tier) };
  }
  const source = readClosed(request['source'], ['pins', 'manifestContents', 'runtimeReference']);
  const pins = decodeSourceDevPins(source['pins']);
  const manifestContents = readString(source['manifestContents']);
  const runtimeReference = readString(source['runtimeReference']);
  if (
    Buffer.byteLength(manifestContents) > 64 * 1024 * 1024 ||
    !/^(?:[a-z0-9][a-z0-9._:-]*\/)*[a-z0-9][a-z0-9._-]*@sha256:[a-f0-9]{64}$/.test(runtimeReference)
  )
    throw new Error('activation source reference or manifest differs');
  const authorities = readClosed(request['authorities'], ['pins', 'writerManifestContents']);
  const authorityPins = decodeInstalledAuthorityPins(authorities['pins']);
  const writerManifestContents = readString(authorities['writerManifestContents']);
  // Proof: removing the writer bound admitted its oversized manifest; binding-fault-manifest failed.
  if (Buffer.byteLength(writerManifestContents) > 256 * 1024)
    throw new Error('activation writer manifest exceeds bound');
  const migrations = decodeDependencyMigrationPins(request['migrations']);
  // Proof: removing cross-source equality admitted different source pins; binding-fault-sha failed.
  if (
    [solver.sourceSha, pins.sourceSha, authorityPins.sourceSha, migrations.sourceSha].some(
      (sourceSha) => sourceSha !== sha,
    )
  )
    throw new Error('activation producer SHA differs');
  // Proof: removing solver equality admitted substituted unit pins; binding-fault-solver failed.
  assertSame(authorityPins.solver, solver, 'activation authority solver pins');
  const backend = participant(prod['backend'], 'be');
  const gateway = participant(prod['gateway'], 'gw');
  // Proof: removing candidate equality admitted a different migration image; binding-fault-image failed.
  if (backend.image !== migrations.candidateImage)
    throw new Error('activation migration candidate differs');
  return structuredClone({
    format: 'complete-dependency-activation',
    version: 1,
    owner: { sha, layouts },
    activate,
    solver,
    prod: { backend, gateway },
    source: { pins, manifestContents, runtimeReference },
    authorities: { pins: authorityPins, writerManifestContents },
    migrations,
  });
}

/**
 * Activates only installed dormant stores while actual participants and ingress remain fenced.
 * Constructs production transports itself; never restores, starts, exposes or retires the pending owner.
 * Later compatible restart, handoff and controller adoption remain mandatory.
 */
export async function activateExcludedDependencies(
  supplied: CompleteDependencyActivationRequest,
  deadline: number,
) {
  let request: CompleteDependencyActivationRequest;
  try {
    request = decodeCompleteDependencyActivationRequest(supplied, deadline);
  } catch {
    // Proof: raw entry validation leaked PRIVATE_REQUEST_SENTINEL; public request refusal test failed.
    throw new DependencyActivationFailure(
      'unpublished',
      'request-validation',
      undefined,
      new Map(),
    );
  }
  const prod = request.owner.layouts[0];
  const dev = request.owner.layouts[1];
  const solver = solverHostPorts();
  let attempt = 'unpublished';
  let refusal: DependencyActivationFailure | undefined;
  const committed = new Map<
    EnvName,
    Awaited<
      ReturnType<typeof activateCompleteDependenciesUnderOwner>
    >['receipts'][number]['receipt']
  >();
  try {
    return await withDependencyOwner(
      request.owner,
      async (owner) => {
        attempt = (await inspectDependencyOwnerPublication(owner, { prod, dev })).attempt;
        try {
          const completion = await activateCompleteDependenciesUnderOwner(
            owner,
            request,
            { prod, dev },
            deadline,
            SOLVER_EDGE_STATE,
            {
              solver,
              docker: runDockerCli,
              execDocker: runDockerExec,
              spawnProductMetadata,
              authorities: { withFiles: withAuthorityFiles, solver, collect: collectAuthorityHost },
            },
          );
          for (const entry of completion.receipts) committed.set(entry.environment, entry.receipt);
          return completion;
        } catch (cause) {
          if (cause instanceof DependencyActivationFailure) refusal = cause;
          throw cause;
        }
      },
      SOLVER_EDGE_STATE,
    );
  } catch (cause) {
    if (cause instanceof DependencyActivationFailure) throw cause;
    if (refusal !== undefined) throw refusal;
    throw new DependencyActivationFailure(
      attempt,
      'owner-scope-or-finalizer',
      undefined,
      committed,
    );
  }
}
