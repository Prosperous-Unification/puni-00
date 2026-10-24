#!/usr/bin/env bash
# Manual review artifact. Never called by a test, build, CI target or gate.
# Invocation is reserved for separately reviewed root namespace authorization:
#   /absolute/path/to/participant-root-process.sh --reviewed-local-namespace-rehearsal
# Prerequisites: root, exact listed binaries, PID/mount/network namespace permission,
# and a scratch /tmp filesystem. This script does not claim product-image admission.
set -euo pipefail
umask 077
if [[ ${1-} != --reviewed-local-namespace-rehearsal || $# != 1 ]]; then
  echo 'requires explicit reviewed local namespace rehearsal invocation' >&2
  exit 64
fi
if [[ $(id -u) != 0 ]]; then
  echo 'requires an independently authorized root invocation; never self-escalates' >&2
  exit 77
fi
for executable in /usr/bin/cc /usr/bin/unshare /usr/bin/timeout /usr/bin/setpriv /usr/bin/stat; do
  [[ -x "$executable" ]] || { echo "required executable absent: $executable" >&2; exit 69; }
done
fixture_directory=$(mktemp -d /tmp/puni-participant-root-process.XXXXXXXX)
chmod 700 "$fixture_directory"
namespace_supervisor=''
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$namespace_supervisor" ]]; then
    if kill -0 "$namespace_supervisor" 2>/dev/null; then
      kill -TERM "$namespace_supervisor"
    fi
    if wait "$namespace_supervisor"; then
      :
    else
      local child_status=$?
      if [[ $status == 0 && $child_status != 124 && $child_status != 143 ]]; then status=$child_status; fi
    fi
  fi
  rm -f "$fixture_directory/init.c" "$fixture_directory/init" "$fixture_directory/inner-pid" "$fixture_directory/stdout" "$fixture_directory/stderr"
  rmdir "$fixture_directory"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cat > "$fixture_directory/init.c" <<'C'
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
static volatile sig_atomic_t stopping;
static void stop(int signal_number) { (void)signal_number; stopping = 1; }
int main(int count, char **arguments) {
  if (count != 2 || getpid() != 1 || geteuid() != 0) return 64;
  struct sigaction action = {0}; action.sa_handler = stop;
  if (sigaction(SIGTERM, &action, NULL) || sigaction(SIGINT, &action, NULL) || sigaction(SIGALRM, &action, NULL)) return 70;
  alarm(12);
  pid_t application = fork();
  if (application < 0) return 71;
  if (!application) {
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != 1) return 72;
    signal(SIGTERM, SIG_DFL); signal(SIGINT, SIG_DFL); signal(SIGALRM, SIG_DFL); alarm(14);
    int listener = socket(AF_INET, SOCK_STREAM | SOCK_CLOEXEC, 0);
    struct sockaddr_in address = {0}; address.sin_family = AF_INET; address.sin_port = htons(3100); address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (listener < 0 || bind(listener, (struct sockaddr *)&address, sizeof address) || listen(listener, 1)) return 73;
    FILE *record = fopen(arguments[1], "wx");
    if (!record || fprintf(record, "%ld\n", (long)getpid()) < 0 || fclose(record)) return 74;
    while (1) pause();
  }
  int status;
  while (!stopping) { pid_t reaped = waitpid(application, &status, 0); if (reaped == application) return 75; if (reaped < 0 && errno != EINTR) return 76; }
  if (kill(application, SIGKILL) && errno != ESRCH) return 77;
  while (waitpid(application, &status, 0) < 0) if (errno != EINTR) return 78;
  return 0;
}
C
/usr/bin/cc -Wall -Wextra -Werror -O2 "$fixture_directory/init.c" -o "$fixture_directory/init"
/usr/bin/timeout --signal=TERM --kill-after=2s 15s /usr/bin/unshare --mount --pid --fork --mount-proc --net --kill-child=KILL "$fixture_directory/init" "$fixture_directory/inner-pid" > "$fixture_directory/stdout" 2> "$fixture_directory/stderr" &
namespace_supervisor=$!
# This review artifact deliberately stops before any collector/observer success claim.
# Root/PID/socket discovery and the production ACK/reap transport must be reviewed
# together before extending this artifact into an acceptance test.
wait "$namespace_supervisor"
namespace_supervisor=''
[[ ! -s "$fixture_directory/stdout" && ! -s "$fixture_directory/stderr" ]]
[[ -s "$fixture_directory/inner-pid" ]]
echo 'bounded namespace lifecycle rehearsal ended; production readiness remains unverified'
