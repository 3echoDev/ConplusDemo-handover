// Works Order Excel export — replicates the Conplus WO template layout exactly.
// 11-column layout: A=S/NO, B=Description, C=Colour, D=Dosage, E=Dosage unit,
// F=Packing, G=Packing unit, H=Order Qty, I=Qty unit, J=Remarks, K=Calculation.
import ExcelJS from "exceljs";
import type { WorksOrder } from "@/data/sampleData";

/* ── Colors matching the template ────────────────────────────────── */

const TEAL = "FF006B54";
const LABEL_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD0E8E0" } };
const COL_HEAD_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7FBFAF" } };
const AREA_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCE5CC" } };
const CALC_HEAD_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
const SIG_HEAD_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};

const F_TITLE: Partial<ExcelJS.Font> = { name: "Arial", size: 14, bold: true, color: { argb: TEAL } };
const F_LABEL: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true };
const F_VALUE: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true };
const F_COL_HEAD: Partial<ExcelJS.Font> = { name: "Arial", size: 9, bold: true };
const F_CELL: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const F_CELL_BOLD: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true };
const F_PREP: Partial<ExcelJS.Font> = { name: "Arial", size: 10, italic: false };
const F_SIG: Partial<ExcelJS.Font> = { name: "Arial", size: 9 };
const F_CALC: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true };

/* A–K = 11 columns */
const COL_COUNT = 11;

const BASE_ACKNOWLEDGE = ["Jensen", "Halal", "Seng Tat", "Wendy", "Hnin", "Vincent"];

