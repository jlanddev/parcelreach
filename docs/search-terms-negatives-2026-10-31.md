# Search terms (last 60 days) + draft negative keywords — DO NOT APPLY YET

**Account:** 2875216984 (Haven Ground) · **Window:** 2026-09-01 → 2026-10-31 · **Source:** Google Ads API v23 `search_term_view` (read-only).
**Status:** Draft for your review. Nothing has been applied to the account.

---

## Totals
| Metric | Value |
|---|---|
| Distinct search terms | 1,663 |
| Clicks | 625 |
| Cost | **$7,438.81** |
| Conversions (Qualified_Lead) | 65.9 |
| Conversion value | **$66** |

**Two things jump out:**
1. **Conversion value is basically zero ($66)** across $7,438 of spend. That's the value-based-bidding pipeline not delivering — Google is bidding blind because almost no deal value is flowing back. This is exactly what the tracking work fixes.
2. **The 65.9 "conversions" are inflated ~2×** by the Qualified_Lead double-fire we found today (page_view + scroll each spawn a Qualified_Lead). Real qualified-lead count is closer to ~33. Fix that GA4 rule and this number will roughly halve.

---

## Top 25 search terms by spend
```
clicks   cost     conv  term                               matched keyword
   31   $559.59   7.0   sell my land                       sell my land
   26   $396.16   2.0   land buyers                        land buyers
   19   $365.95   4.0   land buyers near me                land buyers near me
   15   $297.78   4.0   sell land                          sell land
   15   $147.03   1.0   we buy land                        we buy land
   16   $138.50   0.0   land developers near me            land developers near me
    9   $128.09   0.0   we buy land for cash               we buy land for cash
    8   $117.33   3.0   land buyers in texas               land buyers in Texas
    6   $111.59   0.0   sell land fast                     sell land fast
   12   $102.03   2.0   how to sell land by owner          how to sell land by owner
    8   $101.29   2.0   companies that buy land for cash   sell my land for cash
    8   $100.97   0.0   florida land buyers                land buyers in Florida
    5    $94.47   2.0   sell my land fast                  sell my land fast
    4    $93.31   2.0   sell my vacant land                sell my vacant land
    6    $91.54   2.0   sell land for cash                 sell land for cash
    4    $84.06   0.0   land buyers in florida             land buyers in Florida
    6    $81.51   0.0   sell your land                     sell your land
   11    $79.38   0.0   landforcash com                    sell property online
    6    $77.02   0.0   selling land                       selling land
    7    $76.96   1.0   how to sell land                   how to sell land
    3    $76.45   0.0   sell my land arizona               sell land Arizona
    4    $71.04   1.0   companies that buy land            companies that buy land
    4    $66.22   0.0   who buys land                      we buy land
    3    $65.09   0.0   sell vacant land fast              sell land fast
    3    $63.96   0.0   sell vacant land                   sell land
```

---

## Draft negative keywords — tiered by confidence

### ⚠️ Read this first
190 terms spent money with 0 recorded conversions ($4,006 total — 54% of spend). **I did NOT turn all of those into negatives.** With tracking under-counting, a "0-conversion" term may actually have produced a real deal that never got attributed. So the list below is split: Tier 1 is safe on *relevance* grounds (you don't want that traffic regardless of tracking); Tier 2 is *performance*-based and should wait until the tracking fix is trusted (give it ~2–4 weeks of clean data first).

### Tier 1 — RECOMMENDED (relevance-based, safe to apply now)

**A. ~~Out-of-geography~~ — RETRACTED (2026-10-31).** Jordan confirmed Haven Ground buys in **OK, AZ, FL** (and runs 50-state keywords) — the buy box is broad/national, not just TX/CO/MS/TN/MO. **Do NOT add state negatives.** Ignore any geo entries below.

**B. Wrong intent — people wanting to BUY/develop, not sell to you:**
- `land developers near me` ($138.50, 0 conv)
- `property investors near me` ($43.62, 0 conv)

**C. Competitor / other-brand searches:**
- `landforcash com` ($79.38, 0 conv — someone looking for a different company)

### Tier 2 — HOLD until tracking is trusted (performance-based, do NOT apply yet)
These are seller-intent terms that *should* be good but show 0 conversions in this window — which is unreliable right now. Re-evaluate after ~2–4 weeks of corrected tracking:
- `sell land fast` ($111.59) · `sell your land` ($81.51) · `selling land` ($77.02) · `sell vacant land fast` ($65.09) · `sell vacant land` ($63.96) · `sell your land for cash` ($61.67) · `where to sell land` ($51.94) · `sell raw land` ($41.75) · `how to sell land quickly` ($34.64) · `sell land by owner` ($33.62) …and ~150 similar low-volume seller terms.

### Ambiguous — judgment call (your read, not mine)
These could be sellers ("who will buy *my* land?") OR buyers. I'd lean keep-and-watch rather than negative:
- `who buys land` · `people who buy land` · `builders who buy land` · `we buy land for cash` · `land for cash` · `land for cash money`

---

## Suggested next move
1. Apply **Tier 1** only (geo + the 2–3 clear wrong-intent/competitor terms) — that's low-risk and stops obvious waste.
2. Build a **state-level negative list** for every state outside your buy box and attach it to the campaign.
3. Leave **Tier 2** alone until the Qualified_Lead double-fire is fixed and real deal values are flowing (then 0-conversion becomes trustworthy).

*Again — nothing here is applied. Say the word on which tiers you want and I'll prep them (still won't push to Google without your go).*
