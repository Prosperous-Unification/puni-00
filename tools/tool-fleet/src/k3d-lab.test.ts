import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import {
  decodeK3dLabRecord,
  decodeLabResources,
  decodeMemAvailable,
  isVmLabRequest,
  labNamesOf,
  parseK3dLabRequest,
  planK3dLabDown,
  prepareStateDirectory,
  PROFILES,
  renderK3dConfig,
  requireLoopbackPublished,
  requireProfileResources,
} from './k3d-lab';

const ROOT = join(import.meta.dir, '../../..');

const VALUES = {
  CLUSTER_NAME: 'puni-t1-platform',
  K3S_IMAGE: 'docker.io/rancher/k3s:v1.36.4-k3s1@sha256:' + 'a'.repeat(64),
  NETWORK: 'puni-t1',
  API_PORT: '40001',
  HTTP_PORT: '40002',
  WORKTREE_ROOT: '/home/dev/worktrees',
  SOLVER_RUNTIME: '/home/dev/solver',
  REGISTRY_HOST: 'puni-t1-registry',
  LAB_ID: 't1',
};

describe('parseK3dLabRequest', () => {
  it('decodes an up request with a resolved worktree root', () => {
    expect(
      parseK3dLabRequest(['up', '--id', 'f9', '--profile', 'app', '--worktree-root', 'wt']),
    ).toEqual({
      action: 'up',
      labId: 'f9',
      profile: 'app',
      worktreeRoot: join(process.cwd(), 'wt'),
    });
  });

  it('defaults the lab ID to local', () => {
    expect(parseK3dLabRequest(['status', '--profile', 'fleet']).labId).toBe('local');
  });

  it('refuses a flag without a value', () => {
    expect(() => parseK3dLabRequest(['up', '--worktree-root', '--profile', 'app'])).toThrow(
      'has no value',
    );
  });

  it('refuses a lab ID that is not a short DNS label', () => {
    for (const labId of ['../x', 'UPPER', 'a'.repeat(17), '-x']) {
      expect(() => parseK3dLabRequest(['status', '--id', labId, '--profile', 'app'])).toThrow(
        'DNS label',
      );
    }
  });

  it('refuses an unknown profile, action, or flag', () => {
    expect(() => parseK3dLabRequest(['up', '--profile', 'workers'])).toThrow('app, platform');
    expect(() => parseK3dLabRequest(['destroy', '--profile', 'app'])).toThrow('up, down');
    expect(() => parseK3dLabRequest(['down', '--profile', 'app', '--force', 'yes'])).toThrow(
      'Unexpected',
    );
  });

  it('requires an explicit worktree root on up and refuses mounts elsewhere', () => {
    expect(() => parseK3dLabRequest(['up', '--profile', 'app'])).toThrow('--worktree-root');
    expect(() =>
      parseK3dLabRequest(['down', '--profile', 'app', '--worktree-root', '/tmp']),
    ).toThrow('does not accept mount flags');
  });

  it('routes only --lab-id requests to the VM lab', () => {
    expect(isVmLabRequest(['up', '--lab-id', 'a', '--profile', 'platform'])).toBe(true);
    expect(isVmLabRequest(['up', '--id', 'a', '--profile', 'platform'])).toBe(false);
  });
});

describe('renderK3dConfig', () => {
  it('substitutes every placeholder', () => {
    expect(renderK3dConfig('name: ${CLUSTER_NAME}\nimage: ${K3S_IMAGE}\n', VALUES)).toBe(
      `name: puni-t1-platform\nimage: ${VALUES.K3S_IMAGE}\n`,
    );
  });

  it('refuses a placeholder without a value', () => {
    expect(() => renderK3dConfig('volume: ${WORKTREE_ROOT}:/srv', {})).toThrow(
      'WORKTREE_ROOT has no value',
    );
  });

  it('refuses a dollar sign it did not substitute', () => {
    // k3d would expand `$HOME` itself; the render must not hand it over.
    expect(() => renderK3dConfig('volume: $HOME:/srv', VALUES)).toThrow('dollar sign');
  });

  it('refuses a value that could break out of its YAML scalar', () => {
    expect(() => renderK3dConfig('volume: ${WORKTREE_ROOT}', { WORKTREE_ROOT: '/a: b' })).toThrow(
      'YAML-significant',
    );
  });

  it('renders both committed configs with loopback-only host ports and lab labels', async () => {
    for (const role of ['platform', 'workers']) {
      const template = await readFile(join(ROOT, `infra/local/${role}.k3d.yaml`), 'utf8');
      const config = Bun.YAML.parse(renderK3dConfig(template, VALUES)) as {
        kubeAPI: { hostIP: string };
        ports?: { port: string }[];
        image: string;
        options: {
          kubeconfig: { updateDefaultKubeconfig: boolean; switchCurrentContext: boolean };
          runtime: { labels: { label: string }[] };
        };
      };
      expect(config.kubeAPI.hostIP).toBe('127.0.0.1');
      for (const port of config.ports ?? []) expect(port.port).toStartWith('127.0.0.1:');
      expect(config.image).toBe(VALUES.K3S_IMAGE);
      expect(config.options.kubeconfig).toEqual({
        updateDefaultKubeconfig: false,
        switchCurrentContext: false,
      });
      expect(config.options.runtime.labels.map((label) => label.label)).toEqual([
        'puni.dev/lab-id=t1',
      ]);
    }
  });
});

