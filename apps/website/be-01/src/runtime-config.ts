import { readS3JournalConfig, type S3JournalConfig } from '@website/store-sqlite';

import { defaultConversationReplyTokens } from './conversation/request';
import { isReasoningEffort, type ReasoningEffort } from './conversation/stream';
import { readWebhookUrl } from './guardrail-alerts';
import type { WebsiteApiConfig } from './server';

type Environment = Record<string, string | undefined>;

function readFlag(environment: Environment, name: string): boolean {
  const value = environment[name];
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error(`${name} must be 0 or 1`);
}

function readRate(environment: Environment, name: string): number | undefined {
  const value = environment[name];
  if (value === undefined || value === '') return undefined;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`${name} must be a positive number`);
  return rate;
}

function readHops(environment: Environment): number | undefined {
  const value = environment['TRUSTED_PROXY_HOPS'];
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error('TRUSTED_PROXY_HOPS must be a nonnegative integer');
  return Number(value);
}

/** An empty value is unset; any value outside the allowed efforts throws. */
function readReasoningEffort(environment: Environment): ReasoningEffort | undefined {
  const value = environment['OPENROUTER_REASONING_EFFORT'];
  if (value === undefined || value === '') return undefined;
  // Proof: disabling this refusal let 'high' through and failed the reasoning-effort config test.
  if (!isReasoningEffort(value))
    throw new Error('OPENROUTER_REASONING_EFFORT must be none, minimal, low or medium');
  return value;
}

/** An empty value means the default cap; anything but an integer from 100 to 2000 throws. */
function readMaxCompletionTokens(environment: Environment): number {
  const value = environment['OPENROUTER_MAX_COMPLETION_TOKENS'];
  if (value === undefined || value === '') return defaultConversationReplyTokens;
  const tokens = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  // Proof: dropping the range let '99' and '2001' through and failed the completion-cap config test.
  if (!(tokens >= 100 && tokens <= 2_000))
    throw new Error('OPENROUTER_MAX_COMPLETION_TOKENS must be an integer from 100 to 2000');
  return tokens;
}

/**
 * Reads the API configuration from the process environment. Malformed flags, rates, proxy
 * hops, reasoning efforts, completion caps and a non-`https` alert webhook throw instead of disabling a feature; absent provider settings leave the provider
 * disabled, which `GET /conversation` reports.
 */
export function readWebsiteApiConfig(environment: Environment): WebsiteApiConfig {
  const publicOrigin = environment['PUBLIC_ORIGIN'] ?? 'http://localhost:4321';
  const appOrigin = environment['APP_ORIGIN'] ?? 'http://localhost:4201';
  return {
    apiBindHost: environment['WEBSITE_API_HOST'] ?? '127.0.0.1',
    databasePath: environment['WEBSITE_DATABASE_PATH'] ?? '.local/website.sqlite',
    publicOrigin,
    appOrigin,
    appManualUrl: `${appOrigin}/manual`,
    appBuildUrl: appOrigin,
    operatorPassword: environment['OPERATOR_PASSWORD'],
    secureCookies: new URL(appOrigin).protocol === 'https:',
    trustedProxyHops: readHops(environment),
    demoAuth: readFlag(environment, 'DEMO_AUTH'),
    openRouterKey: environment['OPENROUTER_API_KEY'],
    openRouterModel: environment['OPENROUTER_MODEL'],
    openRouterEnabled: readFlag(environment, 'OPENROUTER_ENABLED'),
    openRouterProvider: environment['OPENROUTER_PROVIDER'],
    openRouterInputUsdPerMillion: readRate(environment, 'OPENROUTER_INPUT_USD_PER_MILLION'),
    openRouterOutputUsdPerMillion: readRate(environment, 'OPENROUTER_OUTPUT_USD_PER_MILLION'),
    openRouterPrivacyVerified: readFlag(environment, 'OPENROUTER_PRIVACY_VERIFIED'),
    openRouterReasoningEffort: readReasoningEffort(environment),
    openRouterMaxCompletionTokens: readMaxCompletionTokens(environment),
    oidcIssuer: environment['OIDC_ISSUER'],
    oidcClientId: environment['OIDC_CLIENT_ID'],
    oidcClientSecret: environment['OIDC_CLIENT_SECRET'],
    oidcRedirectUri: environment['OIDC_REDIRECT_URI'],
    guardrailWebhookUrl: readWebhookUrl(environment['GUARDRAIL_WEBHOOK_URL']),
  };
}

/** Where retention policy decisions are journaled; `disabled` keeps every policy route at 503. */
export type RetentionJournalSetting =
  | { mode: 'disabled' }
  | {
      mode: 's3';
      journalId: string;
      s3: S3JournalConfig;
      /** The release and private revision recorded as each event's writer. */
      release: string;
      privateRevision: string;
    };

const journalIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const writerPattern = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/;

function requiredMatch(environment: Environment, name: string, pattern: RegExp): string {
  const value = environment[name];
  if (value === undefined || !pattern.test(value))
    throw new Error(`${name} is missing or malformed`);
  return value;
}

/**
 * Reads `RETENTION_JOURNAL`, which has no default (veto V12): `disabled`, or `s3` with
 * `RETENTION_JOURNAL_ID` (UUID v4), the bucket settings of {@link readS3JournalConfig} and the
 * writer identity `RETENTION_WRITER_RELEASE` and `RETENTION_WRITER_REVISION`.
 *
 * @throws naming the first missing or malformed variable; secret values never appear.
 */
export function readRetentionJournalSetting(environment: Environment): RetentionJournalSetting {
  const mode = environment['RETENTION_JOURNAL'];
  // Proof: defaulting an absent value to `disabled` made `a missing RETENTION_JOURNAL refuses startup` pass the empty environment.
  if (mode === 'disabled') return { mode };
  if (mode !== 's3') throw new Error('RETENTION_JOURNAL must be disabled or s3');
  return {
    mode,
    journalId: requiredMatch(environment, 'RETENTION_JOURNAL_ID', journalIdPattern),
    s3: readS3JournalConfig(environment),
    release: requiredMatch(environment, 'RETENTION_WRITER_RELEASE', writerPattern),
    privateRevision: requiredMatch(environment, 'RETENTION_WRITER_REVISION', writerPattern),
  };
}

/**
 * Reads `RETENTION_ERASURE` (`report` or `erase`, no default). Erasure needs the remote
 * journal, so `erase` with `RETENTION_JOURNAL=disabled` throws.
 */
export function readRetentionErasure(
  environment: Environment,
  journal: RetentionJournalSetting,
): 'report' | 'erase' {
  const erasure = environment['RETENTION_ERASURE'];
  if (erasure !== 'report' && erasure !== 'erase')
    throw new Error('RETENTION_ERASURE must be report or erase');
  // Proof: dropping this refusal let `erase without s3 is refused` read erase with the journal disabled.
  if (erasure === 'erase' && journal.mode !== 's3')
    throw new Error('RETENTION_ERASURE=erase requires RETENTION_JOURNAL=s3');
  return erasure;
}
