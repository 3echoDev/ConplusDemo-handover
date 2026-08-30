import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/*
  ConPlus — Store Health (director-facing dashboard)
  --------------------------------------------------
  Read-only view of the store's health. The only writes are PO approvals /
  rejections, and those go exclusively through the SECURITY DEFINER RPCs
  `po_approve` / `po_reject`, which validate the approver against `salespeople`,
  block self-approval, and write the audit_log.

  The app has no real auth layer, so — following the LOAReviewPage convention —
  the director picks who they are from the active salespeople list. That name is
  passed as p_approver_name and remembered in localStorage.

  Everything is assembled from plain reads (supabase-js can't run the LATERAL /
  to_date SQL), then joined client-side:
    - stock_watchlist          → traffic light + critical/out list
    - material_movements (IN)   → last-received date per material
    - purchase_orders (open)    → open-PO coverage per material (by description)
    - purchase_orders (pending) → approvals queue
    - material_movements (30d)  → movement-velocity mini chart
*/

const APPROVER_KEY = "conplus_store_approver";

type Status = "out" | "critical" | "low" | "ok";
const STATUSES: Status[] = ["out", "critical", "low", "ok"];

interface WatchRow {
  id: string;
  name: string;
  item_code: string;
  supplier_name: string | null;
  unit: string;
  storage_location: string | null;
  qty_on_hand: number;
  reorder_point: number | null;
  stock_status: Status;
}

interface Coverage {
  po_number: string;
  status: "draft" | "pending" | "issued";
}

interface PendingPO {
  id: string;
  po_number: string;
  supplier_name: string | null;
  ship_to: string | null;
  project_site: string | null;
  works_order: string | null;
  total_amount: number;
  submitted_at: string | null;
  submitted_by: string | null;
  created_at: string;
  line_count: number;
  direct_to_site: boolean;
}

// Wide Excel-style ledger row (mirrors StorePage) — used by the detail drawer.
interface MovementRow {
  id: string;
  sno: number;
  material_id: string;
  qty_in: number | null;
  qty_out: number | null;
  project_in: string | null;
  project_out: string | null;
  remarks_in: string | null;
  remarks_out: string | null;
  created_at: string;
}

// Collapse a wide ledger row to a single movement. The unused qty side defaults
// to 0 (not null), so key off qty_in > 0 to tell IN from OUT.
function movementView(row: MovementRow) {
  const isIn = Number(row.qty_in ?? 0) > 0;
  return {
    direction: (isIn ? "in" : "out") as "in" | "out",
    qty: Number((isIn ? row.qty_in : row.qty_out) ?? 0),
    project_ref: (isIn ? row.project_in : row.project_out) ?? "",
    remarks: (isIn ? row.remarks_in : row.remarks_out) ?? null,
  };
}

const COVERAGE_RANK: Record<Coverage["status"], number> = { issued: 0, pending: 1, draft: 2 };

const PILL: Record<Status, string> = {
  out: "bg-red-100 text-red-700",
  critical: "bg-orange-100 text-orange-700",
  low: "bg-yellow-100 text-yellow-800",
  ok: "bg-emerald-100 text-emerald-700",
};

const CHIP_DOT: Record<Status, string> = {
  out: "bg-red-500",
  critical: "bg-orange-500",
  low: "bg-yellow-400",
  ok: "bg-emerald-500",
};

const CHIP_LABEL: Record<Status, string> = {
  out: "out",
  critical: "critical",
  low: "low",
  ok: "ok",
};

// date_in is free text: legacy Excel import is "DD.MM.YY", the store form writes
// "YYYY-MM-DD", and most rows are blank. Fall back to created_at when unparseable.
function parseReceived(dateIn: string | null, createdAt: string): Date {
  if (dateIn) {
    const iso = dateIn.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    const ex = dateIn.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
    if (ex) return new Date(2000 + Number(ex[3]), Number(ex[2]) - 1, Number(ex[1]));
  }
  return new Date(createdAt);
}

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(n);

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
};

