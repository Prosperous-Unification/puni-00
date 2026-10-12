set -eu
url=https://kibana-kb-http.observability.svc:5601
kb() {
  curl --fail-with-body --silent --show-error --max-time 150 --cacert /kibana-ca/ca.crt \
    --user "elastic:${ELASTIC_PASSWORD}" --header 'kbn-xsrf: true' "$@"
}
# Kibana answers its status endpoint long before it can import; only `available` may import.
# Bounded at 60 checks, 10 s apart, inside the Job's own deadline; then the attempt fails.
# Proof: on k3d on 2026-10-11, with Kibana scaled to zero and the bound lowered to 3, the Job
# failed with "did not report available after 3 checks"; with the bound removed it stayed active.
attempt=0
until kb "$url/api/status" | grep -q '"overall":{"level":"available"'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Kibana did not report available after $attempt checks" >&2
    exit 1
  fi
  sleep 10
done
# Kibana answers 200 even when it imported nothing, so the body's top-level verdict decides.
# Proof: on k3d on 2026-10-11 an objects file with an unknown saved-object type answered 200 with
# `"success":false`; this check failed the Job (exit 1), and with it removed the Job completed.
imported=$(kb --request POST "$url/api/saved_objects/_import?overwrite=true" \
  --form file=@/objects/objects.ndjson)
echo "$imported"
case "$imported" in
  *'"success":true,'*) ;;
  *)
    echo 'Kibana refused the saved objects' >&2
    exit 1
    ;;
esac
