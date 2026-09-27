import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WebsiteStore as SourceWebsiteStore } from './src/store';

const source = join(import.meta.dir, '../../../../dist/libs/website/adapters/store-sqlite');
const directory = mkdtempSync(join(tmpdir(), 'puni-website-store-build-'));
try {
  const bundle = join(directory, 'bundle');
  cpSync(source, bundle, { recursive: true });
  // The dynamic path crosses the package boundary; the build emits this module from src/store.ts.
  const { WebsiteStore } = (await import(join(bundle, 'store.js'))) as {
    WebsiteStore: typeof SourceWebsiteStore;
  };
  const databasePath = join(directory, 'website.sqlite');
  const store = new WebsiteStore(databasePath);
  store.createDraft('draft-1', 'Build a booking app', 'claim-1', 100, 200);
  store.close();
  const reopened = new WebsiteStore(databasePath);
  const draft = reopened.findDraft('claim-1', 150);
  if (draft?.description !== 'Build a booking app') throw new Error('Bundled store lost its draft');
  if (reopened.findDraft('claim-1', 200) !== null) throw new Error('Bundled store ignored expiry');
  reopened.close();
} finally {
  rmSync(directory, { recursive: true, force: true });
}
