import { isAbsolute } from 'node:path';

import { parseSecretsOrThrow, type } from '@shared/validation';

import { readOwnerOnly } from '../compute/configuration';

const USAGE =
  'usage: twilight-dash ops release plan|run TARGET --config PATH --environment development|production --profile dev-fast|full [--ref REF] [--public-ref REF]';
const FLAGS = new Set(['--config', '--environment', '--profile', '--ref', '--public-ref']);
const AbsolutePath = type('string > 0').narrow((path) => isAbsolute(path) && !path.includes('\0'));
const Target = type({ adapter: AbsolutePath, configuration: AbsolutePath }).onUndeclaredKey(
  'reject',
);
const Dispatch = type({ schemaVersion: '1', targets: { '[string]': Target } }).onUndeclaredKey(
  'reject',
);
const Request = type({
  action: "'plan' | 'run'",
  target: /^[a-z][a-z0-9-]*$/,
  configuration: 'string > 0',
  environment: "'development' | 'production'",
  profile: "'dev-fast' | 'full'",
  'ref?': 'string > 0',
  'publicRef?': 'string > 0',
}).onUndeclaredKey('reject');

/** Parse the entire invocation before reading executable authority or starting an adapter. */
function parseRequest(argv: readonly string[]): typeof Request.infer {
  const [action, target, ...words] = argv;
  const options = new Map<string, string>();
  for (let position = 0; position < words.length; position += 2) {
    const flag = words.at(position);
    const value = words.at(position + 1);
    // Proof: removing this grammar guard admitted unknown and repeated flags in the real
    // entrypoint tests `grammar refuses unknown flag` and `grammar refuses duplicate flag`.
    if (
      flag === undefined ||
      !FLAGS.has(flag) ||
      options.has(flag) ||
      value === undefined ||
      value.length === 0 ||
      value.startsWith('-')
    ) {
      throw new Error(USAGE);
    }
    options.set(flag, value);
  }
  // Proof: broadening the request schema admitted invalid action/profile in
  // the `grammar refuses invalid ...` production-entrypoint tests.
  return parseSecretsOrThrow(Request, {
    action,
    target,
    configuration: options.get('--config'),
    environment: options.get('--environment'),
    profile: options.get('--profile'),
    ...(options.has('--ref') ? { ref: options.get('--ref') } : {}),
    ...(options.has('--public-ref') ? { publicRef: options.get('--public-ref') } : {}),
  });
}

/**
 * Dispatch `ops release` to an explicitly configured adapter through the current Bun binary.
 * The owner-only configuration is executable authority: its owner chooses the adapter, while
 * profiles and argument boundaries are checked here. Adapters own release source/receipt and
 * deployment policy; this facade makes no claim that an exit-zero child proves a deployment.
 * See {@link readOwnerOnly} for descriptor-bound protection and `docs/releases.md` for the
 * adapter protocol. Refuses malformed invocations, unavailable configuration and unknown targets.
 * Child output is inherited; its exit status is returned unchanged.
 */
export async function runOpsCommand(
  argv: readonly string[],
  write: (text: string) => unknown,
): Promise<number> {
  const [command, ...words] = argv;
  if (command !== 'release') throw new Error('Unsupported Dash ops command');
  if (words.length === 1 && words[0] === '--help') {
    write(`${USAGE}\n`);
    return 0;
  }
  const request = parseRequest(words);
  // Proof: removing this boundary ran the adapter in `production dev-fast cannot execute`.
  if (request.profile === 'dev-fast' && request.environment !== 'development') {
    throw new Error('dev-fast is development-only; select full explicitly');
  }
  // Proof: replacing readOwnerOnly with an unchecked read admitted a 0640 file in
  // `configuration refuses exposed state without invoking an adapter`.
  const source = readOwnerOnly(request.configuration);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new Error('Release dispatch configuration is not valid JSON', { cause });
  }
  // Proof: bypassing this schema executed a version-2 configuration in
  // `configuration refuses malformed shape state without invoking an adapter`.
  const configuration = parseSecretsOrThrow(Dispatch, parsed);
  const target = new Map(Object.entries(configuration.targets)).get(request.target);
  // Proof: removing this refusal lost the named target outcome in the unknown-target test.
  if (target === undefined) throw new Error(`Unknown release target: ${request.target}`);
  const arguments_ = [
    process.execPath,
    target.adapter,
    request.action,
    '--config',
    target.configuration,
    '--environment',
    request.environment,
    '--profile',
    request.profile,
  ];
  if (request.ref !== undefined) arguments_.push('--ref', request.ref);
  if (request.publicRef !== undefined) arguments_.push('--public-ref', request.publicRef);
  write(
    `[${request.profile === 'dev-fast' ? 'DEV-FAST' : 'FULL'}] ${request.action} ${request.target} environment=${request.environment}\n`,
  );
  const child = Bun.spawn({
    cmd: arguments_,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return await child.exited;
}
