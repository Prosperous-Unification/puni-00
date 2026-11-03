import { sql } from 'drizzle-orm';

import { inspectDependencyActivation } from '../cross-project-dependency-activation';
import { openConnection } from '../db';

/**
 * Synthetic trusted persistence for storage/reader fixtures only. This is not an
 * activation API and provides no evidence of compatible runtimes or participant drainage.
 */
export function seedDependencyAuthority(dbPath: string): void {
  const connection = openConnection(dbPath);
  try {
    const receipt = JSON.stringify({
      protocol: 'wbs-dependency-activation',
      version: 1,
      activationId: 'synthetic-storage-fixture',
      databaseIdentity: 'isolated-test-database',
      candidateImage: `fixture@sha256:${'a'.repeat(64)}`,
      rollbackImage: `fixture@sha256:${'b'.repeat(64)}`,
      participantProofSha256: 'c'.repeat(64),
      migrationCaptureSha256: 'd'.repeat(64),
      activatedAt: 1,
    });
    connection.db.run(
      sql`INSERT INTO cross_project_dependency_activation_receipt (id,receipt) VALUES (1,${receipt})`,
    );
    connection.db.run("UPDATE cross_project_dependency_activation SET state='ENABLED' WHERE id=1");
    if (inspectDependencyActivation(connection.db).state !== 'ENABLED')
      throw new Error('synthetic dependency authority not persisted');
  } finally {
    connection.close();
  }
}
