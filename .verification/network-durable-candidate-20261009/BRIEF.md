# Dedicated Vega network: new operational candidate

Status: DRAFT / NOT EXECUTED. Candidate base b00186ce5587fcc7323aefdd9d3cdcbfea281750; branch codex/network-durable-20261009. Only the release owner may execute remote phases. This candidate preserves the frozen A/B sources, their wrappers and prior receipts.

## Files and scope

- `remote_edge_durable.py`: new publish/check/rollback-source operations consuming the backup of frozen A. Publication builds a temporary index from the exact old HEAD, changes only compose.yml, makes a commit with that parent, locks the actual index before validation, preserves all other staged entries, CAS-updates HEAD, and installs the index. Fresh source bytes/inode/uid/gid/mode/timestamps, parent/new HEAD/blobs, unique diff-tree path, selected Caddy ID/image/source labels and owned network are required. Git plumbing executes no hooks and requests no signing; the consulted durability contract does not mandate either. It never pushes or recreates Caddy.
- `remote_dependencies.py`: closed input schema and selected ID/image/Compose guards. All three CORS instances and the current final Caddy preflight must have PASS receipts. Fodaveg's future container ID is intentionally unknown. During the stock cutover its own reviewed guards own Vega, while Lumbre/Fod remain pinned.
- `remote_stock_durable.py`: loads frozen B unchanged and replaces only its edge guard with the new exact publication/state/receipt/network guard. The frozen snapshot, quiesced TEST restore, UID/volume/image/argv/alias/health/no-published-port checks and controlled stop/create/start/rollback remain in effect.
- `run_candidate.py`: root-only closed SSH transport, sealed helper/module manifest, sealed reviewed dependency input and strict output schema. It must be reviewed as part of the candidate. Its mandatory `--execute` is not authorization; only root executes within the current authorization.
- `selftest.py`: offline negative tests, real isolated Git fixtures and bootstrap rejection. No SSH, Docker, dotenv or production build is executed by tests.

## Source/model/runtime proof and future recreate effects

The raw byte patch remains exactly the previously pinned network-only delta. Both complete Compose models are parsed only in server RAM with `--no-interpolate --no-env-resolution --no-path-resolution`; both validate with `--quiet`. Include/extends directives are rejected before invoking the parser. `/dev/null` is the only env-file selector and implicit dotenv loading is disabled. The complete candidate model, after removing the added external network and Caddy membership, must equal the old complete model. Other service definitions, Caddy image reference, argv, volumes, ports, environment references, restart policy and config references remain unchanged by that source delta.

The current runtime keeps its selected Caddy ID/image and both expected memberships. A RAM-only hash of allowed non-environment fields (image/argv/user/working directory/mounts/port bindings/restart policy/start time/restart count and exact Compose source labels) must remain unchanged during publication and all later stock guards. The source selected by the actual container is the exact versioned Compose now committed. The selected Compose also undergoes final native quiet validation.

This proves the scoped durable network effect and preservation of the current non-network runtime. It does not claim equality of unresolved environment values or of every future recreated runtime field. No Caddy recreate is performed as an experiment. A future recreate applies the second bridge; Docker's default gateway choice can differ because the pinned Compose uses a network list without gateway priority, although frozen A's current attach uses `--gw-priority=-1` to keep edge as the existing default gateway. Both networks are external bridge networks; vega-edge is explicitly non-internal. The second bridge/gateway effect must be considered by the root reviewer before A/publication; this candidate does not add a new Compose gateway field or silently change the pinned byte delta. Future recreation also requires the existing config/mount/env sources and image reference to remain valid. The source delta preserves those references, without claiming a read or validation of their private values.

## Order and dependency inputs

1. Root finishes and certifies the three current CORS PASS receipts and the final current Caddy preflight. Root fills a copy of `dependencies.draft.json` using those exact tuples and receipt hashes, reviews that file, sets state REVIEWED, hashes it, and retains the dependency receipts. Draft/PENDING inputs are rejected. The runner verifies the entire reviewed input SHA; root's review certifies the associated receipt hashes. No receipt is invented or automatically promoted to PASS.
2. Review this candidate and the recreated gateway implications. Execute frozen A only if separately cleared. Its real returned backup ID is the only selector for publication. A still stops at CADDY_ATTACHED_PARTIAL.
3. Run new `durable-publish` with the reviewed no-source dependency file. It returns the actual new HEAD, parent, network ID and pinned Compose SHA. No guessed future HEAD is accepted.
4. Root builds/reviews/seals a new dependency input including that exact publication receipt (`source` adds backupId/head/parent/composeSha/networkId/receiptSha). Run `durable-check` and `stock-check`. Root serializes operations to preserve current pins.
5. Run new `stock-apply`. Its success remains AWAITING_PUBLIC_SMOKE. Root verifies resolver/health from Caddy, Vega membership only in vega-edge, and the public smoke for every existing edge consumer. These are required remaining runtime checks, not evidence produced by local selftests.

