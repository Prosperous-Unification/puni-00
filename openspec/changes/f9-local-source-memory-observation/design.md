## Shape

`observeSourceMemory(first, runtime, roots?)` accepts the expected first Pod observation and explicit local runtime selection. The absolute crictl path is resolved once; every command uses that resolved executable, explicit empty config, explicit Unix endpoint, timeout and JSON output with one full ID. No shell, discovery, Docker or SSH path exists. The selected executable/runtime remain operator assertions rather than authenticated cluster authority.

A shared monotonic deadline covers both inspections and one `observeProcesses` sample. Child stdout and stderr share a 64KiB cap; children are killed on overflow/deadline, and failures expose fixed diagnostic text only. Required local files use no-follow/nonblocking bounded reads. A process identity consists of init PID/starttime, final NSpid 1, and one exact cgroup-v2 membership. The mapped directory must remain within the selected cgroup root and retain device/inode. Inspect again, then reread process and directory after sampling. Validate through `validateSourceMemory` only after every recheck.

## Runtime contract evidence

Existing recovery code uses crictl `status.labels` and `info.pid`. The versioned primary sources confirm the contract: [containerd v2.0.4 ContainerStatus](https://github.com/containerd/containerd/blob/v2.0.4/internal/cri/server/container_status.go) emits status ID/metadata/state/labels and verbose info PID; [cri-tools v1.32.0 inspect](https://github.com/kubernetes-sigs/cri-tools/blob/v1.32.0/cmd/crictl/container.go) requests verbose status and supports explicit JSON output. These are supported response contracts, not a claim about an installed runtime version. Unexpected shapes fail closed.

## Limits

Sampling and reinspection are sequential and cannot exclude changes that occur and revert entirely between reads. Local selected roots must correspond to the selected runtime's process namespace. No remote hard deadline or kernel uninterruptible-IO termination is implied. Evidence does not authenticate its operator or establish historical ownership, first-attempt success, OOM cause or F9 acceptance.
