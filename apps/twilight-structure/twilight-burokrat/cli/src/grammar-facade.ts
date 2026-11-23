import { puniGrammar } from './cli-parser';

/** The current PUNI installed rule surface, excluding source-only validator commands. */
export const parser = puniGrammar.parser;
export type { PuniCommand as Request } from './cli-parser';