Invocation shape, after filling actual values (no command here was executed):

```sh
python3 -B run_candidate.py --execute --action durable-publish --backup-id ACTUAL_A_BACKUP --manifest-sha256 REVIEWED_MANIFEST_SHA --dependencies dependencies.reviewed.json --dependencies-sha256 REVIEWED_DEPENDENCIES_SHA --out publication.json
python3 -B run_candidate.py --execute --action durable-check --backup-id ACTUAL_A_BACKUP --manifest-sha256 REVIEWED_MANIFEST_SHA --dependencies dependencies.published.reviewed.json --dependencies-sha256 REVIEWED_PUBLISHED_DEPENDENCIES_SHA --out source-check.json
python3 -B run_candidate.py --execute --action stock-check --backup-id ACTUAL_A_BACKUP --manifest-sha256 REVIEWED_MANIFEST_SHA --dependencies dependencies.published.reviewed.json --dependencies-sha256 REVIEWED_PUBLISHED_DEPENDENCIES_SHA --out stock-check.json
python3 -B run_candidate.py --execute --action stock-apply --backup-id ACTUAL_A_BACKUP --manifest-sha256 REVIEWED_MANIFEST_SHA --dependencies dependencies.published.reviewed.json --dependencies-sha256 REVIEWED_PUBLISHED_DEPENDENCIES_SHA --out stock-apply.json
```

The mandatory source seal is the full `seals.json` SHA. Output and dependency files must be directly in this candidate directory and output must not exist. No raw remote stderr is exported.

## Rollback and interrupted phases

After stock apply, rollback Vega through new `stock-rollback` with both actual backup IDs and the published dependency file. It keeps Caddy's durable source and necessary live networks intact; root then repeats the required public smoke. Never replay frozen B with the new committed HEAD, and never replay frozen A rollback after publication.

The stock guard recognizes a completed recovery only for the selected rollback backup in `ROLLBACK_CREATED` or `ROLLED_BACK`, with its recorded replacement ID, unchanged restored Compose source and the frozen healthy runtime guard proving PocketBase is on `edge`. At that point `vega-edge` must contain Caddy alone. During apply and before this recovery proof, a running replacement still has to be present on `vega-edge`. This closes the previously reviewed failure where the new ID on `edge` made the post-start gate reject a healthy rollback before recording `ROLLED_BACK`.

The separate `durable-rollback-source` is an explicit source-only inverse commit, permitted only while the owned network contains Caddy alone, therefore before PB joins or after PB rollback. It refuses any source/index/HEAD/non-network runtime drift or unexpected member. It appends an exact one-path inverse commit and restores only the unchanged installed leaf via reviewed CAS. It retains Caddy's live network memberships and the bridge. This is not a complete network rollback: root must separately review any later detach/remove/reconcile action. No reset, broad checkout, remove-volume or blind restore exists here.

An ambiguous command/timeout or crash can leave DURABLE_COMMIT_PENDING, a commit published before index installation, or DURABLE_SOURCE_ROLLBACK_PENDING. The persisted state includes the planned exact commit; STOP requires a fresh root reconciliation. The script does not retry or overwrite foreign state to obtain a false success. This is deliberate finite recovery evidence, not a promised automatic transaction across Git and Docker.

## Verification evidence

Final offline suite: 13 tests PASS; frozen stock adapter suite: 5 tests PASS. The Git fixture demonstrates isolated unique-path commit-tree, preservation of another staged file, atomic index publication and rejection of non-Git index drift before HEAD publication. The actual frozen `cors_apply.rollback` path is exercised from both `CREATED` and `AWAITING_PUBLIC_SMOKE` through source restoration, simulated replacement creation on `edge`, simulated healthy start, `ROLLED_BACK` and a receipt accepted by `run_candidate.valid`. A controlled return to the old inference leaves `ROLLBACK_CREATED` and returns `STOP_NETWORK_ROLLBACK_NEEDS_OPERATOR`. Negatives include a foreign recorded recovery ID, missing running PB on the owned network during apply, foreign network members, restored source and durable receipt drift, plus wrong HEAD/parent/path/index/blob, cross-service model changes, include/extends before parser, missing PASS/draft dependencies, consumer tuple drift, source rollback drift, strict transport receipts and sealed-source drift. Bootstrap runs only an invalid-mode rejection locally and makes no Docker/SSH call.

No production runtime, Compose binary support, actual Compose model, remote Git state, actual ownership, Caddy resolver or consumer smoke is certified by these local tests. The current final dependency receipts, review and all remote operations remain root work. No product gate/full suite/build was required for these operational artifacts. Source and test SHA256 sums accompany the final logs.
