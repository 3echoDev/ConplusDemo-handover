// Site Reports — Lynn's project planning & tracking workflow (18 Sep, R1 25 Sep).
//
// Source: "Project planning and tracking workflow (R1).xlsx".
//   Workflow sheet:   3 weekly schedule -> 4 daily work plan -> 5 actual vs plan
//   Dashboard Report: WEEKLY PLAN | DAILY MATERIAL REPORT (PLANNED) | (ACTUAL)
//
// Everything here is pure (no DOM, no Supabase) so it runs under vitest.
// Tables: site_weekly_plan, site_daily_reports, site_report_lines
// (supabase/migrations/20261002_site_reports.sql).

export type ReportStatus = "draft" | "submitted";

export interface WeeklyPlanRow {
  id: string;
  project_id: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;
  location: string | null;
  activities: string;
  area_m2: number | null;
  manpower: number | null;
  remarks: string | null;
}

/** One DAILY MATERIAL REPORT card: location + activity, PLANNED, ACTUAL, DEFECT. */
export interface ReportLine {
  uid: string; // client-only list key; the database ignores it
  location: string;
  activity: string;
  manpower: string;
  planned_area: string;
  planned_material: string;
  planned_material_id: string | null;
  planned_qty: string;
  planned_coverage: string;
  planned_remark: string;
  actual_area: string;
  actual_material: string;
  actual_material_id: string | null;
  actual_qty: string;
  actual_coverage: string;
  actual_remark: string;
  defect_area: string;
  defect_remark: string;
}

/** DAILY WORK REPORT header (template unchanged in R1). Form values are strings. */
export interface ReportHeader {
  id: string | null;
  project_id: string;
  report_date: string;
  site_location: string;
  epoxy_system: string;
  time_text: string;
  supervisor: string;
  safety_personnel: string;
  men: string;
  supply_men: string;
  total_men: string;
  days_to_complete: string;
  negative_days: string;
  remark: string;
  additional_area_date: string;
  status: ReportStatus;
  submitted_at: string | null;
  submitted_by: string | null;
}

/** A report as read back from the database (numbers are numbers or null). */
export interface StoredReport {
  id: string;
  project_id: string;
  report_date: string;
  site_location: string;
  status: ReportStatus;
  total_men: number | null;
  lines: StoredLine[];
}

export interface StoredLine {
  line_no: number;
  location: string | null;
  activity: string;
  manpower: number | null;
  planned_area: number | null;
  planned_material: string | null;
  planned_material_id: string | null;
  planned_qty: number | null;
  planned_coverage: string | null;
  planned_remark: string | null;
  actual_area: number | null;
  actual_material: string | null;
  actual_material_id: string | null;
  actual_qty: number | null;
  actual_coverage: string | null;
  actual_remark: string | null;
  defect_area: string | null;
  defect_remark: string | null;
}

// ── small helpers ─────────────────────────────────────────────────────────────

