import { expect, test } from 'bun:test';

import { FAILURE_REPORT_LIMITS, SENSITIVE_KEYS } from './report-failure';

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
