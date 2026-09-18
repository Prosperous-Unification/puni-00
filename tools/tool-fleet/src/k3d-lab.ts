import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

import { type } from 'arktype';

import { readToolchain } from './contracts';

type K3dLabAction = 'up' | 'down' | 'status';
export type K3dProfile = 'app' | 'platform' | 'fleet';
type ClusterRole = 'platform' | 'workers';

export interface K3dLabRequest {
  readonly action: K3dLabAction;
  readonly labId: string;
  readonly profile: K3dProfile;
  readonly worktreeRoot?: string;
  readonly solverRuntime?: string;
}

/**
 * What one profile needs from the host before any container starts.
 *
 * Memory is `MemAvailable`, because Docker on Linux draws from the host directly; disk is the
 * free space under Docker's root. The values are the F9 measurements plus headroom for the
 * dev environment's watchers ([local lab](../../../docs/infra/local.md)).
 */
export interface ProfileRequirement {
  readonly memoryMiB: number;
  readonly diskMiB: number;
  readonly clusters: readonly ClusterRole[];
  readonly flux: boolean;
}

export const PROFILES: Readonly<Record<K3dProfile, ProfileRequirement>> = {
  app: { memoryMiB: 4096, diskMiB: 12 * 1024, clusters: ['platform'], flux: false },
  platform: { memoryMiB: 16 * 1024, diskMiB: 40 * 1024, clusters: ['platform'], flux: true },
  fleet: {
    memoryMiB: 24 * 1024,
    diskMiB: 50 * 1024,
    clusters: ['platform', 'workers'],
    flux: true,
  },
};

const SMALLER: Readonly<Record<K3dProfile, K3dProfile | undefined>> = {
  app: undefined,
  platform: 'app',
  fleet: 'platform',
};

export interface HostCapacity {
  readonly availableMemoryMiB: number;
  readonly freeDiskMiB: number;
}

/** Lab-owned names. Every one embeds the lab ID, so two labs never share a context or network. */
export interface K3dLabNames {
  readonly platform: string;
  readonly workers: string;
  readonly registry: string;
  readonly network: string;
}

/** A container or network Docker reports under the lab's ownership label. */
export interface LabResource {
  readonly name: string;
  readonly labId: string;
  readonly cluster: string;
}

export interface K3dLabTeardown {
  readonly clusters: readonly string[];
  readonly registry: string | undefined;
  readonly network: string | undefined;
  readonly ignored: readonly string[];
}

/**
 * The lab's durable record, read by `tool-devsync:dev-env`
 * (`tools/tool-devsync/src/k3s/dev-environment.ts`, `decodeLabRecord`).
 */
export interface K3dLabRecord {
  readonly schemaVersion: 1;
  readonly labId: string;
  readonly profile: K3dProfile;
  readonly network: string;
  readonly registry: { readonly host: string; readonly hostPort: number };
  readonly httpPort: number;
  readonly worktreeRoot: string;
  readonly solverRuntime: string;
  readonly clusters: readonly {
    readonly name: string;
    readonly role: ClusterRole;
    readonly clusterId: string;
    readonly context: string;
    readonly kubeconfig: string;
    readonly apiPort: number;
  }[];
}

const K3dLabRecordSchema = type({
  schemaVersion: '1',
  labId: 'string>0',
  profile: "'app'|'platform'|'fleet'",
  network: 'string>0',
  registry: { host: 'string>0', hostPort: 'number.integer>0', '+': 'reject' },
  httpPort: 'number.integer>0',
  worktreeRoot: 'string>0',
  solverRuntime: 'string>0',
  clusters: type({
    name: 'string>0',
    role: "'platform'|'workers'",
    clusterId: 'string>0',
    context: 'string>0',
    kubeconfig: 'string>0',
    apiPort: 'number.integer>0',
    '+': 'reject',
  })
    .array()
    .atLeastLength(1),
  '+': 'reject',
});