describe('requireProfileResources', () => {
  it('accepts a host with room for the profile', () => {
    expect(() => {
      requireProfileResources('app', {
        availableMemoryMiB: PROFILES.app.memoryMiB,
        freeDiskMiB: PROFILES.app.diskMiB,
      });
    }).not.toThrow();
  });

  it('refuses a short host and names the next smaller profile', () => {
    expect(() => {
      requireProfileResources('fleet', { availableMemoryMiB: 11_000, freeDiskMiB: 300_000 });
    }).toThrow('Use --profile platform');
    expect(() => {
      requireProfileResources('platform', { availableMemoryMiB: 11_000, freeDiskMiB: 300_000 });
    }).toThrow('Use --profile app');
    expect(() => {
      requireProfileResources('app', { availableMemoryMiB: 64_000, freeDiskMiB: 100 });
    }).toThrow('Docker disk free');
  });

  it('points below app at native Bun', () => {
    expect(() => {
      requireProfileResources('app', { availableMemoryMiB: 100, freeDiskMiB: 300_000 });
    }).toThrow('bun run dev');
  });

  it('reads MemAvailable and refuses a kernel without it', () => {
    expect(decodeMemAvailable('MemTotal: 1 kB\nMemAvailable:    2097152 kB\n')).toBe(2048);
    expect(() => decodeMemAvailable('MemTotal: 1 kB\nMemFree: 1 kB\n')).toThrow('MemAvailable');
  });
});

describe('planK3dLabDown', () => {
  const names = labNamesOf('f9');

  it('deletes only lab-labelled resources with lab-derived names', () => {
    const containers = decodeLabResources(
      [
        `k3d-${names.platform}-server-0\tf9\t${names.platform}`,
        `k3d-${names.platform}-serverlb\tf9\t${names.platform}`,
        `${names.registry}\tf9\t`,
        'someone-else\tf9\tsomeone-else',
        `k3d-puni-other-platform-server-0\tother\tpuni-other-platform`,
      ].join('\n'),
    );
    const networks = decodeLabResources(`${names.network}\tf9\t\nshared\tf9\t\n`);
    expect(planK3dLabDown('f9', 'app', containers, networks)).toEqual({
      clusters: [names.platform],
      retained: [],
      registry: names.registry,
      network: names.network,
      ignored: ['someone-else'],
      removeState: true,
    });
  });

  it('never deletes a lab-named resource that lacks the lab label', () => {
    const containers = decodeLabResources(
      `k3d-${names.platform}-server-0\tother\t${names.platform}\n${names.registry}\t\t\n`,
    );
    expect(planK3dLabDown('f9', 'app', containers, [])).toEqual({
      clusters: [],
      retained: [],
      registry: undefined,
      network: undefined,
      ignored: [],
      removeState: true,
    });
  });

  const fleet = decodeLabResources(
    [
      `k3d-${names.platform}-server-0\tf9\t${names.platform}`,
      `k3d-${names.workers}-server-0\tf9\t${names.workers}`,
      `${names.registry}\tf9\t`,
    ].join('\n'),
  );
  const fleetNetworks = decodeLabResources(`${names.network}\tf9\t\n`);

  it('leaves clusters outside the named profile', () => {
    const teardown = planK3dLabDown('f9', 'app', fleet, fleetNetworks);
    expect(teardown.clusters).toEqual([names.platform]);
    expect(teardown.retained).toEqual([names.workers]);
    expect(planK3dLabDown('f9', 'fleet', fleet, fleetNetworks).clusters).toEqual([
      names.platform,
      names.workers,
    ]);
  });

  it('keeps state while anything it names remains', () => {
    const partial = planK3dLabDown('f9', 'app', fleet, fleetNetworks);
    expect([partial.registry, partial.network, partial.removeState]).toEqual([
      undefined,
      undefined,
      false,
    ]);
    const decoyOnly = decodeLabResources('someone-else\tf9\tsomeone-else\n');
    expect(planK3dLabDown('f9', 'app', decoyOnly, []).removeState).toBe(false);
    expect(planK3dLabDown('f9', 'fleet', fleet, fleetNetworks).removeState).toBe(true);
  });

  it('refuses an unreadable Docker row', () => {
    expect(() => decodeLabResources('only-a-name\n')).toThrow('Unreadable');
  });
});

