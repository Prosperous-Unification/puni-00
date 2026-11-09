import { isAbsolute, sep } from 'node:path';

import type { Request } from './validator-request';

/** Anchor a host input without collapsing symlink/parent components or repairing absolute pins. */
export function anchorPath(path: string, callerDirectory: string): string {
  // Proof: lexical resolve here reads the wrong symlink/parent file in the actual child test.
  return isAbsolute(path) ? path : callerDirectory + sep + path;
}

type StringKey<Value> = {
  [Key in keyof Value]-?: Value[Key] extends string | undefined ? Key : never;
}[keyof Value];

function anchorFields<Value extends Request>(
  request: Value,
  fields: readonly StringKey<Value>[],
  callerDirectory: string,
): Value {
  const anchored = { ...request };
  for (const field of fields) {
    const value = request[field];
    if (typeof value === 'string') Reflect.set(anchored, field, anchorPath(value, callerDirectory));
  }
  return anchored;
}

const documents = [
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
] as const;
const browserAuthorities = [
  'reviewAuthority',
  'conformanceAuthority',
  'architectureAuthority',
  'performanceAuthority',
] as const;

/**
 * Preserve caller-relative host inputs while the validator runs in its trusted directory.
 * Repository selectors (map/source/subject), opaque identities and already absolute-only
 * authority/report inputs remain verbatim for their existing validation and digest contracts.
 * Workflow binding uses explicit caller context for both its file and prompt root instead.
 */
export function anchorRequest(request: Request, callerDirectory: string): Request {
  switch (request.command) {
    case 'validate-progress-receipt':
      return anchorFields(request, ['receipt', 'planReference', 'tasks'], callerDirectory);
    case 'validate-plan-tasks':
      return anchorFields(request, ['planReference', 'tasks'], callerDirectory);
    case 'validate-record':
    case 'validate':
      return anchorFields(request, ['record'], callerDirectory);
    case 'validate workflow-binding':
      return request;
    case 'read-candidate':
    case 'check-indexes':
    case 'check-root-migration':
    case 'scenario':
    case 'inspect-bun-test-reports':
    case 'inspect-spec-sources':
      return anchorFields(request, ['repository'], callerDirectory);
    case 'classify-candidate':
      return anchorFields(request, ['repository', 'policy'], callerDirectory);
    case 'content-manifest':
      return anchorFields(request, ['repository', 'policy', 'request'], callerDirectory);
    case 'validate-artifacts':
      return anchorFields(request, ['repository', 'policy', 'graph'], callerDirectory);
    case 'extract-relationships':
      return anchorFields(request, ['repository', 'request'], callerDirectory);
    case 'validate-review-provenance':
      return anchorFields(request, ['journal', 'evidence'], callerDirectory);
    case 'freeze-exhaustive':
      return anchorFields(request, ['repository', ...documents], callerDirectory);
    case 'verify-exhaustive':
      return anchorFields(request, ['repository', ...documents, 'plan'], callerDirectory);
    case 'evaluate-exhaustive-coverage':
      return anchorFields(request, ['repository', ...documents, 'plan', 'audit'], callerDirectory);
    case 'lint-local':
      return anchorFields(request, ['repository', 'binding', 'evidence'], callerDirectory);
    case 'lint-ci':
      return anchorFields(request, ['repository', 'evidence'], callerDirectory);
    case 'validate-policy-activation':
      return anchorFields(
        request,
        ['repository', 'previousBinding', 'nextBinding'],
        callerDirectory,
      );
    case 'check':
      return anchorFields(
        request,
        ['repository', 'rulePolicy', 'performanceEvidence'],
        callerDirectory,
      );
    case 'explain':
      return {
        ...request,
        policy:
          request.policy === undefined
            ? undefined
            : {
                repository: anchorPath(request.policy.repository, callerDirectory),
                rulePolicy: anchorPath(request.policy.rulePolicy, callerDirectory),
              },
      };
    case 'template':
      return request.action === 'verify'
        ? anchorFields(request, ['repository'], callerDirectory)
        : request;
    case 'inspect-evaluation-coverage':
      return anchorFields(request, ['repository', 'rulePolicy', 'coverageReview'], callerDirectory);
    case 'inspect-performance-levels':
      return anchorFields(request, ['repository', 'rulePolicy', 'factsAuthority'], callerDirectory);
    case 'inspect-performance-scenarios':
    case 'inspect-scenario-ledger':
      return anchorFields(request, ['repository', 'rulePolicy', 'levelAuthority'], callerDirectory);
    case 'inspect-level-facts':
      return anchorFields(request, ['repository', 'authority'], callerDirectory);
    case 'inspect-browser-performance':
    case 'inspect-browser-architecture':
    case 'inspect-browser-conformance':
    case 'inspect-browser-memberships':
      return anchorFields(request, ['repository', 'rulePolicy', 'authority'], callerDirectory);
    case 'inspect-browser-scenarios':
    case 'inspect-browser-source-levels':
    case 'inspect-browser-levels':
      return anchorFields(
        request,
        ['repository', 'rulePolicy', ...browserAuthorities],
        callerDirectory,
      );
    case 'inspect-performance':
    case 'inspect-performance-sources':
    case 'inspect-test-reports':
    case 'inspect-test-sources':
    case 'inspect-manual':
    case 'inspect-manual-observation':
    case 'inspect-browser-t2':
    case 'inspect-browser-t2-policy':
    case 'inspect-browser-scenario-ledger':
      return anchorFields(request, ['repository', 'rulePolicy'], callerDirectory);
  }
}
