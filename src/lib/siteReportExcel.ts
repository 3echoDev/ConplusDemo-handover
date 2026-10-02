// Dashboard Report workbook — the layout of the "Dashboard Report" sheet in
// Lynn's "Project planning and tracking workflow (R1).xlsx":
//   A2 CLIENT / SITE · A3 PROJECT REF · A4 WO
//   row 6  WEEKLY PLAN (A:E) | DAILY MATERIAL REPORT (PLANNED) (F:M) | (ACTUAL) (N:S)
//   row 7  column headers, rows 8+ one row per date + location
// buildDashboardWorkbook() is DOM-free so it runs under vitest; the download
// entry point sits at the bottom.
import ExcelJS from "exceljs";
import { fmtDay, type DashboardRow } from "@/lib/siteReports";

export const DASHBOARD_SHEET = "Dashboard Report";

export const DASHBOARD_HEADERS = [
  "Date", "Location", "Activities", "Area (m2)", "Manpower",
  "Location", "Activities", "Area (m2)", "Manpower", "Material", "Qty", "Coverage", "Remarks",
  "Activities", "Area (m2)", "Material", "Qty", "Coverage", "Remarks",
] as const;

export interface DashboardMeta {
  clientSite: string; // "Straits Construction / Plantation Close"
  projectRef: string; // "E25028"
  wo: string; // last works order, or "" when none
  from: string;
  to: string;
}

const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const BLOCK_FILL = ["FFDDEBF7", "FFFFF2CC", "FFE2EFDA"]; // weekly, planned, actual
const SETS = 'General" sets"';

export function buildDashboardWorkbook(rows: DashboardRow[], meta: DashboardMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONPLUS Site Reports";
  const ws = wb.addWorksheet(DASHBOARD_SHEET, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: "frozen", ySplit: 7 }],
  });

  const widths = [8, 22, 26, 10, 9, 22, 26, 10, 9, 16, 9, 11, 18, 26, 10, 16, 9, 11, 18];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const label = (addr: string, text: string) => {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { bold: true };
  };
  label("A2", "CLIENT / SITE:");
  ws.getCell("B2").value = meta.clientSite;
  label("A3", "PROJECT REF:");
  ws.getCell("B3").value = meta.projectRef;
  label("A4", "WO:");
  ws.getCell("B4").value = meta.wo || "—";

  const blocks: [string, string, string][] = [
    ["A6:E6", "A6", "WEEKLY PLAN"],
    ["F6:M6", "F6", "DAILY MATERIAL REPORT (PLANNED)"],
    ["N6:S6", "N6", "DAILY MATERIAL REPORT (ACTUAL)"],
  ];
  blocks.forEach(([range, addr, text], i) => {
    ws.mergeCells(range);
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLOCK_FILL[i] } };
    c.border = border;
  });

  const head = ws.getRow(7);
  DASHBOARD_HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLOCK_FILL[i < 5 ? 0 : i < 13 ? 1 : 2] } };
    c.border = border;
  });

  rows.forEach((r, i) => {
    const w = r.weekly;
    const p = r.planned;
    const a = r.actual;
    const row = ws.getRow(8 + i);
    // Column A names the row's own day; a plan row spanning days says so,
    // like the screen ("16/9 (plan 16–17/9)"), instead of repeating the span.
    const day = fmtDay(r.date);
    row.values = [
      w && w.range !== day ? `${day} (plan ${w.range})` : day,
      w?.location ?? "", w?.activities ?? "", w?.area ?? null, w?.manpower ?? null,
      p?.location ?? "", p?.activities ?? "", p?.area ?? null, p?.manpower ?? null,
      p?.material ?? "", p?.qty ?? null, p?.coverage ?? "", p?.remarks ?? "",
      a?.activities ?? "", a?.area ?? null, a?.material ?? "", a?.qty ?? null, a?.coverage ?? "", a?.remarks ?? "",
    ];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > 19) return;
      c.border = border;
      c.alignment = { vertical: "top", wrapText: true };
    });
    for (const col of [4, 8, 15]) ws.getCell(8 + i, col).numFmt = "#,##0.00";
    for (const col of [11, 17]) ws.getCell(8 + i, col).numFmt = SETS;
  });

  const noteRow = 8 + rows.length + 1;
  ws.getCell(noteRow, 1).value = "Notes :";
  ws.getCell(noteRow, 1).font = { bold: true };
  ws.getCell(noteRow + 1, 1).value =
    `Compiled from the Site Reports tab for ${meta.from} to ${meta.to}. ` +
    "A plan row with nothing under PLANNED / ACTUAL had no daily report on that day.";
  return wb;
}

export function dashboardFileName(meta: DashboardMeta): string {
  return `Dashboard_Report_${meta.projectRef}_${meta.from}_to_${meta.to}.xlsx`;
}

export async function exportDashboardToExcel(rows: DashboardRow[], meta: DashboardMeta): Promise<void> {
  const wb = buildDashboardWorkbook(rows, meta);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dashboardFileName(meta);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
