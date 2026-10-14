import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAllDocuments } from 'yaml';

import { parseSqliteReport, SQLITE_REPORT_SCRIPT } from './cutover';
import { restoreCommand, restoreEnvironment } from './cutover';
import { cutoverEnvironment } from './cutover-replay';
import { parseDescriptor, releaseIdentityOf } from './descriptor';
import {
  backendTaskJob,
  kubectlEffects,
  type KubectlSettings,
  matchesProjection,
  releaseRecord,
  renderOverlay,
  run,
} from './execute';
import type { FirstStartEffects, FirstStartRequest } from './first-start';
import { assertFirstStartPolicies } from './first-start-policies';
import {
  admitFirstStartSource,
  readFirstStartTree,
  resumeFirstStartSource,
  type SourcePort,
} from './first-start-source';
import { manifestInventory } from './first-start-source';
import {
  assertAppActors,
  assertPvcControllers,
  assertPvcWriters,
  mountsPvc,
} from './first-start-writers';
import { K8S_TIERS, type K8sTier, type ReleaseIdentity } from './release';

/** Always inspect the actual file. Restore markers and earlier replay receipts cannot substitute. */
export const FIRST_START_OBSERVATION_SCRIPT = `
delete process.env.PUNI_CUTOVER_REPLAY;
delete process.env.PUNI_EXPORT;
${SQLITE_REPORT_SCRIPT}
const {drizzle}=require('drizzle-orm/bun-sqlite');
const {readStepBlockageActivation}=require('@wbs/store-sqlite/step-blockage-activation');
// Proof: nonempty-wal fixture is admitted if the WAL guard is removed, despite matching main-file bytes.
if(fs.existsSync(source+'-wal')&&fs.statSync(source+'-wal').size!==0) throw new Error('first-start restored database has nonempty WAL');
const authorityDb=new Database(source,{readonly:true,create:false});
let activation;
try {activation=readStepBlockageActivation(drizzle({client:authorityDb}));} finally {authorityDb.close();}
// Proof: removing disabled comparison starts an enabled SQLite marker in the generated-command fixture.
if(activation!=='DISABLED') throw new Error('first-start requires DISABLED step blockage authority');
const observedReplay=observeCutoverReplay(source,sha256);
console.log('PUNI_FIRST_START_OBSERVATION '+JSON.stringify({activation,replay:observedReplay}));
`;

/** First Flux adoption must preserve the closed fence until attended traffic opening. */
export function fenceFirstStartManifests(rendered: string, identity?: ReleaseIdentity): string {
  let fences = 0;
  let publicFences = 0;
  const objects: Record<string, unknown>[] = [];
  function collect(raw: unknown): void {
    const resource = requireRecord(raw);
    if (resource['kind'] === 'List') {
      if (!Array.isArray(resource['items']))
        throw new Error('first-start handoff List is malformed');
      for (const child of resource['items']) collect(child);
    } else objects.push(resource);
  }
  for (const document of parseAllDocuments(rendered)) {
    if (document.errors.length !== 0) throw new Error('first-start handoff manifest is malformed');
    collect(document.toJS() as unknown);
  }
  for (const object of objects) {
    if (
      object['kind'] === 'NetworkPolicy' &&
      ['wbs-backend-writers', 'wbs-public-ingress'].includes(
        String(requireRecord(object['metadata'])['name']),
      )
    ) {
      requireRecord(object['spec'])['podSelector'] = {
        matchLabels: { 'puni.dev/writes': 'fenced' },
      };
      if (requireRecord(object['metadata'])['name'] === 'wbs-backend-writers') fences++;
      else publicFences++;
    }
    if (
      object['kind'] === 'CronJob' &&
      ['sqlite-backup', 'sqlite-backup-verify'].includes(
        String(requireRecord(object['metadata'])['name']),
      )
    )
      requireRecord(object['spec'])['suspend'] = true;
  }
  // Proof: omission made missing/duplicate fences pass the first Flux handoff rendering fixture.
  if (fences !== 1 || publicFences !== 1)
    throw new Error('first-start handoff requires exactly one writer and public ingress fence');
  if (identity !== undefined) objects.push(releaseRecord(identity));
  return JSON.stringify({ apiVersion: 'v1', kind: 'List', items: objects });
}

function requireRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start cluster observation is malformed');
  // Boundary: checked object shape permits unknown field access.
  return raw as Record<string, unknown>;
}

