#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { type } from 'arktype';

type DevEnvironmentAction = 'up' | 'down' | 'status';

export interface DevEnvironmentRequest {
  readonly action: DevEnvironmentAction;
  readonly slug: string;
  readonly cluster: string;
  readonly worktree?: string;
}

/**
 * The k3d lab record written by `tools/tool-fleet/src/k3d-lab.ts` (`K3dLabRecord`). It is
 * validated here, at the only place this tool reads it.
 */
const LabRecord = type({
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
export type LabRecord = typeof LabRecord.infer;
type LabCluster = LabRecord['clusters'][number];

/** What the host says about a requested worktree, gathered before any cluster call. */
export interface WorktreeInspection {
  readonly requested: string;
  readonly realpath: string;
  readonly ownerUid: number;
  readonly topLevel: string;
  readonly rootCommits: readonly string[];
}

/** The identity a running environment carries in its labels and annotations. */
export interface RunningEnvironment {
  readonly slug: string;
  readonly worktree: string;
  readonly worktreeNodePath: string;
  readonly image: string;
}

export interface EnvironmentBinding {
  readonly slug: string;
  readonly labId: string;
  readonly image: string;
  readonly worktree: string;
  readonly worktreeNodePath: string;
  readonly solverNodePath: string;
  readonly host: string;
  readonly origin: string;
  readonly recreateInputs: string;
}

export interface AdmissionParameters {
  readonly forgeImage: string;
  readonly forgeWorktreeRoots: readonly string[];
}

type ManifestObject = Record<string, unknown>;

export const FORGE_NAMESPACE = 'puni-forge';
export const FORGE_CONTROLLER = `system:serviceaccount:${FORGE_NAMESPACE}:dev-environment-controller`;
export const WORKTREE_NODE_ROOT = '/srv/puni/worktrees';
export const SOLVER_NODE_PATH = '/run/puni/solver';
export const SLUG_LABEL = 'puni.dev/dev-slug';
const LAB_LABEL = 'puni.dev/lab-id';
const WORKTREE_ANNOTATION = 'puni.dev/worktree';
const RECREATE_ANNOTATION = 'puni.dev/recreate-inputs';
const POD_SPEC_ANNOTATION = 'puni.dev/pod-spec';
const SLUG = /^[a-z](?:[a-z0-9-]{0,18}[a-z0-9])?$/;
const CLUSTER = /^puni-[a-z0-9-]+-platform$|^puni-[a-z0-9-]+-workers$/;
const DIGEST_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Paths a restart cannot apply to a forge Pod: the image it was built from and the manifests it
 * was created from. The k3s analogue of `RECREATE_PATHS` in `../sync.ts`.
 */
export const K3S_RECREATE_PATHS: readonly string[] = [
  'deploy/dev-src/Dockerfile',
  'deploy/k8s/wbs/overlays/dev',
];

/** Kinds the dev overlay may render, each exactly once. */
const OVERLAY_KINDS = ['Pod', 'Service', 'Ingress', 'PersistentVolumeClaim', 'NetworkPolicy'];

function takeFlag(arguments_: readonly string[], position: number): string {
  const value = arguments_.at(position + 1);
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`dev-env flag ${arguments_[position] ?? ''} has no value`);
  }
  return value;
}

/** Decode `up|down|status --slug <slug> --cluster <lab cluster> [--worktree <path>]`. */
export function parseDevEnvironmentRequest(arguments_: readonly string[]): DevEnvironmentRequest {
  const action = arguments_.at(0);
  if (action !== 'up' && action !== 'down' && action !== 'status') {
    throw new Error(`dev-env action must be up, down, or status: ${action ?? 'missing'}`);
  }
  const flags = new Map<string, string>();
  for (let position = 1; position < arguments_.length; position += 2) {
    const flag = arguments_.at(position);
    if (flag === undefined || !['--slug', '--worktree', '--cluster'].includes(flag)) {
      throw new Error(`Unexpected dev-env argument: ${flag ?? 'missing'}`);
    }
    if (flags.has(flag)) throw new Error(`Duplicate dev-env flag: ${flag}`);
    flags.set(flag, takeFlag(arguments_, position));
  }
  const slug = flags.get('--slug');
  if (slug === undefined || !SLUG.test(slug)) {
    // Proof: dropping the pattern failed `refuses a slug that is not a short DNS label`; the slug
    // becomes Kubernetes names and the `<slug>.localhost` host.
    throw new Error(
      `dev-env --slug must be a DNS label of at most 20 characters: ${slug ?? 'missing'}`,
    );
  }
  const cluster = flags.get('--cluster');
  if (cluster === undefined || !CLUSTER.test(cluster)) {
    throw new Error(
      `dev-env --cluster must name a k3d lab cluster (puni-<id>-platform): ${cluster ?? 'missing'}`,
    );
  }
  const worktree = flags.get('--worktree');
  if (action === 'up' && worktree === undefined) throw new Error('dev-env up requires --worktree');
  return {
    action,
    slug,
    cluster,
    ...(worktree === undefined ? {} : { worktree: resolve(worktree) }),
  };
}

