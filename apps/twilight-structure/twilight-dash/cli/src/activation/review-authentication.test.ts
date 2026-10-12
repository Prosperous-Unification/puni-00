import * as filesystem from 'node:fs';
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { hashBytes } from '@twilight-burokrat/judge';
import { expect, spyOn, test } from 'bun:test';

import { runPinnedOfflineGh, verifyOfflineReviewBundle } from './review-attestation';
import {
  assertRegisteredReviewClaim,
  assertReviewCertificateClaim,
  assertUntrustedReviewMetadataProjection,
  parseUntrustedReviewPredicate,
  rereadReviewJournal,
} from './review-authentication';
import type { RetrievedReviewJournal } from './review-retrieval';
import { createTestOwnedReviewAttestation } from './testing/review-authentication.fixture';

async function verifyTestOwnedAttestation(
  signing: ReturnType<typeof createTestOwnedReviewAttestation>,
  bundleBytes = signing.bundleBytes,
): ReturnType<typeof verifyOfflineReviewBundle> {
  const policy = {
    executablePath: '/usr/bin/gh',
    executableIdentity: hashBytes(readFileSync('/usr/bin/gh')),
    version: '2.98.0',
    runtimeIdentity: 'd'.repeat(64),
    trustedRootPath: signing.trustedRootPath,
    trustedRootIdentity: hashBytes(readFileSync(signing.trustedRootPath)),
    repository: 'test-owner/test-repo',
    certIdentity:
      'https://github.com/test-owner/test-repo/.github/workflows/review.yml@refs/heads/main',
    signerDigest: 'c'.repeat(40),
    sourceDigest: 'b'.repeat(40),
    sourceRef: 'refs/heads/main',
    issuer: 'https://token.actions.githubusercontent.com',
    predicateType: 'https://example.org/review-predicate/v1',
  };
  return verifyOfflineReviewBundle({
    policy,
    manifestBytes: signing.manifestBytes,
    bundleBytes,
    resolveRuntime: () =>
      Promise.resolve({
        executableIdentity: policy.executableIdentity,
        version: policy.version,
        runtimeIdentity: policy.runtimeIdentity,
        trustedRootIdentity: policy.trustedRootIdentity,
      }),
    run: (process) => runPinnedOfflineGh(process),
  });
}

function withJournal(
  exercise: (journal: RetrievedReviewJournal, manifestIdentity: string) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'review-authentication-test-'));
  chmodSync(directory, 0o700);
  const manifestBytes = Buffer.from('{"kind":"review-journal-manifest"}');
  const bundleBytes = Buffer.from('{"bundle":1}');
  const artifactBytes = Buffer.from('{"artifact":1}');
  const manifestIdentity = hashBytes(manifestBytes);
  const bundleIdentity = hashBytes(bundleBytes);
  const artifactIdentity = hashBytes(artifactBytes);
  const manifestPath = join(directory, `manifest-${manifestIdentity}`);
  const bundlePath = join(directory, `bundle-${bundleIdentity}`);
  const artifactPath = join(directory, `artifact-${artifactIdentity}`);
  try {
    writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
    writeFileSync(bundlePath, bundleBytes, { mode: 0o600 });
    writeFileSync(artifactPath, artifactBytes, { mode: 0o600 });
    exercise(
      {
        kind: 'retrieved-review-journal',
        directory,
        manifestPath,
        artifacts: [{ kind: 'review-evidence', identity: artifactIdentity, path: artifactPath }],
        bundleCandidates: [{ identity: bundleIdentity, path: bundlePath }],
      },
      manifestIdentity,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('authentication rereads exact staged manifest and bundle bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'review-authentication-test-'));
  chmodSync(directory, 0o700);
  const manifestBytes = Buffer.from('{"kind":"review-journal-manifest"}');
  const bundleBytes = Buffer.from('{"bundle":1}');
  const manifestIdentity = hashBytes(manifestBytes);
  const bundleIdentity = hashBytes(bundleBytes);
  const manifestPath = join(directory, `manifest-${manifestIdentity}`);
  const bundlePath = join(directory, `bundle-${bundleIdentity}`);
  try {
    writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
    writeFileSync(bundlePath, bundleBytes, { mode: 0o600 });
    const retrieved: RetrievedReviewJournal = {
      kind: 'retrieved-review-journal',
      directory,
      manifestPath,
      artifacts: [],
      bundleCandidates: [{ identity: bundleIdentity, path: bundlePath }],
    };

    const reread = rereadReviewJournal(retrieved, manifestIdentity);

    expect(reread.manifestBytes.equals(manifestBytes)).toBe(true);
    expect(reread.bundleCandidates[0]?.bytes.equals(bundleBytes)).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('authentication rereads every retained artifact before evaluation', () => {
  withJournal((journal, manifestIdentity) => {
    const reread = rereadReviewJournal(journal, manifestIdentity);
    expect(reread.artifacts[0]?.bytes.toString()).toBe('{"artifact":1}');
  });
});

test('authentication refuses a bundle path outside its owned staging directory', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    const foreignDirectory = mkdtempSync(join(tmpdir(), 'review-foreign-test-'));
    try {
      chmodSync(foreignDirectory, 0o700);
      const foreignPath = join(foreignDirectory, `bundle-${bundle.identity}`);
      writeFileSync(foreignPath, readFileSync(bundle.path), { mode: 0o600 });
      const foreign: RetrievedReviewJournal = {
        ...journal,
        bundleCandidates: [{ ...bundle, path: foreignPath }],
      };
      expect(() => rereadReviewJournal(foreign, manifestIdentity)).toThrow();
    } finally {
      rmSync(foreignDirectory, { recursive: true, force: true });
    }
  });
});

test('authentication refuses a symlinked staged bundle', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    const realPath = join(journal.directory, 'bundle-real');
    writeFileSync(realPath, readFileSync(bundle.path), { mode: 0o600 });
    unlinkSync(bundle.path);
    symlinkSync(realPath, bundle.path);
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses a group-readable staged bundle', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    chmodSync(bundle.path, 0o640);
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses a hard-linked staged bundle', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    linkSync(bundle.path, join(journal.directory, 'extra-link'));
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses changed bundle bytes after retrieval', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    writeFileSync(bundle.path, '{"bundle":2}');
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication retains both a staged digest failure and a close failure', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    writeFileSync(bundle.path, '{"bundle":2}');
    const original = filesystem.closeSync;
    let closes = 0;
    const close = spyOn(filesystem, 'closeSync').mockImplementation((descriptor) => {
      original(descriptor);
      closes += 1;
      if (closes === 3) throw new Error('close-sentinel');
    });
    try {
      let failure: unknown;
      try {
        rereadReviewJournal(journal, manifestIdentity);
      } catch (cause) {
        failure = cause;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      if (failure instanceof AggregateError) {
        expect(
          failure.errors.some(
            (cause: unknown) => cause instanceof Error && cause.message.includes('digest differs'),
          ),
        ).toBe(true);
        expect(
          failure.errors.some(
            (cause: unknown) => cause instanceof Error && cause.message.includes('close-sentinel'),
          ),
        ).toBe(true);
      }
    } finally {
      close.mockRestore();
    }
  });
});

