import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import {
  afterAll as registerAfterAll,
  expect,
  test as registerTest,
  type TestOptions,
} from 'bun:test';

import { readGraphTestAdmission } from '../../test/run-tests';
import { initialHandoffFixture, initialHandoffLayout } from '../fixtures/initial-handoff';
import { captureEdgePolicy } from './edge-policy';
import { captureInitialHandoff, isInitialHandoffCleanupUnknown } from './initial-handoff-graph';

type GraphTestCallback = () => ReturnType<Parameters<typeof registerTest>[1]>;
type GraphHookOptions = Parameters<typeof registerAfterAll>[1];
interface GraphTestDeclaration {
  readonly name: string;
  readonly callback: GraphTestCallback;
  readonly options: number | TestOptions | undefined;
}
const graphTestDeclarations: GraphTestDeclaration[] = [];
const graphFinalizers: {
  readonly callback: GraphTestCallback;
  readonly options: GraphHookOptions;
}[] = [];
const graphModuleEntered = performance.now();
const graphRepository = resolve(import.meta.dir, '../../../..');
const graphMode = readGraphTestAdmission(process.env, {
  repository: graphRepository,
  modulePath: import.meta.path,
  executable: process.execPath,
  requiredExecutable: process.execPath,
  declaredCount: 228,
  declaredTitlesSHA256: '9676491473de150ee073672db57973de44ec6707f2e1a5f5f5f5b75384e4bd2a',
});
assert.equal(process.cwd(), graphRepository, 'UC1 graph command cwd differs');
const hasNativePreflight = graphMode !== 'graph-ordinary';

/** Collects only this file's direct registrations; acquisition waits until the complete module is ready. */
function test(name: string, callback: GraphTestCallback, options?: number | TestOptions): void {
  assert.equal(typeof name, 'string', 'unsupported graph test name');
  assert.equal(typeof callback, 'function', 'unsupported graph callback');
  assert.equal(callback.length, 0, 'unsupported graph done callback');
  if (options !== undefined && typeof options !== 'number') {
    for (const key of Object.keys(options))
      assert(['timeout', 'retry', 'repeats'].includes(key), 'unsupported graph test option');
  }
  graphTestDeclarations.push({ name, callback, options });
}

/** Keeps the original file finalizer out of the runner until native preflight is fully settled. */
function afterAll(callback: GraphTestCallback, options?: GraphHookOptions): void {
  assert.equal(typeof callback, 'function', 'unsupported graph finalizer');
  assert.equal(callback.length, 0, 'unsupported graph finalizer done callback');
  graphFinalizers.push({ callback, options });
}

test('active graph refuses missing committed pointer without creating or scanning evidence', async () => {
  const directory = scratchSync('initial-handoff-graph-');
  await writeFile(
    directory + '/edge-policy.json',
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: directory,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-000001-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
    { mode: 0o600 },
  );
  const snapshot = await captureEdgePolicy(directory);
  let refusal: unknown;
  try {
    await captureInitialHandoff(snapshot, performance.now() + 120000);
  } catch (cause) {
    refusal = cause;
  }
  expect(String(refusal)).toContain('edge-owner.json');
  expect(await Bun.file(directory + '/edge-owner.json').exists()).toBe(false);
});

async function runGraph(
  fixture: Awaited<ReturnType<typeof initialHandoffFixture>>,
  closingFault?: string,
) {
  const entry = fixture.root + '/reader.ts';
  const bundle = fixture.root + '/reader.js';
  await writeFile(
    entry,
    `import {captureEdgePolicy} from ${JSON.stringify(resolve(import.meta.dir, 'edge-policy.ts'))};import {captureInitialHandoff} from ${JSON.stringify(resolve(import.meta.dir, 'initial-handoff-graph.ts'))};import{appendFileSync}from'node:fs';const graph=await captureInitialHandoff(await captureEdgePolicy(${JSON.stringify(fixture.root)}),performance.now()+120000);try{${closingFault === undefined ? '' : `appendFileSync(${JSON.stringify(closingFault)},'changed');`}graph.verifyClosure();graph.assertStable();console.log('ACCEPTED');}finally{graph.closeFiles();}`,
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    plugins: [initialHandoffLayout(fixture.root, fixture.layouts)],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('owned graph fixture compilation failed', { cause: built.logs });
  const output = built.outputs.at(0);
  if (output === undefined) throw new Error('owned graph bundle absent');
  await Bun.write(bundle, output);
  const child = Bun.spawn([process.execPath, bundle], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}
for (const phase of ['H6', 'H7', 'H8'] as const) {
  test(`complete owned initial graph captures and closes ${phase}`, async () => {
    const fixture = await initialHandoffFixture(phase);
    const observed = await runGraph(fixture);
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    expect(observed.stdout.trim()).toBe('ACCEPTED');
  });
}

for (const label of [
  'handoff-admission',
  'handoff-intent',
  'exposure-intent',
  'exposure-complete',
  'handoff-complete',
  'solver-restore-intent',
  'solver-restore-complete',
  'activation-participants',
  'activation-capture',
  'activation-backup',
  'activation-intent',
  'activation-committed',
  'activation-participant-restore-intent',
  'activation-participant-ready',
  'activation-participant-policy-intent',
  'activation-participants-restored',
]) {
  test(`complete graph rejects a hash-bound unknown field in ${label}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (selected, fields) => {
      if (selected === label) fields['unrecognized'] = true;
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toContain('unknown or missing fields');
  });
}
for (const phase of ['policy-publication-intent', 'policy-published']) {
  test(`dedicated solver-ready edge rejects inherited ${phase} sibling`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label === 'solver-restore-complete') fields['phase'] = phase;
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('solver-ready phase differs');
  });
}
for (const fault of ['raw-capture', 'raw-backup']) {
  test(`independent closing graph refuses changed ${fault} bytes`, async () => {
    const fixture = await initialHandoffFixture();
    const path = fixture.paths.get(fault);
    if (path === undefined) throw new Error('fixture raw path absent');
    const observed = await runGraph(fixture, path);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('retained file identity differs');
  });
}

test('complete graph refuses consistently archived backend database differing from selected database identity', async () => {
  const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
    if (label !== 'archived-backend-intent' && label !== 'archived-backend-complete') return;
    const cohort = fields['cohort'] as { blue: { database: { host: string } } };
    cohort.blue.database.host += '.foreign';
  });
  const observed = await runGraph(fixture);
  expect(observed.code).toBe(1);
  expect(observed.stdout).not.toContain('ACCEPTED');
});
test('complete graph refuses NUL in otherwise matched historical solver-ready cgroup', async () => {
  const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
    if (label !== 'solver-restore-complete') return;
    const observed = fields['observed'] as {
      unit: { cgroup: string };
      process: { cgroup: string };
    };
    const group = '/user.slice/owned\0/wbs-solver-supervisor.service';
    observed.unit.cgroup = group;
    observed.process.cgroup = group;
  });
  const observed = await runGraph(fixture);
  expect(observed.code).toBe(1);
  expect(observed.stdout).not.toContain('ACCEPTED');
});

for (const activate of [['prod'], ['dev'], ['prod', 'dev']] as const) {
  test(`complete selected artifact closure accepts ordered roster ${activate.join(',')}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, undefined, { activate });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(0);
    expect(observed.stderr).toBe('');
  });
}
for (const fault of ['unknown-root', 'unknown-applied-row', 'pending-ledger'] as const) {
  test(`selected exact raw capture reader refuses ${fault} with recomputed reference hashes`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label !== 'raw-capture-input') return;
      if (fault === 'unknown-root') fields['unrecognized'] = true;
      if (fault === 'unknown-applied-row') {
        const applied = fields['applied'] as Record<string, unknown>[];
        const first = applied.at(0);
        if (first === undefined) throw new Error('owned applied entry missing');
        first['unrecognized'] = true;
      }
      if (fault === 'pending-ledger')
        fields['pending'] = [
          { name: '20261101000000_owned_pending', hash: 'e'.repeat(64), downHash: 'e'.repeat(64) },
        ];
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toContain(
      fault === 'pending-ledger' ? 'complete applied ledger differs' : 'unknown or missing fields',
    );
  });
}
for (const [label, fault] of [
  ['writers-input', 'origin'],
  ['source-manifest-input', 'closed'],
  ['migration-manifest-input', 'closed'],
] as const) {
  test(`original manifest codec refuses hash-bound ${label} ${fault}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (selected, fields) => {
      if (selected !== label) return;
      if (fault === 'closed') fields['unrecognized'] = true;
      else {
        const members = fields['members'] as Record<string, unknown>[];
        const first = members.at(0);
        if (first === undefined) throw new Error('owned writer missing');
        first['origin'] = 'invented';
      }
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
  });
}
for (const bytes of [0, 1073741825]) {
  test(`selected backup reader refuses declared byte bound ${String(bytes)}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label === 'activation-backup') {
        const snapshot = fields['snapshot'] as Record<string, unknown>;
        snapshot['bytes'] = bytes;
      }
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('backup byte or name bound differs');
  });
}

for (const fault of [
  'absent-capture',
  'unreadable-capture',
  'public-capture',
  'symlink-capture',
  'absent-backup',
  'unreadable-backup',
  'extra-artifact',
  'retained-original-fence',
] as const) {
  test(`complete real artifact boundary refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture();
    const capture = fixture.paths.get('raw-capture');
    const backup = fixture.paths.get('raw-backup');
    if (capture === undefined || backup === undefined) throw new Error('owned raw paths absent');
    if (fault === 'absent-capture') await unlink(capture);
    if (fault === 'unreadable-capture') await chmod(capture, 0);
    if (fault === 'public-capture') await chmod(capture, 0o644);
    if (fault === 'symlink-capture') {
      const bytes = await readFile(capture);
      const foreign = fixture.root + '/foreign-capture';
      await writeFile(foreign, bytes, { mode: 0o600 });
      await unlink(capture);
      await symlink(foreign, capture);
    }
    if (fault === 'absent-backup') await unlink(backup);
    if (fault === 'unreadable-backup') await chmod(backup, 0);
    if (fault === 'extra-artifact')
      await writeFile(capture + '.unexpected', 'owned unexpected evidence', { mode: 0o600 });
    if (fault === 'retained-original-fence')
      await writeFile(fixture.root + '/dependency-backend-fence.json', 'retained', { mode: 0o600 });
    try {
      const observed = await runGraph(fixture);
      expect(observed.code).toBe(1);
      expect(observed.stdout).not.toContain('ACCEPTED');
    } finally {
      if (fault === 'unreadable-capture') await chmod(capture, 0o600);
      if (fault === 'unreadable-backup') await chmod(backup, 0o600);
    }
  });
}
for (const fault of [
  'both',
  'neither',
  'complete-pending',
  'unknown-pointer',
  'wrong-pointer-policy',
] as const) {
  test(`full initial pointer/pending/archive state refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture(
      fault === 'neither' || fault === 'complete-pending' ? 'H6' : 'H8',
    );
    const archived = fixture.paths.get('owner-archive');
    if (archived === undefined) throw new Error('owned publication path absent');
    if (fault === 'both')
      await writeFile(fixture.root + '/edge-owner.pending', fixture.owner, { mode: 0o600 });
    if (fault === 'neither') await unlink(archived);
    if (
      fault === 'complete-pending' ||
      fault === 'unknown-pointer' ||
      fault === 'wrong-pointer-policy'
    ) {
      const pointer = JSON.parse(
        await readFile(fixture.root + '/edge-owner.json', 'utf8'),
      ) as Record<string, unknown>;
      if (fault === 'complete-pending') pointer['phase'] = 'complete';
      if (fault === 'unknown-pointer') pointer['phase'] = 'uncertain';
      if (fault === 'wrong-pointer-policy') pointer['policySha256'] = 'f'.repeat(64);
      await writeFile(fixture.root + '/edge-owner.json', JSON.stringify(pointer));
    }
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
  });
}

test('full graph preserves a nonzero original on-failure retry count', async () => {
  const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
    if (label !== 'activation-participant-restore-intent') return;
    const selected = fields['selected'] as {
      originalPolicy: { name: string; maximumRetryCount: number };
    }[];
    const backend = selected.at(0);
    if (backend === undefined) throw new Error('owned original policy absent');
    backend.originalPolicy.name = 'on-failure';
    backend.originalPolicy.maximumRetryCount = 3;
  });
  const observed = await runGraph(fixture);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
});

