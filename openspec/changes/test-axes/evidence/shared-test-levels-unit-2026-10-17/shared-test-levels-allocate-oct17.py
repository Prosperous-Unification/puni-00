import hashlib,json,pathlib,subprocess
root=pathlib.Path.cwd()
spec=root/'openspec/changes/test-axes/specs/test-axes/spec.md'
journal=root/'openspec/scenario-allocations.json'
prior=json.loads(journal.read_text())
prior_bytes=journal.read_bytes()
cli=['bun','apps/twilight-structure/twilight-burokrat/cli/src/cli.ts','scenario']
log='/tmp/shared-test-levels-allocate-oct17.log'
subprocess.run(['python3','/tmp/config-roots-guard-900.py',log,*cli,'allocate','.',str(spec.relative_to(root))],cwd=root,check=True)
proposal=json.loads(pathlib.Path(log).read_text())
proposed=proposal['journal']
assert proposed['events'][:len(prior['events'])]==prior['events'],'allocator changed journal prefix'
assert len(proposed['events'])==len(prior['events'])+2,'allocator did not append exactly two events'
assert proposal['events']==proposed['events'][len(prior['events']):],'allocator event delta mismatch'
assert spec.read_text().count('#### Scenario: Shared test levels')==2,'expected exactly two unallocated headings'
for event in proposal['events']:
 print(json.dumps(event))
spec.write_text(proposal['specMarkdown'])
journal.write_text(json.dumps(proposed,indent=2)+'\n')
proof={'priorEventCount':len(prior['events']),'proposedEventCount':len(proposed['events']),'priorPrefixEqual':True,'priorJournalSha256':hashlib.sha256(prior_bytes).hexdigest(),'events':proposal['events']}
pathlib.Path('/tmp/shared-test-levels-allocation-prefix-oct17.json').write_text(json.dumps(proof,indent=2)+'\n')
subprocess.run(['python3','/tmp/config-roots-guard-900.py','/tmp/shared-test-levels-provenance-oct17.log',*cli,'validate','.',str(spec.relative_to(root))],cwd=root,check=True)
