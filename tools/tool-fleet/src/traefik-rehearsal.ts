/**
 * Rehearses the platform Traefik edge on a disposable k3d cluster pinned to the locked k3s image:
 * the vendored chart rendered with the committed values from `infra/platform/networking/
 * traefik.yaml`, on the host network, as the chart's non-root UID 65532.
 *
 * It proves, in order:
 * 1. with the node's `net.ipv4.ip_unprivileged_port_start` at the kernel default 1024, Traefik
 *    cannot bind :80 and logs `permission denied` (what an ingress host without the base role's
 *    sysctl would see);
 * 2. with the floor at 0, as the base role sets it on ingress hosts, the DaemonSet becomes Ready;
 * 3. HTTP on :80 redirects permanently to the same URL on `https://` (Traefik answers 301 to GET
 *    and 308 to every other method, where the Compose edge's Caddy answers 308 to both), and
 *    HTTPS on :443 answers.
 *
 * The node is a container, so the floor is set in its network namespace, which a host-network
 * pod shares; the QEMU platform lab is what proves the Ansible role on a real kernel.
 *
 * Owns only the cluster `puni-traefik-edge`; `--keep` leaves it for inspection.
 * `--import-images` pulls the locked Traefik image and the node's pause image with the host's
 * Docker and imports them into the node, for hosts whose containers have no route out.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parse } from 'yaml';

import { type CommandOutcome } from './check';
import { runChecked } from './check-cli';
import { installLockedTool, toolCacheDirectory } from './check-provision';
import { readToolchain } from './contracts';

const ROOT = resolve(import.meta.dir, '../../..');
const CLUSTER = 'puni-traefik-edge';
const NODE = `k3d-${CLUSTER}-server-0`;
const PORT_FLOOR = 'net.ipv4.ip_unprivileged_port_start';

function log(line: string): void {
  console.log(`[traefik-rehearsal ${new Date().toISOString().slice(11, 19)}] ${line}`);
}

async function must(argv: readonly string[], timeoutMs = 300_000): Promise<CommandOutcome> {
  const outcome = await runChecked(argv, { timeoutMs });
  if (outcome.exitCode !== 0) {
    throw new Error(
      `${argv.join(' ')} exited ${String(outcome.exitCode)}: ${outcome.stderr.trim()}`,
    );
  }
  return outcome;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Sets the unprivileged port floor inside the node container's network namespace. */
async function setPortFloor(probeImage: string, value: 0 | 1024): Promise<void> {
  await must([
    'docker',
    'run',
    '--rm',
    '--privileged',
    '--network',
    `container:${NODE}`,
    probeImage,
    'sysctl',
    '-w',
    `${PORT_FLOOR}=${String(value)}`,
  ]);
}

/**
 * Imports `references` from the host's Docker into the node's containerd, under the exact
 * reference the kubelet will ask for, so no pull leaves the node.
 */
async function importImages(references: readonly string[]): Promise<void> {
  for (const reference of references) {
    await must(['docker', 'pull', '--quiet', reference], 600_000);
    const local = reference.replace(/@sha256:[0-9a-f]{64}$/, '');
    await must(
      [
        'sh',
        '-c',
        'docker save --platform linux/amd64 "$1" | ' +
          'docker exec -i "$2" ctr -n k8s.io images import --platform linux/amd64 -',
        'import',
        local,
        NODE,
      ],
      600_000,
    );
    if (local !== reference) {
      // The kubelet asks for `name@digest` without the tag; the import only names the tag.
      const pinned = reference.replace(/:[^/:@]+@/, '@');
      await must(['docker', 'exec', NODE, 'ctr', '-n', 'k8s.io', 'images', 'tag', local, pinned]);
    }
  }
}

/** The pause image the node's containerd starts every pod sandbox from. */
async function sandboxImage(): Promise<string> {
  const config = await must([
    'docker',
    'exec',
    NODE,
    'cat',
    '/var/lib/rancher/k3s/agent/etc/containerd/config.toml',
  ]);
  // containerd 2 names it `sandbox` under the pinned images; containerd 1 named it `sandbox_image`.
  const image = /^\s*sandbox(?:_image)?\s*=\s*"([^"]+)"/m.exec(config.stdout)?.[1];
  if (image === undefined) throw new Error(`${NODE} containerd config names no sandbox image`);
  return image.includes('/') && image.split('/')[0].includes('.') ? image : `docker.io/${image}`;
}

