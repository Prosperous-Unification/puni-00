import type { MemorySourceFixture } from '@wbs/store-memory/source';

/**
 * Seeds the explicitly named legacy organization and parent for a current memory
 * package fixture. The caller creates the real account; this supplies metadata,
 * not membership or a permission decision.
 */
export function seedLegacyPackageParent(
  fixture: MemorySourceFixture,
  parent: { readonly organizationId: string; readonly projectId: string; readonly creator: string },
): void {
  fixture.addOrganization(parent.organizationId, { legacy: true });
  fixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: parent.projectId,
    organizationId: parent.organizationId,
    name: parent.projectId,
    createdBy: parent.creator,
    revision: 0,
    createdAt: 1,
    updatedAt: null,
  });
}
