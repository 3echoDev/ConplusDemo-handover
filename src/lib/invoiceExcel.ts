// Tax Invoice workbook — mirrors Accounts' "Invoice Template.xlsm":
// sheet 1 "Tax Invoice" (page 1) and sheet 2 "Retention" (Accumulative Retention, page 2).
// buildInvoiceWorkbook() is DOM-free so it runs under vitest / Node; the browser
// entry points (download + print) sit at the bottom.
import ExcelJS from "exceljs";
import {
  CONPLUS_GST_REG,
  buildRetentionSchedule,
  computeInvoiceTotals,
  retentionLabel,
  spellAmount,
  type InvoiceDraft,
} from "@/lib/invoiceDocument";

export const INVOICE_SHEET = "Tax Invoice";
export const RETENTION_SHEET = "Retention";

const GREY_INK = "FF777777";
const NF_MONEY = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)';
const NF_DATE = "dd\\.mm\\.yyyy";
const COL_WIDTHS: Record<string, number> = { A: 5.3, B: 7, C: 11, D: 18, E: 16.9, F: 20.7, G: 13.9, H: 11.4, I: 10, J: 14.7, K: 19.9 };
const RET_COL_WIDTHS: Record<string, number> = { A: 5.3, B: 7, C: 11, D: 19.1, E: 16.3, F: 21.9, G: 8.3, H: 18.7, I: 6.4, J: 14.7, K: 18.6 };

type Img = { buffer: ArrayBuffer; extension: "jpeg" | "png"; width: number; height: number };
export interface BuildInvoiceOptions {
  letterhead?: Img;
  paymentModes?: Img;
  /** Print rendering: write a marker cell where the payment-modes picture goes (sheetToHtml swaps it for an <img>). */
  printMarkers?: boolean;
}

export const PAYMENT_MODES_MARKER = "[[PAYMENT_MODES]]";

const font = (size: number, o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: "Arial", size, ...o });
const put = (ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, f: Partial<ExcelJS.Font>, o: { nf?: string; align?: Partial<ExcelJS.Alignment>; border?: Partial<ExcelJS.Borders> } = {}) => {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = f;
  if (o.nf) c.numFmt = o.nf;
  if (o.align) c.alignment = o.align;
  if (o.border) c.border = o.border;
  return c;
};
const fx = (formula: string, result: number) => ({ formula, result }) as ExcelJS.CellFormulaValue;
const utcDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};

function setup(ws: ExcelJS.Worksheet, widths: Record<string, number>) {
  for (const [col, w] of Object.entries(widths)) ws.getColumn(col).width = w;
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    margins: { left: 0.51, right: 0.51, top: 0.35, bottom: 0.35, header: 0.3, footer: 0.3 },
  } as ExcelJS.PageSetup;
  for (let r = 1; r <= 12; r++) ws.getRow(r).height = 12.75;
}

function placeLetterhead(ws: ExcelJS.Worksheet, img: Img | undefined) {
  if (!img) {
    put(ws, "B4", "CONPLUS RESOURCES PTE LTD", font(16, { bold: true }));
    put(ws, "B6", "10 Admiralty Street #02-26 Northlink Building Singapore 757695", font(10));
    return;
  }
  const id = ws.workbook.addImage({ buffer: img.buffer, extension: img.extension });
  // A1 across to column K, keeping the image's aspect ratio (template spans A1:K11)
  const widthPx = Object.values(COL_WIDTHS).reduce((s, w) => s + w * 7.3, 0);
  ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: widthPx, height: (widthPx * img.height) / img.width } });
}

