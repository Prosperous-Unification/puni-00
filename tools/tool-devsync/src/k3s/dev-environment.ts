#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { type } from 'arktype';

import {
  decodeForgeAdmission,
  type ForgeAdmissionStore,
  SOLVER_NODE_PATH,
  TRUSTED_WORKLOAD,
  TRUSTED_WORKLOAD_NAMESPACE,
  updateForgeAdmission,
} from './forge-admission';
import { claimLease, claimLeaseNames, decodeClaimLease, requireOwnClaim } from './forge-claims';
import { INSTALL_REQUIRED } from './forge-supervisor';

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
  worktreeRootIdentity: /^\d+:\d+$/,
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
  readonly ownerGid: number;
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
  /** The worktree owner; the Pod runs as them so files it writes stay theirs. */
  readonly ownerUid: number;
  readonly ownerGid: number;
}

type ManifestObject = Record<string, unknown>;

export const FORGE_NAMESPACE = 'puni-forge';
export const FORGE_CONTROLLER = `system:serviceaccount:${FORGE_NAMESPACE}:dev-environment-controller`;
export const WORKTREE_NODE_ROOT = '/srv/puni/worktrees';
export { SOLVER_NODE_PATH };
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
 * One worktree, one slug, checked against running Pods for an early, readable refusal. It is a
 * check, not a lock: the claim Leases (`forge-claims.ts`) are what two racing `up`s contend on.
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
  // Proof: with this guard replaced by an empty-string check, `refuses a forge image that is not
  // digest-pinned` failed on a clean overlay (the earlier test passed on a broken namespace).
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
  // Proof: with this refusal removed, `refuses to run as root` failed; the forge admission would
  // deny the Pod only after the lab parameters had been rewritten.
  if (binding.ownerUid === 0 || binding.ownerGid === 0) {
    throw new Error('dev-env refuses a worktree owned by root; the forge runs as its owner');
  }
  // Proof: with this binding removed, `runs the Pod as the worktree owner` failed: the Pod kept
  // the overlay's UID 1000 and would write foreign-owned node_modules into another user's tree.
  recordAt(pod, 'spec', 'securityContext')['runAsUser'] = binding.ownerUid;
  recordAt(pod, 'spec', 'securityContext')['runAsGroup'] = binding.ownerGid;
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

/**
 * The supervisor's install failure, if the container's current or last termination reported one
 * through its termination message (`forge-supervisor.ts`).
 */
