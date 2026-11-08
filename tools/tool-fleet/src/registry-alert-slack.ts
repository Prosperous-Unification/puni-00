import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

import { closeRegistryAlertFile, type RegistryAlertContext } from './registry-alert-store';
import { hashRegistryAlert } from './registry-monitoring-events';
import { completeRegistryOperation } from './registry-operation-completion';
import { readRegistryBytes } from './registry-stream';

/** Internal HTTP seam for owned receivers; production CLI never accepts an endpoint override. */
export interface RegistryAlertTransport {
  post: (payload: string, signal: AbortSignal) => Promise<Response>;
}
export type RegistryAlertAcknowledgement =
  | { state: 'acknowledged' }
  | { state: 'rejected' }
  | { state: 'uncertain' }
  | { state: 'retry'; seconds: number };
async function readCredential(context: RegistryAlertContext, path: string): Promise<string> {
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  return completeRegistryOperation(
    async () => {
      const status = await descriptor.stat();
      // Proof: removing mode/link checks admitted owned public/hardlinked fake credentials; removing NOFOLLOW accepted a real symlink. Installed root credential mounting remains unverified.
      if (
        !status.isFile() ||
        status.nlink !== 1 ||
        ![0, process.getuid?.()].includes(status.uid) ||
        ![0o400, 0o600].includes(status.mode & 0o7777)
      )
        throw new Error('Alert credential metadata is invalid');
      const bytes = new Uint8Array(2049);
      let length = 0;
      while (length < bytes.length) {
        const read = await descriptor.read(bytes, length, bytes.length - length, length);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      // Proof: removing this cap accepted an exact2049-byte owned credential with a matching pin and otherwise valid endpoint.
      if (length > 2048) throw new Error('Alert credential exceeds bound');
      const credential = new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, length));
      // Proof: removing this binding accepted changed owned credential bytes under the original configured pin.
      if (hashRegistryAlert(credential) !== context.enrollment.credentialSha256)
        throw new Error('Alert credential binding changed');
      return credential.trim();
    },
    () => closeRegistryAlertFile(context, descriptor),
  );
}
/** Internal credential-path seam models the installed credential mount with an owned fake file; CLI never accepts it. Endpoint selection is conditional Slack only; root enrollment chooses identity, never an insecure CLI fallback. */
export async function createRegistrySlackTransport(
  context: RegistryAlertContext,
  boundary?: { credentialPath: string },
): Promise<RegistryAlertTransport> {
  let endpoint: URL;
  try {
    endpoint = new URL(
      await readCredential(context, boundary?.credentialPath ?? context.enrollment.credentialPath),
    );
  } catch {
    throw new Error('Selected alert credential is unavailable or invalid');
  }
  // Proof: independently removing HTTPS/host/port/user/query/fragment/path checks admitted each corresponding owned fake endpoint; no provider request was made.
  if (
    endpoint.protocol !== 'https:' ||
    !['hooks.slack.com', 'hooks.slack-gov.com'].includes(endpoint.hostname) ||
    endpoint.port !== '' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== '' ||
    !/^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(endpoint.pathname)
  )
    throw new Error('Selected alert endpoint is not an approved Slack webhook');
  return { post: (payload, signal) => postRegistrySlackRequest(endpoint, payload, signal) };
}

/** Fixed Slack HTTP request behavior shared by installed transport and explicit owned loopback test endpoints. Never selected by CLI input. */
export function postRegistrySlackRequest(
  endpoint: URL,
  payload: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=utf-8' },
    body: payload,
    // Proof: changing this to follow reached the second real local receiver and falsely acknowledged its response.
    redirect: 'manual',
    signal,
  });
}
/** Positive acknowledgement requires exact bytes; all errors stay credential-free and uncertainty never implies zero side effects. */
export async function postRegistryAlert(
  transport: RegistryAlertTransport,
  payload: string,
  signal: AbortSignal,
): Promise<RegistryAlertAcknowledgement> {
  // Proof: R5[request-byte-bound] the declared isolated fault defeated this boundary; observed by "encoded request byte bound".
  if (Buffer.byteLength(payload) > 8192) throw new Error('Registry alert request exceeds bound');
  try {
    const response = await transport.post(payload, signal);
    // Proof: R5[acknowledgement-byte-bound] the declared isolated fault defeated this boundary; observed by "acknowledgement overflow cancels".
    const body = await readRegistryBytes(response.body, 4096, 'Alert acknowledgement');
    signal.throwIfAborted();
    // Proof: accepting200 alone acknowledged the real receiver's empty body and failed the uncertainty assertion.
    if (response.status === 200 && new TextDecoder('utf8', { fatal: true }).decode(body) === 'ok')
      return { state: 'acknowledged' };
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      // Proof: R5[retry-after-header-validation] the declared isolated fault defeated this boundary; observed by "invalid Retry-After not-an-integer".
      if (retry !== null && /^(0|[1-9][0-9]{0,5})$/.test(retry))
        return { state: 'retry', seconds: Number(retry) };
      return { state: 'rejected' };
    }
    // Proof: R5[corrective-http-refusal] the declared isolated fault defeated this boundary; observed by "real HTTP 403/6".
    if (response.status >= 300 && response.status < 500) return { state: 'rejected' };
    return { state: 'uncertain' };
  } catch {
    return { state: 'uncertain' };
  }
}
