import {
  argument,
  choice,
  command,
  constant,
  formatUsage,
  type InferValue,
  message,
  type NonEmptyString,
  object,
  option,
  optional,
  or,
  type Parser,
  passThrough,
  string,
  text,
} from '@optique/core';
import { run } from '@optique/run';

const programName = 'twilight-burokrat';

/**
 * A command line Burokrat refuses before any handler runs or any file is read. Its message is
 * the one line the process entries print after `error: `.
 */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';
}

/** One positional operand, a word as the shell passed it. */
const operand = (metavar: NonEmptyString) => argument(string({ metavar }));

/**
 * A JSON input path of the two plan-consistency commands: non-empty and not flag-shaped, as their
 * hand-written guards required.
 * Proof: dropping `pattern` made `refuses invalid operands before reading` (plan-tasks.test.ts)
 * accept the empty path `''` and read it instead of refusing the usage (2026-11-02).
 */
const jsonPath = (metavar: NonEmptyString) =>
  argument(
    string({
      metavar,
      pattern: /^(?!-)[\s\S]+$/u,
      errors: { patternMismatch: (input) => [text(`not a JSON input path: '${input}'`)] },
    }),
  );

/** A candidate selection: a commit, the staged index, or the working tree. */
const selection = () =>
  argument(choice(['committed', 'staged', 'working'] as const, { metavar: 'SELECTION' }));

/**
 * A Browser or Performance level mode.
 * Proof: replacing `choice` with `string` made `[TEST-AXES-115] refuses unsupported mode`
 * (browser-performance.test.ts) reach the policy reader instead of the usage refusal (2026-11-02).
 */
const levelMode = () =>
  argument(choice(['ordinary', 'packaged', 'portable'] as const, { metavar: 'MODE' }));

/**
 * `--now`, the evaluation instant a dated command judges at. Required: Burokrat reads no clock,
 * so Twilight Dash supplies the instant (C5). Its value is decoded by the handler's
 * `readEvaluationInstant`, which names the command in its malformed-instant refusal.
 * Proof: wrapping it in `optional` made `Burokrat without --now refuses in one usage line` reach
 * the handler, which refused in its own wording without the usage (2026-11-02).
 */
const evaluationInstant = (name: string) =>
  option('--now', string({ metavar: 'INSTANT' }), {
    description: message`The UTC instant the command judges at, such as 2026-11-02T00:00:00.000Z.`,
    errors: {
      missing: [
        text(`${name} requires --now <UTC instant>; Twilight Dash supplies the evaluation instant`),
      ],
    },
  });

/** One command whose operands are typed here; `fields` keep their positional order. */
function typed<const Name extends string, const Fields extends Record<string, Parser>>(
  name: Name,
  brief: string,
  fields: Fields,
) {
  return command(name, object({ command: constant(name), ...fields }), {
    brief: [text(brief)],
  });
}

/**
 * The grammar each delegated command's module parses itself, shown by `help <command>`. A
 * delegated command's words reach its module verbatim, so its refusal wording stays where it is
 * documented and tested.
 */
export const delegatedGrammars = {
  check:
    '<committed|staged|working> <repository> <revision-or-base> <rule-policy-json> [--rule <rule-id>] [--performance-evidence <json>] [--now <UTC instant>]',
  explain: '<rule-id> [<repository> <rule-policy-json>]',
  scenario: '<import|allocate|validate> <repository> <openspec-spec-path> [--predecessor <id>]',
  template:
    '<list|show <id>|verify <id> <committed|staged|working> <repository> <revision-or-base> <subject>>',
  'validate workflow-binding': '<file> --steps <comma-list>',
  'prepare-activation': '<flags>',
  'prepare-relocation-activation': '<flags>',
} as const;

type DelegatedWords = keyof typeof delegatedGrammars;

function described(words: DelegatedWords, brief: string) {
  return {
    brief: [text(brief)],
    description: [text(`${brief} Arguments: ${delegatedGrammars[words]}`)],
  };
}

function delegated<const Name extends DelegatedWords>(name: Name, brief: string) {
  return command(
    name,
    object({ command: constant(name), argv: passThrough({ format: 'greedy' }) }),
    described(name, brief),
  );
}

