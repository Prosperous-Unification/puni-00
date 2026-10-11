/** Drains a fixture supervisor's pipe and exit under one deadline. */
export async function awaitPerformanceSupervisor(
  supervisor: Bun.Subprocess<'ignore', 'ignore', 'pipe'>,
  deadlineMs: number,
): Promise<{ exitCode: number; stderr: string }> {
  const reader = supervisor.stderr.getReader();
  const stderrSource = (async (): Promise<string> => {
    const chunks: Buffer[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks).toString();
      chunks.push(Buffer.from(next.value));
    }
  })();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  try {
    const [exitCode, stderr] = await Promise.race([
      Promise.all([supervisor.exited, stderrSource]),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Performance fixture supervisor timed out'));
        }, deadlineMs);
      }),
    ]);
    completed = true;
    return { exitCode, stderr };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (supervisor.exitCode === null) supervisor.kill('SIGKILL');
    // Proof: a shell wrapper exited while its background sleep held stderr;
    // the old exit-only race waited for pipe EOF beyond the deadline.
    if (!completed) await reader.cancel('Performance fixture supervisor deadline');
  }
}
