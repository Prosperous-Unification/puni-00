import { describe, expect, it } from 'bun:test';

import {
  decodeInstalledProdImages,
  decodePublishedSolverImage,
  registryPasswordFromEnv,
} from './solver-binding-host';

const SHA = 'a'.repeat(40);
const BLUE = `registry.example/wbs-be@sha256:${'b'.repeat(64)}`;
const GREEN = `registry.example/wbs-be@sha256:${'c'.repeat(64)}`;
const DEV = `registry.example/wbs-be@sha256:${'d'.repeat(64)}`;
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('the automatic solver binding host inputs', () => {
  it('reads exactly one non-empty registry password without truncating equals signs', () => {
    expect(registryPasswordFromEnv(bytes(`OTHER=kept\nREGISTRY_PASS=a=b=c\n`))).toBe('a=b=c');
    expect(() => registryPasswordFromEnv(bytes('OTHER=present\n'))).toThrow(
      /REGISTRY_PASS.*missing/,
    );
    expect(() => registryPasswordFromEnv(bytes('REGISTRY_PASS=\n'))).toThrow(
      /REGISTRY_PASS.*empty/,
    );
    expect(() =>
      registryPasswordFromEnv(bytes('REGISTRY_PASS=first\nREGISTRY_PASS=second\n')),
    ).toThrow(/REGISTRY_PASS.*duplicate/);
  });

  it('accepts only the target source and registry-returned immutable be image', () => {
    const digest = `sha256:${'d'.repeat(64)}`;
    expect(
      decodePublishedSolverImage(
        bytes(
          JSON.stringify({
            be: { sha: SHA, digest, ref: `registry.example/wbs-be:${SHA}`, image: DEV },
          }),
        ),
        SHA,
      ),
    ).toBe(DEV);
    expect(() =>
      decodePublishedSolverImage(
        bytes(JSON.stringify({ be: { sha: 'e'.repeat(40), digest, ref: 'tag', image: DEV } })),
        SHA,
      ),
    ).toThrow(/source SHA/);
    expect(() =>
      decodePublishedSolverImage(
        bytes(
          JSON.stringify({
            be: { sha: SHA, digest, ref: 'tag', image: 'registry.example/wbs-be:latest' },
          }),
        ),
        SHA,
      ),
    ).toThrow(/digest-pinned/);
  });

  it('preserves both exact prod mappings and refuses a divergent prod solver image', () => {
    const config = {
      socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
      maxSearchWorkers: 2,
      maxMemoryLimitMb: 512,
      pidsLimit: 128,
      maxManagedContainers: 16,
      devSourceSha: SHA,
      images: [
        { callerName: 'be-01-blue', callerImage: BLUE, solverImage: BLUE },
        { callerName: 'be-01-green', callerImage: GREEN, solverImage: GREEN },
        { callerName: 'wbs-dev-src', callerImage: null, solverImage: DEV },
      ],
    };
    expect(decodeInstalledProdImages(bytes(JSON.stringify(config)))).toEqual({
      blueImage: BLUE,
      greenImage: GREEN,
    });
    config.images[0] = { ...config.images[0], solverImage: GREEN };
    expect(() => decodeInstalledProdImages(bytes(JSON.stringify(config)))).toThrow(
      /be-01-blue.*solver image/,
    );
  });
});
