# US UI verification preview

Purpose: let the user review the five-tab candidate on iPhone without replacing the regular app.
Preview entry: `preview/s1/index.html` relative to the existing Pages site.

Why three: a tested ZIP is not a usable iPhone review route; full adoption is still device-gated; therefore expose only an isolated, static UI preview and retain the production entry point and worker byte-for-byte.

- UI source: Draft PR #22 head `3705fddcf2217bdbc8b0376e6aeb0045612c7a03`.
- Input: already-public snapshot from commit `a4f593059a3847f8edc57d180bdc7dabb6a81a69`, trade date 2026-10-02, generated 2026-10-04 17:36:25 JST.
- Reference panels preserve existing prices and analysis. These are frozen UI input, not current quotes.
- Every preview source is pinned to its Git blob hash; loading fails on mismatch. This is not adoption of the FULL deep-dive contract.
- Inner page runs in `sandbox=allow-scripts` WITHOUT same-origin privilege. No storage, cache, worker, or parent-page access. CSP blocks network in the inner page.
- The outer loader fetches only nine allowlisted files from this preview directory. The existing production worker may serve/cache this outer document normally; the preview neither replaces nor unregisters that worker.
- Fixed-data redisplay never fetches market data or runs GitHub workflows.
- Preview does not install a PWA, change normal-app preferences, or place orders.
- A UI-review URL is not runtime adoption, Production promotion, or iPhone DEVICE_PASS.
- Japan reference-device gate and US PWA migration acceptance remain independent. PR #22 remains draft.
- Parent tracking: private us-stock-check Issue #39. Formal operation review stays in Issue #25.