/** Validate `lab.json` at its boundary; a malformed record is refused, never repaired. */
export function decodeK3dLabRecord(text: string): K3dLabRecord {
  const decoded = K3dLabRecordSchema(JSON.parse(text));
  if (decoded instanceof type.errors) throw new Error(`lab.json is malformed: ${decoded.summary}`);
  return decoded;
}

export const LAB_LABEL = 'puni.dev/lab-id';
const LAB_ID = /^[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?$/;
const PLACEHOLDER = /\$\{([A-Z0-9_]+)\}/g;
const STATE_PARENT = '.puni/fleet-labs/k3d';
const MIB = 1024 * 1024;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

function takeFlag(arguments_: readonly string[], position: number): string {
  const value = arguments_.at(position + 1);
  if (value === undefined || value.startsWith('--')) {
    // Proof: dropping the `--` test failed the parser negative `refuses a flag without a value`:
    // `--profile` was taken as the worktree root.
    throw new Error(`k3d lab flag ${arguments_[position] ?? ''} has no value`);
  }
  return value;
}

/**
 * Whether the arguments address the Ubuntu VM lab in `./lab`, which alone takes `--lab-id`.
 * Both labs share the `tool-fleet:lab` target; the k3d lab uses `--id`.
 */
export function isVmLabRequest(arguments_: readonly string[]): boolean {
  return arguments_.includes('--lab-id');
}

/** Decode the bounded k3d lab command. Cluster, registry and network names are always derived. */
export function parseK3dLabRequest(arguments_: readonly string[]): K3dLabRequest {
  const action = arguments_.at(0);
  if (action !== 'up' && action !== 'down' && action !== 'status') {
    throw new Error(`k3d lab action must be up, down, or status: ${action ?? 'missing'}`);
  }
  const flags = new Map<string, string>();
  for (let position = 1; position < arguments_.length; position += 2) {
    const flag = arguments_.at(position);
    if (
      flag === undefined ||
      !['--id', '--profile', '--worktree-root', '--solver-runtime'].includes(flag)
    ) {
      throw new Error(`Unexpected k3d lab argument: ${flag ?? 'missing'}`);
    }
    if (flags.has(flag)) throw new Error(`Duplicate k3d lab flag: ${flag}`);
    flags.set(flag, takeFlag(arguments_, position));
  }
  const labId = flags.get('--id') ?? 'local';
  if (!LAB_ID.test(labId)) {
    // Proof: replacing the pattern with a non-empty test failed `refuses a lab ID that is not a
    // short DNS label`; `../x` would have escaped `.puni/fleet-labs/k3d`.
    throw new Error(`k3d lab id must be a DNS label of at most 16 characters: ${labId}`);
  }
  const profile = flags.get('--profile');
  if (profile !== 'app' && profile !== 'platform' && profile !== 'fleet') {
    throw new Error(`k3d lab profile must be app, platform, or fleet: ${profile ?? 'missing'}`);
  }
  const worktreeRoot = flags.get('--worktree-root');
  const solverRuntime = flags.get('--solver-runtime');
  if (action === 'up' && worktreeRoot === undefined) {
    // The forge mounts worktrees from this prefix only. Guessing it (home, repository parent)
    // would expose unrelated checkouts to the node.
    throw new Error('k3d lab up requires --worktree-root <directory that holds your worktrees>');
  }
  if (action !== 'up' && (worktreeRoot !== undefined || solverRuntime !== undefined)) {
    throw new Error(`k3d lab ${action} does not accept mount flags`);
  }
  return {
    action,
    labId,
    profile,
    ...(worktreeRoot === undefined ? {} : { worktreeRoot: resolve(worktreeRoot) }),
    ...(solverRuntime === undefined ? {} : { solverRuntime: resolve(solverRuntime) }),
  };
}

export function labNamesOf(labId: string): K3dLabNames {
  return {
    platform: `puni-${labId}-platform`,
    workers: `puni-${labId}-workers`,
    registry: `puni-${labId}-registry`,
    network: `puni-${labId}`,
  };
}

/** `MemAvailable` in MiB. A kernel that does not report it is refused, never estimated. */
export function decodeMemAvailable(meminfo: string): number {
  const match = /^MemAvailable:\s+(\d+) kB$/m.exec(meminfo);
  if (match?.[1] === undefined) throw new Error('/proc/meminfo has no MemAvailable line');
  return Math.floor(Number(match[1]) / 1024);
}

/**
 * Refuse a profile the host cannot hold, naming the next smaller profile.
 *
 * @throws When available memory or Docker disk is below the profile requirement.
 */
export function requireProfileResources(profile: K3dProfile, capacity: HostCapacity): void {
  const requirement = PROFILES[profile];
  const shortfalls = [
    ...(capacity.availableMemoryMiB < requirement.memoryMiB
      ? [
          `${String(capacity.availableMemoryMiB)} MiB memory available, ${String(requirement.memoryMiB)} MiB required`,
        ]
      : []),
    ...(capacity.freeDiskMiB < requirement.diskMiB
      ? [
          `${String(capacity.freeDiskMiB)} MiB Docker disk free, ${String(requirement.diskMiB)} MiB required`,
        ]
      : []),
  ];
  if (shortfalls.length === 0) return;
  const smaller = SMALLER[profile];
  // Proof: returning unconditionally failed `refuses a short host and names the next smaller
  // profile`. The live platform and fleet refusals are in the k3s-platform verify.md, F9.
  throw new Error(
    `k3d lab profile ${profile} refused: ${shortfalls.join('; ')}. ` +
      (smaller === undefined
        ? 'No smaller k3d profile exists; run the tiers natively with `bun run dev`.'
        : `Use --profile ${smaller}, or free resources and retry.`),
  );
}

/**
 * Substitute `${NAME}` placeholders in a committed k3d config.
 *
 * @throws When the template names a value that was not supplied, or a supplied value could
 * break out of its YAML scalar.
 */
export function renderK3dConfig(
  template: string,
  values: Readonly<Partial<Record<string, string>>>,
): string {
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && /[\s"'#:,{}[\]]/.test(value) && name !== 'K3S_IMAGE') {
      throw new Error(`k3d config value ${name} contains a YAML-significant character: ${value}`);
    }
  }
  const rendered = template.replaceAll(PLACEHOLDER, (_match, name: string) => {
    const value = values[name];
    // Proof: returning the placeholder unchanged failed `refuses a placeholder without a value`.
    if (value === undefined) throw new Error(`k3d config placeholder ${name} has no value`);
    return value;
  });
  // k3d expands `$NAME` from its own environment, so any dollar sign left over would become an
  // empty value there instead of an error here.
  // Proof: a placeholder the pattern missed (`K3S_IMAGE`, before digits were allowed) reached k3d
  // as `image: null` on 2026-09-18, and the render negative `refuses a dollar sign it did not
  // substitute` failed with this check removed.
  if (rendered.includes('$')) {
    throw new Error('k3d config still contains a dollar sign after rendering');
  }
  return rendered;
}

