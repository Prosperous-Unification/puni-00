import {
  argument,
  choice,
  command,
  constant,
  flag,
  formatUsage,
  type InferValue,
  integer,
  map,
  message,
  multiple,
  type NonEmptyString,
  object,
  option,
  optional,
  or,
  type Parser,
  string,
  text,
  type Usage,
  type UsageTerm,
  type ValueParser,
  withDefault,
} from '@optique/core';
import { run } from '@optique/run';

const programName = 'twilight-dash';

/**
 * A command line Dash refuses before any handler runs. Its message is the one line the
 * entrypoint prints after `error: `.
 */
export class UsageRefusal extends Error {
  override readonly name = 'UsageRefusal';
}

/**
 * A flag value: non-empty and not itself a flag, as the hand-written loop required.
 * Proof: dropping `pattern` made `refuses a valueless or empty flag before planning` receive no
 * refusal for `--known-hosts-sha256 ''` (2026-11-01).
 */
const flagValue = (metavar: 'PATH' | 'NAME' | 'SHA256') =>
  string({ metavar, pattern: /^(?!--)[\s\S]+$/u });

/** One required `plan-enrollment` flag, refusing in the wording the hand-written loop used. */
function enrollmentFlag(name: `--${string}`, metavar: 'PATH' | 'NAME' | 'SHA256') {
  return option(name, flagValue(metavar), {
    errors: {
      duplicate: [text(`Duplicate Dash flag: ${name}`)],
      endOfInput: [text(`Dash flag has no value: ${name}`)],
      invalidValue: [text(`Dash flag has no value: ${name}`)],
      missing: [text(`Missing required Dash flag: ${name}`)],
    },
  });
}

const planEnrollment = command(
  'plan-enrollment',
  object({
    command: constant('plan-enrollment'),
    fleet: enrollmentFlag('--fleet', 'PATH'),
    observation: enrollmentFlag('--observation', 'PATH'),
    output: enrollmentFlag('--output', 'PATH'),
    node: enrollmentFlag('--node', 'NAME'),
    cluster: enrollmentFlag('--cluster', 'NAME'),
    inventorySha256: enrollmentFlag('--inventory-sha256', 'SHA256'),
    ansibleVariablesSha256: enrollmentFlag('--ansible-variables-sha256', 'SHA256'),
    knownHostsSha256: enrollmentFlag('--known-hosts-sha256', 'SHA256'),
  }),
  { brief: message`Delegate enrollment planning to the fleet planner; plans, never applies.` },
);

/**
 * An operand of the commands below: a non-blank word that does not begin with `--` (each
 * hand-written loop refused the `--` form; some also took a blank word, D-A3). Its refusal never
 * quotes the word.
 * Proof: dropping `pattern` made `refuses a blank operand for every command` accept
 * `bootstrap-authority ' '` (2026-11-02).
 */
const operand = (metavar: NonEmptyString) =>
  string({
    metavar,
    pattern: /^(?!--)(?=[\s\S]*\S)[\s\S]+$/u,
    errors: { patternMismatch: message`must be a non-blank value that does not begin with --.` },
  });

/** One required option taking an {@link operand}. */
const operandOption = (name: `--${string}`, metavar: NonEmptyString, description: string) =>
  option(name, operand(metavar), { description: [text(description)] });

/** A command named `name` whose parsed object carries `command: name` beside `fields`. */
function dashCommand<const Name extends string, const Fields extends Record<string, Parser>>(
  name: Name,
  brief: string,
  fields: Fields,
) {
  return command(name, object({ command: constant(name), ...fields }), {
    brief: [text(brief)],
  });
}

const repository = () =>
  argument(operand('REPOSITORY'), {
    description: message`The repository whose authority this is.`,
  });

const authorityCommands = [
  dashCommand(
    'bootstrap-authority',
    'Create the repository authority; the only command that creates one.',
    { repository: repository() },
  ),
  dashCommand('inspect-authority', 'Print the authority state, read-only.', {
    repository: repository(),
    session: optional(
      option('--session', operand('ID'), {
        description: message`Print only this session's generations.`,
      }),
    ),
  }),
  dashCommand('recover-publication', 'Finish an interrupted publication from its durable record.', {
    repository: repository(),
    integrationId: operandOption('--integration-id', 'ID', 'The interrupted integration.'),
  }),
  dashCommand(
    'submit-admission',
    "Freeze a bound packet's candidate and print its submission report.",
    {
      repository: repository(),
      packet: argument(operand('PACKET_JSON'), {
        description: message`The bound admission packet.`,
      }),
      // Proof: a plain `string` here made `refuses an empty payload, an invalid instant and an
      // unknown selection` accept `frozen` (2026-11-03).
      selection: argument(choice(['staged', 'committed'] as const, { metavar: 'SELECTION' }), {
        description: message`staged: freeze the staged tree on a base; committed: freeze a revision.`,
      }),
      revision: argument(operand('REVISION'), {
        description: message`The base (staged) or the revision (committed).`,
      }),
    },
  ),
] as const;

