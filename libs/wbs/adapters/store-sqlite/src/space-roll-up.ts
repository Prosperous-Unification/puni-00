import { serialize } from 'node:v8';

import {
  presentConnectedTree,
  workPackageCapturedTree,
} from '@wbs/core/module/work-item/work-item.resource';
import type { ResourceAccess } from '@wbs/core/ports/organization-access';
import type { SpaceProjectRollUp, SpaceView } from '@wbs/core/ports/space-read';
import type { SavedCurrentCapture } from '@wbs/core/ports/work-package-observation';
import type { WorkPackageWithAccess } from '@wbs/core/ports/work-package-store';
import { workPackageConnectedTree } from '@wbs/core/service/connected-tree';
import type { RollUpCache } from '@wbs/core/service/space.resource';
import { rollUpProject, rollUpWorkPackage, type WorkPackageRollUp } from '@wbs/domain';

import { readLiveMetadataIn } from './chain-snapshot';
import type { Drizzle } from './db';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import type { SavedCurrentReader } from './saved-current-capture';

interface PreparedChild {
  readonly workPackage: WorkPackageWithAccess;
  readonly metadata: Awaited<ReturnType<typeof readLiveMetadataIn>>;
  readonly captured: NonNullable<Awaited<ReturnType<SavedCurrentReader['captureIn']>>>;
}

interface PreparedProject {
  readonly project: SpaceProjectRollUp['project'];
  readonly position: number;
  readonly workPackages: readonly PreparedChild[];
}

/**
 * Borrows the authority/membership observation already owning the space view. Every selected
 * readable child captures scheduling input, installed cache and live row facts on that same loan.
 * Null conceals any unadmitted project or required unreadable connected endpoint for the whole query.
 */
export async function captureSpaceRollUpsIn(
  snapshot: Drizzle,
  access: ResourceAccess,
  actorId: string,
  view: SpaceView,
  projectIds: readonly string[],
  current: SavedCurrentReader,
): Promise<readonly PreparedProject[] | null> {
  const admitted = new Set(view.projects.map((group) => group.project.id));
  // Proof: omitting whole-query project admission returned a partial projection for an out-of-space project (space-project-rollup-fault-admission-v1).
  if (projectIds.some((id) => !admitted.has(id))) return null;
  const requested = new Set(projectIds);
  const connected = new Map<
    string,
    Extract<PreparedChild['captured'], { readonly kind: 'connected' }>
  >();
  const lifetime = createReadSnapshotLifetime();
  try {
    const projects: PreparedProject[] = [];
    for (const group of view.projects) {
      // Proof: omitting requested-group selection returned an extra empty project (space-project-rollup-fault-selection-v1).
      if (!requested.has(group.project.id)) continue;
      const workPackages: PreparedChild[] = [];
      for (const workPackage of group.workPackages) {
        // Proof: deleting component memo entries captured both connected members twice (project-rollup-fault-component-recapture-v1; isolated connected aggregate test).
        const captured =
          connected.get(workPackage.id) ??
          (await current.captureIn(snapshot, access, actorId, workPackage.id, lifetime));
        // Proof: omitting required-hidden-endpoint capture refusal lost typed not_found (space-project-rollup-fault-dependency-v1; availability only).
        if (captured === null) return null;
        if (captured.kind === 'connected')
          for (const member of captured.projection.capture.workPackages)
            connected.set(member.workPackageId, captured);
        workPackages.push({
          workPackage,
          captured,
          metadata: await readLiveMetadataIn(snapshot, workPackage.id, lifetime),
        });
      }
      projects.push({ project: group.project, position: group.position, workPackages });
    }
    return projects;
  } finally {
    // Proof: omitting expiry let the actual capture lifetime remain open at detached local finishing (space-project-rollup-fault-expiry-v1; success path).
    lifetime.expire();
  }
}

/**
 * Detached local placement, canonical row presentation and project folding perform no database IO.
 * Memoization follows admitted current capture, never authority or membership admission. Row
 * reuse requires matching native snapshot evidence. The key includes every independent input,
 * fresh settings, selected optimization, metadata and child DTO; derived scheduling inputs may
 * share their factory fingerprint. Native serialization preserves Maps/Sets. Entries hold figures only.
 */
