import { realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { DependencyActivationReceipt } from '@wbs/contracts/dependency-runtime';

import { auditUnmanagedMountsUnderOwner, type DatabaseIdentity } from './backend-cohort';
import { inspectBackendFenceUnderOwner } from './backend-exclusion';
import { DependencyActivationFailure } from './dependency-activation-failure';
import { excludeSourceAndManagedUnderOwner } from './dependency-activation-owner';
import type { CompleteDependencyParticipants } from './dependency-activation-records';
import { activateDependencyStores, hashActivationBytes } from './dependency-activation-storage';
import type { CompleteDependencyActivationRequest } from './dependency-complete-activation';
import { inspectDependencyIngress, inspectDependencyIngressHash } from './dependency-ingress';
import { observeDependencyMigrationArtifact } from './dependency-migration-artifact';
import { scanMigrationArtifact } from './dependency-migration-artifact-scanner';
import { observeDependencyCapabilities, probeDependencyCapabilities } from './dependency-preflight';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import type { DockerExec } from './docker-exec';
import { parseDockerInspection } from './docker-inspection-json';
import { identifyInventory, orderMounts } from './docker-inventory';
import {
  assertDependencyOwner,
  assertDependencyOwnerDirectory,
  type DependencyOwner,
  inspectDependencyOwnerPublication,
  ownerDockerExec,
  ownerDockerHashed,
  retainActivationRecord,
} from './edge-ownership';
import { captureEdgePolicy, captureEdgeRecord, decodeOrdinaryEdgePolicy } from './edge-policy';
import { type EnvName, sourceDevContract } from './env';
import { inspectGatewayFenceUnderLock } from './gateway-exclusion';
import {
  type AuthorityDatabase,
  type InstalledAuthorityObservation,
  type InstalledAuthorityPorts,
  observeInstalledAuthority,
} from './installed-authorities';
import { assertSame, readFields, readIdentity, readRecord } from './managed-cohort';
import { verifyContainerNamespace, verifyContainerReaderExclusion } from './mount-audit';
import { captureParkedDependencies } from './parked-dependencies';
import {
  assertSolverExclusionDeadline,
  inspectExcludedSolverMembers,
  inspectSolverFenceHash,
  type SolverLayouts,
} from './solver-exclusion';
import type { SolverPorts } from './solver-host';
import {
  assertRetainedSolverRestoration,
  retainCompatibleSolverIntent,
} from './solver-restoration';
import { observeSourceDatabaseBindings } from './source-database-binding';
import { decodeSourceDev, sourceDevIdentity } from './source-dev-cohort';
import {
  assertSourceDevExclusionDeadline,
  inspectExcludedSourceMember,
  inspectSourceDevFenceHash,
} from './source-dev-exclusion';
import { inspectSourceDevInputs } from './source-dev-inputs';

const identity: unique symbol = Symbol('complete-dependency-exclusion');
/** Internal original in-memory interval. JSON, copied tokens and historical evidence carry no authority. */
export interface CompleteDependencyExclusion {
  readonly [identity]: true;
}
interface CompleteScope {
  readonly owner: DependencyOwner;
  readonly layouts: SolverLayouts;
  readonly request: CompleteDependencyActivationRequest;
  readonly deadline: number;
  readonly attempt: string;
  readonly directory: string;
  readonly artifactDirectory: string;
  readonly stateDirectoryIdentity: string;
  readonly databases: { readonly prod: DatabaseIdentity; readonly dev: DatabaseIdentity };
  readonly migrations: Awaited<ReturnType<typeof observeDependencyMigrationArtifact>>;
  readonly participants: CompleteDependencyParticipants;
  readonly committed: Map<EnvName, DependencyActivationReceipt>;
  readonly authority: Map<
    EnvName,
    'initial' | 'DISABLED' | 'dispatch-uncertain' | DependencyActivationReceipt
  >;
  readonly inspect: () => Promise<void>;
}
const exclusions = new WeakMap<CompleteDependencyExclusion, CompleteScope>();
/** Rechecks actual live constituents, inventories, authorities, namespace aliases and independently pinned bytes. */
export async function assertCompleteDependencyExclusion(
  owner: DependencyOwner,
  token: CompleteDependencyExclusion,
): Promise<CompleteScope> {
  const scope = exclusions.get(token);
  if (scope?.owner !== owner) throw new Error('complete dependency exclusion is not live');
  await scope.inspect();
  if (exclusions.get(token) !== scope) throw new Error('complete dependency exclusion expired');
  return scope;
}
/** Internal low-level fixture seams. No observation, activation response or success constructor is accepted. */
export interface CompleteActivationTransports {
  readonly solver: SolverPorts;
  readonly docker: RunDocker;
  readonly execDocker: DockerExec;
  readonly authorities: InstalledAuthorityPorts;
}
interface SelectedParticipant {
  readonly id: string;
  readonly image: string;
  readonly imageId: string;
  readonly fingerprint: string;
  readonly networkId: string;
}
function fingerprint(raw: Record<string, unknown>) {
  const host = { ...readFields(raw['HostConfig']) };
  delete host['RestartPolicy'];
  return hashActivationBytes(
    JSON.stringify({
      Config: raw['Config'],
      HostConfig: host,
      Mounts: orderMounts(raw['Mounts']),
      Path: raw['Path'],
      Args: raw['Args'],
    }),
  );
}
function authorityIdentity(observation: InstalledAuthorityObservation) {
  return {
    sourceSha: observation.sourceSha,
    writerManifestSha256: observation.writerManifestSha256,
    hostMachineIdSha256: observation.hostMachineIdSha256,
    bootId: observation.bootId,
    launchConfigurationSha256: observation.launchConfigurationSha256,
    files: observation.files,
    solver: observation.solver,
  };
}
/** Internal fixed-profile composition under an already retained outer owner; return follows every physical finalizer. */
export async function activateCompleteDependenciesUnderOwner(
  owner: DependencyOwner,
  request: CompleteDependencyActivationRequest,
  layouts: SolverLayouts,
  deadline: number,
  directory: string,
  ports: CompleteActivationTransports,
) {
  const sha = request.owner.sha;
  const docker = ownerDockerHashed(owner, layouts.prod, ports.docker);
  const bounded = () => Math.min(deadline, performance.now() + 120000);
  const assertDeadline = () => {
    if (!Number.isFinite(deadline) || deadline <= performance.now())
      throw new Error('complete dependency activation deadline exceeded');
  };
  await assertDependencyOwnerDirectory(owner, layouts.prod, directory);
  await assertDependencyOwner(owner, layouts.dev, sha);
  const publication = await inspectDependencyOwnerPublication(owner, layouts);
  const pendingSnapshot = await captureEdgeRecord(directory, 'edge-owner.pending', 65536);
  const pending = pendingSnapshot.contents;
  const committed = new Map<EnvName, DependencyActivationReceipt>();
  let evidence: Awaited<ReturnType<typeof activateDependencyStores>>['evidence'] | undefined;
  try {
    const originalPolicy = await captureEdgePolicy(directory);
    decodeOrdinaryEdgePolicy(originalPolicy.policy, directory);
    async function inventory(): Promise<unknown[]> {
      assertDeadline();
      const listed = (
        await runDockerBefore(['ps', '-a', '--no-trunc', '--format', '{{.ID}}'], docker, deadline)
      ).trim();
      const ids = listed === '' ? [] : listed.split('\n').map(readIdentity);
      if (ids.length === 0 || new Set(ids).size !== ids.length)
        throw new Error('activation full inventory missing or duplicate');
      const inspected = parseDockerInspection(
        await runDockerBefore(['inspect', ...ids], docker, deadline),
      );
      if (!Array.isArray(inspected) || inspected.length !== ids.length)
        throw new Error('activation full inventory malformed');
      assertSame(
        [...ids].sort(),
        inspected.map((raw: unknown) => readIdentity(readFields(raw)['Id'])).sort(),
        'activation exact full inventory',
      );
      return inspected.map((raw: unknown) => raw);
    }
    async function resolveImage(image: string): Promise<string> {
      const native = await runDockerBefore(
        ['image', 'inspect', '--format', '{{.Id}}', image],
        docker,
        deadline,
      );
      // Proof: accepting a bare hash reached ingress reload; native-image-format preflight negative failed.
      if (!/^sha256:[a-f0-9]{64}\n?$/.test(native))
        throw new Error('activation native image identity malformed');
      return native.trim();
    }
    async function inspectRuntime() {
      const image = parseDockerInspection(
        await runDockerBefore(
          ['image', 'inspect', request.source.runtimeReference],
          docker,
          deadline,
        ),
      );
      if (!Array.isArray(image) || image.length !== 1)
        throw new Error('activation runtime image observation malformed');
      const native = readFields(image[0]);
      if (
        native['Id'] !== request.source.pins.runtimeImageId ||
        !Array.isArray(native['RepoDigests']) ||
        !native['RepoDigests'].includes(request.source.runtimeReference) ||
        (await resolveImage(request.source.runtimeReference)) !== request.source.pins.runtimeImageId
      )
        throw new Error('activation source RepoDigest binding differs');
    }
    const initial = await inventory();
    const sourceName = sourceDevContract(layouts.dev).name;
    const sourceMembers = initial.map(readFields).filter((raw) => raw['Name'] === `/${sourceName}`);
    const sourceRaw = sourceMembers.at(0);
    // Proof: missing-source reached ingress reload when the original source census was omitted.
    if (sourceMembers.length !== 1 || sourceRaw === undefined)
      throw new Error('activation requires existing source participant');
    const initialSource = decodeSourceDev(sourceRaw, layouts.dev);
    if (initialSource.image !== request.source.pins.runtimeImageId)
      throw new Error('activation original source runtime differs');
    async function select(role: 'backend' | 'gateway'): Promise<SelectedParticipant> {
      const tier = role === 'backend' ? 'be' : 'gw';
      const selected = request.prod[role];
      const name = `${tier}-01-${selected.color}`;
      const named = initial.map(readFields).filter((raw) => raw['Name'] === `/${name}`);
      const raw = named.at(0);
      if (named.length !== 1 || raw === undefined)
        throw new Error('activation requires existing selected participant');
      const state = readFields(raw['State']);
      const config = readFields(raw['Config']);
      const imageId = await resolveImage(selected.image);
      if (
        raw['Image'] !== imageId ||
        config['Image'] !== selected.image ||
        state['Running'] !== true ||
        state['Paused'] !== false ||
        state['Restarting'] !== false
      )
        throw new Error('activation selected installed identity differs');
      const selectedNetwork = readFields(
        readFields(readFields(raw['NetworkSettings'])['Networks'])[layouts.prod.network],
      );
      const networkId = readIdentity(selectedNetwork['NetworkID']);
      if (!Array.isArray(selectedNetwork['Aliases']) || !selectedNetwork['Aliases'].includes(name))
        throw new Error('activation selected network name resolution unavailable');
      const environment = config['Env'];
      if (
        !Array.isArray(environment) ||
        environment.some((entry) => typeof entry !== 'string') ||
        environment.some(
          (entry: string) =>
            entry.startsWith('MIGRATE_ON_STARTUP=') && entry !== 'MIGRATE_ON_STARTUP=false',
        )
      )
        throw new Error('activation selected startup migration profile differs');
      for (const member of initial.map(readFields)) {
        const networks = readFields(readFields(member['NetworkSettings'])['Networks']);
        const network = networks[layouts.prod.network];
        if (network === undefined) continue;
        const aliases = readFields(network)['Aliases'];
        if (!Array.isArray(aliases)) throw new Error('activation network aliases unavailable');
        if (member['Id'] !== raw['Id'] && aliases.includes(name))
          throw new Error('activation selected network alias is foreign');
      }
      return {
        id: readIdentity(raw['Id']),
        image: selected.image,
        imageId,
        fingerprint: fingerprint(raw),
        networkId,
      };
    }
    const selected = { backend: await select('backend'), gateway: await select('gateway') };
    if (selected.backend.networkId !== selected.gateway.networkId)
      throw new Error('activation selected network identities differ');
    await inspectRuntime();
    const backendCapabilities = await probeDependencyCapabilities(
      selected.backend.image,
      selected.backend.image,
      docker,
      bounded(),
    );
    const gatewayCapability = await observeDependencyCapabilities(
      selected.gateway.image,
      'gateway',
      docker,
      bounded(),
    );
    if (
      backendCapabilities.length !== 2 ||
      backendCapabilities.some((observation) => observation.semantics.length !== 1) ||
      gatewayCapability.semantics.length !== 1
    )
      throw new Error('activation selected capabilities unavailable');
    const prepared = await excludeSourceAndManagedUnderOwner(
      owner,
      request.owner,
      layouts,
      request.solver,
      ports.solver,
      ports.docker,
      deadline,
      async (_owner, source, solver) => {
        const bindings = await observeSourceDatabaseBindings(
          owner,
          layouts,
          source,
          solver,
          request.source.pins,
          request.source.manifestContents,
          ports.docker,
          deadline,
          ports.execDocker,
        );
        const databases = { prod: bindings.prod, dev: bindings.dev };
        const authorityDatabases: AuthorityDatabase[] = (['prod', 'dev'] as const).map(
          (environment) => ({
            environment,
            host: databases[environment].host,
            directoryIdentity: databases[environment].directoryIdentity,
            fileIdentity: databases[environment].fileIdentity,
          }),
        );
        const observeAuthorities = () =>
          observeInstalledAuthority(
            owner,
            layouts,
            request.authorities.pins,
            request.authorities.writerManifestContents,
            authorityDatabases,
            bounded(),
            ports.authorities,
          );
        const observeArtifact = () =>
          observeDependencyMigrationArtifact(
            owner,
            layouts,
            request.migrations,
            ports.docker,
            bounded(),
          );
        const authorities = await observeAuthorities();
        function assertAuthorities(observation: InstalledAuthorityObservation) {
          if (observation.solver.phase !== 'stopped' || observation.databaseOpeners.length !== 0)
            throw new Error('activation installed authorities are not excluded');
          assertSame(
            authorityIdentity(authorities),
            authorityIdentity(observation),
            'activation installed static authority identity',
          );
        }
        assertAuthorities(authorities);
        const migrations = await observeArtifact();
        async function inspectSourceArtifact() {
          const scanned = await scanMigrationArtifact(
            join(layouts.dev.root, 'src/apps/wbs/be-01/drizzle'),
            bounded(),
          );
          const installed = await scanMigrationArtifact(
            join(directory, 'dependency-artifacts', request.migrations.manifestSha256, 'drizzle'),
            bounded(),
          );
          assertSame(
            installed.migrations,
            scanned.migrations,
            'activation source and installed migration artifact',
          );
        }
        await inspectSourceArtifact();
        const solverIntent = await retainCompatibleSolverIntent(
          owner,
          layouts,
          request.solver,
          ports.solver,
          deadline,
        );
        async function inspectSelected(full: unknown[]) {
          for (const [role, participant] of Object.entries(selected)) {
            const expectedName = `${role === 'backend' ? 'be' : 'gw'}-01-${request.prod[role === 'backend' ? 'backend' : 'gateway'].color}`;
            for (const member of full.map(readFields)) {
              const network = readFields(readFields(member['NetworkSettings'])['Networks'])[
                layouts.prod.network
              ];
              if (network === undefined) continue;
              const native = readFields(network);
              if (member['Id'] === participant.id && native['NetworkID'] !== participant.networkId)
                throw new Error('activation selected network changed');
              if (
                member['Id'] !== participant.id &&
                Array.isArray(native['Aliases']) &&
                native['Aliases'].includes(expectedName)
              )
                throw new Error('activation selected alias became foreign');
            }
          }
          for (const participant of Object.values(selected)) {
            const members = full.map(readFields).filter((raw) => raw['Id'] === participant.id);
            const raw = members.at(0);
            if (
              members.length !== 1 ||
              raw?.['Image'] !== participant.imageId ||
              readFields(raw['Config'])['Image'] !== participant.image ||
              fingerprint(raw) !== participant.fingerprint ||
              (await resolveImage(participant.image)) !== participant.imageId
            )
              throw new Error('activation original selected participant changed');
          }
        }
        const backendFenceBytes = await readRecord(
          join(layouts.prod.stateDir, 'dependency-backend-complete.json'),
        );
        const gatewayFenceBytes = await readRecord(
          join(layouts.prod.stateDir, 'dependency-gateway-complete.json'),
        );
        async function inspect() {
          assertDeadline();
          assertSame(
            pendingSnapshot,
            await captureEdgeRecord(directory, 'edge-owner.pending', 65536),
            'original private owner publication',
          );
          assertSame(
            backendFenceBytes,
            await readRecord(join(layouts.prod.stateDir, 'dependency-backend-complete.json')),
            'original backend fence bytes',
          );
          assertSame(
            gatewayFenceBytes,
            await readRecord(join(layouts.prod.stateDir, 'dependency-gateway-complete.json')),
            'original gateway fence bytes',
          );
          await assertRetainedSolverRestoration(owner, solverIntent);
          assertSolverExclusionDeadline(owner, solver, deadline);
          assertSourceDevExclusionDeadline(owner, source, deadline);
          await assertDependencyOwner(owner, layouts.prod, sha);
          await assertDependencyOwner(owner, layouts.dev, sha);
          assertSame(
            originalPolicy,
            await captureEdgePolicy(directory),
            'activation ordinary policy',
          );
          await inspectDependencyIngress(
            owner,
            [layouts.prod, layouts.dev],
            ports.docker,
            deadline,
          );
          await inspectSourceDevInputs(owner, bindings.sourceInputs);
          const fresh = await observeSourceDatabaseBindings(
            owner,
            layouts,
            source,
            solver,
            request.source.pins,
            request.source.manifestContents,
            ports.docker,
            deadline,
            ports.execDocker,
          );
          assertSame(
            databases,
            { prod: fresh.prod, dev: fresh.dev },
            'activation canonical database bindings',
          );
          const backend = await inspectBackendFenceUnderOwner(
            owner,
            layouts.prod,
            sha,
            ports.docker,
            deadline,
            source,
            verifyContainerNamespace,
            ports.execDocker,
            solver,
          );
          const gateway = await inspectGatewayFenceUnderLock(layouts.prod, docker, deadline);
          if (
            backend.cohort[request.prod.backend.color]?.id !== selected.backend.id ||
            gateway.cohort[request.prod.gateway.color]?.id !== selected.gateway.id
          )
            throw new Error('activation selected stopped cohort differs');
          const before = await inventory();
          await inspectSelected(before);
          const excludedSource = await inspectExcludedSourceMember(
            owner,
            layouts.prod,
            source,
            before,
            deadline,
          );
          // Proof: source replacement after ingress reached storage without this original identity binding.
          assertSame(
            sourceDevIdentity(initialSource),
            sourceDevIdentity(decodeSourceDev(excludedSource, layouts.dev)),
            'activation original installed source identity',
          );
          await inspectExcludedSolverMembers(owner, layouts.prod, solver, before);
          const namespace: typeof verifyContainerNamespace = (
            container,
            destinations,
            databaseHostPath,
            image,
            run,
            _databasePath,
            bounds,
          ) =>
            verifyContainerReaderExclusion(
              container,
              destinations,
              databaseHostPath,
              image,
              run,
              bounds,
              ownerDockerExec(owner, layouts.prod, ports.execDocker),
            );
          // Proof: omitting dev admitted a hidden actual RO dev alias into storage evidence; dev-only native coordinator negative failed.
          for (const database of [databases.prod, databases.dev]) {
            await auditUnmanagedMountsUnderOwner(
              owner,
              layouts.prod,
              source,
              before,
              backend.cohort,
              database,
              selected.backend.image,
              docker,
              deadline,
              namespace,
              realpath,
              solver,
            );
          }
          assertSame(
            identifyInventory(before),
            identifyInventory(await inventory()),
            'activation dual-family inventory bracket',
          );
          assertAuthorities(await observeAuthorities());
          assertSame(
            migrations,
            await observeArtifact(),
            'activation independent migration artifact',
          );
          await inspectSourceArtifact();
          await inspectRuntime();
          await inspectSourceDevInputs(owner, bindings.sourceInputs);
          assertDeadline();
        }
        await inspect();
        const fences = {
          ingressSha256: await inspectDependencyIngressHash(owner),
          sourceSha256: await inspectSourceDevFenceHash(owner, source),
          backendSha256: hashActivationBytes(
            await readRecord(join(layouts.prod.stateDir, 'dependency-backend-complete.json')),
          ),
          gatewaySha256: hashActivationBytes(
            await readRecord(join(layouts.prod.stateDir, 'dependency-gateway-complete.json')),
          ),
          solverSha256: await inspectSolverFenceHash(owner, solver),
        };
        const participants: CompleteDependencyParticipants = {
          format: 'complete-dependency-participants',
          version: 1,
          operation: 'activate-installed-dormant',
          sourceSha: sha,
          ownerPublicationSha256: hashActivationBytes(pending),
          selected: {
            backend: {
              id: selected.backend.id,
              image: selected.backend.image,
              imageId: selected.backend.imageId,
            },
            gateway: {
              id: selected.gateway.id,
              image: selected.gateway.image,
              imageId: selected.gateway.imageId,
            },
            source: {
              id: bindings.sourceInputs.containerId,
              runtimeReference: request.source.runtimeReference,
              runtimeImageId: request.source.pins.runtimeImageId,
              manifestSha256: request.source.pins.manifestSha256,
              environmentSha256: request.source.pins.environmentSha256,
            },
          },
          capabilities: {
            backendCandidate: backendCapabilities[0],
            backendRetained: backendCapabilities[1],
            gateway: gatewayCapability,
            source: bindings.sourceInputs.capabilities,
          },
          authorities: {
            writerManifestSha256: authorities.writerManifestSha256,
            launchConfigurationSha256: authorities.launchConfigurationSha256,
            hostMachineIdSha256: authorities.hostMachineIdSha256,
            bootId: authorities.bootId,
            filesSha256: hashActivationBytes(JSON.stringify(authorities.files)),
          },
          solver: {
            pins: request.solver,
            restorationIntent: {
              name: basename(solverIntent.path),
              sha256: hashActivationBytes(solverIntent.contents),
            },
          },
          databases: (['prod', 'dev'] as const).map((environment) => ({
            environment,
            ...databases[environment],
          })),
          fences,
          migrationManifestSha256: request.migrations.manifestSha256,
        };
        const token: CompleteDependencyExclusion = Object.freeze({ [identity]: true as const });
        exclusions.set(token, {
          owner,
          layouts,
          request,
          deadline,
          attempt: publication.attempt,
          directory,
          artifactDirectory: join(
            directory,
            'dependency-artifacts',
            request.migrations.manifestSha256,
            'drizzle',
          ),
          stateDirectoryIdentity: `${originalPolicy.parentDevice}:${originalPolicy.parentInode}`,
          databases,
          migrations,
          participants,
          committed,
          authority: new Map([
            ['prod', 'initial'],
            ['dev', 'initial'],
          ]),
          inspect,
        });
        try {
          const storage = await activateDependencyStores(owner, token);
          evidence = storage.evidence;
          const parked = await captureParkedDependencies(
            owner,
            layouts,
            sha,
            source,
            solver,
            ports.docker,
            deadline,
          );
          await assertCompleteDependencyExclusion(owner, token);
          return { receipts: storage.receipts, parked };
        } finally {
          exclusions.delete(token);
        }
      },
      verifyContainerNamespace,
      ports.execDocker,
      { backend: request.prod.backend.color, gateway: request.prod.gateway.color },
    );
    await prepared.parked.inspect(new Set());
    await inspectDependencyIngress(owner, [layouts.prod, layouts.dev], ports.docker, deadline);
    assertSame(
      originalPolicy,
      await captureEdgePolicy(directory),
      'final activation ordinary policy',
    );
    if (evidence === undefined) throw new Error('activation evidence monitor missing');
    await evidence.inspect();
    await retainActivationRecord(owner, layouts, 'fenced-complete', {
      format: 'dependency-activation-fenced-complete',
      version: 1,
      activated: prepared.receipts,
      exposure: 'closed',
      controllers: 'fenced',
    });
    await evidence.inspect();
    assertDeadline();
    return {
      state: 'activation-committed-participants-fenced' as const,
      exposure: 'closed' as const,
      controllers: 'fenced' as const,
      activated: [...request.activate],
      receipts: prepared.receipts,
    };
  } catch (cause) {
    if (cause instanceof DependencyActivationFailure) throw cause;
    throw new DependencyActivationFailure(
      publication.attempt,
      'exclusion-or-finalizer',
      undefined,
      committed,
    );
  } finally {
    if (evidence !== undefined) evidence.close();
  }
}
