#!/usr/bin/env bun
import {
  assertRenameWindow,
  parseRenameWindowArguments,
  runRenameWindowDocker,
} from '../tools/tool-remote-scripts/src/lib/rename-window';

/** Explicit host proof entrypoint; import-safe for the embedded PUNI operational adapter. */
export async function runRenameWindowCommand(args: readonly string[]) {
  return assertRenameWindow(parseRenameWindowArguments(args), runRenameWindowDocker);
}
if (import.meta.main)
  console.log(JSON.stringify(await runRenameWindowCommand(process.argv.slice(2))));
