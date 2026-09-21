import type { FailureReporting } from '@shared/failures';
import type { LogFields, Logger, LogMethod } from '@wbs/contracts';
import { createLogger, type CreateLoggerOptions, LogRecord } from '@wbs/observability';
import { parseOrThrow } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { buildApp } from './app';

const INTERNAL_SECRET = 'internal-secret-for-gateway-reporting';
const CURRENT_KEY = 'current-jwt-key-for-gateway-reporting';
const PREVIOUS_KEY = 'previous-jwt-key-for-gateway-reporting';
const OWNED_SECRETS = [INTERNAL_SECRET, CURRENT_KEY, PREVIOUS_KEY] as const;
const VERSION = 'report-test-version';

function forward(log: LogMethod): LogMethod {
  function forwarded(message: string): void;
  function forwarded(fields: LogFields, message: string): void;
  function forwarded(fieldsOrMessage: LogFields | string, message?: string): void {
    if (typeof fieldsOrMessage === 'string') {
      log(fieldsOrMessage);
      return;
    }
    if (message === undefined) throw new Error('structured log message is required');
    log(fieldsOrMessage, message);
  }
  return forwarded;
}

function loggerHarness() {
  const options: CreateLoggerOptions[] = [];
  const lines: string[] = [];
  const errors: { fields: LogFields; message: string }[] = [];
  const makeLogger = (creation: CreateLoggerOptions): Logger => {
    options.push(creation);
    const sink = createLogger({
      ...creation,
      destination: { write: (chunk: string) => void lines.push(chunk) },
    });
    function recordError(message: string): void;
    function recordError(fields: LogFields, message: string): void;
    function recordError(fieldsOrMessage: LogFields | string, message?: string): void {
      if (typeof fieldsOrMessage === 'string') {
        sink.error(fieldsOrMessage);
        return;
      }
      if (message === undefined) throw new Error('structured log message is required');
      errors.push({ fields: fieldsOrMessage, message });
      sink.error(fieldsOrMessage, message);
    }
    return {
      info: forward(sink.info),
      warn: forward(sink.warn),
      error: recordError,
      child: (fields) => sink.child(fields),
    };
  };
  return { options, lines, errors, makeLogger };
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await Bun.sleep(1);
  }
}

async function openSocket(port: number): Promise<{ socket: WebSocket; rawFrames: string[] }> {
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
  const rawFrames: string[] = [];
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    rawFrames.push(event.data);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener(
      'open',
      () => {
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        reject(new Error('gateway socket did not open'));
      },
      { once: true },
    );
  });
  await waitUntil(
    () =>
      rawFrames.some((frame) => {
        const parsed: unknown = JSON.parse(frame);
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          'type' in parsed &&
          parsed.type === 'presence'
        );
      }),
    'initial presence',
  );
  rawFrames.length = 0;
  return { socket, rawFrames };
}

const failures = [
  {
    operation: 'forward' as const,
    route: '/internal/forward',
    request: '{"subscription":"presence","message":{"write":true}}',
    expectedRaw: ['{"type":"error","code":"backend_unavailable","retry_after":5}'],
  },
  {
    operation: 'resume' as const,
    route: '/internal/resume',
    request:
      '{"type":"resume","resume_points":{"presence":3,"project:00000000-0000-4000-8000-000000000001":8}}',
    expectedRaw: [
      '{"type":"resume_denied","subscription":"presence","reason":"unavailable"}',
      '{"type":"resume_denied","subscription":"project:00000000-0000-4000-8000-000000000001","reason":"unavailable"}',
      '{"type":"resume_ack","replayed":{}}',
    ],
  },
] as const;

