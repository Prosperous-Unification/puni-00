import { expect, test } from 'bun:test';

import {
  activateExcludedDependencies,
  type CompleteDependencyActivationRequest,
  decodeCompleteDependencyActivationRequest,
} from './dependency-complete-activation';
import { envLayout } from './env';

const sha = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const solver = {
  version: 1,
  sourceSha: sha,
  bunSha256: hash,
  bundleSha256: hash,
  configSha256: hash,
  unitSha256: hash,
};
function request() {
  return {
    format: 'complete-dependency-activation',
    version: 1,
    owner: { sha, layouts: [envLayout('prod'), envLayout('dev')] },
    activate: ['prod', 'dev'],
    solver,
    prod: {
      backend: { color: 'blue', image: `registry/wbs-be-01@sha256:${hash}` },
      gateway: { color: 'green', image: `registry/wbs-gw-01@sha256:${hash}` },
    },
    source: {
      pins: {
        version: 1,
        sourceSha: sha,
        runtimeImageId: `sha256:${hash}`,
        manifestSha256: hash,
        environmentSha256: hash,
      },
      manifestContents: '{}\n',
      runtimeReference: `registry/toolchain@sha256:${hash}`,
    },
    authorities: {
      pins: {
        format: 'installed-dependency-authority-pins',
        version: 1,
        sourceSha: sha,
        writerManifestSha256: hash,
        hostMachineIdSha256: hash,
        launchConfigurationSha256: hash,
        solver,
      },
      writerManifestContents: '{}\n',
    },
    migrations: {
      version: 1,
      sourceSha: sha,
      candidateImage: `registry/wbs-be-01@sha256:${hash}`,
      candidateImageId: `sha256:${hash}`,
      manifestSha256: hash,
    },
  };
}
test('decodes detached canonical requests and admits a toolchain runtime reference', () => {
  const supplied = request();
  const decoded = decodeCompleteDependencyActivationRequest(supplied, performance.now() + 60000);
  supplied.activate.reverse();
  expect(decoded.activate).toEqual(['prod', 'dev']);
  expect(decoded.source.runtimeReference).toContain('/toolchain@');
});
for (const activate of [[], ['dev', 'prod'], ['prod', 'prod'], ['unknown']])
  test(`refuses activation roster ${JSON.stringify(activate)}`, () => {
    expect(() =>
      decodeCompleteDependencyActivationRequest(
        { ...request(), activate },
        performance.now() + 60000,
      ),
    ).toThrow();
  });
for (const deadline of [NaN, Infinity, -1, performance.now() + 700000])
  test(`refuses invalid deadline ${String(deadline)}`, () => {
    expect(() => decodeCompleteDependencyActivationRequest(request(), deadline)).toThrow();
  });
for (const fault of ['extra', 'layout', 'sha', 'solver', 'image', 'runtime', 'manifest'] as const)
  test(`refuses detached request binding fault ${fault}`, () => {
    const supplied = request();
    switch (fault) {
      case 'extra':
        Object.assign(supplied, { success: true });
        break;
      case 'layout':
        supplied.owner.layouts[0] = { ...envLayout('prod'), root: '/tmp/alternate' };
        break;
      case 'sha':
        supplied.source.pins.sourceSha = 'c'.repeat(40);
        break;
      case 'solver':
        supplied.authorities.pins.solver = { ...solver, unitSha256: 'c'.repeat(64) };
        break;
      case 'image':
        supplied.migrations.candidateImage = `registry/wbs-be-01@sha256:${'c'.repeat(64)}`;
        break;
      case 'runtime':
        supplied.source.runtimeReference = 'registry/toolchain:latest';
        break;
      case 'manifest':
        supplied.authorities.writerManifestContents = 'x'.repeat(256 * 1024 + 1);
        break;
    }
    expect(() =>
      decodeCompleteDependencyActivationRequest(supplied, performance.now() + 60000),
    ).toThrow();
  });

test('public request refusal discards private parser input and cause chains before acquiring any owner', async () => {
  const supplied = request();
  supplied.prod.backend.image = 'PRIVATE_REQUEST_SENTINEL';
  let refusal: unknown;
  try {
    await activateExcludedDependencies(
      supplied as CompleteDependencyActivationRequest,
      performance.now() + 60000,
    );
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('expected request refusal');
  expect(refusal.message).not.toContain('PRIVATE_REQUEST_SENTINEL');
  expect(refusal.cause).toBeUndefined();
});
