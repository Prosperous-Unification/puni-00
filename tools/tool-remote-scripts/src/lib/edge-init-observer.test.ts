import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import { chmod, lstat, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { syntheticContainer } from '../../test/edge-init-fixture';
import { packetFixture } from '../../test/edge-init-observer-fixture';
import {
  candidateInvariant,
  CREATED_PROFILE,
  fingerprint,
  parseNativeContainer,
  projectInvariant,
} from './edge-init';
import {
  checkGraph,
  checkInheritedInitLocks,
  checkInitProcess,
  checkReceiptSources,
  checkRouteCoverage,
  checkStoppedUnit,
  classifyRecoveryTarget,
  decodeInitPacket,
  fingerprintPacketRoster,
  INIT_NATIVE_READER,
  observeComposeDeclarations,
  operationExpiry,
  probeHttp,
  publishInitReceipt,
  readRecoveryHistory,
  readRecoveryStage,
  readSuspendedCrontab,
  recoverySnapshot,
  requireLiteralComposeInit,
  resolveDefaultRoute,
  runProductionInitAdoption,
} from './edge-init-observer';
import { PrivateReceipts } from './edge-init-operation';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import { withCanonicalLock } from './lock';
import { SOLVER_UNIT_PROPERTIES } from './solver-unit-observation';

const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

test('production packet boundary rejects an unknown field without echoing private bytes', () => {
  expect(() => decodeInitPacket({ password: 'private-secret-marker' })).toThrow('packet-invalid');
});

test('production packet admits only v2 with the current required invariant profile', () => {
  const packet = packetFixture().packet;
  const current = { ...packet, version: 2, invariantProfile: CREATED_PROFILE };
  expect(decodeInitPacket(current).invariantProfile).toBe(CREATED_PROFILE);
  for (const old of [
    { ...current, version: 1 },
    { ...current, invariantProfile: 'engine-29.1.3-api-1.52-cgroup2-created-v2' },
    { ...current, invariantProfile: 'unknown' },
    { ...current, invariantProfile: undefined },
  ])
    expect(() => decodeInitPacket(old)).toThrow('packet-invalid');
});

test('closed packet decodes independent pins and rejects target, probe, graph and lock expansion', () => {
  const { packet } = packetFixture();
  expect(decodeInitPacket(packet).nonce).toBe('fixture');
  expect(() => decodeInitPacket({ ...packet, unknown: 'private-secret-marker' })).toThrow(
    'packet-invalid',
  );
  for (const mutate of [
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.targets.reverse();
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.targets[1].id = packet.targets[0].id;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.public.probes[0].address.connectAddress = 'lookup.invalid';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.public.probes[0].path = '//escape.invalid/';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.public.probes.push(packet.public.probes[0]);
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.registry.repository = '../escape';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.registry.credentials.mode = 0o644;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.caddy.files[0].path = '/outside/Caddyfile';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.locks[1].descriptor = packet.quiescence.locks[0].descriptor;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.locks.reverse();
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.bootId = '87654321-1234-1234-1234-123456789abc';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.operation.mode = 0o644;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.backends.push(packet.backends[0]);
    },
  ]) {
    const fault = structuredClone(packet);
    mutate(fault);
    expect(() => decodeInitPacket(fault)).toThrow();
  }
});

test('operation roster binds nonce, receipt path, daemon, host and inherited lock descriptors', () => {
  const packet = decodeInitPacket(packetFixture().packet),
    expected = fingerprintPacketRoster(packet);
  for (const mutate of [
    (packet: ReturnType<typeof decodeInitPacket>) => {
      packet.nonce = 'another-attempt';
    },
    (packet: ReturnType<typeof decodeInitPacket>) => {
      packet.receiptDirectory = '/tmp/another-private-attempt';
    },
    (packet: ReturnType<typeof decodeInitPacket>) => {
      packet.daemonPid++;
    },
    (packet: ReturnType<typeof decodeInitPacket>) => {
      packet.machineIdSha256 = '0'.repeat(64);
    },
    (packet: ReturnType<typeof decodeInitPacket>) => {
      packet.quiescence.locks[0].descriptor++;
    },
  ]) {
    const changed = structuredClone(packet);
    mutate(changed);
    expect(fingerprintPacketRoster(changed)).not.toBe(expected);
  }
});

test('recovery refuses an unknown private receipt stage', () => {
  expect(readRecoveryStage('stop-uncertain')).toBe('stop-uncertain');
  expect(() => readRecoveryStage('private-secret-marker')).toThrow('recovery-stage-invalid');
});

test('suspended crontab read distinguishes present empty bytes from absence and diagnostics', () => {
  expect(readSuspendedCrontab(0, Buffer.from(''), Buffer.from('')).length).toBe(0);
  expect(() =>
    readSuspendedCrontab(1, Buffer.from(''), Buffer.from('no crontab for puni1\n')),
  ).toThrow();
  expect(() =>
    readSuspendedCrontab(0, Buffer.from(''), Buffer.from('private-secret-marker')),
  ).toThrow('suspended-crontab-unavailable');
});

