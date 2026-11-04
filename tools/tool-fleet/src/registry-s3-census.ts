import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  ListMultipartUploadsCommand,
  type ListMultipartUploadsCommandOutput,
  ListObjectVersionsCommand,
  ListPartsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SaxesParser } from 'saxes';

import { completeRegistryOperation } from './registry-operation-completion';

export type RegistryS3Fetch = (request: Request) => Promise<Response>;
export interface RegistryS3Configuration {
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  signal: AbortSignal;
  fetch?: RegistryS3Fetch;
}
export type RegistryS3Version = {
  key: string;
  versionId: string;
  visible: boolean;
} & ({ kind: 'object'; bytes: number } | { kind: 'delete-marker' });
export interface RegistryS3Upload {
  key: string;
  uploadId: string;
  parts: { number: number; bytes: number }[];
}
/** Payload totals exclude provider metadata/minima and cannot admit a billable-byte budget. Writer exclusion remains the caller's responsibility. */
export interface RegistryS3Census {
  versions: RegistryS3Version[];
  uploads: RegistryS3Upload[];
  payloadBytes: number;
  accounting: 'payload-only';
}
/** Exact version methods confer no deletion authority: the caller must independently prove ownership/currentness before each mutation. */
export interface RegistryS3Store {
  census(): Promise<RegistryS3Census>;
  readVersion(key: string, versionId: string): Promise<Uint8Array>;
  deleteVersion(key: string, versionId: string): Promise<void>;
}
export type RegistryS3Failure =
  'configuration' | 'cancelled' | 'not-found' | 'unavailable' | 'invalid-response' | 'limit';
