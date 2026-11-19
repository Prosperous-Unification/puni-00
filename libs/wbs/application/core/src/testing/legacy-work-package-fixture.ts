import {ownTestSource} from '@wbs/store-memory/testing/owned-source-fixture';
import { openMemorySourceFixture } from '@wbs/store-memory/source';

import { seedLegacyPackageParent } from './legacy-package-source-fixture';

/**
 * Builds fresh actual account, preactivation organization and parent rows for a
 * declared legacy fixture. Callers choose every identity; no scoped permission
 * or admission verdict is invented. Returning companion source stores does not
 * make independently assembled test ports a coherent Source observation.
 * @throws for empty identities or an unexpected account creation refusal.
 */
export async function createLegacyWorkPackageFixture(
  actorId: string,
  organizationId: string,
  projectId: string,
) {
  if ([actorId, organizationId, projectId].some((id) => id.trim() === ''))
    throw new Error('legacy fixture requires explicit actor, organization and project identities');
  const fixture = openMemorySourceFixture();
  const source = ownTestSource(fixture.source);
  const account = await source.stores.users.create(
    { id: actorId, username: actorId, passwordHash: null, createdAt: 1 },
    { at: 1, by: actorId },
  );
  if (account === null) throw new Error('fresh legacy fixture account was refused');
  seedLegacyPackageParent(fixture, { organizationId, projectId, creator: actorId });
  return { source, workPackages: source.stores.workPackages };
}
