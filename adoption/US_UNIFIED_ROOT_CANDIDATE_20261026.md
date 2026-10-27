# US Stock Check — one daily app / root five-tab migration candidate

Date: 2026-10-26 JST
Status: IMPLEMENTATION CANDIDATE / UNPUBLISHED / REGULAR_ROOT_UNCHANGED
Tracking: Private us-stock-check Issue #39
Migration target after future acceptance: https://nakayama2536-happy.github.io/us-stock-check-web/

## User outcome

The user should not need to decide between the 4-tab daily PWA and a second fixed-data 5-tab preview. Daily use should eventually have **one root URL, one header, and five tabs**: 判断 / 銘柄 / 市場 / 品質 / 管理. The yellow delivery/testing banner belongs only to isolated preview scope and must not be transferred into the normal app. The blue header should be compact. Price references and source alerts remain visible; management and schedule details move to 管理.

The user asked to *proceed with unification*. This authorizes an implementation and verification candidate, not an untested deployment of the existing root app or a new formal Trade Action Engine. Production promotion, retired cache cleanup, existing home-screen PWA migration, and live OHLCV delivery remain independent gates.

## Verified source identities

- Public/main at implementation start: b3a1ad74254f4b234736b2f1fafb448dc29599c5 (PR #47 isolated mobile successor deployed); existing normal root v0.9.8 / 4-tab app remains published.
- Private/main reference: e69494fa7b594268c45a02b60c29e228e8c9ffea, Shadow/no automatic promotion. Saved readiness as of 2026-10-26T16:57:30+09:00, market date 2026-10-23, READY_FOR_REVIEW, promotion_automatic=false. This does not approve Production.
- Common latest reference main: 754c1068215bf5ec64ef4f66b6b9b118324102f9. US UI plan's separate original adopted design anchor: 351a49ec9f792d49916593721d7e30fe16ac5722. Latest Common main is read for context only, not automatically adopted.
- Existing connected/fixed preview: saved US trade date 2026-10-16, generated 2026-10-18T16:19:34+09:00, scope /preview/connected/. Keep the preview as historical QA evidence, never blend its prices/250-bar history into the daily root app.
- Root normal Public JSON feeds are docs/data/status.json, market.json, common_snapshot.json, history.json. Their existing Core/export/publish workflow is NOT modified. This candidate reads the same root JSON endpoints as the existing daily PWA.

## What is implemented in the PR branch

- docs/index.html: five primary navigation areas, existing top-state/as-of date always visible, first digest re-ordered before longer Common-detail disclosure, single root header; refresh/recheck and diagnostic model validation go to 管理.
- docs/unified-ui.js: deterministic read-only five-ticker short summary, independent of the fixed connected preview shell. Only a validated 5/5 stock payload with exact expected identities, market date/price alignment, and SHADOW state can render. Malformed/mixed Common state, non-null formal action or wrong dates fail closed. Missing optional Common keeps reference display but surfaces persistent warning.
- docs/app.js: invokes validator before updating screen; reuses original decisionState, stock details, market 28-day charts, QC and diagnostic logic. A ticker row switches to matching existing stock card. Reads usstock.activeTab without deletion, adds manage to allowed values and preserves legacy four tab IDs.
- docs/style.css: mobile-first font and touch targets, clear colored warning, five-ticker glance and five-tab bottom nav with safe area.
- docs/sw.js: **candidate-only** scope-preserving root SW improvement. Precache new unified-ui.js; normalize the exact 13-digit epoch-millisecond `t` cache nonce only for four named existing public JSON endpoints (the root's current `Date.now()` request format), retaining any ticker/period/semantic parameters; keep existing root cache name and original non-US cache isolation. Without this, initial 4→5 online upgrade passed but closed-tab offline restart failed.
- tests/sw-cache.test.cjs: 4 extra positive/negative tests for safe bounded nonce canonicalization and preserving every unrelated query/cache path.
- tests/browser_unified_migration.py: separate same-context Chromium test for original 4-tab root→candidate 5-tab root→old 4-tab rollback, storage sentinel and offline closed-tab reload.
- Deterministic and browser-only tests with documented negative fixtures. PR-only contents:read CI; never deploy from the feature branch.

## Explicitly NOT implemented

1. No operational promotion. **Root SW is now altered on this unmerged feature branch only**, to safely support offline replay of existing published JSON after the root 4-tab→5-tab migration. Cache namespace, manifest, personal records, unrelated PWA data and public market files remain unchanged. This does not constitute a deployed root migration, a full iOS acceptance, or an automatic permission to merge.
2. No publication of the new candidate to Pages, no second everyday user-facing URL, and no 2026-10-16 fixed preview data presented as live 2026-10-23 data.
3. No daily 250-bar OHLCV continuation in root: existing root public history.json is a different schema, and verified 5-tab same-run OHLCV is still in separate Private validated artifacts. A Private-to-Public 250-bar release feed would require separate allowlist, producer/consumer provenance, independent QC, natural-market runs and adoption.
4. No added market acquisition, provider tolerances, trading thresholds, buy signals, user accounts/positions, personal records, formal BUY/ADD/HOLD/WAIT/REDUCE/SELL mapping or extra schedule. Display cannot become formal action.

## Required gates before root cutover

- Current PR head: root contract/data/stock integrity tests and Chromium 5-tab UI/baseline/negative update tests successful; Public Safety and PR Validation successful. Keep candidate Draft. Do not infer iPhone readiness from Chromium.
- Verify the branch-specific root SW/nonce fix under PR CI; require exact old4→new5→old4 offline/browser rollback with personal/localStorage and other-PWA cache sentinel preservation. Root cache name remains the previous stable value to avoid unreviewed destructive migration; prove no static file mismatch, no stale mislabeling or unbounded nonce cache growth. Restore only UI/SW changes via normal PR, no force/reset. Then require actual iPhone migration acceptance separately.
- User's iPhone acceptance for changes that affect it: five-tab navigation, matching stock selection, first-view warnings, portrait/landscape, original home-screen update. Reuse earlier isolated fixed device offline/online evidence but do not pretend it proves NEW root SW transition.
- A specific normal-root cutover decision after the above proof. Operational Production, formal engine and frozen preview retirement separate.

## Common contract

COM-STATE-001, COM-SNAP-001/002, COM-QC-001/002, COM-DEC-001/002, COM-TIME-001, COM-UI-001/002/003, COM-DATE-001, COM-OPS-001, COM-CACHE-002, COM-GIT-001, COM-INT-001, COM-MIG-001 and related US session/QC rules. Use saved market timestamps as evidence, not UI-time inferred market closure. Historical/forecast ranges and OHLCV bar count do not infer formal actions.

Why needed: two separate daily-looking apps, confusing display and stale archive data. Why current is insufficient: root four tabs and large maintenance header, connected five tabs rely on frozen archive. Why minimum safe: re-layout plus read-only view on unchanged public daily data, with separate cutover and rollback review.
