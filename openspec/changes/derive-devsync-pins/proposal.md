## Why

Two literals in `tools/tool-devsync` serialise every parallel lane. The workspace inventory pins a row total and a file total, so any project that gains a parent-relative target path or configuration file must hand-edit them. The namespacing digest keys each legacy-root occurrence by its line number, so a comment line added above an unrelated occurrence moves it. The digest was re-pinned four times on one day and the inventory counts twice; two lanes meeting at one literal conflict by construction. Separately, the enumeration those counts rest on lists a conflicted path once per stage, so a merge in progress silently multiplies them.

## What Changes

The inventory expectation becomes an equality against a second, independently derived enumeration of the same facts: a directory walk of the application and library trees for project and TypeScript configuration files, and a streaming JSONC visit reporting every string literal carrying a parent-relative segment, with its property path. That oracle refuses a configuration file it cannot parse. The legacy-occurrence context is keyed by file, matched text, class and trimmed source line instead of by line number, and an unmerged index is refused rather than counted.

## Non-Goals

This change does not relax what either check refuses. It does not remove the occurrence count, the category counts, the unclassified list, the coverage manifest or any containment pin. It does not rename either test file, does not touch the devsync project manifest, the wiki policy files or any Twilight Bureaucrat rule, and creates no Nx target.

## Constraints

Both checks must still fail on every fault their existing proof comments record. The derived inventory must still fail when the collector filters a property kind, when configuration discovery narrows, when project discovery narrows, or when a configuration file is malformed. The digest must still fail on a same-count substitution and on a silent class change. The JSONC parser is pinned exactly, because the executor has no network.
