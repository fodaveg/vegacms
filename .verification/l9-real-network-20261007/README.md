# L9 real network measurements

Completed locally:81 BEFORE +81 original AFTER +18 corrected rail windows. Browser/PB proxy request counts and decoded body bytes match in all180 admin windows. Three repetitions of first + subsequent SPA visits. Nine visual repetitions (three combinations ×three). Full product gate: corrected treeff9985f7, private commitd6df761, receipt linked in receipt.json. No production publication.

| Screen operation (first phase, repetition1) | Requests before → after | Decoded body bytes before → after |
| --- | ---: | ---: |
| relation-50-titles | 53 → 4 | 739306 → 732871 |
| global-search-projection | 3 → 3 | 329986 → 497 |
| save-preimage-and-snapshot | 7 → 5 | 932905 → 203404 |
| rail-open-outside-first-page | 3 → 4 | 664031 → 664279 |
| rail-save-title | 7 → 5 | 670775 → 6810 |
| rail-save-during-real-list-response | 18 → 13 | 1995570 → 667337 |
| list-reorder | 5 → 5 | 923671 → 923671 |
| list-delete | 7 → 7 | 730618 → 730618 |
| list-import-two | 4 → 4 | 594067 → 594067 |
| trash-empty-201 | 205 → 205 | 13231877 → 5288 |
| editors-load | 7 → 4 | 18801 → 11669 |
| editors-change-password | 7 → 1 | 17946 → 188 |
| editors-save-mail-settings-no-send | 5 → 3 | 13497 → 7130 |

All27 operation/phase windows ×three repetitions remain in admin-before.json/admin-after.json. First-phase examples include manifest configuration reads; warm-phase counts are separately retained. Relations resolve50titles using50GET→1LIST; total screen53→4. Save pre-image GET2→1, preserving awaited snapshot (not background). Lists keep equal request counts but preserve table DOM (beforefalse→aftertrue). Trash clears all201records with equal205calls and response bytes13,231,877→5,288; proxy observed overlap1→4, not a claim about physical/browser network peaks.

Original AFTER805 showed3 first-phase rail errors each_key_duplicate despite PB30uniqueIDs; correctedFF replay has6/6 races with Latest+peer preserved, selection1,30uniqueIDs and0pageerrors. Other screen source code is unchanged by the final rail correction. Original failure results remain unmodified.

| Visual combination (all three repetitions identical on these outcomes) | Renewal browser PB / site | Document requests | Marker | Scroll | Reload after original expiry |
| --- | ---: | ---: | --- | --- | ---: |
| Historical admin + current Astro (BA) | 1 /13 | 1 | lost | 200→0 | 200 |
| Corrected admin + historical Astro (AB) | 1 /1 | 0 | retained | 200→200 | 404 |
| Corrected admin + current Astro (AA) | 1 /1 | 0 | retained | 200→200 | 200 |

Visual server renewal rawcount4 =3 application requests (1POST token +2SSR GET records) +1OPTIONS preflight; all three combinations have the same PB application count and68,463 decoded bytes. BA site13 =document200 +12cached304 asset requests (zero body bytes); AA site1 is the refresh GET, both27,254 HTML bytes for the current site. The improvement here is fewer browser requests and preserved document/scroll, not fewer PB reads. frameNavigationEvents includes history.replaceState; documentRequests measures actual document resources.

visual-comparison.json derives application/preflight counts for initial/renewal/reload while preserving raw files. Visual pageerrors were not separately collected: no zero-JS-error claim. GET saved preview only; no POST reload or production SSR adapter claim. ASTRO dev assets and cached304 behavior are stated explicitly.

Fixture: normal pages60/relations50; reorder10records on one page without defaultSort as required by the real UI. Every seeded large body remains64KiB. No app/bridge product source was modified for measurement. Historical build performed once; both accredited current builds reused.

Harness source tree5ddf7ae6cf2e0eb5cbbc7533a1d82a8ebd633a48; ten reviewed source files, targeted ESLint/Prettier/node-check clean. Go fixture compiled with existing Go1.26.3; it was not run with -race. Go1.27JSONv2, ancestor-tsconfig isolation, omitted httptestCORS, smooth-scroll observation and global-networkidle harness failures are preserved with terminal handles in receipt.json.

Runtime is closed and global runner released. Two uniquely identified abandoned crash fixture databases removed (1,110,826 logical bytes); df140GiB before/after cleanup. Worktrees, exact Astro archives/dependencies, historical build, Go fixture binary and durable evidence retained for authorized replay/integration.

Private harness commit: `1798e95242c805d4d3f0ed5ec14b1c5b6eec7233`; verified tree `5ddf7ae6cf2e0eb5cbbc7533a1d82a8ebd633a48`. Commit terminal exit0; ten reviewed files. The remaining untracked `.network-measure/` contains only retained replay artifacts and is not part of the commit.
