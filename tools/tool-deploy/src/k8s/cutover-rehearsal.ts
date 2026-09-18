/**
 * Local rehearsal of the first Compose → k3s cutover (F11). The old side is the production
 * Compose shape run in local Docker: the real `tier.compose.tmpl` and `site.caddy.tmpl`
 * (`@tools/compose`), the real be-01/gw-01/fe-01 images, the Caddy edge with
 * `log-redact.caddy`, and the images' own migration CLIs. The new side is the F8 k3d lab
 * profile. Between them it runs every step of `CUTOVER_PHASES`, then rehearses the pre-switch
 * rollback: the old writer restarts, the edge unfences, and the old side accepts writes again.
 *
 * `bunx nx run tool-deploy:rehearse:cutover` (`K3D`, `KUBECTL` = locked binaries). Owns only
 * `puni-f11-*` containers, networks, images and k3d objects, and deletes them unless `--keep`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { renderTemplate, siteCaddyTmpl, tierComposeTmpl } from '@tools/compose';
import type { Tier } from '@tools/deploy-contract';
import { parseAllDocuments } from 'yaml';

import {
  assertExportSound,
  assertRestoredMatches,
  CUTOVER_PHASES,
  type CutoverPhase,
  exportArgv,
  fencedSiteContext,
  parseSqliteReport,
  type SqliteReport,
} from './cutover';
import { restoreJob } from './cutover-cli';
import { prepareDesiredRevision } from './deploy-repo';
import {
  backendTaskJob,
  executeRelease,
  kubectlEffects,
  type ReleaseEffects,
  renderOverlay,
  run,
} from './execute';
import { serveGitHttp } from './git-http';
import { fileJournal } from './journal';
import { K8S_TIERS, type ReleaseIdentity, releaseIdOf, type ReleaseRequest } from './release';

const ROOT = resolve(import.meta.dir, '../../../..');
const PREFIX = 'puni-f11-';
const CLUSTER = `${PREFIX}cutover`;
const REGISTRY = `${PREFIX}registry`;
const CONTEXT = `k3d-${CLUSTER}`;
const NETWORK = `${PREFIX}net`;
const PROJECT = `${PREFIX}old`;
const SITE = 'wbs.f11.test';
const NAMESPACES = { app: 'wbs', backend: 'wbs-solver' };
const KNOWN = ['f11-known-alpha', 'f11-known-beta'];
const MIN_AVAILABLE_BYTES = 3.5 * 1024 ** 3;
/** Production runs `caddy:2-alpine` (deploy/compose/base.yml); the rehearsal pins one digest of it. */
const EDGE_IMAGE =
  'docker.io/library/caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d';

const state = resolve(process.env['PUNI_F11_STATE'] ?? join(ROOT, 'tmp/puni-f11-cutover'));
const kubectl = process.env['KUBECTL'] ?? 'kubectl';
const k3d = process.env['K3D'] ?? 'k3d';
const keep = process.argv.includes('--keep');
const lock = JSON.parse(readFileSync(join(ROOT, 'infra/versions/toolchain.json'), 'utf8')) as {
  binaries: Record<string, { version: string }>;
  runtimeImages: Record<string, { name: string; digest: string }>;
  manifests: { fluxInstall: { sha256: string } };
};

function log(line: string): void {
  console.log(`[cutover ${new Date().toISOString().slice(11, 19)}] ${line}`);
}

function phase(name: CutoverPhase): void {
  log(
    `phase ${String(CUTOVER_PHASES.indexOf(name) + 1)}/${String(CUTOVER_PHASES.length)}: ${name}`,
  );
}

async function sh(
  cmd: readonly string[],
  stdin: string | null = null,
  ms = 600_000,
): Promise<string> {
  const invocation = await run(cmd, stdin, ms);
  if (invocation.exitCode !== 0) {
    throw new Error(
      `${cmd.join(' ')} exited ${String(invocation.exitCode)}:\n${invocation.stderr.trim()}`,
    );
  }
  return invocation.stdout;
}

const k = (args: readonly string[], stdin: string | null = null, ms = 300_000): Promise<string> =>
  sh(
    [kubectl, '--kubeconfig', join(state, 'kubeconfig'), '--context', CONTEXT, ...args],
    stdin,
    ms,
  );

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  log(`assert ok: ${message}`);
}

/** Refuses to start heavy work when the shared host lacks memory (other agents' VMs run here). */
function assertMemory(): void {
  const meminfo = readFileSync('/proc/meminfo', 'utf8');
  const available = Number(/^MemAvailable:\s+(\d+) kB$/m.exec(meminfo)?.[1] ?? Number.NaN) * 1024;
  if (!(available >= MIN_AVAILABLE_BYTES)) {
    throw new Error(
      `only ${String(Math.round(available / 1024 ** 2))} MiB available; need 3.5 GiB`,
    );
  }
  log(`memory available: ${String(Math.round(available / 1024 ** 2))} MiB`);
}

async function preflight(): Promise<void> {
  assertMemory();
  if (!(await sh([k3d, 'version'], null, 30_000)).includes(lock.binaries['k3d'].version)) {
    throw new Error(`k3d must be ${lock.binaries['k3d'].version}`);
  }
  if (
    !(await sh([kubectl, 'version', '--client'], null, 30_000)).includes(
      lock.binaries['kubectl'].version,
    )
  ) {
    throw new Error(`kubectl must be ${lock.binaries['kubectl'].version}`);
  }
  const containers = await sh(['docker', 'ps', '-a', '--format', '{{.Names}}']);
  const owned = containers
    .split('\n')
    .filter((name) => name.startsWith(PREFIX) || name.startsWith(`k3d-${PREFIX}`));
  if (owned.length > 0) throw new Error(`leftover ${PREFIX} containers: ${owned.join(', ')}`);
}

