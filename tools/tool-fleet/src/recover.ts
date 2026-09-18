import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { readToolchain } from './contracts';

const recoverableClusters = [
  'platform-local',
  'platform-production',
  'workers-local',
  'workers-production',
] as const;

const Sha256 = type(/^[0-9a-f]{64}$/);
const DigestReference = type(/^[a-z0-9.:/-]+@sha256:[0-9a-f]{64}$/);

const StoreSchema = type({
  kind: "'sqlite'",
  reportKey: 'string>0',
  reportSha256: Sha256,
  knownRow: { table: /^[a-z_]+$/, id: 'string>0', '+': 'reject' },
  '+': 'reject',
})
  .or({ kind: "'velero'", backup: 'string>0', namespace: 'string>0', '+': 'reject' })
  .or({
    kind: "'elastic'",
    repository: 'string>0',
    snapshot: 'string>0',
    query: 'string>0',
    '+': 'reject',
  })
  .or({ kind: "'registry'", images: DigestReference.array().atLeastLength(1), '+': 'reject' });

const RecoveryManifestSchema = type({
  schemaVersion: '1',
  clusterId: type.enumerated(...recoverableClusters),
  k3sVersion: /^v\d+\.\d+\.\d+\+k3s\d+$/,
  sourceRevision: /^[0-9a-f]{40}$/,
  tokenSha256: Sha256,
  sopsRecipient: /^age1[02-9ac-hj-np-z]{58}$/,
  // The etcd members when the snapshot was taken: every one must be fenced before a restore.
  etcdMembers: type(/^[a-z0-9][a-z0-9.-]*$/)
    .array()
    .atLeastLength(1),
  etcdSnapshot: {
    name: 'string>0',
    objectKey: 'string>0',
    sha256: Sha256,
    bytes: 'number.integer>0',
    '+': 'reject',
  },
  stores: StoreSchema.array(),
  '+': 'reject',
});

export type RecoveryManifest = typeof RecoveryManifestSchema.infer;
export type RecoveryStore = RecoveryManifest['stores'][number];

/** Decode a recorded recovery manifest; unknown keys and inexact identities throw. */
export function decodeRecoveryManifest(input: unknown): RecoveryManifest {
  const manifest = RecoveryManifestSchema(input);
  if (manifest instanceof type.errors) {
    throw new Error(`Recovery manifest is invalid: ${manifest.summary}`);
  }
  return manifest;
}

/** Evidence that one original server cannot resume and write to the store being restored. */
export interface ServerFence {
  readonly nodeName: string;
  readonly providerIdentity: string;
  readonly state: 'powered-off' | 'deleted' | 'running';
  readonly fenceId: string;
}

const ServerFenceSchema = type({
  nodeName: 'string>0',
  providerIdentity: 'string>0',
  state: "'powered-off' | 'deleted' | 'running'",
  fenceId: 'string',
  '+': 'reject',
});

/** Decode operator-recorded fence evidence for the original servers. */
export function decodeServerFences(input: unknown): readonly ServerFence[] {
  const fences = ServerFenceSchema.array()(input);
  if (fences instanceof type.errors)
    throw new Error(`Fence evidence is invalid: ${fences.summary}`);
  return fences;
}

const bech32Alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: readonly number[]): number {
  const generators = [0x3b_6a_57_b2, 0x26_50_8e_6d, 0x1e_a1_19_fa, 0x3d_42_33_dd, 0x2a_14_62_b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1_ff_ff_ff) << 5) ^ value;
    for (const [bit, generator] of generators.entries()) {
      if ((top >>> bit) & 1) checksum ^= generator;
    }
  }
  return checksum >>> 0;
}

function expandPrefix(prefix: string): number[] {
  const codes = Array.from({ length: prefix.length }, (_, index) => prefix.charCodeAt(index));
  return [...codes.map((code) => code >>> 5), 0, ...codes.map((code) => code & 31)];
}

