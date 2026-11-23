import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { evaluateAudit } from '../review/audit';
import type { LintReportFixture } from '../testing/trusted-policy.test.fixture';
import {
  auditReview,
  candidateIdentityAt,
  cliPath,
  commit,
  createFixture,
  entriesAt,
  exactTuple,
  fromProcess,
  indexSource,
  outputOf,
  rebindAuthority,
  runActivation,
  runCi,
  runGit,
  runLocal,
  satisfyApplication,
  scratchPaths,
  sha256,
  trustedNodeModules,
  trustPath,
  write,
  writeActivation,
  writeAuthority,
  writeEvidence,
  writeTrust,
} from '../testing/trusted-policy.test.fixture';
import { resolveValidatorArtifactPaths } from './trust';

afterEach(() => {
  for (const path of scratchPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe('trusted policy production CLI', () => {
  test.each([
    ['observe', 0, { accepted: true, debtObligationIds: ['obligation.application'] }],
    ['ratchet', 0, { accepted: true, debtObligationIds: ['obligation.application'] }],
    ['enforce', 1, { accepted: false, unmetObligationIds: ['obligation.application'] }],
  ] as const)(
    '%s rollout runs whole-tree checks with its debt disposition',
    // Proof: the former three-invocation aggregate timed out in CI at 5030.53ms;
    // separated production CLI cases completed in 1606.02-1633.68ms on one core.
    async (mode, exitCode, disposition) => {
      const fixture = createFixture(mode);
      const invocation = await runLocal(fixture, mode);
      const output = outputOf(invocation);

      expect(invocation.exitCode, output).toBe(exitCode);
      const report = JSON.parse(invocation.stdout) as LintReportFixture;
      expect(report.deterministicChecks.map((check: { kind: string }) => check.kind)).toEqual([
        'inventory',
        'classification',
        'schema',
        'metadata-links',
        'selector-input-coverage',
      ]);
      expect(report).toMatchObject({ certified: false, ...disposition });
    },
  );

  test('enforce refuses observe evidence even when deterministic checks pass', async () => {
    const fixture = createFixture('enforce', 'observe');
    const invocation = await runLocal(fixture, 'enforce');
    const output = outputOf(invocation);

    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      refusals: { kind: string; reason: string }[];
    };
    expect(report.accepted).toBe(false);
    expect(report.refusals).toContainEqual({
      kind: 'mode',
      reason: 'observe evidence cannot satisfy enforce work',
    });
  });

  test('enforce names a trusted obligation omitted from candidate evidence', async () => {
    const fixture = createFixture('enforce');
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, 'utf8')) as {
      obligations: { obligationId: string }[];
    };
    evidence.obligations = evidence.obligations.filter(
      ({ obligationId }) => obligationId !== 'obligation.application',
    );
    write(fixture.evidencePath, `${JSON.stringify(evidence)}\n`);

    const invocation = await runLocal(fixture, 'enforce');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      unmetObligationIds: ['obligation.application'],
      refusals: [
        {
          kind: 'obligation',
          obligationId: 'obligation.application',
          reason: 'selected policy obligation is unmet',
        },
      ],
    });
  });

  test('ratchet refuses an exact-tuple regression in an adopted non-authority boundary', async () => {
    const fixture = createFixture('ratchet');
    write(join(fixture.repository, 'src/app.ts'), 'export const value = 2;\n');
    fixture.revision = commit(fixture.repository, 'change adopted application tuple');

    const invocation = await runLocal(fixture, 'ratchet');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      changedBoundaryIds: ['boundary.application'],
      unmetObligationIds: ['obligation.application'],
      refusals: [
        {
          kind: 'ratchet',
          boundaryId: 'boundary.application',
          obligationId: 'obligation.application',
          reason: 'changed adopted boundary has an unmet obligation',
        },
      ],
    });
  });

  test('ratchet treats an unmodeled exact path rename as a changed boundary', async () => {
    const fixture = createFixture('ratchet');
    runGit(fixture.repository, ['mv', 'validator.ts', 'renamed-validator.ts']);
    write(
      join(fixture.repository, 'README.md'),
      indexSource(['exemptions.json', 'policy.json', 'renamed-validator.ts', 'src/app.ts']),
    );
    fixture.revision = commit(fixture.repository, 'rename validator without a source selector');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as {
      boundaries: { boundaryId: string; selector: { value: string } }[];
    };
    const validator = policy.boundaries.find(
      ({ boundaryId }) => boundaryId === 'boundary.validator',
    );
    if (validator === undefined) throw new Error('validator boundary absent');
    validator.selector.value = 'renamed-validator.ts';
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runLocal(fixture, 'ratchet');
    const observed = outputOf(invocation);
    expect(invocation.exitCode, observed).toBe(1);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      changedBoundaryIds: ['boundary.validator'],
      refusals: [
        {
          kind: 'activation',
          boundaryId: 'boundary.validator',
          reason: 'trusted authority boundary changed without a separate activation',
        },
        {
          kind: 'ratchet',
          boundaryId: 'boundary.validator',
          obligationId: 'obligation.validator',
          reason: 'changed adopted boundary has an unmet obligation',
        },
      ],
    });
  });

  test('refuses a non-pilot source selector with no reviewed source revision', async () => {
    const fixture = createFixture('ratchet');
    runGit(fixture.repository, ['mv', 'validator.ts', 'renamed-validator.ts']);
    write(
      join(fixture.repository, 'README.md'),
      indexSource(['exemptions.json', 'policy.json', 'renamed-validator.ts', 'src/app.ts']),
    );
    fixture.revision = commit(fixture.repository, 'rename validator with an unanchored selector');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as {
      boundaries: {
        boundaryId: string;
        selector: { value: string };
        sourceSelector?: { kind: 'path'; value: string };
      }[];
    };
    const validator = policy.boundaries.find(
      ({ boundaryId }) => boundaryId === 'boundary.validator',
    );
    if (validator === undefined) throw new Error('validator boundary absent');
    validator.selector.value = 'renamed-validator.ts';
    validator.sourceSelector = { kind: 'path', value: 'not-the-baseline.ts' };
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runLocal(fixture, 'ratchet');
    const observed = outputOf(invocation);
    expect(invocation.exitCode, observed).toBe(1);
    expect(observed).toContain(
      'trusted boundary source selector requires pilot policy: boundary.validator',
    );
  });

  test('refuses a non-pilot creation revision with no reviewed source revision', async () => {
    const fixture = createFixture('ratchet');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as {
      boundaries: { boundaryId: string; creationRevision?: string }[];
    };
    const validator = policy.boundaries.find(
      ({ boundaryId }) => boundaryId === 'boundary.validator',
    );
    if (validator === undefined) throw new Error('validator boundary absent');
    validator.creationRevision = fixture.revision;
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runLocal(fixture, 'ratchet');
    const observed = outputOf(invocation);
    expect(invocation.exitCode, observed).toBe(1);
    expect(observed).toContain(
      'trusted boundary creation revision requires pilot policy: boundary.validator',
    );
  });

  test('ratchet refuses a candidate that removes an adopted boundary from its own policy', async () => {
    const fixture = createFixture('ratchet');
    write(join(fixture.repository, 'policy.json'), '{"boundaries":["validator","exemptions"]}\n');
    fixture.revision = commit(fixture.repository, 'remove adopted policy boundary');

    const invocation = await runLocal(fixture, 'ratchet');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      changedBoundaryIds: string[];
      refusals: object[];
    };
    expect(report).toMatchObject({
      accepted: false,
      changedBoundaryIds: ['boundary.policy'],
    });
    expect(report.refusals).toContainEqual({
      kind: 'activation',
      boundaryId: 'boundary.policy',
      reason: 'trusted authority boundary changed without a separate activation',
    });
  });

  test('ratchet refuses a candidate that weakens its own validator', async () => {
    const fixture = createFixture('ratchet');
    write(
      join(fixture.repository, 'validator.ts'),
      'export const accepts = true; // skip checks\n',
    );
    fixture.revision = commit(fixture.repository, 'weaken candidate validator');

    const invocation = await runLocal(fixture, 'ratchet');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      changedBoundaryIds: string[];
      refusals: object[];
    };
    expect(report).toMatchObject({
      accepted: false,
      changedBoundaryIds: ['boundary.validator'],
    });
    expect(report.refusals).toContainEqual({
      kind: 'activation',
      boundaryId: 'boundary.validator',
      reason: 'trusted authority boundary changed without a separate activation',
    });
  });

  test('ratchet refuses a candidate edit to its own exemptions', async () => {
    const fixture = createFixture('ratchet');
    write(join(fixture.repository, 'exemptions.json'), '{"exemptions":["application"]}\n');
    fixture.revision = commit(fixture.repository, 'weaken candidate exemptions');

    const invocation = await runLocal(fixture, 'ratchet');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      changedBoundaryIds: string[];
      refusals: object[];
    };
    expect(report).toMatchObject({
      accepted: false,
      changedBoundaryIds: ['boundary.exemptions'],
    });
    expect(report.refusals).toContainEqual({
      kind: 'activation',
      boundaryId: 'boundary.exemptions',
      reason: 'trusted authority boundary changed without a separate activation',
    });
  });

  test('checks the whole selected tree when a new path is outside the edited authority boundary', async () => {
    const fixture = createFixture('observe');
    write(join(fixture.repository, 'src/unindexed.ts'), 'export const hidden = true;\n');
    fixture.revision = commit(fixture.repository, 'add unindexed source');

    const invocation = await runLocal(fixture, 'observe');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('unindexed candidate path in README.md');
    expect(output).toContain('src/unindexed.ts');
  });

  test('CI uses only its preselected external binding and can certify complete enforce evidence', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      mode: 'enforce',
      trustProvenance: 'ci-preselected',
      certified: true,
      accepted: true,
    });
  });

  test('CI cannot certify changed candidate bytes with unchanged obligation evidence', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    write(join(fixture.repository, 'src/app.ts'), 'export const value = 2;\n');
    fixture.revision = commit(fixture.repository, 'change source after evidence');

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      certified: boolean;
      unmetObligationIds: string[];
    };
    expect(report).toMatchObject({
      accepted: false,
      certified: false,
    });
    expect(report.unmetObligationIds).toContain('obligation.application');
  });

  test('caller labels cannot replace check receipts or trusted review provenance', async () => {
    for (const fault of ['missing-check-receipt', 'local-review'] as const) {
      const fixture = createFixture('enforce');
      satisfyApplication(fixture);
      const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
        checkReceipts: { observationId: string }[];
        audit: {
          reviews: { evidence: { receipt: { receiptId: string; trust: { scope: string } } } }[];
        };
      };
      if (fault === 'missing-check-receipt') {
        authority.checkReceipts = authority.checkReceipts.filter(
          ({ observationId }) => observationId !== 'observation.check.application',
        );
      } else {
        const review = authority.audit.reviews.find(
          ({ evidence }) => evidence.receipt.receiptId === 'receipt.review.application',
        );
        if (review === undefined) throw new Error('application review receipt disappeared');
        review.evidence.receipt.trust.scope = 'local-cooperative';
      }
      write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
      rebindAuthority(fixture);

      const invocation = await runCi(fixture);
      const output = outputOf(invocation);
      expect(invocation.exitCode, `${fault}: ${output}`).toBe(1);
      const report = JSON.parse(invocation.stdout) as {
        accepted: boolean;
        unmetObligationIds: string[];
      };
      expect(report.accepted).toBe(false);
      expect(report.unmetObligationIds).toContain('obligation.application');
    }
  });

  test('self-declared journal and invocation labels cannot certify reviews', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: {
        reviews: {
          obligationId: string;
          evidence: {
            receipt: { invocationId: string; trust: { journalId: string } };
            phaseReceipts: {
              cold: { receipt: { invocationId: string } };
              informed: { receipt: { invocationId: string } };
            };
          };
        }[];
      };
    };
    for (const review of authority.audit.reviews) {
      const invocationId = `invocation.never-executed.${review.obligationId}`;
      review.evidence.receipt.invocationId = invocationId;
      review.evidence.phaseReceipts.cold.receipt.invocationId = invocationId;
      review.evidence.phaseReceipts.informed.receipt.invocationId = invocationId;
      review.evidence.receipt.trust.journalId = 'journal.does-not-exist';
    }
    write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
    rebindAuthority(fixture);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      certified: boolean;
      unmetObligationIds: string[];
    };
    expect(report).toMatchObject({
      accepted: false,
      certified: false,
    });
    expect(report.unmetObligationIds).toContain('obligation.application');
  });

  test('observe audit debt cannot discharge enforce review obligations', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: { mode: string; reviews: object[] };
    };
    authority.audit.mode = 'observe';
    authority.audit.reviews = [];
    write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
    rebindAuthority(fixture);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      certified: boolean;
      unmetObligationIds: string[];
    };
    expect(report).toMatchObject({ accepted: false, certified: false });
    expect(report.unmetObligationIds).toContain('obligation.application');
  });

  test('audit source base must bind the selected candidate source base', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: { sourceBase: string; reviews: { sourceBase: string }[] };
    };
    authority.audit.sourceBase = '0'.repeat(40);
    for (const review of authority.audit.reviews) review.sourceBase = '0'.repeat(40);
    write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
    rebindAuthority(fixture);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const report = JSON.parse(invocation.stdout) as {
      accepted: boolean;
      certified: boolean;
      unmetObligationIds: string[];
    };
    expect(report).toMatchObject({ accepted: false, certified: false });
    expect(report.unmetObligationIds).toContain('obligation.application');
  });

  test('changed authority bytes cannot remove a trusted failed behavior check', async () => {
    const fixture = createFixture('enforce');
    write(join(fixture.repository, 'src/app.ts'), 'export const value = 2;\n');
    fixture.revision = commit(fixture.repository, 'change application behavior');
    satisfyApplication(fixture);
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      obligationRequest: {
        reviewed: { sourceBase: string; candidateIdentity: string; inputs: { content: object[] } };
        current: { sourceBase: string; candidateIdentity: string; inputs: { content: object[] } };
        policy: { behaviorRules: object[] };
        impactClassifications: object[];
        checks: object[];
      };
    };
    const reviewedApp = entriesAt(fixture.repository, fixture.baselineRevision).find(
      ({ path }) => path === 'src/app.ts',
    );
    const currentApp = entriesAt(fixture.repository, fixture.revision).find(
      ({ path }) => path === 'src/app.ts',
    );
    if (reviewedApp === undefined || currentApp === undefined) {
      throw new Error('application fixture disappeared');
    }
    authority.obligationRequest.policy.behaviorRules = [
      {
        contentInputId: 'content.3',
        consumerChecks: ['check.failed'],
        conformanceChecks: [],
        expandedReviewJudgments: [],
      },
    ];
    authority.obligationRequest.impactClassifications = [
      {
        classificationId: 'classification.application',
        contentInputId: 'content.3',
        reviewedSourceBase: fixture.baselineRevision,
        currentSourceBase: fixture.revision,
        reviewedCandidateIdentity: candidateIdentityAt(
          fixture.repository,
          fixture.baselineRevision,
        ),
        currentCandidateIdentity: candidateIdentityAt(fixture.repository, fixture.revision),
        classification: 'behavior-preserving',
        authority: { kind: 'declared', declarationIdentity: '1'.repeat(64) },
        change: 'changed',
        reviewedIdentity: reviewedApp.blob,
        currentIdentity: currentApp.blob,
      },
    ];
    authority.obligationRequest.checks.push({
      observationId: 'observation.check.failed',
      checkId: 'check.failed',
      candidateIdentity: candidateIdentityAt(fixture.repository, fixture.revision),
      status: 'failed',
    });
    write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
    rebindAuthority(fixture);
    const failed = await runCi(fixture);
    expect(failed.exitCode, outputOf(failed)).toBe(1);

    const rule = authority.obligationRequest.policy.behaviorRules[0] as {
      consumerChecks: string[];
    };
    rule.consumerChecks = [];
    write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
    const weakened = await runCi(fixture);
    const output = outputOf(weakened);
    expect(weakened.exitCode, output).toBe(1);
    expect(output).toContain('trusted authority digest does not match binding');
  });

  test('a candidate child whose name starts with two dots is still inside the candidate', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const candidateBinding = join(fixture.repository, '..trust', 'binding.json');
    write(candidateBinding, readFileSync(fixture.bindingPath, 'utf8'));

    const invocation = await runCi(fixture, candidateBinding);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('trusted binding resolves inside selected candidate');
  });

  test('binding cannot omit a transitive production module that decides acceptance', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      validator: { artifacts: { path: string; sha256: string }[] };
    };
    binding.validator.artifacts = binding.validator.artifacts.filter(
      ({ path }) => !path.endsWith('/indexes/check-indexes.ts'),
    );
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'trusted validator artifacts do not match the executable implementation',
    );
  });

  test('CI reports but cannot certify a mutable working selection or its untracked paths', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    write(join(fixture.repository, 'untracked.ts'), 'export const untracked = true;\n');

    const invocation = await invokeCli(
      ['lint-ci', 'working', fixture.repository, fixture.revision, fixture.evidencePath],
      {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
        TOOL_WIKI_CI_TRUSTED_BINDING: fixture.bindingPath,
      },
    );
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    const stdout = invocation.stdout;
    expect(stdout.length, output).toBeGreaterThan(0);
    const report = JSON.parse(stdout) as LintReportFixture & { refusals: object[] };
    expect(report).toMatchObject({
      accepted: false,
      certified: false,
      candidateSelection: { kind: 'working' },
      untrackedPaths: ['untracked.ts'],
    });
    expect(report.refusals).toContainEqual({
      kind: 'selection',
      reason: 'mutable working selection cannot receive CI certification',
    });
  });

  test('lint validates that every trusted selector actually selects candidate inputs', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as {
      boundaries: {
        boundaryId: string;
        selector: { kind: 'path'; value: string };
        baselineEntries: object[];
      }[];
    };
    const application = policy.boundaries.find(
      ({ boundaryId }) => boundaryId === 'boundary.application',
    );
    if (application === undefined) throw new Error('application boundary disappeared');
    application.selector = { kind: 'path', value: 'selector.does-not-exist' };
    application.baselineEntries = [];
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { path: string; sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'trusted boundary selector selects no candidate input: boundary.application (selector path selector.does-not-exist); if the candidate moved these files, prepare a relocation activation from the candidate SHA: see docs/runbook-tool-wiki-activation.md#relocation',
    );
    expect(output).not.toContain('trusted policy digest does not match binding');
  });

  test('CI resolves README relationship selectors against extracted candidate inputs', async () => {
    const fixture = createFixture('enforce');
    write(
      join(fixture.repository, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { module: 'ESNext' }, include: ['src/**/*.ts'] })}\n`,
    );
    // Relationship extraction refuses a candidate without an Nx workspace before it resolves
    // README selectors, so the fixture carries an empty one.
    write(join(fixture.repository, 'nx.json'), '{}\n');
    write(
      join(fixture.repository, 'README.md'),
      indexSource(
        [
          'exemptions.json',
          'nx.json',
          'policy.json',
          'src/app.ts',
          'tsconfig.json',
          'validator.ts',
        ],
        ['selector.does-not-exist'],
      ),
    );
    fixture.revision = commit(fixture.repository, 'declare unresolved relationship selector');
    fixture.baselineRevision = fixture.revision;
    writeEvidence(fixture, 'enforce', [
      'obligation.application',
      'obligation.exemptions',
      'obligation.policy',
      'obligation.validator',
    ]);
    writeAuthority(fixture);
    writeTrust(fixture, 'enforce');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    policy['relationshipRequest'] = {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/app.ts'] },
    };
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('unknown relationship selector in README.md: selector.does-not-exist');
  });

  test('CI trusted lint reads static Nx configuration without executing candidate plugins', async () => {
    const fixture = createFixture('enforce');
    const sentinel = join(
      fixture.repository,
      '..',
      `${fixture.repository.slice(fixture.repository.lastIndexOf('/') + 1)}.plugin-executed`,
    );
    scratchPaths.push(sentinel);
    write(
      join(fixture.repository, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { module: 'ESNext' }, include: ['src/**/*.ts'] })}\n`,
    );
    write(
      join(fixture.repository, 'tools/candidate-plugin.ts'),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env['MODULE_WIKI_PLUGIN_SENTINEL'] ?? '', 'executed');\nexport const createNodesV2 = ['project.json', () => []] as const;\n",
    );
    write(
      join(fixture.repository, 'nx.json'),
      `${JSON.stringify({ plugins: ['./tools/candidate-plugin.ts'], useInferencePlugins: false })}\n`,
    );
    write(
      join(fixture.repository, 'README.md'),
      indexSource(
        [
          'exemptions.json',
          'nx.json',
          'policy.json',
          'src/app.ts',
          'tools/candidate-plugin.ts',
          'tsconfig.json',
          'validator.ts',
        ],
        ['nx.projects'],
      ),
    );
    fixture.revision = commit(fixture.repository, 'candidate Nx plugin');
    fixture.baselineRevision = fixture.revision;
    writeEvidence(fixture, 'enforce', [
      'obligation.application',
      'obligation.exemptions',
      'obligation.policy',
      'obligation.validator',
    ]);
    writeAuthority(fixture);
    writeTrust(fixture, 'enforce');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    policy['relationshipRequest'] = {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/app.ts'] },
    };
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const environmentSentinel = process.env['MODULE_WIKI_PLUGIN_SENTINEL'];
    process.env['MODULE_WIKI_PLUGIN_SENTINEL'] = sentinel;
    const invocation = await runCi(fixture);
    if (environmentSentinel === undefined) delete process.env['MODULE_WIKI_PLUGIN_SENTINEL'];
    else process.env['MODULE_WIKI_PLUGIN_SENTINEL'] = environmentSentinel;
    const output = outputOf(invocation);
    // Proof: executing the configured plugin from relationship extraction wrote this sentinel and
    // failed the assertion before trusted lint could accept the static project declarations.
    expect(existsSync(sentinel)).toBe(false);
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      accepted: true,
      certified: true,
    });
  }, 30_000);

  test('preserved enforce launcher refuses candidate-local Nx modules before wrapper execution', () => {
    const fixture = createFixture('enforce');
    const sentinel = join(
      fixture.repository,
      '..',
      `${fixture.repository.slice(fixture.repository.lastIndexOf('/') + 1)}.local-nx-executed`,
    );
    scratchPaths.push(sentinel);
    write(
      join(fixture.repository, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { module: 'ESNext' }, include: ['src/**/*.ts'] })}\n`,
    );
    const localNxPaths = [
      '.nx/installation/node_modules/nx/package.json',
      '.nx/installation/node_modules/nx/bin/nx.js',
      '.nx/nxw.js',
    ];
    write(
      join(fixture.repository, localNxPaths[0]),
      `${JSON.stringify({ name: 'nx', version: '23.2.0' })}\n`,
    );
    write(join(fixture.repository, localNxPaths[1]), 'module.exports = {};\n');
    write(
      join(fixture.repository, localNxPaths[2]),
      `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');\n`,
    );
    write(
      join(fixture.repository, 'nx.json'),
      `${JSON.stringify({ plugins: [], useInferencePlugins: false })}\n`,
    );
    write(
      join(fixture.repository, 'README.md'),
      indexSource(
        [
          'exemptions.json',
          ...localNxPaths,
          'nx.json',
          'policy.json',
          'src/app.ts',
          'tsconfig.json',
          'validator.ts',
        ],
        ['nx.projects'],
      ),
    );
    fixture.revision = commit(fixture.repository, 'candidate-local Nx wrapper');
    fixture.baselineRevision = fixture.revision;
    writeEvidence(fixture, 'enforce', [
      'obligation.application',
      'obligation.exemptions',
      'obligation.policy',
      'obligation.validator',
    ]);
    writeAuthority(fixture);
    writeTrust(fixture, 'enforce');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    policy['relationshipRequest'] = {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/app.ts'] },
    };
    const candidateClassification = policy['classificationPolicy'] as {
      contentRules: { contentClass: string; include: object[] }[];
    };
    const sourceRule = candidateClassification.contentRules.find(
      ({ contentClass }) => contentClass === 'source',
    );
    if (sourceRule === undefined) throw new Error('fixture source classification disappeared');
    sourceRule.include.push({ kind: 'suffix', value: '.js' });
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const activation = join(fixture.trustDirectory, 'launcher-activation');
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'validator-path'), `${cliPath}\n`);
    write(
      join(activation, 'snapshotter-path'),
      `${join(import.meta.dir, 'snapshot-validator.ts')}\n`,
    );
    write(join(activation, 'ci-binding-path'), `${fixture.bindingPath}\n`);
    write(join(activation, 'evidence-path'), `${fixture.evidencePath}\n`);
    const workspace = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
    const runtime = mkdtempSync(join(workspace, '.tool-wiki-launcher-'));
    scratchPaths.push(runtime);

    const invocation = fromProcess(
      Bun.spawnSync(
        [
          'bash',
          join(workspace, 'bin/tool-wiki-lint.sh'),
          'committed',
          fixture.repository,
          fixture.revision,
        ],
        {
          env: {
            ...process.env,
            TMPDIR: runtime,
            TOOL_WIKI_ACTIVATION_ROOT: activation,
            TOOL_WIKI_REQUIRE_CERTIFIED: '1',
            TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
          },
          stderr: 'pipe',
          stdout: 'pipe',
        },
      ),
    );

    const output = outputOf(invocation);
    // Proof: restoring root-only candidate module admission made this preserved launcher accept
    // the nested Nx installation; the expected refusal failed with exit 0 instead of 1.
    expect(existsSync(sentinel)).toBe(false);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('relationship candidate may not supply trusted runtime modules');
    expect(invocation.stdout).toBe('');
  }, 30_000);

  test('preserved enforce launcher pins Nx outside candidate package self-reference', () => {
    const fixture = createFixture('enforce');
    const sentinel = join(
      fixture.repository,
      '..',
      `${fixture.repository.slice(fixture.repository.lastIndexOf('/') + 1)}.self-reference-executed`,
    );
    scratchPaths.push(sentinel);
    write(
      join(fixture.repository, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { module: 'ESNext' }, include: ['src/**/*.ts'] })}\n`,
    );
    write(
      join(fixture.repository, 'package.json'),
      `${JSON.stringify({
        name: 'nx',
        version: '23.2.0',
        private: true,
        type: 'commonjs',
        exports: {
          './bin/nx.js': './candidate-nx.js',
          './package.json': './package.json',
        },
      })}\n`,
    );
    write(
      join(fixture.repository, 'candidate-nx.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');\n`,
    );
    write(
      join(fixture.repository, 'nx.json'),
      `${JSON.stringify({ plugins: [], useInferencePlugins: false })}\n`,
    );
    write(
      join(fixture.repository, 'README.md'),
      indexSource(
        [
          'candidate-nx.js',
          'exemptions.json',
          'nx.json',
          'package.json',
          'policy.json',
          'src/app.ts',
          'tsconfig.json',
          'validator.ts',
        ],
        ['nx.projects'],
      ),
    );
    fixture.revision = commit(fixture.repository, 'candidate package self-reference');
    fixture.baselineRevision = fixture.revision;
    writeEvidence(fixture, 'enforce', [
      'obligation.application',
      'obligation.exemptions',
      'obligation.policy',
      'obligation.validator',
    ]);
    writeAuthority(fixture);
    writeTrust(fixture, 'enforce');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    policy['relationshipRequest'] = {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/app.ts'] },
    };
    const candidateClassification = policy['classificationPolicy'] as {
      contentRules: { contentClass: string; include: object[] }[];
    };
    const sourceRule = candidateClassification.contentRules.find(
      ({ contentClass }) => contentClass === 'source',
    );
    if (sourceRule === undefined) throw new Error('fixture source classification disappeared');
    sourceRule.include.push({ kind: 'suffix', value: '.js' });
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const activation = join(fixture.trustDirectory, 'launcher-activation');
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'validator-path'), `${cliPath}\n`);
    write(
      join(activation, 'snapshotter-path'),
      `${join(import.meta.dir, 'snapshot-validator.ts')}\n`,
    );
    write(join(activation, 'ci-binding-path'), `${fixture.bindingPath}\n`);
    write(join(activation, 'evidence-path'), `${fixture.evidencePath}\n`);
    const workspace = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
    const runtime = mkdtempSync(join(workspace, '.tool-wiki-launcher-'));
    scratchPaths.push(runtime);

    const invocation = fromProcess(
      Bun.spawnSync(
        [
          'bash',
          join(workspace, 'bin/tool-wiki-lint.sh'),
          'committed',
          fixture.repository,
          fixture.revision,
        ],
        {
          env: {
            ...process.env,
            TMPDIR: runtime,
            TOOL_WIKI_ACTIVATION_ROOT: activation,
            TOOL_WIKI_REQUIRE_CERTIFIED: '1',
            TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
          },
          stderr: 'pipe',
          stdout: 'pipe',
        },
      ),
    );

    const output = outputOf(invocation);
    expect(existsSync(sentinel)).toBe(false);
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      accepted: true,
      certified: true,
    });
  }, 30_000);

  test('preserved enforce launcher starts trusted Nx before candidate Bun configuration', () => {
    const fixture = createFixture('enforce');
    const sentinel = join(
      fixture.repository,
      '..',
      `${fixture.repository.slice(fixture.repository.lastIndexOf('/') + 1)}.bun-preload-executed`,
    );
    scratchPaths.push(sentinel);
    write(
      join(fixture.repository, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { module: 'ESNext' }, include: ['src/**/*.ts'] })}\n`,
    );
    write(join(fixture.repository, 'bunfig.toml'), 'preload = ["./candidate-preload.ts"]\n');
    write(
      join(fixture.repository, 'candidate-preload.ts'),
      `await Bun.write(${JSON.stringify(sentinel)}, 'executed');\n`,
    );
    write(
      join(fixture.repository, 'nx.json'),
      `${JSON.stringify({ plugins: [], useInferencePlugins: false })}\n`,
    );
    write(
      join(fixture.repository, 'README.md'),
      indexSource(
        [
          'bunfig.toml',
          'candidate-preload.ts',
          'exemptions.json',
          'nx.json',
          'policy.json',
          'src/app.ts',
          'tsconfig.json',
          'validator.ts',
        ],
        ['nx.projects'],
      ),
    );
    fixture.revision = commit(fixture.repository, 'candidate Bun preload');
    fixture.baselineRevision = fixture.revision;
    writeEvidence(fixture, 'enforce', [
      'obligation.application',
      'obligation.exemptions',
      'obligation.policy',
      'obligation.validator',
    ]);
    writeAuthority(fixture);
    writeTrust(fixture, 'enforce');
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    policy['relationshipRequest'] = {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/app.ts'] },
    };
    const candidateClassification = policy['classificationPolicy'] as {
      contentRules: { contentClass: string; include: object[] }[];
    };
    const configRule = candidateClassification.contentRules.find(
      ({ contentClass }) => contentClass === 'config',
    );
    if (configRule === undefined) throw new Error('fixture config classification disappeared');
    configRule.include.push({ kind: 'suffix', value: '.toml' });
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const activation = join(fixture.trustDirectory, 'launcher-activation');
    write(join(activation, 'active-v1'), 'tool-wiki-active-v1\n');
    write(join(activation, 'validator-path'), `${cliPath}\n`);
    write(
      join(activation, 'snapshotter-path'),
      `${join(import.meta.dir, 'snapshot-validator.ts')}\n`,
    );
    write(join(activation, 'ci-binding-path'), `${fixture.bindingPath}\n`);
    write(join(activation, 'evidence-path'), `${fixture.evidencePath}\n`);
    const workspace = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
    const runtime = mkdtempSync(join(workspace, '.tool-wiki-launcher-'));
    scratchPaths.push(runtime);

    const invocation = fromProcess(
      Bun.spawnSync(
        [
          'bash',
          join(workspace, 'bin/tool-wiki-lint.sh'),
          'committed',
          fixture.repository,
          fixture.revision,
        ],
        {
          env: {
            ...process.env,
            TMPDIR: runtime,
            TOOL_WIKI_ACTIVATION_ROOT: activation,
            TOOL_WIKI_REQUIRE_CERTIFIED: '1',
            TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
          },
          stderr: 'pipe',
          stdout: 'pipe',
        },
      ),
    );

    const output = outputOf(invocation);
    expect(existsSync(sentinel)).toBe(false);
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      accepted: true,
      certified: true,
    });
  }, 30_000);

  test('production lint refuses absent external consumers and unresolved applicable checks', async () => {
    const mutations = [
      {
        name: 'external consumer',
        metadata: {
          applicableChecks: [],
          externalConsumers: {
            kind: 'declared',
            memberships: [{ kind: 'path', path: 'consumer/absent.ts' }],
            knowledgeLimit: 'Only the selected candidate is observable.',
          },
        },
        expected: 'external consumer target absent in README.md: consumer/absent.ts',
      },
      {
        name: 'applicable check',
        metadata: {
          applicableChecks: ['check.does-not-exist'],
          externalConsumers: {
            kind: 'none-known',
            knowledgeLimit: 'Only the selected candidate is observable.',
          },
        },
        expected: 'unknown applicable check in README.md: check.does-not-exist',
      },
      {
        name: 'missing applicable check disposition',
        metadata: {
          applicableChecks: [],
          externalConsumers: {
            kind: 'none-known',
            knowledgeLimit: 'Only the selected candidate is observable.',
          },
        },
        omitCheckDisposition: true,
        expected: 'applicable checks or one explicit checks inapplicability reason',
      },
      {
        name: 'duplicate applicable check',
        metadata: {
          applicableChecks: ['check.fixture', 'check.fixture'],
          externalConsumers: {
            kind: 'none-known',
            knowledgeLimit: 'Only the selected candidate is observable.',
          },
        },
        expected: 'unique applicable checks',
      },
    ] as const;
    for (const mutation of mutations) {
      const fixture = createFixture('enforce');
      write(
        join(fixture.repository, 'tsconfig.json'),
        `${JSON.stringify({ compilerOptions: { module: 'ESNext' }, include: ['src/**/*.ts'] })}\n`,
      );
      write(join(fixture.repository, 'nx.json'), '{}\n');
      const metadataSource = indexSource(
        [
          'exemptions.json',
          'nx.json',
          'policy.json',
          'relationships.json',
          'src/app.ts',
          'tsconfig.json',
          'validator.ts',
        ],
        ['declarations.facts'],
        [...mutation.metadata.applicableChecks],
      );
      const metadata = JSON.parse(
        /<!-- module-index ([\s\S]+) -->/.exec(metadataSource)?.[1] ?? '{}',
      ) as Record<string, unknown>;
      metadata['externalConsumers'] = mutation.metadata.externalConsumers;
      if ('omitCheckDisposition' in mutation) {
        metadata['inapplicableSections'] = (
          metadata['inapplicableSections'] as { section: string }[]
        ).filter(({ section }) => section !== 'checks');
      }
      write(
        join(fixture.repository, 'README.md'),
        `# Fixture\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`,
      );
      write(
        join(fixture.repository, 'relationships.json'),
        `${JSON.stringify({
          schemaVersion: 1,
          declarationId: 'fixture.checks',
          selectorVersion: 1,
          coverage: 'selected-facts-only',
          facts: [
            {
              factId: 'check.fixture',
              family: 'external-consumers',
              at: { kind: 'current' },
              kind: 'external-consumer',
              system: 'test-harness',
              contract: 'production lint fixture',
              knowledgeLimit: 'Only the selected fixture is observable.',
            },
          ],
          edges: [],
        })}\n`,
      );
      fixture.revision = commit(fixture.repository, mutation.name);
      fixture.baselineRevision = fixture.revision;
      writeEvidence(fixture, 'enforce', [
        'obligation.application',
        'obligation.exemptions',
        'obligation.policy',
        'obligation.validator',
      ]);
      writeAuthority(fixture);
      writeTrust(fixture, 'enforce');
      const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<
        string,
        unknown
      >;
      policy['relationshipRequest'] = {
        schemaVersion: 1,
        declarationPaths: ['relationships.json'],
        typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/app.ts'] },
      };
      write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
      const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
        policy: { sha256: string };
      };
      binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
      write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

      const invocation = await runCi(fixture);
      const output = outputOf(invocation);
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(mutation.expected);
    }
  }, 90_000);

  test('trusted obligations must retain one exact boundary assignment', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as {
      obligations: { obligationId: string; boundaryId: string }[];
    };
    const application = policy.obligations.find(
      ({ obligationId }) => obligationId === 'obligation.application',
    );
    if (application === undefined) throw new Error('application obligation disappeared');
    application.boundaryId = 'boundary.policy';
    write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      policy: { sha256: string };
    };
    binding.policy.sha256 = sha256(readFileSync(fixture.policyPath));
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'trusted obligation boundary assignment mismatch: obligation.application',
    );
  });

  test('CI rejects an ordinary mode argument and a candidate field that tries to select trust', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const withMode = await runCi(fixture, fixture.bindingPath, ['observe']);
    expect(withMode.exitCode, outputOf(withMode)).toBe(1);
    expect(outputOf(withMode)).toContain('usage: twilight-burokrat');

    const evidence = JSON.parse(readFileSync(fixture.evidencePath, 'utf8')) as object;
    write(
      fixture.evidencePath,
      `${JSON.stringify({ ...evidence, trustedBindingPath: fixture.bindingPath })}\n`,
    );
    const withBindingField = await runCi(fixture);
    expect(withBindingField.exitCode, outputOf(withBindingField)).toBe(1);
    expect(outputOf(withBindingField)).toContain('trustedBindingPath must be removed');
  });

  test('CI fails closed when its caller did not preselect a trusted binding', async () => {
    const fixture = createFixture('enforce');
    const invocation = await runCi(fixture, null);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('CI trusted binding was not preselected by the caller');
  });

  // This three-process negative control passed alone in 4.629s but crossed the shared suite's
  // default at 5.005s; the explicit bound preserves the assertions under host load.
  test('binding, policy and validator aliases cannot resolve inside the selected candidate', async () => {
    const cases = ['binding', 'policy', 'validator'] as const;
    for (const subject of cases) {
      const fixture = createFixture('enforce');
      satisfyApplication(fixture);
      let bindingPath = fixture.bindingPath;
      if (subject === 'binding') {
        bindingPath = join(fixture.repository, 'candidate-binding.json');
        write(bindingPath, readFileSync(fixture.bindingPath, 'utf8'));
      } else {
        const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
          policy: { path: string; sha256: string };
          validator: { artifacts: { path: string; sha256: string }[] };
        };
        if (subject === 'policy') {
          const alias = join(fixture.trustDirectory, 'candidate-policy-alias.json');
          symlinkSync(join(fixture.repository, 'policy.json'), alias);
          binding.policy = { path: alias, sha256: sha256(readFileSync(alias)) };
        } else {
          binding.validator.artifacts = [
            {
              path: join(fixture.repository, 'validator.ts'),
              sha256: sha256(readFileSync(join(fixture.repository, 'validator.ts'))),
            },
          ];
        }
        write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);
      }

      const invocation = await runCi(fixture, bindingPath);
      const output = outputOf(invocation);
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain('resolves inside selected candidate');
    }
  }, 20_000);

  test('trusted authority aliases cannot resolve inside the selected candidate', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const candidateAuthority = join(fixture.repository, 'candidate-authority.json');
    write(candidateAuthority, readFileSync(fixture.authorityPath, 'utf8'));
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
    };
    binding.authority.artifact = {
      path: candidateAuthority,
      sha256: sha256(readFileSync(candidateAuthority)),
    };
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runCi(fixture);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('trusted authority resolves inside selected candidate');
  });

  test('binding cannot omit executable source that actually decides acceptance', async () => {
    const fixture = createFixture('enforce');
    const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      validator: { artifacts: { path: string; sha256: string }[] };
    };
    binding.validator.artifacts = binding.validator.artifacts.filter(
      ({ path }) => realpathSync(path) !== realpathSync(trustPath),
    );
    write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runLocal(fixture, 'enforce');
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'trusted validator artifacts do not match the executable implementation',
    );
  });

  test('compatible activation retains both identities and deterministically reselects affected checks', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        const boundaries = policy['boundaries'] as object[];
        const obligations = policy['obligations'] as object[];
        boundaries.push({
          boundaryId: 'boundary.docs',
          selector: { kind: 'path', value: 'README.md' },
          baselineEntries: [exactTuple(fixture.repository, fixture.revision, 'README.md')],
          obligationIds: ['obligation.docs'],
        });
        obligations.push({
          obligationId: 'obligation.docs',
          boundaryId: 'boundary.docs',
          checkIds: ['check.docs'],
          reviewIds: ['review.docs'],
        });
      },
      {
        addedBoundaryIds: ['boundary.docs'],
        changedBoundaryIds: [],
        addedObligationIds: ['obligation.docs'],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(invocation.stdout)).toMatchObject({
      compatible: true,
      previous: { bindingId: 'binding.enforce.v1', policyId: 'policy.trusted.v1' },
      next: { bindingId: 'binding.next.v1', policyId: 'policy.trusted.v1' },
      reselectedCheckIds: [
        'check.application',
        'check.docs',
        'check.exemptions',
        'check.policy',
        'check.validator',
      ],
      reselectedReviewIds: [
        'review.application',
        'review.docs',
        'review.exemptions',
        'review.policy',
        'review.validator',
      ],
    });
  });

  test('compatible activation rejects a predecessor identity selected from somewhere else', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
    });
    const binding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      predecessor: { bindingIdentity: string };
    };
    binding.predecessor.bindingIdentity = '0'.repeat(64);
    write(nextBindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('activation predecessor does not match the previous trusted binding');
  });

  test('compatible activation loads and validates the successor authority artifact', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
    });
    const binding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
    };
    binding.authority.artifact = {
      path: join(fixture.trustDirectory, 'authority.does-not-exist.json'),
      sha256: '0'.repeat(64),
    };
    write(nextBindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('cannot open trusted authority');
  });

  test('compatible activation cannot remove authority-owned check requirements', async () => {
    const fixture = createFixture('enforce');
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      obligationRequest: { policy: { behaviorRules: object[] } };
    };
    authority.obligationRequest.policy.behaviorRules = [
      {
        contentInputId: 'content.3',
        consumerChecks: ['check.application'],
        conformanceChecks: [],
        expandedReviewJudgments: [],
      },
    ];
    write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
    rebindAuthority(fixture);
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
    });
    const nextAuthorityPath = join(fixture.trustDirectory, 'authority-next.json');
    const nextAuthority = structuredClone(authority);
    const nextRule = nextAuthority.obligationRequest.policy.behaviorRules[0] as {
      consumerChecks: string[];
    };
    nextRule.consumerChecks = [];
    write(nextAuthorityPath, `${JSON.stringify(nextAuthority)}\n`);
    const binding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
    };
    binding.authority.artifact = {
      path: nextAuthorityPath,
      sha256: sha256(readFileSync(nextAuthorityPath)),
    };
    write(nextBindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'compatible activation cannot remove authority check requirement from content.3: check.application',
    );
  });

  test('compatible activation cannot narrow a retained audit obligation before its authority certifies CI', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
      authorityChanged: true,
    });
    const nextAuthorityPath = join(fixture.trustDirectory, 'authority-next.json');
    interface AuditSubject {
      subjectId: string;
      kind: 'file' | 'directory' | 'project' | 'documentation';
      locator: { kind: 'path'; path: string } | { kind: 'repository-root' };
      contentIdentity: string;
    }
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: {
        obligations: { obligationId: string; subject: AuditSubject }[];
        reviews: {
          obligationId: string;
          evidence: { protocolEvidence: { subject: AuditSubject } };
        }[];
      };
    };
    const applicationObligation = authority.audit.obligations.find(
      ({ obligationId }) => obligationId === 'review.application',
    );
    const applicationReview = authority.audit.reviews.find(
      ({ obligationId }) => obligationId === 'review.application',
    );
    if (applicationObligation === undefined || applicationReview === undefined) {
      throw new Error('application audit fixture disappeared');
    }
    const narrowedSubject = {
      ...applicationObligation.subject,
      kind: 'file' as const,
      locator: { kind: 'path' as const, path: 'src/app.ts' },
    };
    applicationObligation.subject = narrowedSubject;
    applicationReview.evidence.protocolEvidence.subject = narrowedSubject;
    write(nextAuthorityPath, `${JSON.stringify(authority)}\n`);
    const binding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
    };
    binding.authority.artifact = {
      path: nextAuthorityPath,
      sha256: sha256(readFileSync(nextAuthorityPath)),
    };
    write(nextBindingPath, `${JSON.stringify(binding)}\n`);

    const downstream = await runCi(fixture, nextBindingPath);
    const downstreamOutput = outputOf(downstream);
    expect(downstream.exitCode, downstreamOutput).toBe(0);
    expect(JSON.parse(downstream.stdout)).toMatchObject({
      accepted: true,
      certified: true,
    });

    const activation = await runActivation(fixture, nextBindingPath);
    const activationOutput = outputOf(activation);
    expect(activation.exitCode, activationOutput).toBe(1);
    expect(activationOutput).toContain(
      'compatible activation cannot change authority audit obligation: review.application',
    );
  });

  test('compatible activation cannot weaken settings for a retained audit risk stratum', async () => {
    const fixture = createFixture('enforce');
    satisfyApplication(fixture);
    interface AuditStratumFixture {
      stratumId: string;
      sampleRateBps: number;
      disagreementTriggerBps: number;
    }
    const previousAuthority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: { strata: AuditStratumFixture[] };
    };
    previousAuthority.audit.strata[0].disagreementTriggerBps = 2500;
    write(fixture.authorityPath, `${JSON.stringify(previousAuthority)}\n`);
    rebindAuthority(fixture);
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
      authorityChanged: true,
    });
    const nextAuthorityPath = join(fixture.trustDirectory, 'authority-next.json');
    const identity = candidateIdentityAt(fixture.repository, fixture.revision);
    const nextAuthority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: {
        strata: AuditStratumFixture[];
        reviews: object[];
        adjudications: object[];
      };
    };
    const conflictingReview = auditReview('review.application', fixture, identity, {
      instanceId: 'review.application.conflict',
      informedImpact: 'partial',
    });
    const freshReview = auditReview('review.application', fixture, identity, {
      instanceId: 'review.application.fresh',
      reviewRound: 2,
    });
    nextAuthority.audit.reviews.push(conflictingReview, freshReview);
    nextAuthority.audit.adjudications.push({
      adjudicationId: 'adjudication.review.application',
      obligationId: 'review.application',
      candidateIdentity: identity,
      generation: 1,
      reviewRound: 1,
      reviewIds: ['audit.review.application', 'audit.review.application.conflict'],
      freshReviewIds: ['audit.review.application.fresh'],
      sourceEvidence: [
        {
          evidenceId: 'source.adjudication.review.application',
          subjectId: 'subject.review.application',
          contentIdentity: identity,
          candidateIdentity: identity,
          generation: 1,
        },
      ],
      checkEvidence: [
        {
          evidenceId: 'check.adjudication.review.application',
          checkId: 'check.application',
          candidateIdentity: identity,
          generation: 1,
          status: 'passed',
        },
      ],
    });

    const previousThresholdAudit = evaluateAudit(nextAuthority.audit);
    expect(previousThresholdAudit.accepted).toBe(false);
    expect(previousThresholdAudit.freshReviewObligationIds).toEqual([
      'review.application',
      'review.exemptions',
      'review.policy',
      'review.validator',
    ]);

    nextAuthority.audit.strata[0].disagreementTriggerBps = 10000;
    const nextThresholdAudit = evaluateAudit(nextAuthority.audit);
    expect(nextThresholdAudit.accepted).toBe(true);
    expect(nextThresholdAudit.freshReviewObligationIds).toEqual(['review.application']);
    write(nextAuthorityPath, `${JSON.stringify(nextAuthority)}\n`);
    const nextBinding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
    };
    nextBinding.authority.artifact = {
      path: nextAuthorityPath,
      sha256: sha256(readFileSync(nextAuthorityPath)),
    };
    write(nextBindingPath, `${JSON.stringify(nextBinding)}\n`);

    const downstream = await runCi(fixture, nextBindingPath);
    const downstreamOutput = outputOf(downstream);
    expect(downstream.exitCode, downstreamOutput).toBe(0);
    expect(JSON.parse(downstream.stdout)).toMatchObject({
      accepted: true,
      certified: true,
    });

    const activation = await runActivation(fixture, nextBindingPath);
    const activationOutput = outputOf(activation);
    expect(activation.exitCode, activationOutput).toBe(1);
    expect(activationOutput).toContain(
      'compatible activation cannot weaken authority audit stratum disagreementTriggerBps: risk.fixture',
    );
  });

  test('compatible activation cannot reduce sampling for a retained audit risk stratum', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
      authorityChanged: true,
    });
    const nextAuthorityPath = join(fixture.trustDirectory, 'authority-next.json');
    const nextAuthority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      audit: { strata: { sampleRateBps: number }[] };
    };
    nextAuthority.audit.strata[0].sampleRateBps = 2500;
    write(nextAuthorityPath, `${JSON.stringify(nextAuthority)}\n`);
    const nextBinding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
    };
    nextBinding.authority.artifact = {
      path: nextAuthorityPath,
      sha256: sha256(readFileSync(nextAuthorityPath)),
    };
    write(nextBindingPath, `${JSON.stringify(nextBinding)}\n`);

    const activation = await runActivation(fixture, nextBindingPath);
    const activationOutput = outputOf(activation);
    expect(activation.exitCode, activationOutput).toBe(1);
    expect(activationOutput).toContain(
      'compatible activation cannot weaken authority audit stratum sampleRateBps: risk.fixture',
    );
  });

  test('compatible activation permits stronger retained audit risk stratum settings', async () => {
    for (const change of [
      { field: 'sampleRateBps', previous: 2500, next: 10000 },
      { field: 'disagreementTriggerBps', previous: 10000, next: 2500 },
    ] as const) {
      const fixture = createFixture('enforce');
      const previousAuthority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
        audit: {
          strata: { sampleRateBps: number; disagreementTriggerBps: number }[];
        };
      };
      previousAuthority.audit.strata[0][change.field] = change.previous;
      write(fixture.authorityPath, `${JSON.stringify(previousAuthority)}\n`);
      rebindAuthority(fixture);
      const nextBindingPath = writeActivation(fixture, () => undefined, {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
        authorityChanged: true,
      });
      const nextAuthorityPath = join(fixture.trustDirectory, 'authority-next.json');
      const nextAuthority = structuredClone(previousAuthority);
      nextAuthority.audit.strata[0][change.field] = change.next;
      write(nextAuthorityPath, `${JSON.stringify(nextAuthority)}\n`);
      const nextBinding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
        authority: { artifact: { path: string; sha256: string } };
      };
      nextBinding.authority.artifact = {
        path: nextAuthorityPath,
        sha256: sha256(readFileSync(nextAuthorityPath)),
      };
      write(nextBindingPath, `${JSON.stringify(nextBinding)}\n`);

      const activation = await runActivation(fixture, nextBindingPath);
      expect(activation.exitCode, `${change.field}: ${outputOf(activation)}`).toBe(0);
    }
  });

  test('compatible authority activation deterministically reselects its checks and reviews', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(fixture, () => undefined, {
      addedBoundaryIds: [],
      changedBoundaryIds: [],
      addedObligationIds: [],
      removedExemptionIds: [],
      validatorChanged: false,
      authorityChanged: true,
    });
    const nextAuthorityPath = join(fixture.trustDirectory, 'authority-next.json');
    const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
      obligationRequest: {
        policy: { behaviorRules: object[] };
        judgments: object[];
      };
    };
    authority.obligationRequest.policy.behaviorRules.push({
      contentInputId: 'content.3',
      consumerChecks: ['check.authority.new'],
      conformanceChecks: [],
      expandedReviewJudgments: ['review.authority.new'],
    });
    authority.obligationRequest.judgments.push({
      judgmentId: 'review.authority.new',
      kind: 'content',
      subjectId: 'subject.authority.new',
      bindings: {
        content: [{ kind: 'content', inputId: 'content.3' }],
        structural: [],
        semantic: [],
        topology: [],
      },
    });
    write(nextAuthorityPath, `${JSON.stringify(authority)}\n`);
    const binding = JSON.parse(readFileSync(nextBindingPath, 'utf8')) as {
      authority: { artifact: { path: string; sha256: string } };
      activation: { authorityChanged: boolean };
    };
    binding.authority.artifact = {
      path: nextAuthorityPath,
      sha256: sha256(readFileSync(nextAuthorityPath)),
    };
    binding.activation.authorityChanged = true;
    write(nextBindingPath, `${JSON.stringify(binding)}\n`);

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(0);
    const report = JSON.parse(invocation.stdout) as {
      reselectedCheckIds: string[];
      reselectedReviewIds: string[];
    };
    expect(report.reselectedCheckIds).toEqual([
      'check.application',
      'check.authority.new',
      'check.exemptions',
      'check.policy',
      'check.validator',
    ]);
    expect(report.reselectedReviewIds).toEqual([
      'review.application',
      'review.authority.new',
      'review.exemptions',
      'review.policy',
      'review.validator',
    ]);
  });

  for (const changed of ['policy', 'validator'] as const) {
    test(`${changed} activation reselects every current authority check and review`, async () => {
      const fixture = createFixture('enforce');
      const authority = JSON.parse(readFileSync(fixture.authorityPath, 'utf8')) as {
        obligationRequest: {
          policy: { behaviorRules: object[] };
          judgments: object[];
        };
      };
      authority.obligationRequest.policy.behaviorRules.push({
        contentInputId: 'content.3',
        consumerChecks: ['check.authority.extra'],
        conformanceChecks: [],
        expandedReviewJudgments: ['review.authority.extra'],
      });
      authority.obligationRequest.judgments.push({
        judgmentId: 'review.authority.extra',
        kind: 'content',
        subjectId: 'subject.authority.extra',
        bindings: {
          content: [{ kind: 'content', inputId: 'content.3' }],
          structural: [],
          semantic: [],
          topology: [],
        },
      });
      write(fixture.authorityPath, `${JSON.stringify(authority)}\n`);
      rebindAuthority(fixture);

      let nextBindingPath: string;
      if (changed === 'policy') {
        nextBindingPath = writeActivation(
          fixture,
          (policy) => {
            const obligations = policy['obligations'] as {
              obligationId: string;
              checkIds: string[];
            }[];
            const application = obligations.find(
              ({ obligationId }) => obligationId === 'obligation.application',
            );
            if (application === undefined) throw new Error('application obligation disappeared');
            application.checkIds.push('check.application.next');
          },
          {
            addedBoundaryIds: [],
            changedBoundaryIds: ['boundary.application'],
            addedObligationIds: [],
            removedExemptionIds: [],
            validatorChanged: false,
          },
        );
      } else {
        const historicalValidatorPath = join(fixture.trustDirectory, 'validator-historical.ts');
        write(historicalValidatorPath, 'export const accepts = false;\n');
        const previousBinding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
          validator: { artifacts: { path: string; sha256: string }[] };
        };
        previousBinding.validator.artifacts = [
          { path: historicalValidatorPath, sha256: sha256(readFileSync(historicalValidatorPath)) },
        ];
        write(fixture.bindingPath, `${JSON.stringify(previousBinding)}\n`);
        const nextArtifacts = resolveValidatorArtifactPaths([cliPath, trustPath]).map((path) => ({
          path,
          sha256: sha256(readFileSync(path)),
        }));
        nextBindingPath = writeActivation(
          fixture,
          () => undefined,
          {
            addedBoundaryIds: [],
            changedBoundaryIds: [],
            addedObligationIds: [],
            removedExemptionIds: [],
            validatorChanged: true,
          },
          nextArtifacts,
        );
      }

      const invocation = await runActivation(fixture, nextBindingPath);
      const output = outputOf(invocation);
      expect(invocation.exitCode, `${changed}: ${output}`).toBe(0);
      const report = JSON.parse(invocation.stdout) as {
        reselectedCheckIds: string[];
        reselectedReviewIds: string[];
      };
      expect(report.reselectedCheckIds).toEqual(
        changed === 'policy'
          ? [
              'check.application',
              'check.application.next',
              'check.authority.extra',
              'check.exemptions',
              'check.policy',
              'check.validator',
            ]
          : [
              'check.application',
              'check.authority.extra',
              'check.exemptions',
              'check.policy',
              'check.validator',
            ],
      );
      expect(report.reselectedReviewIds).toEqual([
        'review.application',
        'review.authority.extra',
        'review.exemptions',
        'review.policy',
        'review.validator',
      ]);
    });
  }

  test('compatible activation rejects a boundary addition omitted from its declaration', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        const boundaries = policy['boundaries'] as object[];
        boundaries.push({
          boundaryId: 'boundary.docs',
          selector: { kind: 'path', value: 'README.md' },
          baselineEntries: [exactTuple(fixture.repository, fixture.revision, 'README.md')],
          obligationIds: [],
        });
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'added boundary declaration mismatch: expected boundary.docs, received (none)',
    );
  });

  test('compatible activation requires an explicit boundary declaration for obligation coverage changes', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        const obligations = policy['obligations'] as {
          obligationId: string;
          checkIds: string[];
        }[];
        const application = obligations.find(
          ({ obligationId }) => obligationId === 'obligation.application',
        );
        if (application === undefined) throw new Error('application obligation disappeared');
        application.checkIds.push('check.application.new');
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'changed boundary declaration mismatch: expected boundary.application, received (none)',
    );
  });

  test('compatible activation can retain a historical validator and select all checks for its replacement', async () => {
    const fixture = createFixture('enforce');
    const historicalValidatorPath = join(fixture.trustDirectory, 'validator-historical.ts');
    write(historicalValidatorPath, 'export const accepts = false;\n');
    const previousBinding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
      validator: { validatorId: string; artifacts: { path: string; sha256: string }[] };
    };
    previousBinding.validator.artifacts = [
      { path: historicalValidatorPath, sha256: sha256(readFileSync(historicalValidatorPath)) },
    ];
    write(fixture.bindingPath, `${JSON.stringify(previousBinding)}\n`);
    const nextArtifacts = resolveValidatorArtifactPaths([cliPath, trustPath]).map((path) => ({
      path,
      sha256: sha256(readFileSync(path)),
    }));
    const nextBindingPath = writeActivation(
      fixture,
      () => undefined,
      {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: true,
      },
      nextArtifacts,
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(0);
    const report = JSON.parse(invocation.stdout) as {
      previous: { validatorIdentity: string };
      next: { validatorIdentity: string };
      reselectedCheckIds: string[];
    };
    expect(report.previous.validatorIdentity).not.toBe(report.next.validatorIdentity);
    expect(report.reselectedCheckIds).toEqual([
      'check.application',
      'check.exemptions',
      'check.policy',
      'check.validator',
    ]);
  });

  test('compatible activation rejects an undeclared coverage shrink', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        policy['boundaries'] = (policy['boundaries'] as { boundaryId: string }[]).filter(
          ({ boundaryId }) => boundaryId !== 'boundary.application',
        );
        policy['obligations'] = (policy['obligations'] as { boundaryId: string }[]).filter(
          ({ boundaryId }) => boundaryId !== 'boundary.application',
        );
        policy['adoptedBoundaryIds'] = (policy['adoptedBoundaryIds'] as string[]).filter(
          (boundaryId) => boundaryId !== 'boundary.application',
        );
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('compatible activation cannot remove boundary: boundary.application');
  });

  test('compatible activation cannot narrow an existing selector', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        const boundaries = policy['boundaries'] as {
          boundaryId: string;
          selector: { kind: string; value: string };
        }[];
        const application = boundaries.find(
          ({ boundaryId }) => boundaryId === 'boundary.application',
        );
        if (application === undefined) throw new Error('application boundary disappeared');
        application.selector = { kind: 'path', value: 'src/app.ts' };
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: ['boundary.application'],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'compatible activation cannot narrow selector coverage: boundary.application',
    );
  });

  test('compatible activation cannot delete existing check or review requirements', async () => {
    for (const requirement of ['checkIds', 'reviewIds'] as const) {
      const fixture = createFixture('enforce');
      const nextBindingPath = writeActivation(
        fixture,
        (policy) => {
          const obligations = policy['obligations'] as {
            obligationId: string;
            checkIds: string[];
            reviewIds: string[];
          }[];
          const application = obligations.find(
            ({ obligationId }) => obligationId === 'obligation.application',
          );
          if (application === undefined) throw new Error('application obligation disappeared');
          application[requirement] = [];
        },
        {
          addedBoundaryIds: [],
          changedBoundaryIds: ['boundary.application'],
          addedObligationIds: [],
          removedExemptionIds: [],
          validatorChanged: false,
        },
      );

      const invocation = await runActivation(fixture, nextBindingPath);
      const output = outputOf(invocation);
      expect(invocation.exitCode, `${requirement}: ${output}`).toBe(1);
      expect(output).toContain(
        `compatible activation cannot remove ${requirement === 'checkIds' ? 'check' : 'review'} requirement from obligation.application`,
      );
    }
  });

  test('compatible activation cannot move an existing obligation to another boundary', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        const boundaries = policy['boundaries'] as {
          boundaryId: string;
          obligationIds: string[];
        }[];
        const obligations = policy['obligations'] as {
          obligationId: string;
          boundaryId: string;
        }[];
        const application = obligations.find(
          ({ obligationId }) => obligationId === 'obligation.application',
        );
        if (application === undefined) throw new Error('application obligation disappeared');
        application.boundaryId = 'boundary.policy';
        const applicationBoundary = boundaries.find(
          ({ boundaryId }) => boundaryId === 'boundary.application',
        );
        const policyBoundary = boundaries.find(
          ({ boundaryId }) => boundaryId === 'boundary.policy',
        );
        if (applicationBoundary === undefined || policyBoundary === undefined) {
          throw new Error('fixture boundary disappeared');
        }
        applicationBoundary.obligationIds = [];
        policyBoundary.obligationIds.push('obligation.application');
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: ['boundary.application', 'boundary.policy'],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain(
      'compatible activation cannot move obligation obligation.application from boundary.application',
    );
  });

  test('compatible activation rejects a minimum-mode weakening', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        policy['minimumMode'] = 'observe';
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('compatible activation cannot weaken minimum mode');
  });

  test('compatible activation rejects a new exemption that weakens enforcement', async () => {
    const fixture = createFixture('enforce');
    const nextBindingPath = writeActivation(
      fixture,
      (policy) => {
        policy['exemptions'] = [
          {
            exemptionId: 'exemption.application',
            obligationId: 'obligation.application',
            reason: 'candidate wants to skip application review',
            reviewIdentity: 'a'.repeat(64),
          },
        ];
      },
      {
        addedBoundaryIds: [],
        changedBoundaryIds: [],
        addedObligationIds: [],
        removedExemptionIds: [],
        validatorChanged: false,
      },
    );

    const invocation = await runActivation(fixture, nextBindingPath);
    const output = outputOf(invocation);
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('compatible activation cannot add or weaken exemption');
  });
});
