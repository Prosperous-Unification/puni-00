/** Whole Nx project owners. Every other non-Twilight project belongs to workspace. */
export const DEDICATED_RUNTIME_PROJECTS = {
  backend: 'wbs-be-01',
  remote: 'tool-remote-scripts',
  frontend: 'wbs-fe-01',
} as const;

export type RuntimePartition = keyof typeof DEDICATED_RUNTIME_PROJECTS | 'workspace';

export type RuntimePartitions = Record<RuntimePartition, string[]>;

/** Assigns every selected non-Twilight project exactly once, including newly discovered projects. */
export function partitionRuntimeProjects(projects: string[]): RuntimePartitions {
  // Proof: duplicating wbs-be-01 made `duplicate direct ownership refuses` fail.
  if (new Set(projects).size !== projects.length)
    throw new Error('Runtime partitions require distinct project names');
  const partitions: RuntimePartitions = { backend: [], remote: [], frontend: [], workspace: [] };
  for (const project of projects) {
    // Proof: assigning wbs-fe-01 to backend made `partitions all three heavy projects` fail.
    const owner =
      project === DEDICATED_RUNTIME_PROJECTS.backend
        ? 'backend'
        : project === DEDICATED_RUNTIME_PROJECTS.remote
          ? 'remote'
          : project === DEDICATED_RUNTIME_PROJECTS.frontend
            ? 'frontend'
            : 'workspace';
    partitions[owner].push(project);
  }
  return partitions;
}
