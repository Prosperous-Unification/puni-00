import { describe, expect, it } from 'bun:test';

import {
  assertDeploymentVerification,
  assertReleaseImages,
  type DeploymentVerification,
  type ReleaseImage,
  type VerificationCheck,
  type VerificationOutcome,
  type VerificationPolicy,
} from './provenance';

const policy: VerificationPolicy = {
  source: { repository: 'example/project', revision: 'revision-42', ref: 'refs/heads/stable' },
  pipeline: 'release-checks',
  checks: ['compile', 'browser'],
};

function checkOrigin(
  checkId: string,
  patch: Partial<VerificationCheck['origin']> = {},
): VerificationCheck['origin'] {
  return { executionId: 'execution-9', attempt: 2, checkId, ...patch };
}

function verification(patch: Partial<DeploymentVerification> = {}): DeploymentVerification {
  return {
    source: { ...policy.source },
    pipeline: 'release-checks',
    trigger: 'source-update',
    completed: true,
    outcome: 'passed',
    checks: [
      { name: 'compile', origin: checkOrigin('compile'), completed: true, outcome: 'passed' },
      { name: 'browser', origin: checkOrigin('browser'), completed: true, outcome: 'passed' },
    ],
    origin: {
      provider: 'forge-one',
      executionId: 'execution-9',
      attempt: 2,
      url: 'https://forge.test/9',
    },
    ...patch,
  };
}

const nonpassing: readonly VerificationOutcome[] = ['failed', 'cancelled', 'skipped', 'unknown'];

