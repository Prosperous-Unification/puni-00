# Lab-only F8 candidate: the current backend image plus one additive migration. Build with
#   docker build -f deploy/k8s/wbs/lab/backend-upgrade.Dockerfile \
#     --build-arg BASE=<current backend image> -t wbs-be-01:f8-v2 deploy/k8s/wbs/lab
ARG BASE
FROM ${BASE}
COPY migrations/20260918000000_lab_additive /app/apps/wbs/be-01/drizzle/20260918000000_lab_additive
