import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireInheritedEdgeLock } from './lib/edge-admission';
import { InitRefusal } from './lib/edge-init';
import {
  type InitMode,
  InitObservationRefusal,
  runProductionInitAdoption,
  type SafeInitSummary,
} from './lib/edge-init-observer';

export interface InitArguments {
  packet: string;
  mode: InitMode;
}

type InitialStage =
  'arguments-invalid' | 'packet-path-invalid' | 'preparation-failed' | 'admission-failed';

/** Projects fixed refusal codes and selected private receipt metadata; native messages, stacks and causes never escape. */
export function describeInitRefusal(cause: unknown): SafeInitSummary | { stage: InitialStage } {
  if (cause instanceof InitObservationRefusal) {
    // Proof: returning the whole summary exposed an extra private cause in the CLI projection negative.
    const { attempt, stage, packetSha256, receiptDirectory, receiptSha256 } = cause.summary;
    return { attempt, stage, packetSha256, receiptDirectory, receiptSha256 };
  }
  const stage =
    cause instanceof InitRefusal
      ? (['arguments-invalid', 'packet-path-invalid', 'preparation-failed'] as const).find(
          (code) => code === cause.reason,
        )
      : undefined;
  // Proof: raw Error messages and unknown refusal-code projection each exposed the private sentinel in separate negatives.
  return { stage: stage ?? 'admission-failed' };
}

/** Three production forms only; host, socket, service, fixture and arbitrary effect overrides are never admitted. */
export function parseInitArguments(arguments_: readonly string[]): InitArguments {
  const packets = arguments_.filter((argument) => argument.startsWith('--packet='));
  const modes = arguments_.filter(
    (argument) => argument === '--execute' || argument === '--inspect-recovery',
  );
  // Proof: packet/mode cardinality and unknown-argument omissions separately admitted their expanded invocation negatives.
  if (
    packets.length !== 1 ||
    modes.length > 1 ||
    packets.length + modes.length !== arguments_.length
  )
    throw new InitRefusal('arguments-invalid');
  const packet = packets[0].slice('--packet='.length);
  // Proof: canonical-path and control-byte omissions separately admitted their path negatives.
  if (
    resolve(packet) !== packet ||
    Array.from(packet).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new InitRefusal('packet-path-invalid');
  const selectedMode = modes.at(0);
  return {
    packet,
    mode:
      selectedMode === '--execute'
        ? 'execute'
        : selectedMode === '--inspect-recovery'
          ? 'inspect-recovery'
          : 'prepare',
  };
}

if (import.meta.main) {
  let invocation: InitArguments | undefined;
  const entry = fileURLToPath(import.meta.url);
  try {
    invocation = parseInitArguments(process.argv.slice(2));
    // Proof: omitting admission let a foreign descriptor reach the factory; source and bundle binding tests failed.
    await requireInheritedEdgeLock();
    // Proof: replacing the factory with a prepared result made the actual source/bundle subprocess negatives return success.
    const summary = await runProductionInitAdoption(invocation.packet, invocation.mode);
    console.log(JSON.stringify(summary));
  } catch (cause) {
    const recovery =
      invocation === undefined
        ? {}
        : {
            recoveryInvocation: [
              process.execPath,
              entry,
              `--packet=${invocation.packet}`,
              '--inspect-recovery',
            ],
          };
    console.error(JSON.stringify({ ...describeInitRefusal(cause), ...recovery }));
    process.exitCode = 1;
  }
}
