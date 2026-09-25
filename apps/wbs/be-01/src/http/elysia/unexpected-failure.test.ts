import type { FailureReporting } from '@shared/failures';
import type { LogFields, Logger, LogMethod } from '@wbs/contracts';
import { createLogger, LogRecord } from '@wbs/observability';
import { parseOrThrow } from '@wbs/validation';
import { expect, test } from 'bun:test';

import { createUnexpectedFailureReporter } from './unexpected-failure';

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

test('logs one registered, redacted report under its original occurrence', () => {
  const secret = 'boundary-secret';
  const lines: string[] = [];
  const calls: { fields: LogFields; message: string }[] = [];
  const sink = createLogger({
    service: 'be-01',
    secrets: [secret],
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
    calls.push({ fields: fieldsOrMessage, message });
    sink.error(fieldsOrMessage, message);
  }
  const logger: Logger = {
    info: forward(sink.info),
    warn: forward(sink.warn),
    error: recordError,
    child: (fields) => sink.child(fields),
  };
  const report = createUnexpectedFailureReporter(logger, [secret]);

  report(new Error(`store failed with ${secret}`));

  expect(calls).toHaveLength(1);
  expect(calls[0]?.message).toBe('unexpected endpoint failure');
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain(secret);
  const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
  const captured = calls[0]?.fields['err'] as FailureReporting;
  expect(captured.reported).toBe(true);
  if (!captured.reported) return;
  expect(captured.reports.public.code).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(captured.reports.public)).not.toContain(secret);
  expect(emitted.err).toMatchObject({
    v: 'corj/v0.15',
    occurrence_id: captured.reports.diagnostic.occurrence_id,
    fingerprint: captured.reports.diagnostic.fingerprint,
  });
  expect(captured.reports.public.occurrence_id).toBe(captured.reports.diagnostic.occurrence_id);
});

test('logs one visible loss when reporting cannot inspect the failure', () => {
  const lines: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: { write: (chunk: string) => void lines.push(chunk) },
  });
  const report = createUnexpectedFailureReporter(logger, []);
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();

  expect(() => {
    report(new Error('boom', { cause: revocable.proxy }));
  }).not.toThrow();

  expect(lines).toHaveLength(1);
  const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
  const loss = emitted.err as { occurrence_id: string; reason: string; reported: false };
  expect(loss.reported).toBe(false);
  expect(loss.occurrence_id).toMatch(/^UNREPORTED_/);
  expect(loss.reason).toBeTypeOf('string');
});
