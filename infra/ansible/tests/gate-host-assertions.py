"""Controller-image evaluator for the gate_host role's Ansible-side checks (dash-host-jobs 6c).

Runs each named task of `roles/gate_host/tasks/*.yml` unchanged against localhost, with the
registered values it reads recorded through `set_fact` (or produced by fake commands first on
PATH), then once per fault with one condition removed, and requires the fault's bad input to get
through. Prints one line per case and exits 1 if any expectation fails. Run from the repository
root with the digest-locked controller (see tools/tool-fleet/src/check.ts), as root because
`ssh-keygen` refuses the image's uid 1000, which has no passwd entry (E11 to E13):

    docker run --rm --network none --read-only --tmpfs /tmp:exec --tmpfs /runner/.ansible \\
      --user 0:0 -v "$PWD/infra/ansible:/work/ansible:ro" --entrypoint python3 \\
      ghcr.io/prosperous-unification/fleet-controller:0.1.0 /work/ansible/tests/gate-host-assertions.py

Results and the fault table are in openspec/changes/dash-host-jobs/verify.md, Slice 6c.
"""

import copy
import json
import os
import re
import shutil
import subprocess
import sys

import yaml

ROLE = "/work/ansible/roles/gate_host/tasks"
WORK = "/tmp/gate-host-assertions"
TASKS = {name: yaml.safe_load(open(os.path.join(ROLE, name))) for name in
         ("main.yml", "host-pool.yml", "validate.yml")}

BASE = {
    "puni_gate_user": "root",
    "puni_gate_home": WORK + "/home",
    "puni_gate_pool_root": "/home/puni1/.local/share/dash/host-pool",
    "puni_gate_pool_config": "/home/puni1/.config/dash/host-pool.json",
    "puni_gate_pool_ledger": "/home/puni1/.local/share/dash/host-pool/.dash/resources.sqlite",
    "puni_gate_launcher_checkout": "/home/puni1/puni-00-gate-launcher",
    "puni_gate_dash_entrypoint": "/home/puni1/puni-00-gate-launcher/entrypoint.ts",
    "puni_gate_clone_bytes": 5368709120,
    "puni_gate_clone_floor_bytes": 10737418240,
    "puni_gate_checkouts": [WORK + "/home/tbf", WORK + "/home/tbf2", WORK + "/home/launcher"],
}
POOL = {"authorityId": "a", "epoch": "e", "providerId": "p", "mcpResource": "https://wbs.invalid/mcp",
        "credential": "c", "diskBudgetUnits": 16}


def task(file, name):
    found = [t for t in TASKS[file] if t.get("name") == name]
    if len(found) != 1:
        raise SystemExit(f"{file}: expected one task named {name!r}, found {len(found)}")
    return copy.deepcopy(found[0])


def stat(item, **fields):
    return {"item": item, "stat": {"exists": bool(fields), **fields}}


def run(tasks, variables, facts=None, fake=None, pre=None):
    """Run `tasks` on localhost; returns (rc, combined output)."""
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK + "/home")
    os.makedirs(WORK + "/bin")
    for name, body in (fake or {}).items():
        path = os.path.join(WORK, "bin", name)
        with open(path, "w") as handle:
            handle.write("#!/bin/sh\n" + body + "\n")
        os.chmod(path, 0o755)
    for path, body in (pre or {}).items():
        body, mode = body if isinstance(body, tuple) else (body, None)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as handle:
            handle.write(body)
        if mode is not None:
            os.chmod(path, mode)
    setup = [{"name": "Read the evaluating account", "ansible.builtin.getent":
              {"database": "passwd", "key": "root"}}]
    if facts:
        setup.append({"name": "Record the registered values", "ansible.builtin.set_fact": facts})
    play = [{"name": "evaluate", "hosts": "localhost", "connection": "local", "gather_facts": False,
             "vars": {**BASE, **variables}, "tasks": setup + tasks}]
    with open(WORK + "/play.yml", "w") as handle:
        yaml.safe_dump(play, handle, sort_keys=False)
    env = {"PATH": WORK + "/bin:/usr/local/bin:/usr/bin:/bin", "HOME": WORK + "/home",
           "ANSIBLE_LOCAL_TEMP": "/tmp/ansible-local", "ANSIBLE_REMOTE_TEMP": "/tmp/ansible-remote",
           "ANSIBLE_NOCOLOR": "1", "ANSIBLE_FORCE_COLOR": "0", "ANSIBLE_DEPRECATION_WARNINGS": "0"}
    completed = subprocess.run(["ansible-playbook", "-i", "localhost,", WORK + "/play.yml"],
                               env=env, capture_output=True, text=True, timeout=300, check=False)
    return completed.returncode, completed.stdout + completed.stderr