/** `<service.json>`, the observation service configuration both store commands name. */
const serviceConfiguration = () => ({
  service: argument(operand('SERVICE_JSON'), {
    description: message`The observation service configuration.`,
  }),
});

const activationCommands = [
  dashCommand(
    'render-observation-units',
    'Render the uninstalled observation service units into a new directory.',
    {
      layout: argument(operand('LAYOUT_JSON'), { description: message`The trusted unit layout.` }),
      outputDirectory: argument(operand('NEW_DIRECTORY'), {
        description: message`The absolute, canonical directory to create; it must not exist.`,
      }),
    },
  ),
  dashCommand('bootstrap-observation', 'Create the observation store.', serviceConfiguration()),
  dashCommand(
    'migrate-observation',
    'Migrate the observation store to v10.',
    serviceConfiguration(),
  ),
] as const;

/**
 * One `run-activation-checks` option, refusing in the reasons the hand-written loop gave, which
 * its tests and runbooks name. An unknown flag refuses in Optique's words, as for every command.
 * Proof: dropping `duplicate` made `refuses grammar faults and unusable directories before any
 * effect` see "`--check-runs` cannot be used multiple times." (2026-11-02).
 */
function checkRunOption(
  name: `--${string}`,
  value: ValueParser<'sync', string>,
  description: string,
) {
  return option(name, value, {
    description: [text(description)],
    errors: {
      duplicate: [text(`repeated ${name}`)],
      endOfInput: [text(`${name} has no value`)],
      invalidValue: [
        text(name === '--candidate-sha' ? `${name} is not a 40-hex sha` : `${name} has no value`),
      ],
      missing: [text(`missing ${name}`)],
    },
  });
}

const runActivationChecks = command(
  'run-activation-checks',
  object({
    command: constant('run-activation-checks'),
    candidateRepository: checkRunOption(
      '--candidate-repository',
      operand('CHECKOUT'),
      'The candidate checkout, at the candidate revision.',
    ),
    candidateSha: checkRunOption(
      '--candidate-sha',
      string({ metavar: 'SHA', pattern: /^[0-9a-f]{40}$/u }),
      'The candidate revision, 40 lowercase hex digits.',
    ),
    candidatePolicy: checkRunOption(
      '--candidate-policy',
      operand('PATH'),
      'The committed policy path inside the candidate.',
    ),
    checkRuns: checkRunOption(
      '--check-runs',
      operand('NEW_DIRECTORY'),
      'The ledger directory to create, outside the candidate.',
    ),
  }),
  { brief: message`Run a candidate's activation checks and write the CheckRun ledger.` },
);

/** The four paths both progress commands take. */
const progressFields = () => ({
  entries: operandOption('--entries', 'PATH', 'The operator progress assertions.'),
  planReference: operandOption('--plan-reference', 'PATH', 'The plan reference the entries name.'),
  tasks: operandOption('--tasks', 'PATH', "The plan's tasks.json."),
  output: operandOption('--output', 'PATH', 'The receipt file to create; never replaced.'),
});

/** A UTC instant as the ledger states periods, `2026-10-15T00:00:00Z`; read, never compared to a clock. */
const instant = () =>
  string({
    metavar: 'INSTANT',
    // Proof: dropping `pattern` made `refuses an empty payload, an invalid instant and an unknown
    // selection` accept `--since 2026-10-01` (2026-11-03).
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u,
    errors: {
      patternMismatch: message`period bounds must be UTC instants like 2026-10-15T00:00:00Z.`,
    },
  });

/** A harness log directory `account-outcomes` may name any number of times. */
const logDirectories = (name: `--${string}`, description: string) =>
  multiple(option(name, operand('DIRECTORY'), { description: [text(description)] }));

const ledgerCommands = [
  dashCommand(
    'record-progress',
    'Record operator progress assertions as a receipt.',
    progressFields(),
  ),
  dashCommand(
    'record-progress-v2',
    'Record operator progress assertions as a plan-bound receipt.',
    progressFields(),
  ),
  dashCommand('account-outcomes', "Write the period's efficiency breakdown from harness logs.", {
    repository: operandOption(
      '--repository',
      'PATH',
      'The checkout whose main history names the outcomes.',
    ),
    since: option('--since', instant(), { description: message`The period's first instant.` }),
    until: option('--until', instant(), {
      description: message`The instant the period ends before; after --since.`,
    }),
    rateCard: operandOption('--rate-card', 'PATH', 'The rate card that prices the usage.'),
    output: operandOption('--output', 'NEW_DIRECTORY', 'The breakdown directory to create.'),
    claudeProjects: logDirectories(
      '--claude-projects',
      'A Claude Code projects directory; repeatable. One log directory is required.',
    ),
    codexSessions: logDirectories(
      '--codex-sessions',
      'A Codex sessions directory; repeatable. One log directory is required.',
    ),
  }),
  dashCommand(
    'report-capacity',
    'Measure each bound resource and report it to WBS until a refusal.',
    { config: operandOption('--config', 'PATH', 'The owner-only reporter configuration.') },
  ),
] as const;

