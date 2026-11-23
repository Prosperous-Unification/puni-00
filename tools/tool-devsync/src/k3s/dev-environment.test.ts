import { createHash } from 'node:crypto';
import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { scratchAsync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { needsRestart } from '../sync';
import {
  bindEnvironment,
  decodeLabRecord,
  decodeRunningEnvironments,
  digestRecreateInputs,
  type EnvironmentBinding,
  existingPodFingerprint,
  findForgeCluster,
  installFailureOf,
  type LabRecord,
  parseDevEnvironmentRequest,
  requireMountedRoot,
  requireOwnedWorktree,
  requireUniqueEnvironment,
  SOLVER_NODE_PATH,
  type WorktreeInspection,
} from './dev-environment';
import { fingerprintWorktree, hashWorktreePath } from './forge-supervisor';

const ROOT = join(import.meta.dir, '../../../..');
const OVERLAY = join(ROOT, 'deploy/k8s/wbs/overlays/dev');
const IMAGE = `puni-f9-registry:5000/dev-environment@sha256:${'b'.repeat(64)}`;

const LAB: LabRecord = {
  schemaVersion: 1,
  labId: 'f9',
  profile: 'fleet',
  network: 'puni-f9',
  registry: { host: 'puni-f9-registry', hostPort: 32780 },
  httpPort: 44425,
  worktreeRoot: '/home/dev/worktrees',
  worktreeRootIdentity: '2049:131',
  solverRuntime: '/home/dev/solver',
  clusters: [
    {
      name: 'puni-f9-platform',
      role: 'platform',
      clusterId: 'platform-local',
      context: 'k3d-puni-f9-platform',
      kubeconfig: '/k/platform',
      apiPort: 40001,
    },
    {
      name: 'puni-f9-workers',
      role: 'workers',
      clusterId: 'workers-local',
      context: 'k3d-puni-f9-workers',
      kubeconfig: '/k/workers',
      apiPort: 40002,
    },
  ],
};

// Pure renderer configuration; this record is not an authenticated installation observation.
const RENDER_SELECTION =
  JSON.stringify(
    {
      schemaVersion: 1,
      installationDirectory: '/home/dev/puni-installations/reviewed',
      archive: { path: 'authenticated-puni.tgz', sha256: 'a'.repeat(64) },
      entrypoint: 'node_modules/puni/dist/puni.mjs',
    },
    null,
    2,
  ) + '\n';
const RENDER_SELECTION_SHA = createHash('sha256').update(RENDER_SELECTION).digest('hex');
const BINDING: EnvironmentBinding = {
  slug: 'alpha',
  labId: 'f9',
  image: IMAGE,
  worktree: '/home/dev/worktrees/alpha',
  worktreeNodePath: '/srv/puni/worktrees/alpha',
  solverNodePath: SOLVER_NODE_PATH,
  host: 'alpha.localhost',
  origin: 'http://alpha.localhost:44425',
  recreateInputs: 'c'.repeat(64),
  ownerUid: 1000,
  ownerGid: 1000,
  puni: {
    installationNodePath: '/srv/puni/puni-installations/reviewed',
    entrypoint: '/opt/puni-dev/node_modules/puni/dist/puni.mjs',
    selection: RENDER_SELECTION,
    sha256: RENDER_SELECTION_SHA,
    directoryIdentity: '2049:133',
  },
};

/** The committed overlay as `kubectl kustomize` renders it: its resources in its namespace. */
async function renderOverlay(): Promise<Record<string, unknown>[]> {
  const kustomization = Bun.YAML.parse(
    await readFile(join(OVERLAY, 'kustomization.yaml'), 'utf8'),
  ) as { namespace: string; resources: string[] };
  const objects: Record<string, unknown>[] = [];
  for (const resource of kustomization.resources) {
    const object = Bun.YAML.parse(await readFile(join(OVERLAY, resource), 'utf8')) as {
      metadata: Record<string, unknown>;
    };
    object.metadata['namespace'] = kustomization.namespace;
    objects.push(object);
  }
  return objects;
}

function inspection(overrides: Partial<WorktreeInspection> = {}): WorktreeInspection {
  return {
    requested: '/home/dev/worktrees/alpha',
    realpath: '/home/dev/worktrees/alpha',
    ownerUid: 1000,
    ownerGid: 1000,
    topLevel: '/home/dev/worktrees/alpha',
    rootCommits: ['root-a'],
    ...overrides,
  };
}

const EXPECTED = { prefix: '/home/dev/worktrees', uid: 1000, rootCommits: ['root-a'] };

describe('parseDevEnvironmentRequest', () => {
  it('decodes up with a resolved worktree', () => {
    expect(
      parseDevEnvironmentRequest([
        'up',
        '--slug',
        'alpha',
        '--worktree',
        'wt',
        '--cluster',
        'puni-f9-platform',
        '--puni-selection',
        join(process.cwd(), 'selection.json'),
        '--puni-selection-sha256',
        'd'.repeat(64),
      ]),
    ).toEqual({
      action: 'up',
      slug: 'alpha',
      cluster: 'puni-f9-platform',
      worktree: join(process.cwd(), 'wt'),
      puniSelection: { path: join(process.cwd(), 'selection.json'), sha256: 'd'.repeat(64) },
    });
  });

  it('refuses a slug that is not a short DNS label', () => {
    for (const slug of ['Feature.X', 'a'.repeat(21), '1st', 'x-']) {
      expect(() =>
        parseDevEnvironmentRequest(['status', '--slug', slug, '--cluster', 'puni-f9-platform']),
      ).toThrow('DNS label');
    }
  });

  it('refuses up without a worktree, a non-lab cluster, and unknown or repeated flags', () => {
    expect(() =>
      parseDevEnvironmentRequest(['up', '--slug', 'a', '--cluster', 'puni-f9-platform']),
    ).toThrow('--worktree');
    expect(() =>
      parseDevEnvironmentRequest(['status', '--slug', 'a', '--cluster', 'production']),
    ).toThrow('k3d lab cluster');
    expect(() =>
      parseDevEnvironmentRequest(['down', '--slug', 'a', '--slug', 'b', '--cluster', 'x']),
    ).toThrow('Duplicate');
    expect(() => parseDevEnvironmentRequest(['down', '--namespace', 'wbs'])).toThrow('Unexpected');
  });
});

describe('findForgeCluster', () => {
  it('finds the platform cluster of a lab', () => {
    expect(findForgeCluster([LAB], 'puni-f9-platform').cluster.clusterId).toBe('platform-local');
  });

  it('refuses a workers cluster and an unknown cluster', () => {
    expect(() => findForgeCluster([LAB], 'puni-f9-workers')).toThrow('workers cluster');
    expect(() => findForgeCluster([LAB], 'puni-x-platform')).toThrow('not a k3d lab cluster');
  });

  it('decodes the lab record and refuses a malformed one', () => {
    expect(decodeLabRecord(JSON.stringify(LAB)).labId).toBe('f9');
    expect(() => decodeLabRecord(JSON.stringify({ ...LAB, httpPort: '80' }))).toThrow();
  });
});

describe('requireOwnedWorktree', () => {
  it('maps an owned worktree under the prefix to its node path', () => {
    expect(requireOwnedWorktree(inspection(), EXPECTED)).toBe('/srv/puni/worktrees/alpha');
  });

  it('refuses a symlink that escapes the prefix', () => {
    expect(() =>
      requireOwnedWorktree(
        inspection({ realpath: '/home/dev/elsewhere', topLevel: '/home/dev/elsewhere' }),
        EXPECTED,
      ),
    ).toThrow('symlink escape');
  });

  it('refuses a path outside the prefix and the prefix itself', () => {
    expect(() =>
      requireOwnedWorktree(
        inspection({ requested: '/srv/x', realpath: '/srv/x', topLevel: '/srv/x' }),
        EXPECTED,
      ),
    ).toThrow('outside the lab worktree root');
    expect(() =>
      requireOwnedWorktree(
        inspection({
          requested: '/home/dev/worktrees',
          realpath: '/home/dev/worktrees',
          topLevel: '/home/dev/worktrees',
        }),
        EXPECTED,
      ),
    ).toThrow('outside the lab worktree root');
  });

  it('refuses a subdirectory of a worktree', () => {
    expect(() =>
      requireOwnedWorktree(
        inspection({
          requested: '/home/dev/worktrees/alpha/apps',
          realpath: '/home/dev/worktrees/alpha/apps',
        }),
        EXPECTED,
      ),
    ).toThrow('not the top level');
  });

  it('refuses a worktree another user owns', () => {
    expect(() => requireOwnedWorktree(inspection({ ownerUid: 0 }), EXPECTED)).toThrow(
      'foreign worktree: owned by UID 0',
    );
  });

  it('refuses a checkout of another repository', () => {
    expect(() => requireOwnedWorktree(inspection({ rootCommits: ['root-z'] }), EXPECTED)).toThrow(
      'shares no root commit',
    );
  });

  it('refuses a path the comma-separated admission list cannot hold', () => {
    const path = '/home/dev/worktrees/a,b';
    expect(() =>
      requireOwnedWorktree(
        inspection({ requested: path, realpath: path, topLevel: path }),
        EXPECTED,
      ),
    ).toThrow('comma');
  });
});

describe('requireUniqueEnvironment', () => {
  const running = [
    {
      slug: 'alpha',
      namespace: 'puni-forge-alpha',
      worktree: '/w/alpha',
      worktreeNodePath: '/srv/puni/worktrees/alpha',
      image: IMAGE,
    },
  ];

  it('allows re-running up for the same slug and worktree', () => {
    expect(() => {
      requireUniqueEnvironment('alpha', '/w/alpha', running);
    }).not.toThrow();
  });

  it('refuses a legacy shared-namespace environment before creating a duplicate', () => {
    expect(() => {
      requireUniqueEnvironment('alpha', '/w/alpha', [{ ...running[0], namespace: 'puni-forge' }]);
    }).toThrow('prior revision');
  });

  it('refuses a duplicate slug for another worktree', () => {
    expect(() => {
      requireUniqueEnvironment('alpha', '/w/beta', running);
    }).toThrow('slug alpha already serves /w/alpha');
  });

  it('refuses a second slug for the same worktree', () => {
    expect(() => {
      requireUniqueEnvironment('beta', '/w/alpha', running);
    }).toThrow('already served as slug alpha');
  });
});

describe('bindEnvironment', () => {
  it('binds the committed overlay to one environment', async () => {
    const bound = bindEnvironment(await renderOverlay(), BINDING);
    const pod = bound.find((object) => object['kind'] === 'Pod') as {
      metadata: { name: string; labels: Record<string, string> };
      spec: {
        serviceAccountName: string;
        automountServiceAccountToken: boolean;
        nodeSelector: Record<string, string>;
        containers: {
          image: string;
          resources: unknown;
          env: { name: string; value: string }[];
          securityContext: Record<string, unknown>;
          volumeMounts: { name: string; mountPath: string; readOnly?: boolean }[];
        }[];
        volumes: Record<string, unknown>[];
      };
    };
    expect(pod.metadata.name).toBe('dev-alpha');
    // The fields the forge admission requires (infra/platform/policy/trusted-workloads.yaml).
    expect(pod.metadata.labels['puni.dev/controller']).toBe('dev-environment');
    expect(pod.spec.serviceAccountName).toBe('dev-environment-controller');
    expect(pod.spec.automountServiceAccountToken).toBe(false);
    expect(pod.spec.nodeSelector).toEqual({ 'puni.dev/capability-forge': 'true' });
    const container = pod.spec.containers[0];
    expect(container.image).toBe(IMAGE);
    expect(container.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      runAsNonRoot: true,
      capabilities: { drop: ['ALL'] },
      seccompProfile: { type: 'RuntimeDefault' },
    });
    expect(pod.spec.volumes).toEqual([
      { name: 'data', persistentVolumeClaim: { claimName: 'dev-alpha-data' } },
      {
        name: 'solver-runtime',
        hostPath: { path: SOLVER_NODE_PATH, type: 'Directory' },
      },
      {
        name: 'worktree',
        hostPath: { path: '/srv/puni/worktrees/alpha', type: 'Directory' },
      },
      {
        name: 'puni-installation',
        hostPath: { path: BINDING.puni.installationNodePath, type: 'Directory' },
      },
    ]);
    expect(container.volumeMounts).toContainEqual({
      name: 'solver-runtime',
      mountPath: '/run/wbs-solver',
      readOnly: true,
    });
    const environment = Object.fromEntries(
      container.env.map((variable) => [variable.name, variable.value]),
    );
    expect(environment['APP_ORIGIN']).toBe('http://alpha.localhost:44425');
    expect(environment['MCP_PUBLIC_URL']).toBe('http://alpha.localhost:44425/mcp');
    expect(environment['DB_PATH']).toBe('/data/wbs.db');
    expect(environment['PUNI_EXECUTABLE']).toBe(BINDING.puni.entrypoint);
    expect(environment['PUNI_SELECTION']).toBe(RENDER_SELECTION);
    expect(environment['PUNI_SELECTION_SHA256']).toBe(RENDER_SELECTION_SHA);
    expect(environment['NX_DAEMON']).toBe('false');
    // Proof: removing the overlay setting failed this assertion and the real Nx ownership test.
    expect(environment['NX_WORKSPACE_DATA_DIRECTORY']).toBe('/tmp/puni-forge-nx/workspace-data');
    expect(container.resources).toEqual({
      requests: { cpu: '250m', memory: '768Mi' },
      limits: { memory: '2Gi' },
    });
    expect(container.volumeMounts).toEqual([
      { name: 'worktree', mountPath: '/src' },
      { name: 'data', mountPath: '/data' },
      { name: 'solver-runtime', mountPath: '/run/wbs-solver', readOnly: true },
      { name: 'puni-installation', mountPath: '/opt/puni-dev', readOnly: true },
    ]);
    const ingress = bound.find((object) => object['kind'] === 'Ingress') as {
      spec: { rules: { host: string; http: { paths: { backend: unknown }[] } }[] };
    };
    expect(ingress.spec.rules.map((rule) => rule.host)).toEqual(['alpha.localhost']);
    for (const path of ingress.spec.rules[0]?.http.paths ?? []) {
      expect(path.backend).toMatchObject({ service: { name: 'dev-alpha' } });
    }
    for (const object of bound) {
      expect(object).toMatchObject({
        metadata: {
          namespace: 'puni-forge-alpha',
          labels: { 'puni.dev/dev-slug': 'alpha', 'puni.dev/lab-id': 'f9' },
        },
      });
    }
  });

  it('refuses an overlay with an extra object', async () => {
    const objects = await renderOverlay();
    const pod = objects.find((object) => object['kind'] === 'Pod');
    expect(() => bindEnvironment([...objects, structuredClone(pod ?? {})], BINDING)).toThrow(
      'must render exactly',
    );
  });

  it('refuses an object in another namespace and an extra volume', async () => {
    const moved = await renderOverlay();
    (moved[0] as { metadata: Record<string, unknown> }).metadata['namespace'] = 'wbs';
    expect(() => bindEnvironment(moved, BINDING)).toThrow('is not in puni-forge');

    const widened = await renderOverlay();
    const pod = widened.find((object) => object['kind'] === 'Pod') as {
      spec: { volumes: unknown[] };
    };
    pod.spec.volumes.push({ name: 'docker', hostPath: { path: '/var/run/docker.sock' } });
    expect(() => bindEnvironment(widened, BINDING)).toThrow('volumes must be exactly');
  });

  it('refuses a forge image that is not digest-pinned', async () => {
    const clean = await renderOverlay();
    expect(() =>
      bindEnvironment(clean, { ...BINDING, image: 'puni-f9-registry:5000/dev-environment:x' }),
    ).toThrow('digest-pinned');
  });

  it('runs the Pod as the worktree owner', async () => {
    const pod = bindEnvironment(await renderOverlay(), {
      ...BINDING,
      ownerUid: 1234,
      ownerGid: 2345,
    }).find((object) => object['kind'] === 'Pod') as {
      spec: { securityContext: Record<string, unknown> };
    };
    expect(pod.spec.securityContext).toMatchObject({ runAsUser: 1234, runAsGroup: 2345 });
  });

  it('refuses to run as root', async () => {
    const clean = await renderOverlay();
    expect(() => bindEnvironment(clean, { ...BINDING, ownerUid: 0 })).toThrow('owned by root');
  });

  it('changes the Pod fingerprint when the recreate inputs change', async () => {
    const annotation = (binding: EnvironmentBinding): unknown =>
      (
        bindEnvironment(renderedOnce, binding).find((object) => object['kind'] === 'Pod') as {
          metadata: { annotations: Record<string, string> };
        }
      ).metadata.annotations['puni.dev/pod-spec'];
    const renderedOnce = await renderOverlay();
    expect(annotation(BINDING)).toBe(annotation(BINDING));
    expect(annotation({ ...BINDING, recreateInputs: 'd'.repeat(64) })).not.toBe(
      annotation(BINDING),
    );
  });
});