/** Validate `lab.json` at its boundary; a malformed record is refused, never repaired. */
export function decodeLabRecord(text: string): LabRecord {
  const decoded = LabRecord(JSON.parse(text));
  if (decoded instanceof type.errors) throw new Error(`lab.json is malformed: ${decoded.summary}`);
  return decoded;
}

/**
 * Pick the lab cluster that hosts the forge. Only a lab's platform cluster mounts the worktree
 * prefix and carries the forge capability.
 */
export function findForgeCluster(
  records: readonly LabRecord[],
  clusterName: string,
): { readonly record: LabRecord; readonly cluster: LabCluster } {
  const matches = records.flatMap((record) =>
    record.clusters
      .filter((cluster) => cluster.name === clusterName)
      .map((cluster) => ({ record, cluster })),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${clusterName} is ${matches.length === 0 ? 'not' : 'ambiguously'} a k3d lab cluster of this checkout; ` +
        'start one with `bunx nx run tool-fleet:lab -- up --profile app --worktree-root <dir>`',
    );
  }
  const [match] = matches as [{ readonly record: LabRecord; readonly cluster: LabCluster }];
  if (match.cluster.role !== 'platform') {
    throw new Error(
      `${clusterName} is a workers cluster; source environments run on the platform cluster`,
    );
  }
  return match;
}

/**
 * Refuse a worktree that is not an owned checkout of this repository inside the lab's prefix,
 * and return the node path the forge Pod mounts.
 *
 * @throws For a symlink that leaves the prefix, a path outside it or equal to it, a directory
 * that is not a Git top level, another owner, or another repository.
 */
export function requireOwnedWorktree(
  inspection: WorktreeInspection,
  expected: {
    readonly prefix: string;
    readonly uid: number;
    readonly rootCommits: readonly string[];
  },
): string {
  const inside = (path: string): string | undefined => {
    const relation = relative(expected.prefix, path);
    return relation === '' || relation.startsWith('..') || isAbsolute(relation)
      ? undefined
      : relation;
  };
  const relation = inside(inspection.realpath);
  if (relation === undefined) {
    // Proof: comparing the requested path instead of its realpath failed `refuses a symlink that
    // escapes the prefix`. The live refusal is in the k3s-platform verify.md, F9.
    throw new Error(
      inside(inspection.requested) === undefined
        ? `${inspection.realpath} is outside the lab worktree root ${expected.prefix}`
        : `${inspection.requested} is a symlink escape: it resolves to ${inspection.realpath}, outside ${expected.prefix}`,
    );
  }
  if (relation.includes(',')) {
    // The forge admission stores exact roots as one comma-separated list.
    throw new Error(
      `${inspection.realpath} contains a comma, which the forge root list cannot hold`,
    );
  }
  // Proof: disabling this comparison failed `refuses a subdirectory of a worktree`.
  if (inspection.topLevel !== inspection.realpath) {
    throw new Error(
      `${inspection.realpath} is not the top level of a Git worktree (${inspection.topLevel})`,
    );
  }
  if (inspection.ownerUid !== expected.uid) {
    // Proof: disabling the owner comparison failed `refuses a worktree another user owns`.
    throw new Error(
      `${inspection.realpath} is a foreign worktree: owned by UID ${String(inspection.ownerUid)}`,
    );
  }
  if (!inspection.rootCommits.some((commit) => expected.rootCommits.includes(commit))) {
    // Proof: disabling the root-commit comparison failed `refuses a checkout of another
    // repository`. The live refusal is in the k3s-platform verify.md, F9.
    throw new Error(
      `${inspection.realpath} is a foreign worktree: it shares no root commit with this repository`,
    );
  }
  return `${WORKTREE_NODE_ROOT}/${relation.split(sep).join('/')}`;
}

