import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { type } from 'arktype';

const Bytes = type('number.integer >= 0').atMost(8589934592 + 1048576);
const Digits = type('string').matching(/^[0-9]+$/);
// Proof: projection-boundary bypass admits foreign keys, wrong coverage and malformed identities in the CLI test.
const Receipt = type({
  provider: "'linux-fiemap'",
  inspectorVersion: '1',
  observations: type({ kernelRelease: 'string>0', pythonVersion: 'string>0' }).onUndeclaredKey(
    'reject',
  ),
  identity: type({
    device: Digits,
    inode: Digits,
    owner: 'number.integer >= 0',
    mode: "'0600'",
    links: '1',
    mtimeNs: Digits,
    ctimeNs: Digits,
  }).onUndeclaredKey('reject'),
  expectedBytes: Bytes,
  allocatedBytes: Bytes,
  allocationOverheadBytes: 'number.integer >= 0 & number <= 1048576',
  coverageBytes: Bytes,
  extentCount: 'number.integer >= 1 & number <= 65536',
  pageCount: 'number.integer >= 1 & number <= 128',
  metadataBytes: 'number.integer >= 1 & number <= 4194304',
  mapDigest: type('string').matching(/^[0-9a-f]{64}$/),
})
  .onUndeclaredKey('reject')
  .narrow(
    (receipt) =>
      receipt.expectedBytes > 0 &&
      receipt.expectedBytes <= 8589934592 &&
      receipt.expectedBytes % 4096 === 0 &&
      receipt.coverageBytes === receipt.expectedBytes &&
      receipt.allocatedBytes % 4096 === 0 &&
      receipt.allocatedBytes - receipt.expectedBytes === receipt.allocationOverheadBytes &&
      receipt.extentCount >= receipt.pageCount &&
      receipt.extentCount <= receipt.pageCount * 512 &&
      receipt.metadataBytes === receipt.pageCount * 32 + receipt.extentCount * 56,
  );

export type RawAllocation = typeof Receipt.infer;
export type RawAllocationFailure =
  | 'invalid-arguments'
  | 'dependency-unavailable'
  | 'helper-refused'
  | 'helper-malformed'
  | 'helper-output-bound'
  | 'inspection-timeout'
  | 'input-absent'
  | 'input-unreadable';

/** Public diagnostic categories exclude private paths and subprocess diagnostics. */
export class RawAllocationRefusal extends Error {
  constructor(readonly category: RawAllocationFailure) {
    super(`raw allocation: ${category}`);
  }
}

/**
 * Inspect an existing Linux raw file through the adjacent source Python helper.
 * Invoke with Bun from source; distributing this module requires keeping its .py sibling.
 * Throws a typed refusal for missing runtime/helper, unsafe files or malformed projections.
 * No allocation, conversion, filesystem synchronization or disk-content reads occur.
 */
export async function inspectRawAllocation(
  path: string,
  expectedBytes: number,
): Promise<RawAllocation> {
  // Proof: caller-argument-boundary removal loses the invalid-length production-consumer diagnostic.
  if (
    path.trim() === '' ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    expectedBytes > 8589934592 ||
    expectedBytes % 4096 !== 0
  ) {
    throw new RawAllocationRefusal('invalid-arguments');
  }
  const helper = fileURLToPath(new URL('./lab-raw-allocation.py', import.meta.url));
  try {
    // Proof: hiding the adjacent helper returns dependency-unavailable; missing Python has a separate CLI negative.
    await access(helper, constants.R_OK);
  } catch {
    // Proof: restoring raw causes exposes dependency errors to the direct API cause/inspect regression.
    throw new RawAllocationRefusal('dependency-unavailable');
  }
  let invocation: Bun.SyncSubprocess<'pipe', 'pipe'>;
  try {
    // Proof: PYTHONPATH sitecustomize injection breaks the startup-isolation positive without -I.
    invocation = Bun.spawnSync(['python3', '-I', '-B', helper, path, String(expectedBytes)], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 12000,
      killSignal: 'SIGKILL',
      maxBuffer: 65536,
    });
  } catch {
    // Proof: restoring raw causes exposes dependency errors to the direct API cause/inspect regression.
    throw new RawAllocationRefusal('dependency-unavailable');
  }
  // Proof: removing maxBuffer admits the oversized projection; stderr padding has the same CLI control.
  if (invocation.exitedDueToMaxBuffer) throw new RawAllocationRefusal('helper-output-bound');
  // Proof: a required helper replaced by exec sleep 30 is killed and the actual CLI reports inspection-timeout.
  if (invocation.exitedDueToTimeout) throw new RawAllocationRefusal('inspection-timeout');
  const stdout = invocation.stdout.toString();
  const stderr = invocation.stderr.toString();
  const exitCode = invocation.exitCode;
  if (exitCode !== 0) {
    if (stderr.trim() === 'raw-input-absent') throw new RawAllocationRefusal('input-absent');
    if (stderr.trim() === 'raw-input-unreadable')
      throw new RawAllocationRefusal('input-unreadable');
    if (stderr.trim() === 'raw-inspection-bound')
      throw new RawAllocationRefusal('inspection-timeout');
    throw new RawAllocationRefusal('helper-refused');
  }
  let projection: unknown;
  try {
    projection = JSON.parse(stdout);
  } catch {
    // Proof: restoring the JSON parser cause exposes PRIVATE child tokens in the direct API inspect regression.
    throw new RawAllocationRefusal('helper-malformed');
  }
  const receipt = Receipt(projection);
  if (receipt instanceof type.errors || stderr !== '' || receipt.expectedBytes !== expectedBytes) {
    throw new RawAllocationRefusal('helper-malformed');
  }
  return receipt;
}
