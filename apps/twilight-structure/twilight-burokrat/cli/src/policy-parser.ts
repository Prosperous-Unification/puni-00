import {
  argument,
  choice,
  command,
  constant,
  type NonEmptyString,
  object,
  option,
  optional,
  or,
  string,
  text,
  type ValueParser,
} from '@optique/core';

/** Proof: removing this pattern fails the root check whitespace-only repository case. */
function parseOperand(metavar: NonEmptyString) {
  return argument(string({ metavar, pattern: /^(?!-)(?!\s*$)[\s\S]+$/u }));
}

/** Proof: removing this pattern fails the root check whitespace-only rule-option case. */
function parseFlag(name: `--${string}`, metavar: NonEmptyString = 'PATH') {
  return option(name, string({ metavar, pattern: /^(?!-)(?!\s*$)[\s\S]+$/u }));
}

/** Proof: replacing choice with string admits the root template bogus-selection negative. */
function parseSelection() {
  return argument(choice(['committed', 'staged', 'working'] as const, { metavar: 'SELECTION' }));
}

/**
 * Explicit evaluation time; parsing it reads no ambient clock.
 * Proof: removing finiteness fails the tomorrow refusal; removing round-trip equality admits February 30.
 */
const instant: ValueParser<'sync', string> = {
  mode: 'sync',
  metavar: 'INSTANT',
  placeholder: '1970-01-01T00:00:00.000Z',
  format: (value) => value,
  parse(value) {
    const millis = Date.parse(value);
    const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
    if (!Number.isFinite(millis) || new Date(millis).toISOString() !== canonical)
      return { success: false, error: [text('expected a canonical UTC instant')] };
    return { success: true, value };
  },
};

/** The caller's complete ordered catalogue; duplicate and blank codes are invalid input. */
const catalogue: ValueParser<'sync', readonly string[]> = {
  mode: 'sync',
  metavar: 'STEPS',
  placeholder: ['step'],
  format: (steps) => steps.join(','),
  parse(value) {
    const steps = value.split(',');
    // Proof: removing the reserved flag, nonblank or unique checks independently fails the root
    // repeated-flag-as-value, whitespace-segment or duplicate-segment refusal case.
    // A repeated --steps cannot become its own catalogue value while a later word becomes the filename.
    if (
      value === '--steps' ||
      steps.some((step) => !/^\S+$/u.test(step)) ||
      new Set(steps).size !== steps.length
    )
      return {
        success: false,
        error: [text('expected distinct nonblank comma-separated step codes')],
      };
    return { success: true, value: steps };
  },
};

/** A selected rule may be undated; dated evaluation still requires its explicit now downstream. */
export const checkParser = command(
  'check',
  object({
    command: constant('check'),
    kind: parseSelection(),
    repository: parseOperand('REPOSITORY'),
    revision: parseOperand('REVISION-OR-BASE'),
    rulePolicy: parseOperand('RULE-POLICY'),
    rule: optional(parseFlag('--rule', 'RULE')),
    performanceEvidence: optional(parseFlag('--performance-evidence')),
    // Proof: making now required fails check's accepted undated base request.
    now: optional(option('--now', instant)),
  }),
  { brief: [text('Evaluate the registered rules over one candidate and print a verdict.')] },
);

/** The optional policy selection is a complete pair, never half a selection. */
export const explainParser = command(
  'explain',
  object({
    command: constant('explain'),
    rule: parseOperand('RULE'),
    policy: optional(
      object({
        repository: parseOperand('REPOSITORY'),
        rulePolicy: parseOperand('RULE-POLICY'),
      }),
    ),
  }),
  { brief: [text("Print a rule's registry record and, with a rule policy, its mode.")] },
);

/** Proof: removing the path pattern admits the root scenario ../outside.md negative. */
function parseSource() {
  return argument(
    string({
      metavar: 'SPEC',
      pattern: /^openspec\/(?:changes\/[a-z0-9-]+\/specs\/|specs\/)[a-z0-9-]+\/spec\.md$/u,
    }),
  );
}