/**
 * Decode `docker ps`/`docker network ls` rows printed as `name<TAB>lab-id<TAB>k3d-cluster`.
 */
export function decodeLabResources(stdout: string): readonly LabResource[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const columns = line.split('\t');
      if (columns.length !== 3) throw new Error(`Unreadable Docker resource row: ${line}`);
      const [name, labId, cluster] = columns as [string, string, string];
      return { name, labId, cluster };
    });
}

/**
 * Choose what `down` deletes: only lab-labelled containers of the lab's derived clusters, its
 * derived registry, and its derived network. Anything else carrying the label is reported, never
 * deleted, so a hand-labelled container cannot widen the teardown.
 */
export function planK3dLabDown(
  labId: string,
  containers: readonly LabResource[],
  networks: readonly LabResource[],
): K3dLabTeardown {
  const names = labNamesOf(labId);
  // Proof: dropping this filter failed `never deletes a lab-named resource that lacks the lab
  // label`; the live decoy container survived `down` (k3s-platform verify.md, F9).
  const owned = containers.filter((container) => container.labId === labId);
  const clusters = [
    ...new Set(
      owned
        .map((container) => container.cluster)
        .filter((cluster) => cluster === names.platform || cluster === names.workers),
    ),
  ].sort();
  const registry = owned.find((container) => container.name === names.registry)?.name;
  const network = networks.find(
    (candidate) => candidate.labId === labId && candidate.name === names.network,
  )?.name;
  const ignored = owned
    .filter(
      (container) => container.name !== names.registry && !clusters.includes(container.cluster),
    )
    .map((container) => container.name);
  return { clusters, registry, network, ignored };
}

