set -eu
url=https://elasticsearch-es-http.observability.svc:9200
es() { curl --fail-with-body --silent --show-error --max-time 150 --cacert /es-ca/ca.crt --user "elastic:${ELASTIC_PASSWORD}" --header "content-type: application/json" "$@"; }
es "$url/_cluster/health?wait_for_status=yellow&timeout=120s"
es --request PUT "$url/_ilm/policy/puni-dev-logs" --data-binary @/settings/logs-policy.json
es --request PUT "$url/_component_template/logs-otel@custom" --data-binary @/settings/logs-template.json
es --request PUT "$url/_ilm/policy/puni-dev-traces" --data-binary @/settings/traces-policy.json
es --request PUT "$url/_component_template/traces-otel@custom" --data-binary @/settings/traces-template.json
es --request PUT "$url/_ilm/policy/puni-dev-metrics" --data-binary @/settings/metrics-policy.json
es --request PUT "$url/_component_template/metrics-otel@custom" --data-binary @/settings/metrics-template.json
