# Network durable rollback handoff: paused / DRAFT

Stopped on the user's explicit budget/closure instruction, relayed by root. The rollback fix is not implemented. This resumed turn performed bounded local reads only before this handoff; no new candidate version, source edits, tests, gate, SSH, build or commit.

Preserved reviewed candidate: .verification/network-durable-candidate-20261009 in this worktree. Existing candidate and all seals remain unchanged; execution remains HOLD. Canonical review: /Users/david/code/vegacms/.verification/release-adoption-plan-20261008/network-durable-candidate-fresh-review.md, SHA256 40670e0eed0c06be388598dfb7dd4d27c95ab14416fdb97b3fd788ac1b217f75.

Confirmed remaining fix: remote_stock_durable.edge_guard infers dedicated-network membership from ID != original plus running. Frozen cors_apply.rollback creates a healthy replacement on edge with a new ID; its final gate_files then wrongly requires vega-edge membership and fails before persisting ROLLED_BACK.

Proposed next implementation, not applied: create a separate v2 candidate, preserve this HOLD antecedent, and wrap the frozen rollback invocation with explicit owned-backup context. At default membership guards, recognize only persisted ROLLBACK_CREATED/ROLLED_BACK records whose rollbackContainerId matches the selected ID, source/identity/env selectors match the restored base, and the actual restored runtime satisfies the frozen after=False topology/health/volume guards. Explicit after=True calls remain strict during apply and rollback before retirement. Clear invocation context in finally. No frozen A/B changes.

Required regression after resumption: execute the actual frozen rollback flow offline with mocked Docker boundaries and owned temporary files through source restore, replacement new ID on edge, healthy start, persisted ROLLED_BACK and accepted closed receipt. Negatives: foreign recovery ID, dedicated running PB absent during apply, unexpected bridge member, peer/source/receipt drift. Then reseal the new version and return it for review. No tests were added or run in this paused turn.

Root retains execution/integration/deploy ownership. Actual CORS/Caddy dependency receipts and future publication outputs remain required. Root says the newly authorized Fod cutover did not start before this pause; no future ID is filled here.

No new process, cache or regenerable artifact was created in this resumed fix turn. Preserve the existing worktree, candidate and evidence.