def drop_that(index):
    def mutate(tasks):
        for t in tasks:
            if "ansible.builtin.assert" in t:
                del t["ansible.builtin.assert"]["that"][index]
                if not t["ansible.builtin.assert"]["that"]:
                    t["ansible.builtin.assert"]["that"] = ["true"]
                return
        raise SystemExit("no assert to mutate")
    mutate.label = f"assert condition {index} removed"
    return mutate


def keep_disjunct(index, disjunct):
    def mutate(tasks):
        for t in tasks:
            if "ansible.builtin.assert" in t:
                that = t["ansible.builtin.assert"]["that"]
                that[index] = that[index].split(" or ")[disjunct]
                return
        raise SystemExit("no assert to mutate")
    mutate.label = f"assert condition {index} reduced to its disjunct {disjunct}"
    return mutate


def drop_condition(text):
    def mutate(tasks):
        for t in tasks:
            if "ansible.builtin.assert" in t:
                t["ansible.builtin.assert"]["that"].remove(text)
                return
        raise SystemExit("no assert to mutate")
    mutate.label = f"assert condition {text!r} removed"
    return mutate


def drop_key(key, task_name=None):
    def mutate(tasks):
        for t in tasks:
            if (task_name is None or t["name"] == task_name) and key in t:
                del t[key]
                return
        raise SystemExit(f"no {key} to drop")
    mutate.label = f"`{key}` removed" + (f" from {task_name!r}" if task_name else "")
    return mutate


# Each family: the exact tasks, cases (id, variables, recorded facts, fakes, expectation) and
# faults (mutation, the case whose bad input must then get through).
FAMILIES = []


def family(fid, tasks, cases, faults):
    FAMILIES.append((fid, tasks, cases, faults))


def refused(message):
    return ("refused", message)


ACCEPTED = ("accepted", None)
SKIPPED = ("skipped-task", None)

inputs = [task("host-pool.yml", "Require the host pool inputs of an enrolled host")]
REFUSAL = "An enrolled gate host needs puni_gate_host_pool"
family("E1 enrolled host pool inputs", inputs, [
    ("valid", {"puni_gate_host_pool_enroll": True, "puni_gate_host_pool": POOL}, None, None, ACCEPTED),
    ("unenrolled skips", {"puni_gate_host_pool_enroll": False}, None, None, SKIPPED),
    ("undefined", {"puni_gate_host_pool_enroll": True}, None, None, refused(REFUSAL)),
    ("not a mapping", {"puni_gate_host_pool_enroll": True, "puni_gate_host_pool": "x"}, None, None,
     refused(REFUSAL)),
    ("extra key", {"puni_gate_host_pool_enroll": True, "puni_gate_host_pool": {**POOL, "mode": "o"}},
     None, None, refused(REFUSAL)),
    ("http endpoint", {"puni_gate_host_pool_enroll": True,
                       "puni_gate_host_pool": {**POOL, "mcpResource": "http://wbs.invalid/mcp"}},
     None, None, refused(REFUSAL)),
    ("string budget", {"puni_gate_host_pool_enroll": True,
                       "puni_gate_host_pool": {**POOL, "diskBudgetUnits": "16"}}, None, None,
     refused(REFUSAL)),
    ("zero budget", {"puni_gate_host_pool_enroll": True,
                     "puni_gate_host_pool": {**POOL, "diskBudgetUnits": 0}}, None, None,
     refused(REFUSAL)),
], [(drop_that(0), "undefined"), (drop_that(1), "not a mapping"), (drop_that(2), "extra key"),
    (drop_that(3), "http endpoint"), (drop_that(4), "string budget"), (drop_that(5), "zero budget"),
    (drop_key("when"), "unenrolled skips")])

disk = [task("main.yml", "Measure free space for the gate checkouts still to clone"),
        task("main.yml", "Require free space for the gate checkouts still to clone")]
