// Printable PO form, modelled on the client's "Purchase Order - MISC template"
// layout (header fields + item table + totals). Print-to-PDF via the browser.
import type { PurchaseOrder } from "@/data/sampleData";
import { exportRecordToExcel, type RecordSection } from "@/lib/exportData";

const money = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

export function buildPOHtml(po: PurchaseOrder, opts: { autoPrint: boolean }) {
  const rows = po.items
    .map(
      (i, n) => `
      <tr>
        <td class="c">${n + 1}</td>
        <td>${escapeHtml(i.material)}</td>
        <td class="r">${i.qty}</td>
        <td class="r">${money(i.unitPrice)}</td>
        <td class="r">${money(i.qty * i.unitPrice)}</td>
      </tr>`
    )
    .join("");

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
  .vendor-block { border: 1px solid #ccc; padding: 8px 10px; margin-bottom: 10px; }
  .vendor-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #666; margin-bottom: 4px; }
  .vline { display: flex; gap: 10px; font-size: 10px; padding: 2px 0; }
  .vline span { color: #666; font-weight: 600; text-transform: uppercase; min-width: 92px; }
  .vendor-addr span { font-weight: 700; color: #555; margin-right: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f0f0f0; border: 1px solid #999; padding: 6px; font-size: 10px; text-transform: uppercase; }
  td { border: 1px solid #999; padding: 6px; }
  .c { text-align: center; } .r { text-align: right; }
  .totals { margin-top: 12px; margin-left: auto; width: 260px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #111; font-weight: 800; font-size: 14px; }
  .foot { margin-top: 48px; display: flex; justify-content: space-between; gap: 40px; }
  .sig { flex: 1; border-top: 1px solid #111; padding-top: 6px; font-size: 10px; color: #555; text-transform: uppercase; }
  .status { margin-top: 16px; font-size: 10px; color: #777; }
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
    <div><span>Project Site</span><b>${escapeHtml(po.project)}</b></div>
    <div><span>Project Code</span><b>${escapeHtml(po.projectCode || "—")}</b></div>
    <div><span>Works Order</span><b>${escapeHtml(po.worksOrder || "—")}</b></div>
    <div><span>Currency</span><b>SGD</b></div>
    <div><span>Ship To</span><b>${escapeHtml(po.shipTo || po.project)}</b></div>
    <div><span>Payment Terms</span><b>${escapeHtml(po.paymentTerms || "—")}</b></div>
    <div><span>Requested By</span><b>${escapeHtml(po.requestedBy || "—")}</b></div>
    <div><span>Status</span><b style="text-transform:capitalize">${escapeHtml(po.status)}</b></div>
  </div>
  ${
    po.supplierAddress || po.supplierContact || po.supplierPhone || po.supplierEmail
      ? `<div class="vendor-block">
           <div class="vendor-title">Vendor Details</div>
           ${po.supplierAddress ? `<div class="vline"><span>Address</span><b>${escapeHtml(po.supplierAddress)}</b></div>` : ""}
           ${po.supplierContact ? `<div class="vline"><span>Contact Person</span><b>${escapeHtml(po.supplierContact)}</b></div>` : ""}
           ${po.supplierPhone ? `<div class="vline"><span>Phone</span><b>${escapeHtml(po.supplierPhone)}</b></div>` : ""}
           ${po.supplierEmail ? `<div class="vline"><span>Email</span><b>${escapeHtml(po.supplierEmail)}</b></div>` : ""}
         </div>`
      : ""
  }
  ${po.remarks ? `<div class="vendor-addr"><span>REMARKS</span> ${escapeHtml(po.remarks)}</div>` : ""}
  <table>
    <thead>
      <tr><th style="width:36px">S/No</th><th>Item Description</th><th style="width:70px">Qty</th><th style="width:100px">Unit Price</th><th style="width:110px">Amount</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="5" class="c">No line items recorded</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(po.amount)}</span></div>
    <div><span>GST (9%)</span><span>${money(po.gst)}</span></div>
    <div class="grand"><span>Total</span><span>${money(po.amount + po.gst)}</span></div>
  </div>
  <div class="foot">
    <div class="sig">Requested By</div>
    <div class="sig">Approved By</div>
    <div class="sig">Vendor Acknowledgement</div>
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
  const sections: RecordSection[] = [
    {
      heading: `Purchase Order ${po.poNumber}`,
      fields: [
        { label: "PO Date", value: po.createdDate },
        { label: "Vendor", value: po.supplier },
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
      heading: "Items",
      table: {
        headers: ["S/No", "Item Description", "Qty", "Unit Price", "Amount"],
        rows: po.items.map((i, n) => [n + 1, i.material, i.qty, i.unitPrice, i.qty * i.unitPrice]),
      },
    },
    {
      heading: "Totals",
      fields: [
        { label: "Subtotal", value: po.amount },
        { label: "GST (9%)", value: po.gst },
        { label: "Total", value: po.amount + po.gst },
      ],
    },
  ];
  exportRecordToExcel(sections, `purchase_order_${po.poNumber}`);
}