/**
 * One worktree, one slug. Re-running `up` for the same pair is allowed; anything else that
 * reuses either half is refused.
 */
export function requireUniqueEnvironment(
  slug: string,
  worktree: string,
  running: readonly RunningEnvironment[],
): void {
  for (const environment of running) {
    if (environment.slug === slug && environment.worktree !== worktree) {
      // Proof: disabling this check failed `refuses a duplicate slug for another worktree`. The
      // live refusal is in the k3s-platform verify.md, F9.
      throw new Error(
        `slug ${slug} already serves ${environment.worktree}; choose another slug or run down first`,
      );
    }
    if (environment.slug !== slug && environment.worktree === worktree) {
      throw new Error(
        `${worktree} is already served as slug ${environment.slug}; one worktree has one environment`,
      );
    }
  }
}

/**
 * The forge admission parameters after this environment starts or stops.
 *
 * The admission accepts one forge image, so an environment whose Dockerfile builds a different
 * digest is refused while another environment still runs the old one.
 */
export function nextAdmissionParameters(
  current: AdmissionParameters,
  change:
    | {
        readonly kind: 'start';
        readonly slug: string;
        readonly image: string;
        readonly roots: readonly string[];
      }
    | { readonly kind: 'stop'; readonly slug: string; readonly roots: readonly string[] },
  running: readonly RunningEnvironment[],
): AdmissionParameters {
  const others = running.filter((environment) => environment.slug !== change.slug);
  if (change.kind === 'start') {
    // Proof: ignoring other environments failed `refuses a second forge image while another
    // environment runs the first`; the forge would then deny that environment's next Pod.
    const conflicting = others.find((environment) => environment.image !== change.image);
    if (conflicting !== undefined) {
      throw new Error(
        `environment ${conflicting.slug} runs forge image ${conflicting.image}; the forge admits one image, ` +
          `so recreate it from the same deploy/dev-src/Dockerfile before starting ${change.slug}`,
      );
    }
    return {
      forgeImage: change.image,
      forgeWorktreeRoots: [...new Set([...current.forgeWorktreeRoots, ...change.roots])],
    };
  }
  const stillUsed = new Set(others.map((environment) => environment.worktreeNodePath));
  const released = change.roots.filter(
    (root) => !(root === SOLVER_NODE_PATH ? others.length > 0 : stillUsed.has(root)),
  );
  return {
    forgeImage: current.forgeImage,
    forgeWorktreeRoots: current.forgeWorktreeRoots.filter((root) => !released.includes(root)),
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** Read a nested JSON value; numeric keys index arrays. Absent at any step is `undefined`. */
function field(object: unknown, ...path: readonly string[]): unknown {
  let current: unknown = object;
  for (const key of path) {
    if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)] as unknown;
    else if (isRecord(current)) current = current[key];
    else return undefined;
  }
  return current;
}

/**
 * The bound-spec fingerprint of the environment's existing Pod in a `kubectl get pods -o json`
 * list, or `undefined` when none exists. `up` recreates the Pod only when this differs.
 */
export function existingPodFingerprint(podList: string): string | undefined {
  const fingerprint = field(
    JSON.parse(podList),
    'items',
    '0',
    'metadata',
    'annotations',
    POD_SPEC_ANNOTATION,
  );
  if (fingerprint !== undefined && typeof fingerprint !== 'string') {
    throw new Error('the existing forge Pod carries a malformed spec fingerprint');
  }
  return fingerprint;
}

function recordAt(object: ManifestObject, ...path: readonly string[]): Record<string, unknown> {
  const value = field(object, ...path);
  if (!isRecord(value)) throw new Error(`dev overlay object lacks ${path.join('.')}`);
  return value;
}

function arrayAt(object: ManifestObject, ...path: readonly string[]): unknown[] {
  const value = field(object, ...path);
  if (!Array.isArray(value)) throw new Error(`dev overlay object lacks list ${path.join('.')}`);
  return value;
}

/**
 * Bind the rendered dev overlay to one environment: names, labels, the image digest, the exact
 * host paths and the loopback URLs. The overlay supplies shape; identity comes only from here.
 *
 * @throws When the overlay renders another kind, a kind twice, another namespace, or a Pod
 * whose volumes are not exactly the worktree, data and solver-runtime set.
 */
