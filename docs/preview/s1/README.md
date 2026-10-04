# US UI verification preview

Purpose: let the user review the five-tab candidate on iPhone without replacing the regular app.
Preview entry: `preview/s1/index.html` relative to the existing Pages site.

Why three: a tested ZIP is not a usable iPhone review route; full adoption is still device-gated; therefore expose only an isolated, static UI preview and retain the production entry point and worker byte-for-byte.

- UI source: Draft PR #22 head `3705fddcf2217bdbc8b0376e6aeb0045612c7a03` plus the judgment-only `jp-cards.1` rendering facade described below.
- Input: already-public snapshot from commit `a4f593059a3847f8edc57d180bdc7dabb6a81a69`, trade date 2026-10-02, generated 2026-10-04 17:36:25 JST.
- Reference panels preserve existing prices and analysis. These are frozen UI input, not current quotes.
- Every preview source is pinned to its Git blob hash; loading fails on mismatch. This is not adoption of the FULL deep-dive contract.
- Inner page runs in `sandbox=allow-scripts` WITHOUT same-origin privilege. No storage, cache, worker, or parent-page access. CSP blocks network in the inner page.
- The outer loader fetches only eleven allowlisted files from this preview directory. The existing production worker may serve/cache this outer document normally; the preview neither replaces nor unregisters that worker.
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
