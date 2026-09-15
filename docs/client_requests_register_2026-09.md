# ConPlus — client requests register (email thread "amendments and additions to dashboard")

Compiled 2026-09-15 from the Gmail thread, messages from **Mon 31 Aug 2026** onward (the 4 Sep cut-off plus the 31 Aug message the later ones refer back to). Each request is checked against the code in `ConplusDemo-handover` (main, head `d311880`) and the live database.

Legend: **Done** = live on https://conplus-live.vercel.app · **Partial** = built but a piece is missing · **Open** = not started · **Client** = waiting on ConPlus

Referenced files pulled from the thread are in this folder (`Desktop/Changes/thread_2026-09/`) and in `Desktop/Changes/` (the 9 Sep attachments).

---

## 1. Messages on/after 4 Sep 2026

### Fri 4 Sep, 16:09 / 16:24 / 16:55 — Wendy: cannot upload the skill files
| Request | Status | Evidence |
|---|---|---|
| Skill zip would not load into Claude | **Done** | Re-sent as `Conplus-Skills.zip` (one skill at a time); Wendy confirmed "Okay, done" at 16:55 |

### Fri 4 Sep, 17:07 — Wendy: PO discounts
| Request | Status | Evidence |
|---|---|---|
| Keep **Disc/Unit** (per-unit discount) and add a second **Discount** field = lump sum off the total. Example: 47 sets × $270 − $20/unit = $11,750 | **Done** | Commit `176ed1d` "PO: add lump-sum Discount field (subtracts from Total)"; `po_line_items.disc_per_unit` + PO-level discount in `src/lib/poDocument.ts` (Excel + print). |
| Caveat | **Done 15 Sep** (`35a04c3`) | Create PO dialog now has per line: stock-linked material picker, Unit, Qty, Unit Price, Disc/Unit, Amount; plus Subtotal → lump-sum Discount → GST → Total. |

### Fri 4 Sep, 17:31 — Wendy: Project Reference Report (Epoxy only)
| Request | Status | Evidence |
|---|---|---|
| Asking the AI for an Epoxy-only Project Reference Report returned only a few projects. Source must be the **Project Ref – Standardized** sheet (all projects, ongoing + completed), filtered on **STANDARDIZED TYPE OF WORK** (Epoxy vs MISC colour bands), not the Prog Claims sheet (current-period claims only). | **Done 15 Sep** (`35a04c3`) — /reports/project-reference: the Standardized tab (1,014 entries) is now the project master in the app, consolidated to 668 projects, Epoxy / MISC / All bands + type chips + rep + year + search, Excel export in her report layout, drop-zone to re-upload the Claim Summary workbook. | Attached `Epoxy_Project_References.xlsx` (115 projects) and screenshot of the Standardized sheet are in this folder. Root cause: the app's `projects` table holds **184** projects (63 with claims) vs **~2,000 rows** in Project Ref – Standardized; `work_type_code` is empty on 112 of the 184. The Standardized sheet was never imported, so neither the skill nor the app can produce this report. Fix = import that sheet as the project master (code, type of work, standardized code) and add a "Project Reference Report" export with a type-of-work filter. |

### Sat 5 Sep, 10:05 — Wendy: PO unit = packing size
| Request | Status | Evidence |
|---|---|---|
| PO **Unit** column must show the packing size, e.g. `25 KG/SET`, `5 L/BAG`, `5.5 KG/PAIL` (see `PO 2608-0014 Sto (Coway - Seletar Factory).pdf`, units `30kg/set`, `10kg/set`) | **Done 15 Sep** (`35a04c3`) — Unit field on every PO line, defaulting to the material's packing size from the inventory master (e.g. 10kg/set) when the material is picked from stock; editable. | Existing PO lines already use that convention (top values in DB: `12kg/set`, `40kg/bag`, `30kg/set`, `20kg/set`, `18L/tin`) and the PO document prints the Unit column. Gap: the Create PO dialog has no Unit field, and 135 of 365 materials now carry `stock_unit` (e.g. `10kg/set`) from the 9 Sep Material sheet that could default it. |

