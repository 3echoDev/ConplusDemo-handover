// Works Order Excel export — replicates the Conplus WO template layout.
// Produces a downloadable .xlsx matching the physical 7-signature document.
import ExcelJS from "exceljs";
import type { WorksOrder } from "@/data/sampleData";

/* ── Style constants ────────────────────────────────────────────── */

const ORANGE = "FF8B4513";
const HEADER_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
const AREA_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
const COL_HEAD_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};
const FONT_TITLE: Partial<ExcelJS.Font> = { name: "Arial", size: 14, bold: true };
const FONT_LABEL: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true };
const FONT_VALUE: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const FONT_COL_HEAD: Partial<ExcelJS.Font> = { name: "Arial", size: 9, bold: true };
const FONT_CELL: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const FONT_CELL_BOLD: Partial<ExcelJS.Font> = { name: "Arial", size: 10, bold: true };
const FONT_SIG: Partial<ExcelJS.Font> = { name: "Arial", size: 9 };

/* Columns: A(1)=S/NO, B(2)=Description, C(3)=Colour, D(4)=Dosage, E(5)=Packing, F(6)=Order Qty, G(7)=Remarks */
const COL_COUNT = 7;

const BASE_ACKNOWLEDGE = ["Jensen", "Halal", "Seng Tat", "Wendy", "Hnin", "Vincent"];

