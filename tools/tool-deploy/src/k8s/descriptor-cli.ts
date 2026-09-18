import { readFileSync, writeFileSync } from 'node:fs';

import {
  assertAdmittedDescriptor,
  assertGateEvidence,
  descriptorSha256,
  type ObservedGateRun,
  parseDescriptor,
  parseReleaseCandidate,
  type ReleaseDescriptor,
  renderDescriptor,
  sealDescriptor,
} from './descriptor';
import { assertImageRevisions, registryRevisionReader, type RevisionReader } from './registry';
import { assertOnMainline } from './source';

const USAGE =
  'usage: descriptor-cli seal --candidate <release.json> --admission <admission.json> --gate-run <run.json> --out <descriptor.json> --repository <clone> --main-ref <ref>\n' +
  '       descriptor-cli check --descriptor <descriptor.json> --admission <admission.json> --gate-run <run.json> --repository <clone> --main-ref <ref>\n' +
  '  Prints the descriptor SHA-256 on stdout. PUNI_REGISTRY_AUTH (user:password) reads the\n' +
  '  registry labels that bind every digest to the source commit.';

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

/** Commit on main and registry labels: the checks that need the outside world. */
async function assertSource(
  args: readonly string[],
  descriptor: ReleaseDescriptor,
  read: RevisionReader,
): Promise<void> {
  assertOnMainline(
    required(args, '--repository'),
    descriptor.sourceSha,
    required(args, '--main-ref'),
  );
  await assertImageRevisions(descriptor.images, descriptor.sourceSha, read);
}

export async function main(
  args: readonly string[],
  read: RevisionReader = registryRevisionReader(process.env['PUNI_REGISTRY_AUTH'] ?? null),
): Promise<string> {
  const [command] = args;
  if (command === 'seal') {
    const descriptor = sealDescriptor(
      parseReleaseCandidate(json(required(args, '--candidate'))),
      json(required(args, '--admission')),
      gateRun(required(args, '--gate-run')),
    );
    await assertSource(args, descriptor, read);
    writeFileSync(required(args, '--out'), renderDescriptor(descriptor));
    return descriptorSha256(descriptor);
  }
  if (command === 'check') {
    const descriptor = parseDescriptor(json(required(args, '--descriptor')));
    await assertSource(args, descriptor, read);
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
    console.log(await main(process.argv.slice(2)));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