function regroupBits(values: readonly number[], from: number, to: number, pad: boolean): number[] {
  let accumulator = 0;
  let bits = 0;
  const regrouped: number[] = [];
  for (const value of values) {
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      regrouped.push((accumulator >>> bits) & ((1 << to) - 1));
    }
  }
  if (pad && bits > 0) regrouped.push((accumulator << (to - bits)) & ((1 << to) - 1));
  else if (!pad && (bits >= from || ((accumulator << (to - bits)) & ((1 << to) - 1)) !== 0)) {
    throw new Error('bech32 payload has non-zero padding');
  }
  return regrouped;
}

export function decodeBech32(encoded: string): { prefix: string; bytes: Uint8Array } {
  const lower = encoded.toLowerCase();
  const separator = lower.lastIndexOf('1');
  if (separator < 1) throw new Error('bech32 value has no separator');
  const prefix = lower.slice(0, separator);
  const data = lower.slice(separator + 1);
  const words = Array.from({ length: data.length }, (_, index) => {
    const position = bech32Alphabet.indexOf(data.charAt(index));
    if (position < 0) throw new Error('bech32 value has an invalid character');
    return position;
  });
  if (words.length < 6 || bech32Polymod([...expandPrefix(prefix), ...words]) !== 1) {
    throw new Error('bech32 checksum is invalid');
  }
  return { prefix, bytes: Uint8Array.from(regroupBits(words.slice(0, -6), 5, 8, false)) };
}

export function encodeBech32(prefix: string, bytes: Uint8Array): string {
  const words = regroupBits([...bytes], 8, 5, true);
  const polymod = bech32Polymod([...expandPrefix(prefix), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, index) => (polymod >>> (5 * (5 - index))) & 31);
  return `${prefix}1${[...words, ...checksum].map((word) => bech32Alphabet[word]).join('')}`;
}

/**
 * Derive the age recipient (`age1…`) of an escrowed X25519 identity file.
 *
 * Comment lines are ignored; exactly one `AGE-SECRET-KEY-1…` line is required. Throws on a
 * malformed identity instead of guessing, because a wrong key only fails later inside Flux.
 */
export function ageRecipientOf(identityFile: string): string {
  const identities = identityFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (identities.length !== 1) throw new Error('SOPS age identity file must hold exactly one key');
  const { prefix, bytes } = decodeBech32(identities[0] ?? '');
  if (prefix !== 'age-secret-key-' || bytes.length !== 32) {
    throw new Error('SOPS age identity is not an X25519 age secret key');
  }
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), bytes]);
  const publicKey = createPublicKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }))
    .export({ format: 'der', type: 'spki' })
    .subarray(-32);
  return encodeBech32('age', publicKey);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Everything a cold restore consumes. `undefined` means the operator could not supply it. */
export interface ColdRestoreInputs {
  readonly targetClusterId: string;
  readonly manifest: RecoveryManifest;
  readonly lockedK3sVersion: string;
  readonly token: string | undefined;
  readonly sopsIdentity: string | undefined;
  readonly snapshot: Uint8Array | undefined;
  readonly fences: readonly ServerFence[];
}

export interface RecoveryStep {
  readonly id: string;
  readonly action: string;
}

export interface ColdRestorePlan {
  readonly clusterId: string;
  readonly snapshotName: string;
  readonly snapshotSha256: string;
  readonly tokenSha256: string;
  readonly sourceRevision: string;
  readonly fencedServers: readonly string[];
  readonly steps: readonly RecoveryStep[];
}

function storeSteps(store: RecoveryStore): RecoveryStep[] {
  switch (store.kind) {
    case 'sqlite':
      return [
        {
          id: 'restore-sqlite',
          action: `restore ${store.reportKey} (report sha256 ${store.reportSha256}) into a new PVC with backup-sqlite.ts restore and RESTORE_REPORT_SHA256`,
        },
        {
          id: 'verify-sqlite',
          action: `read ${store.knownRow.table} row ${store.knownRow.id} and the exact migration set`,
        },
      ];
    case 'velero':
      return [
        {
          id: `restore-velero-${store.namespace}`,
          action: `restore Velero backup ${store.backup} into a mapped namespace, inspect, then adopt`,
        },
      ];
    case 'elastic':
      return [
        {
          id: 'verify-elastic',
          action: `query ${store.query} after restoring ${store.repository}/${store.snapshot} under a new name`,
        },
      ];
    case 'registry':
      return [
        {
          id: 'verify-registry',
          action: `pull ${String(store.images.length)} recorded image digests through the recovered registry`,
        },
      ];
  }
}

