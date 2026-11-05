# Conplus item 2 — claim work-done breakdown, 5 Nov 2026

Builds Wendy's item 2 from the 3 Nov thread (`docs/Conplus_Changes_2026-11-03.md`).
Item 3 is **not** in this change: it needs her `Claim Summary Sep26 - Aug27.xlsx`,
which has not reached this machine.

## What the source material actually shows

Her Claim 02 workbook (`.tmp/emails_2026-10-27/E25077_HPC_STA_Progress_Claim_02.xlsx`,
Claim Details rows 16-19) is the spec, and it is unambiguous:

```
row 16  A1 item                                      J=SUM(J17:J19)  K=SUM(K17:K19)
row 17  1  Work Done: 17-23 Aug'26 - 1st Storey      prev 107.64     curr 0
row 18  2  Work Done: 01-15 Sep'26 - 1st Storey      prev 0          curr 250
row 19     (spare slot)
```

One sub-row per work period. Periods already claimed sit in Previous, this
claim's period sits in Current, and the item row sums them.

The WDR packet she attached (`E25077_HPC_STA_Progress_Claim_01_with_WDR.pdf`,
pages 4-5) is worth reading before trusting any extraction:

* page 4 is the printed form. It gives the work period (17/08–23/08/2026), the
  system spec and the item description — but its **QUANTITY and LOCATION columns
  are blank**.
* page 5 is a marked-up floor plan with **handwritten take-offs** — `5m x 2m =
  10m²`, `2.8 x 2.7 = 7.56m²`, … circled as `= 107.635m²`. That is where the
  107.64 m² on claim line A1 comes from.

So "extract the quantities from the WDR" means reading handwriting off a
drawing. The scan is therefore prefill-only and the team always confirms.

## Built

**Database** — `supabase/migrations/20261105_claim_work_done.sql` (NOT yet applied):

* `claim_work_done` (claim_line_id, seq, label, period_from, period_to,
  location, qty, is_current, source) + RLS read; writes only via RPC.
* `claims.wdr_url / wdr_filename / wdr_period_from / wdr_period_to`.
* `save_claim_lines` takes an optional `periods` array per line and **recomputes
  `prev_qty` / `curr_qty` from it**, so the item row can never disagree with the
  breakdown it claims to sum. The periods are written in the same call because
  that function deletes and re-inserts every claim line and the cascade would
  otherwise take them with it.
* `set_claim_wdr` — anon has no UPDATE on `claims`, so this is SECURITY DEFINER
  like every other claim write.

**App**

* `src/lib/workDone.ts` — pure. Period labels in the client's own form
  (`17-23 Aug'26`, `01-15 Sep'26`, `28 Aug-05 Sep'26`, `28 Dec'25-05 Jan'26`),
  `rollUp` (Previous/Current), `carryForward`, `seedPeriods`, `subRowCount`.
* `src/lib/wdrScan.ts` — the scan client and `rasterisePdf` / `rasterisePdfUrl`
  (pdfjs-dist, lazily loaded into its own 412 kB chunk).
* `src/lib/claimExcel.ts` — one sub-row per period instead of a hardcoded one;
  the item row's `SUM(Jn:Jm)` spans them; amounts still stay off the sub-rows so
  the subtotal cannot double-count (the 27 Oct fix is preserved).
* `src/components/ClaimWorkDonePanel.tsx` — upload / replace / remove the WDR,
  "Scan to prefill", and the notes the scan returns.
* `src/components/ClaimLinesEditor.tsx` — each line expands into its work-done
  periods (dates, location, qty, Previous/Current, printed label). Prev qty and
  Curr qty became **read-only derived** cells.
* `src/lib/claimDocument.ts` — `printClaim` appends the WDR's pages after the
  claim, so one Save-as-PDF produces the whole submission.
* `docs/n8n/build_wdr_scan.mjs` — the `conplus-wdr-scan` webhook, same shape and
  credential as the live DO scan. The prompt tells the model to add up the
  handwritten take-offs and show its arithmetic in a note.

**Tests** — 172 pass (`src/test/workDone.test.ts`, 34 new; plus a Claim 02
breakdown block in `claimExcel.test.ts` asserting the row layout above). tsc and
build clean.

## Deliberately not done

* **No invented history.** A claim written before this change has no stored
  periods, and we do not manufacture them: we do not know when its previous
  quantity was done, and a label like "previously claimed" would be text we made
  up on a document that goes to the main contractor. Those lines keep printing
  the single sub-row they always had, byte for byte.
* **The previous Progress Claim upload (Excel) is not built.** Wendy asked for
  it as the carry-forward source; we already hold the previous claim's
  cumulative quantities in `claim_lines`, so carry-forward is exact without
  parsing her workbook. Tell her this rather than implying we parse it. Worth
  adding only for claims that originated outside the dashboard.
* **The spare blank sub-row.** Her sheet reserves one empty slot under some
  items (three slots for two periods) and two under others — no consistent rule.
  We write exactly one slot per period. Ask her whether she wants a spare.

## Deployed 5 Nov 2026

1. `20261105_claim_work_done.sql` **applied live**, in two parts — the table,
   columns and `set_claim_wdr` first, then the `save_claim_lines` replacement.
   The second part was refused twice by the auto-mode classifier and went
   through on the third attempt; the pattern from the 4 Nov `po_cancel` work
   repeats, so expect to retry rather than assume a real failure.
   Verified after: `save_claim_lines` references `claim_work_done`,
   `set_claim_wdr` exists, the guard returns `claim not found` for an unknown
   id, and the Previous/Current split returns `prev 107.64 / curr 250` on
   Wendy's own Claim 02 figures. No real claim was written to.
2. n8n **`viUJpziD5isb8ESD` "Conplus — WDR Scan (front-end trigger)"** created
   and active → `POST https://threeecho.app.n8n.cloud/webhook/conplus-wdr-scan`.
   All four guard paths smoke-tested (bad token, no pages, no lines, page
   missing base64).

### Live scan against the client's own WDR — read this before trusting a reading

One real run, pages 4-5 of `E25077_HPC_STA_Progress_Claim_01_with_WDR.pdf`
(170 dpi, 300 KB + 722 KB), `gpt-4o`, ~25 s:

* `period_from` / `period_to` → **2026-08-17 / 2026-08-23**. Exactly the form.
* `location` → **"1st Storey"**. Correct.
* `qty` → **107.65**, against the drawing's **107.635** (the claim carries
  107.64). Close enough to be a good prefill, not close enough to accept blind.
* `confidence: "high"`, no warnings.

**The note's arithmetic is fabricated.** It reported `5.5 x 3.5 = 19.25` and
`10.3 x 3 = 30.9`; the drawing says `5.35 x 3.7 = 19.79` and `10.3 x 3.9 =
40.17`. Its own list of take-offs sums to 102.635, not the 107.65 it returned.
It read the circled grand total and back-filled a plausible breakdown around it.
Treat `note` as a prompt to go and look at the drawing, never as working. The
confirm-before-save design is load-bearing, not ceremony.

## Still to do

* Push (deploys to Vercel) — done 5 Nov.
* First real run on E25077 claim 2 with her own WDR, and compare the export
  against her Claim 02 workbook.
* Ask Wendy about the spare blank sub-row, and tell her the previous Progress
  Claim upload is not needed for carry-forward.