test('authentication refuses a staged bundle above its byte ceiling', () => {
  withJournal((journal, manifestIdentity) => {
    const bundle = journal.bundleCandidates[0];
    writeFileSync(bundle.path, Buffer.alloc(1_048_577));
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses a replaceable staging directory', () => {
  withJournal((journal, manifestIdentity) => {
    chmodSync(journal.directory, 0o770);
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses a relative staging directory alias', () => {
  withJournal((journal, manifestIdentity) => {
    const directory = relative(process.cwd(), journal.directory);
    const aliased: RetrievedReviewJournal = {
      ...journal,
      directory,
      manifestPath: join(directory, `manifest-${manifestIdentity}`),
      artifacts: journal.artifacts.map((artifact) => ({
        ...artifact,
        path: join(directory, `artifact-${artifact.identity}`),
      })),
      bundleCandidates: journal.bundleCandidates.map((candidate) => ({
        ...candidate,
        path: join(directory, `bundle-${candidate.identity}`),
      })),
    };
    expect(() => rereadReviewJournal(aliased, manifestIdentity)).toThrow();
  });
});

test('authentication refuses a noncanonical staging directory alias', () => {
  withJournal((journal, manifestIdentity) => {
    const directory = `${journal.directory}/.`;
    const aliased: RetrievedReviewJournal = {
      ...journal,
      directory,
      manifestPath: join(directory, `manifest-${manifestIdentity}`),
      artifacts: journal.artifacts.map((artifact) => ({
        ...artifact,
        path: join(directory, `artifact-${artifact.identity}`),
      })),
      bundleCandidates: journal.bundleCandidates.map((candidate) => ({
        ...candidate,
        path: join(directory, `bundle-${candidate.identity}`),
      })),
    };
    expect(() => rereadReviewJournal(aliased, manifestIdentity)).toThrow();
  });
});

test('authentication refuses a foreign-owner staging directory', () => {
  withJournal((journal, manifestIdentity) => {
    const original = filesystem.lstatSync;
    const stat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
      const entry = original(path);
      if (path === journal.directory) entry.uid += 1;
      return entry;
    }) as typeof filesystem.lstatSync);
    try {
      expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
    } finally {
      stat.mockRestore();
    }
  });
});

test('authentication refuses a symlinked staging directory', () => {
  withJournal((journal, manifestIdentity) => {
    const aliasRoot = mkdtempSync(join(tmpdir(), 'review-directory-alias-'));
    const alias = join(aliasRoot, 'stage');
    try {
      symlinkSync(journal.directory, alias);
      const aliased: RetrievedReviewJournal = {
        ...journal,
        directory: alias,
        manifestPath: join(alias, `manifest-${manifestIdentity}`),
        artifacts: journal.artifacts.map((artifact) => ({
          ...artifact,
          path: join(alias, `artifact-${artifact.identity}`),
        })),
        bundleCandidates: journal.bundleCandidates.map((candidate) => ({
          ...candidate,
          path: join(alias, `bundle-${candidate.identity}`),
        })),
      };
      expect(() => rereadReviewJournal(aliased, manifestIdentity)).toThrow();
    } finally {
      rmSync(aliasRoot, { recursive: true, force: true });
    }
  });
});

test('authentication refuses non-directory staging metadata', () => {
  withJournal((journal, manifestIdentity) => {
    const original = filesystem.lstatSync;
    const stat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
      const entry = original(path);
      if (path === journal.directory) entry.isDirectory = () => false;
      return entry;
    }) as typeof filesystem.lstatSync);
    try {
      expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
    } finally {
      stat.mockRestore();
    }
  });
});

