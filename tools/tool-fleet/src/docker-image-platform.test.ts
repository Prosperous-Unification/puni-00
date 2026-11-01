import { expect, it } from 'bun:test';

import { DockerDescriptor, retainDockerDescriptor } from './docker-image-platform';

const descriptor = {
  digest: 'sha256:' + 'a'.repeat(64),
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  size: 1052,
};
it('Task49 descriptor omission differs from own undefined and null', () => {
  expect(retainDockerDescriptor(descriptor).platform).toEqual({ state: 'absent' });
  expect(() => retainDockerDescriptor({ ...descriptor, platform: undefined })).toThrow();
  expect(() => retainDockerDescriptor({ ...descriptor, platform: null })).toThrow();
});
it('Task49 descriptor variant absence and present empty value stay distinct', () => {
  const absent = retainDockerDescriptor({
    ...descriptor,
    platform: { os: 'linux', architecture: 'amd64' },
  });
  const present = retainDockerDescriptor({
    ...descriptor,
    platform: { os: 'linux', architecture: 'amd64', variant: '' },
  });
  expect(absent.platform).toEqual({
    state: 'present',
    os: 'linux',
    architecture: 'amd64',
    variant: { state: 'absent' },
  });
  expect(present.platform).toEqual({
    state: 'present',
    os: 'linux',
    architecture: 'amd64',
    variant: { state: 'present', value: '' },
  });
  expect(() =>
    retainDockerDescriptor({
      ...descriptor,
      platform: { os: 'linux', architecture: 'amd64', variant: undefined },
    }),
  ).toThrow();
});
it('Task49 retained descriptor presence records are closed', () => {
  expect(() =>
    DockerDescriptor.assert({ ...descriptor, platform: { state: 'absent', os: 'linux' } }),
  ).toThrow();
});

it('Task49 retained variant presence refuses an unknown state', () => {
  expect(() =>
    DockerDescriptor.assert({
      ...descriptor,
      platform: {
        state: 'present',
        os: 'linux',
        architecture: 'amd64',
        variant: { state: 'unknown' },
      },
    }),
  ).toThrow();
});
