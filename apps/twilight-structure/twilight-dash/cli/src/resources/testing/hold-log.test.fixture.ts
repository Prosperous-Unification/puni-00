import { fstatSync, lstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readReservation } from '../hold-log';
import { identifySelf } from '../process-identity';
const args = process.argv.slice(2),
  holdFile = args.at(0),
  record = args.at(1),
  pid = args.at(2),
  boot = args.at(3),
  start = args.at(4);
if (
  holdFile === undefined ||
  record === undefined ||
  pid === undefined ||
  boot === undefined ||
  start === undefined
)
  throw new Error('log fixture arguments missing');
try {
  const controller =
    process.env['PUNI_LOG_CONTROLLER_FAULT'] === 'self'
      ? identifySelf()
      : {
          pid: Number(pid),
          boot: process.env['PUNI_LOG_CONTROLLER_FAULT'] === 'malformed' ? 'malformed' : boot,
          start,
        };
  const capture = process.env['PUNI_HOLDER_R5_CAPTURE'];
  if (capture !== undefined)
    writeFileSync(
      join(
        capture,
        'log-' + (process.env['PUNI_LOG_CONTROLLER_FAULT'] ?? 'bound') + '-child-input.json',
      ),
      JSON.stringify(
        {
          controller,
          helper: identifySelf(),
          stdout: fstatSync(1, { bigint: true }),
          stderr: fstatSync(2, { bigint: true }),
          named: lstatSync(holdFile + '.log', { bigint: true }),
        },
        (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
  const reservation = readReservation(holdFile, controller);
  writeFileSync(
    record,
    JSON.stringify({
      controller: reservation.controller,
      path: reservation.path,
      device: reservation.device.toString(),
      inode: reservation.inode.toString(),
    }),
  );
  process.exit(0);
} catch (_cause) {
  process.stderr.write('error: log reservation refused' + String.fromCharCode(10));
  process.exit(70);
}
