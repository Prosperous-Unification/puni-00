import { describe, expect, it } from 'bun:test';

import {
  decodeForgeAdmission,
  encodeForgeAdmission,
  type ForgeAdmissionStore,
  planForgeAdmission,
  readInstallationRoots,
  rootsOf,
  SOLVER_NODE_PATH,
  updateForgeAdmission,
} from './forge-admission';

const IMAGE = `puni-f9-registry:5000/dev-environment@sha256:${'b'.repeat(64)}`;
const COMMITTED = '/srv/puni/worktrees/puni-00';
const INSTALLATION = '/srv/puni/puni-installations/reviewed';

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
      annotations: {
        'kustomize.toolkit.fluxcd.io/ssa': 'IfNotPresent',
        'puni.dev/forge-installation-owners': '{}',
        ...overrides.annotations,
      },
    },
    data: {
      solverImages: 'x',
      forgeImage: 'registry.puni.test/dev-environment@sha256:' + 'b'.repeat(64),
      forgeWorktreeRoots: COMMITTED,
      forgePuniInstallationRoots: '',
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
      installationOwners: {},
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
  const base = { forgeImage: IMAGE, baseRoots: [COMMITTED], owners: {}, installationOwners: {} };

  it('derives roots from the base, the claims and the solver directory', () => {
    const claimed = planForgeAdmission(base, {
      kind: 'claim',
      slug: 'alpha',
      root: '/srv/puni/worktrees/alpha',
      image: IMAGE,
      installationRoot: INSTALLATION,
    });
    expect(rootsOf(claimed)).toEqual([COMMITTED, '/srv/puni/worktrees/alpha', SOLVER_NODE_PATH]);
    expect(rootsOf(planForgeAdmission(claimed, { kind: 'release', slug: 'alpha' }))).toEqual([
      COMMITTED,
    ]);
  });

  it('refuses a second forge image while another environment holds the first', () => {
    const held = {
      ...base,
      owners: { alpha: '/srv/puni/worktrees/alpha' },
      installationOwners: { alpha: INSTALLATION },
    };
    expect(() =>
      planForgeAdmission(held, {
        kind: 'claim',
        slug: 'beta',
        root: '/srv/puni/worktrees/beta',
        image: IMAGE.replace('bbb', 'ddd'),
        installationRoot: INSTALLATION + '-beta',
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
      installationRoot: INSTALLATION,
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
          installationRoot: INSTALLATION,
        }),
      ),
    );
    expect(rootsIn(server.current()).sort()).toEqual(
      [COMMITTED, '/srv/puni/worktrees/alpha', '/srv/puni/worktrees/beta', SOLVER_NODE_PATH].sort(),
    );
    expect(decodeForgeAdmission(server.current(), 'f9').installationOwners).toEqual({
      alpha: INSTALLATION,
      beta: INSTALLATION,
    });
    expect(readInstallationRoots(decodeForgeAdmission(server.current(), 'f9'))).toEqual([
      INSTALLATION,
    ]);
  });

  it('releases a root by slug and gives up after bounded conflicts', async () => {
    const server = apiServer(configMap());
    await updateForgeAdmission(server, 'f9', {
      kind: 'claim',
      slug: 'alpha',
      root: '/srv/puni/worktrees/alpha',
      image: IMAGE,
      installationRoot: INSTALLATION,
    });
    await updateForgeAdmission(server, 'f9', { kind: 'release', slug: 'alpha' });
    expect(rootsIn(server.current())).toEqual([COMMITTED]);
    expect(decodeForgeAdmission(server.current(), 'f9').installationOwners).toEqual({});
    expect(readInstallationRoots(decodeForgeAdmission(server.current(), 'f9'))).toEqual([]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('trusted-workload fixture is not an object');
  return value;
}

it('round-trips exact installation claims separately from writable worktree policy parameters', () => {
  const parameters = configMap();
  const before = decodeForgeAdmission(parameters, 'f9');
  const claimed = planForgeAdmission(before, {
    kind: 'claim',
    slug: 'alpha',
    root: '/srv/puni/worktrees/alpha',
    image: IMAGE,
    installationRoot: INSTALLATION,
  });
  const encoded = encodeForgeAdmission(parameters, claimed);
  expect(readRecord(encoded['data'])['forgeWorktreeRoots']).toBe(
    COMMITTED + ',/srv/puni/worktrees/alpha,' + SOLVER_NODE_PATH,
  );
  expect(readRecord(encoded['data'])['forgePuniInstallationRoots']).toBe(INSTALLATION);
  expect(readRecord(encoded['metadata'])['resourceVersion']).toBe('1');
  expect(decodeForgeAdmission(encoded, 'f9')).toEqual(claimed);
  const restored = planForgeAdmission(claimed, {
    kind: 'restore',
    slug: 'alpha',
    previous: before,
  });
  expect(decodeForgeAdmission(encodeForgeAdmission(encoded, restored), 'f9')).toEqual(before);
});

it('refuses absent explicit installation admission fields instead of accepting a legacy parameter object', () => {
  const withoutRoots = configMap();
  delete readRecord(withoutRoots['data'])['forgePuniInstallationRoots'];
  expect(() => decodeForgeAdmission(withoutRoots, 'f9')).toThrow(
    'explicit PUNI installation admission state',
  );
  const withoutOwners = configMap();
  delete readRecord(readRecord(withoutOwners['metadata'])['annotations'])[
    'puni.dev/forge-installation-owners'
  ];
  expect(() => decodeForgeAdmission(withoutOwners, 'f9')).toThrow(
    'explicit PUNI installation admission state',
  );
});

it('refuses ambiguous installation directory spelling before policy encoding', () => {
  for (const path of ['relative', '/', '/srv/puni/../other', '/srv/puni/a,/etc', '/srv/puni/a/']) {
    const parameters = configMap({
      annotations: {
        'puni.dev/forge-installation-owners': JSON.stringify({ alpha: path }),
      },
    });
    expect(() => decodeForgeAdmission(parameters, 'f9')).toThrow('one exact absolute directory');
  }
});

it('refuses installation policy roots that do not exactly reflect their retained claims', () => {
  const missingClaim = configMap();
  readRecord(missingClaim['data'])['forgePuniInstallationRoots'] = INSTALLATION;
  expect(() => decodeForgeAdmission(missingClaim, 'f9')).toThrow('claims disagree');
  const repeated = configMap();
  readRecord(repeated['data'])['forgePuniInstallationRoots'] = INSTALLATION + ',' + INSTALLATION;
  expect(() => decodeForgeAdmission(repeated, 'f9')).toThrow('repeats an installation root');
  const withoutWorktree = configMap({
    annotations: {
      'puni.dev/forge-installation-owners': JSON.stringify({ alpha: INSTALLATION }),
    },
  });
  readRecord(withoutWorktree['data'])['forgePuniInstallationRoots'] = INSTALLATION;
  expect(() => decodeForgeAdmission(withoutWorktree, 'f9')).toThrow('without worktree claims');
});

it('refuses a malformed incoming installation claim before replacing admission after a healthy actual update', async () => {
  for (const installationRoot of [INSTALLATION + ',/etc', INSTALLATION + '/', 'relative']) {
    const server = apiServer(configMap());
    await updateForgeAdmission(server, 'f9', {
      kind: 'claim',
      slug: 'alpha',
      root: '/srv/puni/worktrees/alpha',
      image: IMAGE,
      installationRoot: INSTALLATION,
    });
    expect(decodeForgeAdmission(server.current(), 'f9').installationOwners).toEqual({
      alpha: INSTALLATION,
    });
    const before = structuredClone(server.current());
    let replacements = 0;
    const observed: ForgeAdmissionStore = {
      read: () => server.read(),
      replace: (replacement) => {
        replacements += 1;
        return server.replace(replacement);
      },
    };
    let rejection: unknown;
    try {
      await updateForgeAdmission(observed, 'f9', {
        kind: 'claim',
        slug: 'alpha',
        root: '/srv/puni/worktrees/alpha',
        image: IMAGE,
        installationRoot,
      });
    } catch (cause: unknown) {
      rejection = cause;
    }
    expect(replacements).toBe(0);
    expect(server.current()).toEqual(before);
    expect(rejection).toBeInstanceOf(Error);
    expect(String(rejection)).toContain('one exact absolute directory');
  }
});
