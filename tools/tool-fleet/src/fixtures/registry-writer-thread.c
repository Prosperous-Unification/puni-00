#define _GNU_SOURCE
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/wait.h>
#include <unistd.h>

static void *writer(void *path) {
  int descriptor = open(path, O_WRONLY | O_CREAT, 0600);
  if (descriptor < 0 || write(descriptor, "held", 4) != 4) _exit(70);
  for (;;) pause();
  return NULL;
}

int main(int argc, char **argv) {
  if (argc != 3 || (strcmp(argv[1], "live") && strcmp(argv[1], "dead"))) return 64;
  pid_t owner = getpid();
  pid_t child = fork();
  if (child < 0) return 70;
  if (child == 0) {
    if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != owner) _exit(70);
    if (!strcmp(argv[1], "dead")) _exit(0);
    pthread_t thread;
    if (pthread_create(&thread, NULL, writer, argv[2])) _exit(70);
    pthread_exit(NULL);
  }
  if (!strcmp(argv[1], "dead")) {
    siginfo_t status;
    if (waitid(P_PID, child, &status, WEXITED | WNOWAIT)) return 70;
  }
  printf("%d\n", child);
  fflush(stdout);
  struct pollfd control = { .fd = STDIN_FILENO, .events = POLLIN | POLLHUP };
  int ready = poll(&control, 1, 30000);
  if (!strcmp(argv[1], "live") && kill(child, SIGKILL)) return 70;
  int status;
  if (waitpid(child, &status, 0) != child) return 70;
  return ready > 0 ? 0 : 75;
}
