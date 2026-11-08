## Why

The trusted workload image list changes during release. An existing terminal, deleting backup Pod can retain an older digest. Applying that new list to metadata-only controller finalizer cleanup can deny ordinary garbage collection and Job completion, leaving the release drain fenced. An isolated actual API probe confirmed this mechanism; the image of the original CI survivor remains unknown.

## What Changes

Permit only an ordinary Pod UPDATE that strictly reduces finalizers by removing Kubernetes Job-tracking and/or orphan keys from an already terminal, deleting Pod, without changing its spec, labels, annotations or owner references. Apply this exception only to image membership; retain all namespace, parameter-format, security and other validations. Reject CREATE, live/nonterminal/nondeleting updates, foreign-key removals, additions and subresources.

The synthetic graceful-drain backup Job runs a replacement command without S3. Validate and remove exactly the unused local S3 CA mount and secret volume together with its unused environment, preserving every PVC, runtime mount, ownership reference, grace setting and drain assertion.

## Non-goals

No image-list broadening, release-order changes, budget extensions, forced finalizer removal, altered Orphan/UID/Lease/fencing rules or claim that the original failure has been fully attributed. No actual workload execution is needed for admission proof.
