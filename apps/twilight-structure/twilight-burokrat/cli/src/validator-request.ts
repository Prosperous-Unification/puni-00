import { isAbsolute } from 'node:path';

import { parseSecretsOrThrow, type } from '@shared/validation';

import type { InstalledCommand } from './cli-parser';

/** Installed operations whose execution belongs to the verified validator child. */
export type Request = Exclude<
  InstalledCommand,
  { command: 'lint' | 'prepare-activation' | 'prepare-relocation-activation' }
>;

/** Proof: weakening string/nonblank validation admits wrong-type/blank field negatives. */
const operand = type('string').narrow((value) => /\S/u.test(value));
const optionalOperand = operand.or('undefined');
/**
 * Invalid Date may throw; decodeRequest normalizes that validation failure without its source.
 * Proof: dropping round-trip equality admits February 30 in the transport negative.
 */
const instant = operand.narrow((value) => {
  const millis = Date.parse(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(millis).toISOString() === canonical;
});
/** Proof: deleting nonempty, code-syntax or unique checks admits its distinct catalogue negative. */
const steps = operand
  .array()
  .narrow(
    (codes) =>
      codes.length > 0 &&
      codes.every((code) => /^\S+$/u.test(code)) &&
      new Set(codes).size === codes.length,
  );
/** Proof: dropping this restriction admits the outside.md transport negative. */
const sourcePath = operand.narrow((value) =>
  /^openspec\/(?:changes\/[a-z0-9-]+\/specs\/|specs\/)[a-z0-9-]+\/spec\.md$/u.test(value),
);

/**
 * Proof: independently removing all 52 closed-object guards, 293 required-field guards and
 * 75 selection literals across this schema/envelope failed the corresponding transport
 * refusal oracle (420 injected faults, restored). The tests derive requests from installed grammar.
 */
const payload = type.or(
  type({
    '+': 'reject',
    command: '"validate-progress-receipt"',
    receipt: operand,
    planReference: operand,
    tasks: operand,
  }),
  type({ '+': 'reject', command: '"validate-plan-tasks"', planReference: operand, tasks: operand }),
  type({ '+': 'reject', command: '"validate-record"', kind: operand, record: operand }),
  type({ '+': 'reject', command: '"validate workflow-binding"', file: operand, steps }),
  type({ '+': 'reject', command: '"validate"', kind: operand, record: operand }),
  type({
    '+': 'reject',
    command: '"read-candidate"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
  }),
  type({
    '+': 'reject',
    command: '"classify-candidate"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    policy: operand,
  }),
  type({
    '+': 'reject',
    command: '"content-manifest"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    policy: operand,
    request: operand,
    'reviewedIdentity?': optionalOperand,
  }),
  type({
    '+': 'reject',
    command: '"validate-artifacts"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    policy: operand,
    graph: operand,
  }),
  type({
    '+': 'reject',
    command: '"extract-relationships"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    request: operand,
  }),
  type({
    '+': 'reject',
    command: '"check-indexes"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
  }),
  type({
    '+': 'reject',
    command: '"check-root-migration"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    map: operand,
  }),
  type({
    '+': 'reject',
    command: '"validate-review-provenance"',
    journal: operand,
    evidence: operand,
    requirement: '"allow-local" | "require-external"',
  }),
  type({
    '+': 'reject',
    command: '"freeze-exhaustive"',
    inventory: operand,
    inventoryProtocol: operand,
    classificationPolicy: operand,
    contentManifestRequest: operand,
    exhaustivePolicy: operand,
    reviewProtocol: operand,
    moduleMapping: operand,
    granularityPolicy: operand,
    modelContext: operand,
    relationshipRequest: operand,
    artifactGraph: operand,
    repository: operand,
    revision: operand,
    auditSeed: operand,
  }),
  type({
    '+': 'reject',
    command: '"verify-exhaustive"',
    inventory: operand,
    inventoryProtocol: operand,
    classificationPolicy: operand,
    contentManifestRequest: operand,
    exhaustivePolicy: operand,
    reviewProtocol: operand,
    moduleMapping: operand,
    granularityPolicy: operand,
    modelContext: operand,
    relationshipRequest: operand,
    artifactGraph: operand,
    repository: operand,
    plan: operand,
    expectedIdentity: operand,
    auditSeed: operand,
  }),
  type({
    '+': 'reject',
    command: '"evaluate-exhaustive-coverage"',
    inventory: operand,
    inventoryProtocol: operand,
    classificationPolicy: operand,
    contentManifestRequest: operand,
    exhaustivePolicy: operand,
    reviewProtocol: operand,
    moduleMapping: operand,
    granularityPolicy: operand,
    modelContext: operand,
    relationshipRequest: operand,
    artifactGraph: operand,
    repository: operand,
    plan: operand,
    expectedIdentity: operand,
    auditSeed: operand,
    audit: operand,
  }),
  type({
    '+': 'reject',
    command: '"lint-local"',
    mode: operand,
    kind: operand,
    repository: operand,
    revision: operand,
    binding: operand,
    evidence: operand,
  }),
  type({
    '+': 'reject',
    command: '"lint-ci"',
    kind: operand,
    repository: operand,
    revision: operand,
    evidence: operand,
  }),
  type({
    '+': 'reject',
    command: '"validate-policy-activation"',
    repository: operand,
    previousBinding: operand,
    nextBinding: operand,
  }),
  type({
    '+': 'reject',
    command: '"check"',
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
    'rule?': optionalOperand,
    'performanceEvidence?': optionalOperand,
    'now?': instant.or('undefined'),
  }),
  type({
    '+': 'reject',
    command: '"explain"',
    rule: operand,
    'policy?': type({ '+': 'reject', repository: operand, rulePolicy: operand }).or('undefined'),
  }),
  type({
    '+': 'reject',
    command: '"scenario"',
    action: '"import"',
    repository: operand,
    source: sourcePath,
  }),
  type({
    '+': 'reject',
    command: '"scenario"',
    action: '"validate"',
    repository: operand,
    source: sourcePath,
  }),
  type({
    '+': 'reject',
    command: '"scenario"',
    action: '"allocate"',
    repository: operand,
    source: sourcePath,
    'predecessor?': optionalOperand,
  }),
  type({ '+': 'reject', command: '"template"', action: '"list"' }),
  type({ '+': 'reject', command: '"template"', action: '"show"', template: operand }),
  type({
    '+': 'reject',
    command: '"template"',
    action: '"verify"',
    template: operand,
    kind: '"committed" | "staged" | "working"',
    repository: operand,
    revision: operand,
    subject: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-evaluation-coverage"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
    coverageReview: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-performance"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-performance-sources"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-performance-levels"',
    repository: operand,
    revision: operand,
    factsAuthority: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-performance-scenarios"',
    levelAuthority: operand,
    capability: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-scenario-ledger"',
    levelAuthority: operand,
    capability: operand,
    ledgerAuthority: operand,
    now: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-level-facts"',
    repository: operand,
    revision: operand,
    authority: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-bun-test-reports"',
    repository: operand,
    revision: operand,
    reportAuthority: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-test-reports"',
    mode: '"ordinary" | "packaged" | "portable"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-test-sources"',
    mode: '"ordinary" | "packaged" | "portable"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-spec-sources"',
    repository: operand,
    revision: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-manual"',
    report: operand,
    now: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-manual-observation"',
    report: operand,
    now: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-performance"',
    mode: '"ordinary" | "packaged" | "portable"',
    authority: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-architecture"',
    mode: '"ordinary" | "packaged" | "portable"',
    authority: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-conformance"',
    mode: '"ordinary" | "packaged" | "portable"',
    authority: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-memberships"',
    mode: '"ordinary" | "packaged" | "portable"',
    authority: operand,
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-scenarios"',
    capability: operand,
    reviewAuthority: operand,
    conformanceAuthority: operand,
    architectureAuthority: operand,
    performanceAuthority: operand,
    mode: '"ordinary" | "packaged" | "portable"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-source-levels"',
    reviewAuthority: operand,
    conformanceAuthority: operand,
    architectureAuthority: operand,
    performanceAuthority: operand,
    mode: '"ordinary" | "packaged" | "portable"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-levels"',
    reviewAuthority: operand,
    conformanceAuthority: operand,
    architectureAuthority: operand,
    performanceAuthority: operand,
    mode: '"ordinary" | "packaged" | "portable"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-t2"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
    capability: operand,
    ledgerAuthority: operand,
    now: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-t2-policy"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
    capability: operand,
    ledgerAuthority: operand,
    proposedPolicy: operand,
    now: operand,
  }),
  type({
    '+': 'reject',
    command: '"inspect-browser-scenario-ledger"',
    repository: operand,
    revision: operand,
    rulePolicy: operand,
    capability: operand,
    ledgerAuthority: operand,
    now: operand,
  }),
);

/** Proof: accepting version2 or a relative caller directory fails its envelope negative. */
const envelope = type({
  '+': 'reject',
  version: '1',
  callerDirectory: type('string').narrow(isAbsolute),
  // Proof: removing this requirement loses the fixed malformed-envelope refusal for absent request.
  request: payload,
});

export interface Invocation {
  readonly version: 1;
  readonly callerDirectory: string;
  readonly request: Request;
}

/**
 * Decode the versioned installed-only transport, restoring explicit undefined fields omitted by
 * JSON. Closed nested shapes reject both source-only operations and unexpected properties.
 * Malformed transport throws a fixed diagnostic without request bytes or schema details.
 * Unexpected failures after validated decoding propagate as trusted internal faults.
 */
export function decodeRequest(source: string | Uint8Array): Invocation {
  let checked: typeof envelope.infer;
  try {
    // Proof: nonfatal decoding dispatches invalid-byte input; the actual stdin test fails.
    const text =
      typeof source === 'string'
        ? source
        : new TextDecoder('utf-8', { fatal: true }).decode(source);
    const input: unknown = JSON.parse(text);
    checked = parseSecretsOrThrow(envelope, input);
  } catch {
    throw new Error('invalid installed validator request');
  }
  const request = checked.request;
  // Proof: returning the decoded object unchanged fails exact optional-field round trips.
  // JSON omits undefined-valued properties; Optique returns them as own properties. Restore
  // that typed contract only after the closed shape has refused malformed values.
  switch (request.command) {
    case 'check':
      return {
        ...checked,
        request: {
          ...request,
          rule: request.rule,
          performanceEvidence: request.performanceEvidence,
          now: request.now,
        },
      };
    case 'explain':
      return { ...checked, request: { ...request, policy: request.policy } };
    case 'content-manifest':
      return { ...checked, request: { ...request, reviewedIdentity: request.reviewedIdentity } };
    case 'scenario':
      return request.action === 'allocate'
        ? { ...checked, request: { ...request, predecessor: request.predecessor } }
        : { ...checked, request };
    default:
      return { ...checked, request };
  }
}
