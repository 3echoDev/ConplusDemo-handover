// Supply-of-materials Tax Invoice workbook — Accounts' "Invoice - 2nd Format Request"
// sheet (2 Nov 2026), one page. Shares the letterhead, header line, Payment Modes
// block, footer pin and print renderer with the progress-claim invoice.
import ExcelJS from "exceljs";
import { spellAmount } from "@/lib/invoiceDocument";
import { CONPLUS_GST_REG } from "@/lib/invoiceDocument";
import { computeMaterialTotals, lineTotal, spellAmountDollars, type MaterialInvoiceDraft } from "@/lib/materialInvoiceDocument";
import {
  COL_WIDTHS, GREY_INK, NF_DATE, NF_MONEY, INVOICE_PRINT_CSS, PAYNOW_QR_IMG, PAYNOW_QR_MARKER,
  font, fx, headerLine, loadInvoiceImages, pageLayoutOf, placeLetterhead, put, setup, siteRule, utcDate, writeFooter,
  type BuildInvoiceOptions,
} from "@/lib/invoiceExcel";

export const MATERIAL_SHEET = "Tax Invoice";
const NF_QTY = "#,##0.##";

export function buildMaterialInvoiceWorkbook(d: MaterialInvoiceDraft, opts: BuildInvoiceOptions = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conplus Resources Pte Ltd";
  const ws = wb.addWorksheet(MATERIAL_SHEET);
  setup(ws, COL_WIDTHS);
  placeLetterhead(ws, opts.letterhead);
  const t = computeMaterialTotals(d);
  const H = font(13, { bold: true });

  ws.mergeCells("B13:G13");
  put(ws, "B13", "TAX INVOICE", font(18, { bold: true, underline: true, color: { argb: GREY_INK } }), { align: { horizontal: "center" } });
  headerLine(ws, 13, "INVOICE NO:", d.invoiceNumber, H);
  ws.getCell("K13").font = font(14, { bold: true, color: { argb: GREY_INK } });
  ws.getRow(13).height = 23.25;

  // Header block (rows 15-21): To / address left, the reference lines right.
  const top = 15;
  put(ws, `B${top}`, "To:", font(13));
  put(ws, `C${top}`, d.clientName, font(13));
  d.addressLines.slice(0, 3).forEach((line, i) => put(ws, `C${top + 1 + i}`, line, font(13)));
  const right: [string, ExcelJS.CellValue, string?][] = [
    ["GST REG NO.", CONPLUS_GST_REG],
    ["INVOICE DATE:", utcDate(d.invoiceDate), NF_DATE],
    ["PO NO:", d.poNo],
    ["WO NO:", d.woNo],
    ["DO NO:", d.doNo],
    ["JOB REF:", d.jobRef],
    ["PAYMENT TERMS:", d.paymentTerms],
  ];
  right.forEach(([label, value, nf], i) => {
    headerLine(ws, top + i, label, value, H, nf);
    ws.getRow(top + i).height = 15;
  });
  put(ws, `B${top + 5}`, "Attn:", font(13));
  put(ws, `C${top + 5}`, d.attn, font(13));
  put(ws, `B${top + 6}`, "Tel:", font(12));
  put(ws, `C${top + 6}`, d.tel, font(12));
  put(ws, `B${top + 9}`, "Site/Project:", H);
  put(ws, `D${top + 9}`, d.site, font(12.5, { bold: true }));
  ws.getRow(top + 9).height = 16.5;
  siteRule(ws, top + 9);

  // Item table: header row 27, band 29-50, totals 51-53, words 55 — Accounts' sheet's own rows.
  const hdr = 27;
  const bottom: Partial<ExcelJS.Borders> = { bottom: { style: "thin" } };
  const C = { horizontal: "center" } as const;
  ws.mergeCells(`C${hdr}:F${hdr}`);
  put(ws, `B${hdr}`, "S/NO", H, { align: C, border: bottom });
  put(ws, `C${hdr}`, "DESCRIPTION", H, { align: C, border: bottom });
  put(ws, `G${hdr}`, "PRICE/UNIT", H, { align: C, border: bottom });
  put(ws, `H${hdr}`, "QTY", H, { align: C, border: bottom });
  put(ws, `K${hdr}`, "TOTAL", H, { align: C, border: bottom });
  for (const col of ["D", "E", "F", "I", "J"]) ws.getCell(`${col}${hdr}`).border = bottom;
  ws.getRow(hdr).height = 20.1;

  // Item grid exactly as on Accounts' sheet: a boxed band from row 29 to at least row 50
  // (S/NO box, description box C:F, then one box per column), the subtitle on its
  // second row, items from the third; the band grows if there are more items.
  const gridTop = hdr + 2; // 29
  const subtitleRow = gridTop + 1; // 30
  const firstLine = gridTop + 2; // 31
  const gridBottom = Math.max(50, firstLine + d.lines.length);
  const thin = { style: "thin" } as const;
  const BOX: Record<string, Partial<ExcelJS.Borders>> = {
    B: { top: thin, bottom: thin, left: thin, right: thin },
    C: { top: thin, bottom: thin, left: thin },
    D: { top: thin, bottom: thin },
    E: { top: thin, bottom: thin },
    F: { top: thin, bottom: thin, right: thin },
  };
  for (let gr = gridTop; gr <= gridBottom; gr++) {
    for (const col of ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]) {
      ws.getCell(`${col}${gr}`).border = BOX[col] ?? { top: thin, bottom: thin, left: thin, right: thin };
    }
    ws.getRow(gr).height = 19.5;
  }
  put(ws, `C${subtitleRow}`, d.subtitle, font(12, { underline: true }), { border: BOX.C });
  let r = firstLine;
  d.lines.forEach((l, i) => {
    put(ws, `B${r}`, i + 1, font(12), { align: C, border: BOX.B });
    put(ws, `C${r}`, l.description, font(12), { border: BOX.C });
    put(ws, `G${r}`, l.unitPrice, font(12), { nf: NF_MONEY, align: C, border: BOX.G ?? { top: thin, bottom: thin, left: thin, right: thin } });
    put(ws, `H${r}`, l.qty, font(12), { nf: NF_QTY, align: C, border: { top: thin, bottom: thin, left: thin, right: thin } });
    put(ws, `I${r}`, l.unit, font(12), { align: C, border: { top: thin, bottom: thin, left: thin, right: thin } });
    put(ws, `K${r}`, fx(`ROUND(G${r}*H${r},2)`, lineTotal(l)), font(12), { nf: NF_MONEY, align: { horizontal: "right" }, border: { top: thin, bottom: thin, left: thin, right: thin } });
    r++;
  });

  // Totals right under the band (row 51 on Accounts' sheet).
  const rSub = gridBottom + 1;
  const money = (row: number, label: string, value: ExcelJS.CellValue, bold = false, border?: Partial<ExcelJS.Borders>, labelCol = "H") => {
    put(ws, `${labelCol}${row}`, label, font(13, { bold }), { align: { horizontal: "right" } });
    put(ws, `K${row}`, value, font(13, { bold }), { nf: NF_MONEY, align: { horizontal: "right" }, border });
    ws.getRow(row).height = row === rSub ? 19.5 : row === rSub + 1 ? 17.25 : 18;
  };
  ws.mergeCells(`H${rSub}:I${rSub}`);
  money(rSub, "Sub-Total", fx(`SUM(K${gridTop}:K${gridBottom})`, t.subTotal));
  ws.mergeCells(`H${rSub + 1}:I${rSub + 1}`);
  money(rSub + 1, `GST ${d.gstPct}%`, fx(`ROUND(K${rSub}*${d.gstPct / 100},2)`, t.gst), false, { bottom: thin });
  ws.mergeCells(`F${rSub + 2}:J${rSub + 2}`); // the label spills left on Accounts' sheet; merged so the print does the same
  money(rSub + 2, "Total Balance Due for this Invoice", fx(`K${rSub}+K${rSub + 1}`, t.totalDue), true, { bottom: { style: "double" } }, "F");

  // Amount in words two rows down ("SGD : " + words, both bold 13), then the shared footer.
  const last = writeFooter(ws, rSub + 4, t.totalDue, "Page 1 of 1", opts.payNowQr, opts.printMarkers, true);
  put(ws, `B${rSub + 4}`, "SGD : ", font(13, { bold: true }));
  put(ws, `C${rSub + 4}`, spellAmountDollars(t.totalDue), font(13, { bold: true }));
  ws.pageSetup.printArea = `A1:K${last}`;

  // Accounts' sheet is set in Calibri throughout (the progress-claim template is Arial).
  ws.eachRow({ includeEmpty: true }, (row) => row.eachCell({ includeEmpty: true }, (cell) => { if (cell.font) cell.font = { ...cell.font, name: "Calibri" }; }));
  return wb;
}

