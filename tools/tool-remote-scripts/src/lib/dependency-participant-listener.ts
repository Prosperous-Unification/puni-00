import { open, opendir, readlink } from 'node:fs/promises';

import { observeParticipantProcess } from './dependency-participant-process';
import type { HostProcessIdentity } from './installed-authorities';
import { assertSame } from './managed-cohort';

export interface ParticipantListener {
  readonly family: 'ipv4' | 'ipv6';
  readonly address: string;
  readonly port: number;
  readonly inode: string;
  readonly descriptor: number;
}
export interface SourceParticipantListener {
  readonly process: HostProcessIdentity;
  readonly namespaces: Readonly<Record<'pid' | 'net' | 'mnt', string>>;
  readonly listeners: readonly ParticipantListener[];
}
/** Source UID observer only. An actual socket FD must own every listener at the required port; namespace-wide TCP membership alone grants nothing. Root product metadata uses its separate fixed container observer. */
export async function observeSourceParticipantListener(
  pid: number,
  port: number,
  deadline: number,
): Promise<SourceParticipantListener> {
  try {
    function checkDeadline() {
      if (!Number.isFinite(deadline) || performance.now() >= deadline)
        throw new Error('source listener deadline exceeded');
    }
    checkDeadline();
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
      throw new Error('source listener port malformed');
    const first = await observeParticipantProcess(pid, deadline);
    if (typeof process.getuid !== 'function' || first.identity.uid !== process.getuid())
      throw new Error('source listener process UID differs');
    const root = `/proc/${String(pid)}`;
    async function namespaces() {
      const observed = { pid: '', net: '', mnt: '' };
      for (const name of ['pid', 'net', 'mnt'] as const) {
        checkDeadline();
        const link = await readlink(`${root}/ns/${name}`);
        if (!new RegExp(`^${name}:\\[[1-9][0-9]*\\]$`).test(link))
          throw new Error('source listener namespace malformed');
        observed[name] = link;
      }
      return observed;
    }
    async function read(path: string): Promise<string> {
      checkDeadline();
      const descriptor = await open(path, 'r');
      try {
        const buffer = Buffer.alloc(4 * 1024 * 1024 + 1);
        let length = 0;
        for (;;) {
          checkDeadline();
          if (length === buffer.length) throw new Error('source TCP table exceeds bound');
          const { bytesRead } = await descriptor.read(buffer, length, buffer.length - length, null);
          if (bytesRead === 0) break;
          length += bytesRead;
        }
        if (length > 4 * 1024 * 1024) throw new Error('source TCP table exceeds bound');
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
      } finally {
        await descriptor.close();
      }
    }
    async function sockets() {
      const directory = await opendir(`${root}/fd`);
      const observed = new Map<string, number[]>();
      let count = 0;
      for await (const entry of directory) {
        checkDeadline();
        if (++count > 4096 || !/^(0|[1-9][0-9]*)$/.test(entry.name))
          throw new Error('source descriptor roster exceeds bound');
        const link = await readlink(`${root}/fd/${entry.name}`);
        const socket = /^socket:\[([1-9][0-9]*)\]$/.exec(link);
        if (socket !== null) {
          const inode = socket.at(1);
          if (inode === undefined) throw new Error('source socket inode absent');
          const descriptors = observed.get(inode);
          if (descriptors === undefined) observed.set(inode, [Number(entry.name)]);
          else descriptors.push(Number(entry.name));
        }
      }
      return observed;
    }
    function address(hex: string, family: 'ipv4' | 'ipv6'): string {
      if (family === 'ipv4') {
        if (!/^[A-F0-9]{8}$/.test(hex)) throw new Error('source IPv4 malformed');
        return Buffer.from(hex, 'hex').reverse().join('.');
      }
      if (!/^[A-F0-9]{32}$/.test(hex)) throw new Error('source IPv6 malformed');
      let network = '';
      for (let offset = 0; offset < 32; offset += 8)
        network += Buffer.from(hex.slice(offset, offset + 8), 'hex')
          .reverse()
          .toString('hex');
      const groups = network.match(/.{4}/g);
      if (groups === null) throw new Error('source IPv6 groups absent');
      return new URL(`http://[${groups.join(':')}]`).hostname.slice(1, -1);
    }
    async function listeners(): Promise<ParticipantListener[]> {
      const owned = await sockets();
      const observed: ParticipantListener[] = [];
      const inodes = new Set<string>();
      for (const [table, family] of [
        ['tcp', 'ipv4'],
        ['tcp6', 'ipv6'],
      ] as const) {
        const lines = (await read(`${root}/net/${table}`)).trim().split('\n');
        if (!lines[0]?.includes('local_address') || lines.length > 32769)
          throw new Error('source TCP table malformed');
        for (const line of lines.slice(1)) {
          const fields = line.trim().split(/\s+/);
          if (fields.length < 10) throw new Error('source TCP entry malformed');
          const local = fields.at(1);
          const state = fields.at(3);
          const inode = fields.at(9);
          if (typeof local !== 'string' || typeof state !== 'string' || typeof inode !== 'string')
            throw new Error('source TCP entry absent');
          const endpoint = /^([A-F0-9]+):([A-F0-9]{4})$/.exec(local);
          const host = endpoint?.at(1);
          const encodedPort = endpoint?.at(2);
          if (host === undefined || encodedPort === undefined)
            throw new Error('source TCP endpoint malformed');
          if (state !== '0A' || Number.parseInt(encodedPort, 16) !== port) continue;
          // Proof: replacing the real FD lookup with an unrelated descriptor admitted the stable foreign child; native listener test failed with Missing expected rejection.
          const descriptors = owned.get(inode);
          if (!/^[1-9][0-9]*$/.test(inode) || inodes.has(inode) || descriptors?.length !== 1)
            throw new Error('source application does not exclusively own listener');
          const descriptor = descriptors.at(0);
          if (descriptor === undefined) throw new Error('source listener descriptor absent');
          inodes.add(inode);
          observed.push({ family, address: address(host, family), port, inode, descriptor });
        }
      }
      if (observed.length === 0 || observed.length > 16)
        throw new Error('source application listener absent or oversized');
      return observed.sort((left, right) => left.inode.localeCompare(right.inode));
    }
    const initialNamespaces = await namespaces();
    const initialListeners = await listeners();
    assertSame(initialListeners, await listeners(), 'source listener FD ownership readback');
    assertSame(initialNamespaces, await namespaces(), 'source listener namespace readback');
    assertSame(
      first,
      await observeParticipantProcess(pid, deadline),
      'source listener process readback',
    );
    checkDeadline();
    return { process: first.identity, namespaces: initialNamespaces, listeners: initialListeners };
  } catch {
    throw new Error('source participant listener observation refused');
  }
}
