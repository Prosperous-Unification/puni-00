/** Waits for every registered fixture and preserves all cleanup failures, including synchronous throws. */
export async function closeFixtures(
  fixtures: readonly { close(): Promise<void> }[],
): Promise<void> {
  // Proof: L6a returned before real fixture settlements; shared held-writer cleanup failed SQLITE-LIFECYCLE-30 on premature completion. Exact restoration passed.
  const settled = await Promise.allSettled(
    // Proof: L6b removed this async callback boundary; a synchronous close throw failed SQLITE-LIFECYCLE-37 instead of preserving both causes after attempting real peers. Exact restoration passed.
    fixtures.map(async (fixture) => {
      await fixture.close();
    }),
  );
  const failures: unknown[] = [];
  for (const completion of settled) {
    if (completion.status === 'rejected') {
      const failure: unknown = completion.reason;
      failures.push(failure);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'store fixture cleanup failed');
}