describe('decodeRunningEnvironments', () => {
  it('reads the identity a bound Pod carries', async () => {
    const pod = bindEnvironment(await renderOverlay(), BINDING).find(
      (object) => object['kind'] === 'Pod',
    );
    expect(decodeRunningEnvironments(JSON.stringify({ items: [pod] }))).toEqual([
      {
        slug: 'alpha',
        namespace: 'puni-forge-alpha',
        worktree: '/home/dev/worktrees/alpha',
        worktreeNodePath: '/srv/puni/worktrees/alpha',
        image: IMAGE,
      },
    ]);
  });

  it('refuses a forge Pod without its identity', () => {
    expect(() =>
      decodeRunningEnvironments(JSON.stringify({ items: [{ metadata: { name: 'x' } }] })),
    ).toThrow('lacks its environment identity');
  });
});

describe('existingPodFingerprint', () => {
  it('reads the first listed Pod, so up can tell keep from recreate', async () => {
    const pod = bindEnvironment(await renderOverlay(), BINDING).find(
      (object) => object['kind'] === 'Pod',
    ) as { metadata: { annotations: Record<string, string> } };
    expect(existingPodFingerprint(JSON.stringify({ items: [pod] }))).toBe(
      pod.metadata.annotations['puni.dev/pod-spec'],
    );
    expect(existingPodFingerprint(JSON.stringify({ items: [] }))).toBeUndefined();
  });
});

