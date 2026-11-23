import { isAbsolute, resolve } from 'node:path';

/** Pure run identity: config discovery computes paths without reading or creating browser state. */
export function ordinaryContextPaths(databasePath: string | undefined) {
  if (
    databasePath === undefined ||
    databasePath === '' ||
    !isAbsolute(databasePath) ||
    resolve(databasePath) !== databasePath
  ) {
    throw new Error('E2E_TEST_DATABASE must be a canonical absolute path for this browser run');
  }
  const stateDirectory = databasePath + '.ordinary';
  return {
    databasePath,
    stateDirectory,
    readinessPath: stateDirectory + '/readiness.json',
    storageStatePath: stateDirectory + '/cookies.json',
    contextPath: stateDirectory + '/context.json',
  };
}
