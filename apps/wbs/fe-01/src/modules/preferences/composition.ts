import { browserStorage } from './browser-storage.repository';
import type { Preferences, RememberedPreferences } from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * The module-load preferences resource delivery still imports.
 *
 * **Staged, and recorded as debt.** The page's runtime now installs this same
 * module through `installApplicationRuntime`, which is where preferences will be
 * read from once delivery takes them out of a context. Until then there are two
 * instances of a service that holds **no state** — every preference lives in the
 * reader's browser and the adapter reaches it per call — so the two agree by
 * construction, and `composition-agreement.test.ts` is what says so. What the
 * runtime's instance has and this one has not is an owner: retiring it revokes
 * its store.
 *
 * **One of the five call sites has moved off this file already:** `lib/theme.ts`
 * reads and writes through `useApplicationServicesState()`, not this module —
 * see
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`.
 * `components/wbs/gantt-detail.ts`, `components/wbs/project-page.tsx` and
 * `components/wbs/project-settings-modal.tsx` still import
 * {@link rememberedPreferences}; `lib/remembered.ts` still imports
 * {@link browserPreferences} to offer its two factories to the layout module.
 * This file is deleted once all five have moved, and
 * `components/wbs/remembered-layout.ts`'s module-scope
 * `storedMermaidSectionMode` must become lazy first — a module-scope binding
 * cannot read a React context.
 *
 * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
 * generic factory to the layout module, which builds a store per project id and
 * so cannot be a fixed named answer. Nothing that imports React may import this;
 * delivery takes {@link rememberedPreferences}.
 */
export const browserPreferences: Preferences = createPreferences(browserStorage());

/** The named answers, which is what delivery imports. */
export const rememberedPreferences: RememberedPreferences =
  createRememberedPreferences(browserPreferences);
