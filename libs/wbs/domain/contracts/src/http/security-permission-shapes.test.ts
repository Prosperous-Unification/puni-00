import { expect, it } from 'bun:test';

import {
  createDomainChallenge,
  listOrganizationDomains,
  releaseDomainClaim,
  rotateDomainProof,
  verifyDomainClaim,
} from './domain-shapes';
import {
  listTrustedIssuers,
  registerTrustedIssuer,
  removeTrustedIssuer,
} from './machine-credential-shapes';
import {
  issueProvisioningToken,
  listProvisioningTokens,
  revokeProvisioningToken,
  rotateProvisioningToken,
} from './provisioning-token-shapes';
import { readSessionPolicy, setSessionPolicy } from './session-policy-shapes';
import { approveSharedPeopleRestore } from './shared-people-restore-shapes';
import {
  createSsoConnection,
  listSsoConnections,
  removeSsoConnection,
  updateSsoConnection,
} from './sso-connection-shapes';

const endpoints = [
  listOrganizationDomains,
  createDomainChallenge,
  releaseDomainClaim,
  rotateDomainProof,
  verifyDomainClaim,
  listSsoConnections,
  createSsoConnection,
  updateSsoConnection,
  removeSsoConnection,
  readSessionPolicy,
  setSessionPolicy,
  listProvisioningTokens,
  issueProvisioningToken,
  rotateProvisioningToken,
  revokeProvisioningToken,
  listTrustedIssuers,
  registerTrustedIssuer,
  removeTrustedIssuer,
  approveSharedPeopleRestore,
] as const;

async function acceptsRefusal(
  endpoint: (typeof endpoints)[number],
  body: unknown,
): Promise<boolean> {
  for (const refusal of endpoint.refusals) {
    if (refusal.status !== 403) continue;
    const checked = await refusal.schema.validator['~standard'].validate(body);
    if (checked.issues === undefined) return true;
  }
  return false;
}

for (const endpoint of endpoints) {
  it('keeps the catalog permission vocabulary at ' + endpoint.operationId, async () => {
    expect(
      await acceptsRefusal(endpoint, {
        error: 'forbidden',
        permission: 'organization.manage_security',
      }),
    ).toBe(true);
    expect(
      await acceptsRefusal(endpoint, { error: 'forbidden', permission: 'package.write' }),
    ).toBe(true);
    expect(await acceptsRefusal(endpoint, { error: 'forbidden' })).toBe(true);
    expect(
      await acceptsRefusal(endpoint, { error: 'forbidden', permission: 'organization.unknown' }),
    ).toBe(false);
    expect(await acceptsRefusal(endpoint, { error: 'forbidden', permission: 0 })).toBe(false);
  });
}
