import { resolve } from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * The kit's catalogue: every `*.stories.tsx` beside the primitives, built by
 * Vite with Tailwind v4's plugin so the stories paint from the same
 * `theme.css` an app imports.
 *
 * `@ui/core-01` is aliased here because Vite does not read `tsconfig.base.json`'s
 * `paths`; WBS's `vite.config.ts` aliases it the same way.
 *
 * The kit's `build` target depends on `build-storybook`, so a story that stops
 * compiling fails the gate. Proof: `input.stories.tsx` importing a missing
 * `Nope` from `./index` made `nx run shared-ui-saas-01:build` exit 130 on
 * `[MISSING_EXPORT] "Nope" is not exported by "src/index.ts".` (2026-10-21).
 */
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-themes'],
  core: { disableTelemetry: true },
  viteFinal(viteConfig) {
    return {
      ...viteConfig,
      plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
      resolve: {
        ...viteConfig.resolve,
        alias: {
          '@ui/core-01': resolve(import.meta.dirname, '../../ui-core-01/src/index.ts'),
        },
      },
    };
  },
};

export default config;