### Mon 7 Sep, 16:00 + Wed 9 Sep, 13:33 — Lynn: daily site report form
| Request | Status | Evidence |
|---|---|---|
| Replace the per-project WhatsApp group posts (weekly schedule, daily pre-start report, standby material, end-of-day used material — see `Daily Operation Work Flow Chat Group.pdf`) with a mobile form: **New Template → Enter Data → Save Draft → Edit Draft → Submit → Record Stored**. Same record opened at start of work and completed at end of work. Output to an Excel file on their server. | **Open** | Not started. Closest asset: `site-ops` skill + `fill_wdr.py` in `conplus-chain-skills.zip` (not installed). Lynn's 14 Sep follow-up: a freelancer has drafted a template for this; meeting requested. |

### Wed 9 Sep, 15:52 — Wendy: responses to our follow-up items
| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Sales team will copy material names from Material_Inventory_Record into the WO | **Done** | Material picker in Create WO resolves pasted names (`src/lib/materialMatch.ts`, CP01, 171/171 matched). Note: the 9 Sep workbook renamed the catalog (RAL codes); it was imported live on 15 Sep, so pasted names now match the new list. |
| 2 | PO approval to the boss by **email** (conplus@singnet.com.sg) **and WhatsApp** (+65 9631 3288) | **Partial** | Email: built (n8n `1lZC1m6pufwFMXBd`, fires when a PO goes pending, links to Store Health approvals) but `GO_LIVE=false` — still delivered to the handover inbox. WhatsApp: **parked** by decision on 15 Sep (email first); path when resumed = Z-API node in the same workflow. Approve/Reject is done in the app (Store Health → Pending approvals). |
| 3 | Use **claims@conplus.com.sg** for certificate chase reminders | **Partial** | Reply-To set to claims@conplus.com.sg on both send workflows. Sending *from* that mailbox needs its credentials (not received). Sends still go to the handover inbox until GO_LIVE. |
| 4 | Delivery tracking per `ConPlus_System_Requirements.xlsx` | **Partial** | 137 requirements mapped (`docs/cp04_requirements_map.json`). Built: per-line partial receipts + PO status Pending/Partial/Fully Delivered (11 Sep), **DO photo scan** prefill (15 Sep), **Available vs Reserved** stock + per-project reservations + WO auto-reserve (15 Sep). Still open: site-return / direct-to-site movement types, auto stock-in on receipt, 5 clarify items. |
| 5 | Customer payment terms list | **Client** | Not received. Per-project `payment_terms_days` is already supported (default 35). |
| — | Supplier invoices/DOs for 2608-0009, 2609-0003, 2607-0006 | **Client** | Only `2607-0006 - 7220038808, 80067779.pdf` arrived, and its PO number does not match the system PO 2607-0006 (Mansor). Registered as unmatched (CP06). |

