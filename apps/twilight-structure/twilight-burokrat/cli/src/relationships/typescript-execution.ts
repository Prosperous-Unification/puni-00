import type { CompilerDerivativeProvenance } from './compiler-derivative-artifact';
import type { TypeScriptRuntime } from './typescript-compiler';

declare const DerivativeExecutionBrand: unique symbol;
/** Internal nominal selection constructed only inside authenticated derivative composition. */
export interface TypeScriptDerivativeExecution {
  readonly [DerivativeExecutionBrand]: true;
  readonly kind: 'derivative';
  readonly compiler: TypeScriptRuntime;
  readonly provenance: CompilerDerivativeProvenance;
}

/** Required internal selection; existing public selected callers never supply derivative identity. */
export type TypeScriptExecution =
  | { readonly kind: 'selected'; readonly compiler: TypeScriptRuntime }
  | TypeScriptDerivativeExecution;
