import { type ClientRequest, type IncomingMessage, request } from 'node:http';
import { isIP } from 'node:net';

import type { ParticipantHttpObservation } from './dependency-participant-health';

export type ParticipantHttpPath =
  '/health' | '/health/readiness' | '/api/runtime/dependency-capability' | '/' | '/src/main.tsx';
/** Reads bounded raw HTTP observations from a numeric endpoint chosen by the private process/listener composition. This transport alone grants no readiness; callers must bracket the selected socket/address ownership and decode the exact role response. */
export async function readParticipantHttp(
  address: string,
  port: number,
  path: ParticipantHttpPath,
  deadline: number,
): Promise<ParticipantHttpObservation> {
  const resources: {
    request: { client: ClientRequest; closed: Promise<void> } | null;
    response: { message: IncomingMessage; closed: Promise<void> } | null;
  } = { request: null, response: null };
  try {
    const family = isIP(address);
    const ipv6 =
      family === 6 && !address.includes('%') ? new URL(`http://[${address}]/`).hostname : null;
    // Proof: wildcard and mapped addresses reached the owned IPv4 listener before these refusals; both native negatives failed with Missing expected rejection.
    if (
      (family !== 4 && family !== 6) ||
      address.includes('%') ||
      address === '0.0.0.0' ||
      ipv6 === '[::]' ||
      ipv6?.startsWith('[::ffff:') ||
      !Number.isSafeInteger(port) ||
      port < 1 ||
      port > 65535
    )
      throw new Error('participant numeric endpoint unsupported');
    function remaining(): number {
      const budget = deadline - performance.now();
      if (!Number.isFinite(deadline) || budget <= 0 || budget > 600000)
        throw new Error('participant HTTP deadline exceeded');
      return budget;
    }
    let settled = false;
    return await new Promise<ParticipantHttpObservation>((resolve, reject) => {
      const refuse = () => {
        if (settled) return;
        settled = true;
        resources.response?.message.destroy();
        resources.request?.client.destroy();
        reject(new Error('participant HTTP transport refused'));
      };
      // Proof: Bun fetch with empty proxy still reached the ambient proxy; the native control/endpoint test now observes only the control request at that proxy.
      const client = request(
        {
          hostname: address,
          port,
          path,
          method: 'GET',
          agent: false,
          headers: { 'accept-encoding': 'identity', connection: 'close' },
          // Proof: removing abort waited for the independent 1.5s server end; the 100ms request budget test failed at 1502ms.
          signal: AbortSignal.timeout(Math.ceil(remaining())),
        },
        (message) => {
          resources.response = {
            message,
            closed: new Promise<void>((closed) => message.once('close', closed)),
          };
          message.on('error', refuse);
          message.on('aborted', refuse);
          message.once('close', () => {
            if (!settled) refuse();
          });
          const contentType = message.headers['content-type'];
          const encoding = message.headers['content-encoding'];
          const status = message.statusCode;
          // Proof: omitting the exact status admitted the owned redirect response; the native refusal test failed with Missing expected rejection.
          if (
            settled ||
            typeof contentType !== 'string' ||
            contentType.length > 1024 ||
            (encoding !== undefined && encoding !== 'identity') ||
            status !== 200
          ) {
            refuse();
            message.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          message.on('data', (chunk: unknown) => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk)) {
              refuse();
              return;
            }
            length += chunk.byteLength;
            // Proof: removing the incremental body cap admitted the oversized private response; the native negative failed with Missing expected rejection.
            if (length > 256 * 1024) {
              refuse();
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          message.once('end', () => {
            if (settled) return;
            try {
              if (!message.complete) {
                refuse();
                return;
              }
              remaining();
              // Proof: replacement decoding admitted the invalid native byte response; the UTF-8 negative failed with Missing expected rejection.
              const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
              settled = true;
              resolve({ status, contentType, body });
            } catch {
              refuse();
            }
          });
        },
      );
      resources.request = {
        client,
        closed: new Promise<void>((closed) => client.once('close', closed)),
      };
      client.on('error', refuse);
      client.once('close', () => {
        if (!settled) refuse();
      });
      client.end();
    });
  } catch {
    throw new Error('participant HTTP observation refused');
  } finally {
    if (resources.response !== null) resources.response.message.destroy();
    if (resources.request !== null) resources.request.client.destroy();
    const closed: Promise<void>[] = [];
    if (resources.request !== null) closed.push(resources.request.closed);
    if (resources.response !== null) closed.push(resources.response.closed);
    // Proof: omitting this join returned while actual native requestClosed was 0; success/refusal lifecycle assertions both failed.
    await Promise.all(closed);
  }
}
