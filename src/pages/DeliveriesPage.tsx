import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/*
  ConPlus — Deliveries (/store/deliveries)
  ----------------------------------------
  Vincent (loading bay) / Wendy (reconciliation) log received deliveries against
  issued POs. Closes the loop issued → closed.

  Write path (CP04, migration 20260911_cp04_partial_receipts.sql): the SECURITY
  DEFINER RPC `log_delivery_lines(po, do_number, [{line_id, qty_received}], …)`:
    - requires a non-empty DO number and PO status issued|partial
    - inserts the delivery_orders row (status 'received')
    - decrements each po_line_items.qty_balance (rejects over-receipt)
    - closes the PO (status 'closed', actual_delivery_date) only when every
      line's balance is 0; otherwise status 'partial' and the PO stays listed
  POs with no line items fall back to the legacy `log_delivery(..., p_close_po=true)`.

  No real auth layer, so — like StoreHealthPage — the operator picks who they are.
  Store staff (Vincent, Wendy) aren't in `salespeople`, and log_delivery does NOT
  validate the name, so "Received by" is a free-text field with salespeople as
  autocomplete suggestions.

  NOTE: purchase_orders has NO `required_date` column. `delivery_date` is the
  expected/required date; `actual_delivery_date` is stamped on close. Overdue is
  derived from delivery_date < today.
*/

const RECEIVER_KEY = "conplus_deliveries_receiver";
const EDIT_WINDOW_MS = 4 * 60 * 60 * 1000; // inline DO-number edit allowed for 4h

interface IssuedPO {
  id: string;
  po_number: string;
  status: "issued" | "partial";
  supplier_name: string | null;
  works_order: string | null;
  project_site: string | null;
  ship_to: string | null;
  total_amount: number;
  approved_at: string | null;
  expected_date: string | null; // purchase_orders.delivery_date (expected/required)
  line_count: number;
  partial_deliveries: number;
  is_overdue: boolean;
  delivery_status: DeliveryStatus;
  qty_received: number;
  qty_ordered: number;
}

interface POLine {
  id: string;
  description: string;
  qty: number;
  unit: string | null;
  qty_balance: number; // outstanding (null in DB means nothing received yet → qty)
}

type DeliveryStatus = "Pending" | "Partially Delivered" | "Fully Delivered";

// Same rule as the po_delivery_status view: a PO is only fully delivered when
// every line's outstanding balance is zero; anything received short of that is partial.
function deriveDeliveryStatus(lines: { qty: number; qty_balance: number | null }[]): DeliveryStatus {
  if (lines.length === 0) return "Pending";
  const outstanding = lines.reduce((s, l) => s + (l.qty_balance ?? l.qty), 0);
  const received = lines.reduce((s, l) => s + (l.qty - (l.qty_balance ?? l.qty)), 0);
  if (outstanding <= 0) return "Fully Delivered";
  return received > 0 ? "Partially Delivered" : "Pending";
}

interface DeliveryRow {
  id: string;
  do_number: string;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
  po_number: string;
  supplier_name: string | null;
  total_amount: number;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const yearStartISO = () => `${new Date().getFullYear()}-01-01`;

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

const fmtDateStr = (s: string | null) => {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? s : fmtDate(d);
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(n);

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false });
};

// The RPC folds the receiver name into notes as "Received by: NAME\n<note>".
function parseNotes(notes: string | null): { receivedBy: string | null; note: string | null } {
  if (!notes) return { receivedBy: null, note: null };
  const m = notes.match(/^Received by: ([^\n]*)\n?([\s\S]*)$/);
  if (m) return { receivedBy: m[1] || null, note: (m[2] || "").trim() || null };
  return { receivedBy: null, note: notes };
}

