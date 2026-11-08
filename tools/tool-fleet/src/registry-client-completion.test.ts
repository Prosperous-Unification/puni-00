import { expect, test } from 'bun:test';

import {
  createRegistryClientCompletion,
  requireRegistryClientCompletion,
} from './registry-client-completion';
import { planRegistryClientPulls } from './registry-client-plan';
import { createRegistryClientPlanFixture } from './registry-client-plan.fixture';

async function fixture() {
  const physical = await createRegistryClientPlanFixture();
  await physical.image('kept');
  const plan = await planRegistryClientPulls(physical.journal, 4096, new AbortController().signal);
  const owner = {
    operationId: 'maintain',
    registryId: 'proof',
    snapshotId: 'a'.repeat(64),
    scope: 'current' as const,
  };
  const at = '2026-10-31T12:00:00.000Z';
  return { plan, owner, at };
}
test('client completion binds exact verified plan and coverage to its nonsecret owner', async () => {
  const proof = await fixture();
  const receipt = createRegistryClientCompletion(proof.plan, proof.owner, proof.at);
  expect(
    requireRegistryClientCompletion(receipt, { ...proof, now: '2026-10-31T12:04:59.999Z' }),
  ).toEqual(receipt);
  expect(receipt.pullCount).toBe(1);
  expect(receipt.registryPath).toBe(proof.plan.binding.registryPath);
  expect(JSON.stringify(receipt)).not.toContain('token');
  expect(JSON.stringify(receipt)).not.toContain('password');
});
for (const field of [
  'operationId',
  'registryId',
  'snapshotId',
  'scope',
  'storageId',
  'registryPath',
  'journalRevision',
  'censusSha256',
  'filesystem',
  'planSha256',
  'coverageSha256',
  'revisionsSha256',
  'pullCount',
  'clientSha256',
  'completedAt',
] as const)
  test('client completion refuses changed ' + field, async () => {
    const proof = await fixture();
    const original = createRegistryClientCompletion(proof.plan, proof.owner, proof.at);
    const receipt = { ...original };
    if (field === 'scope') receipt.scope = 'recovery';
    else if (field === 'registryPath') receipt.registryPath = '/foreign-registry';
    else if (field === 'pullCount' || field === 'journalRevision') receipt[field]++;
    else if (field === 'completedAt') receipt.completedAt = '2026-10-31T12:00:01.000Z';
    else receipt[field] = 'b'.repeat(64);
    expect(() => requireRegistryClientCompletion(receipt, { ...proof, now: proof.at })).toThrow();
  });
for (const now of ['2026-10-31T12:05:00.001Z', '2026-10-31T11:59:59.999Z', 'invalid'])
  test('client completion refuses stale/future/unknown clock ' + now, async () => {
    const proof = await fixture();
    expect(() =>
      requireRegistryClientCompletion(
        createRegistryClientCompletion(proof.plan, proof.owner, proof.at),
        { ...proof, now },
      ),
    ).toThrow();
  });
test('client completion rejects a changed physical plan with unchanged references', async () => {
  const proof = await fixture();
  const receipt = createRegistryClientCompletion(proof.plan, proof.owner, proof.at);
  proof.plan.pulls[0].envelope.bytes++;
  expect(() => requireRegistryClientCompletion(receipt, { ...proof, now: proof.at })).toThrow();
});
test('client completion represents exact empty coverage only for an empty verified plan', async () => {
  const proof = await fixture();
  const empty = await createRegistryClientPlanFixture();
  proof.plan = await planRegistryClientPulls(empty.journal, 4096, new AbortController().signal);
  const receipt = createRegistryClientCompletion(proof.plan, proof.owner, proof.at);
  expect(receipt.pullCount).toBe(0);
  expect(requireRegistryClientCompletion(receipt, { ...proof, now: proof.at })).toEqual(receipt);
});

test('client completion validation accepts reordered JSON fields', async () => {
  const proof = await fixture();
  const receipt = createRegistryClientCompletion(proof.plan, proof.owner, proof.at);
  const reordered: unknown = JSON.parse(JSON.stringify(receipt, Object.keys(receipt).reverse()));
  expect(requireRegistryClientCompletion(reordered, { ...proof, now: proof.at })).toEqual(receipt);
});
