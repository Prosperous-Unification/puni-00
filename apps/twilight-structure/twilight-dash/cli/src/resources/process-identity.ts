import { readFileSync } from 'node:fs';

export interface Identity {
  readonly pid: number;
  readonly boot: string;
  readonly start: string;
}

/** Read the current Linux process birth identity; token encoding validates its native fields. */
export function identifySelf(): Identity {
  // Proof: self-platform identified through valid Linux proc files while reporting darwin without this gate.
  if (process.platform !== 'linux') throw new Error('durable hold identity requires Linux');
  // Proof: self-required-* broke the healthy identity probe with explicit ENOENT/EACCES; reader errors propagate.
  const source = readFileSync('/proc/self/stat', 'utf8'),
    end = source.lastIndexOf(')');
  const start = source
    .slice(end + 2)
    .split(' ')
    .at(19);
  // Proof: self-malformed returned an incomplete identity for malformed trusted stat without this guard.
  if (end < 0 || start === undefined) throw new Error('durable hold process identity is malformed');
  return {
    pid: process.pid,
    boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    start,
  };
}
