import type { SavedDependencyRelationship, SavedDependencyHistory } from './dependency-history';
import { readSavedDependencyHistory } from './dependency-history';
import type {
  SavedDependencyHistory as LegacyDependencyHistory10,
  SavedDependencyRelationship as LegacyRelationship10,
} from './legacy-dependency-history10';
import type { LegacyPlanInputV10 } from './legacy-input10';

/** Maps only the endpoint-owned names of the already validated published input10 format. */
function upgradeEndpoint10(endpoint: LegacyRelationship10['predecessor']): SavedDependencyRelationship['predecessor'] {
  const { projectId, projectAbbreviation, ...facts } = endpoint;
  return { ...facts, workPackageId: projectId, workPackageAbbreviation: projectAbbreviation };
}

/** Project input10's closed captured context; graph identities and tuple ownership remain exact. */
export function upgradeDependencyHistory10(history: LegacyDependencyHistory10): SavedDependencyHistory {
  if (history.kind === 'local') return { kind: 'local' };
  const { targetProjectId, projects, relationships, readiness, placementState, ...facts } = history;
  const placement = placementState.kind === 'dependency_calendar_missing'
    ? {
        kind: placementState.kind,
        workPackages: placementState.projects.map(({ projectId, ...metadata }) => ({ ...metadata, workPackageId: projectId })),
      }
    : placementState.kind === 'engine_unavailable'
      ? { kind: placementState.kind, engine: placementState.engine, workPackages: placementState.projects, reason: placementState.reason }
      : placementState;
  return readSavedDependencyHistory({
    ...facts,
    targetWorkPackageId: targetProjectId,
    workPackages: projects.map(({ projectId, ...metadata }) => ({ ...metadata, workPackageId: projectId })),
    relationships: relationships.map(({ projectId, predecessor, successor, ...relationship }) => ({
      ...relationship,
      workPackageId: projectId,
      predecessor: upgradeEndpoint10(predecessor),
      successor: upgradeEndpoint10(successor),
    })),
    readiness: readiness.map(({ projectId, ...reading }) => ({ ...reading, workPackageId: projectId })),
    placementState: placement,
  });
}

/**
 * In-memory input10→11 projection after the frozen reader validated every old field.
 * The stored body, original digest, identifiers, text and numeric facts are never rewritten.
 */
export function upgradeLegacyPlanInput10(legacy: LegacyPlanInputV10) {
  const { schemaVersion: ignoredVersion, project: workPackage, dependencyHistory, ...facts } = legacy;
  return { schemaVersion: 11 as const, workPackage, ...facts, dependencyHistory: upgradeDependencyHistory10(dependencyHistory) };
}
