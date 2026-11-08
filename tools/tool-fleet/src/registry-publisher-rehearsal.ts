import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  quoteFixtureJson,
  quoteFixtureString,
  renderDockerFixture,
  renderManagedJournalImport,
} from './registry-fixture-source';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
import { runRegistryProcess } from './registry-process';

/** Actual private client/native publisher/uploader with synthetic credentials; export and capacity are explicit fixture ports. */
export async function rehearseRegistryPublisher(
  privateRoot: string,
  privateBun: string,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'registry-publisher-'));
  await chmod(directory, 0o700);
  const username = `fixture-${randomUUID()}`;
  const password = randomUUID();
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const stored = new Map<string, Uint8Array>();
  let authorized = 0;
  let denied = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    maxRequestBodySize: 8192,
    async fetch(request) {
      if (request.headers.get('authorization') !== authorization) {
        denied++;
        return new Response('synthetic authentication refused', { status: 401 });
      }
      authorized++;
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname.endsWith('/blobs/uploads/'))
        return new Response(null, { status: 202, headers: { location: `${url.pathname}fixture` } });
      if (request.method === 'PUT') {
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.length > 8192) return new Response('fixture bound', { status: 413 });
        const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        const manifest = url.pathname.includes('/manifests/');
        if (!manifest && url.searchParams.get('digest') !== digest)
          return new Response('digest mismatch', { status: 400 });
        const prefix = url.pathname.split(manifest ? '/manifests/' : '/blobs/')[0];
        stored.set(`${prefix}/${manifest ? 'manifests' : 'blobs'}/${digest}`, bytes);
        return new Response(null, { status: 201, headers: { 'docker-content-digest': digest } });
      }
      const bytes = stored.get(url.pathname);
      return bytes === undefined
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array(bytes));
    },
  });
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
    collectConsumers: () => Promise.reject(new Error('No consumer reads in publication fixture')),
    now: () => '2026-10-25T12:00:00.000Z',
  };
  try {
    const scratch = join(directory, 'scratch');
    await mkdir(scratch, { mode: 0o700 });
    const imageId = 'sha256:8108345a688fe4443aabd7b95f6edc64497523dd78da3ef3aeed69ea605b0f3e';
    const observed = {
      Id: imageId,
      Descriptor: {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest: imageId,
        size: 401,
      },
      RootFS: {
        Type: 'layers',
        Layers: ['sha256:9290e74028e00871597e6d07ee9489e1aaad7da84ca15b6d4d825c4260b23ff3'],
      },
      Os: 'linux',
      Architecture: 'amd64',
    };
    const archive = join(import.meta.dir, 'fixtures/docker-29.1.3-containerd.oci.tar');
    const docker = join(directory, 'docker-fixture');
    const script = renderDockerFixture(imageId, observed, archive);
    await writeFile(docker, script, { mode: 0o700 });
    const repositories = ['site', 'app', 'api'].map((service) => `puni-website-${service}`);
    const images = repositories.map((repository) => ({ repository, tag: 'fixture', imageId }));
    const run = async (mode: 'correct' | 'missing' | 'wrong') => {
      const journal = join(directory, `journal-${mode}`);
      await mkdir(journal, { mode: 0o700 });
      await executeRegistryCommand(
        journal,
        {
          command: 'initialize',
          enrollment: {
            registryId: 'proof',
            storageId: 'proof',
            owners: ['website'],
            registryPath: '/unused',
            rootPath: '/',
            maximumBytes: 1024 ** 3,
            journalMaximumBytes: 1024 ** 3,
          },
        },
        ports,
      );
      const enrollment = {
        schemaVersion: 1,
        registryId: 'proof',
        registryUrl: `http://127.0.0.1:${String(server.port)}`,
        owner: 'website',
        product: 'website',
        requiredRepositories: repositories,
        builder: { path: scratch },
        docker: { path: docker, sha256: createHash('sha256').update(script).digest('hex') },
      };
      const entry = join(directory, `entry-${mode}.ts`);
      await writeFile(
        entry,
        `import {executeRegistryLifecycle} from ${quoteFixtureString(join(import.meta.dir, 'registry-lifecycle-cli.ts'))};import {publishNativeDockerBundle} from ${quoteFixtureString(join(import.meta.dir, 'registry-docker-publication.ts'))};${renderManagedJournalImport()}const capacity=JSON.parse(${quoteFixtureJson(capacity)});const ports={verifyConsumers:()=>Promise.resolve(),verifyImages:()=>Promise.resolve(),measureJournal:()=>Promise.resolve({usableBytes:capacity.usableBytes,usedBytes:0,totalInodes:100000,usedInodes:10,allocationUnitBytes:4096}),measureRegistry:()=>Promise.resolve(capacity),collectConsumers:()=>Promise.reject(new Error('Unexpected consumer read')),now:()=> '2026-10-25T12:00:00.000Z'};const authority=()=>request=>executeRegistryCommand(JSON.parse(${quoteFixtureJson(journal)}),request,ports);if(process.env.NODE_OPTIONS!==undefined || process.env.BUN_OPTIONS!==undefined)throw new Error('Loader environment leaked');console.log(JSON.stringify(await executeRegistryLifecycle(await Bun.stdin.json(),{publication:()=>Promise.resolve(JSON.parse(${quoteFixtureJson(enrollment)})),deployment:()=>Promise.reject(new Error('unused')),environment:()=>Promise.reject(new Error('unused')),authority,publish:(enrollment,images)=>publishNativeDockerBundle(enrollment,images,{admit:()=>Promise.resolve({}),check:()=>Promise.resolve(),authority})})));`,
      );
      const build = await Bun.build({
        entrypoints: [entry],
        target: 'bun',
        outdir: join(directory, `bundle-${mode}`),
      });
      const artifact = build.outputs.at(0);
      if (!build.success || artifact === undefined)
        throw new Error('Native publisher fixture build failed');
      const pin = {
        path: artifact.path,
        sha256: createHash('sha256')
          .update(await readFile(artifact.path))
          .digest('hex'),
      };
      const client = join(directory, `client-${mode}.ts`);
      await writeFile(
        client,
        `import {callLifecycleArtifact} from ${quoteFixtureString(join(privateRoot, 'deploy/website/k8s/registry-lifecycle.ts'))};process.env.NODE_OPTIONS='--no-warnings';process.env.BUN_OPTIONS='fixture-loader-must-not-cross';${mode === 'missing' ? 'delete process.env.REGISTRY_USER;delete process.env.REGISTRY_PASS;' : `process.env.REGISTRY_USER=JSON.parse(${quoteFixtureJson(username)});process.env.REGISTRY_PASS=JSON.parse(${quoteFixtureJson(mode === 'wrong' ? 'wrong-synthetic-password' : password)});`}const receipt=await callLifecycleArtifact(JSON.parse(${quoteFixtureJson(pin)}),JSON.parse(${quoteFixtureJson({ command: 'publish-docker', registryUrl: enrollment.registryUrl, target: 'flux:website-dev', images })}));console.log(JSON.stringify(receipt));`,
      );
      const beforeAuthorized = authorized;
      const beforeDenied = denied;
      let output: string | undefined;
      let failure: unknown;
      try {
        output = await runRegistryProcess([privateBun, client], directory);
      } catch (cause) {
        failure = cause;
      }
      const state = (await executeRegistryCommand(journal, { command: 'read' }, ports)).state;
      if (mode === 'correct') {
        if (failure !== undefined)
          throw new Error('Private native publisher failed', { cause: failure });
        const receipt: unknown = JSON.parse(output ?? 'null');
        if (
          typeof receipt !== 'object' ||
          receipt === null ||
          !('publication' in receipt) ||
          JSON.stringify(receipt.publication) !==
            JSON.stringify({ registryId: 'proof', ...state.bundles[0] }) ||
          state.bundles.length !== 1 ||
          state.bundles[0]?.receipt.state !== 'completed' ||
          state.bundles[0].references.length !== 3 ||
          state.reservations.length !== 0 ||
          authorized <= beforeAuthorized ||
          denied !== beforeDenied
        )
          throw new Error('Native publication omitted authenticated complete receipt');
      } else {
        const expected = mode === 'missing' ? 'explicit registry credentials' : 'HTTP 401';
        if (
          failure === undefined ||
          !(failure instanceof Error) ||
          !failure.message.includes(expected) ||
          state.bundles.some((bundle) => bundle.receipt.state === 'completed')
        )
          throw new Error(`Native publisher ${mode} credential refusal missing`);
        if (
          mode === 'missing' &&
          (authorized !== beforeAuthorized ||
            denied !== beforeDenied ||
            state.bundles.length !== 0 ||
            state.reservations.length !== 0)
        )
          throw new Error('Missing credentials reached HTTP');
        if (
          mode === 'wrong' &&
          (authorized !== beforeAuthorized ||
            denied !== beforeDenied + 1 ||
            state.publication?.phase !== 'failed' ||
            state.bundles.length !== 1 ||
            state.bundles[0]?.receipt.state !== 'unfinished' ||
            state.bundles[0].references.length !== 3 ||
            state.bundles[0].roots.length === 0 ||
            state.reservations.length !== 1)
        )
          throw new Error(
            `Wrong credentials lost protected failed ownership: authorized=${String(authorized - beforeAuthorized)} denied=${String(denied - beforeDenied)} protections=${String(state.protections.length)} reservations=${String(state.reservations.length)}`,
          );
      }
      if ((await readdir(scratch)).length !== 0)
        throw new Error('Native publisher retained export scratch');
    };
    await run('correct');
    await run('missing');
    await run('wrong');
    console.log('private/native authenticated publication and credential negatives passed');
  } finally {
    await server.stop(true);
    await rm(directory, { recursive: true });
  }
}
if (import.meta.main) {
  const privateRoot = Bun.argv.at(2);
  const privateBun = Bun.argv.at(3);
  if (privateRoot === undefined || privateBun === undefined)
    throw new Error('Expected private root and pinned runtime');
  await rehearseRegistryPublisher(resolve(privateRoot), resolve(privateBun));
}
