import { describe, expect, it } from "vitest";
import {
  buildDashboardRows,
  carryCrew,
  copyPlannedToActual,
  crewTotal,
  dashboardTotals,
  defaultSiteLocation,
  draftErrors,
  emptyHeader,
  emptyLine,
  fmtDay,
  fmtRange,
  linesFromPlan,
  materialVariance,
  planDays,
  qtyDelta,
  storedToForm,
  submitWarnings,
  toNum,
  weekStart,
  type StoredLine,
  type StoredReport,
  type WeeklyPlanRow,
} from "@/lib/siteReports";
import { buildDashboardWorkbook, DASHBOARD_HEADERS, DASHBOARD_SHEET, dashboardFileName } from "@/lib/siteReportExcel";

// Lynn's R1 workbook, Dashboard Report sheet: E25028 Straits Construction / Plantation Close.
const P = "proj-e25028";
const plan = (id: string, from: string, to: string, location: string, activities: string, area: number | null, manpower: number): WeeklyPlanRow => ({
  id,
  project_id: P,
  date_from: from,
  date_to: to,
  location,
  activities,
  area_m2: area,
  manpower,
  remarks: null,
});

const WEEK: WeeklyPlanRow[] = [
  plan("w1", "2026-09-14", "2026-09-14", "Phase 3", "Marking", null, 3),
  plan("w2", "2026-09-14", "2026-09-14", "Driveway & Parking lot", "Grinding", 1473.62, 4),
  plan("w3", "2026-09-15", "2026-09-15", "Driveway & Parking lot", "Primer", 1473.62, 6),
  plan("w4", "2026-09-16", "2026-09-17", "Driveway & Parking lot", "Patching", 1473.62, 6),
];

const line = (n: number, l: Partial<StoredLine>): StoredLine => ({
  line_no: n,
  location: null,
  activity: "",
  manpower: null,
  planned_area: null,
  planned_material: null,
  planned_material_id: null,
  planned_qty: null,
  planned_coverage: null,
  planned_remark: null,
  actual_area: null,
  actual_material: null,
  actual_material_id: null,
  actual_qty: null,
  actual_coverage: null,
  actual_remark: null,
  defect_area: null,
  defect_remark: null,
  ...l,
});

const REPORTS: StoredReport[] = [
  {
    id: "r14",
    project_id: P,
    report_date: "2026-09-14",
    site_location: "Plantation A",
    status: "submitted",
    total_men: 6,
    lines: [
      line(1, { location: "Phase 3", activity: "Marking" }),
      // Sheet row 9: planned 1473.62 m², 6 men, "8am to 10pm"; actual 700 m² ground.
      line(2, { location: "Driveway & Parking lot", activity: "Grinding", planned_area: 1473.62, manpower: 6, planned_remark: "8am to 10pm", actual_area: 700 }),
    ],
  },
  {
    id: "r15",
    project_id: P,
    report_date: "2026-09-15",
    site_location: "Plantation A",
    status: "draft",
    total_men: 7,
    lines: [
      // Sheet row 10: WG100(7037) planned 17 sets, used 16.7 sets at 0.15kg/m2, add water -10%.
      line(1, {
        location: "Driveway & Parking lot",
        activity: "Vacuum, primer",
        manpower: 7,
        planned_area: 1473.62,
        planned_material: "WG100(7037)",
        planned_qty: 17,
        planned_coverage: "0.15kg/m2",
        planned_remark: "add water -10%",
        actual_area: 1473.62,
        actual_material: "WG100(7037)",
        actual_qty: 16.7,
        actual_coverage: "0.15kg/m2",
        actual_remark: "add water -10%",
      }),
    ],
  },
];