family("E2 free-space refusal wiring", disk, [
    ("room", {}, None, {"df": "printf '     Avail\\n26843545600\\n'"}, ACCEPTED),
    ("low", {}, None, {"df": "printf '     Avail\\n7516192768\\n'"},
     refused("Not cloning: clones=3 avail=7516192768 need=26843545600")),
], [(drop_that(0), "low"), (drop_key("failed_when", disk[0]["name"]), "low")])

paths = [task("validate.yml", "Require the pool root and the Dash user units")]
ROOT = stat("root", isdir=True, mode="0700", pw_name="root")
UNIT = stat("unit", isreg=True)
NONE = stat("absent")


def recorded(root=ROOT, units=(UNIT, UNIT, UNIT)):
    return {"puni_gate_pool_paths": {"results": [root, NONE, NONE, *units]}}


PATHS = "The pool root or a Dash user unit is missing"
family("E3 pool root and unit files", paths, [
    ("as written", {}, recorded(), None, ACCEPTED),
    ("root missing", {}, recorded(root=NONE), None, refused(PATHS)),
    ("root 0755", {}, recorded(root=stat("root", isdir=True, mode="0755", pw_name="root")), None,
     refused(PATHS)),
    ("root foreign", {}, recorded(root=stat("root", isdir=True, mode="0700", pw_name="nobody")), None,
     refused(PATHS)),
    ("watch unit missing", {}, recorded(units=(NONE, UNIT, UNIT)), None, refused(PATHS)),
    ("audit service missing", {}, recorded(units=(UNIT, NONE, UNIT)), None, refused(PATHS)),
    ("audit timer missing", {}, recorded(units=(UNIT, UNIT, NONE)), None, refused(PATHS)),
], [(drop_that(0), "root missing"), (drop_that(1), "root 0755"), (drop_that(2), "root foreign"),
    (drop_that(3), "watch unit missing"), (drop_that(4), "audit service missing"),
    (drop_that(5), "audit timer missing")])

unenrolled = [task("validate.yml", "Require no host pool state on a host that is not enrolled")]


def state(config, ledger):
    return {"puni_gate_pool_paths": {"results": [ROOT, stat("c", isreg=True) if config else NONE,
                                                 stat("l", isreg=True) if ledger else NONE,
                                                 UNIT, UNIT, UNIT]}}


STATE = "puni_gate_host_pool_enroll is false, but the configuration exists"
family("E4 no pool state on an unenrolled host", unenrolled, [
    ("clean", {"puni_gate_host_pool_enroll": False}, state(False, False), None, ACCEPTED),
    ("enrolled skips", {"puni_gate_host_pool_enroll": True}, state(True, True), None, SKIPPED),
    ("configuration left", {"puni_gate_host_pool_enroll": False}, state(True, False), None,
     refused(STATE)),
    ("ledger left", {"puni_gate_host_pool_enroll": False}, state(False, True), None, refused(STATE)),
], [(drop_that(0), "configuration left"), (drop_that(1), "ledger left"),
    (drop_key("when"), "enrolled skips")])

enabled = [task("validate.yml", "Read whether the Dash user units are enabled")]


def systemctl(states, rc):
    return {"systemctl": "printf '%s\\n' " + " ".join(states) + f"; exit {rc}"}


family("E5 user units enabled", enabled, [
    ("both enabled", {"puni_gate_host_pool_enroll": True}, None, systemctl(["enabled", "enabled"], 0),
     ACCEPTED),
    ("unenrolled skips", {"puni_gate_host_pool_enroll": False}, None,
     systemctl(["disabled", "disabled"], 1), SKIPPED),
    ("timer static", {"puni_gate_host_pool_enroll": True}, None, systemctl(["enabled", "static"], 0),
     refused("Read whether the Dash user units are enabled")),
], [(drop_key("failed_when"), "timer static"), (drop_key("when"), "unenrolled skips")])

dash = [task("validate.yml", "Name the Dash probes this host skips"),
        task("validate.yml", "Inspect the host pool and audit its envelopes")]
BUN = 'printf "%s\\n" "$*" >> ' + WORK + '/bun.log; case "$*" in *"job audit"*) exit "$(cat ' + \
    WORK + '/audit-rc)";; esac'
BASHRC = {WORK + "/home/.bashrc": "", WORK + "/home/launcher/.keep": ""}
LAUNCHER = {"puni_gate_launcher_checkout": WORK + "/home/launcher"}


