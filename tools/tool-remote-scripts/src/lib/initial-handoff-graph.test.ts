import { createHash } from 'node:crypto';
import { chmod, readFile, symlink, unlink, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { afterAll, expect, test } from 'bun:test';

import { captureEdgePolicy } from './edge-policy';
import { captureInitialHandoff } from './initial-handoff-graph';

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

import { resolve } from 'node:path';

import { initialHandoffFixture, initialHandoffLayout } from '../fixtures/initial-handoff';

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
  readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly settled: Promise<CloseSettlementOutput>;
}
interface CloseSettlementChild {
  readonly child: Pick<ReturnType<typeof Bun.spawn>, 'pid' | 'exited'>;
  readonly stdout: CloseSettlementReader;
  readonly stderr: CloseSettlementReader;
  readonly helperSHA256: string;
  readonly bundleSHA256: string;
}
const closeSettlementChildren: CloseSettlementChild[] = [];

/** Drains full original streams, retaining at most 64 KiB while hashing every byte. */
function drainCloseSettlement(stream: ReadableStream<Uint8Array>): CloseSettlementReader {
  const reader = stream.getReader();
  const settled = (async () => {
    const digest = createHash('sha256');
    const chunks: Buffer[] = [];
    let bytes = 0;
    let retained = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      digest.update(chunk.value);
      bytes += chunk.value.byteLength;
      const count = Math.min(chunk.value.byteLength, 65536 - retained);
      if (count > 0) chunks.push(Buffer.from(chunk.value.subarray(0, count)));
      retained += count;
    }
    return {
      bytes,
      sha256: digest.digest('hex'),
      base64: Buffer.concat(chunks).toString('base64'),
      overflow: bytes > 65536,
    };
  })();
  return { reader, settled };
}

/** Emits bounded safe diagnostics before interpreting any original outcome. */
function reportCloseSettlement(
  retained: CloseSettlementChild,
  outcomes: readonly PromiseSettledResult<number | CloseSettlementOutput>[],
): void {
  const original = outcomes.map((outcome) => {
    if (outcome.status === 'fulfilled') return { status: outcome.status, value: outcome.value };
    const bytes = Buffer.from(String(outcome.reason));
    return {
      status: outcome.status,
      reason: {
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        base64: bytes.subarray(0, 65536).toString('base64'),
        overflow: bytes.length > 65536,
      },
    };
  });
  process.stderr.write(
    'CLOSE_HELPER_DIAGNOSTIC:' +
      JSON.stringify({
        pid: retained.child.pid,
        originalExecutableBase64: Buffer.from(closeSettlementExecutable).toString('base64'),
        childExecutable: 'Recorded only by the child CLOSE_EXECUTABLE frame in original stdout',
        helperSHA256: retained.helperSHA256,
        bundleSHA256: retained.bundleSHA256,
        outcomes: original,
      }) +
      '\n',
  );
}

/** A timed-out test still owns its original process and both readers until settlement. */
afterAll(async () => {
  const failures: unknown[] = [];
  const drainage = await Promise.allSettled(
    closeSettlementChildren.map(async (retained) => {
      const outcomes = await Promise.allSettled([
        retained.child.exited,
        retained.stdout.settled,
        retained.stderr.settled,
      ]);
      reportCloseSettlement(retained, outcomes);
      const exit = outcomes[0];
      const out = outcomes[1];
      const err = outcomes[2];
      if (exit.status !== 'fulfilled' || out.status !== 'fulfilled' || err.status !== 'fulfilled')
        throw new Error('HOLD: close settlement process or reader outcome unknown', {
          cause: outcomes,
        });
      if (out.value.overflow || err.value.overflow)
        throw new Error('HOLD: owned helper output overflow', { cause: outcomes });
      if (
        !Buffer.from(out.value.base64, 'base64').toString('utf8').includes('FIXTURE_CLEANUP:KNOWN')
      )
        throw new Error('HOLD: owned helper fixture cleanup unproven', { cause: outcomes });
      const index = closeSettlementChildren.indexOf(retained);
      if (index >= 0) closeSettlementChildren.splice(index, 1);
    }),
  );
  for (const outcome of drainage) if (outcome.status === 'rejected') failures.push(outcome.reason);
  if (failures.length !== 0)
    throw new AggregateError(failures, 'HOLD: owned close helper drainage unknown');
});

