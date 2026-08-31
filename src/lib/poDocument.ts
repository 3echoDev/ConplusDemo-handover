// Printable PO form, modelled on the client's "Purchase Order" reference
// (PO_Template.pdf): header grid + Item Code / Disc-per-unit table + totals.
// Print-to-PDF via the browser.
import type { PurchaseOrder } from "@/data/sampleData";
import { exportRecordToExcel, type RecordSection } from "@/lib/exportData";

const money = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

// Company letterhead (from the reference PO header).
const CO_NAME = "CONPLUS RESOURCES PTE LTD";
const CO_ADDR = "10 Admiralty Street · #02-26 · North Link Building · Singapore 757695";
const CO_CONTACT = "Tel: 65 6753 9939 · Fax: 65 6753 9949 · Email: conplus@singnet.com.sg";
const CO_REG = "Reg. No.: 199404220W";

// Standing correspondence notes (reference PO footer).
const PO_FOOTER_NOTES = [
  "1. Please quote our Purchase Order Number on all related correspondence, delivery order and invoices.",
  "2. Please notify us immediately if you are unable to deliver as specified.",
  "3. Send all correspondence to:",
];
const PO_CORRESPONDENCE = [
  "Wendy Wong",
  "10 Admiralty Street, #02-26",
  "North Link Building",
  "Singapore 757695",
  "Tel: +65 6753 9939 | Fax: +65 6753 9949",
  "Email: contract@conplus.com.sg",
];
const PO_GOVERNING_NOTE =
  "This Purchase Order shall be governed by Conplus Resources Pte Ltd's General Terms and Conditions";
const PO_COMPUTER_NOTE = "This is a computer generated report. No SIGNATURE is required";

// Minimum visible item rows (reference sheet reserves ten).
const MIN_ROWS = 10;

type POItem = PurchaseOrder["items"][number];

// Line amount = qty × (unit price − discount per unit).
const lineAmount = (i: POItem) => i.qty * (i.unitPrice - (i.discPerUnit ?? 0));

function computeTotals(po: PurchaseOrder) {
  const hasItems = po.items.length > 0;
  const subtotal = hasItems ? po.items.reduce((s, i) => s + lineAmount(i), 0) : po.amount;
  const discount = po.items.reduce((s, i) => s + i.qty * (i.discPerUnit ?? 0), 0);
  const delivery = po.deliveryCharge ?? 0;
  const total = subtotal + delivery;
  const gst = hasItems ? Math.round(total * 0.09 * 100) / 100 : po.gst;
  const grand = total + gst;
  return { subtotal, discount, delivery, total, gst, grand };
}