/** Parse the fresh Job protocol; SQLite report parsing validates all report fields. */
export function parseFirstStartObservation(
  logs: string,
): Awaited<ReturnType<FirstStartEffects['observePvc']>> {
  const report = parseSqliteReport(logs);
  const prefix = 'PUNI_FIRST_START_OBSERVATION ';
  const lines = logs.split('\n').filter((line) => line.startsWith(prefix));
  // Proof: count omission accepted duplicated markers in the fresh-observation protocol fixture.
  if (lines.length !== 1) throw new Error('first-start Job requires one fresh observation');
  const fields = requireRecord(JSON.parse(lines[0].slice(prefix.length)) as unknown);
  // Proof: activation-shape omission accepted a numeric marker in that same protocol fixture.
  if (fields['activation'] !== 'DISABLED')
    throw new Error('first-start observation lacks disabled authority');
  return { report: { ...report, replay: fields['replay'] }, activation: fields['activation'] };
}

type SafetyTarget = Pick<FirstStartRequest, 'cluster' | 'namespaces' | 'pvc'>;
type SafetyObjects = Record<
  'cluster' | 'app' | 'backend' | 'pvc' | 'flux' | 'fence' | 'writers',
  unknown
>;

/** Validate actual object identities and the currently closed ingress/writer barrier. */
export function assertFirstStartObjects(
  request: SafetyTarget,
  objects: SafetyObjects,
  stopped: boolean,
  handed: boolean,
): void {
  assertFirstStartTarget(request, objects);
  const suspended = requireRecord(requireRecord(objects.flux)['spec'])['suspend'];
  // Proof: Flux predicate omission accepts active reconciliation in the safety boundary fixture.
  if (suspended !== !handed) throw new Error('first-start Flux suspension differs');
  const selector = requireRecord(requireRecord(objects.fence)['spec'])['podSelector'];
  // Proof: fence predicate omission accepts open writer ingress in the safety boundary fixture.
  if (JSON.stringify(selector) !== JSON.stringify({ matchLabels: { 'puni.dev/writes': 'fenced' } }))
    throw new Error('first-start writer fence is open');
  const writers = requireRecord(objects.writers)['items'];
  // Proof: stopped-writer predicate omission accepts a running writer Pod in the safety fixture.
  if (!Array.isArray(writers) || (stopped && writers.length !== 0))
    throw new Error('first-start writer Pods remain or inventory is malformed');
}

/** Repeat immutable target admission before mutation and under the Lease. */
export function assertFirstStartTarget(
  request: SafetyTarget,
  objects: Pick<SafetyObjects, 'cluster' | 'app' | 'backend' | 'pvc'>,
): void {
  const uidOf = (raw: unknown): unknown => requireRecord(requireRecord(raw)['metadata'])['uid'];
  // Proof: foreign object UID mutations fail the production safety boundary fixture.
  if (
    uidOf(objects.cluster) !== request.cluster.uid ||
    uidOf(objects.app) !== request.namespaces.appUid ||
    uidOf(objects.backend) !== request.namespaces.backendUid ||
    uidOf(objects.pvc) !== request.pvc.uid ||
    requireRecord(requireRecord(objects.pvc)['status'])['phase'] !== 'Bound'
  )
    throw new Error('first-start target cluster namespace or PVC identity differs');
}

