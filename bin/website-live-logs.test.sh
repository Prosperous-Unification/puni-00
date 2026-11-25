#!/usr/bin/env bash
set -euo pipefail

bin=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
export WEBSITE_LOGS_TEST_TRACE="$fixture/ssh-args"
export PATH="$fixture:$PATH"

cat > "$fixture/ssh" <<'SSH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$WEBSITE_LOGS_TEST_TRACE"
exit "${WEBSITE_LOGS_TEST_SSH_STATUS:-0}"
SSH
chmod +x "$fixture/ssh"

expect_log_command() {
  local environment=$1 workload=$2
  shift 2
  local follow=()
  if (($#)); then follow=(--follow); fi
  "$bin/puni-website-$environment-logs" "$@"
  diff -u \
    <(printf '%s\n' -T -o BatchMode=yes -o StrictHostKeyChecking=yes h4 k3s kubectl \
      -n "website-$environment" logs "deployment/$workload" --since=30m --tail=100 "${follow[@]}") \
    "$WEBSITE_LOGS_TEST_TRACE"
}

expect_log_command dev api
expect_log_command prod api
expect_log_command dev site site --follow
expect_log_command prod app app -f
expect_log_command prod api --follow

for environment in dev prod; do
  for argument in 'other' 'api; printf unexpected' '--namespace=kube-system'; do
    rm -f -- "$WEBSITE_LOGS_TEST_TRACE"
    status=0
    "$bin/puni-website-$environment-logs" "$argument" > "$fixture/invalid" 2>&1 || status=$?
    [[ $status -eq 64 && ! -e $WEBSITE_LOGS_TEST_TRACE ]]
  done
  rm -f -- "$WEBSITE_LOGS_TEST_TRACE"
  status=0
  "$bin/puni-website-$environment-logs" api --follow --all-containers > "$fixture/invalid" 2>&1 || status=$?
  [[ $status -eq 64 && ! -e $WEBSITE_LOGS_TEST_TRACE ]]
  "$bin/puni-website-$environment-logs" --help > "$fixture/help"
  "$bin/puni-website-$environment-logs" -h > "$fixture/help-short"
  cmp "$fixture/help" "$fixture/help-short"
  grep -Fq "puni-website-$environment-logs" "$fixture/help"
  grep -Fq '100 lines from the last 30 minutes' "$fixture/help"
  grep -Fq -- '--follow' "$fixture/help"
  [[ ! -e $WEBSITE_LOGS_TEST_TRACE ]]
done

rm -f -- "$WEBSITE_LOGS_TEST_TRACE"
status=0
"$bin/website-live-logs.sh" kube-system > "$fixture/invalid" 2>&1 || status=$?
[[ $status -eq 64 && ! -e $WEBSITE_LOGS_TEST_TRACE ]]

mkdir "$fixture/path"
for environment in dev prod; do
  name="puni-website-$environment-logs"
  ln -s -- "$bin/$name" "$fixture/path/$name"
  (
    cd "$fixture"
    export PATH="$fixture/path:$PATH"
    [[ $(command -v "$name") == "$fixture/path/$name" ]]
    "$name" --help > "$fixture/linked-help"
  )
  grep -Fq "$name" "$fixture/linked-help"
  [[ ! -e $WEBSITE_LOGS_TEST_TRACE ]]
done

status=0
WEBSITE_LOGS_TEST_SSH_STATUS=19 "$bin/puni-website-dev-logs" || status=$?
[[ $status -eq 19 ]]
printf 'Website live logs checks passed\n'
