import { describe, expect, it } from 'bun:test';

import {
  decodeForgeAdmission,
  type ForgeAdmissionStore,
  planForgeAdmission,
  rootsOf,
  SOLVER_NODE_PATH,
  updateForgeAdmission,
} from './forge-admission';

const IMAGE = `puni-f9-registry:5000/dev-environment@sha256:${'b'.repeat(64)}`;
const COMMITTED = '/srv/puni/worktrees/puni-00';

function configMap(
  overrides: { labels?: Record<string, string>; annotations?: Record<string, string> } = {},
): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'puni-trusted-workload',
      namespace: 'wbs-solver',
      resourceVersion: '1',
      labels: { 'puni.dev/lab-id': 'f9', ...overrides.labels },
      annotations: { 'kustomize.toolkit.fluxcd.io/ssa': 'IfNotPresent', ...overrides.annotations },
    },
    data: {
      solverImages: 'x',
      forgeImage: 'registry.puni.test/dev-environment@sha256:' + 'b'.repeat(64),
      forgeWorktreeRoots: COMMITTED,
    },
  };
}

/**
 * An in-memory API server for one object: `replace` succeeds only at the current
 * resourceVersion, and a replacement without one is unconditional, as in Kubernetes.
 */
function apiServer(initial: Record<string, unknown>): ForgeAdmissionStore & {
  current(): Record<string, unknown>;
} {
  let object = structuredClone(initial);
  let version = 1;
  return {
    current: () => object,
    read: async () => {
      await Bun.sleep(0);
      return structuredClone(object);
    },
    replace: async (replacement) => {
      await Bun.sleep(0);
      const metadata = replacement['metadata'] as Record<string, unknown>;
      const requested = metadata['resourceVersion'];
      if (requested !== undefined && requested !== String(version)) return 'conflict';
      version += 1;
      object = { ...replacement, metadata: { ...metadata, resourceVersion: String(version) } };
      return 'replaced';
    },
  };
}

function rootsIn(object: Record<string, unknown>): string[] {
  return String((object['data'] as Record<string, unknown>)['forgeWorktreeRoots']).split(',');
}

describe('decodeForgeAdmission', () => {
  it('takes the committed roots as the base on the first write', () => {
    expect(decodeForgeAdmission(configMap(), 'f9')).toEqual({
      forgeImage: 'registry.puni.test/dev-environment@sha256:' + 'b'.repeat(64),
      baseRoots: [COMMITTED],
      owners: {},
    });
  });

  it('refuses parameters another lab owns', () => {
    expect(() => decodeForgeAdmission(configMap(), 'other')).toThrow('not owned by this lab');
  });

  it('refuses a Flux-applied ConfigMap without create-once', () => {
    const fluxApplied = configMap({ labels: { 'kustomize.toolkit.fluxcd.io/name': 'policy' } });
    expect(decodeForgeAdmission(fluxApplied, 'f9').baseRoots).toEqual([COMMITTED]);
    const withoutCreateOnce = structuredClone(fluxApplied) as {
      metadata: { annotations: Record<string, string> };
    };
    delete withoutCreateOnce.metadata.annotations['kustomize.toolkit.fluxcd.io/ssa'];
    expect(() => decodeForgeAdmission(withoutCreateOnce, 'f9')).toThrow('IfNotPresent');
  });
});

describe('planForgeAdmission', () => {
  const base = { forgeImage: IMAGE, baseRoots: [COMMITTED], owners: {} };

  it('derives roots from the base, the claims and the solver directory', () => {
    const claimed = planForgeAdmission(base, {
      kind: 'claim',
      slug: 'alpha',
      root: '/srv/puni/worktrees/alpha',
      image: IMAGE,
    });
    expect(rootsOf(claimed)).toEqual([COMMITTED, '/srv/puni/worktrees/alpha', SOLVER_NODE_PATH]);
    expect(rootsOf(planForgeAdmission(claimed, { kind: 'release', slug: 'alpha' }))).toEqual([
      COMMITTED,
    ]);
  });

  it('refuses a second forge image while another environment holds the first', () => {
    const held = { ...base, owners: { alpha: '/srv/puni/worktrees/alpha' } };
    expect(() =>
      planForgeAdmission(held, {
        kind: 'claim',
        slug: 'beta',
        root: '/srv/puni/worktrees/beta',
        image: IMAGE.replace('bbb', 'ddd'),
      }),
    ).toThrow('the forge admits one image');
  });

  it('restores the previous claim and image', () => {
    const previous = { ...base, forgeImage: 'old@sha256:' + 'e'.repeat(64) };
    const claimed = planForgeAdmission(previous, {
      kind: 'claim',
      slug: 'alpha',
      root: '/srv/puni/worktrees/alpha',
      image: IMAGE,
    });
    expect(planForgeAdmission(claimed, { kind: 'restore', slug: 'alpha', previous })).toEqual(
      previous,
    );
  });
});

describe('updateForgeAdmission', () => {
  it('keeps both roots when two claims race', async () => {
    const server = apiServer(configMap());
    await Promise.all(
      ['alpha', 'beta'].map((slug) =>
        updateForgeAdmission(server, 'f9', {
          kind: 'claim',
          slug,
          root: `/srv/puni/worktrees/${slug}`,
          image: IMAGE,
        }),
      ),
    );
    expect(rootsIn(server.current()).sort()).toEqual(
      [COMMITTED, '/srv/puni/worktrees/alpha', '/srv/puni/worktrees/beta', SOLVER_NODE_PATH].sort(),
    );
  });

  it('releases a root by slug and gives up after bounded conflicts', async () => {
    const server = apiServer(configMap());
    await updateForgeAdmission(server, 'f9', {
      kind: 'claim',
      slug: 'alpha',
      root: '/srv/puni/worktrees/alpha',
      image: IMAGE,
    });
    await updateForgeAdmission(server, 'f9', { kind: 'release', slug: 'alpha' });
    expect(rootsIn(server.current())).toEqual([COMMITTED]);

    let replaced = 0;
    const busy: ForgeAdmissionStore = {
      read: () => Promise.resolve(configMap()),
      replace: () => {
        replaced += 1;
        return Promise.resolve('conflict');
      },
    };
    let refusal: unknown;
    try {
      await updateForgeAdmission(busy, 'f9', { kind: 'release', slug: 'alpha' }, 3);
    } catch (error) {
      refusal = error;
    }
    expect(String(refusal)).toContain('gave up after 3');
    expect(replaced).toBe(3);
  });
});