test('authentication refuses a foreign-owner staged bundle', () => {
  withJournal((journal, manifestIdentity) => {
    const original = filesystem.fstatSync;
    let inspections = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = original(descriptor);
      inspections += 1;
      if (inspections === 3) entry.uid += 1;
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
    } finally {
      stat.mockRestore();
    }
  });
});

test('authentication refuses a nonregular staged bundle inode', () => {
  withJournal((journal, manifestIdentity) => {
    const original = filesystem.fstatSync;
    let inspections = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = original(descriptor);
      inspections += 1;
      if (inspections === 3) entry.isFile = () => false;
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
    } finally {
      stat.mockRestore();
    }
  });
});

test('authentication refuses changed manifest bytes after retrieval', () => {
  withJournal((journal, manifestIdentity) => {
    writeFileSync(journal.manifestPath, '{"kind":"foreign"}');
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses changed artifact bytes after retrieval', () => {
  withJournal((journal, manifestIdentity) => {
    const artifact = journal.artifacts[0];
    writeFileSync(artifact.path, '{"artifact":2}');
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses an oversized staged artifact', () => {
  withJournal((journal, manifestIdentity) => {
    const artifact = journal.artifacts[0];
    writeFileSync(artifact.path, Buffer.alloc(4_194_305));
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses an oversized staged manifest', () => {
  withJournal((journal, manifestIdentity) => {
    writeFileSync(journal.manifestPath, Buffer.alloc(65_537));
    expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
  });
});

test('authentication refuses more than sixteen candidate entries', () => {
  withJournal((journal, manifestIdentity) => {
    const repeated: RetrievedReviewJournal = {
      ...journal,
      bundleCandidates: Array.from({ length: 17 }, () => journal.bundleCandidates[0]),
    };
    expect(() => rereadReviewJournal(repeated, manifestIdentity)).toThrow();
  });
});

test('authentication refuses more than sixty-four artifact entries', () => {
  withJournal((journal, manifestIdentity) => {
    const repeated: RetrievedReviewJournal = {
      ...journal,
      artifacts: Array.from({ length: 65 }, () => journal.artifacts[0]),
    };
    expect(() => rereadReviewJournal(repeated, manifestIdentity)).toThrow();
  });
});

test('authentication rejects a bundle whose stat exceeds the cap before reading', () => {
  withJournal((journal, manifestIdentity) => {
    const original = filesystem.fstatSync;
    let inspections = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = original(descriptor);
      inspections += 1;
      if (inspections === 3) entry.size = 1_048_577;
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(() => rereadReviewJournal(journal, manifestIdentity)).toThrow();
    } finally {
      stat.mockRestore();
    }
  });
});

test('authentication rejects bytes grown past the cap after a small stat', () => {
  withJournal((journal, manifestIdentity) => {
    const bytes = Buffer.alloc(1_048_577, 0x61);
    const identity = hashBytes(bytes);
    const path = join(journal.directory, `bundle-${identity}`);
    writeFileSync(path, bytes, { mode: 0o600 });
    const grown: RetrievedReviewJournal = {
      ...journal,
      bundleCandidates: [{ identity, path }],
    };
    const original = filesystem.fstatSync;
    let inspections = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = original(descriptor);
      inspections += 1;
      if (inspections === 3) entry.size = 1;
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(() => rereadReviewJournal(grown, manifestIdentity)).toThrow();
    } finally {
      stat.mockRestore();
    }
  });
});

function predicateFixture() {
  const digest = 'a'.repeat(64);
  return {
    schemaVersion: 1,
    kind: 'tool-wiki-review',
    descriptorIdentity: digest,
    manifestIdentity: digest,
    receiptAudience: 'review-audience',
    journalIssuerId: 'journal-issuer',
    journalId: 'journal-1',
    effectKey: digest,
    payloadDigest: digest,
    requestIdentity: digest,
    reviewId: 'review-1',
    attempt: 0,
    invocationId: 'invocation-1',
    selectionIdentity: digest,
    execution: {
      executorId: 'executor-1',
      modelId: 'claude-sonnet-4-6',
      protocolIdentity: digest,
      promptIdentity: digest,
      programIdentity: digest,
      actionIdentity: digest,
      runtimeIdentity: digest,
      toolPolicyIdentity: digest,
    },
    attestor: {
      ownerId: 11,
      repositoryId: 22,
      workflowId: 33,
      sourceCommitSha: 'b'.repeat(40),
      signerDigest: 'c'.repeat(40),
      runId: 44,
      runAttempt: 1,
    },
    phases: [
      {
        phase: 'cold',
        obligationIdentity: digest,
        submissionDigest: digest,
        sourceEvidenceDigest: digest,
        status: 'passed',
      },
      {
        phase: 'informed',
        obligationIdentity: digest,
        submissionDigest: digest,
        sourceEvidenceDigest: digest,
        status: 'failed',
      },
    ],
  };
}

test('parser retains the exact v1 review predicate as an untrusted claim', () => {
  const parsed = parseUntrustedReviewPredicate(predicateFixture());
  expect(parsed.kind).toBe('tool-wiki-review');
  expect(parsed.phases.map((phase) => phase.phase)).toEqual(['cold', 'informed']);
});

test.each([
  ['attempt', { attempt: Number.MAX_SAFE_INTEGER + 1 }],
  ...(['ownerId', 'repositoryId', 'workflowId', 'runId', 'runAttempt'] as const).map(
    (field) =>
      [
        field,
        { attestor: { ...predicateFixture().attestor, [field]: Number.MAX_SAFE_INTEGER + 1 } },
      ] as const,
  ),
])('parser refuses unsafe integer %s', (_, changed) => {
  expect(() => parseUntrustedReviewPredicate({ ...predicateFixture(), ...changed })).toThrow();
});

test('registered-review join refuses a different protected manifest identity after real verification', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const expected = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, expected);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(() =>
      assertRegisteredReviewClaim(observation, {
        registration: { ...expected, manifestIdentity: 'b'.repeat(64) },
        receiptAudience: expected.receiptAudience,
        selectionIdentity: expected.selectionIdentity,
      }),
    ).toThrow('review predicate differs from protected registration');
  } finally {
    signing.dispose();
  }
});

test('registered-review join refuses a verifier observation digest inconsistent with its signed claim', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const expected = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, expected);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(() =>
      assertRegisteredReviewClaim(
        { ...observation, manifestDigest: 'b'.repeat(64) },
        {
          registration: expected,
          receiptAudience: expected.receiptAudience,
          selectionIdentity: expected.selectionIdentity,
        },
      ),
    ).toThrow('review predicate differs from protected registration');
  } finally {
    signing.dispose();
  }
});

