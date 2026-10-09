/** Drains a fixture supervisor's pipe while its bounded exit wait is live. */
export async function awaitPerformanceSupervisor(
  supervisor: Bun.Subprocess<'ignore', 'ignore', 'pipe'>,
  deadlineMs: number,
): Promise<{ exitCode: number; stderr: string }> {
  const stderrSource = new Response(supervisor.stderr).text();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const exitCode = await Promise.race([
      supervisor.exited,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Performance fixture supervisor timed out'));
        }, deadlineMs);
      }),
    ]);
    return { exitCode, stderr: await stderrSource };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (supervisor.exitCode === null) supervisor.kill('SIGKILL');
  }
}
