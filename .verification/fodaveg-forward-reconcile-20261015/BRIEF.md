# Fodaveg forward cutover: local effective-state receipt

This candidate is **local-only**. It does not change the failed forward operation, its remote journal, or frozen source. The original execution stopped with `STOP_NEEDS_OPERATOR / HEALTH / NewRuntimeUnhealthy` and transport exit 2. Its own backup and record are `fodaveg-20261015T020337Z-50583` and `fodaveg-reprobe-20261015T020337Z-50583`. The clone probe was complete (71 files, 875285637 bytes, no primary or cleanup failures). The subsequent read-only diagnostic observed the selected NEW container `c25a7858f2692b395925d5b7f8d80512378dccbaa58ec55e432d8c5f186b73e6` healthy, with the owned CORS argv, expected processes, target Compose and env identity, expected image/mount/network/aliases, one selected volume user, and a stable snapshot. The journal remained `CREATED`. The later public receipt passed all 155 assets and its closed CORS/peer checks.

`aggregate.py` accepts only the exact SHA-256-pinned execution, diagnostic, public, and historical baseline receipts. It rejects a different operation/backup/new ID, an unhealthy or unowned runtime, incomplete public checks, and input drift. The output `receipt.json` has status `PASS` **for the effective observed runtime and public behavior only**; it explicitly retains the original STOP and `CREATED` journal. The source receipt hashes are embedded and displayed in the aggregate. The standalone aggregate SHA-256 is in `SHA256SUMS` and is the `receiptSha` for a reviewed network dependency tuple.

For the network durable reviewed dependencies, Fodaveg's tuple is:

```json
{"status":"PASS","containerId":"c25a7858f2692b395925d5b7f8d80512378dccbaa58ec55e432d8c5f186b73e6","imageId":"sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e","composeSha":"eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b","receiptSha":"ac3334c07a2f95db384a8422987a79d109539cbc9f904fc6f3a015b9cd7e80c1"}
```

The network consumer's `remote_dependencies.guard()` rechecks the runtime ID, image, running state and Compose SHA before guarded operations. It does not read the Fodaveg journal phase. No remote reconciliation is needed for this consumer; a remote state edit would introduce an extra production write without improving the dependency guard.

Local verification from this directory:

```sh
python3 -B selftest.py
python3 -B aggregate.py --evidence-dir /Users/david/code/vegacms/.verification/cors-network-adoption-20261008/fodaveg-delivery --out receipt.json --check
shasum -a 256 -c SHA256SUMS
```

Six directed tests pass, including negative original-success rewrite, foreign ID/backup, health/ownership/public failures and evidence hash drift. No SSH, Docker, deploy, grant or heavy suite ran. The public smoke compares against the historical 2026-10-09 baseline; no fresh immediately-pre-cutover public baseline exists. The read-only diagnostic is a point-in-time snapshot and cannot prove the state remained unchanged until the public smoke; the network guard will recheck its tuple before acting.

The exact cause of the original `NewRuntimeUnhealthy` is unresolved. `remote_cutover_forward.py` swallowed every `RuntimeError` for 60 seconds in the post-start health loop and then emitted only that generic failure. The diagnostic calls `runtime()` without the old-runtime raw baseline, so it proves canonical/current health but not that the failing baseline comparison later passed. A slow startup and an after-start raw baseline difference remain plausible; the pre-start runtime check had passed. The original `baselineFields` are all null because the generic failure bypassed `RuntimePeerDrift` comparison collection. This uncertainty does not change the independently observed effective state or its fresh guard requirement.
