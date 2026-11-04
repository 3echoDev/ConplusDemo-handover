# Conplus: client change requests, 27 Oct 2026

Source: one email, thread "Fwd: amendments and additions to dashboard".

| Date | From | To | About |
|---|---|---|---|
| Tue 27 Oct, 16:52 | Wendy (contract@conplus.com.sg) | Muhsin, 3echo, Jim, Benjamin, Lynn, accounts | Progress claim template, Claim 02 work-done breakdown, payment terms, PO template, cancel six POs |

Attachments and the three inline screenshots are in `.tmp/emails_2026-10-27/`. The five image attachments Gmail lists (`image017.png`, `image028–031.jpg`) are the Conplus / bizSAFE logos and two old skill-upload screenshots carried down from the forwarded thread — **not** the screenshots Wendy refers to. Her screenshots are inline in the message body and were captured as:

- `inline1_template_totals_removed.png` — item 1, the red boxes
- `inline2_claim02_work_done_rows.png` — item 2, E25077 Claim 02 work-done rows
- `inline3_po_packing_uom.png` — item 4, PO 2610-0016 with Packing / UOM boxed

Status legend: **TODO** = not started · **Q** = question back to the client · **HOLD** = needs the user's go-ahead before touching data.

---

## 1. Progress claim template: drop the Total formulas on work-done sub-rows. DONE 2026-10-27, committed + pushed 4 Nov (5af0f99)

**Ask:** "Attached the revised ConPlus Progress Claim Template and Dashboard Progress Claim for reference. Removed the total formula as shown in the screenshot to ensure the total is clear and tally."

**What the screenshot marks** (`inline1_template_totals_removed.png`): four red boxes on the work-done sub-rows, one per "Total" column — `L` (Quantities Total, claimed), `O` (Amount S$ Total, claimed), `V` (Quantities Total, verified), `Y` (Amount S$ Total, verified).

**What is actually different**, read out of `ConPlus_Progress_Claim_Template_rev.xlsx` vs what we generate:

| Cell, on a work-done sub-row | Revised template | Our export (`claimExcel.ts`) |
|---|---|---|
| `L{sub}` | *(blank, no formula)* | `=J{sub}+K{sub}` |
| `O{sub}` | *(blank, no formula)* | `=M{sub}+N{sub}` |
| `V{sub}` | *(blank, no formula)* | `=T{sub}+U{sub}` |
| `Y{sub}` | *(blank, no formula)* | `=W{sub}+X{sub}` |

In the revised template a sub-row carries only its inputs (`J`, `K`, `T`, `U`) and `AA{sub}` = `Y{sub}-O{sub}`; every Total belongs to the parent item row. The subtotal rows themselves are byte-identical to the master we already follow (`G` = `SUBTOTAL(9,…)`, `O` = `SUMIF(F…,"<>",O…)`, `Y` = `SUMIF(P…,"<>",Y…)`, grand total `O = O_A + O_B`).

**A real double-count found while checking this.** Comparing all three workbooks cell by cell turned up a divergence she did **not** flag: her Sep master and her revised template both leave `M`, `N`, `W`, `X` (the amount cells) blank on sub-rows too — we were writing `=J{s}*I{item}` etc. there. That matters, because the subtotal row sums those columns with `SUBTOTAL(9, M15:M60)` over the **whole block**, item rows and sub-rows alike. With amounts on the sub-rows, the Amount Previous / Current subtotals — and the verified pair — came out at roughly **double** once Excel recalculated. `O` and `Y` were always safe (they use `SUMIF` on `F`/`P`, which only item rows fill), which is why the claim total was right while the columns above it were not. That is "ensure the total is clear and tally".

**What was changed** (`src/lib/claimExcel.ts`, sub-row loop):

- `L{s}`, `O{s}`, `V{s}`, `Y{s}` → empty, number format and borders kept (the four red boxes).
- `M{s}`, `N{s}`, `W{s}`, `X{s}` → empty, yellow input fill kept, matching both her files and fixing the double-count.
- `AA{s}` keeps its `=Y{s}-O{s}` formula, as in her template; cached result is now 0.
- A sub-row is therefore quantities only: `J`, `K`, `T`, `U`.

Two tests added in `src/test/claimExcel.test.ts` — sub-rows carry no amount or Total cell and keep the yellow fill; the amount subtotals equal the single-item figures. Full suite green (123 tests).

**Q for Wendy, non-blocking:** `AA{sub}` now reads `Y{sub}-O{sub}` where both are blank, so every sub-row shows 0. Her template does the same, so we have matched it — worth confirming she wants the column kept rather than blanked.

---

## 2. Claim 02: one row per work item, in Excel and in the PDF. TODO

**Ask:** "The Dashboard Excel Claim currently combines multiple work items into one row, although the total is correct. Please follow the attached E25077_HPC_STA_Progress_Claim 02 template. Each work item must be shown on a separate row in both the Dashboard Excel Claim and the printed/PDF version."

**What is actually different:**

