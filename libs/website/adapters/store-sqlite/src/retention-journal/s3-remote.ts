import { type JournalObject, JournalRemoteError, type RetentionJournalRemote } from './remote';

/** Validated connection settings for the journal bucket; see {@link readS3JournalConfig}. */
export interface S3JournalConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Relative, `/`-terminated, without `.` or `..` segments. */
  prefix: string;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
const regionPattern = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const credentialPattern = /^[\x21-\x7e]{1,256}$/u;
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u;
const prefixSegmentPattern = /^[A-Za-z0-9._-]+$/u;

function required(env: Record<string, string | undefined>, variable: string): string {
  const value = env[variable];
  if (value === undefined || value === '') throw new Error(`${variable} is required`);
  return value;
}

function checked(value: string, variable: string, pattern: RegExp, expectation: string): string {
  if (!pattern.test(value)) throw new Error(`${variable} must be ${expectation}`);
  return value;
}

function readEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('S3_ENDPOINT is not a URL', { cause: error });
  }
  const secure = url.protocol === 'https:';
  // Proof: removing the loopback condition accepted http://storage.example.test in `config parsing names each missing or malformed variable without echoing secrets`.
  if (!secure && !(url.protocol === 'http:' && loopbackHosts.has(url.hostname)))
    throw new Error('S3_ENDPOINT must be an https URL (http only for a loopback host)');
  if (
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error('S3_ENDPOINT must be an origin without credentials, path, query or fragment');
  return url.origin;
}

function readPrefix(value: string): string {
  const segments = value.split('/');
  // Proof: removing the segment checks accepted `retention-journal/../website/` in `config parsing names each missing or malformed variable without echoing secrets`.
  if (
    !value.endsWith('/') ||
    segments.pop() !== '' ||
    segments.some(
      (segment) => !prefixSegmentPattern.test(segment) || segment === '.' || segment === '..',
    )
  )
    throw new Error(
      'RETENTION_JOURNAL_PREFIX must be relative, end with "/" and contain no empty, "." or ".." segment',
    );
  return value;
}

/**
 * Reads the journal bucket settings from the process environment.
 *
 * @throws Error naming the first missing or malformed variable; secret values never appear.
 */
export function readS3JournalConfig(env: Record<string, string | undefined>): S3JournalConfig {
  return {
    endpoint: readEndpoint(required(env, 'S3_ENDPOINT')),
    region: checked(required(env, 'S3_REGION'), 'S3_REGION', regionPattern, 'a region name'),
    accessKeyId: checked(
      required(env, 'S3_ACCESS_KEY_ID'),
      'S3_ACCESS_KEY_ID',
      credentialPattern,
      'printable ASCII without spaces',
    ),
    secretAccessKey: checked(
      required(env, 'S3_SECRET_ACCESS_KEY'),
      'S3_SECRET_ACCESS_KEY',
      credentialPattern,
      'printable ASCII without spaces',
    ),
    bucket: checked(
      required(env, 'RETENTION_JOURNAL_BUCKET'),
      'RETENTION_JOURNAL_BUCKET',
      bucketPattern,
      'an S3 bucket name',
    ),
    prefix: readPrefix(required(env, 'RETENTION_JOURNAL_PREFIX')),
  };
}

/** Presigned URLs live only for the one request that follows. */
const presignSeconds = 60;
const preconditionFailed = 412;
const notFound = 404;

/**
 * The journal port on an S3-compatible versioned bucket. GET and PUT go through presigned
 * URLs with `fetch` so the `x-amz-version-id` response header is readable; `list` uses
 * `S3Client.list`.
 */
export class S3JournalRemote implements RetentionJournalRemote {
  private readonly client: Bun.S3Client;
  private readonly prefix: string;

  constructor(config: S3JournalConfig) {
    this.client = new Bun.S3Client({
      endpoint: config.endpoint,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucket: config.bucket,
    });
    this.prefix = config.prefix;
  }