/**
 * Validate every cold-restore input and return the ordered restore operation.
 *
 * Refuses, before any host is touched, when the escrowed k3s token or SOPS age identity is
 * missing or differs from the manifest fingerprint, when the snapshot is absent, belongs to
 * another cluster, or differs from its recorded size and SHA-256 (a corrupt archive), when the
 * locked k3s version differs, or when any original server is not fenced. A refusal is the
 * only alternative to a restore: an empty rebootstrap over production is never planned.
 */
export function planColdRestore(inputs: ColdRestoreInputs): ColdRestorePlan {
  const { manifest } = inputs;
  if (inputs.token === undefined || inputs.token.trim().length === 0) {
    // Proof: with this refusal removed, the missing-token planner negative and the CLI negative
    // (absent token file) both failed on 2026-09-18.
    throw new Error('Cold restore refused: the escrowed k3s server token is missing');
  }
  if (inputs.sopsIdentity === undefined || inputs.sopsIdentity.trim().length === 0) {
    // Proof: with this refusal removed, the missing-SOPS-key recover.test.ts negative planned a
    // restore whose secrets stage could never decrypt.
    throw new Error('Cold restore refused: the escrowed SOPS age identity is missing');
  }
  if (manifest.clusterId !== inputs.targetClusterId) {
    throw new Error(
      `Cold restore refused: manifest is for ${manifest.clusterId}, not ${inputs.targetClusterId}`,
    );
  }
  if (manifest.k3sVersion !== inputs.lockedK3sVersion) {
    // Proof: with this comparison removed, the version-skew negative planned a restore with an
    // unlocked k3s binary.
    throw new Error(
      `Cold restore refused: snapshot was taken by ${manifest.k3sVersion}, the lock is ${inputs.lockedK3sVersion}`,
    );
  }
  if (sha256(inputs.token.trim()) !== manifest.tokenSha256) {
    // Proof: with this comparison removed, the wrong-token negative planned a restore that k3s
    // could not decrypt its bootstrap data with.
    throw new Error('Cold restore refused: the k3s token differs from the escrowed fingerprint');
  }
  if (ageRecipientOf(inputs.sopsIdentity) !== manifest.sopsRecipient) {
    // Proof: with this comparison removed, the other-cluster SOPS key negative planned a restore.
    throw new Error('Cold restore refused: the SOPS identity does not decrypt this cluster');
  }
  const snapshot = manifest.etcdSnapshot;
  if (!snapshot.objectKey.startsWith(`${manifest.clusterId}/`)) {
    // Proof: with this guard removed, the foreign-folder snapshot negative planned a restore.
    throw new Error(
      `Cold restore refused: ${snapshot.objectKey} is not a ${manifest.clusterId} snapshot`,
    );
  }
  if (inputs.snapshot === undefined) {
    throw new Error(`Cold restore refused: etcd snapshot ${snapshot.name} is missing`);
  }
  if (
    inputs.snapshot.byteLength !== snapshot.bytes ||
    sha256(inputs.snapshot) !== snapshot.sha256
  ) {
    // Proof: with this comparison removed, the flipped-byte and truncated snapshot negative
    // failed on 2026-09-18.
    throw new Error(
      `Cold restore refused: etcd snapshot ${snapshot.name} differs from its recorded size and SHA-256`,
    );
  }
  if (inputs.fences.length === 0) {
    throw new Error('Cold restore refused: no fence evidence names the original servers');
  }
  for (const fence of inputs.fences) {
    if (fence.fenceId.length === 0 || fence.state === 'running') {
      // Proof: with this guard removed, the running-original negative planned a second writer.
      throw new Error(`Cold restore refused: original server ${fence.nodeName} is not fenced`);
    }
  }
  const unfenced = manifest.etcdMembers.filter(
    (member) => !inputs.fences.some(({ nodeName }) => nodeName === member),
  );
  if (unfenced.length > 0) {
    // Proof: with this guard removed, the partial-fence negative (two recorded members, one
    // fenced) planned a restore while the other member could keep a quorum of its own.
    throw new Error(
      `Cold restore refused: recorded etcd members without fence evidence: ${unfenced.join(', ')}`,
    );
  }
  const fencedServers = inputs.fences.map(({ nodeName }) => nodeName);
  return {
    clusterId: manifest.clusterId,
    snapshotName: snapshot.name,
    snapshotSha256: snapshot.sha256,
    tokenSha256: manifest.tokenSha256,
    sourceRevision: manifest.sourceRevision,
    fencedServers,
    steps: [
      { id: 'stop-servers', action: 'stop k3s on every replacement server' },
      { id: 'place-token', action: 'write the escrowed token to /etc/rancher/k3s/server-token' },
      {
        id: 'cluster-reset',
        action: `k3s server --cluster-reset --cluster-reset-restore-path=${snapshot.name}`,
      },
      { id: 'start-server', action: 'start k3s on the first server and wait for Ready' },
      {
        id: 'forget-fenced-nodes',
        action: `delete Node objects ${fencedServers.join(', ')} after comparing their names`,
      },
      {
        id: 'volume-attachments',
        action: 'remove stale VolumeAttachments only through remove-attachments with exact IDs',
      },
      { id: 'rebind-volumes', action: 'rebind retained volumes to the new node with plan-rebind' },
      {
        id: 'reconcile',
        action: `recreate sops-age if absent, then flux reconcile puni-cluster at ${manifest.sourceRevision}`,
      },
      ...manifest.stores.flatMap((store) => storeSteps(store)),
      {
        id: 'verify-admission',
        action: 'server-side dry-run the trusted-workload conformance fixtures',
      },
      { id: 'rejoin-servers', action: 'join any further servers one at a time' },
    ],
  };
}

