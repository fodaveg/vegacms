# Lumbre CORS: candidato instrumentado, 9 oct 2026

**Root/release owner only; this candidate has not run remotely.** Do not
replay `remote_apply.py` (`079f…`) after its opaque `STOP_NEEDS_OPERATOR`.
The first attempt used backup
`lumbre-admin-pb-20261008T223304Z-3566962`; root recovered the same old
container and Compose BASE with guarded rollback, then public rollback
passed 153/153. The recovered-base probe
`lumbre-base-probe-20261009.json` found runtime without baseline PASS,
candidate exact, Compose config/model/dry-run create PASS, five raw mount and
alias order samples unchanged. None proves the historical failure point.

`remote_apply_lumbre_controlled.py` is a copy of the reviewed CORS apply
source with **only** Lumbre selected at entry. The product candidate and
checks are unchanged: Compose BASE
`7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd`
→ TARGET `56caa1a1273feaa3c56b34db7724177c448190d1c28d723d53a5b62fbe110ae9`,
old container `6241f7d6b8d1a2dda326770a318a1d3b94d84b032cc5df050527f9631e75f7d6`,
image `sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7`.
It records a finite checkpoint in its own private backup before each
post-install operation, classifies an exception by an allowlist, keeps only
Docker create's numeric exit code, and on `RuntimePeerDrift` projects six
boolean raw/canonical comparisons from the pre-stop runtime held **in RAM**.
It exports no mount source, argv, `.env` value, Docker output or raw error.
The baseline runtime is deliberately **not** persisted to disk.

On failure while status is `INSTALLED`, with no new container ID recorded,
it invokes the existing guarded `rollback` for that same backup. Rollback
requires its own TARGET Compose identity, unchanged `.env` hash/metadata,
image, selected **old** ID, stopped runtime and sole volume ownership before
restoring BASE and starting that ID. A create that replaced the old container
or any foreign drift produces `STOP_NEEDS_OPERATOR`; no container is adopted
from labels/timestamps and no PB data is restored. Even
`STOP_OLD_RUNTIME_RESTORED` has exit 2 and requires the public rollback smoke.

After Fod's independent phase settles, root must capture a **new** Lumbre
public baseline, run this candidate's `check` against the current BASE/ID,
and apply only if that receipt, the fresh public baseline and source review
are green. Use distinct new output filenames; no old receipt is an execution
grant. Pinned helper:
`5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128`.

```sh
python3 -B .verification/cors-network-adoption-20261008/apply/run_lumbre_controlled.py \
  --execute --mode check --service lumbre-admin-pb \
  --script-sha256 4416eb5b9b23c23cf596d028e1f0ecc8ce983b43b29d6af7625b16c1b9ae5926 \
  --out .verification/cors-network-adoption-20261008/apply/lumbre-controlled-check-20261009.json
python3 -B .verification/cors-network-adoption-20261008/apply/run_lumbre_controlled.py \
  --execute --mode apply --service lumbre-admin-pb \
  --script-sha256 4416eb5b9b23c23cf596d028e1f0ecc8ce983b43b29d6af7625b16c1b9ae5926 \
  --out .verification/cors-network-adoption-20261008/apply/lumbre-controlled-apply-20261009.json
```

If apply succeeds, root runs the independently reviewed public CORS `after`
smoke with the new baseline, checking Lumbre discovery JSON, normal PB API,
153 assets and peers. On failure, retain backup ID and checkpoint receipt;
if status says restored, verify with public `rollback` smoke. If status says
operator, stop and read only the selected owned phase before recovery.

Local verification: `python3 -B selftest_lumbre_controlled.py` passed 4 test
methods (including eight full-flow stopped-old or foreign-file outcomes),
plus `AST2/2`. These tests mock Docker and never access production. The
public and remote candidate remain pending independent review and root's
fresh runtime gates.
