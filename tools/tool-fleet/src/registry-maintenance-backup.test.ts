import { expect, test } from 'bun:test';

import { parseRegistryBackupConfiguration } from './registry-maintenance-backup';

const configuration = {
  repositoryId: 'f'.repeat(64),
  recoveryPins: [] as string[],
  sourceLimits: {
    registry: {
      maximumLogicalBytes: 1048576,
      maximumEntries: 100,
      maximumDepth: 10,
      maximumMetadataBytes: 65536,
      maximumFanout: 100,
    },
    journal: {
      maximumLogicalBytes: 1048576,
      maximumEntries: 100,
      maximumDepth: 10,
      maximumMetadataBytes: 65536,
      maximumFanout: 100,
    },
  },
  binary: {
    path: '/root/.puni/tools/restic-0.19.1',
    sha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
  },
  password: { path: '/root/.puni/registry/restic.password', sha256: 'a'.repeat(64) },
  environment: {
    RESTIC_REPOSITORY: 's3:https://fixture.invalid/owned-prefix',
    AWS_ACCESS_KEY_ID: 'fixture',
    AWS_SECRET_ACCESS_KEY: 'fixture',
    AWS_DEFAULT_REGION: 'fixture',
  },
};
test('root backup configuration accepts only its pinned binary/password and allowlisted provider settings', () => {
  expect(parseRegistryBackupConfiguration(configuration).binary.path).toBe(
    '/root/.puni/tools/restic-0.19.1',
  );
});
for (const fault of [
  'binary',
  'hash',
  'password-path',
  'password-environment',
  'loader',
  'command',
] as const) {
  test(`root backup configuration refuses ${fault} injection`, () => {
    const changed = structuredClone(configuration);
    if (fault === 'binary') changed.binary.path = '/arbitrary';
    if (fault === 'hash') changed.binary.sha256 = 'b'.repeat(64);
    if (fault === 'password-path') changed.password.path = '/caller/secret';
    if (fault === 'password-environment')
      Object.assign(changed.environment, { RESTIC_PASSWORD: 'caller' });
    if (fault === 'loader') Object.assign(changed.environment, { LD_PRELOAD: '/caller' });
    if (fault === 'command') Object.assign(changed, { argv: ['sh'] });
    expect(() => parseRegistryBackupConfiguration(changed)).toThrow();
  });
}

for (const fault of ['absent', 'malformed'] as const) {
  test(`backup configuration refuses ${fault} immutable repository identity`, () => {
    const changed =
      fault === 'absent'
        ? Object.fromEntries(
            Object.entries(configuration).filter(([key]) => key !== 'repositoryId'),
          )
        : { ...configuration, repositoryId: 'malformed' };
    // Serialized boundary deliberately has no property; present-undefined would not exercise required-field removal.
    if (fault === 'absent') expect(Object.hasOwn(changed, 'repositoryId')).toBe(false);
    expect(() => parseRegistryBackupConfiguration(JSON.parse(JSON.stringify(changed)))).toThrow();
  });
}

for (const fault of ['absent', 'null', 'short', 'upper', 'duplicate', 'excess'] as const) {
  test(`backup configuration refuses ${fault} durable recovery pins`, () => {
    const changed: Record<string, unknown> = structuredClone(configuration);
    if (fault === 'absent') Reflect.deleteProperty(changed, 'recoveryPins');
    if (fault === 'null') changed['recoveryPins'] = null;
    if (fault === 'short') changed['recoveryPins'] = ['abc'];
    if (fault === 'upper') changed['recoveryPins'] = ['A'.repeat(64)];
    if (fault === 'duplicate') changed['recoveryPins'] = ['a'.repeat(64), 'a'.repeat(64)];
    if (fault === 'excess')
      changed['recoveryPins'] = Array.from({ length: 2049 }, (_, index) =>
        index.toString(16).padStart(64, '0'),
      );
    if (fault === 'absent') expect(Object.hasOwn(changed, 'recoveryPins')).toBe(false);
    expect(() => parseRegistryBackupConfiguration(JSON.parse(JSON.stringify(changed)))).toThrow();
  });
}
test('root configuration accepts explicit empty and bounded full recovery pins', () => {
  expect(parseRegistryBackupConfiguration(configuration).recoveryPins).toEqual([]);
  expect(
    parseRegistryBackupConfiguration({
      ...configuration,
      recoveryPins: ['a'.repeat(64), 'b'.repeat(64)],
    }).recoveryPins,
  ).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
});

for (const fault of ['absent', 'null', 'zero', 'unsafe', 'excess', 'extra'] as const) {
  test('backup configuration refuses ' + fault + ' source limits', () => {
    const changed: Record<string, unknown> = structuredClone(configuration);
    if (fault === 'absent') Reflect.deleteProperty(changed, 'sourceLimits');
    if (fault === 'null') changed['sourceLimits'] = null;
    if (fault === 'zero')
      changed['sourceLimits'] = {
        ...configuration.sourceLimits,
        registry: { ...configuration.sourceLimits.registry, maximumEntries: 0 },
      };
    if (fault === 'unsafe')
      changed['sourceLimits'] = {
        ...configuration.sourceLimits,
        registry: {
          ...configuration.sourceLimits.registry,
          maximumLogicalBytes: Number.MAX_SAFE_INTEGER + 1,
        },
      };
    if (fault === 'excess')
      changed['sourceLimits'] = {
        ...configuration.sourceLimits,
        registry: { ...configuration.sourceLimits.registry, maximumDepth: 129 },
      };
    if (fault === 'extra')
      changed['sourceLimits'] = { ...configuration.sourceLimits, untrusted: 'extra' };
    expect(() => parseRegistryBackupConfiguration(JSON.parse(JSON.stringify(changed)))).toThrow();
  });
}
