import { lstat, mkdtemp, rm } from 'node:fs/promises';

/** Own private fixture scratch through publication and required diagnostics. Preserve the exact publication rejection; report and cleanup failures follow it in an AggregateError. Refuse deletion when scratch metadata cannot establish current directory ownership and mode. */
export async function withRegistryPopulationScratch<T>(
  run: (directory: string) => Promise<T>,
  report: (cause: unknown) => void | Promise<void>,
): Promise<T> {
  const directory = await mkdtemp('/tmp/task8-populated-');
  const removeScratch = async () => {
    // Proof: missing scratch and the isolated unreadable-metadata case reject instead of guessing safe cleanup.
    const metadata = await lstat(directory);
    // Proof: removing kind/current-UID/mode admission deletes the replacement file, foreign-UID or mode-0750 scratch in registry-population-scratch.test.ts.
    if (
      !metadata.isDirectory() ||
      metadata.uid !== process.getuid?.() ||
      (metadata.mode & 0o777) !== 0o700
    )
      throw new Error('Owned population scratch identity changed');
    // Proof: omitting removal leaves actual content after success or a reported publication rejection.
    await rm(directory, { recursive: true });
  };
  let completed: T;
  try {
    completed = await run(directory);
  } catch (cause) {
    const failures: unknown[] = [cause];
    try {
      // Proof: skipping reporting or its await loses the real report file or asynchronous report failure.
      await report(cause);
    } catch (reporting) {
      // Proof: dropping this cause masks required synchronous/asynchronous diagnostics in the report-failure cases.
      failures.push(reporting);
    }
    try {
      await removeScratch();
    } catch (cleaning) {
      // Proof: dropping this cause hides mode/missing/file cleanup failure after a publication rejection.
      failures.push(cleaning);
    }
    // Proof: the three-way failure case rejects discarded/reordered members or a lost original cause.
    if (failures.length > 1)
      throw new AggregateError(failures, 'Population completion failed', { cause });
    throw cause;
  }
  await removeScratch();
  return completed;
}
