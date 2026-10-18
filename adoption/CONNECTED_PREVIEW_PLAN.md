# US connected preview — unpublished implementation candidate

Checked: 2026-10-19 JST. Status: CANDIDATE / NOT_PUBLISHED / DEVICE_PENDING.

## Purpose and boundaries

Prepare the generated same-run five-tab app for isolated iPhone acceptance. This change creates build/test tools only. It does not replace the normal four-tab PWA, the fixed S1/device previews, the source contract, investment rules or any personal record.

Planned route: `/us-stock-check-web/preview/connected/` (NOT published by this PR).
Planned home-screen name: `米国接続確認`.

The original `adoption/pwa.cjs` is for normal-PWA migration and deliberately uses normal application storage. It MUST NOT be used unchanged for an isolated preview. This candidate instead uses:

- Service-worker and manifest scope/id/start URL: the connected route only.
- Shell cache: `us-connected-preview-shell-<UI SHA-256>`.
- Verified snapshot cache: `us-connected-preview-delivery-v1`, one stable key.
- No reading/importing `usstock.activeTab`, no localStorage writes, no IndexedDB migration.
- No root Service Worker registration, no all-origin cache deletion, no deletion of normal/device/other app caches.
- Original sandboxed iframe and the existing recorded-QC/current-freshness/consultation generation contract.

Distinct scope and prefixes prevent accidental interference, not malicious same-origin access. The existing root SW has an overlapping parent scope; actual browser coexistence with that root registration is an acceptance test, not an assumption.

## Canonical reference and dependencies

- Public consumer source: PR #32, `b83c2b1defb1554b5ab46bf23552c9afc51f51cc`.
- Public main observed: `c9d069faaa6c3de05cc7bb8aceacefd2cef8f2f3`. Since the reviewed PR #32 base, only normal `docs/data` JSON changed; those newer values are not mixed into the fixed fixture.
- Common latest-main reference: `5e482c8d89ef46f3c152aa19b9e91b13611c6e28` (read for current constraints; not automatically adopted).
- US UI design's pinned Common reference: `351a49ec9f792d49916593721d7e30fe16ac5722`.
- Applicable constraints: COM-CACHE-002/003, COM-PUB-001, COM-SEC-001/002/006, COM-OPS-001, COM-ADOPT-001, existing US same-run/time/SHADOW rules. Common and market-specific adoption gates remain separate.

## Build and data refresh

```
node adoption/connected-preview.cjs build /tmp/validated-delivery /tmp/new-connected-site PUBLIC_CODE_SHA PRODUCER_CODE_SHA PRODUCER_RUN_ID
node adoption/connected-preview.cjs update /tmp/next-validated-delivery /tmp/existing-connected-site PRODUCER_CODE_SHA PRODUCER_RUN_ID
```

Commands refuse output in the repository and do not write GitHub or deploy Pages. The build target must be new. Inputs must be an exact four-file producer package: status, market, common_snapshot, ohlcv-history. Explicit source SHA/run ID are required, then the original manifest, byte digests, same-run identity/time/targets, SHADOW, QC/session/source gate, null formal action and private-field scanner are checked.

The UI sources are generated through the original reviewed build/PINS, but with NO normal-migration PWA installation. The temporary public manifest is replaced with the original producer manifest/bytes. BUILD.json identifies the UI source and initial release only; `delivery/current.json` is authoritative for the current market bundle.

Refresh validates the complete new package before writing immutable files, preserves prior releases and changes the pointer last. Older generation time or a different release with an identical generation timestamp is rejected as ambiguous. This is a preview-pointer safety rule, NOT a new market-price tolerance or data freshness rule. Build/pointer success is not proof of market close, finality, current market acquisition or publication.

The SW caches only hashed static UI assets after verifying their SHA-256 on install. Market delivery requests are network-only at the SW layer; only the application can restore and reverify a saved bundle, label it unconfirmed and block GPT transfer. Cache-busters are canonicalized only for the explicit static-asset parameters v/t/_. Other parameters remain distinct and are not silently discarded.

## Unpublished pipeline and next approval

1. Generate/retrieve a validated same-run Private delivery and verify its producer run identity.
2. Build the isolated site in a disposable workspace using an exact consumer SHA.
3. Run this candidate's Node tests and browser coexistence/isolation tests with that input.
4. Retain the resulting site/evidence privately. NOT proof of iPhone success.
5. Before a publication PR, prepare an exact public allowlist and a diff restricted to `docs/preview/connected/`; rerun Public Safety and Pages gates, and confirm root/S1/device/SW bytes are unchanged. Do not merge the existing normal-migration candidate as a shortcut to publication.
6. New isolated publication and any recurring Private-to-Public write path need a scoped review/approval. No publish credential or deployment write is introduced here.

A continuously published route also needs a reviewed indication of the latest upstream attempt. Keeping a last-good manifest after PENDING/failure must not imply that the latest backend attempt succeeded. This candidate does not fabricate such backend telemetry; it states that re-reading a delivered bundle is not backend acquisition or a guarantee of latest prices. Approval for the continuous publication path remains pending.

## iPhone acceptance — only residual/delta tests

Record URL, source release, consumer/UI SHA, device OS and browser/standalone mode. Prior fixed-device offline/recovery reports remain observed; do not reset all accepted tests.

- Check post-fix landscape visibility and 90/250-bar controls affected by this isolated header.
- Copy consultation summary/full text; save the full file and select it as an attachment. Do not auto-send.
- Record the actual termination/restart method. Chromium tab close/reopen is not iOS process termination.
- Check normal app records and other app caches without publishing their values. Use local comparison/backup; do not upload private balances or cost basis.
- Because connected scope/SW/data cache are new, verify only the resulting isolation/offline differences; no blanket repetition of unrelated accepted flows.

## Rollback and stop rules

On failed generation, hash mismatch, PENDING, HOLD, unauthorized field, unknown provenance or regressive data, do not publish a new pointer. Keep the previous verified release and record the failed attempt separately.

For an approved isolated deployment rollback, restore only the connected route's previous reviewed UI and its verified release via a normal commit. Preserve normal/S1/device paths and personal records. Do not git reset, force-push, remove all caches, remove the normal PWA, or disable the existing Shadow schedule.

Normal five-tab adoption, Production promotion, formal trade engine and legacy retirement are explicitly outside this change. Any data-copy test remains a fixture/replay, not new market acquisition.
