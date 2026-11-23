import { isAbsolute } from 'node:path';

import { parseSecretsOrThrow, type, ValidationError } from '@shared/validation';

import type { InstalledRequest } from './cli-parser';
import { decodeJsonInput, JsonInputRefusal } from './json-input';

export type PreparationCommand = 'prepare-activation' | 'prepare-relocation-activation';
export type PreparationRequest = InstalledRequest<PreparationCommand>;

// Proof: c27-request-operands; injected fault failed `refuses private prepare-activation candidateRepository operand ""` and 71 additional named controls; restoration passed.
const operand = type('string').narrow((value) => /\S/u.test(value) && !value.includes('\0'));
// Proof: c27-request-absolute; injected fault failed `refuses malformed preparation invocation {"callerDirectory":"relative"}` and 1 additional named controls; restoration passed.
const absolute = operand.narrow((value) => isAbsolute(value));
const common = {
  // Proof: c27-request-required-candidateRepository; injected fault failed `requires private prepare-activation field candidateRepository` and 1 additional named controls; restoration passed.
  candidateRepository: operand,
  // Proof: c27-request-required-candidateSha; injected fault failed `requires private prepare-activation field candidateSha` and 1 additional named controls; restoration passed.
  candidateSha: operand,
  // Proof: c27-request-required-reviewRecord; injected fault failed `requires private prepare-activation field reviewRecord` and 1 additional named controls; restoration passed.
  reviewRecord: operand,
  // Proof: c27-request-required-destination; injected fault failed `requires private prepare-activation field destination` and 1 additional named controls; restoration passed.
  destination: operand,
  // Proof: c27-request-required-work; injected fault failed `requires private prepare-activation field work` and 1 additional named controls; restoration passed.
  work: operand,
  // Proof: c27-request-required-resourceLane; injected fault failed `requires private prepare-activation field resourceLane` and 1 additional named controls; restoration passed.
  resourceLane: operand,
  // Proof: c27-request-required-cwdIdentity; injected fault failed `requires private prepare-activation field cwdIdentity` and 1 additional named controls; restoration passed.
  cwdIdentity: operand,
  // Proof: c27-request-required-checkRuns; injected fault failed `requires private prepare-activation field checkRuns` and 1 additional named controls; restoration passed.
  checkRuns: operand,
} as const;
const activation = type({
  // Proof: c27-request-closed-activation; injected fault failed `refuses unknown prepare-activation request fields without retaining source secrets`; restoration passed.
  '+': 'reject',
  // Proof: c27-request-command-required-activation; paired command-required schema and independent role-match fence removals; not an independent single-fence proof; injected fault failed `requires private prepare-activation field command`; restoration passed.
  command: '"prepare-activation"',
  ...common,
  'toolkit?': operand,
  // Proof: c27-request-required-candidatePolicy; injected fault failed `requires private prepare-activation field candidatePolicy`; restoration passed.
  candidatePolicy: operand,
  // Proof: c27-request-required-candidateMapping; injected fault failed `requires private prepare-activation field candidateMapping`; restoration passed.
  candidateMapping: operand,
  // Proof: c27-request-required-auditStrata; injected fault failed `requires private prepare-activation field auditStrata`; restoration passed.
  auditStrata: operand,
});
const relocation = type({
  // Proof: c27-request-closed-relocation; injected fault failed `refuses unknown prepare-relocation-activation request fields without retaining source secrets`; restoration passed.
  '+': 'reject',
  // Proof: c27-request-command-required-relocation; paired command-required schema and independent role-match fence removals; not an independent single-fence proof; injected fault failed `requires private prepare-relocation-activation field command`; restoration passed.
  command: '"prepare-relocation-activation"',
  ...common,
  // Proof: c27-request-required-baseActivation; injected fault failed `requires private prepare-relocation-activation field baseActivation`; restoration passed.
  baseActivation: operand,
  'candidatePolicy?': operand,
  'candidateLauncher?': operand,
  'validatorEntry?': operand,
});
const invocation = type({
  // Proof: c27-request-closed-invocation; injected fault failed `refuses malformed preparation invocation {"secret":"source-secret-canary"}`; restoration passed.
  '+': 'reject',
  // Proof: c27-request-version; injected fault failed `refuses malformed preparation invocation {"version":2}`; restoration passed.
  // Proof: c27-request-invocation-required-version; injected fault failed `requires private invocation version`; restoration passed.
  version: '1',
  // Proof: c27-request-invocation-required-callerDirectory; injected fault failed `requires private invocation callerDirectory`; restoration passed.
  callerDirectory: absolute,
  // Proof: c27-request-invocation-required-toolkitDirectory; injected fault failed `requires private invocation toolkitDirectory`; restoration passed.
  toolkitDirectory: absolute,
  // Proof: c27-request-digest; injected fault failed `refuses malformed preparation invocation {"expectedToolkitIdentity":"not-a-digest"}`; restoration passed.
  // Proof: c27-request-invocation-required-expectedToolkitIdentity; injected fault failed `requires private invocation expectedToolkitIdentity`; restoration passed.
  expectedToolkitIdentity: /^[0-9a-f]{64}$/u,
  // Proof: c27-request-invocation-required-request; diagnostic/class boundary: missing request changes fixed PreparationUsageRefusal to internal TypeError; no independent malformed-input admission claim; injected fault failed `requires private invocation request`; restoration passed.
  request: activation.or(relocation),
});