describe('digestRecreateInputs', () => {
  it('depends on content and path, not listing order', () => {
    const a = { path: 'a', content: new TextEncoder().encode('1') };
    const b = { path: 'b', content: new TextEncoder().encode('2') };
    expect(digestRecreateInputs([a, b])).toBe(digestRecreateInputs([b, a]));
    expect(digestRecreateInputs([a, b])).not.toBe(
      digestRecreateInputs([a, { ...b, content: new TextEncoder().encode('3') }]),
    );
  });
});

describe('forge supervisor fingerprint', () => {
  it('restarts on a changed restart path and marks absence explicitly', async () => {
    const root = await scratchAsync('forge-fingerprint-');
    await mkdir(join(root, 'apps/wbs/be-01/drizzle'), { recursive: true });
    await writeFile(join(root, 'bun.lock'), '{}');
    const paths = ['bun.lock', 'apps/wbs/be-01/drizzle', 'nx.json'];
    const before = await fingerprintWorktree(root, paths);
    expect(before['nx.json']).toBe('absent');
    expect(needsRestart(before, await fingerprintWorktree(root, paths))).toBe(false);

    await writeFile(join(root, 'apps/wbs/be-01/drizzle/0001.sql'), 'select 1;');
    expect(needsRestart(before, await fingerprintWorktree(root, paths))).toBe(true);
  });

  it('hashes a file by content', async () => {
    const root = await scratchAsync('forge-hash-');
    await writeFile(join(root, 'nx.json'), '{}');
    const first = await hashWorktreePath(root, 'nx.json');
    await writeFile(join(root, 'nx.json'), '{ }');
    expect(await hashWorktreePath(root, 'nx.json')).not.toBe(first);
  });
});

