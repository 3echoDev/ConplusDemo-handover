# Spec #4 — Progress Claim document layout

**Target format:** `Progress_Claim.pdf` supplied 2026-08-31 (Claim CLM-E23013-3(Final), Tee Yih Jia Fd Mfg).
Match this layout exactly — same page structure, block order, typography, and totals ladder.

The reference PDF is a zero-value example ($0.00 across the ladder), so this spec fills in what a populated claim must show alongside what's already visible on the reference.

---

## 4.1 Page structure (top to bottom)

### Block 1 — Masthead
- Left: `CONPLUS RESOURCES PTE LTD` (large, bold) with tagline `Protective Coatings · Flooring · Waterproofing` underneath.
- Right: `PROGRESS CLAIM` (large, bold) with reference line underneath:
  ```
  <claim_number> · Claim No. <period_number>
  ```
  where `<claim_number>` uses the existing `CLM-<project>-<n>` scheme. Append `(Final)` inside the number when `claims.is_final = true` — e.g. `CLM-E23013-3(Final)`. This is a new flag; if the column doesn't exist yet, add it as `boolean default false` (developer task).

### Block 2 — Parties
Two side-by-side cards, equal width, thin separator between them.

**Left — TO (MAIN CONTRACTOR / RESPONDENT)**
```
<client_name — bold>
<contact_name> · <contact_phone>
```
Source: `projects.client_name`, plus the client's main contact.

**Right — FROM (CLAIMANT)**
```
Conplus Resources Pte Ltd
10 Admiralty Street #02-26, North Link Building, Singapore 757695
qs@conplus.com.sg / contract@conplus.com.sg
```
Hardcoded from company profile settings. Do not vary per project.

### Block 3 — Info grid
Two columns, three rows each, dotted-underline label/value style (as in reference):

| Left col | Right col |
|---|---|
| PROJECT · `<projects.project_code>` | PROJECT CODE · `<projects.project_code>` |
| CLAIM DATE · `<claims.claim_date, dd MMM yyyy>` | PAYMENT TERMS · `<projects.payment_terms>` |
| WO / PO REF · `<claims.wo_po_ref or 'NIL'>` | STATUS · `<claims.status, capitalised>` |

Notes:
- `CLAIM DATE` on the reference is `—` because the field was empty; render actual date when populated, `—` otherwise.
- `PAYMENT TERMS` on the reference is `—`; needs population from `projects.payment_terms` (existing column per skill).
- `WO / PO REF` renders `NIL` when null.
- `STATUS` styled as bold (right-aligned).

### Block 4 — Payment Claim Particulars

Section title on its own line, bold, left-aligned. Below it:

**Left side of page** — line-item tables (see §4.2). On the reference the left is blank because the sample claim has no lines.

**Right side of page** — the totals ladder, right-aligned block, ~50% page width. Rows:

| Row label | Value | Notes |
|---|---|---|
| **Total Value of Work Done** | Σ `claim_lines.cum_amount` (A + B) | Bold row |
| Less: Retention `<pct>%` — capped at `<cap_pct>%` of sub-contract sum (`<capped_amt>`) | −`<retention_amount>` | The subtitle text must show the capped ceiling dollar amount in brackets, matching the reference: `Less: Retention 10% — capped at 5% of sub-contract sum ($4,965.30)` |
| Net Amount | subtotal after retention | |
| Less: Amounts Previously Certified | −Σ `prev_amount` | |
| **Claim Amount** | Net − Previously Certified | Bold row, larger |
| Add: GST (9%) | Claim Amount × 0.09 | |
| **Claim Amount incl. GST** | Claim Amount × 1.09 | Bold row, largest |

Match the reference's row weights: bold for Total Value of Work Done, Claim Amount, and Claim Amount incl. GST.

### Block 5 — Footer note
Small grey text at the bottom:
```
Retention applied at the sub-contract rate, capped per the sub-contract sum. Previous / current / cumulative per claim line.
```
Hardcoded verbatim from reference.

---

## 4.2 Line-item table (left side of Payment Claim Particulars)

Not present on the reference (zero-line claim), but a real progress claim will have this. Structure per the ops skill:

**Two sections**, in order:
- **Section A — Sub-Contract Works**
- **Section B — Variation Works**

Each grouped by `claim_lines.quotation_ref` under a section subheader, then line rows:

| Column | Source |
|---|---|
| Pg. Ref | `pg_ref` (A1, A2, B1…) |
| Description | `description` |
| Unit | `unit` (constrained set: `m2, mr, lot, pc, LS, set, kg, item`) |
| Qty | `qty` (contract quantity) |
| Rate | `rate` |
| Prev Qty / Amount | `prev_qty` / `prev_amount` |
| Curr Qty / Amount | `curr_qty` / `curr_amount` |
| Cum Qty / Amount | `cum_qty` / `cum_amount` |

Section subtotals under each `quotation_ref` group. Grand subtotals per section (A, B). Sum of A + B feeds the "Total Value of Work Done" row on the right.

**Verified/certified columns are NOT shown on the outgoing Progress Claim** — those live on the internal dashboard (Spec #3). This document is what we send to the main contractor; it shows what we're claiming, not what they've certified.

---

## 4.3 Data population — fill the gaps

The reference PDF shows several empty fields (`—`, `NIL`, `$0.00`). Those need populating from real data before the document is fit to send. Not layout bugs, but flag them in the app so the user can't accidentally issue an empty claim:

- Warn on export if `claims.claim_date` is null
- Warn on export if `projects.payment_terms` is null
- Warn on export if the claim has no lines
- Warn on export if `Total Value of Work Done = 0`

---

## 4.4 Retention subtitle — computed values

The subtitle text under "Less: Retention" is dynamic:

```
Less: Retention <retention_pct>% — capped at <retention_cap_pct>% of sub-contract sum ($<cap_amount>)
```

Where:
- `retention_pct` = `projects.retention_pct` (default 10)
- `retention_cap_pct` = `projects.retention_cap_pct` (default 5)
- `cap_amount` = `projects.contract_value × retention_cap_pct / 100` (formatted as `$X,XXX.XX`)

The reference shows `$4,965.30` — matching a $99,306 sub-contract at 5%. Verify the formula against a live case before shipping.

---

## 4.5 What is deliberately NOT in this spec
- **PDF pagination** — assume single-page for typical claims; long line-item tables that wrap must repeat the header row, no separate spec needed here.
- **Signature block** — the reference doesn't show one. Confirm whether Progress Claims need "signed by / received by" fields; if yes, spec separately.
- **VO/variation cross-reference to the source quotation** — line-item `quotation_ref` is the link; no additional column needed on the document.

---

## Acceptance
Regenerate a Progress Claim (pick a claim with real lines, e.g. one of F23012's periods). The output PDF must:
- [ ] Reproduce the masthead exactly — CONPLUS block left, PROGRESS CLAIM + reference line right.
- [ ] Show TO and FROM as two side-by-side cards with the wording above.
- [ ] Show the six info-grid fields with the reference's dotted-underline styling.
- [ ] Render the totals ladder with row weights matching the reference (bold on Total Value of Work Done, Claim Amount, Claim Amount incl. GST).
- [ ] Show the dynamic retention subtitle with the correct cap dollar amount.
- [ ] Populate the left-side line-item table with Section A / Section B rows and prev / curr / cum columns.
- [ ] End with the exact footer note text from the reference.
- [ ] Append `(Final)` to the claim number when `is_final = true`.
