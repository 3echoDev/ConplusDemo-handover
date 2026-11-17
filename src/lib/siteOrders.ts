// Site Reports — orders (phases) under a project, the seven-stage sequence,
// and where people and tools are on a given day. Pure: no Supabase, no React.
// Team feedback 16 Nov 2026 against the SitePulse mockup.
import { addDays, type Crew } from "@/lib/siteReports";

export const STAGES = [
  "Project Plan",
  "Kick Off",
  "Schedule Posting",
  "Deployment & Execution",
  "Site Walk / Handover",
  "Transfer / Movement",
  "Completion",
] as const;
export const stageName = (n: number) => STAGES[n - 1] ?? "";

export interface ScopeRow {
  scope: string;
  area: string;
}

export interface KickOff {
  date: string;
  participants: string;
  comments: string;
  target_start: string;
  target_end: string;
}
export interface SiteWalk {
  date: string;
  attendees: string;
  defects: string;
  outcome: "" | "accepted" | "rework";
  remarks: string;
}
export interface TransferTool {
  tool_id: string;
  destination: "" | "Store" | "Another site";
  site: string;
  received_by: string;
  acknowledged: boolean;
}
export interface Transfer {
  move_date: string;
  tools: TransferTool[];
  remarks: string;
}
export interface Completion {
  date: string;
  remarks: string;
}

export interface SiteOrder {
  id: string;
  project_id: string;
  project_code: string;
  order_no: number;
  label: string;
  scope: ScopeRow[];
  remarks: string | null;
  stage: number;
  kickoff: Partial<KickOff> | null;
  site_walk: Partial<SiteWalk> | null;
  transfer: Partial<Transfer> | null;
  completion: Partial<Completion> | null;
  completed_at: string | null;
}

export interface OrderDay {
  id: string;
  order_id: string;
  work_date: string;
  scope: ScopeRow[];
  supervisor: string | null;
  workers_needed: number | null;
  safety_officer: boolean;
  remarks: string | null;
}

export interface SiteWorker {
  id: string;
  emp_code: string | null;
  name: string;
  designation: string;
  contact: string | null;
  active: boolean;
}

export interface SiteTool {
  id: string;
  tool_no: string;
  item: string;
  category: string;
  code: string | null;
  purchase_date: string | null;
  last_service: string | null;
  efficiency_m2_day: number | null;
  condition: "good" | "spoiled";
  remarks: string | null;
  active: boolean;
}

export type Attendance = "Full Day" | "Half AM" | "Half PM";
export const ATTENDANCE: Attendance[] = ["Full Day", "Half AM", "Half PM"];

export interface Allocation {
  id: string;
  order_id: string;
  project_id: string;
  work_date: string;
  worker_id: string | null;
  tool_id: string | null;
  attendance: Attendance;
  ot_hours: number | null;
}

export const DESIGNATIONS = ["Supervisor", "Foreman/Safety", "Skilled Worker", "General Worker", "Project Manager", "Project Coordinator", "Store"];

// ── stages ────────────────────────────────────────────────────────────────────

export const orderDone = (o: Pick<SiteOrder, "completed_at">) => !!o.completed_at;

export type StageState = "done" | "active" | "locked";

/** Stage 7 stays the current stage after it is completed, so it needs its own done check. */
export function stageState(o: Pick<SiteOrder, "stage" | "completed_at">, s: number): StageState {
  if (s === 7 && orderDone(o)) return "done";
  if (s < o.stage) return "done";
  return s === o.stage ? "active" : "locked";
}

export function stageDesc(o: SiteOrder, s: number): string {
  const st = stageState(o, s);
  if (s === 1) return "Order created";
  if (s === 2 && st === "done") return o.kickoff?.date ? `Confirmed ${o.kickoff.date}` : "Confirmed";
  if (st === "done") return "Completed";
  if (st === "locked") return "Upcoming";
  if (s === 2) return "Not started";
  if (s === 6 && !transferReady(o.transfer)) return "Pending";
  return "In progress";
}

export type Tone = "pending" | "progress" | "good" | "warn" | "bad";

export function orderChip(o: SiteOrder): { tone: Tone; text: string } {
  if (orderDone(o)) return { tone: "good", text: "Completed" };
  return { tone: o.stage <= 2 ? "pending" : "progress", text: stageName(o.stage) };
}

/** The chip on a project card: the stage of its least advanced open order. */
export function projectHeadline(orders: SiteOrder[]): { tone: Tone; text: string } {
  if (orders.length === 0) return { tone: "pending", text: "No orders" };
  const open = orders.filter((o) => !orderDone(o));
  if (open.length === 0) return { tone: "good", text: "Completed" };
  const behind = open.reduce((a, b) => (b.stage < a.stage ? b : a));
  return orderChip(behind);
}