describe('unexpected backend failure reporting through the production gateway', () => {
  for (const failure of failures) {
    it(`reports one ${failure.operation} failure without changing its wire frames`, async () => {
      const harness = loggerHarness();
      const rawSentence = `backend ${failure.operation} exposed ${OWNED_SECRETS.join(' ')}`;
      const caught = new Error(rawSentence, {
        cause: {
          internalAuthSecret: INTERNAL_SECRET,
          currentJwtKey: CURRENT_KEY,
          previousJwtKey: PREVIOUS_KEY,
        },
      });
      let connectionId: string | null = null;
      const app = buildApp(
        {
          beUrl: 'http://be.invalid',
          internalAuthSecret: INTERNAL_SECRET,
          jwtKey: CURRENT_KEY,
          previousJwtKey: PREVIOUS_KEY,
          version: VERSION,
          localIdentity: 'report-test',
          fetchImpl: (url, init) => {
            expect(url).toEndWith(failure.route);
            connectionId = new Headers(init?.headers).get('x-connection-id');
            return Promise.reject(caught);
          },
        },
        harness.makeLogger,
      );
      app.listen(0);
      const port = app.server?.port ?? 0;
      let socket: WebSocket | undefined;
      try {
        const opened = await openSocket(port);
        socket = opened.socket;
        socket.send(failure.request);
        // Proof: replacing the composed reporter passed to the controller with a no-op timed out
        // here for both operations after their unchanged frames arrived (2026-09-21).
        await waitUntil(
          () => opened.rawFrames.length >= failure.expectedRaw.length && harness.lines.length === 1,
          `${failure.operation} frames and report`,
        );

        const operationFrames = opened.rawFrames.slice(0, failure.expectedRaw.length);
        // Proof: appending `String(caught)` changed the forward bytes and disclosed all three
        // secrets; reordering wsResumeAck's properties changed only the raw resume-ack bytes.
        // Both mutations failed this equality (2026-09-21).
        expect(operationFrames).toEqual([...failure.expectedRaw]);
        const parsedFrames = operationFrames.map((frame) => JSON.parse(frame) as unknown);
        expect(
          parsedFrames.some(
            (frame) =>
              typeof frame === 'object' && frame !== null && ('seq' in frame || 'message' in frame),
          ),
        ).toBe(false);

        // Proof: omitting the internal secret only from logger options, or omitting the current or
        // previous JWT key from composition, removed that exact entry here (2026-09-21).
        expect(harness.options).toEqual([
          { service: 'gw-01', version: VERSION, secrets: [...OWNED_SECRETS] },
        ]);
        expect(harness.errors).toHaveLength(1);
        expect(harness.errors[0]?.message).toBe('gateway backend request failed');
        expect(harness.lines).toHaveLength(1);
        const emitted = parseOrThrow(
          LogRecord,
          JSON.parse(harness.lines[0]) as Record<string, unknown>,
        );
        expect(connectionId).toBeTypeOf('string');
        expect(connectionId).not.toBe('');
        expect(emitted).toMatchObject({
          connection_id: connectionId,
          user_id: 'report-test',
          backend_operation: failure.operation,
        });
        const reporting = harness.errors[0]?.fields['err'] as FailureReporting;
        // Proof: logging the raw caught value instead of the registered reporting outcome made
        // `reported` undefined here on both real operations (2026-09-21).
        expect(reporting.reported).toBe(true);
        if (!reporting.reported) return;
        expect(reporting.reports.diagnostic.occurrence_id).not.toBe('');
        expect(reporting.reports.public.occurrence_id).toBe(
          reporting.reports.diagnostic.occurrence_id,
        );
        expect(emitted.err).toMatchObject({
          occurrence_id: reporting.reports.diagnostic.occurrence_id,
        });

        for (const raw of [harness.lines[0], ...operationFrames]) {
          expect(raw).not.toContain(rawSentence);
          // Proof: omitting the internal secret only from the reporter policy printed it in the
          // diagnostic stack for both real operations (2026-09-21).
          for (const secret of OWNED_SECRETS) expect(raw).not.toContain(secret);
        }

        socket.send('{"type":"ping"}');
        await waitUntil(
          () => opened.rawFrames.includes('{"type":"pong"}'),
          'pong after backend failure',
        );
        expect(opened.rawFrames.at(-1)).toBe('{"type":"pong"}');
        expect(socket.readyState).toBe(WebSocket.OPEN);
      } finally {
        socket?.close();
        await app.stop();
      }
    });
  }

  it('keeps modeled and successful production paths silent', async () => {
    const harness = loggerHarness();
    const fetched: string[] = [];
    const app = buildApp(
      {
        beUrl: 'http://be.invalid',
        internalAuthSecret: INTERNAL_SECRET,
        jwtKey: CURRENT_KEY,
        previousJwtKey: PREVIOUS_KEY,
        version: VERSION,
        localIdentity: 'report-test',
        fetchImpl: (url) => {
          fetched.push(url);
          const body = url.endsWith('/internal/forward') ? { ack: true } : {};
          return Promise.resolve(Response.json(body));
        },
      },
      harness.makeLogger,
    );
    app.listen(0);
    const port = app.server?.port ?? 0;
    let socket: WebSocket | undefined;
    try {
      const opened = await openSocket(port);
      socket = opened.socket;

      socket.send('not json');
      await waitUntil(() => opened.rawFrames.length === 1, 'invalid payload frame');
      expect(opened.rawFrames[0]).toBe('{"type":"error","code":"invalid_payload"}');

      socket.send('{"type":"subscribe","subscription":"internal:push"}');
      await waitUntil(() => opened.rawFrames.length === 2, 'unknown subscription frame');
      expect(opened.rawFrames[1]).toBe(
        '{"type":"error","code":"unknown_subscription","subscription":"internal:push"}',
      );

      socket.send('{"subscription":"presence","message":{"write":true}}');
      await waitUntil(
        () => fetched.some((url) => url.endsWith('/internal/forward')),
        'successful forward',
      );
      socket.send('{"type":"resume","resume_points":{}}');
      await waitUntil(
        () => opened.rawFrames.includes('{"type":"resume_ack","replayed":{}}'),
        'successful empty resume',
      );

      expect(opened.rawFrames).toEqual([
        '{"type":"error","code":"invalid_payload"}',
        '{"type":"error","code":"unknown_subscription","subscription":"internal:push"}',
        '{"type":"resume_ack","replayed":{}}',
      ]);
      expect(fetched).toEqual([
        'http://be.invalid/internal/forward',
        'http://be.invalid/internal/resume',
      ]);
      expect(harness.errors).toEqual([]);
      expect(harness.lines).toEqual([]);
    } finally {
      socket?.close();
      await app.stop();
    }
  });
});
