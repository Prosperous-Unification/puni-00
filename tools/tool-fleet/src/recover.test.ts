import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';

import {
  ageRecipientOf,
  type ColdRestoreInputs,
  createKubectl,
  decodeAttachments,
  decodeBech32,
  decodeRecoveryManifest,
  encodeBech32,
  type Kubectl,
  type ObservedAttachment,
  planAttachmentRemoval,
  planColdRestore,
  planVolumeRebind,
  readEscrow,
  rebindVolume,
  type RecoveryManifest,
  removeStaleAttachment,
  type ServerFence,
} from './recover';

// RFC 7748 section 6.1: Alice's X25519 private scalar and public key.
const alicePrivate = Buffer.from(
  '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
  'hex',
);
const alicePublic = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const identity = `# created for tests\n${encodeBech32('age-secret-key-', alicePrivate).toUpperCase()}\n`;
const otherIdentity = encodeBech32('age-secret-key-', Buffer.alloc(32, 7)).toUpperCase();
const token = 'K10' + 'a'.repeat(64) + '::server:' + 'b'.repeat(32);
const snapshot = new TextEncoder().encode('etcd snapshot bytes for the restore planner');

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const fences: readonly ServerFence[] = [
  {
    nodeName: 'k3d-puni-f10-src-server-0',
    providerIdentity: 'docker:src',
    state: 'deleted',
    fenceId: 'k3d cluster delete puni-f10-src',
  },
];

function manifest(): RecoveryManifest {
  return decodeRecoveryManifest({
    schemaVersion: 1,
    clusterId: 'platform-local',
    k3sVersion: 'v1.36.4+k3s1',
    sourceRevision: 'c'.repeat(40),
    tokenSha256: sha256(token),
    sopsRecipient: ageRecipientOf(identity),
    etcdMembers: ['k3d-puni-f10-src-server-0'],
    etcdSnapshot: {
      name: 'puni-f10-src-server-0-1',
      objectKey: 'platform-local/puni-f10-src-server-0-1',
      sha256: sha256(snapshot),
      bytes: snapshot.byteLength,
    },
    stores: [
      {
        kind: 'sqlite',
        reportKey: 'sqlite/wbs/1.db.report.json',
        reportSha256: 'e'.repeat(64),
        knownRow: { table: 'project', id: 'drill' },
      },
      { kind: 'registry', images: [`registry.puni.test/drill@sha256:${'d'.repeat(64)}`] },
    ],
  });
}

function inputs(overrides: Partial<ColdRestoreInputs> = {}): ColdRestoreInputs {
  return {
    targetClusterId: 'platform-local',
    manifest: manifest(),
    lockedK3sVersion: 'v1.36.4+k3s1',
    token,
    sopsIdentity: identity,
    snapshot,
    fences,
    ...overrides,
  };
}

describe('ageRecipientOf', () => {
  it('derives the X25519 recipient of an age identity', () => {
    const { prefix, bytes } = decodeBech32(ageRecipientOf(identity));
    expect(prefix).toBe('age');
    expect(Buffer.from(bytes).toString('hex')).toBe(alicePublic);
  });

  it('refuses a corrupted identity checksum and a second key', () => {
    const corrupted = identity.replace(/.\n$/, (last) => (last.startsWith('Q') ? 'P\n' : 'Q\n'));
    expect(() => ageRecipientOf(corrupted)).toThrow(/checksum/);
    expect(() => ageRecipientOf(`${identity}${otherIdentity}\n`)).toThrow(/exactly one/);
  });
});