/** A payload after `--`: its program, then its arguments, passed on unchanged. */
const payload = () =>
  multiple(
    argument(string({ metavar: 'COMMAND' }), {
      description: message`The command to run, after --.`,
    }),
    // Proof: dropping `min: 1` made `refuses an empty payload, an invalid instant and an unknown
    // selection` accept `resources run … --` (2026-11-03).
    { min: 1, errors: { tooFew: message`a command after -- is required.` } },
  );

const resourceUse = () => operandOption('--use', 'ID', 'The managed resource use.');

/** One `resources` action: `config` and `fields`, discriminated by `action`. */
function resourceAction<const Action extends string, const Fields extends Record<string, Parser>>(
  action: Action,
  brief: string,
  fields: Fields,
) {
  return command(
    action,
    object({
      command: constant('resources'),
      action: constant(action),
      config: operandOption('--config', 'PATH', 'The resource configuration.'),
      ...fields,
    }),
    { brief: [text(brief)] },
  );
}

const resourceRequest = () => operandOption('--request', 'PATH', 'The creation request, JSON.');

const resourcesNamespace = command(
  'resources',
  or(
    resourceAction('init', 'Initialize the resource ledger.', {}),
    resourceAction('create', 'Create a managed resource use from a request.', {
      request: resourceRequest(),
    }),
    resourceAction('exec', 'Create a use, run a command in it, then clean it up.', {
      request: resourceRequest(),
      argv: payload(),
    }),
    resourceAction('run', 'Run a command in an existing use, then clean it up.', {
      use: resourceUse(),
      argv: payload(),
    }),
    resourceAction('inspect', 'Print one use, or every use.', {
      use: optional(option('--use', operand('ID'), { description: message`The use to print.` })),
    }),
    resourceAction('cleanup', 'Request cleanup of one use at its revision, then sweep.', {
      use: resourceUse(),
      revision: map(
        option(
          '--revision',
          string({
            metavar: 'REVISION',
            // Proof: loosening this to `/^\d+$/u` made `refuses two credentials, none, a
            // malformed revision and a blank operand` accept `--revision=0` (2026-11-02).
            pattern: /^[1-9]\d*$/u,
            errors: { patternMismatch: message`must be a positive integer.` },
          }),
          { description: message`The use revision the cleanup is judged against.` },
        ),
        Number,
      ),
      incarnation: operandOption('--incarnation', 'ID', 'The use incarnation.'),
      reason: operandOption('--reason', 'TEXT', 'Why the use is cleaned up.'),
    }),
    resourceAction('sweep', 'Sweep released uses, dead tickets and settled legacy holds.', {}),
    resourceAction('sync', 'Publish the outbox to WBS once.', {}),
    resourceAction('watch', 'Sweep, guard and publish until interrupted.', {}),
  ),
  { brief: message`Manage disposable directories, worktrees and their commands.` },
);

/** One `mcp token` credential: exactly one of the three, as the hand-written loop required. */
const credentialFlag = <const Flag extends `--${string}`>(
  flag: Flag,
  metavar: NonEmptyString,
  description: string,
) =>
  map(option(flag, operand(metavar), { description: [text(description)] }), (value) => ({
    flag,
    value,
  }));

