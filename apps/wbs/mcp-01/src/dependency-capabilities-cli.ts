import { MCP_DEPENDENCY_CAPABILITY } from './runtime/dependency-support';

// Proof: removing the argument guard failed exact exit-1/no-observation assertions (2026-10-23).
if (process.argv.length !== 2) throw new Error('dependency capability CLI accepts no arguments');

// Proof: independent config/main imports failed the poisoned-loader subprocess observation.
console.log(JSON.stringify(MCP_DEPENDENCY_CAPABILITY));