export function bindEnvironment(
  objects: readonly ManifestObject[],
  binding: EnvironmentBinding,
): readonly ManifestObject[] {
  const kinds = objects.map((object) => String(object['kind']));
  if ([...kinds].sort().join() !== [...OVERLAY_KINDS].sort().join()) {
    // Proof: with this guard removed, the negative `refuses an overlay with an extra object`
    // resolved: a second rendered Pod would have reached the cluster unbound.
    throw new Error(
      `dev overlay must render exactly ${OVERLAY_KINDS.join(', ')}; got ${kinds.join(', ')}`,
    );
  }
  if (!DIGEST_IMAGE.test(binding.image))
    throw new Error(`forge image must be digest-pinned: ${binding.image}`);
  const name = `dev-${binding.slug}`;
  const labels = { [SLUG_LABEL]: binding.slug, [LAB_LABEL]: binding.labId };
  return objects.map((original) => {
    const object = structuredClone(original);
    const metadata = recordAt(object, 'metadata');
    if (metadata['namespace'] !== FORGE_NAMESPACE) {
      throw new Error(
        `dev overlay object ${String(metadata['name'])} is not in ${FORGE_NAMESPACE}`,
      );
    }
    metadata['name'] = object['kind'] === 'PersistentVolumeClaim' ? `${name}-data` : name;
    metadata['labels'] = { ...(isRecord(metadata['labels']) ? metadata['labels'] : {}), ...labels };
    metadata['annotations'] = {
      ...(isRecord(metadata['annotations']) ? metadata['annotations'] : {}),
      [WORKTREE_ANNOTATION]: binding.worktree,
    };
    switch (object['kind']) {
      case 'Pod':
        bindPod(object, binding, labels);
        break;
      case 'Service':
        recordAt(object, 'spec')['selector'] = {
          'app.kubernetes.io/name': 'dev-environment',
          ...labels,
        };
        break;
      case 'Ingress':
        for (const rule of arrayAt(object, 'spec', 'rules')) {
          if (!isRecord(rule)) throw new Error('dev overlay Ingress rule is not an object');
          rule['host'] = binding.host;
          const paths = field(rule, 'http', 'paths');
          if (!Array.isArray(paths)) throw new Error('dev overlay Ingress rule lacks paths');
          for (const path of paths) {
            const service = field(path, 'backend', 'service');
            if (!isRecord(service))
              throw new Error('dev overlay Ingress path lacks a service backend');
            service['name'] = name;
          }
        }
        break;
      case 'NetworkPolicy':
        recordAt(object, 'spec', 'podSelector')['matchLabels'] = {
          'app.kubernetes.io/name': 'dev-environment',
          ...labels,
        };
        break;
    }
    return object;
  });
}

function bindPod(
  pod: ManifestObject,
  binding: EnvironmentBinding,
  labels: Record<string, string>,
): void {
  const metadata = recordAt(pod, 'metadata');
  const containers = arrayAt(pod, 'spec', 'containers');
  if (containers.length !== 1 || field(pod, 'spec', 'initContainers') !== undefined) {
    throw new Error('dev overlay Pod must have exactly one container and no init containers');
  }
  const container = containers[0];
  if (!isRecord(container)) throw new Error('dev overlay container is not an object');
  container['image'] = binding.image;
  const environment = container['env'];
  if (!Array.isArray(environment)) throw new Error('dev overlay container lacks env');
  const bound: Record<string, string> = {
    APP_ORIGIN: binding.origin,
    MCP_PUBLIC_URL: `${binding.origin}/mcp`,
  };
  for (const variable of environment) {
    if (isRecord(variable) && typeof variable['name'] === 'string' && variable['name'] in bound) {
      variable['value'] = bound[variable['name']];
    }
  }
  const volumes = arrayAt(pod, 'spec', 'volumes');
  const byName = new Map(
    volumes.filter(isRecord).map((volume) => [String(volume['name']), volume]),
  );
  const expected = ['data', 'solver-runtime', 'worktree'];
  if (
    volumes.length !== expected.length ||
    !expected.every((volumeName) => byName.has(volumeName))
  ) {
    throw new Error(`dev overlay Pod volumes must be exactly ${expected.join(', ')}`);
  }
  const replacements: Record<string, Record<string, unknown>> = {
    worktree: { name: 'worktree', hostPath: { path: binding.worktreeNodePath, type: 'Directory' } },
    'solver-runtime': {
      name: 'solver-runtime',
      hostPath: { path: binding.solverNodePath, type: 'Directory' },
    },
    data: { name: 'data', persistentVolumeClaim: { claimName: `dev-${binding.slug}-data` } },
  };
  recordAt(pod, 'spec')['volumes'] = expected.map((volumeName) => replacements[volumeName]);
  metadata['labels'] = { ...(isRecord(metadata['labels']) ? metadata['labels'] : {}), ...labels };
  const annotations = recordAt(pod, 'metadata', 'annotations');
  annotations[RECREATE_ANNOTATION] = binding.recreateInputs;
  annotations[POD_SPEC_ANNOTATION] = createHash('sha256')
    .update(JSON.stringify(pod['spec']))
    .update(binding.recreateInputs)
    .digest('hex');
}

