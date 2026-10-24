import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { afterEach, expect, spyOn, test } from 'bun:test';

import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { sourceRestorationConfiguration } from '../fixtures/source-restoration';
import { roots } from '../fixtures/source-startup';
import { prepareActivatedParticipantsUnderOwner } from './complete-dependency-exclusion';
import * as activationStorage from './dependency-activation-storage';
import { withDependencyOwner } from './edge-ownership';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});
test('actual source role preflight rejects an independently pinned foreign backend before irreversible SQLite activation', async () => {
  const fixture = await participantActivationFixture(['prod'], {
    ...sourceRestorationConfiguration,
    gateway: 'PORT=3200\nBE_URL=http://be-01-blue:3100\n',
  });
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const storage = spyOn(activationStorage, 'activateDependencyStores').mockImplementation(() => {
    throw new Error('irreversible activation must not be reached');
  });
  try {
    await rejects(
      withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          prepareActivatedParticipantsUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 300000,
            fixture.root,
            fixture.ports,
          ),
        fixture.root,
      ),
    );
    expect(storage).not.toHaveBeenCalled();
    expect(fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0]))).toBe(
      false,
    );
  } finally {
    storage.mockRestore();
  }
}, 300000);
