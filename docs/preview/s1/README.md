# US UI verification preview

Purpose: let the user review the five-tab candidate on iPhone without replacing the regular app.
Preview entry: `preview/s1/index.html` relative to the existing Pages site.

Why three: a tested ZIP is not a usable iPhone review route; full adoption is still device-gated; therefore expose only an isolated, static UI preview and retain the production entry point and worker byte-for-byte.

- UI source: Draft PR #22 head `3705fddcf2217bdbc8b0376e6aeb0045612c7a03` plus the judgment-only `jp-cards.1` rendering facade described below.
- Input: already-public snapshot from commit `a4f593059a3847f8edc57d180bdc7dabb6a81a69`, trade date 2026-10-02, generated 2026-10-04 17:36:25 JST.
- Reference panels preserve existing prices and analysis. These are frozen UI input, not current quotes.
- Every preview source is pinned to its Git blob hash; loading fails on mismatch. This is not adoption of the FULL deep-dive contract.
- Inner page runs in `sandbox=allow-scripts` WITHOUT same-origin privilege. No storage, cache, worker, or parent-page access. CSP blocks network in the inner page.
- The outer loader fetches only thirteen allowlisted files from this preview directory. The existing production worker may serve/cache this outer document normally; the preview neither replaces nor unregisters that worker.
- Fixed-data redisplay never fetches market data or runs GitHub workflows.
- Preview does not install a PWA, change normal-app preferences, or place orders.
- A UI-review URL is not runtime adoption, Production promotion, or iPhone DEVICE_PASS.
- Japan reference-device gate and US PWA migration acceptance remain independent. PR #22 remains draft.
- Parent tracking: private us-stock-check Issue #39. Formal operation review stays in Issue #25.

## 2026-10-04 — judgment cards closer to the supplied Japan screenshot

The user asked to bring the judgment screen closer to the Japan app. `judgment-cards.js` and `.css` change only the judgment presentation and its detail links; the original candidate, model, thresholds, root app, frozen JSON, and worker are preserved.

- Company display name at left, large USD price at right, ticker below the name.
- Large outlined **short-term state** at left; per-security saved close-comparison evidence at right.
- Three light-background tiles: short-term, medium/long-term, RSI14. Thick arrows express existing states, not business-day forecasts. Existing red-up / blue-down market colors are retained.
- The Japan WAIT/HOLD/BUY labels and 1/3/5/14-day forecasts are not imported or invented.
- `照合一致` requires bound date/identity, acceptable quality state, both named sources and zero stored close differences. Aggregate PASS alone is insufficient. Unknown evidence stays unknown.
- Footer links open the existing security details or expand technical evidence and monitoring levels. No unimplemented AI export is advertised.
- Human-readable Japanese names are display aliases; the ticker and original source name remain accessible.
- New state and browser tests cover render-only invariance, missing evidence, zero/null, source differences, source/date conflicts, HOLD warnings, narrow screens, links, sandbox isolation and real-app settings preservation.

UI preview publication remains separate from regular PWA adoption. The user's reference screenshot is not stored in this public repository.

## 2026-10-04 — periods, security charts and GPT consultation (jp-cards.2)

- Periods show the current Core calculation windows, not future prediction horizons: MACD 12/26/9 sessions plus close/MA50/MA200 for short state; MA50/MA200 for medium/long state. Verified against Private technical.py at b4df5e5810a619b6c9be22d7c595b86f9ce4b5d2.
- Separate `data/chart-history.json` contains already-public saved closes from this repository history through e4b0ba505a4eb8d260e76ca9bd1beec5156862d6. Rebuild with `python scripts/build-preview-history.py` on a full clone. Existing three fixed JSON files are byte unchanged. PLTR/LLY/BSY/SOXL: 10 observations, 2026-09-21 through 2026-10-02; MSTR: 6, 2026-09-25 through 2026-10-02. Latest published PASS snapshot per date wins. This is not full adjusted daily OHLCV or technical recomputation history. Chart dots do not interpolate missing dates.
- Chart rendering rejects duplicate/invalid dates, invalid closes and last-date/close mismatch.
- Analysis and diagnostic buttons request an outer dialog through a strict message contract: expected iframe window, opaque origin, exact three keys, enum kind/ticker. No `allow-same-origin` is added. Outer dialog constructs allowlisted evidence only from hash-verified inputs; it never trusts message-supplied prompt text.
- Copy requires a separate user click. Clipboard failure offers selectable read-only text. ChatGPT opens without query parameters or attached data. No automatic transmission, storage, orders, or workflow dispatch. Japan FULL bundle parity is not claimed.
- Existing normal UI, worker, Core, trading conditions and private records remain out of scope. Device acceptance and regular-PWA adoption are pending.

## 2026-10-04 — bounded consultation transfer (jp-cards.3)

Why necessary: calculation windows must not look like forecast horizons, and long diagnostics must remain usable without losing evidence.
Why insufficient: the previous ALL diagnostic exceeded 22,000 characters and only offered whole-text copy.
Why minimal: change only the preview presentation and outer consultation dialog. Preserve Core, thresholds, root UI/SW, all fixed JSON and chart inputs.

- Labels explicitly say 判定期間. Existing MACD/MA windows and state calculations are unchanged.
- Default view is an explicit summary of at most 8,000 UTF-16 code units. Counts and limits use this conservative browser string length (emoji can count as two).
- Save exports the exact allowlisted consultation text as UTF-8. It is NOT all repository data or a FULL-contract adoption. The UI lists included and omitted evidence.
- Split copy includes sequence headers and keeps each part below 8,000 code units; removing each first-line header and concatenating reconstructs the exact full text. Surrogate pairs are not split.
- Whole-text copy is disabled above the limit. Clipboard failure keeps manual selection available. No automatic transmission/attachment. Close clears the dialog; reopening builds a fresh subject-specific package.
- PINS updated for changed judgment source; loader entry version advanced to avoid stale outer assets.
- Verification: 89 Node tests; browser CI checks summary/full/split, exact downloaded content, subject reset, small-screen layout and existing sandbox/storage/SW contracts. Real iPhone/Safari acceptance remains pending.

### History investigation and next data-stage boundary

Private main b4df5e5810a619b6c9be22d7c595b86f9ce4b5d2 was read directly:
- sources/yahoo.py fetches daily OHLCV, auto_adjust=False; run.py requests 5y and uses those rows for technical calculations with target-date handling and primary-source fallback.
- Those per-security OHLCV rows are not currently persisted as a dedicated chart dataset. data/shadow/history.json contains operational run records, not security prices.
- Therefore a 90/250-session chart cannot be obtained merely by changing preview labels or treating the run history as prices. No replacement data was invented or independently mixed into the fixed snapshot.
- Next separate data change: retain selected OHLCV rows from the same calculation run; export an explicit public allowlist (ticker/date/OHLCV/source/adjustment basis); validate date uniqueness/order, finite positive prices, OHLC bounds, volume, target-date alignment and latest close reconciliation. Pin a reviewed frozen copy in this preview before rendering candles/volume. Declare mixed-source and adjustment limits; do not claim full indicator reproducibility from a short export.
- Existing frozen snapshots and regular public pipeline remain unchanged by this UI PR.
