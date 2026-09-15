// Progress Claim workbook — mirrors the client's corrected master
// "(Corrected)E25077_HPC_STA_Progress_Claim_01.xlsx": one Cover Page & Claim
// Summary sheet plus a Claim Details schedule with live formulas.
// buildClaimWorkbook() is DOM-free so it can run under vitest / Node.
import ExcelJS from "exceljs";
import type { Claim, ClaimLine } from "@/data/sampleData";
import {
  bySection,
  claimNumberDisplay,
  computeClaimTotals,
  confirmClaimExport,
  type ClaimDocContext,
} from "@/lib/claimDocument";

/* ── Palette / fonts (from the master) ─────────────────────────── */
const YELLOW = "FFFFFF99"; // manual-input cells
const GREY = "FFD9D9D9"; // column headers
const BAND = "FFBFBFBF"; // section bands
const PEACH = "FFFCE4D6"; // computed totals
const ZONE = "FFF2F2F2"; // zone header rows

const fill = (argb: string): ExcelJS.FillPattern => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
};
const ARIAL = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: "Arial", size: 10, ...o });
const F_LABEL = ARIAL({ bold: true });
const F_TITLE = ARIAL({ bold: true, size: 16 });
const F_BAND = ARIAL({ bold: true, size: 11 });
const F_NOTE = ARIAL({ italic: true, size: 9, color: { argb: "FF7F7F7F" } });

// Match the master's accounting numFmt exactly (backslash-escaped $ and hyphen)
// so ExcelJS writes the same tokens the corrected workbook does.
const NF_MONEY = '_(\\$* #,##0.00_);_(\\$* \\(#,##0.00\\);_(\\$* \\-??_);_(@_)';
const NF_QTY = "_(* #,##0.00_);_(* \\(#,##0.00\\);_(* \\-??_);_(@_)";
const NF_PCT = "0.00%";
const NF_DATE = "dd/mmm/yyyy";
const NF_MONTH = "mm/yyyy";

export const CLAIM_SHEET_COVER = "Cover Page & Claim Summary";
export const CLAIM_SHEET_DETAILS = "Claim Details";

const CONPLUS = {
  name: "Conplus Resources Pte Ltd",
  address: "10 Admiralty Street #02-26\nNorth Link Building\nSingapore 757695",
  tel: "6753 9939",
  fax: "-",
  email: "qs@conplus.com.sg / contract@conplus.com.sg",
};

type Cell = ExcelJS.Cell;
const setCell = (
  ws: ExcelJS.Worksheet,
  addr: string,
  value: ExcelJS.CellValue,
  o: { font?: Partial<ExcelJS.Font>; fill?: string; nf?: string; align?: Partial<ExcelJS.Alignment>; border?: boolean } = {},
): Cell => {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = o.font ?? ARIAL();
  if (o.fill) c.fill = fill(o.fill);
  if (o.nf) c.numFmt = o.nf;
  if (o.align) c.alignment = o.align;
  if (o.border !== false) c.border = THIN;
  return c;
};
const borderRange = (ws: ExcelJS.Worksheet, range: string) => {
  const [a, b] = range.split(":");
  const A = ws.getCell(a), B = ws.getCell(b);
  for (let r = Number(A.row); r <= Number(B.row); r++)
    for (let c = Number(A.col); c <= Number(B.col); c++) ws.getCell(r, c).border = THIN;
};
const mergeBox = (ws: ExcelJS.Worksheet, range: string, value: ExcelJS.CellValue, o: Parameters<typeof setCell>[3] = {}) => {
  ws.mergeCells(range);
  const c = setCell(ws, range.split(":")[0], value, o);
  borderRange(ws, range);
  return c;
};
const parseDate = (s: string | undefined | null): Date | null => {
  if (!s) return null;
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(d.getTime()) ? null : d;
};
// Build dates as UTC so ExcelJS' serial matches the intended calendar day
// regardless of the JS runtime's local timezone (SGT builds were shifting a day).
const utcDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const monthStart = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
const monthEnd = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0));
// The Reference Period on the cover reflects the WORK month (the month before the
// claim was submitted), matching the corrected master.
const workMonthStart = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1));
const workMonthEnd = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0));
const round2 = (n: number) => Math.round(n * 100) / 100;
const fx = (formula: string, result: number | string | Date | null) => ({ formula, result: result ?? undefined }) as ExcelJS.CellFormulaValue;

/* ── Claim Details layout ──────────────────────────────────────── */
// Columns: B S/N, C Description, D Unit, E Qty, F Rate, G Amount,
// I Rate, J Prev qty, K Curr qty, L Total qty, M Prev $, N Curr $, O Total $, P % claimed, Q Remarks,
// S Rate, T Prev qty, U Curr qty, V Total qty, W Prev $, X Curr $, Y Total $, Z % verified, AA Difference.

interface SectionLayout {
  firstRow: number;
  lastRow: number;
  subtotalRow: number;
  itemRows: number[];
  contract: number;
  prev: number;
  curr: number;
  cum: number;
  verified: number;
}

