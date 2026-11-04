import { type BigIntStats, readlinkSync, type Stats } from 'node:fs';
import { resolve } from 'node:path';

type NativeStat = Stats | BigIntStats;

/** Fixed ownership of one isolated synthetic host; all other paths and FDs stay native. */
export class FixtureOwnership {
  private readonly descriptors = new Map<number, { uid: 0 | 1000; token: symbol }>();

  constructor(
    private readonly root: string,
    private readonly profile: 'factory-host' | 'tenant-root' = 'factory-host',
  ) {
    if (!root.startsWith('/tmp/') || root.endsWith('/'))
      throw new Error('fixture ownership root invalid');
  }

  owner(path: string): 0 | 1000 | undefined {
    const anchor = /^\/proc\/self\/fd\/([0-9]+)(?:\/(.*))?$/.exec(path);
    if (anchor !== null) {
      const descriptor = Number(anchor[1]);
      const suffix = anchor[2];
      if (!suffix) return this.descriptors.get(descriptor)?.uid;
      try {
        return this.owner(resolve(readlinkSync('/proc/self/fd/' + String(descriptor)), suffix));
      } catch {
        return undefined;
      }
    }
    if (path !== this.root && !path.startsWith(this.root + '/')) return undefined;
    if (this.profile === 'tenant-root') return 1000;
    const relative = path.slice(this.root.length);
    if (
      relative === '/home/puni1' ||
      relative.startsWith('/home/puni1/') ||
      relative === '/var/lib/docker/volumes' ||
      relative.startsWith('/var/lib/docker/volumes/') ||
      relative === '/tmp/private-fixture' ||
      relative.startsWith('/tmp/private-fixture/')
    )
      return 1000;
    return 0;
  }

  track(descriptor: number, path: string): symbol | undefined {
    const uid = this.owner(path);
    if (uid === undefined) return undefined;
    const token = Symbol('fixture-owned-descriptor');
    this.descriptors.set(descriptor, { uid, token });
    return token;
  }

  forget(descriptor: number, token?: symbol): void {
    // Proof: omitting retirement left the closed FD's modeled owner available
    // for reuse; edge-init-owner.test.ts failed its closed-descriptor negative.
    if (token === undefined || this.descriptors.get(descriptor)?.token === token)
      this.descriptors.delete(descriptor);
  }

  path<T extends NativeStat>(path: string, metadata: T): T {
    return this.project(metadata, this.owner(path));
  }

  fd<T extends NativeStat>(descriptor: number, metadata: T): T {
    return this.project(metadata, this.descriptors.get(descriptor)?.uid);
  }

  private project<T extends NativeStat>(metadata: T, uid: 0 | 1000 | undefined): T {
    if (uid !== undefined) {
      // The native stat object is fresh to this read. Replacing only uid retains
      // its prototype methods, number/bigint representation and kernel identity.
      Object.defineProperty(metadata, 'uid', {
        configurable: true,
        enumerable: true,
        value: typeof metadata.uid === 'bigint' ? BigInt(uid) : uid,
        writable: true,
      });
    }
    return metadata;
  }
}