async function freeLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('loopback listener reported no TCP port'));
        return;
      }
      server.close(() => {
        resolvePort(address.port);
      });
    });
  });
}

interface RunOptions {
  readonly environment?: Readonly<Record<string, string>>;
  readonly input?: string;
  readonly timeoutMs?: number;
}

/** Run a bounded lab subprocess; a non-zero exit or an expired deadline throws with stderr. */
async function run(
  executable: string,
  arguments_: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  const child = Bun.spawn([executable, ...arguments_], {
    env: { ...process.env, ...options.environment },
    stdin: options.input === undefined ? 'ignore' : new TextEncoder().encode(options.input),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `${executable} ${arguments_.join(' ')} exited ${String(exitCode)}${child.signalCode === null ? '' : ` (${child.signalCode})`}: ${stderr.trim()}`,
    );
  }
  return stdout;
}

interface LabTools {
  readonly k3d: string;
  readonly kubectl: string;
}

async function requireLabTools(root: string): Promise<LabTools> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const tools = { k3d: process.env['K3D'] ?? 'k3d', kubectl: process.env['KUBECTL'] ?? 'kubectl' };
  const k3dVersion = await run(tools.k3d, ['version']);
  if (!k3dVersion.includes(`k3d version ${toolchain.binaries.k3d.version}`)) {
    throw new Error(
      `k3d ${toolchain.binaries.k3d.version} is required; found: ${k3dVersion.trim()}`,
    );
  }
  const kubectlVersion = await run(tools.kubectl, ['version', '--client']);
  if (!kubectlVersion.includes(`Client Version: ${toolchain.binaries.kubectl.version}`)) {
    throw new Error(
      `kubectl ${toolchain.binaries.kubectl.version} is required; found: ${kubectlVersion.trim()}`,
    );
  }
  return tools;
}

/**
 * The lab's owner-only state directory. It must be ignored by Git, because it holds kubeconfigs
 * with cluster-admin client keys.
 */
