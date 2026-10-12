import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { readReviewProviderAuthority, readReviewProviderDescriptor } from './review-provider';

const requiredFields = [
  ['control', 'ownerId'],
  ['control', 'repositoryId'],
  ['control', 'workflowId'],
  ['control', 'workflowPath'],
  ['control', 'dispatchRef'],
  ['control', 'sourceCommitSha'],
  ['control', 'signerDigest'],
  ['control', 'programIdentity'],
  ['control', 'actionIdentity'],
  ['control', 'runtimeIdentity'],
  ['control', 'runnerPolicy'],
  ['attestation', 'apiOrigin'],
  ['attestation', 'apiVersion'],
  ['attestation', 'issuer'],
  ['attestation', 'signerIdentity'],
  ['attestation', 'trustedRootIdentity'],
  ['attestation', 'trustedRootPath'],
  ['attestation', 'verifierId'],
  ['attestation', 'verifierIdentity'],
  ['attestation', 'verifierVersion'],
  ['attestation', 'verifierExecutablePath'],
  ['attestation', 'verifierRuntimeIdentity'],
  ['attestation', 'predicateType'],
  ['attestation', 'predicateVersion'],
  ['attestation', 'receiptAudience'],
  ['attestation', 'signingAudience'],
  ['attestation', 'retrievalOrigins'],
  ['attestation', 'redirectPolicy'],
  ['attestation', 'registrationOrigin'],
  ['attestation', 'registrationIdentity'],
  ['attestation', 'retentionDays'],
  ['attestation', 'visibility'],
  ['attestation', 'enterpriseEntitlement'],
  ['journal', 'issuerId'],
  ['journal', 'providerId'],
  ['journal', 'executorId'],
  ['journal', 'accessPolicy'],
  ['model', 'origin'],
  ['model', 'apiVersion'],
  ['model', 'modelId'],
  ['model', 'protocolIdentity'],
  ['model', 'promptIdentity'],
  ['model', 'toolPolicyIdentity'],
  ['model', 'entitlementIdentity'],
  ['model', 'credentialReference'],
] as const;

function descriptor() {
  return {
    schemaVersion: 1,
    kind: 'github-actions-attestation-review',
    control: {
      owner: 'example-control',
      repository: 'review-control',
      ownerId: 8101,
      repositoryId: 8102,
      workflowId: 8103,
      workflowPath: '.github/workflows/review.yml',
      dispatchRef: 'refs/heads/review',
      sourceCommitSha: 'a'.repeat(40),
      signerDigest: 'b'.repeat(40),
      programIdentity: 'c'.repeat(64),
      actionIdentity: 'd'.repeat(64),
      runtimeIdentity: 'e'.repeat(64),
      runnerPolicy: 'github-hosted-only',
    },
    attestation: {
      apiOrigin: 'https://api.github.com',
      apiVersion: '2026-03-10',
      issuer: 'https://token.actions.githubusercontent.com',
      signerIdentity:
        'https://github.com/example-control/review-control/.github/workflows/review.yml@refs/heads/review',
      trustedRootIdentity: 'f'.repeat(64),
      trustedRootPath: '/protected/review/trusted-root.jsonl',
      verifierId: 'journal.verifier',
      verifierIdentity: '1'.repeat(64),
      verifierVersion: '2.98.0',
      verifierExecutablePath: '/protected/review/gh',
      verifierRuntimeIdentity: '7'.repeat(64),
      predicateType: 'https://example.invalid/tool-wiki-review/v1',
      predicateVersion: 1,
      receiptAudience: 'tool-wiki-review',
      signingAudience: 'sigstore',
      retrievalOrigins: ['https://journal.example.invalid'],
      redirectPolicy: 'reject',
      registrationOrigin: 'https://registration.example.invalid',
      registrationIdentity: '2'.repeat(64),
      retentionDays: 365,
      visibility: 'private',
      enterpriseEntitlement: 'enterprise-cloud-verified',
    },
    journal: {
      issuerId: 'journal.issuer',
      providerId: 'review.provider',
      executorId: 'review.executor',
      accessPolicy: 'authenticated-exact-retrieval',
    },
    model: {
      origin: 'https://api.anthropic.com',
      apiVersion: '2023-06-01',
      modelId: 'claude-sonnet-4-5-20250929',
      protocolIdentity: '3'.repeat(64),
      promptIdentity: '4'.repeat(64),
      toolPolicyIdentity: '5'.repeat(64),
      entitlementIdentity: '6'.repeat(64),
      credentialReference: '/protected/review/model-token',
    },
  };
}