- **Her master** (`E25077_HPC_STA_Progress_Claim_02.xlsx`): item `A1` is one parent row, with **one sub-row per work-done period** — `1  Work Done: 17-23 Aug'26 - 1st Storey` (Previous 107.64) and `2  Work Done: 01-15 Sep'26 - 1st Storey` (Current 250.00) — and a third empty slot reserved. The item row's `J16`/`K16` are `=SUM(J17:J19)` / `=SUM(K17:K19)`.
- **Our export:** `subCount = l ? 1 : 2` (`src/lib/claimExcel.ts:178`) — exactly **one** sub-row per claim line, labelled from `l.remarks`, with the whole period collapsed into a single date range and a single quantity. Visible in `E25035_Progress_Claim_01(From Dashboard).xlsx`: every item has one `Work Done: 01/04/2026 - 27/04/2026` row even where the work spans several site-report periods.
- **The printed/PDF claim** (`src/lib/claimDocument.ts:152`) has **no** work-done sub-rows at all — one `<tr>` per claim line, so the breakdown is missing entirely from the document the main contractor signs.

**Fix, in three parts:**

1. **Data.** `claim_lines` has no per-period breakdown (`supabase/migrations/20260911_cp_audit_claims_write_path.sql:109` — one row per item, `prev_qty` / `curr_qty` only). Add a child table `claim_line_periods` (claim_line_id, seq, label, prev_qty, curr_qty, verified_prev_qty, verified_curr_qty) or a jsonb `periods` column, and extend `save_claim_lines` to write it.
2. **Excel.** Make `subCount` the number of periods on the line (minimum 1, keep 2 reserved for the empty-variation template so the SUMIF ranges and subtotal row still land where the cover sheet points). Write one sub-row per period with its own label and quantities; the item row's `SUM()` ranges follow.
3. **PDF/print.** Add the sub-rows under each item in the claim-details table, matching the Excel: `Work Done: <period>` in the description column, the period's own Prev/Curr quantity and amount, totals only on the item row.

**Q:** where do the periods come from — the site reports in the claim's reference period (we can group those automatically), or does Wendy enter them by hand on the New Claim screen? That decides whether this is a UI change as well.

**Note:** this is the same complaint as the "Claim 02 double-count" item logged in `docs/Conplus_Changes_2026-09-17_to_09-25.md` (19 Sep). It has now been restated as a layout rule, which is more actionable than the earlier figure mismatch.

---

## 3. Payment terms (WIP) — default terms and the claim-summary tracker. TODO

**Ask:** "Attached the updated Payment Terms (WIP) – Claim Summary Sep26–Aug27." Default payment terms:

> 56 days as per the SOP Act. An Interim Payment Certificate / Payment Response shall be issued within **21 days** of receiving the progress claim, certifying the value of work done on site. Payment shall be made within **35 days** upon receipt of the original Tax Invoice by the Main Contractor.

(21 + 35 = 56; the 35 days run from receipt of the **original tax invoice**, not from the claim date.)

**What is actually different:** the app only knows payment terms on the **supplier** side (`suppliers.payment_terms`, used on the PO — `src/data/db.ts:353`, `src/components/CreatePODialog.tsx:32`). There is nothing on the **client/claim** side: no terms per project, no certificate-due or payment-due date on a claim.

**What the attached workbook holds** (`Payment Term (WIP) - Claim Summary Sep26 - Aug27.xlsx`, sheet `Prog Claims`, one row per project):
- Identity: Sales Manager · **Payment Term** (`30 DAYS`, `DEFAULT`, blank) · Client · Project/Site · Project Code · Quotation Ref. · Liaise With · Contact No.
- A month-by-month claim history from Aug-12 to Oct-26; from Sep'24 on, each month is four columns: `CLAIM NO-<Mon'YY>` · `Claim-<Mon'YY>` · `CERTIFIED AMOUNT (<Mon'YY>)` · `CLAIM-<Mon'YY> (B4 RETN)`.
- Summary tail: Contract Value · (VO) Value · Total Contract Value · Value of Balance Work · **(A) (95%) Amount Claims** · **(B) (5%) Cumm. Retention** · **(C) Certified To-date** · **(D) = (A)+(B)−(C) Total Outstanding** · **(E) = (D)−(B) Bal Outstanding** · Remarks · Follow Up · Total Claim Value · Project Progress (%) · Status (`WIP` / `Final Claim` / `Complete` / `VO`).

**Fix:**
1. Add a payment-terms field per project (default: the 56-day SOP Act wording above, overridable per project — several rows carry `30 DAYS`).
2. Derive and show two dates on a claim: certificate due = claim received + 21 days; payment due = original tax invoice received + 35 days. That needs an "invoice received" date we do not currently capture.
3. The claim-summary tracker overlaps heavily with the existing Claims pivot (retention, certified-to-date, outstanding). Worth mapping her column set onto ours before building anything.

**Q:** is the workbook (a) the format she wants the dashboard's claim summary to export in, (b) a source file to import, or (c) reference only for the payment-terms wording? The ask does not say, and the three answers mean very different work.

---

## 4. PO template: split Packing and UOM into two columns. DONE 2026-10-27, committed + pushed 4 Nov (5af0f99)

**Ask:** "Attached the revised PO template with Packing and UOM split into two separate columns. The Stock Code is not yet confirmed. I will update you once confirmed."