describe('assertDeploymentVerification', () => {
  for (const provider of ['forge-one', 'another-provider']) {
    it(`accepts equivalent passing evidence from ${provider}`, () => {
      const observed = verification();
      expect(() => {
        assertDeploymentVerification(policy, {
          ...observed,
          origin: { ...observed.origin, provider },
        });
      }).not.toThrow();
    });
  }

  for (const field of ['repository', 'revision', 'ref'] as const) {
    it(`refuses another source ${field}`, () => {
      expect(() => {
        assertDeploymentVerification(
          policy,
          verification({
            source: { ...policy.source, [field]: 'unrelated' },
          }),
        );
      }).toThrow();
    });
  }

  it('refuses an absent source reference', () => {
    expect(() => {
      assertDeploymentVerification(
        policy,
        verification({
          source: { ...policy.source, ref: null },
        }),
      );
    }).toThrow();
  });

  it('refuses another pipeline', () => {
    expect(() => {
      assertDeploymentVerification(policy, verification({ pipeline: 'other' }));
    }).toThrow();
  });

  for (const trigger of ['change-request', 'other'] as const) {
    it(`refuses ${trigger} evidence`, () => {
      expect(() => {
        assertDeploymentVerification(policy, verification({ trigger }));
      }).toThrow();
    });
  }

  it('refuses an incomplete execution even with a passed outcome', () => {
    expect(() => {
      assertDeploymentVerification(policy, verification({ completed: false }));
    }).toThrow();
  });

  for (const outcome of nonpassing) {
    it(`refuses a ${outcome} execution`, () => {
      expect(() => {
        assertDeploymentVerification(policy, verification({ outcome }));
      }).toThrow();
    });
    it(`refuses a ${outcome} required check`, () => {
      expect(() => {
        assertDeploymentVerification(
          policy,
          verification({
            checks: [
              {
                name: 'compile',
                origin: checkOrigin('compile'),
                completed: true,
                outcome: 'passed',
              },
              { name: 'browser', origin: checkOrigin('browser'), completed: true, outcome },
            ],
          }),
        );
      }).toThrow();
    });
  }

  it('refuses a missing required check', () => {
    expect(() => {
      assertDeploymentVerification(
        policy,
        verification({
          checks: [
            { name: 'compile', origin: checkOrigin('compile'), completed: true, outcome: 'passed' },
          ],
        }),
      );
    }).toThrow();
  });

  it('refuses duplicate required checks even when both pass', () => {
    const observed = verification();
    expect(() => {
      assertDeploymentVerification(policy, {
        ...observed,
        checks: [
          ...observed.checks,
          { name: 'browser', origin: checkOrigin('browser'), completed: true, outcome: 'passed' },
        ],
      });
    }).toThrow();
  });

  it('refuses an incomplete required check even with a passed outcome', () => {
    expect(() => {
      assertDeploymentVerification(
        policy,
        verification({
          checks: [
            { name: 'compile', origin: checkOrigin('compile'), completed: true, outcome: 'passed' },
            {
              name: 'browser',
              origin: checkOrigin('browser'),
              completed: false,
              outcome: 'passed',
            },
          ],
        }),
      );
    }).toThrow();
  });

  for (const checks of [[], [''], [' '], ['compile', 'compile']]) {
    it(`refuses invalid required-check policy ${JSON.stringify(checks)}`, () => {
      expect(() => {
        assertDeploymentVerification(
          { ...policy, checks },
          verification({
            checks: [...new Set(checks)].map((name) => ({
              name,
              origin: checkOrigin('policy-check'),
              completed: true,
              outcome: 'passed',
            })),
          }),
        );
      }).toThrow();
    });
  }

  for (const field of ['provider', 'executionId', 'url'] as const) {
    for (const value of ['', ' ']) {
      it(`refuses blank origin ${field} ${JSON.stringify(value)}`, () => {
        const observed = verification();
        expect(() => {
          assertDeploymentVerification(policy, {
            ...observed,
            origin: { ...observed.origin, [field]: value },
            checks: observed.checks.map((check) => ({
              ...check,
              origin: {
                ...check.origin,
                executionId: field === 'executionId' ? value : check.origin.executionId,
              },
            })),
          });
        }).toThrow();
      });
    }
  }

  for (const attempt of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    it(`refuses invalid attempt ${String(attempt)}`, () => {
      const observed = verification();
      expect(() => {
        assertDeploymentVerification(policy, {
          ...observed,
          origin: { ...observed.origin, attempt },
          checks: observed.checks.map((check) => ({
            ...check,
            origin: { ...check.origin, attempt: 1 },
          })),
        });
      }).toThrow();
    });
  }

  it('accepts an explicitly carried passing check from an earlier attempt', () => {
    expect(() => {
      assertDeploymentVerification(
        policy,
        verification({
          checks: [
            {
              name: 'compile',
              completed: true,
              outcome: 'passed',
              origin: checkOrigin('compile-1', { attempt: 1 }),
            },
            {
              name: 'browser',
              completed: true,
              outcome: 'passed',
              origin: checkOrigin('browser-2'),
            },
          ],
        }),
      );
    }).not.toThrow();
  });

  for (const checkId of ['', ' ']) {
    it(`refuses a blank required check identity ${JSON.stringify(checkId)}`, () => {
      expect(() => {
        assertDeploymentVerification(
          policy,
          verification({
            checks: [
              { name: 'compile', completed: true, outcome: 'passed', origin: checkOrigin(checkId) },
              {
                name: 'browser',
                completed: true,
                outcome: 'passed',
                origin: checkOrigin('browser'),
              },
            ],
          }),
        );
      }).toThrow();
    });
  }

  it('refuses a required check from another execution', () => {
    expect(() => {
      assertDeploymentVerification(
        policy,
        verification({
          checks: [
            {
              name: 'compile',
              completed: true,
              outcome: 'passed',
              origin: checkOrigin('compile', { executionId: 'execution-8' }),
            },
            { name: 'browser', completed: true, outcome: 'passed', origin: checkOrigin('browser') },
          ],
        }),
      );
    }).toThrow();
  });

  for (const attempt of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    3,
  ]) {
    it(`refuses an invalid required check attempt ${String(attempt)}`, () => {
      expect(() => {
        assertDeploymentVerification(
          policy,
          verification({
            checks: [
              {
                name: 'compile',
                completed: true,
                outcome: 'passed',
                origin: checkOrigin('compile', { attempt }),
              },
              {
                name: 'browser',
                completed: true,
                outcome: 'passed',
                origin: checkOrigin('browser'),
              },
            ],
          }),
        );
      }).toThrow();
    });
  }

  it('allows unrelated checks without weakening required checks', () => {
    const observed = verification();
    expect(() => {
      assertDeploymentVerification(policy, {
        ...observed,
        checks: [
          ...observed.checks,
          {
            name: 'optional',
            origin: checkOrigin('optional'),
            completed: false,
            outcome: 'skipped',
          },
        ],
      });
    }).not.toThrow();
  });
});

const digest = `sha256:${'a'.repeat(64)}`;
const repositories = { backend: 'service-api', frontend: 'service-ui' };

function image(patch: Partial<ReleaseImage> = {}): ReleaseImage {
  return {
    role: 'backend',
    revision: 'revision-42',
    digest,
    reference: `registry.test/team/service-api@${digest}`,
    taggedReference: 'registry.test/team/service-api:revision-42',
    ...patch,
  };
}