export default function StoreHealthPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const [rows, setRows] = useState<WatchRow[]>([]);
  const [received, setReceived] = useState<Map<string, Date>>(new Map());
  const [coverage, setCoverage] = useState<Map<string, Coverage>>(new Map());
  const [pending, setPending] = useState<PendingPO[]>([]);
  const [velocity, setVelocity] = useState<{ day: string; n: number }[]>([]);
  const [movementTotal, setMovementTotal] = useState(0);

  // approver identity (no real auth — pick from active salespeople)
  const [approvers, setApprovers] = useState<string[]>([]);
  const [approver, setApprover] = useState<string>(() => localStorage.getItem(APPROVER_KEY) ?? "");

  // section-2 status filter (null = default out+critical)
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);

  // pending-PO action state
  const [busyPo, setBusyPo] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingPO | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNotesFor, setApproveNotesFor] = useState<string | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [highlightPo, setHighlightPo] = useState<string | null>(null);
  const pendingRef = useRef<HTMLElement>(null);

  // detail drawer
  const [drawer, setDrawer] = useState<WatchRow | null>(null);
  const [ledger, setLedger] = useState<MovementRow[] | null>(null);

  const loadApprovers = useCallback(async () => {
    const { data } = await supabase
      .from("salespeople")
      .select("canonical_name")
      .eq("active", true)
      .order("canonical_name");
    setApprovers(((data as { canonical_name: string }[]) ?? []).map((r) => r.canonical_name));
  }, []);

  const load = useCallback(async () => {
    const thirtyAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [watch, inRows, openPos, pendingPos, velRows, totalRes] = await Promise.all([
      supabase
        .from("stock_watchlist")
        .select("id,name,item_code,supplier_name,unit,storage_location,qty_on_hand,reorder_point,stock_status"),
      supabase
        .from("material_movements")
        .select("material_id,date_in,created_at,qty_in")
        .gt("qty_in", 0),
      supabase
        .from("purchase_orders")
        .select("po_number,status,po_line_items(description)")
        .in("status", ["draft", "pending", "issued"]),
      supabase
        .from("purchase_orders")
        .select(
          "id,po_number,supplier_name,ship_to,project_site,works_order,total_amount,submitted_at,submitted_by,created_at,po_line_items(id)",
        )
        .eq("status", "pending"),
      supabase.from("material_movements").select("created_at").gte("created_at", thirtyAgo),
      supabase.from("material_movements").select("id", { count: "exact", head: true }),
    ]);

    // watchlist
    setRows(
      ((watch.data as Record<string, unknown>[]) ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        item_code: r.item_code as string,
        supplier_name: (r.supplier_name as string) ?? null,
        unit: r.unit as string,
        storage_location: (r.storage_location as string) ?? null,
        qty_on_hand: Number(r.qty_on_hand ?? 0),
        reorder_point: r.reorder_point == null ? null : Number(r.reorder_point),
        stock_status: r.stock_status as Status,
      })),
    );

    // last-received per material
    const recMap = new Map<string, Date>();
    for (const r of (inRows.data as { material_id: string; date_in: string | null; created_at: string }[]) ?? []) {
      const d = parseReceived(r.date_in, r.created_at);
      const prev = recMap.get(r.material_id);
      if (!prev || d > prev) recMap.set(r.material_id, d);
    }
    setReceived(recMap);

    // open-PO coverage per material name (best coverage wins: issued > pending > draft)
    const covMap = new Map<string, Coverage>();
    for (const po of (openPos.data as { po_number: string; status: Coverage["status"]; po_line_items: { description: string | null }[] }[]) ?? []) {
      for (const li of po.po_line_items ?? []) {
        const key = (li.description ?? "").trim();
        if (!key) continue;
        const cur = covMap.get(key);
        if (!cur || COVERAGE_RANK[po.status] < COVERAGE_RANK[cur.status]) {
          covMap.set(key, { po_number: po.po_number, status: po.status });
        }
      }
    }
    setCoverage(covMap);

    // pending approvals
    const pend = ((pendingPos.data as Record<string, unknown>[]) ?? []).map((r) => {
      const ship = ((r.ship_to as string) ?? "").trim();
      const site = ((r.project_site as string) ?? "").trim();
      return {
        id: r.id as string,
        po_number: r.po_number as string,
        supplier_name: (r.supplier_name as string) ?? null,
        ship_to: (r.ship_to as string) ?? null,
        project_site: (r.project_site as string) ?? null,
        works_order: (r.works_order as string) ?? null,
        total_amount: Number(r.total_amount ?? 0),
        submitted_at: (r.submitted_at as string) ?? null,
        submitted_by: (r.submitted_by as string) ?? null,
        created_at: r.created_at as string,
        line_count: ((r.po_line_items as unknown[]) ?? []).length,
        direct_to_site: !!ship && !!site && ship === site,
      } as PendingPO;
    });
    pend.sort(
      (a, b) =>
        new Date(a.submitted_at ?? a.created_at).getTime() -
        new Date(b.submitted_at ?? b.created_at).getTime(),
    );
    setPending(pend);

    // velocity: bucket last 30 days
    const buckets = new Map<string, number>();
    for (const r of (velRows.data as { created_at: string }[]) ?? []) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const days: { day: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      days.push({ day: key, n: buckets.get(key) ?? 0 });
    }
    setVelocity(days);

    setMovementTotal(totalRes.count ?? 0);
    setLastRefreshed(new Date());
  }, []);

  // initial
  useEffect(() => {
    (async () => {
      await Promise.all([loadApprovers(), load()]);
      setLoading(false);
    })();
  }, [loadApprovers, load]);

  // poll every 60s while visible, and refetch on focus
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const manualRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setActingAs = (name: string) => {
    setApprover(name);
    if (name) localStorage.setItem(APPROVER_KEY, name);
    else localStorage.removeItem(APPROVER_KEY);
  };

  const counts = useMemo(() => {
    const c: Record<Status, number> = { out: 0, critical: 0, low: 0, ok: 0 };
    for (const r of rows) c[r.stock_status]++;
    return c;
  }, [rows]);

  const now = new Date();

  // section-2 list: default out+critical, or a single status when a chip is active
  const listRows = useMemo(() => {
    const wanted: Status[] = statusFilter ? [statusFilter] : ["out", "critical"];
    const rank: Record<Status, number> = { out: 0, critical: 1, low: 2, ok: 3 };
    return rows
      .filter((r) => wanted.includes(r.stock_status))
      .sort(
        (a, b) =>
          rank[a.stock_status] - rank[b.stock_status] ||
          (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 150);
  }, [rows, statusFilter]);

  const openDrawer = async (r: WatchRow) => {
    setDrawer(r);
    setLedger(null);
    const { data } = await supabase
      .from("material_movements")
      .select("id,sno,material_id,qty_in,qty_out,project_in,project_out,remarks_in,remarks_out,created_at")
      .eq("material_id", r.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setLedger((data as MovementRow[]) ?? []);
  };

  const requireApprover = (): boolean => {
    if (!approver) {
      toast.error("Pick who you are (top right) before approving or rejecting.");
      return false;
    }
    return true;
  };

  const doApprove = async (po: PendingPO, notes: string) => {
    if (!requireApprover()) return;
    setBusyPo(po.id);
    const { data, error } = await supabase.rpc("po_approve", {
      p_po_id: po.id,
      p_approver_name: approver,
      p_notes: notes.trim() || null,
    });
    setBusyPo(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = (data as { po_number?: string }[] | null)?.[0];
    toast.success(`Approved ${res?.po_number ?? po.po_number}`, { description: "Now issued." });
    setApproveNotesFor(null);
    setApproveNotes("");
    await load();
  };

  const doReject = async () => {
    if (!rejecting) return;
    if (!requireApprover()) return;
    if (!rejectReason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setBusyPo(rejecting.id);
    const { error } = await supabase.rpc("po_reject", {
      p_po_id: rejecting.id,
      p_approver_name: approver,
      p_reason: rejectReason.trim(),
    });
    setBusyPo(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Rejected ${rejecting.po_number}`, { description: "Sent back to draft." });
    setRejecting(null);
    setRejectReason("");
    await load();
  };

  // jump section-2 "Approve" nudge → the PO card in section 3
  const jumpToPending = (poNumber: string) => {
    const match = pending.find((p) => p.po_number === poNumber);
    pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (match) {
      setHighlightPo(match.id);
      window.setTimeout(() => setHighlightPo(null), 2200);
    }
  };

  const velMax = Math.max(1, ...velocity.map((d) => d.n));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading store health…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <div className="mr-auto leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">
              Store Health
            </h1>
            <p className="text-xs text-muted-foreground">
              {fmtDate(now)} · {movementTotal} movements logged
            </p>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Acting as
            <select
              value={approver}
              onChange={(e) => setActingAs(e.target.value)}
              className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— select —</option>
              {approvers.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={manualRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            title={`Last refreshed ${lastRefreshed.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}`}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>

        {/* Section 1 — traffic light chips */}
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 pb-3">
          {STATUSES.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? null : s)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", CHIP_DOT[s])} />
                {counts[s]} {CHIP_LABEL[s]}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 pb-24">
        {/* Section 2 — critical + out list */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="text-sm font-heading font-semibold text-card-foreground">
              {statusFilter ? `${CHIP_LABEL[statusFilter]} items` : "Needs reordering — out & critical"}
            </h2>
            <span className="text-xs text-muted-foreground">{listRows.length} shown</span>
          </div>

          {listRows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing here — stock is healthy.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium text-right">On hand</th>
                    <th className="px-4 py-2 font-medium text-right">RP</th>
                    <th className="px-4 py-2 font-medium text-right">Last received</th>
                    <th className="px-4 py-2 font-medium">Open PO</th>
                    <th className="px-4 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listRows.map((r) => {
                    const rec = received.get(r.id);
                    const cov = coverage.get(r.name.trim());
                    const dot = cov ? (cov.status === "issued" ? CHIP_DOT.ok : CHIP_DOT.critical) : CHIP_DOT.out;
                    return (
                      <tr key={r.id} className="hover:bg-secondary/40">
                        <td className="px-4 py-2.5">
                          <button onClick={() => openDrawer(r)} className="text-left">
                            <span className="flex items-center gap-2">
                              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", PILL[r.stock_status])}>
                                {r.stock_status}
                              </span>
                              <span className="font-medium text-card-foreground hover:underline">{r.name}</span>
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {(r.supplier_name || "No supplier")} · {r.item_code}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {r.qty_on_hand} <span className="text-xs text-muted-foreground">{r.unit}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {r.reorder_point == null ? "—" : r.reorder_point}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {rec ? (
                            <span title={fmtDate(rec)}>{daysBetween(rec, now)}d ago</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
                            <span className="text-xs text-muted-foreground">
                              {cov ? `${cov.po_number} (${cov.status})` : "none"}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {!cov ? (
                            <span className="text-xs font-medium text-red-600">Raise PO</span>
                          ) : cov.status === "issued" ? (
                            <span className="text-xs text-emerald-600">On order</span>
                          ) : cov.status === "pending" ? (
                            <button
                              onClick={() => jumpToPending(cov.po_number)}
                              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                            >
                              Approve →
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">In draft</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 3 — pending approvals */}
        <section ref={pendingRef} className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="flex items-center gap-2 text-sm font-heading font-semibold text-card-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Pending approvals
            </h2>
            <span className="text-xs text-muted-foreground">{pending.length} waiting</span>
          </div>

          {pending.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing waiting for approval.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((po) => (
                <li
                  key={po.id}
                  className={cn(
                    "p-4 transition-colors",
                    highlightPo === po.id && "bg-primary/10",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-card-foreground">{po.po_number}</span>
                        <span className="text-sm text-muted-foreground">{po.supplier_name || "—"}</span>
                        {po.direct_to_site && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            <Truck className="h-3 w-3" /> Direct to site
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {po.line_count} line{po.line_count === 1 ? "" : "s"} · {fmtMoney(po.total_amount)}
                        {po.works_order && po.works_order !== "NIL" ? ` · WO ${po.works_order}` : ""}
                        {" · "}
                        {po.submitted_at
                          ? `submitted ${fmtDateTime(po.submitted_at)}${po.submitted_by ? ` by ${po.submitted_by}` : ""}`
                          : `created ${fmtDateTime(po.created_at)}`}
                      </p>
                      {po.ship_to && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">Ship to: {po.ship_to}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => {
                          setApproveNotesFor(approveNotesFor === po.id ? null : po.id);
                          setApproveNotes("");
                        }}
                        disabled={busyPo === po.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyPo === po.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setRejecting(po);
                          setRejectReason("");
                        }}
                        disabled={busyPo === po.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  </div>

                  {approveNotesFor === po.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={approveNotes}
                        onChange={(e) => setApproveNotes(e.target.value)}
                        placeholder="Approval note (optional)"
                        className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => doApprove(po, approveNotes)}
                        disabled={busyPo === po.id}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Confirm approve
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Section 4 — movement velocity */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="text-sm font-heading font-semibold text-card-foreground">Movement velocity · 30 days</h2>
            <span className="text-xs text-muted-foreground">
              {velocity.reduce((s, d) => s + d.n, 0)} movements
            </span>
          </div>
          <div className="p-4">
            <div className="flex h-28 items-end gap-1">
              {velocity.map((d) => (
                <div key={d.day} className="group relative flex-1" title={`${d.day}: ${d.n}`}>
                  <div
                    className={cn("w-full rounded-t", d.n > 0 ? "bg-primary/70" : "bg-secondary")}
                    style={{ height: `${Math.max(2, (d.n / velMax) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{velocity[0]?.day.slice(5)}</span>
              <span>{velocity[velocity.length - 1]?.day.slice(5)}</span>
            </div>
          </div>
        </section>
      </main>

      {/* Section 5 — detail drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(null)} />
          <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-card shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", PILL[drawer.stock_status])}>
                    {drawer.stock_status}
                  </span>
                  <h3 className="truncate font-heading font-semibold text-card-foreground">{drawer.name}</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(drawer.supplier_name || "No supplier")} · {drawer.item_code} · {drawer.qty_on_hand} {drawer.unit} on hand
                </p>
              </div>
              <button onClick={() => setDrawer(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {ledger === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading ledger…
                </p>
              ) : ledger.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No movements recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {ledger.map((row) => {
                    const v = movementView(row);
                    const isIn = v.direction === "in";
                    return (
                      <li key={row.id} className="rounded-lg border border-border p-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-xs font-bold",
                              isIn ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {isIn ? "IN" : "OUT"}
                          </span>
                          <span className="font-semibold text-card-foreground">{v.qty}</span>
                          <span className="ml-auto text-xs text-muted-foreground">#{row.sno}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {fmtDateTime(row.created_at)} · {v.project_ref}
                          {v.remarks ? ` · ${v.remarks}` : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRejecting(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading font-semibold text-card-foreground">Reject {rejecting.po_number}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This sends the PO back to draft. A reason is required.
                </p>
              </div>
              <button onClick={() => setRejecting(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this being rejected?"
              className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={doReject}
                disabled={busyPo === rejecting.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busyPo === rejecting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