/** Digest the recreate inputs as `path\0sha256` lines in path order. */
export function digestRecreateInputs(
  files: readonly { path: string; content: Uint8Array }[],
): string {
  const lines = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}\0${createHash('sha256').update(file.content).digest('hex')}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** Decode `kubectl get pods -o json` into the identities of running environments. */
export function decodeRunningEnvironments(text: string): readonly RunningEnvironment[] {
  const list: unknown = JSON.parse(text);
  const items = field(list, 'items');
  if (!Array.isArray(items)) throw new Error('kubectl pod list has no items');
  return items.map((item) => {
    const slug = field(item, 'metadata', 'labels', SLUG_LABEL);
    const worktree = field(item, 'metadata', 'annotations', WORKTREE_ANNOTATION);
    const containers = field(item, 'spec', 'containers');
    const container: unknown = Array.isArray(containers) ? containers[0] : undefined;
    const image = field(container, 'image');
    const volumes = field(item, 'spec', 'volumes');
    const worktreeVolume: unknown = Array.isArray(volumes)
      ? volumes.find((volume: unknown) => field(volume, 'name') === 'worktree')
      : undefined;
    const worktreeNodePath = field(worktreeVolume, 'hostPath', 'path');
    if (
      typeof slug !== 'string' ||
      typeof worktree !== 'string' ||
      typeof image !== 'string' ||
      typeof worktreeNodePath !== 'string'
    ) {
      throw new Error(
        `forge Pod ${String(field(item, 'metadata', 'name'))} lacks its environment identity`,
      );
    }
    return { slug, worktree, worktreeNodePath, image };
  });
}

interface RunOptions {
  readonly input?: string;
  readonly timeoutMs?: number;
}

async function run(
  executable: string,
  arguments_: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  const child = Bun.spawn([executable, ...arguments_], {
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
      `${executable} ${arguments_.join(' ')} exited ${String(exitCode)}: ${stderr.trim()}`,
    );
  }
  return stdout;
}

async function readLabRecords(root: string): Promise<readonly LabRecord[]> {
  const parent = join(root, '.puni/fleet-labs/k3d');
  let labs: string[];
  try {
    labs = await readdir(parent);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw cause;
  }
  const records: LabRecord[] = [];
  for (const lab of labs) {
    const path = join(parent, lab, 'lab.json');
    try {
      records.push(decodeLabRecord(await readFile(path, 'utf8')));
    } catch (cause) {
      // A lab directory mid-`up` has no record yet; any other failure is a broken record.
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw new Error(`${path} is unreadable`, { cause });
    }
  }
  return records;
}

async function inspectWorktree(requested: string): Promise<WorktreeInspection> {
  const real = await realpath(requested);
  const status = await lstat(real);
  if (!status.isDirectory()) throw new Error(`${real} is not a directory`);
  const topLevel = (await run('git', ['-C', real, 'rev-parse', '--show-toplevel'])).trim();
  const rootCommits = (await run('git', ['-C', real, 'rev-list', '--max-parents=0', 'HEAD']))
    .split('\n')
    .filter((line) => line !== '');
  return {
    requested,
    realpath: real,
    ownerUid: status.uid,
    topLevel: await realpath(topLevel),
    rootCommits,
  };
}

async function requireSeededWorktree(worktree: string): Promise<void> {
  const missing: string[] = [];
  for (const path of [
    'node_modules',
    'apps/wbs/be-01/.env',
    'apps/wbs/gw-01/.env',
    'apps/wbs/fe-01/.env',
  ]) {
    try {
      await lstat(join(worktree, path));
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') missing.push(path);
      else throw cause;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${worktree} is not ready to serve: missing ${missing.join(', ')}. Run \`bun install && bun run dev:setup\` there first.`,
    );
  }
}

