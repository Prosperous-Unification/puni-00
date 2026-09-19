## 1. Add the installed command alias

- [x] 1.1 Extend `install.test.ts` with the expected `twib` manifest entry and direct launcher checks — test: `packed Twilight Bureaucrat installation > installs the exact tarball with scripts disabled and runs without workspace resolution` fails on the manifest expectation before implementation.
- [x] 1.2 Add `twib` to the package manifest — test: repack, then run `packed Twilight Bureaucrat installation > installs the exact tarball with scripts disabled and runs without workspace resolution` and observe one passing test.

## 2. Prove the launcher checks

- [x] 2.1 Demonstrate that all four checks detect faults — test: `packed Twilight Bureaucrat installation > installs the exact tarball with scripts disabled and runs without workspace resolution`; negatives: remove `twib` from the packed manifest, rename the installed short launcher aside, clear its target's executable bit, and replace it with a launcher that prints `9.9.9`.
- [x] 2.2 Record the observed failures beside the launcher assertions — test: restore the passing bytes after every fault and rerun `packed Twilight Bureaucrat installation > installs the exact tarball with scripts disabled and runs without workspace resolution` with one passing test.
