import { expect, test } from 'bun:test';

import { reasoningEfforts } from './conversation/stream';
import { describeAlertWebhook } from './guardrail-alerts';
import {
  readRetentionErasure,
  readRetentionJournalSetting,
  readWebsiteApiConfig,
} from './runtime-config';

test('the reasoning effort is unset or one of the four allowed efforts', () => {
  expect(readWebsiteApiConfig({}).openRouterReasoningEffort).toBeUndefined();
  expect(
    readWebsiteApiConfig({ OPENROUTER_REASONING_EFFORT: '' }).openRouterReasoningEffort,
  ).toBeUndefined();
  expect(reasoningEfforts).toEqual(['none', 'minimal', 'low', 'medium']);
  for (const effort of reasoningEfforts)
    expect(
      readWebsiteApiConfig({ OPENROUTER_REASONING_EFFORT: effort }).openRouterReasoningEffort,
    ).toBe(effort);
  // Proof: accepting any string in readReasoningEffort let 'high' through and failed this.
  for (const effort of ['high', 'xhigh', 'LOW', ' low'])
    expect(() => readWebsiteApiConfig({ OPENROUTER_REASONING_EFFORT: effort })).toThrow(
      'OPENROUTER_REASONING_EFFORT',
    );
});

test('the conversation completion cap defaults to 400 and accepts integers from 100 to 2000', () => {
  expect(readWebsiteApiConfig({}).openRouterMaxCompletionTokens).toBe(400);
  expect(
    readWebsiteApiConfig({ OPENROUTER_MAX_COMPLETION_TOKENS: '' }).openRouterMaxCompletionTokens,
  ).toBe(400);
  for (const tokens of ['100', '700', '2000'])
    expect(
      readWebsiteApiConfig({ OPENROUTER_MAX_COMPLETION_TOKENS: tokens })
        .openRouterMaxCompletionTokens,
    ).toBe(Number(tokens));
  // Proof: dropping the range check in readMaxCompletionTokens let '99' and '2001' through.
  for (const tokens of ['99', '2001', '0', '7e2', '700.5', '-700', 'many'])
    expect(() => readWebsiteApiConfig({ OPENROUTER_MAX_COMPLETION_TOKENS: tokens })).toThrow(
      'OPENROUTER_MAX_COMPLETION_TOKENS',
    );
});

test('the alert webhook is unset, or an https URL; anything else throws', () => {
  expect(readWebsiteApiConfig({}).guardrailWebhookUrl).toBeUndefined();
  expect(readWebsiteApiConfig({ GUARDRAIL_WEBHOOK_URL: '' }).guardrailWebhookUrl).toBeUndefined();
  expect(
    readWebsiteApiConfig({ GUARDRAIL_WEBHOOK_URL: 'https://ntfy.sh/puni-topic-0123456789abcdef' })
      .guardrailWebhookUrl,
  ).toBe('https://ntfy.sh/puni-topic-0123456789abcdef');
  // Proof: accepting http in readWebhookUrl let the first of these pass without throwing.
  for (const url of ['http://ntfy.sh/topic', 'ntfy.sh/topic', 'ftp://example.test/x'])
    expect(() => readWebsiteApiConfig({ GUARDRAIL_WEBHOOK_URL: url })).toThrow(
      'GUARDRAIL_WEBHOOK_URL',
    );
  expect(describeAlertWebhook(undefined)).toBe('guardrail alerts: webhook unset');
  expect(describeAlertWebhook('https://ntfy.sh/secret-topic')).toBe(
    'guardrail alerts: webhook set',
  );
});

const journalEnvironment = {
  RETENTION_JOURNAL: 's3',
  RETENTION_JOURNAL_ID: '7d4f2a8e-5b1c-4e3d-9a6f-0c2b8e1d4a7f',
  RETENTION_WRITER_RELEASE: 'website-2026-10-11',
  RETENTION_WRITER_REVISION: 'abc1234',
  S3_ENDPOINT: 'https://objects.example.test',
  S3_REGION: 'hel1',
  S3_ACCESS_KEY_ID: 'dummy-access-key',
  S3_SECRET_ACCESS_KEY: 'dummy-secret-key',
  RETENTION_JOURNAL_BUCKET: 'journal-bucket',
  RETENTION_JOURNAL_PREFIX: 'retention-journal/website-test/',
};

test('a missing RETENTION_JOURNAL refuses startup', () => {
  for (const value of [undefined, '', 'S3', 'none'])
    expect(() => readRetentionJournalSetting({ RETENTION_JOURNAL: value })).toThrow(
      'RETENTION_JOURNAL must be disabled or s3',
    );
  expect(readRetentionJournalSetting({ RETENTION_JOURNAL: 'disabled' })).toEqual({
    mode: 'disabled',
  });
  expect(readRetentionJournalSetting(journalEnvironment)).toMatchObject({
    mode: 's3',
    journalId: journalEnvironment.RETENTION_JOURNAL_ID,
    release: 'website-2026-10-11',
    s3: { bucket: 'journal-bucket', prefix: 'retention-journal/website-test/' },
  });
  for (const name of ['RETENTION_JOURNAL_ID', 'RETENTION_WRITER_RELEASE', 'S3_SECRET_ACCESS_KEY'])
    expect(() => readRetentionJournalSetting({ ...journalEnvironment, [name]: undefined })).toThrow(
      name,
    );
  expect(() =>
    readRetentionJournalSetting({ ...journalEnvironment, RETENTION_JOURNAL_ID: 'not-a-uuid' }),
  ).toThrow('RETENTION_JOURNAL_ID');
});

test('erase without s3 is refused', () => {
  const disabled = readRetentionJournalSetting({ RETENTION_JOURNAL: 'disabled' });
  const s3 = readRetentionJournalSetting(journalEnvironment);
  expect(readRetentionErasure({ RETENTION_ERASURE: 'report' }, disabled)).toBe('report');
  expect(readRetentionErasure({ RETENTION_ERASURE: 'erase' }, s3)).toBe('erase');
  expect(() => readRetentionErasure({ RETENTION_ERASURE: 'erase' }, disabled)).toThrow(
    'RETENTION_ERASURE=erase requires RETENTION_JOURNAL=s3',
  );
  for (const value of [undefined, '', 'ERASE'])
    expect(() => readRetentionErasure({ RETENTION_ERASURE: value }, s3)).toThrow(
      'RETENTION_ERASURE must be report or erase',
    );
});
