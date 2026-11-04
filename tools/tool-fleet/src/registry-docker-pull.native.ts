import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

import { type } from 'arktype';

import { awaitMaintenanceChild } from './registry-maintenance-process';
import { readRegistryBytes } from './registry-stream';

const tools = '/opt/task8-docker';
const env = {
  PATH: tools + ':/usr/bin:/bin',
  LANG: 'C',
  HOME: '/root/task8-fixture',
  DOCKER_CONFIG: '/root/task8-fixture/docker-client',
};
const digest = /^sha256:[a-f0-9]{64}$/;
const Descriptor = type({ digest, size: 'number.safe >= 0', mediaType: 'string > 0' });

/**
 * Two fresh private engines pull both index platforms after GC. Each starts with
 * an independently empty bounded root and a fresh read-only cgroup view; no host
 * socket, image, cgroup writes or container execution is used. Explicit containerd and dockerd groups remain owned until
 * terminal reaping; namespace PID1/outer deadlines provide final containment. Required terminal, stream and reporting failures survive in phase order with the original operation cause; diagnostics cannot bypass owned-child cleanup.
 */
export async function proveRegistryDockerPull(
  root: string,
  knownBlobs: readonly string[],
): Promise<void> {
  if (
    process.getuid?.() !== 0 ||
    process.pid !== 1 ||
    !digest.test(root) ||
    (await readFile('/etc/task8-namespace', 'utf8')) !== 'owned-private-proof\n'
  )
    throw new Error('Docker proof requires exact owned root namespace');
  const base = '/var/lib/puni-registry/recovery/registry/contents';
  if ((await readdir(base)).length !== 0)
    throw new Error('Docker proof storage is not initially empty');
  const index = type({
    schemaVersion: '2',
    manifests: Descriptor.and({ platform: { architecture: "'amd64'|'arm64'", os: "'linux'" } })
      .array()
      .exactlyLength(2),
  }).assert(await readJson('manifests', root));
  await mkdir(env.DOCKER_CONFIG, { mode: 0o700 });
  for (const architecture of ['amd64', 'arm64'] as const) {
    let stage: 'configuration' | 'engine' | 'empty' | 'pull' | 'image' | 'files' | 'stop' =
      'configuration';
    const selected = index.manifests.filter(
      (manifest) => manifest.platform.architecture === architecture,
    );
    const child = selected.at(0);
    if (selected.length !== 1 || child === undefined)
      throw new Error('Index platform selection is ambiguous');
    const manifest = type({
      schemaVersion: '2',
      config: Descriptor,
      layers: Descriptor.array().exactlyLength(2),
    }).assert(await readJson('manifests', child.digest));
    const config = type({
      architecture: "'amd64'|'arm64'",
      os: "'linux'",
      rootfs: { type: "'layers'", diff_ids: type(digest).array().exactlyLength(2) },
    }).assert(await readJson('blobs', manifest.config.digest));
    if (
      config.architecture !== architecture ||
      !knownBlobs.includes(manifest.config.digest) ||
      JSON.stringify(config.rootfs.diff_ids) !==
        JSON.stringify(manifest.layers.map((layer) => layer.digest))
    )
      throw new Error('Expected platform config differs from published closure');
    const directory = base + '/docker-' + architecture;
    await mkdir(directory, { mode: 0o700 });
    if ((await readdir(directory)).length !== 0)
      throw new Error('Selected Docker root is not empty');
    const socket = directory + '/docker.sock';
    const containerSocket = directory + '/containerd.sock';
    const containerConfig = directory + '/containerd.toml';
    await writeFile(
      containerConfig,
      `version = 2\nroot = "${directory}/containerd"\nstate = "${directory}/containerd-state"\ndisabled_plugins = ["io.containerd.grpc.v1.cri", "io.containerd.cri.v1.images", "io.containerd.cri.v1.runtime", "io.containerd.monitor.v1.cgroups"]\n[grpc]\naddress = "${containerSocket}"\n[debug]\nlevel = "error"\n`,
      { mode: 0o600, flag: 'wx' },
    );
    const daemonConfig = directory + '/daemon.json';
    await writeFile(
      daemonConfig,
      JSON.stringify({
        hosts: ['unix://' + socket],
        group: 'root',
        'data-root': directory + '/docker',
        'exec-root': directory + '/exec',
        pidfile: directory + '/docker.pid',
        containerd: containerSocket,
        'containerd-namespace': 'task8-' + architecture,
        'containerd-plugins-namespace': 'task8-plugins-' + architecture,
        'storage-driver': 'vfs',
        features: { 'containerd-snapshotter': false },
        bridge: 'none',
        iptables: false,
        ip6tables: false,
        'ip-forward': false,
        'ip-masq': false,
        'userland-proxy': false,
        'insecure-registries': ['127.0.0.1:5052'],
        'log-level': 'error',
      }),
      { mode: 0o600, flag: 'wx' },
    );
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, 60000);
    const children: ReturnType<typeof launch>[] = [];
    const failures: unknown[] = [];
    const capture = (stream: ReadableStream<Uint8Array>, label: string) =>
      readRegistryBytes(stream, 65536, label).then(
        (bytes) => ({ ok: true as const, bytes }),
        (cause: unknown) => {
          controller.abort();
          return { ok: false as const, cause };
        },
      );
    // Only fixed owned daemons/CLI with empty private config, synthetic content, no auth and an allowlisted environment reach this bounded diagnostic receipt. No host service output is read.
    const diagnostics = (
      kind: 'containerd' | 'dockerd' | 'docker',
      code: number | null,
      captured: Awaited<ReturnType<typeof capture>>,
    ) => {
      console.log(
        JSON.stringify({
          ownedDockerDiagnostic: {
            architecture,
            stage,
            kind,
            exitCode: code,
            captured: captured.ok,
            stderr: captured.ok ? new TextDecoder().decode(captured.bytes) : null,
          },
        }),
      );
    };
    const launch = (executable: 'containerd' | 'dockerd', configuration: string) => {
      const process = Bun.spawn(
        [
          tools + '/' + executable,
          '--config' + (executable === 'dockerd' ? '-file' : ''),
          configuration,
        ],
        { env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached: true },
      );
      const stdout = capture(process.stdout, 'Owned engine output');
      const stderr = capture(process.stderr, 'Owned engine diagnostics');
      const terminal = awaitMaintenanceChild(process, controller.signal).then(
        () => ({ ok: true as const }),
        (cause: unknown) => ({ ok: false as const, cause }),
      );
      return { executable, process, stdout, stderr, terminal };
    };
    const command = async (arguments_: string[]) => {
      const process = Bun.spawn([tools + '/docker', '--host', 'unix://' + socket, ...arguments_], {
        env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
      });
      const output = capture(process.stdout, 'Owned Docker response');
      const errors = capture(process.stderr, 'Owned Docker diagnostics');
      const terminal = awaitMaintenanceChild(process, controller.signal).then(
        () => ({ ok: true as const }),
        (cause: unknown) => ({ ok: false as const, cause }),
      );
      const [settled, captured, stderr] = await Promise.all([terminal, output, errors]);
      if (!settled.ok || !captured.ok || !stderr.ok) {
        diagnostics('docker', process.exitCode, stderr);
        if (!settled.ok) throw settled.cause;
        if (!captured.ok) throw captured.cause;
        if (!stderr.ok) throw stderr.cause;
      }
      return new TextDecoder().decode(captured.bytes);
    };
    try {
      stage = 'engine';
      children.push(launch('containerd', containerConfig));
      children.push(launch('dockerd', daemonConfig));
      const deadline = Date.now() + 15000;
      for (;;) {
        controller.signal.throwIfAborted();
        if (children.some((child) => child.process.exitCode !== null))
          throw new Error('Owned engine exited before readiness');
        try {
          const response = await fetch('http://localhost/_ping', {
            unix: socket,
            signal: AbortSignal.timeout(500),
          });
          if (response.status !== 200 || (await response.text()) !== 'OK')
            throw new Error('Owned engine ping differs');
          break;
        } catch (cause) {
          if (!(
            cause instanceof Error &&
            'code' in cause &&
            ['ENOENT', 'ECONNREFUSED'].includes(String(cause.code))
          ))
            throw cause;
        }
        if (Date.now() >= deadline) throw new Error('Owned engine readiness deadline');
        await Bun.sleep(50);
      }
      stage = 'empty';
      const initial = type({
        Driver: "'vfs'",
        Images: '0',
        Containers: '0',
        DockerRootDir: 'string',
      }).assert(JSON.parse(await command(['info', '--format', '{{json .}}'])));
      if (initial.DockerRootDir !== directory + '/docker')
        throw new Error('Docker selected another root');
      stage = 'pull';
      const reference = '127.0.0.1:5052/retained/index@' + root;
      await command(['pull', '--platform', 'linux/' + architecture, reference]);
      stage = 'image';
      const images = type({
        Id: digest,
        Architecture: "'amd64'|'arm64'",
        Os: "'linux'",
        RootFS: { Type: "'layers'", Layers: type(digest).array().exactlyLength(2) },
        RepoDigests: 'string[]',
      })
        .array()
        .exactlyLength(1)
        .assert(JSON.parse(await command(['image', 'inspect', reference])));
      const image = images.at(0);
      const hasImage = image !== undefined;
      if (
        !hasImage ||
        image.Id !== manifest.config.digest ||
        image.Architecture !== architecture ||
        JSON.stringify(image.RootFS.Layers) !== JSON.stringify(config.rootfs.diff_ids) ||
        !image.RepoDigests.includes(reference)
      )
        throw new Error('Uncached Docker image differs from selected platform');
      stage = 'files';
      const layerRoot = directory + '/docker/vfs/dir';
      const layers = await readdir(layerRoot);
      if (layers.length !== 2) throw new Error('Unpacked VFS layer count differs');
      let releases = 0;
      for (const layer of layers) {
        const path = layerRoot + '/' + layer;
        const metadata = await lstat(path);
        if (
          !metadata.isDirectory() ||
          metadata.uid !== 0 ||
          metadata.dev !== (await lstat(base)).dev
        )
          throw new Error('Unpacked layer escaped owned filesystem');
        const names = (await readdir(path)).sort();
        if (
          JSON.stringify(names) !== JSON.stringify(['shared.txt']) &&
          JSON.stringify(names) !== JSON.stringify(['release.txt', 'shared.txt'])
        )
          throw new Error('Unexpected unpacked layer files');
        if ((await readFile(path + '/shared.txt', 'utf8')) !== 'retained shared layer\n')
          throw new Error('Unpacked shared content differs');
        if (names.includes('release.txt')) {
          if ((await readFile(path + '/release.txt', 'utf8')) !== 'release 4\n')
            throw new Error('Unpacked release content differs');
          releases++;
        }
      }
      if (releases !== 1) throw new Error('Unpacked release layer is missing');
      console.log(
        JSON.stringify({
          dockerPlatform: architecture,
          initiallyEmpty: true,
          selectedConfigVerified: true,
          unpackedLayers: 2,
          filesVerified: true,
        }),
      );
      stage = 'stop';
    } catch (cause) {
      // Proof: dropping this cause loses exact Error/AggregateError/nullish/string rejections in registry-docker-completion.test.ts.
      failures.push(cause);
      try {
        console.log(
          JSON.stringify({
            dockerFailure: { architecture, stage, deadline: controller.signal.aborted },
          }),
        );
      } catch (reporting) {
        // Proof: dropping this report failure masks it in operation-report and the three-report case.
        failures.push(reporting);
      }
    }
    // Stop both exact owned daemons even if either terminal outcome is a refusal.
    const signalFailures: unknown[] = [];
    for (const child of children.slice().reverse()) {
      try {
        if (child.process.exitCode === null) child.process.kill('SIGTERM');
      } catch (cause) {
        signalFailures.push(cause);
      }
    }
    // Proof: removing this fallback leaves the stubborn substitute until its10s watchdog, beyond the8.5s caller contract.
    const escalation = setTimeout(() => {
      controller.abort();
    }, 5000);
    try {
      // Proof: skipping these observations returns while the250ms owned substitute groups are still alive; the test records absence before its separate rescue.
      const outcomes = await Promise.allSettled(
        children.map(async (child) => {
          const [terminal, stdout, stderr] = await Promise.all([
            child.terminal,
            child.stdout,
            child.stderr,
          ]);
          const observed: unknown[] = [];
          // Proof: separate terminal/stdout/stderr omissions lose the exit/stdout/stderr witnesses; both stream failures survive cancellation together.
          if (!terminal.ok) observed.push(terminal.cause);
          if (!stdout.ok) observed.push(stdout.cause);
          if (!stderr.ok) observed.push(stderr.cause);
          if (failures.length > 0 || observed.length > 0) {
            try {
              diagnostics(child.executable, child.process.exitCode, stderr);
            } catch (reporting) {
              // Proof: dropping diagnostics or allowing its throw to replace terminal failure loses exit+diagnostics-report members.
              observed.push(reporting);
            }
          }
          return observed;
        }),
      );
      const cleaning = [
        ...signalFailures,
        ...outcomes.flatMap((outcome): unknown[] =>
          outcome.status === 'rejected' ? [outcome.reason] : outcome.value,
        ),
      ];
      // Proof: skipping cleanup-result collection loses signal and native terminal/stream failures.
      failures.push(...cleaning);
      try {
        console.log(
          JSON.stringify({
            dockerCleanup: {
              architecture,
              terminal: cleaning.length === 0,
              failures: cleaning.length,
            },
          }),
        );
      } catch (reporting) {
        // Proof: dropping summary failure loses the ordered signal+summary-report witness.
        failures.push(reporting);
      }
    } finally {
      clearTimeout(escalation);
      clearTimeout(timer);
    }
    // Proof: omitted/reordered aggregation or an absent original cause fails the compound cases; the modeled two-platform positive still completes.
    if (failures.length > 1)
      throw new AggregateError(failures, 'Owned engine completion failed', {
        cause: failures[0],
      });
    // Proof: removing sole-failure refusal certifies the error/nullish/string operation as successful.
    if (failures.length === 1) throw failures[0];
  }
}

async function readJson(kind: 'manifests' | 'blobs', digest: string): Promise<unknown> {
  const response = await fetch('http://127.0.0.1:5052/v2/retained/index/' + kind + '/' + digest, {
    headers: {
      accept: 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json',
      'cache-control': 'no-cache',
    },
    signal: AbortSignal.timeout(5000),
  });
  const bytes = await readRegistryBytes(response.body, 65536, 'Owned Docker expected content');
  if (
    response.status !== 200 ||
    'sha256:' + createHash('sha256').update(bytes).digest('hex') !== digest
  )
    throw new Error('Expected Docker content is absent or corrupt');
  return JSON.parse(new TextDecoder().decode(bytes));
}
