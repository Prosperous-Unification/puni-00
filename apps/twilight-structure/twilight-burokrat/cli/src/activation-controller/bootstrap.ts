import { readFileSync } from 'node:fs';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';

const Sha256Pattern = /^[0-9a-f]{64}$/;
const AuthorityIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const Sha256 = type(Sha256Pattern);
const AuthorityId = type(AuthorityIdPattern);
const HttpsEndpoint = type(/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/);

const BootstrapFields = {
  authorityGeneration: 'number.integer>=1',
  reviewer: type({
    kind: "'external-audit-provider'",
    providerId: AuthorityId,
    executorId: AuthorityId,
    protocolIdentity: Sha256,
    promptIdentity: Sha256,
  }).onUndeclaredKey('reject'),
  journal: type({
    kind: "'authenticated-external-journal'",
    verifierId: AuthorityId,
    issuerId: AuthorityId,
    endpoint: HttpsEndpoint,
  }).onUndeclaredKey('reject'),
  publisher: type({
    kind: "'immutable-external-store'",
    issuerId: AuthorityId,
    endpoint: HttpsEndpoint,
  }).onUndeclaredKey('reject'),
  admission: type({
    requiredWorkflow: "'.github/workflows/trusted-wiki.yml'",
    protectedBranch: 'string>=1',
  }).onUndeclaredKey('reject'),
} as const;

const BootstrapConfigurationRecord = type({ schemaVersion: '1', ...BootstrapFields })
  .onUndeclaredKey('reject')
  .or(
    type({
      schemaVersion: '2',
      ...BootstrapFields,
      reviewProvider: type({
        kind: "'github-actions-attestation-review'",
        descriptorIdentity: Sha256,
      }).onUndeclaredKey('reject'),
    }).onUndeclaredKey('reject'),
  );

export type BootstrapConfiguration = typeof BootstrapConfigurationRecord.infer;
export type ExternalReviewBootstrap = Extract<BootstrapConfiguration, { schemaVersion: 2 }>;

/** Requires the explicitly pinned external-review bootstrap before provider verification. */
export function assertExternalReviewProvider(
  configuration: BootstrapConfiguration,
): asserts configuration is ExternalReviewBootstrap {
  // Proof: omitting this version guard let a registered audit phase complete under legacy v1.
  if (configuration.schemaVersion !== 2) {
    throw new Error('legacy bootstrap has no external review provider');
  }
}

/** Independently selected deployment pins; candidate data cannot supply these at runtime. */
export interface TrustedBootstrapPin {
  readonly identity: string;
  readonly journalIssuerId: string;
  readonly publisherIssuerId: string;
  readonly reviewProviderIdentity?: string;
}

function assertBootstrapPin(pin: TrustedBootstrapPin): void {
  // Proof: malformed-pin omission replaced the named refusal with a later digest mismatch.
  if (
    !Sha256Pattern.test(pin.identity) ||
    !AuthorityIdPattern.test(pin.journalIssuerId) ||
    !AuthorityIdPattern.test(pin.publisherIssuerId) ||
    (pin.reviewProviderIdentity !== undefined && !Sha256Pattern.test(pin.reviewProviderIdentity))
  ) {
    throw new Error('bootstrap independent pin malformed');
  }
}

/** Validates exact bytes already opened through an independently trusted transport. */
export function decodeBootstrapConfiguration(
  bytes: string,
  pin: TrustedBootstrapPin,
): BootstrapConfiguration {
  assertBootstrapPin(pin);
  let configuration: BootstrapConfiguration;
  try {
    // Proof: schema and canonical-byte omissions admitted malformed/local-relabelled bootstrap bytes.
    const parsed: unknown = JSON.parse(bytes);
    configuration = parseOrThrow(BootstrapConfigurationRecord, parsed);
    if (serializeCanonical(configuration) !== bytes) {
      throw new Error('bootstrap bytes are not canonical');
    }
  } catch (cause) {
    throw new Error('bootstrap configuration malformed', { cause });
  }
  // Proof: the digest omission accepted independently unpinned bootstrap bytes.
  if (hashBytes(bytes) !== pin.identity) {
    throw new Error('bootstrap configuration differs from independent pin');
  }
  // Proof: issuer omissions accepted changed journal and publisher authority in mounted ingress.
  if (configuration.journal.issuerId !== pin.journalIssuerId) {
    throw new Error('bootstrap journal issuer differs from independent pin');
  }
  if (configuration.publisher.issuerId !== pin.publisherIssuerId) {
    // Proof: omitting the publisher issuer guard accepted a different immutable-store authority.
    throw new Error('bootstrap publisher issuer differs from independent pin');
  }
  if (configuration.schemaVersion === 2) {
    // A v2 descriptor never inherits authority from the legacy v1 bootstrap.
    // Proof: omitting the absent-pin guard changed its named refusal to a digest mismatch;
    // omitting the digest join admitted coherently altered descriptor authority.
    if (pin.reviewProviderIdentity === undefined)
      throw new Error('bootstrap review provider pin absent');
    if (configuration.reviewProvider.descriptorIdentity !== pin.reviewProviderIdentity)
      throw new Error('bootstrap review provider differs from independent pin');
  } else if (pin.reviewProviderIdentity !== undefined) {
    // Proof: omitting this legacy branch accepted a v1 configuration under a provider pin.
    throw new Error('legacy bootstrap has no external review provider');
  }
  return configuration;
}

/**
 * Reads only pinned bootstrap bytes. This decoder cannot establish that the deployment which
 * supplied the pins is independent; that is an external bootstrap acceptance requirement.
 */
export function readBootstrapConfiguration(
  path: string,
  pin: TrustedBootstrapPin,
): BootstrapConfiguration {
  assertBootstrapPin(pin);
  let bytes: string;
  try {
    bytes = readFileSync(path, 'utf8');
  } catch (cause) {
    // Proof: absent and unreadable omissions each let mounted ingress lose its distinct refusal.
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      throw new Error(`bootstrap configuration absent: ${path}`, { cause });
    }
    throw new Error(`bootstrap configuration unreadable: ${path}`, { cause });
  }
  return decodeBootstrapConfiguration(bytes, pin);
}
