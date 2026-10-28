import { basename, dirname, join } from 'node:path';

import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import type { ActivationRecordReference } from './dependency-activation-records';
import { hashActivationBytes } from './dependency-activation-storage';
import { assertCompleteActivationDeadline } from './dependency-complete-activation';
import { inspectDependencyIngress } from './dependency-ingress';
import { assertParticipantImage } from './dependency-participant-images';
import { assertParticipantInventory } from './dependency-participant-inventory';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import {
  observeProductParticipantReadiness,
  type ProductParticipantReadiness,
} from './dependency-participant-readiness';
import {
  assertParticipantTransition,
  type ParticipantSnapshot,
  readParticipantSnapshot,
} from './dependency-participant-transition';
import { observeSelectedProductRole } from './dependency-product-process';
import { runDockerBefore } from './docker-deadline';
import { parseDockerInspection } from './docker-inspection-json';
import { ownerDockerHashed, retainActivationRecord } from './edge-ownership';
import {
  captureEdgePolicy,
  captureEdgeRecord,
  captureParticipantFence,
  type EdgeRecordSnapshot,
  type ParticipantFenceName,
} from './edge-policy';
import type { HostProcessIdentity, InstalledAuthorityObservation } from './installed-authorities';
import { assertSame, readFields, readIdentity } from './managed-cohort';
import { assertRetainedSolverRestoration } from './solver-restoration';

export interface BackendParticipantRestoration {
  readonly state: 'backend-ready-participants-fenced';
  readonly exposure: 'closed';
  readonly controllers: 'fenced';
  readonly readiness: ProductParticipantReadiness;
  readonly ready: EdgeRecordSnapshot;
}

/** Terminal effect accounting only; original consumed-context checks still own all authority. */
const attempted = new WeakSet<FinalizedParticipantRestorationContext>();

/**
 * One backend attempt under the original consumed owner and deadline, with the
 * original solver still parked. This partial readiness is not full restoration
 * and cannot follow restoreSolverUnderOwner unchanged: full composition must
 * restore its pinned solver before products under separately proved phase rules.
 * No controller, ingress or restart policy is restored. Any failure leaves the
 * attempt terminal and retains current stores, durable intents and all fences.
 * Private Docker/host/SQL diagnostics are discarded at this orchestration boundary.
 */