export async function rehearse(keep: boolean, importsImages: boolean): Promise<void> {
  const toolchain = await readToolchain(join(ROOT, 'infra/versions/toolchain.json'));
  const cache = toolCacheDirectory(process.env);
  const { k3d: k3dLock, kubectl: kubectlLock, helm: helmLock } = toolchain.binaries;
  const k3d = await installLockedTool({ name: 'k3d', ...k3dLock, member: null }, cache, runChecked);
  const kubectl = await installLockedTool(
    { name: 'kubectl', ...kubectlLock, member: null },
    cache,
    runChecked,
  );
  const helm = await installLockedTool(
    { name: 'helm', ...helmLock, member: 'linux-amd64/helm' },
    cache,
    runChecked,
  );
  const node = toolchain.runtimeImages.k3dNode;
  const probe = toolchain.runtimeImages.networkProbe;
  const probeImage = `${probe.name}@${probe.digest}`;

  const listed = await must([k3d, 'cluster', 'list', '-o', 'json']);
  if ((JSON.parse(listed.stdout) as { name: string }[]).some(({ name }) => name === CLUSTER)) {
    throw new Error(`${CLUSTER} already exists; delete it with: ${k3d} cluster delete ${CLUSTER}`);
  }

  const state = await mkdtemp(join(tmpdir(), 'puni-traefik-edge-'));
  const kubeconfig = join(state, 'kubeconfig');
  const k = (args: readonly string[], timeoutMs?: number) =>
    must([kubectl, '--kubeconfig', kubeconfig, ...args], timeoutMs);
  try {
    log(`creating ${CLUSTER} on ${node.name}`);
    await must(
      [
        k3d,
        'cluster',
        'create',
        CLUSTER,
        '--image',
        `${node.name}@${node.digest}`,
        '--servers',
        '1',
        '--agents',
        '0',
        '--no-lb',
        '--k3s-arg',
        '--disable=traefik@server:0',
        '--k3s-arg',
        '--disable=servicelb@server:0',
        '--k3s-arg',
        '--disable=metrics-server@server:0',
        '--kubeconfig-update-default=false',
        '--kubeconfig-switch-context=false',
        '--wait',
        '--timeout',
        '180s',
      ],
      600_000,
    );
    await writeFile(kubeconfig, (await must([k3d, 'kubeconfig', 'get', CLUSTER])).stdout, {
      mode: 0o600,
    });
    await k(['label', 'node', NODE, 'puni.dev/capability-ingress=true']);
    const traefikImage = toolchain.charts.traefik.images[0];
    if (importsImages) {
      await importImages([await sandboxImage(), `${traefikImage.name}@${traefikImage.digest}`]);
    }

    const release = parse(
      await readFile(join(ROOT, 'infra/platform/networking/traefik.yaml'), 'utf8'),
    ) as { metadata: { namespace: string }; spec: { values: unknown } };
    const valuesPath = join(state, 'values.json');
    await writeFile(valuesPath, JSON.stringify(release.spec.values));
    const rendered = await must([
      helm,
      'template',
      'traefik',
      join(ROOT, `infra/platform/charts/traefik-${toolchain.charts.traefik.version}.tgz`),
      '--namespace',
      release.metadata.namespace,
      '--values',
      valuesPath,
      '--include-crds',
    ]);
    const manifestPath = join(state, 'traefik.yaml');
    await writeFile(manifestPath, rendered.stdout);

    log('port floor 1024: Traefik must fail to bind :80');
    await setPortFloor(probeImage, 1024);
    await k(['create', 'namespace', release.metadata.namespace]);
    await k(['apply', '--server-side', '-f', manifestPath], 300_000);
    const refused = await waitForLog([kubectl, '--kubeconfig', kubeconfig], 'permission denied');
    // Proof: with the floor left at the container default 0 instead of 1024, this phase waited
    // out its deadline and threw `Traefik did not log permission denied` (see verify.md).
    if (!refused) throw new Error('Traefik did not log permission denied with the floor at 1024');
    log('observed: entry point bind permission denied');

    log('port floor 0: Traefik must become Ready');
    await setPortFloor(probeImage, 0);
    await k(['-n', 'traefik', 'delete', 'pod', '-l', 'app.kubernetes.io/name=traefik']);
    await k(['-n', 'traefik', 'rollout', 'status', 'daemonset/traefik', '--timeout=240s'], 300_000);

    const address = (
      await must([
        'docker',
        'inspect',
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
        NODE,
      ])
    ).stdout.trim();
    if (address === '') throw new Error(`${NODE} has no container address`);

    for (const [method, status] of [
      ['GET', 301],
      ['POST', 308],
    ] as const) {
      const http = await fetch(`http://${address}/probe?x=1`, {
        method,
        headers: { host: 'dev.puni.dev' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      const location = http.headers.get('location');
      if (http.status !== status || location !== 'https://dev.puni.dev/probe?x=1') {
        throw new Error(
          `HTTP :80 ${method} answered ${String(http.status)} to ${location ?? '(none)'}`,
        );
      }
      log(`observed: ${method} http://dev.puni.dev/probe?x=1 -> ${String(status)} ${location}`);
    }
    const https = await fetch(`https://${address}/`, {
      headers: { host: 'unknown.invalid' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      tls: { rejectUnauthorized: false },
    });
    if (https.status !== 404) {
      throw new Error(`HTTPS :443 answered ${String(https.status)} for an unrouted host`);
    }
    log('observed: https :443 answers 404 for an unrouted host');
    log('every Traefik edge case passed');
  } finally {
    if (keep) {
      log(`kept ${CLUSTER}; kubeconfig ${kubeconfig}`);
    } else {
      await runChecked([k3d, 'cluster', 'delete', CLUSTER], { timeoutMs: 300_000 });
      await rm(state, { recursive: true, force: true });
    }
  }
}

/** Polls the Traefik pod's current and previous logs until `needle` appears or the deadline. */
async function waitForLog(kubectl: readonly string[], needle: string): Promise<boolean> {
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    for (const previous of [false, true]) {
      const logs = await runChecked(
        [
          ...kubectl,
          '-n',
          'traefik',
          'logs',
          'daemonset/traefik',
          ...(previous ? ['--previous'] : []),
        ],
        { timeoutMs: 30_000 },
      );
      // A pod that has not started, or has no previous container yet, is the modelled wait.
      if (logs.exitCode === 0 && logs.stdout.includes(needle)) return true;
    }
    await sleep(5_000);
  }
  return false;
}

if (import.meta.main) {
  try {
    await rehearse(process.argv.includes('--keep'), process.argv.includes('--import-images'));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
