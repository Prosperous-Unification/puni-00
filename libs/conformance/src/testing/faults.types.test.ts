import { brokenSource } from './broken-source';
import { createFaultControl, defineFault } from './faults';

interface TypedSource {
  readonly label: string;
}

const control = createFaultControl('typed-phase');
const fault = defineFault({
  id: 'break:projects.create:steps',
  caseId: 'projects.create:steps',
  control,
  mutate: (source: TypedSource) => source,
});
const open = brokenSource((label: string): TypedSource => ({ label }), fault);
open('source');

// Proof: removing this guard fails conformance:typecheck with TS2554 because
// brokenSource retains the source factory's required argument.
// @ts-expect-error the broken factory preserves its input signature
open();

defineFault({
  // Proof: removing this guard fails conformance:typecheck with TS2322 because
  // an arbitrary fault name is outside the manifest-derived registry.
  // @ts-expect-error fault IDs are closed over CaseId
  id: 'break:not-a-manifest-case',
  caseId: 'projects.create:steps',
  control,
  mutate: (source: TypedSource) => source,
});

defineFault({
  id: 'break:projects.create:steps',
  // Proof: removing this guard fails conformance:typecheck with TS2322 because
  // the registered fault ID and its owning case differ.
  // @ts-expect-error the case must be the one encoded by the fault ID
  caseId: 'steps.add',
  control,
  mutate: (source: TypedSource) => source,
});
