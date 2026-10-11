/**
 * Navigator's two cross-product edges are records, not calls: Burokrat's contracts library,
 * which declares and decodes the plan reference and progress receipt, and WBS's contracts,
 * which declare the plan export and the command batch. Every other cross-product and
 * app-to-infrastructure dependency keeps the workspace fences.
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
      files: ['apps/twilight-structure/twilight-navigator/cli/src/**/*.ts'],
      // Proof: omitting this override made uncached Navigator lint fail on the
      // `@twilight/burokrat-contracts` and `@wbs/contracts` imports in plan-reference.ts;
      // a sibling `@wbs/core` import still fails with it present (2026-10-11).
      rules: boundary(['^@twilight/burokrat-contracts$', '^@wbs/contracts$']),
    },
  ];
};
