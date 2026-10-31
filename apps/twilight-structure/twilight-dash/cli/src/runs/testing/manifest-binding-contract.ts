import { rejects } from 'node:assert/strict';

import {
  acceptWorkflowBinding,
  canonicalJson,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import { describe, expect, test } from 'bun:test';

import { referenceArtifact } from '../artifact-integrity';
import type { ArtifactStore } from '../artifact-store';
import { readManifestBinding } from '../manifest-binding';
import { ownerId } from '../record-codecs';
import type { Manifest, Ownership } from '../records';
import type { RunStore } from '../run-store';
import { createManifest, unwrapReply } from './fixtures';

export const originalPrompt = new Uint8Array([239, 187, 191, 112, 10]);
export function createBindingFixture(
  toolOnly = false,
  originals?: { readonly binding: unknown; readonly bytes: Uint8Array },
) {
  const bytes = originals === undefined ? originalPrompt : originals.bytes;
  const binding = decodeWorkflowBinding(
    originals === undefined
      ? {
          version: 1,
          types: {
            default: { plan: { class: toolOnly ? 'tool' : 'plan' } },
            feature: { plan: { class: 'tool' } },
          },
          classes: toolOnly
            ? { tool: { executor: 'tool', command: 'build' } }
            : {
                plan: { executor: 'human', prompt: 'prompts/plan.md' },
                tool: { executor: 'tool', command: 'build' },
                unused: {
                  executor: 'api-model',
                  model: 'openai:pinned',
                  prompt: 'nested/unused.md',
                  tools: ['search'],
                  limits: { maxSteps: 2, maxOutputTokens: 32 },
                },
              },
        }
      : originals.binding,
  );
  const checked = checkWorkflowBinding(binding, ['plan']);
  const accepted = acceptWorkflowBinding(
    checked,
    toolOnly
      ? []
      : [
          { path: 'prompts/plan.md', bytes },
          { path: 'nested/unused.md', bytes },
        ],
  );
  return {
    accepted,
    manifest: createManifest({
      canonicalBinding: canonicalJson(accepted.snapshot),
      prompts: toolOnly ? [] : [referenceArtifact(bytes, 'text/plain')],
    }),
  };
}
export interface BindingStores {
  readonly runs: RunStore;
  readonly artifacts: ArtifactStore;
  readonly ownership: { readonly epoch: number };
  close(): Promise<void>;
}
export async function retainBinding(stores: BindingStores, manifest: Manifest): Promise<Ownership> {
  const ownership = unwrapReply(
    await stores.runs.acquireOwnership(ownerId('binding-owner'), stores.ownership.epoch),
  );
  unwrapReply(await stores.runs.retainManifest(ownership, manifest));
  return ownership;
}
export function manifestBindingContract(name: string, create: () => Promise<BindingStores>) {
  describe(name, () => {
    test('recovers static selections and all paths sharing retained original bytes', async () => {
      const stores = await create();
      try {
        const { manifest, accepted } = createBindingFixture();
        await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
        await retainBinding(stores, manifest);
        const recovered = await readManifestBinding(stores.runs, stores.artifacts, manifest.digest);
        expect(recovered.manifest).toEqual(manifest);
        expect(recovered.binding).toEqual(accepted);
        expect(recovered.binding.prompts.map((prompt) => prompt.path)).toEqual([
          'nested/unused.md',
          'prompts/plan.md',
        ]);
        expect(recovered.binding.prompts[0].bytesBase64).toBe('77u/cAo=');
        expect(selectWorkflowActivity(recovered.binding, 'other', 'plan').prompt?.text).toBe('p\n');
        expect(selectWorkflowActivity(recovered.binding, 'feature', 'plan').prompt).toBeNull();
      } finally {
        await stores.close();
      }
    });
    test('maps distinct prompt digests by descriptor rather than reference order', async () => {
      const stores = await create();
      try {
        const fixture = createBindingFixture();
        const different = new TextEncoder().encode('q\n');
        const accepted = acceptWorkflowBinding(
          checkWorkflowBinding(fixture.accepted.snapshot.binding, ['plan']),
          [
            { path: 'prompts/plan.md', bytes: originalPrompt },
            { path: 'nested/unused.md', bytes: different },
          ],
        );
        const manifest = createManifest({
          canonicalBinding: canonicalJson(accepted.snapshot),
          prompts: [
            referenceArtifact(originalPrompt, 'text/plain'),
            referenceArtifact(different, 'text/plain'),
          ],
        });
        await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
        await stores.artifacts.retainArtifact(different, 'text/plain');
        await retainBinding(stores, manifest);
        const recovered = await readManifestBinding(stores.runs, stores.artifacts, manifest.digest);
        expect(recovered.binding.prompts.map((prompt) => [prompt.path, prompt.text])).toEqual([
          ['nested/unused.md', 'q\n'],
          ['prompts/plan.md', 'p\n'],
        ]);
      } finally {
        await stores.close();
      }
    });
    test('recovers tool-only acceptance without any prompt artifact', async () => {
      const stores = await create();
      try {
        const { manifest } = createBindingFixture(true);
        await retainBinding(stores, manifest);
        expect(
          selectWorkflowActivity(
            (await readManifestBinding(stores.runs, stores.artifacts, manifest.digest)).binding,
            'other',
            'plan',
          ).prompt,
        ).toBeNull();
      } finally {
        await stores.close();
      }
    });
    test('verifies repeated references and refuses wrong metadata after a valid reference', async () => {
      const stores = await create();
      try {
        const { manifest } = createBindingFixture();
        await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
        const repeated = createManifest({
          ...manifest,
          prompts: [...manifest.prompts, ...manifest.prompts],
        });
        const ownership = await retainBinding(stores, repeated);
        expect(
          (await readManifestBinding(stores.runs, stores.artifacts, repeated.digest)).binding
            .prompts,
        ).toHaveLength(2);
        for (const change of [{ byteLength: 999 }, { mediaType: 'application/json' }]) {
          const malformed = createManifest({
            ...manifest,
            prompts: [...manifest.prompts, { ...manifest.prompts[0], ...change }],
          });
          unwrapReply(await stores.runs.retainManifest(ownership, malformed));
          await rejects(
            readManifestBinding(stores.runs, stores.artifacts, malformed.digest),
            /artifact metadata differs/,
          );
        }
      } finally {
        await stores.close();
      }
    });
    test('refuses an undeclared retained prompt digest', async () => {
      const stores = await create();
      try {
        const { manifest } = createBindingFixture();
        const extra = new TextEncoder().encode('extra');
        await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
        await stores.artifacts.retainArtifact(extra, 'text/plain');
        const changed = createManifest({
          ...manifest,
          prompts: [...manifest.prompts, referenceArtifact(extra, 'text/plain')],
        });
        await retainBinding(stores, changed);
        await rejects(
          readManifestBinding(stores.runs, stores.artifacts, changed.digest),
          /undeclared prompt artifact/,
        );
      } finally {
        await stores.close();
      }
    });
    test('refuses absent declared sources through original-byte acceptance', async () => {
      const stores = await create();
      try {
        const { manifest } = createBindingFixture();
        const changed = createManifest({ ...manifest, prompts: [] });
        await retainBinding(stores, changed);
        await rejects(
          readManifestBinding(stores.runs, stores.artifacts, changed.digest),
          /invalid_prompt_sources/,
        );
      } finally {
        await stores.close();
      }
    });
    test('refuses missing retained prompt bytes', async () => {
      const stores = await create();
      try {
        const { manifest } = createBindingFixture();
        await retainBinding(stores, manifest);
        await rejects(
          readManifestBinding(stores.runs, stores.artifacts, manifest.digest),
          /artifact does not exist/,
        );
      } finally {
        await stores.close();
      }
    });
    test('verifies tool policy bytes without inferring authority', async () => {
      const stores = await create();
      try {
        const { manifest } = createBindingFixture(true);
        const policy = new TextEncoder().encode('policy');
        const changed = createManifest({
          ...manifest,
          toolPolicies: [referenceArtifact(policy, 'text/plain')],
        });
        await retainBinding(stores, changed);
        await rejects(
          readManifestBinding(stores.runs, stores.artifacts, changed.digest),
          /artifact does not exist/,
        );
        await stores.artifacts.retainArtifact(policy, 'text/plain');
        expect(
          (await readManifestBinding(stores.runs, stores.artifacts, changed.digest)).manifest,
        ).toEqual(changed);
      } finally {
        await stores.close();
      }
    });
  });
}
