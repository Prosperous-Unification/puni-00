import type { EstimateUnit } from '../stored-vocabularies';

/** One decoded coded legacy step captured with its current organization. */
export interface CodedReportStep {
  readonly id: string;
  readonly organizationId: string;
  readonly code: string;
  readonly name: string;
  readonly estimateUnit: EstimateUnit;
  readonly allowanceBps: number;
  /** Null is the recorded pre-audit state and sorts after every timestamp. */
  readonly createdAt: number | null;
}

export type SharedStepCodeIssue =
  | {
      readonly kind: 'shared_code_identical';
      readonly organizationId: string;
      readonly code: string;
      readonly survivorStepId: string;
      readonly stepIds: readonly string[];
    }
  | {
      readonly kind: 'shared_code';
      readonly organizationId: string;
      readonly code: string;
      readonly differingFields: readonly ('name' | 'estimateUnit' | 'allowanceBps')[];
      readonly steps: readonly {
        readonly id: string;
        readonly name: string;
        readonly estimateUnit: EstimateUnit;
        readonly allowanceBps: number;
      }[];
    };

/** SQLite BINARY's UTF8 order for captured valid text; locale never selects a survivor. */
function compareText(left: string, right: string): number {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(left).values();
  for (const byte of encoder.encode(right)) {
    const next = bytes.next();
    if (next.done) return -1;
    if (next.value !== byte) return next.value - byte;
  }
  return bytes.next().done ? 0 : 1;
}

function compareSteps(left: CodedReportStep, right: CodedReportStep): number {
  if (left.createdAt === null && right.createdAt !== null) return 1;
  if (left.createdAt !== null && right.createdAt === null) return -1;
  if (left.createdAt !== null && right.createdAt !== null) {
    const time = left.createdAt - right.createdAt;
    if (time !== 0) return time;
  }
  return compareText(left.id, right.id);
}

/**
 * Classifies shared codes only: equal name/unit/allowance is informational, otherwise a
 * survivor rule is required. Audit revisions and positions do not change those three values.
 * Single codes and uncoded steps are outside this classifier, not missing definitions.
 * Inputs are decoded, organization-attributed store facts; this function mutates no input.
 * All arrays are detached; survivor order is createdAt (null last), then binary identity.
 */
export function classifySharedStepCodes(
  captured: readonly CodedReportStep[],
): readonly SharedStepCodeIssue[] {
  const organizations = new Map<
    string,
    Map<string, { readonly first: CodedReportStep; readonly members: CodedReportStep[] }>
  >();
  for (const step of captured) {
    let codes = organizations.get(step.organizationId);
    if (codes === undefined) {
      codes = new Map();
      organizations.set(step.organizationId, codes);
    }
    const group = codes.get(step.code);
    if (group === undefined) codes.set(step.code, { first: step, members: [step] });
    else group.members.push(step);
  }
  const issues: SharedStepCodeIssue[] = [];
  for (const [organizationId, codes] of organizations) {
    for (const [code, group] of codes) {
      if (group.members.length < 2) continue;
      const ordered = [...group.members].sort(compareSteps);
      const first = group.members.reduce(
        (selected, step) => (compareSteps(step, selected) < 0 ? step : selected),
        group.first,
      );
      const differingFields: ('name' | 'estimateUnit' | 'allowanceBps')[] = [];
      for (const field of ['name', 'estimateUnit', 'allowanceBps'] as const)
        if (ordered.some((step) => step[field] !== first[field])) differingFields.push(field);
      if (differingFields.length === 0) {
        issues.push({
          kind: 'shared_code_identical',
          organizationId,
          code,
          survivorStepId: first.id,
          stepIds: ordered.map((step) => step.id).sort(compareText),
        });
      } else {
        issues.push({
          kind: 'shared_code',
          organizationId,
          code,
          differingFields,
          steps: ordered.map((step) => ({
            id: step.id,
            name: step.name,
            estimateUnit: step.estimateUnit,
            allowanceBps: step.allowanceBps,
          })),
        });
      }
    }
  }
  return issues.sort(
    (left, right) =>
      compareText(left.organizationId, right.organizationId) || compareText(left.code, right.code),
  );
}
