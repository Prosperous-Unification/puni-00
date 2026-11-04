# Binary evidence presentation

CI run 39699842555 refused undeclared binary content in the original logs.
The readable logs now escape NUL characters; no assertion text was removed.
Decode the companion Base64 files to recover byte-identical originals.
SHA256SUMS describes the current stored files, while original hashes follow.

- `filter.log`: original SHA256 `1a9ed854dd4c8ec6870771c1dc2840884663e927aa467099fdb7da5fceb98b2e`; NUL bytes displayed as literal `\u0000`; original bytes retained in `filter.log.raw.base64.txt`.
- `unpinned.log`: original SHA256 `c616dff6ccdf8363ef510b3c81a822ba8ef09f73b26cfb03c24fd3e84dd61737`; NUL bytes displayed as literal `\u0000`; original bytes retained in `unpinned.log.raw.base64.txt`.
