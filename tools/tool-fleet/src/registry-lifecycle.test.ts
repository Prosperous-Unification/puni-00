import { expect, it } from 'bun:test';

import { executeRegistryLifecycle } from './registry-lifecycle-cli';

it('the versioned lifecycle contract preserves explicit unmanaged selection and refuses unknown protocols without invoking publication', async () => {
  const calls: string[] = [];
  const ports = {
    publication: () => {
      calls.push('selection');
      return Promise.resolve(undefined);
    },
    deployment: () => Promise.resolve(undefined),
    environment: () => Promise.reject(new Error('missing')),
    publish: () => {
      calls.push('publish');
      return Promise.reject(new Error('must not publish'));
    },
    authority: () => {
      throw new Error('must not invoke');
    },
  };
  expect(
    await executeRegistryLifecycle(
      {
        protocol: 'registry-lifecycle/1',
        command: 'select-publication',
        registryUrl: 'https://ghcr.io',
        target: 'flux:website-dev',
      },
      ports,
    ),
  ).toEqual({ protocol: 'registry-lifecycle/1', command: 'select-publication', managed: false });
  expect(calls).toEqual(['selection']);
  await expectRejection(
    executeRegistryLifecycle(
      {
        protocol: 'registry-lifecycle/0',
        command: 'select-publication',
        registryUrl: 'https://ghcr.io',
        target: 'flux:website-dev',
      },
      ports,
    ),
    'protocol',
  );
  await expectRejection(
    executeRegistryLifecycle(
      {
        protocol: 'registry-lifecycle/1',
        command: 'publish-docker',
        registryUrl: 'https://ghcr.io',
        target: 'flux:website-dev',
        images: [],
      },
      ports,
    ),
  );
  expect(calls).not.toContain('publish');
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
