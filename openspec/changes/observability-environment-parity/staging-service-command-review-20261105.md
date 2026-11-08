# Task 110 concrete initial review — PREPARE ONLY

**Verdict: approve one canonical `prepare` invocation using the exact reviewed cached command and private builder below.** This is not approval for `launch`, native services, debt release, raw/ISO work or full-stack acceptance. No request exists for this review to certify; its exact bytes, identities and actual host admission require the separate post-preparation review.

Fresh read-only checks establish:

| Artifact                                  | Bytes | SHA256                                                             |
| ----------------------------------------- | ----: | ------------------------------------------------------------------ |
| `/tmp/puni-staging110-initial-plan.json`  |  2992 | `1133c9cde75fe593590d1aa8f80d23559274e74764e5a73ae5b3bf500481db48` |
| `/tmp/puni-staging110-initial-command.py` |  3523 | `277640069046a91f6fc7ec7bd93686528778aa2183041fb553f034213d7b8b06` |
| `/tmp/puni-staging110-prepare.py`         | 33268 | `780c6926913173b5a2708826bf0aae94e5d9d46598d16fda581d20b1b9f6ee76` |
| Committed public builder template         | 33242 | `c9c2040f795372cfa99de0707c2fc68df5148e5929b23727a6f4601faac94b34` |
| Committed/cached bootstrap                |  3248 | `7c23633b8e693fb5406f8947c0999fb21ddf286bc6085e75b1cb84089f9d0f03` |

The private builder, plan and command are UID1000, mode0600, single-link. The builder occupies 36864 allocated bytes, within its 49152-byte charge. The archived original draft is preserved at `/tmp/puni-staging110-prepare-draft-3a5e986f.py`, 26595 bytes, UID1000/0600/single-link, SHA256 `3a5e986f4ed306826214f953c36ca120288e87d13471441455a110f07486807a`.

Fresh HEAD is `9c4f86db239974ffddc94f35120af0c90995d254`; `git status --short` was empty. The public template/bootstrap/thin/shared files are regular source candidates with UID1000, mode0644 and one link. Their hashes match the reviewed versions. The prior mode-normalization history is root-reported; this review confirms their current modes and unchanged bytes.

A direct whole-file diff proves the private builder changes **only** these three literal assignments:

- `EXPECTED_SOURCE_COMMIT`: `9c4f86db239974ffddc94f35120af0c90995d254`.
- `EXPECTED_SHARED_SHA`: `92c5011dac4c803c2f1e241f069f454d94c27ebdb17f9f5b199b5f7e6dd7ab7c`.
- `EXPECTED_THIN_SHA`: `e30a28472334fe23c5d39ae7f694a289b24eb9836463f28ae5078034d0e735f9`.

Fresh hashes for the six fixed production helpers also match all six literal source-role pins. The eight-role order and seven fixed tool paths remain unchanged. Actual tool/runtime pins and host facts have not been reconstructed or certified by this static review.

The first six command lines import signal/time, establish the original monotonic 45-second deadline, install an exception handler and arm the initial timer. Hashing the remaining exact command bytes yields the reviewed bootstrap SHA above. There is no operational bootstrap-path reread. Approval binds execution of this exact cached body through `/usr/bin/python3.12 -I -B -c`, with arguments consisting of the private builder SHA and **`prepare`**, cwd `/home/df/.codex/worktrees/aa39/puni-00`, LANG/LC_ALL=C, and the existing user-manager values. It does not authorize running the command-body file by pathname or selecting another action.

The bootstrap captures and verifies the private builder once and executes that exact buffer. The fixed preparation path must perform its fresh source/Git/tool and producer-runtime capture, kernel observation, original-lock join, whole reservation ledger, two-root inventory, capacity and early metadata checks. These checks are mandatory; this approval supplies no successful-admission assertion. Before first retained creation, measured metadata +331776 future bytes +90112 creation reserve must fit1048576. Original G141754548224 remains required once in the complete ledger and every additional pending debt remains charged. All existing physical, process and service limits stay fixed. The dated503808 figure gives925696 only as historical arithmetic, not current admission.

Only the two exclusive empty fixture directories and one canonical fresh request belong to preparation. The request must be fully padded/fsynced to65536 bytes and finalized through the same FD with unchanged inode/size/allocation and frozen complete inventory. Any refusal stops the attempt and preserves its evidence; it does not authorize automatic retry or weakening a check.

Read-only checks found all five `/tmp` markers absent: prepared, review, approved, launched and capture. No `.puni` or `.superpowers` inventory was performed. After successful preparation, preserve the inventory freeze and perform technical review plus independent review of the actual request, source/runtime/kernel joins, fixture lineage, complete ledger and current physical admission before considering native launch. No native approval is granted by this report.

No operator mode, source/helper code, test, manager command, operational probe, retained-state inventory or native action ran during this review. Source reviews and root-reported typing/OpenSpec/hooks are prior evidence, not rerun here. Only this bounded `/tmp` report was written; source/index and retained roots were untouched.