async function build(tag: string, dockerfile: string): Promise<void> {
  log(`building ${tag}`);
  await sh(
    ['docker', 'build', '-q', '-f', join(ROOT, dockerfile), '-t', tag, ROOT],
    null,
    1_800_000,
  );
}

/** Pushes to the lab registry; returns the host-side and in-cluster digest references. */
async function publish(
  local: string,
  repository: string,
  port: number,
): Promise<{ host: string; cluster: string }> {
  const pushed = `127.0.0.1:${String(port)}/${repository}:f11`;
  await sh(['docker', 'tag', local, pushed]);
  const digest = /digest: (sha256:[0-9a-f]{64})/.exec(await sh(['docker', 'push', pushed]))?.[1];
  if (digest === undefined) throw new Error(`push of ${pushed} printed no digest`);
  return {
    host: `127.0.0.1:${String(port)}/${repository}@${digest}`,
    cluster: `k3d-${REGISTRY}:5000/${repository}@${digest}`,
  };
}

async function upCluster(): Promise<number> {
  const registry = lock.runtimeImages['registry'];
  const node = lock.runtimeImages['k3dNode'];
  await sh([
    k3d,
    'registry',
    'create',
    REGISTRY,
    '--image',
    `${registry.name}@${registry.digest}`,
    '--port',
    '127.0.0.1:0',
  ]);
  const port = Number(
    (await sh(['docker', 'port', `k3d-${REGISTRY}`, '5000/tcp'])).trim().split(':').at(-1),
  );
  if (!Number.isInteger(port)) throw new Error('registry port unreadable');
  await sh([
    k3d,
    'cluster',
    'create',
    CLUSTER,
    '--image',
    `${node.name}@${node.digest}`,
    '--servers',
    '1',
    '--agents',
    '0',
    '--no-lb',
    '--registry-use',
    `k3d-${REGISTRY}:5000`,
    '--k3s-arg',
    '--disable=traefik@server:0',
    '--k3s-arg',
    '--disable=metrics-server@server:0',
    '--kubeconfig-update-default=false',
    '--kubeconfig-switch-context=false',
    '--wait',
    '--timeout',
    '180s',
  ]);
  writeFileSync(join(state, 'kubeconfig'), await sh([k3d, 'kubeconfig', 'get', CLUSTER]), {
    mode: 0o600,
  });
  return port;
}

// ---- old side: the production Compose shape, locally --------------------------------------

const old = join(state, 'old');
const container = (app: string): string => `${PREFIX}${app}-blue`;
const EDGE = `${PREFIX}caddy`;

/** Mirrors `tierComposeContext` for a local layout: same template, names prefixed, no solver. */
function tierCompose(
  app: string,
  image: string,
  extra: { envFiles: string[]; environment?: string; volumes?: string },
): string {
  return renderTemplate(tierComposeTmpl, {
    CONTAINER: container(app),
    NETWORK,
    IMAGE: image,
    ENV_FILES: `    env_file:\n${extra.envFiles.map((f) => `      - ${f}`).join('\n')}\n`,
    ENVIRONMENT: extra.environment ?? '',
    VOLUMES: extra.volumes ?? '',
  });
}

function siteCaddy(context: Record<string, string>): string {
  return renderTemplate(siteCaddyTmpl, context);
}

function normalSite(): string {
  return siteCaddy({
    SITE_ADDRESS: `http://${SITE}`,
    MCP_ROUTES: '',
    BE_ROUTE: `reverse_proxy ${container('be-01')}:3100`,
    GW_ROUTE: `reverse_proxy ${container('gw-01')}:3200`,
    FE_ROUTE: `reverse_proxy ${container('fe-01')}:80`,
  });
}

async function edgePort(): Promise<number> {
  return Number(
    (await sh(['docker', 'port', EDGE, '80/tcp'])).trim().split('\n')[0].split(':').at(-1),
  );
}

async function edge(method: string, path: string, body: string | null = null): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${String(await edgePort())}${path}`, {
    method,
    headers: { host: SITE, origin: `http://${SITE}`, 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return response.status;
}

async function compose(args: readonly string[]): Promise<string> {
  const files = ['edge', 'be', 'gw', 'fe'].flatMap((name) => ['-f', join(old, `${name}.yml`)]);
  return sh(['docker', 'compose', '-p', PROJECT, ...files, ...args], null, 600_000);
}

