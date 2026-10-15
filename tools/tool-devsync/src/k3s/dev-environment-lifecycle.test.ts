import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

const MODULE = join(import.meta.dir, 'dev-environment.ts');
const KINDS = ['PersistentVolumeClaim', 'Service', 'Ingress', 'NetworkPolicy'];

interface LegacyState {
  readonly legacy: unknown;
  readonly admission: Record<string, unknown>;
  readonly leases: readonly string[];
  readonly calls: readonly string[][];
}

async function fixture(
  root: string,
  legacy: unknown,
): Promise<{ readonly executable: string; readonly state: LegacyState }> {
  const directory = join(root, '.puni/fleet-labs/k3d/review');
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'lab.json'),
    JSON.stringify({
      schemaVersion: 1,
      labId: 'review',
      profile: 'app',
      network: 'review',
      registry: { host: 'review', hostPort: 5050 },
      httpPort: 4200,
      worktreeRoot: '/worktrees',
      worktreeRootIdentity: '1:1',
      solverRuntime: '/run/solver',
      clusters: [
        {
          name: 'puni-review-platform',
          role: 'platform',
          clusterId: 'review',
          context: 'review',
          kubeconfig: '/review-config',
          apiPort: 6443,
        },
      ],
    }),
  );
  const state: LegacyState = {
    legacy,
    leases: ['dev-alpha', 'dev-wt-hash'],
    admission: {
      metadata: {
        resourceVersion: '1',
        labels: { 'puni.dev/lab-id': 'review' },
        annotations: {
          'puni.dev/forge-root-owners': '{"alpha":"/srv/puni/worktrees/alpha"}',
          'puni.dev/forge-base-roots': '',
        },
      },
      data: {
        forgeImage: `review@sha256:${'a'.repeat(64)}`,
        forgeWorktreeRoots: '/srv/puni/worktrees/alpha,/run/puni/solver',
      },
    },
    calls: [],
  };
  await writeFile(join(root, 'state.json'), JSON.stringify(state));
  const executable = join(root, 'kubectl');
  await writeFile(
    executable,
    `#!${process.execPath}
const root = ${JSON.stringify(root)};
const state = await Bun.file(root + '/state.json').json();
const args = process.argv.slice(6);
state.calls.push(args);
if (args[0] === 'get' && args[1] === 'configmap' && args[2] === 'puni-cluster-review') console.log(JSON.stringify({metadata:{labels:{'puni.dev/lab-id':'review'}}}));
else if (args[0] === 'get' && args[1].includes('persistentvolumeclaim')) {
  const kinds = { Pod: 'pods', PersistentVolumeClaim: 'persistentvolumeclaims', Service: 'services', Ingress: 'ingresses', NetworkPolicy: 'networkpolicies' };
  const members = Array.isArray(state.legacy.items) ? state.legacy.items.filter((member) => args[1].split(',').includes(kinds[member.kind])) : state.legacy.items;
  console.log(JSON.stringify(args.includes('--namespace=puni-forge') && args.includes('puni.dev/dev-slug=alpha') ? {items:members} : {items:[]}));
}
else if (args[0] === 'get' && args[1] === 'pods') console.log('{"items":[]}');
else if (args[0] === 'get' && args[1] === 'namespace') process.stdout.write('');
else if (args[0] === 'get' && args[1] === 'configmap') console.log(JSON.stringify(state.admission));
else if (args[0] === 'replace') state.admission = JSON.parse(await Bun.stdin.text());
else if (args[0] === 'delete' && args[1] === 'lease') state.leases = [];
else throw new Error('Unexpected ' + JSON.stringify(args));
await Bun.write(root + '/state.json', JSON.stringify(state));
`,
  );
  await chmod(executable, 0o755);
  return { executable, state };
}

async function invoke(
  root: string,
  executable: string,
  action: string,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const arguments_ = [
    action,
    '--slug',
    'alpha',
    '--cluster',
    'puni-review-platform',
    ...(action === 'up' ? ['--worktree', '/worktrees/alpha'] : []),
  ];
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `import { runDevEnvironment } from ${JSON.stringify(MODULE)}; await runDevEnvironment(${JSON.stringify(arguments_)}, ${JSON.stringify(root)});`,
    ],
    { env: { ...process.env, KUBECTL: executable }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe('legacy workload production command boundary', () => {
  it.each(
    KINDS.flatMap((kind) => ['up', 'status', 'down'].map((action) => [kind, action] as const)),
  )('refuses surviving %s on %s when the legacy Pod is gone', async (kind, action) => {
    const root = await scratchAsync('legacy-workload-');
    const legacy = {
      items: [
        {
          apiVersion: 'v1',
          kind,
          metadata: {
            name: 'dev-alpha-data',
            namespace: 'puni-forge',
            labels: { 'puni.dev/dev-slug': 'alpha', 'puni.dev/lab-id': 'review' },
          },
        },
      ],
    };
    const prepared = await fixture(root, legacy);
    const outcome = await invoke(root, prepared.executable, action);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('prior revision');
    expect(outcome.stdout).not.toContain('deleted');
    const observed = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')) as LegacyState;
    expect(observed.legacy).toEqual(legacy);
    expect(observed.admission).toEqual(prepared.state.admission);
    expect(observed.leases).toEqual(['dev-alpha', 'dev-wt-hash']);
    expect(
      observed.calls.some((arguments_) =>
        ['delete', 'replace', 'apply', 'create'].includes(arguments_[0] ?? ''),
      ),
    ).toBe(false);
  });

  it.each(['status', 'down'])(
    'allows %s when the shared namespace has no legacy workload',
    async (action) => {
      const root = await scratchAsync('legacy-workload-empty-');
      const prepared = await fixture(root, { items: [] });
      const outcome = await invoke(root, prepared.executable, action);
      expect(outcome.exitCode).toBe(0);
      const observed = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')) as LegacyState;
      if (action === 'status') {
        expect(outcome.stdout).toContain('not running');
        expect(observed.admission).toEqual(prepared.state.admission);
        expect(observed.leases).toEqual(['dev-alpha', 'dev-wt-hash']);
      } else {
        expect(outcome.stdout).toContain('released its admitted root');
        expect(observed.leases).toEqual([]);
        expect(observed.admission).not.toEqual(prepared.state.admission);
      }
    },
  );

  it('refuses a malformed legacy workload list before releasing admission or Leases', async () => {
    const root = await scratchAsync('legacy-workload-malformed-');
    const prepared = await fixture(root, { items: {} });
    const outcome = await invoke(root, prepared.executable, 'down');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('malformed legacy workload list');
    const observed = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')) as LegacyState;
    expect(observed.admission).toEqual(prepared.state.admission);
    expect(observed.leases).toEqual(['dev-alpha', 'dev-wt-hash']);
  });
});
