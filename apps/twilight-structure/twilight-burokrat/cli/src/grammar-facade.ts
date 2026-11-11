import { installedGrammar } from './cli-parser';

/** The installed rule surface, excluding source-only validator commands. */
export const parser = installedGrammar.parser;
export type { InstalledCommand as Request } from './cli-parser';
