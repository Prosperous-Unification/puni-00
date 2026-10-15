import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { backendStartArgs } from '../src/lib/backend-config';

async function docker(args: string[]): Promise<string> {
  const child = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  if ((await child.exited) !== 0) throw new Error(`Docker command failed: ${error}`);
  return output.trim();
}
const project = `writer-proof-${randomUUID().slice(0, 8)}`;
const root = await mkdtemp(join(tmpdir(), `${project}-`));
const compose = join(root, 'compose.json');
const network = `${project}-net`;
const name = `${project}-backend`;
let created = false;
let failure: unknown = null;
try {
  await mkdir(join(root, 'data'));
  const pinned = 'alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6';
  await docker(['image', 'inspect', pinned]);
  if (!/@sha256:[a-f0-9]{64}$/.test(pinned)) throw new Error('proof image is not pinned');
  await Bun.write(
    compose,
    JSON.stringify({
      name: project,
      services: {
        dependency: { image: pinned, command: ['sleep', '300'], networks: ['backend'] },
        probe: {
          depends_on: { dependency: { condition: 'service_started' } },
          image: pinned,
          container_name: name,
          command: ['sh', '-c', 'echo "$$TEST_TOKEN" > /data/token; exec sleep 300'],
          environment: { TEST_TOKEN: 'literal$$TOKEN' },
          volumes: [{ type: 'bind', source: join(root, 'data'), target: '/data' }],
          networks: { backend: { aliases: [name] } },
        },
      },
      networks: { backend: { name: network, internal: true } },
    }),
  );
  created = true;
  await docker(['compose', '-f', compose, 'up', '-d', '--no-deps', '--pull', 'never', 'probe']);
  const before = await docker(['inspect', '--format', '{{.Id}}', name]);
  await docker(['network', 'disconnect', network, name]);
  await docker(['network', 'connect', '--alias', name, '--alias', 'be-01.internal', network, name]);
  await docker(['stop', before]);
  const retained = await docker([
    'inspect',
    '--format',
    `{{json (index .NetworkSettings.Networks "${network}").Aliases}}`,
    before,
  ]);
  if (!retained.includes('be-01.internal'))
    throw new Error('fault setup did not retain shared alias');
  await docker(backendStartArgs(compose, 'probe', root));
  const after = await docker(['inspect', '--format', '{{.Id}}', name]);
  const aliases = await docker([
    'inspect',
    '--format',
    `{{json (index .NetworkSettings.Networks "${network}").Aliases}}`,
    after,
  ]);
  if (after === before) throw new Error('candidate reused stopped idle identity');
  if (aliases.includes('be-01.internal'))
    throw new Error('candidate retained exposing shared alias');
  const dependencies = await docker([
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--filter',
    'label=com.docker.compose.service=dependency',
  ]);
  if (dependencies !== '') throw new Error('candidate startup started an unrelated dependency');
  const token = await docker(['exec', after, 'cat', '/data/token']);
  if (token !== 'literal$TOKEN')
    throw new Error('snapshot interpolated literal environment dollars');
  console.log(
    `PASS project=${project}: exact ID recreated, shared alias absent, literal environment preserved, dependencies absent`,
  );
} catch (cause) {
  failure = cause;
}
try {
  if (created) await docker(['compose', '-f', compose, 'down', '--volumes']);
  const retainedContainers = await docker([
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${project}`,
  ]);
  const retainedNetworks = await docker([
    'network',
    'ls',
    '--quiet',
    '--filter',
    `name=^${network}$`,
  ]);
  if (retainedContainers !== '' || retainedNetworks !== '')
    throw new Error('disposable resources remain after cleanup');
  await rm(root, { recursive: true });
  console.log(`CLEAN project=${project}: no containers or network remain`);
} catch (cleanupCause) {
  if (failure !== null)
    throw new AggregateError(
      [failure, cleanupCause],
      'proof failed and disposable cleanup failed',
      { cause: cleanupCause },
    );
  throw cleanupCause;
}
if (failure instanceof Error) throw failure;
if (failure !== null) throw new Error('proof failed with a non-error throw', { cause: failure });
