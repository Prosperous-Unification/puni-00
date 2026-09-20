import { toReports } from 'application-exception';
import { expect, test } from 'bun:test';

import { createFailureRedaction, FAILURE_REPORT_LIMITS, SENSITIVE_KEYS } from './report-failure';

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