function acknowledgeList(wo: WorksOrder): string[] {
  const names = [...BASE_ACKNOWLEDGE];
  for (const n of [wo.sales, wo.projectIc]) {
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function mergeCells(ws: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  ws.mergeCells(row, startCol, row, endCol);
}

function setRowBorders(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
}

function headerPair(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string,
  labelCol: number,
  valueCol: number,
  valueEndCol: number,
) {
  const lCell = ws.getCell(row, labelCol);
  lCell.value = label;
  lCell.font = { ...FONT_LABEL, color: { argb: ORANGE }, underline: true };
  lCell.alignment = { vertical: "middle" };

  ws.mergeCells(row, valueCol, row, valueEndCol);
  const vCell = ws.getCell(row, valueCol);
  vCell.value = value || "—";
  vCell.font = { ...FONT_VALUE, bold: true };
  vCell.alignment = { vertical: "middle" };
  vCell.border = { bottom: { style: "thin" } };
}

/* ── Main export function ────────────────────────────────────────── */

export async function exportWOTemplateExcel(wo: WorksOrder): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conplus Resources Pte Ltd";
  const ws = wb.addWorksheet("Works Order", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    properties: { defaultRowHeight: 18 },
  });

  // Column widths matching the template proportions
  ws.columns = [
    { width: 6 },   // A: S/NO
    { width: 32 },  // B: Description
    { width: 12 },  // C: Colour
    { width: 13 },  // D: Dosage
    { width: 12 },  // E: Packing
    { width: 14 },  // F: Order Quantity
    { width: 22 },  // G: Remarks
  ];

  let r = 1;

  /* ── Title row ─────────────────────────────────────────────────── */
  ws.mergeCells(r, 1, r, COL_COUNT);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `W O R K S   O R D E R   ${wo.woNumber.split("").join(" ")}`;
  titleCell.font = { ...FONT_TITLE, color: { argb: ORANGE } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 30;
  r += 2; // blank row

  /* ── Header block ──────────────────────────────────────────────── */
  // Row: Client | Sales
  headerPair(ws, r, "Client :", wo.clientName, 1, 2, 3);
  headerPair(ws, r, "Sales :", wo.sales, 5, 6, 7);
  r++;

  // Row: Project | Project IC
  headerPair(ws, r, "Project :", wo.siteAddress, 1, 2, 3);
  headerPair(ws, r, "Project IC:", wo.projectIc, 5, 6, 7);
  r++;

  // Row: Contact Person | Quotation No
  const contactStr = wo.siteContact
    ? `${wo.siteContact}${wo.siteContactNumber ? ` (${wo.siteContactNumber})` : ""}`
    : "—";
  headerPair(ws, r, "Contact Person :", contactStr, 1, 2, 3);
  headerPair(ws, r, "Quotation No:", wo.quotationRef, 5, 6, 7);
  r++;

  // Row: Site Contact Person | Job No.
  headerPair(ws, r, "Site Contact Person :", contactStr, 1, 2, 3);
  headerPair(ws, r, "Job No. :", wo.jobNo || wo.projectCode, 5, 6, 7);
  r++;

  // Row: Start date | Date (issue date)
  headerPair(ws, r, "Start date:", wo.startDate ?? "—", 1, 2, 3);
  headerPair(ws, r, "Date :", wo.issueDate ?? "—", 5, 6, 7);
  r += 2; // blank row

  /* ── Column headers ────────────────────────────────────────────── */
  const colHeaders = ["S/NO", "DESCRIPTION", "COLOUR", "DOSAGE", "PACKING", "ORDER\nQUANTITY", "REMARKS"];
  for (let c = 0; c < colHeaders.length; c++) {
    const cell = ws.getCell(r, c + 1);
    cell.value = colHeaders[c];
    cell.font = FONT_COL_HEAD;
    cell.fill = COL_HEAD_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  ws.getRow(r).height = 28;
  r++;

  /* ── Per-area sections ─────────────────────────────────────────── */
  for (const area of wo.areas) {
    // Area header row — spans full width, orange-tinted background
    mergeCells(ws, r, 1, 1); // S/NO cell with seq
    ws.getCell(r, 1).value = area.seq;
    ws.getCell(r, 1).font = FONT_CELL_BOLD;
    ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };

    // Area description: "Ramp Area: 3772m2 (Basement: 113m2, ...)"
    const areaLabel = area.areaSqm != null
      ? `${area.areaName}: ${area.areaSqm}m2`
      : area.areaName;

    ws.mergeCells(r, 2, r, COL_COUNT);
    const areaCell = ws.getCell(r, 2);
    areaCell.value = areaLabel;
    areaCell.font = FONT_CELL_BOLD;
    areaCell.alignment = { vertical: "middle", wrapText: true };

    // Style the area row
    for (let c = 1; c <= COL_COUNT; c++) {
      ws.getCell(r, c).fill = AREA_FILL;
      ws.getCell(r, c).border = THIN_BORDER;
    }
    r++;

    // Prep note as separate row if present
    if (area.prepNote) {
      mergeCells(ws, r, 1, COL_COUNT);
      const prepCell = ws.getCell(r, 1);
      prepCell.value = area.prepNote;
      prepCell.font = { ...FONT_CELL, italic: true, color: { argb: "FF666666" } };
      prepCell.alignment = { vertical: "middle", wrapText: true };
      setRowBorders(ws, r, COL_COUNT);
      r++;
    }

    // Material lines
    if (area.lines.length > 0) {
      const parents = area.lines.filter((l) => !l.parentLineId);
      const childrenOf = (id: string) => area.lines.filter((l) => l.parentLineId === id);

      const renderLine = (l: typeof area.lines[number], isChild: boolean) => {
        const desc = isChild ? `  ${l.description}` : l.description;

        ws.getCell(r, 1).value = ""; // no S/NO for individual lines within area
        ws.getCell(r, 2).value = desc;
        ws.getCell(r, 2).font = isChild
          ? { ...FONT_CELL, color: { argb: "FF666666" } }
          : { ...FONT_CELL_BOLD };
        ws.getCell(r, 2).alignment = { vertical: "middle", wrapText: true };

        ws.getCell(r, 3).value = l.colour || "";
        ws.getCell(r, 3).font = FONT_CELL;
        ws.getCell(r, 3).alignment = { horizontal: "center", vertical: "middle" };

        ws.getCell(r, 4).value = l.dosage != null ? `${l.dosage} ${l.dosageUnit}` : "";
        ws.getCell(r, 4).font = FONT_CELL;
        ws.getCell(r, 4).alignment = { horizontal: "center", vertical: "middle" };

        ws.getCell(r, 5).value = l.packingSize != null ? `${l.packingSize} ${l.packingUnit}` : l.isMixComponent ? "-" : "";
        ws.getCell(r, 5).font = FONT_CELL;
        ws.getCell(r, 5).alignment = { horizontal: "center", vertical: "middle" };

        // Order quantity
        if (l.isMixComponent) {
          ws.getCell(r, 6).value = "";
        } else {
          const qty = l.orderQty != null ? l.orderQty : l.requiredQty;
          const unit = l.qtyUnit || "";
          ws.getCell(r, 6).value = qty != null ? `${qty} ${unit}` : "";
        }
        ws.getCell(r, 6).font = FONT_CELL;
        ws.getCell(r, 6).alignment = { horizontal: "center", vertical: "middle" };

        ws.getCell(r, 7).value = l.remarks || "";
        ws.getCell(r, 7).font = FONT_CELL;
        ws.getCell(r, 7).alignment = { vertical: "middle", wrapText: true };

        setRowBorders(ws, r, COL_COUNT);
        r++;
      };

      for (const p of parents) {
        renderLine(p, false);
        for (const c of childrenOf(p.id)) {
          renderLine(c, true);
        }
      }
    } else {
      // Skeleton WO — empty material rows (6 blank rows so the salesperson can fill on paper)
      for (let i = 0; i < 6; i++) {
        for (let c = 1; c <= COL_COUNT; c++) {
          ws.getCell(r, c).value = "";
          ws.getCell(r, c).border = THIN_BORDER;
        }
        r++;
      }
    }

    r++; // gap between areas
  }

  /* ── Signature / acknowledge block ─────────────────────────────── */
  r++; // extra gap

  // Signature table headers
  const sigHeaders = ["", "Name", "Acknowledge", "Date"];
  ws.mergeCells(r, 1, r, 2);
  ws.getCell(r, 1).value = "";
  ws.getCell(r, 3).value = sigHeaders[1];
  ws.getCell(r, 3).font = FONT_COL_HEAD;
  ws.getCell(r, 3).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r, 3).border = THIN_BORDER;
  ws.getCell(r, 3).fill = HEADER_FILL;

  ws.getCell(r, 4).value = sigHeaders[2];
  ws.getCell(r, 4).font = FONT_COL_HEAD;
  ws.getCell(r, 4).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r, 4).border = THIN_BORDER;
  ws.getCell(r, 4).fill = HEADER_FILL;

  ws.getCell(r, 5).value = sigHeaders[3];
  ws.getCell(r, 5).font = FONT_COL_HEAD;
  ws.getCell(r, 5).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(r, 5).border = THIN_BORDER;
  ws.getCell(r, 5).fill = HEADER_FILL;
  r++;

  // Signature rows
  const names = acknowledgeList(wo);
  for (const name of names) {
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 3).value = name;
    ws.getCell(r, 3).font = FONT_SIG;
    ws.getCell(r, 3).alignment = { vertical: "middle" };
    ws.getCell(r, 3).border = THIN_BORDER;

    ws.getCell(r, 4).value = "";
    ws.getCell(r, 4).border = THIN_BORDER;

    ws.getCell(r, 5).value = "";
    ws.getCell(r, 5).border = THIN_BORDER;

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
