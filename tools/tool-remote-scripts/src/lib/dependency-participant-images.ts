import type { ParticipantSnapshot } from './dependency-participant-transition';
import type { Color } from './deploy-contract';
import { SOLVER_SUPERVISOR_CONTAINER_DIRECTORY, SOLVER_SUPERVISOR_HOST_DIRECTORY } from './docker';
import { orderMounts } from './docker-inventory';
import { assertSame, readFields } from './managed-cohort';

export interface ProductImageBinding {
  readonly role: 'backend' | 'gateway';
  readonly reference: string;
  readonly imageId: string;
  readonly sourceSha: string;
  readonly backendColor: Color;
  readonly dataDirectory: string;
}
/** Exact immutable image and pinned-builder provenance contract. It does not infer loaded source identity from a container label or health response. */
export function assertParticipantImage(
  snapshot: ParticipantSnapshot,
  inspected: unknown,
  binding: ProductImageBinding,
): void {
  if (!Array.isArray(inspected) || inspected.length !== 1)
    throw new Error('participant immutable image inspection malformed');
  const image = readFields(inspected[0]);
  const config = readFields(image['Config']);
  const installed = readFields(snapshot.native['Config']);
  if (
    image['Id'] !== binding.imageId ||
    snapshot.native['Image'] !== binding.imageId ||
    installed['Image'] !== binding.reference
  )
    throw new Error('participant admitted image identity differs');
  const labels = readFields(config['Labels']);
  if (labels['WBS_SHA'] !== binding.sourceSha)
    throw new Error('participant immutable source label differs');
  const tier = binding.role === 'backend' ? 'be-01' : 'gw-01';
  const cwd = `/app/apps/wbs/${tier}`;
  if (config['WorkingDir'] !== cwd || installed['WorkingDir'] !== cwd)
    throw new Error('participant fixed application directory differs');
  const command = ['bun', 'run', 'src/main.ts'];
  assertSame(command, config['Cmd'], 'participant immutable application command');
  assertSame(command, installed['Cmd'], 'participant installed application command');
  const entrypoint = config['Entrypoint'];
  if (!(
    entrypoint === null ||
    (Array.isArray(entrypoint) &&
      entrypoint.length > 0 &&
      entrypoint.every((argument: unknown) => typeof argument === 'string' && argument.length > 0))
  ))
    throw new Error('participant inherited entrypoint unsupported');
  assertSame(entrypoint, installed['Entrypoint'], 'participant inherited entrypoint');
  const inherited: string[] = [];
  if (entrypoint !== null) {
    for (const argument of entrypoint) {
      if (typeof argument !== 'string') throw new Error('participant inherited argument malformed');
      inherited.push(argument);
    }
  }
  const argv = [...inherited, ...command];
  assertSame(argv[0], snapshot.native['Path'], 'participant effective executable');
  assertSame(argv.slice(1), snapshot.native['Args'], 'participant effective arguments');
  const mounts = orderMounts(snapshot.native['Mounts']).map((mount) => ({
    Type: mount['Type'],
    Source: mount['Source'],
    Destination: mount['Destination'],
    RW: mount['RW'],
  }));
  const expectedMounts =
    binding.role === 'backend'
      ? [
          { Type: 'bind', Source: binding.dataDirectory, Destination: '/data', RW: true },
          {
            Type: 'bind',
            Source: SOLVER_SUPERVISOR_HOST_DIRECTORY,
            Destination: SOLVER_SUPERVISOR_CONTAINER_DIRECTORY,
            RW: false,
          },
        ]
      : [];
  // Proof: an application shadow mount reached ingress before this fixed existing production-volume contract; both role negatives failed.
  assertSame(expectedMounts, mounts, 'participant fixed application mounts');
  const assignments = installed['Env'];
  if (!Array.isArray(assignments) || assignments.length > 4096)
    throw new Error('participant environment unsupported');
  const environment = new Map<string, string>();
  for (const assignment of assignments) {
    if (typeof assignment !== 'string' || Buffer.byteLength(assignment) > 65536)
      throw new Error('participant environment malformed');
    const split = assignment.indexOf('=');
    const name = assignment.slice(0, split);
    if (split < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || environment.has(name))
      throw new Error('participant environment ambiguous');
    environment.set(name, assignment.slice(split + 1));
  }
  if (environment.get('PORT') !== (binding.role === 'backend' ? '3100' : '3200'))
    throw new Error('participant role port differs');
  if (binding.role === 'backend' && environment.get('MIGRATE_ON_STARTUP') !== 'false')
    throw new Error('participant startup migration is not inhibited');
  if (
    binding.role === 'gateway' &&
    environment.get('BE_URL') !== `http://be-01-${binding.backendColor}:3100`
  )
    throw new Error('participant gateway backend differs');
}
