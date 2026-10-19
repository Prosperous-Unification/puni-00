# Hosted bounded installed parity proof

This verification branch builds source `d7f2129598af7a3cb7ed3c7161e06d504b586891`,
installs the resulting archive and the immutable historical archive into fresh consumers,
then compares four complete REL-EXTRACT reports against the retained positive and refusal
reports. The fixture commit, policies and report bytes are pinned in `bindings.json`.
This branch is verification transport; its binary fixture bundle is not intended for the
application PR or a merge into main.

The workflow runs on pushes to `integration/wbs100-hosted-parity-20261020`. It checks out
the evaluator source separately from this proof commit and uploads the successor archive,
command/resource receipts, raw streams and eight installed-identity snapshots. A successful
comparison proves bounded hosted installed parity only. It does not establish all-rule
acceptance, certification, full CI or the canonical h2 gate.

The two retained guards require at least 12 GiB available memory and cap process-tree RSS
at 2 GiB. Build/install commands have 360 seconds; each fixture invocation has 60 seconds.
The driver checks child exit status because the guards themselves allow modeled exit 1.
Historical artifact 12029728928 must remain available with the pinned ZIP and package
digests. Failure or expiry must not be replaced by a rebuilt historical package.

The driver and capture helper are unchanged from the reviewed preparation packet. Its
43 watched safety-check faults and restored checks bind driver SHA-256
`99faf6eda9ccb1cc3d333ea72af48df95ec7561d930bdbc7f2ae0bb2e41fa71d`.
Those checks used small local fixtures and did not claim hosted execution. The original
preparation packet and negative receipts remain preserved outside this proof checkout.

Pinned actionlint 1.7.12 passed the prepared workflow. Python syntax, embedded shell syntax,
immutable input hashes and exact guard bytes also passed preparation checks; hosted outcomes
remain pending until the uploaded receipts exist. Four exact `.prettierignore` entries protect
the historical JSON bytes after the initial explicit format check reported all four files.
The workflow, bindings and this README remain subject to ordinary formatting checks.
