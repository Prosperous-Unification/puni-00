import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';

import { hashBytes } from './evidence/content-manifest';
import type { Request } from './grammar-facade';
import { buildPackage } from './packaging/build';
import * as toolkitApi from './policy/prepare-activation-cli';
import { readToolkit } from './policy/prepare-activation-cli';
import * as relocationApi from './policy/prepare-relocation-activation-cli';
import { executeRequest } from './runtime-facade';

type Preparation = Extract<
  Request,
  { command: 'prepare-activation' | 'prepare-relocation-activation' }
>;
type Activation = Extract<Preparation, { command: 'prepare-activation' }>;
const directories: string[] = [];
function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'puni preparation = '));
  directories.push(directory);
  return directory;
}
function readSearchPath(): string {
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('preparation test requires trusted PATH');
  return path;
}
const trustedPath = readSearchPath();
let installedDirectory: string;
beforeAll(async () => {
  const directory = createDirectory();
  await buildPackage(directory);
  installedDirectory = join(directory, 'dist');
}, 120_000);
afterAll(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function runGit(repository: string, args: readonly string[]): string {
  const child = Bun.spawnSync(['git', '-C', repository, ...args], {
    env: { PATH: trustedPath, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return child.stdout.toString().trim();
}
function createActivationRequest(callerDirectory: string): Activation {
  const repository = join(callerDirectory, 'candidate');
  // Git initializes the candidate directory itself, keeping work/destination outside it.
  const initialized = Bun.spawnSync(['git', 'init', '--initial-branch=main', repository], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode, initialized.stderr.toString()).toBe(0);
  runGit(repository, ['config', 'user.name', 'PUNI Preparation Fixture']);
  runGit(repository, ['config', 'user.email', 'preparation@example.test']);
  writeFileSync(join(repository, '.bun-version'), Bun.version + '\n');
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', 'fixture']);
  return {
    command: 'prepare-activation',
    candidateRepository: repository,
    candidateSha: runGit(repository, ['rev-parse', 'HEAD']),
    candidatePolicy: 'selected-policy.json',
    candidateMapping: 'selected-mapping.json',
    auditStrata: './audit-strata.json',
    reviewRecord: './review.json',
    destination: './destination',
    work: './work',
    checkRuns: './check-runs.json',
    resourceLane: 'preparation-lane',
    cwdIdentity: 'preparation-cwd',
    toolkit: undefined,
  };
}
async function invokePreparation(request: Preparation, callerDirectory: string) {
  const output: string[] = [];
  const errors: string[] = [];
  const launches: string[] = [];
  const settlement = await Promise.resolve()
    .then(() =>
      executeRequest(request, {
        installedDirectory,
        callerDirectory,
        path: trustedPath,
        launch(entrypoint) {
          launches.push(entrypoint);
          throw new Error('preparation reached ordinary validator launch');
        },
        stdout(chunk) {
          output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        },
        stderr(chunk) {
          errors.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        },
      }),
    )
    .then(
      (exitCode) => ({ kind: 'returned' as const, exitCode }),
      (cause: unknown) => ({
        kind: 'threw' as const,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  return { ...settlement, output: output.join(''), errors: errors.join(''), launches };
}
function readRefusal(settlement: Awaited<ReturnType<typeof invokePreparation>>): string {
  expect(settlement).toMatchObject({ kind: 'threw', output: '', errors: '', launches: [] });
  if (settlement.kind !== 'threw') throw new Error('preparation unexpectedly returned');
  return settlement.message;
}

describe('typed installed preparation delegation', () => {
  it('uses the verified default toolkit and captured caller repository without an argv round trip', async () => {
    const caller = createDirectory();
    const request = createActivationRequest(caller);
    const message = readRefusal(
      await invokePreparation({ ...request, candidateRepository: './candidate' }, caller),
    );
    expect(message).toContain(': selected-policy.json:');
    expect(message).not.toContain('missing required flag: --toolkit');
  });
  for (const field of ['work', 'destination'] as const) {
    it('anchors ' + field + ' before the actual outside-candidate guard', async () => {
      const caller = createDirectory();
      const request = createActivationRequest(caller);
      const message = readRefusal(
        await invokePreparation({ ...request, [field]: './candidate/inside' }, caller),
      );
      expect(message).toContain('--' + field + ' must be outside the candidate repository');
    });
  }
  it('awaits the typed relocation and keeps its base selection relative to the caller', async () => {
    const caller = createDirectory();
    const base = createActivationRequest(caller);
    const request: Preparation = {
      command: 'prepare-relocation-activation',
      candidateRepository: base.candidateRepository,
      candidateSha: base.candidateSha,
      baseActivation: './missing-base',
      candidatePolicy: undefined,
      candidateLauncher: undefined,
      validatorEntry: undefined,
      reviewRecord: './review.json',
      destination: './destination',
      work: './work',
      checkRuns: './checks.json',
      resourceLane: base.resourceLane,
      cwdIdentity: base.cwdIdentity,
    };
    const message = readRefusal(await invokePreparation(request, caller));
    expect(message).toContain(join(caller, 'missing-base'));
  });
  it('retains the installed expected identity when an explicit self-consistent toolkit is selected', async () => {
    const caller = createDirectory();
    const request = createActivationRequest(caller);
    const alternate = join(caller, 'alternate-toolkit');
    cpSync(join(installedDirectory, 'toolkit'), alternate, { recursive: true, dereference: false });
    const descriptorPath = join(alternate, 'toolkit.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as { tag: string };
    descriptor.tag = 'independent-valid-toolkit';
    const bytes = JSON.stringify(descriptor);
    writeFileSync(descriptorPath, bytes);
    const checksumsPath = join(alternate, 'SHA256SUMS');
    const checksums = readFileSync(checksumsPath, 'utf8');
    writeFileSync(
      checksumsPath,
      checksums.replace(
        /^[0-9a-f]{64} {2}\.\/toolkit\.json$/mu,
        () => hashBytes(new TextEncoder().encode(bytes)) + '  ./toolkit.json',
      ),
    );
    expect(readToolkit(alternate).digest).not.toBe(
      readToolkit(join(installedDirectory, 'toolkit')).digest,
    );
    const message = readRefusal(
      await invokePreparation({ ...request, toolkit: './alternate-toolkit' }, caller),
    );
    expect(message).toContain('selected toolkit differs from package manifest');
  });
  for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
    it('verifies the installed toolkit before inputs for ' + command, async () => {
      const caller = createDirectory();
      const base = createActivationRequest(caller);
      const request: Preparation =
        command === 'prepare-activation'
          ? { ...base, candidateRepository: join(caller, 'missing-repository') }
          : {
              command,
              candidateRepository: join(caller, 'missing-repository'),
              candidateSha: base.candidateSha,
              baseActivation: './missing-base',
              candidatePolicy: undefined,
              candidateLauncher: undefined,
              validatorEntry: undefined,
              reviewRecord: './review.json',
              destination: './destination',
              work: './work',
              checkRuns: './checks.json',
              resourceLane: base.resourceLane,
              cwdIdentity: base.cwdIdentity,
            };
      const validator = join(installedDirectory, 'toolkit/validator.mjs');
      const original = readFileSync(validator);
      writeFileSync(
        validator,
        Buffer.concat([original, Buffer.from('\n// modified after installation\n')]),
      );
      try {
        expect(readRefusal(await invokePreparation(request, caller))).toContain(
          'toolkit role differs from toolkit.json: validator.mjs',
        );
      } finally {
        writeFileSync(validator, original);
      }
    });
  }

  it('preserves typed toolkit report lines at the runtime output boundary', async () => {
    const caller = createDirectory();
    const request = createActivationRequest(caller);
    const reports = ['activation prepared', 'selected identity'];
    const preparation = spyOn(toolkitApi, 'prepareToolkit').mockReturnValue(reports);
    try {
      const settlement = await invokePreparation(request, caller);
      expect(settlement).toMatchObject({ kind: 'returned', exitCode: 0, errors: '', launches: [] });
      expect([...Buffer.from(settlement.output)]).toEqual([
        ...Buffer.from('activation prepared'),
        10,
        ...Buffer.from('selected identity'),
        10,
      ]);
    } finally {
      preparation.mockRestore();
    }
  });

  it('awaits typed relocation completion before returning its report', async () => {
    const caller = createDirectory();
    const base = createActivationRequest(caller);
    const request: Preparation = {
      command: 'prepare-relocation-activation',
      candidateRepository: base.candidateRepository,
      candidateSha: base.candidateSha,
      baseActivation: './base',
      candidatePolicy: undefined,
      candidateLauncher: undefined,
      validatorEntry: undefined,
      reviewRecord: './review.json',
      destination: './destination',
      work: './work',
      checkRuns: './checks.json',
      resourceLane: base.resourceLane,
      cwdIdentity: base.cwdIdentity,
    };
    let completed = false;
    const preparation = spyOn(relocationApi, 'prepareRelocation').mockImplementation(async () => {
      await Bun.sleep(10);
      completed = true;
      return ['relocation prepared', 'selected identity'];
    });
    try {
      const settlement = await invokePreparation(request, caller);
      expect(completed).toBe(true);
      expect(settlement).toMatchObject({ kind: 'returned', exitCode: 0, errors: '', launches: [] });
      expect([...Buffer.from(settlement.output)]).toEqual([
        ...Buffer.from('relocation prepared'),
        10,
        ...Buffer.from('selected identity'),
        10,
      ]);
    } finally {
      preparation.mockRestore();
    }
  });
  for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
    it('binds the package manifest before preparation inputs for ' + command, async () => {
      const caller = createDirectory();
      const base = createActivationRequest(caller);
      const request: Preparation =
        command === 'prepare-activation'
          ? { ...base, candidateRepository: join(caller, 'missing-repository') }
          : {
              command,
              candidateRepository: join(caller, 'missing-repository'),
              candidateSha: base.candidateSha,
              baseActivation: './missing-base',
              candidatePolicy: undefined,
              candidateLauncher: undefined,
              validatorEntry: undefined,
              reviewRecord: './review.json',
              destination: './destination',
              work: './work',
              checkRuns: './checks.json',
              resourceLane: base.resourceLane,
              cwdIdentity: base.cwdIdentity,
            };
      const path = join(installedDirectory, 'package-manifest.json');
      const original = readFileSync(path);
      const manifest = JSON.parse(original.toString()) as { toolkitIdentity: string };
      manifest.toolkitIdentity =
        (manifest.toolkitIdentity.startsWith('0') ? '1' : '0') + manifest.toolkitIdentity.slice(1);
      writeFileSync(path, JSON.stringify(manifest));
      try {
        expect(readRefusal(await invokePreparation(request, caller))).toContain(
          'installed toolkit differs from package manifest',
        );
      } finally {
        writeFileSync(path, original);
      }
    });
  }
});