function acknowledgeList(wo: WorksOrder): string[] {
  const names = [...BASE_ACKNOWLEDGE];
  for (const n of [wo.sales, wo.projectIc]) {
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function borderedRange(ws: ExcelJS.Worksheet, row: number, c1: number, c2: number) {
  for (let c = c1; c <= c2; c++) ws.getCell(row, c).border = THIN;
}

/** Write a header label+value pair matching the template's bordered-cell style. */
function headerRow(
  ws: ExcelJS.Worksheet,
  row: number,
  leftLabel: string,
  leftValue: string,
  leftValue2: string | null, // second cell (e.g. phone number) or null
  rightLabel: string,
  rightValue: string,
) {
  // Left label: A–B merged, teal bg
  ws.mergeCells(row, 1, row, 2);
  const lbl = ws.getCell(row, 1);
  lbl.value = leftLabel;
  lbl.font = F_LABEL;
  lbl.fill = LABEL_FILL;
  lbl.alignment = { vertical: "middle" };
  lbl.border = THIN;
  ws.getCell(row, 2).border = THIN;

  if (leftValue2 !== null) {
    // Contact-style: name in C, phone in D–E
    ws.getCell(row, 3).value = leftValue;
    ws.getCell(row, 3).font = F_VALUE;
    ws.getCell(row, 3).alignment = { vertical: "middle" };
    ws.getCell(row, 3).border = THIN;

    ws.mergeCells(row, 4, row, 5);
    ws.getCell(row, 4).value = leftValue2;
    ws.getCell(row, 4).font = F_VALUE;
    ws.getCell(row, 4).alignment = { vertical: "middle" };
    ws.getCell(row, 4).border = THIN;
    ws.getCell(row, 5).border = THIN;
  } else {
    // Standard: value in C–E merged
    ws.mergeCells(row, 3, row, 5);
    ws.getCell(row, 3).value = leftValue;
    ws.getCell(row, 3).font = F_VALUE;
    ws.getCell(row, 3).alignment = { vertical: "middle" };
    borderedRange(ws, row, 3, 5);
  }

  // Right label: F–G merged, teal bg
  ws.mergeCells(row, 6, row, 7);
  const rLbl = ws.getCell(row, 6);
  rLbl.value = rightLabel;
  rLbl.font = F_LABEL;
  rLbl.fill = LABEL_FILL;
  rLbl.alignment = { vertical: "middle" };
  ws.getCell(row, 6).border = THIN;
  ws.getCell(row, 7).border = THIN;

  // Right value: H–K merged
  ws.mergeCells(row, 8, row, COL_COUNT);
  ws.getCell(row, 8).value = rightValue;
  ws.getCell(row, 8).font = F_VALUE;
  ws.getCell(row, 8).alignment = { vertical: "middle" };
  borderedRange(ws, row, 8, COL_COUNT);
}

/* ── Main export ─────────────────────────────────────────────────── */

export async function exportWOTemplateExcel(wo: WorksOrder): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conplus Resources Pte Ltd";
  const ws = wb.addWorksheet("Works Order", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 18 },
  });

  // Column widths matching the template
  ws.columns = [
    { width: 5 },    // A: S/NO
    { width: 26 },   // B: Description
    { width: 11 },   // C: Colour
    { width: 8 },    // D: Dosage (number)
    { width: 8 },    // E: Dosage (unit)
    { width: 8 },    // F: Packing (number)
    { width: 8 },    // G: Packing (unit)
    { width: 8 },    // H: Order Qty (number)
    { width: 7 },    // I: Qty unit
    { width: 16 },   // J: Remarks
    { width: 14 },   // K: Calculation
  ];

  let r = 1;

  /* ── Title ─────────────────────────────────────────────────────── */
  ws.mergeCells(r, 1, r, COL_COUNT);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `W O R K S   O R D E R   ${wo.woNumber}`;
  titleCell.font = F_TITLE;
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 30;
  r += 2; // blank row

  /* ── Header block ──────────────────────────────────────────────── */
  headerRow(ws, r, "Client", wo.clientName || "", null, "Sales", wo.sales || "");
  r++;
  r++; // one blank row after Client/Sales

  headerRow(ws, r, "Project", wo.siteAddress || "", null, "Project IC", wo.projectIc || "");
  r++;
  r++;

  headerRow(ws, r, "Contact Person", wo.siteContact || "", wo.siteContactNumber || "", "Quotation", wo.quotationRef || "");
  r++;
  r++;

  headerRow(ws, r, "Site Contact Person", wo.siteContact || "", wo.siteContactNumber || "", "Job No.", wo.jobNo || wo.projectCode || "");
  r++;
  r++;

  headerRow(ws, r, "Start Date", wo.startDate || "", null, "Date", wo.issueDate || "");
  r++;

  /* ── Column headers ────────────────────────────────────────────── */
  // DOSAGE spans D–E, PACKING spans F–G, ORDER QUANTITY spans H–I
  const singleHeaders: [number, string][] = [
    [1, "S/NO"], [2, "DESCRIPTION"], [3, "COLOUR"], [10, "REMARKS"],
  ];
  const mergedHeaders: [number, number, string][] = [
    [4, 5, "DOSAGE"],
    [6, 7, "PACKING"],
    [8, 9, "ORDER\nQUANTITY"],
  ];

  for (const [c, label] of singleHeaders) {
    const cell = ws.getCell(r, c);
    cell.value = label;
    cell.font = F_COL_HEAD;
    cell.fill = COL_HEAD_FILL;
    cell.border = THIN;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  for (const [c1, c2, label] of mergedHeaders) {
    ws.mergeCells(r, c1, r, c2);
    const cell = ws.getCell(r, c1);
    cell.value = label;
    cell.font = F_COL_HEAD;
    cell.fill = COL_HEAD_FILL;
    cell.border = THIN;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getCell(r, c2).border = THIN;
  }
  // CALCULATION header in K — yellow fill
  ws.getCell(r, 11).value = "CALCULATION";
  ws.getCell(r, 11).font = F_COL_HEAD;
  ws.getCell(r, 11).fill = CALC_HEAD_FILL;
  ws.getCell(r, 11).border = THIN;
  ws.getCell(r, 11).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  ws.getRow(r).height = 28;
  r++;

  /* ── Per-area sections ─────────────────────────────────────────── */
  for (const area of wo.areas) {
    const areaStartRow = r;

    // Area header row — green fill
    ws.getCell(r, 1).value = area.seq;
    ws.getCell(r, 1).font = { ...F_CELL_BOLD, color: { argb: TEAL } };
    ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };

    // Area name in B, merged B–G
    ws.mergeCells(r, 2, r, 7);
    ws.getCell(r, 2).value = area.areaName;
    ws.getCell(r, 2).font = { ...F_CELL_BOLD, color: { argb: TEAL } };
    ws.getCell(r, 2).alignment = { vertical: "middle", wrapText: true };

    // Area sqm in H (number) + I (unit "m2"), or prep_note verbatim
    if (area.areaSqm != null) {
      ws.getCell(r, 8).value = area.areaSqm;
      ws.getCell(r, 8).font = { ...F_CELL_BOLD, color: { argb: TEAL } };
      ws.getCell(r, 8).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(r, 9).value = "m2";
      ws.getCell(r, 9).font = { ...F_CELL_BOLD, color: { argb: TEAL } };
      ws.getCell(r, 9).alignment = { horizontal: "left", vertical: "middle" };
    } else if (area.prepNote) {
      // Non-m2 items show prep_note verbatim in the qty area
      ws.mergeCells(r, 8, r, 9);
      ws.getCell(r, 8).value = area.prepNote;
      ws.getCell(r, 8).font = { ...F_CELL_BOLD, color: { argb: TEAL } };
      ws.getCell(r, 8).alignment = { horizontal: "center", vertical: "middle" };
    }

    // Style area row — green fill + borders
    for (let c = 1; c <= COL_COUNT; c++) {
      ws.getCell(r, c).fill = AREA_FILL;
      ws.getCell(r, c).border = THIN;
    }
    r++;

    // Prep note row (e.g. "Surface preparation by grinding")
    if (area.prepNote) {
      ws.getCell(r, 1).value = "";
      ws.mergeCells(r, 2, r, 10);
      ws.getCell(r, 2).value = area.prepNote;
      ws.getCell(r, 2).font = F_PREP;
      ws.getCell(r, 2).alignment = { vertical: "middle", wrapText: true };
      // CALCULATION header for this area section (yellow)
      ws.getCell(r, 11).value = "CALCULATION";
      ws.getCell(r, 11).font = F_COL_HEAD;
      ws.getCell(r, 11).fill = CALC_HEAD_FILL;
      ws.getCell(r, 11).border = THIN;
      ws.getCell(r, 11).alignment = { horizontal: "center", vertical: "middle" };
      borderedRange(ws, r, 1, 10);
      r++;
    }

    // Material lines
    if (area.lines.length > 0) {
      const parents = area.lines.filter((l) => !l.parentLineId);
      const childrenOf = (id: string) => area.lines.filter((l) => l.parentLineId === id);

      const renderLine = (l: typeof area.lines[number], isChild: boolean, lineIdx: number) => {
        const desc = isChild ? `  ${l.description}` : l.description;
        const font = isChild ? { ...F_CELL, color: { argb: "FF666666" } } : F_CELL_BOLD;

        ws.getCell(r, 1).value = "";
        ws.getCell(r, 1).border = THIN;

        ws.getCell(r, 2).value = desc;
        ws.getCell(r, 2).font = font;
        ws.getCell(r, 2).alignment = { vertical: "middle", wrapText: true };
        ws.getCell(r, 2).border = THIN;

        ws.getCell(r, 3).value = l.colour || "";
        ws.getCell(r, 3).font = F_CELL;
        ws.getCell(r, 3).alignment = { horizontal: "center", vertical: "middle" };
        ws.getCell(r, 3).border = THIN;

        // Dosage: number in D, unit in E
        ws.getCell(r, 4).value = l.dosage != null ? l.dosage : "";
        ws.getCell(r, 4).font = F_CELL;
        ws.getCell(r, 4).alignment = { horizontal: "right", vertical: "middle" };
        ws.getCell(r, 4).border = THIN;
        if (l.dosage != null) ws.getCell(r, 4).numFmt = "0.000";

        ws.getCell(r, 5).value = l.dosage != null ? l.dosageUnit : "";
        ws.getCell(r, 5).font = F_CELL;
        ws.getCell(r, 5).alignment = { horizontal: "left", vertical: "middle" };
        ws.getCell(r, 5).border = THIN;

        // Packing: number in F, unit in G
        ws.getCell(r, 6).value = l.packingSize != null ? l.packingSize : "";
        ws.getCell(r, 6).font = F_CELL;
        ws.getCell(r, 6).alignment = { horizontal: "right", vertical: "middle" };
        ws.getCell(r, 6).border = THIN;
        if (l.packingSize != null) ws.getCell(r, 6).numFmt = "0.00";

        ws.getCell(r, 7).value = l.packingSize != null ? l.packingUnit : l.isMixComponent ? "-" : "";
        ws.getCell(r, 7).font = F_CELL;
        ws.getCell(r, 7).alignment = { horizontal: "left", vertical: "middle" };
        ws.getCell(r, 7).border = THIN;

        // Order Qty: number in H, unit in I
        if (l.isMixComponent) {
          ws.getCell(r, 8).value = "";
          ws.getCell(r, 9).value = "";
        } else {
          const qty = l.orderQty != null ? l.orderQty : l.requiredQty;
          ws.getCell(r, 8).value = qty ?? "";
          ws.getCell(r, 9).value = l.qtyUnit || "";
        }
        ws.getCell(r, 8).font = F_CELL;
        ws.getCell(r, 8).alignment = { horizontal: "center", vertical: "middle" };
        ws.getCell(r, 8).border = THIN;
        ws.getCell(r, 9).font = F_CELL;
        ws.getCell(r, 9).alignment = { horizontal: "left", vertical: "middle" };
        ws.getCell(r, 9).border = THIN;

        // Remarks in J
        ws.getCell(r, 10).value = l.remarks || "";
        ws.getCell(r, 10).font = F_CELL;
        ws.getCell(r, 10).alignment = { vertical: "middle", wrapText: true };
        ws.getCell(r, 10).border = THIN;

        // CALCULATION in K: Excel formula = D{row} * areaSqm / F{row}
        if (!l.isMixComponent && l.dosage != null && l.packingSize != null && l.packingSize > 0 && area.areaSqm != null) {
          ws.getCell(r, 11).value = { formula: `D${r}*${area.areaSqm}/F${r}`, result: (l.dosage * area.areaSqm) / l.packingSize };
          ws.getCell(r, 11).numFmt = "0.00";
        } else {
          ws.getCell(r, 11).value = "";
        }
        ws.getCell(r, 11).font = F_CALC;
        ws.getCell(r, 11).alignment = { horizontal: "right", vertical: "middle" };
        ws.getCell(r, 11).border = THIN;

        r++;
      };

      let lineIdx = 0;
      for (const p of parents) {
        renderLine(p, false, lineIdx++);
        for (const c of childrenOf(p.id)) {
          renderLine(c, true, lineIdx++);
        }
      }
    } else {
      // Skeleton WO — 6 empty bordered rows for paper fill-in
      for (let i = 0; i < 6; i++) {
        for (let c = 1; c <= COL_COUNT; c++) {
          ws.getCell(r, c).value = "";
          ws.getCell(r, c).border = THIN;
        }
        r++;
      }
    }

    r++; // gap between areas
  }

  /* ── Signature / acknowledge block ─────────────────────────────── */
  r++;

  // Signature table: centered under cols D–I
  const sigNameCol = 4;
  const sigAckCol = 6;
  const sigDateCol = 8;

  // Headers
  ws.mergeCells(r, sigNameCol, r, sigNameCol + 1);
  ws.getCell(r, sigNameCol).value = "Name";
  ws.getCell(r, sigNameCol).font = F_COL_HEAD;
  ws.getCell(r, sigNameCol).fill = SIG_HEAD_FILL;
  ws.getCell(r, sigNameCol).border = THIN;
  ws.getCell(r, sigNameCol).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r, sigNameCol + 1).border = THIN;

  ws.mergeCells(r, sigAckCol, r, sigAckCol + 1);
  ws.getCell(r, sigAckCol).value = "Acknowledge";
  ws.getCell(r, sigAckCol).font = F_COL_HEAD;
  ws.getCell(r, sigAckCol).fill = SIG_HEAD_FILL;
  ws.getCell(r, sigAckCol).border = THIN;
  ws.getCell(r, sigAckCol).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r, sigAckCol + 1).border = THIN;

  ws.mergeCells(r, sigDateCol, r, sigDateCol + 1);
  ws.getCell(r, sigDateCol).value = "Date";
  ws.getCell(r, sigDateCol).font = F_COL_HEAD;
  ws.getCell(r, sigDateCol).fill = SIG_HEAD_FILL;
  ws.getCell(r, sigDateCol).border = THIN;
  ws.getCell(r, sigDateCol).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r, sigDateCol + 1).border = THIN;
  r++;

  // Signature rows
  const names = acknowledgeList(wo);
  for (const name of names) {
    ws.mergeCells(r, sigNameCol, r, sigNameCol + 1);
    ws.getCell(r, sigNameCol).value = name;
    ws.getCell(r, sigNameCol).font = F_SIG;
    ws.getCell(r, sigNameCol).alignment = { vertical: "middle" };
    ws.getCell(r, sigNameCol).border = THIN;
    ws.getCell(r, sigNameCol + 1).border = THIN;

    ws.mergeCells(r, sigAckCol, r, sigAckCol + 1);
    ws.getCell(r, sigAckCol).value = "";
    ws.getCell(r, sigAckCol).border = THIN;
    ws.getCell(r, sigAckCol + 1).border = THIN;

    ws.mergeCells(r, sigDateCol, r, sigDateCol + 1);
    ws.getCell(r, sigDateCol).value = "";
    ws.getCell(r, sigDateCol).border = THIN;
    ws.getCell(r, sigDateCol + 1).border = THIN;

    ws.getRow(r).height = 22;
    r++;
  }

  /* ── Download ──────────────────────────────────────────────────── */
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Works Order ${wo.woNumber}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
