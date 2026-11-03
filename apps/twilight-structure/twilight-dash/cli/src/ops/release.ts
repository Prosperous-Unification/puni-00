import { isAbsolute } from 'node:path';

import { parseSecretsOrThrow, type } from '@shared/validation';

import type { ReleaseCommand } from '../cli-parser';
import { readOwnerOnly } from '../compute/configuration';

const AbsolutePath = type('string > 0').narrow((path) => isAbsolute(path) && !path.includes('\0'));
const Target = type({ adapter: AbsolutePath, configuration: AbsolutePath }).onUndeclaredKey(
  'reject',
);
const Dispatch = type({ schemaVersion: '1', targets: { '[string]': Target } }).onUndeclaredKey(
  'reject',
);
/**
 * Dispatch `ops release` to an explicitly configured adapter through the current Bun binary.
 * The owner-only configuration is executable authority: its owner chooses the adapter, while
 * the central grammar validates profile and argument boundaries before this module is loaded. Adapters own release source/receipt and
 * deployment policy; this facade makes no claim that an exit-zero child proves a deployment.
 * See {@link readOwnerOnly} for descriptor-bound protection and `docs/releases.md` for the
 * adapter protocol. Accepts only the centrally parsed request; refuses unavailable configuration and unknown targets.
 * Child output is inherited; its exit status is returned unchanged.
 */
export async function runOpsCommand(
  request: ReleaseCommand,
  write: (text: string) => unknown,
): Promise<number> {
  // Proof: replacing readOwnerOnly with an unchecked read admitted a 0640 file in
  // `configuration refuses exposed state without invoking an adapter`.
  const source = readOwnerOnly(request.config);
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
  // Proof: discarding this status failed `an adapter terminated by a signal cannot report release success`.
  return await child.exited;
}
