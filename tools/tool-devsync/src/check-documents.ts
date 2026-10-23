import { validateDocuments } from './current-documents';

const args = process.argv.slice(2);
// Proof: disabling this guard failed the unexpected-arguments CLI regression because its
// usage refusal disappeared (2026-10-22).
if (args.length > 1) throw new Error('usage: check-documents.ts [repository]');
await validateDocuments(args.length === 0 ? '.' : args[0]);
process.stdout.write('Verified current documents and indexes\n');
