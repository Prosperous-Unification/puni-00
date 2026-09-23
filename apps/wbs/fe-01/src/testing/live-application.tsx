import {
  cleanup,
  render as renderInTree,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach } from 'vitest';

import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';

/**
 * Publishes the page's own runtime before every test of the calling file, and
 * gives it back after that test — exactly as the page's own bootstrap does.
 *
 * The **production** slot and the **production** acquisition, over the
 * browser's real store: a component under test reads its preferences from the
 * runtime `applicationSlot` publishes (through {@link render}'s provider), and
 * `lib/remembered.ts` resolves the same slot at every call, so a test that
 * seeds `localStorage` and asserts on it afterwards keeps meaning what it
 * meant before delivery moved off the module-load composition.
 *
 * Call it once, at the top level of a test file, before any `describe`.
 *
 * The acquisition is awaited, so the runtime is genuinely `live` when a test
 * body starts. Teardown runs React's own `cleanup()` **first** — nothing may
 * render against a runtime that is already retiring — and then awaits the
 * retirement in a `finally`, so a cleanup that throws still gives the runtime
 * back. A retirement that refuses is not caught: it fails the test that just
 * ran, and the slot it leaves terminally fatal fails every later test in the
 * file too, which is the loud answer a leaked or unclosable runtime deserves.
 */
export function publishApplicationRuntimeForEachTest(): void {
  beforeEach(async () => {
    await applicationSlot.replace(acquireApplicationRuntime);
  });
  afterEach(async () => {
    try {
      cleanup();
    } finally {
      await applicationSlot.retire();
    }
  });
}

/**
 * Testing Library's `render`, below the page's own
 * {@link ApplicationServicesProvider}.
 *
 * The provider is given no `slot`, so it publishes `applicationSlot` — the one
 * {@link publishApplicationRuntimeForEachTest} makes live. A `rerender` from
 * the result keeps the same wrapper. A test that needs its own slot renders its
 * own provider inside this one; the nearer provider wins.
 */
export function render(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> = {},
): RenderResult {
  return renderInTree(ui, { ...options, wrapper: ApplicationServicesProvider });
}
