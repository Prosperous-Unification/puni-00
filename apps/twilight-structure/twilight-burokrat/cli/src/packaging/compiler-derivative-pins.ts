/** One actual compiler-options substitution, emitted synchronously before candidate IO. */
export interface PathsSubstitutionAttempt {
  readonly kind: 'compiler-options-paths-substitution';
  readonly specifier: string;
  readonly baseDirectory: string;
  readonly pattern: string;
  readonly substitution: string;
  readonly candidate: string;
}

export const inputSha256 = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39';
export const outputSha256 = '47bffa39459dbbb0797606506c790af1420a983ed6bc1d3ca4945a64ee782559';
export const licenseSha256 = 'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47';
export const upstreamNoticeSha256 =
  '1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c';
export const noticeSha256 = '2bc5ce9e6b7ca3e8cdee8a6593241646056d5018e5d6e21ea5df299f2a200555';

/** Independent exact builder-manifest byte vector, including indentation, field order and LF. */
export const compilerDerivativeManifest = `{
  "schemaVersion": 1,
  "upstream": "@typescript/old@6.0.3",
  "inputSha256": "569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39",
  "outputSha256": "47bffa39459dbbb0797606506c790af1420a983ed6bc1d3ca4945a64ee782559",
  "transformations": 5,
  "licenseSha256": "a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47",
  "upstreamNoticeSha256": "1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c",
  "noticeSha256": "2bc5ce9e6b7ca3e8cdee8a6593241646056d5018e5d6e21ea5df299f2a200555"
}
`;

/** Versioned IO-composition recipe; its identity is not installed-loader attestation. */
export const compilerDerivativeLoaderPolicy =
  'typescript-compiler-loader-v1\nfresh-node-vm-context\ncontext-local-commonjs\ncaptured-authenticated-bytes-only\nabsent-node-bun-io-timers\ndenied-require-and-dynamic-import\nno-string-or-wasm-code-generation\nno-ambient-resolution\n';
