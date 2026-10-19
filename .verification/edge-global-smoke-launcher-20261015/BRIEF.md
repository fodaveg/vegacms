# Edge global smoke: metadata-only read launcher

This is a separate, unexecuted root candidate. The canonical server script was captured read-only at `/srv/edge/scripts/smoke.sh`; local source SHA-256 is `0362bbe1c4b022135cff039d52271b0ff1da473b7ae65117ed962556832b5873` (8059 bytes). `source-receipt.json` SHA-256 is `f12b5af6d8faa11252f42ae8390c286ad075acb7e0e7e45c00f5c3ba00dd5291`; it says only source was read, never executed. The wrapper checks both pins before SSH. The remote launcher reopens the exact regular nonsymlink source under `/srv/edge/scripts`, verifies SHA/size, makes one RAM-only replacement, and rechecks source identity and Caddy after the run. It never writes the script or a service file.

The **only** edit to the 8059 source bytes is:

```diff
-docker inspect edge-caddy >/dev/null 2>&1
+docker inspect --format '{{.Id}}' edge-caddy >/dev/null 2>&1
```

The original sequence occurs exactly once. The resulting 8078-byte script has SHA-256 `560240126078e0da021becfb90baef48554153db8ca1fc43d5562174027f0122`; replacing the new sequence with the old one recovers every original byte. The condition still tests whether `edge-caddy` can be inspected, but Docker formats only its ID instead of materializing its full JSON config. Output remains discarded. This is a **patched execution of the canonical source**, not a claim that the literal original SHA was executed. If the production contract requires literal byte execution, this launcher does not discharge that narrower requirement.

The active script has 16 public checks (`check_http`, `check_not_served`, `check_header`) and 3 `docker exec edge-caddy wget --quiet --spider` upstream checks. `check_redirect` is defined but unused. The launcher preserves all 19 calls and their order. A healthy pre/post Caddy guard requires the pinned ID `ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a`, image `sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`, and running state. Docker inspect in the guards uses a closed ID/image/running template. `bash -s` receives the patched script over stdin; stderr is discarded, stdout stays in RAM and must contain exactly 19 bounded `OK:` lines on success. The receipt projects only mode, status, source/target hashes, count, guard booleans and false write/private flags. A nonzero script exit after 0–18 checks reports `GLOBAL_SMOKE_CHECK_FAILED` with one failed statement; it cannot identify which check without exposing raw output. Timeouts, source/Caddy drift, unknown output and transport failure remain STOP.

The script makes public HTTPS GET/header requests and three HTTP `wget --spider` checks from the existing Caddy container. It has no service restart, configuration write, Docker create/attach, grant, private env/config/log read or deployment command. This is a read-only **prebaseline** smoke, not proof of the post-cutover state. After the network operation, repeat the reviewed global smoke before the Vega-specific smoke, using fresh evidence. A green result does not substitute the dedicated network topology/resolver guards or Caddy configuration preflight.

Release owner, after reviewing this exact candidate and verifying an unused output name:

```sh
cd "$HOME/code/vegacms/.verification/worktrees/network-durable-20261009/.verification/edge-global-smoke-launcher-20261015"
shasum -a 256 -c SHA256SUMS
python3 -B run_global_smoke.py --execute --out global-prebaseline-20261015.json
```

Do not rerun on transient uncertainty without inspecting the closed receipt; the wrapper refuses an existing output. The remote smoke may take up to 400 seconds (the wrapper allows 430), so retain the original process handle until its terminal exit. Expected positive result: exit 0, `GLOBAL_SMOKE_PASS`, `checksPassed: 19`, `failedCheckCount: 0`, all four source/Caddy guard booleans true. A failure is exit 2 and must not be called PASS.

Local-only verification: `python3 -B selftest.py` 6/6 PASS; patched bytes pass `bash -n`; three Python files pass AST parse. Tests include exact reversible single edit, 19 active calls, drift rejection, early synchronous guard throw before any Bash invocation, late Caddy drift, closed PASS/failure/STOP receipts and private-field rejection. No SSH, Docker, public HTTP or remote shell ran in this candidate's preparation. `SHA256SUMS` seals candidate sources, brief and test log; the root-captured source remains separately pinned by its SHA and source receipt.
