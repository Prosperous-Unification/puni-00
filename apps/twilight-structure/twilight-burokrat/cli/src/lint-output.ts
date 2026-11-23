import { createOutputs } from '@shared/bun-output';

export type {
  Diagnostic as LintDiagnostic,
  Output as LintOutput,
  Outputs as LintOutputs,
  Sink as LintSink,
  Write as LintWrite,
} from '@shared/bun-output';

/** Preserve the lint-owned public API and diagnostics while sharing native output lifetime. */
export function createLintOutputs(context: Omit<Parameters<typeof createOutputs>[0], 'name'>) {
  return createOutputs({ ...context, name: 'lint' });
}
