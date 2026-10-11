# Dedicated final-scenario image; its down script has stable bytes and an initially blocked control row.
ARG BASE
FROM ${BASE}
COPY rollback-fault/migrations/29991231010000_lab_rollback_failure /app/apps/wbs/be-01/drizzle/29991231010000_lab_rollback_failure
