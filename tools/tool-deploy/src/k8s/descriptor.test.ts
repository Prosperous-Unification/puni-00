import { describe, expect, it } from 'bun:test';

import {
  assertAdmittedDescriptor,
  assertGateEvidence,
  assertPromotable,
  descriptorSha256,
  type ObservedGateRun,
  parseDescriptor,
  parseReleaseCandidate,
  parseStagingProof,
  type ReleaseCandidate,
  renderDescriptor,
  sealDescriptor,
  type StagingProof,
} from './descriptor';
import { releaseIdOf } from './release';

const sourceSha = 'a'.repeat(40);
const image = (name: string, hex: string): string =>
  `registry.infra.bulletpoints.club/${name}@sha256:${hex.repeat(64)}`;

const candidate: ReleaseCandidate = {
  schemaVersion: 1,
  sourceSha,
  images: {
    backend: image('wbs-be-01', '1'),
    gateway: image('wbs-gw-01', '2'),
    frontend: image('wbs-fe-01', '3'),
    mcp: image('wbs-mcp-01', '4'),
  },
  gateRunId: 42,
};

function admission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceSha,
    package: {
      name: 'twilight-bureaucrat',
      version: '0.1.0',
      integrity: `sha512-${'c'.repeat(86)}==`,
      toolkitIdentity: 'd'.repeat(64),
    },
    activation: { version: 'e'.repeat(40), manifestIdentity: 'f'.repeat(64) },
    ...overrides,
  };
}

function gateRun(overrides: Partial<ObservedGateRun> = {}): ObservedGateRun {
  return {
    id: 42,
    head_sha: sourceSha,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    jobs: [
      { name: 'gate', conclusion: 'success' },
      { name: 'pixels', conclusion: 'success' },
    ],
    ...overrides,
  };
}

function proofFor(descriptorSha: string, images = candidate.images): StagingProof {
  return {
    schemaVersion: 1,
    environment: 'staging',
    descriptorSha256: descriptorSha,
    releaseId: releaseIdOf({ sourceSha, images }),
    cluster: { context: 'staging', uid: 'uid-staging' },
    images,
    completedAt: '2026-09-18T00:00:00.000Z',
  };
}

/** tool-dagger's release.json for `candidate`, plus the MCP entry, as the operator submits it. */
function submitted(overrides: Record<string, unknown> = {}) {
  const entry = (name: string, hex: string) => ({
    sha: sourceSha,
    digest: `sha256:${hex.repeat(64)}`,
    ref: `registry.infra.bulletpoints.club/${name}:${sourceSha}`,
    image: image(name, hex),
  });
  return {
    schemaVersion: 1,
    sourceSha,
    release: {
      be: entry('wbs-be-01', '1'),
      gw: entry('wbs-gw-01', '2'),
      fe: entry('wbs-fe-01', '3'),
      mcp: entry('wbs-mcp-01', '4'),
      ...overrides,
    },
    gateRunId: 42,
  };
}

describe('release candidate', () => {
  it('reads tool-dagger release.json entries built from the source', () => {
    expect(parseReleaseCandidate(submitted())).toEqual(candidate);
  });

  it('refuses a tier built from another commit', () => {
    const other = { ...submitted().release.gw, sha: '9'.repeat(40) };
    expect(() => parseReleaseCandidate(submitted({ gw: other }))).toThrow(
      `release.gw was built from ${'9'.repeat(40)}, not the source`,
    );
  });

  it('refuses a tag-only image or one naming another digest or tier', () => {
    const tagged = { ...submitted().release.gw, image: 'wbs-gw-01:latest' };
    expect(() => parseReleaseCandidate(submitted({ gw: tagged }))).toThrow('release.gw image');
    const swapped = { ...submitted().release.gw, image: image('wbs-fe-01', '2') };
    expect(() => parseReleaseCandidate(submitted({ gw: swapped }))).toThrow('release.gw image');
    const digest = { ...submitted().release.gw, digest: `sha256:${'8'.repeat(64)}` };
    expect(() => parseReleaseCandidate(submitted({ gw: digest }))).toThrow('release.gw image');
  });

  it('refuses a candidate without the MCP tier', () => {
    const { mcp: _mcp, ...three } = submitted().release;
    expect(() => parseReleaseCandidate({ ...submitted(), release: three })).toThrow(
      'must have exactly',
    );
  });

  it('refuses an admission claim smuggled into the candidate', () => {
    expect(() => parseReleaseCandidate({ ...submitted(), admission: admission() })).toThrow(
      'must have exactly',
    );
  });
});