describe('planColdRestore', () => {
  it('plans the cluster reset from the verified snapshot, then stores and admission', () => {
    const plan = planColdRestore(inputs());
    expect(plan.snapshotSha256).toBe(sha256(snapshot));
    expect(plan.fencedServers).toEqual(['k3d-puni-f10-src-server-0']);
    const ids = plan.steps.map(({ id }) => id);
    expect(ids.indexOf('place-token')).toBeLessThan(ids.indexOf('cluster-reset'));
    expect(ids).toContain('verify-sqlite');
    expect(ids).toContain('verify-registry');
    expect(ids.at(-2)).toBe('verify-admission');
  });

  it('refuses when the escrowed token is missing', () => {
    expect(() => planColdRestore(inputs({ token: undefined }))).toThrow(/token is missing/);
    expect(() => planColdRestore(inputs({ token: ' \n' }))).toThrow(/token is missing/);
  });

  it('refuses when the SOPS age identity is missing', () => {
    expect(() => planColdRestore(inputs({ sopsIdentity: undefined }))).toThrow(
      /SOPS age identity is missing/,
    );
  });

  it('refuses a token or SOPS identity that differs from the escrowed fingerprints', () => {
    expect(() => planColdRestore(inputs({ token: `${token}x` }))).toThrow(/escrowed fingerprint/);
    expect(() => planColdRestore(inputs({ sopsIdentity: otherIdentity }))).toThrow(
      /does not decrypt/,
    );
  });

  it('refuses a corrupt, truncated or absent snapshot archive', () => {
    const corrupt = snapshot.slice();
    corrupt[3] ^= 1;
    expect(() => planColdRestore(inputs({ snapshot: corrupt }))).toThrow(
      /differs from its recorded/,
    );
    expect(() => planColdRestore(inputs({ snapshot: snapshot.slice(1) }))).toThrow(
      /differs from its recorded/,
    );
    expect(() => planColdRestore(inputs({ snapshot: undefined }))).toThrow(/is missing/);
  });

  it('refuses another cluster, another folder and another k3s version', () => {
    expect(() => planColdRestore(inputs({ targetClusterId: 'platform-production' }))).toThrow(
      /manifest is for platform-local/,
    );
    const foreign = {
      ...manifest(),
      etcdSnapshot: { ...manifest().etcdSnapshot, objectKey: 'workers-local/x' },
    };
    expect(() => planColdRestore(inputs({ manifest: foreign }))).toThrow(/not a platform-local/);
    expect(() => planColdRestore(inputs({ lockedK3sVersion: 'v1.36.5+k3s1' }))).toThrow(
      /the lock is/,
    );
  });

  it('refuses a fence that leaves a recorded etcd member unfenced', () => {
    const twoMembers = { ...manifest(), etcdMembers: ['k3d-puni-f10-src-server-0', 'server-b'] };
    expect(() => planColdRestore(inputs({ manifest: twoMembers }))).toThrow(
      /etcd members without fence evidence: server-b/,
    );
  });

  it('refuses while an original server may still run', () => {
    expect(() => planColdRestore(inputs({ fences: [] }))).toThrow(/no fence evidence/);
    const running = [{ ...fences[0], state: 'running' } as const];
    expect(() => planColdRestore(inputs({ fences: running }))).toThrow(/is not fenced/);
  });

  it('rejects a manifest with unknown fields or an inexact image reference', () => {
    expect(() => decodeRecoveryManifest({ ...manifest(), extra: true })).toThrow(/invalid/);
    expect(() =>
      decodeRecoveryManifest({
        ...manifest(),
        stores: [{ kind: 'registry', images: ['registry.puni.test/drill:latest'] }],
      }),
    ).toThrow(/invalid/);
  });
});

function attachment(name: string, nodeName: string, volume: string): unknown {
  return {
    metadata: { name, uid: `uid-${name}` },
    spec: { attacher: 'csi.hetzner.cloud', nodeName, source: { persistentVolumeName: volume } },
  };
}

describe('stale VolumeAttachment removal', () => {
  const observed = decodeAttachments({
    items: [
      attachment('va-stale', 'k3d-puni-f10-src-server-0', 'pv-data'),
      attachment('va-live', 'k3d-puni-f10-restore-server-0', 'pv-data'),
      attachment('va-other', 'k3d-puni-f10-src-server-0', 'pv-other'),
    ],
  });

  it('selects only the attachment of that exact volume on the fenced node', () => {
    const selected = planAttachmentRemoval(
      observed,
      { persistentVolumeName: 'pv-data', nodeName: 'k3d-puni-f10-src-server-0' },
      fences,
    );
    expect(selected.name).toBe('va-stale');
  });

  it('refuses an attachment on a node without fence evidence', () => {
    expect(() =>
      planAttachmentRemoval(
        observed,
        { persistentVolumeName: 'pv-data', nodeName: 'k3d-puni-f10-restore-server-0' },
        fences,
      ),
    ).toThrow(/is not fenced/);
  });

  it('refuses when no attachment names that volume on that node', () => {
    const onlyLive = observed.filter(({ name }) => name !== 'va-stale');
    expect(() =>
      planAttachmentRemoval(
        onlyLive,
        { persistentVolumeName: 'pv-data', nodeName: 'k3d-puni-f10-src-server-0' },
        fences,
      ),
    ).toThrow(/0 attachments match/);
  });

  function fakeKubectl(reread: unknown, calls: string[][]): Kubectl {
    return (arguments_) => {
      calls.push([...arguments_]);
      if (arguments_[0] === 'get' && arguments_.length === 3) {
        return Promise.resolve(
          JSON.stringify({
            items: [attachment('va-stale', 'k3d-puni-f10-src-server-0', 'pv-data')],
          }),
        );
      }
      return Promise.resolve(arguments_[0] === 'get' ? JSON.stringify(reread) : '');
    };
  }

  it('re-reads the attachment and deletes it only when it is unchanged', async () => {
    const calls: string[][] = [];
    const removed: ObservedAttachment = await removeStaleAttachment(
      fakeKubectl(attachment('va-stale', 'k3d-puni-f10-src-server-0', 'pv-data'), calls),
      { persistentVolumeName: 'pv-data', nodeName: 'k3d-puni-f10-src-server-0' },
      fences,
    );
    expect(removed.uid).toBe('uid-va-stale');
    expect(calls.at(-1)).toEqual([
      'delete',
      'volumeattachments.storage.k8s.io',
      'va-stale',
      '--wait=true',
    ]);
  });

  it('refuses to delete an attachment recreated under the same name', async () => {
    const calls: string[][] = [];
    const recreated = {
      metadata: { name: 'va-stale', uid: 'uid-new' },
      spec: {
        attacher: 'csi.hetzner.cloud',
        nodeName: 'k3d-puni-f10-src-server-0',
        source: { persistentVolumeName: 'pv-data' },
      },
    };
    expect(
      removeStaleAttachment(
        fakeKubectl(recreated, calls),
        { persistentVolumeName: 'pv-data', nodeName: 'k3d-puni-f10-src-server-0' },
        fences,
      ),
    ).rejects.toThrow(/changed after it was planned/);
    await Bun.sleep(0);
    expect(calls.some(([verb]) => verb === 'delete')).toBe(false);
  });
});

