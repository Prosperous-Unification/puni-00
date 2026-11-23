export interface NativeMapping {
  readonly permissions: string;
  readonly inode: string;
  readonly encodedPath: string | undefined;
}

/**
 * Decode one observed Linux map record, preserving its full decimal inode and octal-escaped
 * pathname. Anonymous mappings may retain the kernel's trailing separator without a pathname;
 * spaces at the end of an actual named path remain part of that path. Executable/file identity
 * policy stays with the caller. Malformed records throw before any mapping can be skipped.
 */
export function readNativeMapping(line: string): NativeMapping {
  // Proof: map-permissions-vocabulary. Allowing z failed
  // `refuses malformed native map records at the production decoder`
  // on r-zp; exact restoration passed.
  const matched =
    /^[0-9a-f]+-[0-9a-f]+ ([rwxps-]{4}) [0-9a-f]+ [0-9a-f]+:[0-9a-f]+ ([0-9]+)(?: +(\S.*))? *$/.exec(
      line,
    );
  if (matched === null)
    throw new Error(
      'Forge native map observation is malformed: ' +
        JSON.stringify({ line: line.slice(0, 4096), characters: line.length }),
    );
  const permissions = matched.at(1),
    inode = matched.at(2),
    encodedPath = matched.at(3);
  if (permissions === undefined || inode === undefined)
    throw new Error('Forge native map identity is missing');
  return { permissions, inode, encodedPath };
}