describe('gate evidence', () => {
  it('accepts a successful ci run with passing gate and pixels jobs', () => {
    expect(() => {
      assertGateEvidence(sourceSha, gateRun());
    }).not.toThrow();
  });

  it('refuses gate evidence for another commit', () => {
    expect(() => {
      assertGateEvidence(sourceSha, gateRun({ head_sha: 'b'.repeat(40) }));
    }).toThrow(`run is for ${'b'.repeat(40)}`);
  });

  it('refuses a run whose browser job did not pass', () => {
    const jobs = [
      { name: 'gate', conclusion: 'success' },
      { name: 'pixels', conclusion: 'skipped' },
    ];
    expect(() => {
      assertGateEvidence(sourceSha, gateRun({ jobs }));
    }).toThrow('job pixels is skipped');
  });

  it('refuses a pull_request gate run', () => {
    expect(() => {
      assertGateEvidence(sourceSha, gateRun({ event: 'pull_request', head_branch: 'feature' }));
    }).toThrow('run is a pull_request on feature, not a push to main');
  });

  it('refuses a run of some other workflow', () => {
    expect(() => {
      assertGateEvidence(sourceSha, gateRun({ path: '.github/workflows/infra-check.yml' }));
    }).toThrow('workflow is .github/workflows/infra-check.yml');
  });
});

describe('sealing', () => {
  it('joins every tier digest to the trusted admission identities', () => {
    const descriptor = sealDescriptor(candidate, admission(), gateRun());
    expect(descriptor.admission.activation.version).toBe('e'.repeat(40));
    expect(parseDescriptor(JSON.parse(renderDescriptor(descriptor)))).toEqual(descriptor);
    expect(descriptorSha256(parseDescriptor(JSON.parse(renderDescriptor(descriptor))))).toBe(
      descriptorSha256(descriptor),
    );
  });

  it('refuses an admission record for another commit (failed admission blocks)', () => {
    expect(() =>
      sealDescriptor(candidate, admission({ sourceSha: '9'.repeat(40) }), gateRun()),
    ).toThrow('admission certified 9999');
  });

  it('refuses a launcher report in place of the admission record', () => {
    expect(() =>
      sealDescriptor(candidate, { certified: true, revision: sourceSha }, gateRun()),
    ).toThrow('lacks the source, package or activation identity');
  });

  it('refuses a failed gate', () => {
    expect(() =>
      sealDescriptor(candidate, admission(), gateRun({ conclusion: 'failure' })),
    ).toThrow('run is completed/failure');
  });
});

describe('deploy-time admission and promotion', () => {
  const descriptor = sealDescriptor(candidate, admission(), gateRun());

  it('accepts a fresh admission with the same identities', () => {
    expect(() => {
      assertAdmittedDescriptor(descriptor, admission());
    }).not.toThrow();
  });

  it('refuses a fresh admission from another activation', () => {
    const other = admission({
      activation: { version: '7'.repeat(40), manifestIdentity: 'f'.repeat(64) },
    });
    expect(() => {
      assertAdmittedDescriptor(descriptor, other);
    }).toThrow('admission activation');
  });

  it('promotes the exact descriptor staging proved', () => {
    expect(() => {
      assertPromotable(descriptor, proofFor(descriptorSha256(descriptor)));
    }).not.toThrow();
  });

  it('refuses a production digest staging did not prove', () => {
    const rebuilt = { ...candidate.images, frontend: image('wbs-fe-01', '9') };
    expect(() => {
      assertPromotable(descriptor, proofFor(descriptorSha256(descriptor), rebuilt));
    }).toThrow('different digests for frontend');
  });

  it('refuses a descriptor other than the one staging promoted', () => {
    expect(() => {
      assertPromotable(descriptor, proofFor('0'.repeat(64)));
    }).toThrow(`staging proved descriptor ${'0'.repeat(64)}`);
  });

  it('parses a staging proof and refuses a malformed one', () => {
    const proof = proofFor(descriptorSha256(descriptor));
    expect(parseStagingProof(JSON.parse(JSON.stringify(proof)))).toEqual(proof);
    expect(() => parseStagingProof({ ...proof, environment: 'prod' })).toThrow('malformed');
  });
});