describe('installFailureOf', () => {
  it('reports an install failure from the current or last termination', () => {
    const failed = (state: string) => ({
      status: {
        containerStatuses: [
          { [state]: { terminated: { message: 'install-required: bun install exited 1' } } },
        ],
      },
    });
    expect(installFailureOf(failed('lastState'))).toBe('install-required: bun install exited 1');
    expect(installFailureOf(failed('state'))).toBe('install-required: bun install exited 1');
    expect(
      installFailureOf({
        status: { containerStatuses: [{ lastState: { terminated: { message: 'tiers exited' } } }] },
      }),
    ).toBeUndefined();
  });
});

describe('requireMountedRoot', () => {
  it('accepts the recorded directory and refuses a root replaced after lab up', () => {
    expect(() => {
      requireMountedRoot('2049:131', '2049:131', '/w');
    }).not.toThrow();
    expect(() => {
      requireMountedRoot('2049:131', '2049:977', '/w');
    }).toThrow('not the directory the lab mounted');
  });
});

/** Wait for a subprocess observation within the fixture's own budget, including diagnostics. */
async function waitForNx(
  observe: () => boolean | Promise<boolean>,
  diagnosis: () => string,
): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (!(await observe())) {
    if (Date.now() >= deadline) throw new Error(`Nx fixture timed out: ${diagnosis()}`);
    await Bun.sleep(25);
  }
}

