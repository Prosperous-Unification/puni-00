import { readFileSync } from 'node:fs';

import { type } from 'arktype';

const Event = type({
  started: 'number.safe >= 0',
  finished: 'number.safe >= 0',
  method: "'GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'|'other'",
  path: "'ping'|'blob-start'|'blob-body'|'blob-read'|'manifest'|'catalog'|'tags'|'other'",
  endpoint: "'ordinary'|'loopback-other'|'other'",
  status: type('100 <= number.safe <= 599').or('null'),
  transport: "'none'|'refused'|'reset'|'timeout'|'aborted'|'other'",
  '+': 'reject',
});
export const RegistryHttpObservation = type({
  events: Event.array().atMostLength(64),
  truncated: 'boolean',
  pending: "0 <= number.safe <= 1024|'overbound'",
  '+': 'reject',
});

/** Shared kernel boot/uptime origin for both root and owner fixture observations; never compares process-local performance origins. */
export function readRegistryFixtureBootMilliseconds(): number {
  const bytes = readFileSync('/proc/uptime');
  if (bytes.length > 128) throw new Error('Oversized fixture boot clock');
  const matched = /^([0-9]+\.[0-9]+) [0-9]+\.[0-9]+\n$/.exec(bytes.toString('ascii'));
  if (matched?.[1] === undefined) throw new Error('Malformed fixture boot clock');
  const milliseconds = Math.floor(Number(matched[1]) * 1000);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
    throw new Error('Unbounded fixture boot clock');
  return milliseconds;
}

function classifyRequest(
  arguments_: Parameters<typeof fetch>,
): Pick<typeof Event.infer, 'method' | 'path' | 'endpoint'> {
  const [request, options] = arguments_;
  const requestedMethod = options?.method ?? (request instanceof Request ? request.method : 'GET');
  const method =
    ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].find((known) => known === requestedMethod) ??
    'other';
  let url: URL;
  try {
    url = new URL(request instanceof Request ? request.url : String(request));
  } catch (cause) {
    if (cause instanceof TypeError)
      return { method: Event.get('method').assert(method), path: 'other', endpoint: 'other' };
    throw cause;
  }
  const endpoint =
    url.origin === 'http://127.0.0.1:5052'
      ? 'ordinary'
      : url.hostname === '127.0.0.1'
        ? 'loopback-other'
        : 'other';
  const path =
    url.pathname === '/v2/'
      ? 'ping'
      : url.pathname === '/v2/_catalog'
        ? 'catalog'
        : url.pathname.endsWith('/blobs/uploads/')
          ? 'blob-start'
          : /\/blobs\/uploads\/[^/]+$/.test(url.pathname)
            ? 'blob-body'
            : /\/blobs\/[^/]+$/.test(url.pathname)
              ? 'blob-read'
              : /\/manifests\/[^/]+$/.test(url.pathname)
                ? 'manifest'
                : url.pathname.endsWith('/tags/list')
                  ? 'tags'
                  : 'other';
  return { method: Event.get('method').assert(method), path, endpoint };
}

/** Transparent fixture-only fetch observer. The exact args/receiver, Response and thrown value survive; observation failure is retained and fails finalization after restoring fetch. Only the latest64 completed observations survive truncation. No request text/body/header/path or caught message is serialized. */
export function startRegistryHttpObservation(
  readTime: () => number = readRegistryFixtureBootMilliseconds,
) {
  const original = globalThis.fetch;
  const events: (typeof Event.infer)[] = [];
  let truncated = false;
  let pending = 0;
  let active = true;
  let observationFailure: { cause: unknown } | undefined;
  const time = () => {
    const stamp = readTime();
    if (!Number.isSafeInteger(stamp) || stamp < 0)
      throw new Error('Invalid fixture observation clock');
    return stamp;
  };
  const remember = (cause: unknown) => {
    observationFailure ??= { cause };
  };
  // Boundary: this fixture forwards the native callable overload/receiver via Reflect.apply. Its optional preconnect descriptor is copied; no request arguments are reconstructed.
  const observed = async function (
    this: unknown,
    ...arguments_: Parameters<typeof fetch>
  ): Promise<Response> {
    pending++;
    let started: number | undefined;
    try {
      started = time();
    } catch (cause) {
      remember(cause);
    }
    const record = (status: number | null, transport: typeof Event.infer.transport) => {
      try {
        if (started === undefined) throw new Error('Unobserved fixture request start');
        const event = Event.assert({
          started,
          finished: time(),
          ...classifyRequest(arguments_),
          status,
          transport,
        });
        if (event.finished < event.started) throw new Error('Fixture boot clock moved backwards');
        // Proof (fixture observer only): removing the tail eviction overflows the strict receipt and fails the bounded-tail test.
        if (events.length === 64) {
          truncated = true;
          events.shift();
        }
        events.push(event);
      } catch (cause) {
        remember(cause);
      }
    };
    try {
      const response: Response = await Reflect.apply(original, this, arguments_);
      record(response.status, 'none');
      return response;
    } catch (cause) {
      const transport =
        cause instanceof Error
          ? 'code' in cause && cause.code === 'ECONNREFUSED'
            ? 'refused'
            : 'code' in cause && cause.code === 'ECONNRESET'
              ? 'reset'
              : cause.name === 'TimeoutError'
                ? 'timeout'
                : cause.name === 'AbortError'
                  ? 'aborted'
                  : 'other'
          : 'other';
      record(null, transport);
      throw cause;
    } finally {
      pending--;
    }
  } as typeof fetch;
  const preconnect = Object.getOwnPropertyDescriptor(original, 'preconnect');
  if (preconnect !== undefined) Object.defineProperty(observed, 'preconnect', preconnect);
  globalThis.fetch = observed;
  return {
    finish(): typeof RegistryHttpObservation.infer {
      if (!active) throw new Error('HTTP fixture observation already ended');
      active = false;
      const owned = globalThis.fetch === observed;
      globalThis.fetch = original;
      if (!owned || globalThis.fetch !== original)
        throw new Error('HTTP fixture observation lost callable ownership');
      // Proof (fixture observer only): removing failure propagation makes the failed-clock finalization test resolve.
      if (observationFailure !== undefined)
        throw new Error('HTTP fixture observation failed', { cause: observationFailure.cause });
      return RegistryHttpObservation.assert({
        events: structuredClone(events).sort((left, right) => left.started - right.started),
        truncated,
        pending: pending > 1024 ? 'overbound' : pending,
      });
    },
  };
}

/** Strict fixture stderr receiver; arbitrary output never becomes a diagnostic object and is never reflected. */
export function readRegistryHttpObservationOutput(stderr: string): {
  state: 'valid' | 'invalid' | 'absent';
  observation: typeof RegistryHttpObservation.infer | null;
} {
  // Proof (fixture receiver only): bound, duplicate and strict-field removals each admit their malformed diagnostic negative.
  if (Buffer.byteLength(stderr) > 32768) return { state: 'invalid', observation: null };
  const lines = stderr.split('\n').filter((line) => line.startsWith('task8-population-http:'));
  if (lines.length === 0) return { state: 'absent', observation: null };
  if (lines.length !== 1) return { state: 'invalid', observation: null };
  const line = lines.at(0);
  if (line === undefined) throw new Error('Missing counted HTTP receipt');
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice('task8-population-http:'.length));
  } catch (cause) {
    if (cause instanceof SyntaxError) return { state: 'invalid', observation: null };
    throw cause;
  }
  const checked = RegistryHttpObservation(parsed);
  if (checked instanceof type.errors) return { state: 'invalid', observation: null };
  return { state: 'valid', observation: checked };
}