/** The commands `entrypoint.ts` dispatches before it loads `cli.ts`. */
const entrypointCommands = [
  command(
    'mcp',
    command(
      'token',
      object({
        command: constant('mcp'),
        subcommand: constant('token'),
        resource: operandOption('--resource', 'URL', 'The WBS MCP resource.'),
        // Proof: replacing this `or` with three optional options made `refuses two credentials`
        // (token-command.test.ts) resolve and request a token (2026-11-02).
        credential: or(
          credentialFlag('--key-file', 'PATH', 'An owner-only file holding a wbs_mk_ key.'),
          credentialFlag('--assertion-file', 'PATH', 'A workload token file, reread on every run.'),
          credentialFlag(
            '--github-actions-audience',
            'AUDIENCE',
            'Fetch a GitHub Actions OIDC token for this audience.',
          ),
          {
            errors: {
              noMatch: message`one of --key-file, --assertion-file or --github-actions-audience is required.`,
            },
          },
        ),
        run: optional(
          option('--run', operand('ID'), { description: message`Sign this run into the token.` }),
        ),
      }),
      {
        brief: message`Print a fresh WBS MCP bearer as a header map for Claude Code's headersHelper.`,
      },
    ),
    { brief: message`Print WBS MCP bearers.` },
  ),
  command(
    'pool',
    command(
      'import',
      object({
        command: constant('pool'),
        subcommand: constant('import'),
        file: argument(operand('POOL_KEYS_JSON'), {
          description: message`The owner-only pool key document.`,
        }),
        store: operandOption('--store', 'DIRECTORY', 'The pool store directory.'),
      }),
      { brief: message`Store an agent pool's keys for mcp token.` },
    ),
    { brief: message`Manage agent pools.` },
  ),
] as const;

/** The commands `cli.ts`'s `runDash` dispatches, except `ops`. */
const dispatchedCommands = [
  planEnrollment,
  ...authorityCommands,
  ...activationCommands,
  runActivationChecks,
  ...ledgerCommands,
  resourcesNamespace,
] as const;

/** A `randomUUID` as Dash writes host job and host-job event ids. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** A flag value that is not the next flag and holds a non-space character. */
const nonBlank = (metavar: 'NAME' | 'TEXT') =>
  string({ metavar, pattern: /^(?!--)\s*\S[\s\S]*$/u });

/** `--config`, the owner-only host pool configuration every `ops` command names. */
const poolConfig = () =>
  option('--config', flagValue('PATH'), {
    description: message`The owner-only host pool configuration (resource configuration schema 3).`,
  });

/** `--type`, the job type as the checkout's catalogue at HEAD names it. */
const jobTypeOption = () =>
  option('--type', flagValue('NAME'), {
    description: message`The job type, as the checkout's infra/jobs/catalogue.json at HEAD names it.`,
  });

/** The admission and payload fields `ops job run` and `ops job calibrate` share (J7, J9). */
const launchFields = (label: string, waitSeconds: number) => ({
  config: poolConfig(),
  type: jobTypeOption(),
  label: withDefault(
    option('--label', flagValue('NAME'), {
      description: message`The lane label status and refusals name, as HEAVY_LOCK_LABEL is; default ${label}.`,
    }),
    label,
  ),
  waitSeconds: withDefault(
    option('--wait-seconds', integer({ min: 0, metavar: 'SECONDS' }), {
      description:
        waitSeconds === 0
          ? message`How long to wait for room; 0 (the default) refuses 75 while anyone is ahead.`
          : message`How long to wait for the pool to drain; default ${String(waitSeconds)}, then 75.`,
    }),
    waitSeconds,
  ),
  pollSeconds: withDefault(
    option('--poll-seconds', integer({ min: 1, max: 30, metavar: 'SECONDS' }), {
      description: message`Seconds between admission polls, 1 to 30; default 5.`,
    }),
    5,
  ),
  argv: multiple(
    argument(string({ metavar: 'COMMAND' }), {
      description: message`The payload, after --: its program, then arguments matching the type's argument profile.`,
    }),
    { min: 1 },
  ),
});

/** One `ops` command: its words after `ops` are its discriminant in `src/ops/commands.ts`. */
function opsCommand<const Words extends string, const Fields extends Record<string, Parser>>(
  name: string,
  words: Words,
  brief: string,
  fields: Fields,
) {
  return command(name, object({ command: constant('ops'), words: constant(words), ...fields }), {
    brief: [text(brief)],
  });
}

/**
 * One release action with explicit profile and source selection, before any adapter read.
 * Proof: adding an ignored --force option made `grammar refuses unknown flag` execute its adapter.
 */
function declareReleaseAction<const Action extends 'plan' | 'run'>(action: Action) {
  return opsCommand(
    action,
    `release ${action}`,
    `${action === 'plan' ? 'Plan' : 'Run'} a dev-fast or full release.`,
    {
      action: constant(action),
      // Proof: dropping pattern ran the adapter in `a configured malformed target is refused`.
      target: argument(string({ metavar: 'TARGET', pattern: /^[a-z][a-z0-9-]*$/u })),
      config: operandOption('--config', 'PATH', 'The owner-only release dispatch configuration.'),
      // Proof: adding unknown to the enum failed `grammar refuses invalid environment` with full.
      environment: option(
        '--environment',
        choice(['development', 'production'] as const, { metavar: 'development|production' }),
        {
          description: message`The explicit destination environment.`,
        },
      ),
      // Proof: allowing unsafe or defaulting full ran adapters in the invalid/missing profile cases.
      profile: option(
        '--profile',
        choice(['dev-fast', 'full'] as const, { metavar: 'dev-fast|full' }),
        {
          description: message`dev-fast uses focused development checks; full uses complete verification.`,
        },
      ),
      // Proof: selecting the last of repeated refs failed `grammar refuses duplicate flag`.
      ref: optional(operandOption('--ref', 'REF', 'The private source branch override.')),
      publicRef: optional(
        operandOption('--public-ref', 'REF', 'The public source branch override.'),
      ),
    },
  );
}

