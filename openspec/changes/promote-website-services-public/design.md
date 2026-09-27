# Design

Keep `apps/website/site` as the only authored private website project. Import the four reviewed service projects at identical relative paths and make their public manifests the source of truth. Use `@website/contracts` and `@website/store-sqlite` aliases for local library edges, and declare those aliases and project dependencies in portability metadata. The API is a Bun server, the app is a Vite/React client, contracts are isomorphic, and SQLite is Bun only.

The private demo pins a public commit and synchronizes the four service directories plus the two aliases. Its private site and deployment settings stay repository-specific. The current transfer tool refuses private-classified API source, so this initial promotion uses a reviewed tracked-file import; after canonical ownership changes, ordinary public-to-private transfer can use the tool. No public release is part of this change.