export function installFailureOf(pod: unknown): string | undefined {
  for (const state of ['state', 'lastState']) {
    const message = field(pod, 'status', 'containerStatuses', '0', state, 'terminated', 'message');
    if (typeof message === 'string' && message.startsWith(INSTALL_REQUIRED)) return message;
  }
  return undefined;
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

interface CommandOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run a bounded subprocess and return its outcome; the caller models non-zero exits. */
async function attempt(
  executable: string,
  arguments_: readonly string[],
  options: RunOptions = {},
): Promise<CommandOutcome> {
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
  return { exitCode, stdout, stderr };
}

async function run(
  executable: string,
  arguments_: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  const outcome = await attempt(executable, arguments_, options);
  if (outcome.exitCode !== 0) {
    throw new Error(
      `${executable} ${arguments_.join(' ')} exited ${String(outcome.exitCode)}: ${outcome.stderr.trim()}`,
    );
  }
  return outcome.stdout;
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
    ownerGid: status.gid,
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
  attempt(arguments_: readonly string[], options?: RunOptions): Promise<CommandOutcome>;
}

async function connect(root: string, clusterName: string): Promise<Cluster> {
  const { record, cluster } = findForgeCluster(await readLabRecords(root), clusterName);
  const kubectlPath = process.env['KUBECTL'] ?? 'kubectl';
  const scoped = (arguments_: readonly string[]): readonly string[] => [
    '--kubeconfig',
    cluster.kubeconfig,
    '--context',
    cluster.context,
    ...arguments_,
  ];
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
  return {
    record,
    cluster,
    kubectl,
    attempt: (arguments_, options) => attempt(kubectlPath, scoped(arguments_), options),
  };
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

/** A store over the live ConfigMap: read it, and replace it only at the version read. */
function admissionStore(cluster: Cluster): ForgeAdmissionStore {
  const location = [TRUSTED_WORKLOAD, `--namespace=${TRUSTED_WORKLOAD_NAMESPACE}`];
  return {
    read: async () =>
      JSON.parse(await cluster.kubectl(['get', 'configmap', ...location, '-o', 'json'])) as unknown,
    replace: async (object) => {
      const outcome = await cluster.attempt(['replace', '-f', '-'], {
        input: JSON.stringify(object),
      });
      if (outcome.exitCode === 0) return 'replaced';
      if (outcome.stderr.includes('(Conflict)')) return 'conflict';
      throw new Error(`kubectl replace ${TRUSTED_WORKLOAD} failed: ${outcome.stderr.trim()}`);
    },
  };
}

/**
 * Create both claim Leases, or accept them when they already name this pair.
 *
 * @throws When either Lease names another pair; a Lease this run created is deleted first.
 */
async function claimEnvironment(cluster: Cluster, slug: string, worktree: string): Promise<void> {
  const created: string[] = [];
  try {
    for (const name of claimLeaseNames({ slug, worktree })) {
      const lease = claimLease(name, FORGE_NAMESPACE, cluster.record.labId, { slug, worktree });
      const outcome = await cluster.attempt(['create', '-f', '-'], {
        input: JSON.stringify(lease),
      });
      if (outcome.exitCode === 0) {
        created.push(name);
        continue;
      }
      if (!outcome.stderr.includes('(AlreadyExists)')) {
        throw new Error(`kubectl create lease ${name} failed: ${outcome.stderr.trim()}`);
      }
      const existing: unknown = JSON.parse(
        await cluster.kubectl([
          'get',
          'lease',
          name,
          `--namespace=${FORGE_NAMESPACE}`,
          '-o',
          'json',
        ]),
      );
      requireOwnClaim(decodeClaimLease(existing), { slug, worktree });
    }
  } catch (cause) {
    for (const name of created) {
      await cluster.kubectl([
        'delete',
        'lease',
        name,
        `--namespace=${FORGE_NAMESPACE}`,
        '--ignore-not-found',
      ]);
    }
    throw cause;
  }
}

async function publishForgeImage(
  worktree: string,
  cluster: Cluster,
  slug: string,
): Promise<string> {
  const context = join(worktree, 'deploy/dev-src');
  // One tag per environment, so concurrent `up`s never retag each other's build.
  const local = `puni-dev-environment:${cluster.record.labId}-${slug}`;
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
  // Both tags name this run only; the layers stay in the build cache for the next `up`.
  await run('docker', ['rmi', pushed, local]);
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

/** `st_dev:st_ino` of a directory, the identity `lab up` recorded for the mounted root. */
export async function directoryIdentity(path: string): Promise<string> {
  const status = await stat(path, { bigint: true });
  return `${String(status.dev)}:${String(status.ino)}`;
}

/**
 * Refuse when the worktree root is no longer the directory the k3d node mounted.
 *
 * A root moved aside and recreated at the same path passes every path check, while the node
 * still serves the old directory: pods would run code the user is not editing.
 */
export function requireMountedRoot(recorded: string, observed: string, root: string): void {
  // Proof: with this comparison removed, `refuses a root replaced after lab up` failed; live, a
  // root moved aside and recreated made `up` refuse only with it (k3s-platform verify.md).
  if (recorded !== observed) {
    throw new Error(
      `${root} is not the directory the lab mounted (recorded ${recorded}, now ${observed}); ` +
        'recreate the lab to mount it again',
    );
  }
}

async function up(root: string, request: DevEnvironmentRequest): Promise<void> {
  if (request.worktree === undefined) throw new Error('dev-env up requires --worktree');
  const cluster = await connect(root, request.cluster);
  const uid = process.getuid?.();
  if (uid === undefined)
    throw new Error('dev-env needs a POSIX user ID to check worktree ownership');
  const prefix = await realpath(cluster.record.worktreeRoot);
  requireMountedRoot(cluster.record.worktreeRootIdentity, await directoryIdentity(prefix), prefix);
  const repositoryRoots = (await run('git', ['-C', root, 'rev-list', '--max-parents=0', 'HEAD']))
    .split('\n')
    .filter((line) => line !== '');
  const inspection = await inspectWorktree(request.worktree);
  const worktreeNodePath = requireOwnedWorktree(inspection, {
    prefix,
    uid,
    rootCommits: repositoryRoots,
  });
  const worktree = inspection.realpath;
  requireUniqueEnvironment(request.slug, worktree, await runningEnvironments(cluster));
  await requireSeededWorktree(worktree);
  // The claim is the lock: nothing below runs for a pair another environment holds.
  await claimEnvironment(cluster, request.slug, worktree);

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
    ownerUid: inspection.ownerUid,
    ownerGid: inspection.ownerGid,
  });
  const pod = bound.find((object) => object['kind'] === 'Pod');
  if (pod === undefined) throw new Error('bound dev overlay has no Pod');
  const others = bound.filter((object) => object !== pod);

  const store = admissionStore(cluster);
  const { before } = await updateForgeAdmission(store, cluster.record.labId, {
    kind: 'claim',
    slug: request.slug,
    root: worktreeNodePath,
    image,
  });
  const podName = `dev-${request.slug}`;
  try {
    await cluster.kubectl(['apply', '--server-side', '-f', '-'], {
      input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items: others }),
    });
    const wanted = field(pod, 'metadata', 'annotations', POD_SPEC_ANNOTATION);
    const current = existingPodFingerprint(
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
    if (current !== undefined && current !== wanted) {
      console.log(
        `[dev-env] ${podName}: recreate inputs or bound spec changed; recreating the Pod`,
      );
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
      // The forge Role grants Pod creation to the controller service account only; creating as
      // it proves the environment would start without cluster-admin.
      await cluster.kubectl(['create', '--as', FORGE_CONTROLLER, '-f', '-'], {
        input: JSON.stringify(pod),
      });
    }
  } catch (cause) {
    // Proof: without this restore, a live `up` whose Pod create was denied left its root and
    // image admitted; with it the parameters matched their pre-`up` state (k3s-platform verify.md).
    await updateForgeAdmission(store, cluster.record.labId, {
      kind: 'restore',
      slug: request.slug,
      previous: before,
    });
    throw cause;
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
  const store = admissionStore(cluster);
  // Ownership of the parameters is checked before anything is deleted, so a refused teardown
  // leaves the environment whole rather than its roots admitted behind it.
  // Proof: with the read after the deletes, a live `down` against parameters without the lab
  // label deleted dev-beta and then refused, leaving its root admitted (2026-09-18).
  await store.read().then((configMap) => {
    decodeForgeAdmission(configMap, cluster.record.labId);
  });
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
  // Released by slug, so a root stays admitted only while its environment's claim exists, even
  // when the Pod was already gone.
  // Proof: releasing only for a running Pod left dev-gone's root admitted after its Pod was
  // deleted by hand; by slug, `down` removed it (live k3d, k3s-platform verify.md).
  await updateForgeAdmission(store, cluster.record.labId, {
    kind: 'release',
    slug: request.slug,
  });
  await cluster.kubectl([
    'delete',
    'lease',
    `--namespace=${FORGE_NAMESPACE}`,
    '-l',
    selector,
    '--ignore-not-found',
  ]);
  console.log(
    `[dev-env] ${request.slug}: deleted its Pod, Service, Ingress, NetworkPolicy, database ` +
      'volume and claim, and released its admitted root',
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
  const install = installFailureOf(pod);
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
      ...(install === undefined
        ? []
        : [
            `  INSTALL REQUIRED: ${install}`,
            '  the tiers are not running; fix bun.lock or the install, and the container retries it.',
          ]),
      ...urlsOf(request.slug, cluster.record),
    ].join('\n'),
  );
  if (install !== undefined) process.exitCode = 4;
  else if (drift) process.exitCode = 3;
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