def ledger(exists, audit_rc=0):
    pre = {**BASHRC, WORK + "/audit-rc": str(audit_rc)}
    return {"puni_gate_pool_paths": {"results": [ROOT, NONE, stat("l", isreg=True) if exists else NONE,
                                                 UNIT, UNIT, UNIT]}}, pre


SKIP = "Skipped `ops pool inspect` and `ops job audit`"
present, present_pre = ledger(True)
absent, absent_pre = ledger(False)
drift, drift_pre = ledger(True, 1)
family("E6 ledger-gated inspect, audit and skip line", dash, [
    ("initialized", LAUNCHER, present, {"bun": BUN}, ("ran", present_pre)),
    ("not initialized", LAUNCHER, absent, {"bun": BUN}, ("skipped", absent_pre)),
    ("drift", LAUNCHER, drift, {"bun": BUN}, ("refused-pre", drift_pre)),
], [(drop_key("when", dash[1]["name"]), "not initialized"),
    (drop_key("when", dash[0]["name"]), "initialized")])

pinned = [task("host-pool.yml", "Require the pinned fields to equal the live configuration's")]


def live(stdout, rc=0, stderr=""):
    return {"puni_gate_pool_live": {"results": [stat("l", isreg=True), stat("c", isreg=True)]},
            "puni_gate_pool_pinned": {"rc": rc, "stdout": stdout, "stderr": stderr}}


PINNED = "pinned field differs from the ledger; re-enrollment under a new root is required"
family("E7 pinned fields unchanged", pinned, [
    ("unchanged", {"puni_gate_host_pool_enroll": True}, live("[]"), None, ACCEPTED),
    ("memory moved", {"puni_gate_host_pool_enroll": True}, live('["memoryGib"]'), None,
     refused(PINNED)),
    ("unreadable live file", {"puni_gate_host_pool_enroll": True},
     live("", 2, "jq: error: Could not open host-pool.json"), None, refused(PINNED)),
], [(drop_that(0), "memory moved"), (drop_that(0), "unreadable live file")])


def probe(*lines):
    return {"puni_gate_sudo_probe": {"stdout_lines": list(lines)}}


SUDOER = probe("puni1 sudo docker", "sudo_rc=0")
GROUP_ONLY = probe("puni1 docker sudo", "sudo_rc=1")
GRANT_ONLY = probe("puni1 docker", "sudo_rc=0")
NO_SUDO = probe("puni1 docker", "sudo: a password is required", "sudo_rc=1")
STRICT = {"puni_gate_account_may_sudo": False}
EXCEPTED = {"puni_gate_account_may_sudo": True}

no_sudo = [task("validate.yml", "Require the gate account without sudo")]
family("E8 gate account without sudo", no_sudo, [
    ("no escalation", STRICT, NO_SUDO, None, ACCEPTED),
    ("sudo group", STRICT, GROUP_ONLY, None, refused("it must not escalate")),
    ("sudoers grant", STRICT, GRANT_ONLY, None, refused("it must not escalate")),
    ("exception skips", EXCEPTED, SUDOER, None, SKIPPED),
], [(drop_that(0), "sudo group"), (drop_that(1), "sudoers grant"),
    (drop_key("when"), "exception skips")])

exception = [task("validate.yml", "Require the sudo exception to still match the gate account")]
STALE = "the puni_gate_account_may_sudo exception is stale"
family("E9 sudo exception still matches", exception, [
    ("h2puni today", EXCEPTED, SUDOER, None, ACCEPTED),
    ("group only", EXCEPTED, GROUP_ONLY, None, ACCEPTED),
    ("grant only", EXCEPTED, GRANT_ONLY, None, ACCEPTED),
    ("stale", EXCEPTED, NO_SUDO, None, refused(STALE)),
    ("strict skips", STRICT, NO_SUDO, None, SKIPPED),
], [(drop_that(0), "stale"), (keep_disjunct(0, 1), "group only"),
    (keep_disjunct(0, 0), "grant only"), (drop_key("when"), "strict skips")])

gate_inputs = [task("main.yml", "Require supported host and gate inputs")]
LOCK = {"version": "1.4.4", "sha256": "0" * 64}
HOST = {"ansible_distribution": "Ubuntu", "ansible_distribution_version": "26.04",
        "ansible_architecture": "x86_64", "puni_gate_user": "puni1",
        "puni_gate_bun_version": "1.4.4", "puni_gate_bun_lock": LOCK, "puni_gate_node_lock": LOCK,
        "puni_gate_gh_lock": LOCK, "puni_gate_authorized_keys": ["ssh-ed25519 AAAA test"],
        "puni_gate_host_pool_enroll": False}
