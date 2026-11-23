/** Minimal captured source-file purpose shared by materialization, dependency admission and sealed compilation. */
export interface SourceFiles {
  readSnapshot(): {
    readonly entries: readonly {
      readonly path: string;
      readonly mode: '100644' | '100755' | '120000' | '160000';
    }[];
  };
  readFile(path: string): Uint8Array;
}

/** Explicit local working-source identity, distinct from committed/release source provenance. */
export interface WorkingSource extends SourceFiles {
  readSelection(): {
    readonly kind: 'working';
    readonly base: string;
    readonly identity: string;
  };
}
