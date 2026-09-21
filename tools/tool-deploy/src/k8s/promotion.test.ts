import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  descriptorSha256,
  type ReleaseDescriptor,
  renderDescriptor,
  sealDescriptor,
} from './descriptor';
import {
  assertProtectedStateDirectory,
  checkDescriptor,
  parseRecovers,
  readDeliveryTarget,
  requestFor,
  stagingProofFor,
  stagingProofPath,
} from './promotion';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function directory(): string {
  const root = scratchSync('wbs-promotion-');
  roots.push(root);
  chmodSync(root, 0o700);
  return root;
}

const sourceSha = 'a'.repeat(40);
const image = (name: string, hex: string): string =>
  `registry.example/${name}@sha256:${hex.repeat(64)}`;
const admission = {
  schemaVersion: 1,
  sourceSha,
  package: {
    name: 'twilight-burokrat',
    version: '0.1.0',
    integrity: `sha512-${'c'.repeat(86)}==`,
    toolkitIdentity: 'd'.repeat(64),
  },
  activation: { version: 'e'.repeat(40), manifestIdentity: 'f'.repeat(64) },
};
const descriptor: ReleaseDescriptor = sealDescriptor(
  {
    schemaVersion: 1,
    sourceSha,
    images: {
      backend: image('wbs-be-01', '1'),
      gateway: image('wbs-gw-01', '2'),
      frontend: image('wbs-fe-01', '3'),
      mcp: image('wbs-mcp-01', '4'),
    },
    gateRunId: 7,
  },
  admission,
  {
    id: 7,
    head_sha: sourceSha,
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    jobs: [
      { name: 'gate', conclusion: 'success' },
      { name: 'pixels', conclusion: 'success' },
    ],
  },
);
const sha256 = descriptorSha256(descriptor);

function inputs(
  root: string,
  environment: 'staging' | 'prod',
  expected = sha256,
  now = new Date(86_400_000),
) {
  const descriptorPath = join(root, 'descriptor.json');
  const admissionPath = join(root, 'admission.json');
  writeFileSync(descriptorPath, renderDescriptor(descriptor));
  writeFileSync(admissionPath, JSON.stringify(admission));
  return {
    descriptorPath,
    expectedSha256: expected,
    admissionPath,
    environment,
    stateDirectory: root,
    maxProofAgeDays: 14,
    now,
  };
}

describe('protected state directory', () => {
  it('accepts an owner-only directory', () => {
    const root = directory();
    expect(() => {
      assertProtectedStateDirectory(root, process.getuid?.() ?? -1);
    }).not.toThrow();
  });

  it('refuses a state directory others can read', () => {
    const root = directory();
    chmodSync(root, 0o755);
    expect(() => {
      assertProtectedStateDirectory(root, process.getuid?.() ?? -1);
    }).toThrow('mode 755; it must be 0700');
  });

  it('refuses a relative or absent directory', () => {
    expect(() => {
      assertProtectedStateDirectory('state', 0);
    }).toThrow('must be absolute');
    expect(() => {
      assertProtectedStateDirectory(join(directory(), 'absent'), 0);
    }).toThrow('does not exist');
  });
});

describe('checkDescriptor', () => {
  it('accepts the named, admitted descriptor for staging', () => {
    const root = directory();
    expect(checkDescriptor(inputs(root, 'staging')).sha256).toBe(sha256);
  });

  it('refuses a descriptor other than the one named', () => {
    const root = directory();
    expect(() => checkDescriptor(inputs(root, 'staging', '0'.repeat(64)))).toThrow(
      `descriptor is ${sha256}, not the requested`,
    );
  });

  it('refuses a failed admission (a record for another commit)', () => {
    const root = directory();
    const checked = inputs(root, 'staging');
    writeFileSync(
      checked.admissionPath,
      JSON.stringify({ ...admission, sourceSha: '9'.repeat(40) }),
    );
    expect(() => checkDescriptor(checked)).toThrow('admission certified 9999');
  });

  it('refuses production before staging proved the descriptor', () => {
    const root = directory();
    expect(() => checkDescriptor(inputs(root, 'prod'))).toThrow('cannot read staging proof');
  });

  it('refuses a staging proof older than the bound', () => {
    const root = directory();
    const checked = checkDescriptor(inputs(root, 'staging'));
    mkdirSync(join(root, 'staging', 'proofs'), { recursive: true });
    writeFileSync(
      stagingProofPath(root, sha256),
      stagingProofFor(checked, { context: 's', uid: 'u' }, new Date(0)),
    );
    expect(() => checkDescriptor(inputs(root, 'prod', sha256, new Date(30 * 86_400_000)))).toThrow(
      'accepts proofs up to 14 days old',
    );
  });

  it('refuses a malformed recovers value', () => {
    expect(parseRecovers(null)).toBeNull();
    expect(parseRecovers('abcdef012345-abcdef012345')).toBe('abcdef012345-abcdef012345');
    expect(() => parseRecovers('latest')).toThrow('--recovers must be a release id');
  });

  it('promotes to production once staging recorded its proof', () => {
    const root = directory();
    const checked = checkDescriptor(inputs(root, 'staging'));
    const proof = stagingProofPath(root, sha256);
    mkdirSync(join(root, 'staging', 'proofs'), { recursive: true });
    writeFileSync(proof, stagingProofFor(checked, { context: 's', uid: 'u' }, new Date(0)));
    expect(checkDescriptor(inputs(root, 'prod')).sha256).toBe(sha256);
  });
});

describe('delivery targets', () => {
  const overlays = resolve(import.meta.dir, '../../../../deploy/k8s/wbs/overlays');

  it('reads the committed staging and prod targets', () => {
    expect(readDeliveryTarget(overlays, 'staging').publicUrl).toBe(
      'https://wbs-staging.bulletpoints.club',
    );
    expect(readDeliveryTarget(overlays, 'prod').deployManifestPath).toBe(
      'clusters/prod/wbs/release.yaml',
    );
  });

  it('builds a Flux request that pins both deploy revisions', () => {
    const root = directory();
    const checked = checkDescriptor(inputs(root, 'staging'));
    const request = requestFor(
      checked,
      readDeliveryTarget(overlays, 'staging'),
      { context: 'staging', uid: 'uid-1' },
      { sourceSha: 'b'.repeat(40), images: descriptor.images },
      { previousRevision: '1'.repeat(40), desiredRevision: '2'.repeat(40) },
    );
    expect(request.flux).toEqual({
      namespace: 'flux-system',
      kustomization: 'wbs',
      gitRepository: 'wbs-deploy',
      previousRevision: '1'.repeat(40),
      desiredRevision: '2'.repeat(40),
    });
    expect(request.admission.activation).toBe(`${'e'.repeat(40)} manifest ${'f'.repeat(64)}`);
  });
});
