/** Runs the test body and every ordered cleanup, retaining independent body/request/native failures after all owned resources have been attempted. */
export async function settleFixture(
  body: () => void | Promise<void>,
  cleanups: readonly (() => void | Promise<void>)[],
) {
  const failures: unknown[] = [];
  try {
    await body();
  } catch (cause) {
    failures.push(cause);
  }
  for (const cleanup of cleanups) {
    try {
      await Promise.resolve().then(cleanup);
    } catch (cause) {
      if (!failures.includes(cause)) failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'compatibility operation and cleanup failed');
}

/** Runs every rollback with the original construction cause when a later acquisition rejects. */
export async function constructFixture<T>(
  create: () => T | Promise<T>,
  cleanups: readonly ((cause: unknown) => void | Promise<void>)[],
): Promise<T> {
  try {
    return await create();
  } catch (cause) {
    // Proof: I2-construction bypassed this rollback; real receiver/inspection stores remained readable and bootstrap/old-fixture directories remained owned. Restored controls passed.
    await settleFixture(
      () => {
        throw cause;
      },
      cleanups.map((cleanup) => () => cleanup(cause)),
    );
    throw cause;
  }
}