INPUTS = "A gate host needs Ubuntu on amd64"
family("E10 sudo exception is a boolean", gate_inputs, [
    ("boolean false", {**HOST, "puni_gate_account_may_sudo": False}, None, None, ACCEPTED),
    ("boolean true", {**HOST, "puni_gate_account_may_sudo": True}, None, None, ACCEPTED),
    ("string false", {**HOST, "puni_gate_account_may_sudo": "false"}, None, None, refused(INPUTS)),
], [(drop_condition("puni_gate_account_may_sudo is boolean"), "string false")])


# Throwaway keys made for this run, outside WORK, which every `run` clears.
KEYS_DIR = "/tmp/gate-host-keys"
shutil.rmtree(KEYS_DIR, ignore_errors=True)
os.makedirs(KEYS_DIR)


def public_key(comment):
    path = os.path.join(KEYS_DIR, comment.split("@")[0])
    subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", comment, "-f", path],
                   check=True)
    return open(path + ".pub").read().strip()


KEYS = [public_key(c) for c in ("laptop-a@example.invalid", "laptop-b@example.invalid",
                                "deploy@example.invalid")]


def imported(file, name):
    """The tasks an `import_tasks` task of `file` named `name` brings in, each carrying the
    import's vars: the play here is not in the role, so the import itself cannot resolve."""
    found = task(file, name)
    tasks = copy.deepcopy(yaml.safe_load(open(os.path.join(ROLE, found["ansible.builtin.import_tasks"]))))
    for t in tasks:
        t["vars"] = {**found.get("vars", {}), **t.get("vars", {})}
    return tasks


def install_keys(render):
    """main.yml's staging, staged count, install and removal, with `render` as the staging task."""
    return [render, *imported("main.yml", "Count the staged gate authorized keys"),
            task("main.yml", "Install the exact gate authorized keys"),
            task("main.yml", "Remove the staged gate authorized keys")]


def staged_template():
    """The role's staging task with an absolute template path: the play is not in the role."""
    t = task("main.yml", "Stage the exact gate authorized keys")
    t["ansible.builtin.template"]["src"] = ROLE + "/../templates/authorized_keys.j2"
    return t


# The form h2puni's apply 1 ran on 2026-11-04 (H2-A7), parsed from its YAML text and aimed at the
# staged path the role now writes first.
JOINED = yaml.safe_load(r"""
name: Stage the exact gate authorized keys
ansible.builtin.copy:
  dest: '{{ puni_gate_home }}/.ssh/authorized_keys.staged'
  content: |
    {{ puni_gate_authorized_keys | join('\n') }}
  mode: '0600'
""")
LIVE = WORK + "/home/.ssh/authorized_keys"
STAGED = LIVE + ".staged"
PREVIOUS = "ssh-ed25519 AAAAprevious previous@example.invalid\n"
SSH_DIR = {LIVE: PREVIOUS}
COUNTED = "keys, but puni_gate_authorized_keys lists"
INSTALL_TASK = "TASK [Install the exact gate authorized keys]"


def lines(keys):
    return "".join(key + "\n" for key in keys)


def install_before_count(tasks):
    """The placement before the review fix: the live file is written before anything counts it."""
    install = next(t for t in tasks if t["name"] == "Install the exact gate authorized keys")
    tasks.remove(install)
    tasks.insert(1, install)


install_before_count.label = "install moved before the staged count"
OPTIONS = ['from="192.0.2.0/24" ' + KEYS[0], *KEYS[1:]]
MALFORMED = [*KEYS[:2], "ssh-ed25519 AAAAnot-a-key x@y"]
family("E11 staged keys counted before they replace the live file", install_keys(staged_template()), [
    ("three keys", {"puni_gate_authorized_keys": KEYS}, None, None,
     ("installed", SSH_DIR, lines(KEYS))),
    ("one key", {"puni_gate_authorized_keys": KEYS[:1]}, None, None,
     ("installed", SSH_DIR, lines(KEYS[:1]))),
    ("key with options", {"puni_gate_authorized_keys": OPTIONS}, None, None,
     ("installed", SSH_DIR, lines(OPTIONS))),
    ("malformed key", {"puni_gate_authorized_keys": MALFORMED}, None, None,
     ("refused-kept", SSH_DIR, "holds 2 " + COUNTED + " 3")),
    ("rerun converges", {"puni_gate_authorized_keys": KEYS}, None, None,
     ("converged", {LIVE: (lines(KEYS), 0o600)}, lines(KEYS))),
], [(drop_that(0), "malformed key"),
    (drop_key("changed_when", "Stage the exact gate authorized keys"), "rerun converges"),
    (drop_key("changed_when", "Remove the staged gate authorized keys"), "rerun converges")])
