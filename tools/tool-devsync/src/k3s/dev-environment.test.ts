import { closeSync, openSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
      ]),
    ).toEqual({
      action: 'up',
      slug: 'alpha',
      cluster: 'puni-f9-platform',
      worktree: join(process.cwd(), 'wt'),
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

/** Kill the fixture's whole process group, including Nx executor descendants, before scratch cleanup. */
async function stopNx(child: ReturnType<typeof Bun.spawn>): Promise<void> {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (failure) {
    if (!(failure instanceof Error && 'code' in failure && failure.code === 'ESRCH')) {
      throw failure;
    }
  }
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          reject(new Error('Nx fixture failed to exit'));
        }, 3000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

describe('forge Nx workspace state', () => {
  it('starts independently of poisoned worktree ownership without changing its database', async () => {
    const root = await scratchAsync('forge-nx-ownership-');
    await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));
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
            options: { command: 'node serve.cjs' },
          },
        },
      }),
    );
    await writeFile(
      join(root, 'serve.cjs'),
      "require('node:fs').writeFileSync('started', String(process.pid)); setInterval(() => {}, 1000);",
    );
    // A live colliding PID models ownership left by a previous container whose PID is reused.
    // Nx's installed native service writes the real schema and performs its real liveness check.
    await writeFile(
      join(root, 'owner.cjs'),
      `const nxRoot = require('node:path').dirname(require.resolve('nx/package.json'));
const { RunningTasksService } = require(nxRoot + '/dist/src/native');
const { getLocalDbConnection } = require(nxRoot + '/dist/src/utils/db-connection');
const ownership = new RunningTasksService(getLocalDbConnection());
ownership.addRunningTask('fixture:serve');
console.log('ownership ready');
setInterval(() => {}, 1000);`,
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
    const children: ReturnType<typeof Bun.spawn>[] = [];
    const startNx = (command: string[], env = environment) => {
      const log = join(root, `process-${String(children.length)}.log`);
      const descriptor = openSync(log, 'a');
      let child: ReturnType<typeof Bun.spawn>;
      try {
        child = Bun.spawn(command, {
          cwd: root,
          env,
          detached: true,
          stdout: descriptor,
          stderr: descriptor,
        });
      } finally {
        closeSync(descriptor);
      }
      children.push(child);
      return { child, output: () => readFileSync(log, 'utf8') };
    };
    try {
      const owner = startNx(['node', 'owner.cjs']);
      await waitForNx(() => owner.output().includes('ownership ready'), owner.output);
      const directory = join(root, '.nx/workspace-data');
      const databases = (await readdir(directory)).filter((name) => name.endsWith('.db'));
      expect(databases).toHaveLength(1);
      const databasePath = join(directory, databases[0]);
      const database = new Database(databasePath, { readonly: true });
      const ownership = database.query('SELECT * FROM running_tasks').all();
      database.close();
      expect(ownership).toHaveLength(1);
      const nx = ['node', join(ROOT, 'node_modules/nx/dist/bin/nx.js'), 'run', 'fixture:serve'];
      const shared = startNx(nx);
      await waitForNx(
        () => shared.output().includes('Waiting for fixture:serve in another nx process'),
        shared.output,
      );
      expect(await Bun.file(join(root, 'started')).exists()).toBe(false);
      await stopNx(shared.child);
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
      // Proof: removing NX_WORKSPACE_DATA_DIRECTORY from the committed overlay timed out here;
      // installed Nx waited for fixture:serve in another process and never wrote started.
      await waitForNx(() => Bun.file(join(root, 'started')).exists(), independent.output);
      expect(independent.output()).not.toContain('Waiting for fixture:serve');
      expect(await readFile(databasePath)).toEqual(before);
      const unchanged = new Database(databasePath, { readonly: true });
      expect(unchanged.query('SELECT * FROM running_tasks').all()).toEqual(ownership);
      unchanged.close();
    } finally {
      await Promise.all(children.map(stopNx));
    }
  }, 45_000);
});
