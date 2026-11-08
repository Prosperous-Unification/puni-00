#!/bin/sh
set -eu
es() {
  curl --fail-with-body --silent --show-error --max-time 20 \
    --header 'content-type: application/json' --request PUT \
    "http://elasticsearch:9200/$1" --data-binary "$2"
}
# ILM ages begin after rollover, not at document ingestion. Disk monitoring is mandatory.
for signal in logs traces metrics; do
  age=7d
  if [ "$signal" = metrics ]; then age=1d; fi
  es "_ilm/policy/puni-dev-$signal" "{\"policy\":{\"phases\":{\"hot\":{\"actions\":{\"rollover\":{\"max_age\":\"1d\",\"max_primary_shard_size\":\"1gb\"}}},\"delete\":{\"min_age\":\"$age\",\"actions\":{\"delete\":{}}}}}}"
  es "_component_template/$signal-otel@custom" "{\"template\":{\"settings\":{\"index.lifecycle.name\":\"puni-dev-$signal\",\"index.lifecycle.prefer_ilm\":true,\"index.number_of_replicas\":0,\"index.mapping.total_fields.limit\":500,\"index.mapping.total_fields.ignore_dynamic_beyond_limit\":true}}}"
done
