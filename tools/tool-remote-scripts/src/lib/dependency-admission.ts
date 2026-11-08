import {
  buildDependencyInventoryCommand,
  decodeDormantDependencies,
  type DormantDependencyStore,
} from './dependency-inventory';
import { assertDigestPinnedRef, ROOT } from './docker';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import { storedSnapshotCommand } from './sqlite-probe';

/**
 * Fresh preservation observation after the caller proves exact stopped writers and SQLite family.
 * The source mount stays recursively readonly/private; SQLite opens a scratch main/WAL/journal copy.
 * This observes dormant authority only, with no activation, participant or restart permission.
 * See docs/runbook-prod-deploy.md#backend-writer-barrier-recovery.
 */
export async function admitDormantDependencies(
  image: string,
  databasePath: string,
  runDocker: RunDocker,
  deadline = performance.now() + 15000,
): Promise<DormantDependencyStore> {
  // Proof: removing pin validation invoked Docker for the mutable-image boundary negative.
  assertDigestPinnedRef(image, 'be');
  // Proof: removing path validation admitted both outside-data and parent-traversal boundary negatives.
  if (!/^\/data\/[A-Za-z0-9_./-]+$/.test(databasePath) || databasePath.includes('..'))
    throw new Error('dependency admission DB_PATH is outside the mounted data directory');
  // Proof: substituting the image activation CLI lost enabled/historical coordinator-authority refusals.
  // Omitting WAL copying lost the real migrated WAL-only dormant transition; writable mount lost the clean command assertion.
  const command = storedSnapshotCommand(buildDependencyInventoryCommand());
  return decodeDormantDependencies(
    await runDockerBefore(
      [
        'run',
        '--rm',
        '--pull',
        'never',
        '--network',
        'none',
        '--mount',
        `type=bind,source=${ROOT}/data,target=/data,readonly,bind-propagation=rprivate,bind-recursive=readonly`,
        '-e',
        `DB_PATH=${databasePath}`,
        '--entrypoint',
        'bun',
        image,
        ...command.slice(1),
      ],
      runDocker,
      // Proof: ignoring this deadline let the stalled probe resolve, failing its required refusal.
      deadline,
    ),
  );
}