/** The admitted PVC must be the file the eventual writer opens, with migrations disabled. */
export function assertFirstStartBackend(raw: unknown): void {
  const spec = requireRecord(requireRecord(raw)['spec']);
  const template = requireRecord(spec['template']);
  const pod = requireRecord(template['spec']);
  const containers = pod['containers'];
  const volumes = pod['volumes'];
  if (!Array.isArray(containers) || containers.length !== 1 || !Array.isArray(volumes))
    throw new Error('first-start backend template is malformed');
  const container = requireRecord(containers[0]);
  const env = container['env'];
  const mounts = container['volumeMounts'];
  const hasEnv = (name: string, value: string): boolean => {
    const entries = Array.isArray(env)
      ? env.filter((raw) => requireRecord(raw)['name'] === name)
      : [];
    return entries.length === 1 && requireRecord(entries[0])['value'] === value;
  };
  const claims = volumes.filter((raw) => requireRecord(raw)['name'] === 'data');
  const dataMounts = Array.isArray(mounts)
    ? mounts.filter((raw) => requireRecord(raw)['name'] === 'data')
    : [];
  const allowedMounts = [
    { name: 'data', mountPath: '/data' },
    { name: 'tmp', mountPath: '/tmp' },
    { name: 'solver-runtime', mountPath: '/run/wbs-solver' },
  ];
  const allowedVolumes = [
    { name: 'data', persistentVolumeClaim: { claimName: 'wbs-data' } },
    { name: 'tmp', emptyDir: { sizeLimit: '256Mi' } },
    { name: 'solver-runtime', hostPath: { path: '/run/puni/solver', type: 'Directory' } },
  ];
  const labels = requireRecord(requireRecord(template['metadata'])['labels']);
  const allowedLabels = {
    'app.kubernetes.io/name': 'wbs-backend',
    'app.kubernetes.io/part-of': 'wbs',
    'puni.dev/controller': 'wbs-backend',
    'puni.dev/writer': 'true',
  };
  // Proof: shadow-mount/init/command/args/lifecycle/fence-label omissions admit each reproduced override.
  if (
    !Array.isArray(mounts) ||
    mounts.length !== allowedMounts.length ||
    allowedMounts.some(
      (expected) => mounts.filter((raw) => matchesProjection(raw, expected)).length !== 1,
    ) ||
    volumes.length !== allowedVolumes.length ||
    allowedVolumes.some(
      (expected) => volumes.filter((raw) => matchesProjection(raw, expected)).length !== 1,
    ) ||
    Object.hasOwn(pod, 'initContainers') ||
    Object.hasOwn(pod, 'ephemeralContainers') ||
    ['command', 'args', 'lifecycle'].some((field) => Object.hasOwn(container, field)) ||
    Object.keys(labels).length !== Object.keys(allowedLabels).length ||
    !matchesProjection(labels, allowedLabels)
  )
    throw new Error('first-start backend has unadmitted mounts, startup overrides or labels');
  // Proof: template fixture mutations expose foreign DB/path/PVC, migration startup, subPath,
  // rolling-update overlap and absent writer labels through the production template boundary.
  if (
    container['name'] !== 'backend' ||
    !hasEnv('DB_PATH', '/data/wbs.sqlite') ||
    !hasEnv('MIGRATE_ON_STARTUP', 'false') ||
    claims.length !== 1 ||
    requireRecord(requireRecord(claims[0])['persistentVolumeClaim'])['claimName'] !== 'wbs-data' ||
    dataMounts.length !== 1 ||
    !matchesProjection(dataMounts[0], { name: 'data', mountPath: '/data' }) ||
    requireRecord(spec['strategy'])['type'] !== 'Recreate' ||
    requireRecord(requireRecord(template['metadata'])['labels'])['puni.dev/writer'] !== 'true'
  )
    throw new Error(
      'first-start backend opens another database or lacks its single writer contract',
    );
}

