// Printable PO form, modelled on the client's "Purchase Order - MISC template"
// layout (header fields + item table + totals). Print-to-PDF via the browser.
import type { PurchaseOrder } from "@/data/sampleData";
import { exportRecordToExcel, type RecordSection } from "@/lib/exportData";

const money = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

// Standing correspondence note carried by every Conplus PO (from the real Coway
// PO footer). Spec 2.5 wants this in app_settings.po_footer_note; until that
// table exists it lives here so the layout matches the reference.
const PO_FOOTER_NOTES = [
  "1. Please quote our Purchase Order Number on all related correspondence.",
  "2. Please notify us immediately if you are unable to deliver by the required date.",
  "3. Send all correspondence to: Wendy Wong · 10 Admiralty Street #02-26, North Link Building, Singapore 757695 · Tel: +65 6753 9939 | Fax: +65 6753 9949 · Email: contract@conplus.com.sg",
];
const PO_GOVERNING_NOTE =
  "This Purchase Order shall be governed by Conplus Resources Pte Ltd's standard terms and conditions of purchase.";

export function buildPOHtml(po: PurchaseOrder, opts: { autoPrint: boolean }) {
  const hasDiscount = po.items.some((i) => (i.discountPct ?? 0) > 0);

  const lineNet = (i: { qty: number; unitPrice: number; discountPct?: number }) =>
    i.qty * i.unitPrice * (1 - (i.discountPct ?? 0) / 100);

  const rows = po.items
    .map(
      (i, n) => `
      <tr>
        <td class="c">${n + 1}</td>
        <td>${escapeHtml(i.material)}</td>
        <td class="c">${escapeHtml(i.unit || "—")}</td>
        <td class="r">${i.qty}</td>
        <td class="r">${money(i.unitPrice)}</td>
        ${hasDiscount ? `<td class="r">${i.discountPct ? `${i.discountPct}%` : "—"}</td>` : ""}
        <td class="r">${money(lineNet(i))}</td>
      </tr>`
    )
    .join("");

  // Totals (spec 2.3). Line amounts are already net of discount; the discount
  // total row is informational and is not subtracted again.
  const subtotal = po.items.length
    ? po.items.reduce((s, i) => s + lineNet(i), 0)
    : po.amount;
  const discountTotal = po.items.reduce(
    (s, i) => s + i.qty * i.unitPrice * ((i.discountPct ?? 0) / 100),
    0
  );
  const delivery = po.deliveryCharge ?? 0;
  const gstBase = subtotal + delivery;
  const gst = po.items.length ? Math.round(gstBase * 0.09 * 100) / 100 : po.gst;
  const grand = gstBase + gst;

  const colSpan = hasDiscount ? 7 : 6;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${po.poNumber} — Purchase Order</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 40px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 12px; }
  .co { font-size: 20px; font-weight: 800; letter-spacing: 1px; }
  .co small { display: block; font-size: 10px; font-weight: 400; letter-spacing: 3px; color: #555; }
  .title { font-size: 22px; font-weight: 700; text-align: right; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 32px; margin: 18px 0; }
  .meta div { display: flex; justify-content: space-between; border-bottom: 1px dotted #bbb; padding: 3px 0; }
  .meta span:first-child { color: #555; font-weight: 600; text-transform: uppercase; font-size: 10px; }
  .vendor-addr { font-size: 10px; color: #444; border-bottom: 1px dotted #bbb; padding: 4px 0; margin-bottom: 6px; }
  .blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
  .vendor-block { border: 1px solid #ccc; padding: 8px 10px; }
  .vendor-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #666; margin-bottom: 4px; }
  .vline { display: flex; gap: 10px; font-size: 10px; padding: 2px 0; }
  .vline span { color: #666; font-weight: 600; text-transform: uppercase; min-width: 92px; }
  .vline b { flex: 1; }
  .vendor-addr span { font-weight: 700; color: #555; margin-right: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f0f0f0; border: 1px solid #999; padding: 6px; font-size: 10px; text-transform: uppercase; }
  td { border: 1px solid #999; padding: 6px; }
  .c { text-align: center; } .r { text-align: right; }
  .totals { margin-top: 12px; margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #111; font-weight: 800; font-size: 14px; }
  .foot { margin-top: 40px; display: flex; justify-content: space-between; gap: 24px; align-items: stretch; }
  .sig { flex: 1; border-top: 1px solid #111; padding-top: 6px; font-size: 10px; color: #555; text-transform: uppercase; }
  .chop { flex: 1; border: 1px dashed #999; border-radius: 4px; min-height: 90px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: .5px; }
  .notes { margin-top: 22px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9px; color: #555; line-height: 1.5; }
  .notes p { margin: 2px 0; }
  .notes .gov { margin-top: 6px; font-style: italic; color: #777; }
  .status { margin-top: 14px; font-size: 10px; color: #777; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <div class="head">
    <div class="co">CONPLUS RESOURCES PTE LTD<small>Protective Coatings · Flooring · Waterproofing</small></div>
    <div class="title">PURCHASE ORDER</div>
  </div>
  <div class="meta">
    <div><span>PO No</span><b>${escapeHtml(po.poNumber)}</b></div>
    <div><span>PO Date</span><b>${escapeHtml(po.createdDate)}</b></div>
    <div><span>Vendor</span><b>${escapeHtml(po.supplier)}</b></div>
    <div><span>Required Date</span><b>${escapeHtml(po.deliveryDate)}</b></div>
    <div><span>Our PO Ref</span><b>${escapeHtml(po.poNumber)}</b></div>
    ${po.vendorQuotationRef ? `<div><span>Vendor Ref / Quotation</span><b>${escapeHtml(po.vendorQuotationRef)}</b></div>` : ""}
    <div><span>Project Site</span><b>${escapeHtml(po.project)}</b></div>
    <div><span>Project Code</span><b>${escapeHtml(po.projectCode || "—")}</b></div>
    <div><span>Works Order</span><b>${escapeHtml(po.worksOrder || "—")}</b></div>
    <div><span>Currency</span><b>SGD</b></div>
    <div><span>Ship To</span><b>${escapeHtml(po.shipTo || po.project)}</b></div>
    <div><span>Payment Terms</span><b>${escapeHtml(po.paymentTerms || "—")}</b></div>
    <div><span>Requested By</span><b>${escapeHtml(po.requestedBy || "—")}</b></div>
    ${po.attnName ? `<div><span>Attn</span><b>${escapeHtml(po.attnName)}</b></div>` : ""}
    <div><span>Status</span><b style="text-transform:capitalize">${escapeHtml(po.status)}</b></div>
  </div>
  <div class="blocks">
    ${
      po.supplierAddress || po.supplierContact || po.supplierPhone || po.supplierEmail
        ? `<div class="vendor-block">
             <div class="vendor-title">Vendor Details</div>
             ${po.supplierAddress ? `<div class="vline"><span>Address</span><b>${escapeHtml(po.supplierAddress)}</b></div>` : ""}
             ${po.supplierContact ? `<div class="vline"><span>Contact Person</span><b>${escapeHtml(po.supplierContact)}</b></div>` : ""}
             ${po.supplierPhone ? `<div class="vline"><span>Phone</span><b>${escapeHtml(po.supplierPhone)}</b></div>` : ""}
             ${po.supplierEmail ? `<div class="vline"><span>Email</span><b>${escapeHtml(po.supplierEmail)}</b></div>` : ""}
           </div>`
        : "<div></div>"
    }
    <div class="vendor-block">
      <div class="vendor-title">Delivery Address</div>
      <div class="vline"><span>Deliver To</span><b>${escapeHtml(po.deliveryAddress || po.shipTo || po.project || "—")}</b></div>
      ${po.deliveryContact ? `<div class="vline"><span>Site Contact</span><b>${escapeHtml(po.deliveryContact)}${po.deliveryContactNumber ? ` · ${escapeHtml(po.deliveryContactNumber)}` : ""}</b></div>` : ""}
    </div>
  </div>
  ${po.remarks ? `<div class="vendor-addr"><span>REMARKS</span> ${escapeHtml(po.remarks)}</div>` : ""}
  <table>
    <thead>
      <tr>
        <th style="width:36px">S/No</th>
        <th>Item Description</th>
        <th style="width:60px">Unit</th>
        <th style="width:56px">Qty</th>
        <th style="width:96px">Unit Price</th>
        ${hasDiscount ? `<th style="width:72px">Discount</th>` : ""}
        <th style="width:110px">Amount</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="${colSpan}" class="c">No line items recorded</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(subtotal)}</span></div>
    ${discountTotal > 0 ? `<div><span>Line Discount Total</span><span>−${money(discountTotal)}</span></div>` : ""}
    ${delivery > 0 ? `<div><span>Delivery Charge</span><span>${money(delivery)}</span></div>` : ""}
    <div><span>GST (9%)</span><span>${money(gst)}</span></div>
    <div class="grand"><span>Total</span><span>${money(grand)}</span></div>
  </div>
  <div class="foot">
    <div class="sig">Requested By</div>
    <div class="sig">Approved By</div>
    <div class="chop">Vendor Sign &amp; Company Chop</div>
  </div>
  <div class="notes">
    ${PO_FOOTER_NOTES.map((n) => `<p>${escapeHtml(n)}</p>`).join("")}
    <p class="gov">${escapeHtml(PO_GOVERNING_NOTE)}</p>
  </div>
  <div class="status">Status: ${escapeHtml(po.status)} · Generated by ConPlus AI Transformation Suite</div>
  ${opts.autoPrint ? "<script>window.onload = () => window.print();</script>" : ""}
</body>
</html>`;

  return html;
}

export function printPO(po: PurchaseOrder) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildPOHtml(po, { autoPrint: true }));
  w.document.close();
  w.focus();
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The same purchase order as a spreadsheet, keeping the template's shape. */
export function exportPOToExcel(po: PurchaseOrder): void {
  const lineNet = (i: { qty: number; unitPrice: number; discountPct?: number }) =>
    i.qty * i.unitPrice * (1 - (i.discountPct ?? 0) / 100);
  const subtotal = po.items.length ? po.items.reduce((s, i) => s + lineNet(i), 0) : po.amount;
  const discountTotal = po.items.reduce(
    (s, i) => s + i.qty * i.unitPrice * ((i.discountPct ?? 0) / 100),
    0
  );
  const delivery = po.deliveryCharge ?? 0;
  const gst = po.items.length ? Math.round((subtotal + delivery) * 0.09 * 100) / 100 : po.gst;

  const totalsFields = [
    { label: "Subtotal", value: subtotal },
    ...(discountTotal > 0 ? [{ label: "Line Discount Total", value: -discountTotal }] : []),
    ...(delivery > 0 ? [{ label: "Delivery Charge", value: delivery }] : []),
    { label: "GST (9%)", value: gst },
    { label: "Total", value: subtotal + delivery + gst },
  ];

  const sections: RecordSection[] = [
    {
      heading: `Purchase Order ${po.poNumber}`,
      fields: [
        { label: "PO Date", value: po.createdDate },
        { label: "Vendor", value: po.supplier },
        { label: "Attn", value: po.attnName },
        { label: "Vendor Ref / Quotation", value: po.vendorQuotationRef },
        { label: "Required Date", value: po.deliveryDate },
        { label: "Project Site", value: po.project },
        { label: "Project Code", value: po.projectCode },
        { label: "Works Order", value: po.worksOrder },
        { label: "Ship To", value: po.shipTo || po.project },
        { label: "Payment Terms", value: po.paymentTerms },
        { label: "Requested By", value: po.requestedBy },
        { label: "Status", value: po.status },
        { label: "Remarks", value: po.remarks },
      ],
    },
    {
      heading: "Vendor Details",
      fields: [
        { label: "Address", value: po.supplierAddress },
        { label: "Contact Person", value: po.supplierContact },
        { label: "Phone", value: po.supplierPhone },
        { label: "Email", value: po.supplierEmail },
      ],
    },
    {
      heading: "Delivery Address",
      fields: [
        { label: "Deliver To", value: po.deliveryAddress || po.shipTo || po.project },
        { label: "Site Contact", value: po.deliveryContact },
        { label: "Contact Number", value: po.deliveryContactNumber },
      ],
    },
    {
      heading: "Items",
      table: {
        headers: ["S/No", "Item Description", "Unit", "Qty", "Unit Price", "Discount %", "Amount"],
        rows: po.items.map((i, n) => [
          n + 1,
          i.material,
          i.unit ?? "",
          i.qty,
          i.unitPrice,
          i.discountPct ?? 0,
          lineNet(i),
        ]),
      },
    },
    {
      heading: "Totals",
      fields: totalsFields,
    },
  ];
  exportRecordToExcel(sections, `purchase_order_${po.poNumber}`);
}