/** Header block shared by both pages. `top` is the "To:" row. */
function writeHeader(ws: ExcelJS.Worksheet, d: InvoiceDraft, top: number) {
  const H = font(13, { bold: true });
  const addr = d.addressLines.slice(0, 3);
  put(ws, `B${top}`, "To:", font(13));
  put(ws, `C${top}`, d.clientName, font(13));
  addr.forEach((line, i) => put(ws, `C${top + 1 + i}`, line, font(13)));
  const right: [string, ExcelJS.CellValue, string?][] = [
    ["GST REG NO.", CONPLUS_GST_REG],
    ["INVOICE DATE:", utcDate(d.invoiceDate), NF_DATE],
    ["PAYMENT CERT:", d.paymentCert],
    ["CLAIM NO:", d.claimNos],
    ["JOB REF:", d.jobRef],
    ["PAYMENT TERMS:", d.paymentTerms],
    ["CUSTOMER'S PO:", d.customerPo],
  ];
  right.forEach(([label, value, nf], i) => {
    const r = top + i;
    put(ws, `H${r}`, label, i === 6 ? font(12, { bold: true }) : H, { align: { horizontal: "left" } });
    put(ws, `K${r}`, value === "" ? null : value, H, { nf, align: { horizontal: "left" } });
    ws.getRow(r).height = 15;
  });
  put(ws, `B${top + 5}`, "Attn:", font(13));
  put(ws, `C${top + 5}`, d.attn, font(13));
  put(ws, `B${top + 6}`, "Email:", font(12));
  put(ws, `C${top + 6}`, d.email, font(12));
  put(ws, `B${top + 9}`, "Site/Project:", H);
  put(ws, `D${top + 9}`, d.site, font(12.5, { bold: true }));
  ws.getRow(top + 9).height = 16.5;
}

function writeFooter(ws: ExcelJS.Worksheet, row: number, spellOf: number, page: string, paymentModes?: Img, marker = false) {
  put(ws, `B${row}`, "SGD:", font(13, { bold: true }));
  put(ws, `C${row}`, spellAmount(spellOf), font(13, { bold: true }));
  const eoe = row + 2;
  ws.mergeCells(`B${eoe}:K${eoe}`);
  put(ws, `B${eoe}`, "E.&.O.E", font(11), { align: { horizontal: "center" }, border: { top: { style: "thin" } } });
  for (const col of ["C", "D", "E", "F", "G", "H", "I", "J", "K"]) ws.getCell(`${col}${eoe}`).border = { top: { style: "thin" } };
  let next = eoe + 1;
  if (paymentModes) {
    const id = ws.workbook.addImage({ buffer: paymentModes.buffer, extension: paymentModes.extension });
    const w = 480; // ≈ template's B..F span
    ws.addImage(id, { tl: { col: 1, row: eoe }, ext: { width: w, height: (w * paymentModes.height) / paymentModes.width } });
    next = eoe + 10;
  } else if (marker) {
    put(ws, `B${eoe + 1}`, PAYMENT_MODES_MARKER, font(11));
    next = eoe + 3;
  }
  put(ws, `B${next}`, "This is a computer-generated document and no signature is required.", font(11));
  const pageRow = next + 2;
  ws.mergeCells(`B${pageRow}:K${pageRow}`);
  put(ws, `B${pageRow}`, page, font(10), { align: { horizontal: "center" } });
  return pageRow;
}

