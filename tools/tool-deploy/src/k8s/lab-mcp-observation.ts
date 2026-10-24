import { CommandTimedOut } from './execute';
import { redactDiagnostic } from './lab-diagnostics';

/** Commands report exit status so only modeled Kubernetes lifecycle races can recover. */
export interface McpObservationEffects {
  apiCommand: readonly string[];
  /** Docker name of the disposable lab's only K3s node (one server, no agents). */
  node: string;
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
      const containerID = readText(termination['containerID']);
      // Proof: removing this validation invoked the node for a malformed ID; its negative failed.
      if (!/^containerd:\/\/[a-f0-9]{64}$/.test(containerID))
        throw new Error('malformed MCP runtime ID');
      parsed.terminated = { exitCode, containerID };
    }
    return parsed;
  });
}
/** The exact-ID CRI command may outlive GC of its log; only the selected MCP log path may retry. */
function isLogMissing(message: string, pod: McpPod): boolean {
  // Proof: removing ENOENT recovery failed selected-path convergence and bounded exhaustion;
  // accepting EACCES failed the permission refusal cases.
  const failure =
    /^failed to (try resolving symlinks in path|open log file) "([^"\n]+)": (lstat|open) ([^\n]+): no such file or directory$/.exec(
      message,
    );
  if (failure === null) return false;
  const phase = readText(failure[1]);
  const path = readText(failure[2]);
  const operation = readText(failure[3]);
  const failedPath = readText(failure[4]);
  const directory = `/var/log/pods/wbs_${pod.name}_${pod.uid}`;
  const container = `${directory}/mcp`;
  // Proof: removing pod-path or restart-filename scope retried foreign same-basename or
  // rotated/traversal paths; both watched production-loop negatives failed.
  if (!path.startsWith(`${container}/`)) return false;
  if (!/^(?:0|[1-9][0-9]*)\.log$/.test(path.slice(container.length + 1))) return false;
  // Proof: omitting either inner-path guard retried a foreign path; the open and
  // EvalSymlinks omission negatives both failed after adding the missing open negative.
  if (phase === 'open log file') return operation === 'open' && failedPath === path;
  return (
    operation === 'lstat' &&
    (failedPath === path || failedPath === container || failedPath === directory)
  );
}

function isLifecycleUnavailable(stderr: string, pod: McpPod | undefined): boolean {
  if (pod?.terminated === undefined) return false;
  const id = pod.terminated.containerID.slice('containerd://'.length);
  const missing = `rpc error: code = NotFound desc = an error occurred when try to find container "${id}": not found`;
  // Proof: accepting any NotFound ID made the foreign-ID negative retry; restoring exact
  // matching passed it and the raw/logrus/klog garbage-collection convergence cases.
  // Requested-ID NotFound and selected-pod MCP log ENOENT model runtime garbage collection.
  // Docker failures, authorization, tool absence and errors naming other IDs throw.
  return stderr
    .trim()
    .split('\n')
    .every((line) => {
      if (line === missing || isLogMissing(line, pod)) return true;
      const logrus = /^time="[^"\n]+" level=(?:fatal|error) msg=/.exec(line);
      if (logrus !== null) {
        const encoded = line.slice(logrus[0].length);
        const message = encoded.slice(1, -1).replaceAll('\\"', '"');
        // Proof: dropping canonical encoding validation accepted a malformed logrus wrapper.
        // Known CRI diagnostics need only quoted path/ID escapes. Roundtrip validation
        // rejects malformed wrappers without parsing arbitrary error payloads.
        return (
          JSON.stringify(message) === encoded && (message === missing || isLogMissing(message, pod))
        );
      }
      const klog = /^E[0-9]{4} [0-9:.]+ +[0-9]+ (?:remote_runtime|log_rpc)\.go:[0-9]+\] /.exec(
        line,
      );
      return (
        klog !== null &&
        line.slice(klog[0].length) ===
          `"ContainerStatus from runtime service failed" err=${JSON.stringify(missing)} containerID=${JSON.stringify(id)}`
      );
    });
}

/**
 * Restart MCP on the disposable single-node k3d lab, then require one replacement UID and terminated container ID to retain both
 * a nonzero exit and the missing-key log read by exact CRI ID, across a second status read. Only runtime GC
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
    // Proof: selecting kubectl here or substituting another runtime ID falsely accepted
    // newer kubelet logs while both API reads stayed stale; the watched negative failed.
    const command =
      pod === undefined
        ? [...effects.apiCommand, `--request-timeout=${String(remaining)}ms`, '-n', 'wbs', ...args]
        : [
            'docker',
            'exec',
            effects.node,
            // Proof: restoring `k3s crictl` failed the direct-applet test (0 pass, 1 fail);
            // the pinned node's wrapper returned "No help topic for 'crictl'" in infra-check 39939093650.
            '/bin/crictl',
            '--config=/dev/null',
            `--timeout=${String(remaining)}ms`,
            '--runtime-endpoint=unix:///run/k3s/containerd/containerd.sock',
            ...args,
          ];
    let invocation: Awaited<ReturnType<McpObservationEffects['invoke']>>;
    try {
      invocation = await effects.invoke(command, remaining);
    } catch (cause) {
      // Proof: removing timeout capture lost the real killed-process evidence; broadening
      // it changed unrelated rejection identity. Both watched mutations failed their negatives.
      if (!(cause instanceof CommandTimedOut)) throw cause;
      // Boundary: subprocess argv may contain Secret material; preserve only redacted text.
      // eslint-disable-next-line preserve-caught-error -- raw timeout causes may disclose Secrets.
      throw new Error(
        `${expired().message}; subprocess: ${redactDiagnostic(cause.message, secrets)}`,
      );
    }
    // Proof: omitting this check accepted a matching log/status read completed too late.
    if (effects.now() >= deadline) throw expired();
    // Proof: dropping runtime stderr failed the missing-key stderr-only convergence test.
    if (invocation.exitCode === 0)
      return pod === undefined ? invocation.stdout : `${invocation.stdout}\n${invocation.stderr}`;
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
        [
          'logs',
          '--tail=40',
          '--limit-bytes=8192',
          termination.containerID.slice('containerd://'.length),
        ],
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
