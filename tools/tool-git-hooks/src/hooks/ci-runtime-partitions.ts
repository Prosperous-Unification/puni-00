/** Whole Nx project owners. Every other non-Twilight project belongs to workspace. */
export const DEDICATED_RUNTIME_PROJECTS = {
  backend: 'wbs-be-01',
  remote: 'tool-remote-scripts',
  frontend: 'wbs-fe-01',
} as const;

/**
 * The `bun test` suites the 16 GB workspace runner cannot carry, owned whole by the heavy shard
 * (A-CI-WORKSPACE-MEMORY-2). The three longest (`tool-fleet:test` 41 min, `tool-devsync:test`
 * 22 min, `wbs-store-sqlite:test` 18 min) were running when full-mode runners on main 1730d911f
 * were lost. `wbs-core:test` runs only about 2 minutes but one Bun process peaks at 5.7–7.3 GiB RSS
 * (#959 tracks fixing that at the source). See R5-32 in docs/findings/checks-that-cannot-fail.md.
 */
export const HEAVY_TEST_PROJECTS = [
  'tool-fleet',
  'tool-devsync',
  'wbs-store-sqlite',
  'wbs-core',
] as const;

export type RuntimePartition = keyof typeof DEDICATED_RUNTIME_PROJECTS | 'heavy' | 'workspace';

export type RuntimePartitions = Record<RuntimePartition, string[]>;

function isHeavyTestProject(project: string): boolean {
  return HEAVY_TEST_PROJECTS.some((heavy) => heavy === project);
}

/** Assigns every selected non-Twilight project exactly once, including newly discovered projects. */
export function partitionRuntimeProjects(projects: string[]): RuntimePartitions {
  // Proof: duplicating wbs-be-01 made `duplicate direct ownership refuses` fail.
  if (new Set(projects).size !== projects.length)
    throw new Error('Runtime partitions require distinct project names');
  const partitions: RuntimePartitions = {
    backend: [],
    remote: [],
    frontend: [],
    heavy: [],
    workspace: [],
  };
  for (const project of projects) {
    // Proof: assigning wbs-fe-01 to backend made `partitions all three heavy projects` fail
    // (since renamed `partitions every dedicated project…`).
    // Proof: sending the heavy projects to workspace failed `partitions every dedicated project…`
    // and the heavy ci-plan.test.ts ledgers (2026-11-20).
    const owner =
      project === DEDICATED_RUNTIME_PROJECTS.backend
        ? 'backend'
        : project === DEDICATED_RUNTIME_PROJECTS.remote
          ? 'remote'
          : project === DEDICATED_RUNTIME_PROJECTS.frontend
            ? 'frontend'
            : isHeavyTestProject(project)
              ? 'heavy'
              : 'workspace';
    partitions[owner].push(project);
  }
  return partitions;
}
