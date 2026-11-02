# tool-rename-work-package

The committed, rerunnable rename of WBS's old level from "project" to "work package"
([design E11 and E12](../../openspec/changes/wbs-work-packages/design.md)). Task 1.4 of
`wbs-work-packages` runs `apply` over the code surfaces as one mechanical commit; a reviewer
reruns it on that commit's parent and expects a byte-identical diff.

```sh
bun tools/tool-rename-work-package/src/cli.ts apply <path>...   # git mv, then respell content
bun tools/tool-rename-work-package/src/cli.ts check             # exit 1 listing every residual
bun tools/tool-rename-work-package/src/cli.ts report            # the inventory, from the tree
```

Each mode takes `--root <dir>` (default: the git top level of the working directory).

- [`src/rename-map.ts`](src/rename-map.ts): the vocabulary as data: the five spellings per word
  family, the renames E11 names one by one, and the two module directory moves.
- [`src/allow-list.ts`](src/allow-list.ts): the excluded paths and the protected lines, each
  with its reason; every line pattern must match a line of the tree.
- [`src/rename-text.ts`](src/rename-text.ts): which spelling a word takes where it stands.
- [`src/tree.ts`](src/tree.ts): `apply` and `check` over a git tree.
- [`src/inventory.ts`](src/inventory.ts): `report`'s schema and route counts.

`apply` runs only over the paths it is given. Tests run it on scratch repositories, never over
this tree.
