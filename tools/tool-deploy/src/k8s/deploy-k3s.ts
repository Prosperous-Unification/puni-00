import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { executeRelease, kubectlEffects, type KubectlSettings, run } from './execute';
import { fileJournal } from './journal';
import {
  assertRequest,
  initialState,
  planRelease,
  releaseIdOf,
  type ReleaseRequest,
  settleInterrupted,
} from './release';

const USAGE =
  'usage: deploy-k3s --request <request.json> --journal <path> [--kubectl <path>] [--kubeconfig <path>] [--apply]\n' +
  '  Plans by default. --apply runs or resumes the transaction recorded in --journal.';

function flag(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  if (index + 1 >= args.length) throw new Error(`${name} needs a value\n${USAGE}`);
  const value = args[index + 1];
  if (value.startsWith('--')) throw new Error(`${name} needs a value\n${USAGE}`);
  return value;
}

function required(args: readonly string[], name: string): string {
  const value = flag(args, name);
  if (value === null) throw new Error(`${name} is required\n${USAGE}`);
  return value;
}

/** The locked kubectl version; any other client refuses to run the transaction. */
export function lockedKubectlVersion(root: string): string {
  const lock = JSON.parse(readFileSync(resolve(root, 'infra/versions/toolchain.json'), 'utf8')) as {
    binaries?: { kubectl?: { version?: string } };
  };
  const version = lock.binaries?.kubectl?.version;
  if (version === undefined)
    throw new Error('infra/versions/toolchain.json has no kubectl version');
  return version;
}

async function assertKubectl(kubectl: string, expected: string): Promise<void> {
  const probe = await run([kubectl, 'version', '--client', '-o', 'json'], null, 30_000);
  if (probe.exitCode !== 0) throw new Error(`${kubectl} is not runnable: ${probe.stderr.trim()}`);
  const actual = (JSON.parse(probe.stdout) as { clientVersion?: { gitVersion?: string } })
    .clientVersion?.gitVersion;
  if (actual !== expected)
    throw new Error(`${kubectl} is ${String(actual)}; the toolchain lock requires ${expected}`);
}

/** Bounds per environment: the lab fails fast, production allows real image pulls and drains. */
export function boundsFor(
  environment: ReleaseRequest['environment'],
): Pick<
  KubectlSettings,
  'rolloutTimeoutSeconds' | 'jobTimeoutSeconds' | 'drainTimeoutMs' | 'anonymousProjectsStatus'
> {
  if (environment === 'local') {
    return {
      rolloutTimeoutSeconds: 120,
      jobTimeoutSeconds: 300,
      drainTimeoutMs: 10_000,
      anonymousProjectsStatus: 200,
    };
  }
  return {
    rolloutTimeoutSeconds: 600,
    jobTimeoutSeconds: 1800,
    drainTimeoutMs: 300_000,
    anonymousProjectsStatus: 401,
  };
}

export async function main(args: readonly string[], root: string): Promise<void> {
  // Boundary: the request file is the release descriptor's projection; assertRequest checks it.
  const request = JSON.parse(readFileSync(required(args, '--request'), 'utf8')) as ReleaseRequest;
  assertRequest(request);
  const journalPath = resolve(required(args, '--journal'));
  const journal = fileJournal(journalPath);
  const existing = journal.read();
  const state =
    existing?.state.releaseId !== releaseIdOf(request.release)
      ? initialState(request)
      : settleInterrupted(existing.state);
  console.log(`release ${state.releaseId} at ${state.phase} (journal ${journalPath})`);
  for (const step of planRelease(request, state)) console.log(`  ${step.kind} -> ${step.reaches}`);
  if (!args.includes('--apply')) {
    console.log('plan only; pass --apply to run it');
    return;
  }
  const kubectl = flag(args, '--kubectl') ?? 'kubectl';
  await assertKubectl(kubectl, lockedKubectlVersion(root));
  const stateDir = dirname(journalPath);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const effects = kubectlEffects({
    kubectl,
    kubeconfig: flag(args, '--kubeconfig'),
    context: request.cluster.context,
    namespaces: request.namespaces,
    stateDir,
    overlay: resolve(root, 'deploy/k8s/wbs/overlays', request.environment),
    log: (line) => {
      console.log(line);
    },
    ...boundsFor(request.environment),
  });
  const final = await executeRelease(request, journal, effects, (line) => {
    console.log(line);
  });
  console.log(`release ${final.releaseId} promoted`);
}

if (import.meta.main) {
  await main(process.argv.slice(2), resolve(import.meta.dir, '../../../..'));
}
