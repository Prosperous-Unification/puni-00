import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isLockCommand, parseDashCommand } from '../../cli-parser';
import { createLockOwner } from '../lock';
const startGate = process.env['PUNI_LOCK_FIXTURE_START_GATE'];
if (startGate !== undefined) {
  writeFileSync(startGate + '.spawned', String(process.pid));
  const deadline = performance.now() + 12000;
  while (!existsSync(startGate)) {
    if (performance.now() >= deadline) throw new Error('private holder startup gate missing');
    await Bun.sleep(10);
  }
}
const silentOutput = process.env['PUNI_LOCK_FIXTURE_SILENT_OUTPUT'];
if (silentOutput !== undefined) {
  // This owned fixture faults only diagnostic delivery; inherited physical FD1/FD2 stay real.
  Object.defineProperty(Bun, 'stderr', {
    value: {
      writer: () => ({
        write(bytes: Uint8Array) {
          writeFileSync(silentOutput, 'suppressed');
          return bytes.byteLength;
        },
        flush() {
          return 0;
        },
        unref() {
          return undefined;
        },
      }),
    },
  });
}
const args = process.argv.slice(2),
  path = args.at(0);
if (path === undefined) throw new Error('lock fixture path missing');
const command = parseDashCommand(args.slice(1));
if (!isLockCommand(command)) throw new Error('lock fixture command mismatch');
const environment = { ...process.env };
let directory = process.cwd();
const capture = process.env['PUNI_HOLDER_R5_CAPTURE'];
if (capture !== undefined)
  writeFileSync(
    join(capture, 'owner-child-input.json'),
    JSON.stringify(
      {
        args,
        directory,
        mutation: process.env['PUNI_LOCK_FIXTURE_MUTATION'],
        decoy: process.env['PUNI_LOCK_FIXTURE_DECOY'],
        captureValue: process.env['PUNI_OWNER_CAPTURE_VALUE'],
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
const owner = createLockOwner(async () => {
  await Promise.resolve();
  const mutation = process.env['PUNI_LOCK_FIXTURE_MUTATION'];
  if (mutation === 'environment') environment['PUNI_OWNER_CAPTURE_VALUE'] = 'mutated';
  if (mutation === 'directory') {
    const decoy = process.env['PUNI_LOCK_FIXTURE_DECOY'];
    if (decoy === undefined) throw new Error('directory mutation decoy missing');
    directory = decoy;
  }
  if (mutation === 'hold-file')
    Object.assign(command, { holdFile: process.env['PUNI_LOCK_FIXTURE_DECOY'] });
  if (mutation === 'run-to-status') Object.assign(command, { words: 'lock status' });
  if (mutation === 'status-to-run')
    Object.assign(command, {
      words: 'lock run',
      argv: [process.execPath, process.env['PUNI_LOCK_FIXTURE_DECOY']],
      label: 'mutated',
      waitSeconds: 0,
      pollSeconds: 5,
    });
  if (mutation === 'argv') {
    if (!('argv' in command)) throw new Error('run mutation needs argv');
    Object.assign(command.argv, { 1: process.env['PUNI_LOCK_FIXTURE_DECOY'] });
    Object.assign(command, {
      argv: [process.execPath, process.env['PUNI_LOCK_FIXTURE_DECOY']],
      label: 'bad' + String.fromCharCode(10) + 'label',
      waitSeconds: -1,
      pollSeconds: 0,
    });
  }
  return path;
});
const status = await owner(command, {
  get callerDirectory() {
    if (process.env['PUNI_LOCK_FIXTURE_CAPTURE_FAIL'] === '1')
      throw new Error('private capture sentinel');
    return directory;
  },
  environment,
});
process.exit(status);