for (const fault of [
  'admission-v1',
  'missing-pins',
  'unknown-pin',
  'foreign-source',
  'foreign-writer',
  'foreign-machine',
  'missing-profile',
  'reversed-profile',
  'boolean-uid',
  'invalid-hash',
] as const) {
  test(`complete hash-bound admission-v2 consumer refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label !== 'handoff-admission') return;
      if (fault === 'admission-v1') {
        fields['version'] = 1;
        return;
      }
      if (fault === 'missing-pins') {
        delete fields['runtimeLaunch'];
        return;
      }
      const pins = fields['runtimeLaunch'] as Record<string, unknown>;
      if (fault === 'unknown-pin') pins['unrecognized'] = true;
      if (fault === 'foreign-source') pins['sourceSha'] = 'f'.repeat(40);
      if (fault === 'foreign-writer') pins['writerManifestSha256'] = 'f'.repeat(64);
      if (fault === 'foreign-machine') pins['hostMachineIdSha256'] = 'f'.repeat(64);
      if (fault === 'invalid-hash') pins['projectionSha256'] = 'G'.repeat(64);
      const profiles = pins['sessionProfiles'] as Record<string, unknown>[];
      if (fault === 'missing-profile') profiles.pop();
      if (fault === 'reversed-profile') profiles.reverse();
      if (fault === 'boolean-uid') {
        const first = profiles.at(0);
        if (first === undefined) throw new Error('owned profile absent');
        first['uid'] = false;
      }
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toMatch(/runtime launch|record format|unknown or missing fields/);
  });
}

for (const fault of [
  'writer-build-revision',
  'migration-image-identity',
  'restored-policy-digest',
] as const) {
  test(`review crosslink refuses independent ${fault} branch with recomputed enclosing hashes`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (fault === 'writer-build-revision' && label === 'writers-input')
        fields['buildSha'] = '2'.repeat(40);
      if (fault === 'migration-image-identity') {
        if (label === 'migration-manifest-input')
          fields['candidateImageId'] = 'sha256:' + 'c'.repeat(64);
        if (label === 'handoff-admission') {
          const migrations = fields['migrations'] as Record<string, unknown>;
          migrations['candidateImageId'] = 'sha256:' + 'c'.repeat(64);
        }
      }
      if (
        fault === 'restored-policy-digest' &&
        label === 'activation-participant-policy-intent' &&
        fields['role'] === 'backend'
      )
        fields['policySha256'] = 'f'.repeat(64);
    });
    const observed = await runGraph(fixture);
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    expect(observed.stderr).toContain(
      fault === 'writer-build-revision'
        ? 'writer manifest source differs'
        : fault === 'migration-image-identity'
          ? 'migration selected image differs'
          : 'participant original policy digest differs',
    );
  });
}

test('INITIAL prerequisite exports content validation and retained raw observation', async () => {
  const graph = await import('./initial-handoff-graph');
  expect(Reflect.get(graph, 'validateInitialHandoffPlan')).toBeFunction();
  expect(Reflect.get(graph, 'captureInitialHandoffArtifacts')).toBeFunction();
});

async function runPrerequisite(
  fixture: Awaited<ReturnType<typeof initialHandoffFixture>>,
  operation: string,
) {
  const entry = fixture.root + '/prerequisite.ts';
  const bundle = fixture.root + '/prerequisite.js';
  await writeFile(
    entry,
    `import {validateInitialHandoffPlan,captureInitialHandoffArtifacts,captureInitialHandoff} from ${JSON.stringify(resolve(import.meta.dir, 'initial-handoff-graph.ts'))};
import {captureEdgePolicy} from ${JSON.stringify(resolve(import.meta.dir, 'edge-policy.ts'))};
import {appendFileSync,chmodSync,lstatSync,readFileSync,readdirSync,renameSync,unlinkSync,writeFileSync,symlinkSync,truncateSync} from 'node:fs';
const plan=${JSON.stringify(fixture.plan)};
const request=${JSON.stringify(fixture.artifactRequest)};
const deadline=performance.now()+120000;
${operation}
console.log('ACCEPTED');`,
  );
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    plugins: [initialHandoffLayout(fixture.root, fixture.layouts)],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('owned prerequisite compilation failed', { cause: built.logs });
  const output = built.outputs.at(0);
  if (output === undefined) throw new Error('owned prerequisite bundle absent');
  await Bun.write(bundle, output);
  const child = Bun.spawn([process.execPath, bundle], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}
async function assertUnpublishedFenceOriginals(
  fixture: Awaited<ReturnType<typeof initialHandoffFixture>>,
) {
  const intent = fixture.plan.records.find(({ name }) => name.endsWith('-handoff-intent.json'));
  if (intent === undefined) throw new Error('authored handoff intent absent');
  const envelope = JSON.parse(intent.contents) as {
    record: { fences: { environment: string; name: string; archive: { name: string } }[] };
  };
  expect(envelope.record.fences).toHaveLength(8);
  expect(fixture.plan.fences).toHaveLength(8);
  for (const [index, original] of fixture.plan.fences.entries()) {
    const retired = envelope.record.fences.at(index);
    if (retired === undefined) throw new Error('authored fence retirement absent');
    expect(retired.environment).toBe(original.environment);
    expect(retired.name).toBe(original.name);
    expect(await Bun.file(original.snapshot.path).text()).toBe(original.snapshot.contents);
    expect(
      await Bun.file(resolve(original.snapshot.path, '..', retired.archive.name)).exists(),
    ).toBe(false);
  }
}
for (const activate of [['prod'], ['dev'], ['prod', 'dev']] as const) {
  test(`seeded plan validates ${activate.join('+')} without terminal publication`, async () => {
    const fixture = await initialHandoffFixture('plan', undefined, undefined, { activate });
    for (const entry of fixture.plan.records.filter(({ name }) =>
      /-(handoff-(admission|intent|complete)|exposure-(intent|complete))\.json$/.test(name),
    ))
      expect(await Bun.file(fixture.root + '/' + entry.name).exists()).toBe(false);
    for (const name of [
      'edge-policy.json',
      'edge-owner.json',
      'edge-owner-000048-retired-pending.json',
    ])
      expect(await Bun.file(fixture.root + '/' + name).exists()).toBe(false);
    await assertUnpublishedFenceOriginals(fixture);
    const observed = await runPrerequisite(
      fixture,
      `if(validateInitialHandoffPlan(plan,deadline)!==undefined)throw Error('authority returned');
const observation=captureInitialHandoffArtifacts(request,deadline);try{observation.verifyClosure();observation.assertStable();if(JSON.stringify(observation.contents)!==JSON.stringify(plan.artifacts))throw Error('raw projection differs');}finally{observation.closeFiles();}`,
    );
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    expect(observed.stdout.trim()).toBe('ACCEPTED');
    const disk = await runGraph(fixture);
    expect(disk.code).toBe(1);
    expect(disk.stdout).not.toContain('ACCEPTED');
    await assertUnpublishedFenceOriginals(fixture);
  });
}
const planFaults = [
  ['closed container', `plan.extra=true;`, 'unknown or missing fields'],
  ['record cardinality', `plan.records=Array(65).fill(plan.records[0]);`, 'roster malformed'],
  ['duplicate record', `plan.records.push(plan.records[0]);`, 'duplicate planned record'],
  [
    'missing reference',
    `plan.records=plan.records.filter(r=>!r.name.endsWith('-handoff-admission.json'));`,
    'planned reference absent',
  ],
  [
    'extra record',
    `plan.records.push({name:'edge-owner-000099-activation-capture.json',contents:'{}'});`,
    'extraneous planned record',
  ],
  [
    'record family',
    `plan.records[0].name='edge-owner-000099-unrelated.json';`,
    'planned record family',
  ],
  ['pending bytes', `plan.pending.contents='x'.repeat(65537);`, 'content UTF-8 or byte bound'],
  [
    'fence bytes',
    `plan.fences[7].snapshot.contents='x'.repeat(65537);`,
    'content UTF-8 or byte bound',
  ],
  [
    'unused record bytes',
    `plan.records.push({name:'edge-owner-000099-activation-capture.json',contents:'x'.repeat(65537)});`,
    'content UTF-8 or byte bound',
  ],
  [
    'ill-formed UTF-8',
    `plan.pending.contents+=String.fromCharCode(0xd800);`,
    'content UTF-8 or byte bound',
  ],
  ['UTF-8 byte length', `plan.pending.contents='é'.repeat(32769);`, 'content UTF-8 or byte bound'],
  [
    'exact owner LF',
    `plan.pending.contents=plan.pending.contents.trim();`,
    'policy original owner hash',
  ],
  ['snapshot decimal', `plan.fences[0].snapshot.inode='01';`, 'identity malformed'],
  ['snapshot mode', `plan.pending.mode=420;`, 'snapshot path or mode'],
  ['snapshot parent', `plan.fences[0].snapshot.parentInode='999999';`, 'planned archive identity'],
  ['snapshot identity', `plan.pending.inode='999999';`, 'planned archive identity'],
  ['relative namespace', `plan.edgeState='relative';`, 'lexically canonical'],
  ['unnormalized namespace', `plan.edgeState+='/../x';`, 'lexically canonical'],
  ['NUL namespace', `plan.edgeState+='\0';`, 'lexically canonical'],
  [
    'policy unknown field',
    `const p=JSON.parse(plan.policyContents);p.extra=true;plan.policyContents=JSON.stringify(p);`,
    'unknown or missing fields',
  ],
  [
    'policy phase',
    `const p=JSON.parse(plan.policyContents);p.phase='fenced';plan.policyContents=JSON.stringify(p);`,
    '',
  ],
  [
    'policy namespace',
    `const p=JSON.parse(plan.policyContents);p.edgeState+='/foreign';plan.policyContents=JSON.stringify(p);`,
    'invalid active edge policy',
  ],
  [
    'prepared pointer phase',
    `const p=JSON.parse(plan.preparedPointerContents);p.phase='complete';plan.preparedPointerContents=JSON.stringify(p);`,
    'planned pointer phases',
  ],
  [
    'complete pointer digest',
    `const p=JSON.parse(plan.completePointerContents);p.policySha256='f'.repeat(64);plan.completePointerContents=JSON.stringify(p);`,
    'pointer/policy binding',
  ],
  [
    'manifest extra field',
    `plan.manifests.extra=plan.manifests.writers;`,
    'unknown or missing fields',
  ],
  ['fence cardinality', `plan.fences.pop();`, 'fence roster incomplete'],
  [
    'artifact projection size',
    `plan.artifacts.selected[0].backup.bytes++;`,
    'complete binary backup bytes',
  ],
] as const;
for (const [fault, mutation, refusal] of planFaults) {
  test(`pure plan refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture('plan');
    const observed = await runPrerequisite(
      fixture,
      mutation + `validateInitialHandoffPlan(plan,deadline);`,
    );
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    if (refusal !== '') expect(observed.stderr).toContain(refusal);
  });
}
for (const label of [
  'handoff-admission',
  'handoff-intent',
  'exposure-intent',
  'exposure-complete',
  'handoff-complete',
  'solver-restore-intent',
  'solver-restore-complete',
  'activation-participants',
  'activation-capture',
  'activation-backup',
  'activation-intent',
  'activation-committed',
  'activation-participant-restore-intent',
  'activation-participant-ready',
  'activation-participant-policy-intent',
  'activation-participants-restored',
]) {
  test(`shared plan codec refuses repaired-hash unknown field in ${label}`, async () => {
    const fixture = await initialHandoffFixture('plan', undefined, (selected, fields) => {
      if (selected === label) fields['unrecognized'] = true;
    });
    const observed = await runPrerequisite(fixture, 'validateInitialHandoffPlan(plan,deadline);');
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('unknown or missing fields');
  });
}
const rawFaults = [
  ['owner bound', `request.owner='x'.repeat(65537);`, 'content UTF-8 or byte bound'],
  ['owner surrogate', `request.owner+=String.fromCharCode(0xd800);`, 'content UTF-8 or byte bound'],
  [
    'writer bound',
    `request.activation.authorities.writerManifestContents='x'.repeat(262145);`,
    'content UTF-8 or byte bound',
  ],
  ['database cardinality', `request.databases.pop();`, 'database roster incomplete'],
  [
    'database malformed identity',
    `request.databases[1].fileIdentity='01:2';`,
    'database identity malformed',
  ],
  ['selected roster', `request.selected.push(request.selected[0]);`, 'raw selected roster'],
  ['selected name', `request.selected[0].capture.name='dev.capture.json';`, 'raw artifact name'],
  ['backup zero', `request.selected[0].backup.bytes=0;`, 'backup byte or name bound'],
  [
    'backup over limit',
    `request.selected[0].backup.bytes=1073741825;`,
    'backup byte or name bound',
  ],
  [
    'missing capture',
    `unlinkSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.capture.json');`,
    '',
  ],
  [
    'unreadable capture',
    `chmodSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.capture.json',0);`,
    'cannot open',
  ],
  [
    'public backup',
    `chmodSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite',420);`,
    'file type, mode, owner or size',
  ],
  [
    'symlink backup',
    `const p=request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite';renameSync(p,p+'.parked');symlinkSync(p+'.parked',p);unlinkSync(p+'.parked');`,
    'cannot open',
  ],
  [
    'extra raw evidence',
    `writeFileSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/dev.capture.json','x',{mode:384});`,
    'roster exceeds',
  ],
  [
    'changed capture bytes',
    `appendFileSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.capture.json',' ');`,
    'raw migration capture hash',
  ],
  [
    'truncated backup',
    `truncateSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite',1);`,
    'complete binary backup bytes',
  ],
  [
    'grown backup',
    `appendFileSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite','x');`,
    'file type, mode, owner or size',
  ],
] as const;
for (const [fault, mutation, refusal] of rawFaults) {
  test(`fixed raw observer refuses ${fault}`, async () => {
    const fixture = await initialHandoffFixture('plan');
    const observed = await runPrerequisite(
      fixture,
      mutation +
        'const observation=captureInitialHandoffArtifacts(request,deadline);observation.closeFiles();',
    );
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    if (refusal !== '') expect(observed.stderr).toContain(refusal);
  });
}
for (const fault of ['target', 'attempt', 'candidate', 'ledger', 'rows']) {
  test(`shared raw codec refuses repaired-hash ${fault}`, async () => {
    const fixture = await initialHandoffFixture('plan', undefined, (label, fields) => {
      if (label !== 'raw-capture-input') return;
      if (fault === 'target') fields['target'] = 'foreign';
      if (fault === 'attempt') fields['attempt'] = '12345678-1234-4123-8123-123456789abc:dev';
      if (fault === 'candidate') fields['candidate'] = 'registry/foreign@sha256:' + 'a'.repeat(64);
      if (fault === 'ledger') (fields['applied'] as { hash: string }[])[0].hash = 'a'.repeat(64);
      if (fault === 'rows')
        fields['applied'] = Array(4097).fill((fields['applied'] as unknown[])[0]);
    });
    for (const operation of [
      'validateInitialHandoffPlan(plan,deadline);',
      'const o=captureInitialHandoffArtifacts(request,deadline);o.closeFiles();',
    ]) {
      const observed = await runPrerequisite(fixture, operation);
      expect(observed.code).toBe(1);
      expect(observed.stdout).not.toContain('ACCEPTED');
    }
  });
}
test('raw observation detaches inputs and freezes nested output before retaining closure', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const o=captureInitialHandoffArtifacts(request,deadline);try{
request.selected[0].backup.name='foreign';request.selected[0].backup.migrations.length=0;request.databases[0].fileIdentity='99:99';request.activation.activate.length=0;
if(!Object.isFrozen(o.contents)||!Object.isFrozen(o.contents.selected)||!Object.isFrozen(o.contents.selected[0])||!Object.isFrozen(o.contents.selected[0].backup))throw Error('mutable projection');
let refused=false;try{o.contents.selected[0].backup.sha256='a'.repeat(64);}catch{refused=true;}if(!refused)throw Error('output mutation admitted');o.verifyClosure();o.assertStable();
appendFileSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite','x');
refused=false;try{o.verifyClosure();}catch{refused=true;}if(!refused)throw Error('original baseline lost');}finally{o.closeFiles();o.closeFiles();}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});
for (const changed of ['replacement', 'parent', 'capture', 'backup']) {
  test(`raw closing observation refuses ${changed}`, async () => {
    const fixture = await initialHandoffFixture('plan');
    const directory = fixture.root + '/dependency-activation-12345678-1234-4123-8123-123456789abc';
    const mutation =
      changed === 'replacement'
        ? `const p=${JSON.stringify(directory + '/prod.before.sqlite')};const bytes=readFileSync(p);unlinkSync(p);writeFileSync(p,bytes,{mode:384});`
        : changed === 'parent'
          ? `renameSync(${JSON.stringify(directory)},${JSON.stringify(directory + '.renamed')});`
          : `appendFileSync(${JSON.stringify(directory + (changed === 'capture' ? '/prod.capture.json' : '/prod.before.sqlite'))},'x');`;
    const observed = await runPrerequisite(
      fixture,
      `const o=captureInitialHandoffArtifacts(request,deadline);try{${mutation}o.verifyClosure();}finally{o.closeFiles();}`,
    );
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
  });
}
test('raw close remains available and idempotent after expiry', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const o=captureInitialHandoffArtifacts(request,deadline);const clock=performance.now.bind(performance);Object.defineProperty(performance,'now',{configurable:true,value:()=>deadline+1});
try{for(const method of ['verifyClosure','assertStable']){let refused=false;try{o[method]();}catch(e){if(!String(e).includes('deadline exceeded'))throw e;refused=true;}if(!refused)throw Error('expired observation admitted');}o.closeFiles();o.closeFiles();}finally{Object.defineProperty(performance,'now',{configurable:true,value:clock});}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});
test('pure validation refuses expiration at its final successful-return boundary', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const clock=performance.now.bind(performance);let calls=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>{calls++;return 1;}});
try{validateInitialHandoffPlan(plan,1000);const closing=calls;calls=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>++calls>=closing?1000:1});let refused=false;try{validateInitialHandoffPlan(plan,1000);}catch(e){if(!String(e).includes('deadline exceeded'))throw e;refused=true;}if(!refused||calls!==closing)throw Error('closing deadline not enforced');}finally{Object.defineProperty(performance,'now',{configurable:true,value:clock});}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});

