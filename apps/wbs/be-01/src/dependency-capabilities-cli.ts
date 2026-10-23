import { BACKEND_DEPENDENCY_CAPABILITY } from './runtime/dependency-support';

// Proof: removing this guard made the capability argument subprocess exit 0 (2026-10-22).
if (process.argv.length !== 2) throw new Error('dependency capability CLI accepts no arguments');

// Proof: injected DB_PATH and ./drizzle requirements separately failed the DB-free subprocess;
// CLI and HTTP equality tests pin the immutable descriptor independently of configuration.
console.log(JSON.stringify(BACKEND_DEPENDENCY_CAPABILITY));
