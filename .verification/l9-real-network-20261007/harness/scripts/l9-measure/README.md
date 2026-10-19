# Local L9 network measurement

This is an opt-in measurement harness, not product code or the standard memory-backed e2e suite.
It serves an explicitly supplied static admin build and uses an isolated real PocketBase instance.
The browser logs and a transparent PB proxy count requests independently. No request/response body,
Authorization header, raw query, preview URL or token is written to evidence. Byte counts are
**decoded response bodies**, not compressed bytes on the wire. Seed/setup traffic goes directly
to the isolated PB instance outside the measurement proxy.

Only run with the coordinator's global runtime slot and Node22.22.3. No install/download is needed.
The admin before worktree is `/private/tmp/vegacms-l9-before-20261007` at
`dae1c8c1e90db2567efe3ea0ecaf5ce5f09ac193`. Package manifest and lockfile match the harness base;
dependencies are reused with APFS clones. The after build must come with its gate receipt/tree.

First discriminate the infrastructure, **before building the historical candidate**:

```sh
L9_BUILD_ROOT=/absolute/verified/build L9_CANDIDATE=after L9_CANDIDATE_TREE=verified-tree \
  ./node_modules/.bin/playwright test --config scripts/l9-measure/playwright.config.ts --grep smoke
```

The smoke logs in through the real UI as a normal PB editor, opens the seeded form, matches browser
and PB proxy events, and checks a controlled actual PB404 before any normal event in that window.
It does not use `e2e/fixtures.ts`, inject a memory port, return fake HTTP content or build the app.
The local static file server serves the existing build with a normal SPA fallback (200 index.html).

Then run the seven admin surfaces, three first/repeat visits each by default (not a claim of three cold-cache browser runs):

```sh
L9_BUILD_ROOT=/absolute/verified/build L9_CANDIDATE=after L9_CANDIDATE_TREE=verified-tree \
  L9_REPORT=/absolute/evidence/admin-after.json \
  ./node_modules/.bin/playwright test --config scripts/l9-measure/playwright.config.ts --grep 'seven admin'
```

`L9_REPEATS=1` is for an initial discriminating run only, not the repeated final measurement.
`L9_SURFACES=rail` scopes a replay to the affected rail without re-running unrelated surfaces.
Observed page errors remain explicit in the report; successful collection of counts does not
assert product correctness. List reorder uses ten 64-KiB records on one page without defaultSort,
as required by the real UI. The other surfaces retain sixty pages and fifty relation records.
The collector writes incremental JSON, then final metadata on teardown. Collection fields are
synthetic, both snapshots and all destructive operations are confined to the ephemeral fixture.
No SMTP messages are sent. The mail action configures a loopback endpoint only.

Visual requires one cached compilation of the actual Go extension's opt-in fixture:

```sh
(cd extensions/vegapreview && PATH="$HOME/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.3.darwin-arm64/bin:$PATH" GOTOOLCHAIN=local GOPROXY=off go test -c -o ../../.network-measure/l9-pb-server)
L9_BUILD_ROOT=/absolute/verified/build L9_CANDIDATE=after L9_CANDIDATE_TREE=verified-tree \
  L9_GO_SERVER_BINARY=/absolute/measurement/.network-measure/l9-pb-server \
  L9_ASTRO_ROOT=/private/tmp/vega-l9-sites-20261007/after \
  L9_ASTRO_CANDIDATE=4469e482c69571b54605c31e29360b82dbff0f75 \
  L9_REPORT=/absolute/evidence/visual-after.json \
  ./node_modules/.bin/playwright test --config scripts/l9-measure/playwright.config.ts --grep 'visual renewal'
```

Astro archives are exact `git archive` exports of1ff64d74a60ed5ed6ebf714eba0adc950c474e47 and
4469e482c69571b54605c31e29360b82dbff0f75. The harness temporarily copies the existing editor-mode
GET recipe into src/pages in those **private archives**, never in a source checkout or frozen
Astroshare candidate. It runs the actual Astro dev renderer, VegaPage and bridge; no fake renderer,
new adapter or dependency. It uses the real Go-issued30-second token and real wall clock. Initial
load, renewal and a reload after original expiry have separate counters. The test reports GET
behavior only; it makes no POST token/session reload claim and no production adapter certification.

The archives live outside the Vega worktree under `/private/tmp/vega-l9-sites-20261007/{before,after}`
so Astro's dependency resolution cannot inherit Vega's generated Svelte tsconfig. Go1.27.1 was
observed exiting2 through repeated PocketBase Collection.UnmarshalJSON/JSONv2 frames during schema
creation; existing Go1.26.3 successfully seeds the same fixture. Failures and the partial receipt
are preserved under the repository's `.verification/l9-real-network-20261007`.

Comparison matrix: admin before+Astro after vs admin after+Astro after isolates the parent renewal;
admin after+Astro before vs admin after+Astro after isolates iframe history renewal. The newer Astro
share candidate is not involved. The Go readiness file is mode0600, removed at teardown; credentials
are sent to Astro only via stdin. All own processes are closed; preserve logs/results and source
until the coordinator has reviewed and copied evidence to the canonical location.
