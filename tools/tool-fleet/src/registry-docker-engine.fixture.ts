import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const role = process.argv.at(2);
const mode = process.argv.at(3);
const directory = process.argv.at(4);
const architecture = process.argv.at(5);
if (
  (role !== 'containerd' && role !== 'dockerd') ||
  (architecture !== 'amd64' && architecture !== 'arm64') ||
  mode === undefined ||
  directory === undefined ||
  !/^\/tmp\/task8-docker-completion-[A-Za-z0-9]+$/.test(directory)
)
  throw new Error('Invalid owned substitute engine invocation');
const watchdog = setTimeout(() => {
  process.exit(70);
}, 10000);
process.once('SIGTERM', () => {
  if (role === 'containerd' && mode === 'stubborn') return;
  setTimeout(() => {
    clearTimeout(watchdog);
    process.exit(role === 'containerd' && mode.split('+').includes('exit') ? 17 : 0);
  }, 250);
});
console.log('owned substitute engine');
console.error('owned substitute diagnostics');
const marker = join(directory, role + '-' + architecture + '.ready');
const pending = marker + '.pending';
// Proof: delaying the real marker write exposed an empty ready file to the Docker caller; the operation-report+diagnostics-report+summary-report case failed before its intended primary error. A sibling write followed by rename keeps the same paused-write witness absent until complete.
await writeFile(pending, 'ready', { mode: 0o600, flag: 'wx' });
await rename(pending, marker);
