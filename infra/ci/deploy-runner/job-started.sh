#!/usr/bin/env bash
# ACTIONS_RUNNER_HOOK_JOB_STARTED for the persistent `puni-deploy` runner, which holds the
# deployment credentials and the protected state directory. Any workflow file in the repository
# can name the runner's labels, so the runner itself refuses every job but deploy-k3s.yml on main.
# PUNI_DEPLOY_REPOSITORY (owner/name) comes from the runner's own .env, never from a job.
# Installation and the runner-group restriction: docs/infra/deployment.md, "CI/CD".
set -euo pipefail

repository=${PUNI_DEPLOY_REPOSITORY:?the runner .env must set PUNI_DEPLOY_REPOSITORY}
expected="$repository/.github/workflows/deploy-k3s.yml@refs/heads/main"
# Proof: deploy-k3s-workflow.test.ts runs this hook with a pull-request workflow ref and with an
# unset ref and observes exit 1; with this comparison removed both jobs were allowed to start.
if [[ "${GITHUB_WORKFLOW_REF:-}" != "$expected" ]]; then
  printf 'puni-deploy runs only %s, not %s\n' "$expected" "${GITHUB_WORKFLOW_REF:-(unset)}" >&2
  exit 1
fi
