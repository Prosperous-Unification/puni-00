import { createHash } from 'node:crypto';

import { expect, it } from 'bun:test';

import { selectDeploymentEnrollment } from './registry-selection';

const enrollment = {
  registryId: 'proof',
  registryUrl: 'https://registry.test',
  product: 'wbs',
  environment: 'prod',
  target: 'k8s:cluster/wbs/wbs-solver',
};
const entry = {
  authority: 'registry.test',
  registryId: 'proof',
  product: 'wbs',
  environment: 'prod',
  target: enrollment.target,
  enrollment: {
    path: '/trusted/prod.json',
    sha256: createHash('sha256').update(JSON.stringify(enrollment)).digest('hex'),
  },
};
const image = `registry.test/wbs/backend@sha256:${'a'.repeat(64)}`;
async function refuses(promise: Promise<unknown>, message: string) {
  const failure = await promise.then(
    () => 'ACCEPTED',
    (cause: unknown) => String(cause),
  );
  expect(failure).toContain(message);
}
it('requires the fixed catalog and distinguishes missing installation from explicit unmanaged state', async () => {
  await refuses(
    selectDeploymentEnrollment([], null, {}, () =>
      Promise.resolve().then(() => {
        throw new Error('missing catalog');
      }),
    ),
    'missing catalog',
  );
  const requested: string[] = [];
  expect(
    await selectDeploymentEnrollment(['ghcr.io/example/backend:1'], null, {}, (path) =>
      Promise.resolve().then(() => {
        requested.push(path);
        return { schemaVersion: 1, managed: [] };
      }),
    ),
  ).toBeUndefined();
  expect(requested).toEqual(['/etc/puni/registry-deployments.json']);
});
it('selects matching managed refs with env unset and refuses substitutions or catalog drift', async () => {
  const catalog = { schemaVersion: 1, managed: [entry] };
  const read = (path: string) =>
    Promise.resolve().then(() =>
      path === '/etc/puni/registry-deployments.json' ? catalog : enrollment,
    );
  expect(await selectDeploymentEnrollment([image], enrollment.target, {}, read)).toEqual(
    enrollment,
  );
  await refuses(
    selectDeploymentEnrollment(
      [image],
      enrollment.target,
      { REGISTRY_DEPLOYMENT_ENROLLMENT: '/untrusted.json' },
      read,
    ),
    'selection',
  );
  await refuses(
    selectDeploymentEnrollment(['ghcr.io/foreign/backend:1'], enrollment.target, {}, read),
    'managed',
  );
  await refuses(selectDeploymentEnrollment([image], 'foreign', {}, read), 'target');
  await refuses(selectDeploymentEnrollment([image], null, {}, read), 'target');
  await refuses(
    selectDeploymentEnrollment([image], enrollment.target, {}, (path) =>
      Promise.resolve().then(() =>
        path === '/etc/puni/registry-deployments.json'
          ? catalog
          : { ...enrollment, product: 'foreign' },
      ),
    ),
    'digest',
  );
  await refuses(
    selectDeploymentEnrollment([image], enrollment.target, {}, () =>
      Promise.resolve().then(() => null),
    ),
    'catalog',
  );
});

it('requires catalog-selected publication even when its optional environment selector is unset', async () => {
  const { selectPublicationEnrollment } = await import('./registry-selection');
  const catalog = { schemaVersion: 1, managed: [{ ...entry, publication: entry.enrollment }] };
  const read = (path: string) =>
    Promise.resolve().then(() =>
      path === '/etc/puni/registry-deployments.json' ? catalog : enrollment,
    );
  expect(await selectPublicationEnrollment('https://registry.test', {}, read)).toEqual(enrollment);
  await refuses(
    selectPublicationEnrollment(
      'https://registry.test',
      { REGISTRY_PUBLICATION_ENROLLMENT: '/foreign' },
      read,
    ),
    'selection',
  );
  await refuses(
    selectPublicationEnrollment('https://registry.test', {}, () =>
      Promise.resolve().then(() => ({
        schemaVersion: 1,
        managed: [entry],
      })),
    ),
    'selection',
  );
  await refuses(
    selectPublicationEnrollment('https://registry.test', {}, () =>
      Promise.resolve().then(() => {
        throw new Error('unreadable catalog');
      }),
    ),
    'unreadable',
  );
});

it('selects explicit initialization only from an existing exact installed environment mapping', async () => {
  const { selectEnvironmentEnrollment } = await import('./registry-selection');
  const catalog = { schemaVersion: 1, managed: [entry] };
  const read = (path: string) =>
    Promise.resolve(path === '/etc/puni/registry-deployments.json' ? catalog : enrollment);
  expect(await selectEnvironmentEnrollment(enrollment.target, {}, read)).toEqual(enrollment);
  await refuses(selectEnvironmentEnrollment('foreign', {}, read), 'environment');
  await refuses(
    selectEnvironmentEnrollment(
      enrollment.target,
      { REGISTRY_DEPLOYMENT_ENROLLMENT: '/foreign' },
      read,
    ),
    'environment',
  );
});
