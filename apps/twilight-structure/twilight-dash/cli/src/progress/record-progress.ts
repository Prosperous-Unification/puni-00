import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

import type { type } from '@shared/validation';
import { parseOrThrow } from '@shared/validation';
import {
  canonicalJson,
  checkProgressReceiptConsistency,
  digestOf,
  PlanReferenceRecord,
  PlanTasks,
  ProgressReceiptRecord,
} from '@twilight-burokrat/contracts';

const flags = ['--entries', '--plan-reference', '--tasks', '--output'] as const;
type Flag = (typeof flags)[number];
const usage = `usage: dash record-progress ${flags.map((flag) => `${flag} <path>`).join(' ')}`;

/** Strict grammar is resolved before any file is opened; diagnostics never echo operands. */
function parseFlags(argv: readonly string[]): (flag: Flag) => string {
  const allowed = new Set<string>(flags);
  const values = new Map<string, string>();
  for (let position = 0; position < argv.length; position += 2) {
    const flag = argv.at(position);
    // Proof: removing the allowlist reached an absent entries file instead of the invocation
    // refusal in `invocation unknown refuses before reading` (2026-10-15).
    if (flag === undefined || !allowed.has(flag)) throw new Error(usage);
    // Proof: removing duplicate rejection made the repeated-flag production test read inputs.
    if (values.has(flag)) throw new Error(usage);
    const value = argv.at(position + 1);
    // Proof: removing value rejection lost the usage refusal in the empty-value CLI test.
    if (value === undefined || value.trim().length === 0 || value.startsWith('--')) {
      throw new Error(usage);
    }
    values.set(flag, value);
  }
  // Proof: removing required-flag rejection lost the usage refusal in the missing-flags test.
  for (const flag of flags) if (!values.has(flag)) throw new Error(usage);
  return (flag) => {
    const value = values.get(flag);
    if (value === undefined) throw new Error('parsed progress flag is absent');
    return value;
  };
}

/** Reads once and refuses malformed bytes without quoting parser messages or file contents. */
function readJson(path: string, role: string): unknown {
  let bytes: Buffer;
  try {
    // Proof: skipping the entries read lost its missing-file refusal in the production CLI test.
    // Missing and mode-000 unreadable inputs are exercised for all three roles as non-root.
    bytes = readFileSync(path);
  } catch (cause) {
    const missing = cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
    throw new Error(`${role} is ${missing ? 'missing' : 'unreadable'}: ${JSON.stringify(path)}`, {
      cause,
    });
  }
  try {
    // Proof: replacement UTF-8 decoding lost the entries-malformed refusal for a quoted 0xff
    // byte in `entries input utf8 refuses safely` (2026-10-15).
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error(`${role} is malformed: ${JSON.stringify(path)}`, { cause });
  }
}

/** Decodes the existing contract at the file boundary, retaining diagnostic causes privately. */
function decodeRecord<Shape extends type.Any>(
  shape: Shape,
  input: unknown,
  role: string,
): Shape['infer'] {
  try {
    // Proof: independently skipping the reference, tasks and receipt decoders admitted their
    // extra keys in the production referenceExtra, tasksExtra and entries-extra tests.
    return parseOrThrow(shape, input);
  } catch (cause) {
    throw new Error(`${role} is malformed`, { cause });
  }
}

/**
 * Publishes only a new owner-only file; validation must precede this call. A write or close
 * failure removes only this invocation's output. Cleanup failure retains both failure causes.
 */
function publishReceipt(path: string, bytes: string): void {
  let descriptor: number;
  try {
    // Proof: replacing wx with w overwrote the existing-file fixture; omitting 0600
    // produced mode 0644 in the canonical-v9 production test (2026-10-15).
    descriptor = openSync(path, 'wx', 0o600);
  } catch (cause) {
    throw new Error(`cannot create progress receipt: ${JSON.stringify(path)}`, { cause });
  }
  let closed = false;
  try {
    writeFileSync(descriptor, bytes, 'utf8');
    // Mark before close: a failed close must not close a potentially reused descriptor twice.
    closed = true;
    closeSync(descriptor);
  } catch (cause) {
    const failures: unknown[] = [cause];
    if (!closed) {
      try {
        closeSync(descriptor);
      } catch (failure) {
        failures.push(failure);
      }
    }
    try {
      // Proof: omitting unlink retained a partial file in the injected write-failure CLI test.
      unlinkSync(path);
    } catch (failure) {
      failures.push(failure);
    }
    throw new AggregateError(
      failures,
      failures.length > 1 ? 'progress receipt cleanup failed' : 'cannot publish progress receipt',
      { cause },
    );
  }
}

/**
 * Records explicit operator assertions as an existing v1 progress receipt. Copies the complete
 * PlanRef and preserves entries, timestamps and optional measures; evidence is not read or
 * authenticated. No clock, CheckRun, authority store or current WBS state contributes meaning.
 * The existing person/MCP workflow owns application of Navigator's proposed commands.
 *
 * @throws on invalid invocation, missing/unreadable/malformed inputs, inconsistent planning
 * documents or failed exclusive publication. Nothing is acknowledged before write and close.
 */
export function recordProgress(argv: readonly string[], write: (text: string) => unknown): void {
  const value = parseFlags(argv);
  const entries = readJson(value('--entries'), 'entries');
  const reference = decodeRecord(
    PlanReferenceRecord,
    readJson(value('--plan-reference'), 'plan reference'),
    'plan reference',
  );
  const tasks = decodeRecord(PlanTasks, readJson(value('--tasks'), 'task export'), 'task export');
  const body = { schemaVersion: 1, kind: 'progress-receipt', planRef: reference.planRef, entries };
  const receipt = decodeRecord(
    ProgressReceiptRecord,
    { ...body, receiptDigest: digestOf(body) },
    'progress receipt',
  );
  try {
    // Proof: removing shared consistency emitted an unknown-step receipt in the production
    // unknownStep refusal test (2026-10-15).
    checkProgressReceiptConsistency(receipt, reference, tasks);
  } catch (cause) {
    // Proof: rethrowing the checker cause exposed SECRET plus a forged newline in the
    // production `consistency diagnostics never expose untrusted step text or newline` test.
    throw new Error('progress inputs are inconsistent', { cause });
  }
  // Proof: acknowledging before publication leaked stdout in the injected write-failure test.
  publishReceipt(value('--output'), `${canonicalJson(receipt)}\n`);
  write(`${receipt.receiptDigest}\n`);
}
