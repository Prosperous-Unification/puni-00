import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';

import * as provisioning from './check-provision';
import { readToolchain } from './contracts';
import { assertCommonCapture } from './observability-common-capture.test';
import { assertNetworkingCapture } from './observability-networking-capture.test';
import * as rehearsal from './observability-parity-rehearsal';
import {
  inventoryObservabilityRehearsal,
  prepareRehearsalInventory,
} from './observability-rehearsal-inventory';
import * as obligations from './observability-rehearsal-obligations';
import * as rendering from './observability-render';
import { provisionObservabilityTools } from './observability-tools.fixture';
import { assertVeleroCapture } from './observability-velero-capture.test';

const root = join(import.meta.dir, '../../..');

test('canonical eleven-stage public entry inventories actual pinned releases with committed source provenance', async () => {
  const tools = await provisionObservabilityTools();
  const directory = await scratchAsync('rehearsal-inventory-entry-');
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root });
  if (revision.exitCode !== 0) throw new Error('Fixture source revision unavailable');
  const request = {
    sourceRevision: revision.stdout.toString().trim(),
    network: {
      api: ['172.31.100.1/32'],
      observer: ['172.31.100.2/32'],
      grafana: ['172.31.100.3/32'],
      s3: ['172.31.100.4/32'],
      alertDelivery: ['172.31.100.5/32'],
      publicProbes: ['172.31.100.6/32'],
    },
  };
  const packet = join(directory, 'packet');
  const prepared = await rehearsal.prepareObservabilityRehearsal(root, tools, request, packet);
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const archive = join(
    tools,
    'cache',
    `helm-${lock.binaries.helm.version}`,
    basename(new URL(lock.binaries.helm.url).pathname),
  );
  const capture = process.env['PUNI_REHEARSAL_FRAMES_EXPORT'];
  const render = rendering.renderAuthenticatedObservabilityReleases;
  let expansions: Awaited<ReturnType<typeof render>>['expansions'] | undefined;
  const observer = spyOn(rendering, 'renderAuthenticatedObservabilityReleases').mockImplementation(
    async (...arguments_) => {
      const frames = await render(...arguments_);
      expansions = frames.expansions;
      if (capture !== undefined) await writeFile(capture, JSON.stringify(frames.expansions));
      return frames;
    },
  );
  const validate = rehearsal.validateObservabilityRehearsalBuilds;
  let stageBuilds: Awaited<ReturnType<typeof validate>> | undefined;
  const buildObserver = spyOn(rehearsal, 'validateObservabilityRehearsalBuilds').mockImplementation(
    async (...arguments_) => {
      const validated = await validate(...arguments_);
      stageBuilds = validated;
      if (capture !== undefined)
        await writeFile(`${capture}.stages.json`, JSON.stringify(validated));
      return validated;
    },
  );
  let receipt: Awaited<ReturnType<typeof inventoryObservabilityRehearsal>>;
  try {
    receipt = await inventoryObservabilityRehearsal(root, tools, request, packet, archive);
  } finally {
    observer.mockRestore();
    buildObserver.mockRestore();
  }

  const output = process.env['PUNI_REHEARSAL_INVENTORY_EXPORT'];
  if (output !== undefined) await writeFile(output, JSON.stringify(receipt, null, 2));

  expect(receipt.frames.filter((frame) => frame.owner.startsWith('stage/'))).toHaveLength(11);
  const declarations = receipt.entries.filter((entry) => entry.kind === 'HelmRelease');
  expect(declarations.length).toBeGreaterThan(9);
  expect(receipt.frames.filter((frame) => frame.owner.startsWith('release/'))).toHaveLength(
    declarations.length,
  );
  expect(declarations.every((entry) => entry.expansionOwner !== null)).toBe(true);
  expect(receipt.entries.some((entry) => entry.hooks.length > 0)).toBe(true);
  expect(receipt.entries.some((entry) => entry.images.length > 0)).toBe(true);
  expect(receipt.entries.some((entry) => entry.claims.length > 0)).toBe(true);
  expect(receipt.creationAuthority).toBe(false);
  expect(receipt.runtimeRehearsal).toBe(false);
  expect(receipt.transportObserved).toBe('not-evaluated');
  expect(receipt.provenance.sourceRevision).toBe(request.sourceRevision);
  expect(receipt.provenance.generator.dirty).toBe(false);
  expect(receipt.provenance.helm.archiveSHA256).toBe(lock.binaries.helm.sha256);
  expect(receipt.provenance.helm.executableSHA256).not.toBe(lock.binaries.helm.sha256);
  expect(receipt.provenance.capabilities).toEqual({
    kubernetesVersion: '1.35.0',
    observed: false,
  });
  expect(
    basename(receipt.entries.find((entry) => entry.release !== null)?.release?.archivePath ?? ''),
  ).not.toBe('');
  expect(receipt.bootstrapSources.map((source) => source.sourcePath)).toContain(
    'infra/versions/object-store.json',
  );
  for (const path of [
    'infra/platform/flux/install.yaml',
    'infra/platform/flux/kustomization.yaml',
    'infra/local/platform.k3d.yaml',
    'infra/versions/object-store.json',
    'infra/rehearsal/bootstrap/policy/namespaces.yaml',
  ])
    expect(prepared.files.some((file) => file.path === path)).toBe(true);
  expect(receipt.frames.filter((frame) => frame.owner.startsWith('bootstrap/'))).toHaveLength(2);
  expect(
    receipt.entries.filter(
      (entry) => entry.owner === 'bootstrap/flux' && entry.category === 'native-template',
    ),
  ).toHaveLength(4);
  expect(
    receipt.entries
      .find((entry) => entry.kind === 'Namespace' && entry.name === 'flux-system')
      ?.lifecycleOrigins.map((origin) => origin.owner),
  ).toEqual(['bootstrap/flux']);
  expect(
    receipt.entries
      .find((entry) => entry.kind === 'Namespace' && entry.name === 'observability')
      ?.lifecycleOrigins.map((origin) => origin.owner),
  ).toEqual(['stage/policy', 'bootstrap/policy']);
  expect(
    receipt.entries.find(
      (entry) => entry.kind === 'Namespace' && entry.name === 'observability-dev',
    )?.lifecycleOrigins,
  ).toHaveLength(1);
  expect(receipt.obligations.some((obligation) => obligation.role === 'tools')).toBe(true);
  expect(receipt.runnerInputEquality).toBe('unobserved');
  expect(
    receipt.entries
      .flatMap((entry) => entry.images)
      .filter((image) => image.locks.some((link) => link.match === 'repository-digest')),
  ).toHaveLength(4);

  if (expansions === undefined) throw new Error('Canonical release capture is missing');
  if (stageBuilds === undefined) throw new Error('Canonical stage capture is missing');
  assertCommonCapture(stageBuilds.stages, expansions, receipt);
  assertNetworkingCapture(expansions, receipt);
  assertVeleroCapture(expansions['puni-backup/velero'], receipt);
}, 30_000);