/** Operator-selected invocation authority is distinct from the typed preparation intent. */
export interface PreparationInvocation {
  readonly version: 1;
  readonly callerDirectory: string;
  readonly toolkitDirectory: string;
  readonly expectedToolkitIdentity: string;
  readonly request: PreparationRequest;
}

/** Malformed private preparation input; no input excerpt or schema cause is retained. */
export class PreparationUsageRefusal extends Error {
  override readonly name = 'PreparationUsageRefusal';
  readonly status = 64;
}

/**
 * Decode the closed preparation transport for one specific executable role. Validate external
 * bytes once, preserve exact operand spellings and supply the grammar's explicit undefined
 * optional properties without constructing or reparsing argv. Context fields select trusted
 * operator authority; the expected digest is supplied by that invoker, never derived here.
 * @throws PreparationUsageRefusal for malformed UTF8/JSON/schema or command/role mismatch;
 * unrelated decoder or schema implementation failures retain their identity.
 */
export function decodePreparationRequest(
  source: Uint8Array,
  role: PreparationCommand,
): PreparationInvocation {
  let input: unknown;
  try {
    input = decodeJsonInput(source);
  } catch (cause) {
    // Proof: c27-request-propagate-JsonInputRefusal; injected fault failed `preserves unrelated json decoder implementation failure identity`; restoration passed.
    if (!(cause instanceof JsonInputRefusal)) throw cause;
    throw new PreparationUsageRefusal('invalid installed preparation request');
  }
  let selected: typeof invocation.infer;
  try {
    selected = parseSecretsOrThrow(invocation, input);
  } catch (cause) {
    // Proof: c27-request-propagate-ValidationError; injected fault failed `preserves unrelated schema decoder implementation failure identity`; restoration passed.
    if (!(cause instanceof ValidationError)) throw cause;
    throw new PreparationUsageRefusal('invalid installed preparation request');
  }
  // Proof: c27-request-role; injected fault failed `refuses a request for the other preparation executable role prepare-activation` and 1 additional named controls; restoration passed.
  // Proof: c27-request-command-required-activation; paired command-required schema and independent role-match fence removals; not an independent single-fence proof; injected fault failed `requires private prepare-activation field command`; restoration passed.
  // Proof: c27-request-command-required-relocation; paired command-required schema and independent role-match fence removals; not an independent single-fence proof; injected fault failed `requires private prepare-relocation-activation field command`; restoration passed.
  if (selected.request.command !== role)
    throw new PreparationUsageRefusal('invalid installed preparation request');
  if (selected.request.command === 'prepare-activation')
    return {
      ...selected,
      request: { ...selected.request, toolkit: selected.request.toolkit },
    };
  return {
    ...selected,
    request: {
      ...selected.request,
      candidatePolicy: selected.request.candidatePolicy,
      candidateLauncher: selected.request.candidateLauncher,
      validatorEntry: selected.request.validatorEntry,
    },
  };
}
