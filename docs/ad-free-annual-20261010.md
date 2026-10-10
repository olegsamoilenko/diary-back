# Annual Ad-free — 10 October 2026

User activated `ad-free-y1` in the existing Google Play subscription `nemory_ad_free` and explicitly requested production availability immediately. No annual-only development/build flag remains. The existing ad-free purchase switch covers both periods; development and production profiles already enable it. Other AI plans remain monthly.

## Implementation

- Legacy and V2 catalogs/enums recognize `ad-free-y1` as paid AdFree with zero included AI credits. Google verification accepts only the matching ad-free product/base-plan pair. Existing persisted string columns require no schema migration.
- Google expiry remains authoritative; annual duration is not approximated with monthly arithmetic. Existing subscribe, restore, RTDN, advertising and purchased-credit flows are reused.
- Frontend SKU mapping, current-plan labels, management and zero-credit presentation cover both Ad-free periods. Existing active-subscription offer visibility is preserved.
- The live `PlansSettings` / `Plans` card uses the existing V2 SegmentedControl for monthly/yearly; price and purchase offer come from Google Play. AI tiers retain their current layout.
- Annual/monthly Ad-free replacements explicitly pass the existing token with DEFERRED (6); Ad-free to AI remains CHARGE_FULL_PRICE (5). Purchase/restore is never triggered by selecting the period.
- Savings compares recurring prices in the same currency against twelve monthly payments. User confirmed USD 14.90 annual; USD 1.90 / 14.90 rounds to 35%; observed UAH 104.99 / 799.99 rounds to 37%. Missing, invalid or mismatched-currency prices do not produce a discount claim. Renewal disclosure in uk/en/de/pl now refers to the selected period.

## Verification and release

Frontend IAP/access/Plans/price-comparison tests passed (103 cases). Updated Plans tests: 56 passed. Backend focused run: 106 passed, five existing response-shape assertions fail because their expected advertisingRollout lacks interstitialPolicy; annual tests passed. Additional annual purchase/restore coverage: all nine ad-free service cases pass. Both TypeScript checks and scoped lint pass.

Phone confirmed store-backed monthly 104.99 UAH / annual 799.99 UAH and period switching, without purchase. Final discount label verification pending. A single app Reload was slow but completed to Today; no Metro restart or reload loop. No store purchase, server deployment or Metro restart performed. Deploy backend support before releasing the updated client; real Play test purchase/renewal/restore remains to be checked.

Exact fresh-input, cached-input and output token usage is unavailable in this session; no cost/quota estimate inferred.

## Discount visual polish

User requested a slightly larger Remove ads heading and a designed discount badge. Heading now 18/24 before the existing font-size preference adjustment. Yearly uses a separate compact rounded primary/onPrimary badge with medium text. Shared V2 SegmentedControl gained an optional trailingAccessory outside native Text; existing consumers retain their layout. All 56 Plans tests pass; scoped lint passes. The old progress/SegmentedControl test targets a different legacy component and cannot load react-redux ESM. Current phone account has active AdFree, so the offer is hidden; final badge visual verification remains pending. No purchase/account changes were performed.
