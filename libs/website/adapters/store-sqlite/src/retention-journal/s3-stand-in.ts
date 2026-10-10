/**
 * Path-style S3 emulation for adapter tests. It checks no signature, but refuses an object
 * request without a presigned `X-Amz-Signature` query and a listing without a SigV4
 * `Authorization` header, which is how Bun's `S3Client` signs `list`.
 */
export class S3StandIn {
  /** When false, PUT stores but answers without `x-amz-version-id`, as an unversioned bucket does. */
  versioned = true;
  /** When true, PUT with `If-None-Match: *` on an existing key answers 412. */
  honourIfNoneMatch = true;
  /** Full object keys whose GET and PUT answer 500. */
  readonly failingKeys = new Set<string>();
  /** When true, a truncated listing omits `NextContinuationToken`. */
  dropContinuationToken = false;
  /** Upper bound on keys per listing page, below any client `max-keys`. */
  pageSize = 1000;
  /** Every request as `METHOD path?query`, for assertions. */
  readonly requests: string[] = [];

  private readonly objects = new Map<
    string,
    { bytes: Uint8Array<ArrayBuffer>; versionId: string }
  >();
  private readonly server: Bun.Server<undefined>;
  private nextVersion = 1;

  constructor(readonly bucket: string) {
    this.server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) => this.answer(request),
    });
  }

  get endpoint(): string {
    return `http://127.0.0.1:${String(this.server.port)}`;
  }

  /** Current bytes of a full object key, or null. */
  stored(objectKey: string): Uint8Array | null {
    return this.objects.get(objectKey)?.bytes ?? null;
  }

  async stop(): Promise<void> {
    await this.server.stop(true);
  }

  private async answer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.requests.push(`${request.method} ${url.pathname}${url.search}`);
    const bucketPath = `/${this.bucket}`;
    if (url.pathname === bucketPath || url.pathname === `${bucketPath}/`) {
      if (!(request.headers.get('authorization') ?? '').startsWith('AWS4-HMAC-SHA256 '))
        return new Response('missing signature', { status: 403 });
      return this.listObjects(url);
    }
    if (!url.pathname.startsWith(`${bucketPath}/`))
      return new Response('no such bucket', { status: 404 });
    if (!url.searchParams.has('X-Amz-Signature'))
      return new Response('missing presigned signature', { status: 403 });
    const objectKey = decodeURIComponent(url.pathname.slice(bucketPath.length + 1));
    if (this.failingKeys.has(objectKey)) return new Response('injected failure', { status: 500 });
    if (request.method === 'GET') {
      const current = this.objects.get(objectKey);
      if (current === undefined) return new Response('no such key', { status: 404 });
      return new Response(current.bytes, { headers: this.versionHeaders(current.versionId) });
    }
    if (request.method === 'PUT') {
      if (
        this.honourIfNoneMatch &&
        request.headers.get('if-none-match') === '*' &&
        this.objects.has(objectKey)
      )
        return new Response('precondition failed', { status: 412 });
      const versionId = `stand-in-version-${String(this.nextVersion)}`;
      this.nextVersion += 1;
      this.objects.set(objectKey, {
        bytes: new Uint8Array(await request.arrayBuffer()),
        versionId,
      });
      return new Response(null, { headers: this.versionHeaders(versionId) });
    }
    return new Response('method not allowed', { status: 405 });
  }

  private versionHeaders(versionId: string): Record<string, string> {
    return this.versioned ? { 'x-amz-version-id': versionId } : {};
  }

  private listObjects(url: URL): Response {
    if (url.searchParams.get('list-type') !== '2')
      return new Response('only ListObjectsV2', { status: 400 });
    const prefix = url.searchParams.get('prefix') ?? '';
    const requested = Number(url.searchParams.get('max-keys') ?? '1000');
    const limit = Math.min(requested, this.pageSize);
    const token = url.searchParams.get('continuation-token');
    const offset = token === null ? 0 : Number(token.replace('page-', ''));
    const matching = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const page = matching.slice(offset, offset + limit);
    const truncated = offset + limit < matching.length;
    const next =
      truncated && !this.dropContinuationToken
        ? `<NextContinuationToken>page-${String(offset + limit)}</NextContinuationToken>`
        : '';
    const contents = page
      .map(
        (key) =>
          `<Contents><Key>${escapeXml(key)}</Key><Size>${String(this.objects.get(key)?.bytes.length ?? 0)}</Size></Contents>`,
      )
      .join('');
    const body = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${escapeXml(this.bucket)}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${String(page.length)}</KeyCount><MaxKeys>${String(limit)}</MaxKeys><IsTruncated>${String(truncated)}</IsTruncated>${next}${contents}</ListBucketResult>`;
    return new Response(body, { headers: { 'content-type': 'application/xml' } });
  }
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