// Proof: admitting deploy as another action failed `grammar refuses invalid action`.
const releaseNamespace = command(
  'release',
  or(declareReleaseAction('plan'), declareReleaseAction('run')),
  {
    brief: message`Plan or run a configured release with explicit dev-fast or full verification.`,
  },
);

/**
 * `ops` has one typed grammar for release operations, host jobs and the host pool. Release
 * dispatch remains independent of the heavier authority and host-job runtime.
 */
const opsNamespace = command(
  'ops',
  or(
    command(
      'job',
      or(
        opsCommand(
          'run',
          'job run',
          'Admit a host job from the host pool, run it measured in its own scope, settle it.',
          launchFields('unlabeled', 0),
        ),
        opsCommand(
          'calibrate',
          'job calibrate',
          'Wait for the pool to drain, hold all of it, run the job unbounded and record a calibration.',
          launchFields('calibration', 7200),
        ),
        opsCommand(
          'propose',
          'job propose',
          'Print the replacement catalogue entry for a job type from its run records; write nothing.',
          {
            config: poolConfig(),
            type: jobTypeOption(),
            hostClass: optional(
              option('--host-class', flagValue('NAME'), {
                description: message`The host class to propose for; default this host's.`,
              }),
            ),
            toolchain: optional(
              option('--toolchain', flagValue('NAME'), {
                description: message`The toolchain to propose for, as run records name it; default the bun on PATH.`,
              }),
            ),
          },
        ),
        opsCommand(
          'audit',
          'job audit',
          'Name every envelope drift in the run records; exit 1 on any, print no drift otherwise.',
          {
            config: poolConfig(),
            now: optional(
              option('--now', flagValue('NAME'), {
                description: message`The ISO-8601 UTC instant estimates are judged at; default now.`,
              }),
            ),
          },
        ),
        opsCommand(
          'render-audit-units',
          'job render-audit-units',
          'Write the weekly systemd user timer and service for ops job audit; install nothing.',
          {
            config: poolConfig(),
            bun: option('--bun', flagValue('PATH'), {
              description: message`The bun the service runs Dash with.`,
            }),
            dash: option('--dash', flagValue('PATH'), {
              description: message`Dash's entrypoint.`,
            }),
            checkout: option('--checkout', flagValue('PATH'), {
              description: message`The checkout whose catalogue the audit judges; its working directory.`,
            }),
            outputDirectory: option('--output-directory', flagValue('PATH'), {
              description: message`Where to write the two unit files; neither may exist.`,
            }),
          },
        ),
        opsCommand(
          'admission',
          'job admission',
          'Print as JSON whether the host job --job names is running; a nested launcher asks before it runs.',
          {
            config: poolConfig(),
            // Proof: with `flagValue('NAME')` here `the grammar takes only a job id`
            // (admission.test.ts) parsed `--job gate` (2026-11-05, verify.md Slice 6e); with
            // `/^[0-9a-f-]{36}$/u` it parsed 36 hyphens (2026-11-06, Slice 6g review F7).
            job: option('--job', string({ metavar: 'ID', pattern: UUID }), {
              description: message`The host job id, as DASH_JOB_ID carries it.`,
            }),
          },
        ),
        opsCommand(
          'status',
          'job status',
          'Print the running host jobs, then the waiters oldest first.',
          { config: poolConfig() },
        ),
      ),
      { brief: message`Run and inspect host jobs.` },
    ),
    // Proof: removing this branch failed the actual-entrypoint standard-equals adapter test.
    releaseNamespace,
    command(
      'pool',
      or(
        opsCommand(
          'init',
          'pool init',
          'Initialize the host pool: the resource ledger and its run records.',
          { config: poolConfig() },
        ),
        opsCommand(
          'inspect',
          'pool inspect',
          'Print the host pool as JSON: mode, guard, eligibility, budgets, reservations, jobs, waiters and the shell lock.',
          { config: poolConfig() },
        ),
        opsCommand(
          'switch-mode',
          'pool switch-mode',
          'Drain the pool and the shell lock, verify the launchers, and flip the mode in the ledger with your record.',
          {
            config: poolConfig(),
            target: argument(choice(['observe', 'concurrent'] as const, { metavar: 'MODE' }), {
              description: message`The mode to switch to: concurrent, or observe to roll back.`,
            }),
            operator: option('--operator', flagValue('NAME'), {
              description: message`Who switches; the mode record names them beside the account.`,
            }),
            waitSeconds: withDefault(
              option('--wait-seconds', integer({ min: 0, metavar: 'SECONDS' }), {
                description: message`How long to wait for the drain; default 1800, then 75.`,
              }),
              1800,
            ),
            pollSeconds: withDefault(
              option('--poll-seconds', integer({ min: 1, max: 30, metavar: 'SECONDS' }), {
                description: message`Seconds between drain polls, 1 to 30; default 5.`,
              }),
              5,
            ),
            releaseGuard: withDefault(
              flag('--release-guard', {
                description: message`With concurrent: record that no stale checkout can execute, ending the singleton guard.`,
              }),
              false,
            ),
            allowEmpty: withDefault(
              flag('--allow-empty', {
                description: message`With concurrent: flip although concurrencyEligible lists no type.`,
              }),
              false,
            ),
          },
        ),
      ),
      { brief: message`Initialize, inspect and switch the host pool.` },
    ),
    command(
      'outbox',
      opsCommand(
        'drop',
        'outbox drop',
        'Drop the host-job event WBS refuses 400 from the head of the authority outbox, journalled; the next event publishes.',
        {
          config: poolConfig(),
          // Proof: with `/^[0-9a-f-]{36}$/u` here `the grammar takes an event id, an operator and
          // a reason` (outbox-drop.test.ts) parsed 36 hyphens (2026-11-06, Slice 6g review F7).
          event: option('--event', string({ metavar: 'ID', pattern: UUID }), {
            description: message`The refused event's id, as watch's refusal line names it.`,
          }),
          // Proof: with `flagValue('NAME')` here the same test parsed a blank operator
          // (2026-11-06, Slice 6g review F3).
          operator: option('--operator', nonBlank('NAME'), {
            description: message`Who drops it; the drop record names them beside the account.`,
          }),
          // Proof: with `flagValue('NAME')` here `the grammar takes an event id, an operator and
          // a reason` (outbox-drop.test.ts) parsed a blank reason (2026-11-05, Slice 6g).
          reason: option('--reason', nonBlank('TEXT'), {
            description: message`Why it is dropped, kept in the drop record.`,
          }),
        },
      ),
      { brief: message`Repair the authority outbox.` },
    ),
  ),
  { brief: message`Operate releases, host jobs, the host pool and its outbox.` },
);