test('installed Compose source boundary admits checked-in base and separate ordered Caddy/registry recipes', async () => {
  const root = await mkdtemp('/tmp/edge-init-compose-');
  const base = join(root, 'base.yml'),
    others = Array.from({ length: 3 }, (_, index) => join(root, `tier-${String(index)}.yml`));
  try {
    const source = await readFile(
      new URL('../../../../deploy/compose/base.yml', import.meta.url),
      'utf8',
    );
    expect(requireLiteralComposeInit(source, 'registry')).toBe(true);
    expect(requireLiteralComposeInit(source, 'caddy')).toBe(true);
    await writeFile(base, source);
    for (const [index, file] of others.entries())
      await writeFile(
        file,
        `services:\n  tier-${String(index)}:\n    image: 'example:\${TAG}'\n    networks: [wbs-net]\n`,
      );
    const files = [base, ...others],
      pins = await Promise.all(
        files.map(async (path) => {
          const native = await lstat(path, { bigint: true });
          return {
            path,
            sha256: digest(await readFile(path, 'utf8')),
            device: String(native.dev),
            inode: String(native.ino),
            mode: Number(native.mode & 0o7777n),
            uid: Number(native.uid),
          };
        }),
      );
    const selected = (kind: 'registry' | 'caddy', roster: string[]) => {
      const raw = syntheticContainer();
      const original = parseNativeContainer({
        ...raw,
        Config: {
          ...raw.Config,
          Labels: {
            ...raw.Config.Labels,
            'com.docker.compose.project.config_files': roster.join(','),
          },
        },
      });
      return { kind, original, nativeSha256: fingerprint(original), roster };
    };
    const registry = selected('registry', [base]),
      caddy = selected('caddy', files);
    const proofs = await observeComposeDeclarations([registry, caddy], pins);
    expect(proofs).toHaveLength(2);
    expect(proofs[0].sourceRosterSha256).not.toBe(proofs[1].sourceRosterSha256);
    await rejects(
      observeComposeDeclarations([{ ...caddy, roster: [...files].reverse() }], pins),
      /compose-roster-differs/,
    );
    await rejects(
      observeComposeDeclarations([{ ...registry, roster: files }], pins),
      /compose-roster-differs/,
    );
    await rejects(observeComposeDeclarations([caddy], pins.slice(0, 1)), /compose-source-unpinned/);
    await rejects(
      observeComposeDeclarations([selected('registry', [base, base])], pins),
      /compose-roster-invalid/,
    );
    await rejects(
      observeComposeDeclarations([selected('registry', [base, join(root, 'unpinned.yml')])], pins),
      /compose-source-unpinned/,
    );
    const missingLabel = {
      ...registry.original,
      config: { ...registry.original.config, Labels: { 'com.docker.compose.service': 'registry' } },
    };
    await rejects(
      observeComposeDeclarations(
        [{ ...registry, original: missingLabel, nativeSha256: fingerprint(missingLabel) }],
        pins,
      ),
    );
    const changedOriginal = {
      ...registry.original,
      config: {
        ...registry.original.config,
        Labels: { 'com.docker.compose.project.config_files': files.join(',') },
      },
    };
    await rejects(
      observeComposeDeclarations([{ ...registry, original: changedOriginal, roster: files }], pins),
      /compose-native-binding-differs/,
    );
    for (const declaration of ['init: false', '', 'init: true']) {
      await writeFile(others[0], `services:\n  caddy:\n    image: fixture\n    ${declaration}\n`);
      const changedPins = await Promise.all(
        files.map(async (path) => {
          const native = await lstat(path, { bigint: true });
          return {
            path,
            sha256: digest(await readFile(path, 'utf8')),
            device: String(native.dev),
            inode: String(native.ino),
            mode: Number(native.mode & 0o7777n),
            uid: Number(native.uid),
          };
        }),
      );
      await rejects(observeComposeDeclarations([caddy], changedPins));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('self-consistently pinned false or missing Init source refuses despite a good historical JSON projection', async () => {
  const root = await mkdtemp('/tmp/edge-init-compose-false-'),
    file = join(root, 'base.yml'),
    projection = join(root, 'historical.json');
  await writeFile(projection, JSON.stringify({ services: { registry: { init: true } } }));
  try {
    for (const declaration of ['init: false', 'image: registry:retained']) {
      await writeFile(file, `services:\n  registry:\n    ${declaration}\n`);
      const pins = await Promise.all(
        [file, projection].map(async (path) => {
          const native = await lstat(path, { bigint: true });
          return {
            path,
            sha256: digest(await readFile(path, 'utf8')),
            device: String(native.dev),
            inode: String(native.ino),
            mode: Number(native.mode & 0o7777n),
            uid: Number(native.uid),
          };
        }),
      );
      const raw = syntheticContainer();
      const original = parseNativeContainer({
          ...raw,
          Config: {
            ...raw.Config,
            Labels: { ...raw.Config.Labels, 'com.docker.compose.project.config_files': file },
          },
        }),
        target = {
          kind: 'registry' as const,
          original,
          nativeSha256: fingerprint(original),
          roster: [file],
        };
      await rejects(observeComposeDeclarations([target], pins), /compose-literal-init-required/);
      await rejects(
        observeComposeDeclarations([target], pins.slice(0, 1)),
        /compose-literal-init-required/,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('literal Compose profile refuses duplicate, shadow, merge, tagged, scalar and multiline authority', () => {
  const valid =
    'services:\n  registry:\n    init: true\n    image: "registry:${TAG}" # ordinary comment\n';
  expect(requireLiteralComposeInit(valid, 'registry')).toBe(true);
  for (const source of [
    'name: first\nname: second\n' + valid,
    'services:\n  other:\n    image: first\n  other:\n    image: second\n  registry:\n    init: true\n',
    'services:\n  other: {image: fixture}\n  registry:\n    init: true\n',
    valid + 'services:\n  other:\n    image: fixture\n',
    valid + '  registry:\n    init: true\n',
    valid.replace('init: true', 'init: true\n    init: false'),
    valid.replace('init: true', 'init: true\n    init: true'),
    valid.replace('init: true', 'init: false\n    init: true'),
    valid.replace('services:', '"services":'),
    valid.replace('registry:', '"registry":'),
    valid.replace('init: true', '"init": true'),
    'include: other.yml\n' + valid,
    valid.replace('init: true', 'extends: fixture\n    init: true'),
    valid.replace('init: true', 'profiles: [fixture]\n    init: true'),
    valid.replace('init: true', 'init: &enabled true'),
    valid.replace('init: true', 'init: *enabled'),
    'x-image: &fixture registry:retained\n' +
      valid.replace('image: "registry:${TAG}"', 'image: *fixture'),
    valid.replace('init: true', '<<: {init: true}'),
    ...[
      '!reset true',
      '!override true',
      '!!bool true',
      '"true"',
      'TRUE',
      'yes',
      '1',
      'null',
      '${INIT}',
    ].map((value) => valid.replace('init: true', 'init: ' + value)),
    '---\n' + valid,
    valid + '---\n' + valid,
    'services: {registry: {init: true}}\n',
    'services:\n  registry: [true]\n',
    'services:\n  ? registry\n  : {init: true}\n',
    'name: |\n  services:\n    registry:\n      init: true\n',
    'name: |\n  private: marker\n' + valid,
    'name: "multiline\nservices:\n  registry:\n    init: true\n"\n',
    valid.replace('registry:', '${SERVICE}:'),
    valid.replace('init: true', '${PROPERTY}: true'),
  ])
    expect(() => requireLiteralComposeInit(source, 'registry')).toThrow();
});

test('literal Compose parser errors redact the private native cause', () => {
  const parse = Bun.YAML.parse;
  Bun.YAML.parse = () => {
    throw new Error('private-secret-parser-marker');
  };
  try {
    expect(() =>
      requireLiteralComposeInit('services:\n  registry:\n    init: true\n', 'registry'),
    ).toThrow('compose-source-unsupported');
  } finally {
    Bun.YAML.parse = parse;
  }
});

test('production receipt readback contains both exact source hashes and recovery refuses missing or wrong metadata', async () => {
  const root = await mkdtemp('/tmp/edge-init-source-receipt-'),
    directory = join(root, 'attempt');
  const proof = {
    target: 'registry' as const,
    sourceRosterSha256: 'a'.repeat(64),
    literalInitSha256: 'b'.repeat(64),
  };
  const evidence = {
    invariants: packetFixture().packet.targets.map((target) => ({
      target: target.kind,
      original: target.id,
      originalInvariantSha256: 'c'.repeat(64),
      candidateInvariantSha256: 'd'.repeat(64),
      originalProcess: {
        pid: 123,
        startTime: target.process.startTime,
        cgroup: target.process.cgroup,
        cgroupDevice: '1',
        cgroupInode: '2',
      },
    })),
    candidateProcesses: (['registry', 'caddy'] as const).map((target) => ({
      target,
      candidate: null,
      processSha256: null,
    })),
  };
  try {
    const receipts = await PrivateReceipts.create(directory, 'fixture');
    await publishInitReceipt(
      receipts,
      { stage: 'create-intended', target: 'registry', original: 'c'.repeat(64), remaining: 270000 },
      proof,
      'e'.repeat(64),
      evidence,
    );
    const persisted = JSON.parse(await readFile(join(directory, '0000.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(persisted).toMatchObject({
      ...proof,
      ...evidence,
      format: 'edge-init-receipt',
      version: 3,
      invariantProfile: CREATED_PROFILE,
    });
    expect(persisted['packetSha256']).toBe('e'.repeat(64));
    checkReceiptSources(persisted, proof, 'e'.repeat(64));
    const { sourceRosterSha256: _roster, ...missingRoster } = persisted;
    const { literalInitSha256: _literal, ...missingLiteral } = persisted;
    const { packetSha256: _packet, ...missingPacket } = persisted;
    expect(() => {
      checkReceiptSources(persisted, proof, 'f'.repeat(64));
    }).toThrow();
    for (const fault of [
      missingPacket,
      { ...persisted, invariantProfile: undefined },
      { ...persisted, invariantProfile: 'unknown' },
      { ...persisted, invariantProfile: 'engine-29.1.3-api-1.52-cgroup2-created-oom-v1' },
      { ...persisted, packetSha256: 'f'.repeat(64) },
      missingRoster,
      missingLiteral,
      { ...persisted, sourceRosterSha256: 'd'.repeat(64) },
      { ...persisted, literalInitSha256: 'd'.repeat(64) },
    ])
      expect(() => {
        checkReceiptSources(fault, proof, 'e'.repeat(64));
      }).toThrow();
    await writeFile(join(directory, '0001.json'), 'collision', { mode: 0o600 });
    await rejects(
      publishInitReceipt(
        receipts,
        { stage: 'stop-intended', target: 'registry', original: 'c'.repeat(64), remaining: 200000 },
        proof,
        'e'.repeat(64),
        evidence,
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('real Compose source lifetime refuses missing/unreadable bytes, same-path replacements and parser disagreement privately', async () => {
  const root = await mkdtemp('/tmp/edge-init-compose-lifetime-'),
    file = join(root, 'private-secret-source.yml');
  const contents = 'services:\n  registry:\n    init: true\n';
  const parse = Bun.YAML.parse;
  async function fixture() {
    await rm(file, { force: true });
    await writeFile(file, contents, { mode: 0o600 });
    const native = await lstat(file, { bigint: true }),
      pin = {
        path: file,
        sha256: digest(contents),
        device: String(native.dev),
        inode: String(native.ino),
        mode: Number(native.mode & 0o7777n),
        uid: Number(native.uid),
      };
    const raw = syntheticContainer(),
      original = parseNativeContainer({
        ...raw,
        Config: {
          ...raw.Config,
          Labels: { ...raw.Config.Labels, 'com.docker.compose.project.config_files': file },
        },
      });
    return {
      target: {
        kind: 'registry' as const,
        original,
        nativeSha256: fingerprint(original),
        roster: [file],
      },
      pin,
    };
  }
  try {
    for (const fault of ['bytes', 'inode', 'ancestry', 'parser', 'unreadable', 'missing']) {
      const { target, pin } = await fixture();
      if (fault === 'unreadable') await chmod(file, 0);
      else if (fault === 'missing') await rm(file);
      else
        Bun.YAML.parse = (source) => {
          const decoded = parse(source);
          if (fault === 'bytes') writeFileSync(file, contents + '# changed\n');
          if (fault === 'inode') {
            const replacement = join(root, 'replacement');
            writeFileSync(replacement, contents);
            renameSync(replacement, file);
          }
          if (fault === 'parser') throw new Error('private-secret-parser-marker');
          if (fault === 'ancestry') {
            if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded))
              throw new Error('fixture shape');
            return { ...decoded, unexpected: 'private-secret-parser-marker' };
          }
          return decoded;
        };
      await rejects(observeComposeDeclarations([target], [pin]), (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
        if (!(cause instanceof Error)) return false;
        expect(cause.message).not.toContain('private-secret');
        return true;
      });
      Bun.YAML.parse = parse;
    }
  } finally {
    Bun.YAML.parse = parse;
    await rm(root, { recursive: true, force: true });
  }
});

test('operation validity refuses future, expired, malformed and overlong authority without extending time', () => {
  const now = Date.now(),
    issued = new Date(now - 1000).toISOString(),
    expiry = new Date(now + 600000).toISOString();
  expect(operationExpiry(issued, expiry, now, 123)).toBe(600123);
  expect(() => operationExpiry(new Date(now + 1).toISOString(), expiry, now, 123)).toThrow();
  expect(() => operationExpiry(issued, new Date(now).toISOString(), now, 123)).toThrow();
  expect(() => operationExpiry(issued, 'malformed', now, 123)).toThrow();
  expect(() => operationExpiry(issued, new Date(now + 1800000).toISOString(), now, 123)).toThrow();
});

test('native inherited-lock admission refuses an independently opened descriptor and wrong inode', async () => {
  const root = await mkdtemp('/tmp/edge-init-lock-'),
    lock = join(root, 'lock');
  try {
    await writeFile(lock, '');
    await withCanonicalLock(lock, async (descriptor) => {
      const metadata = await lstat(lock, { bigint: true });
      const expected = {
        path: lock,
        descriptor,
        device: String(metadata.dev),
        inode: String(metadata.ino),
      };
      await checkInheritedInitLocks([expected]);
      const independent = await open(lock, 'r+');
      try {
        await rejects(checkInheritedInitLocks([{ ...expected, descriptor: independent.fd }]));
      } finally {
        await independent.close();
      }
      await rejects(checkInheritedInitLocks([{ ...expected, inode: '0' }]));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native init admission refuses changed executable, missing PID one and altered command', () => {
  const native = {
    executableSha256: 'a'.repeat(64),
    cmdline: '/sbin/docker-init\0--\0caddy\0run\0',
    status: 'Name:\tdocker-init\nNSpid:\t123\t1\n',
  };
  checkInitProcess(native, 'a'.repeat(64));
  expect(() => {
    checkInitProcess({ ...native, executableSha256: 'b'.repeat(64) }, 'a'.repeat(64));
  }).toThrow();
  expect(() => {
    checkInitProcess({ ...native, status: 'NSpid:\t123\t2\n' }, 'a'.repeat(64));
  }).toThrow();
  expect(() => {
    checkInitProcess({ ...native, cmdline: 'caddy\0run\0' }, 'a'.repeat(64));
  }).toThrow();
});

test('native stopped-unit projection refuses queued jobs, ControlPID, resumed unit and byte drift', () => {
  const fields = Object.fromEntries(SOLVER_UNIT_PROPERTIES.map((key) => [key, '']));
  Object.assign(fields, {
    MainPID: '0',
    ControlPID: '0',
    RestartPreventExitStatus: '78',
    ActiveState: 'inactive',
    SubState: 'dead',
  });
  const stdout = (fields: Record<string, string>) =>
    Object.entries(fields)
      .map(([key, value]) => key + '=' + value)
      .join('\n') + '\n';
  const digest = fingerprint(fields);
  checkStoppedUnit(stdout(fields), digest);
  const faults: Record<string, string>[] = [
    { Job: '123' },
    { ControlPID: '42' },
    { ActiveState: 'activating' },
    { ExecStart: 'changed legacy argv' },
  ];
  for (const fault of faults)
    expect(() => {
      checkStoppedUnit(stdout({ ...fields, ...fault }), digest);
    }).toThrow();
  const queued = { ...fields, Job: '123' };
  expect(() => {
    checkStoppedUnit(stdout(queued), fingerprint(queued));
  }).toThrow('solver-not-drained');
});

test('route coverage refuses omitted server/route, wrong host, cross-route probe and live-only changes', () => {
  const { packet, configuration } = packetFixture();
  const checked = decodeInitPacket(packet);
  checkRouteCoverage(configuration, checked.caddy.routeInventory, checked.public);
  expect(() => {
    checkRouteCoverage(configuration, [], checked.public);
  }).toThrow();
  expect(() => {
    checkRouteCoverage(
      { apps: { http: { servers: {} } } },
      checked.caddy.routeInventory,
      checked.public,
    );
  }).toThrow();
  expect(() => {
    checkRouteCoverage(
      configuration,
      [{ ...checked.caddy.routeInventory[0], hosts: [] }],
      checked.public,
    );
  }).toThrow();
  expect(() => {
    checkRouteCoverage(configuration, checked.caddy.routeInventory, {
      ...checked.public,
      probes: [{ ...checked.public.probes[0], routeId: '0'.repeat(64) }],
    });
  }).toThrow();
  const live = structuredClone(configuration);
  live.apps.http.servers.edge.routes[0].handle[0].body = 'changed';
  expect(() => {
    checkRouteCoverage(live, checked.caddy.routeInventory, checked.public);
  }).toThrow();
  const extraServer = {
    ...configuration.apps.http.servers,
    uncovered: {
      listen: [':80'],
      routes: [{ handle: [{ handler: 'static_response', body: 'uncovered' }] }],
    },
  };
  expect(() => {
    checkRouteCoverage({ apps: { http: { servers: extraServer } } }, checked.caddy.routeInventory, {
      ...checked.public,
      routesSha256: fingerprint({ servers: extraServer, inventory: checked.caddy.routeInventory }),
    });
  }).toThrow('route-coverage-incomplete');
});

test('kernel route admission binds every default to one connected interface and address', () => {
  const container = syntheticContainer();
  container.NetworkSettings.Networks.edge.Gateway = '172.18.0.1';
  container.NetworkSettings.Networks.edge.IPAddress = '172.18.0.2';
  container.NetworkSettings.Networks.edge.IPPrefixLen = 16;
  const native = {
    route:
      'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\n' +
      'eth0 00000000 010012AC 0003 0 0 100 00000000 0 0 0\n' +
      'eth0 000012AC 00000000 0001 0 0 0 0000FFFF 0 0 0\n',
    ipv6Route: '',
    fibTrie: ' |-- 172.18.0.2\n    /32 host LOCAL\n',
    ifInet6: '',
  };
  expect(resolveDefaultRoute(native, parseNativeContainer(container))).toBe('c'.repeat(64));
  for (const route of [
    native.route + 'eth9 00000000 010013AC 0003 0 0 0 00000000 0 0 0\n',
    native.route + 'eth0 00000000 010012AC 0003 0 0 0 00000000 0 0 0\n',
    native.route.replace('eth0 000012AC', 'eth9 000012AC'),
    native.route.replace('000012AC 00000000', '000013AC 00000000'),
    native.route.replace('0 0 100', '0 0 unknown'),
    native.route.split('\n')[0] + '\n',
  ])
    expect(() =>
      resolveDefaultRoute({ ...native, route }, parseNativeContainer(container)),
    ).toThrow();
  expect(() =>
    resolveDefaultRoute(
      { ...native, fibTrie: native.fibTrie.replace('172.18.0.2', '172.18.0.3') },
      parseNativeContainer(container),
    ),
  ).toThrow();
  const wrongGateway = parseNativeContainer(container);
  wrongGateway.networks['edge'] = {
    ...(wrongGateway.networks['edge'] as object),
    Gateway: '172.18.0.3',
  };
  expect(() => resolveDefaultRoute(native, wrongGateway)).toThrow();
  const endpoint = parseNativeContainer(container);
  endpoint.networks['edge'] = {
    ...(endpoint.networks['edge'] as object),
    IPv6Gateway: 'fd00::1',
    GlobalIPv6Address: 'fd00::2',
    GlobalIPv6PrefixLen: 64,
  };
  const zero6 = '0'.repeat(32),
    prefix6 = 'fd00' + '0'.repeat(28),
    gateway6 = 'fd00' + '0'.repeat(27) + '1',
    address6 = 'fd00' + '0'.repeat(27) + '2';
  const native6 = {
    route: native.route.split('\n')[0] + '\n',
    fibTrie: '',
    ipv6Route: `${zero6} 00 ${zero6} 00 ${gateway6} 00000064 00000000 00000000 00000003 eth0\n${prefix6} 40 ${zero6} 00 ${zero6} 00000000 00000000 00000000 00000001 eth0\n`,
    ifInet6: `${address6} 02 40 00 80 eth0\n`,
  };
  expect(resolveDefaultRoute(native6, endpoint)).toBe('c'.repeat(64));
  expect(() =>
    resolveDefaultRoute({ ...native6, ifInet6: native6.ifInet6.replace('eth0', 'eth9') }, endpoint),
  ).toThrow();
  expect(() =>
    resolveDefaultRoute(
      {
        ...native6,
        ipv6Route:
          native6.ipv6Route +
          `${zero6} 00 ${zero6} 00 ${gateway6} 00000000 00000000 00000000 00000003 eth9\n`,
      },
      endpoint,
    ),
  ).toThrow();
  const observed = parseNativeContainer(container);
  observed.networks['other'] = {
    ...container.NetworkSettings.Networks.edge,
    NetworkID: 'd'.repeat(64),
  };
  expect(() => resolveDefaultRoute(native, observed)).toThrow('default-route-ambiguous');
});

test('real graph IO rejects changed bytes, unknown member and unreadable configuration', async () => {
  const root = await mkdtemp('/tmp/edge-init-graph-');
  const file = join(root, 'Caddyfile');
  await writeFile(file, 'fixture.invalid { respond "fixed" }\n');
  const directory = await lstat(root, { bigint: true }),
    metadata = await lstat(file, { bigint: true });
  const graph = {
    ...decodeInitPacket(packetFixture().packet).caddy,
    root: file,
    directoryDevice: String(directory.dev),
    directoryInode: String(directory.ino),
    files: [
      {
        path: file,
        device: String(metadata.dev),
        inode: String(metadata.ino),
        mode: Number(metadata.mode & 0o7777n),
        uid: Number(metadata.uid),
        sha256: digest(await readFile(file, 'utf8')),
      },
    ],
    directoryEntriesSha256: fingerprint([{ name: 'Caddyfile', kind: 'file' }]),
  };
  graph.importGraphSha256 = fingerprint({
    root: file,
    files: graph.files.map(({ path, sha256 }) => ({ path, sha256 })),
  });
  try {
    await checkGraph(graph);
    await writeFile(file, 'changed');
    await rejects(checkGraph(graph), /caddy-graph-differs/);
    await writeFile(file, 'fixture.invalid { respond "fixed" }\n');
    await writeFile(join(root, 'unknown'), 'extra');
    await rejects(checkGraph(graph), /caddy-graph-differs/);
    await rm(join(root, 'unknown'));
    await chmod(file, 0);
    await rejects(checkGraph(graph));
  } finally {
    await chmod(file, 0o600);
    await rm(root, { recursive: true, force: true });
  }
});

test('actual native-reader process binds start ticks and refuses PID reuse during reading', async () => {
  const program =
    AUTHORITY_COLLECTOR +
    '\n' +
    INIT_NATIVE_READER +
    String.raw`
host=Host(time.monotonic()+5)
observed=init_proc(host,os.getpid())
require(observed['pid']==os.getpid() and observed['startTime'].isdigit(),'owned PID not observed')
class Recycled(Host):
    def __init__(self):super().__init__(time.monotonic()+5);self.reads=0
    def read(self,path,limit):
        content=super().read(path,limit)
        if path.endswith('/stat'):
            self.reads+=1
            if self.reads>1:
                end=content.rfind(b') ');fields=content[end+2:].split();fields[19]=str(int(fields[19])+1).encode();content=content[:end+2]+b' '.join(fields)
        return content
try:init_proc(Recycled(),os.getpid())
except Refusal:print('recycled-refused')
else:raise RuntimeError('recycled PID was admitted')
`;
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-c', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe('');
  expect(code).toBe(0);
  expect(stdout).toBe('recycled-refused\n');
});

test('production factory rejects a non-private packet with redacted diagnostics', async () => {
  await rejects(runProductionInitAdoption('/no-such-private-secret-marker', 'prepare'), {
    message: 'edge Init adoption refused: preparation-failed',
  });
});

test('real HTTP probe binds raw body, status and exact redirect without following it', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/stall') return;
    if (request.url === '/large') {
      response.end(Buffer.alloc(5 * 1048576));
      return;
    }
    if (request.url === '/encoded') {
      response.setHeader('Content-Encoding', 'gzip');
      response.end('fixed body');
      return;
    }
    response.writeHead(302, { Location: '/next' });
    response.end('fixed body');
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('fixture port unavailable');
  const probe = {
    kind: 'http' as const,
    id: 'a',
    routeId: 'a'.repeat(64),
    scheme: 'http' as const,
    address: { host: 'fixture.invalid', connectAddress: '127.0.0.1', port: address.port },
    path: '/',
    expectedStatus: 302,
    expectedLocation: '/next',
    expectedContentType: null,
    expectedBodySha256: digest('fixed body'),
  };
  try {
    await probeHttp(probe, 1000);
    await rejects(
      probeHttp({ ...probe, expectedBodySha256: digest('changed') }, 1000),
      /probe-refused/,
    );
    await rejects(probeHttp({ ...probe, expectedLocation: null }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, expectedStatus: 200 }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, path: '/large' }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, path: '/encoded' }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, path: '/stall' }, 20), /probe-refused/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => {
        if (cause) reject(cause);
        else resolve();
      }),
    );
  }
});

test('real TLS, registry and WSS probes reject wrong name, connect IP, challenge, digest and upgrade accept', async () => {
  const root = await mkdtemp('/tmp/edge-init-tls-');
  const certificate = join(root, 'cert.pem'),
    key = join(root, 'key.pem'),
    privatePacket = join(root, 'packet.json');
  const generator = Bun.spawn(
    [
      '/usr/bin/openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=fixture.invalid',
      '-addext',
      'subjectAltName=DNS:fixture.invalid',
      '-keyout',
      key,
      '-out',
      certificate,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [, , generated] = await Promise.all([
    new Response(generator.stdout).text(),
    new Response(generator.stderr).text(),
    generator.exited,
  ]);
  expect(generated).toBe(0);
  let fault = '',
    registryReads = 0,
    observedSni: string | false | null = '',
    observedAuthorization = '';
  const sockets = new Set<Socket>();
  const manifest = '{"schemaVersion":2}',
    manifestDigest = 'sha256:' + digest(manifest);
  const server = createHttpsServer(
    { key: await readFile(key), cert: await readFile(certificate) },
    (request, response) => {
      observedAuthorization = String(request.headers.authorization);
      if (fault === 'challenge') {
        response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="private-secret-marker"' });
        response.end('private-secret-marker');
        return;
      }
      if (request.url === '/v2/') {
        registryReads++;
        response.setHeader('Docker-Distribution-Api-Version', 'registry/2.0');
        response.end('{}');
      } else if (request.url?.startsWith('/v2/')) {
        response.setHeader('Content-Type', 'application/vnd.oci.image.manifest.v1+json');
        response.setHeader(
          'Docker-Content-Digest',
          fault === 'digest' ? 'sha256:' + '0'.repeat(64) : manifestDigest,
        );
        response.end(fault === 'body' ? '{"schemaVersion":1}' : manifest);
      } else response.end('fixed');
    },
  );
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
  });
  server.on('secureConnection', (socket) => {
    observedSni = socket.servername;
  });
  server.on('upgrade', (request, socket) => {
    const accept =
      fault === 'accept'
        ? 'wrong'
        : createHash('sha1')
            .update(
              String(request.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
            )
            .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
    socket.once('data', () => {
      if (fault !== 'hold-upgrade') socket.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture listener missing');
  const fixturePath = fileURLToPath(
    new URL('../../test/edge-init-observer-fixture.ts', import.meta.url),
  );
  const { packet } = packetFixture();
  packet.bundle.path = fixturePath;
  packet.public.probes[0].address.port = address.port;
  packet.public.probes[0].expectedBodySha256 = digest('fixed');
  packet.registry.address.port = address.port;
  packet.registry.manifestDigest = manifestDigest;
  packet.registry.v2BodySha256 = digest('{}');
  const credentialsPath = join(root, 'credentials.json');
  await writeFile(
    credentialsPath,
    JSON.stringify({ username: 'fixture', password: 'private-secret-marker' }),
    { mode: 0o600 },
  );
  const credentials = await lstat(credentialsPath, { bigint: true });
  packet.registry.credentials = {
    path: credentialsPath,
    sha256: digest(await readFile(credentialsPath, 'utf8')),
    device: String(credentials.dev),
    inode: String(credentials.ino),
    // This test's isolated child models the tenant owner independently of
    // the hosted runner's raw scratch-file owner.
    uid: 1000,
    mode: 0o600,
  };
  async function run(packet: unknown, mode = 'public', trusted = true) {
    await writeFile(privatePacket, JSON.stringify(packet), { mode: 0o600 });
    const child = Bun.spawn([process.execPath, fixturePath, privatePacket, mode], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...(trusted ? { NODE_EXTRA_CA_CERTS: certificate } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  try {
    expect((await run(packet)).code).toBe(0);
    expect(observedSni).toBe('fixture.invalid');
    expect((await run(packet, 'public', false)).code).not.toBe(0);
    const wrongName = structuredClone(packet);
    wrongName.public.probes[0].address.host = 'wrong.invalid';
    expect((await run(wrongName)).code).not.toBe(0);
    const wrongIp = structuredClone(packet);
    wrongIp.public.probes[0].address.connectAddress = '127.0.0.2';
    expect((await run(wrongIp)).code).not.toBe(0);
    expect((await run(packet, 'registry')).code).toBe(0);
    expect(observedAuthorization).toBe(
      'Basic ' + Buffer.from('fixture:private-secret-marker').toString('base64'),
    );
    const admittedReads = registryReads;
    expect((await run(packet, 'registry-owner-mismatch')).code).not.toBe(0);
    expect(registryReads).toBe(admittedReads);
    await writeFile(
      credentialsPath,
      JSON.stringify({ username: 'fixture', password: 'substituted-private-marker' }),
    );
    const changedSource = await run(packet, 'registry');
    expect(changedSource.code).not.toBe(0);
    expect(changedSource.stderr).not.toContain('substituted-private-marker');
    await writeFile(
      credentialsPath,
      JSON.stringify({ username: 'fixture', password: 'private-secret-marker' }),
    );
    fault = 'challenge';
    const challenge = await run(packet, 'registry');
    expect(challenge.code).not.toBe(0);
    expect(challenge.stderr).not.toContain('private-secret-marker');
    fault = 'digest';
    expect((await run(packet, 'registry')).code).not.toBe(0);
    fault = 'body';
    expect((await run(packet, 'registry')).code).not.toBe(0);
    fault = '';
    const websocket = {
      ...packet,
      public: {
        ...packet.public,
        probes: [
          {
            kind: 'websocket',
            id: 'wss',
            routeId: 'c'.repeat(64),
            address: { host: 'fixture.invalid', connectAddress: '127.0.0.1', port: address.port },
            path: '/',
            origin: null,
            requestedProtocol: null,
            expectedProtocol: null,
          },
        ],
      },
    };
    expect((await run(websocket)).code).toBe(0);
    fault = 'accept';
    expect((await run(websocket)).code).not.toBe(0);
    fault = 'hold-upgrade';
    const started = performance.now();
    const held = await run(websocket, 'hold-upgrade');
    expect(held.code).toBe(0);
    expect(held.stdout).toBe('upgrade-deadline-refused-and-closed\n');
    expect(performance.now() - started).toBeLessThan(4000);
  } finally {
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => {
        if (cause) reject(cause);
        else resolve();
      }),
    );
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

test('recovery classifies all nine stable states and refuses unexplained lifecycle or target names', () => {
  for (const kind of ['registry', 'caddy'] as const) {
    const original = parseNativeContainer(syntheticContainer());
    original.name = `/wbs-${kind}-1`;
    const candidate = structuredClone(original);
    candidate.id = 'e'.repeat(64);
    candidate.name = `/wbs-init-fixture-${kind}`;
    const inert = (container: typeof candidate) => {
      container.state = {
        ...container.state,
        Running: false,
        Status: 'created',
        Pid: 0,
        StartedAt: '0001-01-01T00:00:00Z',
        FinishedAt: '0001-01-01T00:00:00Z',
      };
      return container;
    };
    inert(candidate);
    const intents = new Set<string>();
    const classify = (
      old = original,
      next: typeof candidate | undefined = candidate,
      recorded = true,
    ) => classifyRecoveryTarget(kind, 'fixture', old, next, intents, recorded);
    expect(classifyRecoveryTarget(kind, 'fixture', original, undefined, intents, false)).toBe(
      'before-create',
    );
    intents.add('create-intended');
    expect(classifyRecoveryTarget(kind, 'fixture', original, undefined, intents, false)).toBe(
      'create-unacknowledged-no-candidate-observed',
    );
    expect(classify()).toBe('candidate-inert');
    original.state = { ...original.state, Running: false, Status: 'exited', Pid: 0 };
    expect(() => classify()).toThrow('recovery-stop-without-intent');
    intents.add('stop-intended');
    expect(classify()).toBe('original-stopped');
    original.name = `/wbs-init-fixture-${kind}-original`;
    expect(() => classify()).toThrow('recovery-name-differs');
    intents.add('rename-original-intended');
    expect(classify()).toBe('original-renamed');
    candidate.name = `/wbs-${kind}-1`;
    intents.add('rename-candidate-intended');
    expect(classify()).toBe('candidate-renamed');
    candidate.state = {
      ...candidate.state,
      Running: true,
      Status: 'running',
      Pid: 456,
      StartedAt: '2026-01-01T00:00:00Z',
    };
    expect(() => classify()).toThrow('recovery-start-without-intent');
    intents.add('start-intended');
    expect(classify()).toBe('candidate-running-original-retained');
    candidate.state = { ...candidate.state, Running: false, Status: 'exited', Pid: 0 };
    expect(classify()).toBe('candidate-stopped-after-start');
    candidate.state = { ...candidate.state, Running: true, Status: 'running', Pid: 456 };
    expect(() =>
      classifyRecoveryTarget(kind, 'fixture', undefined, candidate, intents, true),
    ).toThrow('recovery-original-absence-unexplained');
    intents.add('remove-intended');
    expect(classifyRecoveryTarget(kind, 'fixture', undefined, candidate, intents, true)).toBe(
      'candidate-running-original-absent',
    );
    expect(() =>
      classifyRecoveryTarget(kind, 'fixture', undefined, undefined, intents, true),
    ).toThrow();
    for (const fault of [
      () => {
        candidate.name = `/wbs-${kind === 'registry' ? 'caddy' : 'registry'}-1`;
      },
      () => {
        candidate.name = `/wbs-${kind}-1`;
        candidate.state['Paused'] = true;
      },
      () => {
        candidate.state['Paused'] = false;
        candidate.restartCount = 1;
      },
      () => {
        candidate.restartCount = 0;
        candidate.state['Restarting'] = true;
      },
    ]) {
      fault();
      expect(() => classify()).toThrow();
    }
  }
});

test('private recovery reader accepts only legal v3 prefixes with immutable two-target evidence', async () => {
  const isolatedRoot = process.env['EDGE_INIT_RECOVERY_OWNER_ROOT'];
  if (isolatedRoot === undefined) {
    const root = await mkdtemp('/tmp/edge-init-recovery-chain-');
    try {
      const preload = fileURLToPath(
        new URL('../fixtures/edge-init-owner-preload.ts', import.meta.url),
      );
      for (const fault of ['', 'receipt-directory-owner-mismatch']) {
        const child = Bun.spawn(
          [
            process.execPath,
            '--preload=' + preload,
            'test',
            fileURLToPath(import.meta.url),
            '--test-name-pattern=^private recovery reader accepts only legal v3 prefixes with immutable two-target evidence$',
            '--timeout=20000',
          ],
          {
            env: {
              ...process.env,
              EDGE_INIT_RECOVERY_OWNER_ROOT: root,
              ...(fault === '' ? {} : { EDGE_INIT_RECOVERY_OWNER_FAULT: fault }),
            },
            stdout: 'pipe',
            stderr: 'pipe',
          },
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(code, stderr.slice(-1200)).toBe(0);
        expect(stdout + stderr).toContain('1 pass');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    return;
  }
  const root = isolatedRoot;
  const source = join(root, 'compose.yml'),
    directory = join(root, 'receipts');
  await writeFile(source, 'services:\n  registry:\n    init: true\n  caddy:\n    init: true\n', {
    mode: 0o600,
  });
  await chmod(root, 0o700);
  const native = await lstat(source, { bigint: true });
  const { packet } = packetFixture();
  packet.receiptDirectory = directory;
  packet.provenance = [
    {
      path: source,
      sha256: digest(await readFile(source, 'utf8')),
      device: String(native.dev),
      inode: String(native.ino),
      mode: 0o600,
      uid: 1000,
    },
  ];
  packet.targets.forEach((target) => {
    target.composeFiles = [source];
  });
  const checked = decodeInitPacket(packet),
    packetSha256 = digest(JSON.stringify(packet));
  const invariants = checked.targets.map((target) => ({
    target: target.kind,
    original: target.id,
    originalInvariantSha256: 'a'.repeat(64),
    candidateInvariantSha256: 'b'.repeat(64),
    originalProcess: {
      pid: target.kind === 'registry' ? 123 : 124,
      startTime: target.process.startTime,
      cgroup: target.process.cgroup,
      cgroupDevice: '1',
      cgroupInode: '2',
    },
  }));
  const proofs = await observeComposeDeclarations(
    checked.targets.map((target) => {
      const original = parseNativeContainer(syntheticContainer());
      original.config['Labels'] = { 'com.docker.compose.project.config_files': source };
      return { kind: target.kind, original, nativeSha256: fingerprint(original), roster: [source] };
    }),
    checked.provenance,
  );
  const stages = [
    ...(['registry', 'caddy'] as const).flatMap((target) =>
      [
        'create-intended',
        'created',
        'candidate-verified',
        'stop-intended',
        'original-stopped',
        'rename-original-intended',
        'rename-candidate-intended',
        'start-intended',
        'healthy',
      ].map((stage) => ({ target, stage })),
    ),
    { target: 'caddy' as const, stage: 'retention-point' },
    { target: 'registry' as const, stage: 'remove-intended' },
    { target: 'registry' as const, stage: 'original-absent' },
    { target: 'caddy' as const, stage: 'remove-intended' },
    { target: 'caddy' as const, stage: 'original-absent' },
    { target: 'caddy' as const, stage: 'complete' },
  ];
  type Entry = Record<string, unknown>;
  async function writeChain(entries: readonly Entry[]) {
    await rm(directory, { recursive: true, force: true });
    const writer = await PrivateReceipts.create(directory, checked.nonce);
    for (const entry of entries) await writer.publish(entry as never);
  }
  const candidates = new Map<string, string>(),
    witnesses = new Map<string, string>(),
    chain: Entry[] = [];
  try {
    for (const { target, stage } of stages) {
      if (stage === 'created')
        candidates.set(target, (target === 'registry' ? '1' : '2').repeat(64));
      if (stage === 'healthy')
        witnesses.set(target, (target === 'registry' ? '3' : '4').repeat(64));
      const proof = proofs.find((entry) => entry.target === target);
      if (proof === undefined) throw new Error('missing fixture proof');
      chain.push({
        format: 'edge-init-receipt',
        version: 3,
        invariantProfile: CREATED_PROFILE,
        packetSha256,
        ...proof,
        stage,
        original: checked.targets[target === 'registry' ? 0 : 1].id,
        remaining: 100000,
        ...(candidates.has(target) ? { candidate: candidates.get(target) } : {}),
        invariants,
        candidateProcesses: (['registry', 'caddy'] as const).map((kind) => ({
          target: kind,
          candidate: candidates.get(kind) ?? null,
          processSha256: witnesses.get(kind) ?? null,
        })),
      });
      await writeChain(chain);
      if (process.env['EDGE_INIT_RECOVERY_OWNER_FAULT'] === 'receipt-directory-owner-mismatch') {
        process.env['EDGE_INIT_RECOVERY_OWNER_READ'] = '1';
        await rejects(readRecoveryHistory(checked, packetSha256), {
          reason: 'recovery-directory-invalid',
        });
        return;
      }
      const history = await readRecoveryHistory(checked, packetSha256);
      expect(history.invariants).toEqual(invariants);
    }
    for (const [position, target, stage] of [
      [0, 'registry', 'before-create'],
      [1, 'registry', 'before-create'],
      [1, 'registry', 'candidate-inert'],
      [2, 'registry', 'candidate-inert'],
      [3, 'registry', 'stop-uncertain'],
      [4, 'registry', 'stop-uncertain'],
      [5, 'registry', 'original-stopped'],
      [5, 'registry', 'rename-uncertain'],
      [6, 'registry', 'rename-uncertain'],
      [7, 'registry', 'rename-uncertain'],
      [7, 'registry', 'start-uncertain'],
      [8, 'registry', 'candidate-running-unhealthy'],
      [9, 'caddy', 'before-create'],
      [8, 'registry', 'healthy-original-retained'],
      [17, 'caddy', 'healthy-original-retained'],
      [18, 'caddy', 'healthy-original-retained'],
      [19, 'registry', 'healthy-original-retained'],
      [19, 'registry', 'removal-uncertain'],
      [20, 'registry', 'removal-uncertain'],
      [21, 'caddy', 'removal-uncertain'],
      [22, 'caddy', 'removal-uncertain'],
      [23, 'caddy', 'removal-uncertain'],
    ] as const) {
      const referenceIndex =
        stage === 'candidate-inert' && position === 1
          ? 1
          : stage === 'healthy-original-retained' && (position === 8 || position === 17)
            ? position
            : position === 0
              ? 0
              : position === 9
                ? 9
                : position === 19
                  ? 19
                  : position === 21
                    ? 21
                    : position - 1;
      const failure = { ...structuredClone(chain[referenceIndex]), target, stage };
      await writeChain([...chain.slice(0, position), failure]);
      expect((await readRecoveryHistory(checked, packetSha256)).invariants).toEqual(invariants);
    }
    for (const fault of [
      (entries: Entry[]) => {
        delete entries[0]['invariantProfile'];
      },
      (entries: Entry[]) => {
        entries[0]['invariantProfile'] = 'unknown';
      },
      (entries: Entry[]) => {
        entries[1]['invariantProfile'] = 'unknown';
      },
      (entries: Entry[]) => {
        delete entries[0]['version'];
      },
      (entries: Entry[]) => {
        entries[0]['version'] = 1;
      },
      (entries: Entry[]) => {
        entries[1]['invariants'] = structuredClone(entries[1]['invariants']);
        (entries[1]['invariants'] as typeof invariants)[0].originalInvariantSha256 = '9'.repeat(64);
      },
      (entries: Entry[]) => {
        entries[0]['packetSha256'] = '0'.repeat(64);
      },
      (entries: Entry[]) => {
        delete entries[0]['sourceRosterSha256'];
      },
      (entries: Entry[]) => {
        delete entries[0]['literalInitSha256'];
      },
      (entries: Entry[]) => {
        delete entries[0]['invariants'];
      },
      (entries: Entry[]) => {
        (entries[0]['invariants'] as typeof invariants)[0].originalProcess.startTime = '999';
      },
      (entries: Entry[]) => {
        entries[1]['candidate'] = checked.targets[0].id;
      },
      (entries: Entry[]) => {
        entries[2]['candidate'] = '5'.repeat(64);
      },
      (entries: Entry[]) => {
        for (const entry of entries.slice(2)) {
          if (entry['target'] === 'registry') entry['candidate'] = '5'.repeat(64);
          (entry['candidateProcesses'] as { candidate: string | null }[])[0].candidate = '5'.repeat(
            64,
          );
        }
      },
      (entries: Entry[]) => {
        [entries[1], entries[2]] = [entries[2], entries[1]];
      },
      (entries: Entry[]) => {
        entries[0]['stage'] = 'remove-intended';
      },
      (entries: Entry[]) => {
        entries[0]['target'] = 'caddy';
      },
      (entries: Entry[]) => {
        entries.push(structuredClone(entries[0]));
      },
      (entries: Entry[]) => {
        (entries[18]['candidateProcesses'] as { processSha256: string | null }[])[0].processSha256 =
          null;
      },
      (entries: Entry[]) => {
        (entries[18]['candidateProcesses'] as { processSha256: string | null }[])[0].processSha256 =
          '9'.repeat(64);
      },
    ]) {
      const broken = structuredClone(chain);
      fault(broken);
      await writeChain(broken);
      await rejects(readRecoveryHistory(checked, packetSha256));
    }
    await writeChain(chain);
    await rejects(
      readRecoveryHistory(checked, digest('changed host/image/backend/probe/bundle packet')),
    );
  } finally {
    if (process.env['EDGE_INIT_RECOVERY_OWNER_FAULT'] === 'receipt-directory-owner-mismatch')
      await rm(root, { recursive: true, force: true });
  }
});

test('recovery shares the admitted profile hash for inert and running candidates including legal original absence', () => {
  for (const kind of ['registry', 'caddy'] as const) {
    const raw = syntheticContainer();
    raw.Name = `/wbs-${kind}-1`;
    Object.assign(raw.HostConfig, { OomKillDisable: null });
    const original = parseNativeContainer(raw);
    const expected = fingerprint(candidateInvariant(original));
    const candidate = structuredClone(original);
    candidate.id = 'e'.repeat(64);
    candidate.name = `/wbs-init-fixture-${kind}`;
    candidate.config = { ...candidate.config, Image: candidate.image };
    candidate.host = { ...candidate.host, Init: true, OomKillDisable: false };
    candidate.state = {
      ...candidate.state,
      Status: 'created',
      Running: false,
      Pid: 0,
      StartedAt: '0001-01-01T00:00:00Z',
    };
    const intents = new Set(['create-intended']);
    expect(classifyRecoveryTarget(kind, 'fixture', original, candidate, intents, true)).toBe(
      'candidate-inert',
    );
    expect(
      fingerprint(
        projectInvariant(candidate, {
          profile: CREATED_PROFILE,
          owner: {
            role: 'replacement',
            id: candidate.id,
            originalId: original.id,
            phase: candidate.state['Status'] === 'created' ? 'never-started' : 'running',
          },
          networks: [{ name: 'edge', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
        }),
      ),
    ).toBe(expected);
    candidate.name = `/wbs-${kind}-1`;
    candidate.state = { ...original.state };
    candidate.host = { ...candidate.host, OomKillDisable: null };
    intents.add('remove-intended');
    expect(classifyRecoveryTarget(kind, 'fixture', undefined, candidate, intents, true)).toBe(
      'candidate-running-original-absent',
    );
    expect(
      fingerprint(
        projectInvariant(candidate, {
          profile: CREATED_PROFILE,
          owner: {
            role: 'replacement',
            id: candidate.id,
            originalId: original.id,
            phase: 'running',
          },
          networks: [{ name: 'edge', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
        }),
      ),
    ).toBe(expected);
    candidate.host = { ...candidate.host, Init: false };
    expect(
      fingerprint(
        projectInvariant(candidate, {
          profile: CREATED_PROFILE,
          owner: {
            role: 'replacement',
            id: candidate.id,
            originalId: original.id,
            phase: 'running',
          },
          networks: [{ name: 'edge', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
        }),
      ),
    ).not.toBe(expected);
    candidate.host = { ...candidate.host, Init: true };
    candidate.config = { ...candidate.config, Image: 'wrong:spelling' };
    expect(
      fingerprint(
        projectInvariant(candidate, {
          profile: CREATED_PROFILE,
          owner: {
            role: 'replacement',
            id: candidate.id,
            originalId: original.id,
            phase: 'running',
          },
          networks: [{ name: 'edge', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
        }),
      ),
    ).not.toBe(expected);
  }
});

test('raw recovery stability accepts unrelated created blank endpoints without granting immutable admission', () => {
  const raw = syntheticContainer();
  raw.Id = 'f'.repeat(64);
  raw.Name = '/unrelated';
  raw.NetworkSettings.Networks.edge.NetworkID = '';
  Object.assign(raw.State, {
    Status: 'created',
    Running: false,
    Pid: 0,
    StartedAt: '0001-01-01T00:00:00Z',
  });
  const observed = parseNativeContainer(raw);
  const before = recoverySnapshot([observed]);
  expect(before).toMatch(/^[a-f0-9]{64}$/);
  expect(() => projectInvariant(observed)).toThrow();
  observed.networks['edge'] = { ...raw.NetworkSettings.Networks.edge, Aliases: ['changed'] };
  expect(recoverySnapshot([observed])).not.toBe(before);
});

for (const [wall, monotonic] of [
  [Number.NaN, 123],
  [Number.POSITIVE_INFINITY, 123],
  [0, Number.NaN],
  [0, Number.POSITIVE_INFINITY],
  [0, Number.NEGATIVE_INFINITY],
])
  test(`operation expiry refuses nonfinite clock ${String(wall)} ${String(monotonic)}`, () => {
    expect(() =>
      operationExpiry(
        new Date(-1000).toISOString(),
        new Date(600000).toISOString(),
        wall,
        monotonic,
      ),
    ).toThrow();
  });
