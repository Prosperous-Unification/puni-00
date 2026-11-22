import { join } from 'node:path';

import { readInstalledPuniToolkit } from './installed';
import { readRequiredTestLevelAssets } from './test-level-asset-files';

/** Require the complete new profile; the independently admitted installation supplies every asset and judge byte. */
export function readInstalledTestLevelAssets(distDirectory: string) {
  const toolkit = readInstalledPuniToolkit(distDirectory, join(distDirectory, 'toolkit'));
  if (toolkit.schemaVersion !== 3) throw new Error('test levels require selected toolkit schema 3');
  return readRequiredTestLevelAssets(distDirectory, toolkit);
}
