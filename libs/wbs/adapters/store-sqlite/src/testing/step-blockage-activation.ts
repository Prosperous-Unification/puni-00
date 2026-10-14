import { openConnection } from '../db';

/** Explicitly admits blockage writers in one isolated test database. */
export function activateTestStepBlockages(dbPath: string): void {
  const connection = openConnection(dbPath);
  try {
    connection.db.run("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1");
    const markers = connection.db.all<{ id: number; state: string }>(
      'SELECT id,state FROM step_blockage_activation',
    );
    if (markers.length !== 1 || markers.at(0)?.id !== 1 || markers.at(0)?.state !== 'ENABLED')
      throw new Error('test blockage activation failed');
  } finally {
    connection.close();
  }
}