export function materialInvoiceFileName(d: MaterialInvoiceDraft): string {
  const no = d.invoiceNumber.replace(/[\\/:*?"<>|]+/g, "-");
  return `Tax Invoice ${no}${d.woNo ? ` WO ${d.woNo}` : ""}.xlsx`;
}

/* ── Browser entry points ───────────────────────────────────────── */

export async function exportMaterialInvoiceToExcel(d: MaterialInvoiceDraft): Promise<void> {
  const wb = buildMaterialInvoiceWorkbook(d, await loadInvoiceImages());
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = materialInvoiceFileName(d);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function buildMaterialInvoicePrintHtml(d: MaterialInvoiceDraft): Promise<string> {
  const { worksheetToHtml, SHEET_PRINT_CSS } = await import("@/lib/sheetToHtml");
  const wb = buildMaterialInvoiceWorkbook(d, { printMarkers: true });
  const ws = wb.getWorksheet(MATERIAL_SHEET)!;
  const lay = pageLayoutOf(ws)!;
  const opt = { pxPerChar: 7.4, replace: { [PAYNOW_QR_MARKER]: PAYNOW_QR_IMG }, splitCurrency: true };
  const body = `<div class="inv-body">${worksheetToHtml(ws, { ...opt, range: `A13:K${lay.bodyEnd}` })}</div>`
    + `<div class="inv-foot">${worksheetToHtml(ws, { ...opt, range: `A${lay.footFrom}:K${lay.last}` })}</div>`;
  const esc = (s: string) => s.replace(/</g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tax Invoice ${esc(d.invoiceNumber)}</title>
<style>${SHEET_PRINT_CSS}${INVOICE_PRINT_CSS}</style></head>
<body>
  <div class="page inv"><img class="letterhead" src="/invoice-letterhead.jpg" alt="Conplus Resources Pte Ltd">${body}</div>
</body></html>`;
}

export async function printMaterialInvoice(d: MaterialInvoiceDraft): Promise<void> {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.write(await buildMaterialInvoicePrintHtml(d));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

export { spellAmount };
