import { type AddressSpace, describeAddressSpace } from '@wbs/domain';

import type { Digest } from '../ports/runtime';
/** Includes the selected stable project and current abbreviation without changing local ar1. */
export async function digestQualifiedAddressSpace(
  projectId: string,
  abbreviation: string,
  space: AddressSpace,
  digest: Digest,
): Promise<string> {
  return `qar1:${await digest.sha256(JSON.stringify(['qar1', projectId, abbreviation, describeAddressSpace(projectId, space)]))}`;
}
