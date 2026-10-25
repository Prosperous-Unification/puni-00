const { Bun, process, Buffer, fetch, AbortSignal } = globalThis;
const password = process.env.ELASTIC_PASSWORD;
// Proof: retention Job refuses missing credentials; removing this check admits an empty credential.
if (!password) throw new Error('ELASTIC_PASSWORD is required');
const ca = await Bun.file('/es-ca/ca.crt').text();
const url = 'https://elasticsearch-es-http.observability.svc:9200';
/** The filtered health and acknowledgement contracts are closed; unknown outcomes fail the Job. */
function assertResponse(response, contract) {
  // Proof: retention Job rejects health/mutation missing, null, unknown fields and wrong values;
  // removing this guard makes those production-program negative controls fail.
  if (response === null || typeof response !== 'object' || Array.isArray(response) ||
      Object.keys(response).length !== Object.keys(contract).length ||
      !Object.entries(contract).every(([key, values]) => Object.hasOwn(response, key) && values.includes(response[key])))
    throw new Error('Invalid retention response');
}
/** TLS, credentials, redirect refusal and timeout apply to every health/mutation exchange. */
async function request(path, method, body) {
  const response = await fetch(url + path, {
    method, body, redirect: 'error', signal: AbortSignal.timeout(150000), tls: { ca },
    headers: { authorization: 'Basic ' + Buffer.from('elastic:' + password).toString('base64'), 'content-type': 'application/json' },
  });
  // Proof: retention Job rejects health and mutation HTTP 503/202 even with otherwise valid JSON;
  // removing this guard makes those production-program negative controls fail.
  if (response.status !== 200) throw new Error('Retention HTTP ' + String(response.status));
  return await response.json();
}
assertResponse(await request('/_cluster/health?wait_for_status=yellow&timeout=120s&filter_path=status,timed_out', 'GET'),
  { status: ['yellow', 'green'], timed_out: [false] });
async function mutate(path, filename) {
  assertResponse(await request(path, 'PUT', await Bun.file(import.meta.dir + '/' + filename).text()), { acknowledged: [true] });
}
await mutate('/_ilm/policy/puni-dev-logs', 'logs-policy.json');
await mutate('/_component_template/logs-otel@custom', 'logs-template.json');
await mutate('/_ilm/policy/puni-dev-traces', 'traces-policy.json');
await mutate('/_component_template/traces-otel@custom', 'traces-template.json');
await mutate('/_ilm/policy/puni-dev-metrics', 'metrics-policy.json');
await mutate('/_component_template/metrics-otel@custom', 'metrics-template.json');