interface NxIdentity {
  readonly pid: number;
  readonly parent: number;
  readonly group: number;
  readonly started: string;
  readonly state: string;
}

interface NxOwnedProcess {
  readonly child: ReturnType<typeof Bun.spawn>;
  identity: NxIdentity | undefined;
  readonly native: {
    count: number;
    terminal:
      | {
          readonly code: number | null;
          readonly signal: unknown;
          readonly failure: Bun.ErrorLike | undefined;
        }
      | undefined;
  };
  readonly numeric: {
    settlement:
      | { readonly ok: true; readonly code: number }
      | { readonly ok: false; readonly cause: unknown }
      | undefined;
  };
  readonly output: () => string;
  stopped?: Promise<void>;
}

/** Linux fixture observations distinguish disappeared processes from unreadable or malformed identities. */
function readNxIdentity(pid: number): NxIdentity | undefined {
  let source: string;
  try {
    source = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
  } catch (cause) {
    if (
      cause instanceof Error &&
      'code' in cause &&
      (cause.code === 'ENOENT' || cause.code === 'ESRCH')
    )
      return undefined;
    throw cause;
  }
  const end = source.lastIndexOf(')');
  const fields = source
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  const state = fields.at(0);
  const parent = Number(fields.at(1));
  const group = Number(fields.at(2));
  const started = fields.at(19);
  if (
    end < 0 ||
    Number(source.slice(0, source.indexOf(' '))) !== pid ||
    state === undefined ||
    !/^[A-Za-z]$/.test(state) ||
    !Number.isSafeInteger(parent) ||
    parent < 0 ||
    !Number.isSafeInteger(group) ||
    group < 0 ||
    started === undefined ||
    !/^\d+$/.test(started)
  )
    throw new Error(`Nx fixture cannot decode process identity ${String(pid)}`);
  return { pid, parent, group, started, state };
}

function readNxProcesses(): NxIdentity[] {
  const processes: NxIdentity[] = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const identity = readNxIdentity(Number(name));
    if (identity !== undefined) processes.push(identity);
  }
  return processes;
}

function isNxLive(identity: NxIdentity): boolean {
  return identity.state !== 'Z' && identity.state !== 'X';
}

function readNxSettlement(owned: NxOwnedProcess) {
  return { terminal: owned.native.terminal, numeric: owned.numeric.settlement };
}

/**
 * Nx run-commands owns a detached executor group. Snapshot descendants while the known
 * launcher lives, signal only those observed groups, and require both launcher joins plus
 * no non-zombie members in every captured group. This is not a general subreaper contract.
 */
async function stopNxIn(ownedProcess: NxOwnedProcess): Promise<void> {
  const deadline = Date.now() + 5000;
  const identity = ownedProcess.identity;
  if (identity === undefined)
    throw new Error('Nx launcher identity was not acquired; scratch retained');
  const snapshot = readNxProcesses();
  const leader = snapshot.find((observed) => observed.pid === identity.pid);
  if (leader === undefined)
    throw new Error('Nx launcher disappeared before descendant capture; scratch retained');
  if (leader.started !== identity.started || leader.group !== identity.group)
    throw new Error('Nx launcher identity changed; scratch retained');
  const owned = new Map<number, NxIdentity>([[identity.pid, identity]]);
  let added: boolean;
  do {
    added = false;
    for (const observed of snapshot) {
      if (!owned.has(observed.pid) && owned.has(observed.parent)) {
        owned.set(observed.pid, observed);
        added = true;
      }
    }
  } while (added);
  const groups = new Set([...owned.values()].map((observed) => observed.group));
  if ([...groups].some((group) => group <= 0))
    throw new Error('Owned Nx descendant has no positive signal group; scratch retained');
  const failures: unknown[] = [];
  // Children first; killing only the launcher group would leave Nx's detached command alive.
  for (const group of [...groups].reverse()) {
    try {
      const members = readNxProcesses().filter(
        (observed) => observed.group === group && isNxLive(observed),
      );
      if (members.length === 0) continue;
      if (!members.some((observed) => owned.get(observed.pid)?.started === observed.started))
        throw new Error(
          `Nx group ${String(group)} has no retained process identity; scratch retained`,
        );
      try {
        process.kill(-group, 'SIGKILL');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
      }
    } catch (cause) {
      failures.push(cause);
    }
  }
  try {
    for (;;) {
      const live = readNxProcesses().filter(
        (observed) => groups.has(observed.group) && isNxLive(observed),
      );
      if (
        live.length === 0 &&
        ownedProcess.native.terminal !== undefined &&
        ownedProcess.numeric.settlement !== undefined
      )
        break;
      if (Date.now() >= deadline)
        throw new Error(
          `Nx cleanup did not confirm native/numeric/group terminal state: ${JSON.stringify(live)}`,
        );
      await Bun.sleep(25);
    }
    const { terminal, numeric } = readNxSettlement(ownedProcess);
    if (terminal === undefined || numeric === undefined || ownedProcess.native.count !== 1)
      throw new Error('Nx native/numeric observation is incomplete');
    if (!numeric.ok) throw numeric.cause;
    if (terminal.failure !== undefined) throw terminal.failure;
    if (terminal.signal === null) {
      if (
        terminal.code === null ||
        !Number.isSafeInteger(terminal.code) ||
        terminal.code < 0 ||
        terminal.code !== numeric.code
      )
        throw new Error('Nx normal native and numeric exits differ');
    } else if (terminal.code !== null || terminal.signal !== 'SIGKILL' || numeric.code !== 137) {
      throw new Error(
        `Nx native signal and numeric exit differ: ${JSON.stringify({ terminal, numeric })}`,
      );
    }
  } catch (cause) {
    failures.push(cause);
  }
  if (failures.length > 0)
    throw new AggregateError(failures, 'Nx cleanup is unconfirmed; scratch retained');
}