async function upOld(images: Record<Tier, string>): Promise<void> {
  mkdirSync(join(old, 'data'), { recursive: true });
  mkdirSync(join(old, 'caddy'), { recursive: true });
  mkdirSync(join(old, 'logs'), { recursive: true });
  const secret = 'f11-rehearsal-only-secret-000000000000';
  writeFileSync(
    join(old, 'be-01.env'),
    `PORT=3100\nLOG_LEVEL=info\nGW_URL=http://${container('gw-01')}:3200\nDB_PATH=/data/wbs.db\nAUTH_MODE=local\nNODE_ENV=lab\n`,
  );
  writeFileSync(
    join(old, 'gw-01.env'),
    `PORT=3200\nLOG_LEVEL=info\nBE_URL=http://${container('be-01')}:3100\nAUTH_MODE=local\nNODE_ENV=lab\n`,
  );
  writeFileSync(
    join(old, 'secrets.env'),
    `INTERNAL_AUTH_SECRET=${secret}\nJWT_SIGNING_KEY_CURRENT=${secret}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(old, 'be.yml'),
    tierCompose('be-01', images.be, {
      envFiles: [join(old, 'be-01.env'), join(old, 'secrets.env')],
      environment: `    environment:\n      APP_ORIGIN: "http://${SITE}"\n`,
      volumes: `    volumes:\n      - ${join(old, 'data')}:/data\n`,
    }),
  );
  writeFileSync(
    join(old, 'gw.yml'),
    tierCompose('gw-01', images.gw, {
      envFiles: [join(old, 'gw-01.env'), join(old, 'secrets.env')],
    }),
  );
  writeFileSync(join(old, 'fe-01.env'), '');
  writeFileSync(
    join(old, 'fe.yml'),
    tierCompose('fe-01', images.fe, { envFiles: [join(old, 'fe-01.env')] }),
  );
  writeFileSync(
    join(old, 'caddy', 'log-redact.caddy'),
    readFileSync(join(ROOT, 'deploy/compose/log-redact.caddy')),
  );
  writeFileSync(
    join(old, 'caddy', 'Caddyfile'),
    '{\n\tadmin localhost:2019\n}\nimport log-redact.caddy\nimport site.caddy\n',
  );
  writeFileSync(join(old, 'caddy', 'site.caddy'), normalSite());
  writeFileSync(
    join(old, 'edge.yml'),
    [
      'networks:',
      `  ${NETWORK}:`,
      `    name: ${NETWORK}`,
      'services:',
      '  edge:',
      `    image: ${EDGE_IMAGE}`,
      `    container_name: ${EDGE}`,
      `    networks: [${NETWORK}]`,
      "    ports: ['127.0.0.1::80']",
      '    volumes:',
      `      - ${join(old, 'caddy')}:/etc/caddy:ro`,
      `      - ${join(old, 'logs')}:/var/log/caddy`,
      '',
    ].join('\n'),
  );
  await compose(['up', '-d']);
  // The swap applies migrations with the image's own CLI (`migrateCommand`); so does this.
  await sh(['docker', 'exec', container('be-01'), 'bun', 'run', 'src/migrate-cli.ts']);
  await sh(['docker', 'restart', container('be-01')]);
  for (let attempt = 0; ; attempt++) {
    const status = await edge('GET', '/api/projects').catch(() => 0);
    if (status === 200) break;
    if (attempt > 60)
      throw new Error(`old edge never served /api/projects (last ${String(status)})`);
    await Bun.sleep(1000);
  }
}

async function oldMigrationStatus(): Promise<string> {
  return sh(['docker', 'exec', container('be-01'), 'bun', 'run', 'src/migrate-status-cli.ts']);
}

async function reloadEdge(site: string): Promise<void> {
  writeFileSync(join(old, 'caddy', 'site.caddy'), site);
  await sh(['docker', 'exec', EDGE, 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile']);
}

async function activeConnections(): Promise<number> {
  const out = await sh([
    'docker',
    'exec',
    container('gw-01'),
    'bun',
    '-e',
    "const r = await fetch('http://127.0.0.1:3200/metrics/snapshot'); console.log(JSON.stringify(await r.json()))",
  ]);
  const snapshot = JSON.parse(out) as { activeConnections?: unknown };
  if (typeof snapshot.activeConnections !== 'number')
    throw new Error(`gw metrics lack activeConnections: ${out}`);
  return snapshot.activeConnections;
}

// ---- new side: restore into the PVC ---------------------------------------------------------

/** The new side, empty: F6 policy and storage, the rendered overlay with the writer at 0. */
async function prepareNewSide(identity: ReleaseIdentity): Promise<void> {
  const node = (await k(['get', 'nodes', '-o', 'jsonpath={.items[0].metadata.name}'])).trim();
  await k(['label', 'node', node, 'puni.dev/capability-product=true', '--overwrite']);
  await sh(['docker', 'exec', `k3d-${CLUSTER}-server-0`, 'mkdir', '-p', '/run/puni/solver']);
  await k(['apply', '-k', join(ROOT, 'infra/platform/policy')]);
  await k(['apply', '-k', join(ROOT, 'infra/platform/storage/local')]);
  await k([
    '-n',
    'wbs-solver',
    'patch',
    'configmap',
    'puni-trusted-workload',
    '--type=merge',
    '-p',
    JSON.stringify({ data: { solverImages: identity.images.backend } }),
  ]);
  const rendered = await renderOverlay(
    { kubectl, overlay: join(ROOT, 'deploy/k8s/wbs/overlays/local') },
    identity,
  );
  // The writer must not start on an empty volume before the restore: replicas 0 from the start.
  const documents = parseAllDocuments(rendered).map((document) => {
    const object = document.toJS() as {
      kind?: string;
      metadata?: { name?: string };
      spec?: { replicas?: number };
    };
    if (
      object.kind === 'Deployment' &&
      object.metadata?.name === 'wbs-backend' &&
      object.spec !== undefined
    ) {
      object.spec.replicas = 0;
    }
    return JSON.stringify(object);
  });
  await k(
    ['apply', '-f', '-'],
    `{"apiVersion":"v1","kind":"List","items":[${documents.join(',')}]}`,
  );
}

/**
 * Runs one restore Job with `exportFile` copied in. Returns the Job's logs and whether it
 * completed; a refused restore fails the Job.
 */
async function runRestoreJob(
  image: string,
  exported: SqliteReport,
  exportFile: string,
  name: string,
): Promise<{ completed: boolean; logs: string }> {
  await k(['create', '-f', '-'], JSON.stringify(restoreJob(image, exported, name)));
  const selector = `job-name=${name}`;
  // The pod appears after the Job, and a refused restore exits before it is ever Ready.
  let pod = '';
  let podPhase = '';
  await until(`restore pod for ${name}`, 300_000, async () => {
    const found = JSON.parse(
      await k(['-n', 'wbs-solver', 'get', 'pod', '-l', selector, '-o', 'json']),
    ) as { items: { metadata: { name: string }; status: { phase: string } }[] };
    if (found.items.length === 0) return false;
    pod = found.items[0].metadata.name;
    podPhase = found.items[0].status.phase;
    return podPhase === 'Running' || podPhase === 'Succeeded' || podPhase === 'Failed';
  });
  if (podPhase === 'Failed') {
    return { completed: false, logs: await k(['-n', 'wbs-solver', 'logs', pod]) };
  }
  try {
    await k([
      '-n',
      'wbs-solver',
      'cp',
      '-c',
      'task',
      exportFile,
      `${pod}:/data/cutover-incoming.sqlite`,
    ]);
    await k([
      '-n',
      'wbs-solver',
      'exec',
      pod,
      '-c',
      'task',
      '--',
      'touch',
      '/data/cutover-incoming.done',
    ]);
  } catch (cause) {
    // A restore that refused at start is gone before the copy; its Job status says so below.
    log(
      `copy into ${pod} failed: ${cause instanceof Error ? cause.message.split('\n')[0] : String(cause)}`,
    );
  }
  const deadline = Date.now() + 300_000;
  let outcome = '';
  while (outcome === '') {
    const status = (
      await k([
        '-n',
        'wbs-solver',
        'get',
        `job/${name}`,
        '-o',
        'jsonpath={.status.succeeded}/{.status.failed}',
      ])
    ).trim();
    if (status.startsWith('1/')) outcome = 'succeeded';
    else if (status.endsWith('/1')) outcome = 'failed';
    else if (Date.now() > deadline) throw new Error(`restore Job ${name} did not finish in 300s`);
    else await Bun.sleep(1000);
  }
  const complete = outcome === 'succeeded';
  return { completed: complete, logs: await k(['-n', 'wbs-solver', 'logs', `job/${name}`]) };
}

// ---- Flux: the WBS unit over a lab Git smart-HTTP source ------------------------------------

const FLUX = { namespace: 'flux-system', kustomization: 'wbs', gitRepository: 'wbs-deploy' };
const MANIFEST = 'clusters/local/wbs/release.yaml';
const fluxDirectory = join(state, 'flux');
const bare = join(fluxDirectory, 'deploy.git');
const clone = join(fluxDirectory, 'clone');

function git(cwd: string, ...args: string[]): string {
  const child = Bun.spawnSync({
    cmd: ['git', '-C', cwd, '-c', 'user.name=f11', '-c', 'user.email=f11@lab.invalid', ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 60_000,
  });
  if (child.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr.toString()}`);
  return child.stdout.toString().trim();
}