export function buildPOHtml(po: PurchaseOrder, opts: { autoPrint: boolean }) {
  const t = computeTotals(po);

  const bodyRows = po.items.map((i, n) => {
    const disc = i.discPerUnit ?? 0;
    return `
      <tr>
        <td class="c">${n + 1}</td>
        <td>${escapeHtml(i.itemCode || "")}</td>
        <td>${escapeHtml(i.material)}</td>
        <td class="c">${escapeHtml(i.unit || "")}</td>
        <td class="r">${i.qty}</td>
        <td class="r">${money(i.unitPrice)}</td>
        <td class="r">${disc > 0 ? money(disc) : "$ -"}</td>
        <td class="r">${money(lineAmount(i))}</td>
      </tr>`;
  });
  for (let n = po.items.length; n < MIN_ROWS; n++) {
    bodyRows.push(
      `<tr><td class="c">${n + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
    );
  }

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(po.poNumber)} — Purchase Order</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 34px; }
  .co { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  .co small { display: block; font-size: 9px; font-weight: 400; letter-spacing: .5px; color: #555; margin-top: 2px; }
  .titlebar { background: #ffe100; border: 1px solid #111; text-align: center; font-weight: 800; font-size: 15px; letter-spacing: 2px; padding: 4px 0; margin: 14px 0 0; }
  .hdr { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .hdr td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; font-size: 10px; }
  .hdr .lbl { background: #f5f5f5; font-weight: 700; width: 15%; }
  .hdr .val { width: 35%; }
  .hdr b { font-weight: 700; }
  .stack { line-height: 1.5; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.items th { background: #ffe100; border: 1px solid #111; padding: 5px 6px; font-size: 10px; }
  table.items td { border: 1px solid #999; padding: 4px 6px; font-size: 10px; height: 18px; }
  .c { text-align: center; } .r { text-align: right; }
  .lower { display: flex; justify-content: space-between; gap: 24px; margin-top: 10px; align-items: flex-start; }
  .notes { flex: 1; font-size: 9px; color: #333; line-height: 1.5; }
  .notes p { margin: 1px 0; }
  .corr { margin-top: 2px; }
  .totals { width: 260px; border-collapse: collapse; }
  .totals td { border: 1px solid #999; padding: 4px 8px; font-size: 11px; }
  .totals td.k { background: #f5f5f5; font-weight: 700; text-align: right; }
  .totals td.v { text-align: right; }
  .totals tr.grand td { font-weight: 800; font-size: 12px; }
  .cgen { text-align: right; font-size: 9px; color: #333; margin-top: 6px; font-weight: 600; }
  .gov { text-align: center; font-size: 10px; font-weight: 600; margin-top: 26px; }
  .pageno { text-align: center; font-size: 9px; color: #777; margin-top: 8px; }
  @media print { body { margin: 18px; } }
</style>
</head>
<body>
  <div class="co">${CO_NAME}<small>${escapeHtml(CO_ADDR)}</small><small>${escapeHtml(CO_CONTACT)} · ${escapeHtml(CO_REG)}</small></div>
  <div class="titlebar">PURCHASE ORDER</div>
  <table class="hdr">
    <tr>
      <td class="lbl">Purchase Order No.</td>
      <td class="val"><b>${escapeHtml(po.poNumber)}</b></td>
      <td class="lbl">Payment Terms</td>
      <td class="val"><b>${escapeHtml(po.paymentTerms || "—")}</b></td>
    </tr>
    <tr>
      <td class="lbl">Purchase Order Date</td>
      <td class="val"><b>${escapeHtml(po.createdDate)}</b></td>
      <td class="lbl">Currency</td>
      <td class="val"><b>SGD</b></td>
    </tr>
    <tr>
      <td class="lbl">Vendor Code</td>
      <td class="val"><b>${escapeHtml(po.vendorCode || "—")}</b></td>
      <td class="lbl">Requested By</td>
      <td class="val"><b>${escapeHtml(po.requestedBy || "—")}</b></td>
    </tr>
    <tr>
      <td class="lbl">Vendor</td>
      <td class="val stack"><b>${escapeHtml(po.supplier)}</b>${po.supplierAddress ? `<br>${escapeHtml(po.supplierAddress)}` : ""}${po.supplierPhone ? `<br>Tel: ${escapeHtml(po.supplierPhone)}` : ""}${po.supplierContact || po.supplierEmail ? `<br>Attn: ${escapeHtml([po.supplierContact, po.supplierEmail].filter(Boolean).join(" | "))}` : ""}</td>
      <td class="lbl">Project PIC</td>
      <td class="val"><b>${escapeHtml(po.projectPic || "—")}</b></td>
    </tr>
    <tr>
      <td class="lbl">Project Site</td>
      <td class="val"><b>${escapeHtml(po.project || "—")}</b></td>
      <td class="lbl">Required Date</td>
      <td class="val"><b>${escapeHtml(po.deliveryDate || "—")}</b></td>
    </tr>
    <tr>
      <td class="lbl">Project Code</td>
      <td class="val"><b>${escapeHtml(po.projectCode || "—")}</b></td>
      <td class="lbl">Ship To</td>
      <td class="val stack"><b>${escapeHtml(po.deliveryAddress || po.shipTo || po.project || "—")}</b>${po.deliveryContact ? `<br>${escapeHtml(po.deliveryContact)}${po.deliveryContactNumber ? ` · ${escapeHtml(po.deliveryContactNumber)}` : ""}` : ""}<br>Date: (TBC)</td>
    </tr>
    <tr>
      <td class="lbl">Works Order</td>
      <td class="val"><b>${escapeHtml(po.worksOrder || "—")}</b></td>
      <td class="lbl">Vendor Ref / Quotation</td>
      <td class="val"><b>${escapeHtml(po.vendorQuotationRef || "—")}</b></td>
    </tr>
  </table>

  ${po.remarks ? `<div style="margin-top:8px;font-size:10px;"><b>Remarks:</b> ${escapeHtml(po.remarks)}</div>` : ""}

  <table class="items">
    <thead>
      <tr>
        <th style="width:34px">S/No.</th>
        <th style="width:110px">Item Code</th>
        <th>Item Description</th>
        <th style="width:64px">Unit</th>
        <th style="width:44px">QTY</th>
        <th style="width:82px">Unit Price</th>
        <th style="width:72px">Disc/Unit</th>
        <th style="width:96px">Amount</th>
      </tr>
    </thead>
    <tbody>${bodyRows.join("")}</tbody>
  </table>

  <div class="lower">
    <div class="notes">
      ${PO_FOOTER_NOTES.map((n) => `<p>${escapeHtml(n)}</p>`).join("")}
      <div class="corr">${PO_CORRESPONDENCE.map((n) => `<p>${escapeHtml(n)}</p>`).join("")}</div>
    </div>
    <table class="totals">
      <tr><td class="k">Subtotal</td><td class="v">${money(t.subtotal)}</td></tr>
      <tr><td class="k">Discount</td><td class="v">${t.discount > 0 ? `−${money(t.discount)}` : "$ -"}</td></tr>
      ${t.delivery > 0 ? `<tr><td class="k">Delivery Charge</td><td class="v">${money(t.delivery)}</td></tr>` : ""}
      <tr><td class="k">Total</td><td class="v">${money(t.total)}</td></tr>
      <tr><td class="k">GST 9%</td><td class="v">${money(t.gst)}</td></tr>
      <tr class="grand"><td class="k">Grand Total</td><td class="v">${money(t.grand)}</td></tr>
    </table>
  </div>

  <div class="cgen">${escapeHtml(PO_COMPUTER_NOTE)}</div>
  <div class="gov">${escapeHtml(PO_GOVERNING_NOTE)}</div>
  <div class="pageno">Page 1 of 1</div>
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
  const t = computeTotals(po);

  const totalsFields = [
    { label: "Subtotal", value: t.subtotal },
    { label: "Discount", value: -t.discount },
    ...(t.delivery > 0 ? [{ label: "Delivery Charge", value: t.delivery }] : []),
    { label: "Total", value: t.total },
    { label: "GST 9%", value: t.gst },
    { label: "Grand Total", value: t.grand },
  ];

  const sections: RecordSection[] = [
    {
      heading: `Purchase Order ${po.poNumber}`,
      fields: [
        { label: "Purchase Order Date", value: po.createdDate },
        { label: "Vendor Code", value: po.vendorCode },
        { label: "Vendor", value: po.supplier },
        { label: "Vendor Address", value: po.supplierAddress },
        { label: "Vendor Contact", value: po.supplierContact },
        { label: "Vendor Phone", value: po.supplierPhone },
        { label: "Vendor Email", value: po.supplierEmail },
        { label: "Vendor Ref / Quotation", value: po.vendorQuotationRef },
        { label: "Payment Terms", value: po.paymentTerms },
        { label: "Currency", value: "SGD" },
        { label: "Requested By", value: po.requestedBy },
        { label: "Project Site", value: po.project },
        { label: "Project Code", value: po.projectCode },
        { label: "Project PIC", value: po.projectPic },
        { label: "Works Order", value: po.worksOrder },
        { label: "Ship To", value: po.deliveryAddress || po.shipTo || po.project },
        { label: "Required Date", value: po.deliveryDate },
        { label: "Remarks", value: po.remarks },
      ],
    },
    {
      heading: "Items",
      table: {
        headers: ["S/No.", "Item Code", "Item Description", "Unit", "QTY", "Unit Price", "Disc/Unit", "Amount"],
        rows: po.items.map((i, n) => [
          n + 1,
          i.itemCode ?? "",
          i.material,
          i.unit ?? "",
          i.qty,
          i.unitPrice,
          i.discPerUnit ?? 0,
          lineAmount(i),
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
