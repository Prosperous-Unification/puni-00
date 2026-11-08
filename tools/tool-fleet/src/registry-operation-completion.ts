/** Await the owned operation and its cleanup before settling. Preserve either sole rejection exactly, including nullish values; combine dual failures in operation/cleanup order with the original operation as cause. Cleanup failure never permits success-only restoration. */
export async function completeRegistryOperation<T>(
  operate: () => T | Promise<T>,
  close: () => Promise<void>,
): Promise<T> {
  let completion: { state: 'completed'; value: T } | { state: 'failed'; cause: unknown };
  try {
    // Proof: omitting operation execution fails the actual census dual-failure test.
    completion = { state: 'completed', value: await operate() };
  } catch (cause) {
    completion = { state: 'failed', cause };
  }
  let cleanup: { state: 'closed' } | { state: 'failed'; cause: unknown };
  try {
    // Proof: skipped or unawaited cleanup fails gated-close caller tests before the resource marker completes.
    await close();
    cleanup = { state: 'closed' };
  } catch (cause) {
    cleanup = { state: 'failed', cause };
  }
  // Proof: missing/reversed dual members or missing/replaced cause fail the actual census both-error test.
  if (completion.state === 'failed') {
    if (cleanup.state === 'failed')
      throw new AggregateError(
        [completion.cause, cleanup.cause],
        'Registry operation and cleanup failed',
        { cause: completion.cause },
      );
    // Proof: wrapping or dropping a sole operation rejection fails work-null/work-undefined caller tests.
    throw completion.cause;
  }
  // Proof: wrapping or dropping sole cleanup rejection fails cleanup-null/cleanup-undefined caller tests.
  if (cleanup.state === 'failed') throw cleanup.cause;
  // Proof: discarding the operation value fails actual restored-receipt schema validation.
  return completion.value;
}