/** Locked Flux controllers; only source and kustomize run, to keep the lab small. */
async function installFlux(): Promise<void> {
  const path = join(ROOT, 'infra/platform/flux/install.yaml');
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (digest !== lock.manifests.fluxInstall.sha256) {
    throw new Error(
      `${path} sha256 ${digest} is not the locked ${lock.manifests.fluxInstall.sha256}`,
    );
  }
  await k(['apply', '--server-side', '-f', path]);
  await k([
    '-n',
    'flux-system',
    'scale',
    'deployment',
    'helm-controller',
    'notification-controller',
    '--replicas=0',
  ]);
  for (const controller of ['source-controller', 'kustomize-controller']) {
    await k([
      '-n',
      'flux-system',
      'rollout',
      'status',
      `deployment/${controller}`,
      '--timeout=300s',
    ]);
  }
}

/** The deploy repository: a bare repo the lab Git server serves, and the clone that commits. */
async function startDeployRepository(): Promise<{
  url: string;
  c0: string;
  stop: () => Promise<void>;
}> {
  rmSync(fluxDirectory, { recursive: true, force: true });
  mkdirSync(join(clone, 'clusters/local/wbs'), { recursive: true });
  git(fluxDirectory, 'init', '--quiet', '--bare', '-b', 'main', bare);
  git(clone, 'init', '--quiet', '-b', 'main');
  git(clone, 'remote', 'add', 'origin', bare);
  writeFileSync(
    join(clone, MANIFEST),
    'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: wbs-deploy-placeholder\n  namespace: flux-system\n',
  );
  git(clone, 'add', MANIFEST);
  git(clone, 'commit', '--quiet', '-m', 'wbs: placeholder before the cutover');
  git(clone, 'push', '--quiet', 'origin', 'main');
  const gateway = (
    await sh([
      'docker',
      'network',
      'inspect',
      `k3d-${CLUSTER}`,
      '-f',
      '{{range .IPAM.Config}}{{.Gateway}}{{end}}',
    ])
  ).trim();
  const server = serveGitHttp(fluxDirectory, gateway);
  return {
    url: `http://${gateway}:${String(server.port)}/deploy.git`,
    c0: git(bare, 'rev-parse', 'main'),
    stop: () => server.stop(),
  };
}

async function createFluxUnit(url: string): Promise<void> {
  const objects = [
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'GitRepository',
      metadata: { name: FLUX.gitRepository, namespace: FLUX.namespace },
      spec: { interval: '10s', url, ref: { branch: 'main' }, timeout: '30s' },
    },
    {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: { name: FLUX.kustomization, namespace: FLUX.namespace },
      spec: {
        interval: '10s',
        path: './clusters/local/wbs',
        prune: false,
        timeout: '2m',
        sourceRef: { kind: 'GitRepository', name: FLUX.gitRepository },
      },
    },
  ];
  await k(['apply', '-f', '-'], JSON.stringify({ apiVersion: 'v1', kind: 'List', items: objects }));
}

