# Lab-only injected fault: the upgrade candidate whose process exits before it serves, so its
# readiness never passes. Build with --build-arg BASE=<upgrade candidate image>.
ARG BASE
FROM ${BASE}
CMD ["bun", "-e", "console.error('lab fault: induced health failure'); process.exit(1)"]
