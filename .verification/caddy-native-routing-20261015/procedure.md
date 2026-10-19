# Root-only execution procedure

1. Review all files and `SHA256SUMS`; verify `base_remote_validate.py` is the
   byte-identical sealed reader. Check the manifest and operation ID against
   this candidate. The prior rawquote operation is consumed and must not be
   replayed.
2. Reconcile current source, Compose, image, PID1 command, selected consumer
   IDs and import scope with the fixed guards. Any drift is `STOPPED`; prepare
   a new candidate rather than weakening the pins. The remote reader repeats
   these guards before and after adaptation.
3. Under the current bounded four-source authorization, the release owner
   supplies an exact `execution-approval.json` matching `run_once.MODE`,
   `run_once.SCOPE`, operation ID and manifest digest, with `status` and
   `reviewStatus` both `APPROVED`, nonempty `runtimeApprovalReference`, and
   `sensitiveValueAccessExplicitlyApproved: true`. No connection or marker
   occurs before this exact local seal check. The approval file must remain
   local and is not an artifact in the manifest.
4. Execute once from this worktree:
   `python3 -B .verification/caddy-native-routing-20261015/run_once.py --operation-id 2045785c-2235-408a-abfe-8f0c58858198`.
   An exclusive `request-started.json` marker consumes the operation before
   transport. Do not rerun this ID after a transport or projection failure.
5. Inspect `execution-receipt.json` and `projection.json` through the finite
   validator. A `DIAGNOSED` result is only an original-policy diagnostic.
   `UNKNOWN`, absent redaction, or named logger bypass of the default filter
   blocks a coverage claim and application decision. Preserve this evidence
   with the integration handoff; execution remains serial under root.
