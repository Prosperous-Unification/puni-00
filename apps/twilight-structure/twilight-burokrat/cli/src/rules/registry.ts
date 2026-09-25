import { classifyEntries } from '../inventory/classify-entries';
import { readCandidateBlob } from '../inventory/read-blob';
import {
  type Direction,
  directionObservations,
  type ImportEdge,
  reactObservations,
  resolvePlainSelectors,
  sidewaysObservations,
} from './direction';
import type { KindGraph } from './kinds';
import { moduleLayoutObservations } from './kinds';
import {
  evaluateWrapped,
  type RegisteredRule,
  type RuleContext,
  type RuleObservation,
} from './rule';
import { measureSizes } from './size-ratchet';

const SpecSource = 'openspec/changes/twilight-burokrat-rule-model/specs/burokrat-rules/spec.md';
const KindSpecSource = 'openspec/changes/twilight-burokrat-kind-rules/specs/burokrat-rules/spec.md';

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
      // Proof: on 2026-09-20, skipping classification made an unclassifiable candidate exit 0;
      // the adapter test expected exit 1 and received 0.
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
          // Proof: on 2026-09-20, replacing this mapping with an empty list made the adapter test
          // receive no finding instead of the exact 41-entry debt record.
          observations: context.indexes.report.reviewDebt.map((debt) => ({
            path: debt.indexPath,
            message: `index declares ${String(debt.directEntries)} direct entries, limit ${String(debt.limit)}`,
          })),
        }
      : {
          // The limit was never judged, so no mode may report this rule as clean.
          // Proof: on 2026-09-20, returning an empty observed list here made a failed index
          // prerequisite exit 0; the adapter test expected exit 1 and received 0.
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

const moduleLayoutRule: RegisteredRule = {
  id: 'MOD-LAYOUT',
  family: 'modules',
  statement: 'A module directory declares the wiki index and the contract the module layout names.',
  source: `${KindSpecSource}#requirement-module-layout`,
  inputs: ['candidate.entries'],
  evaluate: (context) =>
    context.indexes.ok
      ? {
          kind: 'observed',
          observations: moduleLayoutObservations(
            context.kinds,
            context.candidate.entries,
            new Set(context.indexes.report.indexes.map((index) => index.indexPath)),
          ),
        }
      : // Proof: on 2026-09-20, reporting an empty observed list here made the malformed-index
        // test expect exit 1 and receive 0.
        {
          kind: 'not-evaluated',
          reason: `the index report is unavailable: ${context.indexes.reason}`,
        },
};

const relationshipsRule: RegisteredRule = {
  id: 'REL-EXTRACT',
  family: 'relationships',
  statement: 'Every declared relationship of the candidate resolves to an extracted selector.',
  source: `${SpecSource}#requirement-relationship-resolution`,
  inputs: ['candidate.entries', 'policy.relationshipRequest'],
  evaluate: (context) => {
    const outcome = context.relationships();
    if (!outcome.ok) return { kind: 'not-evaluated', reason: outcome.reason };
    // Proof: on 2026-09-20, replacing the unresolved mapping with an empty list made the adapter
    // test receive `findings: []` instead of the declared relationship debt.
    return {
      kind: 'observed',
      observations: outcome.report.declarations.unresolved.map((unresolved) => ({
        path: '.',
        subject: unresolved.relationshipId,
        message: `declared relationship is unresolved: ${unresolved.reason}`,
      })),
    };
  },
};

const sizeRatchetRule: RegisteredRule = {
  id: 'F7',
  family: 'code-shape',
  statement:
    'A production source file does not grow past the size ceiling, and a file already above it only shrinks.',
  source: `${KindSpecSource}#requirement-source-file-size-is-ratcheted`,
  inputs: ['candidate.entries', 'policy.sizeCeilings'],
  evaluate: (context) => {
    const ceilings = context.sizeCeilings;
    if (ceilings === undefined) {
      return { kind: 'not-evaluated', reason: 'the rule policy carries no size ceilings' };
    }
    const measured = measureSizes(context.repository, context.candidate.entries, ceilings);
    return measured.ok
      ? { kind: 'observed', observations: measured.report }
      : { kind: 'not-evaluated', reason: measured.reason };
  },
};

function graphRule(
  id: string,
  family: string,
  statement: string,
  anchor: string,
  inputs: readonly string[],
  observe: (
    graph: KindGraph,
    imports: readonly ImportEdge[],
    context: RuleContext,
  ) => readonly RuleObservation[],
): RegisteredRule {
  return {
    id,
    family,
    statement,
    source: `${KindSpecSource}${anchor}`,
    inputs,
    evaluate: (context) => {
      const outcome = context.relationships();
      // Proof: on 2026-09-20, reporting an empty observed list when extraction failed made the
      // unconfigured-modules test expect exit 1 and receive 0.
      if (!outcome.ok) return { kind: 'not-evaluated', reason: outcome.reason };
      return {
        kind: 'observed',
        observations: observe(context.kinds, outcome.report.typescript.imports, context),
      };
    },
  };
}

const DirectionAnchor = '#requirement-kind-direction-over-the-import-graph';
const GraphInputs = ['candidate.entries', 'policy.relationshipRequest'];

function directionRule(id: string, statement: string, direction: Direction): RegisteredRule {
  return graphRule(id, 'relationships', statement, DirectionAnchor, GraphInputs, (graph, imports) =>
    directionObservations(graph, imports, direction),
  );
}

const kindDirectionRules: readonly RegisteredRule[] = [
  directionRule(
    'K2',
    'Delivery imports feature-services and never a resource-service or a repository.',
    // Proof: on 2026-09-20, forbidding nothing made the delivery-resource test expect one finding
    // and receive none.
    { from: 'delivery', forbidden: ['resource', 'repository'] },
  ),
  directionRule(
    'K3',
    'A feature-service imports resource-services and never a repository or delivery, through a barrel or directly.',
    // Proof: on 2026-09-20, omitting delivery made the delivery-import test receive
    // `findings: []` instead of the expected K3 finding.
    { from: 'feature', forbidden: ['repository', 'delivery'] },
  ),
  directionRule(
    'K4',
    'A resource-service imports repository ports and never a feature-service or delivery.',
    // Proof: on 2026-09-20, omitting feature made the feature-import test receive
    // `findings: []` instead of the expected K4 finding.
    { from: 'resource', forbidden: ['feature', 'delivery'] },
  ),
  directionRule(
    'K5',
    'A repository adapter imports nothing above it: no resource-service, no feature-service and no delivery.',
    // Proof: on 2026-09-20, forbidding only delivery made the repository-resource test expect one
    // finding and receive none.
    { from: 'repository', forbidden: ['resource', 'feature', 'delivery'] },
  ),
  graphRule(
    'K6',
    'relationships',
    'No kind imports a sibling of the same kind from another module.',
    DirectionAnchor,
    GraphInputs,
    sidewaysObservations,
  ),
];

const plainTypeScriptRule: RegisteredRule = {
  id: 'F1',
  // Proof: on 2026-09-20, changing this to `relationships` made the explain test expect
  // `code-shape` and receive `relationships`.
  family: 'code-shape',
  statement:
    'A service, store or geometry module is plain TypeScript and never imports a React package.',
  source: `${KindSpecSource}#requirement-services-are-plain-typescript`,
  inputs: ['candidate.entries', 'policy.plainTypeScriptPaths', 'policy.relationshipRequest'],
  evaluate: (context) => {
    const selectors = context.plainTypeScriptPaths;
    if (selectors === undefined) {
      return {
        kind: 'not-evaluated',
        reason: 'the rule policy declares no plain TypeScript paths',
      };
    }
    const resolved = resolvePlainSelectors(
      selectors,
      new Set(context.candidate.entries.map((entry) => entry.path)),
    );
    if (!resolved.ok) return { kind: 'not-evaluated', reason: resolved.reason };
    const outcome = context.relationships();
    if (!outcome.ok) return { kind: 'not-evaluated', reason: outcome.reason };
    return {
      kind: 'observed',
      observations: reactObservations(context.kinds, outcome.report.typescript.imports, selectors),
    };
  },
};

const rules: readonly RegisteredRule[] = [
  classificationRule,
  directEntriesRule,
  moduleIndexRule,
  moduleLayoutRule,
  relationshipsRule,
  sizeRatchetRule,
  plainTypeScriptRule,
  ...kindDirectionRules,
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
