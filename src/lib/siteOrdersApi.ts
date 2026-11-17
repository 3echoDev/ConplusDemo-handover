// Supabase reads and RPC writes for orders, the registers and allocations.
// Reads are anon SELECT; writes go through the SECURITY DEFINER RPCs in
// supabase/migrations/20261116_site_orders.sql.
import { supabase } from "@/lib/supabase";
import { reporterName, type RpcResult } from "@/lib/siteReportsApi";
import type { Crew } from "@/lib/siteReports";
import { crewFromAllocation, type Allocation, type OrderDay, type ScopeRow, type SiteOrder, type SiteTool, type SiteWorker } from "@/lib/siteOrders";

async function rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as RpcResult;
  return { ok: !!r.ok, error: r.error ?? undefined, id: r.id };
}
const actor = () => reporterName() || null;

const ORDER_COLS = "id,project_id,project_code,order_no,label,scope,remarks,stage,kickoff,site_walk,transfer,completion,completed_at";

/** Every order, or one project's. A few hundred rows at most. */
export async function fetchOrders(projectId?: string): Promise<SiteOrder[]> {
  let q = supabase.from("site_orders").select(ORDER_COLS);
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q.order("order_no");
  return (data as SiteOrder[]) ?? [];
}

export async function fetchOrderDays(orderId: string): Promise<OrderDay[]> {
  const { data } = await supabase.from("site_order_days").select("id,order_id,work_date,scope,supervisor,workers_needed,safety_officer,remarks").eq("order_id", orderId).order("work_date");
  return (data as OrderDay[]) ?? [];
}

export async function fetchWorkers(): Promise<SiteWorker[]> {
  const { data } = await supabase.from("site_workers").select("id,emp_code,name,designation,contact,active").order("name");
  return (data as SiteWorker[]) ?? [];
}

export async function fetchTools(): Promise<SiteTool[]> {
  const { data } = await supabase.from("site_tools").select("id,tool_no,item,category,code,purchase_date,last_service,efficiency_m2_day,condition,remarks,active").order("tool_no");
  return ((data as SiteTool[]) ?? []).map((t) => ({ ...t, efficiency_m2_day: t.efficiency_m2_day == null ? null : Number(t.efficiency_m2_day) }));
}

const ALLOC_COLS = "id,order_id,project_id,work_date,worker_id,tool_id,attendance,ot_hours";
const normAlloc = (rows: unknown) => ((rows as Allocation[]) ?? []).map((a) => ({ ...a, ot_hours: a.ot_hours == null ? null : Number(a.ot_hours) }));

/** Allocations on one date (all projects): who and what is where that day. */
export async function fetchAllocationsOn(date: string): Promise<Allocation[]> {
  const { data } = await supabase.from("site_allocations").select(ALLOC_COLS).eq("work_date", date);
  return normAlloc(data);
}

export async function fetchOrderAllocations(orderId: string): Promise<Allocation[]> {
  const { data } = await supabase.from("site_allocations").select(ALLOC_COLS).eq("order_id", orderId);
  return normAlloc(data);
}

/** Every day each tool was put to work, for the wear counter on the Equipment tab. */
export async function fetchToolDays(): Promise<Pick<Allocation, "tool_id" | "work_date">[]> {
  const { data } = await supabase.from("site_allocations").select("tool_id,work_date").not("tool_id", "is", null).limit(20000);
  return (data as Pick<Allocation, "tool_id" | "work_date">[]) ?? [];
}

/**
 * The crew a new daily report starts with, from that day's allocation.
 * undefined: the project has no orders (the caller keeps its own rule).
 * null: it has orders but nobody is allocated that day.
 */
export async function fetchAllocatedCrew(projectId: string, date: string): Promise<{ crew: Crew; total: number } | null | undefined> {
  const { count } = await supabase.from("site_orders").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (!count) return undefined;
  const [{ data }, workers] = await Promise.all([supabase.from("site_allocations").select(ALLOC_COLS).eq("project_id", projectId).eq("work_date", date), fetchWorkers()]);
  return crewFromAllocation(normAlloc(data), workers, date, projectId);
}

export const saveWorker =(row: Partial<SiteWorker>) => rpc("save_site_worker", { p_row: row, p_actor: actor() });
export const saveTool = (row: Partial<SiteTool>) => rpc("save_site_tool", { p_row: row, p_actor: actor() });

export const saveOrder = (o: { id?: string; project_id: string; label: string; scope: ScopeRow[]; remarks: string }) => rpc("save_site_order", { p_order: o, p_actor: actor() });
export const deleteOrder = (id: string) => rpc("delete_site_order", { p_id: id });
export const saveStage = (id: string, stage: number, data: unknown | null, complete: boolean) =>
  rpc("save_site_order_stage", { p_id: id, p_stage: stage, p_data: data, p_complete: complete, p_actor: actor() });

export const saveDays = (orderId: string, days: Partial<OrderDay>[]) => rpc("save_site_order_days", { p_order_id: orderId, p_days: days, p_actor: actor() });
export const deleteDay = (id: string) => rpc("delete_site_order_day", { p_id: id });

export const setAllocation = (orderId: string, date: string, workers: { id: string; attendance: string; ot_hours: number | null }[], tools: string[]) =>
  rpc("set_site_allocation", { p_order_id: orderId, p_date: date, p_workers: workers, p_tools: tools, p_actor: actor() });
