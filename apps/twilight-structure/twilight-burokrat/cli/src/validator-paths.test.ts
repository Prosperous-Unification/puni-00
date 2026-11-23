import { describe, expect, it } from 'bun:test';

import { requests } from './fixtures/installed-requests.fixture';
import { anchorPath, anchorRequest } from './validator-paths';
import { decodeRequest } from './validator-request';

const hostFields: Readonly<Partial<Record<string, readonly string[]>>> = {
  'validate-progress-receipt': ['receipt', 'planReference', 'tasks'],
  'validate-plan-tasks': ['planReference', 'tasks'],
  'validate-record': ['record'],
  'validate workflow-binding': [],
  validate: ['record'],
  'read-candidate': ['repository'],
  'classify-candidate': ['repository', 'policy'],
  'content-manifest': ['repository', 'policy', 'request'],
  'validate-artifacts': ['repository', 'policy', 'graph'],
  'extract-relationships': ['repository', 'request'],
  'check-indexes': ['repository'],
  'check-root-migration': ['repository'],
  'validate-review-provenance': ['journal', 'evidence'],
  'freeze-exhaustive': [
    'repository',
    'inventory',
    'inventoryProtocol',
    'classificationPolicy',
    'contentManifestRequest',
    'exhaustivePolicy',
    'reviewProtocol',
    'moduleMapping',
    'granularityPolicy',
    'modelContext',
    'relationshipRequest',
    'artifactGraph',
  ],
  'verify-exhaustive': [
    'repository',
    'inventory',
    'inventoryProtocol',
    'classificationPolicy',
    'contentManifestRequest',
    'exhaustivePolicy',
    'reviewProtocol',
    'moduleMapping',
    'granularityPolicy',
    'modelContext',
    'relationshipRequest',
    'artifactGraph',
    'plan',
  ],
  'evaluate-exhaustive-coverage': [
    'repository',
    'inventory',
    'inventoryProtocol',
    'classificationPolicy',
    'contentManifestRequest',
    'exhaustivePolicy',
    'reviewProtocol',
    'moduleMapping',
    'granularityPolicy',
    'modelContext',
    'relationshipRequest',
    'artifactGraph',
    'plan',
    'audit',
  ],
  'lint-local': ['repository', 'binding', 'evidence'],
  'lint-ci': ['repository', 'evidence'],
  'validate-policy-activation': ['repository', 'previousBinding', 'nextBinding'],
  check: ['repository', 'rulePolicy', 'performanceEvidence'],
  explain: ['policy.repository', 'policy.rulePolicy'],
  'scenario import': ['repository'],
  'scenario validate': ['repository'],
  'scenario allocate': ['repository'],
  'template list': [],
  'template show': [],
  'template verify': ['repository'],
  'inspect-evaluation-coverage': ['repository', 'rulePolicy', 'coverageReview'],
  'inspect-performance': ['repository', 'rulePolicy'],
  'inspect-performance-sources': ['repository', 'rulePolicy'],
  'inspect-performance-levels': ['repository', 'rulePolicy', 'factsAuthority'],
  'inspect-performance-scenarios': ['repository', 'rulePolicy', 'levelAuthority'],
  'inspect-scenario-ledger': ['repository', 'rulePolicy', 'levelAuthority'],
  'inspect-level-facts': ['repository', 'authority'],
  'inspect-bun-test-reports': ['repository'],
  'inspect-test-reports': ['repository', 'rulePolicy'],
  'inspect-test-sources': ['repository', 'rulePolicy'],
  'inspect-spec-sources': ['repository'],
  'inspect-manual': ['repository', 'rulePolicy'],
  'inspect-manual-observation': ['repository', 'rulePolicy'],
  'inspect-browser-performance': ['repository', 'rulePolicy', 'authority'],
  'inspect-browser-architecture': ['repository', 'rulePolicy', 'authority'],
  'inspect-browser-conformance': ['repository', 'rulePolicy', 'authority'],
  'inspect-browser-memberships': ['repository', 'rulePolicy', 'authority'],
  'inspect-browser-scenarios': [
    'repository',
    'rulePolicy',
    'reviewAuthority',
    'conformanceAuthority',
    'architectureAuthority',
    'performanceAuthority',
  ],
  'inspect-browser-source-levels': [
    'repository',
    'rulePolicy',
    'reviewAuthority',
    'conformanceAuthority',
    'architectureAuthority',
    'performanceAuthority',
  ],
  'inspect-browser-levels': [
    'repository',
    'rulePolicy',
    'reviewAuthority',
    'conformanceAuthority',
    'architectureAuthority',
    'performanceAuthority',
  ],
  'inspect-browser-t2': ['repository', 'rulePolicy'],
  'inspect-browser-t2-policy': ['repository', 'rulePolicy'],
  'inspect-browser-scenario-ledger': ['repository', 'rulePolicy'],
};

describe('validator caller-relative inputs', () => {
  const callerDirectory = '/caller with spaces';
  for (const parsed of requests) {
    const variant = parsed.command + ('action' in parsed ? ' ' + parsed.action : '');
    it(variant + ' anchors only its ordinary host inputs', () => {
      const request = decodeRequest(
        JSON.stringify({ version: 1, callerDirectory, request: parsed }),
      ).request;
      const fields = hostFields[variant];
      if (fields === undefined) throw new Error('missing independent path oracle: ' + variant);
      const expected = { ...request };
      for (const field of fields) {
        if (field.startsWith('policy.')) continue;
        const value: unknown = Reflect.get(expected, field);
        if (typeof value === 'string') Reflect.set(expected, field, callerDirectory + '/' + value);
      }
      expect(anchorRequest(request, callerDirectory)).toStrictEqual(expected);
    });
  }
  it('anchors optional performance evidence and nested explanation policy paths', () => {
    expect(
      anchorRequest(
        {
          command: 'check',
          kind: 'committed',
          repository: '.',
          revision: 'HEAD',
          rulePolicy: './policy',
          performanceEvidence: './evidence',
          rule: undefined,
          now: undefined,
        },
        callerDirectory,
      ),
    ).toStrictEqual({
      command: 'check',
      kind: 'committed',
      repository: callerDirectory + '/.',
      revision: 'HEAD',
      rulePolicy: callerDirectory + '/./policy',
      performanceEvidence: callerDirectory + '/./evidence',
      rule: undefined,
      now: undefined,
    });
    expect(
      anchorRequest(
        { command: 'explain', rule: 'RULE', policy: { repository: '.', rulePolicy: './policy' } },
        callerDirectory,
      ),
    ).toStrictEqual({
      command: 'explain',
      rule: 'RULE',
      policy: { repository: callerDirectory + '/.', rulePolicy: callerDirectory + '/./policy' },
    });
  });
  it('retains absolute input spellings and native parent components', () => {
    expect(anchorPath('/outside/link/../policy', callerDirectory)).toBe('/outside/link/../policy');
    expect(anchorPath('link/../policy', callerDirectory)).toBe(callerDirectory + '/link/../policy');
  });
});
