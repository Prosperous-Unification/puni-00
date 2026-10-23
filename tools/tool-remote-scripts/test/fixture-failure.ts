import { createHash } from 'node:crypto';

export const FIXTURE_STAGES = [
  'solver-fixture',
  'fixture-images',
  'fixture-files',
  'fixture-networks',
  'fixture-source-create',
  'fixture-managed-create',
  'fixture-edge-create',
  'fixture-edge-attach',
  'fixture-tag-negative',
  'fixture-source-writes',
  'fixture-ingress-readiness',
  'fixture-composition',
  'fixture-protected-callback',
  'fixture-component-cleanup',
  'fixture-solver-cleanup',
  'fixture-source-start',
  'fixture-edge-start',
  'fixture-token-expiry',
] as const;
export type FixtureStage = (typeof FIXTURE_STAGES)[number];
const COMMANDS = [
  'docker-create',
  'docker-run',
  'docker-start',
  'docker-inspect',
  'docker-ps',
  'docker-top',
  'docker-update',
  'docker-stop',
  'docker-kill',
  'docker-wait',
  'docker-rm',
  'docker-tag',
  'docker-image-inspect',
  'docker-image-ls',
  'docker-image-rm',
  'docker-network-create',
  'docker-network-inspect',
  'docker-network-connect',
  'docker-network-rm',
  'systemctl-start',
  'systemctl-stop',
  'systemctl-show',
  'systemctl-link',
  'systemctl-daemon-reload',
  'busctl-property',
  'git-rev-parse',
  'git-status',
  'bun',
  'sleep',
  'rm',
  'unclassified',
] as const;
type FixtureCommand = (typeof COMMANDS)[number];
type Category =
  | 'fixture-stage'
  | 'command-exit'
  | 'unclassified-command'
  | 'source-host-config'
  | 'source-tag-resolution'
  | 'source-timestamp'
  | 'source-transitional-topology'
  | 'source-arguments'
  | 'fixture-json'
  | 'tag-negative-expectation'
  | 'unrelated-inventory'
  | 'source-terminal'
  | 'unclassified'
  | 'non-error'
  | 'cycle'
  | 'depth-limit'
  | 'size-limit'
  | 'unreadable-error'
  | 'unrelated-namespace'
  | 'source-token-expired'
  | 'missing-expected-refusal';
interface FailureEntry {
  category: Category;
  fingerprint?: string;
  command?: FixtureCommand;
  status?: number;
  stage?: FixtureStage;
}
export interface FixtureDiagnostic {
  stage: FixtureStage;
  chain: FailureEntry[];
}
const operations = new Map<string, FixtureCommand>(COMMANDS.map((command) => [command, command]));
function classifyCommand(argv: readonly string[]): FixtureCommand {
  const executable = argv[0];
  let key: string;
  if (executable === 'docker')
    key =
      argv[1] === 'image' || argv[1] === 'network'
        ? `docker-${argv[1]}-${argv[2]}`
        : `docker-${argv[1]}`;
  else if (executable === 'systemctl' && argv[1] === '--user') key = `systemctl-${argv[2]}`;
  else if (executable === 'busctl' && argv[1] === '--user' && argv[2] === 'get-property')
    key = 'busctl-property';
  else if (executable === 'git') key = `git-${argv[1]}`;
  else if (executable === process.execPath || executable === 'bun') key = 'bun';
  else if (executable === '/bin/sleep') key = 'sleep';
  else if (executable === '/bin/rm') key = 'rm';
  else return 'unclassified';
  const command = operations.get(key);
  return command ?? 'unclassified';
}
/** Keeps command attribution without retaining argv, stdout, stderr or arbitrary executable text. */
export class FixtureCommandFailure extends Error {
  readonly command: FixtureCommand;
  constructor(
    argv: readonly string[],
    readonly status: number,
  ) {
    // Proof: command-status-grammar fault admitted invalid statuses; receipt grammar negatives failed.
    if (!Number.isInteger(status) || status < 0 || status > 255)
      throw new Error('fixture command exit status invalid');
    super(`fixture command exit ${String(status)}`);
    this.command = classifyCommand(argv);
  }
}
/** Adds one closed pipeline coordinate while preserving the raw cause in memory only. */
export class FixtureFailure extends Error {
  constructor(
    readonly stage: FixtureStage,
    cause: unknown,
  ) {
    // Proof: stage-grammar fault admitted an external private coordinate; the closed-input negative failed.
    if (!FIXTURE_STAGES.includes(stage)) throw new Error('fixture stage invalid');
    super('fixture acceptance failed', { cause });
  }
}
const assertions = new Map<string, Category>([
  [
    'source dev requires typed init, private PID, unprivileged and no added caps',
    'source-host-config',
  ],
  [
    'managed cohort source dev mutable image tag resolution changed or was not excluded',
    'source-tag-resolution',
  ],
  ['source dev timestamp lifecycle incoherent', 'source-timestamp'],
  ['source dev refuses transitional dev backend/gateway topology', 'source-transitional-topology'],
  ['managed cohort source dev effective arguments changed or was not excluded', 'source-arguments'],
  ['private fixture inspection malformed', 'fixture-json'],
  ['actual source tag substitution was not refused', 'tag-negative-expectation'],
  ['unrelated negative child omitted from complete census', 'unrelated-inventory'],
  ['source terminal/PID-zero/restart proof missing', 'source-terminal'],
  ['source dev exclusion is not live for owner', 'source-token-expired'],
  ['fixture expected refusal was absent', 'missing-expected-refusal'],
]);
function classifyAssertion(message: string): Category {
  const category = assertions.get(message);
  if (category !== undefined) return category;
  if (
    /^backend fence actual namespace audit refused for container ([a-f0-9]{64}); attended maintenance or a dedicated daemon required; no unrelated container was stopped: unmanaged container \1 has mounts but no running namespace; review\/remove the stopped container before retrying$/.test(
      message,
    )
  )
    return 'unrelated-namespace';
  return 'unclassified';
}
const fingerprint = (name: string, message: string) =>
  createHash('sha256')
    .update(name.slice(0, 128))
    .update('\0')
    .update(message.slice(0, 4096))
    .digest('hex');
