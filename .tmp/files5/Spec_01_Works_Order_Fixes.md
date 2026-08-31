# Spec #1 — Works Order fixes (print output + editable web view)

**Reference case:** WO 24054.1R1 — E24011 (China Construction / Piccadilly Northumberland Rd)
**Reference files:** `Works_Order_WO24054_1R1-E24011_Completed.xlsx` (current app output),
`Works_Order_24054.1_R2_China_Con_Race_Course_Rd.xlsm` (hand-made original — the target look for description/remarks)

---

## 1.1 Bug — "Order Qty" prints in kg instead of sets

### Current
The printed WO's Order Qty column shows the material in **kilograms** (e.g. `160 kg`, `60 kg`).

### Expected
Show the same figure the DB stores in `works_order_lines.order_qty` (or `required_qty` when `order_qty` is NULL), followed by the unit **`sets`**, singular `set` when qty = 1.

Examples from the completed Excel that must render verbatim in print:

| Line | Print value |
|---|---|
| StoCrete PU SM 1mm (Carpark Lot) | `84 sets` |
| StoPox WL 100 (base coat) | `10 sets` |
| StoPox WL 100 - EV Lot | `1 set` |

### Root cause hint
Somewhere in the PDF/print generator the qty is being multiplied by `works_order_lines.packing_size` (kg/set) — turning `84 sets × 19.9 kg/set = 1,671.6 kg` and rounding. Remove that multiplication. The Excel export already shows `sets` correctly, so the divergence is print-only.

### Column header
Rename the column header on the printed WO to **`ORDER QTY (SET)`** to match the Excel (currently reads `ORDER QTY` and the unit is inferred).

### Additive rows exception
Rows where `is_mix_component = true` and the material's stock unit is `bag` (e.g. `G80 AO` — 25 kg/bag, ordered as `11 bags`) should print in **bags**, not sets. Use `materials.stock_unit` to drive the unit label.

---

## 1.2 Bug — "Level 1 -" prefix appears in Remarks

### Current
Remarks column reads:
```
Level 1 - Carpark Lot 874.8 m² — Special mix without coarse sand
Level 1 - Add 10% water, Add 7% G80 AO
```

### Expected
Remarks holds only the formulation/note, verbatim from `works_order_lines.remarks`:
```
Carpark Lot 874.8 m² — Special mix without coarse sand
Add 10% water, Add 7% G80 AO
```

The level and area are already the section header (`Level 1 - Carpark Lot 874.8 m² & Driveway 1,022.54 m² & EV Lot 57.65 m²`). Repeating them in every line's Remarks is noise.

### Fix
The generator is currently prepending `{area.level_label} - ` to each line's remark before print. Strip that prepend. If a row is missing a remark, print an empty cell — never fall back to the level label.

---

## 1.3 Enhancement — Add "Contact Person" to the WO header

### Current
The printed WO shows:
- `CONTACT PERSON` — currently populated with the **project's** main contact (`Lim Tian Yeow (6390 2923)`)
- `SITE CONTACT` — site delivery contact (`Mr Zaw (8571 6383)`)

### Expected
Both fields exist in the DB (`site_contact` / `site_contact_number` for site; project's client contact for the other). The Excel output has them (rows A7, A8). Confirm they render in **all** printed variants — PDF, email, mobile view. The hand-made R2 reference shows both fields distinctly labelled:
```
Contact Person : Lim Tian Yeow 6390 2923
Site Contact Person : Mr Zaw 8571 6383
```

### Fix
1. Where does the app store the project's client contact person? If there's no dedicated column on `projects` (only client-level), add reading from the client table.
2. Ensure the print template has **both** labelled rows, not one merged "Contact" row.
3. Both must survive PDF export.

---

## 1.4 Enhancement — Editable web view for qty & unit price

Reference: prototype screenshot titled *"WO24054.1R1-E24011 — Epoxy Coating (Level 1, 2 & 3)"*.

### Motivation
Users want to open a WO in the web app, edit `order_qty` and `unit_price` inline per line, watch line totals and section subtotals recompute live, and export to Excel/PDF — without a Claude round-trip.

### Page layout

**Header block** (top of page)
- Title: `<wo_number> — <coating_system_summary>` (e.g. `WO24054.1R1-E24011 — Epoxy Coating (Level 1, 2 & 3)`)
- Small tip line under the title, e.g. *"Grouped by area. Type quantity — cost auto-totals per line and per area."*

**Per level → per area** — sections stacked down the page (not tabbed), all visible at once for scroll-review:

```
Level 1
  ─ Carpark Lot     [area m²]                                    [section total →]
    Row  Description                 Dosage    Packing    Unit Price    Order Qty    Line Total
    ...
  ─ Driveway        [area m²]                                    [section total →]
    ...
  ─ EV Lot          [area m²]                                    [section total →]
    ...
Level 2
  ...
```

**Row columns:**

| Column | Editable? | Source |
|---|---|---|
| Description | no | `works_order_lines.description` |
| Dosage | no | `works_order_lines.dosage` (kg/m²) |
| Packing | no | `works_order_lines.packing_size` (kg/set) |
| Unit Price | **yes** | `works_order_lines.unit_price` — inline number input, right-aligned, currency |
| Order Qty | **yes** | `works_order_lines.order_qty` — inline number input, right-aligned, with the unit label (`sets`, `bags`) appended |
| Line Total | derived | `order_qty × unit_price` |

**Section subtotal** shows on the right of each area's header bar and updates live.

**Grand total** at the bottom of the page: overall value + GST + inc. GST.

### Behaviour
1. Values load from `works_order_lines` for the WO. `required_qty` (trigger-computed) is shown as a small grey hint next to the Order Qty input when the two differ (`req 25`), matching the print rule.
2. Editing any input recomputes line, section, and grand totals **locally** — no autosave on every keystroke.
3. A sticky footer bar shows **Save changes** and **Discard**. Save writes back to `works_order_lines` (only the two editable columns) and stamps `updated_at`; audit log picks it up automatically.
4. **Export Excel** / **Export PDF** buttons re-render the printed WO from the current DB state (post-save).

### Guards
- Read-only when `status IN ('completed', 'pending_invoice')` — inputs render as plain text.
- A "modified from award" badge appears in the header whenever any `order_qty` on this WO differs from its `required_qty`.
- If Save fails on any row, the whole batch rolls back and the failing row is highlighted with the error.

### Non-goals (this spec)
- No editing of description, dosage, packing, area sqm, or adding/removing lines — those stay in the create/revise flow.
- No re-run of the trigger to overwrite `required_qty` from the new `order_qty`. `required_qty` remains the source of truth for "what the award said"; `order_qty` is the operational override.

---

## Acceptance
Re-generate WO 24054.1R1-E24011. The printed PDF must:
- [ ] Show `84 sets`, `10 sets`, `1 set`, `11 bags` (last row) — never kg.
- [ ] Show Remarks without any `Level N -` prefix.
- [ ] Show both `Contact Person` and `Site Contact` labelled rows.
- [ ] Match the layout of the hand-made R2 reference within reason.