/** Memoization prevents a later cleanup pass from signalling a reused PID or process group. */
function stopNx(ownedProcess: NxOwnedProcess): Promise<void> {
  ownedProcess.stopped ??= stopNxIn(ownedProcess);
  return ownedProcess.stopped;
}

/** A final same-UID cwd census detects uncaptured fixture descendants without signalling them. */
function requireNxRootIdle(
  root: string,
  uid: number,
  predecessors: ReadonlyMap<number, string>,
): void {
  const live: NxIdentity[] = [];
  for (const observed of readNxProcesses()) {
    if (!isNxLive(observed)) continue;
    // These exact PID/start identities existed before fixture acquisition, so cannot be its children.
    // A reused PID with a different start identity is not excluded.
    if (predecessors.get(observed.pid) === observed.started) continue;
    try {
      // The controlled Bun/Nx fixture never changes credentials; foreign-UID processes cannot be its children.
      if (statSync(`/proc/${String(observed.pid)}`).uid !== uid) continue;
      const directory = readlinkSync(`/proc/${String(observed.pid)}/cwd`);
      if (directory === root || directory.startsWith(root + '/')) live.push(observed);
    } catch (cause) {
      if (!(
        cause instanceof Error &&
        'code' in cause &&
        (cause.code === 'ENOENT' || cause.code === 'ESRCH')
      ))
        throw cause;
    }
  }
  if (live.length > 0)
    throw new Error(
      `Nx fixture still has live processes in its owned cwd; retained ${root}: ${JSON.stringify(live)}`,
    );
}