**What is actually different:**

| | Revised template (`Purchase Order - Template.xlsx`, sheet `PURCHASE ORDER`, row 23) | Our PO (`src/lib/poDocument.ts:419`) |
|---|---|---|
| Item table header | S/No. · Item Code · Item Description · **Packing** · **UOM** · QTY · Unit Price · Disc/Unit · Amount · QTY BAL. | S/No. · Item Code · Item Description · **Unit** · QTY · Unit Price · Disc/Unit · Amount |

In her template `Packing` (`L`) and `UOM` (`M`) are both looked up from the `LIST` sheet by item code — `Packing` from `LIST!D`, `UOM` from `LIST!E` — so they are item-master attributes, not typed per PO line. The worked example in `inline3_po_packing_uom.png` (PO 2610-0016, Sto, LTC Coatings – The Florida, blanket order) reads Packing `20.00 / 25.00 / 12.00` against UOM `kg/set`, `kg/bag`, `kg/set`: **Packing is the numeric pack size, UOM is the unit of that pack.** Our single `Unit` column collapses the two.

**What was changed.** No migration: `materials.stock_unit` already holds the pair as one string ("30kg/set"), and that is what a PO line stores in `unit`, so the document splits it at render time.

- `splitPacking()` in `src/lib/poDocument.ts` — leading number → Packing, remainder → UOM. A string with no leading number ("kg", what older rows carry) is all UOM with Packing blank. Optional `packing` / `uom` on a line override the split, so an explicit item-master field can be added later without touching the renderer.
- `PurchaseOrder["items"]` gained optional `packing` / `uom` (`src/data/sampleData.ts`); `unit` is unchanged and still the stored value.
- PO HTML: `Unit` header replaced by `Packing` + `UOM`; data and padding rows are now nine cells.
- PO Excel: item table header is `Item Code 2-3 · Item Description 4-6 · Packing 7 · UOM 8 · QTY 9 · Unit Price 10 · Disc/Unit 11 · Amount 12`. Description gave up column 7 so the sheet keeps its 12-column grid and the header thirds above (1-4 | 5-8 | 9-12) still line up; columns 4-6 widened to compensate.
- `CreatePODialog.tsx`: the uncommitted helper that composed a single "Kg / Set" label is gone — picking a material now puts the item master's packing string in the line verbatim, which is what the split needs. The column header reads "Packing / UOM" and the datalist offers the raw strings.

New `src/test/poDocument.test.ts` (7 tests) covers the split, the two header columns, the per-cell output, and the nine-cell row shape. Full suite green (123 tests).

**Still to do for this item:** the item master has no dedicated Packing / UOM fields — we are parsing one string. If their `LIST` sheet turns out to hold them separately, populate `packing` / `uom` on the line and the renderer needs no change. `.tmp/files5/Spec_02_Purchase_Order_Template.md` still describes the old single `Unit` column.

Other differences visible in her template, worth noting but **not** asked for: a `QTY BAL.` column after Amount, and a `PO RECORD` sheet that tracks delivered / checked quantities and up to four DO + invoice numbers per PO line. That is the PO register (next-steps item 27) in her own shape.

**BLOCKED:** Stock Code is not confirmed — she will send it. Nothing to build for it yet.

---

## 5. Cancel six pending-approval POs. APP READY 4 Nov; needs `supabase/migrations/20261104_po_cancel.sql` applied, then Cancel PO on each card

**Ask:** "Please cancel the following six POs still marked as pending approval: 2607-0005, 2607-0011, 2607-0012, 2607-0015, 2607-0016 and 2607-0017."

Re-asked 3 Nov. 4 Nov: `cancelled` added as a PO status (badge, Cancelled column on /purchase-orders and the Live View pipeline, Reject button replaced by Cancel PO with a confirm dialog). The six rows were still `pending` on 4 Nov; the button only works once `supabase/migrations/20261104_po_cancel.sql` is applied (anon cannot update the table directly; the first live click was a silent no-op). The 2607-0017 pending-approval alert was resolved 4 Nov. Originally: Before doing it: confirm with Muhsin, check each PO is genuinely still pending (not received against), and decide cancel-vs-void so the PO numbers are not reused.

Note these are **July** POs (26-07-xxxx). The attached `PO 2610-0016 Sto (LTC Coatings - The Florida) BLANKET ORDER.pdf` is an October PO and is the worked example for item 4, not one of the six.

---

## Order to do them in

1. ~~**Item 1**~~ — done 27 Oct, plus the sub-row amount double-count found alongside it.
2. ~~**Item 4**~~ — done 27 Oct. Stock Code still pending from Wendy, but it was never needed for the column split.
3. **Item 2** — the real work: schema + Excel + PDF. Answer the Q first.
4. **Item 3** — answer the Q first; scope depends entirely on it.
5. **Item 5** — on Muhsin's say-so only.

Items 1 and 4 are in the working tree, not committed and not deployed. 123 tests pass, `tsc --noEmit` is clean. The two eslint errors in `poDocument.ts` (`as any` on the letterhead image anchors, lines 326–327) pre-date this work.