  async get(key: string): Promise<JournalObject | null> {
    const response = await this.send(key, 'GET');
    if (response.status === notFound) {
      await response.body?.cancel();
      return null;
    }
    await this.requireSuccess(key, response);
    const versionId = await this.requireVersionId(key, response);
    try {
      return { bytes: new Uint8Array(await response.arrayBuffer()), versionId };
    } catch (error) {
      throw new JournalRemoteError('unreadable', key, 'the GET body did not arrive', {
        cause: error,
      });
    }
  }

  async put(
    key: string,
    bytes: Uint8Array,
    options: { ifNoneMatch?: boolean } = {},
  ): Promise<string> {
    const headers: Record<string, string> =
      options.ifNoneMatch === true ? { 'If-None-Match': '*' } : {};
    const response = await this.send(key, 'PUT', { body: bytes.slice(), headers });
    // Proof: removing this branch made `an existing key refuses an if-none-match put` see `unreadable`.
    if (response.status === preconditionFailed) {
      await response.body?.cancel();
      throw new JournalRemoteError('precondition_failed', key, 'the bucket answered HTTP 412');
    }
    await this.requireSuccess(key, response);
    const versionId = await this.requireVersionId(key, response);
    await response.body?.cancel();
    return versionId;
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      let page;
      try {
        page = await this.client.list({ prefix: `${this.prefix}${prefix}`, continuationToken });
      } catch (error) {
        throw new JournalRemoteError('unreadable', prefix, 'the listing failed', { cause: error });
      }
      for (const entry of page.contents ?? []) {
        if (!entry.key.startsWith(this.prefix))
          throw new JournalRemoteError(
            'unreadable',
            prefix,
            'the listing returned a key outside the journal prefix',
          );
        keys.push(entry.key.slice(this.prefix.length));
      }
      const next = page.isTruncated === true ? page.nextContinuationToken : undefined;
      // Proof: removing this check made `a truncated list without a token throws` resolve with one key.
      if (page.isTruncated === true && (next === undefined || next === ''))
        throw new JournalRemoteError(
          'unreadable',
          prefix,
          'the listing is truncated without a continuation token',
        );
      if (next !== undefined && next === continuationToken)
        throw new JournalRemoteError(
          'unreadable',
          prefix,
          'the listing repeated its continuation token',
        );
      continuationToken = next;
    } while (continuationToken !== undefined);
    return keys.sort();
  }

  private async send(
    key: string,
    method: 'GET' | 'PUT',
    init: { body?: Uint8Array<ArrayBuffer>; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = this.client.presign(`${this.prefix}${key}`, { method, expiresIn: presignSeconds });
    try {
      return await fetch(url, { method, ...init });
    } catch (error) {
      // Proof: rethrowing the fetch TypeError made `a network failure is a JournalRemoteError naming the key` fail on the error class.
      throw new JournalRemoteError('unreadable', key, `the ${method} request failed`, {
        cause: error,
      });
    }
  }

  private async requireSuccess(key: string, response: Response): Promise<void> {
    // Proof: returning instead of throwing here made `a 5xx is a JournalRemoteError naming the key` see an unversioned refusal instead.
    if (response.ok) return;
    await response.body?.cancel();
    throw new JournalRemoteError(
      'unreadable',
      key,
      `the bucket answered HTTP ${String(response.status)}`,
    );
  }

  /** AWS answers the literal `null` for an object stored while versioning was off. */
  private async requireVersionId(key: string, response: Response): Promise<string> {
    const versionId = response.headers.get('x-amz-version-id');
    // Proof: removing this check made `an unversioned bucket is refused` resolve the PUT.
    if (versionId === null || versionId === '' || versionId === 'null') {
      await response.body?.cancel();
      throw new JournalRemoteError('unversioned', key, 'the bucket assigned no version id');
    }
    return versionId;
  }
}
