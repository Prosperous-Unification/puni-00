## ADDED Requirements

### Requirement: Private companions are checked out under an ignored path

`bun run private:checkout <repo> [--ref <revision>]` SHALL clone the repository beside the
public `origin` (same scheme, host and organisation) into `private/<repo>/` of the current
checkout with the caller's own credentials, or fetch and fast-forward an existing clean clone,
and SHALL detach at `--ref` when given. It SHALL refuse, changing nothing, when the path is not
ignored, when the nested checkout has any uncommitted or untracked change, or when it tracks
another remote. `.gitignore` SHALL contain `/private/` and `.nxignore` SHALL contain `private`.

#### Scenario: dirty nested checkout

- **WHEN** `private/puni-fleet` has an untracked file and the remote has a new commit
- **THEN** the command fails naming the path, and HEAD and the file are unchanged

#### Scenario: path not ignored

- **WHEN** the public `.gitignore` lacks `/private/`
- **THEN** the command fails before cloning

### Requirement: Wrapper targets skip visibly when the checkout is absent

`private:check` and `private:rehearse` SHALL run the nested repository's frozen install and its
own Nx targets inside `private/puni-fleet`, without the outer `NX_*` variables, returning the
first non-zero exit. When the checkout is absent they SHALL print
`private checkout absent: puni-fleet checks skipped` (or `rehearsal skipped`) and exit 0; a path
that exists but is not a directory or cannot be inspected SHALL fail.

#### Scenario: failing nested command

- **WHEN** the first nested command exits 1
- **THEN** the wrapper exits 1 and runs nothing after it

### Requirement: No private content reaches the public repository

`private-nesting.ts` SHALL fail on an empty file list, then on a `.gitignore` without
`/private/`, then on every indexed path under `private/`, every mode-160000 entry and a
`.gitmodules` file. It SHALL run in lefthook pre-commit over staged files and in the CI
`gate_workspace` job over every tracked file.

#### Scenario: forced add

- **WHEN** `git add -f private/puni-fleet/README.md` is staged
- **THEN** the hook exits 1 naming the path, and the CI step exits non-zero on the same tree

#### Scenario: submodule entry

- **WHEN** the index holds a gitlink or a `.gitmodules` file exists
- **THEN** the hook exits 1 naming it