### Wed 9 Sep, 15:52 — Wendy: system queries
| # | Query | Status | Evidence |
|---|---|---|---|
| 1 | Management Summary: E25077 contract value missing under Sales Mgr Wan Fern | **Done** | Cause: `sales_manager` stored as free text "Ng Wan Fern" ≠ canonical "WAN FERN". Alias + normalising trigger + data fix (CP07). |
| 2 | Chase (E25057 claim 1): PRC received, invoice submitted, $350 entered but not saved | **Done / Client** | Cause: browser key had SELECT-only rights on `claims`; writes silently did nothing. All claim writes now go through `update_claim` RPC and persist (CP08, verified). The values Wendy typed before the fix were lost — **she must re-enter them** (still empty in DB on 15 Sep). 15 Sep additions: a saved certified amount now shows on the card ("certified $X · $Y balance"). |
| 3 | Difference between "Edit Draft" and "Manual"; what "Edit" means | **Done** | Buttons now "Edit draft" (this cycle's scheduled reminder) vs "Manual reminder" (extra, does not advance cadence); both open an editable subject/body; tooltips + in-modal explanation (CP09). "Log as Sent" / "Skip This Cycle" close the editor. 15 Sep: **Email templates** button lets them change the default wording per stage. |
| 4A | Progress Claim: use `(Corrected) E25077_HPC_STA_Progress_Claim_01.xlsx` as the master format | **Done** | Layout reproduced in `src/lib/claimExcel.ts` (CP10), fixture-tested. |
| 4B | Submitted claim: claim lines not viewable after submission | **Done** | `claim_lines` had no write path; lines loaded from the corrected master and `ClaimLinesEditor` added (CP11). E25077 claim 1 now has 11 lines. |
| 4C | Retention amount not showing on Progress Claim 01 | **Done** | Stored 538.20 was never mapped; generator now uses stored retention (CP12). |

### Mon 14 Sep, 14:04 — Lynn: follow-up
| Request | Status |
|---|---|
| Progress on the site-report form; freelancer has a template for update/submit/store; asks to meet | **Open / Client** — no reply sent yet; meeting to be scheduled. |

---

## 2. The 31 Aug message the above builds on (for completeness)

| # | Request | Status | Evidence |
|---|---|---|---|
| 0 | Prefers a **web-based** solution, Claude only when needed | **Done (direction)** | Everything since is web-first: Store, Deliveries, Reservations, Stock Import, Chase, New claim, templates. |
| 1a | WO: Excel says sets, printed WO says kg | **Done** | `28bd272` — qty printed in pack units; header "ORDER QTY (SET)". |
| 1b | WO: "Level 1" should not appear in Remarks | **Done** | `28bd272` (`cleanRemark`). |
| 1c | WO: add Contact Person | **Done** | `28bd272` (embedded from projects). |
| 1d | WO alternative: web page to change WO qty & pricing | **Done** | `33d3704` — "Edit qty & pricing" inline editor on Works Orders. |
| 2 | PO: follow template `(7) PO 2608-0014 Sto (Coway – Seletar factory)` + reference `PO 2607-0018` | **Done** | `323b6b2` Spec 2 (columns, Attn, Vendor Ref, Delivery Address, discounts, delivery charge, chop box); styled Excel `1ef7ae6`. |
| 3 | Claims sheet: Retention field + Certified status; F23012 formulas (Balance to claim, Outstanding incl/excl retention) | **Done** | `28bd272` Spec 3; all 6 formulas verified against the mapping table. Live gap is data: F23012 claims #1–9 never imported, retention null on old rows. |
| 4 | Progress Claim template `(14) Conplus_Progress_Claim Template` | **Done, then superseded** | `323b6b2` Spec 4; replaced by the Corrected E25077 master on 9 Sep (CP10). |
| 5 (17:22) | Minimise the Stock Watchlist in Live View; click-to-expand | **Partial** | `3ac990c` collapses to the first 6 items with "View all". Not grouped-by-supplier expanders as asked. |

---

## 3. What is left, in priority order

1. **Daily site report form** (Lynn, 7/9/14 Sep) — open; meeting with the freelancer's template first.
2. ~~Project Reference Report~~ — done 15 Sep.
3. ~~Create PO dialog fields~~ — done 15 Sep.
4. **GO_LIVE** for PO approval email and chase sends (needs the client's go-ahead); claims@ mailbox credentials optional.
5. **Stock Watchlist** — expand-by-supplier as originally asked.
6. Delivery-tracking leftovers: site-return / direct-to-site movement types, auto stock-in on receipt, 5 clarify items.
7. **Client to provide**: re-enter E25057 claim-1 values; payment terms list; 2608-0009 and 2609-0003 supplier invoices/DOs; PO numbering confirmation for 2607-0006.

## 4. Files referenced in the thread and where they are

| File | Where |
|---|---|
| `Epoxy_Project_References.xlsx` (AI output Wendy questioned, 4 Sep) | this folder |
| Project Ref – Standardized screenshot (4 Sep) | this folder, `image_173725.png` |
| `PO 2608-0014 Sto (Coway - Seletar Factory).pdf` (5 Sep; page 1 rendered as `po_2608-0014_p1.png`) | this folder |
| `(3.1) Claim Summary Sep25 - Aug26.xlsx` (has the Standardized tab, ~2,000 rows) | `Desktop/3Echo/Docs/Doc (24.08.26)/` |
| `Daily Operation Work Flow Chat Group.pdf` (7 Sep) | `Downloads/` |
| `ConPlus_System_Requirements.xlsx`, audit docx, E25077 claim files, `2607-0006 - 7220038808, 80067779.pdf`, `image004/005/008/010/012` (9 Sep) | `Desktop/Changes/` |
| `Material_Inventory_Record.xlsx` (9 Sep version, applied live 15 Sep) | `Downloads/Material_Inventory_Record(1).xlsx` |