function writeInvoiceSheet(ws: ExcelJS.Worksheet, d: InvoiceDraft, opts: BuildInvoiceOptions) {
  setup(ws, COL_WIDTHS);
  placeLetterhead(ws, opts.letterhead);
  const t = computeInvoiceTotals(d);
  const B125 = font(12.5, { bold: true });

  ws.mergeCells("B13:G13");
  put(ws, "B13", "TAX INVOICE", font(18, { bold: true, underline: true, color: { argb: GREY_INK } }), { align: { horizontal: "center" } });
  put(ws, "H13", "INVOICE NO:", font(13, { bold: true }), { align: { horizontal: "left" } });
  put(ws, "K13", d.invoiceNumber, font(14, { bold: true, color: { argb: GREY_INK } }));
  ws.getRow(13).height = 23.25;

  writeHeader(ws, d, 15);

  // Quotation blocks (row 27 on the template)
  let r = 27;
  let voHeading = false;
  for (const block of d.quoteBlocks) {
    const items = block.items.filter((i) => i.include && i.text.trim());
    if (!items.length && !block.quoteRef) continue;
    if (block.kind === "vo" && !voHeading) {
      put(ws, `B${r}`, "VARIATION ORDER:", B125);
      ws.getRow(r).height = 19.5;
      r++;
      voHeading = true;
    }
    put(ws, `B${r}`, "QUOTE REF:", font(12.5, { bold: true, underline: true }));
    put(ws, `D${r}`, block.quoteRef, B125);
    ws.getRow(r).height = 19.5;
    r++;
    // Up to six items in one column; more go in two columns like the template (ITEM 1-6 | ITEM 7-12).
    const twoCols = items.length > 6;
    const perCol = twoCols ? Math.ceil(items.length / 2) : items.length;
    for (let i = 0; i < perCol; i++) {
      const left = items[i];
      put(ws, `B${r}`, `ITEM ${i + 1}`, B125);
      put(ws, `D${r}`, left.text, B125);
      const right = twoCols ? items[perCol + i] : undefined;
      if (right) {
        put(ws, `F${r}`, `   ITEM ${perCol + i + 1}`, B125);
        put(ws, `G${r}`, right.text, B125, { align: { horizontal: "left" } });
      }
      ws.getRow(r).height = 19.5;
      r++;
    }
    r++; // blank row between quotations
  }

  // Figures
  r = Math.max(r + 1, 44);
  put(ws, `E${r}`, "Work Done:", B125);
  put(ws, `F${r}`, d.workDone, B125);
  r += 2;
  const money = (row: number, label: string, value: ExcelJS.CellValue, bold = false, border?: Partial<ExcelJS.Borders>) => {
    put(ws, `B${row}`, label, font(13, { bold }));
    put(ws, `G${row}`, ":", font(13, { bold }));
    put(ws, `K${row}`, value, font(13, { bold }), { nf: NF_MONEY, align: { horizontal: "left" }, border });
    ws.getRow(row).height = 19.5;
  };
  const rCert = r, rRet = r + 1, rRec = r + 2, rTot = r + 3, rGst = r + 4, rDue = r + 5;
  money(rCert, "Total Value of Certified", t.cumCertified);
  const pct = d.retentionPct / 100;
  const retFormula = d.retentionOverride != null
    ? null
    : t.retentionCap != null
      ? `-MIN(ROUND(K${rCert}*${pct},2),${t.retentionCap})`
      : `ROUND(-K${rCert}*${pct},2)`;
  money(rRet, retentionLabel(d), retFormula ? fx(retFormula, -t.retention) : -t.retention);
  money(rRec, "Less: Payment Received", -t.paymentReceived);
  money(rTot, "Total Amount", fx(`SUM(K${rCert}:K${rRec})`, t.totalAmount), false, { top: { style: "thin" } });
  money(rGst, `GST ${d.gstPct}%`, fx(`ROUND(K${rTot}*${d.gstPct / 100},2)`, t.gst));
  money(rDue, "Total Balance Due for this Invoice", fx(`K${rTot}+K${rGst}`, t.totalDue), true, { top: { style: "thin" }, bottom: { style: "double" } });

  const last = writeFooter(ws, rDue + 2, t.totalDue, "Page 1 of 2", opts.paymentModes, opts.printMarkers);
  ws.pageSetup.printArea = `A1:K${last}`;
}

function writeRetentionSheet(ws: ExcelJS.Worksheet, d: InvoiceDraft, opts: BuildInvoiceOptions) {
  setup(ws, RET_COL_WIDTHS);
  placeLetterhead(ws, opts.letterhead);
  ws.mergeCells("B14:K14");
  put(ws, "B14", "Accumulative Retention", font(18, { bold: true, underline: true, color: { argb: GREY_INK } }), { align: { horizontal: "center" } });
  ws.getRow(14).height = 24;
  writeHeader(ws, d, 16);

  const sched = buildRetentionSchedule(d.retentionRows);
  const hdr = font(12.5, { underline: true });
  put(ws, "F28", "Total Certified", hdr, { align: { horizontal: "center" } });
  put(ws, "H28", `Retention ${Number(d.retentionPct.toFixed(2))}%`, hdr, { align: { horizontal: "center" } });
  put(ws, "K28", "Payment Claim", hdr, { align: { horizontal: "center" } });
  let r = 29;
  for (const row of sched.rows) {
    put(ws, `B${r}`, row.label, font(13));
    put(ws, `E${r}`, ":", font(13));
    put(ws, `F${r}`, row.certified, font(12.5), { nf: NF_MONEY });
    put(ws, `H${r}`, -row.retention, font(12.5), { nf: NF_MONEY });
    put(ws, `K${r}`, fx(`F${r}+H${r}`, row.payment), font(12.5), { nf: NF_MONEY });
    ws.getRow(r).height = 19.5;
    r++;
  }
  const first = 29, lastRow = Math.max(r - 1, 29);
  r += 1;
  const tb: Partial<ExcelJS.Borders> = { top: { style: "thin" }, bottom: { style: "double" } };
  put(ws, `B${r}`, "Cum. Payment to date", font(13, { bold: true }), { align: { horizontal: "left" } });
  put(ws, `E${r}`, ":", font(13, { bold: true }));
  put(ws, `F${r}`, fx(`SUM(F${first}:F${lastRow})`, sched.total.certified), font(12.5, { bold: true }), { nf: NF_MONEY, border: tb });
  put(ws, `H${r}`, fx(`SUM(H${first}:H${lastRow})`, -sched.total.retention), font(12.5, { bold: true }), { nf: NF_MONEY, border: tb });
  put(ws, `K${r}`, fx(`SUM(K${first}:K${lastRow})`, sched.total.payment), font(12.5, { bold: true }), { nf: NF_MONEY, border: tb });

  const last = writeFooter(ws, Math.max(r + 3, 45), sched.total.payment, "Page 2 of 2");
  ws.pageSetup.printArea = `A1:K${last}`;
}