describe("helpers", () => {
  it("reads the numbers the way the chat posts write them", () => {
    expect(toNum("17sets")).toBe(17);
    expect(toNum("16.7sets")).toBe(16.7);
    expect(toNum("1,473.62")).toBe(1473.62);
    expect(toNum("")).toBeNull();
    expect(toNum("n/a")).toBeNull();
  });

  it("formats dates like the Dashboard Report sheet", () => {
    expect(fmtDay("2026-09-14")).toBe("14/9");
    expect(fmtRange("2026-09-14", "2026-09-15")).toBe("14–15/9");
    expect(fmtRange("2026-09-30", "2026-10-01")).toBe("30/9–1/10");
    expect(fmtRange("2026-09-20", "2026-09-20")).toBe("20/9");
  });

  it("puts a mid-week date in the week of the Monday meeting", () => {
    expect(weekStart("2026-09-16")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14"); // Sunday belongs to the week before
    expect(weekStart("2026-09-14")).toBe("2026-09-14");
  });

  it("expands a whiteboard range into each day it covers", () => {
    expect(planDays(WEEK[3])).toEqual(["2026-09-16", "2026-09-17"]);
  });
});

describe("crew total", () => {
  it("counts the 14/9 chat post as 6", () => {
    // Supervisor: 193 · Safety Personal: 316 · Men: 321,317,332,336 · Total: 6
    expect(crewTotal({ supervisor: "193", safety_personnel: "316", men: "321,317,332,336", supply_men: "" })).toBe(6);
  });

  it("accepts spaces and slashes between worker numbers", () => {
    expect(crewTotal({ supervisor: "", safety_personnel: "", men: "321 317 / 332", supply_men: "401, 402" })).toBe(5);
  });
});

describe("daily report lines", () => {
  it("starts the day's lines from the weekly plan", () => {
    const lines = linesFromPlan(WEEK, "2026-09-17");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ location: "Driveway & Parking lot", activity: "Patching", manpower: "6", planned_area: "1473.62" });
  });

  it("copies PLANNED into ACTUAL without overwriting what was already typed", () => {
    const l = emptyLine({ activity: "Primer", planned_material: "WG100(7037)", planned_qty: "17", planned_area: "1473.62", actual_qty: "16.7" });
    const c = copyPlannedToActual(l);
    expect(c.actual_material).toBe("WG100(7037)");
    expect(c.actual_area).toBe("1473.62");
    expect(c.actual_qty).toBe("16.7");
  });

  it("gives the material variance in sets", () => {
    expect(qtyDelta({ planned_qty: "17", actual_qty: "16.7" })).toBe(-0.3);
    expect(qtyDelta({ planned_qty: "17", actual_qty: "" })).toBeNull();
  });

  it("refuses a line with no activity or a non-number quantity", () => {
    const h = emptyHeader(P, "2026-09-15");
    const errs = draftErrors(h, [emptyLine({ activity: "" }), emptyLine({ activity: "Primer", planned_qty: "lots" })]);
    expect(errs.map((e) => [e.line, e.field])).toEqual([
      [0, "activity"],
      [1, "planned_qty"],
    ]);
  });

  it("warns before submitting a planned activity with no actual", () => {
    expect(submitWarnings([])).toEqual(["Add at least one activity before submitting."]);
    expect(submitWarnings([emptyLine({ activity: "Patching", planned_area: "1473.62" })])).toEqual(["Patching: no ACTUAL entered."]);
    expect(submitWarnings([emptyLine({ activity: "Patching", planned_area: "1473.62", actual_area: "900" })])).toEqual([]);
  });

  it("round-trips a stored line into form values", () => {
    const f = storedToForm(REPORTS[1].lines[0]);
    expect(f.planned_qty).toBe("17");
    expect(f.actual_qty).toBe("16.7");
    expect(f.defect_area).toBe("");
  });
});

