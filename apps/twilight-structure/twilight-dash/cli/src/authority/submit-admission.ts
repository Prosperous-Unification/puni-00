import { readFileSync } from 'node:fs';

import { decodeAdmissionPacket } from '@twilight-burokrat/judge';

import { openAuthorityStore } from './authority-store';
import { submitPacket } from './submit';

const usage =
  'usage: twilight-dash submit-admission <repository> <packet-json> <staged|committed> <revision-or-base>';

/** Reads the packet file, refusing unreadable, non-UTF-8 and malformed JSON with its path. */
function readPacketJson(path: string): unknown {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`cannot read JSON input ${path}: ${detail}`, { cause });
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`JSON input ${path} is not UTF-8: ${detail}`, { cause });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`malformed JSON input ${path}: ${detail}`, { cause });
  }
}

/**
 * Freezes the selected candidate for a bound packet and prints the submission report as one JSON
 * line. Relocated unchanged from Burokrat's `submit-admission`; every failure is rethrown with the
 * detection-scope sentence so an operator never reads a refusal as an editing-time guard.
 *
 * @throws Error with the usage line when the argument count or selection kind is wrong.
 */
export function submitAdmission(argv: readonly string[], write: (text: string) => void): void {
  const [repository, packetPath, kind, revision] = argv;
  if (argv.length !== 4 || (kind !== 'staged' && kind !== 'committed')) {
    throw new Error(usage);
  }
  try {
    const packet = decodeAdmissionPacket(readPacketJson(packetPath));
    const store = openAuthorityStore(repository);
    try {
      const selection =
        kind === 'staged' ? ({ base: revision, kind } as const) : ({ kind, revision } as const);
      write(`${JSON.stringify(submitPacket(store, packet, repository, selection))}\n`);
    } finally {
      store.close();
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `${message}; violation was detected and publication refused at submission; editing-time writes were not prevented`,
      { cause },
    );
  }
}