function parseScenario<const Action extends 'import' | 'validate'>(action: Action) {
  return command(
    action,
    object({
      command: constant('scenario'),
      action: constant(action),
      repository: parseOperand('REPOSITORY'),
      source: parseSource(),
    }),
  );
}

/** Only allocating a split identity accepts a predecessor. */
export const scenarioParser = command(
  'scenario',
  or(
    parseScenario('import'),
    parseScenario('validate'),
    command(
      'allocate',
      object({
        command: constant('scenario'),
        action: constant('allocate'),
        repository: parseOperand('REPOSITORY'),
        source: parseSource(),
        predecessor: optional(parseFlag('--predecessor', 'ID')),
      }),
    ),
  ),
  { brief: [text('Import, allocate or validate OpenSpec scenario identities.')] },
);

/** Each template operation has its own operand shape. */
export const templateParser = command(
  'template',
  or(
    command('list', object({ command: constant('template'), action: constant('list') })),
    command(
      'show',
      object({
        command: constant('template'),
        action: constant('show'),
        template: parseOperand('TEMPLATE'),
      }),
    ),
    command(
      'verify',
      object({
        command: constant('template'),
        action: constant('verify'),
        template: parseOperand('TEMPLATE'),
        kind: parseSelection(),
        repository: parseOperand('REPOSITORY'),
        revision: parseOperand('REVISION-OR-BASE'),
        // Proof: making subject optional admits the root incomplete template verify request.
        subject: parseOperand('SUBJECT'),
      }),
    ),
  ),
  { brief: [text('List, show or verify module templates.')] },
);

/** Nested under validate alongside record validation. */
export const workflowBindingParser = command(
  'workflow-binding',
  object({
    command: constant('validate workflow-binding'),
    file: parseOperand('FILE'),
    // Proof: making steps optional admits the root workflow binding without --steps.
    steps: option('--steps', catalogue),
  }),
  { brief: [text('Validate a workflow binding and print its digest.')] },
);

function parseActivation() {
  return {
    candidateRepository: parseFlag('--candidate-repository'),
    candidateSha: parseFlag('--candidate-sha', 'SHA'),
    reviewRecord: parseFlag('--review-record'),
    destination: parseFlag('--destination'),
    work: parseFlag('--work'),
    // Proof: making lane or cwd optional fails each operation's corresponding required-flag case.
    resourceLane: parseFlag('--resource-lane', 'LANE'),
    cwdIdentity: parseFlag('--cwd-identity', 'IDENTITY'),
    checkRuns: parseFlag('--check-runs'),
  };
}

/** Installed execution supplies its verified toolkit when no explicit selection was given. */
export const activationParser = command(
  'prepare-activation',
  object({
    command: constant('prepare-activation'),
    ...parseActivation(),
    toolkit: optional(parseFlag('--toolkit')),
    candidatePolicy: parseFlag('--candidate-policy'),
    // Proof: making mapping optional fails prepare-activation's isolated required-mapping case.
    candidateMapping: parseFlag('--candidate-mapping'),
    auditStrata: parseFlag('--audit-strata'),
  }),
  { brief: [text('Prepare a toolkit activation from the installed toolkit.')] },
);

/** Optional candidate paths retain the provider's explicit repository layout defaults. */
export const relocationParser = command(
  'prepare-relocation-activation',
  object({
    command: constant('prepare-relocation-activation'),
    ...parseActivation(),
    // Proof: making the base optional fails relocation's isolated required-base case.
    baseActivation: parseFlag('--base-activation'),
    candidatePolicy: optional(parseFlag('--candidate-policy')),
    candidateLauncher: optional(parseFlag('--candidate-launcher')),
    validatorEntry: optional(parseFlag('--validator-entry')),
  }),
  { brief: [text('Prepare a relocation activation.')] },
);
