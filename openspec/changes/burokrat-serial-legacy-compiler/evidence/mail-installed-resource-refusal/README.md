# Mail-capable installed baseline resource refusal

Source `72a7e82d2e8ccf4546cb6fee0c49742d0b42fd06` was installed in
`/tmp/wbs100-mail-consumer-20261020`. The retained
[artifact record](committed-artifact.json.txt) binds archive SHA-256
`0db4b51fb0efd5a6623709e738472dab94106359ce89bde69a1ed0add996464b`,
executable SHA-256
`bb91e9a0644f11045bf9a585d55e4d049f0512212d6c29e461cdc523fad21046`
and toolkit identity
`a20180f6343959d85142f461f9b4aa6505957a9ea38dda12782c60a68c3b8f7f`.
The before/after snapshots are byte-identical.

The [full baseline receipt](full-base.receipt.json.txt) records the exact committed
base, unchanged policy and invocation without a rule filter. The guard terminated
the process at 52.479 seconds after sampled process-tree RSS reached 4208352 KiB,
above its 4194304 KiB ceiling. Exit code is -9 and stop reason is `rss_limit`.
Both output streams are empty: no JSON report, rule outcomes or finding counts
exist for this attempt. No candidate/fault comparison or acceptance is claimed.

[The manifest](manifest.json.txt) records exact source bytes and hashes.
[Raw UTF-8 streams](raw-streams.json.txt) retain all four install/survey streams,
including the two empty survey streams. Guard, capture and comparator scripts
are retained as text; they were not rerun while constructing this packet.
This observation is separate from the earlier initial and DNS-only packets.