function quoteNxArgument(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** Close the actual read-only Nx database even if its query throws, retaining both failures. */
function readNxOwnership(path: string, custody: { isClosed: boolean }): unknown[] {
  custody.isClosed = false;
  const database = new Database(path, { readonly: true });
  let ownership: unknown[] | undefined;
  let primary: { readonly cause: unknown } | undefined;
  try {
    ownership = database.query('SELECT * FROM running_tasks').all();
  } catch (cause) {
    primary = { cause };
  }
  let releaseFailure: { readonly cause: unknown } | undefined;
  try {
    database.close();
    custody.isClosed = true;
  } catch (cause: unknown) {
    releaseFailure = { cause };
  }
  if (releaseFailure !== undefined)
    throw new AggregateError(
      primary === undefined ? [releaseFailure.cause] : [primary.cause, releaseFailure.cause],
      'Nx ownership database close is unconfirmed',
      { cause: primary === undefined ? releaseFailure.cause : primary.cause },
    );
  if (primary !== undefined) throw primary.cause;
  if (ownership === undefined) throw new Error('Nx ownership query did not produce rows');
  return ownership;
}

describe('forge Nx workspace state', () => {
  it('starts independently of poisoned worktree ownership without changing its database', async () => {
    if (process.platform !== 'linux') throw new Error('Nx ownership fixture requires Linux /proc');
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error('Nx ownership fixture requires a POSIX uid');
    // This root must survive unknown child custody; scratchAsync deletes its roots on test-process exit.
    const predecessors = new Map(
      readNxProcesses().map((identity) => [identity.pid, identity.started]),
    );
    const root = realpathSync.native(await mkdtemp(join(tmpdir(), 'forge-nx-ownership-')));
    const runtime = process.execPath;
    const children: NxOwnedProcess[] = [];
    const custody = { hasUnknownAcquisition: false, hasUnknownDescriptor: false };
    const databaseCustody = { isClosed: true };
    let primary: { readonly cause: unknown } | undefined;
    try {
      await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'fixture', private: true }),
      );
      await writeFile(join(root, 'nx.json'), '{}');
      await writeFile(
        join(root, 'project.json'),
        JSON.stringify({
          name: 'fixture',
          targets: {
            serve: {
              executor: 'nx:run-commands',
              continuous: true,
              cache: false,
              options: {
                command: createLaunch(runtime, join(root, 'serve.cjs'))
                  .map(quoteNxArgument)
                  .join(' '),
              },
            },
          },
        }),
      );
      await writeFile(
        join(root, 'serve.cjs'),
        "require('node:fs').writeFileSync('started', String(process.pid)); setTimeout(() => process.exit(124), 55000);",
      );
      // A live colliding PID models ownership left by a previous container whose PID is reused.
      // Nx's installed native service writes the real schema and performs its real liveness check.
      await writeFile(
        join(root, 'owner.cjs'),
        `const nxRoot = require('node:path').dirname(require.resolve('nx/package.json'));
const { RunningTasksService } = require(nxRoot + '/dist/src/native');
const { getLocalDbConnection } = require(nxRoot + '/dist/src/utils/db-connection');
const ownership = new RunningTasksService(getLocalDbConnection());
module.exports = ownership;
ownership.addRunningTask('fixture:serve');
console.log('ownership ready');
setTimeout(() => process.exit(124), 55000);`,
      );
      const environment = { ...process.env };
      delete environment['NX_WORKSPACE_DATA_DIRECTORY'];
      delete environment['NX_PROJECT_GRAPH_CACHE_DIRECTORY'];
      Object.assign(environment, {
        NX_DAEMON: 'false',
        NX_TUI: 'false',
        NX_INTERACTIVE: 'false',
        NX_ISOLATE_PLUGINS: 'false',
        NX_NATIVE_COMMAND_RUNNER: 'false',
        NX_CACHE_DIRECTORY: join(root, '.nx/cache'),
        HOME: root,
      });
      const startNx = (command: readonly string[], env = environment): NxOwnedProcess => {
        const log = join(root, `process-${String(children.length)}.log`);
        const descriptor = openSync(log, 'a');
        const native: NxOwnedProcess['native'] = { count: 0, terminal: undefined };
        const numeric: NxOwnedProcess['numeric'] = { settlement: undefined };
        let launched: NxOwnedProcess | undefined;
        let acquisitionFailure: { readonly cause: unknown } | undefined;
        try {
          custody.hasUnknownAcquisition = true;
          const child = Bun.spawn([...command], {
            cwd: root,
            env,
            detached: true,
            stdin: 'ignore',
            stdout: descriptor,
            stderr: descriptor,
            onExit(_child, code, signal, failure) {
              native.count += 1;
              native.terminal = { code, signal, failure };
            },
          });
          launched = {
            child,
            native,
            numeric,
            identity: undefined,
            output: () => readFileSync(log, 'utf8'),
          };
          children.push(launched);
          custody.hasUnknownAcquisition = false;
          void child.exited.then(
            (code) => {
              numeric.settlement = { ok: true, code };
            },
            (cause: unknown) => {
              numeric.settlement = { ok: false, cause };
            },
          );
          launched.identity = readNxIdentity(child.pid);
          if (launched.identity?.group !== child.pid)
            throw new Error('Nx fixture did not acquire its detached launcher identity');
        } catch (cause) {
          acquisitionFailure = { cause };
        }
        let releaseFailure: { readonly cause: unknown } | undefined;
        try {
          closeSync(descriptor);
        } catch (cause: unknown) {
          custody.hasUnknownDescriptor = true;
          releaseFailure = { cause };
        }
        if (releaseFailure !== undefined) {
          if (acquisitionFailure !== undefined)
            throw new AggregateError(
              [acquisitionFailure.cause, releaseFailure.cause],
              'Nx acquisition and log descriptor close failed',
              { cause: acquisitionFailure.cause },
            );
          throw releaseFailure.cause;
        }
        if (acquisitionFailure !== undefined) throw acquisitionFailure.cause;
        if (launched === undefined) throw new Error('Nx fixture has no acquired process');
        return launched;
      };
      const owner = startNx(createLaunch(runtime, join(root, 'owner.cjs')));
      await waitForNx(() => owner.output().includes('ownership ready'), owner.output);
      const directory = join(root, '.nx/workspace-data');
      const databases = (await readdir(directory)).filter((name) => name.endsWith('.db'));
      expect(databases).toHaveLength(1);
      const databasePath = join(directory, databases[0]);
      const ownership = readNxOwnership(databasePath, databaseCustody);
      expect(ownership).toHaveLength(1);
      const nx = [
        ...createLaunch(runtime, join(ROOT, 'node_modules/nx/dist/bin/nx.js')),
        'run',
        'fixture:serve',
      ];
      const shared = startNx(nx);
      await waitForNx(
        () => shared.output().includes('Waiting for fixture:serve in another nx process'),
        shared.output,
      );
      expect(await Bun.file(join(root, 'started')).exists()).toBe(false);
      await stopNx(shared);
      const before = await readFile(databasePath);

      const pod = bindEnvironment(await renderOverlay(), BINDING).find(
        (object) => object['kind'] === 'Pod',
      ) as { spec: { containers: { env: { name: string; value: string }[] }[] } };
      const privateDirectory = pod.spec.containers[0].env.find(
        (variable) => variable.name === 'NX_WORKSPACE_DATA_DIRECTORY',
      )?.value;
      // The fixture maps the container's writable layer to a disposable directory.
      const privateEnvironment = { ...environment };
      if (privateDirectory !== undefined) {
        privateEnvironment['NX_WORKSPACE_DATA_DIRECTORY'] = join(
          root,
          'container',
          privateDirectory,
        );
      }
      const independent = startNx(nx, privateEnvironment);
      // Historical proof below used the original Node launcher; this Bun successor is not yet observed.
      // Proof: removing NX_WORKSPACE_DATA_DIRECTORY from the committed overlay timed out here;
      // installed Nx waited for fixture:serve in another process and never wrote started.
      await waitForNx(() => Bun.file(join(root, 'started')).exists(), independent.output);
      expect(independent.output()).not.toContain('Waiting for fixture:serve');
      expect(await readFile(databasePath)).toEqual(before);
      expect(readNxOwnership(databasePath, databaseCustody)).toEqual(ownership);
    } catch (cause) {
      primary = { cause };
    }
    const cleanup: unknown[] = [];
    const settlements = await Promise.allSettled(children.map(stopNx));
    for (const settlement of settlements) {
      if (settlement.status === 'rejected') cleanup.push(settlement.reason);
    }
    if (custody.hasUnknownAcquisition || custody.hasUnknownDescriptor || !databaseCustody.isClosed)
      cleanup.push(new Error('Nx acquisition, descriptor or database ownership is unknown'));
    try {
      requireNxRootIdle(root, uid, predecessors);
    } catch (cause) {
      cleanup.push(cause);
    }
    if (cleanup.length === 0) {
      try {
        await rm(root, { recursive: true });
      } catch (cause) {
        cleanup.push(cause);
      }
    }
    if (cleanup.length > 0)
      throw new AggregateError(
        primary === undefined ? cleanup : [primary.cause, ...cleanup],
        `Nx fixture failed; scratch retained at ${root}`,
      );
    if (primary !== undefined) throw primary.cause;
  }, 60_000);
});