/** One observed `storage.k8s.io/v1` VolumeAttachment. */
export interface ObservedAttachment {
  readonly name: string;
  readonly uid: string;
  readonly nodeName: string;
  readonly persistentVolumeName: string;
  readonly attacher: string;
}

const VolumeAttachmentList = type({
  items: type({
    metadata: { name: 'string>0', uid: 'string>0' },
    spec: {
      attacher: 'string>0',
      nodeName: 'string>0',
      source: { 'persistentVolumeName?': 'string>0' },
    },
  }).array(),
});

/** Decode `kubectl get volumeattachments -o json`; inline-volume sources carry no PV name. */
export function decodeAttachments(input: unknown): readonly ObservedAttachment[] {
  const list = VolumeAttachmentList(input);
  if (list instanceof type.errors) {
    throw new Error(`VolumeAttachment list is invalid: ${list.summary}`);
  }
  return list.items.map(({ metadata, spec }) => ({
    name: metadata.name,
    uid: metadata.uid,
    nodeName: spec.nodeName,
    persistentVolumeName: spec.source.persistentVolumeName ?? '',
    attacher: spec.attacher,
  }));
}

/**
 * Select the one stale VolumeAttachment a fenced restore may delete.
 *
 * Only an attachment whose node and PersistentVolume both equal the request, on a node whose
 * fence evidence proves it cannot resume, is returned. Anything else throws: deleting an
 * attachment is never a remedy for a Pending pod, because a live node would keep writing.
 */
export function planAttachmentRemoval(
  attachments: readonly ObservedAttachment[],
  request: { readonly persistentVolumeName: string; readonly nodeName: string },
  fences: readonly ServerFence[],
): ObservedAttachment {
  const fence = fences.find(({ nodeName }) => nodeName === request.nodeName);
  if (fence === undefined || fence.state === 'running' || fence.fenceId.length === 0) {
    // Proof: with this guard removed, the unfenced-node negative returned the live node's
    // attachment, and on the restored k3d cluster `remove-attachment` deleted the attachment
    // of the running node (2026-09-18); restored, it refused that node.
    throw new Error(`Attachment removal refused: node ${request.nodeName} is not fenced`);
  }
  const matches = attachments.filter(
    ({ nodeName, persistentVolumeName }) =>
      nodeName === request.nodeName && persistentVolumeName === request.persistentVolumeName,
  );
  if (matches.length !== 1) {
    // Proof: replacing the node comparison with a volume-only match made the same-volume,
    // other-node negative select the healthy attachment.
    throw new Error(
      `Attachment removal refused: ${String(matches.length)} attachments match volume ${request.persistentVolumeName} on node ${request.nodeName}`,
    );
  }
  return matches[0];
}