test.each([
  ['missing output record', null, 'review verifier observation malformed'],
  ['missing verification record', {}, 'review verifier observation malformed'],
  ['missing statement', { verificationResult: {} }, 'review verifier statement malformed'],
] as const)('registered-review join refuses %s', async (_, untrustedCliOutput, reason) => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const expected = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, expected);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(() =>
      assertRegisteredReviewClaim(
        { ...observation, untrustedCliOutput },
        {
          registration: expected,
          receiptAudience: expected.receiptAudience,
          selectionIdentity: expected.selectionIdentity,
        },
      ),
    ).toThrow(reason);
  } finally {
    signing.dispose();
  }
});

test.each([
  ['owner ID', { ownerId: 99 }],
  ['repository ID', { repositoryId: 99 }],
  ['run URI', { runUri: 'https://github.com/test-owner/test-repo/actions/runs/99/attempts/1' }],
] as const)(
  'real gh accepts a reissued %s certificate but application join refuses it',
  async (_, options) => {
    const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
    const predicate = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
    const signing = createTestOwnedReviewAttestation(manifest, predicate, options);
    try {
      const observation = await verifyTestOwnedAttestation(signing);
      expect(() => {
        assertReviewCertificateClaim(observation, {
          repository: 'test-owner/test-repo',
          certIdentity:
            'https://github.com/test-owner/test-repo/.github/workflows/review.yml@refs/heads/main',
          issuer: 'https://token.actions.githubusercontent.com',
          signerDigest: 'c'.repeat(40),
          sourceDigest: 'b'.repeat(40),
          sourceRef: 'refs/heads/main',
          ownerId: 11,
          repositoryId: 22,
        });
      }).toThrow('review certificate differs from protected review');
    } finally {
      signing.dispose();
    }
  },
);