/** The eleven named input documents of the exhaustive census commands, in operand order. */
export const exhaustiveDocumentNames = [
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

const exhaustiveDocuments = () => ({
  inventory: operand('INVENTORY'),
  inventoryProtocol: operand('INVENTORY-PROTOCOL'),
  classificationPolicy: operand('CLASSIFICATION-POLICY'),
  contentManifestRequest: operand('CONTENT-MANIFEST-REQUEST'),
  exhaustivePolicy: operand('EXHAUSTIVE-POLICY'),
  reviewProtocol: operand('REVIEW-PROTOCOL'),
  moduleMapping: operand('MODULE-MAPPING'),
  granularityPolicy: operand('GRANULARITY-POLICY'),
  modelContext: operand('MODEL-CONTEXT'),
  relationshipRequest: operand('RELATIONSHIP-REQUEST'),
  artifactGraph: operand('ARTIFACT-GRAPH'),
});

/** The `<repository> <committed-sha> <external-rule-policy>` triple most inspections start with. */
const inspected = () => ({
  repository: operand('REPOSITORY'),
  revision: operand('COMMITTED-SHA'),
  rulePolicy: operand('RULE-POLICY'),
});

/** The four reviewed Browser authorities the level inspections read. */
const browserAuthorities = () => ({
  reviewAuthority: operand('REVIEW-AUTHORITY'),
  conformanceAuthority: operand('CONFORMANCE-AUTHORITY'),
  architectureAuthority: operand('ARCHITECTURE-AUTHORITY'),
  performanceAuthority: operand('PERFORMANCE-AUTHORITY'),
});

const recordCommands = [
  typed(
    'validate-progress-receipt',
    'Validate a progress receipt against its plan reference and tasks.',
    {
      receipt: jsonPath('RECEIPT-JSON'),
      planReference: jsonPath('PLAN-REFERENCE-JSON'),
      tasks: jsonPath('TASKS-JSON'),
    },
  ),
  typed('validate-plan-tasks', 'Validate tasks.json against its plan reference.', {
    planReference: jsonPath('PLAN-REFERENCE-JSON'),
    tasks: jsonPath('TASKS-JSON'),
  }),
  typed('validate-record', 'Validate one contract record of a named kind.', {
    kind: operand('KIND'),
    record: operand('JSON'),
  }),
  command(
    'validate',
    or(
      command(
        'workflow-binding',
        object({
          command: constant('validate workflow-binding'),
          argv: passThrough({ format: 'greedy' }),
        }),
        described('validate workflow-binding', 'Validate a workflow binding and print its digest.'),
      ),
      object({ command: constant('validate'), kind: operand('KIND'), record: operand('JSON') }),
    ),
    {
      brief: message`Validate one contract record (as validate-record), or a workflow binding.`,
    },
  ),
  typed('read-candidate', 'Print the selected candidate snapshot.', {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
  }),
  typed('classify-candidate', "Classify the candidate's entries under a classification policy.", {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    policy: operand('POLICY-JSON'),
  }),
  typed('content-manifest', "Print the candidate's content manifest and its currency.", {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    policy: operand('POLICY-JSON'),
    request: operand('REQUEST-JSON'),
    reviewedIdentity: optional(operand('REVIEWED-IDENTITY')),
  }),
  typed('validate-artifacts', "Validate the candidate's artifacts against an artifact graph.", {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    policy: operand('POLICY-JSON'),
    graph: operand('GRAPH-JSON'),
  }),
  typed('extract-relationships', "Extract the candidate's module relationships.", {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    request: operand('REQUEST-JSON'),
  }),
  typed('check-indexes', "Check the candidate's module indexes.", {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
  }),
  typed('check-root-migration', "Check the candidate's root migration against a map.", {
    kind: selection(),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    map: operand('MAP-JSON'),
  }),
  typed('validate-review-provenance', 'Validate review evidence against the invocation journal.', {
    journal: operand('JOURNAL'),
    evidence: operand('EVIDENCE-JSON'),
    requirement: argument(
      choice(['allow-local', 'require-external'] as const, { metavar: 'REQUIREMENT' }),
    ),
  }),
] as const;

const censusCommands = [
  typed('freeze-exhaustive', 'Freeze the exhaustive review plan of a committed candidate.', {
    repository: operand('REPOSITORY'),
    revision: operand('REVISION'),
    auditSeed: operand('AUDIT-SEED'),
    ...exhaustiveDocuments(),
  }),
  typed('verify-exhaustive', 'Verify a frozen exhaustive review plan.', {
    repository: operand('REPOSITORY'),
    plan: operand('PLAN-JSON'),
    expectedIdentity: operand('EXPECTED-IDENTITY'),
    auditSeed: operand('AUDIT-SEED'),
    ...exhaustiveDocuments(),
  }),
  typed('evaluate-exhaustive-coverage', 'Evaluate an audit against a verified exhaustive plan.', {
    repository: operand('REPOSITORY'),
    plan: operand('PLAN-JSON'),
    expectedIdentity: operand('EXPECTED-IDENTITY'),
    auditSeed: operand('AUDIT-SEED'),
    audit: operand('AUDIT-JSON'),
    ...exhaustiveDocuments(),
  }),
] as const;

const policyCommands = [
  typed('lint-local', 'Lint a candidate under a trusted binding, as a local operator.', {
    mode: operand('MODE'),
    kind: operand('SELECTION'),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    binding: operand('BINDING'),
    evidence: operand('EVIDENCE'),
  }),
  typed('lint-ci', 'Lint a candidate under the binding CI preselected.', {
    kind: operand('SELECTION'),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
    evidence: operand('EVIDENCE'),
  }),
  typed(
    'validate-policy-activation',
    'Validate that a next trusted binding may follow a previous one.',
    {
      repository: operand('REPOSITORY'),
      previousBinding: operand('PREVIOUS-BINDING'),
      nextBinding: operand('NEXT-BINDING'),
    },
  ),
  delegated('check', 'Evaluate the registered rules over one candidate and print a verdict.'),
  delegated('explain', "Print a rule's registry record and, with a rule policy, its mode."),
  delegated('scenario', 'Import, allocate or validate OpenSpec scenario identities.'),
  delegated('template', 'List, show or verify module templates.'),
] as const;

const evidenceCommands = [
  typed(
    'inspect-evaluation-coverage',
    'Print the rule evaluation coverage matrix; exit 1 on an unevaluated row.',
    {
      repository: operand('REPOSITORY'),
      revision: operand('FULL-SHA'),
      rulePolicy: operand('RULE-POLICY'),
      coverageReview: operand('COVERAGE-REVIEW'),
    },
  ),
  typed('inspect-performance', 'Inspect the Performance evidence bundle.', inspected()),
  typed('inspect-performance-sources', 'Inspect the Performance test sources.', inspected()),
  typed(
    'inspect-performance-levels',
    'Inspect Performance level isolation; exit 1 on a wrong level.',
    {
      repository: operand('REPOSITORY'),
      revision: operand('COMMITTED-SHA'),
      factsAuthority: operand('FACTS-AUTHORITY'),
      rulePolicy: operand('RULE-POLICY'),
    },
  ),
  typed(
    'inspect-performance-scenarios',
    'Inspect Performance scenario citations; exit 1 on a citation finding.',
    {
      ...inspected(),
      levelAuthority: operand('LEVEL-AUTHORITY'),
      capability: operand('CAPABILITY'),
    },
  ),
  typed(
    'inspect-scenario-ledger',
    'Inspect the Performance scenario ledger at an instant; exit 1 on debt.',
    {
      ...inspected(),
      levelAuthority: operand('LEVEL-AUTHORITY'),
      capability: operand('CAPABILITY'),
      ledgerAuthority: operand('LEDGER-AUTHORITY'),
      now: evaluationInstant('inspect-scenario-ledger'),
    },
  ),
  typed('inspect-level-facts', 'Inspect the reviewed level facts.', {
    repository: operand('REPOSITORY'),
    revision: operand('COMMITTED-SHA'),
    authority: operand('AUTHORITY'),
  }),
  typed('inspect-bun-test-reports', 'Inspect the Bun test reports.', {
    repository: operand('REPOSITORY'),
    revision: operand('FULL-SHA'),
    reportAuthority: operand('REPORT-AUTHORITY'),
  }),
  typed('inspect-test-reports', 'Inspect the test reports of one level mode.', {
    ...inspected(),
    mode: levelMode(),
  }),
  typed('inspect-test-sources', 'Inspect the test sources of one level mode.', {
    ...inspected(),
    mode: levelMode(),
  }),
  typed('inspect-spec-sources', 'Inspect the specification sources.', {
    repository: operand('REPOSITORY'),
    revision: operand('COMMITTED-SHA'),
  }),
  typed('inspect-manual', 'Inspect the Manual report at an instant; exit 1 unless current.', {
    ...inspected(),
    report: operand('REPORT-PATH'),
    now: evaluationInstant('inspect-manual'),
  }),
  typed(
    'inspect-manual-observation',
    'Print the Manual observation at an instant; exit 1 unless current.',
    {
      ...inspected(),
      report: operand('REPORT-PATH'),
      now: evaluationInstant('inspect-manual-observation'),
    },
  ),
] as const;

/** A Browser inspection of one mode against one external authority. */
function browserEvidence<const Name extends string>(name: Name, brief: string) {
  return typed(name, brief, { ...inspected(), mode: levelMode(), authority: operand('AUTHORITY') });
}

const browserCommands = [
  browserEvidence('inspect-browser-performance', 'Inspect Browser Performance evidence.'),
  browserEvidence('inspect-browser-architecture', 'Inspect Browser architecture evidence.'),
  browserEvidence('inspect-browser-conformance', 'Inspect Browser conformance evidence.'),
  browserEvidence('inspect-browser-memberships', 'Inspect Browser memberships.'),
  typed(
    'inspect-browser-scenarios',
    'Inspect Browser scenario citations; exit 1 on a citation finding.',
    {
      ...inspected(),
      mode: levelMode(),
      ...browserAuthorities(),
      capability: operand('CAPABILITY'),
    },
  ),
  typed(
    'inspect-browser-source-levels',
    'Inspect Browser source level isolation; exit 1 on a wrong level.',
    { ...inspected(), mode: levelMode(), ...browserAuthorities() },
  ),
  typed('inspect-browser-levels', 'Inspect Browser level isolation; exit 1 on a wrong level.', {
    ...inspected(),
    mode: levelMode(),
    ...browserAuthorities(),
  }),
  typed('inspect-browser-t2', 'Inspect the Browser T2 diagnostic at an instant.', {
    repository: operand('REPOSITORY'),
    revision: operand('FULL-COMMITTED-SHA'),
    rulePolicy: operand('RULE-POLICY'),
    capability: operand('CAPABILITY'),
    ledgerAuthority: operand('LEDGER-AUTHORITY'),
    now: evaluationInstant('inspect-browser-t2'),
  }),
  typed(
    'inspect-browser-t2-policy',
    'Preview a proposed Browser T2 citation policy at an instant; exit 1 on refusals.',
    {
      repository: operand('REPOSITORY'),
      revision: operand('FULL-COMMITTED-SHA'),
      rulePolicy: operand('RULE-POLICY'),
      capability: operand('CAPABILITY'),
      ledgerAuthority: operand('LEDGER-AUTHORITY'),
      proposedPolicy: operand('PROPOSED-POLICY'),
      now: evaluationInstant('inspect-browser-t2-policy'),
    },
  ),
  typed(
    'inspect-browser-scenario-ledger',
    'Inspect the Browser scenario ledger at an instant; exit 1 on debt.',
    {
      repository: operand('REPOSITORY'),
      revision: operand('FULL-COMMITTED-SHA'),
      rulePolicy: operand('RULE-POLICY'),
      capability: operand('CAPABILITY'),
      ledgerAuthority: operand('LEDGER-AUTHORITY'),
      now: evaluationInstant('inspect-browser-scenario-ledger'),
    },
  ),
] as const;

/**
 * The commands only the source validator dispatches: the installed executable never forwarded
 * them to its toolkit, and still refuses them as unsupported.
 */
const sourceOnlyCommands = [
  typed(
    'candidate-identity',
    "Print the candidate's non-certifying identity, as check hashes it.",
    {
      kind: selection(),
      repository: operand('REPOSITORY'),
      revision: operand('REVISION-OR-BASE'),
    },
  ),
  typed('inspect-browser', 'Inspect the Browser evidence bundle of one mode.', {
    repository: operand('REPOSITORY'),
    revision: operand('COMMITTED-REVISION'),
    rulePolicy: operand('RULE-POLICY'),
    mode: levelMode(),
  }),
] as const;

/**
 * The commands only the installed executable (`bin.ts`) dispatches; `cli.ts` refuses them as
 * unsupported, as it always did.
 */
const installedOnlyCommands = [
  typed('lint', 'Run the trusted whole-tree lint through the installed launcher.', {
    kind: operand('SELECTION'),
    repository: operand('REPOSITORY'),
    revision: operand('REVISION-OR-BASE'),
  }),
  delegated('prepare-activation', 'Prepare a toolkit activation from the installed toolkit.'),
  delegated('prepare-relocation-activation', 'Prepare a relocation activation.'),
] as const;

function commandNames(parser: Parser): string[] {
  return parser.usage.flatMap((term) => (term.type === 'command' ? [term.name] : []));
}

/** One Burokrat program: its root parser and the command parsers it was composed of. */
export interface Grammar<T extends Parser> {
  readonly parser: T;
  readonly commands: readonly Parser[];
}

/**
 * Every `cli.ts` command line. `or` takes at most fifteen parsers, so the commands are grouped by
 * the shape of their operands.
 */
export const validatorGrammar = {
  parser: or(
    or(...recordCommands),
    or(...censusCommands),
    or(...policyCommands),
    or(...evidenceCommands),
    or(...browserCommands),
    or(...sourceOnlyCommands),
  ),
  commands: [
    ...recordCommands,
    ...censusCommands,
    ...policyCommands,
    ...evidenceCommands,
    ...browserCommands,
    ...sourceOnlyCommands,
  ],
};

/** A parsed `cli.ts` command line, discriminated by `command`. */
export type ValidatorCommand = InferValue<typeof validatorGrammar.parser>;

/** The parsed request of one validator command. */
export type ValidatorRequest<Name extends ValidatorCommand['command']> = Extract<
  ValidatorCommand,
  { readonly command: Name }
>;

/**
 * Every installed `twib` command line: the validator commands it forwards to its toolkit's
 * `validator.mjs`, and the three it dispatches itself.
 */
export const installedGrammar = {
  parser: or(
    or(...recordCommands),
    or(...censusCommands),
    or(...policyCommands),
    or(...evidenceCommands),
    or(...browserCommands),
    or(...installedOnlyCommands),
  ),
  commands: [
    ...recordCommands,
    ...censusCommands,
    ...policyCommands,
    ...evidenceCommands,
    ...browserCommands,
    ...installedOnlyCommands,
  ],
};

/** A parsed installed command line, discriminated by `command`. */
export type InstalledCommand = InferValue<typeof installedGrammar.parser>;

/** The top-level command names a grammar accepts, in help order. */
export function commandNamesOf(grammar: Grammar<Parser>): string[] {
  return grammar.commands.flatMap(commandNames);
}

/** The one-line usage of one of `commands`, or undefined when `name` names none of them. */
function usageOf(commands: readonly Parser[], name: string): string | undefined {
  const parser = commands.find((candidate) => commandNames(candidate).includes(name));
  if (parser === undefined) return undefined;
  // Proof: `colors: true` here failed `Burokrat without --now refuses in one usage line` under
  // `FORCE_COLOR=1` with ANSI bytes in the refusal line (2026-11-02).
  return `usage: ${formatUsage(programName, parser.usage, { colors: false })}`.replace(
    /\s+/gu,
    ' ',
  );
}

/**
 * The refusal of a delegated command whose word count its module cannot take: the module's
 * documented grammar, then why.
 */
export function delegatedArityRefusal(name: 'check' | 'explain', reason: string): UsageRefusal {
  return new UsageRefusal(`usage: ${programName} ${name} ${delegatedGrammars[name]} (${reason})`);
}

/**
 * One refusal line from Optique's error text, which `help <unknown>` prefixes with the whole
 * usage, so only the text after its last `Error: ` is the reason. An argv whose first word names
 * none of `commands` refuses `Unsupported Burokrat command: <word>`; any other refusal starts with
 * that command's usage.
 */
function refusalOf(
  commands: readonly Parser[],
  args: readonly string[],
  errorText: string,
): string {
  const marker = errorText.lastIndexOf('Error: ');
  const reason = (marker < 0 ? errorText : errorText.slice(marker + 'Error: '.length))
    .replace(/\s+/gu, ' ')
    .trim();
  const name = args.at(0);
  // Proof: dropping this branch failed `help <unknown> and completion without a shell refuse in
  // one line` with `error: Unsupported Burokrat command: help` (2026-11-02).
  if (name === 'help' || name === 'completion') {
    // `completion` without a shell follows its first sentence with its whole help page.
    const brief = reason.includes('Usage:') ? /^[^.]*\./u.exec(reason)?.[0] : undefined;
    return `usage: ${programName} ${name} (${brief ?? reason})`;
  }
  const usage = name === undefined ? undefined : usageOf(commands, name);
  // Proof: returning `reason` unmapped here failed `an unknown command refuses in one line, exit
  // 1` with Optique's "Unexpected option or subcommand: `not-a-command`." (2026-11-02).
  if (usage === undefined) return `Unsupported Burokrat command: ${name ?? '<missing>'}`;
  return `${usage} (${reason})`;
}

/** The exit that ends `run` after it printed help, a version or a completion script. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/** What one invocation did: a command to dispatch, or help, a version or completion printed. */
export type Invocation<Command> =
  { readonly kind: 'command'; readonly command: Command } | { readonly kind: 'printed' };

/** The sinks and the optional version of one {@link readInvocation} call. */
export interface InvocationOptions {
  /** Receives each printed text with its ending newline. */
  readonly stdout: (text: string) => void;
  /** The package version `--version` prints; omitted, `--version` is not a Burokrat word. */
  readonly version?: string;
}

/**
 * Parses one Burokrat command line of `grammar` through Optique's `run` with every sink
 * injected: help, `--version` and completion scripts go to `stdout` and return
 * `{ kind: 'printed' }`; a refusal throws {@link UsageRefusal} and writes nothing. Never calls
 * `process.exit` and reads no clock.
 *
 * @throws UsageRefusal with one line: `Unsupported Burokrat command: <name>` or `usage: …`.
 */
export function readInvocation<T extends Parser>(
  grammar: Grammar<T>,
  args: readonly string[],
  options: InvocationOptions,
): Invocation<InferValue<T>> {
  let errorText = '';
  try {
    const parsed = run(grammar.parser, {
      programName,
      args,
      // `run` assumes its sink ends each text with a newline, as its default sink does.
      // Proof: passing `options.stdout` unwrapped made `twib --version prints the manifest
      // version` receive `0.1.0` without its newline (2026-11-02).
      stdout: (text) => {
        options.stdout(`${text}\n`);
      },
      stderr: (chunk) => {
        errorText += chunk;
      },
      // Proof: dropping `onExit` let `run` call `process.exit(1)`, so `Burokrat without --now
      // refuses in one usage line` saw no `error:` line (2026-11-02).
      onExit: (code) => {
        throw code === 0
          ? new Printed()
          : new UsageRefusal(refusalOf(grammar.commands, args, errorText));
      },
      // Without these two `run` reads the terminal's colour support and width, so help and
      // refusals would vary per terminal.
      // Proof: dropping `maxWidth` failed `help parity holds under any terminal width and colour
      // request` under `COLUMNS=30` (2026-11-02).
      colors: false,
      maxWidth: 120,
      aboveError: 'none',
      help: 'both',
      completion: 'command',
      ...(options.version === undefined ? {} : { version: options.version }),
    });
    return { kind: 'command', command: parsed };
  } catch (cause) {
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
}