/** Kubectl adapter shares release Lease/fence/readback logic, without changing its journal schema. */
export function firstStartEffects(settings: KubectlSettings): FirstStartEffects {
  const real = kubectlEffects(settings);
  const base = [
    settings.kubectl,
    ...(settings.kubeconfig === null ? [] : ['--kubeconfig', settings.kubeconfig]),
    '--context',
    settings.context,
  ];
  const timeout = 60_000;
  async function k(
    args: readonly string[],
    stdin: string | null = null,
    ms = timeout,
  ): Promise<string> {
    const invocation = await run([...base, ...args], stdin, ms);
    if (invocation.exitCode !== 0)
      throw new Error(`first-start kubectl ${args.join(' ')} failed: ${invocation.stderr}`);
    return invocation.stdout;
  }
  const json = async (args: readonly string[]): Promise<unknown> =>
    JSON.parse(await k([...args, '-o', 'json'])) as unknown;
  const namespaceOf = (tier: K8sTier): string =>
    tier === 'backend' ? settings.namespaces.backend : settings.namespaces.app;
  const trustedManifest = async (request: FirstStartRequest): Promise<string> => {
    const release = releaseIdentityOf(
      parseDescriptor(JSON.parse(request.identity.descriptorBytes) as unknown),
    );
    return fenceFirstStartManifests(
      await renderOverlay(
        {
          kubectl: settings.kubectl,
          overlay: resolve(
            import.meta.dir,
            '../../../../deploy/k8s/wbs/overlays',
            request.environment,
          ),
        },
        release,
      ),
      release,
    );
  };
  function sourcePort(request: FirstStartRequest): SourcePort {
    const ks = `kustomizations.kustomize.toolkit.fluxcd.io/${request.flux.kustomization}`;
    const git = `gitrepositories.source.toolkit.fluxcd.io/${request.flux.gitRepository}`;
    return {
      readKustomization: () => json(['-n', request.flux.namespace, 'get', ks]),
      readGitRepository: () => json(['-n', request.flux.namespace, 'get', git]),
      patchGitRepository: async (patch) => {
        await k([
          '-n',
          request.flux.namespace,
          'patch',
          git,
          '--type=json',
          '-p',
          JSON.stringify(patch),
        ]);
      },
      patchKustomization: async (patch) => {
        await k([
          '-n',
          request.flux.namespace,
          'patch',
          ks,
          '--type=json',
          '-p',
          JSON.stringify(patch),
        ]);
      },
      readTree: (url, revision, path) => readFirstStartTree(settings.stateDir, url, revision, path),
      trustedManifest,
      sleep: () => Bun.sleep(1000),
      timeoutMs: settings.rolloutTimeoutSeconds * 1000,
    };
  }
  async function observeControllers(
    request: FirstStartRequest,
    stopped: boolean,
  ): Promise<ReadonlySet<string>> {
    const list = requireRecord(
      await json([
        '-n',
        request.namespaces.backend,
        'get',
        'deployments,replicasets,statefulsets,daemonsets,replicationcontrollers,jobs,cronjobs,horizontalpodautoscalers',
      ]),
    );
    const rows = list['items'];
    if (!Array.isArray(rows)) throw new Error('first-start controller inventory is malformed');
    const backend = requireRecord(
      await json(['-n', request.namespaces.backend, 'get', 'deployment', 'wbs-backend']),
    );
    const uid = requireRecord(backend['metadata'])['uid'];
    if (typeof uid !== 'string' || uid === '')
      throw new Error('first-start backend controller UID is absent');
    const trusted: unknown = JSON.parse(manifestInventory(await trustedManifest(request)));
    if (!Array.isArray(trusted))
      throw new Error('first-start trusted controller inventory is malformed');
    const backups = new Set<string>();
    for (const raw of rows) {
      const controller = requireRecord(raw);
      if (controller['kind'] !== 'CronJob') continue;
      const metadata = requireRecord(controller['metadata']);
      const expected: unknown = trusted.find((raw) => {
        const resource = requireRecord(raw);
        return (
          resource['kind'] === 'CronJob' &&
          requireRecord(resource['metadata'])['name'] === metadata['name'] &&
          requireRecord(resource['metadata'])['namespace'] === request.namespaces.backend
        );
      });
      if (expected === undefined) continue;
      const template = requireRecord(requireRecord(controller['spec'])['jobTemplate']);
      const pinned = requireRecord(requireRecord(requireRecord(expected)['spec'])['jobTemplate']);
      const pod = requireRecord(requireRecord(template['spec'])['template']);
      const ps = requireRecord(pod['spec']);
      if (
        !matchesProjection(template, pinned) ||
        Object.hasOwn(ps, 'initContainers') ||
        Object.hasOwn(ps, 'ephemeralContainers')
      )
        throw new Error('first-start backup controller template differs');
      const backupUid = metadata['uid'];
      if (typeof backupUid !== 'string' || backupUid === '')
        throw new Error('first-start backup controller UID is absent');
      backups.add(backupUid);
    }
    return assertPvcControllers(list, request.pvc.name, stopped, uid, backups);
  }
  async function pauseBackups(request: FirstStartRequest): Promise<void> {
    for (const name of ['sqlite-backup', 'sqlite-backup-verify']) {
      const raw = requireRecord(
        await json(['-n', request.namespaces.backend, 'get', 'cronjob', name]),
      );
      const metadata = requireRecord(raw['metadata']);
      const spec = requireRecord(raw['spec']);
      if (spec['suspend'] === true) continue;
      const patch = [
        { op: 'test', path: '/metadata/uid', value: metadata['uid'] },
        { op: 'test', path: '/metadata/resourceVersion', value: metadata['resourceVersion'] },
        { op: 'test', path: '/spec', value: spec },
        {
          op: Object.hasOwn(spec, 'suspend') ? 'replace' : 'add',
          path: '/spec/suspend',
          value: true,
        },
      ];
      await k([
        '-n',
        request.namespaces.backend,
        'patch',
        'cronjob',
        name,
        '--type=json',
        '-p',
        JSON.stringify(patch),
      ]);
    }
  }
  async function verifyTiers(identity: ReleaseIdentity): Promise<void> {
    for (const tier of K8S_TIERS) {
      const observed = requireRecord(
        await json(['-n', namespaceOf(tier), 'get', 'deployment', `wbs-${tier}`]),
      );
      const spec = requireRecord(observed['spec']);
      const template = requireRecord(requireRecord(spec['template'])['spec']);
      const containers = template['containers'];
      const status = requireRecord(observed['status']);
      const metadata = requireRecord(observed['metadata']);
      if (tier === 'backend') assertFirstStartBackend(observed);
      // Proof: image/readiness omissions admitted altered deployment image and zero ready replicas
      // in the kubectl rollout-image and rollout-status negatives.
      if (
        spec['replicas'] !== 1 ||
        !Array.isArray(containers) ||
        containers.length !== 1 ||
        requireRecord(containers[0])['name'] !== tier ||
        requireRecord(containers[0])['image'] !== identity.images[tier] ||
        status['observedGeneration'] !== metadata['generation'] ||
        status['updatedReplicas'] !== 1 ||
        status['readyReplicas'] !== 1 ||
        status['availableReplicas'] !== 1 ||
        status['replicas'] !== 1
      )
        throw new Error(`first-start ${tier} rollout/image differs`);
    }
  }
  return {
    admitSource: (request, prior) => admitFirstStartSource(request, sourcePort(request), prior),
    resumeSource: (request, source) => resumeFirstStartSource(request, sourcePort(request), source),
    readLease: real.readLease.bind(real),
    async assertTarget(request) {
      if (
        settings.context !== request.cluster.context ||
        settings.namespaces.app !== request.namespaces.app ||
        settings.namespaces.backend !== request.namespaces.backend
      )
        throw new Error('first-start adapter target differs');
      const [cluster, app, backend, pvc] = await Promise.all([
        json(['get', 'namespace', 'kube-system']),
        json(['get', 'namespace', request.namespaces.app]),
        json(['get', 'namespace', request.namespaces.backend]),
        json(['-n', request.namespaces.backend, 'get', 'pvc', request.pvc.name]),
      ]);
      assertFirstStartTarget(request, { cluster, app, backend, pvc });
      assertFirstStartBackend(
        await json(['-n', request.namespaces.backend, 'get', 'deployment', 'wbs-backend']),
      );
    },
    createLease: real.createLease.bind(real),
    takeoverLease: real.takeoverLease.bind(real),
    renewLease: real.renewLease.bind(real),
    parkLease: real.parkLease.bind(real),
    releaseLease: real.releaseLease.bind(real),
    async closeWrites() {
      await real.closeWrites();
      await k([
        '-n',
        settings.namespaces.app,
        'patch',
        'networkpolicy',
        'wbs-public-ingress',
        '--type=json',
        '-p',
        JSON.stringify([
          {
            op: 'replace',
            path: '/spec/podSelector',
            value: { matchLabels: { 'puni.dev/writes': 'fenced' } },
          },
        ]),
      ]);
    },
    suspendFlux: real.suspendFlux.bind(real),
    persistRelease: real.persistRelease.bind(real),
    currentRelease: real.currentRelease.bind(real),
    fluxSourceRevision: real.fluxSourceRevision.bind(real),
    resumeFlux: real.resumeFlux.bind(real),
    async stopTiers(request) {
      await pauseBackups(request);
      for (const tier of K8S_TIERS)
        await k(['-n', namespaceOf(tier), 'scale', 'deployment', `wbs-${tier}`, '--replicas=0']);
      await real.stopWriter();
      const deadline = Date.now() + settings.rolloutTimeoutSeconds * 1000;
      for (;;) {
        const pods = requireRecord(await json(['get', 'pods', '-A']));
        const retained = pods['items'];
        if (!Array.isArray(retained)) throw new Error('first-start pod inventory is malformed');
        const users = retained.filter((raw) => {
          const pod = requireRecord(raw);
          const phase = requireRecord(pod['status'])['phase'];
          const namespace = requireRecord(pod['metadata'])['namespace'];
          return (
            phase !== 'Succeeded' &&
            phase !== 'Failed' &&
            (namespace === request.namespaces.app ||
              (namespace === request.namespaces.backend &&
                mountsPvc(pod['spec'], request.pvc.name)))
          );
        });
        if (users.length === 0) {
          await observeControllers(request, true);
          return;
        }
        if (Date.now() >= deadline) throw new Error('first-start tiers failed to stop');
        await Bun.sleep(1000);
      }
    },
    async assertSafety(request, stopped, handed) {
      if (
        settings.context !== request.cluster.context ||
        settings.namespaces.app !== request.namespaces.app ||
        settings.namespaces.backend !== request.namespaces.backend
      )
        throw new Error('first-start adapter target differs');
      const [cluster, app, backend, pvc, flux, fence, writers] = await Promise.all([
        json(['get', 'namespace', 'kube-system']),
        json(['get', 'namespace', request.namespaces.app]),
        json(['get', 'namespace', request.namespaces.backend]),
        json(['-n', request.namespaces.backend, 'get', 'pvc', request.pvc.name]),
        json([
          '-n',
          request.flux.namespace,
          'get',
          `kustomizations.kustomize.toolkit.fluxcd.io/${request.flux.kustomization}`,
        ]),
        json(['-n', request.namespaces.backend, 'get', 'networkpolicy', 'wbs-backend-writers']),
        json(['-n', request.namespaces.backend, 'get', 'pods']),
      ]);
      assertFirstStartObjects(
        request,
        { cluster, app, backend, pvc, flux, fence, writers },
        false,
        handed,
      );
      assertFirstStartBackend(
        await json(['-n', request.namespaces.backend, 'get', 'deployment', 'wbs-backend']),
      );
      const trusted: unknown = JSON.parse(manifestInventory(await trustedManifest(request)));
      if (!Array.isArray(trusted))
        throw new Error('first-start trusted policy inventory is malformed');
      const expectedPolicies = (namespace: string): readonly unknown[] =>
        trusted.filter((raw) => {
          const resource = requireRecord(raw);
          return (
            resource['kind'] === 'NetworkPolicy' &&
            requireRecord(resource['metadata'])['namespace'] === namespace
          );
        });
      const backendDeployment = requireRecord(
        await json(['-n', request.namespaces.backend, 'get', 'deployment', 'wbs-backend']),
      );
      const backendLabels = requireRecord(
        requireRecord(requireRecord(backendDeployment['spec'])['template'])['metadata'],
      )['labels'];
      assertFirstStartPolicies(
        await json(['-n', request.namespaces.backend, 'get', 'networkpolicies']),
        expectedPolicies(request.namespaces.backend),
        requireRecord(backendLabels),
      );
      const platformPolicies = parseAllDocuments(
        readFileSync(
          resolve(import.meta.dir, '../../../../infra/platform/policy/network-policy.yaml'),
          'utf8',
        ),
      ).map((document) => requireRecord(document.toJS() as unknown));
      const deny = platformPolicies.find(
        (resource) =>
          resource['kind'] === 'NetworkPolicy' &&
          requireRecord(resource['metadata'])['name'] === 'default-deny' &&
          requireRecord(resource['metadata'])['namespace'] === request.namespaces.app,
      );
      if (deny === undefined) throw new Error('first-start trusted app default deny is absent');
      const appPolicies = [...expectedPolicies(request.namespaces.app), deny];
      const liveAppPolicies = await json(['-n', request.namespaces.app, 'get', 'networkpolicies']);
      const appUids = new Set<string>();
      for (const tier of ['gateway', 'frontend', 'mcp'] as const) {
        const deployment = requireRecord(
          await json(['-n', request.namespaces.app, 'get', 'deployment', `wbs-${tier}`]),
        );
        const labels = requireRecord(
          requireRecord(requireRecord(requireRecord(deployment['spec'])['template'])['metadata'])[
            'labels'
          ],
        );
        const uid = requireRecord(deployment['metadata'])['uid'];
        if (typeof uid !== 'string' || uid === '')
          throw new Error('first-start app Deployment UID is absent');
        appUids.add(uid);
        assertFirstStartPolicies(liveAppPolicies, appPolicies, labels, 'wbs-public-ingress');
      }
      assertAppActors(
        await json([
          '-n',
          request.namespaces.app,
          'get',
          'deployments,replicasets,statefulsets,daemonsets,replicationcontrollers,jobs,cronjobs,horizontalpodautoscalers',
        ]),
        await json(['-n', request.namespaces.app, 'get', 'pods']),
        appUids,
        stopped,
      );
      const replicaSets = await observeControllers(request, stopped);
      assertPvcWriters(writers, request.pvc.name, stopped, replicaSets);
      if (!stopped) {
        const rows = requireRecord(writers)['items'];
        if (!Array.isArray(rows)) throw new Error('first-start Pod inventory is malformed');
        for (const raw of rows) {
          const pod = requireRecord(raw);
          const phase = requireRecord(pod['status'])['phase'];
          if (
            phase === 'Succeeded' ||
            phase === 'Failed' ||
            !mountsPvc(pod['spec'], request.pvc.name)
          )
            continue;
          const metadata = requireRecord(pod['metadata']);
          const labels = { ...requireRecord(metadata['labels']) };
          delete labels['pod-template-hash'];
          assertFirstStartBackend({
            spec: {
              strategy: { type: 'Recreate' },
              template: { metadata: { labels }, spec: pod['spec'] },
            },
          });
          const containers = requireRecord(pod['spec'])['containers'];
          if (
            !Array.isArray(containers) ||
            requireRecord(containers[0])['image'] !== request.identity.backendImage
          )
            throw new Error('first-start actual backend Pod image differs');
        }
      }
    },
    async observeRestore(request) {
      const observed = requireRecord(
        await json(['-n', request.namespaces.backend, 'get', 'job', request.restore.name]),
      );
      const expected = backendTaskJob(
        settings,
        request.restore.name,
        request.identity.backendImage,
        restoreEnvironment(
          request.exported.sha256,
          Object.keys(request.exported.known),
          request.identity,
          request.exported.replay,
        ),
        restoreCommand(),
      );
      // Proof: UID/completion/projection omissions accepted foreign UID, unfinished restore,
      // replaced command/image and foreign subPath in the kubectl restore negatives.
      if (
        requireRecord(observed['metadata'])['uid'] !== request.restore.uid ||
        !matchesProjection(observed, expected) ||
        requireRecord(observed['status'])['succeeded'] !== 1
      )
        throw new Error('first-start restore Job identity or completion differs');
      return parseSqliteReport(
        await k([
          '-n',
          request.namespaces.backend,
          'logs',
          `job/${request.restore.name}`,
          '--all-containers',
        ]),
      );
    },
    async observePvc(request, transaction) {
      // A fresh name forbids cached completed Jobs from authorizing changed mounted bytes on resume.
      const name = `wbs-first-check-${transaction.slice(-16)}-${randomBytes(4).toString('hex')}`;
      const manifest = backendTaskJob(
        settings,
        name,
        request.identity.backendImage,
        {
          ...cutoverEnvironment(request.identity),
          PUNI_DB: request.pvc.path,
          PUNI_KNOWN: JSON.stringify(Object.keys(request.exported.known)),
        },
        ['bun', '-e', FIRST_START_OBSERVATION_SCRIPT],
      );
      await this.assertSafety(request, true, false);
      await k(['create', '-f', '-'], JSON.stringify(manifest));
      await k(
        [
          '-n',
          request.namespaces.backend,
          'wait',
          '--for=condition=complete',
          `job/${name}`,
          `--timeout=${String(settings.jobTimeoutSeconds)}s`,
        ],
        null,
        settings.jobTimeoutSeconds * 1000 + timeout,
      );
      const observed = await json(['-n', request.namespaces.backend, 'get', 'job', name]);
      // Proof: projection omission accepted a replaced command/image or foreign subPath
      // in the kubectl actual-command/image/mount negatives.
      if (!matchesProjection(observed, manifest))
        throw new Error('first-start actual PVC Job differs from pinned manifest');
      return parseFirstStartObservation(
        await k(['-n', request.namespaces.backend, 'logs', `job/${name}`, '--all-containers']),
      );
    },
    async startTier(tier, image) {
      const namespace = namespaceOf(tier);
      await k([
        '-n',
        namespace,
        'patch',
        'deployment',
        `wbs-${tier}`,
        '--type=strategic',
        '-p',
        JSON.stringify({
          spec: { replicas: 1, template: { spec: { containers: [{ name: tier, image }] } } },
        }),
      ]);
      await k(
        [
          '-n',
          namespace,
          'rollout',
          'status',
          `deployment/wbs-${tier}`,
          `--timeout=${String(settings.rolloutTimeoutSeconds)}s`,
        ],
        null,
        settings.rolloutTimeoutSeconds * 1000 + timeout,
      );
    },
    verifyTiers,
  };
}