for (const fault of ['fifo', 'invalid-utf8', 'sparse-over-limit']) {
  test(`bounded raw reader refuses actual ${fault}`, async () => {
    const fixture = await initialHandoffFixture('plan');
    const capture = fixture.paths.get('raw-capture');
    const backup = fixture.paths.get('raw-backup');
    if (capture === undefined || backup === undefined) throw new Error('owned raw paths absent');
    if (fault === 'fifo') {
      await unlink(backup);
      const created = Bun.spawn(['mkfifo', '-m', '600', backup], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [status, stdout, stderr] = await Promise.all([
        created.exited,
        new Response(created.stdout).text(),
        new Response(created.stderr).text(),
      ]);
      expect(status).toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toBe('');
    } else if (fault === 'invalid-utf8')
      await writeFile(capture, new Uint8Array([0xff]), { mode: 0o600 });
    const observed = await runPrerequisite(
      fixture,
      (fault === 'sparse-over-limit' ? `truncateSync(${JSON.stringify(backup)},1073741825);` : '') +
        'const o=captureInitialHandoffArtifacts(request,deadline);o.closeFiles();',
    );
    expect(observed.code).toBe(1);
    expect(observed.stdout).not.toContain('ACCEPTED');
    if (fault !== 'invalid-utf8')
      expect(observed.stderr).toContain('file type, mode, owner or size');
  });
}
test('raw construction failure closes its descriptors and preserves caller descriptor', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const fs=await import('node:fs');const caller=fs.openSync(request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite','r');try{
const before=readdirSync('/proc/self/fd').length;request.selected[0].capture.sha256='a'.repeat(64);let refused=false;try{captureInitialHandoffArtifacts(request,deadline);}catch(e){if(!String(e).includes('raw migration capture hash'))throw e;refused=true;}if(!refused)throw Error('bad capture admitted');if(readdirSync('/proc/self/fd').length!==before)throw Error('descriptors leaked');fs.fstatSync(caller);}finally{fs.closeSync(caller);}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});
test('raw streaming keeps its original deadline between backup chunks', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const {createHash}=await import('node:crypto');const bytes=Buffer.alloc(2*1024*1024,65);const path=request.edgeState+'/dependency-activation-12345678-1234-4123-8123-123456789abc/prod.before.sqlite';writeFileSync(path,bytes,{mode:384});request.selected[0].backup.bytes=bytes.length;request.selected[0].backup.sha256=createHash('sha256').update(bytes).digest('hex');
const clock=performance.now.bind(performance);let reads=0;let injected=false;Object.defineProperty(performance,'now',{configurable:true,value:()=>{if(new Error().stack?.includes('readBytes')){reads++;if(reads===11)injected=true;}return injected?deadline+1:clock();}});
try{let refused=false;try{captureInitialHandoffArtifacts(request,deadline);}catch(e){if(!String(e).includes('deadline exceeded'))throw e;refused=true;}if(!injected||!refused)throw Error('chunk deadline fault not reached');}finally{Object.defineProperty(performance,'now',{configurable:true,value:clock});}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});

for (const fault of [
  'writer-build',
  'migration-image',
  'policy-digest',
  'receipt-attempt',
  'ready-phase',
  'launch-source',
  'ready-selection',
]) {
  test(`shared graph semantics refuse repaired-hash ${fault} through plan and disk`, async () => {
    const fixture = await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (fault === 'writer-build' && label === 'writers-input')
        fields['buildSha'] = '2'.repeat(40);
      if (fault === 'migration-image') {
        if (label === 'migration-manifest-input')
          fields['candidateImageId'] = 'sha256:' + 'c'.repeat(64);
        if (label === 'handoff-admission')
          (fields['migrations'] as Record<string, unknown>)['candidateImageId'] =
            'sha256:' + 'c'.repeat(64);
      }
      if (
        fault === 'policy-digest' &&
        label === 'activation-participant-policy-intent' &&
        fields['role'] === 'backend'
      )
        fields['policySha256'] = 'f'.repeat(64);
      if (fault === 'receipt-attempt' && label === 'activation-intent')
        (fields['receipt'] as Record<string, unknown>)['activationId'] = 'foreign';
      if (fault === 'ready-phase' && label === 'solver-restore-complete')
        fields['phase'] = 'policy-published';
      if (fault === 'launch-source' && label === 'handoff-admission')
        (fields['runtimeLaunch'] as Record<string, unknown>)['sourceSha'] = 'f'.repeat(40);
      if (
        fault === 'ready-selection' &&
        label === 'activation-participant-ready' &&
        fields['role'] === 'backend'
      )
        fields['role'] = 'gateway';
    });
    const pure = await runPrerequisite(fixture, 'validateInitialHandoffPlan(plan,deadline);');
    const disk = await runGraph(fixture);
    const refusal =
      fault === 'writer-build'
        ? 'writer manifest source differs'
        : fault === 'migration-image'
          ? 'migration selected image differs'
          : fault === 'policy-digest'
            ? 'participant original policy digest differs'
            : fault === 'receipt-attempt'
              ? 'receipt'
              : fault === 'ready-phase'
                ? 'solver-ready phase differs'
                : fault === 'launch-source'
                  ? 'runtime launch'
                  : 'participant ready selection differs';
    for (const observed of [pure, disk]) {
      expect(observed.code).toBe(1);
      expect(observed.stderr).toContain(refusal);
      expect(observed.stdout).not.toContain('ACCEPTED');
    }
  });
}
test('pure graph retains a nonzero original on-failure retry count', async () => {
  const fixture = await initialHandoffFixture('plan', undefined, (label, fields) => {
    if (label !== 'activation-participant-restore-intent') return;
    const backend = (
      fields['selected'] as { originalPolicy: { name: string; maximumRetryCount: number } }[]
    ).at(0);
    if (backend === undefined) throw new Error('owned backend selection absent');
    backend.originalPolicy = { name: 'on-failure', maximumRetryCount: 3 };
  });
  const observed = await runPrerequisite(fixture, 'validateInitialHandoffPlan(plan,deadline);');
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});
test('raw observation refuses successful return after its original final deadline', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const clock=performance.now.bind(performance);let calls=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>{calls++;return 1;}});
try{const opening=captureInitialHandoffArtifacts(request,1000);const closing=calls;opening.closeFiles();calls=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>++calls>=closing?1000:1});let refused=false;try{captureInitialHandoffArtifacts(request,1000);}catch(e){if(!String(e).includes('deadline exceeded'))throw e;refused=true;}if(!refused||calls!==closing)throw Error('final raw deadline not enforced');}finally{Object.defineProperty(performance,'now',{configurable:true,value:clock});}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});

test('dedicated actual ready reread refuses identical bytes on a replacement inode', async () => {
  const fixture = await initialHandoffFixture('H8');
  const ready = fixture.paths.get('solver-restore-complete');
  if (ready === undefined) throw new Error('owned solver ready path absent');
  const observed = await runPrerequisite(
    fixture,
    `const {createHash}=await import('node:crypto');const path=${JSON.stringify(ready)};const bytes=readFileSync(path);const original=lstatSync(path,{bigint:true});const snapshot=await captureEdgePolicy(request.edgeState);
const opening=captureInitialHandoff(snapshot,deadline);
renameSync(path,path+'.retained');writeFileSync(path,bytes,{mode:384});const replacement=lstatSync(path,{bigint:true});
const sha256=createHash('sha256').update(bytes).digest('hex');const replacementSha256=createHash('sha256').update(readFileSync(path)).digest('hex');
if(original.dev===replacement.dev&&original.ino===replacement.ino)throw Error('replacement identity fault not delivered');if(sha256!==replacementSha256)throw Error('replacement bytes differ');
console.log('READY_REPLACEMENT_CUSTODY:'+JSON.stringify({original:{device:String(original.dev),inode:String(original.ino)},replacement:{device:String(replacement.dev),inode:String(replacement.ino)},sha256,replacementSha256,sameBytes:true,synchronousReplacement:true}));
const graph=await opening;graph.closeFiles();`,
  );
  expect(observed.code).toBe(1);
  expect(observed.stderr).toContain('dedicated ready capture changed');
  expect(observed.stdout).not.toContain('ACCEPTED');
  const frame = observed.stdout.trim();
  expect(frame).toStartWith('READY_REPLACEMENT_CUSTODY:');
  process.stderr.write(frame + '\n');
});

test('plan bounds every standalone fence before enumerating supplied records', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `plan.fences[7].snapshot.contents='x'.repeat(65537);Object.defineProperty(plan.records,0,{get(){throw Error('records enumerated before standalone bounds');}});validateInitialHandoffPlan(plan,deadline);`,
  );
  expect(observed.code).toBe(1);
  expect(observed.stderr).toContain('content UTF-8 or byte bound differs');
  expect(observed.stderr).not.toContain('records enumerated before standalone bounds');
});

for (const [fault, expression, refusal] of [
  ['malformed', `['not-a-migration']`, 'raw migration name differs'],
  ['161-byte', `['20261101000000_'+'a'.repeat(146)]`, 'raw migration name differs'],
  ['large', `['a'.repeat(65537)]`, 'raw migration name differs'],
  ['4097-name', `Array(4097).fill('20261101000000_owned')`, 'roster malformed'],
] as const) {
  test(`standalone backup ${fault} names refuse before raw I/O`, async () => {
    const fixture = await initialHandoffFixture('plan');
    const observed = await runPrerequisite(
      fixture,
      `request.selected[0].backup.migrations=${expression};request.edgeState+='/MISSING_RAW_IO_SENTINEL';captureInitialHandoffArtifacts(request,deadline);`,
    );
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain(refusal);
    expect(observed.stderr).not.toContain('ENOENT');
  });
}
for (const [label, name] of [
  ['ordinary', '20261101000000_owned'],
  ['160-byte', '20261101000000_' + 'a'.repeat(145)],
] as const) {
  test(`standalone backup ${label} name passes admission and reaches real downstream I/O`, async () => {
    const fixture = await initialHandoffFixture('plan');
    const observed = await runPrerequisite(
      fixture,
      `request.selected[0].backup.migrations=[${JSON.stringify(name)}];request.edgeState+='/MISSING_RAW_IO_SENTINEL';captureInitialHandoffArtifacts(request,deadline);`,
    );
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('ENOENT');
    expect(observed.stderr).toContain('MISSING_RAW_IO_SENTINEL');
    expect(observed.stderr).not.toContain('raw migration name differs');
  });
}

test('healthy-deadline post-close methods refuse before acquiring descriptors', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    `const o=captureInitialHandoffArtifacts(request,deadline);o.closeFiles();o.closeFiles();const before=readdirSync('/proc/self/fd').length;
for(const method of ['verifyClosure','assertStable']){if(performance.now()>=deadline)throw Error('test deadline expired');let refusal;try{o[method]();}catch(e){refusal=e;}if(!(refusal instanceof Error)||refusal.message!=='initial handoff observation already closed')throw Error('wrong post-close refusal: '+String(refusal));if(readdirSync('/proc/self/fd').length!==before)throw Error('post-close descriptor acquired');}`,
  );
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
});