function writeSection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  quotationRef: string,
  lines: ClaimLine[],
  emptyNote: string,
  subtotalLabel: string,
): SectionLayout {
  let r = startRow;
  // Section band — one wide merge B..Q for the label, then the S..Z cells
  // stay unmerged but keep the band's grey fill (the corrected master does not
  // merge the right-hand block, it just tints each cell).
  ws.mergeCells(`B${r}:Q${r}`);
  setCell(ws, `B${r}`, title, { font: F_BAND, fill: BAND, align: { horizontal: "left", vertical: "middle" } });
  borderRange(ws, `B${r}:Q${r}`);
  for (const col of ["S", "T", "U", "V", "W", "X", "Y", "Z"]) {
    setCell(ws, `${col}${r}`, "", { font: F_BAND, fill: BAND });
  }
  ws.getRow(r).height = 20.5;
  r++;

  // Quotation ref row — box the merged label, then extend a thin top edge across
  // the full row so the item grid below reads as one bordered area.
  ws.mergeCells(`C${r}:G${r}`);
  setCell(ws, `C${r}`, quotationRef ? `QUOTATION REF: ${quotationRef}` : emptyNote, {
    font: F_BAND, align: { horizontal: "left", vertical: "middle", wrapText: true }, border: false,
  });
  borderRange(ws, `C${r}:G${r}`);
  for (let col = 2; col <= 27; col++) { // B..AA
    const cell = ws.getCell(r, col);
    const existing = cell.border ?? {};
    cell.border = { top: { style: "thin" }, left: existing.left, right: existing.right, bottom: existing.bottom };
  }
  ws.getRow(r).height = 21;
  r++;

  const firstRow = r;
  const itemRows: number[] = [];
  let contract = 0, prev = 0, curr = 0, cum = 0;
  const verified = 0; // main contractor's verified figures are keyed in after certification
  let lastZone: string | null = null;

  const rows = lines.length ? lines : [null];
  for (const l of rows) {
    if (l && l.zone && l.zone !== lastZone) {
      lastZone = l.zone;
      setCell(ws, `C${r}`, l.zone, { font: F_BAND, fill: ZONE, align: { horizontal: "center", vertical: "middle" } });
      for (const col of ["B", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "S", "T", "U", "V", "W", "X", "Y", "Z"])
        setCell(ws, `${col}${r}`, "", { fill: ZONE });
      borderRange(ws, `B${r}:AA${r}`);
      ws.getRow(r).height = 21;
      r++;
    }
    const item = r;
    // Empty template rows (variation section with no line items) reserve two
    // sub-rows to match the corrected master's B/O/Y SUMIF ranges and put the
    // subtotal on the same row the cover formulas reference.
    const subCount = l ? 1 : 2;
    const sub = r + 1;
    const subLast = r + subCount;
    const rate = l?.rate ?? 0;
    const qty = l?.qty ?? 0;
    const pq = l?.prevQty ?? 0;
    const cq = l?.currQty ?? 0;
    const amount = round2(qty * rate);
    const pAmt = round2(pq * rate), cAmt = round2(cq * rate);
    const vRate = 0, vPq = 0, vCq = 0;
    contract += amount; prev += pAmt; curr += cAmt; cum += pAmt + cAmt;

    // Item row — bold; qty/rate/prev-curr are formulas over the work-done sub-row(s).
    setCell(ws, `B${item}`, l?.pgRef || "", { font: F_LABEL, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `C${item}`, l?.description ?? "", { font: F_LABEL, align: { horizontal: "left", vertical: "middle", wrapText: true } });
    setCell(ws, `D${item}`, l?.unit ?? "", { font: F_LABEL, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `E${item}`, l ? qty : null, { font: F_LABEL, fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `F${item}`, l ? rate : null, { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `G${item}`, fx(`E${item}*F${item}`, amount), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `I${item}`, l ? rate : null, { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `J${item}`, fx(`SUM(J${sub}:J${subLast})`, pq), { font: F_LABEL, fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `K${item}`, fx(`SUM(K${sub}:K${subLast})`, cq), { font: F_LABEL, fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `L${item}`, fx(`J${item}+K${item}`, pq + cq), { font: F_LABEL, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `M${item}`, fx(`J${item}*I${item}`, pAmt), { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `N${item}`, fx(`K${item}*I${item}`, cAmt), { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `O${item}`, fx(`M${item}+N${item}`, pAmt + cAmt), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `P${item}`, fx(`IF(G${item}=0,0,O${item}/G${item})`, amount ? (pAmt + cAmt) / amount : 0), { font: F_LABEL, fill: YELLOW, nf: "0.0%", align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `Q${item}`, "", { font: F_NOTE, align: { horizontal: "left", vertical: "middle", wrapText: true } });
    setCell(ws, `S${item}`, vRate, { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `T${item}`, fx(`SUM(T${sub}:T${subLast})`, vPq), { font: F_LABEL, fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `U${item}`, fx(`SUM(U${sub}:U${subLast})`, vCq), { font: F_LABEL, fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `V${item}`, fx(`T${item}+U${item}`, 0), { font: F_LABEL, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `W${item}`, fx(`T${item}*S${item}`, 0), { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `X${item}`, fx(`U${item}*S${item}`, 0), { font: F_LABEL, fill: YELLOW, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `Y${item}`, fx(`W${item}+X${item}`, 0), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `Z${item}`, fx(`IF(G${item}=0,0,Y${item}/G${item})`, 0), { font: F_LABEL, nf: "0.0%", align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `AA${item}`, fx(`Y${item}-O${item}`, -(pAmt + cAmt)), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    borderRange(ws, `B${item}:AA${item}`);
    const descLines = (l?.description ?? "").split("\n").length;
    ws.getRow(item).height = Math.max(21, 17 * descLines + 6);

    // Work-done sub-row(s) — the yellow input cells for this claim's quantities.
    // The first sub-row carries any values from the line; further slots stay blank
    // (empty variation templates keep two so the layout matches the master).
    for (let s = sub; s <= subLast; s++) {
      const first = s === sub;
      const jVal = first ? pq : 0, kVal = first ? cq : 0;
      const tVal = first ? vPq : 0, uVal = first ? vCq : 0;
      const jAmt = first ? pAmt : 0, kAmt = first ? cAmt : 0;
      setCell(ws, `B${s}`, l && first ? 1 : null, { fill: YELLOW, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `C${s}`, first ? l?.remarks ?? "" : "", { fill: YELLOW, align: { vertical: "middle" } });
      for (const col of ["D", "E", "F"]) setCell(ws, `${col}${s}`, "", { fill: YELLOW });
      setCell(ws, `G${s}`, "", { nf: NF_MONEY });
      setCell(ws, `I${s}`, "", { fill: YELLOW, nf: NF_MONEY });
      setCell(ws, `J${s}`, jVal, { fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `K${s}`, kVal, { fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `L${s}`, fx(`J${s}+K${s}`, jVal + kVal), { nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `M${s}`, fx(`J${s}*I${item}`, jAmt), { fill: YELLOW, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
      setCell(ws, `N${s}`, fx(`K${s}*I${item}`, kAmt), { fill: YELLOW, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
      setCell(ws, `O${s}`, fx(`M${s}+N${s}`, jAmt + kAmt), { nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
      setCell(ws, `P${s}`, "", { fill: YELLOW, nf: "0.0%" });
      setCell(ws, `Q${s}`, "", {});
      setCell(ws, `S${s}`, "", { fill: YELLOW, nf: NF_MONEY });
      setCell(ws, `T${s}`, tVal, { fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `U${s}`, uVal, { fill: YELLOW, nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `V${s}`, fx(`T${s}+U${s}`, 0), { nf: NF_QTY, align: { horizontal: "center", vertical: "middle" } });
      setCell(ws, `W${s}`, fx(`T${s}*S${item}`, 0), { fill: YELLOW, nf: NF_MONEY });
      setCell(ws, `X${s}`, fx(`U${s}*S${item}`, 0), { fill: YELLOW, nf: NF_MONEY });
      setCell(ws, `Y${s}`, fx(`W${s}+X${s}`, 0), { nf: NF_MONEY });
      setCell(ws, `Z${s}`, "", { nf: "0.0%" });
      setCell(ws, `AA${s}`, fx(`Y${s}-O${s}`, first ? -(pAmt + cAmt) : 0), { nf: NF_MONEY });
      borderRange(ws, `B${s}:AA${s}`);
      ws.getRow(s).height = 21;
    }

    itemRows.push(item);
    r = subLast + 1;
  }
  const lastRow = r - 1;
  r++; // blank row before subtotal
  const subtotalRow = r;
  ws.mergeCells(`B${r}:F${r}`);
  setCell(ws, `B${r}`, subtotalLabel, { font: F_LABEL, align: { horizontal: "left", vertical: "middle" } });
  const sumCol = (col: string, val: number) =>
    setCell(ws, `${col}${r}`, fx(`SUBTOTAL(9,${col}${firstRow}:${col}${lastRow})`, round2(val)), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
  sumCol("G", contract);
  sumCol("M", prev);
  sumCol("N", curr);
  // Total claimed sums only item rows (F non-empty), like the master's SUMIF.
  setCell(ws, `O${r}`, fx(`SUMIF(F${firstRow}:F${lastRow},"<>",O${firstRow}:O${lastRow})`, round2(cum)), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
  setCell(ws, `P${r}`, fx(`IF(G${r}=0,0,O${r}/G${r})`, contract ? cum / contract : 0), { font: F_LABEL, nf: NF_PCT, align: { horizontal: "center", vertical: "middle" } });
  sumCol("W", 0);
  sumCol("X", 0);
  setCell(ws, `Y${r}`, fx(`SUMIF(P${firstRow}:P${lastRow},"<>",Y${firstRow}:Y${lastRow})`, verified), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
  setCell(ws, `Z${r}`, fx(`IF(G${r}=0,0,Y${r}/G${r})`, 0), { font: F_LABEL, nf: NF_PCT, align: { horizontal: "center", vertical: "middle" } });
  setCell(ws, `AA${r}`, fx(`Y${r}-O${r}`, round2(verified - cum)), { font: F_LABEL, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
  borderRange(ws, `B${r}:AA${r}`);
  ws.getRow(r).height = 21;

  return { firstRow, lastRow, subtotalRow, itemRows, contract: round2(contract), prev: round2(prev), curr: round2(curr), cum: round2(cum), verified };
}

function writeDetails(ws: ExcelJS.Worksheet, claim: Claim, ctx: ClaimDocContext) {
  const widths: Record<string, number> = { A: 2, B: 6, C: 42, D: 7, E: 9.2, F: 9, G: 12, H: 2, I: 9, J: 9, K: 9, L: 9, M: 11, N: 11, O: 11, P: 8.7, Q: 16, R: 2, S: 9, T: 9, U: 9, V: 9, W: 11, X: 11, Y: 11, Z: 9.5, AA: 12 };
  for (const [k, w] of Object.entries(widths)) ws.getColumn(k).width = w;

  const site = ctx.projectSite || claim.projectName || "";
  const loaRef = claim.woRef || claim.poRef || "NIL — LOA pending";
  const claimDate = parseDate(claim.claimDate) ?? parseDate(claim.submittedDate);
  const header = (row: number, label: string, value: ExcelJS.CellValue, valueRange = `D${row}:P${row}`) => {
    ws.mergeCells(`B${row}:C${row}`);
    setCell(ws, `B${row}`, label, { font: F_LABEL, border: false });
    mergeBox(ws, valueRange, value, { align: { horizontal: "left", vertical: "middle", wrapText: true } });
    ws.getRow(row).height = 18;
  };
  header(1, "Project No.:", fx(`IF('${CLAIM_SHEET_COVER}'!I33="","",'${CLAIM_SHEET_COVER}'!I33)`, claim.projectCode));
  header(2, "Project Title / Site:", fx(`IF('${CLAIM_SHEET_COVER}'!D33="","",'${CLAIM_SHEET_COVER}'!D33)`, site));
  header(3, "Sub-Contractor:", CONPLUS.name);
  header(4, "LOA / WO / PO (*) Ref. No.:", fx(`IF('${CLAIM_SHEET_COVER}'!D36="","",'${CLAIM_SHEET_COVER}'!D36)`, loaRef));

  ws.mergeCells("B7:C7");
  setCell(ws, "B7", "S/C Payment Claim No.:", { font: F_LABEL, border: false });
  setCell(ws, "D7", fx(`IF('${CLAIM_SHEET_COVER}'!E10="","",'${CLAIM_SHEET_COVER}'!E10)`, claim.claimNo ?? ""), {});
  ws.mergeCells("F7:I7");
  setCell(ws, "F7", "Monthly Claim Cut-off Date:", { font: F_LABEL, border: false });
  mergeBox(ws, "J7:K7", fx(`IF('${CLAIM_SHEET_COVER}'!E39="","",'${CLAIM_SHEET_COVER}'!E39)`, "NIL"));
  ws.mergeCells("M7:P7");
  setCell(ws, "M7", "For WORK executed up to month ending:", { font: F_LABEL, border: false });
  mergeBox(ws, "M8:N8", fx(`IF('${CLAIM_SHEET_COVER}'!I38="","",'${CLAIM_SHEET_COVER}'!I38)`, claimDate ? workMonthEnd(claimDate) : null), { nf: NF_MONTH, align: { horizontal: "center", vertical: "middle" } });

  // Column header block (rows 10–12)
  const head = (range: string, text: string) =>
    mergeBox(ws, range, text, { font: F_LABEL, fill: GREY, align: { horizontal: "center", vertical: "middle", wrapText: true } });
  head("B10:B12", "S/N /\nPG Ref");
  head("C10:C12", "Description");
  head("D10:G10", "SUB-CONTRACT SUM");
  head("D11:D12", "Unit"); head("E11:E12", "Qty"); head("F11:F12", "Rate\nS$"); head("G11:G12", "Amount\nS$");
  head("I10:O10", "SUB-CONTRACTOR'S CUMULATIVE CLAIMED");
  head("I11:I12", "Rate\nS$"); head("J11:L11", "Quantities"); head("M11:O11", "Amount S$");
  head("P10:P12", "%\nClaimed"); head("Q10:Q12", "Remarks");
  head("S10:Y10", "MAIN CONTRACTOR'S CUMULATIVE VERIFIED");
  head("S11:S12", "Rate\nS$"); head("T11:V11", "Quantities"); head("W11:Y11", "Amount S$");
  head("Z10:Z12", "%\nVerified"); head("AA10:AA12", "Difference\n(S$)");
  for (const [col, t] of [["J", "Previous"], ["K", "Current"], ["L", "Total"], ["M", "Previous"], ["N", "Current"], ["O", "Total"], ["T", "Previous"], ["U", "Current"], ["V", "Total"], ["W", "Previous"], ["X", "Current"], ["Y", "Total"]])
    setCell(ws, `${col}12`, t, { font: F_LABEL, fill: GREY, align: { horizontal: "center", vertical: "middle" } });
  for (const r of [10, 11, 12]) ws.getRow(r).height = 18;

  const { A, B } = bySection(claim.lines ?? []);
  const aRef = A.find((l) => l.quotationRef)?.quotationRef ?? claim.woRef ?? "";
  const bRef = B.find((l) => l.quotationRef)?.quotationRef ?? "";
  const secA = writeSection(ws, 13, "A    SUB-CONTRACT WORKS", aRef, A, "QUOTATION REF: (none)", "Subtotal — Sub-Contract Works (A)");
  const secB = writeSection(ws, secA.subtotalRow + 2, "B    VARIATION WORKS", bRef, B, "QUOTATION REF: (none — no variations to date)", "Subtotal — Variation Works (B)");

  const totalRow = secB.subtotalRow + 2;
  ws.mergeCells(`B${totalRow}:F${totalRow}`);
  setCell(ws, `B${totalRow}`, "TOTAL — SUB-CONTRACT & VARIATION WORKS (A + B)", { font: F_LABEL, align: { horizontal: "left", vertical: "middle" } });
  const tot = (col: string, val: number, formula?: string) =>
    setCell(ws, `${col}${totalRow}`, fx(formula ?? `SUBTOTAL(9,${col}${secA.firstRow}:${col}${secB.lastRow})`, round2(val)), { font: F_LABEL, fill: PEACH, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
  tot("G", secA.contract + secB.contract);
  tot("M", secA.prev + secB.prev);
  tot("N", secA.curr + secB.curr);
  tot("O", secA.cum + secB.cum, `O${secA.subtotalRow}+O${secB.subtotalRow}`);
  setCell(ws, `P${totalRow}`, fx(`IF(G${totalRow}=0,0,O${totalRow}/G${totalRow})`, (secA.contract + secB.contract) ? (secA.cum + secB.cum) / (secA.contract + secB.contract) : 0), { font: F_LABEL, fill: PEACH, nf: NF_PCT, align: { horizontal: "center", vertical: "middle" } });
  tot("W", 0); tot("X", 0);
  tot("Y", 0, `Y${secA.subtotalRow}+Y${secB.subtotalRow}`);
  setCell(ws, `Z${totalRow}`, fx(`IF(G${totalRow}=0,0,Y${totalRow}/G${totalRow})`, 0), { font: F_LABEL, fill: PEACH, nf: NF_PCT, align: { horizontal: "center", vertical: "middle" } });
  setCell(ws, `AA${totalRow}`, fx(`Y${totalRow}-O${totalRow}`, -round2(secA.cum + secB.cum)), { font: F_LABEL, fill: PEACH, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
  borderRange(ws, `B${totalRow}:AA${totalRow}`);
  ws.getRow(totalRow).height = 21;

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 12 }];
  ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `B13:Q${totalRow}`, paperSize: 9 };
  return { secA, secB, totalRow };
}

function writeCover(ws: ExcelJS.Worksheet, claim: Claim, ctx: ClaimDocContext, det: ReturnType<typeof writeDetails>) {
  const widths: Record<string, number> = { A: 3, B: 5.2, C: 45.6, D: 20.1, E: 18.4, F: 15.3, G: 15.4, H: 14.5, I: 8.5, J: 11.2 };
  for (const [k, w] of Object.entries(widths)) ws.getColumn(k).width = w;
  const t = computeClaimTotals(claim, ctx);
  const claimDate = parseDate(claim.claimDate) ?? parseDate(claim.submittedDate);

  mergeBox(ws, "B2:D3", "[ Company Logo ]", { font: F_NOTE, fill: GREY, align: { horizontal: "center", vertical: "middle" } });
  ws.mergeCells("B8:J8");
  setCell(ws, "B8", "PROGRESS CLAIM", { font: F_TITLE, align: { horizontal: "center", vertical: "middle" }, border: false });
  ws.getRow(8).height = 25.5;

  ws.mergeCells("B10:D10");
  setCell(ws, "B10", "Progress Claim Ref. No.:", { font: F_LABEL, border: false });
  mergeBox(ws, "E10:F10", claim.claimNo ?? claimNumberDisplay(claim), { fill: YELLOW, align: { horizontal: "left" } });
  ws.mergeCells("G10:H10");
  setCell(ws, "G10", "Progress Claim Date:", { font: F_LABEL, border: false });
  mergeBox(ws, "I10:J10", claimDate ? utcDate(claimDate) : null, { fill: YELLOW, nf: NF_DATE, align: { horizontal: "left" } });

  const party = (
    startRow: number,
    heading: string,
    p: { name: string; address: string; tel: string; fax: string; email: string; pic: string },
    yellow: boolean,
  ) => {
    ws.mergeCells(`B${startRow}:J${startRow}`);
    setCell(ws, `B${startRow}`, heading, { font: F_LABEL, border: false });
    // Master merges the "From" Company Name and Email across E:H (the "To" block
    // keeps them at E:F). Address, Tel, Fax use the same width in both blocks.
    const wideName = heading.startsWith("From");
    const rows: [string, ExcelJS.CellValue, string][] = [
      ["Company Name:", p.name, wideName ? `E${startRow + 1}:H${startRow + 1}` : `E${startRow + 1}:F${startRow + 1}`],
      ["Address:", p.address, `E${startRow + 2}:H${startRow + 4}`],
      ["Tel:", p.tel, `E${startRow + 5}:F${startRow + 5}`],
      ["Fax:", p.fax, `E${startRow + 6}:F${startRow + 6}`],
      ["Email:", p.email, wideName ? `E${startRow + 7}:H${startRow + 7}` : `E${startRow + 7}:F${startRow + 7}`],
      ["Person-in-charge (Respondent):", p.pic, `E${startRow + 8}:H${startRow + 8}`],
    ];
    if (wideName) rows[5][0] = "Person-in-charge (Claimant):";
    rows.forEach(([label, value, range], i) => {
      const row = startRow + 1 + (i >= 2 ? i + 2 : i);
      ws.mergeCells(`B${row}:D${row}`);
      setCell(ws, `B${row}`, label, { font: F_LABEL, border: false });
      mergeBox(ws, range, value, {
        fill: yellow || label.startsWith("Person") ? YELLOW : undefined,
        // Address block wraps three rows and is vertically centered in the master,
        // not top-aligned — otherwise the middle line rides against the top border.
        align: { horizontal: "left", vertical: "middle", wrapText: i === 1 },
      });
    });
    for (let r = startRow + 1; r <= startRow + 8; r++) ws.getRow(r).height = 15;
  };
  party(12, "To:  (Main Contractor)", {
    name: claim.clientName || "",
    address: claim.clientAddress || "",
    tel: claim.contactNumber || "",
    fax: "-",
    email: ctx.clientEmail || "",
    pic: claim.contactPerson || "",
  }, true);
  party(22, "From:", { ...CONPLUS, pic: ctx.preparedBy || "" }, false);

  ws.mergeCells("B32:J32");
  setCell(ws, "B32", "Particulars of Contract", { font: F_BAND, fill: BAND, align: { horizontal: "center", vertical: "middle" }, border: false });
  setCell(ws, "B33", "Project Site:", { font: F_LABEL, border: false });
  mergeBox(ws, "D33:G33", ctx.projectSite || claim.projectName || "", { font: F_LABEL, fill: YELLOW, align: { horizontal: "left" } });
  setCell(ws, "H33", "Project No.:", { font: F_LABEL, border: false });
  mergeBox(ws, "I33:J33", claim.projectCode, { fill: YELLOW });
  setCell(ws, "B34", "Sub-Contract Title / Description:", { font: F_LABEL, border: false });
  mergeBox(ws, "D34:J35", claim.description || "", { font: F_LABEL, fill: YELLOW, align: { horizontal: "left", vertical: "top", wrapText: true } });
  setCell(ws, "B36", "LOA / WO / PO (*) Ref. No.:", { font: F_LABEL, border: false });
  mergeBox(ws, "D36:F36", claim.woRef || claim.poRef || "NIL — LOA pending", { fill: YELLOW, align: { horizontal: "left" } });
  mergeBox(ws, "G36:H36", "LOA / WO / PO (*) Date:", { font: F_LABEL });
  mergeBox(ws, "I36:J36", "NIL", { fill: YELLOW });
  setCell(ws, "B37", "Sub-Contract Period:", { font: F_LABEL, border: false });
  mergeBox(ws, "D37:F37", claim.woRef || claim.poRef ? "" : "NIL — LOA pending", { fill: YELLOW, align: { horizontal: "left" } });
  setCell(ws, "B38", "Reference Period of Claim:", { font: F_LABEL, border: false });
  setCell(ws, "E38", "From:", { font: ARIAL({ bold: true, italic: true }) });
  // Reference Period tracks the WORK month (the month before the claim submission),
  // matching the client-corrected master where a September claim shows Aug 2026.
  setCell(ws, "F38", claimDate ? workMonthStart(claimDate) : null, { font: ARIAL({ bold: true, italic: true, size: 11 }), fill: YELLOW, nf: NF_MONTH });
  mergeBox(ws, "G38:H38", "To:", { font: ARIAL({ bold: true, italic: true }) });
  // Single-month claim: To == From (both show the work month as mm/yyyy).
  mergeBox(ws, "I38:J38", claimDate ? workMonthStart(claimDate) : null, { font: ARIAL({ bold: true, italic: true, size: 11 }), fill: YELLOW, nf: NF_MONTH, align: { horizontal: "left" } });
  setCell(ws, "B39", "Monthly Claim Cut-off Date:", { font: F_LABEL, border: false });
  mergeBox(ws, "E39:F39", "NIL", { fill: YELLOW });
  for (let r = 33; r <= 39; r++) ws.getRow(r).height = 15;

  ws.mergeCells("B41:I41");
  setCell(ws, "B41", "PAYMENT CLAIM PARTICULARS", { font: F_TITLE, align: { horizontal: "center", vertical: "middle" }, border: false });
  ws.getRow(41).height = 24;

  const headers: [string, string][] = [["B", "S/N"], ["C", "Description"], ["D", "Sub-Contract\nSum (S$)"], ["E", "% of Work\nDone"], ["F", "Amount Claimed\nfor Work Done (S$)"], ["G", "Payment\nCertified (S$)"]];
  for (const [col, text] of headers)
    mergeBox(ws, `${col}43:${col}44`, text, { font: F_LABEL, fill: GREY, align: { horizontal: "center", vertical: "middle", wrapText: true } });
  ws.getRow(43).height = 30; ws.getRow(44).height = 25.5;

  const D = `'${CLAIM_SHEET_DETAILS}'`;
  const retPct = (ctx.retentionPct ?? claim.retentionPct ?? 10) / 100;
  const capPct = ctx.retentionCapPct ?? 5;
  const ladder: { sn: string; desc: string; D?: ExcelJS.CellValue; E?: ExcelJS.CellValue; F: ExcelJS.CellValue; G: ExcelJS.CellValue; strong?: boolean; yellowF?: boolean; yellowE?: boolean; pctE?: boolean }[] = [
    { sn: "1", desc: "Sub-Contract Works", D: fx(`${D}!G${det.secA.subtotalRow}`, det.secA.contract), E: fx("IF(D45=0,0,F45/D45)", det.secA.contract ? det.secA.cum / det.secA.contract : 0), F: fx(`${D}!O${det.secA.subtotalRow}`, det.secA.cum), G: fx(`${D}!Y${det.secA.subtotalRow}`, 0), pctE: true },
    { sn: "2", desc: "Variation Works", D: fx(`${D}!G${det.secB.subtotalRow}`, det.secB.contract), E: fx("IF(D46=0,0,F46/D46)", det.secB.contract ? det.secB.cum / det.secB.contract : 0), F: fx(`${D}!O${det.secB.subtotalRow}`, det.secB.cum), G: fx(`${D}!Y${det.secB.subtotalRow}`, 0), pctE: true },
    { sn: "3", desc: "Total Value of Work Carried Out", D: fx("D45+D46", det.secA.contract + det.secB.contract), E: fx("IF(D47=0,0,F47/D47)", (det.secA.contract + det.secB.contract) ? t.workDone / (det.secA.contract + det.secB.contract) : 0), F: fx("F45+F46", t.workDone), G: fx("G45+G46", 0), strong: true, pctE: true },
    { sn: "4", desc: "Add: Advance Payment", F: t.advancePayment, G: fx("F48", t.advancePayment), yellowF: true },
    { sn: "5", desc: "Less: Recovery of Advance Payment", F: t.advanceRecovery, G: fx("F49", t.advanceRecovery), yellowF: true },
    { sn: "6", desc: `Less: Retention (${Math.round(retPct * 100)}%) — Max ${capPct}% of Sub-Contract Sum`, E: retPct, F: fx("-ROUND((F47+F48-F49)*E50,2)", -t.retention), G: fx("-ROUND((G47+G48-G49)*E50,2)", 0), yellowE: true, pctE: true },
    { sn: "6.1", desc: "Add: Release of First Half Retention", F: t.firstRelease, G: fx("F51", t.firstRelease), yellowF: true },
    { sn: "6.2", desc: "Add: Release of Second Half Retention", F: t.secondRelease, G: fx("F52", t.secondRelease), yellowF: true },
    { sn: "7", desc: "Net Amount", F: fx("F47+F48-F49+F50+F51+F52", t.netAfterRetention), G: fx("G47+G48-G49+G50+G51+G52", 0), strong: true },
    { sn: "8", desc: "Less: Amounts Previously Certified", F: t.previouslyCertified, G: fx("F54", t.previouslyCertified), yellowF: true },
    { sn: "9", desc: "Claim Amount", F: fx("F53-F54", t.claimAmount), G: fx("G53-G54", 0), strong: true },
    { sn: "10", desc: `Add: ${ctx.gstPct ?? 9}% GST`, F: fx(`F55*${(ctx.gstPct ?? 9) / 100}`, round2(t.gst)), G: fx(`G55*${(ctx.gstPct ?? 9) / 100}`, 0) },
    { sn: "11", desc: "Claim Amount incl. GST", F: fx("F55+F56", round2(t.claimInclGst)), G: fx("G55+G56", 0), strong: true },
  ];
  ladder.forEach((row, i) => {
    const r = 45 + i;
    const strong = row.strong ? ARIAL({ bold: true }) : ARIAL();
    const sfill = row.strong ? PEACH : undefined;
    const hasD = row.D !== undefined;
    const hasE = row.E !== undefined;
    setCell(ws, `B${r}`, row.sn, { align: { horizontal: "center", vertical: "middle" } });
    setCell(ws, `C${r}`, row.desc, { font: strong, align: { vertical: "middle" } });
    // Master leaves D/E blank cells unstyled (no border, no numFmt) so the
    // Payment Claim Particulars box shows a clean pair of empty columns from
    // "Add: Advance Payment" downward.
    if (hasD) {
      setCell(ws, `D${r}`, row.D as ExcelJS.CellValue, { font: strong, fill: sfill, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    } else {
      setCell(ws, `D${r}`, "", { border: false });
    }
    if (hasE) {
      setCell(ws, `E${r}`, row.E as ExcelJS.CellValue, { font: strong, fill: row.yellowE ? YELLOW : sfill, nf: row.pctE ? NF_PCT : undefined, align: { horizontal: "center", vertical: "middle" } });
    } else {
      setCell(ws, `E${r}`, "", { border: false });
    }
    setCell(ws, `F${r}`, row.F, { font: strong, fill: row.yellowF ? YELLOW : sfill, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    setCell(ws, `G${r}`, row.G, { font: strong, fill: sfill, nf: NF_MONEY, align: { horizontal: "right", vertical: "middle" } });
    ws.getRow(r).height = 21;
  });

  ws.mergeCells("B60:C60");
  setCell(ws, "B60", "Prepared By:", { font: F_LABEL, border: false });
  ws.mergeCells("F60:I60");
  setCell(ws, "F60", "Name of Claimant / Auth. Rep.:", { font: F_LABEL, border: false, align: { horizontal: "left", vertical: "middle", wrapText: true } });
  ws.mergeCells("B62:C62");
  const sig = (addr: string, v: string) => { const c = setCell(ws, addr, v, { border: false }); c.border = { bottom: { style: "thin" } }; };
  sig("B62", ctx.preparedBy || "");
  ws.mergeCells("F62:G62");
  sig("F62", ctx.authorisedBy || "");
  ws.mergeCells("B63:C63");
  setCell(ws, "B63", "Name / Designation / Date", { font: F_NOTE, border: false });
  ws.mergeCells("F63:G63");
  setCell(ws, "F63", "Name / Designation / Date", { font: F_NOTE, border: false });

  ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: "A1:J63", paperSize: 9 };
}

function writeInstructions(ws: ExcelJS.Worksheet) {
  ws.getColumn("A").width = 3; ws.getColumn("B").width = 92;
  const lines: [string, Partial<ExcelJS.Font>, number?][] = [
    ["ConPlus Resources Pte Ltd — Progress Claim Template", ARIAL({ bold: true, size: 16 })],
    ["", ARIAL()],
    ["How this workbook is organised", ARIAL({ bold: true, size: 11 })],
    ["1. Cover Page & Claim Summary", F_LABEL],
    ["The full claim page in one place — company details, particulars of contract, and the Payment Claim Particulars table (Sub-Contract Works vs Variation Works, % done, amount claimed, and payment certified). Totals flow automatically from the Claim Details sheet.", ARIAL(), 36],
    ["", ARIAL()],
    ["2. Claim Details", F_LABEL],
    ["The priced schedule / bill of quantities — one row per work item, with description, unit, qty, rate, sub-contract sum, cumulative claimed (previous / current / total), % claimed, remarks, and the main contractor's cumulative verified figures with their own % verified.", ARIAL(), 36],
    ["", ARIAL()],
    ["How to fill it in", ARIAL({ bold: true, size: 11 })],
    ["• Yellow cells are for manual input. White cells with formulas recalculate automatically — do not overwrite them.", ARIAL()],
    ["• Enter this month's quantity claimed in the 'Current' column of each item's work-done row; 'Previous' carries over last month's cumulative total.", ARIAL()],
    ["• Retention %, advance payment, and previously-certified amounts on the Cover Page are manual entries — confirm against the sub-contract terms each month.", ARIAL()],
    ["• GST is pre-set at 9% (Singapore) — update the rate cell if it changes.", ARIAL()],
  ];
  lines.forEach(([text, font, h], i) => {
    const c = ws.getCell(`B${i + 2}`);
    c.value = text; c.font = font;
    c.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    if (h) ws.getRow(i + 2).height = h;
  });
}

export function buildClaimWorkbook(claim: Claim, ctx: ClaimDocContext): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conplus Resources Pte Ltd";
  writeInstructions(wb.addWorksheet("Instructions"));
  const cover = wb.addWorksheet(CLAIM_SHEET_COVER);
  const details = wb.addWorksheet(CLAIM_SHEET_DETAILS);
  const det = writeDetails(details, claim, ctx);
  writeCover(cover, claim, ctx, det);
  return wb;
}

export function claimExcelFileName(claim: Claim): string {
  const no = claim.claimNo != null ? String(claim.claimNo).padStart(2, "0") : claimNumberDisplay(claim);
  return `${claim.projectCode || "Claim"}_Progress_Claim_${no}.xlsx`;
}

/** Browser entry point: build, then download. */
export async function exportClaimToExcel(claim: Claim, ctx: ClaimDocContext): Promise<void> {
  if (!confirmClaimExport(claim, ctx)) return;
  const wb = buildClaimWorkbook(claim, ctx);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = claimExcelFileName(claim);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
