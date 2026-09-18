import { open } from 'node:fs/promises';

const MAX_CGROUP_BYTES = 64 * 1024;
const SYSTEMD_DOCKER_SCOPE = /(?:^|\/)docker-([0-9a-f]{64})\.scope(?:\/|$)/;
const CGROUPFS_DOCKER_PATH = /(?:^|\/)docker\/([0-9a-f]{64})(?:\/|$)/;
// The whole path must be one kubelet-created container scope under the kubepods hierarchy with
// a QoS class that agrees between the slice and the pod slice; no prefix or suffix is accepted.
const CRI_POD_SCOPE =
  /^\/kubepods\.slice\/(?:kubepods-(besteffort|burstable)\.slice\/kubepods-\1-pod[0-9a-f]{8}(?:_[0-9a-f]{4}){3}_[0-9a-f]{12}\.slice|kubepods-pod[0-9a-f]{8}(?:_[0-9a-f]{4}){3}_[0-9a-f]{12}\.slice)\/cri-containerd-([0-9a-f]{64})\.scope$/;

export interface PeerContainer {
  readonly runtime: 'docker' | 'cri-containerd';
  readonly id: string;
}

function defect(message: string): Error {
  return new Error(`supervisor peer cgroup: ${message}`);
}

export interface SupervisorCgroupFile {
  read(buffer: Uint8Array, offset: number, length: number): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
}

export type SupervisorCgroupOpen = (path: string) => Promise<SupervisorCgroupFile>;

const openCgroup: SupervisorCgroupOpen = async (path) => {
  const file = await open(path, 'r');
  return {
    read: async (buffer, offset, length): Promise<{ bytesRead: number }> => {
      const { bytesRead } = await file.read(buffer, offset, length, null);
      return { bytesRead };
    },
    close: async (): Promise<void> => {
      await file.close();
    },
  };
};

/** Reads one proc cgroup with a one-byte overflow sentinel and mandatory close. */
export async function readSupervisorPeerCgroup(
  peerPid: number,
  openFile: SupervisorCgroupOpen = openCgroup,
): Promise<string> {
  if (!Number.isSafeInteger(peerPid) || peerPid < 1) throw defect('invalid peer pid');
  const file = await openFile(`/proc/${String(peerPid)}/cgroup`);
  const bytes = new Uint8Array(MAX_CGROUP_BYTES + 1);
  let used = 0;
  try {
    while (used < bytes.byteLength) {
      const remaining = bytes.byteLength - used;
      const { bytesRead } = await file.read(bytes, used, remaining);
      if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > remaining) {
        throw defect('proc cgroup read returned an invalid byte count');
      }
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    // Proof: solver-supervisor-peer-cgroup.test.ts supplies exactly one byte
    // above the cap and requires refusal while also observing mandatory close.
    if (used > MAX_CGROUP_BYTES) {
      throw defect(`input bytes ${String(used)} exceed ${String(MAX_CGROUP_BYTES)}`);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used));
    } catch {
      throw defect('proc cgroup is not valid UTF-8');
    }
  } finally {
    await file.close();
  }
}

/** Resolves only a full Docker id carried by the kernel's peer PID cgroup. */
export function dockerContainerIdFromPeerCgroup(raw: string): string {
  const peer = peerContainerFromCgroup(raw);
  if (peer.runtime !== 'docker') throw defect('no full Docker container id found');
  return peer.id;
}

/**
 * Resolves the one container that owns the kernel's peer PID cgroup: a Docker container or an
 * exact k3s containerd pod container. Anything else, including every host process, refuses.
 */
export function peerContainerFromCgroup(raw: string): PeerContainer {
  const bytes = new TextEncoder().encode(raw).byteLength;
  if (bytes > MAX_CGROUP_BYTES) {
    throw defect(`input bytes ${String(bytes)} exceed ${String(MAX_CGROUP_BYTES)}`);
  }

  const peers = new Map<string, PeerContainer>();
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    const fields = /^\d+:[^:]*:(\/.*)$/.exec(line);
    if (fields === null) throw defect('malformed proc cgroup line');
    const path = fields[1];
    const systemd = SYSTEMD_DOCKER_SCOPE.exec(path)?.[1];
    const cgroupfs = CGROUPFS_DOCKER_PATH.exec(path)?.[1];
    // Proof: solver-supervisor-peer-cgroup.test.ts refuses a cri-containerd scope outside
    // kubepods, with a child suffix, under a prefix, and with a QoS mismatch; widening this
    // expression to a substring match accepted those host-controlled paths.
    const cri = CRI_POD_SCOPE.exec(path)?.[2];
    if (systemd !== undefined) peers.set(`docker:${systemd}`, { runtime: 'docker', id: systemd });
    if (cgroupfs !== undefined)
      peers.set(`docker:${cgroupfs}`, { runtime: 'docker', id: cgroupfs });
    if (cri !== undefined) peers.set(`cri:${cri}`, { runtime: 'cri-containerd', id: cri });
  }
  if (peers.size !== 1) {
    throw defect(
      peers.size === 0 ? 'no full container id found' : 'conflicting container ids found',
    );
  }
  for (const peer of peers.values()) return peer;
  throw defect('no full container id found');
}
