/**
 * Twilight Burokrat's one product fence widens its tests by exactly the shared clock-read
 * detector, `@tools/test-clock-reads`, which `no-ambient-clock.test.ts` applies to the package.
 * Production modules keep the root config's scope, runtime, ring and product constraints
 * unchanged. It default-exports a function of the shared constants like every other product
 * policy, the contract `tools/tool-devsync/product-policies.mjs` enforces.
 */
export default ({
  browserAdapterConstraint,
  productRules,
  runtimeConstraints,
  scopeConstraints,
}) => [
  {
    files: ['apps/twilight-structure/twilight-burokrat/cli/src/**/*.test.ts'],
    // Proof: omitting this override made `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src`
    // fail on `no-ambient-clock.test.ts`'s `@tools/test-clock-reads` import; widening it to
    // `^@tools/` failed `lets Burokrat tests reach only the clock-read detector` at the exact
    // allow-list assertion (2026-10-12).
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^@tools/test-clock-reads$'],
          ignoredCircularDependencies: [['wbs-core', 'wbs-store-memory']],
          depConstraints: [
            { sourceTag: 'ring:domain', onlyDependOnLibsWithTags: ['ring:domain'] },
            {
              sourceTag: 'ring:application',
              onlyDependOnLibsWithTags: ['ring:domain', 'ring:application'],
            },
            {
              sourceTag: 'ring:adapter',
              onlyDependOnLibsWithTags: ['ring:domain', 'ring:application', 'ring:adapter'],
            },
            browserAdapterConstraint,
            ...productRules,
            ...scopeConstraints,
            ...runtimeConstraints,
          ],
        },
      ],
    },
  },
];