function localVolume(overrides: Record<string, unknown> = {}): {
  metadata: object;
  spec: Record<string, unknown>;
} {
  return {
    metadata: { name: 'pvc-1234', uid: 'pv-uid' },
    spec: {
      capacity: { storage: '1Gi' },
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'puni-local',
      persistentVolumeReclaimPolicy: 'Retain',
      volumeMode: 'Filesystem',
      claimRef: { namespace: 'puni-registry', name: 'registry', uid: 'claim-uid' },
      hostPath: { path: '/var/lib/rancher/k3s/storage/pvc-1234_puni-registry_registry' },
      nodeAffinity: {
        required: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: 'kubernetes.io/hostname',
                  operator: 'In',
                  values: ['k3d-puni-f10-src-server-0'],
                },
              ],
            },
          ],
        },
      },
      ...overrides,
    },
  };
}

function csiVolume(): object {
  const volume = localVolume({ csi: { driver: 'csi.hetzner.cloud', volumeHandle: '1' } });
  const { hostPath: _hostPath, ...spec } = volume.spec;
  return { ...volume, spec };
}

const claim = {
  metadata: { name: 'registry', namespace: 'puni-registry', uid: 'claim-uid' },
  spec: { volumeName: 'pvc-1234' },
};

describe('planVolumeRebind', () => {
  it('recreates the same retained volume and claim on the replacement node', () => {
    const plan = planVolumeRebind(localVolume(), claim, 'k3d-puni-f10-restore-server-0', fences);
    expect(plan.fromNode).toBe('k3d-puni-f10-src-server-0');
    expect(plan.path).toContain('pvc-1234_puni-registry_registry');
    expect(JSON.stringify(plan.replacement)).toContain('"uid":"claim-uid"');
    expect(JSON.stringify(plan.replacement)).toContain('k3d-puni-f10-restore-server-0');
    expect(JSON.stringify(plan.replacement)).not.toContain('"values":["k3d-puni-f10-src');
  });

  it('refuses a CSI volume, a different claim, a Delete policy and an unfenced node', () => {
    const target = 'k3d-puni-f10-restore-server-0';
    expect(() => planVolumeRebind(csiVolume(), claim, target, fences)).toThrow(/CSI volume/);
    expect(() =>
      planVolumeRebind(
        localVolume(),
        { ...claim, metadata: { ...claim.metadata, uid: 'recreated' } },
        target,
        fences,
      ),
    ).toThrow(/not bound to each other/);
    expect(() =>
      planVolumeRebind(
        localVolume({ persistentVolumeReclaimPolicy: 'Delete' }),
        claim,
        target,
        fences,
      ),
    ).toThrow(/not Retain/);
    expect(() => planVolumeRebind(localVolume(), claim, target, [])).toThrow(/is not fenced/);
  });
});

