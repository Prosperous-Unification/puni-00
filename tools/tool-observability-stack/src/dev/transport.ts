import { createPrivateKey, X509Certificate } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

import { type } from 'arktype';

const Endpoint = type({
  '+': 'reject',
  url: 'string',
  serverName: 'string',
  ca: 'string',
  authentication: type({
    '+': 'reject',
    kind: "'basic'",
    username: 'string',
    password: 'string',
  }).or({ '+': 'reject', kind: "'mtls'", cert: 'string', key: 'string' }),
});
/** Resolved PEM contents, never file names. Dial address and verified service identity are independent. */
export type VerifiedEndpoint = typeof Endpoint.infer;
export type TransportEndpoint = string | VerifiedEndpoint;
export interface BoundTransport {
  url: URL;
  options: Pick<BunFetchRequestInit, 'headers' | 'tls'>;
}

/** Trusted runtime file. Missing, unreadable, malformed and incomplete material throws before network work. */
export function readTransportFile(path: string): VerifiedEndpoint {
  // Proof: trusted-file-mode removal changes the unreadable-file negative to an OS EACCES diagnostic; absent/unreadable inputs refuse before requests.
  const metadata = statSync(path);
  if (!metadata.isFile() || (metadata.mode & 0o444) === 0)
    throw new Error('Transport binding is unreadable');
  let wire: unknown;
  try {
    wire = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError)
      // Proof: json-context-diagnostic removal fails the fixed malformed-JSON category negative.
      // eslint-disable-next-line preserve-caught-error -- The trusted secret JSON boundary retains the exception class but withholds parser input.
      throw new Error('Malformed transport binding JSON', { cause: error.name });
    throw error;
  }
  const endpoint = checkEndpoint(wire);
  bindTransport(endpoint);
  return endpoint;
}
function checkEndpoint(wire: unknown): VerifiedEndpoint {
  const checked = Endpoint(wire);
  // Proof: binding-schema removal fails the unknown-field negative with a later TypeError instead of the fixed shape diagnostic.
  if (checked instanceof type.errors) throw new Error('Invalid transport binding shape');
  return checked;
}
/** Rejects unconsumed PEM/DER material before standard crypto parsing. */
function decodePem(frame: string): Buffer {
  const encoded = frame
    .replace(/^-----BEGIN [A-Z0-9 ]+-----/, '')
    .replace(/-----END [A-Z0-9 ]+-----$/, '')
    .replace(/\s/g, '');
  // Proof: client-base64 removal drops the invalid character during Buffer decoding and accepts the certificate negative.
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error('Malformed transport client PEM encoding');
  const decoded = Buffer.from(encoded, 'base64');
  // Proof: client-der-object removal changes empty/wrong-tag negatives to later errors instead of this fixed category.
  if (decoded.length < 2 || decoded[0] !== 0x30)
    throw new Error('Malformed transport client DER object');
  const width = decoded[1] < 0x80 ? 0 : decoded[1] & 0x7f;
  // Proof: client-der-length removal changes indefinite/truncated length negatives to later errors instead of this fixed category.
  if (decoded[1] === 0x80 || width > decoded.length - 2)
    throw new Error('Malformed transport client DER length');
  let length = width === 0 ? BigInt(decoded[1]) : 0n;
  for (let offset = 0; offset < width; offset++)
    length = length * 256n + BigInt(decoded[offset + 2]);
  // Proof: client-der-consumption removal accepts both certificate and private-key hidden trailing-object negatives.
  if (length !== BigInt(decoded.length - 2 - width))
    throw new Error('Unconsumed transport client DER material');
  return decoded;
}
/** Keeps legacy loopback HTTP explicit; every other route requires authenticated, verified TLS. */
export function bindTransport(endpoint: TransportEndpoint): BoundTransport {
  let url: URL;
  try {
    url = new URL(typeof endpoint === 'string' ? endpoint : endpoint.url);
  } catch (error) {
    // Proof: url-diagnostic-redaction removal exposes the private URL marker in the runtime subprocess negative.
    // eslint-disable-next-line preserve-caught-error -- The trusted secret URL boundary withholds raw credential-bearing input; the subprocess marker test proves redaction.
    if (error instanceof TypeError) throw new Error('Invalid transport URL', { cause: error.name });
    throw error;
  }
  // Proof: unsafe transport endpoint negatives fail with target policy removed.
  if (
    url.username !== '' ||
    url.password !== '' ||
    !['', '/'].includes(url.pathname) ||
    url.search !== '' ||
    url.hash !== '' ||
    (typeof endpoint === 'string'
      ? url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
      : url.protocol !== 'https:')
  )
    throw new Error('Invalid authenticated transport endpoint');
  if (typeof endpoint === 'string') return { url, options: {} };
  const checked = checkEndpoint(endpoint);
  // Proof: absent hostname and empty basic-credential negatives fail with material guard removed.
  if (!/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(checked.serverName))
    throw new Error('Invalid transport service identity');
  // Proof: malformed CA and partial client-pair negatives fail with PEM validation removed.
  const certificates = checked.ca.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  );
  if (
    certificates === null ||
    checked.ca
      .replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '')
      .trim() !== ''
  )
    throw new Error('Malformed transport authority bundle');
  // Proof: trust-ca-role removal accepts the leaf-certificate negative.
  for (const certificate of certificates)
    if (!new X509Certificate(certificate).ca) throw new Error('Transport authority is not a CA');
  const headers = new Headers({ Host: checked.serverName });
  const credentials = checked.authentication.kind === 'basic' ? checked.authentication : undefined;
  if (credentials !== undefined) {
    if (
      credentials.username.length === 0 ||
      credentials.password.length === 0 ||
      /[:\r\n]/.test(credentials.username) ||
      /[\r\n]/.test(credentials.password)
    )
      throw new Error('Invalid transport credentials');
    headers.set(
      'Authorization',
      `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
    );
  }
  const client = checked.authentication.kind === 'mtls' ? checked.authentication : undefined;
  if (client !== undefined) {
    // Proof: client-key-pair removal accepts the mismatched-key negative; missing client identity is also refused by the real mTLS receiver.
    const certificatePattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const certificates = client.cert.match(certificatePattern);
    // Proof: client-chain-frame removal accepts trailing/interstitial/mixed PEM negatives before network work.
    if (certificates === null || client.cert.replace(certificatePattern, '').trim() !== '')
      throw new Error('Malformed transport client certificate chain');
    // Proof: client-chain-each parses only the first certificate and accepts the malformed second-certificate negative.
    const chain = certificates.map((frame) => new X509Certificate(decodePem(frame)));
    const keyPattern = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;
    const keys = client.key.match(keyPattern);
    // Proof: client-key-count and client-key-frame removals independently accept two-key and trailing/mixed-material negatives.
    if (keys?.length !== 1 || client.key.replace(keyPattern, '').trim() !== '')
      throw new Error('Malformed transport client private key');
    decodePem(keys[0]);
    if (!chain[0].checkPrivateKey(createPrivateKey(keys[0])))
      throw new Error('Transport client key mismatch');
  }
  return {
    url,
    options: {
      headers,
      tls: {
        // Proof: disabling verification acknowledges the wrong-hostname/untrusted-CA negatives; omitting serverName breaks the OpenSSL SNI positive.
        ca: checked.ca,
        serverName: checked.serverName,
        rejectUnauthorized: true,
        ...(client === undefined ? {} : { cert: client.cert, key: client.key }),
      },
    },
  };
}

/** Direct transport never consults ambient proxy configuration or follows credential-bearing redirects. */
export function fetchTransport(
  url: URL,
  transport: BoundTransport,
  request: RequestInit,
): Promise<Response> {
  // Boundary: installed bun-types1.4.2 omits proxy:false; pinned Bun1.4.4 supports it and the real TLS/subprocess controls exercise it.
  // Proof: direct-proxy omission breaks the hostile-proxy CLI positive; redirect-refusal weakening acknowledges the TLS redirect negative.
  const options = {
    ...transport.options,
    ...request,
    proxy: false,
    redirect: 'manual',
  } as unknown as BunFetchRequestInit;
  return fetch(url, options);
}
