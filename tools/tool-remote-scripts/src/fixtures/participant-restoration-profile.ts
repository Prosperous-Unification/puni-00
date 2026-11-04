import {
  INHERITED_SOURCE_CASES,
  PARTICIPANT_POLICY_CASES,
  SOURCE_RESTORATION_CASES,
  type SourceRestorationCase,
} from './participant-source-restoration-cases';

export type RestorationGroup = 'source' | 'policy';
export interface RestorationCase {
  readonly kind: SourceRestorationCase;
  readonly name: string;
}
const inheritedProfile = Object.freeze({
  group: 'source' as const,
  operationMs: 300000,
  modelMs: 300000,
  abortMs: 310000,
  parentMs: 320000,
});
const policyProfile = Object.freeze({
  group: 'policy' as const,
  operationMs: 465000,
  modelMs: 495000,
  abortMs: 505000,
  parentMs: 525000,
});

/** Selects only a fixed catalog kind; unknown kinds never inherit a timing allowance. */
export function readRestorationProfile(kind: SourceRestorationCase) {
  switch (kind) {
    case 'policy-released':
    case 'policy-name':
    case 'policy-count':
    case 'policy-pid':
    case 'policy-listener':
    case 'policy-readback-fence':
    case 'policy-published-record':
    case 'policy-ready':
      return policyProfile;
    case 'ready':
    case 'admission':
    case 'released':
    case 'record-missing':
    case 'record-unreadable':
    case 'record-replacement':
    case 'record-rebased':
    case 'dev-gateway':
    case 'dev-mcp':
    case 'dev-frontend':
    case 'dev-helper':
    case 'dev-foreign':
    case 'dev-ticks':
    case 'dev-executable':
    case 'prod-source':
    case 'backend-drift':
    case 'gateway-drift':
    case 'solver-drift':
    case 'source-after-authority':
    case 'ready-missing':
    case 'late-fence':
    case 'selected':
    case 'listener-after-ready':
      return inheritedProfile;
    default:
      throw new Error('restoration case profile unknown');
  }
}

/** Validates complete fixed ownership before Bun registration or any peer/child creation. */
export function assertRestorationCases(group: string, cases: readonly RestorationCase[]): void {
  if (group !== 'source' && group !== 'policy') throw new Error('restoration parent group unknown');
  const allCases: readonly RestorationCase[] = SOURCE_RESTORATION_CASES;
  const expected = group === 'policy' ? PARTICIPANT_POLICY_CASES : INHERITED_SOURCE_CASES;
  const count = group === 'policy' ? 8 : 23;
  if (cases.length !== count || expected.length !== count || allCases.length !== 31)
    throw new Error('restoration case ownership incomplete');
  const kinds = new Set<string>();
  const names = new Set<string>();
  for (const [index, scenario] of cases.entries()) {
    if (
      scenario.kind !== expected[index]?.kind ||
      scenario.name !== expected[index]?.name ||
      readRestorationProfile(scenario.kind).group !== group ||
      kinds.has(scenario.kind) ||
      names.has(scenario.name)
    )
      throw new Error('restoration case ownership differs');
    kinds.add(scenario.kind);
    names.add(scenario.name);
  }
  const allKinds = new Set(SOURCE_RESTORATION_CASES.map(({ kind }) => kind));
  const allNames = new Set(SOURCE_RESTORATION_CASES.map(({ name }) => name));
  if (allKinds.size !== 31 || allNames.size !== 31)
    throw new Error('restoration case ownership duplicates');
}

/** Policy D originates before fixture work; inherited cases retain their later fixture-local deadline. */
export function captureRestorationDeadline(kind: SourceRestorationCase): number | undefined {
  const profile = readRestorationProfile(kind);
  return profile.group === 'policy' ? performance.now() + profile.operationMs : undefined;
}
