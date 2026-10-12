/**
 * Dash's in-process edges: `cli.ts` reaches the fleet planner facade, and `cli.ts` plus the
 * runtime authority under `authority/` reach Burokrat's admission judge through the exact
 * `@twilight-burokrat/judge` alias. Every other cross-product, app-to-app and app-to-infrastructure
 * dependency retains the workspace fences. Tests may additionally reach the shared scratch helper.
 */
export default ({
  browserAdapterConstraint,
  productRules,
  runtimeConstraints,
  scopeConstraints,
}) => {
  const boundary = (allow) => ({
    '@nx/enforce-module-boundaries': [
      'error',
      {
        enforceBuildableLibDependency: true,
        allow,
        ignoredCircularDependencies: [['wbs-core', 'wbs-store-memory']],
        depConstraints: [
          // Proof: omitting these three inherited ring constraints made the effective-policy
          // equality test fail while the narrower alias/peer/sibling routing tests stayed green.
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
  });
  return [
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/**/*.ts'],
      ignores: ['apps/twilight-structure/twilight-dash/cli/src/**/*.test.ts'],
      // Fixture helpers bootstrap on absence, which production must never do. A separate rule
      // from `no-restricted-imports`, so the root TypeBox fence stays in force.
      // Proof: removing this override let claims.ts import `./testing/open-or-bootstrap`; `keeps
      // Dash authority test helpers out of production modules` failed (2026-10-11).
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/testing/**', './testing/**'],
                message: 'Test helpers bootstrap on absence; only *.test.ts may import them.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/cli.ts'],
      // Proof: omitting this exact entry made the real Dash CLI lint fail on its fixed
      // fleet planner import; a sibling infra import still fails with this entry present.
      rules: boundary(['^@tools/fleet-plan$', '^@twilight-burokrat/judge$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/authority/**/*.ts'],
      // Proof: omitting this override made uncached `twilight-dash:lint` fail on every authority
      // module's `@twilight-burokrat/judge` import; widening it to `^@twilight-burokrat/` failed
      // `Dash authority reaches only the judge alias` at the exact allow-list assertion.
      rules: boundary(['^@twilight-burokrat/judge$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/**/*.test.ts'],
      // Proof: omitting this override made uncached Dash lint fail on the alias-surface test's
      // `@tools/fleet-plan` import and the fixture's `@tools/test-scratch` import (2026-10-11).
      rules: boundary([
        '^@tools/fleet-plan$',
        '^@tools/test-scratch$',
        '^@twilight-burokrat/judge$',
      ]),
    },
  ];
};
