/** Run an owned fixture operation, then every required cleanup in order. Preserve a sole failure exactly; aggregate operation and cleanup failures in observation order with the first cause. Cleanup must validate its own resource ownership before destructive effects. */
export async function completeRegistryFixture<T>(
  operate: () => Promise<T>,
  closes: readonly [() => Promise<void>, ...(() => Promise<void>)[]],
): Promise<T> {
  let completion: { state: 'completed'; value: T } | { state: 'failed'; cause: unknown };
  try {
    completion = { state: 'completed', value: await operate() };
  } catch (cause) {
    completion = { state: 'failed', cause };
  }
  const failures: unknown[] = [];
  if (completion.state === 'failed') failures.push(completion.cause);
  // Proof: skipped/unawaited cleanup or stopping after the first fault fails real-file/awaited-close cases in registry-fixture-completion.test.ts.
  for (const close of closes) {
    try {
      await close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  // Proof: discarded/reversed members or missing cause fail the operation+both and both cleanup cases.
  if (failures.length > 1)
    throw new AggregateError(failures, 'Owned registry fixture operation and cleanup failed', {
      cause: failures[0],
    });
  // Proof: replacing the sole operation cause loses exact Error/AggregateError/nullish/string witnesses.
  if (completion.state === 'failed') throw completion.cause;
  // Proof: removing sole cleanup refusal turns the first/second fault cases into fulfillment.
  if (failures.length === 1) throw failures[0];
  return completion.value;
}
