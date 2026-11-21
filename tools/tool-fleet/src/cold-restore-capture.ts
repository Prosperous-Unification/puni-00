import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';

import { GetObjectCommand, type GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';
import { type } from 'arktype';

import { consumeRegistryStream, readRegistryBytes } from './registry-stream';

const authorityRoot = '/etc/puni';
const metadataBytes = 1024 ** 2;
const digest = type(/^[a-f0-9]{64}$/);
const name = type(/^[a-z0-9][a-z0-9.-]{0,252}$/);
const key = type(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/).narrow(
  (value) => Buffer.byteLength(value) <= 1024,
);
const version = type(/^[\x20-\x7e]{1,1024}$/).narrow(
  (value) => value.trim().length > 0 && value !== 'null',
);
const uint64 = type(/^[1-9][0-9]{0,19}$/).narrow((value) => BigInt(value) <= 18446744073709551615n);
const controllerPath = type(/^\/etc\/puni\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const captureId = type(/^[a-z0-9][a-z0-9-]{0,63}$/);

const ReaderConfiguration = type({
  schemaVersion: '1',
  clusterId: name,
  endpoint: '0 < string <= 2048',
  bucket: /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
  publicationPrefix: '0 < string <= 256',
  region: /^[a-z0-9][a-z0-9-]{0,62}$/,
  caFile: controllerPath,
  credentialsFile: controllerPath,
  '+': 'reject',
});
const Credentials = type({
  accessKeyId: '0 < string <= 256',
  secretAccessKey: '0 < string <= 512',
  'sessionToken?': '0 < string <= 4096',
  '+': 'reject',
});
const Publication = type({
  schemaVersion: '1',
  clusterId: name,
  captureId,
  sidecar: { objectKey: key, versionId: version, sha256: digest, '+': 'reject' },
  '+': 'reject',
});
const Witness = type({
  etcdClusterId: uint64,
  memberId: uint64,
  leaderId: uint64,
  peerSha256: digest,
  term: uint64,
  committedIndex: uint64,
  appliedIndex: uint64,
  '+': 'reject',
});
const Member = type({
  memberId: uint64,
  memberName: name,
  isLearner: 'boolean',
  '+': 'reject',
});
const ProviderIdentity = type('0 < string <= 256').narrow(
  (identity) =>
    /^hcloud:[1-9][0-9]*$/.test(identity) ||
    /^qemu:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(identity),
);
export const SnapshotMemberMapping = type({
  memberId: uint64,
  memberName: name,
  nodeName: name,
  nodeUid: /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
  machineId: /^[a-f0-9]{32}$/,
  // Proof: restoring the broad string field admitted the re-anchored SSH label,
  // wrong QEMU UUID version and leading-zero Hetzner decimal into v2 manifests.
  providerIdentity: ProviderIdentity,
  '+': 'reject',
});
export const CapturedSnapshot = type({
  bucket: /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
  objectKey: key,
  versionId: version,
  sha256: digest,
  bytes: 'number.safe > 0',
  '+': 'reject',
});
const Evidence = type({
  schemaVersion: '2',
  clusterId: name,
  snapshot: CapturedSnapshot,
  witness: { before: Witness, afterFirstChunk: Witness, '+': 'reject' },
  members: Member.array().atLeastLength(1),
  mappings: SnapshotMemberMapping.array().atLeastLength(1),
  '+': 'reject',
});

interface SignedRead {
  protocol: string;
  hostname: string;
  port?: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  query?: Record<string, string | string[] | null>;
}

type CaptureObject = 'Capture publication' | 'Capture sidecar' | 'Stored snapshot';

type CaptureReadKind = 'not found' | 'access denied' | 'transport failed' | 'response refused';

/** The message is safe for CLI output. The private cause is for programmatic callers. */
export class CaptureObjectReadError extends Error {
  constructor(
    object: CaptureObject,
    kind: CaptureReadKind | 'request failed',
    options?: ErrorOptions,
  ) {
    super(`${object} ${kind}`, options);
  }
}

class CaptureReadFailure extends Error {
  constructor(readonly kind: CaptureReadKind) {
    super(kind);
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`Malformed ${label} JSON`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Read controller-owned, canonical files from the fixed installed authority directory. */
async function readControllerFile(path: string, mode: number): Promise<Uint8Array> {
  if ((await realpath(path)) !== path)
    throw new Error('Cold restore controller file is not canonical');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 0 ||
      (stat.mode & 0o777) !== mode ||
      stat.nlink !== 1 ||
      stat.size === 0 ||
      stat.size > metadataBytes
    )
      throw new Error('Cold restore controller file is not protected');
    return await file.readFile();
  } finally {
    await file.close();
  }
}

/** Use an explicit reader principal with no ambient endpoint, CA or proxy authority. */
async function openStore(clusterId: string, signal: AbortSignal) {
  const directory = await lstat(authorityRoot);
  if (
    !directory.isDirectory() ||
    directory.uid !== 0 ||
    directory.gid !== 0 ||
    (directory.mode & 0o022) !== 0
  )
    throw new Error('Cold restore controller directory is not protected');
  const reader = ReaderConfiguration(
    parseJson(
      await readControllerFile(`${authorityRoot}/cold-restore-reader.json`, 0o644),
      'reader',
    ),
  );
  if (reader instanceof type.errors || reader.clusterId !== clusterId)
    throw new Error('Cold restore reader configuration does not bind this cluster');
  const origin = new URL(reader.endpoint);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== reader.endpoint ||
    !reader.publicationPrefix.startsWith(`${clusterId}/`) ||
    !reader.publicationPrefix.endsWith('/') ||
    key(reader.publicationPrefix.slice(0, -1)) instanceof type.errors
  )
    throw new Error('Cold restore reader requires a fixed HTTPS origin and cluster prefix');
  const credentials = Credentials(
    parseJson(await readControllerFile(reader.credentialsFile, 0o600), 'reader credentials'),
  );
  if (credentials instanceof type.errors)
    throw new Error('Malformed cold restore reader credentials');
  const ca = new TextDecoder('utf-8', { fatal: true }).decode(
    await readControllerFile(reader.caFile, 0o644),
  );
  const client = new S3Client({
    endpoint: origin.origin,
    credentials,
    region: reader.region,
    forcePathStyle: true,
    followRegionRedirects: false,
    useArnRegion: false,
    maxAttempts: 1,
    retryMode: 'standard',
    defaultsMode: 'standard',
    authSchemePreference: ['sigv4'],
    disableS3ExpressSessionAuth: true,
    disableMultiregionAccessPoints: true,
    useDualstackEndpoint: false,
    useFipsEndpoint: false,
    useGlobalEndpoint: false,
    disableHostPrefix: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    userAgentAppId: 'cold-restore-recorder',
    disableClockSkewCorrection: false,
    requestHandler: {
      async handle(request: SignedRead) {
        const address = new URL(
          request.path,
          `${request.protocol}//${request.hostname}${request.port === undefined ? '' : `:${String(request.port)}`}`,
        );
        if (
          request.method !== 'GET' ||
          address.origin !== origin.origin ||
          !address.pathname.startsWith(`/${reader.bucket}/${clusterId}/`)
        )
          throw new Error('Cold restore object read escaped the configured store');
        for (const [parameter, value] of Object.entries(request.query ?? {})) {
          for (const entry of Array.isArray(value) ? value : [value])
            address.searchParams.append(parameter, entry ?? '');
        }
        // Boundary: Bun 1.4.4 supports proxy:false; the workspace Bun fetch declarations omit it.
        const options = {
          method: 'GET',
          headers: request.headers,
          redirect: 'error',
          signal,
          proxy: false,
          // Proof: removing this option made the versioned gzip test read snapshot-v1
          // and fail with "Stored snapshot bytes differ from capture evidence".
          decompress: false,
          tls: { ca, rejectUnauthorized: true },
        } as const;
        let response: Response;
        try {
          response = await fetch(address, options);
        } catch {
          throw new CaptureReadFailure('transport failed');
        }
        if (response.status !== 200 || response.body === null) {
          await response.body?.cancel();
          if (response.status === 404) throw new CaptureReadFailure('not found');
          if (response.status === 403) throw new CaptureReadFailure('access denied');
          throw new CaptureReadFailure('response refused');
        }
        return {
          response: {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers),
            body: response.body,
          },
        };
      },
    },
  });
  return { client, reader };
}