test.each(['claude-sonnet-4-5', ' claude-sonnet-4-5-20250929 ', 'explicit-model-2026-10-08'])(
  'provider descriptor refuses mutable or malformed model identity %s',
  (modelId) => {
    const directory = mkdtempSync(join(tmpdir(), 'review-provider-model-'));
    try {
      const path = join(directory, 'provider.json');
      const source = descriptor();
      source.model.modelId = modelId;
      const bytes = serializeCanonical(source);
      writeFileSync(path, bytes, { mode: 0o600 });
      expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
        'review provider descriptor malformed',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test.each([
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-sonnet-5',
])('provider descriptor accepts pinned model snapshot %s', (modelId) => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-model-'));
  try {
    const path = join(directory, 'provider.json');
    const source = descriptor();
    source.model.modelId = modelId;
    const bytes = serializeCanonical(source);
    writeFileSync(path, bytes, { mode: 0o600 });
    expect(readReviewProviderDescriptor(path, { identity: hashBytes(bytes) }).model.modelId).toBe(
      modelId,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider descriptor refuses SHA-256 where signer commit SHA is required', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-signer-'));
  try {
    const path = join(directory, 'provider.json');
    const source = descriptor();
    source.control.signerDigest = 'b'.repeat(64);
    const bytes = serializeCanonical(source);
    writeFileSync(path, bytes, { mode: 0o600 });
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
      'review provider descriptor malformed',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('public descriptor refuses private enterprise entitlement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-public-'));
  try {
    const path = join(directory, 'provider.json');
    const source = descriptor();
    source.attestation.visibility = 'public';
    const bytes = serializeCanonical(source);
    writeFileSync(path, bytes, { mode: 0o600 });
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
      'review attestation visibility differs from entitlement',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('public descriptor accepts its exact public-repository entitlement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-public-'));
  try {
    const path = join(directory, 'provider.json');
    const source = descriptor();
    source.attestation.visibility = 'public';
    source.attestation.enterpriseEntitlement = 'public-repository';
    const bytes = serializeCanonical(source);
    writeFileSync(path, bytes, { mode: 0o600 });
    expect(
      readReviewProviderDescriptor(path, { identity: hashBytes(bytes) }).attestation.visibility,
    ).toBe('public');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider authority has no inferred defaults and private journal requires verified entitlement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-'));
  try {
    const path = join(directory, 'provider.json');
    const source = descriptor();
    const bytes = serializeCanonical(source);
    writeFileSync(path, bytes, { mode: 0o600 });
    const pin = { identity: hashBytes(bytes) };
    expect(readReviewProviderDescriptor(path, pin).control.repositoryId).toBe(8102);
    const withoutEntitlement = structuredClone(source);
    Reflect.deleteProperty(withoutEntitlement.attestation, 'enterpriseEntitlement');
    const changed = serializeCanonical(withoutEntitlement);
    writeFileSync(path, changed);
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(changed) })).toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider descriptor distinguishes absent, unreadable and malformed protected files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-file-'));
  try {
    const path = join(directory, 'provider.json');
    const bytes = serializeCanonical(descriptor());
    const pin = { identity: hashBytes(bytes) };
    expect(() => readReviewProviderDescriptor(path, pin)).toThrow(
      'review provider descriptor absent',
    );
    writeFileSync(path, bytes, { mode: 0o600 });
    const linked = join(directory, 'linked.json');
    linkSync(path, linked);
    expect(() => readReviewProviderDescriptor(path, pin)).toThrow(
      'review provider descriptor file malformed',
    );
    rmSync(linked);
    chmodSync(path, 0o644);
    expect(() => readReviewProviderDescriptor(path, pin)).toThrow(
      'review provider descriptor file malformed',
    );
    chmodSync(path, 0o600);
    const link = join(directory, 'symlink.json');
    symlinkSync(path, link);
    expect(() => readReviewProviderDescriptor(link, pin)).toThrow(
      'review provider descriptor unreadable',
    );
    const directoryPath = join(directory, 'directory');
    mkdirSync(directoryPath);
    expect(() => readReviewProviderDescriptor(directoryPath, pin)).toThrow(
      'review provider descriptor file malformed',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider descriptor refuses a FIFO promptly before reading trusted bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-fifo-'));
  try {
    const path = join(directory, 'provider.pipe');
    const created = spawnSync('/usr/bin/mkfifo', [path], { encoding: 'utf8' });
    expect(created.status).toBe(0);
    chmodSync(path, 0o600);
    const started = performance.now();
    expect(() => readReviewProviderDescriptor(path, { identity: '1'.repeat(64) })).toThrow(
      'review provider descriptor file malformed',
    );
    expect(performance.now() - started).toBeLessThan(500);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'schemaVersion',
    (source: ReturnType<typeof descriptor>) => {
      source.schemaVersion = 2;
    },
  ],
  [
    'kind',
    (source: ReturnType<typeof descriptor>) => {
      source.kind = 'local-cooperative';
    },
  ],
] as const)(
  'provider refuses unsupported %s rather than relabeling authority',
  (field, corrupt) => {
    const directory = mkdtempSync(join(tmpdir(), 'review-provider-version-'));
    try {
      const path = join(directory, 'provider.json');
      const source = descriptor();
      corrupt(source);
      const bytes = serializeCanonical(source);
      writeFileSync(path, bytes, { mode: 0o600 });
      expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
        'review provider descriptor malformed',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test.each(requiredFields)(
  'provider authority refuses absent %s.%s rather than inferring it',
  (section, field) => {
    const directory = mkdtempSync(join(tmpdir(), 'review-provider-required-'));
    try {
      const path = join(directory, 'provider.json');
      const selected = descriptor();
      Reflect.deleteProperty(selected[section], field);
      const bytes = serializeCanonical(selected);
      writeFileSync(path, bytes, { mode: 0o600 });
      expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
        'review provider descriptor malformed',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('verifier and trusted-root paths are absolute pins, never ambient executables', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-executable-'));
  try {
    const path = join(directory, 'provider.json');
    for (const field of ['verifierExecutablePath', 'trustedRootPath'] as const) {
      const selected = descriptor();
      selected.attestation[field] = field === 'verifierExecutablePath' ? 'gh' : '../root.jsonl';
      const bytes = serializeCanonical(selected);
      writeFileSync(path, bytes, { mode: 0o600 });
      expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
        'review provider descriptor malformed',
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each(['verifierExecutablePath', 'trustedRootPath'] as const)(
  'provider refuses noncanonical %s with dot traversal',
  (field) => {
    const directory = mkdtempSync(join(tmpdir(), 'review-provider-path-'));
    try {
      const path = join(directory, 'provider.json');
      const selected = descriptor();
      selected.attestation[field] = '/protected/../candidate/gh';
      const bytes = serializeCanonical(selected);
      writeFileSync(path, bytes, { mode: 0o600 });
      expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
        'review provider descriptor malformed',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('provider refuses invalid UTF-8 even when the exact source bytes are independently pinned', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-utf8-'));
  try {
    const path = join(directory, 'provider.json');
    const valid = Buffer.from(serializeCanonical(descriptor()), 'utf8');
    const needle = Buffer.from('claude-sonnet-4-5-20250929');
    const at = valid.indexOf(needle);
    expect(at).toBeGreaterThan(0);
    valid[at] = 0xff;
    writeFileSync(path, valid, { mode: 0o600 });
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(valid) })).toThrow(
      'review provider descriptor malformed',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider refuses unpinned and noncanonical descriptor bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-content-'));
  try {
    const path = join(directory, 'provider.json');
    const bytes = serializeCanonical(descriptor());
    writeFileSync(path, bytes, { mode: 0o600 });
    expect(() => readReviewProviderDescriptor(path, { identity: '0'.repeat(64) })).toThrow(
      'review provider descriptor differs from pin',
    );
    const noncanonical = JSON.stringify(descriptor(), null, 2);
    writeFileSync(path, noncanonical);
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(noncanonical) })).toThrow(
      'review provider descriptor malformed',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider refuses a lexical alias of the trusted descriptor locator', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-locator-'));
  try {
    const path = join(directory, 'provider.json');
    const bytes = serializeCanonical(descriptor());
    writeFileSync(path, bytes, { mode: 0o600 });
    const alias = `${directory}/subdir/../provider.json`;
    mkdirSync(join(directory, 'subdir'));
    expect(() => readReviewProviderDescriptor(alias, { identity: hashBytes(bytes) })).toThrow(
      'review provider descriptor path malformed',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider descriptor enforces its exact canonical byte ceiling before parsing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-size-'));
  try {
    const path = join(directory, 'provider.json');
    const selected = descriptor();
    const padding = 65_536 - Buffer.byteLength(serializeCanonical(selected), 'utf8');
    expect(padding).toBeGreaterThan(0);
    selected.attestation.signerIdentity += 'x'.repeat(padding);
    const atLimit = serializeCanonical(selected);
    expect(Buffer.byteLength(atLimit, 'utf8')).toBe(65_536);
    writeFileSync(path, atLimit, { mode: 0o600 });
    expect(
      readReviewProviderDescriptor(path, { identity: hashBytes(atLimit) }).attestation
        .signerIdentity,
    ).toHaveLength(selected.attestation.signerIdentity.length);
    selected.attestation.signerIdentity += 'x';
    const overLimit = serializeCanonical(selected);
    expect(Buffer.byteLength(overLimit, 'utf8')).toBe(65_537);
    writeFileSync(path, overLimit);
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(overLimit) })).toThrow(
      'review provider descriptor too large',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'private entitlement',
    (source: ReturnType<typeof descriptor>) => {
      source.attestation.enterpriseEntitlement = 'public-repository';
    },
  ],
  [
    'retrieval origin',
    (source: ReturnType<typeof descriptor>) => {
      source.attestation.retrievalOrigins = [];
    },
  ],
  [
    'retention ceiling',
    (source: ReturnType<typeof descriptor>) => {
      source.attestation.retentionDays = 3651;
    },
  ],
  [
    'credential traversal',
    (source: ReturnType<typeof descriptor>) => {
      source.model.credentialReference = '/protected/../candidate/token';
    },
  ],
] as const)('provider refuses %s with a coherent new pin', (label, corrupt) => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-policy-'));
  try {
    const path = join(directory, 'provider.json');
    const source = descriptor();
    corrupt(source);
    const bytes = serializeCanonical(source);
    writeFileSync(path, bytes, { mode: 0o600 });
    expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'owner ID',
    (source: ReturnType<typeof descriptor>) => {
      source.control.ownerId = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'repository ID',
    (source: ReturnType<typeof descriptor>) => {
      source.control.repositoryId = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'workflow ID',
    (source: ReturnType<typeof descriptor>) => {
      source.control.workflowId = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'predicate version',
    (source: ReturnType<typeof descriptor>) => {
      source.attestation.predicateVersion = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
] as const)(
  'provider refuses unsafe %s before using an immutable numeric identity',
  (field, corrupt) => {
    const directory = mkdtempSync(join(tmpdir(), 'review-provider-integer-'));
    try {
      const path = join(directory, 'provider.json');
      const source = descriptor();
      corrupt(source);
      const bytes = serializeCanonical(source);
      writeFileSync(path, bytes, { mode: 0o600 });
      expect(() => readReviewProviderDescriptor(path, { identity: hashBytes(bytes) })).toThrow(
        'review provider numeric authority malformed',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

function authorityFixture(directory: string) {
  const descriptorPath = join(directory, 'provider.json');
  const bootstrapPath = join(directory, 'bootstrap.json');
  const selected = descriptor();
  const bootstrap = {
    schemaVersion: 2,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: '3'.repeat(64),
      promptIdentity: '4'.repeat(64),
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
    admission: {
      requiredWorkflow: '.github/workflows/trusted-wiki.yml',
      protectedBranch: 'main',
    },
    reviewProvider: {
      kind: 'github-actions-attestation-review',
      descriptorIdentity: '',
    },
  };
  function writeAuthority() {
    const descriptorBytes = serializeCanonical(selected);
    writeFileSync(descriptorPath, descriptorBytes, { mode: 0o600 });
    bootstrap.reviewProvider.descriptorIdentity = hashBytes(descriptorBytes);
    const bootstrapBytes = serializeCanonical(bootstrap);
    writeFileSync(bootstrapPath, bootstrapBytes, { mode: 0o600 });
    return {
      identity: hashBytes(bootstrapBytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
      reviewProviderIdentity: hashBytes(descriptorBytes),
    };
  }
  return { selected, bootstrap, descriptorPath, bootstrapPath, writeAuthority };
}

test('pinned provider descriptor joins the explicit bootstrap authority', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-authority-'));
  try {
    const fixture = authorityFixture(directory);
    const pin = fixture.writeAuthority();
    expect(
      readReviewProviderAuthority(fixture.bootstrapPath, pin, fixture.descriptorPath, {
        identity: pin.reviewProviderIdentity,
      }).descriptor.control.workflowId,
    ).toBe(8103);
    fixture.selected.journal.executorId = 'review.foreign';
    const changedPin = fixture.writeAuthority();
    expect(() =>
      readReviewProviderAuthority(fixture.bootstrapPath, changedPin, fixture.descriptorPath, {
        identity: changedPin.reviewProviderIdentity,
      }),
    ).toThrow('review provider descriptor differs from bootstrap authority');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('independently pinned descriptor still matches the v2 bootstrap descriptor identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-pin-join-'));
  try {
    const fixture = authorityFixture(directory);
    const pin = fixture.writeAuthority();
    fixture.selected.control.workflowId = 8104;
    const bytes = serializeCanonical(fixture.selected);
    writeFileSync(fixture.descriptorPath, bytes, { mode: 0o600 });
    expect(() =>
      readReviewProviderAuthority(fixture.bootstrapPath, pin, fixture.descriptorPath, {
        identity: hashBytes(bytes),
      }),
    ).toThrow('review provider descriptor differs from bootstrap pin');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provider authority never blocks on a substituted bootstrap FIFO before checking its pin', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-provider-bootstrap-fifo-'));
  try {
    const fixture = authorityFixture(directory);
    const pin = fixture.writeAuthority();
    rmSync(fixture.bootstrapPath);
    const created = spawnSync('/usr/bin/mkfifo', [fixture.bootstrapPath], { encoding: 'utf8' });
    expect(created.status).toBe(0);
    chmodSync(fixture.bootstrapPath, 0o600);
    const started = performance.now();
    expect(() =>
      readReviewProviderAuthority(fixture.bootstrapPath, pin, fixture.descriptorPath, {
        identity: pin.reviewProviderIdentity,
      }),
    ).toThrow('bootstrap configuration file malformed');
    expect(performance.now() - started).toBeLessThan(500);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'journal issuer',
    (source: ReturnType<typeof descriptor>) => {
      source.journal.issuerId = 'journal.foreign';
    },
  ],
  [
    'provider',
    (source: ReturnType<typeof descriptor>) => {
      source.journal.providerId = 'review.foreign';
    },
  ],
  [
    'executor',
    (source: ReturnType<typeof descriptor>) => {
      source.journal.executorId = 'review.foreign';
    },
  ],
  [
    'verifier',
    (source: ReturnType<typeof descriptor>) => {
      source.attestation.verifierId = 'journal.foreign';
    },
  ],
  [
    'protocol',
    (source: ReturnType<typeof descriptor>) => {
      source.model.protocolIdentity = '8'.repeat(64);
    },
  ],
  [
    'prompt',
    (source: ReturnType<typeof descriptor>) => {
      source.model.promptIdentity = '8'.repeat(64);
    },
  ],
  [
    'retrieval origin',
    (source: ReturnType<typeof descriptor>) => {
      source.attestation.retrievalOrigins = ['https://foreign.example.invalid'];
    },
  ],
] as const)(
  'provider descriptor refuses changed %s under coherently repinned bytes',
  (label, corrupt) => {
    const directory = mkdtempSync(join(tmpdir(), 'review-provider-join-'));
    try {
      const fixture = authorityFixture(directory);
      corrupt(fixture.selected);
      const pin = fixture.writeAuthority();
      expect(() =>
        readReviewProviderAuthority(fixture.bootstrapPath, pin, fixture.descriptorPath, {
          identity: pin.reviewProviderIdentity,
        }),
      ).toThrow('review provider descriptor differs from bootstrap authority');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
