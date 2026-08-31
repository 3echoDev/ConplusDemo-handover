// Printable PO form, modelled on the client's "Purchase Order" reference
// (PO_Template.pdf): header grid + Item Code / Disc-per-unit table + totals.
// Print-to-PDF via the browser.
import ExcelJS from "exceljs";
import type { PurchaseOrder } from "@/data/sampleData";

const money = (n: number) =>
  n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 });

// Company letterhead banner (logo + address + bizSAFE), served from /public.
// Absolute URL so it still loads inside the print window (about:blank base).
const LOGO_SRC =
  (typeof window !== "undefined" ? window.location.origin : "") + "/conplus-header.png";

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
  .logo { display: block; width: 100%; max-width: 720px; height: auto; margin: 0 0 6px; }
  .titlebar { background: #fdf3bf; border: 1px solid #111; text-align: center; font-weight: 800; font-size: 15px; letter-spacing: 2px; padding: 4px 0; margin: 8px 0 0; }
  .hdr { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .hdr td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; font-size: 10px; }
  .hdr .lbl { background: #f5f5f5; font-weight: 700; width: 13%; }
  .hdr .val { width: 18%; }
  .hdr .mid { width: 38%; line-height: 1.5; }
  .hdr .mid .mt { font-weight: 700; text-transform: uppercase; font-size: 9px; color: #666; letter-spacing: .5px; }
  .hdr b { font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.items th { background: #fdf3bf; border: 1px solid #111; padding: 5px 6px; font-size: 10px; }
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
  <img class="logo" src="${LOGO_SRC}" alt="Conplus Resources Pte Ltd" />
  <div class="titlebar">PURCHASE ORDER</div>
  <table class="hdr">
    <tr>
      <td class="lbl">Purchase Order No.</td>
      <td class="val"><b>${escapeHtml(po.poNumber)}</b></td>
      <td class="mid" rowspan="3">
        <span class="mt">Vendor</span><br>
        <b>${escapeHtml(po.supplier)}</b>${po.supplierAddress ? `<br>${escapeHtml(po.supplierAddress)}` : ""}${po.supplierPhone ? `<br>Tel: ${escapeHtml(po.supplierPhone)}` : ""}${po.supplierContact || po.supplierEmail ? `<br>Attn: ${escapeHtml([po.supplierContact, po.supplierEmail].filter(Boolean).join(" | "))}` : ""}
      </td>
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
      <td class="lbl">Project Site</td>
      <td class="val"><b>${escapeHtml(po.project || "—")}</b></td>
      <td class="mid" rowspan="3">
        <span class="mt">Ship To</span><br>
        <b>${escapeHtml(po.deliveryAddress || po.shipTo || po.project || "—")}</b>${po.deliveryContact ? `<br>${escapeHtml(po.deliveryContact)}${po.deliveryContactNumber ? ` · ${escapeHtml(po.deliveryContactNumber)}` : ""}` : ""}<br>Delivery schedule: ${escapeHtml(po.deliveryDate || "By next week")}<br>Date: (TBC)
      </td>
      <td class="lbl">Project PIC</td>
      <td class="val"><b>${escapeHtml(po.projectPic || "—")}</b></td>
    </tr>
    <tr>
      <td class="lbl">Project Code</td>
      <td class="val"><b>${escapeHtml(po.projectCode || "—")}</b></td>
      <td class="lbl">Required Date</td>
      <td class="val"><b>${escapeHtml(po.deliveryDate || "—")}</b></td>
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

/** The purchase order as a formatted .xlsx, matching the printable template. */
export async function exportPOToExcel(po: PurchaseOrder): Promise<void> {
  const t = computeTotals(po);

  const COLS = 8;
  const TEAL = "FF006B54";
  const YELLOW: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3BF" } };
  const LABEL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  const THIN: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };
  const CUR = '"$"#,##0.00';

  const wb = new ExcelJS.Workbook();
  wb.creator = "Conplus Resources Pte Ltd";
  const ws = wb.addWorksheet("Purchase Order", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 16 },
  });
  ws.columns = [
    { width: 6 },   // A: S/No.
    { width: 16 },  // B: Item Code
    { width: 42 },  // C: Item Description
    { width: 8 },   // D: Unit
    { width: 8 },   // E: QTY
    { width: 13 },  // F: Unit Price
    { width: 13 },  // G: Disc/Unit
    { width: 15 },  // H: Amount
  ];

  const box = (row: number, c1: number, c2: number) => {
    for (let c = c1; c <= c2; c++) ws.getCell(row, c).border = THIN;
  };

  let r = 1;

  // Company name
  ws.mergeCells(r, 1, r, COLS);
  const co = ws.getCell(r, 1);
  co.value = "CONPLUS RESOURCES PTE LTD";
  co.font = { name: "Arial", size: 13, bold: true, color: { argb: TEAL } };
  co.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 22;
  r++;

  // Title banner
  ws.mergeCells(r, 1, r, COLS);
  const tb = ws.getCell(r, 1);
  tb.value = "PURCHASE ORDER";
  tb.font = { name: "Arial", size: 12, bold: true };
  tb.fill = YELLOW;
  tb.alignment = { horizontal: "center", vertical: "middle" };
  box(r, 1, COLS);
  ws.getRow(r).height = 20;
  r += 2;

  // ── Info grid: left label A:B / value C:D — right label E:F / value G:H
  const pair = (row: number, lLabel: string, lVal: string, rLabel: string, rVal: string) => {
    ws.mergeCells(row, 1, row, 2);
    const l = ws.getCell(row, 1);
    l.value = lLabel; l.font = { name: "Arial", size: 9, bold: true }; l.fill = LABEL; l.alignment = { vertical: "middle" };
    ws.mergeCells(row, 3, row, 4);
    const lv = ws.getCell(row, 3);
    lv.value = lVal; lv.font = { name: "Arial", size: 9 }; lv.alignment = { vertical: "middle", wrapText: true };
    ws.mergeCells(row, 5, row, 6);
    const rl = ws.getCell(row, 5);
    rl.value = rLabel; rl.font = { name: "Arial", size: 9, bold: true }; rl.fill = LABEL; rl.alignment = { vertical: "middle" };
    ws.mergeCells(row, 7, row, 8);
    const rv = ws.getCell(row, 7);
    rv.value = rVal; rv.font = { name: "Arial", size: 9 }; rv.alignment = { vertical: "middle", wrapText: true };
    box(row, 1, COLS);
  };

  pair(r, "PO No.", po.poNumber, "Payment Terms", po.paymentTerms || "—"); r++;
  pair(r, "PO Date", po.createdDate, "Currency", "SGD"); r++;
  pair(r, "Vendor Code", po.vendorCode || "—", "Requested By", po.requestedBy || "—"); r++;
  pair(r, "Project Site", po.project || "—", "Project PIC", po.projectPic || "—"); r++;
  pair(r, "Project Code", po.projectCode || "—", "Required Date", po.deliveryDate || "—"); r++;
  pair(r, "Works Order", po.worksOrder || "—", "Vendor Ref", po.vendorQuotationRef || "—"); r++;

  // ── Vendor / Ship To boxes side by side
  ws.mergeCells(r, 1, r, 4);
  const vl = ws.getCell(r, 1);
  vl.value = "VENDOR"; vl.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF666666" } }; vl.fill = LABEL; vl.alignment = { vertical: "middle" };
  ws.mergeCells(r, 5, r, 8);
  const sl = ws.getCell(r, 5);
  sl.value = "SHIP TO"; sl.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF666666" } }; sl.fill = LABEL; sl.alignment = { vertical: "middle" };
  box(r, 1, COLS);
  r++;

  const vendorLines = [
    po.supplier,
    po.supplierAddress,
    po.supplierPhone ? `Tel: ${po.supplierPhone}` : "",
    po.supplierContact || po.supplierEmail ? `Attn: ${[po.supplierContact, po.supplierEmail].filter(Boolean).join(" | ")}` : "",
  ].filter(Boolean);
  const shipLines = [
    po.deliveryAddress || po.shipTo || po.project || "—",
    po.deliveryContact ? `${po.deliveryContact}${po.deliveryContactNumber ? ` · ${po.deliveryContactNumber}` : ""}` : "",
    `Delivery schedule: ${po.deliveryDate || "By next week"}`,
  ].filter(Boolean);
  ws.mergeCells(r, 1, r, 4);
  const vv = ws.getCell(r, 1);
  vv.value = vendorLines.join("\n"); vv.font = { name: "Arial", size: 9 }; vv.alignment = { vertical: "top", wrapText: true };
  ws.mergeCells(r, 5, r, 8);
  const sv = ws.getCell(r, 5);
  sv.value = shipLines.join("\n"); sv.font = { name: "Arial", size: 9 }; sv.alignment = { vertical: "top", wrapText: true };
  box(r, 1, COLS);
  ws.getRow(r).height = 58;
  r++;

  // Remarks
  if (po.remarks) {
    ws.mergeCells(r, 1, r, COLS);
    const rm = ws.getCell(r, 1);
    rm.value = `Remarks: ${po.remarks}`; rm.font = { name: "Arial", size: 9, italic: true }; rm.alignment = { vertical: "middle", wrapText: true };
    box(r, 1, COLS);
    r++;
  }
  r++;

  // ── Item table header
  const heads = ["S/No.", "Item Code", "Item Description", "Unit", "QTY", "Unit Price", "Disc/Unit", "Amount"];
  heads.forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h; c.font = { name: "Arial", size: 9, bold: true }; c.fill = YELLOW; c.border = THIN;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(r).height = 20;
  r++;

  // Item rows (padded to MIN_ROWS like the printed sheet)
  po.items.forEach((it, n) => {
    ws.getCell(r, 1).value = n + 1; ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(r, 2).value = it.itemCode || "";
    ws.getCell(r, 3).value = it.material; ws.getCell(r, 3).alignment = { vertical: "middle", wrapText: true };
    ws.getCell(r, 4).value = it.unit || ""; ws.getCell(r, 4).alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(r, 5).value = it.qty; ws.getCell(r, 5).alignment = { horizontal: "right", vertical: "middle" };
    ws.getCell(r, 6).value = it.unitPrice; ws.getCell(r, 6).numFmt = CUR; ws.getCell(r, 6).alignment = { horizontal: "right", vertical: "middle" };
    ws.getCell(r, 7).value = it.discPerUnit ?? 0; ws.getCell(r, 7).numFmt = CUR; ws.getCell(r, 7).alignment = { horizontal: "right", vertical: "middle" };
    ws.getCell(r, 8).value = lineAmount(it); ws.getCell(r, 8).numFmt = CUR; ws.getCell(r, 8).alignment = { horizontal: "right", vertical: "middle" };
    for (let c = 1; c <= COLS; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.font) cell.font = { name: "Arial", size: 9 };
      cell.border = THIN;
    }
    r++;
  });
  for (let n = po.items.length; n < MIN_ROWS; n++) {
    ws.getCell(r, 1).value = n + 1;
    ws.getCell(r, 1).font = { name: "Arial", size: 9 };
    ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };
    box(r, 1, COLS);
    r++;
  }

  // ── Totals (right side: label E:G / value H)
  const totalRow = (label: string, value: number, grand = false, neg = false) => {
    ws.mergeCells(r, 5, r, 7);
    const k = ws.getCell(r, 5);
    k.value = label; k.font = { name: "Arial", size: grand ? 11 : 10, bold: true }; k.fill = LABEL;
    k.alignment = { horizontal: "right", vertical: "middle" };
    const v = ws.getCell(r, 8);
    v.value = neg && value > 0 ? -value : value; v.numFmt = CUR;
    v.font = { name: "Arial", size: grand ? 11 : 10, bold: grand };
    v.alignment = { horizontal: "right", vertical: "middle" };
    box(r, 5, COLS);
    r++;
  };
  r++;
  totalRow("Subtotal", t.subtotal);
  totalRow("Discount", t.discount, false, true);
  if (t.delivery > 0) totalRow("Delivery Charge", t.delivery);
  totalRow("Total", t.total);
  totalRow("GST 9%", t.gst);
  totalRow("Grand Total", t.grand, true);

  // ── Footer notes
  r++;
  for (const n of [...PO_FOOTER_NOTES, ...PO_CORRESPONDENCE]) {
    ws.mergeCells(r, 1, r, COLS);
    ws.getCell(r, 1).value = n;
    ws.getCell(r, 1).font = { name: "Arial", size: 8, color: { argb: "FF444444" } };
    ws.getCell(r, 1).alignment = { vertical: "middle" };
    r++;
  }
  r++;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = PO_COMPUTER_NOTE;
  ws.getCell(r, 1).font = { name: "Arial", size: 8, bold: true };
  ws.getCell(r, 1).alignment = { horizontal: "right" };
  r++;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = PO_GOVERNING_NOTE;
  ws.getCell(r, 1).font = { name: "Arial", size: 9, bold: true };
  ws.getCell(r, 1).alignment = { horizontal: "center" };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Purchase Order ${po.poNumber}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
