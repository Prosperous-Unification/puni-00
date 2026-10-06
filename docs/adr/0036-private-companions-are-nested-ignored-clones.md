---
status: accepted
---

# Private companions are nested, ignored clones

Some repositories that belong beside `puni-00` are private: the product source under licence,
and the fleet manifests Flux reads. Developers and agents still need them inside a `puni-00`
checkout, because the private manifests are rehearsed against the public platform manifests.
We decided that a private companion is cloned into the gitignored `private/<repo>/` directory of
a public checkout with the caller's own credentials, from the sibling of `origin`; that `puni-00`
reaches it only through wrapper targets that skip visibly when it is absent; and that a hook in
pre-commit and the same check in CI refuse any tracked path under `private/`, any gitlink, any
`.gitmodules` and a `.gitignore` without `/private/`.

## Considered options

- **A git submodule:** the same working tree, but every bump writes the private URL and a
  revision into public history, `git clone --recursive` and `actions/checkout` fail for anyone
  without access, and public CI comes to depend on a private fetch.
- **Separate checkouts with no integration:** the public repository stays clean, but every
  rehearsal that needs both trees has no single place to run from and manifests get copied by
  hand.
- **A nested, ignored clone (selected):** no public trace beyond the repository names and one
  ignore line, the caller's own credentials, and one mechanically enforced rule.

## Consequences

Nx never walks the nested tree (`.gitignore` and `.nxignore`), so each companion is its own Nx
workspace and public CI never runs its checks. Repository names may appear in public docs; URLs,
revisions and contents may not. Losing a nested checkout loses nothing but local work: it is a
clone. The commands and the leak check live in `tools/tool-private` and
`tools/tool-git-hooks/src/hooks/private-nesting.ts`.