export function finishSpaceRollUps(
  prepared: readonly PreparedProject[],
  current: SavedCurrentReader,
  cache: RollUpCache,
): readonly SpaceProjectRollUp[] {
  return prepared.map((group) => {
    const workPackages = group.workPackages.map((child) => ({
      workPackage: child.workPackage,
      rollUp: finishChild(child, current, cache),
    }));
    return {
      project: group.project,
      position: group.position,
      workPackages,
      rollUp: rollUpProject(workPackages.map((child) => child.rollUp)),
    };
  });
}

function finishChild(
  child: PreparedChild,
  current: SavedCurrentReader,
  cache: RollUpCache,
): WorkPackageRollUp | { readonly kind: 'unavailable' } {
  // Proof: hashing only the child DTO kept the old 20-day total after an estimate changed without a revision (project-rollup-fault-cache-evidence-v1; memoizes canonical child test).
  const captured = child.captured;
  const evidence =
    captured.kind === 'local' && captured.inputEvidence !== undefined
      ? {
          ...child,
          captured: {
            ...captured,
            reads: captured.inputEvidence,
            ask: { ...captured.ask, input: captured.inputEvidence },
          },
        }
      : child;
  const key = new Bun.CryptoHasher('sha256').update(serialize(evidence)).digest('hex');
  // Proof: bypassing lookup recomputed four canonical presentations instead of two (project-rollup-fault-cache-bypass-v1).
  const held = cache.get(key);
  // Proof: returning the held reference let a mutated warm reply change the next leaf count to 999 (project-rollup-fault-cache-read-alias-v1).
  if (held !== undefined) return structuredClone(held.rollUp);
  const chain = finishCapture(child, current);
  const tree =
    chain.kind === 'connected'
      ? presentConnectedTree(workPackageConnectedTree(chain, child.workPackage.id))
      : workPackageCapturedTree({
          kind: 'local',
          chain,
          workPackage: child.workPackage,
          ...child.metadata,
        });
  // Proof: omitting unavailable-engine forwarding lost modeled child/project unavailable output (space-project-rollup-fault-engine-refusal-v1; availability only).
  if ('kind' in tree) return { kind: 'unavailable' };
  const rolled = rollUpWorkPackage({
    workItems: tree.workItems.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      status: row.status,
      finalTotal: row.finalTotal,
      dates: row.dates,
      estimated: Object.keys(row.estimates).length > 0,
    })),
    scheduleError: tree.scheduleError,
    waitingForPerson: tree.waitingForPerson,
    waitingForCapacity: tree.waitingForCapacity,
    displayed:
      tree.connectedDependencies !== undefined && tree.scheduleError !== null
        ? null
        : (tree.optimization?.displayed ?? 'fast'),
    workPackageRevision: tree.workPackageRevision,
    seq: tree.seq,
  });
  // Proof: retaining the miss reply's reference let caller mutation change later totals/counts to 999 (project-rollup-fault-cache-write-alias-v1).
  cache.set(key, { rollUp: structuredClone(rolled), inProgress: [] });
  return rolled;
}

function finishCapture(
  child: PreparedChild,
  current: SavedCurrentReader,
): Exclude<SavedCurrentCapture, { readonly kind: 'local' }> {
  const prepared = child.captured;
  if (prepared.kind !== 'local') return prepared;
  const captured = current.finishLocal(prepared);
  switch (captured.scheduled.kind) {
    case 'cycle':
      return { kind: 'unavailable', reason: 'cycle', reads: captured.reads, influencers: [] };
    case 'engine_unavailable':
      return {
        ...captured.scheduled,
        workPackageId: child.workPackage.id,
        name: child.workPackage.name,
        reads: captured.reads,
      };
    case 'scheduled':
      return {
        kind: 'scheduled',
        reads: captured.reads,
        input: prepared.ask.input,
        scheduled: captured.scheduled,
        influencers: [],
        holders: [],
      };
  }
}
