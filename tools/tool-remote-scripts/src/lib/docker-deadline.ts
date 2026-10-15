/** Docker CLI boundary; production terminates its child when the signal aborts. */
export type RunDocker = (args: string[], signal?: AbortSignal) => Promise<string>;

/** Bound an entire CLI/API call even if its injected runner does not cooperate. */
export async function runDockerBefore(
  args: string[],
  runDocker: RunDocker,
  deadline: number,
): Promise<string> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('Docker operation deadline exceeded');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Proof: stalled inspect/create/start/rm callbacks reject within the total deadline and receive abort.
    return await Promise.race([
      runDocker(args, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Docker operation deadline exceeded: ${args[0]}`));
        }, remaining);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Run the exact Docker CLI child with parallel pipe reads and hard abort. */
export async function runDockerCli(args: string[], signal?: AbortSignal): Promise<string> {
  const child = Bun.spawn(['docker', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    // Proof: omitting this signal left the exact stalled real CLI subprocess alive.
    signal,
    killSignal: 'SIGKILL',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`docker ${args.join(' ')} failed: ${stderr}`);
  return stdout;
}
