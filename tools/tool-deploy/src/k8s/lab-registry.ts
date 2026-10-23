import { type ConfigDigestReader, registryConfigDigestReader } from './registry';

/**
 * The disposable F8 registry has one fixed cluster authority and a random host port.
 * Rewrite only that authority; the repository and pinned digest still name the verified bytes.
 * Never accepts arbitrary registry redirects or forwards production credentials.
 */
export function labConfigDigestReader(port: number): ConfigDigestReader {
  // Proof: invalid-port cases reject zero, fractional, non-finite and out-of-range host ports.
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('invalid lab registry port');
  const read = registryConfigDigestReader(null);
  return async (ref, timeoutMs) => {
    // Proof: lab-registry.test.ts refuses foreign and lookalike authorities rather than redirecting them.
    if (!/^k3d-puni-f8-registry:5000\/[^@]+@sha256:[0-9a-f]{64}$/.test(ref))
      throw new Error('image is not pinned to the F8 lab registry');
    return read(
      ref.replace(/^k3d-puni-f8-registry:5000\//, `127.0.0.1:${String(port)}/`),
      timeoutMs,
    );
  };
}