it('Forge up parses an explicitly pinned installation selection while preserving down and status requests', () => {
  const shared = ['--slug', 'alpha', '--cluster', 'puni-f9-platform'];
  expect(parseDevEnvironmentRequest(['down', ...shared])).toEqual({
    action: 'down',
    slug: 'alpha',
    cluster: 'puni-f9-platform',
  });
  expect(parseDevEnvironmentRequest(['status', ...shared, '--worktree', 'wt'])).toEqual({
    action: 'status',
    slug: 'alpha',
    cluster: 'puni-f9-platform',
    worktree: join(process.cwd(), 'wt'),
  });
  const selection = join(process.cwd(), 'reviewed-puni-selection.json');
  const expected: {
    action: 'up';
    slug: string;
    cluster: string;
    worktree: string;
    puniSelection: { path: string; sha256: string };
  } = {
    action: 'up',
    slug: 'alpha',
    cluster: 'puni-f9-platform',
    worktree: join(process.cwd(), 'wt'),
    puniSelection: { path: selection, sha256: 'd'.repeat(64) },
  };
  expect(
    parseDevEnvironmentRequest([
      'up',
      ...shared,
      '--worktree',
      'wt',
      '--puni-selection',
      selection,
      '--puni-selection-sha256',
      'd'.repeat(64),
    ]),
  ).toEqual(expected);
});

it('keeps legacy lab schema closed and admits an explicit installation-mapped lab2', () => {
  expect(decodeLabRecord(JSON.stringify(LAB))).toEqual(LAB);
  expect(() =>
    decodeLabRecord(JSON.stringify({ ...LAB, puniInstallationRoot: '/home/dev/puni' })),
  ).toThrow('malformed');
  const current: LabRecord = {
    ...LAB,
    schemaVersion: 2,
    puniInstallationRoot: '/home/dev/puni',
    puniInstallationRootIdentity: '2049:132',
  };
  expect(decodeLabRecord(JSON.stringify(current))).toEqual(current);
  expect(() =>
    decodeLabRecord(JSON.stringify({ ...current, puniInstallationRootIdentity: undefined })),
  ).toThrow('malformed');
});

it('refuses absent, relative, malformed or out-of-scope selection arguments', () => {
  const up = ['up', '--slug', 'alpha', '--cluster', 'puni-f9-platform', '--worktree', 'wt'];
  expect(() => parseDevEnvironmentRequest(up)).toThrow('--puni-selection');
  expect(() =>
    parseDevEnvironmentRequest([
      ...up,
      '--puni-selection',
      'relative',
      '--puni-selection-sha256',
      'd'.repeat(64),
    ]),
  ).toThrow('must be absolute');
  expect(() =>
    parseDevEnvironmentRequest([
      ...up,
      '--puni-selection',
      '/selection.json',
      '--puni-selection-sha256',
      'wrong',
    ]),
  ).toThrow('64 lowercase');
  expect(() =>
    parseDevEnvironmentRequest([
      'down',
      '--slug',
      'alpha',
      '--cluster',
      'puni-f9-platform',
      '--puni-selection',
      '/selection.json',
      '--puni-selection-sha256',
      'd'.repeat(64),
    ]),
  ).toThrow('accepted only by');
});
