import type { FailureReporting } from '@shared/failures';
import type { LogFields, Logger, LogMethod } from '@wbs/contracts';
import { createLogger, LogRecord } from '@wbs/observability';
import { parseOrThrow } from '@wbs/validation';
import { expect, test } from 'bun:test';

import { createUnexpectedToolFailureReporter } from './unexpected-tool-failure';

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

function captureErrors(sink: Logger): {
  readonly logger: Logger;
  readonly calls: { fields: LogFields; message: string }[];
} {
  const calls: { fields: LogFields; message: string }[] = [];
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
  return {
    calls,
    logger: {
      info: forward(sink.info),
      warn: forward(sink.warn),
      error: recordError,
      child: (fields) => sink.child(fields),
    },
  };
}

test('returns one public disclosure and logs its registered diagnostic occurrence', () => {
  const secret = 'boundary-secret';
  const lines: string[] = [];
  const sink = createLogger({
    service: 'mcp-01',
    secrets: [secret],
    destination: { write: (chunk: string) => void lines.push(chunk) },
  });
  const captured = captureErrors(sink);
  const report = createUnexpectedToolFailureReporter(captured.logger, [secret]);

  const disclosure = report(new Error(`fetch exposed ${secret}`));

  expect(captured.calls).toHaveLength(1);
  expect(captured.calls[0]?.message).toBe('unexpected MCP tool failure');
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain(secret);
  expect(JSON.stringify(disclosure)).not.toContain(secret);
  const reporting = captured.calls[0]?.fields['err'] as FailureReporting;
  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.public.occurrence_id).toBe(reporting.reports.diagnostic.occurrence_id);
  expect(disclosure).toEqual({
    sentence: 'Something went wrong',
    occurrenceId: reporting.reports.public.occurrence_id,
  });
  const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
  expect(emitted.err).toMatchObject({
    v: 'corj/v0.14',
    occurrence_id: reporting.reports.diagnostic.occurrence_id,
    fingerprint: reporting.reports.diagnostic.fingerprint,
  });
});

test('returns one fixed correlated disclosure and log record when reporting is lost', () => {
  const lines: string[] = [];
  const sink = createLogger({
    service: 'mcp-01',
    destination: { write: (chunk: string) => void lines.push(chunk) },
  });
  const captured = captureErrors(sink);
  const report = createUnexpectedToolFailureReporter(captured.logger, []);
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();

  let disclosure: ReturnType<typeof report> | undefined;
  expect(() => {
    disclosure = report(new Error('raw failure', { cause: revocable.proxy }));
  }).not.toThrow();

  expect(captured.calls).toHaveLength(1);
  expect(lines).toHaveLength(1);
  const reporting = captured.calls[0]?.fields['err'] as FailureReporting;
  expect(reporting.reported).toBe(false);
  if (reporting.reported) return;
  expect(reporting.occurrenceId).toMatch(/^UNREPORTED_/);
  expect(disclosure).toEqual({
    sentence: 'the failure could not be described',
    occurrenceId: reporting.occurrenceId,
  });
  const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
  expect(emitted.err).toEqual({
    occurrence_id: reporting.occurrenceId,
    reported: false,
    reason: reporting.reason,
  });
});
