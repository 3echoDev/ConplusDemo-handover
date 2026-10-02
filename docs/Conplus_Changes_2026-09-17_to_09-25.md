# Conplus: client change requests, 17–25 Sep 2026

Source: email thread "Fwd: amendments and additions to dashboard" (Gmail), six messages from 17 Sep onward:

| Date | From | About |
|---|---|---|
| Thu 17 Sep 15:43 | Wendy (contract@) | claims@ mailbox, PIC / Sales Mgr, skip PO approval, PO Item Code |
| Thu 17 Sep 18:49 | Muhsin (reply) | claims@ for website emails; Claude can send from staff accounts |
| Fri 18 Sep 11:33 | Lynn | Project planning & tracking workflow (Workflow + Dashboard Report) |
| Fri 18 Sep 12:38 | Wendy | Central claims mailbox rules + Payment Certificate workflow |
| Sat 19 Sep 13:09 | Wendy | E25077 Claims 01–03; Claim 02 on dashboard ≠ Excel; Instructions sheet |
| Sat 19 Sep 20:54 | Wendy | Progress Claims section on dashboard: expected figures (annotated) |
| Fri 25 Sep 11:59 | Lynn | Planning workflow R1 (yellow = revised) + Material Inventory Movement enhancements |

Files are in `.tmp/emails_2026-09-17_onwards/`: attachments plus inline screenshots, named `YYYYMMDD_HHMM_<name>`. Pictures embedded in the xlsx files are in `xlsx_media/`. Screenshots repeat because of quoted replies, so the first copy of each is the one referenced below.

Status legend: **TODO** = not started · **Q** = question back to the client · **BLOCKED** = waiting on the client.

---

## A. Quick fixes

