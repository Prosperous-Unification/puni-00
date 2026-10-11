import { wallClock } from './authority/clock';
import { runDash, runFleetPlan } from './cli';

await runDash(process.argv.slice(2), {
  clock: wallClock(),
  planEnrollment: runFleetPlan,
  stdout: process.stdout,
});
