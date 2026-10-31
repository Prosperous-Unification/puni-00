import { InvalidResourceReading, parseResourceReading, type ResourceState } from './resources';
import { resourceProgram } from './resources-program';
import { executeBounded } from './source';

/** Fixed authenticated provider, one ten-second deadline, existing capped capture; cancellation never yields measurements. */
export function createResourceReader(sshExecutable = 'ssh') {
  return async (parent: AbortSignal): Promise<ResourceState> => {
    // Proof: lifting this deadline fails ten-second deadline's actual blocked-process test.
    const signal = AbortSignal.any([parent, AbortSignal.timeout(10000)]);
    const unavailable = (
      reason: Extract<ResourceState, { state: 'unavailable' }>['reason'],
    ): ResourceState => ({ state: 'unavailable', reason, checkedAt: Date.now() });
    try {
      // Proof: disabling strict host keys fails the actual fixed-argv SSH fixture.
      const captured = await executeBounded(
        [
          sshExecutable,
          '-o',
          'BatchMode=yes',
          '-o',
          'StrictHostKeyChecking=yes',
          '-o',
          'ConnectTimeout=5',
          'h3mon',
          'sudo',
          '-n',
          'python3',
          '-',
        ],
        resourceProgram,
        signal,
      );
      // Proof: ignoring failed SSH exit fails its source-unavailable assertion.
      if (captured.exitCode !== 0) return unavailable('source-unavailable');
      let external: unknown;
      try {
        external = JSON.parse(captured.stdout);
      } catch (error) {
        // Proof: removing malformed-JSON recovery fails rejects malformed.
        if (error instanceof SyntaxError) return unavailable('invalid-reading');
        throw error;
      }
      const checkedAt = Date.now();
      return { state: 'complete', checkedAt, reading: parseResourceReading(external, checkedAt) };
    } catch (error) {
      // Proof: removing cancellation recovery fails rejects blocked.
      if (signal.aborted) return unavailable('deadline');
      // Proof: independently removing size/reading recovery fails rejects oversize/stale.
      if (error instanceof RangeError || error instanceof InvalidResourceReading)
        return unavailable('invalid-reading');
      throw error;
    }
  };
}
