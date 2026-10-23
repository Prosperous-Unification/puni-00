from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[5]
p=root/'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript.ts'
original=p.read_text()
evidence='openspec/changes/automatic-trusted-activation/evidence/retained-typescript-owner-2026-10-17/'
faults={
 'owner-lookup':("if (binding === undefined)", "if (false && binding === undefined)"),
 'snapshot-freeze':('  freezeExtraction(capturedRequest);','  void capturedRequest;'),
 'deep-freeze':('    Object.freeze(value);','    void value;'),
 'root-only-freeze':("if (typeof child === 'object' && child !== null) pending.push(child);", "if (false && typeof child === 'object' && child !== null) pending.push(child);"),
 'original-request':('request: capturedRequest, provenance:', 'request, provenance:'),
 'before-freeze-registration':('  const frozen = freezeExtraction(envelope);', '  Extractions.set(envelope, freezeExtraction({ request: capturedRequest, provenance: { ...provenance } }));\n  const frozen = freezeExtraction(envelope);'),
 'public-provenance':('provenance: { ...provenance }','provenance'),
 'omitted-registration':('  Extractions.set(frozen, binding);','  void binding;'),
 'early-registration':("  // Proof: envelope-cap omission", "  Extractions.set(envelope, freezeExtraction({ request: capturedRequest, provenance: { ...provenance } }));\n  // Proof: envelope-cap omission"),
}
try:
 for name,(before,after) in faults.items():
  assert original.count(before)==1, (name,original.count(before))
  mutated=original.replace(before,after)
  p.write_text(mutated)
  run=subprocess.run(['python3',evidence.replace('retained-typescript-owner-2026-10-17/','retained-typescript-source-2026-10-17/rss-guard.py'),evidence+'fault-'+name+'.log','bun','test','apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-owner.test.ts'],cwd=root)
  if run.returncode==0: raise RuntimeError('fault survived: '+name)
  failure=(root/(evidence+'fault-'+name+'.log')).read_text()
  if '(fail) exact extraction' not in failure: raise RuntimeError('fault failed outside focused assertions: '+name)
finally: p.write_text(original)
