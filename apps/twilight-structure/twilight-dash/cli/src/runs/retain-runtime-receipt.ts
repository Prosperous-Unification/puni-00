import type { RuntimeExchange } from '../bridge/runtime-client';
import type { ArtifactStore } from './artifact-store';
import type { ArtifactRef } from './records';

/** Retains detached actual receipt bytes and returns a detached reference; callers own schema, correspondence and local acceptance. */
export async function retainRuntimeReceipt(
  artifacts: ArtifactStore,
  response: RuntimeExchange<unknown>['response'],
  expectedStatus: number,
): Promise<ArtifactRef> {
  // Proof: A18 ignored capture status and 'success with status actual capture' accepted. A19 omitted absence diagnostics and saw a later null fault; diagnostic only for absence. Restorations passed.
  // Proof: D29 omitted shared status comparison and both 'shared receipt capture status through' hosts accepted. D30 bypassed absence and both capture-absence hosts saw a natural null fault. Absence proof is diagnostic only; exact restorations passed.
  if (response?.status !== expectedStatus) throw new Error('runtime receipt capture differs');
  // Proof: A09r aliased captured bytes through retention; 'capture bytes detach' failed JSON parsing after injected mutation. Inherited integrity checks remained; restoration passed.
  // Proof: D31 aliased the capture and both 'shared receipt byte detachment through' hosts failed production JSON parsing after mutation. Inherited integrity checks remained; exact restoration passed.
  const bytes = new Uint8Array(response.bytes);
  // Proof: D32 submitted text/plain and both 'shared receipt byte detachment through' hosts observed the wrong retention media type. Exact restoration passed.
  const retained = await artifacts.retainArtifact(bytes, 'application/json');
  // Proof: A20 dropped metadata diagnostics; 'artifact metadata fault' saw the later reference-codec rejection. Diagnostic only; exact restoration passed.
  // Proof: D33 omitted shared metadata refusal and both 'shared receipt metadata refusal through' hosts saw inherited reference-codec faults instead of the named diagnostic. Diagnostic only; exact restoration passed.
  if (retained.kind === 'refused') throw new Error('runtime receipt artifact metadata differs');
  // Proof: D34 returned the aliased reference across this additional async boundary; both 'shared receipt reference detachment through' hosts failed on mutated evidence. Inherited artifact checks remained; exact restoration passed.
  return structuredClone(retained.reference);
}