test('application certificate join accepts exact test-owned verified claims as a structural check', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const predicate = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, predicate);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(() => {
      assertReviewCertificateClaim(observation, {
        repository: 'test-owner/test-repo',
        certIdentity: signing.signer,
        issuer: 'https://token.actions.githubusercontent.com',
        signerDigest: signing.signerDigest,
        sourceDigest: signing.sourceCommitSha,
        sourceRef: 'refs/heads/main',
        ownerId: 11,
        repositoryId: 22,
      });
    }).not.toThrow();
  } finally {
    signing.dispose();
  }
});

test('certificate join reads the signed statement instead of a caller-supplied attestor', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const predicate = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, predicate);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    const output = structuredClone(observation.untrustedCliOutput) as {
      verificationResult: { statement: { predicate: { attestor: { runId: number } } } };
    };
    output.verificationResult.statement.predicate.attestor.runId = 99;
    expect(() => {
      assertReviewCertificateClaim(
        { ...observation, untrustedCliOutput: output },
        {
          repository: 'test-owner/test-repo',
          certIdentity: signing.signer,
          issuer: 'https://token.actions.githubusercontent.com',
          signerDigest: signing.signerDigest,
          sourceDigest: signing.sourceCommitSha,
          sourceRef: 'refs/heads/main',
          ownerId: 11,
          repositoryId: 22,
        },
      );
    }).toThrow('review certificate differs from protected review');
  } finally {
    signing.dispose();
  }
});

test.each([
  ['missing output', 'output', 'review verifier observation malformed'],
  ['missing verification', 'verification', 'review verifier observation malformed'],
  ['missing statement', 'statement', 'review verifier statement malformed'],
  ['missing signature', 'signature', 'review verifier certificate malformed'],
  ['missing certificate', 'certificate', 'review verifier certificate malformed'],
] as const)('application certificate join refuses %s', async (_, fault, reason) => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const predicate = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, predicate);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    const verified = observation.untrustedCliOutput as {
      verificationResult: { statement: unknown };
    };
    const untrustedCliOutput =
      fault === 'output'
        ? null
        : fault === 'verification'
          ? {}
          : fault === 'statement'
            ? { verificationResult: {} }
            : fault === 'signature'
              ? { verificationResult: { statement: verified.verificationResult.statement } }
              : {
                  verificationResult: {
                    statement: verified.verificationResult.statement,
                    signature: {},
                  },
                };
    expect(() => {
      assertReviewCertificateClaim(
        { ...observation, untrustedCliOutput },
        {
          repository: 'test-owner/test-repo',
          certIdentity: signing.signer,
          issuer: 'https://token.actions.githubusercontent.com',
          signerDigest: signing.signerDigest,
          sourceDigest: signing.sourceCommitSha,
          sourceRef: 'refs/heads/main',
          ownerId: 11,
          repositoryId: 22,
        },
      );
    }).toThrow(reason);
  } finally {
    signing.dispose();
  }
});

test('application certificate join refuses a malformed protected repository', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const predicate = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, predicate);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(() => {
      assertReviewCertificateClaim(observation, {
        repository: 'test-owner',
        certIdentity: signing.signer,
        issuer: 'https://token.actions.githubusercontent.com',
        signerDigest: signing.signerDigest,
        sourceDigest: signing.sourceCommitSha,
        sourceRef: 'refs/heads/main',
        ownerId: 11,
        repositoryId: 22,
      });
    }).toThrow('review protected repository malformed');
  } finally {
    signing.dispose();
  }
});

test.each([
  'subjectAlternativeName',
  'issuer',
  'buildSignerURI',
  'buildSignerDigest',
  'sourceRepositoryURI',
  'sourceRepositoryDigest',
  'sourceRepositoryRef',
  'sourceRepositoryIdentifier',
  'sourceRepositoryOwnerURI',
  'sourceRepositoryOwnerIdentifier',
  'runnerEnvironment',
  'buildConfigURI',
  'buildConfigDigest',
  'buildTrigger',
  'runInvocationURI',
] as const)('application certificate join refuses altered verifier field %s', async (field) => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const predicate = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
  const signing = createTestOwnedReviewAttestation(manifest, predicate);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    const output = structuredClone(observation.untrustedCliOutput) as {
      verificationResult: { signature: { certificate: Record<string, unknown> } };
    };
    output.verificationResult.signature.certificate[field] = 'foreign-claim';
    expect(() => {
      assertReviewCertificateClaim(
        { ...observation, untrustedCliOutput: output },
        {
          repository: 'test-owner/test-repo',
          certIdentity: signing.signer,
          issuer: 'https://token.actions.githubusercontent.com',
          signerDigest: signing.signerDigest,
          sourceDigest: signing.sourceCommitSha,
          sourceRef: 'refs/heads/main',
          ownerId: 11,
          repositoryId: 22,
        },
      );
    }).toThrow('review certificate differs from protected review');
  } finally {
    signing.dispose();
  }
});

