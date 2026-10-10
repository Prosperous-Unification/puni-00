/**
 * Dash's one in-process planning edge reaches the fleet planner facade while all other
 * cross-product and app-to-infrastructure dependencies retain the workspace fences.
 * Its tests may additionally reach the shared test scratch helper.
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
      files: ['apps/twilight-structure/twilight-dash/cli/src/cli.ts'],
      // Proof: omitting this exact entry made the real Dash CLI lint fail on its fixed
      // fleet planner import; a sibling infra import still fails with this entry present.
      rules: boundary(['^@tools/fleet-plan$']),
    },
    {
      files: ['apps/twilight-structure/twilight-dash/cli/src/**/*.test.ts'],
      // Proof: omitting this override made uncached Dash lint fail on the alias-surface test's
      // `@tools/fleet-plan` import and the fixture's `@tools/test-scratch` import (2026-10-11).
      rules: boundary(['^@tools/fleet-plan$', '^@tools/test-scratch$']),
    },
  ];
};
