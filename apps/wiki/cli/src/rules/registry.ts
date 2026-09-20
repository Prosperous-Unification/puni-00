import { classifyEntries } from '../inventory/classify-entries';
import { readCandidateBlob } from '../inventory/read-blob';
import { extractRelationships } from '../relationships';
import { evaluateWrapped, type RegisteredRule } from './rule';

const SpecSource = 'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md';

const classificationRule: RegisteredRule = {
  id: 'INV-CLASSIFY',
  family: 'inventory',
  statement: 'Every tracked entry is classified by exactly one rule of the classification policy.',
  source: `${SpecSource}#requirement-inventory-classification`,
  inputs: ['candidate.entries', 'policy.classificationPolicy'],
  evaluate: (context) => {
    const classificationPolicy = context.classificationPolicy;
    if (classificationPolicy === undefined) {
      return { kind: 'not-evaluated', reason: 'the rule policy carries no classification policy' };
    }
    return evaluateWrapped(() => {
      classifyEntries(context.candidate.entries, classificationPolicy, (blob, path) =>
        readCandidateBlob(context.repository, blob, path),
      );
      return [];
    });
  },
};

const directEntriesRule: RegisteredRule = {
  id: 'MOD-DIRECT-ENTRIES',
  family: 'modules',
  statement: 'A module index declares no more direct entries than the reviewed limit.',
  source: `${SpecSource}#requirement-module-index-direct-entry-limit`,
  inputs: ['candidate.entries'],
  evaluate: (context) =>
    context.indexes.ok
      ? {
          kind: 'observed',
          observations: context.indexes.report.reviewDebt.map((debt) => ({
            path: debt.indexPath,
            message: `index declares ${String(debt.directEntries)} direct entries, limit ${String(debt.limit)}`,
          })),
        }
      : {
          // The limit was never judged, so no mode may report this rule as clean.
          kind: 'not-evaluated',
          reason: `the index report is unavailable: ${context.indexes.reason}`,
        },
};

const moduleIndexRule: RegisteredRule = {
  id: 'MOD-INDEX',
  family: 'modules',
  statement:
    'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
  source: `${SpecSource}#requirement-module-index-declarations`,
  inputs: ['candidate.entries'],
  // `checkIndexes` returns nothing when it is satisfied and throws when it is not, so this rule
  // produces no finding in slice B0; see the rule model's failure policy.
  evaluate: (context) =>
    context.indexes.ok
      ? { kind: 'observed', observations: [] }
      : { kind: 'not-evaluated', reason: context.indexes.reason },
};

const relationshipsRule: RegisteredRule = {
  id: 'REL-EXTRACT',
  family: 'relationships',
  statement: 'Every declared relationship of the candidate resolves to an extracted selector.',
  source: `${SpecSource}#requirement-relationship-resolution`,
  inputs: ['candidate.entries', 'policy.relationshipRequest'],
  evaluate: (context) => {
    const relationshipRequest = context.relationshipRequest;
    if (relationshipRequest === undefined) {
      return { kind: 'not-evaluated', reason: 'the rule policy carries no relationship request' };
    }
    return evaluateWrapped(() =>
      extractRelationships(
        context.repository,
        context.candidate,
        relationshipRequest,
      ).declarations.unresolved.map((unresolved) => ({
        path: '.',
        subject: unresolved.relationshipId,
        message: `declared relationship is unresolved: ${unresolved.reason}`,
      })),
    );
  },
};

const rules: readonly RegisteredRule[] = [
  classificationRule,
  directEntriesRule,
  moduleIndexRule,
  relationshipsRule,
];

/** The registry, sorted by identifier so a verdict's rule list is stable. */
export function registeredRules(): readonly RegisteredRule[] {
  return [...rules].sort((left, right) => (left.id < right.id ? -1 : 1));
}

export function findRule(ruleId: string): RegisteredRule | undefined {
  return rules.find((rule) => rule.id === ruleId);
}

/** Every registered identifier, for a refusal that has to name the alternatives. */
export function registeredIds(): string {
  return registeredRules()
    .map((rule) => rule.id)
    .join(', ');
}
