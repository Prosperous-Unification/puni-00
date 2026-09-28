import { join } from 'node:path';

/** Lists the exact migration inputs used by both API startup and draft maintenance. */
export function websiteMigrations(): { name: string; directory: string }[] {
  return [
    { name: '001_initial', directory: join(import.meta.dir, 'migrations/001_initial') },
    { name: '002_m2', directory: join(import.meta.dir, 'migrations/002_m2') },
    {
      name: '003_account_submission',
      directory: join(import.meta.dir, 'migrations/003_account_submission'),
    },
    { name: '004_request_scope', directory: join(import.meta.dir, 'migrations/004_request_scope') },
    {
      name: '005_chat_operation',
      directory: join(import.meta.dir, 'migrations/005_chat_operation'),
    },
  ];
}