const boundaryProgram = String.raw`
const {createHash}=await import('node:crypto');
const digest=(contents)=>createHash('sha256').update(contents).digest('hex');
const originals=plan.records.map(entry=>({entry,sha256:digest(entry.contents)}));
const originalPolicyHash=digest(plan.policyContents);
function padSerialized(contents,bytes){
  if(!contents.endsWith('\n'))throw Error('authored LF absent');
  const missing=bytes-Buffer.byteLength(contents);
  if(missing<0)throw Error('authored document exceeds requested size');
  return contents.slice(0,-1)+' '.repeat(missing)+'\n';
}
function sourceAtBytes(contents,bytes){
  const manifest=JSON.parse(contents);manifest.entries=[];
  let parent='';
  for(let depth=0;depth<15;depth++){parent+=(parent?'/' :'')+'p'.repeat(200);manifest.entries.push({root:'source',path:parent,kind:'directory',mode:493});}
  const stem=parent+'/';const minimum=stem.length+6;const maximum=stem.length+255;
  const base=Buffer.byteLength(JSON.stringify(manifest)+'\n');
  const rowBytes=Buffer.byteLength(JSON.stringify({root:'source',path:'',kind:'directory',mode:493}));
  const count=Math.ceil((bytes-base)/(rowBytes+maximum+1));
  let remaining=bytes-base-count*(rowBytes+1);
  for(let index=0;index<count;index++){
    const length=Math.min(maximum,remaining-(count-index-1)*minimum);
    if(length<minimum)throw Error('canonical source length cannot be authored');
    const path=stem+String(index).padStart(6,'0')+'a'.repeat(length-minimum);
    if(path.split('/').some(segment=>Buffer.byteLength(segment)>255))throw Error('owned declaration component exceeds ordinary filesystem spelling');
    manifest.entries.push({root:'source',path,kind:'directory',mode:493});remaining-=length;
  }
  const encoded=JSON.stringify(manifest)+'\n';
  if(remaining!==0||Buffer.byteLength(encoded)!==bytes)throw Error('canonical source byte roster differs');
  return encoded;
}
function repairBindings(substitutions=[]){
  for(const {entry,sha256} of originals){
    for(const [before,after] of substitutions)entry.contents=entry.contents.replaceAll(before,after);
    const observed=digest(entry.contents);if(observed!==sha256)substitutions.push([sha256,observed]);
  }
  for(const [before,after] of substitutions)plan.policyContents=plan.policyContents.replaceAll(before,after);
  const root=plan.records.find(entry=>entry.name===plan.handoff.name);if(!root)throw Error('authored root absent');plan.handoff.sha256=digest(root.contents);
  substitutions.push([originalPolicyHash,digest(plan.policyContents)]);
  for(const key of ['preparedPointerContents','completePointerContents'])for(const [before,after] of substitutions)plan[key]=plan[key].replaceAll(before,after);
}
`;
const serializedBoundaries = [
  { kind: 'envelope', maximum: 65536, outcome: 'valid' },
  { kind: 'writers', maximum: 262144, outcome: 'valid' },
  { kind: 'writers-multibyte', maximum: 262144, outcome: 'valid' },
  { kind: 'source', maximum: 67108864, outcome: 'valid' },
  { kind: 'migration', maximum: 4194304, outcome: 'canonical-refusal' },
  { kind: 'capture', maximum: 4194304, outcome: 'valid' },
  { kind: 'policy', maximum: 4096, outcome: 'valid' },
  { kind: 'prepared', maximum: 4096, outcome: 'valid' },
  { kind: 'complete', maximum: 4096, outcome: 'valid' },
  { kind: 'request-writers', maximum: 262144, outcome: 'io-reach' },
  { kind: 'request-source', maximum: 67108864, outcome: 'io-reach' },
] as const;
for (const boundary of serializedBoundaries) {
  for (const delta of [0, 1]) {
    test(`LF-inclusive public ${boundary.kind} byte boundary ${delta === 0 ? 'limit' : 'limit+1'} (${boundary.outcome})`, async () => {
      const fixture = await initialHandoffFixture('plan');
      const observed = await runPrerequisite(
        fixture,
        boundaryProgram +
          String.raw`
const boundary=${JSON.stringify(boundary)};const target=boundary.maximum+${String(delta)};
let contents;const substitutions=[];
if(boundary.kind==='envelope'){
  const entry=plan.records.find(entry=>entry.name===plan.handoff.name);entry.contents=padSerialized(entry.contents,target);contents=entry.contents;
}else if(boundary.kind==='writers'||boundary.kind==='writers-multibyte'){
  const before=digest(plan.manifests.writers.contents);let authored=plan.manifests.writers.contents;
  if(boundary.kind==='writers-multibyte'){const writer=JSON.parse(authored);writer.members[0].hostPath+='/é';authored=JSON.stringify(writer)+'\n';}
  plan.manifests.writers.contents=padSerialized(authored,target);contents=plan.manifests.writers.contents;substitutions.push([before,digest(contents)]);
}else if(boundary.kind==='source'){
  const before=digest(plan.manifests.source.contents);plan.manifests.source.contents=sourceAtBytes(plan.manifests.source.contents,target);contents=plan.manifests.source.contents;substitutions.push([before,digest(contents)]);
}else if(boundary.kind==='migration'){
  const before=digest(plan.artifacts.migrationManifestContents);plan.artifacts.migrationManifestContents=padSerialized(plan.artifacts.migrationManifestContents,target);contents=plan.artifacts.migrationManifestContents;substitutions.push([before,digest(contents)]);
}else if(boundary.kind==='capture'){
  const capture=plan.artifacts.selected[0];const before=digest(capture.captureContents);capture.captureContents=padSerialized(capture.captureContents,target);contents=capture.captureContents;substitutions.push([before,digest(contents)]);
}else if(boundary.kind==='request-writers'){
  contents=padSerialized(request.activation.authorities.writerManifestContents,target);request.activation.authorities.writerManifestContents=contents;request.activation.authorities.pins.writerManifestSha256=digest(contents);
}else if(boundary.kind==='request-source'){
  contents=sourceAtBytes(request.activation.source.manifestContents,target);request.activation.source.manifestContents=contents;request.activation.source.pins.manifestSha256=digest(contents);
}else{
  const key=boundary.kind==='policy'?'policyContents':boundary.kind==='prepared'?'preparedPointerContents':'completePointerContents';plan[key]=padSerialized(plan[key],target);contents=plan[key];
}
if(Buffer.byteLength(contents)!==target||!contents.endsWith('\n'))throw Error('LF-inclusive byte fault not delivered');
if(boundary.kind==='writers-multibyte'&&Buffer.byteLength(contents)===contents.length)throw Error('multibyte fault absent');
repairBindings(substitutions);
const parse=JSON.parse;let migrationParsed=false;JSON.parse=function(value,...options){if(value===contents&&boundary.kind==='migration')migrationParsed=true;return parse(value,...options);};
try{
  let refusal;try{if(boundary.outcome==='io-reach'){request.edgeState+='/MISSING_BYTE_BOUNDARY_IO_SENTINEL';captureInitialHandoffArtifacts(request,deadline);}else validateInitialHandoffPlan(plan,deadline);}catch(cause){refusal=cause;}
  if(${String(delta)}===1){if(!(refusal instanceof Error)||!refusal.message.includes('content UTF-8 or byte bound differs'))throw Error('wrong limit+1 refusal: '+String(refusal));if(migrationParsed)throw Error('over-limit migration parsed');}
  else if(boundary.outcome==='valid'){if(refusal!==undefined)throw refusal;}
  else if(boundary.outcome==='canonical-refusal'){if(!migrationParsed||!(refusal instanceof Error)||refusal.message!=='migration artifact schema or binding differs')throw Error('migration byte gate/codec not reached: '+String(refusal));}
  else if(!(refusal instanceof Error)||!String(refusal).includes('ENOENT')||!String(refusal).includes('MISSING_BYTE_BOUNDARY_IO_SENTINEL'))throw Error('raw byte gate did not reach real I/O: '+String(refusal));
  console.log('SERIALIZED_BOUNDARY:'+JSON.stringify({kind:boundary.kind,bytes:target,lf:true,multibyte:boundary.kind==='writers-multibyte',outcome:${String(delta)}===1?'byte-refusal':boundary.outcome}));
}finally{JSON.parse=parse;}
`,
      );
      expect(observed.stderr).toBe('');
      expect(observed.code).toBe(0);
      expect(observed.stdout).toContain(`"bytes":${String(boundary.maximum + delta)}`);
      expect(observed.stdout).toContain('"lf":true');
      process.stderr.write(observed.stdout.replace('ACCEPTED\n', ''));
    });
  }
}

test('plan refuses reachable non-predecessor admission with repaired enclosing hashes', async () => {
  const fixture = await initialHandoffFixture('plan');
  const observed = await runPrerequisite(
    fixture,
    boundaryProgram +
      String.raw`const admission=plan.records.find(entry=>entry.name.endsWith('-handoff-admission.json'));const previous=admission.name;admission.name='edge-owner-000028-handoff-admission.json';for(const entry of plan.records)entry.contents=entry.contents.replaceAll(previous,admission.name);repairBindings();validateInitialHandoffPlan(plan,deadline);`,
  );
  expect(observed.code).toBe(1);
  expect(observed.stderr).toContain('predecessor order differs');
  expect(observed.stderr).not.toContain('reference hash differs');
  expect(observed.stderr).not.toContain('planned reference absent');
});

const pairedSemanticFaults = [
  ['missing-admission-field', 'unknown or missing fields'],
  ['admission-v1', 'record format differs'],
  ['source-pin', 'initial selected source'],
  ['owner-newline', 'original owner bytes differ'],
  ['reference-family', 'reference family differs'],
  ['conflicting-reference', 'reference binding conflicts'],
  ['activation-order', 'activation roster differs'],
  ['missing-activation', 'initial selected committed roster'],
  ['invented-activation', 'initial selected committed roster'],
  ['database-binding', 'selected database/capture binding differs'],
  ['capture-link', 'initial selected raw capture reference'],
  ['participant-link', 'initial activation selected participants'],
  ['ingress-projection', 'initial exposure route projections differ'],
  ['source-local-attempt', 'archived source attribution differs'],
  ['backend-local-attempt', 'archived managed intent binding differs'],
  ['gateway-local-attempt', 'archived managed intent binding differs'],
] as const;
for (const [fault, refusal] of pairedSemanticFaults) {
  test(`paired intended semantic refusal ${fault} after repairing enclosing hashes`, async () => {
    const activate =
      fault === 'activation-order' || fault === 'missing-activation'
        ? (['prod', 'dev'] as const)
        : (['prod'] as const);
    const fixture = await initialHandoffFixture('H8', undefined, undefined, { activate });
    const observed = await runPrerequisite(
      fixture,
      boundaryProgram +
        String.raw`
const fault=${JSON.stringify(fault)};const expected=${JSON.stringify(refusal)};
function mutateRecord(label,change){const entry=plan.records.find(entry=>entry.name.endsWith('-'+label+'.json'));if(!entry)throw Error('authored mutation target absent');const envelope=JSON.parse(entry.contents);change(envelope);entry.contents=JSON.stringify(envelope)+'\n';}
const fenceOriginals=plan.fences.map(({name,snapshot})=>({name,snapshot,sha256:digest(snapshot.contents)}));
const findFence=(name)=>{const entry=plan.fences.find(entry=>entry.name===name);if(!entry)throw Error('authored original fence absent');return entry.snapshot;};
const sourceIntent=findFence('dependency-source-dev-intent.json');const sourceComplete=findFence('dependency-source-dev-complete.json');
const originalSourceProjection=digest(JSON.stringify([sourceIntent.contents,sourceComplete.contents]));
if(fault==='missing-admission-field')mutateRecord('handoff-admission',envelope=>{delete envelope.record.prod;});
if(fault==='admission-v1')mutateRecord('handoff-admission',envelope=>{envelope.record.version=1;});
if(fault==='source-pin')mutateRecord('handoff-admission',envelope=>{envelope.record.source.pins.runtimeImageId='sha256:'+'f'.repeat(64);});
if(fault==='owner-newline')mutateRecord('activation-capture',envelope=>{envelope.owner=envelope.owner.trimEnd();});
if(fault==='reference-family')mutateRecord('handoff-intent',envelope=>{envelope.record.admission.name='edge-owner-000023-exposure-intent.json';});
if(fault==='conflicting-reference')mutateRecord('activation-participants-restored',envelope=>{envelope.record.ready[1]={...envelope.record.ready[0],sha256:'f'.repeat(64)};});
if(fault==='activation-order')mutateRecord('handoff-intent',envelope=>{envelope.record.activations.reverse();});
if(fault==='missing-activation')mutateRecord('handoff-intent',envelope=>{envelope.record.activations.pop();});
if(fault==='invented-activation')mutateRecord('handoff-intent',envelope=>{envelope.record.activations.push({...envelope.record.activations[0],environment:'dev'});});
if(fault==='database-binding')mutateRecord('activation-participants',envelope=>{envelope.record.databases[0].host+='.foreign';});
if(fault==='capture-link')mutateRecord('activation-intent',envelope=>{envelope.record.capture.sha256='f'.repeat(64);});
if(fault==='participant-link')mutateRecord('activation-intent',envelope=>{envelope.record.participantRecord.sha256='f'.repeat(64);});
if(fault==='ingress-projection')mutateRecord('exposure-complete',envelope=>{envelope.record.selectedRoutesSha256='f'.repeat(64);});
if(fault==='source-local-attempt'){
  const original=digest(JSON.stringify(JSON.parse(sourceIntent.contents)));const fields=JSON.parse(sourceIntent.contents);fields.attempt='not-a-uuid';sourceIntent.contents=JSON.stringify(fields)+'\n';
  sourceComplete.contents=sourceComplete.contents.replaceAll(original,digest(JSON.stringify(fields)));
}
if(fault==='backend-local-attempt'||fault==='gateway-local-attempt'){
  const role=fault==='backend-local-attempt'?'backend':'gateway';const snapshot=findFence('dependency-'+role+'-complete.json');const fields=JSON.parse(snapshot.contents);fields.attempt='12345678-1234-4123-8123-000000000000';snapshot.contents=JSON.stringify(fields)+'\n';
}
const substitutions=[];
for(const name of ['dependency-source-dev-intent.json','dependency-source-dev-complete.json','dependency-gateway-fence.json','dependency-gateway-intent.json','dependency-gateway-complete.json','dependency-backend-fence.json','dependency-backend-intent.json','dependency-backend-complete.json']){
  const original=fenceOriginals.find(entry=>entry.name===name);for(const [before,after]of substitutions)original.snapshot.contents=original.snapshot.contents.replaceAll(before,after);
  const observed=digest(original.snapshot.contents);if(observed!==original.sha256)substitutions.push([original.sha256,observed]);
}
const sourceProjection=digest(JSON.stringify([sourceIntent.contents,sourceComplete.contents]));if(sourceProjection!==originalSourceProjection)substitutions.push([originalSourceProjection,sourceProjection]);
repairBindings(substitutions);
let pure;try{validateInitialHandoffPlan(plan,deadline);}catch(cause){pure=cause;}if(!(pure instanceof Error)||!pure.message.includes(expected))throw Error('wrong pure semantic boundary: '+String(pure));
for(const entry of plan.records)writeFileSync(request.edgeState+'/'+entry.name,entry.contents,{mode:384});
writeFileSync(request.edgeState+'/edge-policy.json',plan.policyContents,{mode:384});writeFileSync(request.edgeState+'/edge-owner.json',plan.completePointerContents,{mode:384});
const retirements=JSON.parse(plan.records.find(entry=>entry.name.endsWith('-handoff-intent.json')).contents).record.fences;
for(const original of plan.fences){const retired=retirements.find(entry=>entry.environment===original.environment&&entry.name===original.name);const directory=original.snapshot.path.slice(0,original.snapshot.path.lastIndexOf('/')+1);writeFileSync(directory+retired.archive.name,original.snapshot.contents,{mode:384});}
let disk;try{const graph=await captureInitialHandoff(await captureEdgePolicy(request.edgeState),deadline);graph.closeFiles();}catch(cause){disk=cause;}if(!(disk instanceof Error)||!disk.message.includes(expected))throw Error('wrong disk semantic boundary: '+String(disk));
console.log('PAIRED_SEMANTIC_REFUSAL:'+JSON.stringify({fault,pure:pure.message,disk:disk.message}));
`,
    );
    expect(observed.stderr).toBe('');
    expect(observed.code).toBe(0);
    expect(observed.stdout).toContain('PAIRED_SEMANTIC_REFUSAL:');
    expect(observed.stdout).toContain(`"fault":"${fault}"`);
    process.stderr.write(observed.stdout.replace('ACCEPTED\n', ''));
  });
}

const closeSettlementExecutable = process.execPath;