test.each([
  ['ownerId', 99],
  ['repositoryId', 99],
  ['sourceCommitSha', 'd'.repeat(40)],
  ['signerDigest', 'd'.repeat(40)],
] as const)('application certificate join refuses re-signed attestor %s', async (field, value) => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const predicate = {
    ...predicateFixture(),
    manifestIdentity: hashBytes(manifest),
    attestor: { ...predicateFixture().attestor, [field]: value },
  };
  const signing = createTestOwnedReviewAttestation(manifest, predicate);
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(() => {
      assertReviewCertificateClaim(observation, {
        repository: 'test-owner/test-repo',
        certIdentity: signing.signer,
        issuer: 'https://token.actions.githubusercontent.com',
        signerDigest: signing.signerDigest,
        sourceDigest: signing.sourceCommitSha,
        sourceRef: 'refs/heads/main',
        ownerId: 11,
        repositoryId: 22,
      });
    }).toThrow('review certificate differs from protected review');
  } finally {
    signing.dispose();
  }
});

test.each([
  ['outer', { unexpected: true }],
  ['execution', { execution: { ...predicateFixture().execution, unexpected: true } }],
  ['attestor', { attestor: { ...predicateFixture().attestor, unexpected: true } }],
  [
    'phase',
    {
      phases: [{ ...predicateFixture().phases[0], unexpected: true }, predicateFixture().phases[1]],
    },
  ],
])('parser refuses unknown %s predicate field', (_, changed) => {
  expect(() => parseUntrustedReviewPredicate({ ...predicateFixture(), ...changed })).toThrow();
});

test.each([
  ['empty', []],
  ['reversed', [predicateFixture().phases[1], predicateFixture().phases[0]]],
  ['lone passing cold', [predicateFixture().phases[0]]],
  [
    'informed after failed cold',
    [{ ...predicateFixture().phases[0], status: 'failed' }, predicateFixture().phases[1]],
  ],
])('parser refuses %s phase sequence', (_, phases) => {
  expect(() => parseUntrustedReviewPredicate({ ...predicateFixture(), phases })).toThrow();
});

test.each([
  'schemaVersion',
  'kind',
  'descriptorIdentity',
  'manifestIdentity',
  'receiptAudience',
  'journalIssuerId',
  'journalId',
  'effectKey',
  'payloadDigest',
  'requestIdentity',
  'reviewId',
  'attempt',
  'invocationId',
  'selectionIdentity',
  'execution',
  'attestor',
  'phases',
])('parser refuses absent outer predicate field %s', (field) => {
  const predicate = predicateFixture();
  Reflect.deleteProperty(predicate, field);
  expect(() => parseUntrustedReviewPredicate(predicate)).toThrow();
});

test.each([
  'executorId',
  'modelId',
  'protocolIdentity',
  'promptIdentity',
  'programIdentity',
  'actionIdentity',
  'runtimeIdentity',
  'toolPolicyIdentity',
])('parser refuses absent execution field %s', (field) => {
  const predicate = predicateFixture();
  Reflect.deleteProperty(predicate.execution, field);
  expect(() => parseUntrustedReviewPredicate(predicate)).toThrow();
});

test.each([
  'ownerId',
  'repositoryId',
  'workflowId',
  'sourceCommitSha',
  'signerDigest',
  'runId',
  'runAttempt',
])('parser refuses absent attestor field %s', (field) => {
  const predicate = predicateFixture();
  Reflect.deleteProperty(predicate.attestor, field);
  expect(() => parseUntrustedReviewPredicate(predicate)).toThrow();
});

test.each(['phase', 'obligationIdentity', 'submissionDigest', 'sourceEvidenceDigest', 'status'])(
  'parser refuses absent phase field %s',
  (field) => {
    const predicate = predicateFixture();
    Reflect.deleteProperty(predicate.phases[0], field);
    expect(() => parseUntrustedReviewPredicate(predicate)).toThrow();
  },
);

test('parser requires the informed phase status even after a passing cold phase', () => {
  const predicate = predicateFixture();
  Reflect.deleteProperty(predicate.phases[1], 'status');
  expect(() => parseUntrustedReviewPredicate(predicate)).toThrow();
});

test('test-owned signed DSSE and RFC3161 bundle passes the real pinned offline gh process', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const signing = createTestOwnedReviewAttestation(manifest, {
    ...predicateFixture(),
    manifestIdentity: hashBytes(manifest),
  });
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    const output = observation.untrustedCliOutput as {
      verificationResult: {
        statement: { predicate: unknown };
        signature: { certificate: { runInvocationURI: string } };
      };
    };
    expect(
      parseUntrustedReviewPredicate(output.verificationResult.statement.predicate).manifestIdentity,
    ).toBe(hashBytes(manifest));
    expect(output.verificationResult.signature.certificate.runInvocationURI).toBe(
      'https://github.com/test-owner/test-repo/actions/runs/44/attempts/1',
    );
  } finally {
    signing.dispose();
  }
});