async function readRecreateInputs(worktree: string): Promise<string> {
  const files: { path: string; content: Uint8Array }[] = [];
  for (const path of K3S_RECREATE_PATHS) {
    const absolute = join(worktree, path);
    const status = await lstat(absolute);
    const members = status.isDirectory()
      ? (await readdir(absolute, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => join(entry.parentPath, entry.name))
      : [absolute];
    for (const member of members) {
      files.push({ path: relative(worktree, member), content: await readFile(member) });
    }
  }
  return digestRecreateInputs(files);
}

interface Cluster {
  readonly record: LabRecord;
  readonly cluster: LabCluster;
  kubectl(arguments_: readonly string[], options?: RunOptions): Promise<string>;
}

async function connect(root: string, clusterName: string): Promise<Cluster> {
  const { record, cluster } = findForgeCluster(await readLabRecords(root), clusterName);
  const kubectlPath = process.env['KUBECTL'] ?? 'kubectl';
  const kubectl = (arguments_: readonly string[], options?: RunOptions): Promise<string> =>
    run(
      kubectlPath,
      ['--kubeconfig', cluster.kubeconfig, '--context', cluster.context, ...arguments_],
      options,
    );
  const marker = await kubectl([
    'get',
    'configmap',
    `puni-cluster-${cluster.clusterId}`,
    '--namespace=kube-system',
    '-o',
    'json',
  ]);
  if (field(JSON.parse(marker), 'metadata', 'labels', LAB_LABEL) !== record.labId) {
    // Proof: with this comparison removed, `status` against a marker relabelled to another lab
    // printed the environment instead of refusing (live k3d, 2026-09-18).
    throw new Error(
      `${clusterName}'s kubeconfig reaches a cluster that lab ${record.labId} does not own`,
    );
  }
  return { record, cluster, kubectl };
}

async function runningEnvironments(cluster: Cluster): Promise<readonly RunningEnvironment[]> {
  return decodeRunningEnvironments(
    await cluster.kubectl([
      'get',
      'pods',
      `--namespace=${FORGE_NAMESPACE}`,
      '-l',
      SLUG_LABEL,
      '-o',
      'json',
    ]),
  );
}

async function readAdmissionParameters(cluster: Cluster): Promise<AdmissionParameters> {
  const configMap: unknown = JSON.parse(
    await cluster.kubectl([
      'get',
      'configmap',
      'puni-trusted-workload',
      '--namespace=wbs-solver',
      '-o',
      'json',
    ]),
  );
  // Proof: with this comparison removed, `up` patched parameters that had lost the lab label
  // instead of refusing (live k3d, 2026-09-18).
  if (field(configMap, 'metadata', 'labels', LAB_LABEL) !== cluster.record.labId) {
    throw new Error(
      'wbs-solver/puni-trusted-workload is not owned by this lab; outside a lab, forge roots and ' +
        'images are reviewed changes to infra/platform/policy, not something dev-env writes',
    );
  }
  const forgeImage = field(configMap, 'data', 'forgeImage');
  const roots = field(configMap, 'data', 'forgeWorktreeRoots');
  if (typeof forgeImage !== 'string' || typeof roots !== 'string') {
    throw new Error('wbs-solver/puni-trusted-workload lacks forgeImage or forgeWorktreeRoots');
  }
  return { forgeImage, forgeWorktreeRoots: roots.split(',').filter((root) => root !== '') };
}

async function writeAdmissionParameters(
  cluster: Cluster,
  parameters: AdmissionParameters,
): Promise<void> {
  await cluster.kubectl([
    'patch',
    'configmap',
    'puni-trusted-workload',
    '--namespace=wbs-solver',
    '--type=merge',
    '-p',
    JSON.stringify({
      data: {
        forgeImage: parameters.forgeImage,
        forgeWorktreeRoots: parameters.forgeWorktreeRoots.join(','),
      },
    }),
  ]);
}

async function publishForgeImage(
  worktree: string,
  cluster: Cluster,
  slug: string,
): Promise<string> {
  const context = join(worktree, 'deploy/dev-src');
  const local = `puni-dev-environment:${cluster.record.labId}`;
  // BuildKit attestations carry build timestamps, so with them every rebuild of an unchanged
  // Dockerfile pushes a new digest. The forge admits one image and `up` compares digests.
  // Proof: without these two flags, rerunning `up` on an unchanged worktree pushed a new digest
  // and recreated the running Pod on k3d (2026-09-18); with them two builds shared one digest.
  await run('docker', [
    'build',
    '--quiet',
    '--provenance=false',
    '--sbom=false',
    '-f',
    join(context, 'Dockerfile'),
    '-t',
    local,
    context,
  ]);
  const pushed = `127.0.0.1:${String(cluster.record.registry.hostPort)}/dev-environment:${slug}`;
  await run('docker', ['tag', local, pushed]);
  const output = await run('docker', ['push', pushed]);
  const digest = /digest: (sha256:[0-9a-f]{64})/.exec(output)?.[1];
  if (digest === undefined) throw new Error(`docker push printed no digest: ${output}`);
  return `${cluster.record.registry.host}:5000/dev-environment@${digest}`;
}

function urlsOf(slug: string, record: LabRecord): readonly string[] {
  const origin = `http://${slug}.localhost:${String(record.httpPort)}`;
  return [
    `  web:     ${origin}/  (Vite, HMR over the same origin)`,
    `  api:     ${origin}/api/  (be-01 through Vite's edge proxy)`,
    `  gateway: ${origin.replace('http', 'ws')}/ws`,
    `  mcp:     ${origin}/mcp`,
  ];
}

async function up(root: string, request: DevEnvironmentRequest): Promise<void> {
  if (request.worktree === undefined) throw new Error('dev-env up requires --worktree');
  const cluster = await connect(root, request.cluster);
  const uid = process.getuid?.();
  if (uid === undefined)
    throw new Error('dev-env needs a POSIX user ID to check worktree ownership');
  const repositoryRoots = (await run('git', ['-C', root, 'rev-list', '--max-parents=0', 'HEAD']))
    .split('\n')
    .filter((line) => line !== '');
  const inspection = await inspectWorktree(request.worktree);
  const worktreeNodePath = requireOwnedWorktree(inspection, {
    prefix: await realpath(cluster.record.worktreeRoot),
    uid,
    rootCommits: repositoryRoots,
  });
  const worktree = inspection.realpath;
  const running = await runningEnvironments(cluster);
  requireUniqueEnvironment(request.slug, worktree, running);
  await requireSeededWorktree(worktree);

  const recreateInputs = await readRecreateInputs(worktree);
  const image = await publishForgeImage(worktree, cluster, request.slug);
  const origin = `http://${request.slug}.localhost:${String(cluster.record.httpPort)}`;
  const rendered = Bun.YAML.parse(
    await cluster.kubectl(['kustomize', join(worktree, 'deploy/k8s/wbs/overlays/dev')]),
  );
  const objects = (Array.isArray(rendered) ? rendered : [rendered]).filter(isRecord);
  const bound = bindEnvironment(objects, {
    slug: request.slug,
    labId: cluster.record.labId,
    image,
    worktree,
    worktreeNodePath,
    solverNodePath: SOLVER_NODE_PATH,
    host: `${request.slug}.localhost`,
    origin,
    recreateInputs,
  });

  const parameters = nextAdmissionParameters(
    await readAdmissionParameters(cluster),
    { kind: 'start', slug: request.slug, image, roots: [worktreeNodePath, SOLVER_NODE_PATH] },
    running,
  );
  await writeAdmissionParameters(cluster, parameters);

  const pod = bound.find((object) => object['kind'] === 'Pod');
  if (pod === undefined) throw new Error('bound dev overlay has no Pod');
  const others = bound.filter((object) => object !== pod);
  await cluster.kubectl(['apply', '--server-side', '-f', '-'], {
    input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items: others }),
  });
  const podName = `dev-${request.slug}`;
  const wanted = field(pod, 'metadata', 'annotations', POD_SPEC_ANNOTATION);
  const existing = await cluster.kubectl([
    'get',
    'pods',
    `--namespace=${FORGE_NAMESPACE}`,
    '-l',
    `${SLUG_LABEL}=${request.slug}`,
    '-o',
    'json',
  ]);
  const current = existingPodFingerprint(existing);
  if (current !== undefined && current !== wanted) {
    console.log(`[dev-env] ${podName}: recreate inputs or bound spec changed; recreating the Pod`);
    await cluster.kubectl([
      'delete',
      'pod',
      podName,
      `--namespace=${FORGE_NAMESPACE}`,
      '--as',
      FORGE_CONTROLLER,
      '--wait=true',
    ]);
  }
  if (current !== wanted) {
    // The forge Role grants Pod creation to the controller service account only; creating as it
    // proves the environment would start without cluster-admin.
    await cluster.kubectl(['create', '--as', FORGE_CONTROLLER, '-f', '-'], {
      input: JSON.stringify(pod),
    });
  }
  await cluster.kubectl(
    [
      'wait',
      '--for=condition=Ready',
      `pod/${podName}`,
      `--namespace=${FORGE_NAMESPACE}`,
      '--timeout=600s',
    ],
    { timeoutMs: 11 * 60 * 1000 },
  );
  console.log(
    [
      `[dev-env] ${request.slug} is serving ${worktree}`,
      ...urlsOf(request.slug, cluster.record),
    ].join('\n'),
  );
}