describe('requireLoopbackPublished', () => {
  it('accepts loopback-only bindings', () => {
    expect(() => {
      requireLoopbackPublished(
        'k3d-x-serverlb',
        '80/tcp -> 127.0.0.1:44425\n6443/tcp -> 127.0.0.1:44219\n',
      );
    }).not.toThrow();
  });

  it('refuses a port published beyond loopback', () => {
    for (const output of [
      '80/tcp -> 0.0.0.0:44425\n',
      '80/tcp -> 127.0.0.1:1\n80/tcp -> [::]:44425\n',
      '',
    ]) {
      expect(() => {
        requireLoopbackPublished('k3d-x-serverlb', output);
      }).toThrow('127.0.0.1 only');
    }
  });
});

describe('prepareStateDirectory', () => {
  async function repository(ignore: string): Promise<string> {
    const root = await scratchAsync('k3d-lab-state-');
    expect(Bun.spawnSync(['git', 'init', '-q', root]).exitCode).toBe(0);
    await writeFile(join(root, '.gitignore'), ignore);
    return root;
  }

  it('creates an owner-only directory that Git ignores', async () => {
    const root = await repository('.puni/fleet-labs/\n');
    const directory = await prepareStateDirectory(root, 'f9');
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, '.puni/fleet-labs/k3d'))).mode & 0o777).toBe(0o700);
  });

  it('refuses a state directory Git would commit', async () => {
    const root = await repository('');
    const refusal = await prepareStateDirectory(root, 'f9').catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(Error);
    expect(String(refusal)).toContain('not ignored by Git');
  });

  it('tightens an existing directory to owner-only', async () => {
    const root = await repository('.puni/fleet-labs/\n');
    await mkdir(join(root, '.puni/fleet-labs/k3d/f9'), { recursive: true, mode: 0o755 });
    expect((await stat(await prepareStateDirectory(root, 'f9'))).mode & 0o777).toBe(0o700);
  });
});

describe('decodeK3dLabRecord', () => {
  const record = {
    schemaVersion: 1,
    labId: 'f9',
    profile: 'app',
    network: 'puni-f9',
    registry: { host: 'puni-f9-registry', hostPort: 32780 },
    httpPort: 44425,
    worktreeRoot: '/w',
    worktreeRootIdentity: '2049:131',
    solverRuntime: '/s',
    clusters: [
      {
        name: 'puni-f9-platform',
        role: 'platform',
        clusterId: 'platform-local',
        context: 'k3d-puni-f9-platform',
        kubeconfig: '/k',
        apiPort: 40001,
      },
    ],
  };

  it('accepts the record up writes', () => {
    expect(JSON.stringify(decodeK3dLabRecord(JSON.stringify(record)))).toBe(JSON.stringify(record));
  });

  it('refuses a record with an unknown field or a missing cluster', () => {
    expect(() => decodeK3dLabRecord(JSON.stringify({ ...record, extra: 1 }))).toThrow('malformed');
    expect(() => decodeK3dLabRecord(JSON.stringify({ ...record, clusters: [] }))).toThrow(
      'malformed',
    );
    const { worktreeRootIdentity: _identity, ...withoutIdentity } = record;
    expect(() => decodeK3dLabRecord(JSON.stringify(withoutIdentity))).toThrow('malformed');
  });
});
