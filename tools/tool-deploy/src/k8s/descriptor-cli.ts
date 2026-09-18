import { readFileSync, writeFileSync } from 'node:fs';

import {
  assertAdmittedDescriptor,
  assertGateEvidence,
  descriptorSha256,
  type ObservedGateRun,
  parseDescriptor,
  parseReleaseCandidate,
  renderDescriptor,
  sealDescriptor,
} from './descriptor';

const USAGE =
  'usage: descriptor-cli seal --candidate <release.json> --admission <admission.json> --gate-run <run.json> --out <descriptor.json>\n' +
  '       descriptor-cli check --descriptor <descriptor.json> --admission <admission.json> --gate-run <run.json>\n' +
  '  Prints the descriptor SHA-256 on stdout.';

function required(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new Error(`${name} is required\n${USAGE}`);
  }
  return args[index + 1];
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** The GitHub API run document, reduced by the workflow to the fields assertGateEvidence reads. */
function gateRun(path: string): ObservedGateRun {
  // Boundary: assertGateEvidence compares every field it relies on and refuses anything else.
  return json(path) as ObservedGateRun;
}

export function main(args: readonly string[]): string {
  const [command] = args;
  if (command === 'seal') {
    const descriptor = sealDescriptor(
      parseReleaseCandidate(json(required(args, '--candidate'))),
      json(required(args, '--admission')),
      gateRun(required(args, '--gate-run')),
    );
    writeFileSync(required(args, '--out'), renderDescriptor(descriptor));
    return descriptorSha256(descriptor);
  }
  if (command === 'check') {
    const descriptor = parseDescriptor(json(required(args, '--descriptor')));
    const run = gateRun(required(args, '--gate-run'));
    assertGateEvidence(descriptor.sourceSha, run);
    if (run.id !== descriptor.evidence.gate.runId) {
      throw new Error(`observed run ${String(run.id)} is not the descriptor's gate run`);
    }
    assertAdmittedDescriptor(descriptor, json(required(args, '--admission')));
    return descriptorSha256(descriptor);
  }
  throw new Error(USAGE);
}

if (import.meta.main) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
