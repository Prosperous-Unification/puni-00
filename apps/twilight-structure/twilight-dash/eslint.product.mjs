/**
 * Dash's one in-process planning edge reaches the existing fleet CLI while all other
 * cross-product and app-to-infrastructure dependencies retain the workspace fences.
 */
export default ({
  browserAdapterConstraint,
  productRules,
  runtimeConstraints,
  scopeConstraints,
}) => [
  {
    files: ['apps/twilight-structure/twilight-dash/cli/src/cli.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          // Proof: omitting this exact entry made the real Dash CLI lint fail on its fixed
          // fleet planner import; a sibling infra import still fails with this entry present.
          allow: ['^@tools/fleet-plan$'],
          ignoredCircularDependencies: [['wbs-core', 'wbs-store-memory']],
          depConstraints: [
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
