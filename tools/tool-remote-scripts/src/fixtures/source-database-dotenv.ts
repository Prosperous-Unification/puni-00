console.log(
  JSON.stringify({
    DB_PATH: process.env['DB_PATH'],
    MIGRATE_ON_STARTUP: process.env['MIGRATE_ON_STARTUP'],
  }),
);
