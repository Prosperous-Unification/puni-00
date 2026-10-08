import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { type } from 'arktype';

const Digest = /^[0-9a-f]{64}$/;
const Account = /^[a-z_][a-z0-9_-]{0,31}$/;
const RendererInput = type({
  schemaVersion: '1',
  serviceUser: Account,
  serviceGroup: Account,
  runtimeDirectory: 'string',
  trustDirectory: 'string',
  stateDirectory: 'string',
  bunPath: 'string',
  bunIdentity: Digest,
  launcherPath: 'string',
  launcherIdentity: Digest,
  bunConfigPath: 'string',
  bunConfigIdentity: Digest,
  serviceConfigPath: 'string',
  serviceConfigIdentity: Digest,
  bootstrapPath: 'string',
  bootstrapIdentity: Digest,
  runtimePinPath: 'string',
  credentialPath: 'string|null',
  wholeTickMs: 'number.integer>=1',
  cleanupMs: 'number.integer>=1',
  startTimeoutSec: 'number.integer>=1',
  stopTimeoutSec: 'number.integer>=1',
}).onUndeclaredKey('reject');
export type ObservationUnitInput = typeof RendererInput.infer;

export interface RenderedObservationUnits {
  readonly service: string;
  readonly timer: string;
  readonly runtimePins: string;
}

function requirePath(path: string): void {
  // Proof: path removed this guard; a `%h` Bun path entered the rendered unit.
  // Proof: literal_variable, literal_quote, and literal_nul each removed the
  // literal grammar; the corresponding executable path entered the unit.
  // No systemd specifier, whitespace, escape, or path alias can enter a unit.
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    path === sep ||
    !/^\/[A-Za-z0-9._/-]+$/.test(path) ||
    path.split(sep).includes('..') ||
    path.split(sep).includes('.')
  )
    throw new Error('observation unit path malformed');
}

function requireChild(parent: string, child: string): void {
  if (!child.startsWith(`${parent}${sep}`))
    throw new Error('observation unit path escapes protected layout');
}

function replace(template: string, substitutions: Readonly<Record<string, string>>): string {
  let unit = template;
  for (const [name, value] of Object.entries(substitutions))
    unit = unit.replaceAll(`@${name}@`, value);
  if (/@[A-Z_]+@/.test(unit)) throw new Error('observation unit placeholder unresolved');
  return unit;
}

/** Renders uninstalled units from a typed, independently administered layout. */
export function renderObservationUnits(raw: unknown): RenderedObservationUnits {
  const input = RendererInput(raw);
  if (input instanceof type.errors) throw new Error('observation unit configuration malformed');
  // Proof: account removed this check; root was accepted by the renderer fixture.
  if (input.serviceUser === 'root' || input.serviceGroup === 'root')
    throw new Error('observation unit service account must be non-root');
  for (const path of [
    input.runtimeDirectory,
    input.trustDirectory,
    input.stateDirectory,
    input.bunPath,
    input.launcherPath,
    input.bunConfigPath,
    input.serviceConfigPath,
    input.bootstrapPath,
    input.runtimePinPath,
    ...(input.credentialPath === null ? [] : [input.credentialPath]),
  ])
    requirePath(path);
  // Proof: child replaced requireChild with lexical-only validation; a foreign
  // service-config path was rendered outside the protected trust directory.
  for (const [parent, child] of [
    [input.runtimeDirectory, input.bunPath],
    [input.runtimeDirectory, input.launcherPath],
    [input.trustDirectory, input.bunConfigPath],
    [input.trustDirectory, input.serviceConfigPath],
    [input.trustDirectory, input.bootstrapPath],
    [input.trustDirectory, input.runtimePinPath],
    ...(input.credentialPath === null ? [] : [[input.trustDirectory, input.credentialPath]]),
  ])
    requireChild(parent, child);
  // Proof: statealias omitted exact runtime/state equality; the writable state
  // path was allowed to alias the immutable runtime directory.
  if (
    input.runtimeDirectory === input.trustDirectory ||
    input.runtimeDirectory === input.stateDirectory ||
    input.trustDirectory === input.stateDirectory ||
    input.stateDirectory.startsWith(`${input.runtimeDirectory}${sep}`) ||
    input.stateDirectory.startsWith(`${input.trustDirectory}${sep}`) ||
    input.runtimeDirectory.startsWith(`${input.stateDirectory}${sep}`) ||
    input.trustDirectory.startsWith(`${input.stateDirectory}${sep}`)
  )
    throw new Error('observation unit state cannot alias runtime or trust');
  const startMilliseconds = input.startTimeoutSec * 1000;
  const stopMilliseconds = input.stopTimeoutSec * 1000;
  // Proof: timeout removed its upper bound; a 3601-second start timeout was accepted.
  if (
    !Number.isSafeInteger(startMilliseconds) ||
    !Number.isSafeInteger(stopMilliseconds) ||
    startMilliseconds <= input.wholeTickMs + input.cleanupMs ||
    stopMilliseconds < input.cleanupMs ||
    input.startTimeoutSec > 3600 ||
    input.stopTimeoutSec > 600
  )
    throw new Error('observation unit timeout malformed');
  const serviceTemplate = readFileSync(
    join(import.meta.dir, 'observation.service.template'),
    'utf8',
  );
  const timer = readFileSync(join(import.meta.dir, 'observation.timer.template'), 'utf8');
  const readOnly = [
    input.runtimeDirectory,
    input.trustDirectory,
    input.bunPath,
    input.launcherPath,
    input.bunConfigPath,
    input.serviceConfigPath,
    input.bootstrapPath,
    input.runtimePinPath,
    ...(input.credentialPath === null ? [] : [input.credentialPath]),
  ];
  const service = replace(serviceTemplate, {
    SERVICE_USER: input.serviceUser,
    SERVICE_GROUP: input.serviceGroup,
    WORKING_DIRECTORY: input.stateDirectory,
    READ_ONLY_PATHS: readOnly.join(' '),
    STATE_DIRECTORY: input.stateDirectory,
    RUNTIME_PIN_PATH: input.runtimePinPath,
    BUN_PATH: input.bunPath,
    BUN_CONFIG_PATH: input.bunConfigPath,
    LAUNCHER_PATH: input.launcherPath,
    SERVICE_CONFIG_PATH: input.serviceConfigPath,
    START_TIMEOUT_SEC: String(input.startTimeoutSec),
    STOP_TIMEOUT_SEC: String(input.stopTimeoutSec),
  });
  // Proof: trustpin omitted the service-config digest; rendered SHA-256 bytes changed.
  return {
    service,
    timer,
    runtimePins: `${input.bunIdentity}  ${input.bunPath}\n${input.launcherIdentity}  ${input.launcherPath}\n${input.bunConfigIdentity}  ${input.bunConfigPath}\n${input.serviceConfigIdentity}  ${input.serviceConfigPath}\n${input.bootstrapIdentity}  ${input.bootstrapPath}\n`,
  };
}