export default function DeliveriesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const [issued, setIssued] = useState<IssuedPO[]>([]);
  const [today, setToday] = useState<DeliveryRow[]>([]);
  const [stats, setStats] = useState({ waiting: 0, today: 0, ytd: 0 });
  const [staff, setStaff] = useState<string[]>([]);

  const [receiver, setReceiver] = useState<string>(() => localStorage.getItem(RECEIVER_KEY) ?? "");

  // log-delivery form
  const [logFor, setLogFor] = useState<IssuedPO | null>(null);
  const [doNumber, setDoNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [poLines, setPoLines] = useState<POLine[] | null>(null); // null = loading
  const [receiving, setReceiving] = useState<Record<string, string>>({});

  // inline DO-number edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const nowRef = useRef(Date.now());
  nowRef.current = Date.now();

  const load = useCallback(async () => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [issuedRes, dosRes, todayRes, staffRes] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select(
          "id,po_number,status,supplier_name,works_order,project_site,ship_to,total_amount,approved_at,delivery_date,po_line_items(id,qty,qty_balance)",
        )
        .in("status", ["issued", "partial"]),
      // every DO (po_id + date) — 85 rows, cheap. Powers the partial-count map + stats.
      supabase.from("delivery_orders").select("po_id,delivery_date"),
      supabase
        .from("delivery_orders")
        .select("id,do_number,delivery_date,notes,created_at,po_id,purchase_orders(po_number,supplier_name,total_amount)")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false }),
      supabase.from("salespeople").select("canonical_name").eq("active", true).order("canonical_name"),
    ]);

    const todayStr = todayISO();
    const yearStr = yearStartISO();

    // partial-delivery count per PO + today/ytd stats from the full DO list
    const partial = new Map<string, number>();
    let todayCount = 0;
    let ytdCount = 0;
    for (const d of (dosRes.data as { po_id: string; delivery_date: string | null }[]) ?? []) {
      partial.set(d.po_id, (partial.get(d.po_id) ?? 0) + 1);
      if (d.delivery_date === todayStr) todayCount++;
      if (d.delivery_date && d.delivery_date >= yearStr) ytdCount++;
    }

    const rows = ((issuedRes.data as Record<string, unknown>[]) ?? []).map((r) => {
      const expected = (r.delivery_date as string) ?? null;
      const lines = (((r.po_line_items as Record<string, unknown>[]) ?? [])).map((l) => ({
        qty: Number(l.qty ?? 0),
        qty_balance: l.qty_balance == null ? null : Number(l.qty_balance),
      }));
      return {
        id: r.id as string,
        po_number: r.po_number as string,
        status: r.status as IssuedPO["status"],
        supplier_name: (r.supplier_name as string) ?? null,
        works_order: (r.works_order as string) ?? null,
        project_site: (r.project_site as string) ?? null,
        ship_to: (r.ship_to as string) ?? null,
        total_amount: Number(r.total_amount ?? 0),
        approved_at: (r.approved_at as string) ?? null,
        expected_date: expected,
        line_count: lines.length,
        partial_deliveries: partial.get(r.id as string) ?? 0,
        is_overdue: !!expected && expected < todayStr,
        delivery_status: deriveDeliveryStatus(lines),
        qty_ordered: lines.reduce((s, l) => s + l.qty, 0),
        qty_received: lines.reduce((s, l) => s + (l.qty - (l.qty_balance ?? l.qty)), 0),
      } as IssuedPO;
    });
    rows.sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      const ta = a.approved_at ? new Date(a.approved_at).getTime() : Infinity;
      const tb = b.approved_at ? new Date(b.approved_at).getTime() : Infinity;
      return ta - tb;
    });
    setIssued(rows);

    setToday(
      ((todayRes.data as Record<string, unknown>[]) ?? []).map((r) => {
        const po = (r.purchase_orders as Record<string, unknown> | null) ?? {};
        return {
          id: r.id as string,
          do_number: r.do_number as string,
          delivery_date: (r.delivery_date as string) ?? null,
          notes: (r.notes as string) ?? null,
          created_at: r.created_at as string,
          po_number: (po.po_number as string) ?? "—",
          supplier_name: (po.supplier_name as string) ?? null,
          total_amount: Number(po.total_amount ?? 0),
        } as DeliveryRow;
      }),
    );

    setStats({ waiting: rows.length, today: todayCount, ytd: ytdCount });
    setStaff(((staffRes.data as { canonical_name: string }[]) ?? []).map((r) => r.canonical_name));
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  // poll every 60s while visible + refetch on focus
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

  const setActingReceiver = (name: string) => {
    setReceiver(name);
    if (name.trim()) localStorage.setItem(RECEIVER_KEY, name);
    else localStorage.removeItem(RECEIVER_KEY);
  };

  const openLog = async (po: IssuedPO) => {
    setLogFor(po);
    setDoNumber("");
    setDeliveryDate(todayISO());
    setFormNotes("");
    setPoLines(null);
    setReceiving({});
    const { data, error } = await supabase
      .from("po_line_items")
      .select("id,description,qty,unit,qty_balance")
      .eq("po_id", po.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setPoLines([]);
      return;
    }
    const lines = ((data as Record<string, unknown>[]) ?? []).map((l) => {
      const qty = Number(l.qty ?? 0);
      return {
        id: l.id as string,
        description: (l.description as string) ?? "",
        qty,
        unit: (l.unit as string) ?? null,
        qty_balance: l.qty_balance == null ? qty : Number(l.qty_balance),
      } as POLine;
    });
    setPoLines(lines);
    // default: receive everything still outstanding
    setReceiving(Object.fromEntries(lines.map((l) => [l.id, l.qty_balance > 0 ? String(l.qty_balance) : ""])));
  };

  const closeLog = () => {
    setLogFor(null);
    setPoLines(null);
    setReceiving({});
  };

  const receivingTotal = useMemo(
    () => Object.values(receiving).reduce((s, v) => s + (Number(v) > 0 ? Number(v) : 0), 0),
    [receiving],
  );

  const submitDelivery = async () => {
    if (!logFor) return;
    if (!doNumber.trim()) {
      toast.error("DO number is required.");
      return;
    }
    const lines = poLines ?? [];
    const payload = lines
      .map((l) => ({ line_id: l.id, qty_received: Number(receiving[l.id] || 0) }))
      .filter((p) => p.qty_received > 0);
    if (lines.length > 0) {
      const over = lines.find((l) => Number(receiving[l.id] || 0) > l.qty_balance);
      if (over) {
        toast.error(`"${over.description}" — receiving more than the ${over.qty_balance} outstanding.`);
        return;
      }
      if (payload.length === 0) {
        toast.error("Enter a received quantity on at least one line.");
        return;
      }
    }

    setSubmitting(true);
    // POs with line items: per-line receipt (partial-aware). Legacy POs with no
    // lines fall back to the whole-PO log_delivery and close on the receiver's say-so.
    const { data, error } = lines.length > 0
      ? await supabase.rpc("log_delivery_lines", {
          p_po_id: logFor.id,
          p_do_number: doNumber.trim(),
          p_lines: payload,
          p_delivery_date: deliveryDate || todayISO(),
          p_received_by_name: receiver.trim() || null,
          p_notes: formNotes.trim() || null,
        })
      : await supabase.rpc("log_delivery", {
          p_po_id: logFor.id,
          p_do_number: doNumber.trim(),
          p_delivery_date: deliveryDate || todayISO(),
          p_received_by_name: receiver.trim() || null,
          p_notes: formNotes.trim() || null,
          p_close_po: true,
        });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = (data as { po_number?: string; po_status?: string }[] | null)?.[0];
    toast.success(`Delivery logged for ${res?.po_number ?? logFor.po_number}`, {
      description:
        res?.po_status === "closed"
          ? "Fully delivered — PO closed."
          : "Partially delivered — PO stays open for the balance.",
    });
    closeLog();
    await load();
  };

  const startEdit = (row: DeliveryRow) => {
    setEditId(row.id);
    setEditValue(row.do_number);
  };

  const saveEdit = async (row: DeliveryRow) => {
    if (!editValue.trim()) {
      toast.error("DO number can't be empty.");
      return;
    }
    setSavingEdit(true);
    // Correction path — mirrors the direct materials.update() write used elsewhere.
    const { error } = await supabase
      .from("delivery_orders")
      .update({ do_number: editValue.trim() })
      .eq("id", row.id);
    setSavingEdit(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("DO number corrected.");
    setEditId(null);
    await load();
  };

  const now = new Date();

  const overdueCount = useMemo(() => issued.filter((p) => p.is_overdue).length, [issued]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading deliveries…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="h-5 w-5" />
          </div>
          <div className="mr-auto leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">Deliveries</h1>
            <p className="text-xs text-muted-foreground">{fmtDate(now)}</p>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Received by
            <input
              list="delivery-staff"
              value={receiver}
              onChange={(e) => setActingReceiver(e.target.value)}
              placeholder="your name"
              className="w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="delivery-staff">
              {staff.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <button
            onClick={manualRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            title={`Last refreshed ${lastRefreshed.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}`}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        </div>

        {/* header stats */}
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 pb-3 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-blue-700">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            {stats.waiting} waiting delivery
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {stats.today} received today
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            {stats.ytd} delivered this year
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 pb-24">
        {/* Waiting delivery */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="flex items-center gap-2 text-sm font-heading font-semibold text-card-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Waiting delivery
            </h2>
            <span className="text-xs text-muted-foreground">
              {issued.length} issued{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}
            </span>
          </div>

          {issued.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing waiting — all issued POs delivered.</p>
          ) : (
            <ul className="divide-y divide-border">
              {issued.map((po) => (
                <li
                  key={po.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-3 p-4",
                    po.is_overdue && "border-l-2 border-l-red-500",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-card-foreground">{po.po_number}</span>
                      <span className="text-sm text-muted-foreground">{po.supplier_name || "—"}</span>
                      {po.works_order && po.works_order !== "NIL" && (
                        <span className="text-xs text-muted-foreground">WO {po.works_order}</span>
                      )}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          po.delivery_status === "Partially Delivered"
                            ? "bg-amber-100 text-amber-700"
                            : po.delivery_status === "Fully Delivered"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-secondary text-muted-foreground",
                        )}
                        title={
                          po.line_count > 0
                            ? `${po.qty_received} of ${po.qty_ordered} received across ${po.line_count} line${po.line_count === 1 ? "" : "s"}`
                            : "No line items on this PO — closes on receipt"
                        }
                      >
                        {po.delivery_status}
                      </span>
                      {po.is_overdue && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtMoney(po.total_amount)} · {po.line_count} line{po.line_count === 1 ? "" : "s"}
                      {po.line_count > 0 ? ` · ${po.qty_received}/${po.qty_ordered} received` : ""}
                      {po.approved_at ? ` · issued ${daysBetween(new Date(po.approved_at), now)}d ago` : ""}
                      {po.expected_date ? ` · required ${fmtDateStr(po.expected_date)}` : ""}
                    </p>
                    {po.project_site && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{po.project_site}</p>
                    )}
                    {po.partial_deliveries > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {po.partial_deliveries} partial deliver{po.partial_deliveries === 1 ? "y" : "ies"} already logged
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => openLog(po)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Truck className="h-4 w-4" />
                    Log delivery
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Received in last 24h */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="text-sm font-heading font-semibold text-card-foreground">Received (last 24h)</h2>
            <span className="text-xs text-muted-foreground">{today.length} delivered</span>
          </div>

          {today.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No deliveries logged in the last 24 hours.</p>
          ) : (
            <ul className="divide-y divide-border">
              {today.map((row) => {
                const parsed = parseNotes(row.notes);
                const editable = nowRef.current - new Date(row.created_at).getTime() < EDIT_WINDOW_MS;
                return (
                  <li key={row.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">
                            {fmtTime(row.created_at)}
                          </span>
                          {editId === row.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-36 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                              />
                              <button
                                onClick={() => saveEdit(row)}
                                disabled={savingEdit}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                              </button>
                              <button
                                onClick={() => setEditId(null)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-semibold text-card-foreground">DO {row.do_number}</span>
                              {editable && (
                                <button
                                  onClick={() => startEdit(row)}
                                  title="Fix DO number (within 4h of logging)"
                                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          )}
                          <span className="text-sm text-muted-foreground">
                            {row.po_number} · {row.supplier_name || "—"}
                          </span>
                        </div>
                        {parsed.note && <p className="mt-1 text-xs text-muted-foreground">{parsed.note}</p>}
                      </div>
                      {parsed.receivedBy && (
                        <span className="shrink-0 text-xs text-muted-foreground">Received by {parsed.receivedBy}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {/* Log delivery dialog */}
      {logFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeLog} />
          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading font-semibold text-card-foreground">Log delivery · {logFor.po_number}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {logFor.supplier_name || "—"} · {fmtMoney(logFor.total_amount)}
                  {logFor.partial_deliveries > 0 ? ` · ${logFor.partial_deliveries} DO already logged` : ""}
                </p>
              </div>
              <button onClick={closeLog} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* per-line receipt */}
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              {poLines === null ? (
                <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading PO lines…
                </p>
              ) : poLines.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  This PO has no line items — logging the DO will close it as fully delivered.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Item</th>
                      <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
                      <th className="px-2 py-1.5 text-right font-medium">Received</th>
                      <th className="px-2 py-1.5 text-right font-medium">Outstanding</th>
                      <th className="px-2 py-1.5 text-right font-medium">Receiving now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poLines.map((l) => {
                      const done = l.qty_balance <= 0;
                      const val = Number(receiving[l.id] || 0);
                      const over = val > l.qty_balance;
                      return (
                        <tr key={l.id} className={cn("border-t border-border/60", done && "opacity-60")}>
                          <td className="px-2 py-1.5 text-card-foreground">
                            {l.description}
                            {l.unit ? <span className="ml-1 text-muted-foreground">({l.unit})</span> : null}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.qty - l.qty_balance}</td>
                          <td className={cn("px-2 py-1.5 text-right tabular-nums", !done && "font-semibold")}>
                            {l.qty_balance}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={l.qty_balance}
                              step="any"
                              disabled={done}
                              value={receiving[l.id] ?? ""}
                              onChange={(e) => setReceiving((m) => ({ ...m, [l.id]: e.target.value }))}
                              className={cn(
                                "w-24 rounded-md border bg-background px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-ring",
                                over ? "border-red-500" : "border-input",
                              )}
                              aria-label={`Receiving now: ${l.description}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {poLines && poLines.length > 0 && (
              <p
                className="mt-1.5 text-[11px] text-muted-foreground"
                title="Closing a PO short (writing off an undelivered balance) is not offered here yet — adjust the PO line quantity instead."
              >
                Receiving {receivingTotal} now. The PO closes automatically once every line is fully received;
                anything less keeps it open as partially delivered.
              </p>
            )}

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">DO number *</span>
                <input
                  autoFocus
                  value={doNumber}
                  onChange={(e) => setDoNumber(e.target.value)}
                  placeholder="as printed on the supplier's DO"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className="text-xs font-medium text-muted-foreground">Delivery date</span>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block flex-1">
                  <span className="text-xs font-medium text-muted-foreground">Received by</span>
                  <input
                    list="delivery-staff"
                    value={receiver}
                    onChange={(e) => setActingReceiver(e.target.value)}
                    placeholder="your name"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Notes</span>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="short delivery / damage note (optional)"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeLog}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={submitDelivery}
                disabled={submitting || poLines === null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                Log delivery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