describe('rebindVolume', () => {
  it('writes the replacement before deleting the original and refuses to overwrite it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'puni-rebind-'));
    const out = join(directory, 'replacement.json');
    const order: string[] = [];
    const kubectl: Kubectl = async (arguments_) => {
      order.push(arguments_.slice(0, 2).join(' '));
      if (arguments_[0] === 'delete') {
        // The replacement must already be readable when the original is deleted.
        const written = (await readFile(out, 'utf8')).includes('k3d-puni-f10-restore-server-0');
        order.push(written ? 'replacement:true' : 'replacement:false');
      }
      if (arguments_[0] !== 'get') return '';
      if (arguments_[1] === 'pvc') return JSON.stringify(claim);
      if (arguments_.some((argument) => argument.includes('jsonpath'))) return 'pv-uid';
      return JSON.stringify(localVolume());
    };
    await rebindVolume(kubectl, 'pvc-1234', 'k3d-puni-f10-restore-server-0', fences, out);
    expect(order).toContain('replacement:true');
    expect(order.indexOf('delete pv')).toBeLessThan(order.indexOf('create --filename=-'));
    const again = await rebindVolume(
      kubectl,
      'pvc-1234',
      'k3d-puni-f10-restore-server-0',
      fences,
      out,
    ).then(
      () => 'rebound',
      (error: unknown) => (error instanceof Error ? error.message : ''),
    );
    expect(again).toContain('EEXIST');
  });
});

describe('readEscrow', () => {
  it('distinguishes an absent escrow file from an unreadable one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'puni-recover-escrow-'));
    expect(await readEscrow(join(directory, 'absent'))).toBeUndefined();
    const locked = join(directory, 'locked');
    await writeFile(locked, 'secret');
    await chmod(locked, 0o000);
    if (process.getuid?.() === 0) return;
    expect(readEscrow(locked)).rejects.toThrow(/cannot be read/);
  });
});

describe('recover.ts verify-cold-restore', () => {
  it('exits non-zero and names the missing token before reading the snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'puni-recover-cli-'));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest()));
    await writeFile(join(directory, 'identity'), identity);
    await writeFile(join(directory, 'fences.json'), JSON.stringify(fences));
    await writeFile(join(directory, 'snapshot'), snapshot);
    const run = (tokenPath: string) =>
      Bun.spawnSync(
        [
          process.execPath,
          join(import.meta.dir, 'recover.ts'),
          'verify-cold-restore',
          '--cluster',
          'platform-local',
          '--manifest',
          join(directory, 'manifest.json'),
          '--token-file',
          tokenPath,
          '--sops-age-key-file',
          join(directory, 'identity'),
          '--snapshot',
          join(directory, 'snapshot'),
          '--fences',
          join(directory, 'fences.json'),
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
    const missing = run(join(directory, 'absent-token'));
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('token is missing');
    await writeFile(join(directory, 'token'), token);
    const accepted = run(join(directory, 'token'));
    expect(accepted.stderr.toString()).toBe('');
    expect(accepted.exitCode).toBe(0);
    expect(accepted.stdout.toString()).toContain('"cluster-reset"');
  });
});

describe('restore.yml', () => {
  it('checks the token and placed snapshot against the verified plan before stopping k3s', async () => {
    const playbook = await Bun.file(
      join(import.meta.dir, '../../../infra/ansible/playbooks/restore.yml'),
    ).text();
    const [play] = parse(playbook) as [{ tasks: { name: string }[] }];
    const names = play.tasks.map(({ name }) => name);
    const stop = names.indexOf('Stop k3s before the reset');
    expect(stop).toBeGreaterThan(0);
    for (const check of [
      'Require a plan for this cluster with fenced originals',
      'Refuse a token that differs from the verified plan',
      'Refuse a snapshot whose placed bytes differ from the verified plan',
      'Refuse to restore on more than one host',
      'Refuse a host whose k3s node name is not the planned replacement',
      "Refuse to reset a running server's datastore without host confirmation",
    ]) {
      expect(names.indexOf(check)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(check)).toBeLessThan(stop);
    }
    expect(playbook).toContain('--token-file=/etc/rancher/k3s/server-token');
    expect(playbook).toContain('--etcd-s3=false');
    expect(playbook).toContain('ansible_play_hosts_all | length == 1');
    expect(playbook).not.toMatch(/\brm\b|state: absent/);
  });
});

describe('createKubectl', () => {
  it('kills a call that outlives its deadline and names it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tool-fleet-kubectl-'));
    const hanging = join(directory, 'kubectl');
    await writeFile(hanging, '#!/bin/sh\nexec sleep 30\n');
    await chmod(hanging, 0o700);
    const started = Date.now();
    const refusal: unknown = await createKubectl(
      hanging,
      join(directory, 'kubeconfig'),
      200,
    )(['get', 'nodes']).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toMatch(
      /kubectl get nodes was killed \(SIGKILL\) after 200ms/,
    );
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