async function expectProcessRefusal(pending: Promise<unknown>): Promise<void> {
  let failure: unknown;
  try {
    await pending;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error)
    expect(failure.message).toContain('review verifier process refused');
}

function corruptBase64(encoded: string): string {
  const bytes = Buffer.from(encoded, 'base64');
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
  return bytes.toString('base64');
}

test.each(['signature', 'leaf', 'timestamp'] as const)(
  'real offline gh refuses a test-owned bundle with a corrupted %s',
  async (fault) => {
    const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
    const signing = createTestOwnedReviewAttestation(manifest, {
      ...predicateFixture(),
      manifestIdentity: hashBytes(manifest),
    });
    try {
      const bundle = JSON.parse(signing.bundleBytes) as {
        dsseEnvelope: { signatures: { sig: string }[] };
        verificationMaterial: {
          certificate: { rawBytes: string };
          timestampVerificationData: { rfc3161Timestamps: { signedTimestamp: string }[] };
        };
      };
      if (fault === 'signature')
        bundle.dsseEnvelope.signatures[0].sig = corruptBase64(
          bundle.dsseEnvelope.signatures[0].sig,
        );
      if (fault === 'leaf')
        bundle.verificationMaterial.certificate.rawBytes = corruptBase64(
          bundle.verificationMaterial.certificate.rawBytes,
        );
      if (fault === 'timestamp')
        bundle.verificationMaterial.timestampVerificationData.rfc3161Timestamps[0].signedTimestamp =
          corruptBase64(
            bundle.verificationMaterial.timestampVerificationData.rfc3161Timestamps[0]
              .signedTimestamp,
          );
      await expectProcessRefusal(verifyTestOwnedAttestation(signing, JSON.stringify(bundle)));
    } finally {
      signing.dispose();
    }
  },
);

test.each(['CA', 'TSA'] as const)(
  'real offline gh refuses a test-owned bundle with a foreign %s trust pin',
  async (fault) => {
    const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
    const signing = createTestOwnedReviewAttestation(manifest, {
      ...predicateFixture(),
      manifestIdentity: hashBytes(manifest),
    });
    const foreign = createTestOwnedReviewAttestation(manifest, {
      ...predicateFixture(),
      manifestIdentity: hashBytes(manifest),
    });
    try {
      const root = JSON.parse(readFileSync(signing.trustedRootPath, 'utf8')) as {
        certificateAuthorities: { certChain: { certificates: { rawBytes: string }[] } }[];
        timestampAuthorities: { certChain: { certificates: { rawBytes: string }[] } }[];
      };
      const foreignRoot = JSON.parse(readFileSync(foreign.trustedRootPath, 'utf8')) as typeof root;
      const pinned =
        fault === 'CA'
          ? root.certificateAuthorities[0]?.certChain.certificates[0]
          : root.timestampAuthorities[0]?.certChain.certificates[0];
      const other =
        fault === 'CA'
          ? foreignRoot.certificateAuthorities[0]?.certChain.certificates[0]
          : foreignRoot.timestampAuthorities[0]?.certChain.certificates[0];
      pinned.rawBytes = other.rawBytes;
      writeFileSync(signing.trustedRootPath, `${JSON.stringify(root)}\n`);
      await expectProcessRefusal(verifyTestOwnedAttestation(signing));
    } finally {
      signing.dispose();
      foreign.dispose();
    }
  },
);

test.each([
  [
    'SAN',
    { signer: 'https://github.com/foreign/repo/.github/workflows/review.yml@refs/heads/main' },
  ],
  ['issuer', { issuer: 'https://foreign.example' }],
  ['signer digest', { signerDigest: 'd'.repeat(40) }],
  ['source digest', { sourceCommitSha: 'd'.repeat(40) }],
  ['source ref', { sourceRef: 'refs/heads/foreign' }],
  ['runner', { runnerEnvironment: 'self-hosted' }],
] as const)(
  'real offline gh refuses a validly signed foreign %s certificate claim',
  async (_, options) => {
    const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
    const signing = createTestOwnedReviewAttestation(
      manifest,
      {
        ...predicateFixture(),
        manifestIdentity: hashBytes(manifest),
      },
      options,
    );
    try {
      await expectProcessRefusal(verifyTestOwnedAttestation(signing));
    } finally {
      signing.dispose();
    }
  },
);

