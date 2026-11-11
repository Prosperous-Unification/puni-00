# Retain window backup artifacts without pathname deletion

New window/report backups retain staging directories and links on success and failure,
and never unlink a possibly published report: an observed inode does not make a later
pathname deletion conditional on that inode. A reached directory-rebinding test deleted
competing bytes; another stat, quarantine rename or private-directory premise would not
provide that missing atomic guarantee, while native conditional-deletion machinery would
expand this bounded wrapper substantially.

Return auxiliary artifact metadata and print retention diagnostics to stderr, preserving
the eight-field report/stdout and legacy no-flag backup behavior. Observed locations are
not current ownership or deletion authority; hard links keep blocks allocated until an
operator reconciles artifacts under exclusive namespace control. A successful snapshot
remains usable and failed publication remains explicitly uncertain. Operational steps
live in [the window runbook](../runbook-work-package-windows.md).
