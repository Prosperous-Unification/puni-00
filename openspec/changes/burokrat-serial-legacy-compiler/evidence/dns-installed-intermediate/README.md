# DNS-only installed baseline

This packet preserves the single base survey from installed source
`7d445c48d471a90e885e3d06069d466b8cb8ac13`. Its before/after identities agree.
The selected base is `3e8d0742154e90a606b23d305dd6e424bb9c7d06`, with the
unchanged external survey policy bound by `bindings.json.txt`.

The [report](full-base.stdout.txt) contains fourteen selected rules and 34
findings. Ten rules remain explicitly unevaluated: seven compiler-dependent
rules refuse `nodemailer/lib/smtp-connection`, while binary classification,
Performance authority and scenario-overlay refusals remain. The result is
`allowed:false`, `certifies:false`; this is neither compiler acceptance nor a
candidate/fault comparison.

The [resource receipt](full-base.receipt.json.txt) records exit 1, 19.918 seconds,
2612180 KiB sampled peak and no stop under the 4 GiB/900-second guard. Installation
streams are retained separately. All original bytes are copied unchanged and
bound by [manifest.json.txt](manifest.json.txt); [raw-streams.json.txt](raw-streams.json.txt)
also preserves stdout/stderr as lossless UTF-8. These observations belong only to
this intermediate artifact, not to a later mail-capable successor.
