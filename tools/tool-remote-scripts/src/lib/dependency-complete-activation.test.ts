import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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

// Independent declarative goldens only; these bytes grant no tree, installation or activation authority.
const currentSourceSelection = readFileSync(
  new URL('../fixtures/source-cold-v2-selection.json', import.meta.url),
  'utf8',
);
const currentSourceManifest = readFileSync(
  new URL('../fixtures/source-cold-v2-manifest.json', import.meta.url),
  'utf8',
);
const currentSelectionSha256 = '0c18fe56c9b759a19238ecbcf17c1bfc91014bf18677740b7b8db44cbc467b80';
const currentManifestSha256 = 'f2478c57656defcf044d199f67d57dd65c6472264a84bf94a42d5ac5d8f34f17';
function readCurrentSourceRequest() {
  const historical = request();
  return {
    ...historical,
    source: {
      expectedProfile: 'wbs-source-cold-v2',
      pins: {
        version: 2,
        sourceSha: sha,
        runtimeImageId: 'sha256:' + hash,
        manifestSha256: currentManifestSha256,
        environmentSha256: hash,
        puniSelectionSha256: currentSelectionSha256,
      },
      manifestContents: currentSourceManifest,
      puniSelectionContents: currentSourceSelection,
      runtimeReference: historical.source.runtimeReference,
    },
  };
}
test('current source request explicitly routes cold-v2 while retaining the detached historical request', () => {
  const historical = request();
  const retained = decodeCompleteDependencyActivationRequest(historical, performance.now() + 60000);
  const retainedSource: unknown = retained.source;
  expect(retainedSource).toEqual(historical.source);
  expect(createHash('sha256').update(currentSourceManifest).digest('hex')).toBe(
    currentManifestSha256,
  );
  expect(createHash('sha256').update(currentSourceSelection).digest('hex')).toBe(
    currentSelectionSha256,
  );
  const supplied = readCurrentSourceRequest();
  const expected = structuredClone(supplied.source);
  const decoded = decodeCompleteDependencyActivationRequest(supplied, performance.now() + 60000);
  const decodedSource: unknown = decoded.source;
  expect(decodedSource).toEqual(expected);
  supplied.source.puniSelectionContents = 'changed after request decoding';
  supplied.source.pins.puniSelectionSha256 = 'f'.repeat(64);
  const retainedAfterEdit: unknown = decoded.source;
  expect(retainedAfterEdit).toEqual(expected);
});

test('current source request refuses a pinned historical declaration instead of downgrading its explicit profile', () => {
  const current = readCurrentSourceRequest();
  const source: unknown = decodeCompleteDependencyActivationRequest(
    current,
    performance.now() + 60000,
  ).source;
  expect(source).toEqual(current.source);
  const historical =
    JSON.stringify({
      format: 'wbs-source-startup',
      version: 1,
      profile: 'wbs-source-cold-v1',
      sourceSha: sha,
      entries: [
        {
          root: 'source',
          path: 'owned.txt',
          kind: 'file',
          mode: 420,
          size: 1,
          sha256: 'e'.repeat(64),
        },
      ],
      configuration: ['backend', 'gateway', 'mcp', 'frontend'].map((slot) => ({
        slot,
        size: 1,
        sha256: 'e'.repeat(64),
      })),
    }) + '\n';
  const supplied = {
    ...current,
    source: {
      ...current.source,
      manifestContents: historical,
      pins: {
        ...current.source.pins,
        manifestSha256: createHash('sha256').update(historical).digest('hex'),
      },
    },
  };
  expect(() =>
    decodeCompleteDependencyActivationRequest(supplied, performance.now() + 60000),
  ).toThrow();
});

test('current source request requires the independently expected retained installation record', () => {
  const current = readCurrentSourceRequest();
  const source: unknown = decodeCompleteDependencyActivationRequest(
    current,
    performance.now() + 60000,
  ).source;
  expect(source).toEqual(current.source);
  for (const fault of ['absent-contents', 'wrong-digest', 'missing-pin'] as const) {
    const supplied: Record<string, unknown> = structuredClone(current.source);
    if (fault === 'absent-contents') delete supplied['puniSelectionContents'];
    else if (fault === 'wrong-digest')
      supplied['puniSelectionContents'] = currentSourceSelection + '\n';
    else {
      const pins: Record<string, unknown> = { ...current.source.pins };
      delete pins['puniSelectionSha256'];
      supplied['pins'] = pins;
    }
    expect(
      () =>
        decodeCompleteDependencyActivationRequest(
          { ...current, source: supplied },
          performance.now() + 60000,
        ),
      fault,
    ).toThrow();
  }
});
