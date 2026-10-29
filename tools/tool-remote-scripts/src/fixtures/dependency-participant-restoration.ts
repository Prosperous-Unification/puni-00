import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  SOLVER_SUPERVISOR_CONTAINER_DIRECTORY,
  SOLVER_SUPERVISOR_HOST_DIRECTORY,
} from '../lib/docker';
import { readFields } from '../lib/managed-cohort';
import type { SourceConfigSlot } from '../lib/source-startup-manifest';
import { completeActivationFixture } from './dependency-complete-activation';
import { prepareSourceFrontendProfile } from './source-frontend-profile';
import { sourceRestorationConfiguration } from './source-restoration';

/** Actual scratch stores/source pins with native emitter execution and full product image launch observations. */
export async function participantActivationFixture(
  activate: readonly ('prod' | 'dev')[] = ['prod'],
  configuration: Readonly<Record<SourceConfigSlot, string>> = sourceRestorationConfiguration,
) {
  const document =
    '{"openapi":"3.1.0","info":{"title":"native pinned participant emitter"},"paths":{}}\n';
  const fixture = await completeActivationFixture(
    activate,
    undefined,
    async (root) => {
      await prepareSourceFrontendProfile(root);
      await mkdir(join(root, 'apps/wbs/be-01/src/openapi'), { recursive: true });
      await writeFile(
        join(root, 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts'),
        `process.stdout.write(${JSON.stringify(document)});\n`,
      );
    },
    configuration,
  );
  const backend = Object.assign(fixture.backend, { Path: 'bun', Args: ['run', 'src/main.ts'] });
  Object.assign(backend.Config, {
    Cmd: ['bun', 'run', 'src/main.ts'],
    Entrypoint: null,
    WorkingDir: '/app/apps/wbs/be-01',
  });
  backend.Config.Env.push('PORT=3100', 'MIGRATE_ON_STARTUP=false');
  backend.Mounts.push({
    Type: 'bind',
    Source: SOLVER_SUPERVISOR_HOST_DIRECTORY,
    Destination: SOLVER_SUPERVISOR_CONTAINER_DIRECTORY,
    RW: false,
  });
  await mkdir(join(fixture.backendNamespace.root, 'namespace/run/wbs-solver'), { recursive: true });
  const mountPath = join(fixture.backendNamespace.root, 'mountinfo');
  const mountinfo = await readFile(mountPath, 'utf8');
  const dataMount = mountinfo.split('\n').find((line) => line.includes(' /data '));
  if (dataMount === undefined) throw new Error('native backend fixture data mount missing');
  const fields = dataMount.split(' ');
  fields[0] = '777';
  fields[1] = '1';
  fields[3] = '/';
  fields[4] = SOLVER_SUPERVISOR_CONTAINER_DIRECTORY;
  fields[5] = 'ro';
  await writeFile(mountPath, mountinfo.trimEnd() + '\n' + fields.join(' ') + '\n');

  const gateway: typeof backend = Object.assign(fixture.gateway, {
    Path: '/usr/local/bin/docker-entrypoint.sh',
    Args: ['bun', 'run', 'src/main.ts'],
  });
  Object.assign(gateway.Config, {
    Cmd: ['bun', 'run', 'src/main.ts'],
    Entrypoint: ['/usr/local/bin/docker-entrypoint.sh'],
    WorkingDir: '/app/apps/wbs/gw-01',
  });
  gateway.Config.Env = ['PORT=3200', 'BE_URL=http://be-01-blue:3100'];
  const images = new Map([
    [
      backend.Image,
      {
        Id: backend.Image,
        Config: { ...backend.Config, Labels: { WBS_SHA: fixture.request.owner.sha } },
      },
    ],
    [
      gateway.Image,
      {
        Id: gateway.Image,
        Config: { ...gateway.Config, Labels: { WBS_SHA: fixture.request.owner.sha } },
      },
    ],
  ]);
  let emissions = 0;
  const docker: typeof fixture.ports.docker = async (args, signal) => {
    if (args.includes('apps/wbs/be-01/src/openapi/emit-openapi-cli.ts')) {
      emissions++;
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          'run',
          'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts',
        ],
        {
          cwd: fixture.sourceRoot,
          env: { PATH: process.env['PATH'], BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const cancel = () => {
        child.kill('SIGKILL');
      };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (code !== 0 || stderr !== '') throw new Error('native fixture source emitter failed');
        return stdout;
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    }
    if (args[0] === 'image' && !args.includes('--format')) {
      const imageId = args.at(-1);
      if (imageId === undefined) throw new Error('fixture image argument absent');
      const image = images.get(imageId);
      if (image !== undefined) return JSON.stringify([image]);
    }
    const response = await fixture.ports.docker(args, signal);
    if (args[0] === 'image' && !args.includes('--format') && args.includes(fixture.source.Image)) {
      const inspected: unknown = JSON.parse(response);
      if (!Array.isArray(inspected)) throw new Error('native source image malformed');
      return JSON.stringify(
        inspected.map((image: unknown) => ({
          ...readFields(image),
          RepoDigests: [fixture.request.source.runtimeReference],
        })),
      );
    }
    return response;
  };
  return {
    ...fixture,
    backend,
    gateway,
    images,
    ports: { ...fixture.ports, docker },
    emissions: () => emissions,
  };
}
