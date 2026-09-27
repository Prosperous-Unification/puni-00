import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { WebsiteStore } from './store';

test('applies all migrations and preserves a draft across reopen until expiry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-store-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'Build a booking app', 'claim-1', 100, 200);
    store.close();

    const reopened = new WebsiteStore(databasePath);
    expect(reopened.findDraft('claim-1', 150)).toMatchObject({
      description: 'Build a booking app',
      expiresAt: 200,
    });
    expect(reopened.findDraft('claim-1', 200)).toBeNull();
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