/**
 * Receipt boundary: only closed stages/categories, numeric exits and bounded hashes escape.
 * Traversal never enumerates or serializes errors; cycles, oversized text, getters and depth
 * limits are explicit diagnostic outcomes. Unknown failures remain failures at the caller.
 * Proof: private-hash, captured-metadata, cause-cycle/depth/size injected faults each failed
 * the adjacent privacy/bound tests; receipts are under evidence/source-native-init.
 */
export function summarizeFixtureFailure(
  cause: unknown,
  fallback: FixtureStage = 'solver-fixture',
): FixtureDiagnostic {
  // Proof: fallback-grammar fault exposed an invalid coordinate; the closed-input negative failed.
  if (!FIXTURE_STAGES.includes(fallback)) throw new Error('fixture diagnostic fallback invalid');
  const diagnostic: FixtureDiagnostic = { stage: fallback, chain: [] };
  const seen = new Set<unknown>();
  let current = cause;
  let foundStage = false;
  for (let depth = 0; depth < 8; depth++) {
    if (seen.has(current)) {
      diagnostic.chain.push({ category: 'cycle' });
      return diagnostic;
    }
    seen.add(current);
    try {
      if (!(current instanceof Error)) {
        const value = typeof current === 'string' ? current : typeof current;
        diagnostic.chain.push({
          category: value.length > 4096 ? 'size-limit' : 'non-error',
          fingerprint: fingerprint('non-error', value),
        });
        return diagnostic;
      }
      const name: unknown = current.name,
        message: unknown = current.message;
      if (typeof name !== 'string' || typeof message !== 'string') {
        diagnostic.chain.push({ category: 'unreadable-error' });
        return diagnostic;
      }
      if (name.length > 128 || message.length > 4096) {
        diagnostic.chain.push({ category: 'size-limit', fingerprint: fingerprint(name, message) });
        return diagnostic;
      }
      const entry: FailureEntry = {
        category: 'unclassified',
        fingerprint: fingerprint(name, message),
      };
      if (current instanceof FixtureFailure) {
        const observedStage: unknown = current.stage;
        const stage = FIXTURE_STAGES.find((candidate) => candidate === observedStage);
        if (stage !== undefined) {
          entry.category = 'fixture-stage';
          entry.stage = stage;
          if (!foundStage) {
            diagnostic.stage = stage;
            foundStage = true;
          }
        }
      } else if (current instanceof FixtureCommandFailure) {
        const observedCommand: unknown = current.command,
          status: unknown = current.status;
        const command = COMMANDS.find((candidate) => candidate === observedCommand);
        if (
          command !== undefined &&
          typeof status === 'number' &&
          Number.isInteger(status) &&
          status >= 0 &&
          status <= 255
        ) {
          entry.category = command === 'unclassified' ? 'unclassified-command' : 'command-exit';
          entry.command = command;
          entry.status = status;
        } else entry.category = 'unclassified-command';
      } else entry.category = classifyAssertion(message);
      diagnostic.chain.push(entry);
      current = current.cause;
      if (current === undefined) return diagnostic;
    } catch {
      diagnostic.chain.push({ category: 'unreadable-error' });
      return diagnostic;
    }
  }
  diagnostic.chain.push({ category: 'depth-limit' });
  return diagnostic;
}
/** Safe string form for existing exception/cleanup fields; never uses Error.toString(). */
export function describeFixtureFailure(
  cause: unknown,
  fallback: FixtureStage = 'solver-fixture',
): string {
  return JSON.stringify(summarizeFixtureFailure(cause, fallback));
}
/** Wraps the boundary without masking an already attributed fixture failure or accepting a failure. */
export async function withFixtureStage<T>(
  stage: FixtureStage,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    if (cause instanceof FixtureFailure) throw cause;
    throw new FixtureFailure(stage, cause);
  }
}

/**
 * Only a known direct refusal is expected; unknown failures retain their cause and fail.
 * Proof: unexpected-refusal fault accepted an unknown error; the expected-negative test failed.
 */
export async function requireFixtureRefusal(
  stage: FixtureStage,
  category: 'source-tag-resolution' | 'unrelated-namespace' | 'source-token-expired',
  action: () => Promise<unknown>,
): Promise<FixtureDiagnostic> {
  // Proof: refusal-grammar fault accepted unclassified as expected; the closed-input negative failed.
  if (!['source-tag-resolution', 'unrelated-namespace', 'source-token-expired'].includes(category))
    throw new Error('fixture expected refusal category invalid');
  try {
    await action();
  } catch (cause) {
    const diagnostic = summarizeFixtureFailure(cause, stage);
    if (diagnostic.chain[0]?.category === category) return diagnostic;
    throw new FixtureFailure(stage, cause);
  }
  throw new FixtureFailure(stage, new Error('fixture expected refusal was absent'));
}