async function fluxField(kind: 'kustomization' | 'gitrepository', path: string): Promise<string> {
  const name = kind === 'kustomization' ? FLUX.kustomization : FLUX.gitRepository;
  const resource =
    kind === 'kustomization'
      ? `kustomizations.kustomize.toolkit.fluxcd.io/${name}`
      : `gitrepositories.source.toolkit.fluxcd.io/${name}`;
  return (await k(['-n', FLUX.namespace, 'get', resource, '-o', `jsonpath={${path}}`])).trim();
}

const suspended = async (): Promise<boolean> =>
  (await fluxField('kustomization', '.spec.suspend')) === 'true';
const lastApplied = (): Promise<string> =>
  fluxField('kustomization', '.status.lastAppliedRevision');

async function setSuspended(value: boolean): Promise<void> {
  await k([
    '-n',
    FLUX.namespace,
    'patch',
    `kustomizations.kustomize.toolkit.fluxcd.io/${FLUX.kustomization}`,
    '--type=merge',
    '-p',
    JSON.stringify({ spec: { suspend: value } }),
  ]);
}

async function requestReconcile(): Promise<void> {
  const at = `reconcile.fluxcd.io/requestedAt=${new Date().toISOString()}`;
  await k([
    '-n',
    FLUX.namespace,
    'annotate',
    '--overwrite',
    `gitrepositories.source.toolkit.fluxcd.io/${FLUX.gitRepository}`,
    at,
  ]);
  await k([
    '-n',
    FLUX.namespace,
    'annotate',
    '--overwrite',
    `kustomizations.kustomize.toolkit.fluxcd.io/${FLUX.kustomization}`,
    at,
  ]);
}

async function until(label: string, ms: number, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`${label} did not happen within ${String(ms)}ms`);
    await Bun.sleep(2000);
  }
}

async function waitApplied(revision: string): Promise<void> {
  await requestReconcile();
  await until(`Flux applying ${revision}`, 240_000, async () =>
    (await lastApplied()).endsWith(revision),
  );
}

/** The release's full manifests, committed and pushed to the deploy branch. */
async function commitRelease(identity: ReleaseIdentity, message: string): Promise<string> {
  writeFileSync(
    join(clone, MANIFEST),
    await renderOverlay(
      { kubectl, overlay: join(ROOT, 'deploy/k8s/wbs/overlays/local') },
      identity,
    ),
  );
  git(clone, 'add', MANIFEST);
  git(clone, 'commit', '--quiet', '-m', message);
  git(clone, 'push', '--quiet', 'origin', 'main');
  return git(clone, 'rev-parse', 'HEAD');
}

/** Moves the served branch directly (lab resets only). */
function setBranch(revision: string): void {
  git(bare, 'update-ref', 'refs/heads/main', revision);
}

async function backendReplicas(): Promise<string> {
  return (
    await k([
      '-n',
      'wbs-solver',
      'get',
      'deployment',
      'wbs-backend',
      '-o',
      'jsonpath={.spec.replicas}',
    ])
  ).trim();
}

/** Backend pods that can still run (the writer, not schema Jobs). */
async function backendPods(): Promise<string[]> {
  const pods = JSON.parse(
    await k([
      '-n',
      'wbs-solver',
      'get',
      'pods',
      '-l',
      'app.kubernetes.io/name=wbs-backend',
      '-o',
      'json',
    ]),
  ) as {
    items: { metadata: { name: string; deletionTimestamp?: string }; status: { phase: string } }[];
  };
  return pods.items
    .filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed')
    .map((p) => p.metadata.name);
}

/** Samples backend pods every 500 ms; `stop()` returns the most seen at once. */
function watchBackend(): { stop: () => Promise<{ max: number; samples: number }> } {
  const flag = { running: true };
  let max = 0;
  let samples = 0;
  const loop = (async () => {
    while (flag.running) {
      const pods = await backendPods().catch(() => null);
      if (pods !== null) {
        samples++;
        max = Math.max(max, pods.length);
      }
      await Bun.sleep(500);
    }
  })();
  return {
    stop: async () => {
      flag.running = false;
      await loop;
      return { max, samples };
    },
  };
}

async function backendGet(path: string): Promise<{ status: number; body: string }> {
  const out = await k([
    '-n',
    'wbs-solver',
    'exec',
    'deployment/wbs-backend',
    '--',
    'bun',
    '-e',
    `const r = await fetch('http://127.0.0.1:3100${path}', { headers: { host: '${SITE}' } }); console.log(JSON.stringify({ status: r.status, body: await r.text() }))`,
  ]);
  return JSON.parse(out) as { status: number; body: string };
}

async function down(): Promise<void> {
  await run(
    ['docker', 'compose', '-p', PROJECT, 'down', '--volumes', '--remove-orphans'],
    null,
    300_000,
  );
  await run(['docker', 'network', 'rm', NETWORK], null, 60_000);
  await run([k3d, 'cluster', 'delete', CLUSTER], null, 300_000);
  await run([k3d, 'registry', 'delete', `k3d-${REGISTRY}`], null, 120_000);
  // Observed after run 4: the registry deletion left the cluster's network behind.
  await run(['docker', 'network', 'rm', `k3d-${CLUSTER}`], null, 60_000);
  const images = await sh(['docker', 'images', '--format', '{{.Repository}}:{{.Tag}}']);
  for (const image of images
    .split('\n')
    .filter((name) => name.includes('puni-f11') || name.includes(':f11'))) {
    await run(['docker', 'rmi', image], null, 120_000);
  }
  // The old side's data directory was written by root inside be-01.
  const probe = lock.runtimeImages['networkProbe'];
  const removed = await run(
    [
      'docker',
      'run',
      '--rm',
      '-v',
      `${state}:/state`,
      `${probe.name}@${probe.digest}`,
      'rm',
      '-rf',
      '/state/old',
      '/state/export',
    ],
    null,
    120_000,
  );
  if (removed.exitCode !== 0)
    log(
      `CLEANUP INCOMPLETE: remove ${state}/old and ${state}/export as root: ${removed.stderr.trim()}`,
    );
}

