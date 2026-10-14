import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { restoreCommand, restoreEnvironment } from './cutover';
import { cutoverEnvironment } from './cutover-replay';
import { fixtureCutoverIdentity } from './cutover-replay.fixture';
import { parseDescriptor } from './descriptor';
import { backendTaskJob, type KubectlSettings } from './execute';
import { fixtureFirstStartRequest } from './first-start.fixture';
import {
  assertFirstStartBackend,
  assertFirstStartObjects,
  FIRST_START_OBSERVATION_SCRIPT,
  firstStartEffects,
  parseFirstStartObservation,
} from './first-start-adapter';
import { fenceFirstStartManifests } from './first-start-adapter';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it('renders the first Flux handoff revision with its writer ingress fence closed', () => {
  const rendered =
    'kind: NetworkPolicy\nmetadata:\n  name: wbs-backend-writers\nspec:\n  podSelector:\n    matchLabels:\n      app.kubernetes.io/name: wbs-backend\n---\nkind: NetworkPolicy\nmetadata:\n  name: wbs-public-ingress\nspec:\n  podSelector: {}\n';
  expect(fenceFirstStartManifests(rendered)).toContain('"puni.dev/writes":"fenced"');
  expect(() => fenceFirstStartManifests('kind: ConfigMap')).toThrow();
  expect(() => fenceFirstStartManifests(rendered + '---\n' + rendered)).toThrow();
});
const backend = resolve(import.meta.dir, '../../../../apps/wbs/be-01');
it('refuses missing or duplicated fresh markers and non-disabled observation protocol', () => {
  const request = fixtureFirstStartRequest();
  const report = `PUNI_SQLITE_REPORT ${JSON.stringify(request.restored)}\n`;
  const marker = `PUNI_FIRST_START_OBSERVATION ${JSON.stringify({ activation: 'DISABLED', replay: request.restored.replay })}\n`;
  expect(() => parseFirstStartObservation(report)).toThrow('one fresh observation');
  expect(() => parseFirstStartObservation(report + marker + marker)).toThrow(
    'one fresh observation',
  );
  expect(() =>
    parseFirstStartObservation(
      report +
        `PUNI_FIRST_START_OBSERVATION ${JSON.stringify({ activation: 3, replay: request.restored.replay })}`,
    ),
  ).toThrow('disabled authority');
});
for (const fault of [
  'none',
  'enabled',
  'missing-marker',
  'missing-trigger',
  'changed-trigger',
  'missing-ledger',
  'missing-db',
  'unreadable-db',
  'bad-replay',
  'nonempty-wal',
] as const) {
  it(`fresh actual SQLite observation requires replay and disabled exact authority: ${fault}`, () => {
    const root = scratchSync('first-start-db-');
    roots.push(root);
    const path = join(root, 'wbs.sqlite');
    const db = new Database(path);
    db.run(
      "CREATE TABLE __drizzle_migrations (name TEXT, created_at INTEGER); INSERT INTO __drizzle_migrations VALUES ('20261014140000_add_step_blockage_activation',1); CREATE TABLE project (name TEXT); INSERT INTO project VALUES ('known'); CREATE TABLE command_journal (payload TEXT,inverse TEXT,preconditions TEXT); CREATE TABLE step_blockage (id INTEGER)",
    );
    const sql = readFileSync(
      join(backend, 'drizzle/20261014140000_add_step_blockage_activation/migration.sql'),
      'utf8',
    );
    for (const statement of sql.split('--> statement-breakpoint')) db.run(statement);
    db.run('INSERT INTO command_journal VALUES (?,?,?)', [
      JSON.stringify({ forward: { do: 'batch', steps: [{ do: 'move', expectedProgress: [] }] } }),
      JSON.stringify({ do: 'batch', steps: [{ do: 'restore_subtree', deletionState: {} }] }),
      JSON.stringify({ moveProgress: {} }),
    ]);
    if (fault === 'enabled') db.run("UPDATE step_blockage_activation SET state='ENABLED'");
    if (fault === 'missing-marker') db.run('DELETE FROM step_blockage_activation');
    if (fault === 'missing-trigger') db.run('DROP TRIGGER step_blockage_admit_insert');
    if (fault === 'changed-trigger') {
      db.run('DROP TRIGGER step_blockage_admit_insert');
      db.run(
        'CREATE TRIGGER step_blockage_admit_insert BEFORE INSERT ON step_blockage BEGIN SELECT 1; END',
      );
    }
    if (fault === 'missing-ledger') db.run('DELETE FROM __drizzle_migrations');
    if (fault === 'bad-replay') db.run("UPDATE command_journal SET inverse='null'");
    db.close();
    if (fault === 'missing-db') rmSync(path);
    if (fault === 'unreadable-db') chmodSync(path, 0o000);
    if (fault === 'nonempty-wal') writeFileSync(`${path}-wal`, 'discarded WAL');
    const child = Bun.spawnSync({
      cmd: ['bun', '-e', FIRST_START_OBSERVATION_SCRIPT],
      cwd: backend,
      env: {
        ...process.env,
        ...cutoverEnvironment(fixtureCutoverIdentity()),
        PUNI_DB: path,
        DB_PATH: path,
        PUNI_KNOWN: '["known"]',
        PUNI_CUTOVER_REPLAY: JSON.stringify({ inventory: [] }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (fault === 'none') {
      expect(child.exitCode).toBe(0);
      const observation = parseFirstStartObservation(child.stdout.toString());
      expect(observation.activation).toBe('DISABLED');
      expect(observation.report.replay).toMatchObject({
        inventory: [
          { kind: 'move_progress_v1', count: 1 },
          { kind: 'delete_state_v1', count: 1 },
        ],
      });
    } else expect(child.exitCode).not.toBe(0);
  });
}

it('rejects foreign PVC namespace cluster, open fence, Flux and running writers at the production observation boundary', () => {
  const request = {
    cluster: { context: 'lab', uid: 'cluster' },
    namespaces: { app: 'wbs', backend: 'wbs-solver', appUid: 'app', backendUid: 'backend' },
    pvc: { name: 'wbs-data', uid: 'volume', path: '/data/wbs.sqlite' },
  };
  const objects = {
    cluster: { metadata: { uid: 'cluster' } },
    app: { metadata: { uid: 'app' } },
    backend: { metadata: { uid: 'backend' } },
    pvc: { metadata: { uid: 'volume' }, status: { phase: 'Bound' } },
    flux: { spec: { suspend: true } },
    fence: { spec: { podSelector: { matchLabels: { 'puni.dev/writes': 'fenced' } } } },
    writers: { items: [] },
  };
  expect(() => {
    assertFirstStartObjects(request, objects, true, false);
  }).not.toThrow();
  for (const fault of ['cluster', 'app', 'backend', 'pvc', 'flux', 'fence', 'writers'] as const) {
    const changed = structuredClone(objects);
    if (fault === 'cluster' || fault === 'app' || fault === 'backend' || fault === 'pvc')
      changed[fault].metadata.uid = 'foreign';
    if (fault === 'flux') changed.flux.spec.suspend = false;
    if (fault === 'fence') changed.fence.spec.podSelector.matchLabels['puni.dev/writes'] = 'open';
    if (fault === 'writers')
      Object.assign(changed.writers, { items: [{ metadata: { name: 'writer' } }] });
    expect(() => {
      assertFirstStartObjects(request, changed, true, false);
    }).toThrow();
  }
});

it('refuses a backend template that would open another database or migrate on startup', () => {
  const template = {
    spec: {
      strategy: { type: 'Recreate' },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'wbs-backend',
            'app.kubernetes.io/part-of': 'wbs',
            'puni.dev/controller': 'wbs-backend',
            'puni.dev/writer': 'true',
          },
        },
        spec: {
          containers: [
            {
              name: 'backend',
              env: [
                { name: 'DB_PATH', value: '/data/wbs.sqlite' },
                { name: 'MIGRATE_ON_STARTUP', value: 'false' },
              ],
              volumeMounts: [
                { name: 'data', mountPath: '/data' },
                { name: 'tmp', mountPath: '/tmp' },
                { name: 'solver-runtime', mountPath: '/run/wbs-solver' },
              ],
            },
          ],
          volumes: [
            { name: 'data', persistentVolumeClaim: { claimName: 'wbs-data' } },
            { name: 'tmp', emptyDir: { sizeLimit: '256Mi' } },
            { name: 'solver-runtime', hostPath: { path: '/run/puni/solver', type: 'Directory' } },
          ],
        },
      },
    },
  };
  expect(() => {
    assertFirstStartBackend(template);
  }).not.toThrow();
  for (const fault of [
    'db',
    'migration',
    'claim',
    'subpath',
    'strategy',
    'writer',
    'duplicate-env',
    'shadow-mount',
    'init-container',
    'command',
    'args',
    'lifecycle',
    'fence-label',
  ] as const) {
    const changed = structuredClone(template);
    if (fault === 'db')
      changed.spec.template.spec.containers[0].env[0].value = '/data/foreign.sqlite';
    if (fault === 'migration') changed.spec.template.spec.containers[0].env[1].value = 'true';
    if (fault === 'claim')
      changed.spec.template.spec.volumes[0].persistentVolumeClaim!.claimName = 'foreign';
    if (fault === 'subpath')
      Object.assign(changed.spec.template.spec.containers[0].volumeMounts[0], {
        subPath: 'foreign',
      });
    if (fault === 'strategy') changed.spec.strategy.type = 'RollingUpdate';
    if (fault === 'writer') changed.spec.template.metadata.labels['puni.dev/writer'] = 'false';
    if (fault === 'duplicate-env')
      changed.spec.template.spec.containers[0].env.push({
        name: 'DB_PATH',
        value: '/data/foreign.sqlite',
      });
    if (fault === 'shadow-mount')
      changed.spec.template.spec.containers[0].volumeMounts.push({
        name: 'shadow',
        mountPath: '/data/wbs.sqlite',
      });
    if (fault === 'init-container')
      Object.assign(changed.spec.template.spec, {
        initContainers: [
          { name: 'rewrite', image: 'foreign', command: ['sh', '-c', 'touch /data/wbs.sqlite'] },
        ],
      });
    if (fault === 'command')
      Object.assign(changed.spec.template.spec.containers[0], {
        command: ['sh', '-c', 'touch /data/wbs.sqlite'],
      });
    if (fault === 'args')
      Object.assign(changed.spec.template.spec.containers[0], { args: ['foreign'] });
    if (fault === 'lifecycle')
      Object.assign(changed.spec.template.spec.containers[0], {
        lifecycle: { postStart: { exec: { command: ['touch', '/data/wbs.sqlite'] } } },
      });
    if (fault === 'fence-label')
      Object.assign(changed.spec.template.metadata.labels, { 'puni.dev/writes': 'fenced' });
    expect(() => {
      assertFirstStartBackend(changed);
    }).toThrow();
  }
});

for (const fault of [
  'none',
  'restore-uid',
  'restore-image',
  'restore-command',
  'restore-mount',
  'restore-status',
  'actual-command',
  'actual-mount',
  'actual-image',
  'bad-log',
  'rollout-image',
  'rollout-status',
  'rollout-mount',
  'unlabeled-pvc',
  'public-open',
  'extra-public-policy',
  'gateway-init',
  'gateway-pod-init',
  'gateway-rs-command',
  'backend-probe-startupProbe',
  'backend-probe-readinessProbe',
  'backend-probe-livenessProbe',
] as const) {
  it(`kubectl first-start adapter refuses altered cluster transport: ${fault}`, async () => {
    const root = scratchSync('first-start-kubectl-');
    roots.push(root);
    const request = fixtureFirstStartRequest();
    const settings: KubectlSettings = {
      kubectl: join(root, 'kubectl'),
      kubeconfig: null,
      context: 'lab',
      namespaces: request.namespaces,
      stateDir: root,
      overlay: '',
      anonymousProjectsStatus: 200,
      rolloutTimeoutSeconds: 1,
      jobTimeoutSeconds: 1,
      drainTimeoutMs: 1,
      leaseDurationSeconds: 20,
      log: (line) => {
        writeFileSync(join(root, 'log'), line);
      },
    };
    const restore = backendTaskJob(
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
    writeFileSync(join(root, 'fixture.json'), JSON.stringify({ request, restore, fault }));
    writeFileSync(
      settings.kubectl,
      `#!/usr/bin/env bun
const fs=require('node:fs'); const path=require('node:path');
const root=import.meta.dir; const {request,restore,fault}=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8')); const args=process.argv.slice(2);
fs.appendFileSync(path.join(root,'calls'),JSON.stringify(args)+'\\n');
function output(value){console.log(JSON.stringify(value));}
const deny=(namespace)=>({apiVersion:'networking.k8s.io/v1',kind:'NetworkPolicy',metadata:{name:'default-deny',namespace},spec:{podSelector:{},policyTypes:['Ingress','Egress']}});
const fence=(name,namespace)=>({apiVersion:'networking.k8s.io/v1',kind:'NetworkPolicy',metadata:{name,namespace},spec:{podSelector:{matchLabels:{'puni.dev/writes':'fenced'}},policyTypes:['Ingress'],ingress:[{}]}});
const backendPolicies=[deny('wbs-solver'),fence('wbs-backend-writers','wbs-solver')];const appPolicies=[deny('wbs'),fence('wbs-public-ingress','wbs')];
function deploymentFor(tier){const deployment= {metadata:{uid:tier+'-controller',generation:1},spec:{replicas:1,strategy:{type:'Recreate'},template:{metadata:{labels:{'app.kubernetes.io/name':'wbs-backend','app.kubernetes.io/part-of':'wbs','puni.dev/controller':'wbs-backend','puni.dev/writer':'true'}},spec:{containers:[{name:tier,image:request.identity.backendImage,env:[{name:'DB_PATH',value:'/data/wbs.sqlite'},{name:'MIGRATE_ON_STARTUP',value:'false'}],volumeMounts:[{name:'data',mountPath:'/data'},{name:'tmp',mountPath:'/tmp'},{name:'solver-runtime',mountPath:'/run/wbs-solver'}]}],volumes:[{name:'data',persistentVolumeClaim:{claimName:'wbs-data'}},{name:'tmp',emptyDir:{sizeLimit:'256Mi'}},{name:'solver-runtime',hostPath:{path:'/run/puni/solver',type:'Directory'}}]}}},status:{observedGeneration:1,updatedReplicas:1,readyReplicas:1,availableReplicas:1,replicas:1}};if(tier!=='backend')deployment.spec.template.metadata.labels={'app.kubernetes.io/name':'wbs-'+tier,'app.kubernetes.io/part-of':'wbs'};return deployment;}
if(args.includes('kustomize')){output({apiVersion:'v1',kind:'List',items:[...backendPolicies,appPolicies[1],...['backend','gateway','frontend','mcp'].map(deploymentFor).map((deployment,index)=>({...deployment,apiVersion:'apps/v1',kind:'Deployment',metadata:{...deployment.metadata,name:'wbs-'+['backend','gateway','frontend','mcp'][index],namespace:index===0?'wbs-solver':'wbs'}}))]});process.exit(0);}
if(args.includes('networkpolicies')){if(!args.includes('wbs-solver')&&fault==='public-open')appPolicies[1].spec.podSelector={};if(!args.includes('wbs-solver')&&fault==='extra-public-policy')appPolicies.push(fence('extra-allow','wbs'));output({items:args.includes('wbs-solver')?backendPolicies:appPolicies});process.exit(0);}
function gatewayRs(){const deployment=deploymentFor('gateway');const rs={...deployment,kind:'ReplicaSet',metadata:{uid:'gateway-rs',ownerReferences:[{kind:'Deployment',uid:'gateway-controller',controller:true}]}};if(fault==='gateway-rs-command')rs.spec.template.spec.containers[0].command=['touch','/tmp/injected'];return rs;}
if(args.some(arg=>arg.startsWith('deployments,'))){output({items:args.includes('wbs')?[...['gateway','frontend','mcp'].map(tier=>({...deploymentFor(tier),kind:'Deployment',spec:{...deploymentFor(tier).spec,replicas:0}})),...(fault==='gateway-pod-init'||fault==='gateway-rs-command'?[gatewayRs()]:[])]:[]});process.exit(0);}
if(args.includes('create')){fs.writeFileSync(path.join(root,'created.json'),fs.readFileSync(0,'utf8')); process.exit(0);}
if(args.includes('wait'))process.exit(0);
if(args.includes('logs')){if(fault==='bad-log'){console.log('malformed');process.exit(0);}console.log('PUNI_SQLITE_REPORT '+JSON.stringify(request.restored)); if(!args.some(arg=>arg.includes(request.restore.name)))console.log('PUNI_FIRST_START_OBSERVATION '+JSON.stringify({activation:'DISABLED',replay:request.restored.replay}));process.exit(0);}
if(args.includes('namespace')){const name=args[args.indexOf('namespace')+1];output({metadata:{uid:name==='kube-system'?'cluster':name==='wbs'?'app':'backend'}});process.exit(0);}
if(args.includes('pvc')){output({metadata:{uid:'volume'},status:{phase:'Bound'}});process.exit(0);}
if(args.some(arg=>arg.startsWith('kustomizations.'))){output({spec:{suspend:true}});process.exit(0);}
if(args.includes('networkpolicy')){output({spec:{podSelector:{matchLabels:{'puni.dev/writes':'fenced'}}}});process.exit(0);}
if(args.includes('pods')&&fault==='gateway-pod-init'&&args.includes('wbs')){const template=deploymentFor('gateway').spec.template;template.spec.initContainers=[{name:'rewrite',image:'foreign',command:['touch','/tmp/injected']}];output({items:[{...template,metadata:{...template.metadata,ownerReferences:[{kind:'ReplicaSet',uid:'gateway-rs',controller:true}]},status:{phase:'Running'}}]});process.exit(0);}
if(args.includes('pods')){output({items:fault==='unlabeled-pvc'?[{metadata:{name:'rogue',namespace:'wbs-solver',labels:{}},spec:{volumes:[{name:'stolen',persistentVolumeClaim:{claimName:'wbs-data'}}],containers:[{name:'rogue',volumeMounts:[{name:'stolen',mountPath:'/database'}]}]},status:{phase:'Running'}}]:[]});process.exit(0);}
if(args.includes('deployment')){const tier=args[args.indexOf('deployment')+1].replace('wbs-','');const deployment=deploymentFor(tier);if(fault==='rollout-image')deployment.spec.template.spec.containers[0].image='foreign';if(fault==='rollout-status')deployment.status.readyReplicas=0;if(fault==='gateway-init'&&tier==='gateway')deployment.spec.template.spec.initContainers=[{name:'rewrite',image:'foreign',command:['touch','/tmp/injected']}];if(fault.startsWith('backend-probe-')&&tier==='backend')deployment.spec.template.spec.containers[0][fault.replace('backend-probe-','')]={exec:{command:['touch','/data/wbs.sqlite']}};if(fault==='rollout-mount')deployment.spec.template.spec.volumes[0].persistentVolumeClaim.claimName='foreign';output(deployment);process.exit(0);}
if(args.includes('job')){const isRestore=args[args.indexOf('job')+1]===request.restore.name;const job=isRestore?restore:JSON.parse(fs.readFileSync(path.join(root,'created.json'),'utf8'));job.metadata.uid=isRestore?'restore':'actual';job.status={succeeded:1};const pod=job.spec.template.spec;
if(isRestore&&fault==='restore-uid')job.metadata.uid='foreign';
if(isRestore&&fault==='restore-status')job.status.succeeded=0;
if((isRestore&&fault==='restore-image')||(!isRestore&&fault==='actual-image'))pod.containers[0].image='foreign';
if((isRestore&&fault==='restore-command')||(!isRestore&&fault==='actual-command'))pod.containers[0].command=['echo','cached'];
if((isRestore&&fault==='restore-mount')||(!isRestore&&fault==='actual-mount'))pod.containers[0].volumeMounts[0].subPath='foreign';
output(job);process.exit(0);}
throw new Error('unmodeled kubectl invocation '+args.join(' '));
`,
    );
    chmodSync(settings.kubectl, 0o755);
    const effects = firstStartEffects(settings);
    if (fault.startsWith('rollout-'))
      await refuse(
        effects.verifyTiers({
          sourceSha: 'a'.repeat(40),
          images: parseDescriptor(JSON.parse(request.identity.descriptorBytes) as unknown).images,
        }),
      );
    else if (fault.startsWith('restore-')) await refuse(effects.observeRestore(request));
    else if (fault === 'gateway-pod-init' || fault === 'gateway-rs-command')
      await refuse(effects.assertSafety(request, false, false));
    else if (fault !== 'none')
      await refuse(effects.observePvc(request, 'first-start-aaaaaaaaaaaaaaaa'));
    else {
      await effects.assertTarget(request);
      await refuse(
        effects.assertTarget({ ...request, cluster: { ...request.cluster, uid: 'foreign' } }),
      );
      expect(await effects.observeRestore(request)).toEqual(request.restored);
      expect(await effects.observePvc(request, 'first-start-aaaaaaaaaaaaaaaa')).toEqual({
        report: request.restored,
        activation: 'DISABLED',
      });
      await effects.verifyTiers({
        sourceSha: 'a'.repeat(40),
        images: parseDescriptor(JSON.parse(request.identity.descriptorBytes) as unknown).images,
      });
      await effects.observePvc(request, 'first-start-aaaaaaaaaaaaaaaa');
      await effects.closeWrites();
      const calls = readFileSync(join(root, 'calls'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]);
      const checks = calls
        .filter((args) => args.includes('wait'))
        .flat()
        .filter((arg) => arg.startsWith('job/wbs-first-check-'));
      expect(checks.length).toBe(2);
      expect(checks[0]).not.toBe(checks[1]);
      expect(
        calls.some((args) => args.includes('patch') && args.includes('wbs-public-ingress')),
      ).toBe(true);
    }
  });
}

async function refuse(promise: Promise<unknown>): Promise<void> {
  const refusal = await promise.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
}