export async function prepareStateDirectory(root: string, labId: string): Promise<string> {
  const directory = join(root, STATE_PARENT, labId);
  const ignored = Bun.spawnSync(['git', '-C', root, 'check-ignore', '-q', directory]);
  if (ignored.exitCode !== 0) {
    // Proof: accepting exit 1 (not ignored) failed `refuses a state directory Git would commit`;
    // `git add -A` would then commit cluster-admin kubeconfigs.
    throw new Error(`${directory} is not ignored by Git; refusing to write kubeconfigs there`);
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(join(root, STATE_PARENT), 0o700);
  await chmod(directory, 0o700);
  return directory;
}

async function requireOwnedDirectory(path: string, purpose: string): Promise<string> {
  const real = await realpath(path);
  const status = await lstat(real);
  const uid = process.getuid?.();
  if (!status.isDirectory()) throw new Error(`${purpose} ${real} is not a directory`);
  if (uid === undefined || status.uid !== uid) {
    throw new Error(`${purpose} ${real} is not owned by the current user`);
  }
  if (real === '/') throw new Error(`${purpose} may not be the filesystem root`);
  return real;
}

async function hostCapacity(): Promise<HostCapacity> {
  const dockerRoot = (await run('docker', ['info', '--format', '{{.DockerRootDir}}'])).trim();
  const filesystem = await statfs(dockerRoot);
  return {
    availableMemoryMiB: decodeMemAvailable(await readFile('/proc/meminfo', 'utf8')),
    freeDiskMiB: Math.floor((filesystem.bavail * filesystem.bsize) / MIB),
  };
}

async function listLabResources(labId: string): Promise<{
  containers: readonly LabResource[];
  networks: readonly LabResource[];
}> {
  const filter = `label=${LAB_LABEL}=${labId}`;
  const containers = decodeLabResources(
    await run('docker', [
      'ps',
      '--all',
      '--filter',
      filter,
      '--format',
      `{{.Names}}\t{{.Label "${LAB_LABEL}"}}\t{{.Label "k3d.cluster"}}`,
    ]),
  );
  const networks = decodeLabResources(
    await run('docker', [
      'network',
      'ls',
      '--filter',
      filter,
      '--format',
      `{{.Name}}\t{{.Label "${LAB_LABEL}"}}\t`,
    ]),
  );
  return { containers, networks };
}

function kubectlFor(
  tools: LabTools,
  kubeconfig: string,
  context: string,
): (arguments_: readonly string[]) => Promise<string> {
  return (arguments_) =>
    run(tools.kubectl, ['--kubeconfig', kubeconfig, '--context', context, ...arguments_]);
}

async function bootstrapCluster(
  root: string,
  tools: LabTools,
  labId: string,
  cluster: K3dLabRecord['clusters'][number],
  flux: boolean,
): Promise<void> {
  const kubectl = kubectlFor(tools, cluster.kubeconfig, cluster.context);
  await kubectl(['wait', '--for=condition=Ready', 'node', '--all', '--timeout=180s']);
  // The immutable marker every Flux stage health-checks (`infra/ansible/playbooks/platform.yml`);
  // `dev-env` also refuses a cluster whose marker carries another lab's label.
  const marker = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `puni-cluster-${cluster.clusterId}`,
      namespace: 'kube-system',
      labels: { [LAB_LABEL]: labId },
    },
    immutable: true,
    data: { 'cluster-id': cluster.clusterId },
  };
  await run(
    tools.kubectl,
    ['--kubeconfig', cluster.kubeconfig, '--context', cluster.context, 'create', '-f', '-'],
    { input: JSON.stringify(marker) },
  );
  // The committed policy stage: trusted namespaces, forge/solver admission and RBAC.
  await kubectl(['apply', '--server-side', '-k', join(root, 'infra/platform/policy')]);
  // `dev-env` rewrites admission parameters only where this label proves the lab owns them.
  await kubectl([
    'label',
    'configmap',
    'puni-trusted-workload',
    '--namespace=wbs-solver',
    `${LAB_LABEL}=${labId}`,
  ]);
  if (flux) {
    const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
    const manifest = await readFile(join(root, 'infra/platform/flux/install.yaml'));
    const digest = createHash('sha256').update(manifest).digest('hex');
    if (digest !== toolchain.manifests.fluxInstall.sha256) {
      throw new Error(`infra/platform/flux/install.yaml sha256 ${digest} is not the locked digest`);
    }
    await kubectl(['apply', '--server-side', '-f', join(root, 'infra/platform/flux/install.yaml')]);
    await kubectl(['rollout', 'status', 'deployment', '--namespace=flux-system', '--timeout=300s']);
  }
}

async function upLab(root: string, request: K3dLabRequest, tools: LabTools): Promise<void> {
  try {
    await createLab(root, request, tools);
  } catch (cause) {
    // Partial resources carry the lab label, so the ordinary teardown removes exactly them.
    throw new Error(
      `k3d lab ${request.labId} up failed; remove what it created with ` +
        `\`bunx nx run tool-fleet:lab -- down --id ${request.labId} --profile ${request.profile}\``,
      { cause },
    );
  }
}

