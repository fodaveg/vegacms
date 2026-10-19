# CORS-only stock and Lumbre cutover — candidate, 8 Oct 2026

**Root/release owner only.** The Vega apply has already selected the candidate
Compose and a new container; the current-ID table and full sequence below
record the original preimage and must not be replayed. Run only the targeted
public `after` smoke with a fresh output name against the root's existing Vega
baseline. Run one service at a time.
Fod is excluded: its approved `--origins` source change lives in a new image
candidate, and the currently served `f92` image still has the old PB argv.
This protocol leaves the shared `edge` network, Caddy, all image selectors,
PB data, private `.env` values, and unrelated containers untouched.

## Exact input and expected delta

| Service | Current Compose SHA-256 | Candidate SHA-256 | Current container ID | Current image ID | Browser origin |
| --- | --- | --- | --- | --- | --- |
| `vega-pb` | `bae812ef0031b5e6aeb65f4678905e65d74cfadf62a5e78fe156250166377f7e` | `11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde` | `5f8fed3402b9be46851f6909ad0bb59b4d21ca27be1e385711e6c0985c6aaef7` | `sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4` | `https://admin.vegacms.com` |
| `lumbre-admin-pb` | `7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd` | `56caa1a1273feaa3c56b34db7724177c448190d1c28d723d53a5b62fbe110ae9` | `6241f7d6b8d1a2dda326770a318a1d3b94d84b032cc5df050527f9631e75f7d6` | `sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7` | `https://admin.lumbre.pro` |

The exact deltas are in `../patches/vega-compose.patch` and
`../patches/lumbre-admin-compose.patch`; the preimage/target manifest is
`../cors-patch-manifest.json`. Vega's remote preimage was reconstructed from
the previously exported old Compose and the exact `STOCK_CMD` used by the
successful image-only cutover; its digest equals the current selective remote
projection. No remote Compose body was exported. Lumbre's current source
preimage equals the remote SHA and is committed with this change in
`4439b3a6c64bc33a7e309493af10e7ede5282159`.

## Pinned tools and phases

`remote_apply.py` implements `check`, `apply`, and guarded `rollback` for only
these two names. `run_once.py` reads and verifies its exact source bytes plus
the already-reviewed image-only helper
`../../image-only-delivery-20261008/remote_cutover.py` (SHA-256
`5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128`),
then sends both to server RAM. SSH stdout/stderr stay in local RAM; only a
closed JSON receipt goes to a new local output file mode 0600. It never reads
Docker `Config.Env`, private Caddy values, logs, or health output.

The root's sequence for each service is:

1. Capture a fresh local public `served_cors_smoke.py --stage baseline` receipt
   for that service. This uses the already-reviewed `served_smoke.py` (SHA-256
   `04be908ba8eae67ce42db644ad98efc9ef1c3aa2d46b5e1921e9e5d6f88e7e23`)
   for root/deep/health/panel/missing paths and the known SPA manifest.
2. Run `run_once.py --mode check`. It requires the exact current Compose,
   container/image IDs, full PB argv, mount/edge/port topology, healthy
   runtime, cached image and backup utility, and a bounded data-snapshot
   budget. The `.env` contents remain on the server; only its hash/mode are
   compared there. `READY_FOR_REVIEW` is read-only.
3. Run `run_once.py --mode apply` only on that same candidate. It writes a
   private 0700 backup directory and 0600 copies of Compose and `.env` before
   stopping. After stopping it checks no other volume writer exists, snapshots
   the quiesced PB volume with a pinned backup image, validates the tar and
   byte-compares a restored isolated TEST clone. It checks identities again,
   validates the candidate Compose with the original project directory, then
   atomically replaces only the Compose bytes after a full file/parent identity
   check. It persists the installed Compose identity before any create call,
   then uses `docker compose create --force-recreate --no-build --pull never`
   for the one selected service. The stopped container's new ID, image,
   command, Compose labels, mounts, network, ports and sole volume selection
   are checked and recorded before `docker start <new-ID>`. Postcheck requires the sole
   expected PB argv including `--origins`, health, mount, edge aliases and
   unpublished port unchanged. Only `CORS_APPLIED_AWAITING_PUBLIC_SMOKE`
   permits moving to the next phase. The backup ID in its receipt is needed
   for recovery and must be retained privately.