family("E12 the joined block-scalar form is refused before the install", install_keys(JOINED), [
    ("three keys joined", {"puni_gate_authorized_keys": KEYS}, None, None,
     ("refused-kept", SSH_DIR, "holds 1 " + COUNTED + " 3")),
], [(drop_that(0), "three keys joined"), (install_before_count, "three keys joined")])
JOINED_FILE = "\\n".join(KEYS) + "\n"
family("E13 validate counts the live file", imported("validate.yml", "Count the live gate authorized keys"), [
    ("three keys", {"puni_gate_authorized_keys": KEYS}, None, None, ("accepted-pre", {LIVE: lines(KEYS)})),
    ("joined live file", {"puni_gate_authorized_keys": KEYS}, None, None,
     ("refused-pre", {LIVE: JOINED_FILE}, "holds 1 " + COUNTED + " 3")),
], [(drop_that(0), "joined live file")])


def recap(output, field):
    """One counter of localhost's PLAY RECAP line; None when the recap is missing."""
    found = re.search(r"^localhost\s*:.*\b" + field + r"=(\d+)", output, re.M)
    return int(found.group(1)) if found else None


def judge(expectation, rc, output):
    kind, detail = expectation[:2]
    log = WORK + "/bun.log"
    if kind == "accepted":
        return rc == 0 and recap(output, "skipped") == 0
    if kind == "skipped-task":
        return rc == 0 and recap(output, "skipped") == 1
    if kind == "refused":
        return rc != 0 and detail in output
    if kind == "ran":
        return rc == 0 and SKIP not in output and os.path.exists(log) and \
            open(log).read().split("\n")[:2] == [
                f"{BASE['puni_gate_dash_entrypoint']} ops pool inspect --config {BASE['puni_gate_pool_config']}",
                f"{BASE['puni_gate_dash_entrypoint']} ops job audit --config {BASE['puni_gate_pool_config']}"]
    if kind == "skipped":
        return rc == 0 and SKIP in output and not os.path.exists(log)
    if kind == "refused-pre":
        message = expectation[2] if len(expectation) > 2 else \
            "Inspect the host pool and audit its envelopes"
        return rc != 0 and message in output
    if kind == "accepted-pre":
        return rc == 0 and recap(output, "skipped") == 0
    if kind == "installed":
        return rc == 0 and open(LIVE).read() == expectation[2] and not os.path.exists(STAGED)
    if kind == "converged":
        return judge(("installed", None, expectation[2]), rc, output) and recap(output, "changed") == 0
    if kind == "refused-kept":
        return rc != 0 and expectation[2] in output and INSTALL_TASK not in output and \
            open(LIVE).read() == PREVIOUS
    raise SystemExit(kind)


def pre_of(expectation):
    kind, detail = expectation[:2]
    return detail if kind in ("ran", "skipped", "refused-pre", "accepted-pre", "installed",
                                "refused-kept", "converged") else None


failures = 0
for fid, tasks, cases, faults in FAMILIES:
    by_id = {case[0]: case for case in cases}
    for cid, variables, facts, fake, expectation in cases:
        rc, output = run(copy.deepcopy(tasks), variables, facts, fake, pre_of(expectation))
        ok = judge(expectation, rc, output)
        failures += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {fid}: {cid} (rc {rc})")
        if not ok:
            print(output[-1500:])
    for mutate, cid in faults:
        _, variables, facts, fake, expectation = by_id[cid]
        mutated = copy.deepcopy(tasks)
        mutate(mutated)
        rc, output = run(mutated, variables, facts, fake, pre_of(expectation))
        caught = judge(expectation, rc, output)
        failures += caught
        print(f"{'FAIL' if caught else 'ok  '} {fid}: fault ({mutate.label})"
              f" lets {cid!r} through (rc {rc})")
print(json.dumps({"failures": failures}))
sys.exit(1 if failures else 0)