async function createLab(root: string, request: K3dLabRequest, tools: LabTools): Promise<void> {
  const profile = PROFILES[request.profile];
  requireProfileResources(request.profile, await hostCapacity());
  const names = labNamesOf(request.labId);
  const existing = await listLabResources(request.labId);
  if (existing.containers.length > 0 || existing.networks.length > 0) {
    throw new Error(
      `k3d lab ${request.labId} already has resources; run \`bunx nx run tool-fleet:lab -- status --id ${request.labId} --profile ${request.profile}\``,
    );
  }
  if (request.worktreeRoot === undefined) throw new Error('k3d lab up requires --worktree-root');
  const worktreeRoot = await requireOwnedDirectory(request.worktreeRoot, 'Worktree root');
  const state = await prepareStateDirectory(root, request.labId);
  const solverRuntime =
    request.solverRuntime === undefined
      ? join(state, 'solver-runtime')
      : await requireOwnedDirectory(request.solverRuntime, 'Solver runtime directory');
  await mkdir(solverRuntime, { recursive: true, mode: 0o700 });
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const nodeImage = `${toolchain.runtimeImages.k3dNode.name}@${toolchain.runtimeImages.k3dNode.digest}`;
  const registryImage = `${toolchain.runtimeImages.registry.name}@${toolchain.runtimeImages.registry.digest}`;

  // Every config renders before Docker changes anything, so a template fault leaves no network
  // or registry behind.
  const httpPort = await freeLoopbackPort();
  const planned: { role: ClusterRole; name: string; apiPort: number; configPath: string }[] = [];
  for (const role of profile.clusters) {
    const name = role === 'platform' ? names.platform : names.workers;
    const apiPort = await freeLoopbackPort();
    const template = await readFile(join(root, `infra/local/${role}.k3d.yaml`), 'utf8');
    const configPath = join(state, `${name}.k3d.yaml`);
    await writeFile(
      configPath,
      renderK3dConfig(template, {
        CLUSTER_NAME: name,
        K3S_IMAGE: nodeImage,
        NETWORK: names.network,
        API_PORT: String(apiPort),
        HTTP_PORT: String(httpPort),
        WORKTREE_ROOT: worktreeRoot,
        SOLVER_RUNTIME: solverRuntime,
        REGISTRY_HOST: names.registry,
        LAB_ID: request.labId,
      }),
      { mode: 0o600 },
    );
    planned.push({ role, name, apiPort, configPath });
  }

  const started = Date.now();
  await run('docker', [
    'network',
    'create',
    '--label',
    `${LAB_LABEL}=${request.labId}`,
    names.network,
  ]);
  await run('docker', [
    'run',
    '--detach',
    '--name',
    names.registry,
    '--label',
    `${LAB_LABEL}=${request.labId}`,
    '--network',
    names.network,
    '--publish',
    '127.0.0.1::5000',
    '--restart',
    'unless-stopped',
    registryImage,
  ]);
  const published = (await run('docker', ['port', names.registry, '5000/tcp'])).trim();
  const registryPort = Number(published.split('\n')[0]?.split(':').at(-1));
  if (!Number.isInteger(registryPort) || !published.startsWith('127.0.0.1:')) {
    throw new Error(`Lab registry is not published on loopback only: ${published}`);
  }

  const clusters: K3dLabRecord['clusters'][number][] = [];
  for (const { role, name, apiPort, configPath } of planned) {
    // `platform`/`fleet` hand ingress to the Flux-owned Traefik DaemonSet (`infra/platform/networking`).
    const replaced =
      profile.flux && role === 'platform'
        ? ['--k3s-arg', '--disable=traefik@server:*', '--k3s-arg', '--disable=servicelb@server:*']
        : [];
    // k3d edits $KUBECONFIG on create and delete; pointing it into the state directory keeps the
    // user's default kubeconfig and current context untouched.
    await run(tools.k3d, ['cluster', 'create', '--config', configPath, ...replaced], {
      environment: { KUBECONFIG: join(state, 'k3d-scratch.kubeconfig') },
    });
    const kubeconfig = join(state, `${name}.kubeconfig`);
    await writeFile(kubeconfig, await run(tools.k3d, ['kubeconfig', 'get', name]), { mode: 0o600 });
    clusters.push({
      name,
      role,
      clusterId: `${role}-local`,
      context: `k3d-${name}`,
      kubeconfig,
      apiPort,
    });
  }
  for (const cluster of clusters) {
    await bootstrapCluster(root, tools, request.labId, cluster, profile.flux);
  }
  const record: K3dLabRecord = {
    schemaVersion: 1,
    labId: request.labId,
    profile: request.profile,
    network: names.network,
    registry: { host: names.registry, hostPort: registryPort },
    httpPort,
    worktreeRoot,
    solverRuntime,
    clusters,
  };
  await writeFile(join(state, 'lab.json'), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(
    [
      `k3d lab ${request.labId} (${request.profile}) up in ${String(Math.round((Date.now() - started) / 1000))}s`,
      ...clusters.map(
        (cluster) =>
          `  ${cluster.role}: kubectl --kubeconfig ${cluster.kubeconfig} --context ${cluster.context} get nodes`,
      ),
      `  registry: 127.0.0.1:${String(registryPort)} (in cluster ${names.registry}:5000)`,
      `  ingress: http://<slug>.localhost:${String(httpPort)}/ (loopback only)`,
      ...(profile.flux
        ? ['  Flux is installed; reconcile the platform graph as docs/infra/local.md describes.']
        : []),
    ].join('\n'),
  );
}

async function downLab(root: string, request: K3dLabRequest, tools: LabTools): Promise<void> {
  const resources = await listLabResources(request.labId);
  const teardown = planK3dLabDown(request.labId, resources.containers, resources.networks);
  const state = join(root, STATE_PARENT, request.labId);
  for (const cluster of teardown.clusters) {
    await run(tools.k3d, ['cluster', 'delete', cluster], {
      environment: { KUBECONFIG: join(state, 'k3d-scratch.kubeconfig') },
    });
  }
  if (teardown.registry !== undefined) await run('docker', ['rm', '--force', teardown.registry]);
  if (teardown.network !== undefined) await run('docker', ['network', 'rm', teardown.network]);
  await rm(state, { recursive: true, force: true });
  console.log(
    [
      `k3d lab ${request.labId}: deleted ${teardown.clusters.length === 0 ? 'no clusters' : teardown.clusters.join(', ')}` +
        (teardown.registry === undefined ? '' : `, ${teardown.registry}`) +
        (teardown.network === undefined ? '' : `, network ${teardown.network}`),
      ...teardown.ignored.map(
        (name) => `  left ${name}: labelled for this lab but not a lab-derived name`,
      ),
    ].join('\n'),
  );
}

async function statusLab(root: string, request: K3dLabRequest, tools: LabTools): Promise<void> {
  const resources = await listLabResources(request.labId);
  const listing = await run('docker', [
    'ps',
    '--all',
    '--filter',
    `label=${LAB_LABEL}=${request.labId}`,
    '--format',
    '{{.Names}}\t{{.Status}}',
  ]);
  console.log(listing.trim() === '' ? `k3d lab ${request.labId}: no resources` : listing.trim());
  const recordPath = join(root, STATE_PARENT, request.labId, 'lab.json');
  if (resources.containers.length === 0) return;
  const record = decodeK3dLabRecord(await readFile(recordPath, 'utf8'));
  for (const cluster of record.clusters) {
    console.log(`${cluster.name} (${cluster.clusterId}):`);
    console.log(
      await kubectlFor(tools, cluster.kubeconfig, cluster.context)(['get', 'nodes', '-o', 'wide']),
    );
  }
}

/** Entry for `tool-fleet:lab`: the VM lab when `--lab-id` is present, otherwise the k3d lab. */
export async function runLab(arguments_: readonly string[], root: string): Promise<void> {
  if (isVmLabRequest(arguments_)) {
    await (await import('./lab')).runVmLab(arguments_, root);
    return;
  }
  const request = parseK3dLabRequest(arguments_);
  const tools = await requireLabTools(root);
  switch (request.action) {
    case 'up':
      await upLab(root, request, tools);
      return;
    case 'down':
      await downLab(root, request, tools);
      return;
    case 'status':
      await statusLab(root, request, tools);
      return;
  }
}

if (import.meta.main) {
  await runLab(process.argv.slice(2), join(import.meta.dir, '../../..'));
}