4. Run `served_cors_smoke.py --stage after` with the fresh baseline. It compares
   peer signatures, target path behavior and all 153 exact Vega assets with
   MIME. Its pinned HTTP opener refuses redirects before a second request,
   including calls through the reused smoke helper. Stock Vega has no native
   discovery route: `/api/vega/discovery` must return the exact sealed SPA
   `index.html` bytes as `text/html`, recorded as `LEGACY_SPA_FALLBACK`. Lumbre
   must return a real JSON object, recorded as `JSON`. Both require the own
   origin on discovery GET/OPTIONS and GET/POST/PATCH/DELETE preflights with
   `authorization,content-type`. The normal PB
   `/api/collections/_superusers/records` must deny unauthenticated GET with
   401/403 JSON while preserving the same CORS policy and preflights. A foreign
   origin and `null` may have no permissive ACAO; a request without Origin must
   still reach PB. An unexpected discovery shape/policy records `UNKNOWN` and
   fails the smoke.
   `CORS_PUBLIC_OK` is the external acceptance signal for that service. The
   known `index.html` manifest entry may count as a canonical root alias only
   when it is the sole failed asset, `/index.html` returns 301/308 to the same
   host's `/` without following it, and the separately observed root bytes
   match the sealed index hash. The receipt records `canonicalIndexAlias`.
5. On an external failure, `run_once.py --mode rollback --backup-id <receipt ID>`
   only accepts this invocation's target Compose bytes, recorded new container
   ID (or the recorded stopped old ID when create has not run), unchanged image
   selector/ID, mounts and `.env` identity. It restores the original Compose
   under a fresh ownership check and recreates the service without build or
   pull, recording the stopped replacement ID before starting it. Then run
   `served_cors_smoke.py --stage rollback` against the same baseline. If any
   guard sees drift, stop for the operator; do not recreate another writer's
   container or restore data automatically. Preserve the tar and private
   backups for inspection.

The first Vega sequence, to be run from `/Users/david/code/vegacms` by root
**only after review**, is:

```sh
python3 -B .verification/cors-network-adoption-20261008/apply/served_cors_smoke.py \
  --stage baseline --service vega-pb \
  --script-sha256 43d537d35b6dff7435908abfd65b2999067c5d5edae5238bfffb670ff3e177d4 \
  --out .verification/cors-network-adoption-20261008/apply/vega-baseline-20261008.json
python3 -B .verification/cors-network-adoption-20261008/apply/run_once.py \
  --execute --mode check --service vega-pb \
  --script-sha256 079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682 \
  --out .verification/cors-network-adoption-20261008/apply/vega-check-20261008.json
python3 -B .verification/cors-network-adoption-20261008/apply/run_once.py \
  --execute --mode apply --service vega-pb \
  --script-sha256 079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682 \
  --out .verification/cors-network-adoption-20261008/apply/vega-apply-20261008.json
python3 -B .verification/cors-network-adoption-20261008/apply/served_cors_smoke.py \
  --stage after --service vega-pb \
  --baseline .verification/cors-network-adoption-20261008/apply/vega-baseline-20261008.json \
  --script-sha256 43d537d35b6dff7435908abfd65b2999067c5d5edae5238bfffb670ff3e177d4 \
  --out .verification/cors-network-adoption-20261008/apply/vega-after-20261008.json
```

For Lumbre, substitute `lumbre-admin-pb` and the `lumbre-*` output names in
that sequence, after Vega's terminal result and public smoke. For a rollback,
root supplies the `backupId` from that service's apply receipt to
`run_once.py --mode rollback --backup-id`; then uses
`served_cors_smoke.py --stage rollback` with that service's baseline and a new
output name.

The remote source SHA is `079f3cfa28378d551b29893ef4e47d71b6417eb8cd3c0f32ea3133d2fcc21682`,
the wrapper SHA is `1cbbefd6a620c328419ac31ed8a9bb90acdd0818b4cc8e820093e73f99d111f6`,
and the served smoke SHA is `43d537d35b6dff7435908abfd65b2999067c5d5edae5238bfffb670ff3e177d4`.
The offline checks in `selftest.py` (SHA-256
`ac24693e0798450765396ee49dc126622d13867d266de0f9f6f195113315a998`)
passed 16/16 methods, including four apply-flow drift phases and unhealthy
owned-ID rollback. A unique local Compose probe against the cached Vega image
confirmed `create` exits 0 and leaves an inspectable stopped container with
one mount, one network, ports, project/service labels and the selected command;
`down --volumes` exited 0. This did not exercise the remote runtime.
All three scripts and their commands are **candidates pending independent
review**. Use a new output file for each phase.
`run_once.py` already pins the helper digest internally. A nonzero exit or
`STOP_*` is not evidence of a completed cutover. A successful CORS phase does
not certify network isolation, browser-local overrides, authenticated UI
behavior, or the Fod image.
