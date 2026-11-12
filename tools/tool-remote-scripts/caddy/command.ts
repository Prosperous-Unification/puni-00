import {
  hostJobContainerFlags,
  type HostJobEnvironment,
} from '../src/lib/host-job-container-bound';
import { CADDY_IMAGE } from './image';

/** Where one disposable test Caddy reads its configuration and what it is called. */
export interface TestCaddy {
  /** The scratch directory holding `Caddyfile`, mounted read-only at `/test` in the container. */
  readonly scratch: string;
  readonly configurationPath: string;
  readonly container: string;
  /** `MCP_CADDY_BINARY`: a native development Caddy instead of the pinned container. */
  readonly binary: string | undefined;
}

/**
 * The argv that starts the boundary tests' Caddy. The pinned container takes
 * {@link hostJobContainerFlags}: inside a Dash host job it runs bounded and labelled (J16),
 * outside one its argv is as before. A native binary is a plain child process, already inside
 * the job's scope.
 */
export function buildTestCaddyCommand(caddy: TestCaddy, environment: HostJobEnvironment): string[] {
  if (caddy.binary !== undefined) return [caddy.binary, 'run', '--config', caddy.configurationPath];
  return [
    'docker',
    'run',
    '--rm',
    ...hostJobContainerFlags(environment),
    '--name',
    caddy.container,
    '--network=host',
    '--volume',
    `${caddy.scratch}:/test:ro`,
    CADDY_IMAGE,
    'caddy',
    'run',
    '--config',
    '/test/Caddyfile',
  ];
}