/** Require the provider's immutable version independently of capture evidence. */
async function readObject(
  client: S3Client,
  object: CaptureObject,
  bucket: string,
  objectKey: string,
  versionId: string | undefined,
  signal: AbortSignal,
) {
  let response: GetObjectCommandOutput;
  try {
    response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey, VersionId: versionId }),
      { abortSignal: signal },
    );
  } catch (fault) {
    // Proof: bypassing category routing made the publication 404, 403 and wrong-CA
    // cases reach their final diagnostic assertion with the generic request refusal.
    const kind = fault instanceof CaptureReadFailure ? fault.kind : 'request failed';
    // Proof: omitting the cause made the direct recorder case observe false SDK error identity.
    throw new CaptureObjectReadError(object, kind, { cause: fault });
  }
  const observed = version(response.VersionId);
  if (
    response.Body === undefined ||
    observed instanceof type.errors ||
    (versionId !== undefined && observed !== versionId) ||
    response.ContentLength === undefined ||
    !Number.isSafeInteger(response.ContentLength) ||
    response.ContentLength <= 0
  ) {
    await response.Body?.transformToWebStream().cancel();
    throw new Error('Cold restore object response lacks exact immutable identity');
  }
  return {
    versionId: observed,
    bytes: response.ContentLength,
    body: response.Body.transformToWebStream(),
  };
}

