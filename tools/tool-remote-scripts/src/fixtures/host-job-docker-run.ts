import { hostJobContainerFlags } from '../lib/host-job-container-bound';

/**
 * `docker run <argv>` with {@link hostJobContainerFlags} placed after `run`: bounded and labelled
 * inside a Dash host job, the caller's argv exactly outside one. It exists for callers the
 * `scope:app` boundary keeps from importing the helper, such as be-01's orphan proof
 * (`optimization-orphan.proc.db.test.ts`), which spawns it by path as it does
 * `solver-supervisor-orphan-host.ts`. Docker's own stdio and exit status are this process's.
 */
const argv = process.argv.slice(2);
if (argv.length === 0) throw new Error('host job docker run: expected docker run arguments');
const docker = Bun.spawn(['docker', 'run', ...hostJobContainerFlags(process.env), ...argv], {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(await docker.exited);
