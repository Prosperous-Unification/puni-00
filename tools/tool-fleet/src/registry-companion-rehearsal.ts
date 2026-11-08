import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { renderManagedJournalImport } from './registry-fixture-source';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
import { runRegistryProcess } from './registry-process';

/** Actual private hash-pinned client → bundled public lifecycle → durable disposable authority contract. */
export async function rehearseRegistryCompanion(
  privateRoot: string,
  privateBun: string,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'registry-companion-'));
  await chmod(directory, 0o700);
  const journal = join(directory, 'journal');
  await Bun.write(join(directory, 'placeholder'), 'owned');
  const capacity = {
    maximumBytes: 1024 ** 3,
    usableBytes: 1024 ** 3,
    usedBytes: 0,
    totalInodes: 100000,
    usedInodes: 10,
    rootFreeBytes: 30 * 1024 ** 3,
  };
  const ports: RegistryJournalPorts = {
    verifyConsumers: () => Promise.resolve(),
    verifyImages: () => Promise.resolve(),
    measureJournal: () =>
      Promise.resolve({
        usableBytes: capacity.usableBytes,
        usedBytes: 0,
        totalInodes: 100000,
        usedInodes: 10,
        allocationUnitBytes: 4096,
      }),
    measureRegistry: () => Promise.resolve(capacity),
    collectConsumers: (sources, revision) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'explicit-disposable-genesis',
          ...(source.role === 'history'
            ? {
                history: { state: 'first-install' as const, at: '2026-10-25T12:00:00.000Z' },
                historySha256: createHash('sha256').update('[]').digest('hex'),
              }
            : {}),
          references: [],
          currentReferences: [],
        })),
      ),
    now: () => '2026-10-25T12:00:00.000Z',
  };
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(journal, { mode: 0o700 });
    const invoke = (request: unknown) => executeRegistryCommand(journal, request, ports);
    await invoke({
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
        storageId: 'proof',
        owners: ['website'],
        registryPath: '/unused-registry',
        rootPath: '/',
        maximumBytes: 1024 ** 3,
        journalMaximumBytes: 1024 ** 3,
      },
    });
    const send = async (request: Record<string, unknown>) =>
      invoke({ ...request, expectedRevision: (await invoke({ command: 'read' })).state.revision });
    const references = ['site', 'app', 'api'].map((service, index) => ({
      repository: `puni-website-${service}`,
      digest: `sha256:${String(index + 1).repeat(64)}`,
    }));
    const reserved = await send({
      command: 'reserve-publication',
      operationId: 'website-bundle',
      owner: 'website',
      product: 'website',
      roots: references.map((reference) => reference.digest),
      references,
      envelope: { bytes: 1, inodes: 1 },
    });
    await send({
      command: 'finish-publication',
      operationId: 'website-bundle',
      owner: 'website',
      token: reserved.token,
      outcome: 'completed',
      reconciled: true,
    });
    await send({
      command: 'enroll-consumers',
      operationId: 'sources',
      owner: 'website',
      sources: [
        {
          id: 'history',
          owner: 'website',
          environment: 'dev',
          kind: 'private-product',
          source: '/fixture/history.json',
          configurationSha256: 'a'.repeat(64),
          role: 'history',
        },
        {
          id: 'actual',
          owner: 'website',
          environment: 'dev',
          kind: 'kubernetes',
          source: '/fixture/actual.json',
          configurationSha256: 'a'.repeat(64),
          role: 'consumer',
        },
      ],
    });
    await send({
      command: 'enroll-environment',
      operationId: 'environment',
      owner: 'website',
      environment: 'dev',
      product: 'website',
      history: { state: 'first-install', at: '2026-10-25T12:00:00.000Z' },
    });
    const enrollment = {
      registryId: 'proof',
      registryUrl: 'https://registry.test',
      owner: 'website',
      product: 'website',
      environment: 'dev',
      target: 'flux:website-dev',
      sshHost: 'unused',
      requiredRepositories: references.map((reference) => reference.repository),
      publicationReceiptPath: join(directory, 'publication.json'),
    };
    const publication = {
      registryId: 'proof',
      operationId: 'website-bundle',
      owner: 'website',
      product: 'website',
      roots: references.map((reference) => reference.digest),
      references,
      receipt: { state: 'completed', at: '2026-10-25T12:00:00.000Z' },
    };
    const wrapper = join(directory, 'lifecycle-entry.ts');
    await writeFile(
      wrapper,
      `import {executeRegistryLifecycle} from ${JSON.stringify(join(import.meta.dir, 'registry-lifecycle-cli.ts'))};\n${renderManagedJournalImport()}\nconst capacity=${JSON.stringify(capacity)};const enrollment=${JSON.stringify(enrollment)};const ports={verifyConsumers:()=>Promise.resolve(),verifyImages:()=>Promise.resolve(),measureJournal:()=>Promise.resolve({usableBytes:capacity.usableBytes,usedBytes:0,totalInodes:100000,usedInodes:10,allocationUnitBytes:4096}),measureRegistry:()=>Promise.resolve(capacity),collectConsumers:(sources,revision)=>Promise.resolve(sources.map(source=>({id:source.id,source:source.source,role:source.role,revision,sourceRevision:'explicit-disposable-genesis',...(source.role==='history'?{history:{state:'first-install',at:'2026-10-25T12:00:00.000Z'},historySha256:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'}:{}),references:[],currentReferences:[]}))),now:()=> '2026-10-25T12:00:00.000Z'};\nconsole.log(JSON.stringify(await executeRegistryLifecycle(await Bun.stdin.json(),{publication:()=>Promise.reject(new Error('No upload permitted')),deployment:()=>Promise.resolve(enrollment),environment:()=>Promise.resolve(enrollment),publish:()=>Promise.reject(new Error('No upload permitted')),authority:()=>request=>executeRegistryCommand(${JSON.stringify(journal)},request,ports)})));\n`,
    );
    const built = await Bun.build({
      entrypoints: [wrapper],
      outdir: join(directory, 'artifact'),
      target: 'bun',
    });
    if (!built.success || built.outputs.length !== 1)
      throw new Error('Public lifecycle fixture artifact build failed');
    const artifact = built.outputs.at(0);
    if (artifact === undefined) throw new Error('Missing built lifecycle artifact');
    const pin = {
      path: artifact.path,
      sha256: createHash('sha256')
        .update(await readFile(artifact.path))
        .digest('hex'),
    };
    const binding = {
      target: enrollment.target,
      images: references.map(
        (reference) => `registry.test/${reference.repository}@${reference.digest}`,
      ),
      currentImages: null,
      operationId: 'private-deploy',
      publication,
    };
    const client = join(directory, 'private-client.ts');
    await writeFile(
      client,
      `import {callLifecycleArtifact} from ${JSON.stringify(join(privateRoot, 'deploy/website/k8s/registry-lifecycle.ts'))};\nconst pin=${JSON.stringify(pin)};const binding=${JSON.stringify(binding)};\nconst protectedReceipt=await callLifecycleArtifact(pin,{command:'protect',...binding});if(protectedReceipt.operationId!=='private-deploy') throw new Error('Missing durable protection');\nlet refused=false;try{await callLifecycleArtifact(pin,{command:'protect',...binding,images:['registry.test/foreign@sha256:'+ 'f'.repeat(64)]});}catch(cause){if(!String(cause).includes('publication')) throw cause;refused=true;}if(!refused) throw new Error('Mismatched private image was admitted');\nconsole.log('private/public authority contract passed');\n`,
    );
    const output = await runRegistryProcess([privateBun, client], directory);
    if (output.trim() !== 'private/public authority contract passed')
      throw new Error('Unexpected companion proof output');
    const collectorEntry = join(directory, 'collector-entry.ts');
    await writeFile(
      collectorEntry,
      `import {collectRegistryConsumers} from ${JSON.stringify(join(import.meta.dir, 'registry-reader.ts'))};import {readRegistrySource} from ${JSON.stringify(join(import.meta.dir, 'registry-source.ts'))};const request=await Bun.stdin.json();const reports=await collectRegistryConsumers([request.source],8,'proof',async path=>JSON.parse((await readRegistrySource(path,65536)).text));console.log(JSON.stringify(reports));`,
    );
    const collectorBuilt = await Bun.build({
      entrypoints: [collectorEntry],
      target: 'bun',
      outdir: join(directory, 'collector'),
    });
    const collector = collectorBuilt.outputs.at(0);
    if (!collectorBuilt.success || collector === undefined)
      throw new Error('Collector fixture build failed');
    const repairConfiguration = join(directory, 'repair.json');
    await writeFile(
      repairConfiguration,
      JSON.stringify({
        pin,
        binding,
        journalPath: join(journal, 'journal.json'),
        root: directory,
        collectorPath: collector.path,
      }),
    );
    const repaired = await runRegistryProcess(
      [
        privateBun,
        join(privateRoot, 'deploy/website/k8s/registry-repair-rehearsal.ts'),
        repairConfiguration,
      ],
      directory,
    );
    if (
      repaired.trim() !== 'private/public durable promotion repair and native private reader passed'
    )
      throw new Error('Unexpected private repair proof output');
    console.log(repaired.trim());
    const state = (await invoke({ command: 'read' })).state;
    if (
      state.deployments[0]?.phase !== 'promoted' ||
      state.environments[0]?.releases[0] !== 'website-bundle' ||
      state.reservations.length !== 0
    )
      throw new Error('Private client did not durably finish the existing bundle');
    console.log(output.trim());
  } finally {
    await rm(directory, { recursive: true });
  }
}
if (import.meta.main) {
  const privateRoot = Bun.argv.at(2);
  const privateBun = Bun.argv.at(3);
  if (privateRoot === undefined || privateBun === undefined)
    throw new Error('Expected private repository and pinned Bun executable');
  await rehearseRegistryCompanion(resolve(privateRoot), resolve(privateBun));
}
