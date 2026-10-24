import { readFile } from 'node:fs/promises';
import { ClientRequest } from 'node:http';
import { TLSSocket } from 'node:tls';

import { fingerprint } from '../src/lib/edge-init';
import {
  decodeInitPacket,
  probeHttp,
  probeRegistry,
  probeWebSocket,
} from '../src/lib/edge-init-observer';
import { Deadline } from '../src/lib/edge-init-operation';

export function packetFixture() {
  const sha256 = 'a'.repeat(64),
    sourceSha = 'b'.repeat(40);
  const pin = (path: string) => ({ path, sha256, device: '1', inode: '2', mode: 0o600, uid: 1000 });
  const address = { host: 'fixture.invalid', connectAddress: '127.0.0.1', port: 443 };
  const routeId = 'c'.repeat(64);
  const route = {
    match: [{ host: ['fixture.invalid'] }],
    handle: [{ handler: 'static_response', body: 'fixed' }],
  };
  const configuration = {
    apps: { http: { servers: { edge: { listen: [':443'], routes: [route] } } } },
  };
  const inventory = [
    {
      routeId,
      server: 'edge',
      routePointer: '/apps/http/servers/edge/routes/0',
      routeSha256: fingerprint(route),
      hosts: ['fixture.invalid'],
      probeIds: ['https'],
    },
  ];
  const target = (kind: 'registry' | 'caddy', id: string) => ({
    kind,
    id,
    image: 'sha256:' + sha256,
    nativeSha256: sha256,
    imageSha256: sha256,
    envSha256: sha256,
    composeFiles: ['/home/puni1/wbs/compose.yml'],
    process: {
      startTime: '123',
      cgroup: '/system.slice/docker-' + id + '.scope',
      executableSha256: sha256,
      netNamespace: 'net:[123]',
      pidNamespace: 'pid:[124]',
    },
    defaultRouteNetwork: sha256,
    resources: [
      {
        kind: 'volume',
        name: 'fixture',
        path: '/var/lib/docker/volumes/fixture/_data',
        type: 'directory',
        device: '1',
        inode: '2',
        mode: 0o700,
        uid: 0,
        parentsSha256: sha256,
        volumeSha256: sha256,
      },
    ],
    networks: [{ id: sha256, name: 'fixture', sha256 }],
    listenerPorts: [5000],
  });
  const bootId = '12345678-1234-1234-1234-123456789abc';
  const now = Date.now();
  const packet = {
    version: 1,
    nonce: 'fixture',
    receiptDirectory: '/tmp/private-fixture/receipts',
    sourceSha,
    source: pin('/home/puni1/wbs/bin/source.sha'),
    bundle: pin(process.argv[1] ?? '/fixture/bundle'),
    bun: pin(process.execPath),
    init: pin('/usr/libexec/docker/docker-init'),
    daemon: pin('/usr/bin/dockerd'),
    daemonVersionSha256: sha256,
    daemonInfoSha256: sha256,
    daemonPid: 123,
    daemonStartTime: '456',
    machineIdSha256: sha256,
    bootId,
    targets: [target('registry', 'd'.repeat(64)), target('caddy', 'e'.repeat(64))],
    provenance: [pin('/home/puni1/wbs/compose.yml')],
    public: {
      routesSha256: fingerprint({ servers: configuration.apps.http.servers, inventory }),
      probes: [
        {
          kind: 'http',
          id: 'https',
          routeId,
          scheme: 'https',
          address,
          path: '/',
          expectedStatus: 200,
          expectedLocation: null,
          expectedContentType: null,
          expectedBodySha256: sha256,
        },
      ],
    },
    registry: {
      address,
      credentials: pin('/home/puni1/wbs/credentials.json'),
      repository: 'fixture/service',
      manifestDigest: 'sha256:' + sha256,
      manifestMediaType: 'application/vnd.oci.image.manifest.v1+json',
      v2BodySha256: sha256,
    },
    caddy: {
      root: '/home/puni1/wbs/caddy/Caddyfile',
      directoryDevice: '1',
      directoryInode: '2',
      files: [pin('/home/puni1/wbs/caddy/Caddyfile')],
      directoryEntriesSha256: sha256,
      importGraphSha256: sha256,
      configurationSha256: fingerprint(configuration),
      routeInventory: inventory,
    },
    quiescence: {
      operation: pin('/home/puni1/wbs/operation.json'),
      operationId: 'fixture',
      issuedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 600000).toISOString(),
      hostMachineIdSha256: sha256,
      bootId,
      locks: [
        '/home/puni1/wbs/state/edge.lock',
        '/home/puni1/wbs-dev/state/poll.lock',
        '/home/puni1/wbs-dev/state/devsync.lock',
        '/home/puni1/wbs/state/deploy.lock',
        '/home/puni1/wbs-dev/state/deploy.lock',
      ].map((path, index) => ({
        path,
        descriptor: index + 3,
        device: '1',
        inode: String(index + 2),
      })),
      writerManifest: pin('/home/puni1/wbs/writers.json'),
      authorityPins: {
        format: 'installed-dependency-authority-pins',
        version: 1,
        sourceSha,
        writerManifestSha256: sha256,
        hostMachineIdSha256: sha256,
        launchConfigurationSha256: sha256,
        solver: {
          version: 1,
          sourceSha,
          bunSha256: sha256,
          bundleSha256: sha256,
          configSha256: sha256,
          unitSha256: sha256,
        },
      },
      databases: [
        {
          environment: 'prod',
          host: '/home/puni1/wbs/data/store.sqlite',
          directoryIdentity: '1:2',
          fileIdentity: '1:3',
        },
        {
          environment: 'dev',
          host: '/home/puni1/wbs-dev/data/store.sqlite',
          directoryIdentity: '1:4',
          fileIdentity: '1:5',
        },
      ],
      suspendedCrontabSha256: sha256,
      stoppedUnitSha256: sha256,
      originalSolverCgroup: {
        state: 'empty',
        path: '/user.slice/fixture',
        device: '1',
        inode: '2',
      },
      drainedProcesses: [],
    },
    backends: [{ id: 'f'.repeat(64), image: 'sha256:' + sha256, nativeSha256: sha256 }],
  };
  return { packet, configuration };
}

if (import.meta.main) {
  const packetPath = process.argv.at(2),
    mode = process.argv[3];
  if (packetPath === undefined) throw new Error('missing fixture packet');
  const packet = decodeInitPacket(JSON.parse(await readFile(packetPath, 'utf8')));
  let upgradeObservation: { socket: TLSSocket; closed: Promise<void> } | undefined;
  if (mode === 'hold-upgrade') {
    ClientRequest.prototype.destroy = function () {
      return this;
    };
    TLSSocket.prototype.end = function () {
      upgradeObservation = {
        socket: this,
        closed: new Promise<void>((resolve) => {
          this.once('close', () => {
            resolve();
          });
        }),
      };
      return this;
    };
    TLSSocket.prototype.destroySoon = function () {
      return this;
    };
  }
  if (mode === 'registry') await probeRegistry(packet.registry, new Deadline(120000));
  else {
    const probe = packet.public.probes[0];
    if (probe.kind === 'http') await probeHttp(probe, 2000);
    else if (mode === 'hold-upgrade') {
      let refused = false;
      try {
        await probeWebSocket(probe, 2000);
      } catch {
        refused = true;
      }
      if (!refused || !upgradeObservation?.socket.destroyed)
        throw new Error('owned upgraded socket did not settle');
      await upgradeObservation.closed;
      console.log('upgrade-deadline-refused-and-closed');
    } else await probeWebSocket(probe, 2000);
  }
}
