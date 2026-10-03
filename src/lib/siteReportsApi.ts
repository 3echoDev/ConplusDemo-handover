// Supabase reads and RPC writes for Site Reports. Reads go straight to the
// tables (anon SELECT); every write goes through a SECURITY DEFINER RPC in
// supabase/migrations/20261002_site_reports.sql, which validates on its own.
import { supabase } from "@/lib/supabase";
import type { SiteMaterial, SiteProject } from "@/components/site-reports/pickers";
import {
  reportPayload,
  type ReportHeader,
  type ReportLine,
  type CrewSource,
  type ReportStatus,
  type StoredLine,
  type StoredReport,
  type WeeklyPlanRow,
} from "@/lib/siteReports";

export interface RpcResult {
  ok: boolean;
  error?: string;
  id?: string;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as RpcResult;
  return { ok: !!r.ok, error: r.error ?? undefined, id: r.id };
}

const REPORTER_KEY = "conplus_site_reporter";

/** Who is entering the report. Falls back to the name the Store pages remember. */
export function reporterName(): string {
  try {
    return localStorage.getItem(REPORTER_KEY) || localStorage.getItem("conplus_store_approver") || "";
  } catch {
    return "";
  }
}

export function setReporterName(name: string): void {
  try {
    localStorage.setItem(REPORTER_KEY, name.trim());
  } catch {
    /* private mode: name just isn't remembered */
  }
}

export async function fetchProjects(): Promise<SiteProject[]> {
  const { data } = await supabase
    .from("projects")
    .select("id,project_code,name,client_name,location,coating_system,status")
    .in("status", ["active", "delayed"])
    .order("project_code");
  return (data as SiteProject[]) ?? [];
}

export async function fetchMaterials(): Promise<SiteMaterial[]> {
  const { data } = await supabase.from("materials").select("id,name,item_code,unit").eq("is_active", true).order("name");
  return (data as SiteMaterial[]) ?? [];
}

/** The project's latest works order ("WO: (AI to retrieve the last WO)" on the sheet). */
export async function fetchLastWo(project: SiteProject): Promise<string> {
  const { data } = await supabase
    .from("works_orders")
    .select("wo_number,issue_date,created_at")
    .eq("project_id", project.id)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const wo = (data as { wo_number: string | null }[] | null)?.[0]?.wo_number;
  if (wo) return wo;
  const { data: p } = await supabase.from("projects").select("works_order").eq("id", project.id).maybeSingle();
  return ((p as { works_order: string | null } | null)?.works_order ?? "").trim();
}

export async function fetchWeeklyPlan(projectId: string, from?: string, to?: string): Promise<WeeklyPlanRow[]> {
  let q = supabase
    .from("site_weekly_plan")
    .select("id,project_id,date_from,date_to,location,activities,area_m2,manpower,remarks")
    .eq("project_id", projectId);
  // a row overlaps [from, to] when it starts before the end and ends after the start
  if (to) q = q.lte("date_from", to);
  if (from) q = q.gte("date_to", from);
  const { data } = await q.order("date_from").order("created_at");
  return ((data as WeeklyPlanRow[]) ?? []).map((r) => ({
    ...r,
    area_m2: r.area_m2 == null ? null : Number(r.area_m2),
    manpower: r.manpower == null ? null : Number(r.manpower),
  }));
}

/** Full DB row of a daily report (header fields as stored). */
export interface StoredReportFull extends StoredReport {
  epoxy_system: string | null;
  time_text: string | null;
  supervisor: string | null;
  safety_personnel: string | null;
  men: string | null;
  supply_men: string | null;
  days_to_complete: string | null;
  negative_days: number | null;
  remark: string | null;
  additional_area_date: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

const NUM_FIELDS = ["manpower", "planned_area", "planned_qty", "actual_area", "actual_qty"] as const;

function normaliseReport(r: Record<string, unknown>): StoredReportFull {
  const lines = ((r.site_report_lines as Record<string, unknown>[]) ?? []).map((l) => {
    const out = { ...l } as Record<string, unknown>;
    for (const f of NUM_FIELDS) out[f] = l[f] == null ? null : Number(l[f]);
    return out as unknown as StoredLine;
  });
  lines.sort((a, b) => a.line_no - b.line_no);
  const { site_report_lines: _l, ...head } = r;
  return {
    ...(head as unknown as StoredReportFull),
    total_men: r.total_men == null ? null : Number(r.total_men),
    negative_days: r.negative_days == null ? null : Number(r.negative_days),
    status: r.status as ReportStatus,
    lines,
  };
}

export async function fetchReports(projectId: string, from: string, to: string): Promise<StoredReportFull[]> {
  const { data } = await supabase
    .from("site_daily_reports")
    .select("*, site_report_lines(*)")
    .eq("project_id", projectId)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: false })
    .order("site_location");
  return ((data as Record<string, unknown>[]) ?? []).map(normaliseReport);
}

export async function fetchRecentReports(projectId: string, limit = 14): Promise<Pick<StoredReportFull, "id" | "report_date" | "site_location" | "status">[]> {
  const { data } = await supabase
    .from("site_daily_reports")
    .select("id,report_date,site_location,status")
    .eq("project_id", projectId)
    .order("report_date", { ascending: false })
    .limit(limit);
  return (data as Pick<StoredReportFull, "id" | "report_date" | "site_location" | "status">[]) ?? [];
}

/** Recent reports before `date`, newest first, for the crew carried into a new day. */
export async function fetchCrewSources(projectId: string, date: string): Promise<CrewSource[]> {
  const { data } = await supabase
    .from("site_daily_reports")
    .select("report_date,site_location,supervisor,safety_personnel,men,supply_men,total_men")
    .eq("project_id", projectId)
    .lt("report_date", date)
    .order("report_date", { ascending: false })
    .limit(20);
  return ((data as CrewSource[]) ?? []).map((r) => ({ ...r, total_men: r.total_men == null ? null : Number(r.total_men) }));
}

export function saveReport(header: ReportHeader, lines: ReportLine[]): Promise<RpcResult> {
  return rpc("save_site_report", { p_report: reportPayload(header), p_lines: lines, p_actor: reporterName() || null });
}

export const submitReport = (id: string) => rpc("submit_site_report", { p_id: id, p_actor: reporterName() || null });
export const reopenReport = (id: string) => rpc("reopen_site_report", { p_id: id, p_actor: reporterName() || null });
export const deleteReport = (id: string) => rpc("delete_site_report", { p_id: id });

export function savePlanRow(row: Partial<WeeklyPlanRow> & { project_id: string }): Promise<RpcResult> {
  const payload = {
    ...row,
    area_m2: row.area_m2 == null ? "" : String(row.area_m2),
    manpower: row.manpower == null ? "" : String(row.manpower),
  };
  return rpc("save_weekly_plan_row", { p_row: payload, p_actor: reporterName() || null });
}

export const deletePlanRow = (id: string) => rpc("delete_weekly_plan_row", { p_id: id });
