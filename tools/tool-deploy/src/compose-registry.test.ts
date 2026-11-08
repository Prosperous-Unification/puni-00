import { envLayout } from '@tools/env';
import { expect, it } from 'bun:test';

import type { ComposeRegistryPlan } from './compose-registry';
import { selectComposeDeployment, verifyComposeCompletion } from './compose-registry';
const image = `registry.test/wbs-be-01@sha256:${'a'.repeat(64)}`;
const enrollment = {
  registryId: 'proof',
  product: 'wbs',
  environment: 'prod',
  target: `compose:${envLayout('prod').root}`,
  owner: 'owner',
  registryUrl: 'https://registry.test',
  sshHost: 'registry',
  requiredRepositories: ['wbs-be-01'],
  publicationReceiptPath: '/receipt.json',
};
const receipt = {
  registryId: 'proof',
  product: 'wbs',
  environment: 'prod',
  target: enrollment.target,
  authorityRevision: 9,
  releases: [
    {
      operationId: 'candidate',
      references: [{ repository: 'wbs-be-01', digest: `sha256:${'a'.repeat(64)}` }],
      receipt: { state: 'promoted' as const, at: '2026-10-25T12:00:00.000Z' },
    },
  ],
  promotion: { operationId: 'swap', candidate: 'candidate', at: '2026-10-25T12:00:00.000Z' },
};
it('local managed Compose refuses subsets and consumes exactly one authority-verified remote completion', async () => {
  const plan: ComposeRegistryPlan = {
    tiers: ['be'],
    images: { be: image },
    layout: envLayout('prod'),
  };
  await expectRejection(
    selectComposeDeployment(plan, () => Promise.resolve(enrollment)),
    'all configured',
  );
  const calls: string[] = [];
  const verify = () => {
    calls.push('authority');
    return Promise.resolve(receipt);
  };
  await expectRejection(
    verifyComposeCompletion('remote exited zero\n', enrollment, [image], verify),
    'omitted',
  );
  expect(calls).toEqual([]);
  const output = `PUNI_REGISTRY_COMPOSE ${JSON.stringify(receipt)}\n`;
  expect(await verifyComposeCompletion(output, enrollment, [image], verify)).toEqual(receipt);
  await expectRejection(
    verifyComposeCompletion(output + output, enrollment, [image], verify),
    'repeated',
  );
  await expectRejection(
    verifyComposeCompletion(
      output,
      enrollment,
      [`registry.test/foreign@sha256:${'b'.repeat(64)}`],
      verify,
    ),
    'another candidate',
  );
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}