test('retained Flux builder consumes packet output despite a different mutable-root output', async () => {
  const directory = await scratchAsync('retained-flux-caller-');
  const tools = join(directory, 'tools');
  const packet = join(directory, 'packet');
  await mkdir(tools);
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const retained = 'apiVersion: v1\nkind: Namespace\nmetadata: {name: retained-flux-build}\n';
  const mutable = 'apiVersion: v1\nkind: Namespace\nmetadata: {name: mutable-root-build}\n';
  const retainedOutput = join(directory, 'retained.yaml');
  const mutableOutput = join(directory, 'mutable.yaml');
  await writeFile(retainedOutput, retained);
  await writeFile(mutableOutput, mutable);
  const kubectl = join(tools, 'kubectl');
  await writeFile(
    kubectl,
    `#!/usr/bin/env bun
import {readFileSync,statSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {parseAllDocuments,parseDocument} from ${JSON.stringify(join(root, 'node_modules/yaml'))};
const target=process.argv[3];
if(process.argv[2]!=='kustomize')throw Error('Unexpected fake kubectl command');
if(target.endsWith('/infra/platform/flux')){
 process.stdout.write(readFileSync(target===${JSON.stringify(join(packet, 'infra/platform/flux'))}?${JSON.stringify(retainedOutput)}:${JSON.stringify(mutableOutput)}));
}else if(target===${JSON.stringify(join(packet, 'infra/clusters/platform/local'))}){
 process.stdout.write(readdirSync(target).filter(name=>name.endsWith('.yaml')&&name!=='kustomization.yaml').map(name=>readFileSync(join(target,name),'utf8')).join('\\n---\\n'));
}else{
 const seen=new Set();
 function releases(path){
  path=resolve(path);if(seen.has(path))return '';seen.add(path);
  if(statSync(path).isDirectory()){
   const definition=parseDocument(readFileSync(join(path,'kustomization.yaml'),'utf8')).toJSON();
   return (definition.resources??[]).map(name=>releases(join(path,name))).filter(Boolean).join('\\n---\\n');
  }
  return parseAllDocuments(readFileSync(path,'utf8')).filter(document=>document.get('kind')==='HelmRelease').map(document=>document.toString()).join('\\n---\\n');
 }
 process.stdout.write(releases(target));
}
`,
  );
  new Bun.Transpiler({ loader: 'js' }).transformSync(await readFile(kubectl, 'utf8'));
  await chmod(kubectl, 0o700);
  // Earlier graph outputs and tool authentication are dependencies of this caller test.
  // The fake executable emits only actual retained Helm declarations for those stages;
  // the Flux branch reads two physically different fixture outputs by its actual argv.
  const authenticate = spyOn(provisioning, 'authenticatePreparedKubectl').mockResolvedValue(
    lock.binaries.kubectl,
  );
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root });
  if (revision.exitCode !== 0) throw new Error('Fixture current revision unavailable');
  const request = {
    sourceRevision: revision.stdout.toString().trim(),
    network: {
      api: ['172.31.100.1/32'],
      observer: ['172.31.100.2/32'],
      grafana: ['172.31.100.3/32'],
      s3: ['172.31.100.4/32'],
      alertDelivery: ['172.31.100.5/32'],
      publicProbes: ['172.31.100.6/32'],
    },
  };
  try {
    await rehearsal.prepareObservabilityRehearsal(root, tools, request, packet);
    const built = await rehearsal.validateObservabilityRehearsalBuilds(
      root,
      tools,
      request,
      packet,
    );
    expect(built.bootstrap.fluxBytes).toBe(retained);
    expect(built.bootstrap.fluxBytes).not.toBe(mutable);
  } finally {
    authenticate.mockRestore();
  }
}, 30_000);

