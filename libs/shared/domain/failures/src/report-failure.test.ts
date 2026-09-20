import Ajv2020 from 'ajv/dist/2020';
import { createRedactionPolicy, defineException, toReports } from 'application-exception';
import diagnosticSchema from 'application-exception/schemas/diagnostic-report-v5.json';
import publicSchema from 'application-exception/schemas/public-report-v4.json';
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

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validateDiagnostic = ajv.compile(diagnosticSchema);
const validatePublic = ajv.compile(publicSchema);

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

test('reports a cause chain by path and redacts a key nested inside it', () => {
  const redact = createFailureRedaction([]);
  const inner = { authorization: 'Bearer zzz' };
  const reporting = reportFailure(
    new Error('outer', { cause: new Error('mid', { cause: inner }) }),
    { redact },
  );

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  const paths = (reporting.reports.diagnostic.children ?? []).map((child) => child.path);
  expect(paths).toEqual(['$.cause', '$.cause.cause']);
  expect(JSON.stringify(reporting.reports)).not.toContain('Bearer zzz');
});

test('keeps the order of an aggregate failure and reports a circular value', () => {
  const circular: Record<string, unknown> = { name: 'loop' };
  circular['self'] = circular;
  const failure = new AggregateError([new Error('first'), new Error('second')], 'both failed', {
    cause: circular,
  });
  const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  const children = reporting.reports.diagnostic.children ?? [];
  expect(children.map((child) => child.path)).toEqual(['$.cause', '$.errors[0]', '$.errors[1]']);
  expect(JSON.stringify(children[0].as_json)).toContain('[circular]');
});

test('stops the cause walk at the depth limit and says so on the deepest child', () => {
  let failure = new Error('level5');
  for (const level of [4, 3, 2, 1, 0]) {
    failure = new Error(`level${String(level)}`, { cause: failure });
  }
  const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  const children = reporting.reports.diagnostic.children ?? [];
  expect(children.at(-1)?.children_omitted).toBe('max_depth');
  expect(children.at(-1)?.path).toBe('$.cause.cause.cause.cause');
  expect(children).toHaveLength(4);
});

test('stops at the child limit and says so on the root', () => {
  const failure = new AggregateError(
    Array.from({ length: 20 }, (_, index) => new Error(`e${String(index)}`)),
    'many',
  );
  const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.diagnostic.children_omitted).toBe('max_children');
  expect(reporting.reports.diagnostic.children).toHaveLength(16);
});

test('reports a thrown undefined, null and BigInt rather than losing them', () => {
  const redact = createFailureRedaction([]);
  const shapes = [undefined, null, 10n].map((value) => {
    const reporting = reportFailure(value, { redact });
    return reporting.reported ? reporting.reports.diagnostic : undefined;
  });

  // A compact report omits a field holding its expected value, so `null` carries no `typeof`.
  expect(shapes.map((report) => report?.as_string)).toEqual(['undefined', 'null', '10']);
  expect(shapes[0]?.typeof).toBe('undefined');
  expect(shapes[1]?.typeof).toBeUndefined();
  expect(shapes[2]?.typeof).toBe('bigint');
});

test('does not run a throwing getter while reporting', () => {
  const failure = new Error('getter');
  Object.defineProperty(failure, 'boom', {
    enumerable: true,
    get() {
      throw new Error('ran');
    },
  });
  const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.diagnostic.reporting_errors).toBeUndefined();
  expect(reporting.reports.diagnostic.as_json).toEqual({ boom: '[not-inspected]' });
});

test('bounds a very long Unicode message and marks it truncated', () => {
  const reporting = reportFailure(new Error('🙂'.repeat(20_000)), {
    redact: createFailureRedaction([]),
  });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.diagnostic.truncated).toBe(true);
  const bytes = new TextEncoder().encode(JSON.stringify(reporting.reports.diagnostic)).length;
  expect(bytes).toBeLessThanOrEqual(32_768);
});

test('drops the context whole when the report is over budget', () => {
  const reporting = reportFailure(new Error('m'.repeat(30_000)), {
    redact: createFailureRedaction([]),
    context: { note: 'y'.repeat(8_000) },
  });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.diagnostic.context_omitted).toBe('max_size');
  expect(reporting.reports.diagnostic.context).toBeUndefined();
});

test('drops the reporting errors after the context when both cannot fit', () => {
  // A policy that throws is the only way to make reporting errors under `no-invoke`; it is a
  // test fixture, never a production policy.
  const throwing = createRedactionPolicy({
    transform: (value, context) => {
      if (context.key === 'as_json') throw new Error('nope');
      return value;
    },
  });
  const reporting = reportFailure(new Error('m'.repeat(33_000)), {
    redact: throwing,
    context: { note: 'z'.repeat(1_000) },
  });

  expect(reporting.reported).toBe(true);
  if (!reporting.reported) return;
  expect(reporting.reports.diagnostic.reporting_errors_omitted).toBe('max_size');
  expect(reporting.reports.diagnostic.reporting_errors).toBeUndefined();
});

test('both reports validate against the installed schemas after redaction and truncation', () => {
  const redact = createFailureRedaction(['alice@example.com']);
  const small = reportFailure(new Error('boom', { cause: { password: 'x' } }), {
    redact,
    context: { runId: 'run-1' },
  });
  // Oversized *disclosed details*, not an oversized context: only they truncate both reports.
  const truncated = reportFailure(
    new SignInFailed({ details: { user: `alice@example.com ${'u'.repeat(40_000)}` } }),
    { redact, context: { note: 'y'.repeat(8_000) } },
  );

  expect(small.reported).toBe(true);
  expect(truncated.reported).toBe(true);
  if (!small.reported || !truncated.reported) return;
  expect(truncated.reports.diagnostic.truncated).toBe(true);
  expect(truncated.reports.public.truncated).toBe(true);
  for (const reports of [small.reports, truncated.reports]) {
    expect(validateDiagnostic(reports.diagnostic)).toBe(true);
    expect(validatePublic(reports.public)).toBe(true);
  }
});