describe("Dashboard Report", () => {
  const rows = buildDashboardRows(WEEK, REPORTS, "2026-09-14", "2026-09-20");

  it("pairs each report line with the plan row of the same date and location", () => {
    const d14 = rows.filter((r) => r.date === "2026-09-14");
    expect(d14).toHaveLength(2);
    expect(d14[0]).toMatchObject({ state: "planned", reportStatus: "submitted" });
    expect(d14[0].weekly?.activities).toBe("Marking");
    expect(d14[1].weekly).toMatchObject({ location: "Driveway & Parking lot", activities: "Grinding", manpower: 4 });
    expect(d14[1].planned).toMatchObject({ area: 1473.62, manpower: 6 });
    expect(d14[1].actual).toMatchObject({ area: 700 });
  });

  it("pairs by date when the activity was renamed on the day (Primer -> Vacuum, primer)", () => {
    const d15 = rows.filter((r) => r.date === "2026-09-15");
    expect(d15).toHaveLength(1);
    expect(d15[0].weekly?.activities).toBe("Primer");
    expect(d15[0].planned?.activities).toBe("Vacuum, primer");
    expect(d15[0].actual).toMatchObject({ material: "WG100(7037)", qty: 16.7 });
    expect(d15[0].reportStatus).toBe("draft");
  });

  it("keeps a planned day nobody reported on as plan-only", () => {
    const d16 = rows.filter((r) => r.date === "2026-09-16");
    expect(d16).toEqual([expect.objectContaining({ state: "plan-only", planned: null, actual: null })]);
    expect(d16[0].weekly?.range).toBe("16–17/9");
  });

  it("leaves ACTUAL empty when only the plan part of a line is filled", () => {
    const marking = rows.find((r) => r.date === "2026-09-14" && r.planned?.activities === "Marking");
    expect(marking?.actual).toBeNull();
  });

  it("marks a report line that was not on the weekly plan", () => {
    const extra: StoredReport = {
      ...REPORTS[1],
      id: "r18",
      report_date: "2026-09-18",
      status: "draft",
      lines: [line(1, { activity: "Sand, vacuum" })],
    };
    const r = buildDashboardRows(WEEK, [...REPORTS, extra], "2026-09-18", "2026-09-18");
    expect(r).toEqual([expect.objectContaining({ state: "unplanned", reportStatus: "draft", weekly: null })]);
  });

  it("only shows dates inside the range", () => {
    expect(buildDashboardRows(WEEK, REPORTS, "2026-09-16", "2026-09-16").map((r) => r.date)).toEqual(["2026-09-16"]);
  });

  it("totals area, counts missed plan days and drafts", () => {
    expect(dashboardTotals(rows, "2026-09-18")).toEqual({
      plannedArea: 2947.24,
      actualArea: 2173.62,
      planOnlyPast: 2, // 16/9 and 17/9 Patching
      drafts: 1, // the 15/9 report
    });
  });

  it("sums planned and actual sets per material", () => {
    expect(materialVariance(REPORTS, "2026-09-14", "2026-09-20")).toEqual([
      { material: "WG100(7037)", planned: 17, actual: 16.7, delta: -0.3 },
    ]);
  });
});

describe("Dashboard Report workbook", () => {
  const rows = buildDashboardRows(WEEK, REPORTS, "2026-09-14", "2026-09-20");
  const meta = { clientSite: "Straits Construction / Plantation Close", projectRef: "E25028", wo: "WO-2509-0012", from: "2026-09-14", to: "2026-09-20" };
  const ws = buildDashboardWorkbook(rows, meta).getWorksheet(DASHBOARD_SHEET)!;

  it("keeps the sheet's header cells", () => {
    expect(ws.getCell("A2").value).toBe("CLIENT / SITE:");
    expect(ws.getCell("B2").value).toBe("Straits Construction / Plantation Close");
    expect(ws.getCell("B3").value).toBe("E25028");
    expect(ws.getCell("B4").value).toBe("WO-2509-0012");
    expect(ws.getCell("A6").value).toBe("WEEKLY PLAN");
    expect(ws.getCell("F6").value).toBe("DAILY MATERIAL REPORT (PLANNED)");
    expect(ws.getCell("N6").value).toBe("DAILY MATERIAL REPORT (ACTUAL)");
  });

  it("uses the sheet's 19 column headers in row 7", () => {
    expect(DASHBOARD_HEADERS).toHaveLength(19);
    expect(ws.getRow(7).values).toEqual([undefined, ...DASHBOARD_HEADERS]);
  });

  it("writes the 14/9 grinding row like sheet row 9", () => {
    const r = ws.getRow(9);
    expect(r.getCell(1).value).toBe("14/9");
    expect(r.getCell(2).value).toBe("Driveway & Parking lot");
    expect(r.getCell(3).value).toBe("Grinding");
    expect(r.getCell(4).value).toBe(1473.62);
    expect(r.getCell(5).value).toBe(4);
    expect(r.getCell(9).value).toBe(6);
    expect(r.getCell(13).value).toBe("8am to 10pm");
    expect(r.getCell(15).value).toBe(700);
  });

  it("writes the 15/9 primer row like sheet row 10", () => {
    const r = ws.getRow(10);
    expect(r.getCell(10).value).toBe("WG100(7037)");
    expect(r.getCell(11).value).toBe(17);
    expect(r.getCell(17).value).toBe(16.7);
    expect(r.getCell(18).value).toBe("0.15kg/m2");
    expect(r.getCell(19).value).toBe("add water -10%");
  });

  it("names each day of a multi-day plan row, not the span twice", () => {
    expect(ws.getCell("A11").value).toBe("16/9 (plan 16–17/9)");
    expect(ws.getCell("A12").value).toBe("17/9 (plan 16–17/9)");
    expect(ws.getCell("C12").value).toBe("Patching");
  });

  it("names the file by project and range", () => {
    expect(dashboardFileName(meta)).toBe("Dashboard_Report_E25028_2026-09-14_to_2026-09-20.xlsx");
  });
});

