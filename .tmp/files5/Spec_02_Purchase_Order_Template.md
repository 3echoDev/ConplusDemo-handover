# Spec #2 — Purchase Order template alignment

**Reference (current):** `PO 2607-0018 STO — Piccadilly Northumberland` (app-generated, attached)
**Reference (target):** `PO 2608-0014 STO — Coway Seletar factory` (screenshot only, image #4 in the feedback thread)

The Coway PO is the shape the team uses in the real world. The current app output is missing several columns and totals rows that appear on it. This spec closes that gap.

> ⚠️ Only a small screenshot of the Coway PO was shared. Confirm the exact field labels and column widths against a full-size copy before final layout. Fields below are what I could identify from the callouts (red boxes) and from what the current PO lacks.

---

## 2.1 Header — additional fields

The current PO already carries: PO No, Vendor, Project Site, Works Order, Ship To, Requested By, PO Date, Required Date, Project Code, Currency, Payment Terms, Status.

Add:

| Field | Source | Notes |
|---|---|---|
| **Delivery Address** | `works_orders.site_address` | Distinct from "Ship To" (which today reads the project name). The physical delivery address, formatted as a block — needed by the driver/vendor's dispatcher. |
| **Delivery Contact** | `works_orders.site_contact` + `site_contact_number` | Who the vendor coordinates with on site. |
| **Our PO Ref** | current `po_number` value | Same as PO No, keep for visual consistency with Coway PO. |
| **Vendor Ref / Quotation** | new field `purchase_orders.vendor_quotation_ref` | The vendor's own quote number this PO is against. Optional. |
| **Attn** | new field `purchase_orders.attn_name` | Person at the vendor the PO is directed to — separate from the vendor's general Contact Person. |

---

## 2.2 Line item table — additional columns

Current line item columns: `S/NO | ITEM DESCRIPTION | QTY | UNIT PRICE | AMOUNT`

Target columns:

| Column | Source | Notes |
|---|---|---|
| S/NO | derived | as today |
| ITEM DESCRIPTION | `po_line_items.description` | as today |
| **UNIT** | `po_line_items.unit` (new) or joined `materials.stock_unit` | e.g. `set`, `pail`, `bag`, `kg`. Currently the unit is baked into the description. |
| QTY | `po_line_items.qty` | numeric only, unit lives in the UNIT column |
| UNIT PRICE | `po_line_items.unit_price` | as today |
| **DISCOUNT** | new field `po_line_items.discount_pct` or `discount_amt` | Vendor-negotiated line discount. Nullable — hide the column when no line has a discount, else show. |
| AMOUNT | derived: `qty × unit_price × (1 − discount_pct)` | update the generated column formula |

---

## 2.3 Totals block — additional rows

Current totals: `Subtotal | GST (9%) | Total`

Target totals:

| Row | Formula | Notes |
|---|---|---|
| Subtotal | Σ line amounts | as today |
| **Line Discount Total** | Σ line discounts | show only when non-zero |
| **Delivery Charge** | new field `purchase_orders.delivery_charge` | Nullable; when set, adds to subtotal before GST |
| GST (9%) | `(Subtotal − Discount + Delivery) × 0.09` | as today, on the adjusted base |
| Total | sum of the above | as today |

---

## 2.4 Signature block

Current: `REQUESTED BY | APPROVED BY | VENDOR ACKNOWLEDGEMENT` — three signature lines only.

Add a labelled **Chop / Stamp** area (top-right of the signature block or replacing "Vendor Acknowledgement") sized for a physical company chop. Vendors sign and chop; the current three-underscore layout leaves nowhere for the chop.

---

## 2.5 Footer note

The Coway PO carries a standing footer note (visible but not readable in the screenshot). Likely one of:
- Payment terms reminder
- Delivery instruction ("Deliver between 9am–5pm, notify one day in advance")
- GST reg no / company details

**Action:** confirm the exact wording with the team before implementing. Store as a project-wide setting (`app_settings.po_footer_note`) so it can be updated without a code change.

---

## 2.6 Data model changes

New columns on `purchase_orders`:
- `vendor_quotation_ref` — text, nullable
- `attn_name` — text, nullable
- `delivery_charge` — numeric(12,2), default 0

New columns on `po_line_items`:
- `unit` — text, nullable (falls back to joined `materials.stock_unit`)
- `discount_pct` — numeric(5,2), default 0
- The generated `amount` column formula changes; update the trigger accordingly.

These are DDL and outside the ops assistant's scope — flag them as developer migration work.

---

## Acceptance
Regenerate PO 2607-0018. The PDF must:
- [ ] Show a delivery address block separate from "Ship To"
- [ ] Show Attn / Vendor Quotation Ref rows in the header
- [ ] Include UNIT and (when relevant) DISCOUNT columns in the line table
- [ ] Include Delivery Charge and Discount Total rows in the totals block when populated
- [ ] Leave chop-sized space in the signature area
- [ ] Match the Coway PO layout side-by-side (confirm with a full-res copy before shipping)