async function readMetadata(object: Awaited<ReturnType<typeof readObject>>, label: string) {
  const bytes = await readRegistryBytes(object.body, metadataBytes, label);
  if (bytes.byteLength !== object.bytes)
    throw new Error(`${label} length differs from stored object`);
  return bytes;
}

/** Require a stable leader-bound cut and a one-to-one mapping for the complete member list. */
function verifyMembership(evidence: typeof Evidence.infer): void {
  const { before, afterFirstChunk: after } = evidence.witness;
  if (
    before.memberId !== before.leaderId ||
    before.etcdClusterId !== after.etcdClusterId ||
    before.memberId !== after.memberId ||
    before.leaderId !== after.leaderId ||
    before.peerSha256 !== after.peerSha256 ||
    before.term !== after.term ||
    before.committedIndex !== before.appliedIndex ||
    after.committedIndex !== after.appliedIndex
  )
    throw new Error(
      'Cold restore snapshot cut witness changed its peer, leader or term, or was not applied',
    );
  if (before.committedIndex !== after.committedIndex)
    throw new Error(
      BigInt(after.committedIndex) > BigInt(before.committedIndex)
        ? 'Raft index advanced across the snapshot cut'
        : 'Raft index regressed across the snapshot cut',
    );
  const { members, mappings } = evidence;
  if (
    new Set(members.map(({ memberId }) => memberId)).size !== members.length ||
    new Set(members.map(({ memberName }) => memberName)).size !== members.length ||
    members.length !== mappings.length
  )
    throw new Error('Cold restore snapshot membership has duplicate or missing identities');
  const mapped = new Map(mappings.map((mapping) => [mapping.memberId, mapping.memberName]));
  if (
    mapped.size !== mappings.length ||
    members.some(({ memberId, memberName }) => mapped.get(memberId) !== memberName) ||
    new Set(mappings.map(({ nodeName }) => nodeName)).size !== mappings.length ||
    new Set(mappings.map(({ nodeUid }) => nodeUid)).size !== mappings.length ||
    new Set(mappings.map(({ machineId }) => machineId)).size !== mappings.length ||
    new Set(mappings.map(({ providerIdentity }) => providerIdentity)).size !== mappings.length ||
    !members.some(({ memberId, isLearner }) => memberId === before.leaderId && !isLearner)
  )
    throw new Error('Cold restore snapshot membership is incomplete or ambiguous');
}