const PersistentVolume = type({
  metadata: { name: 'string>0', uid: 'string>0' },
  spec: {
    'capacity?': 'object',
    'accessModes?': 'string[]',
    'storageClassName?': 'string',
    'volumeMode?': 'string',
    'persistentVolumeReclaimPolicy?': 'string',
    'claimRef?': { namespace: 'string>0', name: 'string>0', uid: 'string>0' },
    'hostPath?': { path: 'string>0' },
    'local?': { path: 'string>0' },
    'csi?': { driver: 'string>0', volumeHandle: 'string>0' },
    'nodeAffinity?': {
      required: {
        nodeSelectorTerms: type({
          matchExpressions: type({ key: 'string', operator: 'string', values: 'string[]' }).array(),
        }).array(),
      },
    },
  },
});

const PersistentVolumeClaim = type({
  metadata: { name: 'string>0', namespace: 'string>0', uid: 'string>0' },
  spec: { 'volumeName?': 'string' },
});

export interface VolumeRebindPlan {
  readonly volumeName: string;
  readonly path: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly replacement: Record<string, unknown>;
}

/**
 * Plan a deliberate rebind of one retained node-local volume to a replacement node.
 *
 * Node affinity is immutable, so the PersistentVolume object is recreated under the same name,
 * path and claim UID with the new node. Refuses a CSI volume (use attachment removal instead), a
 * claim whose UID or volume name differs, a volume whose old node is not fenced, and a reclaim
 * policy other than Retain, which would delete the data when the old object goes.
 */
export function planVolumeRebind(
  volumeInput: unknown,
  claimInput: unknown,
  toNode: string,
  fences: readonly ServerFence[],
): VolumeRebindPlan {
  const volume = PersistentVolume(volumeInput);
  if (volume instanceof type.errors)
    throw new Error(`PersistentVolume is invalid: ${volume.summary}`);
  const claim = PersistentVolumeClaim(claimInput);
  if (claim instanceof type.errors)
    throw new Error(`PersistentVolumeClaim is invalid: ${claim.summary}`);
  const name = volume.metadata.name;
  if (volume.spec.csi !== undefined) {
    throw new Error(
      `Rebind refused: ${name} is a CSI volume; remove its fenced attachment instead`,
    );
  }
  const path = volume.spec.hostPath?.path ?? volume.spec.local?.path;
  if (path === undefined) throw new Error(`Rebind refused: ${name} is not a node-local volume`);
  const claimRef = volume.spec.claimRef;
  if (claimRef === undefined) throw new Error(`Rebind refused: ${name} has no claim`);
  if (
    claimRef.uid !== claim.metadata.uid ||
    claimRef.name !== claim.metadata.name ||
    claimRef.namespace !== claim.metadata.namespace ||
    claim.spec.volumeName !== name
  ) {
    // Proof: with this comparison removed, the recreated-claim negative (same name, new UID)
    // produced a PV that would hand old data to a different claim.
    throw new Error(
      `Rebind refused: ${name} and claim ${claim.metadata.name} are not bound to each other`,
    );
  }
  if (volume.spec.persistentVolumeReclaimPolicy !== 'Retain') {
    // Proof: with this guard removed, the Delete-policy negative planned deleting a PV object
    // whose provisioner then removes the data.
    throw new Error(`Rebind refused: ${name} reclaim policy is not Retain`);
  }
  const nodes = (volume.spec.nodeAffinity?.required.nodeSelectorTerms ?? []).flatMap((term) =>
    term.matchExpressions
      .filter(({ key, operator }) => key === 'kubernetes.io/hostname' && operator === 'In')
      .flatMap(({ values }) => values),
  );
  if (nodes.length !== 1) throw new Error(`Rebind refused: ${name} does not pin exactly one node`);
  const [fromNode] = nodes;
  if (fromNode === toNode) throw new Error(`Rebind refused: ${name} already names ${toNode}`);
  const fence = fences.find(({ nodeName }) => nodeName === fromNode);
  if (fence === undefined || fence.state === 'running' || fence.fenceId.length === 0) {
    // Proof: with this guard removed, the unfenced-old-node negative planned moving a volume
    // away from a node that could still write it.
    throw new Error(`Rebind refused: old node ${fromNode} of ${name} is not fenced`);
  }
  const {
    hostPath,
    local,
    nodeAffinity: _nodeAffinity,
    claimRef: _claimRef,
    ...spec
  } = volume.spec;
  const replacement = {
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: { name, labels: { 'puni.dev/rebound-from': fromNode } },
    spec: {
      ...spec,
      ...(hostPath === undefined ? { local } : { hostPath }),
      claimRef: { namespace: claimRef.namespace, name: claimRef.name, uid: claimRef.uid },
      nodeAffinity: {
        required: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                { key: 'kubernetes.io/hostname', operator: 'In', values: [toNode] },
              ],
            },
          ],
        },
      },
    },
  };
  return {
    volumeName: name,
    path,
    fromNode,
    toNode,
    replacement,
  };
}