describe("crew carry-over", () => {
  // 14/9 chat post: Supervisor 193, Safety 316, Men 321,317,332,336 (Total 6).
  const src = (report_date: string, site_location: string, men: string, total_men: number | null = null) => ({
    report_date,
    site_location,
    supervisor: "193",
    safety_personnel: "316",
    men,
    supply_men: null,
    total_men,
  });

  it("keeps the last report's crew for the next day", () => {
    const c = carryCrew([src("2026-09-14", "Plantation A", "321,317,332,336", 6)], "2026-09-15", "");
    expect(c?.crew).toEqual({ supervisor: "193", safety_personnel: "316", men: "321,317,332,336", supply_men: "" });
    expect(c?.from).toEqual({ date: "2026-09-14", site: "Plantation A" });
    expect(c?.total).toBeNull(); // 6 is what the crew counts to, so Total stays automatic
  });

  it("keeps a Total that was typed over the count", () => {
    expect(carryCrew([src("2026-09-14", "Plantation A", "321,317", 7)], "2026-09-15", "")?.total).toBe(7);
  });

  it("takes the latest report before the day, not after it", () => {
    const c = carryCrew([src("2026-09-16", "Plantation A", "999"), src("2026-09-14", "Plantation A", "321")], "2026-09-15", "");
    expect(c?.crew.men).toBe("321");
  });

  it("prefers the same site location over a later report elsewhere", () => {
    const c = carryCrew([src("2026-09-15", "Phase 4", "500"), src("2026-09-14", "Plantation A", "321")], "2026-09-16", "plantation a");
    expect(c?.crew.men).toBe("321");
  });

  it("falls back to the latest crew when the site has none yet", () => {
    expect(carryCrew([src("2026-09-15", "Phase 4", "500")], "2026-09-16", "Plantation A")?.crew.men).toBe("500");
  });

  it("skips a report whose crew was reset, and starts empty with no history", () => {
    const reset = { ...src("2026-09-15", "Plantation A", ""), supervisor: "", safety_personnel: "" };
    expect(carryCrew([reset, src("2026-09-14", "Plantation A", "321")], "2026-09-16", "")?.from.date).toBe("2026-09-14");
    expect(carryCrew([], "2026-09-16", "")).toBeNull();
  });
});

describe("default site location", () => {
  it("opens a new report on the only site the project uses", () => {
    expect(defaultSiteLocation(["Plantation A"], [])).toBe("Plantation A");
  });

  it("stays blank when that site already has a report for the day", () => {
    expect(defaultSiteLocation(["Plantation A"], ["plantation a "])).toBe("");
  });

  it("stays blank when the project works several sites", () => {
    expect(defaultSiteLocation(["Plantation A", "Phase 4"], [])).toBe("");
  });

  it("ignores blank history and blank reports", () => {
    expect(defaultSiteLocation([" ", "Plantation A"], [""])).toBe("Plantation A");
    expect(defaultSiteLocation([], [])).toBe("");
  });
});
