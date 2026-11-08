import { chmod, rm } from 'node:fs/promises';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import type { RegistryArtifact } from './registry-artifact';
import { executeRegistryCommand, type RegistryCommand } from './registry-managed-journal';
import { publicationEnvelope, publishArtifacts } from './registry-publication';

const GiB = 1024 ** 3;
const enrollment = {
  registryId: 'proof',
  owner: 'publisher',
  product: 'wbs',
  requiredRepositories: ['be', 'gw', 'fe'],
};
const artifacts: RegistryArtifact[] = ['be', 'gw', 'fe'].map((repository, index) => ({
  repository,
  reference: 'release',
  digest: `sha256:${String(index + 1).repeat(64)}`,
  contents: [
    {
      digest: `sha256:${String(index + 1).repeat(64)}`,
      size: 100,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      path: '/unused',
      offset: 0,
      dependencies: [],
      isManifest: true,
    },
  ],
}));
async function fixture() {
  const directory = await scratchAsync('registry-publication-');
  await chmod(directory, 0o700);
  const capacity = {
    maximumBytes: 50 * GiB,
    usableBytes: 50 * GiB,
    usedBytes: GiB,
    totalInodes: 100000,
    usedInodes: 1000,
    rootFreeBytes: 30 * GiB,
  };
  const ports = {
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: () => Promise.resolve(capacity),
  };
  await executeRegistryCommand(
    directory,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
        storageId: 'proof-volume',
        owners: ['publisher'],
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  const invoke = (request: RegistryCommand) => executeRegistryCommand(directory, request, ports);
  return { directory, capacity, invoke };
}
it('partial tier failure retains candidate ownership and its reservation', async () => {
  const proof = await fixture();
  try {
    let uploaded = 0;
    expect(
      (
        await rejectionOf(
          publishArtifacts(enrollment, artifacts, proof.invoke, () => {
            uploaded += 1;
            if (uploaded === 3) throw new Error('third upload failed');
            return Promise.resolve();
          }),
        )
      ).message,
    ).toContain('third upload failed');
    const { state } = await proof.invoke({ command: 'read' });
    expect(uploaded).toBe(3);
    expect(state.publication?.phase).toBe('failed');
    expect(state.bundles[0]?.receipt.state).toBe('unfinished');
    expect(state.bundles[0]?.references).toHaveLength(3);
    expect(state.reservations).toHaveLength(1);
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});
it('single-tier publication is not a complete multi-tier release', async () => {
  const proof = await fixture();
  try {
    let uploaded = 0;
    expect(
      (
        await rejectionOf(
          publishArtifacts(enrollment, artifacts.slice(0, 1), proof.invoke, () => {
            uploaded += 1;
            return Promise.resolve();
          }),
        )
      ).message,
    ).toMatch(/required/);
    expect(uploaded).toBe(0);
    expect((await proof.invoke({ command: 'read' })).state.bundles).toEqual([]);
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});
it('no release success before bundle receipt and completion releases publisher slot', async () => {
  const proof = await fixture();
  try {
    const receipt = await publishArtifacts(enrollment, artifacts, proof.invoke, () =>
      Promise.resolve(),
    );
    expect(receipt.references).toHaveLength(3);
    expect(receipt.receipt.state).toBe('completed');
    expect((await proof.invoke({ command: 'read' })).state.publication).toBeNull();
    await publishArtifacts(enrollment, artifacts, proof.invoke, () => Promise.resolve());
    expect((await proof.invoke({ command: 'read' })).state.bundles).toHaveLength(2);
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});
it('refuses admission before first upload when the reservation exceeds capacity', async () => {
  const proof = await fixture();
  try {
    proof.capacity.usedBytes = Math.floor(45 * GiB) - 100;
    let uploaded = 0;
    expect(
      (
        await rejectionOf(
          publishArtifacts(enrollment, artifacts, proof.invoke, () => {
            uploaded += 1;
            return Promise.resolve();
          }),
        )
      ).message,
    ).toMatch(/refused/);
    expect(uploaded).toBe(0);
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('Expected refusal');
}

it('refuses a foreign registry before creating candidate ownership', async () => {
  const proof = await fixture();
  try {
    await rejectionOf(
      publishArtifacts({ ...enrollment, registryId: 'foreign' }, artifacts, proof.invoke, () =>
        Promise.resolve(),
      ),
    );
    expect((await proof.invoke({ command: 'read' })).state.bundles).toEqual([]);
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});
it('rechecks actual pressure at each tier boundary while preserving the reservation', async () => {
  const proof = await fixture();
  let uploads = 0;
  try {
    await rejectionOf(
      publishArtifacts(enrollment, artifacts, proof.invoke, () => {
        uploads += 1;
        proof.capacity.usedBytes = 45 * GiB;
        return Promise.resolve();
      }),
    );
    expect(uploads).toBe(1);
    expect((await proof.invoke({ command: 'read' })).state.reservations).toHaveLength(1);
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});
it('never returns success when durable completion response omits the complete bundle', async () => {
  const proof = await fixture();
  try {
    const invoke = async (request: RegistryCommand) => {
      const response = await proof.invoke(request);
      return request.command === 'finish-publication' && request.outcome === 'completed'
        ? { ...response, state: { ...response.state, bundles: [] } }
        : response;
    };
    expect(
      (await rejectionOf(publishArtifacts(enrollment, artifacts, invoke, () => Promise.resolve())))
        .message,
    ).toContain('complete durable publication receipt');
    expect((await proof.invoke({ command: 'read' })).state.bundles[0]?.receipt.state).toBe(
      'completed',
    );
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});

it('refuses unknown or overflowing envelopes before creating any candidate', async () => {
  const proof = await fixture();
  try {
    for (const size of [Number.NaN, Number.MAX_SAFE_INTEGER]) {
      const invalid = artifacts.map((artifact) => ({
        ...artifact,
        contents: artifact.contents.map((content) => ({ ...content, size })),
      }));
      await rejectionOf(
        publishArtifacts(enrollment, invalid, proof.invoke, () => Promise.resolve()),
      );
      expect((await proof.invoke({ command: 'read' })).state.bundles).toEqual([]);
    }
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});
it('validates malformed authority responses before exposing a capability', async () => {
  const { parseRegistryCommandResponse } = await import('./registry-managed-journal');
  const proof = await fixture();
  try {
    const response = await proof.invoke({ command: 'read' });
    expect(() =>
      parseRegistryCommandResponse({
        ...response,
        state: { ...response.state, revision: 'untrusted' },
      }),
    ).toThrow();
    expect(() =>
      parseRegistryCommandResponse({ ...response, token: 'not-a-capability' }),
    ).toThrow();
  } finally {
    await rm(proof.directory, { recursive: true });
  }
});

it('refuses an inexact physical envelope before it leaves the production planner', () => {
  const oversized = artifacts.map((artifact) => ({
    ...artifact,
    contents: artifact.contents.map((content) => ({ ...content, size: Number.MAX_SAFE_INTEGER })),
  }));
  expect(() => publicationEnvelope(oversized)).toThrow('Unsafe publication envelope');
  const invalid = artifacts.map((artifact) => ({
    ...artifact,
    contents: artifact.contents.map((content) => ({ ...content, size: -1 })),
  }));
  expect(() => publicationEnvelope(invalid)).toThrow('Unknown content envelope');
});

it('retains candidate ownership when a managed response is cancelled for overflow', async () => {
  const { spyOn } = await import('bun:test');
  const { inspectOciArchive } = await import('./registry-artifact');
  const { uploadArtifact } = await import('./platform-registry');
  const proof = await fixture();
  const artifact = await inspectOciArchive(
    new URL('./fixtures/dagger-0.21.9.oci.tar', import.meta.url).pathname,
    'be',
    'release',
  );
  let cancelled = false;
  let produced = 0;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 4096;
        controller.enqueue(new Uint8Array(4096));
        if (produced === 1024 * 1024) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    }),
    { status: 503 },
  );
  const fetcher = spyOn(globalThis, 'fetch').mockResolvedValue(response);
  try {
    const refused = await rejectionOf(
      publishArtifacts(
        enrollment,
        enrollment.requiredRepositories.map((repository) => ({ ...artifact, repository })),
        proof.invoke,
        async (candidate) => {
          await uploadArtifact({ url: 'http://target' }, candidate);
        },
      ),
    );
    expect(refused.message).toContain('exceeds');
    expect(cancelled).toBe(true);
    expect(produced).toBeLessThanOrEqual(73728);
    const { state } = await proof.invoke({ command: 'read' });
    expect(state.publication?.phase).toBe('failed');
    expect(state.bundles.at(-1)?.receipt.state).toBe('unfinished');
    expect(state.reservations).toHaveLength(1);
  } finally {
    fetcher.mockRestore();
    await rm(proof.directory, { recursive: true });
  }
});