/** Runs one kubectl invocation and returns stdout; a non-zero exit throws. */
export type Kubectl = (arguments_: readonly string[], stdin?: string) => Promise<string>;

/** Default bound on one kubectl call; an unreachable API server otherwise blocks forever. */
export const KUBECTL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A kubectl adapter bound to one explicit kubeconfig; no ambient context is used.
 *
 * Every call is killed after `timeoutMs` and throws naming the deadline, so `tool-fleet:health`,
 * `recover` and `synthetic` cannot hang on a silent API server.
 */
export function createKubectl(
  kubectlPath: string,
  kubeconfig: string,
  timeoutMs: number = KUBECTL_TIMEOUT_MS,
): Kubectl {
  return async (arguments_, stdin) => {
    const child = Bun.spawn([kubectlPath, `--kubeconfig=${kubeconfig}`, ...arguments_], {
      stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
      stdout: 'pipe',
      stderr: 'pipe',
      // Proof: without this bound `createKubectl > kills a call that outlives its deadline` hit
      // the 5 s test timeout against a kubectl that never exits (2026-09-18).
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (child.signalCode !== null) {
      throw new Error(
        `kubectl ${arguments_.join(' ')} was killed (${child.signalCode}) after ${String(timeoutMs)}ms: ${stderr}`,
      );
    }
    if (exitCode !== 0) {
      throw new Error(`kubectl ${arguments_.join(' ')} exited ${String(exitCode)}: ${stderr}`);
    }
    return stdout;
  };
}

/**
 * Delete one fenced stale VolumeAttachment after re-reading it by name.
 *
 * The UID, node and volume are compared again immediately before the delete, so an attachment
 * recreated by a healthy node under the same name in between is never removed.
 */
export async function removeStaleAttachment(
  kubectl: Kubectl,
  request: { readonly persistentVolumeName: string; readonly nodeName: string },
  fences: readonly ServerFence[],
): Promise<ObservedAttachment> {
  const listed = decodeAttachments(
    JSON.parse(await kubectl(['get', 'volumeattachments.storage.k8s.io', '--output=json'])),
  );
  const selected = planAttachmentRemoval(listed, request, fences);
  const [reread] = decodeAttachments({
    items: [
      JSON.parse(
        await kubectl(['get', 'volumeattachments.storage.k8s.io', selected.name, '--output=json']),
      ),
    ],
  });
  if (
    reread.uid !== selected.uid ||
    reread.nodeName !== selected.nodeName ||
    reread.persistentVolumeName !== selected.persistentVolumeName
  ) {
    // Proof: with this re-read removed, the replaced-attachment test deleted the new object.
    throw new Error(`Attachment removal refused: ${selected.name} changed after it was planned`);
  }
  await kubectl(['delete', 'volumeattachments.storage.k8s.io', selected.name, '--wait=true']);
  return selected;
}

/**
 * Rebind one retained node-local volume to `toNode` through {@link planVolumeRebind}. The
 * replacement PersistentVolume is written to `replacementOut` (which must not exist) before the
 * original object is deleted, so an interrupted rebind can be finished by hand.
 */
export async function rebindVolume(
  kubectl: Kubectl,
  volumeName: string,
  toNode: string,
  fences: readonly ServerFence[],
  replacementOut: string,
): Promise<VolumeRebindPlan> {
  const volume: unknown = JSON.parse(await kubectl(['get', 'pv', volumeName, '--output=json']));
  const claimRef = PersistentVolume(volume);
  if (claimRef instanceof type.errors || claimRef.spec.claimRef === undefined) {
    throw new Error(`Rebind refused: ${volumeName} has no claim`);
  }
  const claim: unknown = JSON.parse(
    await kubectl([
      'get',
      'pvc',
      claimRef.spec.claimRef.name,
      `--namespace=${claimRef.spec.claimRef.namespace}`,
      '--output=json',
    ]),
  );
  const plan = planVolumeRebind(volume, claim, toNode, fences);
  const uid = await kubectl(['get', 'pv', plan.volumeName, '--output=jsonpath={.metadata.uid}']);
  if (uid !== claimRef.metadata.uid) {
    throw new Error(`Rebind refused: ${plan.volumeName} changed after it was planned`);
  }
  // The replacement is on disk before the original object goes, so a failure between the
  // delete and the create never loses the volume's path and claim binding.
  await writeFile(replacementOut, `${JSON.stringify(plan.replacement, null, 2)}\n`, { flag: 'wx' });
  // The pv-protection controller re-adds its finalizer to any live PV, so the delete is
  // requested first and the finalizer removed from the terminating object.
  // Proof: removing the finalizer before the delete hung the live 2026-09-18 rebind of
  // the Prometheus volume until the finalizer was removed again by hand.
  await kubectl(['delete', 'pv', plan.volumeName, '--wait=false']);
  await kubectl([
    'patch',
    'pv',
    plan.volumeName,
    '--type=json',
    '--patch=[{"op":"remove","path":"/metadata/finalizers"}]',
  ]);
  await kubectl(['wait', 'pv', plan.volumeName, '--for=delete', '--timeout=60s']);
  await kubectl(['create', '--filename=-'], JSON.stringify(plan.replacement));
  return plan;
}

/** Read an escrow file: absent is `undefined` (a modeled refusal), unreadable throws. */
export async function readEscrow(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw new Error(`Recovery input ${path} exists but cannot be read`, { cause });
  }
}

function readFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let position = 0; position < argv.length; position += 2) {
    const flag = argv[position];
    if (!flag.startsWith('--') || position + 1 >= argv.length) {
      throw new Error(`Invalid recover argument at position ${String(position + 1)}`);
    }
    if (flags.has(flag)) throw new Error(`Duplicate recover flag: ${flag}`);
    flags.set(flag, argv[position + 1]);
  }
  return flags;
}

