import { inspectWorkerCapability } from './capability';

const capability = inspectWorkerCapability();
if (capability.kind === 'unavailable') {
  for (const reason of capability.reasons) console.error(`worker unavailable: ${reason}`);
  process.exitCode = 1;
} else {
  console.error('worker unavailable: installed isolation acceptance has not run');
  process.exitCode = 1;
}
