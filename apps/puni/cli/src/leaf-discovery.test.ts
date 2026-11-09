import type { Usage, UsageTerm } from '@optique/core';
import { describe, expect, it } from 'bun:test';

import { parser, readInvocation, UsageRefusal } from './cli-parser';

interface Leaf {
  readonly words: readonly string[];
  readonly terms: Usage;
}

function findLeaves(terms: Usage, words: readonly string[] = []): Leaf[] {
  const first = terms.at(0);
  if (first?.type === 'command') return findLeaves(terms.slice(1), [...words, first.name]);
  if (
    first?.type === 'exclusive' &&
    first.terms.some((branch) => ['command', 'exclusive'].includes(branch.at(0)?.type ?? ''))
  )
    return first.terms.flatMap((branch) => findLeaves([...branch, ...terms.slice(1)], words));
  return words.length === 0 ? [] : [{ words, terms }];
}

function findOptions(terms: Usage): string[] {
  return terms.flatMap((term: UsageTerm): string[] => {
    if (term.type === 'option') return [...term.names];
    if (term.type === 'exclusive') return term.terms.flatMap(findOptions);
    if (term.type === 'optional' || term.type === 'multiple' || term.type === 'sequence')
      return findOptions(term.terms);
    return [];
  });
}

const expectedLeaves = {
  navigator: ['admit-progress', 'plan-reference', 'receipt-to-commands'],
  burokrat: [
    'check',
    'check-indexes',
    'check-root-migration',
    'classify-candidate',
    'content-manifest',
    'evaluate-exhaustive-coverage',
    'explain',
    'extract-relationships',
    'freeze-exhaustive',
    'inspect-browser-architecture',
    'inspect-browser-conformance',
    'inspect-browser-levels',
    'inspect-browser-memberships',
    'inspect-browser-performance',
    'inspect-browser-scenario-ledger',
    'inspect-browser-scenarios',
    'inspect-browser-source-levels',
    'inspect-browser-t2',
    'inspect-browser-t2-policy',
    'inspect-bun-test-reports',
    'inspect-evaluation-coverage',
    'inspect-level-facts',
    'inspect-manual',
    'inspect-manual-observation',
    'inspect-performance',
    'inspect-performance-levels',
    'inspect-performance-scenarios',
    'inspect-performance-sources',
    'inspect-scenario-ledger',
    'inspect-spec-sources',
    'inspect-test-reports',
    'inspect-test-sources',
    'lint',
    'lint-ci',
    'lint-local',
    'prepare-activation',
    'prepare-relocation-activation',
    'read-candidate',
    'scenario allocate',
    'scenario import',
    'scenario validate',
    'template list',
    'template show',
    'template verify',
    'validate',
    'validate workflow-binding',
    'validate-artifacts',
    'validate-plan-tasks',
    'validate-policy-activation',
    'validate-progress-receipt',
    'validate-record',
    'validate-review-provenance',
    'verify-exhaustive',
  ],
  dash: [
    'account-outcomes',
    'bootstrap-authority',
    'bootstrap-observation',
    'inspect-authority',
    'mcp token',
    'migrate-observation',
    'ops job admission',
    'ops job audit',
    'ops job calibrate',
    'ops job propose',
    'ops job render-audit-units',
    'ops job run',
    'ops job status',
    'ops outbox drop',
    'ops pool init',
    'ops pool inspect',
    'ops pool switch-mode',
    'ops release plan',
    'ops release run',
    'plan-enrollment',
    'pool import',
    'record-progress',
    'record-progress-v2',
    'recover-publication',
    'render-observation-units',
    'report-capacity',
    'resources cleanup',
    'resources create',
    'resources exec',
    'resources init',
    'resources inspect',
    'resources run',
    'resources sweep',
    'resources sync',
    'resources watch',
    'run-activation-checks',
    'submit-admission',
  ],
};

const leaves = findLeaves(parser.usage);

describe('complete installed grammar discovery through PUNI', () => {
  it('retains every declared installed leaf without source-only operations', () => {
    const expected = Object.entries(expectedLeaves)
      .flatMap(([namespace, paths]) => paths.map((path) => namespace + ' ' + path))
      .sort();
    expect(leaves.map(({ words }) => words.join(' ')).sort()).toEqual(expected);
  });

  for (const leaf of leaves) {
    const name = leaf.words.join(' ');
    it(name + ' help and dynamic completion describe every declared option', () => {
      let help = '';
      expect(
        readInvocation([...leaf.words, '--help'], (chunk) => {
          help += chunk;
        }),
      ).toEqual({ kind: 'printed' });
      expect(help).toContain('Usage: puni ' + name);
      expect(help).not.toContain('[...]');
      let completion = '';
      expect(
        readInvocation(['completion', 'bash', ...leaf.words, '--'], (chunk) => {
          completion += chunk;
        }),
      ).toEqual({ kind: 'printed' });
      for (const option of findOptions(leaf.terms)) {
        expect(help, name).toContain(option);
        expect(completion, name).toContain(option);
      }
    });

    it(name + ' refuses an unknown option before operation IO', () => {
      expect(() =>
        readInvocation([...leaf.words, '--no-such-puni-option'], () => {
          throw new Error('invalid arguments printed discovery');
        }),
      ).toThrow(UsageRefusal);
    });
  }
});
