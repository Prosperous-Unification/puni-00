async function main(): Promise<void> {
  console.log('[tool-remote-scripts] install is a placeholder — on a real host, this rsyncs');
  console.log('  dist/tool-remote-scripts/*.js into /srv/wbs/bin/ and chmods them 0755.');
  await Promise.resolve();
}

if (import.meta.main) {
  void main();
}
