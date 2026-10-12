import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hashBytes, serializeCanonical } from '@twilight-burokrat/judge';

/** The pinned inputs of a service configuration; the store binds their canonical hash. */
export interface ObservationServiceInputs {
  readonly bootstrap: unknown;
  readonly binding: unknown;
  readonly policy: unknown;
}

/** A protected scratch root holding `config/{bootstrap,service}.json` and `state/`. */
export interface ObservationServiceConfiguration {
  readonly root: string;
  readonly configurationPath: string;
  readonly stateDirectory: string;
  readonly databasePath: string;
}

export const defaultObservationServiceInputs: ObservationServiceInputs = {
  bootstrap: {
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: { requiredWorkflow: '.github/workflows/trusted-wiki.yml', protectedBranch: 'main' },
  },
  binding: {
    repositoryId: 8241,
    owner: 'Prosperous-Unification',
    name: 'puni-00',
    targetRef: 'refs/heads/main',
    policyIdentity: '3'.repeat(64),
    mappingIdentity: '4'.repeat(64),
    toolkitIdentity: '5'.repeat(64),
    readDeadlineMs: 1000,
  },
  policy: {
    maxAttempts: 3,
    wholeTickMs: 5000,
    maxSubjects: 100,
    initialDelayMs: 100,
    maxDelayMs: 400,
    fallbackDelayMs: 200,
    recoveryProbeMs: 1000,
    horizonMs: 5000,
  },
};

/**
 * Writes a protected service configuration (0700 directories, 0600 files) under a fresh scratch
 * root. The caller removes `root`. `state/` is created unless `createState` is false.
 */
export function writeObservationServiceConfiguration(
  inputs: ObservationServiceInputs = defaultObservationServiceInputs,
  createState = true,
): ObservationServiceConfiguration {
  const root = mkdtempSync(join(tmpdir(), 'dash-observation-store-'));
  chmodSync(root, 0o700);
  const stateDirectory = join(root, 'state');
  const configurationDirectory = join(root, 'config');
  if (createState) mkdirSync(stateDirectory, { mode: 0o700 });
  mkdirSync(configurationDirectory, { mode: 0o700 });
  const bootstrapPath = join(configurationDirectory, 'bootstrap.json');
  const bootstrapBytes = serializeCanonical(inputs.bootstrap);
  writeFileSync(bootstrapPath, bootstrapBytes, { mode: 0o600 });
  const configurationPath = join(configurationDirectory, 'service.json');
  writeFileSync(
    configurationPath,
    serializeCanonical({
      schemaVersion: 1,
      stateDirectory,
      bootstrapPath,
      pin: {
        identity: hashBytes(bootstrapBytes),
        journalIssuerId: 'journal.issuer',
        publisherIssuerId: 'publisher.issuer',
      },
      binding: inputs.binding,
      policy: inputs.policy,
      cleanupMs: 100,
      credentialPath: null,
    }),
    { mode: 0o600 },
  );
  return {
    root,
    configurationPath,
    stateDirectory,
    databasePath: join(stateDirectory, 'activation.sqlite'),
  };
}