/** Owns actual helper processes and readers until all three outcomes are known. */
async function runCloseSettlement(
  scenario: string,
  fixture: Awaited<ReturnType<typeof initialHandoffFixture>>,
) {
  const seam = fixture.root + '/close-dependency.ts';
  const entry = fixture.root + '/close-settlement.ts';
  const bundle = fixture.root + '/close-settlement.js';
  await writeFile(seam, closeDependencyProgram);
  await writeFile(
    entry,
    `import {captureInitialHandoffArtifacts,captureInitialHandoff} from ${JSON.stringify(resolve(import.meta.dir, 'initial-handoff-graph.ts'))};
import {captureEdgePolicy} from ${JSON.stringify(resolve(import.meta.dir, 'edge-policy.ts'))};
import * as fs from 'node:fs';
import {custody} from ${JSON.stringify(seam)};
const request=${JSON.stringify(fixture.artifactRequest)};
const scenario=${JSON.stringify(scenario)};
const originalExecutable=${JSON.stringify(closeSettlementExecutable)};
if(process.execPath!==originalExecutable)throw Error('owned helper executable identity changed');
console.log('CLOSE_EXECUTABLE:'+JSON.stringify({parent:originalExecutable,child:process.execPath}));
const deadline=performance.now()+120000;
${closeSettlementProgram}`,
  );
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
            const dependency = "from 'node:fs';";
            if (contents.split(dependency).length !== 2)
              throw new Error('graph synchronous filesystem dependency changed');
            return {
              contents: contents.replace(dependency, 'from ' + JSON.stringify(seam) + ';'),
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
  const child = Bun.spawn([closeSettlementExecutable, bundle], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = drainCloseSettlement(child.stdout);
  const stderr = drainCloseSettlement(child.stderr);
  const retained = { child, stdout, stderr, helperSHA256, bundleSHA256 };
  closeSettlementChildren.push(retained);
  const outcomes = await Promise.allSettled([child.exited, stdout.settled, stderr.settled]);
  reportCloseSettlement(retained, outcomes);
  const exit = outcomes[0];
  const out = outcomes[1];
  const err = outcomes[2];
  if (exit.status !== 'fulfilled' || out.status !== 'fulfilled' || err.status !== 'fulfilled')
    throw new Error('owned close settlement process or reader outcome unknown', {
      cause: outcomes,
    });
  if (out.value.overflow || err.value.overflow)
    throw new Error('HOLD: owned helper output overflow', { cause: outcomes });
  const text = Buffer.from(out.value.base64, 'base64').toString('utf8');
  if (!text.includes('FIXTURE_CLEANUP:KNOWN'))
    throw new Error('HOLD: owned helper fixture cleanup unproven', { cause: outcomes });
  closeSettlementChildren.splice(closeSettlementChildren.indexOf(retained), 1);
  expect(err.value.bytes).toBe(0);
  expect(exit.value).toBe(0);
  const expected =
    'CLOSE_EXECUTABLE:' +
    JSON.stringify({ parent: closeSettlementExecutable, child: closeSettlementExecutable }) +
    '\nFIXTURE_CLEANUP:KNOWN\nCLOSE_SETTLEMENT:' +
    scenario +
    '\n';
  expect(out.value.sha256).toBe(createHash('sha256').update(expected).digest('hex'));
}

/** Replaces only the graph's dependency, delegating real synchronous filesystem operations. */
const closeDependencyProgram = String.raw`
import * as fs from 'node:fs';
export { constants, openSync, realpathSync } from 'node:fs';
export const custody={resources:[],streams:[],calls:[],faults:[],armed:false,kind:'',expired:false,primary:new Error('owned primary read failure')};
function retain(descriptor){
  const identity=fs.fstatSync(descriptor,{bigint:true});
  let retained=custody.resources.findLast(entry=>entry.descriptor===descriptor);
  if(!retained||retained.delegated){retained={descriptor,identity,directory:identity.isDirectory(),attempts:0,delegated:false,fault:undefined};custody.resources.push(retained);}
  if(custody.armDisk&&!custody.faults.length){retained.fault={after:false,error:custody.armDisk};custody.faults.push(custody.armDisk);}
  return retained;
}
export function fstatSync(descriptor,...options){retain(descriptor);return fs.fstatSync(descriptor,...options);}
export function lstatSync(path,...options){
  const identity=fs.lstatSync(path,...options);
  if(custody.kind==='transfer'&&custody.armed&&custody.resources.some(entry=>entry.directory&&!entry.delegated))custody.expired=true;
  return identity;
}
export function readSync(descriptor,...options){
  if(custody.kind==='raw-read'&&custody.armed){custody.armed=false;const retained=retain(descriptor);retained.fault={after:false,error:new Error('owned local file close failure')};custody.faults.push(retained.fault.error);throw custody.primary;}
  return fs.readSync(descriptor,...options);
}
export function closeSync(descriptor){
  const retained=custody.resources.findLast(entry=>entry.descriptor===descriptor);
  if(!retained)throw Error('graph close lacks original acquired identity');
  retained.attempts++;custody.calls.push(retained);
  if(retained.delegated)throw Error('original close delegated twice');
  if(custody.kind==='verify'&&custody.armed&&!retained.directory){custody.armed=false;retained.fault={after:true,error:new Error('owned reopened file close failure')};custody.faults.push(retained.fault.error);}
  if(retained.fault&&!retained.fault.after)throw retained.fault.error;
  fs.closeSync(descriptor);retained.delegated=true;
  if(retained.fault)throw retained.fault.error;
}
export function opendirSync(...options){
  const directory=fs.opendirSync(...options);
  const close=directory.closeSync.bind(directory);
  const read=directory.readSync.bind(directory);
  const retained={directory,close,attempts:0,delegated:false,fault:undefined};custody.streams.push(retained);
  directory.readSync=function(){if(custody.kind==='stream'&&custody.armed){custody.armed=false;retained.fault=new Error('owned directory stream close failure');custody.faults.push(retained.fault);throw custody.primary;}return read();};
  directory.closeSync=function(){retained.attempts++;if(retained.delegated)throw Error('original stream close delegated twice');if(retained.fault)throw retained.fault;close();retained.delegated=true;};
  return directory;
}
`;

const closeSettlementProgram = String.raw`
function require(condition,message){if(!condition)throw Error(message);}
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
function assertSticky(observation,first){
  require(first instanceof Error,'first cleanup did not refuse');
  const counts=custody.resources.map(entry=>entry.attempts);const streams=custody.streams.map(entry=>entry.attempts);
  require(captureFailure(()=>observation.closeFiles())===first,'repeat cleanup lost original terminal failure');
  require(JSON.stringify(counts)===JSON.stringify(custody.resources.map(entry=>entry.attempts)),'repeat cleanup touched original descriptors');
  require(JSON.stringify(streams)===JSON.stringify(custody.streams.map(entry=>entry.attempts)),'repeat cleanup touched original stream');
  for(const method of ['verifyClosure','assertStable'])require(captureFailure(()=>observation[method]()) instanceof Error,'unknown observation admitted '+method);
  require(JSON.stringify(counts)===JSON.stringify(custody.resources.map(entry=>entry.attempts)),'observation after unknown closed a descriptor');
  for(const failure of custody.faults)require(includesFailure(first,failure),'terminal failure lost original close cause');
}
const caller=fs.openSync(request.edgeState+'/edge-policy.json',fs.constants.O_RDONLY);
const callerIdentity=fs.fstatSync(caller,{bigint:true});
const clock=performance.now.bind(performance);
let observation;
let assertion;
try{
  if(scenario==='transfer'){
    custody.kind='transfer';custody.armed=true;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>custody.expired?deadline+1:clock()});
    const failure=captureFailure(()=>captureInitialHandoffArtifacts(request,deadline));
    require(custody.expired,'directory transfer deadline not reached');
    require(failure instanceof Error&&String(failure).includes('deadline exceeded'),'wrong transfer refusal');
    require(custody.resources.length===1,'transfer acquired unexpected originals');assertSwept(custody.resources);
  }else if(scenario==='raw-read'){
    custody.kind='raw-read';custody.armed=true;
    const failure=captureFailure(()=>captureInitialHandoffArtifacts(request,deadline));
    require(includesFailure(failure,custody.primary),'raw construction lost primary read failure');
    for(const fault of custody.faults)require(includesFailure(failure,fault),'raw construction lost cleanup failure');
    require(custody.faults.length===1,'raw read and local cleanup seam not reached');assertSwept(custody.resources);
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
  }else{
    observation=scenario==='disk-final'?await captureInitialHandoff(await captureEdgePolicy(request.edgeState),deadline):captureInitialHandoffArtifacts(request,deadline);
    const originals=custody.resources.filter(entry=>!entry.delegated);
    require(originals.some(entry=>entry.directory)&&originals.some(entry=>!entry.directory),'actual retained files/parents absent');
    if(scenario==='verify'||scenario==='stream'){
      custody.kind=scenario;custody.armed=true;
      const primary=captureFailure(()=>observation[scenario==='verify'?'verifyClosure':'assertStable']());
      require(custody.faults.length===1,'actual transient close seam not reached');
      if(scenario==='stream')require(includesFailure(primary,custody.primary),'stream read failure overwritten');
      const failure=captureFailure(()=>observation.closeFiles());assertSwept(originals);assertSticky(observation,failure);
      require(includesFailure(failure,custody.faults[0]),'transient original close failure discarded');
      if(scenario==='verify'){
        const reopened=custody.resources.filter(entry=>!originals.includes(entry)&&entry.fault);
        require(reopened.length===1&&reopened[0].attempts===1&&reopened[0].delegated,'independent original reopened close not one shot');
      }else{const stream=custody.streams.find(entry=>entry.fault);require(stream&&stream.attempts===1&&!stream.delegated,'actual stream close retried');}
    }else{
      const parent=scenario.startsWith('parent');
      setFault(originals.find(entry=>entry.directory===parent),scenario.endsWith('after'));
      if(scenario==='multiple')setFault(originals.find(entry=>entry.directory),false);
      const failure=captureFailure(()=>observation.closeFiles());assertSwept(originals);assertSticky(observation,failure);
    }
  }
  const closing=fs.fstatSync(caller,{bigint:true});require(closing.dev===callerIdentity.dev&&closing.ino===callerIdentity.ino,'caller original descriptor changed');
}catch(cause){assertion=cause;}
finally{
  Object.defineProperty(performance,'now',{configurable:true,value:clock});
  // No opens occur between fault injection and these fixture-owned first actual closes.
  // A failed identity or close remains UNKNOWN; cleanup continues for every other original.
  const cleanups=[];const failures=assertion===undefined?[]:[assertion];
  for(const retained of custody.streams)if(!retained.delegated){
    try{retained.close();retained.delegated=true;cleanups.push({original:retained,outcome:'closed'});}
    catch(cause){cleanups.push({original:retained,outcome:'unknown',cause});failures.push(cause);}
  }
  for(const retained of custody.resources)if(!retained.delegated){
    let identity;
    try{identity=fs.fstatSync(retained.descriptor,{bigint:true});}
    catch(cause){cleanups.push({original:retained,outcome:'identity-unknown',cause});failures.push(cause);continue;}
    if(identity.dev!==retained.identity.dev||identity.ino!==retained.identity.ino){const cause=Error('HOLD: fixture original identity changed; no close authorized');cleanups.push({original:retained,outcome:'identity-unknown',cause});failures.push(cause);continue;}
    try{fs.closeSync(retained.descriptor);retained.delegated=true;cleanups.push({original:retained,outcome:'closed'});}
    catch(cause){cleanups.push({original:retained,outcome:'unknown',cause});failures.push(cause);}
  }
  try{fs.closeSync(caller);cleanups.push({original:{descriptor:caller,identity:callerIdentity},outcome:'closed'});}
  catch(cause){cleanups.push({original:{descriptor:caller,identity:callerIdentity},outcome:'unknown',cause});failures.push(cause);}
  custody.fixtureCleanups=cleanups;
  if(cleanups.some(entry=>entry.outcome!=='closed')){
    const failure=new AggregateError(failures,'HOLD: fixture original cleanup unknown');
    failure.custody=custody;throw failure;
  }
  console.log('FIXTURE_CLEANUP:KNOWN');
}
if(assertion!==undefined)throw assertion;
console.log('CLOSE_SETTLEMENT:'+scenario);
`;

// Each case catches skipped original cleanup, erased causes, or an unsafe second close.
test('close settlement retained file before delegation attempts every original', async () => {
  await runCloseSettlement('file-before', await initialHandoffFixture());
});
test('close settlement retained file after delegation stays unknown', async () => {
  await runCloseSettlement('file-after', await initialHandoffFixture());
});
test('close settlement retained parent before delegation attempts every original', async () => {
  await runCloseSettlement('parent-before', await initialHandoffFixture());
});
test('close settlement retained parent after delegation stays unknown', async () => {
  await runCloseSettlement('parent-after', await initialHandoffFixture());
});
test('close settlement multiple failures preserve caller descriptor', async () => {
  await runCloseSettlement('multiple', await initialHandoffFixture());
});
test('close settlement raw construction retains read and cleanup failures', async () => {
  await runCloseSettlement('raw-read', await initialHandoffFixture());
});
test('close settlement disk construction retains semantic and cleanup failures', async () => {
  await runCloseSettlement(
    'disk-construction',
    await initialHandoffFixture('H8', undefined, (label, fields) => {
      if (label === 'handoff-intent') fields['unrecognized'] = true;
    }),
  );
});
test('close settlement directory transfer expiry closes original once', async () => {
  await runCloseSettlement('transfer', await initialHandoffFixture());
});
test('close settlement reopened verification failure revokes observation', async () => {
  await runCloseSettlement('verify', await initialHandoffFixture());
});
test('close settlement roster stream failure retains read and close causes', async () => {
  await runCloseSettlement('stream', await initialHandoffFixture());
});
test('close settlement complete disk finalization stays unknown', async () => {
  await runCloseSettlement('disk-final', await initialHandoffFixture());
});
