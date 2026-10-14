import { BootedBrowserProcess } from './booted-browser-process';

/** Local acceptance alone activates this newly migrated disposable database. */
const backend = await BootedBrowserProcess.open('enabled', undefined, 'http://localhost:7400');
await backend.register('ada');
for (const organization of ['org-a', 'org-b']) {
  backend.organization(organization);
  backend.member(organization, 'ada', 'super_admin');
}
backend.activate();
const server = Bun.serve({
  port: 7300,
  fetch: (request: Request) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/__fixture/remove-a') {
      backend.sqlite.run(
        'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
        ['org-a', backend.userId('ada')],
      );
      return Response.json({ removed: true });
    }
    return backend.app.handle(request);
  },
});
console.log('organization fixture: enabled authority; activated disposable SQLite; localhost:7300');
async function stop() {
  await server.stop(true);
  await backend.close();
  process.exit(0);
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