export const scopeArea = (scope: ScopeRow[] | null | undefined) => (scope ?? []).reduce((s, r) => s + (parseFloat(r.area) || 0), 0);
export const cleanScope = (rows: ScopeRow[]) => rows.map((r) => ({ scope: r.scope.trim(), area: r.area.trim() })).filter((r) => r.scope);
export const scopeText = (scope: ScopeRow[] | null | undefined) =>
  (scope ?? [])
    .filter((r) => r.scope)
    .map((r) => (r.area ? `${r.scope} (${r.area} m²)` : r.scope))
    .join(", ");

/** One date per day from `start`, for "Generate schedule". */
export function scheduleDates(start: string, days: number): string[] {
  const n = Math.max(0, Math.min(60, Math.floor(days)));
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

/** Every tool has a destination, a receiver, and the receiver has acknowledged. */
export function transferReady(t: Partial<Transfer> | null | undefined): boolean {
  if (!t?.move_date) return false;
  return (t.tools ?? []).every((x) => x.destination && (x.destination !== "Another site" || x.site.trim()) && x.received_by.trim() && x.acknowledged);
}

// ── where things are on a day ────────────────────────────────────────────────

export interface Place {
  order_id: string;
  project_code: string;
  label: string;
  attendance?: Attendance;
  ot_hours?: number | null;
}

/** id -> the orders it is allocated to on `date`. Yesterday's rows never count, so each day starts empty. */
export function placesOn(allocs: Allocation[], orders: Pick<SiteOrder, "id" | "project_code" | "label">[], date: string, kind: "worker" | "tool"): Map<string, Place[]> {
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const out = new Map<string, Place[]>();
  for (const a of allocs) {
    if (a.work_date !== date) continue;
    const id = kind === "worker" ? a.worker_id : a.tool_id;
    const o = byOrder.get(a.order_id);
    if (!id || !o) continue;
    const list = out.get(id) ?? [];
    list.push({ order_id: o.id, project_code: o.project_code, label: o.label, attendance: a.attendance, ot_hours: a.ot_hours });
    out.set(id, list);
  }
  return out;
}

export const placeText = (p: Place) => `${p.project_code} · ${p.label}`;

/** Days a tool was put to work after its last service (all days when it has none). */
export function usedDaysSinceService(allocs: Pick<Allocation, "tool_id" | "work_date">[], toolId: string, lastService: string | null): number {
  const days = new Set<string>();
  for (const a of allocs) if (a.tool_id === toolId && (!lastService || a.work_date > lastService)) days.add(a.work_date);
  return days.size;
}

/** Tools ever allocated to an order: what Transfer / Movement has to account for. */
export function toolsUsedOn(allocs: Pick<Allocation, "order_id" | "tool_id">[], orderId: string): string[] {
  return [...new Set(allocs.filter((a) => a.order_id === orderId && a.tool_id).map((a) => a.tool_id as string))];
}

/** Keep what was already entered for a tool, add the ones not listed yet, drop none. */
export function syncTransferTools(existing: TransferTool[] | undefined, toolIds: string[]): TransferTool[] {
  const have = new Map((existing ?? []).map((t) => [t.tool_id, t]));
  for (const id of toolIds) if (!have.has(id)) have.set(id, { tool_id: id, destination: "", site: "", received_by: "", acknowledged: false });
  return [...have.values()];
}

const SUPERVISOR = /supervisor/i;
const SAFETY = /safety/i;

/**
 * The daily report's crew fields from that day's allocation: supervisors,
 * safety, then everyone else. The sheet lists worker numbers separated by
 * commas, so the employee code is used, and the name only when there is none.
 */
export function crewFromAllocation(allocs: Allocation[], workers: SiteWorker[], date: string, projectId: string): { crew: Crew; total: number } | null {
  const byId = new Map(workers.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const sup: string[] = [];
  const safety: string[] = [];
  const men: string[] = [];
  for (const a of allocs) {
    if (a.work_date !== date || a.project_id !== projectId || !a.worker_id || seen.has(a.worker_id)) continue;
    const w = byId.get(a.worker_id);
    if (!w) continue;
    seen.add(a.worker_id);
    const tag = w.emp_code || w.name;
    (SUPERVISOR.test(w.designation) ? sup : SAFETY.test(w.designation) ? safety : men).push(tag);
  }
  if (seen.size === 0) return null;
  return { crew: { supervisor: sup.join(", "), safety_personnel: safety.join(", "), men: men.join(", "), supply_men: "" }, total: seen.size };
}

/** "CP-OT-15" after "CP-OT-14": the next free number for a tool-number prefix. */
export function nextToolNo(existing: string[], prefix: string): string {
  const p = prefix.trim().toUpperCase().replace(/-+$/, "");
  if (!p) return "";
  let max = 0;
  let width = 2;
  for (const t of existing) {
    const m = t.toUpperCase().match(/^(.*)-(\d+)$/);
    if (m && m[1] === p) {
      max = Math.max(max, parseInt(m[2], 10));
      width = Math.max(width, m[2].length);
    }
  }
  return `${p}-${String(max + 1).padStart(width, "0")}`;
}