const commands = [...dispatchedCommands, opsNamespace, ...entrypointCommands];

/**
 * Every Dash command line: one `command` per Dash command, help and completion added by `run`.
 * Nested because `or` takes at most fifteen parsers.
 */
export const dashParser = or(or(...dispatchedCommands), opsNamespace, ...entrypointCommands);

/** A parsed Dash command line, discriminated by `command`. */
export type DashCommand = InferValue<typeof dashParser>;

/** The centrally parsed release request, handled before the authority graph is loaded. */
export type ReleaseCommand = InferValue<typeof releaseNamespace>;

/**
 * Select release operations from the parsed ops namespace without loading their handler.
 * Proof: broadening to every ops command failed `host status never follows release dispatch`.
 */
export function isReleaseCommand(command: DashCommand): command is ReleaseCommand {
  return command.command === 'ops' && command.words.startsWith('release ');
}

/** The parsed request of the Dash command (or commands) `Name`, as its handler receives it. */
export type DashRequest<Name extends DashCommand['command']> = Extract<
  DashCommand,
  { readonly command: Name }
>;

/** What one invocation did: a command to dispatch, or help or a completion script printed. */
export type DashInvocation =
  { readonly kind: 'command'; readonly command: DashCommand } | { readonly kind: 'printed' };

/** Where a command line's words lead in the grammar: its usage there, and how many words it named. */
interface CommandPath {
  readonly usage: Usage;
  /**
   * The count of leading words that are command words: the names matched, and the word after
   * them when the grammar expects a subcommand there (`resources teleport`).
   */
  readonly depth: number;
}

/**
 * True when `term` begins a subcommand: a command, or a choice among commands.
 * Proof: not counting that slot made `a refusal never quotes an operand` see `resources
 * teleport` refuse with `` `…` `` instead of naming `teleport` (2026-11-02).
 */
function isCommandSlot(term: UsageTerm | undefined): boolean {
  return (
    term?.type === 'command' ||
    (term?.type === 'exclusive' && term.terms.every((branch) => branch.at(0)?.type === 'command'))
  );
}

/**
 * The deepest command `args` names, through nested `command`s and `or`s: `resources cleanup`
 * refuses with `resources cleanup`'s usage, not the whole `resources` tree. Undefined when the
 * first word names no Dash command.
 */