/** Secret-free failure classification deliberately excludes SDK causes, request URLs, headers and provider response text. */
export class RegistryS3Error extends Error {
  constructor(readonly code: RegistryS3Failure) {
    super(`Registry S3 operation refused: ${code}`);
    this.name = 'RegistryS3Error';
  }
}
class RegistryS3CompletionError extends AggregateError {
  constructor(primary: Error, cleanup: Error) {
    // Proof: swapping members/cause failed the isolated simultaneous SDK operation/destructor fault test.
    super([primary, cleanup], 'Registry S3 operation and cleanup failed', { cause: primary });
  }
}
function sanitizeFailure(cause: unknown, signal?: AbortSignal, caller?: AbortSignal): Error {
  if (cause instanceof RegistryS3Error || cause instanceof RegistryS3CompletionError) return cause;
  return new RegistryS3Error(
    signal?.aborted === true ? (caller?.aborted === true ? 'cancelled' : 'limit') : 'unavailable',
  );
}
async function completeS3Operation<T>(
  operate: () => Promise<T>,
  close: () => Promise<void>,
  signal: AbortSignal,
  caller: AbortSignal,
): Promise<T> {
  try {
    return await completeRegistryOperation(
      async () => {
        try {
          return await operate();
        } catch (cause) {
          throw sanitizeFailure(cause, signal, caller);
        }
      },
      async () => {
        try {
          await close();
        } catch (cause) {
          throw sanitizeFailure(cause);
        }
      },
    );
  } catch (cause) {
    if (cause instanceof AggregateError && !(cause instanceof RegistryS3CompletionError)) {
      // Boundary: completeRegistryOperation combines exactly the two already-sanitized callback failures in operation/cleanup order.
      throw new RegistryS3CompletionError(
        sanitizeFailure(cause.errors[0]),
        sanitizeFailure(cause.errors[1]),
      );
    }
    throw sanitizeFailure(cause, signal, caller);
  }
}
const responseBytes = 8 * 1024 ** 2;
const operationBytes = 64 * 1024 ** 2;
const maximumRecords = 65536;
const maximumRequests = 4096;
const requestMilliseconds = 5000;
const operationMilliseconds = 60000;
function fail(code: RegistryS3Failure): never {
  throw new RegistryS3Error(code);
}
const requireCondition = (condition: boolean): void => {
  if (!condition) fail('invalid-response');
};
function requireString(value: unknown): string {
  // Proof: injecting a missing-identity default made the real-wire missing VersionId census negative resolve.
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > 4096)
    fail('invalid-response');
  return value;
}
function requireNumber(value: unknown): number {
  // Proof: injecting a missing-size zero default made the real-wire missing Size census negative resolve.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail('invalid-response');
  return value;
}
function requireBoolean(value: unknown): boolean {
  // Proof: bypassing currentness validation admitted a historical version without IsLatest in the wire negative.
  if (typeof value !== 'boolean') fail('invalid-response');
  return value;
}
function readCollection<T>(value: T[] | undefined): T[] {
  if (value === undefined) return [];
  // Proof: removing the collection bound admitted the 1,001-part production census response.
  if (!Array.isArray(value) || value.length > 1000) fail('invalid-response');
  return value;
}
function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function isCanonicalKey(key: string): boolean {
  return (
    Buffer.byteLength(key) <= 1024 &&
    !key.includes('\\') &&
    !hasControl(key) &&
    key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}
function decodeKey(value: unknown): string {
  try {
    return decodeURIComponent(requireString(value));
  } catch {
    return fail('invalid-response');
  }
}
function compareKeys(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
const identify = (key: string, id: string): string => JSON.stringify([key, id]);

/** Validate well-formed XML, expected root and unambiguous scalar structure BEFORE SDK normalization can turn a wrong-root 200 into an empty page. */
function verifyXml(bytes: Uint8Array, expectedRoot: string): void {
  const parser = new SaxesParser({ xmlns: true });
  const stack: { name: string; children: Set<string>; text: string }[] = [];
  let root: string | undefined;
  // Proof: removing DOCTYPE/root/attribute checks admitted their otherwise valid real-SDK XML census fixtures.
  parser.on('doctype', () => fail('invalid-response'));
  parser.on('opentag', (tag) => {
    if (tag.uri !== '' && tag.uri !== 'http://s3.amazonaws.com/doc/2006-03-01/')
      fail('invalid-response');
    for (const attribute of Object.values(tag.attributes))
      if (attribute.uri !== 'http://www.w3.org/2000/xmlns/') fail('invalid-response');
    const parent = stack.at(-1);
    if (parent === undefined) {
      if (root !== undefined || tag.local !== expectedRoot) fail('invalid-response');
      root = tag.local;
    } else {
      const repeated =
        parent.name === expectedRoot &&
        ['Version', 'DeleteMarker', 'Upload', 'Part'].includes(tag.local);
      if (
        tag.local === 'CommonPrefixes' ||
        (parent.children.has(tag.local) && !repeated && tag.local !== 'ChecksumAlgorithm')
      )
        fail('invalid-response');
      parent.children.add(tag.local);
    }
    stack.push({ name: tag.local, children: new Set(), text: '' });
  });
  const appendText = (text: string) => {
    const element = stack.at(-1);
    if (element !== undefined) element.text += text;
  };
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.on('closetag', () => {
    const element = stack.pop();
    if (element === undefined) fail('invalid-response');
    const parent = stack.at(-1);
    if (
      element.name === 'IsTruncated' ||
      (element.name === 'IsLatest' &&
        (parent?.name === 'Version' || parent?.name === 'DeleteMarker'))
    ) {
      // Proof: bypassed lexical guards admitted empty IsTruncated and Size after SDK false/zero coercion.
      requireCondition(
        element.children.size === 0 && (element.text === 'true' || element.text === 'false'),
      );
    }
    if (
      (element.name === 'Size' && (parent?.name === 'Version' || parent?.name === 'Part')) ||
      (element.name === 'PartNumber' && parent?.name === 'Part')
    ) {
      requireCondition(element.children.size === 0 && /^[+-]?[0-9]+$/.test(element.text.trim()));
      requireNumber(Number(element.text));
    }
  });
  parser.on('error', () => fail('invalid-response'));
  try {
    parser.write(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).close();
  } catch {
    fail('invalid-response');
  }
  requireCondition(root === expectedRoot && stack.length === 0);
}

interface SignedRequest {
  protocol: string;
  hostname: string;
  port?: number;
  path: string;
  query?: Record<string, string | string[] | null>;
  headers: Record<string, string>;
  method: string;
}
interface Budget {
  bytes: number;
  requests: number;
  records: number;
}
function chargeBytes(budget: Budget, bytes: number): void {
  budget.bytes += bytes;
  // Proof: removing cumulative charging crossed 64 MiB before the byte-budget wire negative could refuse.
  if (!Number.isSafeInteger(budget.bytes) || budget.bytes > operationBytes) fail('limit');
}
function chargeRecord(budget: Budget, record: unknown): void {
  budget.records++;
  // Proof: removing this bound sent extra pages beyond the 65,536-record wire negative's refusal point.
  if (budget.records > maximumRecords) fail('limit');
  chargeBytes(budget, Buffer.byteLength(JSON.stringify(record)));
}
function checkCancellation(signal: AbortSignal, caller: AbortSignal): void {
  if (signal.aborted) fail(caller.aborted ? 'cancelled' : 'limit');
}

/** Cancel and await the owned reader on overflow/abort/error; missing required bodies never normalize to zero bytes. */
async function readBody(
  response: Response,
  signal: AbortSignal,
  caller: AbortSignal,
  budget: Budget,
): Promise<Uint8Array> {
  if (response.body === null) return fail('invalid-response');
  const reader = response.body.getReader();
  let cancellation: Promise<void> | undefined;
  const cleanup = { failed: false };
  const cancel = () => {
    cancellation ??= reader.cancel().then(
      () => undefined,
      () => {
        cleanup.failed = true;
      },
    );
  };
  signal.addEventListener('abort', cancel, { once: true });
  // Proof: removing overflow cancellation or its awaited cleanup failed the gated-reader wire negatives.
  return completeS3Operation(
    async () => {
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        checkCancellation(signal, caller);
        for (;;) {
          const chunk = await reader.read();
          checkCancellation(signal, caller);
          if (chunk.done) break;
          length += chunk.value.byteLength;
          // Proof: removing the response-byte check left the oversized wire stream uncancelled at its admitted bound.
          if (length > responseBytes) fail('limit');
          chargeBytes(budget, chunk.value.byteLength);
          chunks.push(chunk.value);
        }
      } catch (cause) {
        cancel();
        throw cause;
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
    async () => {
      signal.removeEventListener('abort', cancel);
      try {
        if (cancellation !== undefined) await cancellation;
        // Proof: removing cleanup refusal discarded the cleanup member in the failed-cancellation production negative.
        if (cleanup.failed) fail('unavailable');
      } finally {
        reader.releaseLock();
      }
    },
    signal,
    caller,
  );
}

/** Validate the trusted external configuration once; no credential-provider discovery is permitted. */
function validateConfiguration(value: unknown): asserts value is RegistryS3Configuration {
  if (typeof value !== 'object' || value === null) fail('configuration');
  // Boundary: object membership is established here; every exposed configuration field is checked below.
  const fields = value as Record<string, unknown>;
  if (
    typeof fields['endpoint'] !== 'string' ||
    typeof fields['bucket'] !== 'string' ||
    typeof fields['prefix'] !== 'string' ||
    typeof fields['region'] !== 'string' ||
    !(fields['signal'] instanceof AbortSignal) ||
    (fields['fetch'] !== undefined && typeof fields['fetch'] !== 'function')
  )
    fail('configuration');
  const credentials = fields['credentials'];
  if (typeof credentials !== 'object' || credentials === null) fail('configuration');
  // Boundary: credential object membership is established here; the three permitted static values are checked below.
  const secrets = credentials as Record<string, unknown>;
  if (
    typeof secrets['accessKeyId'] !== 'string' ||
    secrets['accessKeyId'].length === 0 ||
    typeof secrets['secretAccessKey'] !== 'string' ||
    secrets['secretAccessKey'].length === 0 ||
    (secrets['sessionToken'] !== undefined &&
      (typeof secrets['sessionToken'] !== 'string' || secrets['sessionToken'].length === 0))
  )
    fail('configuration');
}
/**
 * Fixed HTTPS path-style transport signs only configured general-purpose versioned-bucket
 * operations. Static credentials never discover ambient identities. Redirects/region following
 * and retries are disabled. Each method owns/destroys its SDK client before settlement.
 *
 * Refuses after 5 s/request, 60 s/method, 4,096 requests, 65,536 records, 8 MiB/response,
 * 64 KiB/response headers or 64 MiB cumulative response headers/bodies plus census records/output.
 * All enumeration is delimiter-free. Missing/malformed scope, XML, identities, sizes,
 * currentness and continuations refuse rather than normalize to an incomplete empty census.
 */
export function createRegistryS3Store(configuration: RegistryS3Configuration): RegistryS3Store {
  validateConfiguration(configuration);
  let endpoint: URL;
  try {
    endpoint = new URL(configuration.endpoint);
  } catch {
    return fail('configuration');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.pathname !== '/' ||
    endpoint.search !== '' ||
    endpoint.hash !== '' ||
    endpoint.origin !== configuration.endpoint ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(configuration.bucket) ||
    configuration.bucket.endsWith('--x-s3') ||
    configuration.prefix.length < 2 ||
    !configuration.prefix.endsWith('/') ||
    !isCanonicalKey(configuration.prefix.slice(0, -1)) ||
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(configuration.region)
  )
    fail('configuration');
  const { bucket, prefix, region, signal: caller } = configuration;
  const origin = endpoint.origin;
  const credentials = { ...configuration.credentials };
  const fetchPort: RegistryS3Fetch = configuration.fetch ?? ((request) => fetch(request));
  // Proof: removing containment/canonical-key guards admitted foreign-prefix or traversal keys in the SDK census negatives.
  const requireKey = (value: unknown): string => {
    const key = requireString(value);
    requireCondition(key.startsWith(prefix) && isCanonicalKey(key) && key.length > prefix.length);
    return key;
  };
  const requireVersionId = (value: unknown): string => {
    const id = requireString(value);
    requireCondition(Buffer.byteLength(id) <= 1024 && !hasControl(id));
    return id;
  };
  async function run<T>(
    operate: (client: S3Client, signal: AbortSignal, budget: Budget) => Promise<T>,
  ): Promise<T> {
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      // Proof: removing this deadline let progressing 4.2-second pages hit the 65-second production test timeout.
      deadline.abort();
    }, operationMilliseconds);
    const signal = AbortSignal.any([caller, deadline.signal]);
    const budget: Budget = { bytes: 0, requests: 0, records: 0 };
    let client: S3Client | undefined;
    return completeS3Operation(
      async () => {
        try {
          client = new S3Client({
            endpoint: origin,
            region,
            credentials,
            forcePathStyle: true,
            followRegionRedirects: false,
            maxAttempts: 1,
            // Proof: removing explicit endpoint/default-mode settings made the poisoned-ambient SDK child refuse its valid fixed-scope census.
            defaultsMode: 'standard',
            retryMode: 'standard',
            authSchemePreference: ['sigv4'],
            disableS3ExpressSessionAuth: true,
            disableMultiregionAccessPoints: true,
            useArnRegion: false,
            useDualstackEndpoint: false,
            useFipsEndpoint: false,
            useGlobalEndpoint: false,
            disableHostPrefix: true,
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            sigv4aSigningRegionSet: [region],
            userAgentAppId: 'registry-census',
            credentialDefaultProvider: () => () =>
              Promise.reject(new RegistryS3Error('configuration')),
            requestHandler: {
              handle: async (signed: SignedRequest) => {
                checkCancellation(signal, caller);
                budget.requests++;
                // Proof: removing request admission attempted unadmitted request 4,097 in the production wire negative.
                if (budget.requests > maximumRequests) fail('limit');
                const requestDeadline = new AbortController();
                const requestTimer = setTimeout(() => {
                  // Proof: removing this deadline failed the stalled-body production test's 6.5-second timeout.
                  requestDeadline.abort();
                }, requestMilliseconds);
                const requestSignal = AbortSignal.any([signal, requestDeadline.signal]);
                try {
                  const address = new URL(
                    signed.path,
                    `${signed.protocol}//${signed.hostname}${signed.port === undefined ? '' : `:${String(signed.port)}`}`,
                  );
                  requireCondition(
                    address.origin === origin &&
                      (address.pathname === `/${bucket}` ||
                        address.pathname.startsWith(`/${bucket}/`)) &&
                      ['GET', 'DELETE'].includes(signed.method),
                  );
                  for (const [name, value] of Object.entries(signed.query ?? {})) {
                    for (const entry of Array.isArray(value) ? value : [value])
                      address.searchParams.append(name, entry ?? '');
                  }
                  const request = new Request(address, {
                    method: signed.method,
                    headers: signed.headers,
                    redirect: 'error',
                    signal: requestSignal,
                  });
                  const response = await fetchPort(request);
                  let headersBytes = 0;
                  const headers: Record<string, string> = {};
                  response.headers.forEach((value, name) => {
                    headersBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
                    headers[name] = value;
                  });
                  try {
                    // Proof: removing header admission failed the 65-KiB wire refusal; cumulative overflow also cancels the unread body.
                    chargeBytes(budget, headersBytes);
                    if (headersBytes > 65536) fail('limit');
                  } catch (cause) {
                    return await completeS3Operation(
                      () => Promise.reject(sanitizeFailure(cause, requestSignal, caller)),
                      async () => {
                        // Proof: removing cancellation left the oversized-header production response body owned and uncancelled.
                        if (response.body !== null) await response.body.cancel();
                      },
                      requestSignal,
                      caller,
                    );
                  }
                  const isDelete = signed.method === 'DELETE';
                  const optionalBody = isDelete || response.status < 200 || response.status >= 300;
                  const bytes =
                    optionalBody && response.body === null
                      ? new Uint8Array()
                      : await readBody(response, requestSignal, caller, budget);
                  const contentLength = response.headers.get('content-length');
                  if (contentLength !== null)
                    requireCondition(
                      // Proof: bypassing actual-byte agreement changed the mismatched Content-Length wire refusal.
                      /^(0|[1-9][0-9]*)$/.test(contentLength) &&
                        Number.isSafeInteger(Number(contentLength)) &&
                        Number(contentLength) === bytes.byteLength,
                    );
                  checkCancellation(requestSignal, caller);
                  if (response.status === 404) fail('not-found');
                  if (response.status < 200 || response.status >= 300 || response.redirected)
                    fail('unavailable');
                  const query = address.searchParams;
                  const root = query.has('versioning')
                    ? 'VersioningConfiguration'
                    : query.has('versions')
                      ? 'ListVersionsResult'
                      : query.has('uploads')
                        ? 'ListMultipartUploadsResult'
                        : query.has('uploadId')
                          ? 'ListPartsResult'
                          : undefined;
                  if (root !== undefined) verifyXml(bytes, root);
                  if (isDelete) requireCondition(response.status === 204 && bytes.byteLength === 0);
                  // Proof: removing the exact status check returned a matching-length 206 partial version in the production GET negative.
                  else requireCondition(response.status === 200);
                  return {
                    response: {
                      statusCode: response.status,
                      headers,
                      body: new Response(new Uint8Array(bytes)).body,
                    },
                  };
                } catch (cause) {
                  if (
                    cause instanceof RegistryS3Error ||
                    cause instanceof RegistryS3CompletionError
                  )
                    throw cause;
                  checkCancellation(requestSignal, caller);
                  return fail('unavailable');
                } finally {
                  clearTimeout(requestTimer);
                }
              },
            },
          });
          checkCancellation(signal, caller);
          const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }), {
            abortSignal: signal,
          });
          // Proof: removing the versioning guard admitted never-enabled and Suspended wire configurations.
          requireCondition(versioning.Status === 'Enabled');
          return await operate(client, signal, budget);
        } catch (cause) {
          if (cause instanceof RegistryS3Error || cause instanceof RegistryS3CompletionError)
            throw cause;
          checkCancellation(signal, caller);
          return fail('unavailable');
        }
      },
      () => {
        // Proof: removing timer cleanup kept the constructor-fault child alive until its 1.5-second test kill.
        clearTimeout(timer);
        // Proof: removing client cleanup hid the injected SDK destructor failure in the isolated production caller.
        client?.destroy();
        return Promise.resolve();
      },
      signal,
      caller,
    );
  }

  return {
    census: () =>
      run(async (client, signal, budget) => {
        const versions: RegistryS3Version[] = [];
        const uploads: RegistryS3Upload[] = [];
        const identities = new Set<string>();
        const visible = new Set<string>();
        const keys = new Set<string>();
        let payloadBytes = 0;
        const addBytes = (bytes: number) => {
          payloadBytes += bytes;
          // Proof: removing safe-total validation admitted the 2^53 payload overflow in the production census negative.
          requireCondition(Number.isSafeInteger(payloadBytes));
        };
        let cursor: { key: string; id: string } | undefined;
        const cursors = new Set<string>();
        for (;;) {
          const page = await client.send(
            new ListObjectVersionsCommand({
              Bucket: bucket,
              Prefix: prefix,
              EncodingType: 'url',
              MaxKeys: 1000,
              ...(cursor === undefined
                ? {}
                : { KeyMarker: cursor.key, VersionIdMarker: cursor.id }),
            }),
            { abortSignal: signal },
          );
          requireCondition(
            // Proof: bypassed bucket/prefix/encoding validation admitted the wrong-scope and missing-encoding wire negatives.
            page.Name === bucket &&
              page.EncodingType === 'url' &&
              decodeKey(page.Prefix) === prefix &&
              (page.Delimiter === undefined || page.Delimiter === '') &&
              readCollection(page.CommonPrefixes).length === 0,
          );
          requireCondition(
            page.KeyMarker === undefined || page.KeyMarker === ''
              ? cursor === undefined
              : decodeKey(page.KeyMarker) === cursor?.key,
          );
          requireCondition(
            page.VersionIdMarker === undefined || page.VersionIdMarker === ''
              ? cursor === undefined
              : page.VersionIdMarker === cursor?.id,
          );
          const physical: RegistryS3Version[] = [];
          for (const version of readCollection(page.Versions))
            physical.push({
              kind: 'object',
              key: requireKey(decodeKey(version.Key)),
              versionId: requireVersionId(version.VersionId),
              visible: requireBoolean(version.IsLatest),
              bytes: requireNumber(version.Size),
            });
          for (const marker of readCollection(page.DeleteMarkers))
            physical.push({
              kind: 'delete-marker',
              key: requireKey(decodeKey(marker.Key)),
              versionId: requireVersionId(marker.VersionId),
              visible: requireBoolean(marker.IsLatest),
            });
          // Proof: removing this combined bound admitted 1,000 versions plus a marker despite the 1,000-entry request.
          requireCondition(physical.length <= 1000);
          for (const version of physical) {
            const identity = identify(version.key, version.versionId);
            requireCondition(
              // Proof: removing identity/latest checks admitted duplicate historical identities and multiple visible versions in the wire negatives.
              !identities.has(identity) &&
                (!version.visible || !visible.has(version.key)) &&
                (cursor === undefined || compareKeys(version.key, cursor.key) >= 0),
            );
            identities.add(identity);
            keys.add(version.key);
            if (version.visible) visible.add(version.key);
            if (version.kind === 'object') addBytes(version.bytes);
            chargeRecord(budget, version);
            versions.push(version);
          }
          if (!requireBoolean(page.IsTruncated)) {
            requireCondition(!page.NextKeyMarker && !page.NextVersionIdMarker);
            break;
          }
          const next = {
            key: requireKey(decodeKey(page.NextKeyMarker)),
            id: requireVersionId(page.NextVersionIdMarker),
          };
          const identity = identify(next.key, next.id);
          // S3 continuation IDs are opaque provider cursors; a next tuple need not identify a returned entry.
          // Proof: removing cycle, cursor direction or page-key ordering checks admits the isolated cyclic/backward versions wire negatives before followup.
          requireCondition(
            !cursors.has(identity) &&
              (cursor === undefined || compareKeys(next.key, cursor.key) >= 0) &&
              physical.every((version) => compareKeys(version.key, next.key) <= 0),
          );
          cursors.add(identity);
          cursor = next;
        }
        // Proof: removing latest completeness admitted a key containing only noncurrent history in the wire negative.
        requireCondition(keys.size === visible.size);
        cursor = undefined;
        cursors.clear();
        identities.clear();
        for (;;) {
          const page: ListMultipartUploadsCommandOutput = await client.send(
            new ListMultipartUploadsCommand({
              Bucket: bucket,
              Prefix: prefix,
              EncodingType: 'url',
              MaxUploads: 1000,
              ...(cursor === undefined ? {} : { KeyMarker: cursor.key, UploadIdMarker: cursor.id }),
            }),
            { abortSignal: signal },
          );
          requireCondition(
            // Proof: removing multipart scope validation admitted the foreign-bucket upload census in the wire negative.
            page.Bucket === bucket &&
              page.EncodingType === 'url' &&
              decodeKey(page.Prefix) === prefix &&
              (page.Delimiter === undefined || page.Delimiter === '') &&
              readCollection(page.CommonPrefixes).length === 0,
          );
          requireCondition(
            page.KeyMarker === undefined || page.KeyMarker === ''
              ? cursor === undefined
              : decodeKey(page.KeyMarker) === cursor?.key,
          );
          requireCondition(
            page.UploadIdMarker === undefined || page.UploadIdMarker === ''
              ? cursor === undefined
              : page.UploadIdMarker === cursor?.id,
          );
          const pending = readCollection(page.Uploads).map(
            (upload) =>
              ({
                key: requireKey(decodeKey(upload.Key)),
                uploadId: requireVersionId(upload.UploadId),
                parts: [],
              }) satisfies RegistryS3Upload,
          );
          for (const upload of pending) {
            const identity = identify(upload.key, upload.uploadId);
            requireCondition(
              !identities.has(identity) &&
                (cursor === undefined || compareKeys(upload.key, cursor.key) >= 0),
            );
            identities.add(identity);
            chargeRecord(budget, upload);
            uploads.push(upload);
          }
          if (!requireBoolean(page.IsTruncated)) {
            requireCondition(!page.NextKeyMarker && !page.NextUploadIdMarker);
            break;
          }
          const next: { key: string; id: string } = {
            key: requireKey(decodeKey(page.NextKeyMarker)),
            id: requireVersionId(page.NextUploadIdMarker),
          };
          const identity = identify(next.key, next.id);
          // S3 continuation IDs are opaque provider cursors; a next tuple need not identify a returned entry.
          // Proof: removing cycle, cursor direction or page-key ordering checks admits the isolated cyclic/backward multipart wire negatives before followup.
          requireCondition(
            !cursors.has(identity) &&
              (cursor === undefined || compareKeys(next.key, cursor.key) >= 0) &&
              pending.every((upload) => compareKeys(upload.key, next.key) <= 0),
          );
          cursors.add(identity);
          cursor = next;
        }
        for (const upload of uploads) {
          let marker = 0;
          for (;;) {
            const page = await client.send(
              new ListPartsCommand({
                Bucket: bucket,
                Key: upload.key,
                UploadId: upload.uploadId,
                MaxParts: 1000,
                ...(marker === 0 ? {} : { PartNumberMarker: String(marker) }),
              }),
              { abortSignal: signal },
            );
            requireCondition(
              page.Bucket === bucket &&
                page.Key === upload.key &&
                page.UploadId === upload.uploadId &&
                (page.PartNumberMarker === undefined || page.PartNumberMarker === '0'
                  ? marker === 0
                  : page.PartNumberMarker === String(marker)),
            );
            const previousMarker = marker;
            for (const part of readCollection(page.Parts)) {
              const number = requireNumber(part.PartNumber);
              const bytes = requireNumber(part.Size);
              // Proof: removing increasing-part validation admitted zero and duplicate part numbers in the production census negatives.
              requireCondition(number > marker && number <= 10000);
              marker = number;
              addBytes(bytes);
              const physical = { number, bytes };
              chargeRecord(budget, physical);
              upload.parts.push(physical);
            }
            if (!requireBoolean(page.IsTruncated)) {
              requireCondition(
                page.NextPartNumberMarker === undefined || page.NextPartNumberMarker === '0',
              );
              break;
            }
            requireCondition(
              // Proof: removing progress validation took an unadmitted third parts request after an empty truncated page.
              page.NextPartNumberMarker === String(marker) && marker > previousMarker,
            );
          }
        }
        const census: RegistryS3Census = {
          versions,
          uploads,
          payloadBytes,
          accounting: 'payload-only',
        };
        chargeBytes(budget, Buffer.byteLength(JSON.stringify(census)));
        return census;
      }),
    readVersion: (key, versionId) =>
      run(async (client, signal) => {
        requireKey(key);
        requireVersionId(versionId);
        const object = await client.send(
          // Proof: removing VersionId from either command changed the real SDK request into a key-only operation.
          new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
          { abortSignal: signal },
        );
        // Proof: removing response identity accepted a GET without its exact returned VersionId.
        requireCondition(object.VersionId === versionId && object.Body !== undefined);
        const length = requireNumber(object.ContentLength);
        if (length > responseBytes) fail('limit');
        if (object.Body === undefined) return fail('invalid-response');
        const bytes = await object.Body.transformToByteArray();
        requireCondition(bytes.byteLength === length);
        return bytes;
      }),
    deleteVersion: (key, versionId) =>
      run(async (client, signal) => {
        requireKey(key);
        requireVersionId(versionId);
        const removed = await client.send(
          // Proof: removing VersionId from this command failed the exact-version DELETE wire assertion.
          new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
          { abortSignal: signal },
        );
        // Proof: removing response identity admitted a DELETE response without its exact returned VersionId.
        requireCondition(removed.VersionId === versionId);
      }),
  };
}
