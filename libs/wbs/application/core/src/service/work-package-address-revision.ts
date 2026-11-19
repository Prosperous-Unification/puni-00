import { type AddressSpace, describeAddressSpace } from '@wbs/domain';

import type { Digest } from '../ports/runtime';
/** Includes the selected stable work package and current abbreviation without changing local ar1. */
export async function digestQualifiedAddressSpace(
  workPackageId: string,
  abbreviation: string,
  space: AddressSpace,
  digest: Digest,
): Promise<string> {
  return `qar1:${await digest.sha256(JSON.stringify(['qar1', workPackageId, abbreviation, describeAddressSpace(workPackageId, space)]))}`;
}
