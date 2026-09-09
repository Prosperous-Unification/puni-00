# Verification

Remote h2puni gate evidence will be recorded before merge.

| Fault | Expected proof |
| --- | --- |
| Remove the unsafe-command guard | The real CLI test emits the tab-bearing command and fails |
| Remove the safe-tail prefix or bare-CR split | A rendered line begins with a workflow command |
| Decode printable percent spellings | The exact accepted stdout assertion fails |
