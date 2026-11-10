import type {
  CompilerDerivative,
  RelationshipRequest,
  TypeScriptLimits,
  TypeScriptRuntime,
  TypeScriptSource,
} from '@twilight-burokrat/judge';
import { expect, test } from 'bun:test';

import type { Monotonic } from '../clock';
import { extractDerivativeTypeScriptPrerequisite } from './review-compiler-extraction';
import { withCompilerDerivative } from './review-compiler-runtime';

/** Compile-only actual boundary controls; never invoked. */
function requireTiming(
  artifact: CompilerDerivative,
  source: TypeScriptSource,
  request: RelationshipRequest['typescript'],
  limits: TypeScriptLimits,
  consume: (compiler: TypeScriptRuntime) => void,
  monotonic: Monotonic,
) {
  withCompilerDerivative(artifact, monotonic, consume);
  extractDerivativeTypeScriptPrerequisite(
    '/candidate',
    request,
    source,
    limits,
    artifact,
    monotonic,
  );
  // @ts-expect-error Timing is a required separate dependency, never a default.
  withCompilerDerivative(artifact, consume);
  // @ts-expect-error Authenticated composition likewise requires separate timing.
  extractDerivativeTypeScriptPrerequisite('/candidate', request, source, limits, artifact);
}
test('required timing compile controls are not executed', () => {
  expect(typeof requireTiming).toBe('function');
});