interface CloseSettlementOutput {
  readonly bytes: number;
  readonly sha256: string;
  readonly base64: string;
  readonly overflow: boolean;
}
interface CloseSettlementReader {
  readonly stream: ReadableStream<Uint8Array>;
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  closed: Promise<void> | undefined;
  settled: Promise<CloseSettlementOutput> | undefined;
  eof: boolean;
  closedKnown: boolean;
  failure: { readonly cause: unknown } | undefined;
}
function spawnCloseSettlement(bundle: string) {
  return Bun.spawn([closeSettlementExecutable, bundle], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
interface CloseSettlementChild {
  readonly child: ReturnType<typeof spawnCloseSettlement>;
  readonly scenario: string;
  readonly helperSHA256: string;
  readonly bundleSHA256: string;
  exit: Promise<number> | undefined;
  referenced: boolean;
  stdout: CloseSettlementReader | undefined;
  stderr: CloseSettlementReader | undefined;
  readonly setupFailures: unknown[];
  outcomes: readonly PromiseSettledResult<number | CloseSettlementOutput>[] | undefined;
  accepted: boolean;
}
interface CleanupClassification {
  readonly stage: string;
  readonly unknown: boolean;
  readonly field: boolean;
  readonly prototype: boolean;
  readonly spread: boolean;
}
interface KnownCloseSettlement {
  readonly scenario: string;
  readonly helperSHA256: string;
  readonly bundleSHA256: string;
  readonly executable: string;
  readonly pid: number;
  readonly exit: number;
  readonly signal: null;
  readonly stdout: CloseSettlementOutput;
  readonly stderr: CloseSettlementOutput;
  readonly native: Readonly<Record<string, unknown>>;
  readonly classifications: readonly CleanupClassification[];
  readonly original: CloseSettlementChild;
}
const closeSettlementOwner: {
  readonly active: CloseSettlementChild[];
  readonly completed: KnownCloseSettlement[];
  readonly failures: unknown[];
  stopped: boolean;
  uncertain: boolean;
  reported: boolean;
  keeper: ReturnType<typeof setInterval> | undefined;
  deadline: number | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  preflightComplete: boolean;
} = {
  active: [],
  completed: [],
  failures: [],
  stopped: false,
  uncertain: false,
  reported: false,
  keeper: undefined,
  deadline: undefined,
  timer: undefined,
  preflightComplete: false,
};

/** Sticky STOP owns actual children/readers; it never signals, replaces or retries an original. */
function stopCloseSettlement(cause: unknown, uncertain: boolean): void {
  closeSettlementOwner.failures.push(cause);
  closeSettlementOwner.stopped = true;
  closeSettlementOwner.uncertain ||= uncertain;
  if (
    (uncertain || closeSettlementOwner.active.length !== 0) &&
    closeSettlementOwner.keeper === undefined
  )
    closeSettlementOwner.keeper = setInterval(() => closeSettlementOwner, 30000);
  if (!closeSettlementOwner.reported) {
    closeSettlementOwner.reported = true;
    try {
      process.stderr.write(
        'UC1 preflight STOP: original helper custody or finite allocation requires review\n',
      );
    } catch (failure) {
      closeSettlementOwner.failures.push(failure);
    }
  }
}
function holdCloseSettlement(): Promise<never> {
  closeSettlementOwner.keeper ??= setInterval(() => closeSettlementOwner, 30000);
  return new Promise<never>(() => undefined);
}

/** One monotonic allocation governs new fixture/build/spawn starts; expiry never cancels current originals. */
function assertCloseSettlementStart(): void {
  assert(hasNativePreflight, 'UC1 native preflight forbidden in ordinary mode');
  const deadline = closeSettlementOwner.deadline;
  assert.notEqual(deadline, undefined, 'UC1 preflight allocation not established');
  if (closeSettlementOwner.stopped || deadline === undefined || performance.now() >= deadline) {
    const cause = new Error('UC1 original preflight start allocation exhausted or stopped');
    stopCloseSettlement(cause, false);
    throw cause;
  }
}

/** Enrolls each original pipe before getReader; failure keeps that same pipe/reader, never a replacement. */
function drainCloseSettlement(stream: ReadableStream<Uint8Array>): CloseSettlementReader {
  const retained: CloseSettlementReader = {
    stream,
    reader: undefined,
    closed: undefined,
    settled: undefined,
    eof: false,
    closedKnown: false,
    failure: undefined,
  };
  return retained;
}
function startCloseSettlementReader(retained: CloseSettlementReader): void {
  try {
    const reader = retained.stream.getReader();
    retained.reader = reader;
    retained.closed = reader.closed;
    const closing = reader.closed.then(
      () => {
        retained.closedKnown = true;
      },
      (cause: unknown) => {
        retained.failure = { cause };
        stopCloseSettlement(cause, true);
      },
    );
    retained.settled = (async () => {
      const digest = createHash('sha256');
      const chunks: Buffer[] = [];
      let bytes = 0;
      let kept = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) {
            retained.eof = true;
            break;
          }
          digest.update(chunk.value);
          bytes += chunk.value.byteLength;
          const count = Math.min(chunk.value.byteLength, 65536 - kept);
          if (count > 0) chunks.push(Buffer.from(chunk.value.subarray(0, count)));
          kept += count;
          if (bytes > 65536 && !closeSettlementOwner.uncertain)
            stopCloseSettlement(new Error('UC1 original helper output overflow'), true);
        }
        await closing;
        if (retained.failure !== undefined) throw retained.failure.cause;
        return Object.freeze({
          bytes,
          sha256: digest.digest('hex'),
          base64: Buffer.concat(chunks).toString('base64'),
          overflow: bytes > 65536,
        });
      } catch (cause) {
        retained.failure = { cause };
        stopCloseSettlement(cause, true);
        throw cause;
      }
    })();
    // Keep the original rejected task handled while the other original reader is being enrolled.
    void retained.settled.catch(() => undefined);
  } catch (cause) {
    retained.failure = { cause };
    stopCloseSettlement(cause, true);
  }
}

/** Closed protocol validation retains actual observations; expectations remain in the timed callbacks. */
function readCloseFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'UC1 protocol object absent',
  );
  const fields = value as Record<string, unknown>;
  assert.deepEqual(Object.keys(fields).sort(), [...keys].sort(), 'UC1 protocol fields differ');
  return fields;
}
function readCloseClassifications(
  value: unknown,
  stages: readonly string[],
): readonly CleanupClassification[] {
  assert(Array.isArray(value), 'UC1 classification roster absent');
  assert.equal(value.length, stages.length, 'UC1 classification stage count differs');
  return Object.freeze(
    value.map((entry: unknown, index) => {
      const fields = readCloseFields(entry, ['stage', 'unknown', 'field', 'prototype', 'spread']);
      assert.equal(fields['stage'], stages[index], 'UC1 classification stage differs');
      for (const key of ['unknown', 'field', 'prototype', 'spread'])
        assert.equal(typeof fields[key], 'boolean', 'UC1 classification is not boolean');
      // This test boundary checked every field before retaining the original parsed boolean record.
      return Object.freeze(fields) as unknown as CleanupClassification;
    }),
  );
}
function readCloseNative(value: unknown): Readonly<Record<string, unknown>> {
  const fields = readCloseFields(value, ['status', 'resources', 'streams', 'callers']);
  assert.equal(fields['status'], 'known', 'UC1 native retirement unknown');
  const generations = new Set<number>();
  for (const key of ['resources', 'streams', 'callers']) {
    const roster = fields[key];
    assert(Array.isArray(roster), 'UC1 native original roster absent');
    if (key === 'callers') assert.equal(roster.length, 1, 'UC1 original caller count differs');
    if (key === 'resources') assert(roster.length > 0, 'UC1 graph original roster absent');
    for (const original of roster) {
      const entry = readCloseFields(original, [
        'generation',
        'kind',
        'descriptor',
        'identity',
        'attempts',
        'nativeEntries',
        'native',
        'closeOrigin',
      ]);
      const generation = entry['generation'];
      assert(
        typeof generation === 'number' &&
          Number.isSafeInteger(generation) &&
          generation > 0 &&
          !generations.has(generation),
        'UC1 original generation differs',
      );
      generations.add(generation);
      assert.equal(entry['native'], 'returned', 'UC1 original native close not known returned');
      assert.equal(entry['nativeEntries'], 1, 'UC1 original native close entry count differs');
      assert(
        ['production', 'fixture'].includes(String(entry['closeOrigin'])),
        'UC1 original native close origin differs',
      );
      const attempts = entry['attempts'];
      assert(
        typeof attempts === 'number' &&
          Number.isSafeInteger(attempts) &&
          attempts >= 0 &&
          attempts <= 1,
        'UC1 original production close retried',
      );
      assert.equal(
        entry['kind'],
        key === 'streams' ? 'stream' : key === 'callers' ? 'caller' : 'descriptor',
        'UC1 original kind differs',
      );
      if (key === 'streams') {
        assert.equal(entry['descriptor'], null, 'UC1 Dir acquired a fabricated descriptor');
        assert.equal(entry['identity'], 'original-dir-object', 'UC1 original Dir identity absent');
      } else {
        assert(
          typeof entry['descriptor'] === 'number' &&
            Number.isInteger(entry['descriptor']) &&
            entry['descriptor'] >= 0,
          'UC1 descriptor absent',
        );
        const identity = readCloseFields(entry['identity'], ['device', 'inode', 'directory']);
        for (const part of ['device', 'inode'])
          assert(
            typeof identity[part] === 'string' && /^(0|[1-9][0-9]*)$/.test(identity[part]),
            'UC1 descriptor identity absent',
          );
        assert.equal(typeof identity['directory'], 'boolean', 'UC1 descriptor kind absent');
        Object.freeze(identity);
      }
      Object.freeze(entry);
    }
    Object.freeze(roster);
  }
  return Object.freeze(fields);
}

/** Emits original exit/read outcomes without turning process exit into original-close evidence. */
function reportCloseSettlement(retained: CloseSettlementChild): void {
  process.stderr.write(
    'CLOSE_HELPER_DIAGNOSTIC:' +
      JSON.stringify({
        pid: retained.child.pid,
        scenario: retained.scenario,
        originalExecutableBase64: Buffer.from(closeSettlementExecutable).toString('base64'),
        helperSHA256: retained.helperSHA256,
        bundleSHA256: retained.bundleSHA256,
        outcomes: retained.outcomes,
      }) +
      '\n',
  );
}

/** Final verification only; admitted preflight owns and joins originals before this hook is registered. */
afterAll(async () => {
  if (closeSettlementOwner.active.length !== 0 || closeSettlementOwner.uncertain) {
    stopCloseSettlement(new Error('UC1 original helper remains owned at final verification'), true);
    await holdCloseSettlement();
  }
  if (closeSettlementOwner.stopped)
    throw new AggregateError(closeSettlementOwner.failures, 'UC1 original preflight stopped');
});

/** Recognizes only a frozen helper assertion heading bound to its actual scenario. */
function readCloseIdentityRefusal(stderr: string, scenario: string): string | undefined {
  const headings = stderr
    .split('\n')
    .map((line) => line.trimStart())
    .filter((line) => /^(?:[A-Za-z]*Error|error):/.test(line));
  if (headings.length !== 1) return undefined;
  const heading = headings.at(0);
  for (const [label, scenarios] of closeIdentityRefusals) {
    if (heading === 'error: ' + label && scenarios.includes(scenario)) return label;
  }
  return undefined;
}

const closeIdentityRefusals: readonly (readonly [string, readonly string[]])[] = [
  [
    'UC1_IDENTITY_CONSTRUCTOR_MINTED',
    [
      'raw-read',
      'disk-construction',
      'verify',
      'stream',
      'file-before',
      'file-after',
      'parent-before',
      'parent-after',
      'disk-final',
      'expired-final',
      'verify-expiry',
    ],
  ],
  ['UC1_IDENTITY_REVOKED_UNBRANDED', ['verify', 'stream', 'verify-expiry']],
  [
    'UC1_IDENTITY_FAILED_UNBRANDED',
    [
      'verify',
      'stream',
      'file-before',
      'file-after',
      'parent-before',
      'parent-after',
      'disk-final',
      'expired-final',
      'verify-expiry',
    ],
  ],
  ['UC1_IDENTITY_RETAIN_ARGUMENT_PRIORITY', ['disk-final']],
  ['UC1_IDENTITY_REVOKED_LIVE:verifyClosure', ['verify', 'stream', 'verify-expiry']],
  ['UC1_IDENTITY_REVOKED_EXPIRED:verifyClosure', ['verify-expiry']],
  [
    'UC1_IDENTITY_FAILED_LIVE:verifyClosure',
    [
      'verify',
      'stream',
      'file-before',
      'file-after',
      'parent-before',
      'parent-after',
      'disk-final',
    ],
  ],
  [
    'UC1_IDENTITY_FAILED_EXPIRED:verifyClosure',
    [
      'verify',
      'stream',
      'file-before',
      'file-after',
      'parent-before',
      'parent-after',
      'disk-final',
      'expired-final',
      'verify-expiry',
    ],
  ],
  ['UC1_IDENTITY_REVOKED_LIVE:assertStable', ['verify', 'stream', 'verify-expiry']],
  ['UC1_IDENTITY_REVOKED_EXPIRED:assertStable', ['verify-expiry']],
  [
    'UC1_IDENTITY_FAILED_LIVE:assertStable',
    [
      'verify',
      'stream',
      'file-before',
      'file-after',
      'parent-before',
      'parent-after',
      'disk-final',
    ],
  ],
  [
    'UC1_IDENTITY_FAILED_EXPIRED:assertStable',
    [
      'verify',
      'stream',
      'file-before',
      'file-after',
      'parent-before',
      'parent-after',
      'disk-final',
      'expired-final',
      'verify-expiry',
    ],
  ],
];

