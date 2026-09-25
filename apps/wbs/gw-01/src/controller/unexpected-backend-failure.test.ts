import type { FailureReporting } from '@shared/failures';
import type { LogFields, Logger, LogMethod } from '@wbs/contracts';
import { createLogger, LogRecord } from '@wbs/observability';
import { parseOrThrow } from '@wbs/validation';
import { expect, test } from 'bun:test';

import { createUnexpectedBackendFailureReporter } from './unexpected-backend-failure';

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

test('logs one registered forward failure with owned secrets redacted', () => {
  const secrets = ['internal-auth-secret', 'current-jwt-key', 'previous-jwt-key'];
  const lines: string[] = [];
  const sink = createLogger({
    service: 'gw-01',
    secrets,
    destination: { write: (chunk: string) => void lines.push(chunk) },
  });
  const captured = captureErrors(sink);
  const report = createUnexpectedBackendFailureReporter(captured.logger, secrets);

  report({
    caught: new Error(`forward failed: ${secrets.join(' ')}`),
    operation: 'forward',
    connectionId: 'connection-17',
    clientId: 'user-23',
  });

  // Proof: invoking `logger.error` twice failed here with two captured calls (2026-09-21).
  expect(captured.calls).toHaveLength(1);
  expect(captured.calls[0]?.message).toBe('gateway backend request failed');
  expect(lines).toHaveLength(1);
  // Proof: building the reporter redaction with `[]` exposed `internal-auth-secret` here
  // (2026-09-21).
  for (const secret of secrets) expect(lines[0]).not.toContain(secret);
  const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
  expect(emitted).toMatchObject({
    msg: 'gateway backend request failed',
    connection_id: 'connection-17',
    user_id: 'user-23',
    backend_operation: 'forward',
  });
  const reporting = captured.calls[0]?.fields['err'] as FailureReporting;
  // Proof: logging `failure.caught` instead of the registered reporting outcome left
  // `reported` undefined here and broke occurrence provenance (2026-09-21).
  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.diagnostic.context).toEqual({ operation: 'forward' });
  expect(reporting.reports.public.occurrence_id).toBe(reporting.reports.diagnostic.occurrence_id);
  expect(emitted.err).toMatchObject({
    v: 'corj/v0.15',
    occurrence_id: reporting.reports.diagnostic.occurrence_id,
  });
});

test('logs one visible correlated loss when reporting cannot inspect the failure', () => {
  const lines: string[] = [];
  const sink = createLogger({
    service: 'gw-01',
    destination: { write: (chunk: string) => void lines.push(chunk) },
  });
  const captured = captureErrors(sink);
  const report = createUnexpectedBackendFailureReporter(captured.logger, []);
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();

  expect(() => {
    report({
      caught: new Error('raw caught text', { cause: revocable.proxy }),
      operation: 'resume',
      connectionId: 'connection-29',
      clientId: 'user-31',
    });
  }).not.toThrow();

  expect(captured.calls).toHaveLength(1);
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain('raw caught text');
  const emitted = parseOrThrow(LogRecord, JSON.parse(lines[0]) as Record<string, unknown>);
  expect(emitted).toMatchObject({
    msg: 'gateway backend request failed',
    connection_id: 'connection-29',
    user_id: 'user-31',
    backend_operation: 'resume',
  });
  const reporting = captured.calls[0]?.fields['err'] as FailureReporting;
  expect(reporting.reported).toBe(false);
  if (reporting.reported) return;
  expect(reporting.occurrenceId).toMatch(/^UNREPORTED_/);
  expect(reporting.reason).toBe(
    'reporting threw; the failure stands and both of its reports are lost',
  );
  expect(emitted.err).toEqual({
    occurrence_id: reporting.occurrenceId,
    reported: false,
    reason: reporting.reason,
  });
});