async function main(): Promise<void> {
  mkdirSync(state, { recursive: true, mode: 0o700 });
  await preflight();
  const sourceSha = (await sh(['git', '-C', ROOT, 'rev-parse', 'HEAD'])).trim();
  log(`source ${sourceSha}; state ${state}`);
  const port = await upCluster();
  let stopGit: () => Promise<void> = () => Promise.resolve();
  try {
    await build(`${PREFIX}be:v1`, 'apps/wbs/be-01/Dockerfile');
    await build(`${PREFIX}gw:v1`, 'apps/wbs/gw-01/Dockerfile');
    await build(`${PREFIX}fe:v1`, 'apps/wbs/fe-01/Dockerfile');
    await build(`${PREFIX}mcp:v1`, 'deploy/k8s/wbs/lab/mcp-01.Dockerfile');
    const be = await publish(`${PREFIX}be:v1`, 'wbs-be-01', port);
    const gw = await publish(`${PREFIX}gw:v1`, 'wbs-gw-01', port);
    const fe = await publish(`${PREFIX}fe:v1`, 'wbs-fe-01', port);
    const mcp = await publish(`${PREFIX}mcp:v1`, 'wbs-mcp-01', port);
    const identity: ReleaseIdentity = {
      sourceSha,
      images: { backend: be.cluster, gateway: gw.cluster, frontend: fe.cluster, mcp: mcp.cluster },
    };
    log(`old digests = new digests: ${JSON.stringify(identity.images)}`);
    assertMemory();

    log('new side: locked Flux and an active WBS unit whose source holds only a placeholder');
    await installFlux();
    const deployRepository = await startDeployRepository();
    stopGit = deployRepository.stop;
    const c0 = deployRepository.c0;
    await createFluxUnit(deployRepository.url);
    await waitApplied(c0);
    assert(!(await suspended()), `WBS unit active and applied ${c0.slice(0, 12)}`);

    log('old side: production Compose shape up; known rows written through the edge');
    await upOld({ be: be.host, gw: gw.host, fe: fe.host });
    for (const name of KNOWN) {
      assert(
        (await edge('POST', '/api/projects', JSON.stringify({ name }))) === 200,
        `old edge accepted ${name}`,
      );
    }
    const statusBefore = await oldMigrationStatus();
    log(`old applied migration status:\n${statusBefore.trim()}`);

    phase('fence-edge-writes');
    await reloadEdge(
      siteCaddy(
        fencedSiteContext(
          `http://${SITE}`,
          `${container('be-01')}:3100`,
          `${container('fe-01')}:80`,
        ),
      ),
    );
    assert(
      (await edge('POST', '/api/projects', JSON.stringify({ name: 'f11-too-late' }))) === 503,
      'fenced edge refuses a write with 503',
    );
    assert((await edge('GET', '/api/projects')) === 200, 'fenced edge still serves reads');
    assert((await edge('GET', '/ws')) === 503, 'fenced edge refuses WebSockets');

    phase('drain-gateway');
    const deadline = Date.now() + 60_000;
    let open = await activeConnections();
    while (open > 0 && Date.now() < deadline) {
      await Bun.sleep(2000);
      open = await activeConnections();
    }
    assert(open === 0, `gateway drained (${String(open)} active connections)`);
    await sh(['docker', 'stop', '--time', '30', container('gw-01')]);

    phase('stop-writer');
    await sh(['docker', 'stop', '--time', '30', container('be-01')]);
    const running = (await sh(['docker', 'ps', '--format', '{{.Names}}'])).split('\n');
    assert(!running.includes(container('be-01')), 'no old writer runs');

    phase('export-sqlite');
    mkdirSync(join(state, 'export'), { recursive: true });
    const exported = parseSqliteReport(
      await sh(exportArgv(be.host, join(old, 'data'), 'wbs.db', join(state, 'export'), KNOWN)),
    );
    writeFileSync(join(state, 'export-report.json'), JSON.stringify(exported, null, 2));
    log(
      `export ${exported.sha256}: ${String(exported.migrations.length)} migrations, counts ${JSON.stringify(exported.counts)}`,
    );

    phase('verify-export');
    assertExportSound(exported);
    assert(
      exported.migrations.at(-1) === statusBefore.trim(),
      `newest exported migration ${String(exported.migrations.at(-1))} is what the old side's status CLI reported`,
    );
    assert(exported.counts['project'] === KNOWN.length, 'exactly the known projects were exported');

    const exportFile = join(state, 'export', 'wbs-export.sqlite');
    log('negative: restore without suspending Flux while the source already names the release');
    const c1 = await commitRelease(identity, 'wbs: cutover release');
    await prepareNewSide(identity);
    await waitApplied(c1);
    await until('Flux restarting the writer', 240_000, async () => {
      const pods = await backendPods();
      if (pods.length === 0) return false;
      const phase = await k([
        '-n',
        'wbs-solver',
        'get',
        'pod',
        pods[0],
        '-o',
        'jsonpath={.status.phase}',
      ]);
      return phase.trim() === 'Running';
    });
    assert((await backendReplicas()) === '1', 'Flux re-applied replicas 1 over the hand-set 0');
    await Bun.sleep(5000);
    const raced = await runRestoreJob(
      identity.images.backend,
      exported,
      exportFile,
      'wbs-cutover-restore-raced',
    );
    assert(
      !raced.completed && raced.logs.includes('already exists; refusing to overwrite it'),
      'the restore refused the database the Flux-started writer created',
    );
    log(
      'reset after the negative: suspend, source back to the placeholder, raced database removed',
    );
    await setSuspended(true);
    setBranch(c0);
    // Resuming before the source serves c0 would re-apply c1 (a writer on the volume) first.
    await requestReconcile();
    await until('the source serving the placeholder again', 240_000, async () =>
      (await fluxField('gitrepository', '.status.artifact.revision')).endsWith(c0),
    );
    await k(['-n', 'wbs-solver', 'scale', 'deployment', 'wbs-backend', '--replicas=0']);
    await until(
      'the raced writer stopping',
      180_000,
      async () => (await backendPods()).length === 0,
    );
    await k(['-n', 'wbs-solver', 'delete', 'job', 'wbs-cutover-restore-raced', '--wait=true']);
    // puni-local retains volume data (Retain), so the raced database is removed in place.
    const wipe = backendTaskJob(
      { namespaces: NAMESPACES },
      'wbs-cutover-wipe',
      identity.images.backend,
      {},
    );
    const wipeSpec = wipe['spec'] as {
      template: { spec: { containers: { command: string[] }[] } };
    };
    wipeSpec.template.spec.containers[0].command = [
      'bun',
      '-e',
      "for (const f of ['wbs.sqlite', 'wbs.sqlite-wal', 'wbs.sqlite-shm']) require('node:fs').rmSync('/data/' + f, { force: true })",
    ];
    await k(['create', '-f', '-'], JSON.stringify(wipe));
    await k([
      '-n',
      'wbs-solver',
      'wait',
      '--for=condition=complete',
      'job/wbs-cutover-wipe',
      '--timeout=300s',
    ]);
    await setSuspended(false);
    await waitApplied(c0);
    assert(!(await suspended()), 'WBS unit active again at the placeholder');

    phase('suspend-flux');
    const order: string[] = [];
    await setSuspended(true);
    assert(await suspended(), 'the WBS unit reports suspended');
    order.push('suspended');

    phase('restore-into-pvc');
    await prepareNewSide(identity);
    order.push('replicas-0');
    assert(
      order.indexOf('suspended') < order.indexOf('replicas-0'),
      'the unit was suspended before the writer was set to 0 replicas',
    );
    // Worst case: the source names the release (replicas 1) during the restore.
    setBranch(c1);
    await requestReconcile();
    const racing = watchBackend();
    const tampered = join(state, 'export', 'tampered.sqlite');
    writeFileSync(tampered, Buffer.concat([readFileSync(exportFile), Buffer.from([0])]));
    const refused = await runRestoreJob(
      identity.images.backend,
      exported,
      tampered,
      'wbs-cutover-restore-tampered',
    );
    assert(
      !refused.completed && refused.logs.includes(`not ${exported.sha256}`),
      'a tampered export is refused by the restore Job before it reaches /data/wbs.sqlite',
    );
    const restoredRun = await runRestoreJob(
      identity.images.backend,
      exported,
      exportFile,
      'wbs-cutover-restore',
    );
    assert(restoredRun.completed, 'the restore Job completed with the real export');
    await Bun.sleep(25_000);
    const raceWatch = await racing.stop();
    assert(
      raceWatch.max === 0 && (await backendReplicas()) === '0',
      `no Flux-started writer while suspended with the release in the source (max ${String(raceWatch.max)} over ${String(raceWatch.samples)} samples)`,
    );
    assert((await lastApplied()).endsWith(c0), 'the suspended unit applied nothing new');
    const restored = parseSqliteReport(restoredRun.logs);
    writeFileSync(join(state, 'restore-report.json'), JSON.stringify(restored, null, 2));
    assertRestoredMatches(exported, restored);
    log(
      `restored ${restored.path}: same sha256, migrations and counts; owner uid ${String(restored.ownerUid)}`,
    );

    phase('start-tiers');
    await k(['-n', 'wbs-solver', 'scale', 'deployment', 'wbs-backend', '--replicas=1']);
    for (const tier of K8S_TIERS) {
      const namespace = tier === 'backend' ? 'wbs-solver' : 'wbs';
      await k(['-n', namespace, 'rollout', 'status', `deployment/wbs-${tier}`, '--timeout=300s']);
    }
    const settings = {
      kubectl,
      kubeconfig: join(state, 'kubeconfig'),
      context: CONTEXT,
      namespaces: NAMESPACES,
      stateDir: state,
      overlay: join(ROOT, 'deploy/k8s/wbs/overlays/local'),
      anonymousProjectsStatus: 200 as const,
      rolloutTimeoutSeconds: 120,
      jobTimeoutSeconds: 300,
      drainTimeoutMs: 5000,
      leaseDurationSeconds: 20,
      log,
    };
    await kubectlEffects(settings).persistRelease(identity);
    const current = await kubectlEffects(settings).currentRelease();
    assert(
      current !== null && JSON.stringify(current.images) === JSON.stringify(identity.images),
      'release record names the restored release; F8 releases can start from it',
    );
    log('cutover step 8: resume the WBS unit onto the committed release');
    const handover = watchBackend();
    await setSuspended(false);
    await waitApplied(c1);
    const handed = await handover.stop();
    const adopted = await kubectlEffects(settings).currentRelease();
    assert(
      adopted !== null && JSON.stringify(adopted.images) === JSON.stringify(identity.images),
      'Flux applied the release manifests with the same digests the restore started',
    );
    assert(
      handed.max <= 1,
      `at most one backend pod across the resume (max ${String(handed.max)})`,
    );

    phase('smoke-host-override');
    await kubectlEffects(settings).smoke('f11-cutover', identity);
    const listed = await backendGet('/api/projects');
    assert(listed.status === 200, `GET /api/projects with Host: ${SITE} answers 200`);
    for (const name of KNOWN)
      assert(listed.body.includes(name), `known row ${name} is served by k3s`);

    log('F8 deploy:k3s through the WBS Flux unit: publish only while suspended, resume onto it');
    await sh(
      [
        'docker',
        'build',
        '-q',
        '-f',
        join(ROOT, 'deploy/k8s/wbs/lab/backend-upgrade.Dockerfile'),
        '--build-arg',
        `BASE=${PREFIX}be:v1`,
        '-t',
        `${PREFIX}be:v2`,
        join(ROOT, 'deploy/k8s/wbs/lab'),
      ],
      null,
      1_800_000,
    );
    const be2 = await publish(`${PREFIX}be:v2`, 'wbs-be-01', port);
    const v2: ReleaseIdentity = { sourceSha, images: { ...identity.images, backend: be2.cluster } };
    const repository = { path: clone, remote: 'origin', branch: 'main' };
    const revisions = prepareDesiredRevision(
      repository,
      MANIFEST,
      await renderOverlay({ kubectl, overlay: join(ROOT, 'deploy/k8s/wbs/overlays/local') }, v2),
      releaseIdOf(v2),
    );
    assert(revisions.previousRevision === c1, 'the prepared commit sits on the cutover release');
    const uid = (
      await k(['get', 'namespace', 'kube-system', '-o', 'jsonpath={.metadata.uid}'])
    ).trim();
    const request: ReleaseRequest = {
      environment: 'local',
      cluster: { context: CONTEXT, uid },
      namespaces: NAMESPACES,
      release: v2,
      expectedCurrent: identity,
      admission: { package: 'lab-package', activation: 'lab-activation' },
      flux: { ...FLUX, ...revisions },
      recovers: null,
    };
    const real = kubectlEffects({ ...settings, deployRepository: repository });
    const observedAtPublish: { suspended: boolean; branch: string }[] = [];
    const effects: ReleaseEffects = {
      ...real,
      publishDesired: async (published) => {
        observedAtPublish.push({
          suspended: await suspended(),
          branch: git(bare, 'rev-parse', 'main'),
        });
        await real.publishDesired(published);
      },
    };
    const f8Watch = watchBackend();
    await executeRelease(request, fileJournal(join(state, 'f8-flux.json')), effects, log);
    const f8Seen = await f8Watch.stop();
    assert(
      observedAtPublish.length === 1 &&
        observedAtPublish[0].suspended &&
        observedAtPublish[0].branch === c1,
      'the coordinator published the desired revision once, while the unit was suspended and the branch was the previous release',
    );
    assert(
      git(bare, 'rev-parse', 'main') === revisions.desiredRevision,
      'the deploy branch now names the release',
    );
    assert(!(await suspended()), 'the coordinator resumed the WBS unit');
    assert(
      (await lastApplied()).endsWith(revisions.desiredRevision),
      'Flux applied the desired revision',
    );
    const promoted = await kubectlEffects(settings).currentRelease();
    assert(
      promoted !== null && promoted.images.backend === be2.cluster,
      'the cluster runs the F8 release',
    );
    const afterF8 = await backendGet('/api/projects');
    for (const name of KNOWN)
      assert(afterF8.body.includes(name), `known row ${name} survived the F8 release`);
    assert(
      f8Seen.max <= 1,
      `at most one backend pod during the F8 release (max ${String(f8Seen.max)})`,
    );

    log('k3s-side rollback: suspend first, then stop the tiers; the unit must not restart them');
    await setSuspended(true);
    await k(['-n', 'wbs-solver', 'scale', 'deployment', 'wbs-backend', '--replicas=0']);
    await k([
      '-n',
      'wbs',
      'scale',
      'deployment',
      'wbs-gateway',
      'wbs-frontend',
      'wbs-mcp',
      '--replicas=0',
    ]);
    await k(['-n', 'wbs-solver', 'delete', 'configmap', 'wbs-release']);
    await requestReconcile();
    await Bun.sleep(25_000);
    assert(
      (await backendReplicas()) === '0' && (await backendPods()).length === 0,
      'the suspended unit left the rolled-back writer stopped through two intervals',
    );

    phase('switch-traffic');
    log(
      'switch is DNS in production (plan-only, docs/infra/cutover-plan.md); here the old edge stays fenced',
    );
    assert(
      (await edge('POST', '/api/projects', JSON.stringify({ name: 'f11-after-switch' }))) === 503,
      'old edge still refuses writes after the switch',
    );

    log(
      'rollback rehearsal: before the switch, the old deployment is recoverable from its own state',
    );
    await sh(['docker', 'start', container('be-01')]);
    await sh(['docker', 'start', container('gw-01')]);
    await reloadEdge(normalSite());
    for (let attempt = 0; (await edge('GET', '/api/projects').catch(() => 0)) !== 200; attempt++) {
      if (attempt > 60) throw new Error('old side did not come back');
      await Bun.sleep(1000);
    }
    assert(
      (await edge('POST', '/api/projects', JSON.stringify({ name: 'f11-rolled-back' }))) === 200,
      'unfenced old side accepts writes again',
    );
    const statusAfter = await oldMigrationStatus();
    assert(statusAfter === statusBefore, 'old side migration status unchanged by the cutover');
    log('all cutover rehearsal assertions passed');
  } finally {
    await stopGit();
    if (keep)
      log(
        `kept ${PREFIX}* objects; delete with: docker compose -p ${PROJECT} down -v && ${k3d} cluster delete ${CLUSTER} && ${k3d} registry delete k3d-${REGISTRY}`,
      );
    else await down();
  }
}

if (import.meta.main) await main();