async function down(root: string, request: DevEnvironmentRequest): Promise<void> {
  const cluster = await connect(root, request.cluster);
  const running = await runningEnvironments(cluster);
  const environment = running.find((candidate) => candidate.slug === request.slug);
  // Ownership of the admission parameters is checked before anything is deleted, so a refused
  // teardown leaves the environment whole rather than running roots behind.
  // Proof: with the read after the deletes, a live `down` against parameters without the lab
  // label deleted dev-beta and then refused, leaving its root admitted (2026-09-18).
  const parameters =
    environment === undefined
      ? undefined
      : nextAdmissionParameters(
          await readAdmissionParameters(cluster),
          {
            kind: 'stop',
            slug: request.slug,
            roots: [environment.worktreeNodePath, SOLVER_NODE_PATH],
          },
          running,
        );
  const selector = `${SLUG_LABEL}=${request.slug},${LAB_LABEL}=${cluster.record.labId}`;
  await cluster.kubectl([
    'delete',
    'pods',
    `--namespace=${FORGE_NAMESPACE}`,
    '-l',
    selector,
    '--as',
    FORGE_CONTROLLER,
    '--wait=true',
  ]);
  await cluster.kubectl([
    'delete',
    'ingress,service,networkpolicy,persistentvolumeclaim',
    `--namespace=${FORGE_NAMESPACE}`,
    '-l',
    selector,
    '--wait=true',
  ]);
  if (parameters !== undefined) await writeAdmissionParameters(cluster, parameters);
  console.log(
    `[dev-env] ${request.slug}: deleted its Pod, Service, Ingress, NetworkPolicy and database volume` +
      (environment === undefined ? ' (no running Pod; admitted roots left unchanged)' : ''),
  );
}