function requireFlags<const Names extends readonly string[]>(
  flags: ReadonlyMap<string, string>,
  names: Names,
): Record<Names[number], string> {
  for (const flag of flags.keys()) {
    if (!names.includes(flag)) throw new Error(`Unexpected recover flag: ${flag}`);
  }
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = flags.get(name);
    if (value === undefined || value.length === 0) throw new Error(`Missing required ${name}`);
    values[name] = value;
  }
  return values;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read JSON input ${path}`, { cause });
  }
}

/** Build a recovery manifest from a downloaded snapshot and the escrowed secrets. */
export async function recordManifest(values: {
  readonly clusterId: string;
  readonly k3sVersion: string;
  readonly sourceRevision: string;
  readonly snapshotPath: string;
  readonly objectKey: string;
  readonly tokenPath: string;
  readonly sopsIdentityPath: string;
  readonly storesPath: string;
  readonly etcdMembers: readonly string[];
}): Promise<RecoveryManifest> {
  const snapshot = await readFile(values.snapshotPath);
  const token = (await readFile(values.tokenPath, 'utf8')).trim();
  const objectName = values.objectKey.split('/').at(-1) ?? values.objectKey;
  return decodeRecoveryManifest({
    schemaVersion: 1,
    clusterId: values.clusterId,
    k3sVersion: values.k3sVersion,
    sourceRevision: values.sourceRevision,
    tokenSha256: sha256(token),
    sopsRecipient: ageRecipientOf(await readFile(values.sopsIdentityPath, 'utf8')),
    etcdMembers: values.etcdMembers,
    etcdSnapshot: {
      name: objectName,
      objectKey: values.objectKey,
      sha256: sha256(snapshot),
      bytes: snapshot.byteLength,
    },
    stores: await readJson(values.storesPath),
  });
}

async function runRecover(argv: readonly string[], root: string): Promise<unknown> {
  const [command, ...rest] = argv;
  const flags = readFlags(rest);
  switch (command) {
    case 'record-manifest': {
      const values = requireFlags(flags, [
        '--cluster',
        '--source-revision',
        '--snapshot',
        '--object-key',
        '--token-file',
        '--sops-age-key-file',
        '--stores',
        '--etcd-members',
      ] as const);
      const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
      return recordManifest({
        clusterId: values['--cluster'],
        k3sVersion: toolchain.binaries.k3s.version,
        sourceRevision: values['--source-revision'],
        snapshotPath: values['--snapshot'],
        objectKey: values['--object-key'],
        tokenPath: values['--token-file'],
        sopsIdentityPath: values['--sops-age-key-file'],
        storesPath: values['--stores'],
        etcdMembers: values['--etcd-members'].split(','),
      });
    }
    case 'verify-cold-restore': {
      const values = requireFlags(flags, [
        '--cluster',
        '--manifest',
        '--token-file',
        '--sops-age-key-file',
        '--snapshot',
        '--fences',
      ] as const);
      const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
      const [token, sopsIdentity, snapshot] = await Promise.all([
        readEscrow(values['--token-file']),
        readEscrow(values['--sops-age-key-file']),
        readEscrow(values['--snapshot']),
      ]);
      return planColdRestore({
        targetClusterId: values['--cluster'],
        manifest: decodeRecoveryManifest(await readJson(values['--manifest'])),
        lockedK3sVersion: toolchain.binaries.k3s.version,
        token: token?.toString('utf8'),
        sopsIdentity: sopsIdentity?.toString('utf8'),
        snapshot: snapshot === undefined ? undefined : new Uint8Array(snapshot),
        fences: decodeServerFences(await readJson(values['--fences'])),
      });
    }
    case 'remove-attachment': {
      const values = requireFlags(flags, [
        '--kubeconfig',
        '--kubectl',
        '--volume',
        '--node',
        '--fences',
      ] as const);
      return removeStaleAttachment(
        createKubectl(values['--kubectl'], values['--kubeconfig']),
        { persistentVolumeName: values['--volume'], nodeName: values['--node'] },
        decodeServerFences(await readJson(values['--fences'])),
      );
    }
    case 'rebind-volume': {
      const values = requireFlags(flags, [
        '--kubeconfig',
        '--kubectl',
        '--volume',
        '--to-node',
        '--fences',
        '--replacement-out',
      ] as const);
      return rebindVolume(
        createKubectl(values['--kubectl'], values['--kubeconfig']),
        values['--volume'],
        values['--to-node'],
        decodeServerFences(await readJson(values['--fences'])),
        values['--replacement-out'],
      );
    }
    default:
      throw new Error(
        'Usage: recover.ts record-manifest|verify-cold-restore|remove-attachment|rebind-volume --flag value ...',
      );
  }
}

if (import.meta.main) {
  console.log(
    JSON.stringify(
      await runRecover(process.argv.slice(2), join(import.meta.dir, '../../..')),
      null,
      2,
    ),
  );
}
