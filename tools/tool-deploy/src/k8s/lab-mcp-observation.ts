import { redactDiagnostic } from './lab-diagnostics';

/** Commands report exit status so only modeled Kubernetes lifecycle races can recover. */
export interface McpObservationEffects {
  invoke(
    args: readonly string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  now(): number;
  sleep(ms: number): Promise<void>;
}
interface Termination {
  exitCode: number;
  containerID: string;
}
interface McpPod {
  name: string;
  uid: string;
  deleting: boolean;
  terminated?: Termination;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('malformed MCP pod observation');
  // Boundary: non-null, non-array object checked above; values remain unknown.
  return value as Record<string, unknown>;
}
function readText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('malformed MCP pod identity');
  return value;
}
function decodePods(stdout: string): McpPod[] {
  const list = readRecord(JSON.parse(stdout));
  if (!Array.isArray(list['items'])) throw new Error('malformed MCP pod list');
  return list['items'].map((entry: unknown) => {
    const pod = readRecord(entry);
    const metadata = readRecord(pod['metadata']);
    const deletion = metadata['deletionTimestamp'];
    if (deletion !== undefined && deletion !== null) readText(deletion);
    const parsed: McpPod = {
      name: readText(metadata['name']),
      uid: readText(metadata['uid']),
      deleting: deletion !== undefined && deletion !== null,
    };
    if (pod['status'] === undefined) return parsed;
    const statuses = readRecord(pod['status'])['containerStatuses'];
    if (statuses === undefined) return parsed;
    if (!Array.isArray(statuses)) throw new Error('malformed MCP container statuses');
    for (const status of statuses) {
      const container = readRecord(status);
      if (readText(container['name']) !== 'mcp') continue;
      if (container['lastState'] === undefined) continue;
      const terminated = readRecord(container['lastState'])['terminated'];
      if (terminated === undefined) continue;
      const termination = readRecord(terminated);
      const exitCode = termination['exitCode'];
      if (typeof exitCode !== 'number' || !Number.isSafeInteger(exitCode) || exitCode < 0)
        throw new Error('malformed MCP exit code');
      parsed.terminated = { exitCode, containerID: readText(termination['containerID']) };
    }
    return parsed;
  });
}
function isLifecycleUnavailable(stderr: string, pod: McpPod | undefined): boolean {
  if (pod === undefined) return false;
  const message = stderr.trim();
  // Proof: accepting a foreign pod or malformed runtime ID broke the unrelated-log negatives.
  const missing = /^Error from server \(NotFound\): pods? "([^"\n]+)" not found$/.exec(message);
  if (missing !== null) return missing[1] === pod.name;
  const previous =
    /^Error from server \(BadRequest\): previous terminated container "mcp" in pod "([^"\n]+)" not found$/.exec(
      message,
    );
  if (previous !== null) return previous[1] === pod.name;
  const unavailable = /^unable to retrieve container logs for (containerd:\/\/[a-f0-9]{64})$/.exec(
    message,
  );
  return unavailable !== null;
}

/**
 * Restart MCP, then require one replacement UID and terminated container ID to retain both
 * a nonzero exit and the missing-key log across a second status read. Only pod/log lifecycle
 * unavailability retries; malformed state and all other command failures throw immediately.
 * Every command and sleep shares the same deadline. Errors contain only redacted diagnostics.
 */
export async function observeMissingMcpKey(
  effects: McpObservationEffects,
  secrets: readonly string[],
  timeoutMs = 180_000,
): Promise<string> {
  const deadline = effects.now() + timeoutMs;
  let observed = 'no replacement MCP container has terminated yet';
  const expired = () =>
    new Error(
      `ASSERTION FAILED: MCP pod without a store key exits non-zero and names the key in its log; last seen: ${redactDiagnostic(observed, secrets)}`,
    );
  const invoke = async (
    args: readonly string[],
    recover: boolean,
    pod?: McpPod,
  ): Promise<string | null> => {
    // Proof: inflating the subprocess budget broke the deadline-cap negative; the
    // command-time test also spends restart/read time from the same deadline.
    const remaining = deadline - effects.now();
    if (remaining <= 0) throw expired();
    const invocation = await effects.invoke(
      [`--request-timeout=${String(remaining)}ms`, '-n', 'wbs', ...args],
      remaining,
    );
    // Proof: omitting this check accepted a matching log/status read completed too late.
    if (effects.now() >= deadline) throw expired();
    if (invocation.exitCode === 0) return invocation.stdout;
    observed = redactDiagnostic(invocation.stderr, secrets);
    // Proof: disabling lifecycle recovery broke replacement/disappearance convergence;
    // repeated modeled failures exhausted the clock and threw the last redacted state.
    if (recover && isLifecycleUnavailable(invocation.stderr, pod)) return null;
    throw new Error(`MCP observation command failed: ${observed}`);
  };
  const readPods = async (recover: boolean): Promise<McpPod[] | null> => {
    const stdout = await invoke(
      ['get', 'pods', '-l', 'app.kubernetes.io/name=wbs-mcp', '-o', 'json'],
      recover,
    );
    if (stdout === null) return null;
    try {
      // Proof: substituting an empty decoded list made the malformed-state negatives
      // sleep/retry instead of refusing immediately; restoring decoding passed them.
      return decodePods(stdout);
    } catch (cause) {
      // Boundary: JSON.parse errors can quote Secret bytes; retain only their redacted text.
      // eslint-disable-next-line preserve-caught-error -- raw parse causes disclose Secret material.
      throw new Error(`MCP observation malformed: ${redactDiagnostic(String(cause), secrets)}`);
    }
  };
  const baseline = await readPods(false);
  if (baseline === null) throw new Error('MCP baseline unavailable');
  // Proof: omitting baseline UID or terminating-pod exclusion made the convergence
  // test read logs from mcp-old or mcp-deleting rather than the replacement.
  const excluded = new Set(baseline.map((pod) => pod.uid));
  await invoke(['rollout', 'restart', 'deployment/wbs-mcp'], false);
  for (;;) {
    const pods = await readPods(true);
    if (pods !== null) observed = `pods: ${redactDiagnostic(JSON.stringify(pods), secrets)}`;
    const pod = pods?.find(
      (candidate) =>
        !excluded.has(candidate.uid) && !candidate.deleting && candidate.terminated !== undefined,
    );
    if (pod?.terminated !== undefined) {
      const termination = pod.terminated;
      const logs = await invoke(
        ['logs', pod.name, '-c', 'mcp', '--previous', '--tail=40', '--limit-bytes=8192'],
        true,
        pod,
      );
      if (logs !== null) {
        observed = `pod ${pod.name} UID ${pod.uid} container ${termination.containerID} exited ${String(termination.exitCode)}; log: ${redactDiagnostic(logs, secrets)}`;
        const confirmed = (await readPods(true))?.find(
          (candidate) =>
            candidate.uid === pod.uid && candidate.name === pod.name && !candidate.deleting,
        );
        // Proof: removing either conjunct accepted exit 0 or an unrelated OOM in the
        // production-loop negatives; removing identity confirmation accepted a changed ID.
        if (
          confirmed?.terminated?.containerID === termination.containerID &&
          confirmed.terminated.exitCode === termination.exitCode &&
          termination.exitCode !== 0 &&
          logs.includes('MCP_STORE_KEY_CURRENT is required')
        )
          return observed;
      }
    }
    const remaining = deadline - effects.now();
    if (remaining <= 0) throw expired();
    await effects.sleep(Math.min(1000, remaining));
  }
}
