/**
 * PUNI composes only provider grammar facades here; runtimes retain the default boundary until
 * their dedicated executor owns an explicit allowance. All inherited constraints remain active.
 */
export default ({
  browserAdapterConstraint,
  productRules,
  runtimeConstraints,
  scopeConstraints,
}) => [
  {
    // Proof: broadening this consumer fails "keeps @puni/dash/grammar out of neighboring root files".
    files: ['apps/puni/cli/src/cli-parser.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          // Proof: removing allowances fails the real-grammar admission; broadening an alias fails the runtime denial.
          allow: ['^@puni/burokrat/grammar$', '^@puni/dash/grammar$', '^@puni/navigator/grammar$'],
          ignoredCircularDependencies: [['wbs-core', 'wbs-store-memory']],
          // Proof: dropping inherited ring constraints fails "changes only exact import allowances".
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
