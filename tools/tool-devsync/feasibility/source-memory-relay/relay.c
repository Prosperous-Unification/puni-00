#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

struct Relay {
  int upstream, listener, downstream, peer, client_peer, child_reference, directory_reference;
  struct stat directory_identity, socket_identity;
  bool socket_owned;
  pid_t child;
  long long deadline;
  const char *failure;
  char directory[108], socket_path[108];
};
struct Queue { unsigned char bytes[4096]; size_t length; bool eof, shut; };

static long long read_clock(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return -1;
  return (long long)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}
static int refuse_relay(struct Relay *relay, const char *failure) {
  if (relay->failure == NULL || strcmp(failure, "cleanup") == 0) relay->failure = failure;
  return -1;
}
static int remaining_ms(struct Relay *relay) {
  long long now = read_clock();
  if (now < 0 || now >= relay->deadline) return refuse_relay(relay, "deadline");
  return (int)(relay->deadline - now);
}
static int poll_channels(struct Relay *relay, struct pollfd *channels, nfds_t count) {
  /* Proof: breaking the poll budget leaves a child alive after the external watchdog in
   * "deadline terminates and reaps a stalled direct child" (2026-10-16). */
  int remaining = remaining_ms(relay);
  if (remaining < 0) return -1;
  channels[count] = (struct pollfd){ .fd = relay->peer, .events = POLLIN };
  while (true) {
    int observed = poll(channels, count + 1, remaining);
    if (observed < 0 && errno == EINTR) {
      remaining = remaining_ms(relay);
      if (remaining < 0) return -1;
      continue;
    }
    if (observed <= 0) return refuse_relay(relay, observed == 0 ? "deadline" : "poll");
    /* Proof: omission lets the dead peer's live descendant complete successfully;
     * "rejects a dead peer even while its descendant retains the connection" fails. */
    if (channels[count].revents != 0) return refuse_relay(relay, "peer-dead");
    for (nfds_t index = 0; index < count; index++) if (channels[index].revents != 0) return 0;
    remaining = remaining_ms(relay);
    if (remaining < 0) return -1;
  }
}
static int close_descriptor(struct Relay *relay, int *descriptor) {
  int selected = *descriptor;
  *descriptor = -1;
  if (selected >= 0 && close(selected) != 0) return refuse_relay(relay, "cleanup");
  return 0;
}
static int connect_upstream(struct Relay *relay, const char *path) {
  struct sockaddr_un address = { .sun_family = AF_UNIX };
  if (strlen(path) >= sizeof(address.sun_path)) return refuse_relay(relay, "selection");
  strcpy(address.sun_path, path);
  relay->upstream = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
  if (relay->upstream < 0) return refuse_relay(relay, "socket");
  if (connect(relay->upstream, (struct sockaddr *)&address, sizeof(address)) != 0) {
    if (errno != EINPROGRESS) return refuse_relay(relay, "connect");
    struct pollfd channels[2] = {{ .fd = relay->upstream, .events = POLLOUT }};
    if (poll_channels(relay, channels, 1) != 0) return -1;
    int error = 0; socklen_t size = sizeof(error);
    if (getsockopt(relay->upstream, SOL_SOCKET, SO_ERROR, &error, &size) != 0 || error != 0) return refuse_relay(relay, "connect");
  }
  return 0;
}
static int capture_peer(struct Relay *relay, int socket_fd, pid_t expected, int *reference, const char *failure) {
  struct ucred credentials; socklen_t size = sizeof(credentials);
  if (getsockopt(socket_fd, SOL_SOCKET, SO_PEERCRED, &credentials, &size) != 0 || size != sizeof(credentials)) return refuse_relay(relay, failure);
  /* Fixture selections are nonauthoritative. Proof: upstream omission exits zero for
   * the foreign-peer negative; direct-child omission forwards 15 foreign bytes in
   * "rejects a foreign same-UID listener connector before forwarding". */
  if (credentials.pid != expected || credentials.uid != geteuid()) return refuse_relay(relay, failure);
  size = sizeof(*reference);
  if (getsockopt(socket_fd, SOL_SOCKET, SO_PEERPIDFD, reference, &size) != 0 || size != sizeof(*reference) || *reference < 0 || fcntl(*reference, F_SETFD, FD_CLOEXEC) != 0) return refuse_relay(relay, "peer-reference");
  return 0;
}
static int create_listener(struct Relay *relay, const char *parent) {
  if (snprintf(relay->directory, sizeof(relay->directory), "%s/relay.XXXXXX", parent) >= (int)sizeof(relay->directory)) return refuse_relay(relay, "selection");
  if (mkdtemp(relay->directory) == NULL) { relay->directory[0] = '\0'; return refuse_relay(relay, "directory"); }
  relay->directory_reference = open(relay->directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (relay->directory_reference < 0 || fstat(relay->directory_reference, &relay->directory_identity) != 0) return refuse_relay(relay, "directory");
  if (snprintf(relay->socket_path, sizeof(relay->socket_path), "%s/sock", relay->directory) >= (int)sizeof(relay->socket_path)) return refuse_relay(relay, "selection");
  struct sockaddr_un address = { .sun_family = AF_UNIX };
  strcpy(address.sun_path, relay->socket_path);
  relay->listener = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
  if (relay->listener < 0 || bind(relay->listener, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(relay->listener, 1) != 0) return refuse_relay(relay, "listener");
  if (fstatat(relay->directory_reference, "sock", &relay->socket_identity, AT_SYMLINK_NOFOLLOW) != 0 || !S_ISSOCK(relay->socket_identity.st_mode)) return refuse_relay(relay, "listener");
  relay->socket_owned = true;
  printf("BOUND %s\n", relay->socket_path); fflush(stdout);
  struct pollfd channels[2] = {{ .fd = STDIN_FILENO, .events = POLLIN }};
  if (poll_channels(relay, channels, 1) != 0) return -1;
  char release;
  if (read(STDIN_FILENO, &release, 1) != 1 || release != 'R') return refuse_relay(relay, "release");
  return 0;
}
static int launch_client(struct Relay *relay, char **arguments) {
  relay->child = fork();
  if (relay->child < 0) return refuse_relay(relay, "fork");
  if (relay->child == 0) {
    int silence = open("/dev/null", O_RDWR | O_CLOEXEC);
    if (silence < 0 || dup2(silence, STDIN_FILENO) < 0 || dup2(silence, STDERR_FILENO) < 0) _exit(125);
    close(silence);
    char *client[] = { arguments[4], "-I", arguments[5], "client", relay->socket_path, arguments[6], arguments[7], NULL };
    char *environment[] = { "PATH=/usr/bin:/bin", NULL };
    execve(arguments[4], client, environment);
    _exit(126);
  }
  relay->child_reference = (int)syscall(SYS_pidfd_open, relay->child, 0);
  if (relay->child_reference < 0) return refuse_relay(relay, "child-reference");
  printf("CHILD %d\n", relay->child); fflush(stdout);
  struct pollfd channels[2] = {{ .fd = relay->listener, .events = POLLIN }};
  if (poll_channels(relay, channels, 1) != 0) return -1;
  relay->downstream = accept4(relay->listener, NULL, NULL, SOCK_CLOEXEC | SOCK_NONBLOCK);
  if (relay->downstream < 0) return refuse_relay(relay, "accept");
  if (capture_peer(relay, relay->downstream, relay->child, &relay->client_peer, "client-peer") != 0) return -1;
  return close_descriptor(relay, &relay->listener);
}
static int read_queue(struct Relay *relay, int descriptor, struct Queue *queue, size_t *total) {
  ssize_t count = read(descriptor, queue->bytes + queue->length, sizeof(queue->bytes) - queue->length);
  if (count < 0) {
    if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) return 0;
    return refuse_relay(relay, "read");
  }
  if (count == 0) queue->eof = true;
  queue->length += (size_t)count;
  *total += (size_t)count;
  /* Proof: omission exits zero for the 200000-byte fixture in
   * "bounds aggregate forwarded bytes" (2026-10-16). */
  if (*total > 131072) return refuse_relay(relay, "byte-limit");
  return 0;
}
static int write_queue(struct Relay *relay, int descriptor, struct Queue *queue) {
  if (queue->length > 0) {
    ssize_t count = write(descriptor, queue->bytes, queue->length);
    if (count < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) return 0;
      return refuse_relay(relay, "write");
    }
    if (count == 0) return refuse_relay(relay, "write");
    queue->length -= (size_t)count;
    memmove(queue->bytes, queue->bytes + count, queue->length);
  }
  if (queue->eof && queue->length == 0 && !queue->shut) {
    if (shutdown(descriptor, SHUT_WR) != 0) return refuse_relay(relay, "shutdown");
    queue->shut = true;
  }
  return 0;
}
static int forward_bytes(struct Relay *relay) {
  struct Queue to_upstream = {0}, to_client = {0}; size_t total = 0;
  while (!(to_upstream.shut && to_client.shut)) {
    struct pollfd channels[3] = {
      { .fd = relay->downstream, .events = (!to_upstream.eof && to_upstream.length < sizeof(to_upstream.bytes) ? POLLIN : 0) | (to_client.length > 0 ? POLLOUT : 0) },
      { .fd = relay->upstream, .events = (!to_client.eof && to_client.length < sizeof(to_client.bytes) ? POLLIN : 0) | (to_upstream.length > 0 ? POLLOUT : 0) }
    };
    if (poll_channels(relay, channels, 2) != 0) return -1;
    if ((channels[0].revents & (POLLIN | POLLHUP)) && !to_upstream.eof && to_upstream.length < sizeof(to_upstream.bytes) && read_queue(relay, relay->downstream, &to_upstream, &total) != 0) return -1;
    if ((channels[1].revents & (POLLIN | POLLHUP)) && !to_client.eof && to_client.length < sizeof(to_client.bytes) && read_queue(relay, relay->upstream, &to_client, &total) != 0) return -1;
    if (write_queue(relay, relay->upstream, &to_upstream) != 0 || write_queue(relay, relay->downstream, &to_client) != 0) return -1;
    if ((channels[0].revents | channels[1].revents) & (POLLERR | POLLNVAL)) return refuse_relay(relay, "channel");
  }
  return 0;
}
static void terminate_client(struct Relay *relay) {
  refuse_relay(relay, "cleanup");
  if (kill(relay->child, SIGKILL) != 0 && errno != ESRCH) return;
  /* The iteration cap remains finite even when the monotonic clock is unavailable.
   * A child stuck in an uninterruptible kernel operation can still outlive refusal. */
  for (unsigned attempt = 0; attempt < 500; attempt++) {
    int status;
    pid_t observed = waitpid(relay->child, &status, WNOHANG);
    if (observed == relay->child) { relay->child = -1; return; }
    if (observed < 0 && errno != EINTR) return;
    struct timespec pause = {.tv_nsec = 1000000};
    nanosleep(&pause, NULL);
  }
}
static int remaining_cleanup_ms(long long started) {
  long long now = read_clock();
  if (started < 0 || now < 0 || now - started >= 500) return -1;
  return (int)(500 - (now - started));
}
static void reap_client(struct Relay *relay) {
  if (relay->child <= 0) return;
  if (relay->failure != NULL && kill(relay->child, SIGKILL) != 0 && errno != ESRCH) refuse_relay(relay, "cleanup");
  long long started = read_clock();
  int status;
  while (true) {
    pid_t observed = waitpid(relay->child, &status, WNOHANG);
    if (observed == relay->child) {
      relay->child = -1;
      if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) refuse_relay(relay, "child-exit");
      return;
    }
    /* Proof: omitting the cleanup budget check leaves the EOF-complete child
     * observable after the watchdog in both "cleanup clock read 1/2 failure"
     * fixtures, with persistent clock failure injected only during cleanup. */
    if (remaining_cleanup_ms(started) < 0) { terminate_client(relay); return; }
    if (observed < 0) { terminate_client(relay); return; }
    struct timespec pause = {.tv_nsec = 1000000};
    nanosleep(&pause, NULL);
  }
}
static void remove_private(struct Relay *relay) {
  struct stat observed;
  if (relay->socket_owned) {
    /* Proof: omission deletes the foreign replacement and the consuming
     * "cleanup preserves a foreign replacement at its private socket path" fails. */
    if (fstatat(relay->directory_reference, "sock", &observed, AT_SYMLINK_NOFOLLOW) != 0 || observed.st_dev != relay->socket_identity.st_dev || observed.st_ino != relay->socket_identity.st_ino || !S_ISSOCK(observed.st_mode)) refuse_relay(relay, "cleanup");
    else if (unlinkat(relay->directory_reference, "sock", 0) != 0) refuse_relay(relay, "cleanup");
  }
  if (relay->directory[0] != '\0') {
    if (lstat(relay->directory, &observed) != 0 || observed.st_dev != relay->directory_identity.st_dev || observed.st_ino != relay->directory_identity.st_ino || !S_ISDIR(observed.st_mode)) refuse_relay(relay, "cleanup");
    else if (rmdir(relay->directory) != 0) refuse_relay(relay, "cleanup");
  }
  close_descriptor(relay, &relay->directory_reference);
}
int main(int count, char **arguments) {
  struct Relay relay = { .upstream = -1, .listener = -1, .downstream = -1, .peer = -1, .client_peer = -1, .child_reference = -1, .directory_reference = -1, .child = -1 };
  signal(SIGPIPE, SIG_IGN);
  long long started = read_clock();
  if (started < 0 || count != 8) return 64;
  relay.deadline = started + 1500;
  char *end; errno = 0; long expected = strtol(arguments[2], &end, 10);
  if (errno != 0 || *arguments[2] == '\0' || *end != '\0' || expected <= 1 || expected > INT_MAX) return 64;
  if (connect_upstream(&relay, arguments[1]) != 0 || capture_peer(&relay, relay.upstream, (pid_t)expected, &relay.peer, "upstream-peer") != 0 || create_listener(&relay, arguments[3]) != 0 || launch_client(&relay, arguments) != 0 || forward_bytes(&relay) != 0) goto cleanup;
cleanup:
  close_descriptor(&relay, &relay.downstream); close_descriptor(&relay, &relay.upstream); close_descriptor(&relay, &relay.listener);
  /* Proof: omission leaves the direct child observable after refusal;
   * "deadline terminates and reaps a stalled direct child" receives childAlive=true. */
  reap_client(&relay);
  close_descriptor(&relay, &relay.peer); close_descriptor(&relay, &relay.client_peer); close_descriptor(&relay, &relay.child_reference);
  remove_private(&relay);
  if (relay.failure != NULL) { fprintf(stderr, "relay:%s\n", relay.failure); return 1; }
  return 0;
}
