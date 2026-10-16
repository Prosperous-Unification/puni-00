#!/usr/bin/env bash
set -euo pipefail

origin=${1:?usage: dev-be-probe.sh <origin>}
BUN=${BUN:-bun}
identity=$(curl -sS --max-time 15 -w '\n%{http_code}' "${origin%/}/api/auth/me")
http_status=${identity##*$'\n'}
identity=${identity%$'\n'*}

# Proof: bypassing this guard admitted malformed and authenticated responses in
# be-probe.test.ts; missing features, wrong types and impossible flags must fail.
# be-01 always emits features (session-features/specs/authentication/spec.md).
# Proof: bypassing HTTP 200 validation made all three rejects HTTP cases fail.
if [ "$http_status" = 200 ] && printf '%s' "$identity" | "$BUN" -e '
  const body = await Bun.stdin.json();
  if (body === null || typeof body !== "object" || body.user !== null ||
      body.features === null || typeof body.features !== "object" ||
      typeof body.features.onboarding !== "boolean" ||
      typeof body.features.organizations !== "boolean" ||
      (body.features.organizations && !body.features.onboarding)) {
    throw new Error("expected anonymous user and valid deployment features");
  }
'; then
  printf '[dev-deploy] %-28s %s\n' 'be (auth routes mounted)' 'ok'
  exit 0
fi

printf '[dev-deploy] %-28s %s (HTTP %s) FAIL\n' 'be (auth routes mounted)' "$identity" "$http_status" >&2
exit 1
