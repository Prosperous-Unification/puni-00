import { type AddressSpace, describeAddressSpace } from '@wbs/domain';

import type { Digest } from '../ports/runtime';
import type { AddressPlacement } from '../ports/work-package-address-search';
/** Pins qualified identity, leaf addresses and ancestry used by descendant selectors, including frozen moves. */
export async function digestQualifiedAddressSpace(
  workPackageId: string,
  abbreviation: string,
  space: AddressSpace,
  placements: readonly Pick<AddressPlacement, 'id' | 'parentId'>[],
  digest: Digest,
): Promise<string> {
  // Proof: ancestry-omission kept the qualified token after a frozen leaf changed its parent
  // selector; the actual mounted frozen-move test failed. The local address token stays valid.
  const ancestry = [...placements]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map(({ id, parentId }) => [id, parentId]);
  return `qar2:${await digest.sha256(JSON.stringify(['qar2', workPackageId, abbreviation, describeAddressSpace(workPackageId, space), ancestry]))}`;
}