describe('assertReleaseImages', () => {
  it('accepts all selected digest-bound roles with namespace prefixes', () => {
    expect(() => {
      assertReleaseImages(
        'revision-42',
        [
          image(),
          image({
            role: 'frontend',
            reference: `registry.test:5000/team/nested/service-ui@${digest}`,
            taggedReference: 'registry.test:5000/team/nested/service-ui:revision-42',
          }),
        ],
        repositories,
      );
    }).not.toThrow();
  });

  it('accepts an unqualified repository under a registry', () => {
    expect(() => {
      assertReleaseImages(
        'revision-42',
        [
          image({
            reference: `localhost:5000/service-api@${digest}`,
            taggedReference: 'localhost:5000/service-api:revision-42',
          }),
        ],
        repositories,
      );
    }).not.toThrow();
  });

  it('refuses an empty selected image list', () => {
    expect(() => {
      assertReleaseImages('revision-42', [], repositories);
    }).toThrow();
  });

  for (const revision of ['', ' ']) {
    it(`refuses a blank expected revision ${JSON.stringify(revision)}`, () => {
      expect(() => {
        assertReleaseImages(
          revision,
          [image({ revision, taggedReference: `registry.test/team/service-api:${revision}` })],
          repositories,
        );
      }).toThrow();
    });
  }

  it('refuses duplicate roles', () => {
    expect(() => {
      assertReleaseImages('revision-42', [image(), image()], repositories);
    }).toThrow();
  });

  it('refuses another image revision', () => {
    expect(() => {
      assertReleaseImages('revision-42', [image({ revision: 'revision-41' })], repositories);
    }).toThrow();
  });

  for (const role of ['unknown', 'toString', '__proto__']) {
    it(`refuses a role without an own repository policy: ${role}`, () => {
      expect(() => {
        assertReleaseImages('revision-42', [image({ role })], repositories);
      }).toThrow();
    });
  }

  it('refuses an inherited repository policy even when its basename matches', () => {
    const inherited = Object.create({ backend: 'service-api' }) as Record<string, string>;
    expect(() => {
      assertReleaseImages('revision-42', [image()], inherited);
    }).toThrow();
  });

  it('refuses an empty role repository policy', () => {
    expect(() => {
      assertReleaseImages('revision-42', [image()], { backend: '' });
    }).toThrow();
  });

  for (const reference of [
    'registry.test/team/service-api:revision-42',
    `service-api@${digest}`,
    `https://registry.test/service-api@${digest}`,
    `user:password@registry.test/service-api@${digest}`,
    `registry.test//service-api@${digest}`,
    `registry.test/team/../service-api@${digest}`,
    `registry.test/team/service-api@sha256:${'A'.repeat(64)}`,
    `registry.test/team/service-api@sha256:${'a'.repeat(63)}`,
    `registry.test/team/service-api@sha512:${'a'.repeat(64)}`,
    `registry.test/team/service-api@${digest}\n`,
  ]) {
    it(`refuses malformed digest reference ${JSON.stringify(reference)}`, () => {
      expect(() => {
        assertReleaseImages('revision-42', [image({ reference })], repositories);
      }).toThrow();
    });
  }

  it('refuses a malformed digest even when all claim fields agree', () => {
    expect(() => {
      assertReleaseImages(
        'revision-42',
        [
          image({
            digest: 'sha256:abc',
            reference: 'registry.test/team/service-api@sha256:abc',
          }),
        ],
        repositories,
      );
    }).toThrow();
  });

  it('refuses a digest claim different from the reference', () => {
    expect(() => {
      assertReleaseImages(
        'revision-42',
        [image({ digest: `sha256:${'b'.repeat(64)}` })],
        repositories,
      );
    }).toThrow();
  });

  it('refuses the wrong role repository basename', () => {
    expect(() => {
      assertReleaseImages(
        'revision-42',
        [
          image({
            reference: `registry.test/team/service-ui@${digest}`,
            taggedReference: 'registry.test/team/service-ui:revision-42',
          }),
        ],
        repositories,
      );
    }).toThrow();
  });

  for (const taggedReference of [
    'registry.test/team/service-api:revision-41',
    'other.test/team/service-api:revision-42',
    'registry.test/other/service-api:revision-42',
    `registry.test/team/service-api@${digest}`,
  ]) {
    it(`refuses an inconsistent tagged reference ${taggedReference}`, () => {
      expect(() => {
        assertReleaseImages('revision-42', [image({ taggedReference })], repositories);
      }).toThrow();
    });
  }
});
