import { describe, expect, it } from 'bun:test';

import {
  authenticateSupervisorPeer,
  hostSupervisorPeerDependencies,
} from './solver-supervisor-peer';

const CALLER_ID = 'a'.repeat(64);

async function rejectionOf(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error('expected operation to reject');
}

describe('authenticateSupervisorPeer', () => {
  it('builds the host dependencies from kernel, proc, and driver primitives', async () => {
    const order: string[] = [];
    const dependencies = hostSupervisorPeerDependencies(
      {
        inspectPod: () => Promise.reject(new Error('no pod peer')),
        inspectBackend: (id) => {
          order.push(`inspect:${id}`);
          return Promise.resolve({ id, name: 'wbs-dev-src', image: 'wbs-dev-src:1' });
        },
      },
      {
        credentials: () => {
          order.push('credentials');
          return { pid: 4242, uid: 1000, gid: 1000 };
        },
        cgroup: () => {
          order.push('cgroup');
          return Promise.resolve(`0::/system.slice/docker-${CALLER_ID}.scope\n`);
        },
      },
    );

    expect(
      await authenticateSupervisorPeer(
        {},
        { allowedNamePatterns: [/^wbs-dev-src$/] },
        dependencies,
      ),
    ).toEqual({ id: CALLER_ID, name: 'wbs-dev-src', image: 'wbs-dev-src:1' });
    expect(order).toEqual(['credentials', 'cgroup', `inspect:${CALLER_ID}`]);
  });

  it('binds the kernel peer pid to one allowed running backend', async () => {
    const calls: unknown[][] = [];
    const identity = await authenticateSupervisorPeer(
      { fd: 17 },
      { allowedNamePatterns: [/^wbs-dev-src$/] },
      {
        credentials: () => ({ pid: 4242, uid: 1000, gid: 1000 }),
        cgroup: (pid) => {
          calls.push(['cgroup', pid]);
          return Promise.resolve(`0::/system.slice/docker-${CALLER_ID}.scope\n`);
        },
        inspectPod: () => Promise.reject(new Error('no pod peer')),
        inspect: (id, patterns) => {
          calls.push(['inspect', id, patterns]);
          return Promise.resolve({ id, name: 'wbs-dev-src', image: 'wbs-dev-src:1' });
        },
      },
    );

    expect(identity).toEqual({ id: CALLER_ID, name: 'wbs-dev-src', image: 'wbs-dev-src:1' });
    expect(calls).toEqual([
      ['cgroup', 4242],
      ['inspect', CALLER_ID, [/^wbs-dev-src$/]],
    ]);
  });

  it('never inspects a caller when kernel or proc identity cannot authenticate it', async () => {
    let inspections = 0;
    const inspect = () => {
      inspections += 1;
      return Promise.resolve({ id: CALLER_ID, name: 'wbs-dev-src', image: 'wbs-dev-src:1' });
    };
    const dependencies = {
      credentials: () => ({ pid: 4242, uid: 1000, gid: 1000 }),
      cgroup: () => Promise.resolve('0::/user.slice/user-1000.slice/session-2.scope\n'),
      inspect,
      inspectPod: inspect,
    };

    // Proof: replacing the cgroup-derived id with a frame claim makes this
    // reach inspect and turns the rejection into an accepted live backend.
    expect(
      (
        await rejectionOf(
          authenticateSupervisorPeer({}, { allowedNamePatterns: [/^wbs-dev-src$/] }, dependencies),
        )
      ).message,
    ).toMatch(/peer cgroup/);
    expect(inspections).toBe(0);
  });

  it('authenticates a k3s pod peer through the pod inspector, never Docker', async () => {
    const calls: string[] = [];
    const pod = `0::/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod1a2b3c4d_5e6f_7a8b_9c0d_1e2f3a4b5c6d.slice/cri-containerd-${CALLER_ID}.scope\n`;
    const dependencies = {
      credentials: () => ({ pid: 4242, uid: 10001, gid: 10001 }),
      cgroup: () => Promise.resolve(pod),
      inspect: () => {
        calls.push('docker');
        return Promise.reject(new Error('docker must not inspect a pod'));
      },
      inspectPod: (id: string) => {
        calls.push(`pod:${id}`);
        return Promise.resolve({ id, name: 'k8s_wbs-solver_backend', image: 'x@sha256:1' });
      },
    };
    expect(
      await authenticateSupervisorPeer(
        {},
        { allowedNamePatterns: [/^k8s_wbs-solver_backend$/] },
        dependencies,
      ),
    ).toEqual({ id: CALLER_ID, name: 'k8s_wbs-solver_backend', image: 'x@sha256:1' });
    expect(calls).toEqual([`pod:${CALLER_ID}`]);

    // A host process on the node (the k3s service itself) is never inspected.
    calls.length = 0;
    const host = {
      ...dependencies,
      cgroup: () => Promise.resolve('0::/system.slice/k3s.service\n'),
    };
    expect(
      (
        await rejectionOf(
          authenticateSupervisorPeer(
            {},
            { allowedNamePatterns: [/^k8s_wbs-solver_backend$/] },
            host,
          ),
        )
      ).message,
    ).toMatch(/peer cgroup/);
    expect(calls).toEqual([]);
  });
});
