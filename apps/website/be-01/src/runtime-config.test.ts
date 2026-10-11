import { expect, test } from 'bun:test';

import { reasoningEfforts } from './conversation/stream';
import { describeAlertWebhook } from './guardrail-alerts';
import { readWebsiteApiConfig } from './runtime-config';

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

test('a retired OIDC setting stops startup', () => {
  for (const name of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']) {
    for (const value of ['https://accounts.google.com', ''])
      expect(() => readWebsiteApiConfig({ [name]: value })).toThrow(
        `prospect sign-in was retired on 2026-10-11 (ADR 0039); remove ${name}`,
      );
  }
  expect(() => readWebsiteApiConfig({ OIDC_AUDIENCE: 'x' })).toThrow('remove OIDC_AUDIENCE');
  expect(readWebsiteApiConfig({ AUTH_MODE: 'oidc' }).publicOrigin).toBe('http://localhost:4321');
});
