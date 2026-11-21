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
          // Proof: c28-packaging-options; Effective inherited buildable-enforcement option comparison; not an independent test of every inherited constraint.; injected fault failed `PUNI package composition boundary > changes only the exact packaging allowance in the package composition root`; restoration passed.
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
    // Proof: canonical-fixture-policy-faults-v118 independently omitted each alias, broadened the
    // consumer and admitted private runtime access; each corresponding real ESLint assertion failed.
    // Lost regex anchors and inherited buildable enforcement failed effective-policy equality.
    // All six controls passed after exact byte/mode restoration; no generic test exemption is added.
    allowFacades(
      ['apps/puni/cli/src/packaging/test-level-installation.test.fixture.ts'],
      ['^@tools/performance-execution-fixture$', '^@puni/dash/performance-processes$'],
    ),
    // Proof: c28-packaging-allowance; Actual captured-builder admission through resolved facade is required.; injected fault failed `PUNI package composition boundary > changes only the exact packaging allowance in the package composition root` and 1 additional named controls; restoration passed.
    // Proof: c28-packaging-consumer; Actual resolved facade import in neighboring source files must remain refused.; injected fault failed `PUNI package composition boundary > changes only the exact packaging allowance in the package composition root` and 4 additional named controls; restoration passed.
    // Proof: c28-packaging-alias; Actual resolved runtime/grammar aliases remain refused from package composition.; injected fault failed `PUNI package composition boundary > changes only the exact packaging allowance in the package composition root` and 2 additional named controls; restoration passed.
    // Proof: c28-packaging-anchors; Effective anchored-policy configuration proof only; no claim of Nx denial for unresolved fabricated aliases.; injected fault failed `PUNI package composition boundary > changes only the exact packaging allowance in the package composition root`; restoration passed.
    allowFacades(['apps/puni/cli/src/packaging/build.ts'], ['^@puni/burokrat/packaging$']),
    allowFacades(['apps/puni/cli/src/packaging/install.ts'], ['^@puni/burokrat/packaging$']),
    allowFacades(['apps/puni/cli/src/packaging/selection.ts'], ['^@puni/burokrat/installation$']),
    allowFacades(
      ['apps/puni/cli/src/packaging/test-levels.ts'],
      ['^@puni/dash/grammar$', '^@puni/dash/runtime$', '^@puni/burokrat/test-levels$'],
    ),
    allowFacades(
      ['apps/puni/cli/src/packaging/prepare-source-test-levels.ts'],
      ['^@puni/burokrat/packaging$', '^@puni/burokrat/test-levels$'],
    ),
    allowFacades(
      ['apps/puni/cli/src/packaging/prepare-test-level-assets-cli.ts'],
      ['^@puni/burokrat/packaging$'],
    ),
    // Proof: each source-client selector was broadened independently; its adjacent-file refusal failed.
    // Facade omissions failed real import admission. Lost regex anchors failed exact effective options.
    allowFacades(
      ['tools/tool-devsync/src/browser-level.ts'],
      [
        '^@wbs/contracts/solver/supervisor-protocol$',
        '^@wbs/domain$',
        '^@puni/dash/browser-level$',
      ],
    ),
    allowFacades(
      ['tools/tool-devsync/src/performance-level.ts'],
      [
        '^@wbs/contracts/solver/supervisor-protocol$',
        '^@wbs/domain$',
        '^@puni/dash/performance-level$',
        '^@puni/dash/test-level-evidence$',
      ],
    ),
    allowFacades(
      ['tools/tool-devsync/src/source-test-level-context.ts'],
      [
        '^@wbs/contracts/solver/supervisor-protocol$',
        '^@wbs/domain$',
        '^@puni/dash/performance-level$',
      ],
    ),
    allowFacades(
      ['tools/tool-devsync/src/k3s/forge-installation.ts'],
      ['^@wbs/contracts/solver/supervisor-protocol$', '^@wbs/domain$', '^@puni/packaging$'],
    ),
    allowFacades(
      ['tools/tool-remote-scripts/src/lib/source-puni-installation.ts'],
      ['^@wbs/contracts/solver/supervisor-protocol$', '^@wbs/domain$', '^@puni/packaging$'],
    ),
  ];
};
