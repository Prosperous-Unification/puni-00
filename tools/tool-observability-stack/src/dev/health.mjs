const endpoints = [
  ['elasticsearch', 'http://elasticsearch:9200/_cluster/health?wait_for_status=yellow&timeout=15s'],
  ['kibana', 'http://kibana:5601/api/status'],
  ['collector', 'http://collector:13133/'],
  ['gateway', 'http://gateway:13133/'],
  ['prometheus', 'http://prometheus:9090/-/ready'],
  ['alertmanager', 'http://alertmanager:9093/-/ready'],
];
for (const [service, url] of endpoints) {
  // Proof: removing the signal failed the per-endpoint deadline dependency test.
  const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(20_000) });
  // Proof: removing this throw failed the HTTP 503 negative.
  if (response.status !== 200) throw new Error(`${service} health HTTP ${response.status}`);
  if (service === 'elasticsearch') {
    const health = await response.json();
    // Proof: removing this throw failed the malformed Elasticsearch HTTP 200 negative.
    if (
      health.cluster_name !== 'puni-dev-observability' ||
      !['green', 'yellow'].includes(health.status) ||
      health.timed_out !== false
    )
      throw new Error('Elasticsearch health is incomplete');
  }
  if (service === 'kibana') {
    const health = await response.json();
    // Proof: removing this throw failed the degraded Kibana HTTP 200 negative.
    if (health.status?.overall?.level !== 'available')
      throw new Error('Kibana health is incomplete');
  }
  globalThis.console.log(
    `${service}: endpoint ready; stored observations require separate queries`,
  );
}