test('inventory producer consumes built Flux bytes independently from raw vendor bytes', async () => {
  const directory = await scratchAsync('flux-inventory-caller-');
  const path = 'infra/versions/toolchain.json';
  const runtime = await readFile(join(root, path), 'utf8');
  const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  const raw = 'apiVersion: v1\nkind: Namespace\nmetadata: {name: raw-vendor-only}\n';
  const built = 'apiVersion: v1\nkind: Namespace\nmetadata: {name: actually-applied-flux}\n';
  const policy = 'apiVersion: v1\nkind: Namespace\nmetadata: {name: retained-policy}\n';
  const files = [{ path, sha256: hash(runtime) }];
  const coordinate = (path: string, bytes: string) => ({
    sourcePath: path,
    artifactPath: path,
    sha256: hash(bytes),
  });
  const stageBytes = 'apiVersion: v1\nkind: Namespace\nmetadata: {name: source-stage}\n';
  const builds = {
    stages: [
      {
        stage: 'fixture',
        path: 'infra/fixture',
        declarationPath: 'stage/fixture.yaml',
        sourceSHA256: hash('fixture'),
        bytes: stageBytes,
        sha256: hash(stageBytes),
        releases: [],
      },
    ],
    receipt: {
      files,
      generator: { files: [] },
      sourceRevision: 'a'.repeat(40),
      artifactSHA256: rehearsal.hashRehearsalFiles(files),
    },
    bootstrap: {
      flux: raw,
      fluxBytes: built,
      policyBytes: policy,
      sources: [
        coordinate('infra/platform/flux/install.yaml', raw),
        coordinate('infra/platform/flux/kustomization.yaml', 'authored-overlay'),
        coordinate('infra/rehearsal/bootstrap/policy/namespaces.yaml', policy),
      ],
      topology: {},
      topologyEvidence: {},
    },
  } as unknown as Awaited<ReturnType<typeof rehearsal.validateObservabilityRehearsalBuilds>>;
  await mkdir(join(directory, 'infra/versions'), { recursive: true });
  await writeFile(join(directory, path), runtime);
  const validate = spyOn(rehearsal, 'validateObservabilityRehearsalBuilds').mockResolvedValue(
    builds,
  );
  const render = spyOn(rendering, 'renderAuthenticatedObservabilityReleases').mockResolvedValue({
    expansions: {},
    helm: {},
  } as Awaited<ReturnType<typeof rendering.renderAuthenticatedObservabilityReleases>>);
  const declared = spyOn(obligations, 'readRehearsalObligations').mockReturnValue([]);
  try {
    const prepared = await prepareRehearsalInventory(
      root,
      'mocked-tools',
      {},
      directory,
      'mocked-archive',
    );
    expect(prepared.inventory.entries.map((entry) => entry.name)).toContain(
      'actually-applied-flux',
    );
    expect(prepared.inventory.entries.map((entry) => entry.name)).not.toContain('raw-vendor-only');
    const frame = prepared.capacityEvidence.source.resources.find(
      ({ entry }) => entry.owner === 'bootstrap/flux',
    );
    expect(frame?.manifest).toEqual({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: 'actually-applied-flux' },
    });
    expect(frame?.entry.source).toMatchObject({
      kind: 'bootstrap',
      sourcePath: 'infra/platform/flux',
      buildSHA256: hash(built),
    });
  } finally {
    validate.mockRestore();
    render.mockRestore();
    declared.mockRestore();
  }
});