/** "1,473.62" / " 17 " / "16.7sets" -> number; blank or junk -> null. */
export function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Number as the form shows it: no trailing zeros, blank for null. */
export function numStr(v: number | null | undefined): string {
  return v == null ? "" : String(Number(v.toFixed(4)));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-date ISO (YYYY-MM-DD) — never toISOString(), which shifts to UTC. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Monday of the week containing iso (the plan is drawn up at the Monday meeting). */
export function weekStart(iso: string): string {
  const d = parseIso(iso);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

/** "14/9" — the date style of the Dashboard Report sheet. */
export function fmtDay(iso: string): string {
  const d = parseIso(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** "14–15/9" for a plan row spanning days, "14/9" for one day. */
export function fmtRange(from: string, to: string): string {
  if (from === to) return fmtDay(from);
  const a = parseIso(from);
  const b = parseIso(to);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()}/${b.getMonth() + 1}`;
  return `${fmtDay(from)}–${fmtDay(to)}`;
}

/** Every date a plan row covers, inclusive. */
export function planDays(row: Pick<WeeklyPlanRow, "date_from" | "date_to">): string[] {
  const out: string[] = [];
  for (let d = row.date_from; d <= row.date_to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// ── crew ──────────────────────────────────────────────────────────────────────

/** Worker numbers in a crew field: "321,317,332,336" -> 4, "193" -> 1, "" -> 0. */
export function crewTokens(v: string | null | undefined): string[] {
  return (v ?? "").split(/[\s,;/&+]+/).map((t) => t.trim()).filter(Boolean);
}

/**
 * TOTAL on the Daily Work Report = supervisor + safety + men + supply men.
 * The 14/9 chat post: Supervisor 193, Safety 316, Men 321,317,332,336 -> Total 6.
 */
export function crewTotal(h: Pick<ReportHeader, "supervisor" | "safety_personnel" | "men" | "supply_men">): number {
  return (
    crewTokens(h.supervisor).length +
    crewTokens(h.safety_personnel).length +
    crewTokens(h.men).length +
    crewTokens(h.supply_men).length
  );
}

// ── crew carry-over ───────────────────────────────────────────────────────────

/**
 * The crew stays from one day to the next until the site resets it: a new
 * day's report starts with the crew of the last report, and "Reset crew"
 * clears it. Nothing resets on its own (client, 4 Oct).
 */
export type Crew = Pick<ReportHeader, "supervisor" | "safety_personnel" | "men" | "supply_men">;

export const CREW_FIELDS = ["supervisor", "safety_personnel", "men", "supply_men"] as const;

export const emptyCrew = (): Crew => ({ supervisor: "", safety_personnel: "", men: "", supply_men: "" });

export const hasCrew = (c: Crew) => CREW_FIELDS.some((f) => c[f].trim() !== "");

export interface CrewSource {
  report_date: string;
  site_location: string;
  supervisor: string | null;
  safety_personnel: string | null;
  men: string | null;
  supply_men: string | null;
  total_men: number | null;
}

export interface CarriedCrew {
  crew: Crew;
  /** A Total typed over the counted one on the source report, else null. */
  total: number | null;
  from: { date: string; site: string };
}

/**
 * The crew a new report for `date` starts with: the latest earlier report with
 * a crew at the same site location, else the latest earlier report with a crew.
 */
export function carryCrew(sources: CrewSource[], date: string, siteLocation: string): CarriedCrew | null {
  const withCrew = sources
    .filter((s) => s.report_date < date)
    .map((s) => ({ s, crew: { supervisor: s.supervisor ?? "", safety_personnel: s.safety_personnel ?? "", men: s.men ?? "", supply_men: s.supply_men ?? "" } }))
    .filter(({ crew }) => hasCrew(crew))
    .sort((a, b) => (a.s.report_date < b.s.report_date ? 1 : a.s.report_date > b.s.report_date ? -1 : 0));
  const site = norm(siteLocation);
  const pick = (site && withCrew.find(({ s }) => norm(s.site_location) === site)) || withCrew[0];
  if (!pick) return null;
  const counted = crewTotal(pick.crew);
  return {
    crew: pick.crew,
    total: pick.s.total_men != null && pick.s.total_men !== counted ? pick.s.total_men : null,
    from: { date: pick.s.report_date, site: pick.s.site_location },
  };
}

// ── lines ─────────────────────────────────────────────────────────────────────

let uidSeq = 0;
const nextUid = () => `l${++uidSeq}`;

export function emptyLine(partial: Partial<ReportLine> = {}): ReportLine {
  return {
    uid: nextUid(),
    location: "",
    activity: "",
    manpower: "",
    planned_area: "",
    planned_material: "",
    planned_material_id: null,
    planned_qty: "",
    planned_coverage: "",
    planned_remark: "",
    actual_area: "",
    actual_material: "",
    actual_material_id: null,
    actual_qty: "",
    actual_coverage: "",
    actual_remark: "",
    defect_area: "",
    defect_remark: "",
    ...partial,
  };
}

export function emptyHeader(projectId: string, reportDate: string, epoxySystem = ""): ReportHeader {
  return {
    id: null,
    project_id: projectId,
    report_date: reportDate,
    site_location: "",
    epoxy_system: epoxySystem,
    time_text: "",
    supervisor: "",
    safety_personnel: "",
    men: "",
    supply_men: "",
    total_men: "",
    days_to_complete: "",
    negative_days: "",
    remark: "",
    additional_area_date: "",
    status: "draft",
    submitted_at: null,
    submitted_by: null,
  };
}

/** End of day: start ACTUAL from PLANNED, keeping anything already typed in ACTUAL. */
export function copyPlannedToActual(l: ReportLine): ReportLine {
  return {
    ...l,
    actual_area: l.actual_area || l.planned_area,
    actual_material: l.actual_material || l.planned_material,
    actual_material_id: l.actual_material ? l.actual_material_id : l.planned_material_id,
    actual_qty: l.actual_qty || l.planned_qty,
    actual_coverage: l.actual_coverage || l.planned_coverage,
    actual_remark: l.actual_remark || l.planned_remark,
  };
}

export const hasPlanned = (l: ReportLine) =>
  !!(l.planned_area.trim() || l.planned_material.trim() || l.planned_qty.trim());
export const hasActual = (l: ReportLine) =>
  !!(l.actual_area.trim() || l.actual_material.trim() || l.actual_qty.trim());

/** Actual minus planned material, in sets; null unless both are numbers. */
export function qtyDelta(l: Pick<ReportLine, "planned_qty" | "actual_qty">): number | null {
  const p = toNum(l.planned_qty);
  const a = toNum(l.actual_qty);
  if (p == null || a == null) return null;
  return Math.round((a - p) * 1000) / 1000;
}

/** Plan rows for one day become the starting lines of that day's report. */
export function linesFromPlan(plan: WeeklyPlanRow[], date: string): ReportLine[] {
  return plan
    .filter((r) => r.date_from <= date && date <= r.date_to)
    .map((r) =>
      emptyLine({
        location: r.location ?? "",
        activity: r.activities,
        manpower: r.manpower == null ? "" : String(r.manpower),
        planned_area: numStr(r.area_m2),
      }),
    );
}

export interface ValidationIssue {
  line: number | null; // 0-based line index, null for the header
  field: string;
  message: string;
}

/** Blocks Save draft: the database refuses these too. */
export function draftErrors(h: ReportHeader, lines: ReportLine[]): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!h.report_date) out.push({ line: null, field: "report_date", message: "Pick the report date." });
  lines.forEach((l, i) => {
    if (!l.activity.trim()) out.push({ line: i, field: "activity", message: "Activity is required." });
    for (const f of ["planned_area", "planned_qty", "actual_area", "actual_qty", "manpower"] as const) {
      if (l[f].trim() && toNum(l[f]) == null) out.push({ line: i, field: f, message: "Enter a number." });
      else if ((toNum(l[f]) ?? 0) < 0) out.push({ line: i, field: f, message: "Cannot be negative." });
    }
  });
  return out;
}

/** Shown before Submit; the user may still submit (a planned activity can be called off). */
export function submitWarnings(lines: ReportLine[]): string[] {
  const out: string[] = [];
  if (lines.length === 0) out.push("Add at least one activity before submitting.");
  lines.forEach((l, i) => {
    if (hasPlanned(l) && !hasActual(l)) out.push(`${l.activity || `Activity ${i + 1}`}: no ACTUAL entered.`);
  });
  return out;
}

/** Payloads for save_site_report(p_report, p_lines). */
export function reportPayload(h: ReportHeader) {
  const { status: _s, submitted_at: _a, submitted_by: _b, ...rest } = h;
  return rest;
}

export function storedToForm(l: StoredLine): ReportLine {
  const s = (v: string | null) => v ?? "";
  return {
    uid: nextUid(),
    location: s(l.location),
    activity: l.activity,
    manpower: l.manpower == null ? "" : String(l.manpower),
    planned_area: numStr(l.planned_area),
    planned_material: s(l.planned_material),
    planned_material_id: l.planned_material_id,
    planned_qty: numStr(l.planned_qty),
    planned_coverage: s(l.planned_coverage),
    planned_remark: s(l.planned_remark),
    actual_area: numStr(l.actual_area),
    actual_material: s(l.actual_material),
    actual_material_id: l.actual_material_id,
    actual_qty: numStr(l.actual_qty),
    actual_coverage: s(l.actual_coverage),
    actual_remark: s(l.actual_remark),
    defect_area: s(l.defect_area),
    defect_remark: s(l.defect_remark),
  };
}

// ── Dashboard Report ──────────────────────────────────────────────────────────

export type RowState =
  | "planned" // report line matched to a weekly plan row
  | "plan-only" // planned for the day, no report yet
  | "unplanned"; // reported, not on the weekly plan

export interface DashboardRow {
  date: string;
  state: RowState;
  reportId: string | null;
  reportStatus: ReportStatus | null;
  weekly: { location: string; activities: string; area: number | null; manpower: number | null; range: string } | null;
  planned: {
    location: string;
    activities: string;
    area: number | null;
    manpower: number | null;
    material: string;
    qty: number | null;
    coverage: string;
    remarks: string;
  } | null;
  actual: { activities: string; area: number | null; material: string; qty: number | null; coverage: string; remarks: string } | null;
}

/**
 * The Dashboard Report sheet: one row per date + location, WEEKLY PLAN beside
 * the day's PLANNED and ACTUAL. A plan row spanning days (whiteboard
 * "14-15/09 Grinding") sits on every day it covers. A report line pairs with
 * the plan row of the same date and location, else the first unused plan row
 * of that date, else stands alone as "unplanned". Plan rows nobody reported
 * on stay as "plan-only" — the actual-vs-plan gap of workflow stage 5.
 */
export function buildDashboardRows(plan: WeeklyPlanRow[], reports: StoredReport[], from: string, to: string): DashboardRow[] {
  const rows: DashboardRow[] = [];
  const inRange = (d: string) => d >= from && d <= to;

  const planByDate = new Map<string, WeeklyPlanRow[]>();
  for (const p of plan) {
    for (const d of planDays(p)) {
      if (!inRange(d)) continue;
      if (!planByDate.has(d)) planByDate.set(d, []);
      planByDate.get(d)!.push(p);
    }
  }
  const reportsByDate = new Map<string, StoredReport[]>();
  for (const r of reports) {
    if (!inRange(r.report_date)) continue;
    if (!reportsByDate.has(r.report_date)) reportsByDate.set(r.report_date, []);
    reportsByDate.get(r.report_date)!.push(r);
  }

  const dates = [...new Set([...planByDate.keys(), ...reportsByDate.keys()])].sort();
  for (const date of dates) {
    const dayPlan = planByDate.get(date) ?? [];
    const used = new Set<number>();
    const weeklyCell = (p: WeeklyPlanRow) => ({
      location: p.location ?? "",
      activities: p.activities,
      area: p.area_m2,
      manpower: p.manpower,
      range: fmtRange(p.date_from, p.date_to),
    });

    for (const r of reportsByDate.get(date) ?? []) {
      const lines = [...r.lines].sort((a, b) => a.line_no - b.line_no);
      for (const l of lines) {
        const loc = l.location || r.site_location;
        let idx = dayPlan.findIndex((p, i) => !used.has(i) && norm(p.location) !== "" && norm(p.location) === norm(loc));
        if (idx < 0) idx = dayPlan.findIndex((_, i) => !used.has(i));
        const p = idx >= 0 ? dayPlan[idx] : null;
        if (idx >= 0) used.add(idx);
        const reported = l.actual_area != null || l.actual_qty != null || !!l.actual_material;
        rows.push({
          date,
          state: p ? "planned" : "unplanned",
          reportId: r.id,
          reportStatus: r.status,
          weekly: p ? weeklyCell(p) : null,
          planned: {
            location: loc ?? "",
            activities: l.activity,
            area: l.planned_area,
            manpower: l.manpower,
            material: l.planned_material ?? "",
            qty: l.planned_qty,
            coverage: l.planned_coverage ?? "",
            remarks: l.planned_remark ?? "",
          },
          actual: reported
            ? {
                activities: l.activity,
                area: l.actual_area,
                material: l.actual_material ?? "",
                qty: l.actual_qty,
                coverage: l.actual_coverage ?? "",
                remarks: l.actual_remark ?? "",
              }
            : null,
        });
      }
    }
    dayPlan.forEach((p, i) => {
      if (used.has(i)) return;
      rows.push({ date, state: "plan-only", reportId: null, reportStatus: null, weekly: weeklyCell(p), planned: null, actual: null });
    });
  }
  return rows;
}

export interface MaterialVariance {
  material: string;
  planned: number;
  actual: number;
  delta: number;
}

/** Planned vs actual sets per material across the reports (submitted and draft). */
export function materialVariance(reports: StoredReport[], from: string, to: string): MaterialVariance[] {
  const acc = new Map<string, MaterialVariance>();
  const bump = (name: string | null, qty: number | null, key: "planned" | "actual") => {
    if (!name || qty == null) return;
    const k = norm(name);
    if (!acc.has(k)) acc.set(k, { material: name.trim(), planned: 0, actual: 0, delta: 0 });
    acc.get(k)![key] += qty;
  };
  for (const r of reports) {
    if (r.report_date < from || r.report_date > to) continue;
    for (const l of r.lines) {
      bump(l.planned_material, l.planned_qty, "planned");
      bump(l.actual_material, l.actual_qty, "actual");
    }
  }
  return [...acc.values()]
    .map((v) => ({ ...v, delta: Math.round((v.actual - v.planned) * 1000) / 1000 }))
    .sort((a, b) => a.material.localeCompare(b.material));
}

export interface DashboardTotals {
  plannedArea: number;
  actualArea: number;
  planOnlyPast: number; // plan rows before today with no report
  drafts: number; // reports still in draft
}

export function dashboardTotals(rows: DashboardRow[], today: string): DashboardTotals {
  let plannedArea = 0;
  let actualArea = 0;
  let planOnlyPast = 0;
  const draftReports = new Set<string>();
  for (const r of rows) {
    plannedArea += r.planned?.area ?? 0;
    actualArea += r.actual?.area ?? 0;
    if (r.state === "plan-only" && r.date < today) planOnlyPast += 1;
    if (r.reportStatus === "draft" && r.reportId) draftReports.add(r.reportId);
  }
  return {
    plannedArea: Math.round(plannedArea * 100) / 100,
    actualArea: Math.round(actualArea * 100) / 100,
    planOnlyPast,
    drafts: draftReports.size,
  };
}