function commandPathOf(args: readonly string[]): CommandPath | undefined {
  const name = args.at(0);
  const root = commands.find((candidate) =>
    candidate.usage.some((term) => term.type === 'command' && term.name === name),
  );
  if (root === undefined) return undefined;
  const named: UsageTerm[] = [];
  let rest: Usage = root.usage;
  for (;;) {
    const first = rest.at(0);
    const after = rest.slice(1);
    if (first?.type === 'command' && first.name === args.at(named.length)) {
      named.push(first);
      rest = after;
      continue;
    }
    const branch =
      first?.type === 'exclusive'
        ? first.terms.find((terms) => {
            const head = terms.at(0);
            return head?.type === 'command' && head.name === args.at(named.length);
          })
        : undefined;
    // Proof: never descending made `resources init refuses an unknown flag in its own usage
    // line` (and its eight siblings) see the whole `resources` tree (2026-11-02).
    if (branch === undefined) {
      return { usage: [...named, ...rest], depth: named.length + (isCommandSlot(first) ? 1 : 0) };
    }
    rest = [...branch, ...after];
  }
}

/**
 * The one-line usage of a command path, uncoloured whatever the terminal says.
 * Proof: `colors: true` here failed `help parity holds under COLUMNS=30 and FORCE_COLOR=1` with
 * ANSI bytes in the `resources init` refusal line (2026-11-02).
 */
function usageLine(path: CommandPath): string {
  return `usage: ${formatUsage(programName, path.usage, { colors: false })}`.replace(/\s+/gu, ' ');
}

/**
 * The placeholder an operand gets in a refusal: its 1-based position after the command words,
 * and the flag before it when there is one (`<word 5 after --candidate-policy>`), so the
 * operator can find a stray word or a valueless flag without the line echoing the value.
 */
function placeholderOf(operands: readonly string[], index: number): string {
  const before = operands.at(index - 1);
  const flag = index > 0 && before?.startsWith('-') ? before.split('=')[0] : undefined;
  return `<word ${String(index + 1)}${flag === undefined ? '' : ` after ${flag}`}>`;
}

/**
 * `reason` with every operand of `args` replaced by its {@link placeholderOf} wherever Optique
 * quotes it, so a refusal never echoes a value: a key pasted after `--key-file`, an entry path, a
 * `--flag=value` tail. Option names stay, and so do the command words. A value given twice is
 * shown at its first position.
 * Proof: returning `reason` unredacted failed `a refusal never quotes an operand` on the
 * conflicting `--key-file` and `--assertion-file` values (2026-11-02).
 * Proof: a bare `…` placeholder failed `a stray word and a mid-line valueless flag name their
 * position` (2026-11-03).
 */
function redactOperands(reason: string, args: readonly string[], depth: number): string {
  const operands = args.slice(depth);
  let redacted = reason;
  operands.forEach((token, index) => {
    const equals = token.indexOf('=');
    const placeholder = placeholderOf(operands, index);
    const replacements: readonly (readonly [string, string])[] = token.startsWith('-')
      ? equals < 0
        ? []
        : [
            [token, `${token.slice(0, equals)}=${placeholder}`],
            [token.slice(equals + 1), placeholder],
          ]
      : [[token, placeholder]];
    for (const [value, shown] of replacements) {
      for (const quote of ['"', '`']) {
        redacted = redacted.replaceAll(`${quote}${value}${quote}`, `${quote}${shown}${quote}`);
      }
    }
  });
  return redacted;
}

/**
 * One refusal line from Optique's error text, which `help <unknown>` prefixes with the whole
 * usage, so only the text after its last `Error: ` is the reason. An argv whose first word names
 * no Dash command refuses `Unsupported Dash command: <word>`; any other refusal starts with the
 * usage of the deepest command it names.
 */
function refusalOf(args: readonly string[], errorText: string): string {
  const marker = errorText.lastIndexOf('Error: ');
  const reason = (marker < 0 ? errorText : errorText.slice(marker + 'Error: '.length))
    .replace(/\s+/gu, ' ')
    .trim();
  const name = args.at(0);
  // Proof: returning `reason` unmapped here failed `the installed entrypoint refuses an apply
  // command` with Optique's "Unexpected option or subcommand: `apply`." (2026-11-01).
  if (name === 'help' || name === 'completion') {
    // `completion` without a shell follows its first sentence with its whole help page.
    // Proof: returning `reason` whole here failed `completion without a shell refuses in one
    // short line` with the help page in the line (2026-11-01).
    const brief = reason.includes('Usage:') ? /^[^.]*\./u.exec(reason)?.[0] : undefined;
    return `usage: ${programName} ${name} (${brief ?? reason})`;
  }
  const path = commandPathOf(args);
  if (path === undefined) return `Unsupported Dash command: ${String(name)}`;
  return `${usageLine(path)} (${redactOperands(reason, args, path.depth)})`;
}