/** Enrolls the actual process before any fallible reader/ref/exit setup and publishes only known joined observations. */
async function runCloseSettlement(
  scenario: string,
  fixture: Awaited<ReturnType<typeof initialHandoffFixture>>,
  classify = false,
  stages: readonly string[] = [],
): Promise<KnownCloseSettlement> {
  assertCloseSettlementStart();
  const seam = fixture.root + '/close-dependency.ts';
  const entry = fixture.root + '/close-settlement.ts';
  const bundle = fixture.root + '/close-settlement.js';
  await writeFile(seam, closeDependencyProgram);
  await writeFile(
    entry,
    `import {captureInitialHandoffArtifacts,captureInitialHandoff,isInitialHandoffCleanupUnknown} from ${JSON.stringify(resolve(import.meta.dir, 'initial-handoff-graph.ts'))};
import {captureEdgePolicy} from ${JSON.stringify(resolve(import.meta.dir, 'edge-policy.ts'))};
import * as fs from 'node:fs';
import {custody,openCaller,retireFixture,holdUnknown} from ${JSON.stringify(seam)};
const request=${JSON.stringify(fixture.artifactRequest)};
const scenario=${JSON.stringify(scenario)};
const classify=${String(classify)};
const originalExecutable=${JSON.stringify(closeSettlementExecutable)};
if(process.execPath!==originalExecutable)throw Error('owned helper executable identity changed');
console.log('CLOSE_EXECUTABLE:'+JSON.stringify({parent:originalExecutable,child:process.execPath}));
const deadline=performance.now()+120000;
${closeSettlementProgram}`,
  );
  assertCloseSettlementStart();
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'bun',
    plugins: [
      initialHandoffLayout(fixture.root, fixture.layouts),
      {
        name: 'owned-graph-close-dependency',
        setup(build) {
          build.onLoad({ filter: /\/initial-handoff-graph\.ts$/ }, async (source) => {
            const contents = await readFile(source.path, 'utf8');
            const filesystem = "from 'node:fs';";
            const directoryFile = "from './directory-file';";
            if (
              contents.split(filesystem).length !== 2 ||
              contents.split(directoryFile).length !== 2
            )
              throw new Error('graph original filesystem dependencies changed');
            return {
              contents: contents
                .replace(filesystem, 'from ' + JSON.stringify(seam) + ';')
                .replace(directoryFile, 'from ' + JSON.stringify(seam) + ';'),
              loader: 'ts',
            };
          });
        },
      },
    ],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('owned close settlement compilation failed', { cause: built.logs });
  const output = built.outputs.at(0);
  if (output === undefined) throw new Error('owned close settlement bundle absent');
  await Bun.write(bundle, output);
  const helperSHA256 = createHash('sha256').update(closeDependencyProgram).digest('hex');
  const bundleSHA256 = createHash('sha256')
    .update(new Uint8Array(await Bun.file(bundle).arrayBuffer()))
    .digest('hex');
  assertCloseSettlementStart();
  const child = spawnCloseSettlement(bundle);
  const retained: CloseSettlementChild = {
    child,
    scenario,
    helperSHA256,
    bundleSHA256,
    exit: undefined,
    referenced: false,
    stdout: undefined,
    stderr: undefined,
    setupFailures: [],
    outcomes: undefined,
    accepted: false,
  };
  closeSettlementOwner.active.push(retained);
  try {
    child.ref();
    retained.referenced = true;
  } catch (cause) {
    retained.setupFailures.push(cause);
    stopCloseSettlement(cause, true);
  }
  try {
    retained.exit = child.exited;
  } catch (cause) {
    retained.setupFailures.push(cause);
    stopCloseSettlement(cause, true);
  }
  try {
    retained.stdout = drainCloseSettlement(child.stdout);
    startCloseSettlementReader(retained.stdout);
  } catch (cause) {
    retained.setupFailures.push(cause);
    stopCloseSettlement(cause, true);
  }
  try {
    retained.stderr = drainCloseSettlement(child.stderr);
    startCloseSettlementReader(retained.stderr);
  } catch (cause) {
    retained.setupFailures.push(cause);
    stopCloseSettlement(cause, true);
  }
  const exit = retained.exit;
  const stdout = retained.stdout;
  const stderr = retained.stderr;
  if (
    exit === undefined ||
    stdout?.settled === undefined ||
    stderr?.settled === undefined ||
    retained.setupFailures.length !== 0
  ) {
    stopCloseSettlement(new Error('UC1 original reader/exit setup unknown'), true);
    return holdCloseSettlement();
  }
  retained.outcomes = await Promise.allSettled([exit, stdout.settled, stderr.settled]);
  try {
    reportCloseSettlement(retained);
  } catch (cause) {
    stopCloseSettlement(cause, true);
    return holdCloseSettlement();
  }
  const termination = retained.outcomes[0];
  const out = retained.outcomes[1];
  const err = retained.outcomes[2];
  if (
    termination.status !== 'fulfilled' ||
    out.status !== 'fulfilled' ||
    err.status !== 'fulfilled' ||
    typeof termination.value !== 'number' ||
    typeof out.value === 'number' ||
    typeof err.value === 'number' ||
    !stdout.eof ||
    !stdout.closedKnown ||
    !stderr.eof ||
    !stderr.closedKnown ||
    stdout.failure !== undefined ||
    stderr.failure !== undefined ||
    out.value.overflow ||
    err.value.overflow
  ) {
    stopCloseSettlement(new Error('UC1 original process or stream outcome unknown'), true);
    return holdCloseSettlement();
  }
  const text = Buffer.from(out.value.base64, 'base64').toString('utf8');
  let native: Readonly<Record<string, unknown>>;
  let classifications: readonly CleanupClassification[];
  let isKnownInfrastructureRefusal = false;
  let targetedRefusal: Error | undefined;
  try {
    const lines = text.split('\n');
    assert.equal(lines.at(-1), '', 'UC1 transcript final LF absent');
    assert.equal(
      lines[0],
      'CLOSE_EXECUTABLE:' +
        JSON.stringify({ parent: closeSettlementExecutable, child: closeSettlementExecutable }),
      'UC1 helper executable frame differs',
    );
    const nativeLine = lines.at(1);
    assert(
      typeof nativeLine === 'string' && nativeLine.startsWith('FIXTURE_NATIVE:'),
      'UC1 native accounting frame absent',
    );
    native = readCloseNative(JSON.parse(nativeLine.slice('FIXTURE_NATIVE:'.length)));
    assert.equal(lines[2], 'FIXTURE_CLEANUP:KNOWN', 'UC1 fixture retirement unproven');
    assert(
      Number.isInteger(termination.value) && termination.value >= 0 && termination.value <= 255,
      'UC1 original helper exit status absent',
    );
    assert.equal(
      retained.child.exitCode,
      termination.value,
      'UC1 original helper exit status differs',
    );
    assert.equal(retained.child.signalCode, null, 'UC1 original helper terminated by signal');
    const assertionLabel = readCloseIdentityRefusal(
      Buffer.from(err.value.base64, 'base64').toString('utf8'),
      scenario,
    );
    if (
      classify &&
      !closeSettlementOwner.stopped &&
      !closeSettlementOwner.uncertain &&
      termination.value === 1 &&
      retained.child.exitCode === 1 &&
      err.value.bytes > 0 &&
      lines.length === 4 &&
      assertionLabel !== undefined
    ) {
      const index = closeSettlementOwner.active.indexOf(retained);
      assert(index >= 0, 'UC1 rejected original absent at known retirement');
      const cause = new Error('UC1 known-closed targeted identity refusal: ' + assertionLabel);
      closeSettlementOwner.failures.push(
        Object.freeze({
          cause,
          assertionLabel,
          original: retained,
          stdout,
          stderr,
          outcomes: retained.outcomes,
          native,
          stdoutOutput: out.value,
          stderrOutput: err.value,
        }),
      );
      closeSettlementOwner.active.splice(index, 1);
      closeSettlementOwner.stopped = true;
      targetedRefusal = cause;
      throw cause;
    }

    if (termination.value !== 0 || retained.child.exitCode !== 0 || err.value.bytes !== 0) {
      const cause = new Error('UC1 helper infrastructure refusal after known fixture retirement');
      const index = closeSettlementOwner.active.indexOf(retained);
      assert(index >= 0, 'UC1 refused original absent at known retirement');
      closeSettlementOwner.failures.push(
        Object.freeze({
          cause,
          original: retained,
          stdout,
          stderr,
          outcomes: retained.outcomes,
          native,
          stdoutOutput: out.value,
          stderrOutput: err.value,
        }),
      );
      closeSettlementOwner.active.splice(index, 1);
      isKnownInfrastructureRefusal = true;
      stopCloseSettlement(cause, false);
      throw cause;
    }
    const identityLine = classify ? lines.at(3) : undefined;
    if (classify) {
      assert(
        typeof identityLine === 'string' && identityLine.startsWith('CLEANUP_IDENTITY:'),
        'UC1 classification frame absent',
      );
      classifications = readCloseClassifications(
        JSON.parse(identityLine.slice('CLEANUP_IDENTITY:'.length)),
        stages,
      );
    } else classifications = Object.freeze([]);
    const expected =
      lines[0] +
      '\n' +
      nativeLine +
      '\nFIXTURE_CLEANUP:KNOWN\n' +
      (identityLine === undefined ? '' : identityLine + '\n') +
      'CLOSE_SETTLEMENT:' +
      scenario +
      '\n';
    assert.equal(text, expected, 'UC1 closed transcript differs');
    assert.equal(
      out.value.sha256,
      createHash('sha256').update(expected).digest('hex'),
      'UC1 closed transcript hash differs',
    );
  } catch (cause) {
    if (targetedRefusal !== undefined && cause === targetedRefusal) throw cause;
    if (isKnownInfrastructureRefusal) throw cause;
    stopCloseSettlement(cause, true);
    return holdCloseSettlement();
  }
  const known = Object.freeze({
    scenario,
    helperSHA256,
    bundleSHA256,
    executable: closeSettlementExecutable,
    pid: retained.child.pid,
    exit: termination.value,
    signal: null,
    stdout: out.value,
    stderr: err.value,
    native,
    classifications,
    original: retained,
  });
  retained.accepted = true;
  closeSettlementOwner.completed.push(known);
  const index = closeSettlementOwner.active.indexOf(retained);
  assert(index >= 0, 'UC1 original parent owner absent at known retirement');
  closeSettlementOwner.active.splice(index, 1);
  if (closeSettlementOwner.uncertain) return holdCloseSettlement();
  assertCloseSettlementStart();
  return known;
}

/** Replaces only the graph's two acquisition dependencies; every native operation uses its original port. */
const closeDependencyProgram = String.raw`
import * as fs from 'node:fs';
import {openDirectoryFile as acquireDirectoryFile} from ${JSON.stringify(resolve(import.meta.dir, 'directory-file.ts'))};
export { constants, realpathSync } from 'node:fs';
export const custody={resources:[],streams:[],callers:[],calls:[],faults:[],failures:[],uncertain:false,keeper:undefined,reported:false,generation:0,armed:false,kind:'',expired:false,primary:new Error('owned primary read failure')};
function recordUnknown(original,cause){custody.uncertain=true;custody.failures.push({original,cause});}
export function holdUnknown(){
  if(custody.keeper===undefined)custody.keeper=setInterval(()=>custody,30000);
  if(!custody.reported){custody.reported=true;try{process.stderr.write('UC1 helper HOLD: original native custody remains unknown\n');}catch(cause){custody.failures.push({diagnostic:cause});}}
  return new Promise(()=>undefined);
}
function enrollDescriptor(descriptor,kind,bucket){
  const retained={generation:++custody.generation,kind,descriptor,identity:{status:'pending'},directory:undefined,attempts:0,delegated:false,native:{status:'not-entered'},nativeEntries:0,closeOrigin:undefined,fault:undefined};
  bucket.push(retained);
  return retained;
}
function captureIdentity(retained,options){
  try{
    const observed=fs.fstatSync(retained.descriptor,...options);
    if(retained.identity.status==='pending'){retained.identity={status:'known',value:observed};retained.directory=observed.isDirectory();}
    return observed;
  }catch(cause){retained.identity={status:'unknown',cause};recordUnknown(retained,cause);throw cause;}
}
function findOriginal(descriptor){
  const retained=custody.resources.findLast(entry=>entry.descriptor===descriptor&&entry.native.status!=='returned');
  if(!retained){const cause=Error('graph operation lacks original acquisition record');recordUnknown({descriptor},cause);throw cause;}
  return retained;
}
export function openSync(...options){const descriptor=fs.openSync(...options);enrollDescriptor(descriptor,'descriptor',custody.resources);return descriptor;}
export function openDirectoryFile(...options){const descriptor=acquireDirectoryFile(...options);enrollDescriptor(descriptor,'descriptor',custody.resources);return descriptor;}
export function openCaller(path){
  const descriptor=fs.openSync(path,fs.constants.O_RDONLY);
  const retained=enrollDescriptor(descriptor,'caller',custody.callers);
  captureIdentity(retained,[{bigint:true}]);return retained;
}
export function fstatSync(descriptor,...options){
  const retained=findOriginal(descriptor);const observed=captureIdentity(retained,options);
  if(custody.armDisk&&!custody.faults.length){retained.fault={after:false,error:custody.armDisk};custody.faults.push(custody.armDisk);}
  return observed;
}
export function lstatSync(path,...options){
  const identity=fs.lstatSync(path,...options);
  if(custody.kind==='transfer'&&custody.armed&&custody.resources.some(entry=>entry.directory&&!entry.delegated))custody.expired=true;
  return identity;
}
export function readSync(descriptor,...options){
  if(custody.kind==='raw-read'&&custody.armed){custody.armed=false;const retained=findOriginal(descriptor);retained.fault={after:false,error:new Error('owned local file close failure')};custody.faults.push(retained.fault.error);throw custody.primary;}
  return fs.readSync(descriptor,...options);
}
function enterNativeClose(retained,close,origin){
  if(retained.native.status!=='not-entered'){const cause=Error('original native close entered twice');recordUnknown(retained,cause);throw cause;}
  retained.native={status:'entered'};retained.nativeEntries++;retained.closeOrigin=origin;
  try{close();retained.native={status:'returned'};retained.delegated=true;}
  catch(cause){retained.native={status:'unknown',cause};recordUnknown(retained,cause);throw cause;}
}
export function closeSync(descriptor){
  const retained=findOriginal(descriptor);retained.attempts++;custody.calls.push(retained);
  if(retained.native.status!=='not-entered'){const cause=Error('original production close repeated');recordUnknown(retained,cause);throw cause;}
  if(custody.kind==='verify'&&custody.armed&&!retained.directory){custody.armed=false;retained.fault={after:true,error:new Error('owned reopened file close failure')};custody.faults.push(retained.fault.error);}
  if(retained.fault&&!retained.fault.after)throw retained.fault.error;
  enterNativeClose(retained,()=>fs.closeSync(descriptor),'production');
  if(retained.fault)throw retained.fault.error;
}
export function opendirSync(...options){
  const directory=fs.opendirSync(...options);
  const retained={generation:++custody.generation,kind:'stream',directory,identity:{status:'pending'},close:undefined,read:undefined,attempts:0,delegated:false,native:{status:'not-entered'},nativeEntries:0,closeOrigin:undefined,fault:undefined};
  custody.streams.push(retained);
  try{
    retained.close=directory.closeSync.bind(directory);retained.read=directory.readSync.bind(directory);
    retained.identity={status:'known',value:directory};
    directory.readSync=function(){if(custody.kind==='stream'&&custody.armed){custody.armed=false;retained.fault=new Error('owned directory stream close failure');custody.faults.push(retained.fault);throw custody.primary;}return retained.read();};
    directory.closeSync=function(){retained.attempts++;if(retained.native.status!=='not-entered'){const cause=Error('original stream production close repeated');recordUnknown(retained,cause);throw cause;}if(retained.fault)throw retained.fault;enterNativeClose(retained,retained.close,'production');};
  }catch(cause){retained.identity={status:'unknown',cause};recordUnknown(retained,cause);throw cause;}
  return directory;
}
function retireOriginal(retained){
  if(retained.identity.status!=='known'){recordUnknown(retained,Error('fixture original identity unknown'));return;}
  if(retained.native.status==='returned')return;
  if(retained.native.status!=='not-entered'){recordUnknown(retained,Error('fixture original native entry unknown; retry refused'));return;}
  if(retained.kind==='stream'){
    if(retained.identity.value!==retained.directory||typeof retained.close!=='function'){recordUnknown(retained,Error('fixture original Dir identity unknown'));return;}
    try{enterNativeClose(retained,retained.close,'fixture');}catch(cause){custody.failures.push({original:retained,retirement:cause});}
    return;
  }
  let closing;
  try{closing=fs.fstatSync(retained.descriptor,{bigint:true});}
  catch(cause){recordUnknown(retained,cause);return;}
  if(closing.dev!==retained.identity.value.dev||closing.ino!==retained.identity.value.ino){recordUnknown(retained,Error('fixture original identity changed; no close authorized'));return;}
  try{enterNativeClose(retained,()=>fs.closeSync(retained.descriptor),'fixture');}
  catch(cause){custody.failures.push({original:retained,retirement:cause});}
}
export function retireFixture(){
  // A record is enrolled before identity work; only actual never-entered originals get a first native close.
  for(const retained of [...custody.streams,...custody.resources,...custody.callers])retireOriginal(retained);
  if(custody.uncertain)return undefined;
  function project(retained){
    if(retained.native.status!=='returned'||retained.nativeEntries!==1||retained.identity.status!=='known'){recordUnknown(retained,Error('fixture original retirement unproven'));return undefined;}
    return {generation:retained.generation,kind:retained.kind,descriptor:retained.kind==='stream'?null:retained.descriptor,identity:retained.kind==='stream'?'original-dir-object':{device:String(retained.identity.value.dev),inode:String(retained.identity.value.ino),directory:retained.directory},attempts:retained.attempts,nativeEntries:retained.nativeEntries,native:retained.native.status,closeOrigin:retained.closeOrigin};
  }
  const native={status:'known',resources:custody.resources.map(project),streams:custody.streams.map(project),callers:custody.callers.map(project)};
  return custody.uncertain?undefined:native;
}
`;

