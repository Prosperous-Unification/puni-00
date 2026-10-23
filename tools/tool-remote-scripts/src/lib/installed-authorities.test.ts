import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import * as authority from './installed-authorities';

test('decodes only closed independently prepared authority pins', () => {
  expect('decodeInstalledAuthorityPins' in authority).toBe(true);
  if (
    !('decodeInstalledAuthorityPins' in authority) ||
    typeof authority.decodeInstalledAuthorityPins !== 'function'
  )
    throw new Error('missing authority pins decoder');
  const pins = {
    format: 'installed-dependency-authority-pins',
    version: 1,
    sourceSha: 'a'.repeat(40),
    writerManifestSha256: 'b'.repeat(64),
    hostMachineIdSha256: 'c'.repeat(64),
    launchConfigurationSha256: 'd'.repeat(64),
    solver: {
      version: 1,
      sourceSha: 'a'.repeat(40),
      bunSha256: 'e'.repeat(64),
      bundleSha256: 'f'.repeat(64),
      configSha256: '0'.repeat(64),
      unitSha256: '1'.repeat(64),
    },
  };
  expect(JSON.stringify(authority.decodeInstalledAuthorityPins(pins))).toBe(JSON.stringify(pins));
  expect(() =>
    authority.decodeInstalledAuthorityPins({ ...pins, activation: 'allowed' }),
  ).toThrow();
  expect(() => authority.decodeInstalledAuthorityPins({ ...pins, sourceSha: 'main' })).toThrow();
  expect(() =>
    authority.decodeInstalledAuthorityPins({
      ...pins,
      solver: { ...pins.solver, sourceSha: 'b'.repeat(40) },
    }),
  ).toThrow();
});

test('public observation refuses replayed owner before any privileged collection', () => {
  expect('observeInstalledDependencyAuthorities' in authority).toBe(true);
  if (
    !('observeInstalledDependencyAuthorities' in authority) ||
    typeof authority.observeInstalledDependencyAuthorities !== 'function'
  )
    throw new Error('missing authority observer');
  expect(
    authority.observeInstalledDependencyAuthorities(
      {} as Parameters<typeof authority.observeInstalledDependencyAuthorities>[0],
      {} as Parameters<typeof authority.observeInstalledDependencyAuthorities>[1],
      {} as Parameters<typeof authority.observeInstalledDependencyAuthorities>[2],
      '',
      [],
      performance.now() + 100,
    ),
  ).rejects.toThrow();
});

test('closed collector decoder rejects replay, incomplete census and private payload fields', () => {
  const pins = authority.decodeInstalledAuthorityPins({
    format: 'installed-dependency-authority-pins',
    version: 1,
    sourceSha: 'a'.repeat(40),
    writerManifestSha256: 'b'.repeat(64),
    hostMachineIdSha256: 'c'.repeat(64),
    launchConfigurationSha256: 'd'.repeat(64),
    solver: {
      version: 1,
      sourceSha: 'a'.repeat(40),
      bunSha256: 'e'.repeat(64),
      bundleSha256: 'f'.repeat(64),
      configSha256: '0'.repeat(64),
      unitSha256: '1'.repeat(64),
    },
  });
  const envelope = {
    nonce: 'expected',
    writerManifestSha256: pins.writerManifestSha256,
    complete: true,
    version: 1,
    euid: 0,
    hostMachineIdSha256: pins.hostMachineIdSha256,
    bootId: '12345678-1234-1234-1234-123456789abc',
    launchConfigurationSha256: pins.launchConfigurationSha256,
    databaseOpeners: [],
    relevantProcesses: [],
    internalProcesses: [],
  };
  expect(
    authority.decodeAuthorityCollection(JSON.stringify(envelope), 'expected', pins).databaseOpeners,
  ).toEqual([]);
  for (const fault of [
    { ...envelope, nonce: 'old' },
    { ...envelope, complete: false },
    { ...envelope, euid: 1000 },
    { ...envelope, hostMachineIdSha256: '0'.repeat(64) },
    { ...envelope, launchConfigurationSha256: '0'.repeat(64) },
    { ...envelope, argv: 'private secret' },
    { ...envelope, bootId: 'bad' },
  ])
    expect(() =>
      authority.decodeAuthorityCollection(JSON.stringify(fault), 'expected', pins),
    ).toThrow();
});

test.each(['manifest-hash', 'source', 'location', 'database', 'owner-source'] as const)(
  'actual live owner refuses %s before privileged collection',
  async (fault) => {
    const { mkdir } = await import('node:fs/promises');
    const { withDependencyOwner } = await import('./edge-ownership');
    const { envLayout } = await import('./env');
    const { WRITER_MEMBERS } = await import('./installed-writers');
    const directory = scratchSync('authority-owner-');
    await mkdir(directory + '/prod');
    await mkdir(directory + '/dev');
    const layouts = {
      prod: { ...envLayout('prod'), root: directory + '/prod', stateDir: directory + '/prod' },
      dev: { ...envLayout('dev'), root: directory + '/dev', stateDir: directory + '/dev' },
    };
    const sourceSha = 'a'.repeat(40);
    const fixed = [
      '/home/puni1/wbs/bin/swap.js',
      '/home/puni1/wbs/bin/smoke.js',
      '/home/puni1/wbs-dev/bin/swap.js',
      '/home/puni1/wbs-dev/bin/smoke.js',
      '/home/puni1/wbs-dev/bin/poll.sh',
      '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
      '/home/puni1/wbs-dev/bin/bun',
    ];
    const contents = JSON.stringify({
      version: 1,
      sourceSha,
      buildSha: fault === 'source' ? 'b'.repeat(40) : sourceSha,
      buildId: 'independent',
      members: WRITER_MEMBERS.map((member, index) => ({
        member,
        origin: 'source',
        hostPath:
          fault === 'location' ? '/captured/' + member : (fixed[index] ?? '/private/' + member),
        reviewed: 'reviewed/' + member,
        installed: 'installed/' + member,
        sha256: 'b'.repeat(64),
      })),
    });
    const pins = authority.decodeInstalledAuthorityPins({
      format: 'installed-dependency-authority-pins',
      version: 1,
      sourceSha,
      writerManifestSha256:
        fault === 'manifest-hash'
          ? '0'.repeat(64)
          : new Bun.CryptoHasher('sha256').update(contents).digest('hex'),
      hostMachineIdSha256: 'c'.repeat(64),
      launchConfigurationSha256: 'd'.repeat(64),
      solver: {
        version: 1,
        sourceSha,
        bunSha256: 'e'.repeat(64),
        bundleSha256: 'f'.repeat(64),
        configSha256: '0'.repeat(64),
        unitSha256: '1'.repeat(64),
      },
    });
    const message = {
      'manifest-hash': 'independent pin',
      source: 'source/build',
      location: 'host location',
      database: 'database roster',
      'owner-source': 'owner SHA',
    }[fault];
    await withDependencyOwner(
      {
        sha: fault === 'owner-source' ? 'f'.repeat(40) : sourceSha,
        layouts: [layouts.prod, layouts.dev],
      },
      async (owner) => {
        let refusal = '';
        try {
          await authority.observeInstalledDependencyAuthorities(
            owner,
            layouts,
            pins,
            contents,
            [],
            performance.now() + 1000,
          );
        } catch (error) {
          refusal = String(error);
        }
        expect(refusal).toContain(message);
      },
      directory,
    );
  },
);
