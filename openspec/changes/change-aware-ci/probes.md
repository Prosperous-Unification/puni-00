# Historical CI selection probes

These temporary October 22, 2026 fixtures were never separate implementation PRs.
Their observed selection and timing evidence is already in [verification](verify.md#hosted-pr-and-heading-parser-correction).
The exact local patches are retained here for publication and reproducibility;
they do not introduce an active change packet or modify the assessment report.
The implementing change was merged in [PR643](https://github.com/Prosperous-Unification/puni-00/pull/643).
These historical probes are not fresh test results.

## `ci-docs-selection-proof`

Original local commit: `2f55c9135439de8dad7f94654059ccde685124c3`.

```diff
commit 2f55c9135439de8dad7f94654059ccde685124c3
Author:     Dany Fedorov <fedorov.dda@gmail.com>
AuthorDate: Thu Oct 22 10:20:43 2026 +0300
Commit:     Dany Fedorov <fedorov.dda@gmail.com>
CommitDate: Thu Oct 22 10:20:43 2026 +0300

    docs: verify hosted narrative-only CI selection

diff --git a/docs/findings/puni-assessment-2026-10-21/report.md b/docs/findings/puni-assessment-2026-10-21/report.md
index 084ca1256..40c6504ff 100644
--- a/docs/findings/puni-assessment-2026-10-21/report.md
+++ b/docs/findings/puni-assessment-2026-10-21/report.md
@@ -255,3 +255,5 @@ documents, `git diff --check`, and existence checks for 239 relative link target
 Markdown anchors and external URLs were not validated by the link check. Independent
 cross-review corrected memory units and tightened provenance wording; it did not add
 operational proof.
+
+<!-- Hosted CI documentation-scope probe for PR #643; temporary validation branch. -->
```

## `ci-files-selection-proof`

Original local commit: `973ac3abf08c8df8e02f66c4f2fb5196c72054ad`.

```diff
commit 973ac3abf08c8df8e02f66c4f2fb5196c72054ad
Author:     Dany Fedorov <fedorov.dda@gmail.com>
AuthorDate: Thu Oct 22 11:02:08 2026 +0300
Commit:     Dany Fedorov <fedorov.dda@gmail.com>
CommitDate: Thu Oct 22 11:02:08 2026 +0300

    test(ci): verify source changes with a required packet

diff --git a/openspec/changes/source-selection-proof/.openspec.yaml b/openspec/changes/source-selection-proof/.openspec.yaml
new file mode 100644
index 000000000..1db086100
--- /dev/null
+++ b/openspec/changes/source-selection-proof/.openspec.yaml
@@ -0,0 +1,2 @@
+schema: sdd-lean
+created: 2026-10-22
diff --git a/openspec/changes/source-selection-proof/proposal.md b/openspec/changes/source-selection-proof/proposal.md
new file mode 100644
index 000000000..82b7e27d0
--- /dev/null
+++ b/openspec/changes/source-selection-proof/proposal.md
@@ -0,0 +1,37 @@
+## Why
+
+Verify that a source change and its required packet retain scoped runtime checks.
+
+## What Changes
+
+Clarify the brief symbol documentation.
+
+## Non-Goals
+
+No runtime behavior changes.
+
+## Constraints
+
+Keep actual Nx consumers selected.
+
+## Capabilities
+
+### New Capabilities
+
+- `source-selection-proof`: local selection verification.
+
+### Modified Capabilities
+
+None.
+
+## Domain Terms
+
+None.
+
+## Decisions Recorded
+
+None.
+
+## Impact
+
+Brief contract documentation and local CI selection evidence.
diff --git a/openspec/changes/source-selection-proof/specs/source-selection-proof/spec.md b/openspec/changes/source-selection-proof/specs/source-selection-proof/spec.md
new file mode 100644
index 000000000..48d2fecd3
--- /dev/null
+++ b/openspec/changes/source-selection-proof/specs/source-selection-proof/spec.md
@@ -0,0 +1,10 @@
+## ADDED Requirements
+
+### Requirement: Keep brief behavior unchanged
+
+The brief contract SHALL preserve its runtime behavior when its documentation changes.
+
+#### Scenario: A clarified source comment
+
+- **WHEN** the brief source comment changes
+- **THEN** the existing contract tests still pass
diff --git a/openspec/changes/source-selection-proof/tasks.md b/openspec/changes/source-selection-proof/tasks.md
new file mode 100644
index 000000000..145062a68
--- /dev/null
+++ b/openspec/changes/source-selection-proof/tasks.md
@@ -0,0 +1,3 @@
+## 1. Verification
+
+- [ ] 1.1 Verify affected runtime selection and literal test-file selection.
diff --git a/openspec/changes/source-selection-proof/verify.md b/openspec/changes/source-selection-proof/verify.md
new file mode 100644
index 000000000..df2469130
--- /dev/null
+++ b/openspec/changes/source-selection-proof/verify.md
@@ -0,0 +1,3 @@
+# Verification
+
+Local-only probe; production selection evidence is recorded outside this fixture.
```

## Source-comment fixture within `ci-files-selection-proof`

This earlier unique commit is also part of the source-probe branch.

```diff
commit 8cca1cb70bb327f10aeebe563cbd2cbf850109b4
Author:     Dany Fedorov <fedorov.dda@gmail.com>
AuthorDate: Thu Oct 22 10:20:48 2026 +0300
Commit:     Dany Fedorov <fedorov.dda@gmail.com>
CommitDate: Thu Oct 22 10:20:48 2026 +0300

    docs(website): verify source-file CI test selection

diff --git a/libs/website/domain/contracts/src/brief.ts b/libs/website/domain/contracts/src/brief.ts
index d7d6414b5..79d35b4a2 100644
--- a/libs/website/domain/contracts/src/brief.ts
+++ b/libs/website/domain/contracts/src/brief.ts
@@ -15,7 +15,8 @@ const isMarkerLine = (line: string): boolean =>

 /**
  * Extracts the brief from the assistant's own reply, never from visitor text. With an opening
- * marker line followed by a closing one, the trimmed lines between them are the brief. Otherwise
+ * marker line followed by a closing one, the trimmed lines between them are the brief.
+ * Marker matching ignores surrounding whitespace on each marker line. Otherwise
  * stray marker lines are dropped, then a leading line ending with ":" and a trailing line ending
  * with "?". A blank result is `empty`, so a model that marks nothing never clears or sets a brief.
  */
```