/** Verify the local copy against the independently downloaded immutable object. */
async function verifyLocalCopy(
  path: string,
  snapshot: typeof CapturedSnapshot.infer,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== snapshot.bytes)
      throw new Error('Downloaded snapshot size differs from capture evidence');
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      signal.throwIfAborted();
      if (!(chunk instanceof Uint8Array)) throw new Error('Downloaded snapshot is not binary');
      bytes += chunk.byteLength;
      if (bytes > snapshot.bytes) throw new Error('Downloaded snapshot exceeds capture evidence');
      hash.update(chunk);
    }
    if (bytes !== snapshot.bytes || hash.digest('hex') !== snapshot.sha256)
      throw new Error('Downloaded snapshot bytes differ from capture evidence');
  } finally {
    await file.close();
  }
}

/** Resolve a capture publication using installed controller authority and check the exact snapshot. */
export async function verifyCapturedSnapshot(input: {
  clusterId: string;
  captureId: string;
  objectKey: string;
  versionId: string;
  path: string;
}) {
  const selectedCapture = captureId(input.captureId);
  const selectedKey = key(input.objectKey);
  const selectedVersion = version(input.versionId);
  if (
    selectedCapture instanceof type.errors ||
    selectedKey instanceof type.errors ||
    selectedVersion instanceof type.errors
  )
    throw new Error('Invalid cold restore capture, object key or immutable version');
  const signal = AbortSignal.timeout(60_000);
  const { client, reader } = await openStore(input.clusterId, signal);
  try {
    const capturePrefix = `${reader.publicationPrefix}${selectedCapture}/`;
    const publicationKey = `${capturePrefix}publication.json`;
    const publicationObject = await readObject(
      client,
      'Capture publication',
      reader.bucket,
      publicationKey,
      undefined,
      signal,
    );
    const publication = Publication(
      parseJson(
        await readMetadata(publicationObject, 'Capture publication'),
        'capture publication',
      ),
    );
    if (
      publication instanceof type.errors ||
      publication.clusterId !== input.clusterId ||
      publication.captureId !== selectedCapture ||
      !publication.sidecar.objectKey.startsWith(capturePrefix) ||
      publication.sidecar.objectKey === publicationKey
    )
      throw new Error('Cold restore capture publication does not bind the selected sidecar');
    const sidecarObject = await readObject(
      client,
      'Capture sidecar',
      reader.bucket,
      publication.sidecar.objectKey,
      publication.sidecar.versionId,
      signal,
    );
    const sidecar = await readMetadata(sidecarObject, 'Capture sidecar');
    const evidenceSha256 = sha256(sidecar);
    if (evidenceSha256 !== publication.sidecar.sha256)
      throw new Error('Cold restore sidecar differs from the capture publication digest');
    const evidence = Evidence(parseJson(sidecar, 'snapshot membership evidence'));
    if (evidence instanceof type.errors) {
      if (
        evidence.some(
          ({ path }) =>
            path.length === 3 && path[0] === 'mappings' && path[2] === 'providerIdentity',
        )
      )
        throw new Error('Cold restore capture provider identity is not canonical');
      throw new Error('Cold restore capture evidence does not bind the selected snapshot');
    }
    if (
      evidence.clusterId !== input.clusterId ||
      evidence.snapshot.bucket !== reader.bucket ||
      evidence.snapshot.objectKey !== selectedKey ||
      !selectedKey.startsWith(`${input.clusterId}/`)
    )
      throw new Error('Cold restore capture evidence does not bind the selected snapshot');
    verifyMembership(evidence);
    const snapshot = evidence.snapshot;
    const stored = await readObject(
      client,
      'Stored snapshot',
      reader.bucket,
      selectedKey,
      selectedVersion,
      signal,
    );
    if (stored.versionId !== snapshot.versionId || stored.bytes !== snapshot.bytes) {
      await stored.body.cancel();
      if (stored.versionId !== snapshot.versionId)
        throw new Error('Snapshot object version differs from capture evidence');
      throw new Error('Stored snapshot size differs from capture evidence');
    }
    const hash = createHash('sha256');
    const bytes = await consumeRegistryStream(
      stored.body,
      snapshot.bytes,
      'Stored snapshot',
      (chunk) => hash.update(chunk),
    );
    if (bytes !== snapshot.bytes || hash.digest('hex') !== snapshot.sha256)
      throw new Error('Stored snapshot bytes differ from capture evidence');
    await verifyLocalCopy(input.path, snapshot, signal);
    return { evidenceSha256, snapshot, membership: evidence.mappings };
  } finally {
    client.destroy();
  }
}
