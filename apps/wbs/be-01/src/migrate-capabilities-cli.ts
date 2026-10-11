if (process.argv.length !== 2) {
  // Proof: removing this refusal made the unexpected-argument CLI test exit 0.
  throw new Error('migration capability CLI accepts no arguments');
}

// Proof: requiring DB_PATH or ./drizzle here separately made the DB-free capability
// contract test fail from its absent-path or migration-free working directory.
console.log(
  JSON.stringify({
    protocol: 'wbs-migration',
    version: 1,
    capabilities: ['capture-v1', 'restore-v1-sha256'],
  }),
);