export function buildInvoiceWorkbook(d: InvoiceDraft, opts: BuildInvoiceOptions = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conplus Resources Pte Ltd";
  writeInvoiceSheet(wb.addWorksheet(INVOICE_SHEET), d, opts);
  writeRetentionSheet(wb.addWorksheet(RETENTION_SHEET), d, opts);
  return wb;
}

export function invoiceFileName(d: InvoiceDraft): string {
  const no = d.invoiceNumber.replace(/[\\/:*?"<>|]+/g, "-");
  return `Tax Invoice ${no}${d.jobRef ? ` ${d.jobRef}` : ""}.xlsx`;
}

/* ── Browser entry points ───────────────────────────────────────── */

async function loadImage(url: string, extension: "jpeg" | "png"): Promise<Img | undefined> {
  if (typeof fetch !== "function") return undefined;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    return { buffer: await blob.arrayBuffer(), extension, width: bmp.width, height: bmp.height };
  } catch {
    return undefined;
  }
}

async function loadImages(): Promise<BuildInvoiceOptions> {
  const [letterhead, paymentModes] = await Promise.all([
    loadImage("/invoice-letterhead.jpg", "jpeg"),
    loadImage("/invoice-payment-modes.png", "png"),
  ]);
  return { letterhead, paymentModes };
}

export async function exportInvoiceToExcel(d: InvoiceDraft): Promise<void> {
  const wb = buildInvoiceWorkbook(d, await loadImages());
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = invoiceFileName(d);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** The two invoice pages as print HTML (same renderer as the Progress Claim print). */
export async function buildInvoicePrintHtml(d: InvoiceDraft): Promise<string> {
  const { worksheetToHtml, SHEET_PRINT_CSS } = await import("@/lib/sheetToHtml");
  const wb = buildInvoiceWorkbook(d, { printMarkers: true });
  const payModes = `<img class="pay-modes" src="/invoice-payment-modes.png" alt="Payment modes">`;
  const page = (name: string) => {
    const ws = wb.getWorksheet(name)!;
    const area = ws.pageSetup.printArea ?? "A1:K67";
    // skip the letterhead rows (1-12): the image is placed above the table instead
    const lastRow = area.split(":")[1].replace(/^[A-Z]+/i, "");
    return worksheetToHtml(ws, { range: `A13:K${lastRow}`, pxPerChar: 7.4, replace: { [PAYMENT_MODES_MARKER]: payModes } });
  };
  const esc = (s: string) => s.replace(/</g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tax Invoice ${esc(d.invoiceNumber)}</title>
<style>${SHEET_PRINT_CSS}
  table.sheet { margin: 0 auto; }
  .pay-modes { display: block; width: 440px; max-width: none; margin: 4px 0; }
</style></head>
<body>
  <div class="page"><img class="letterhead" src="/invoice-letterhead.jpg" alt="Conplus Resources Pte Ltd">${page(INVOICE_SHEET)}</div>
  <div class="page"><img class="letterhead" src="/invoice-letterhead.jpg" alt="Conplus Resources Pte Ltd">${page(RETENTION_SHEET)}</div>
</body></html>`;
}

export async function printInvoice(d: InvoiceDraft): Promise<void> {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.write(await buildInvoicePrintHtml(d));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}
