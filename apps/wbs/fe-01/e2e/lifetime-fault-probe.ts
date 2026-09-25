import { DiBag } from 'di-bag';
import { createRoot } from 'react-dom/client';

import { App } from '@/app';
import { bootstrapApplication } from '@/runtime/application-bootstrap';
import type { ApplicationServices } from '@/runtime/application-runtime';
import {
  createLifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from '@/runtime/lifetime-slot';

/**
 * What one run of the page's real bootstrap, refused, put on the page.
 *
 * The console is not in here: Playwright listens to it from outside the page, which
 * is the only reading that includes React's own lines as well as the bootstrap's.
 */
export interface LifetimeFaultProof {
  /** Everything the fatal page rendered, as text. */
  readonly pageText: string;
  /** Everything it rendered, as markup: attributes as well as text. */
  readonly markup: string;
  /** The occurrence identifier it disclosed, or null if it disclosed none. */
  readonly reference: string | null;
}

/**
 * A construction that acquires one owned resource in a real bag and then refuses.
 *
 * Its literal strings are what `lifetime-fault.spec.ts` searches the document and the
 * console for: a personal identifier in the message, a credential and an internal
 * locator on the cause. String literals, because the shipped config builds this probe
 * minified and an identifier would not survive that.
 */
function refuseAfterAcquiring(): RetirableRuntime<ApplicationServices> {
  const bag = DiBag.createBuilder()
    .withServices({
      owned: DiBag.providerWithDisposal({
        provider: DiBag.createProvider((): string => 'the store it took', {
          factoryReturnKind: 'sync-value',
        }),
        disposeService: async () => {
          await Promise.resolve();
        },
      }),
    })
    .buildContainer();
  bag.resolve('owned');
  throw new PartialAcquisitionError(
    new Error('saving plan p-7 for alice@example.com failed', {
      cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
    }),
    (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
  );
}

/**
 * Run the shipped bootstrap against a refused construction and read the page.
 *
 * Deliberately the production `bootstrapApplication` and the production
 * `createRoot` wiring from `src/`, through the deployed Vite config: a probe over
 * its own copy would keep passing while the page's grew a raw message. The slot is
 * a fresh one rather than the page's, so this proves the refusal path without
 * depending on what the document's own bootstrap did first.
 */
async function proveTheFatalPageDisclosesNothingRaw(): Promise<LifetimeFaultProof> {
  const host = document.createElement('div');
  document.body.append(host);
  await bootstrapApplication(host, {
    acquire: refuseAfterAcquiring,
    slot: createLifetimeSlot<ApplicationServices>(1_000),
    mount: (element, options) => createRoot(element, options),
    app: App,
    eventTarget: window,
  });
  const deadline = Date.now() + 10_000;
  while (host.querySelector('[data-lifetime-fault]') === null) {
    if (Date.now() > deadline) throw new Error('the fatal page never rendered');
    await new Promise((settle) => setTimeout(settle, 10));
  }
  const reference = host.querySelector('[data-lifetime-fault-reference]')?.textContent ?? null;
  return {
    pageText: host.textContent,
    markup: host.innerHTML,
    reference: reference === null ? null : reference.replace('Reference ', ''),
  };
}

// The cast names the one boundary this file has: a bundled module and the page that
// loads it share nothing but this global, and `globalThis` is typed without it.
(globalThis as unknown as { lifetimeFaultProof: Promise<LifetimeFaultProof> }).lifetimeFaultProof =
  proveTheFatalPageDisclosesNothingRaw();