const closeSettlementProgram = String.raw`
const classifications=[];
function recordClassification(stage,failure){
  if(!classify)return;
  require(failure instanceof Error,'classification lacks actual outward error');
  if(['raw-read','disk-construction','verify','stream','file-before','file-after','parent-before','parent-after','disk-final','expired-final','verify-expiry'].includes(scenario)){
    const actualPrototype=Object.getPrototypeOf(failure);
    const constructed=Reflect.construct(actualPrototype.constructor,[[],[]]);
    require(constructed!==failure&&Object.getPrototypeOf(constructed)===actualPrototype,'genuine cleanup constructor did not create a distinct same-prototype error');
    require(!isInitialHandoffCleanupUnknown(constructed),'UC1_IDENTITY_CONSTRUCTOR_MINTED');
  }

  const field={message:failure.message,cleanup:true,custody:failure.custody,errors:failure.errors};
  const prototype=Object.assign(Object.create(Object.getPrototypeOf(failure)),failure);
  classifications.push({stage,unknown:isInitialHandoffCleanupUnknown(failure),field:isInitialHandoffCleanupUnknown(field),prototype:isInitialHandoffCleanupUnknown(prototype),spread:isInitialHandoffCleanupUnknown({...failure})});
}
function require(condition,message,cause){if(!condition)throw new Error(message,{cause});}
function captureFailure(operation){try{operation();}catch(cause){return cause;}return undefined;}
function includesFailure(failure,expected,seen=new Set()){
  if(failure===expected)return true;if(!(failure instanceof Error)||seen.has(failure))return false;seen.add(failure);
  return includesFailure(failure.cause,expected,seen)||(failure instanceof AggregateError&&failure.errors.some(cause=>includesFailure(cause,expected,seen)));
}
function setFault(retained,after){require(retained,'original target absent');retained.fault={after,error:new Error('owned '+(retained.directory?'parent':'file')+' close failure')};custody.faults.push(retained.fault.error);}
function assertSwept(originals){
  const calls=custody.calls.filter(entry=>originals.includes(entry));
  const firstParent=calls.findIndex(entry=>entry.directory);
  require(firstParent<0||!calls.slice(firstParent).some(entry=>!entry.directory),'retained file close followed parent close');
  for(const retained of originals){require(retained.attempts===1,'original close attempt count '+retained.attempts);require(retained.fault&&!retained.fault.after||retained.delegated,'healthy original close not delegated');}
}
function snapshotAccounting(){
  return {buckets:[custody.resources,custody.streams,custody.callers].map(bucket=>bucket.map(original=>({original,attempts:original.attempts,nativeEntries:original.nativeEntries,status:original.native.status}))),calls:[...custody.calls]};
}
function assertAccounting(snapshot){
  const buckets=[custody.resources,custody.streams,custody.callers];
  require(snapshot.buckets.every((entries,index)=>entries.length===buckets[index].length&&entries.every((saved,position)=>{const original=buckets[index][position];return original===saved.original&&original.attempts===saved.attempts&&original.nativeEntries===saved.nativeEntries&&original.native.status===saved.status;})),'identity probe changed original roster or native accounting');
  require(snapshot.calls.length===custody.calls.length&&snapshot.calls.every((original,index)=>original===custody.calls[index]),'identity probe changed original close calls');
}
function assertSaved(observation,saved,label){
  const accounting=snapshotAccounting();
  for(const method of ['verifyClosure','assertStable']){
    const failure=captureFailure(()=>observation[method]());
    assertAccounting(accounting);
    require(failure===saved&&isInitialHandoffCleanupUnknown(failure),label+':'+method);
  }
}
function assertRetainArgumentPriority(observation,saved){
  const accounting=snapshotAccounting();let getterAccesses=0;const sentinel=new Error('owned inert path getter sentinel');
  const failure=captureFailure(()=>observation.retainExecutingFile({get path(){getterAccesses++;throw sentinel;}}));
  assertAccounting(accounting);
  require(failure===saved&&getterAccesses===0,'UC1_IDENTITY_RETAIN_ARGUMENT_PRIORITY',{getterAccesses,receivedSentinel:failure===sentinel,receivedSaved:failure===saved});
}
function assertSticky(observation,first){
  require(first instanceof Error,'first cleanup did not refuse');
  require(isInitialHandoffCleanupUnknown(first),'UC1_IDENTITY_FAILED_UNBRANDED');
  const accounting=snapshotAccounting();
  require(captureFailure(()=>observation.closeFiles())===first,'repeat cleanup lost original terminal failure');
  assertAccounting(accounting);
  if(performance.now()<deadline){
    assertSaved(observation,first,'UC1_IDENTITY_FAILED_LIVE');
    if(scenario==='disk-final')assertRetainArgumentPriority(observation,first);
  }
  Object.defineProperty(performance,'now',{configurable:true,value:()=>deadline+1});
  assertSaved(observation,first,'UC1_IDENTITY_FAILED_EXPIRED');
  if(scenario==='disk-final')assertRetainArgumentPriority(observation,first);
  assertAccounting(accounting);
  for(const failure of custody.faults)require(includesFailure(first,failure),'terminal failure lost original close cause');
}
const clock=performance.now.bind(performance);
let caller;
let observation;
let assertion;
try{
  caller=openCaller(request.edgeState+'/edge-policy.json');
  if(scenario==='transfer'){
    custody.kind='transfer';custody.armed=true;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>custody.expired?deadline+1:clock()});
    const failure=captureFailure(()=>captureInitialHandoffArtifacts(request,deadline));
    require(custody.expired,'directory transfer deadline not reached');
    require(failure instanceof Error&&String(failure).includes('deadline exceeded'),'wrong transfer refusal');
    require(custody.resources.length===1,'transfer acquired unexpected originals');assertSwept(custody.resources);
    recordClassification('expiry-refusal',failure);
  }else if(scenario==='raw-read'){
    custody.kind='raw-read';custody.armed=true;
    const failure=captureFailure(()=>captureInitialHandoffArtifacts(request,deadline));
    require(includesFailure(failure,custody.primary),'raw construction lost primary read failure');
    for(const fault of custody.faults)require(includesFailure(failure,fault),'raw construction lost cleanup failure');
    require(custody.faults.length===1,'raw read and local cleanup seam not reached');assertSwept(custody.resources);
    recordClassification('construction',failure);
  }else if(scenario==='disk-construction'){
    // The malformed hash-bound handoff intent reaches the genuine shared semantic decoder.
    let failure;
    custody.kind='disk-construction';
    const retainedFault=new Error('owned partial disk close failure');
    const originalClose=custody.resources;
    // Arm the first acquired original through the real fstat/close seam before construction cleanup.
    custody.armDisk=retainedFault;
    try{observation=await captureInitialHandoff(await captureEdgePolicy(request.edgeState),deadline);}catch(cause){failure=cause;}
    require(failure instanceof Error,'malformed disk graph admitted');
    require(includesFailure(failure,retainedFault),'disk construction lost cleanup cause');
    function containsSemantic(cause){return cause instanceof Error&&(cause.message.includes('unknown or missing fields')||containsSemantic(cause.cause)||(cause instanceof AggregateError&&cause.errors.some(containsSemantic)));}
    require(containsSemantic(failure),'disk construction lost semantic cause');assertSwept(originalClose);
    recordClassification('construction',failure);
  }else if(scenario==='known-raw'||scenario==='known-disk'){
    let failure;
    if(scenario==='known-raw'){request.selected[0].capture.sha256='f'.repeat(64);failure=captureFailure(()=>captureInitialHandoffArtifacts(request,deadline));}
    else{try{observation=await captureInitialHandoff(await captureEdgePolicy(request.edgeState),deadline);}catch(cause){failure=cause;}}
    require(failure instanceof Error,'known malformed construction admitted');
    require(scenario==='known-raw'?failure.message.includes('raw migration capture hash differs'):failure.message.includes('unknown or missing fields'),'wrong known construction refusal');
    require(custody.faults.length===0,'known construction injected cleanup fault');assertSwept(custody.resources);
    recordClassification('known-construction',failure);
  }else{
    observation=scenario==='disk-final'?await captureInitialHandoff(await captureEdgePolicy(request.edgeState),deadline):captureInitialHandoffArtifacts(request,deadline);
    const originals=custody.resources.filter(entry=>!entry.delegated);
    require(originals.some(entry=>entry.directory)&&originals.some(entry=>!entry.directory),'actual retained files/parents absent');
    if(scenario==='verify'||scenario==='verify-expiry'||scenario==='stream'){
      custody.kind=scenario==='verify-expiry'?'verify':scenario;custody.armed=true;
      const primary=captureFailure(()=>observation[custody.kind==='verify'?'verifyClosure':'assertStable']());
      require(custody.faults.length===1,'actual transient close seam not reached');
      if(scenario==='stream')require(includesFailure(primary,custody.primary),'stream read failure overwritten');
      require(isInitialHandoffCleanupUnknown(primary),'UC1_IDENTITY_REVOKED_UNBRANDED');
      assertSaved(observation,primary,'UC1_IDENTITY_REVOKED_LIVE');
      recordClassification('transient',primary);
      if(scenario==='verify-expiry'){Object.defineProperty(performance,'now',{configurable:true,value:()=>deadline+1});assertSaved(observation,primary,'UC1_IDENTITY_REVOKED_EXPIRED');}
      const failure=captureFailure(()=>observation.closeFiles());assertSwept(originals);assertSticky(observation,failure);
      require(failure!==primary&&includesFailure(failure,primary),'terminal cleanup lost distinct transient wrapper');
      require(includesFailure(failure,custody.faults[0]),'transient original close failure discarded');
      recordClassification('terminal',failure);
      if(custody.kind==='verify'){
        const reopened=custody.resources.filter(entry=>!originals.includes(entry)&&entry.fault);
        require(reopened.length===1&&reopened[0].attempts===1&&reopened[0].delegated,'independent original reopened close not one shot');
      }else{const stream=custody.streams.find(entry=>entry.fault);require(stream&&stream.attempts===1&&!stream.delegated,'actual stream close retried');}
    }else{
      const parent=scenario.startsWith('parent');
      setFault(originals.find(entry=>entry.directory===parent),scenario.endsWith('after'));
      if(scenario==='multiple')setFault(originals.find(entry=>entry.directory),false);
      if(scenario==='expired-final')Object.defineProperty(performance,'now',{configurable:true,value:()=>deadline+1});
      const failure=captureFailure(()=>observation.closeFiles());assertSwept(originals);assertSticky(observation,failure);
      recordClassification('terminal',failure);
    }
  }
  const closing=fs.fstatSync(caller.descriptor,{bigint:true});require(caller.identity.status==='known'&&closing.dev===caller.identity.value.dev&&closing.ino===caller.identity.value.ino,'caller original descriptor changed');
}catch(cause){assertion=cause;}
finally{
  try{Object.defineProperty(performance,'now',{configurable:true,value:clock});}
  catch(cause){custody.failures.push({clock:cause});custody.uncertain=true;}
  let native;
  try{native=retireFixture();}
  catch(cause){custody.failures.push({retirement:cause});custody.uncertain=true;}
  if(custody.uncertain||native===undefined)await holdUnknown();
  console.log('FIXTURE_NATIVE:'+JSON.stringify(native));
  console.log('FIXTURE_CLEANUP:KNOWN');
}
if(assertion!==undefined)throw assertion;
if(classify)console.log('CLEANUP_IDENTITY:'+JSON.stringify(classifications));
console.log('CLOSE_SETTLEMENT:'+scenario);
`;

// Each original helper still catches skipped cleanup, erased causes or an unsafe second close before these assertions.
test('close settlement retained file before delegation attempts every original', () => {
  assertLegacyClosePreflight('file-before');
});
test('close settlement retained file after delegation stays unknown', () => {
  assertLegacyClosePreflight('file-after');
});
test('close settlement retained parent before delegation attempts every original', () => {
  assertLegacyClosePreflight('parent-before');
});
test('close settlement retained parent after delegation stays unknown', () => {
  assertLegacyClosePreflight('parent-after');
});
test('close settlement multiple failures preserve caller descriptor', () => {
  assertLegacyClosePreflight('multiple');
});
test('close settlement raw construction retains read and cleanup failures', () => {
  assertLegacyClosePreflight('raw-read');
});
test('close settlement disk construction retains semantic and cleanup failures', () => {
  assertLegacyClosePreflight('disk-construction');
});
test('close settlement directory transfer expiry closes original once', () => {
  assertLegacyClosePreflight('transfer');
});
test('close settlement reopened verification failure revokes observation', () => {
  assertLegacyClosePreflight('verify');
});
test('close settlement roster stream failure retains read and close causes', () => {
  assertLegacyClosePreflight('stream');
});
test('close settlement complete disk finalization stays unknown', () => {
  assertLegacyClosePreflight('disk-final');
});

