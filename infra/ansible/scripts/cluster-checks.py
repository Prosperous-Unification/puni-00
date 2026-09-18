"""Kubernetes safety predicates that fleet playbooks run on the Ansible controller.

The locked controller image has kubectl and Python but no jq, so retirement and upgrade checks
delegated to localhost live here. Each check reads live state through kubectl in the explicit
context and exits 0 when safe, 1 when refused, and 2 when kubectl fails or its output is
malformed. Refusal and malformed input both stop the play.
"""

import json
import subprocess
import sys


class Refused(Exception):
    pass


def kubectl(context, *arguments):
    completed = subprocess.run(
        ["kubectl", "--context", context, *arguments, "-o", "json"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if completed.returncode != 0:
        # Proof: returning no items here made the kubectl-failure case exit 0 instead of 2.
        raise RuntimeError(f"kubectl {' '.join(arguments)} failed: {completed.stderr.strip()}")
    return json.loads(completed.stdout)["items"]


def is_ready(resource):
    conditions = resource.get("status", {}).get("conditions") or []
    return sum(1 for c in conditions if c.get("type") == "Ready" and c.get("status") == "True") == 1


def node_pods(context, node):
    return kubectl(
        context, "get", "pods", "--all-namespaces", "--field-selector", f"spec.nodeName={node}"
    )


def floors(context, target, floors_json):
    nodes = kubectl(context, "get", "nodes")
    for capability, minimum in json.loads(floors_json).items():
        survivors = [
            node
            for node in nodes
            if node["metadata"]["name"] != target
            and is_ready(node)
            and node["metadata"].get("labels", {}).get(f"puni.dev/capability-{capability}")
            == "true"
        ]
        # Proof: disabling this refusal made the floor case in cluster-checks.test.ts exit 0.
        if len(survivors) < minimum:
            raise Refused(f"{capability} would keep {len(survivors)} Ready nodes; {minimum} required")


def workloads(context, node):
    for pod in node_pods(context, node):
        metadata = pod["metadata"]
        labels = metadata.get("labels", {})
        # Proof: treating owner-less pods as managed made the unmanaged-workload case exit 0.
        if (
            not metadata.get("ownerReferences")
            or metadata.get("annotations", {}).get("puni.dev/unmanaged") == "true"
            or any(
                labels.get(f"puni.dev/{label}") == "true"
                for label in ("local-state", "forge-worktree", "singleton-sqlite")
            )
            or any("hostPath" in volume for volume in pod["spec"].get("volumes") or [])
        ):
            raise Refused(f"{metadata['namespace']}/{metadata['name']} needs a maintenance transaction")


def local_volumes(context, node):
    claims = {
        (pod["metadata"]["namespace"], volume["persistentVolumeClaim"]["claimName"])
        for pod in node_pods(context, node)
        for volume in pod["spec"].get("volumes") or []
        if "persistentVolumeClaim" in volume
    }
    for volume in kubectl(context, "get", "persistentvolumes"):
        spec = volume["spec"]
        claim = spec.get("claimRef") or {}
        if (claim.get("namespace"), claim.get("name")) not in claims:
            continue
        terms = ((spec.get("nodeAffinity") or {}).get("required") or {}).get("nodeSelectorTerms") or []
        pinned = any(
            expression.get("key") == "kubernetes.io/hostname" and node in expression.get("values", [])
            for term in terms
            for expression in term.get("matchExpressions") or []
        )
        # Proof: disabling this refusal made the pinned-volume case exit 0.
        if "local" in spec or pinned:
            raise Refused(f"{volume['metadata']['name']} is local or pinned to {node}")


def detached(context, node):
    remaining = [
        pod
        for pod in node_pods(context, node)
        if not pod["metadata"].get("ownerReferences")
        or pod["metadata"]["ownerReferences"][0].get("kind") != "DaemonSet"
    ]
    if remaining:
        raise Refused(f"{len(remaining)} non-DaemonSet pods remain on {node}")
    unhealthy = [
        pod
        for pod in kubectl(context, "get", "pods", "--all-namespaces")
        if pod["status"].get("phase") in ("Pending", "Unknown")
        or (pod["status"].get("phase") == "Running" and not is_ready(pod))
    ]
    if unhealthy:
        raise Refused(f"{len(unhealthy)} workloads are not healthy elsewhere")
    attachments = kubectl(context, "get", "volumeattachments.storage.k8s.io")
    if any(attachment["spec"].get("nodeName") == node for attachment in attachments):
        raise Refused(f"volume attachments remain on {node}")


def pods_ready(context):
    for pod in kubectl(context, "get", "pods", "--all-namespaces"):
        phase = pod["status"].get("phase")
        if phase != "Succeeded" and (phase != "Running" or not is_ready(pod)):
            raise Refused(f"{pod['metadata']['namespace']}/{pod['metadata']['name']} is not Ready")


def attachments_healthy(context):
    for attachment in kubectl(context, "get", "volumeattachments.storage.k8s.io"):
        if (attachment.get("status") or {}).get("attached") is not True:
            raise Refused(f"{attachment['metadata']['name']} is not attached")


def etcd_map(context, target, voters_json):
    voters = json.loads(voters_json)
    nodes = kubectl(context, "get", "nodes")
    mapped = []
    for member in voters:
        if member["name"] == target:
            continue
        matches = [
            node
            for node in nodes
            if node["metadata"].get("annotations", {}).get("etcd.k3s.cattle.io/node-name")
            == member["name"]
        ]
        if len(matches) == 1:
            mapped.append(
                {
                    "memberId": member.get("ID"),
                    "memberName": member["name"],
                    "nodeName": matches[0]["metadata"]["name"],
                }
            )
    if (
        len(mapped) != len(voters) - 1
        or any(entry["memberId"] is None for entry in mapped)
        or any(len({entry[key] for entry in mapped}) != len(mapped) for key in ("memberId", "memberName", "nodeName"))
    ):
        raise Refused("ambiguous or incomplete etcd voter mapping")
    print(json.dumps(mapped))


def etcd_majority(voters_json, probes_json, minimum):
    voters = json.loads(voters_json)
    healthy = {
        probe["puni_surviving_etcd_node"]["memberId"]
        for probe in json.loads(probes_json)
        if probe.get("rc") == 0
    }
    if len(healthy) < int(minimum) or len(healthy) < len(voters) // 2 + 1:
        raise Refused(f"{len(healthy)} healthy surviving voters of {len(voters)}")


CHECKS = {
    "floors": floors,
    "workloads": workloads,
    "local-volumes": local_volumes,
    "detached": detached,
    "pods-ready": pods_ready,
    "attachments-healthy": attachments_healthy,
    "etcd-map": etcd_map,
    "etcd-majority": etcd_majority,
}

if __name__ == "__main__":
    try:
        CHECKS[sys.argv[1]](*sys.argv[2:])
    except Refused as refusal:
        print(f"refused: {refusal}", file=sys.stderr)
        sys.exit(1)
    except Exception as failure:  # noqa: BLE001 - any unexpected input or kubectl failure fails closed.
        print(f"cluster check failed: {failure!r}", file=sys.stderr)
        sys.exit(2)
