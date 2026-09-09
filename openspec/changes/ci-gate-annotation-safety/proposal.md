# CI gate annotation safety

The retained Nx log can contain GitHub workflow-command-shaped assertion output. The annotation
helper already rejects literal control bytes, but the workflow prints the raw tail before invoking
that helper, and rejected annotations disappear without a bounded explanation.

The CI gate will print its tail through the same helper, prefixing every logical CR/LF-delimited line
and rendering remaining control bytes visibly. Located annotations containing controls remain
fail-closed and cause one fixed diagnostic that never repeats their text. Accepted commands remain
byte-for-byte exact.

This does not change the Nx gate verdict, the retained artifact, or the twenty-annotation limit.