/**
 * What a parsed command line states that no single option can refuse: the cross-option rules
 * the hand-written loops checked before any read. Undefined when the line is coherent.
 */
function incoherenceOf(command: DashCommand): string | undefined {
  if (isReleaseCommand(command)) {
    // Proof: replacing this condition with false ran an adapter in `production dev-fast cannot execute`.
    return command.profile === 'dev-fast' && command.environment !== 'development'
      ? 'dev-fast is development-only; select full explicitly'
      : undefined;
  }
  if (command.command !== 'account-outcomes') return undefined;
  // Proof: dropping this check made `refuses what no single option can: no log directory, an
  // inverted period` see the line accepted (2026-11-02).
  if (command.claudeProjects.length + command.codexSessions.length === 0) {
    return 'at least one --claude-projects or --codex-sessions is required.';
  }
  // Both are validated instants of one fixed shape, so their order is their string order; Dash
  // reads no clock here. Proof: dropping this check made that test and `grammar refuses before
  // reading: …` (account-outcomes.test.ts) see the inverted period accepted (2026-11-02).
  if (!(command.until > command.since)) return '--until must be after --since.';
  return undefined;
}

/** The exit that ends `run` after it printed help or a completion script; never escapes. */
class Printed extends Error {
  override readonly name = 'Printed';
}

/**
 * Parses one Dash command line through Optique's `run`, with every sink injected: help and
 * completion scripts go to `stdout` and return `{ kind: 'printed' }`; a refusal throws {@link UsageRefusal}
 * and writes nothing. Never calls `process.exit`.
 *
 * @throws UsageRefusal with one line: `Unsupported Dash command: <name>` or `usage: …`.
 */
export function readDashInvocation(
  args: readonly string[],
  stdout: (text: string) => void,
): DashInvocation {
  let errorText = '';
  let parsed: DashCommand;
  try {
    parsed = run(dashParser, {
      programName,
      args,
      stdout,
      stderr: (chunk) => {
        errorText += chunk;
      },
      // Proof: dropping `onExit` let `run` call `process.exit(1)`, so `the installed entrypoint
      // refuses an apply command` saw empty stderr instead of one `error:` line (2026-11-01).
      onExit: (code) => {
        throw code === 0 ? new Printed() : new UsageRefusal(refusalOf(args, errorText));
      },
      // The two byte-stability knobs: without them `run` reads the terminal's colour support and
      // width (`process.stdout.columns`, `COLUMNS`), so help and refusals would vary per terminal.
      // Proof: dropping `maxWidth` failed `help parity holds under COLUMNS=30`: the help printed
      // under `COLUMNS=30` differed from the in-process bytes (2026-11-01).
      colors: false,
      maxWidth: 120,
      aboveError: 'none',
      help: 'both',
      completion: 'command',
    });
  } catch (cause) {
    if (cause instanceof Printed) return { kind: 'printed' };
    throw cause;
  }
  const incoherence = incoherenceOf(parsed);
  if (incoherence !== undefined) {
    const path = commandPathOf(args);
    if (path === undefined) throw new Error(`parsed ${parsed.command} names no Dash command`);
    throw new UsageRefusal(`${usageLine(path)} (${incoherence})`);
  }
  return { kind: 'command', command: parsed };
}

/**
 * Parses a command line that must name a command, for programmatic callers such as tests.
 *
 * @throws UsageRefusal on any refusal, and when the line asks only for help or completion.
 */
export function parseDashCommand(args: readonly string[]): DashCommand {
  const invocation = readDashInvocation(args, () => undefined);
  if (invocation.kind === 'printed') {
    throw new UsageRefusal(`${args.join(' ')} prints help or completion, not a command`);
  }
  return invocation.command;
}

/**
 * Parses a command line that must name the command `name`, for tests that call one command's
 * module with what the parser hands it.
 *
 * @throws UsageRefusal on any refusal, and when the line names another command.
 */
export function parseDashRequest<const Name extends DashCommand['command']>(
  name: Name,
  args: readonly string[],
): DashRequest<Name> {
  const parsed = parseDashCommand(args);
  // Proof: dropping this check made `parseDashRequest refuses a line naming another command`
  // receive the bootstrap-authority object (2026-11-02).
  if (!isRequestOf(name, parsed)) {
    throw new UsageRefusal(`${args.join(' ')} names ${parsed.command}, not ${name}`);
  }
  return parsed;
}

function isRequestOf<Name extends DashCommand['command']>(
  name: Name,
  command: DashCommand,
): command is DashRequest<Name> {
  return command.command === name;
}
