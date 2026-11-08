import { uploadArtifact } from '../../../tools/tool-fleet/src/platform-registry';
import { inspectOciArchive } from '../../../tools/tool-fleet/src/registry-artifact';
import {
  parseRegistryCommandResponse,
  type RegistryCommand,
} from '../../../tools/tool-fleet/src/registry-managed-journal';
import { publishArtifacts } from '../../../tools/tool-fleet/src/registry-publication';

const url = process.argv.at(2);
const archive = process.argv.at(3);
const wrapper = process.argv.at(4);
const source = process.argv.at(5);
const copyCli = process.argv.at(6);
const clientPath = process.argv.at(7);
const authority = process.argv.at(8);
const journal = process.argv.at(9);
if (
  url === undefined ||
  archive === undefined ||
  wrapper === undefined ||
  source === undefined ||
  copyCli === undefined ||
  clientPath === undefined ||
  authority === undefined ||
  journal === undefined
)
  throw new Error('Missing fixture arguments');
const invoke = async (request: RegistryCommand) => {
  const child = Bun.spawn(['sh', wrapper], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  await child.stdin.write(JSON.stringify(request));
  await child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(stderr);
  return parseRegistryCommandResponse(JSON.parse(stdout));
};
let posts = 0;
const readPosts = () => posts;
let failThird = false;
const proxy = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    const incoming = new URL(request.url);
    if (request.method === 'POST') {
      posts += 1;
      if (failThird && incoming.pathname.includes('/proof-fe/'))
        return new Response('injected third upload failure', { status: 503 });
    }
    const response = await fetch(url + incoming.pathname + incoming.search, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'error',
    });
    const headers = new Headers(response.headers);
    const location = headers.get('location');
    if (location !== null) {
      const target = new URL(location, url);
      headers.set('location', incoming.origin + target.pathname + target.search);
    }
    return new Response(response.body, { status: response.status, headers });
  },
});
try {
  const target = { url: `http://127.0.0.1:${String(proxy.port)}` };
  const repositories = ['proof-be', 'proof-gw', 'proof-fe'];
  const enrollment = {
    registryId: 'proof',
    owner: 'proof',
    product: 'proof-product',
    requiredRepositories: repositories,
  };
  const artifacts = await Promise.all(
    repositories.map((repository) => inspectOciArchive(archive, repository, 'v1')),
  );
  const complete = await publishArtifacts(enrollment, artifacts, invoke, async (artifact) => {
    await uploadArtifact(target, artifact);
  });
  if (
    complete.references.length !== 3 ||
    complete.receipt.state !== 'completed' ||
    readPosts() !== 6 ||
    (await invoke({ command: 'read' })).state.publication !== null
  )
    throw new Error('Incomplete durable bundle');
  console.log('PASS native exact exported closure has complete durable receipt and releases slot');
  for (const artifact of artifacts) await uploadArtifact({ url: source }, artifact);
  const copy = Bun.spawn(
    [
      'setpriv',
      '--reuid=59001',
      '--regid=59001',
      '--clear-groups',
      'env',
      `REGISTRY_PUBLICATION_ENROLLMENT=${clientPath}`,
      process.execPath,
      copyCli,
      source,
      url,
      authority,
      journal,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [copyCode, copyOutput, copyErrors] = await Promise.all([
    copy.exited,
    new Response(copy.stdout).text(),
    new Response(copy.stderr).text(),
  ]);
  if (copyCode !== 0) throw new Error(`Native managed copy failed: ${copyErrors}`);
  console.log(copyOutput.trim());
  const before = readPosts();
  const oversized = Array.from({ length: 8 }, (_, index) => ({
    ...artifacts[0],
    repository: `proof-${String(index)}`,
  }));
  try {
    await publishArtifacts(
      { ...enrollment, requiredRepositories: oversized.map((artifact) => artifact.repository) },
      oversized,
      invoke,
      async (artifact) => {
        await uploadArtifact(target, artifact);
      },
    );
    throw new Error('Oversized admission succeeded');
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes('Publication refused')) throw cause;
  }
  if (readPosts() !== before) throw new Error('Admission refusal followed a registry POST');
  console.log('PASS native capacity refusal precedes first POST');
  failThird = true;
  try {
    await publishArtifacts(enrollment, artifacts, invoke, async (artifact) => {
      await uploadArtifact(target, artifact);
    });
    throw new Error('Third upload unexpectedly succeeded');
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes('HTTP 503')) throw cause;
  }
  const failed = (await invoke({ command: 'read' })).state;
  if (
    failed.publication?.phase !== 'failed' ||
    failed.reservations.length !== 1 ||
    failed.bundles.at(-1)?.receipt.state !== 'unfinished' ||
    readPosts() !== before + 5
  )
    throw new Error('Partial candidate ownership was lost');
  console.log('PASS native third upload HTTP503 retains candidate ownership and reservation');
} finally {
  await proxy.stop(true);
}
