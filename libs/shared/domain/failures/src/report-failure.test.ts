import { defineException, toReports } from 'application-exception';
import { expect, test } from 'bun:test';

import {
  createFailureRedaction,
  FAILURE_REPORT_LIMITS,
  reportFailure,
  SENSITIVE_KEYS,
} from './report-failure';

test('bounds the whole report and refuses to run the caught value', () => {
  expect(FAILURE_REPORT_LIMITS).toEqual({
    maxReportSize: 32_768,
    maxDepth: 4,
    maxChildren: 16,
    inspection: 'no-invoke',
  });
});

test('names every property both reports skip', () => {
  expect([...SENSITIVE_KEYS]).toEqual([
    'authorization',
    'cookie',
    'set-cookie',
    'password',
    'token',
    'access_token',
    'refresh_token',
    'secret',
    'jwtKey',
    'internalAuthSecret',
  ]);
});

test('skips a sensitive property whatever its capitalisation', () => {
  const failure = new Error('header rejected');
  Object.assign(failure, { Authorization: 'Bearer live-token', password: 'p' });
  const redact = createFailureRedaction([]);
  const { diagnostic } = toReports(failure, {
    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
    public: { redact, corj: FAILURE_REPORT_LIMITS },
  });

  expect(diagnostic.as_json).toEqual({ Authorization: '[redacted]', password: '[redacted]' });
});

test('scrubs a caller-owned secret from message and stack, not only from its property', () => {
  const redact = createFailureRedaction(['hunter2']);
  const { diagnostic } = toReports(new Error('token was hunter2'), {
    diagnostic: { redact, context: { note: 'hunter2' }, corj: FAILURE_REPORT_LIMITS },
    public: { redact, corj: FAILURE_REPORT_LIMITS },
  });

  expect(diagnostic.stack?.[0]).toBe('Error: token was [redacted]');
  expect(JSON.stringify(diagnostic.context)).not.toContain('hunter2');
});

test('treats a secret as literal text, not as a pattern', () => {
  const secret = 'a.b*c+(d)[e]';
  const redact = createFailureRedaction([secret]);
  const { diagnostic } = toReports(new Error(`leaked ${secret} here`), {
    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
    public: { redact, corj: FAILURE_REPORT_LIMITS },
  });

  expect(diagnostic.stack?.[0]).toBe('Error: leaked [redacted] here');
});

test('an empty secret list leaves the key rules in force', () => {
  const failure = new Error('x');
  Object.assign(failure, { cookie: 'a=b' });
  const redact = createFailureRedaction([]);
  const { diagnostic } = toReports(failure, {
    diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
    public: { redact, corj: FAILURE_REPORT_LIMITS },
  });

  expect(diagnostic.as_json).toEqual({ cookie: '[redacted]' });
});

const SignInFailed = defineException({
  tag: 'probe/SignInFailed',
  message: ({ user }: { user: string }) => `sign-in failed for ${user}`,
  public: {
    code: 'SIGN_IN_FAILED',
    message: 'Sign-in failed.',
    details: ({ user }) => ({ user }),
  },
});

test('correlates a primitive failure without publishing its contents', () => {
  const redact = createFailureRedaction(['private-marker']);
  const reporting = reportFailure('private-marker leaked', { redact });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  const { diagnostic, public: disclosed } = reporting.reports;
  expect(disclosed.occurrence_id).toBe(diagnostic.occurrence_id);
  expect(disclosed.code).toBe('INTERNAL_ERROR');
  expect(JSON.stringify(reporting.reports)).not.toContain('private-marker');
});

test('a cause that cannot be inspected is reported as reporting loss, not as a throw', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const reporting = reportFailure(new Error('boom', { cause: proxy }), {
    redact: createFailureRedaction([]),
  });

  expect(reporting.reported).toBe(false);
});

test('two losses in one process do not share a handle', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  const redact = createFailureRedaction([]);
  const first = reportFailure(new Error('a', { cause: proxy }), { redact });
  const second = reportFailure(new Error('b', { cause: proxy }), { redact });

  expect(first.reported).toBe(false);
  expect(second.reported).toBe(false);
  if (first.reported || second.reported) return;
  expect(first.occurrenceId).not.toBe(second.occurrenceId);
  expect(first.reason).toBe(second.reason);
});

test('redacts a secret the disclosure policy selected into the public report', () => {
  const reporting = reportFailure(new SignInFailed({ details: { user: 'alice@example.com' } }), {
    redact: createFailureRedaction(['alice@example.com']),
  });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.public.code).toBe('SIGN_IN_FAILED');
  expect(reporting.reports.public.as_json).toEqual({ user: '[redacted]' });
});