test('cleanup identity recognizes actual raw construction primary and close UNKNOWN', () => {
  assertClosePreflight();
  const observed = readClosePreflight('raw-read').classifications;
  expect(observed).toEqual([
    { stage: 'construction', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes actual disk construction semantic and close UNKNOWN', () => {
  assertClosePreflight();
  const observed = readClosePreflight('disk-construction').classifications;
  expect(observed).toEqual([
    { stage: 'construction', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes reopened file UNKNOWN before stable terminal cleanup', () => {
  assertClosePreflight();
  const observed = readClosePreflight('verify').classifications;
  expect(observed).toEqual([
    { stage: 'transient', unknown: true, field: false, prototype: false, spread: false },
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes directory stream UNKNOWN before stable terminal cleanup', () => {
  assertClosePreflight();
  const observed = readClosePreflight('stream').classifications;
  expect(observed).toEqual([
    { stage: 'transient', unknown: true, field: false, prototype: false, spread: false },
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes retained file UNKNOWN before native delegation', () => {
  assertClosePreflight();
  const observed = readClosePreflight('file-before').classifications;
  expect(observed).toEqual([
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes retained file UNKNOWN after native delegation', () => {
  assertClosePreflight();
  const observed = readClosePreflight('file-after').classifications;
  expect(observed).toEqual([
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes retained parent UNKNOWN before native delegation', () => {
  assertClosePreflight();
  const observed = readClosePreflight('parent-before').classifications;
  expect(observed).toEqual([
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes retained parent UNKNOWN after native delegation', () => {
  assertClosePreflight();
  const observed = readClosePreflight('parent-after').classifications;
  expect(observed).toEqual([
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes complete disk final close UNKNOWN', () => {
  assertClosePreflight();
  const observed = readClosePreflight('disk-final').classifications;
  expect(observed).toEqual([
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity recognizes failed original cleanup after work expiry', () => {
  assertClosePreflight();
  const observed = readClosePreflight('expired-final').classifications;
  expect(observed).toEqual([
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity stays revoked through expiry after transient UNKNOWN', () => {
  assertClosePreflight();
  const observed = readClosePreflight('verify-expiry').classifications;
  expect(observed).toEqual([
    { stage: 'transient', unknown: true, field: false, prototype: false, spread: false },
    { stage: 'terminal', unknown: true, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity refuses malformed raw construction with known cleanup', () => {
  assertClosePreflight();
  const observed = readClosePreflight('known-raw').classifications;
  expect(observed).toEqual([
    { stage: 'known-construction', unknown: false, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity refuses malformed disk construction with known cleanup', () => {
  assertClosePreflight();
  const observed = readClosePreflight('known-disk').classifications;
  expect(observed).toEqual([
    { stage: 'known-construction', unknown: false, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity refuses acquisition transfer expiry with known cleanup', () => {
  assertClosePreflight();
  const observed = readClosePreflight('transfer').classifications;
  expect(observed).toEqual([
    { stage: 'expiry-refusal', unknown: false, field: false, prototype: false, spread: false },
  ]);
});

test('cleanup identity refuses primitive and message field lookalikes', () => {
  assertClosePreflight();
  for (const cause of [undefined, null, false, 0, 'initial handoff cleanup outcome unknown'])
    expect(isInitialHandoffCleanupUnknown(cause)).toBe(false);
  expect(
    isInitialHandoffCleanupUnknown({
      message: 'initial handoff cleanup outcome unknown',
      cleanup: true,
    }),
  ).toBe(false);
});

const closePreflightScenarios = [
  {
    scenario: 'raw-read',
    title: 'cleanup identity recognizes actual raw construction primary and close UNKNOWN',
    fixture: 'complete-disk',
    stages: ['construction'],
  },
  {
    scenario: 'disk-construction',
    title: 'cleanup identity recognizes actual disk construction semantic and close UNKNOWN',
    fixture: 'malformed-disk',
    stages: ['construction'],
  },
  {
    scenario: 'verify',
    title: 'cleanup identity recognizes reopened file UNKNOWN before stable terminal cleanup',
    fixture: 'complete-disk',
    stages: ['transient', 'terminal'],
  },
  {
    scenario: 'stream',
    title: 'cleanup identity recognizes directory stream UNKNOWN before stable terminal cleanup',
    fixture: 'complete-disk',
    stages: ['transient', 'terminal'],
  },
  {
    scenario: 'file-before',
    title: 'cleanup identity recognizes retained file UNKNOWN before native delegation',
    fixture: 'complete-disk',
    stages: ['terminal'],
  },
  {
    scenario: 'file-after',
    title: 'cleanup identity recognizes retained file UNKNOWN after native delegation',
    fixture: 'complete-disk',
    stages: ['terminal'],
  },
  {
    scenario: 'parent-before',
    title: 'cleanup identity recognizes retained parent UNKNOWN before native delegation',
    fixture: 'complete-disk',
    stages: ['terminal'],
  },
  {
    scenario: 'parent-after',
    title: 'cleanup identity recognizes retained parent UNKNOWN after native delegation',
    fixture: 'complete-disk',
    stages: ['terminal'],
  },
  {
    scenario: 'disk-final',
    title: 'cleanup identity recognizes complete disk final close UNKNOWN',
    fixture: 'complete-disk',
    stages: ['terminal'],
  },
  {
    scenario: 'expired-final',
    title: 'cleanup identity recognizes failed original cleanup after work expiry',
    fixture: 'complete-disk',
    stages: ['terminal'],
  },
  {
    scenario: 'verify-expiry',
    title: 'cleanup identity stays revoked through expiry after transient UNKNOWN',
    fixture: 'complete-disk',
    stages: ['transient', 'terminal'],
  },
  {
    scenario: 'known-raw',
    title: 'cleanup identity refuses malformed raw construction with known cleanup',
    fixture: 'complete-disk',
    stages: ['known-construction'],
  },
  {
    scenario: 'known-disk',
    title: 'cleanup identity refuses malformed disk construction with known cleanup',
    fixture: 'malformed-disk',
    stages: ['known-construction'],
  },
  {
    scenario: 'transfer',
    title: 'cleanup identity refuses acquisition transfer expiry with known cleanup',
    fixture: 'complete-disk',
    stages: ['expiry-refusal'],
  },
] as const;

const closeLegacyScenarios = [
  {
    scenario: 'file-before',
    title: 'close settlement retained file before delegation attempts every original',
    fixture: 'complete-disk',
  },
  {
    scenario: 'file-after',
    title: 'close settlement retained file after delegation stays unknown',
    fixture: 'complete-disk',
  },
  {
    scenario: 'parent-before',
    title: 'close settlement retained parent before delegation attempts every original',
    fixture: 'complete-disk',
  },
  {
    scenario: 'parent-after',
    title: 'close settlement retained parent after delegation stays unknown',
    fixture: 'complete-disk',
  },
  {
    scenario: 'multiple',
    title: 'close settlement multiple failures preserve caller descriptor',
    fixture: 'complete-disk',
  },
  {
    scenario: 'raw-read',
    title: 'close settlement raw construction retains read and cleanup failures',
    fixture: 'complete-disk',
  },
  {
    scenario: 'disk-construction',
    title: 'close settlement disk construction retains semantic and cleanup failures',
    fixture: 'malformed-disk',
  },
  {
    scenario: 'transfer',
    title: 'close settlement directory transfer expiry closes original once',
    fixture: 'complete-disk',
  },
  {
    scenario: 'verify',
    title: 'close settlement reopened verification failure revokes observation',
    fixture: 'complete-disk',
  },
  {
    scenario: 'stream',
    title: 'close settlement roster stream failure retains read and close causes',
    fixture: 'complete-disk',
  },
  {
    scenario: 'disk-final',
    title: 'close settlement complete disk finalization stays unknown',
    fixture: 'complete-disk',
  },
] as const;
type ClosePreflightScenario = (typeof closePreflightScenarios)[number]['scenario'];
type CloseLegacyScenario = (typeof closeLegacyScenarios)[number]['scenario'];
const closePreflightRecords = new Map<ClosePreflightScenario, KnownCloseSettlement>();
const closeLegacyRecords = new Map<CloseLegacyScenario, KnownCloseSettlement>();

/** Timed identity cases consume only this invocation's fully joined14 observations, with no fallback work. */
function assertClosePreflight(): void {
  if (graphMode !== 'graph-identity' || !closeSettlementOwner.preflightComplete)
    throw new Error('UC1 original identity preflight admission required');
  if (
    closeSettlementOwner.stopped ||
    closeSettlementOwner.active.length !== 0 ||
    closePreflightRecords.size !== 14 ||
    closeLegacyRecords.size !== 0
  )
    throw new Error('UC1 original identity preflight completion unavailable');
}
function readClosePreflight(scenario: ClosePreflightScenario): KnownCloseSettlement {
  const observed = closePreflightRecords.get(scenario);
  if (observed === undefined) throw new Error('UC1 original preflight record absent');
  assert.equal(observed.scenario, scenario, 'UC1 identity observation scenario differs');
  assert(
    closeSettlementOwner.completed.includes(observed) && observed.original.accepted,
    'UC1 identity observation foreign to this invocation',
  );
  return observed;
}

/** Legacy callbacks assert only their own classify=false result after all11 original helpers/native/readers joined. */
function assertLegacyClosePreflight(scenario: CloseLegacyScenario): void {
  if (
    graphMode !== 'graph-legacy' ||
    !closeSettlementOwner.preflightComplete ||
    closeSettlementOwner.stopped ||
    closeSettlementOwner.active.length !== 0 ||
    closeLegacyRecords.size !== 11 ||
    closePreflightRecords.size !== 0
  )
    throw new Error('UC1 original legacy preflight completion unavailable');
  const observed = closeLegacyRecords.get(scenario);
  assert(observed !== undefined, 'UC1 original legacy observation absent');
  assert.equal(observed.scenario, scenario, 'UC1 original legacy observation scenario differs');
  assert.equal(observed.classifications.length, 0, 'UC1 legacy helper unexpectedly classified');
  assert.equal(observed.exit, 0, 'UC1 legacy helper did not succeed');
  assert(
    closeSettlementOwner.completed.includes(observed) && observed.original.accepted,
    'UC1 legacy observation foreign to this invocation',
  );
}

/** The trusted launcher owns exact original argv; consumed public Bun flags are not recoverable here. */
async function prepareClosePreflight(): Promise<void> {
  const names = graphTestDeclarations.map((declaration) => declaration.name);
  assert.equal(names.length, 228, 'UC1 graph declaration census differs');
  assert.equal(new Set(names).size, 228, 'UC1 graph declaration duplicated');
  assert.equal(
    createHash('sha256').update(JSON.stringify(names)).digest('hex'),
    '9676491473de150ee073672db57973de44ec6707f2e1a5f5f5f5b75384e4bd2a',
    'UC1 frozen graph title census differs',
  );
  assert.equal(graphFinalizers.length, 1, 'UC1 graph finalizer census differs');
  assert.equal(closePreflightScenarios.length, 14, 'UC1 identity scenario census differs');
  assert.equal(
    new Set(closePreflightScenarios.map((row) => row.scenario)).size,
    14,
    'UC1 identity scenario duplicated',
  );
  assert.equal(closeLegacyScenarios.length, 11, 'UC1 legacy scenario census differs');
  assert.equal(
    new Set(closeLegacyScenarios.map((row) => row.scenario)).size,
    11,
    'UC1 legacy scenario duplicated',
  );
  const legacyNames = closeLegacyScenarios.map((row) => row.title);
  const identityNames = [
    ...closePreflightScenarios.map((row) => row.title),
    'cleanup identity refuses primitive and message field lookalikes',
  ];
  assert.deepEqual(names.slice(202, 213), legacyNames, 'UC1 legacy literal names/order differ');
  assert.deepEqual(names.slice(213), identityNames, 'UC1 identity literal names/order differ');
  const selected =
    graphMode === 'graph-ordinary'
      ? graphTestDeclarations.slice(0, 202)
      : graphMode === 'graph-legacy'
        ? graphTestDeclarations.slice(202, 213)
        : graphTestDeclarations.slice(213);
  assert.equal(
    selected.length,
    graphMode === 'graph-ordinary' ? 202 : graphMode === 'graph-legacy' ? 11 : 15,
    'UC1 selected declaration census differs',
  );
  if (hasNativePreflight) {
    // One allocation from module entry; expiry prevents new work and never cancels current originals.
    closeSettlementOwner.deadline = graphModuleEntered + 45000;
    closeSettlementOwner.timer = setTimeout(
      () => {
        stopCloseSettlement(new Error('UC1 original preflight start allocation exceeded'), false);
      },
      Math.max(1, closeSettlementOwner.deadline - performance.now()),
    );
    try {
      async function captureRow(
        row: {
          readonly scenario: ClosePreflightScenario | CloseLegacyScenario;
          readonly fixture: 'complete-disk' | 'malformed-disk';
        },
        classify: boolean,
        stages: readonly string[],
      ): Promise<KnownCloseSettlement> {
        assertCloseSettlementStart();
        const fixture =
          row.fixture === 'malformed-disk'
            ? await initialHandoffFixture('H8', undefined, (label, fields) => {
                if (label === 'handoff-intent') fields['unrecognized'] = true;
              })
            : await initialHandoffFixture();
        const observed = await runCloseSettlement(row.scenario, fixture, classify, stages);
        assert.equal(observed.scenario, row.scenario, 'UC1 original observation scenario differs');
        return observed;
      }
      if (graphMode === 'graph-identity') {
        for (const row of closePreflightScenarios)
          closePreflightRecords.set(row.scenario, await captureRow(row, true, row.stages));
      } else {
        for (const row of closeLegacyScenarios)
          closeLegacyRecords.set(row.scenario, await captureRow(row, false, []));
      }
      assertCloseSettlementStart();
      assert.equal(closeSettlementOwner.active.length, 0, 'UC1 preflight retains unsettled child');
      assert.equal(
        closeSettlementOwner.completed.length,
        graphMode === 'graph-identity' ? 14 : 11,
        'UC1 actual completed helper census differs',
      );
      closeSettlementOwner.preflightComplete = true;
    } catch (cause) {
      stopCloseSettlement(cause, closeSettlementOwner.uncertain);
      if (closeSettlementOwner.uncertain || closeSettlementOwner.active.length !== 0)
        await holdCloseSettlement();
      throw cause;
    } finally {
      if (!closeSettlementOwner.uncertain && closeSettlementOwner.active.length === 0) {
        clearTimeout(closeSettlementOwner.timer);
        if (closeSettlementOwner.keeper !== undefined) clearInterval(closeSettlementOwner.keeper);
      }
    }
    // The original30-second scratch cleanup hook is imported only after every original native/helper/reader joins.
    await import('@tools/test-scratch/preload');
  }
  for (const declaration of selected)
    registerTest(declaration.name, declaration.callback, declaration.options);
  for (const finalizer of graphFinalizers) registerAfterAll(finalizer.callback, finalizer.options);
}

// No native-mode timed test or cleanup hook from this file is registered before all original joins.
await prepareClosePreflight();
