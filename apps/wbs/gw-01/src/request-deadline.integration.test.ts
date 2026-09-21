import { createLogger, type CreateLoggerOptions, LogRecord } from '@wbs/observability';
import { systemTimers } from '@wbs/runtime-portable';
import { parseOrThrow } from '@wbs/validation';
import { expect, it } from 'bun:test';

import { buildApp } from './app';

const PROJECT_SUBSCRIPTION = 'project:00000000-0000-4000-8000-000000000001';

interface CapturedFrame {
  type?: string;
  code?: string;
  reason?: string;
  retry_after?: number;
  subscription?: string;
  replayed?: Record<string, number>;
}

function captureLogs(): { lines: string[]; makeLogger: typeof createLogger } {
  const lines: string[] = [];
  const makeLogger = (options: CreateLoggerOptions) =>
    createLogger({
      ...options,
      destination: { write: (chunk: string) => void lines.push(chunk) },
    });
  return { lines, makeLogger };
}

function expectFailureRecord(line: string, operation: 'forward' | 'resume'): void {
  const record = parseOrThrow(LogRecord, JSON.parse(line) as Record<string, unknown>);
  expect(record).toMatchObject({
    msg: 'gateway backend request failed',
    user_id: 'deadline-test',
    backend_operation: operation,
  });
  expect(record.connection_id).toBeTypeOf('string');
  expect(record.connection_id).not.toBe('');
  expect((record.err as { occurrence_id?: string }).occurrence_id).toBeTypeOf('string');
  expect((record.err as { occurrence_id?: string }).occurrence_id).not.toBe('');
}

async function until(ready: () => boolean, budgetMs = 2000): Promise<void> {
  const expires = Date.now() + budgetMs;
  while (!ready()) {
    if (Date.now() >= expires)
      throw new Error('expected transport or socket transition did not arrive');
    await Bun.sleep(5);
  }
}

for (const kind of ['forward', 'resume'] as const) {
  for (const stage of ['headers', 'body'] as const) {
    for (const closes of [false, true]) {
      it(`${kind} ${stage}: ${closes ? 'close cancels without late frames or failure metrics' : 'deadline cancels real transport and socket still pings'}`, async () => {
        const logs = captureLogs();
        let calls = 0;
        let cancelled = false;
        const backend = Bun.serve({
          hostname: '127.0.0.1',
          port: 0,
          fetch(request) {
            calls++;
            request.signal.addEventListener(
              'abort',
              () => {
                cancelled = true;
              },
              { once: true },
            );
            if (stage === 'headers') return new Promise<Response>(() => undefined);
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('{'));
                },
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { 'content-type': 'application/json' } },
            );
          },
        });
        const app = buildApp(
          {
            beUrl: `http://127.0.0.1:${String(backend.port)}`,
            internalAuthSecret: 's'.repeat(32),
            jwtKey: 'k'.repeat(32),
            localIdentity: 'deadline-test',
            requests: { timers: systemTimers, attemptMs: closes ? 1000 : 100, overallMs: 2000 },
          },
          logs.makeLogger,
        );
        app.listen(0);
        const port = app.server?.port;
        if (port === undefined) throw new Error('gateway did not start');
        const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
        const frames: CapturedFrame[] = [];
        socket.addEventListener('message', (event: MessageEvent<string>) => {
          frames.push(JSON.parse(event.data) as CapturedFrame);
        });
        try {
          await until(() => frames.some((frame) => frame.type === 'presence'));
          socket.send(
            JSON.stringify(
              kind === 'forward'
                ? { subscription: 'presence', message: { write: true } }
                : {
                    type: 'resume',
                    resume_points: { presence: 0, [PROJECT_SUBSCRIPTION]: 8 },
                  },
            ),
          );
          await until(() => calls === 1);
          if (closes) {
            socket.close();
            await until(() => app.decorator.metrics.counters.activeConnections === 0);
            await until(() => cancelled, 250);
            expect(app.decorator.metrics.counters.backendUnavailableTotal).toBe(0);
            expect(app.decorator.metrics.counters.droppedFramesTotal).toBe(0);
            await Bun.sleep(150);
            expect(frames.map((frame) => frame.type)).toEqual(['presence']);
            expect(app.decorator.metrics.counters.backendUnavailableTotal).toBe(0);
            expect(app.decorator.metrics.counters.droppedFramesTotal).toBe(0);
            // Proof: reporting before the abort guard emitted one record after each close.
            expect(logs.lines).toEqual([]);
          } else {
            await until(() => frames.length > 1);
            await until(() => cancelled);
            expect(frames.slice(1)).toEqual(
              kind === 'forward'
                ? [{ type: 'error', code: 'backend_unavailable', retry_after: 5 }]
                : [
                    { type: 'resume_denied', subscription: 'presence', reason: 'unavailable' },
                    {
                      type: 'resume_denied',
                      subscription: PROJECT_SUBSCRIPTION,
                      reason: 'unavailable',
                    },
                    { type: 'resume_ack', replayed: {} },
                  ],
            );
            await until(() => logs.lines.length >= 1);
            // Proof: reporting inside the resume subscription loop emitted two records.
            expect(logs.lines).toHaveLength(1);
            expectFailureRecord(logs.lines[0], kind);
            socket.send('{"type":"ping"}');
            await until(() => frames.some((frame) => frame.type === 'pong'));
          }
          expect(calls).toBe(1);
          expect(cancelled).toBe(true);
        } finally {
          socket.close();
          await app.stop(true);
          await backend.stop(true);
        }
      });
    }
  }
}

it('maps success-shaped 503 resume replies to unavailable on the live socket', async () => {
  const logs = captureLogs();
  const app = buildApp(
    {
      beUrl: 'http://be.invalid',
      internalAuthSecret: 's'.repeat(32),
      jwtKey: 'k'.repeat(32),
      localIdentity: 'status-test',
      fetchImpl: () =>
        Promise.resolve(
          Response.json(
            {
              presence: {
                status: 'replaying',
                events: [{ seq: 1, message: { unexpected: true } }],
              },
            },
            { status: 503 },
          ),
        ),
    },
    logs.makeLogger,
  );
  app.listen(0);
  const port = app.server?.port;
  if (port === undefined) throw new Error('gateway did not start');
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
  const frames: unknown[] = [];
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    frames.push(JSON.parse(event.data));
  });
  try {
    await until(() => frames.length === 1);
    socket.send('{"type":"resume","resume_points":{"presence":0}}');
    await until(() => frames.length > 1);
    // Proof: routing the rejection through the forward frame changed these exact bytes.
    expect(frames.slice(1)).toEqual([
      { type: 'resume_denied', subscription: 'presence', reason: 'unavailable' },
      { type: 'resume_ack', replayed: {} },
    ]);
    await until(() => logs.lines.length === 1);
    expect(logs.lines).toHaveLength(1);
    const record = parseOrThrow(LogRecord, JSON.parse(logs.lines[0]) as Record<string, unknown>);
    expect(record).toMatchObject({
      msg: 'gateway backend request failed',
      user_id: 'status-test',
      backend_operation: 'resume',
    });
    expect((record.err as { occurrence_id?: string }).occurrence_id).toBeTypeOf('string');
  } finally {
    socket.close();
    await app.stop(true);
  }
});