async function status(root: string, request: DevEnvironmentRequest): Promise<void> {
  const cluster = await connect(root, request.cluster);
  const pods: unknown = JSON.parse(
    await cluster.kubectl([
      'get',
      'pods',
      `--namespace=${FORGE_NAMESPACE}`,
      '-l',
      `${SLUG_LABEL}=${request.slug}`,
      '-o',
      'json',
    ]),
  );
  const pod = field(pods, 'items', '0');
  if (pod === undefined) {
    console.log(`[dev-env] ${request.slug}: not running on ${request.cluster}`);
    return;
  }
  const worktree = field(pod, 'metadata', 'annotations', WORKTREE_ANNOTATION);
  const recorded = field(pod, 'metadata', 'annotations', RECREATE_ANNOTATION);
  if (typeof worktree !== 'string')
    throw new Error(`dev-${request.slug} lacks its worktree annotation`);
  const drift = (await readRecreateInputs(worktree)) !== recorded;
  const phase = field(pod, 'status', 'phase');
  const ready = field(pod, 'status', 'containerStatuses', '0', 'ready');
  const restarts = field(pod, 'status', 'containerStatuses', '0', 'restartCount');
  console.log(
    [
      `[dev-env] ${request.slug}: ${String(phase)}, ready=${String(ready)}, container restarts=${String(restarts)}`,
      `  worktree: ${worktree}`,
      ...(drift
        ? [
            `  RECREATE REQUIRED: ${K3S_RECREATE_PATHS.join(' or ')} changed since this Pod was created;`,
            '  a restart cannot apply it. Run dev-env up again to recreate the Pod (the database volume stays).',
          ]
        : []),
      ...urlsOf(request.slug, cluster.record),
    ].join('\n'),
  );
  if (drift) process.exitCode = 3;
}

export async function runDevEnvironment(
  arguments_: readonly string[],
  root: string,
): Promise<void> {
  const request = parseDevEnvironmentRequest(arguments_);
  switch (request.action) {
    case 'up':
      await up(root, request);
      return;
    case 'down':
      await down(root, request);
      return;
    case 'status':
      await status(root, request);
      return;
  }
}

if (import.meta.main) {
  await runDevEnvironment(process.argv.slice(2), resolve(import.meta.dir, '../../../..'));
}
