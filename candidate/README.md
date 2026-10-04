# US UI S1 — isolated candidate

Parent: Private us-stock-check Issue #39. UI: s1.0.1.0. Core remains 0.9.8.

## Why three

1. Needed: daily reference analysis should be visible before maintenance details.
2. Gap: current four-tab UI conflates the unimplemented formal engine with real data incidents, and can leave a saved display looking current after a refresh failure.
3. Minimum safe change: build and test a five-tab presentation candidate without modifying production docs/, Core, public JSON, schedules, calculations, market color semantics, or personal records.

## What is implemented

- 判断 / 銘柄 / 市場 / 品質 / 管理; legacy tab IDs and preference key are retained.
- Larger confirmation summary and five expected securities, not a shrinking received-data denominator.
- Separate acquisition, source crosscheck, date/identity consistency, and formal-engine limitation.
- Missing/duplicate/foreign/date-mismatched data, stale saved PASS, HOLD, reload failure and offline warnings.
- Selected security details use original panel functions. Market groups are US / semiconductors / Bitcoin.
- Existing valid short-/medium-term and RSI labels are unchanged; missing axes are not imputed as neutral or WAIT.
- Original raw public data is copied byte-for-byte. No original file is changed by the builder.

## Reproduction

From a fresh checkout:

```sh
node --test tests/experience.test.cjs tests/sw-cache.test.cjs
python scripts/build_ui_candidate.py
python -m pip install playwright==1.57.0
python tests/browser_candidate.py
python -m http.server 8000 --directory build/us-ui-s1
```

The browser test requires installed Chromium or Google Chrome; CHROME_PATH may specify its executable.
The builder refuses unknown legacy app/index/style revisions and existing output directories.
Do not bypass a pin mismatch. Review the changed source and update the patch and tests deliberately.

## Gate and non-goals

This is a candidate artifact, not a Pages deployment. It intentionally does not register a Service Worker or expose an installable PWA manifest. Existing Cache contract tests are still run on the unmodified production worker. A real release must separately validate candidate assets with the production cache boundary and old-worker migration.

Common UI contract v1.0 section 13 requires checking Japan implementation/device results before US adoption. iPhone/Safari/PWA acceptance is NOT verified here. Keep the PR draft until the remaining adoption/publication gate is reviewed. Do not weaken this gate or mark DEVICE_PASS because Chromium tests passed.

No ChatGPT summary copy, FULL export, review-history, new prediction, formal action, or automated order is introduced in S1. Those remain independent later phases. The existing five-market-day evidence is neither reset nor enlarged by UI tests.

## Evidence interpretation

- State tests use explicit deterministic fixtures.
- Browser layout/error-path tests use fixtures, then also render the saved public JSON for panel compatibility.
- Screenshots show an unpublished candidate and its saved input, not proof of current quotes or a real iPhone.
- BUILD_PROVENANCE.json records source revision, original blobs and byte-preservation checks.
- CI success / artifact / publication / device acceptance / formal adoption are separate states.