### A1. Project page: PIC vs Sales Mgr is wrong. DONE 2026-09-28 (a301a88)
- Ask (17 Sep, #2): on project E25073 Coway the record is correct as **PIC: Brandan, Sales Mgr: Meredith**. The page shows "Sales Mgr: Brandan".
- Cause: `src/pages/LiveViewPage.tsx:394` renders `project.manager` (the PIC) under the label "Sales Mgr". The activity log shows the sales manager is stored separately (WAN FERN → MEREDITH).
- Fix: show two fields, `PIC: <manager>` and `Sales Mgr: <sales manager field>`.
- Screenshot: `20260917_1543_inline1_769x859.png`.

### A2. Skip the PO approval step. DONE in app 2026-09-28 (a301a88) + procurement skill 2026-09-28; open: 6 July pending POs, po-draft/purchase skills
- Ask (17 Sep, #3): "Skip the PO approval step. No PO approval is required."
- New flow: Jensen approves the WO → Wendy uploads the WO to Claude → Claude prepares the PO template → Wendy clicks **Proceed** to create or update the PO.
- Impact:
  - Create PO goes straight to `issued`, or to draft then issued without a pending state.
  - Hide "Pending approvals" on Store Health.
  - Disable the n8n PO-approval email (workflow `1lZC1m6pufwFMXBd`).
  - Remove the approval section from the Morning Brief POs block.
  - Update the procurement client skill.
  - The WhatsApp PO-approval idea (parked) is now dropped.

### A3. PO: Item Code per line. BLOCKED (material list with codes)
- Ask (17 Sep, #4): the PO view has an Item Code column but it is blank. They want an item code per material.
- Wendy will send the material list with item codes.
- Plan:
  - Add `item_code` to `materials`, import it from their list, and default it on PO lines when a stock material is picked.
  - Keep it editable per line.
  - Show it in the PO view, Excel and PDF.
- Screenshot: `20260917_1543_inline2_768x868.png` (PO 2609-0001, Sto).

### A4. Claim Excel still has an "Instructions" sheet. DONE 2026-09-28 (a301a88)
- Ask (19 Sep): "I have deleted the *Instructions* sheet from the Excel file, but it is still shown in the system."
- Her Claims 01–03 have only `Cover Page & Claim Summary` + `Claim Details`.
- Cause: `src/lib/claimExcel.ts:554` always adds `writeInstructions(wb.addWorksheet("Instructions"))`.
- Fix: drop the sheet and update the fixture `src/test/fixtures/claim_master_e25077.json`, which still lists "Instructions".

---

## B. Progress Claims: dashboard must match the Excel (19 Sep). DONE 2026-09-28 (b70b205 + E25077 claim 2 data corrected + to_claim view); verified live against the annotated screenshot

Project **E25077** STA Singapore Phase 1 at Tuas South Ave 12 (HPC Builders), contract $111,696.00.

Wendy's workbooks (`20260919_1309_E25077_HPC_STA_Progress_Claim_0{1,2,3}.xlsx`) hold these figures:

| | Claim 01 (08/2026) | Claim 02 (09/2026) | Claim 03 (09/2026) |
|---|---|---|---|
| Total value of work (cumulative) | 5,382.00 | 17,882.00 | 26,632.00 |
| Retention 10% (cumulative) | 538.20 | 1,788.20 | 2,663.20 |
| Net amount (cumulative) | 4,843.80 | 16,093.80 | 23,968.80 |
| Less previously certified | 0 | 4,500.00 | 4,500.00 |
| Claim amount (this claim, net of previously certified) | 4,843.80 | 11,593.80 | 19,468.80 |
| Payment certified (cumulative), from the main-con column | 0 | 5,000.00 gross / 4,500.00 net | 5,000.00 / 4,500.00 |

What the dashboard must show for E25077 after Claims 01 and 02 are uploaded (her annotations, `20260919_2054_inline1_1259x307.png`, matching her Claim Summary List row `20260919_2054_inline2_1868x177.png`):

| Field | Dashboard now | Should be |
|---|---|---|
| Cum progress claim | 17,882.00 ✓ | 17,882.00 (5,382 + 12,500) |
| Cum total claim | $18,764 ✗ | remove/fix, double-counts |
| Cum retention | $2,326.40 ✗ | **1,788.20** (538.20 + 1,250) |
| Cum claim | $16,437.60 ✗ | **16,093.80** (4,843.80 + 11,250) |
| Cum certified | $4,500.00 ✓ | 4,500.00 |
| Cum balance (+ret) | $14,264.00 ✗ | **13,382.00** (16,093.80 − 4,500 + 1,788.20) |
| Cum balance | $11,937.60 ✗ | **11,593.80** |
| Claim #2 row: claim amount | $11,593.80 ✗ | **11,250.00** (this period's work net of its own retention) |
| Claim #2 row: retention | $1,788.20 ✗ | **1,250.00** |
| Claim #2 row: Bal (+Ret) | — | 12,500.00 |
| Claim #2 row: Balance | — | 11,250.00 |
| Value of balance work | $92,932.00 ✗ | **93,814.00** (111,696 − 17,882) |
| (A) 95% amount claims | $16,437.60 ✗ | **16,093.80** |
| (B) 5% cum retention | $2,326.40 ✗ | **1,788.20** |
| Total outstanding (+ret) | $14,264.00 ✗ | **13,382.00** |
| Bal outstanding | $11,937.60 ✗ | **11,593.80** |
| Project list header chips | $16,438 / $95,258 ✗ | crossed out, fix with the above |

Root cause (to confirm in code): the upload stores Claim 02's **cumulative** retention (1,788.20) and its **"claim amount after less previously certified"** (11,593.80) as if they were Claim #2's own figures. Summing per-claim rows then double-counts Claim 1: 538.20 + 1,788.20 = 2,326.40, and 4,843.80 + 11,593.80 = 16,437.60. Fix at upload:
- Per-claim amount = this period's work × 90% (12,500 → 11,250).
- Per-claim retention = this period's retention (1,250).
- Keep the Excel's cumulative figures and its Claim Amount (11,593.80) as the invoiceable figure for that claim.

The Claim 02 PDF from the main contractor, `20260919_1309_(AI)E25077 HPC - STA Tuas South Ave 12 - Claim 2.pdf`, is the reference for the certified side.

Also shown: the E25077-2 export warns "Payment terms are empty" (`20260919_1309_inline1_780x914.png`). Payment terms list is still BLOCKED on the client.

### B1. Certified figures come from the updated Progress Claim. PARTLY DONE: billing skill 2026-09-28 (re-upload updates the claim) written, not yet sent to Wendy; not yet tested with a real re-upload
- Wendy fills **Main Contractor's Cumulative Verified** (rate / qty / amount per line) and **Payment Certified** on the cover page of the same claim workbook.
- She then re-uploads the updated Claim 02 together with the Payment Certificate so Accounts can invoice.
- After re-upload, Claim 02 on the dashboard must equal the Excel, including certified figures and per-line verified quantities and differences.
- Same process for Claim 03 onward.
- Screenshots:
  - `20260918_1238_inline1_1281x581.png` / `inline2_927x630.png` (E25067 Mount Alvernia example: verified 1,147.50 vs claimed 1,164.38, difference −16.88; certified 1,125.70 incl. GST)
  - `20260919_1309_inline2_936x409.png` / `inline3_628x396.png` (E25077)
- Implication: re-uploading an existing claim number must **update** that claim, not create a duplicate. It must also land the main-con verified columns per line.

---

## C. CHASE / claims@ central mailbox (17 + 18 Sep)

### C1. Connect claims@conplus.com.sg. TODO (credentials received)
- Wendy sent the webmail (cPanel / Roundcube) URL and password in the 17 Sep email. **Do not copy them into the repo.** Put them in `.env` (e.g. `CONPLUS_CLAIMS_IMAP_*` / `SMTP_*`) and use the mail server's IMAP/SMTP host, not the webmail session URL.
- All claim email goes through claims@: progress claim submission, PC chasing and follow-up, checking for PC receipt, general claim correspondence, client replies and attachments. No individual staff addresses.
- Replaces the current safe sink (`muhsinsbasha@gmail.com`, `GO_LIVE=false`) on the Send-Chase webhook and the future `send_invoice` webhook. Go-live still needs an explicit go-ahead.

### C2. Who sent or handled each email. Q
- Wendy asks how the system will identify the staff member when everyone uses the shared mailbox.
- Proposal: log the app user (the "Acting as" identity or login) on every send, stored as `sent_by` on the chase/email log, plus a `handled_by` on inbound items when someone confirms them. Optionally add a signature line with the staff name.

### C3. Email history per project. TODO
- Project is **mandatory**, Claim No. is **optional**. Some emails relate to a project but not to a claim.
- Keep an email history under the Project, linked to Claim No. / Payment Certificate where applicable.
- Needs an `project_emails` table (direction, from/to, subject, body snippet, attachments, project_id NOT NULL, claim_id NULL, pc_id NULL, handled_by), with a view on the project page.

### C4. Inbound Payment Certificate capture. TODO (design) + feasibility answer owed to Wendy
- Ideal: capture incoming emails and attachments on claims@ automatically, then **suggest** Project / Claim No. for someone to confirm.
- Rules from Wendy:
  - Never assume the PC belongs to the same claim as the email thread.
  - PC formats differ by client, so don't rely on a fixed format.
  - When confidence is low, require manual review.
  - One PC can cover several claims (e.g. E25077 PC-001 → Claims 01 + 02).
  - Some clients never issue a PC. A claim must be able to go to invoicing without one.
- Fallback she asked for: a manual **Record Payment Certificate** form with:
  - Project
  - PC No. / Date
  - Related Claim No.(s), multiple allowed
  - Certified Amount
  - Upload PC
  - Upload updated Progress Claim
  - Remarks
- Suggested build order:
  1. Manual form + `payment_certificates` table + `payment_certificate_claims` link table.
  2. n8n IMAP poll of claims@ → Claude reads each attachment → a suggestion lands in a review queue.
- This replaces today's per-claim `certified_amount` / `prc_date` entry on the chase card.
- **Reply owed:** Wendy asked "Please advise if this workflow is technically feasible." Answer: yes; manual form first, then automatic capture with confirm.

### C5. Accounts / payment. BLOCKED (Chloe)
- Chloe will follow up separately. Same blocker as the invoice template for the Cert → Invoice → Payment step.

---

## D. Material Inventory Movement enhancements (Lynn, 25 Sep). TODO

Source: `20260925_1159_Material Inventory Movement.xlsx`. Column A is Wendy's original spec; column C is Lynn's enhancements. Most of column A already exists (reservations, Available/Reserved, stock-in under PO). The new asks are:

1. **Location on every inventory record: `Site` or `Store`.**
   - PO → Store: stock-in with LOC = Store.
   - PO → Project Site: **now also a stock-in**, with LOC = Site. This reverses the original "Direct delivery, no inventory stock-in" rule. Movement type table row "PO → Project Site" changes accordingly.
2. **Site → Store return** and **Store → Site issue** are recorded in WhatsApp groups today. Examples: "return from Store" (Coway, BBOS-7046 2 sets, use before Aug 2027) and "Draw from Store" (Leadbuild One-North, WG100(7046) 1 set, WL100 RAL7046 2 sets). Embedded pictures: `xlsx_media/20260925_1159_Material Invento__image{1,2}.png`.
   - They want an in-app form: **Create New Template → Enter Data → Save Draft → Edit Draft → Submit → Update Inventory Record**.
   - Fields include **use-before / expiry** per line.
3. **Site consumption:** inventory at LOC = Site is reduced from the **Daily Material Report** ACTUAL figures (material + qty in sets) and posted to the inventory records.
4. Unchanged requirements to keep honouring:
   - Total Physical = Available + Reserved.
   - Reservation is not a stock-out.
   - Full non-overwriting movement history.
   - Traceability chain Material → Movement Type → Qty/UOM → Project/Site → WO → PO/DO → Status.
   - Field list in section 7: Movement Type, Stock Status, Project Code (site auto-fills), Material (UOM auto-fills), Qty, PO/DO/WO No., Date, Remarks.
   - Project Code/Site are mandatory for project movements.

Ties to the open "delivery tracking remainder" (movement types, receipt posts stock-in) from the 16 Sep pickup.

---

## E. Project planning & tracking: Daily reports (Lynn, 18 Sep + R1 on 25 Sep). BUILT 2026-10-02 (Site Reports tab, not yet deployed)

**Status 2026-10-02:** new tab `/site-reports` (Live View header + v1 sidebar), project picked once from a searchable dropdown, three sections:
- **Daily report**: DAILY WORK REPORT header (crew Total counted from the worker numbers, editable) + one DAILY MATERIAL REPORT card per activity in the R1 layout (PLANNED / ACTUAL: Area, Material, Qty In Set, Coverage, Remark; DEFECT: Area, Remark). Save draft before work, finish ACTUAL at the end of the day ("Same as planned" copies it), Submit; submitted is read-only until reopened. A new day starts from that day's weekly plan rows.
- **Weekly plan**: the Monday whiteboard as rows; a row can span days ("14-15/09 Grinding").
- **Dashboard**: the Dashboard Report sheet (WEEKLY PLAN | PLANNED | ACTUAL per date and location), plan days with no report flagged, material planned vs used, Excel export in the sheet's layout (A2 CLIENT / SITE, A3 PROJECT REF, A4 WO, rows from 8).
- DB: `site_weekly_plan`, `site_daily_reports`, `site_report_lines` + RPCs (migration `20261002_site_reports.sql`, applied live; writes only through the RPCs). Verified end to end on E25028 with the sheet's 14-17 Sep figures; test rows deleted.
- Not in this build: ACTUAL posting to Site inventory (needs D1 Site/Store LOC first; `material_id` is already stored), whiteboard-photo transcription, worker roster (crew fields are free text: question for Lynn).

Source: `20260918_1133_Project planning and tracking workflow.xlsx` → revised `20260925_1159_Project planning and tracking workflow (R1).xlsx`.

**Workflow sheet** (unchanged between versions):

| # | Stage | Action | Who | Today |
|---|---|---|---|---|
| 1 | Kick-off | Process, material types and qty (from WO) | Sales, PM/PC | Sales/PM creates a project chat group |
| 2 | Project start | Agree work schedule and phases with client | PM/PC/Supervisor | |
| 3 | Weekly schedule | Weekly schedule + manpower | PC | Monday meeting, whiteboard photo posted to the group |
| 4 | Daily work plan | Area, activities, material, manpower for the day | PC/Supervisors | Before work: DAILY WORK REPORT + DAILY MATERIAL PLANNING REPORT posted |
| 5 | Actual vs plan | Actual material used, area done, manpower | PC | End of day: DAILY MATERIAL REPORT with USED material |

**Dashboard Report sheet:** the target report per project. Example E25028 Straits Construction / Plantation Close, with "WO: (AI to retrieve the last WO)". It has three blocks side by side:
- WEEKLY PLAN: Date, Location, Activities, Area m², Manpower.
- DAILY MATERIAL REPORT (PLANNED): Location, Activities, Area, Manpower, Material, Qty, Coverage, Remarks.
- DAILY MATERIAL REPORT (ACTUAL): Activities, Area, Material, Qty, Coverage, Remarks.

Note on the sheet: this is filled manually from the chat groups today.

**R1 change (yellow):** a new "Proposed" Daily Material Report template (`xlsx_media/…Project planning__image8.png` old vs new):
- Adds **Project No.**
- **Location → Site Location**
- **"Material In Set" split into two fields: Material + Qty In Set**, in both PLANNED and ACTUAL.
- Fields: Date, Activity; PLANNED/ACTUAL each with Area, Material, Qty In Set, Remark, Coverage; DEFECT with Area, Remark.
- The Daily Work Report template (image7) stays: Project No., Date, Site Location, Epoxy System, Activity, Area, Time, Supervisor, Safety Personnel, Men, Supply Men, Total, Days to Complete, Negative Days, Remark, Additional Area & Date.

Build implication: this is the "daily site report form" deferred from 14 Sep, now specified.
- Structured Daily Work Report + Daily Material Report (planned at start of day, actual at end), saved per project/date. Uses the same Draft → Submit flow as D2.
- Actual material posts to Site inventory (D3).
- A per-project Dashboard Report view combines Weekly Plan / Planned / Actual.
- Weekly plan input could accept the whiteboard photo and have Claude transcribe it into rows.

---

## Replies owed to the client (ARCHIVED 2026-09-28: handled on WhatsApp)
1. **Wendy (18 Sep):** feasibility of the claims@ / Payment Certificate workflow (C2 who-sent answer, C4 plan).
2. **Wendy (19 Sep):** acknowledge the Claim 02 mismatch and give a fix ETA (B).
3. **Lynn (18 + 25 Sep):** acknowledge the planning workflow R1 + inventory enhancements; confirm the scope in D and E.

## Still waiting on the client
- Material list with item codes (A3).
- Chloe on Accounts / invoice template (C5).
- Payment terms list (the E25077-2 export warns "Payment terms are empty").
- Carried over: fresh PO_Summary export, reference-period rule, F25040 #3 certified decision, GO_LIVE go-ahead.
