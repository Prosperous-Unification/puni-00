import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The shared product's lint policy: the React, hooks and accessibility rules the WBS
 * frontend lints under, applied to every UI kit (`libs/shared/adapters/ui-*`), so a
 * primitive is held to the same rules wherever it is rendered. The other shared libs
 * are framework-free and get nothing from here. The policy is a function of the shared
 * constraints like every product's, though this one reads none of them.
 */
export default () => [
  {
    files: ['libs/shared/adapters/ui-*/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
    settings: { react: { version: '19.2.8' } },
  },
];
