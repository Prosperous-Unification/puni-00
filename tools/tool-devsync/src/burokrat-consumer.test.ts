import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { requireDeploymentAdmission } from './burokrat-consumer';

const workspace = join(import.meta.dir, '..', '..', '..');
const sourceSha = 'a'.repeat(40);
const imageDigest = `sha256:${'b'.repeat(64)}`;

const packageIdentity = {
  name: 'twilight-burokrat',
  version: '0.1.0',
  integrity: `sha512-${'c'.repeat(86)}==`,
  toolkitIdentity: 'd'.repeat(64),
} as const;
const activationIdentity = { version: 'e'.repeat(40), manifestIdentity: 'f'.repeat(64) };

function admissionRecord(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceSha,
    package: { ...packageIdentity },
    activation: { ...activationIdentity },
  };
}

describe('deployment admission identities', () => {
  test('a trusted admission record and staged image digest yield all four identities', () => {
    const record = admissionRecord();
    expect(requireDeploymentAdmission(record, { sourceSha, imageDigest })).toEqual({
      sourceSha,
      package: packageIdentity,
      activation: activationIdentity,
      imageDigest,
    });
  });

  test('a certified-looking wrapper report cannot stand in for the trusted identities', () => {
    // What a candidate-edited `bin/tool-wiki-lint.sh` can print; it names no package or activation.
    const wrapperReport = {
      schemaVersion: 1,
      status: 'active',
      certified: true,
      sourceSha,
    };
    expect(() => requireDeploymentAdmission(wrapperReport, { sourceSha, imageDigest })).toThrow(
      'admission record lacks',
    );
  });

  test('a record with an absent or malformed identity or an extra claim is refused', () => {
    const missingActivation = admissionRecord();
    delete missingActivation['activation'];
    for (const record of [
      missingActivation,
      { ...admissionRecord(), activation: { ...activationIdentity, version: 'main' } },
      {
        ...admissionRecord(),
        package: { ...packageIdentity, integrity: `sha1-${'c'.repeat(27)}=` },
      },
      { ...admissionRecord(), certified: true },
    ]) {
      expect(() => requireDeploymentAdmission(record, { sourceSha, imageDigest })).toThrow(
        'admission record lacks',
      );
    }
  });

  test('an admission for another commit cannot deploy this one', () => {
    expect(() =>
      requireDeploymentAdmission(admissionRecord(), { sourceSha: '9'.repeat(40), imageDigest }),
    ).toThrow(`admission certified ${sourceSha}, not the deployed source ${'9'.repeat(40)}`);
  });

  test('a mutable image reference is refused', () => {
    expect(() =>
      requireDeploymentAdmission(admissionRecord(), {
        sourceSha,
        imageDigest: 'registry.example/wbs-be-01:latest',
      }),
    ).toThrow('staged image digest is not immutable');
  });
});

describe('package-backed admission scripts', () => {
  test('the bootstrap, admission and compatibility scripts pass shellcheck', () => {
    const shellcheck = Bun.which('shellcheck');
    if (shellcheck === null) throw new Error('shellcheck is required to check admission scripts');
    const checked = Bun.spawnSync(
      [
        shellcheck,
        '-s',
        'bash',
        'infra/ci/burokrat/bootstrap.sh',
        'infra/ci/burokrat/admit.sh',
        'bin/tool-wiki-package-lint.sh',
      ],
      { cwd: workspace, stderr: 'pipe', stdout: 'pipe' },
    );
    expect(checked.exitCode, checked.stdout.toString()).toBe(0);
  });
});
