/** Exact Docker exec streaming boundary: NUL tokens, bounded output and an explicit ACK handshake. */
export type DockerExec = (
  args: string[],
  nonce: string,
  consume: (token: string) => boolean,
  signal?: AbortSignal,
) => Promise<void>;

/**
 * Read bounded stdout/stderr concurrently. Protocol refusal closes input and kills
 * only the exact CLI; the immutable target supervisor independently kills its
 * verified private process group on EOF/deadline. Its initialized PID1 must reap.
 */
export const runDockerExec: DockerExec = async (args, nonce, consume, signal) => {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(nonce)) throw new Error('exec nonce is malformed');
  const child = Bun.spawn(['docker', ...args], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    // Proof: omission left the exact real stalled CLI alive; the fixture hard-abort test failed.
    signal,
    killSignal: 'SIGKILL',
  });
  const failures: unknown[] = [];
  let acknowledged = false;
  let stderr = '';
  const refuse = async (cause: unknown): Promise<void> => {
    failures.push(cause);
    child.kill('SIGKILL');
    try {
      await child.stdin.end();
    } catch (closeCause) {
      failures.push(new Error('exec input close failed', { cause: closeCause }));
    }
  };
  const stdoutWork = async (): Promise<void> => {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffered = '';
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        // Proof: omitting this bound failed the oversized stdout production-runner negative.
        if (bytes > 32 * 1024 * 1024) throw new Error('exec receipt output bound exceeded');
        buffered += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = buffered.indexOf('\0')) >= 0) {
          const token = buffered.slice(0, boundary);
          buffered = buffered.slice(boundary + 1);
          if (consume(token)) {
            if (acknowledged) throw new Error('exec requested duplicate ACK');
            acknowledged = true;
            await child.stdin.write(`ACK ${nonce}\n`);
            await child.stdin.end();
          }
        }
      }
      buffered += decoder.decode();
      // Proof: omitting framing completeness admitted the exact CLI's unterminated token.
      if (buffered !== '' || !acknowledged) throw new Error('exec receipt is incomplete');
    } catch (cause) {
      await refuse(cause);
    } finally {
      reader.releaseLock();
    }
  };
  const stderrWork = async (): Promise<void> => {
    const reader = child.stderr.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        // Proof: omission failed the oversized stderr production-runner negative.
        if (bytes > 65536) throw new Error('exec stderr output bound exceeded');
        stderr += decoder.decode(chunk.value, { stream: true });
      }
      stderr += decoder.decode();
      // Proof: omission failed the nonempty-stderr production-runner negative.
      if (stderr !== '') throw new Error(`exec metadata command reported stderr: ${stderr}`);
    } catch (cause) {
      await refuse(cause);
    } finally {
      reader.releaseLock();
    }
  };
  const [, , code] = await Promise.all([stdoutWork(), stderrWork(), child.exited]);
  if (failures.length > 1)
    throw new AggregateError(failures, 'exec metadata protocol failed', { cause: failures.at(0) });
  const failure = failures.at(0);
  if (failure instanceof Error) throw failure;
  if (failure !== undefined)
    throw new Error('exec failed with a non-error cause', { cause: failure });
  if (code !== 0) throw new Error(`exact Docker exec exited ${code.toString()}`);
};
