export default ({
  browserAdapterConstraint,
  productRules,
  runtimeConstraints,
  scopeConstraints,
}) => {
  const allowFacades = (files, allow) => ({
    files,
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow,
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
            // Proof: root-executor-inherited-policy; `PUNI execution boundary > changes only exact runtime allowances in the dedicated executor` failed under its recorded production fault and passed after restoration.
            ...productRules,
            ...scopeConstraints,
            ...runtimeConstraints,
          ],
        },
      ],
    },
  });
  return [
    // Proof: broadening this consumer fails "keeps @puni/dash/grammar out of neighboring root files".
    // Proof: removing allowances fails the real-grammar admission; broadening an alias fails the runtime denial.
    allowFacades(
      ['apps/puni/cli/src/cli-parser.ts'],
      ['^@puni/burokrat/grammar$', '^@puni/dash/grammar$', '^@puni/navigator/grammar$'],
    ),
    allowFacades(
      // Proof: root-executor-consumer; `PUNI execution boundary > keeps @puni/burokrat/runtime out of neighboring root execution files` failed under its recorded production fault and passed after restoration.
      ['apps/puni/cli/src/execute-command.ts'],
      // Proof: root-executor-allowance; `PUNI execution boundary > admits the real lazy executor through only provider runtime facades` failed under its recorded production fault and passed after restoration.
      // Proof: root-executor-alias; `PUNI execution boundary > rejects @puni/dash/grammar from root runtime composition` failed under its recorded production fault and passed after restoration.
      ['^@puni/burokrat/runtime$', '^@puni/dash/runtime$', '^@puni/navigator/runtime$'],
    ),
  ];
};
