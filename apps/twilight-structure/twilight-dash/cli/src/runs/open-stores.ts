import { parseOrThrow, type } from '@shared/validation';

import type { WallClock } from '../clock';
import type { ArtifactStore } from './artifact-store';
import type { OwnershipStatus } from './records';
import type { RunStore } from './run-store';
import { openSqliteStores, type SqliteOptions } from './sqlite/open-stores';

/** Explicit production selection; SQLite validates every setting before opening existing trusted state. */
export interface SqliteConfiguration extends Omit<SqliteOptions, 'clock'> {
  readonly provider: 'sqlite';
}

/** Opens the selected durable provider without acquiring ownership or bootstrapping absent state; operational failures throw. */
export async function openStores(
  configuration: SqliteConfiguration,
  clock: WallClock,
): Promise<{
  runs: RunStore;
  artifacts: ArtifactStore;
  ownership: OwnershipStatus;
  /** Immediately fences both ports, rejects queued work and awaits admitted work and disposal; repeated calls preserve the original disposal outcome. */
  close(): Promise<void>;
}> {
  // Proof: bypassing provider validation made all six unsupported-provider rejection tests fail against existing SQLite state.
  parseOrThrow(type({ provider: "'sqlite'" }), configuration);
  return await openSqliteStores({ ...configuration, clock });
}