export async function restoreBackendParticipantUnderOwner(
  context: FinalizedParticipantRestorationContext,
): Promise<BackendParticipantRestoration> {
  try {
    await assertParticipantRestorationContext(context);
    if (attempted.has(context)) throw new Error('backend restoration already attempted');
    attempted.add(context);
    const docker = ownerDockerHashed(context.owner, context.layouts.prod, context.ports.docker);
    const roles = ['backend', 'gateway', 'source'] as const;
    const selected = new Set(roles.map((role) => context.originals[role].id));
    const running = new Map<string, ParticipantSnapshot>();
    const removed = new Set<string>();
    const retained: EdgeRecordSnapshot[] = [];
    const retainedFences: {
      readonly directory: string;
      readonly name: ParticipantFenceName;
      readonly snapshot: EdgeRecordSnapshot;
    }[] = [];
    const createReference = (snapshot: EdgeRecordSnapshot): ActivationRecordReference => ({
      name: basename(snapshot.path),
      sha256: hashActivationBytes(snapshot.contents),
    });
    async function retainReference(expected: ActivationRecordReference): Promise<void> {
      const snapshot = await captureEdgeRecord(context.directory, expected.name, 65536);
      assertSame(expected, createReference(snapshot), 'backend original activation reference');
      retained.push(snapshot);
    }
    async function readInventory(): Promise<unknown[]> {
      assertCompleteActivationDeadline(context.deadline);
      const listed = (
        await runDockerBefore(
          ['ps', '-a', '--no-trunc', '--format', '{{.ID}}'],
          docker,
          context.deadline,
        )
      ).trim();
      const ids = listed === '' ? [] : listed.split('\n').map(readIdentity);
      if (ids.length === 0 || new Set(ids).size !== ids.length)
        throw new Error('backend complete inventory missing or duplicate');
      const inspected = parseDockerInspection(
        await runDockerBefore(['inspect', ...ids], docker, context.deadline),
      );
      if (!Array.isArray(inspected) || inspected.length !== ids.length)
        throw new Error('backend complete inventory malformed');
      assertSame(
        [...ids].sort(),
        inspected.map((member) => readIdentity(readFields(member)['Id'])).sort(),
        'backend complete inventory IDs',
      );
      return inspected.map((member: unknown) => member);
    }
    function readBackendSnapshot(members: readonly unknown[]): ParticipantSnapshot {
      const matches = members.filter(
        (member) => readFields(member)['Id'] === context.originals.backend.id,
      );
      if (matches.length !== 1) throw new Error('backend selected participant absent');
      return readParticipantSnapshot(matches[0]);
    }
    async function inspectRetained(): Promise<void> {
      await assertParticipantRestorationContext(context);
      assertCompleteActivationDeadline(context.deadline);
      await context.storage.evidence.inspect();
      context.artifact.verify();
      await context.storage.stores.inspect();
      await context.source.inspectCold();
      await assertRetainedSolverRestoration(context.owner, context.solverIntent);
      assertSame(
        context.originalPolicy,
        await captureEdgePolicy(context.directory),
        'backend original fenced edge policy',
      );
      for (const snapshot of retained)
        assertSame(
          snapshot,
          await captureEdgeRecord(dirname(snapshot.path), basename(snapshot.path), 65536),
          'backend retained publication',
        );
      for (const fence of retainedFences)
        assertSame(
          fence.snapshot,
          await captureParticipantFence(fence.directory, fence.name),
          'backend retained participant fence',
        );
      const members = await readInventory();
      assertParticipantInventory(context.parkedInventory, members, selected, running, removed);
      const backend = readBackendSnapshot(members);
      const image = parseDockerInspection(
        await runDockerBefore(
          ['image', 'inspect', context.participants.selected.backend.imageId],
          docker,
          context.deadline,
        ),
      );
      assertParticipantImage(backend, image, {
        role: 'backend',
        reference: context.participants.selected.backend.image,
        imageId: context.participants.selected.backend.imageId,
        sourceSha: context.request.owner.sha,
        backendColor: context.request.prod.backend.color,
        dataDirectory: join(context.layouts.prod.root, 'data'),
      });
      await inspectDependencyIngress(
        context.owner,
        [context.layouts.prod, context.layouts.dev],
        context.ports.docker,
        context.deadline,
      );
      await assertParticipantRestorationContext(context);
    }
    async function inspectAuthorities(backend: HostProcessIdentity | null): Promise<void> {
      const observed = await context.observeAuthorities();
      const projectAuthorityIdentity = (authority: InstalledAuthorityObservation) => ({
        sourceSha: authority.sourceSha,
        writerManifestSha256: authority.writerManifestSha256,
        hostMachineIdSha256: authority.hostMachineIdSha256,
        bootId: authority.bootId,
        launchConfigurationSha256: authority.launchConfigurationSha256,
        files: authority.files,
        solver: authority.solver,
      });
      if (context.authorities.solver.phase !== 'stopped')
        throw new Error('backend partial restoration requires original parked solver');
      assertSame(
        projectAuthorityIdentity(context.authorities),
        projectAuthorityIdentity(observed),
        'backend original installed restart authority',
      );
      // Proof: omitting the empty-opener check let the prestart authority case
      // return readiness; its refusal assertion failed and passed after restoration.
      if (backend === null)
        assertSame([], observed.databaseOpeners, 'backend pre-start database openers');
      else
        for (const opener of observed.databaseOpeners) {
          // Proof: omitting this grouped tuple guard let the dev authority case
          // return readiness; its refusal assertion failed and passed after restoration.
          if (
            opener.environment !== 'prod' ||
            opener.pid !== backend.pid ||
            opener.startTime !== backend.startTime ||
            opener.uid !== backend.uid ||
            opener.cgroup !== backend.cgroup
          )
            throw new Error('backend authority has an unbound database opener');
          // The actual inner-process decoder/profile requires a non-null executable;
          // comparing that bound identity also refuses a null opener executable.
          // Proof: omitting this equality let the exe-null authority case return
          // readiness; its refusal assertion failed and passed after restoration.
          assertSame(backend.executable, opener.executable, 'backend database opener executable');
        }
      await assertParticipantRestorationContext(context);
    }

    // The existing parked monitor anchors original fence bytes before this role
    // additionally retains their file identities. It is never rebased after start.
    await context.parked.inspect(removed);
    await retainReference(context.storage.participantRecord);
    for (const committed of context.storage.commitRecords)
      await retainReference(committed.reference);
    await assertRetainedSolverRestoration(context.owner, context.solverIntent);
    const solver = await captureEdgeRecord(
      context.directory,
      basename(context.solverIntent.path),
      65536,
    );
    assertSame(
      context.solverIntent.contents,
      solver.contents,
      'backend original solver intent bytes',
    );
    retained.push(solver);
    const fences = [
      { directory: context.layouts.dev.stateDir, name: 'dependency-source-dev-intent.json' },
      { directory: context.layouts.dev.stateDir, name: 'dependency-source-dev-complete.json' },
      { directory: context.layouts.prod.stateDir, name: 'dependency-backend-fence.json' },
      { directory: context.layouts.prod.stateDir, name: 'dependency-backend-intent.json' },
      { directory: context.layouts.prod.stateDir, name: 'dependency-backend-complete.json' },
      { directory: context.layouts.prod.stateDir, name: 'dependency-gateway-fence.json' },
      { directory: context.layouts.prod.stateDir, name: 'dependency-gateway-intent.json' },
      { directory: context.layouts.prod.stateDir, name: 'dependency-gateway-complete.json' },
    ] as const;
    for (const fence of fences) {
      const snapshot = await captureParticipantFence(fence.directory, fence.name);
      retainedFences.push({ ...fence, snapshot });
    }
    await context.parked.inspect(removed);
    await inspectRetained();
    await inspectAuthorities(null);
    for (const role of roles)
      assertSame(
        context.participants.selected[role].id,
        context.originals[role].id,
        'backend original selected participant',
      );
    const parked = readBackendSnapshot(context.parkedInventory);
    const restoration = await retainActivationRecord(
      context.owner,
      context.layouts,
      'participant-restore-intent',
      {
        format: 'dependency-participant-restore-intent',
        version: 1,
        participants: context.storage.participantRecord,
        committed: context.storage.commitRecords.map((entry) => ({
          environment: entry.environment,
          record: entry.reference,
        })),
        solverIntent: createReference(solver),
        selected: roles.map((role) => ({
          role,
          id: context.originals[role].id,
          originalPolicy: context.originals[role].policy,
          snapshotSha256: hashActivationBytes(JSON.stringify(context.originals[role])),
        })),
      },
    );
    retained.push(restoration);
    const intent = await retainActivationRecord(
      context.owner,
      context.layouts,
      'participant-start-intent',
      {
        format: 'dependency-participant-start-intent',
        version: 1,
        restoration: createReference(restoration),
        role: 'backend',
        id: parked.id,
      },
    );
    retained.push(intent);
    await inspectRetained();
    await inspectAuthorities(null);
    await runDockerBefore(['start', parked.id], docker, context.deadline);
    const started = assertParticipantTransition(
      parked,
      readBackendSnapshot(await readInventory()).native,
      'start',
    );
    running.set(started.id, started);
    // One bounded readiness attempt. Its observer owns binding and verified
    // cleanup; any refusal is terminal rather than retried as startup noise.
    const readiness = await observeProductParticipantReadiness(context, 'backend');
    running.set(
      started.id,
      assertParticipantTransition(started, readiness.observation.runtime.native, 'stable'),
    );
    await inspectRetained();
    await inspectAuthorities(readiness.observation.process);
    // Proof: omitting this observation/compare let late-before-ready publish one
    // ready record when its owning test required zero; exact restoration passed.
    assertSame(
      readiness.observation,
      await observeSelectedProductRole(context, 'backend'),
      'backend ready publication inner process binding',
    );
    const ready = await retainActivationRecord(
      context.owner,
      context.layouts,
      'participant-ready',
      {
        format: 'dependency-participant-ready',
        version: 1,
        restoration: createReference(restoration),
        role: 'backend',
        id: started.id,
        readinessSha256: readiness.sha256,
      },
    );
    retained.push(ready);
    await inspectRetained();
    await inspectAuthorities(readiness.observation.process);
    // Proof: omitting this observation/compare let late-final-return return
    // readiness; its refusal assertion failed and passed after restoration.
    assertSame(
      readiness.observation,
      await observeSelectedProductRole(context, 'backend'),
      'backend returned readiness inner process binding',
    );
    return {
      state: 'backend-ready-participants-fenced',
      exposure: 'closed',
      controllers: 'fenced',
      readiness,
      ready,
    };
  } catch {
    throw new Error('backend participant restoration refused');
  }
}
