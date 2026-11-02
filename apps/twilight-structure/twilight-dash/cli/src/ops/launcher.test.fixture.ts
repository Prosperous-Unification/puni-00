import { monotonicClock, wallClock } from '../clock';
import { ampleHost } from '../resources/host-pool.test.fixture';
import { runHostJob } from './job-run';
import { fakeScopeTelemetry } from './ops.test.fixture';
import { OpsRefusal } from './refusal';

/**
 * `ops job run` as its own process over the fake scope seam, for what only a process shows: that
 * it ends with its job, and how it answers a signal.
 *
 * `<config> <cwd> <type> <fake cgroup root> <PATH> <sample interval ms> -- <payload…>`: prints
 * `refused <code> <message>` on stderr for a refusal and exits with the job's code.
 */
const words = process.argv.slice(2);
const [config, cwd, type, cgroupRoot, path, interval, separator] = Array.from(
  { length: 7 },
  (_, index) => words.at(index),
);
const argv = words.slice(7);
if (
  config === undefined ||
  cwd === undefined ||
  type === undefined ||
  cgroupRoot === undefined ||
  path === undefined ||
  interval === undefined ||
  separator !== '--'
)
  throw new Error('launcher fixture arguments');
try {
  process.exitCode = await runHostJob(
    { config, type, label: 'lane:process', waitSeconds: 0, pollSeconds: 1, argv },
    {
      clock: wallClock(),
      monotonic: monotonicClock(),
      environment: { ...process.env, PATH: path },
      cwd,
      report: (line) => process.stderr.write(`${line}\n`),
      telemetry: fakeScopeTelemetry(cgroupRoot),
      host: ampleHost,
      sampleIntervalMs: Number(interval),
      settleBudgetMs: 20_000,
      user: 'puni1',
    },
  );
} catch (cause) {
  if (!(cause instanceof OpsRefusal)) throw cause;
  process.stderr.write(`refused ${String(cause.exitCode)} ${cause.message}\n`);
  process.exitCode = cause.exitCode;
}