test('real gh accepts a re-signed wrong predicate while the registered-review join refuses it', async () => {
  const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
  const expected = predicateFixture();
  const signing = createTestOwnedReviewAttestation(manifest, {
    ...expected,
    manifestIdentity: hashBytes(manifest),
    reviewId: 'foreign-review',
  });
  try {
    const observation = await verifyTestOwnedAttestation(signing);
    expect(observation.manifestDigest).toBe(hashBytes(manifest));
    expect(() =>
      assertRegisteredReviewClaim(observation, {
        registration: { ...expected, manifestIdentity: hashBytes(manifest) },
        receiptAudience: expected.receiptAudience,
        selectionIdentity: expected.selectionIdentity,
      }),
    ).toThrow('review predicate differs from protected registration');
  } finally {
    signing.dispose();
  }
});

test.each([
  ['descriptorIdentity', 'b'.repeat(64)],
  ['manifestIdentity', 'b'.repeat(64)],
  ['journalIssuerId', 'foreign-issuer'],
  ['journalId', 'foreign-journal'],
  ['effectKey', 'b'.repeat(64)],
  ['payloadDigest', 'b'.repeat(64)],
  ['requestIdentity', 'b'.repeat(64)],
  ['reviewId', 'foreign-review'],
  ['attempt', 1],
  ['invocationId', 'foreign-invocation'],
  ['receiptAudience', 'foreign-audience'],
  ['selectionIdentity', 'b'.repeat(64)],
] as const)(
  'registered-review join refuses re-signed %s with real gh success',
  async (field, value) => {
    const manifest = Buffer.from('{"kind":"test-owned-manifest"}');
    const expected = { ...predicateFixture(), manifestIdentity: hashBytes(manifest) };
    const signing = createTestOwnedReviewAttestation(manifest, { ...expected, [field]: value });
    try {
      const observation = await verifyTestOwnedAttestation(signing);
      expect(observation.manifestDigest).toBe(hashBytes(manifest));
      expect(() =>
        assertRegisteredReviewClaim(observation, {
          registration: expected,
          receiptAudience: expected.receiptAudience,
          selectionIdentity: expected.selectionIdentity,
        }),
      ).toThrow('review predicate differs from protected registration');
    } finally {
      signing.dispose();
    }
  },
);

function workflowMetadataFixture() {
  return {
    run: {
      id: 44,
      run_attempt: 1,
      workflow_id: 33,
      head_sha: 'b'.repeat(40),
      repository: { id: 22, owner: { id: 11 } },
    },
    workflow: { id: 33, path: '.github/workflows/review.yml' },
  };
}

test('untrusted Actions projections structurally match the signed run and protected workflow', () => {
  const metadata = workflowMetadataFixture();
  expect(() => {
    assertUntrustedReviewMetadataProjection(metadata.run, metadata.workflow, {
      attestor: predicateFixture().attestor,
      workflowPath: '.github/workflows/review.yml',
    });
  }).not.toThrow();
});

test.each([
  ['run id', { run: { ...workflowMetadataFixture().run, id: 99 } }],
  ['run attempt', { run: { ...workflowMetadataFixture().run, run_attempt: 2 } }],
  ['run workflow id', { run: { ...workflowMetadataFixture().run, workflow_id: 99 } }],
  ['head SHA', { run: { ...workflowMetadataFixture().run, head_sha: 'd'.repeat(40) } }],
  [
    'repository id',
    { run: { ...workflowMetadataFixture().run, repository: { id: 99, owner: { id: 11 } } } },
  ],
  [
    'owner id',
    { run: { ...workflowMetadataFixture().run, repository: { id: 22, owner: { id: 99 } } } },
  ],
  ['workflow id', { workflow: { id: 99, path: '.github/workflows/review.yml' } }],
  ['workflow path', { workflow: { id: 33, path: '.github/workflows/foreign.yml' } }],
] as const)('untrusted Actions projection refuses foreign %s', (_, change) => {
  const metadata = { ...workflowMetadataFixture(), ...change };
  expect(() => {
    assertUntrustedReviewMetadataProjection(metadata.run, metadata.workflow, {
      attestor: predicateFixture().attestor,
      workflowPath: '.github/workflows/review.yml',
    });
  }).toThrow('review workflow metadata differs from protected run');
});

test.each([
  ['run record', { run: null }],
  ['repository record', { run: { ...workflowMetadataFixture().run, repository: null } }],
  [
    'owner record',
    { run: { ...workflowMetadataFixture().run, repository: { id: 22, owner: null } } },
  ],
  ['workflow record', { workflow: null }],
] as const)('untrusted Actions projection refuses missing %s', (_, change) => {
  const metadata = { ...workflowMetadataFixture(), ...change };
  expect(() => {
    assertUntrustedReviewMetadataProjection(metadata.run, metadata.workflow, {
      attestor: predicateFixture().attestor,
      workflowPath: '.github/workflows/review.yml',
    });
  }).toThrow('review workflow metadata malformed');
});
