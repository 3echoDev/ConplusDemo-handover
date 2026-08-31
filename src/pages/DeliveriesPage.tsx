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

  The only write path is the SECURITY DEFINER RPC `log_delivery`, which:
    - requires a non-empty DO number
    - only accepts POs in status 'issued' (throws otherwise)
    - inserts the delivery_orders row (status 'received')
    - if p_close_po, composes po_close() → PO becomes 'closed' and its
      actual_delivery_date is stamped
    - writes an audit_log entry

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
  const [markClosed, setMarkClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
          "id,po_number,supplier_name,works_order,project_site,ship_to,total_amount,approved_at,delivery_date,po_line_items(id)",
        )
        .eq("status", "issued"),
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
      return {
        id: r.id as string,
        po_number: r.po_number as string,
        supplier_name: (r.supplier_name as string) ?? null,
        works_order: (r.works_order as string) ?? null,
        project_site: (r.project_site as string) ?? null,
        ship_to: (r.ship_to as string) ?? null,
        total_amount: Number(r.total_amount ?? 0),
        approved_at: (r.approved_at as string) ?? null,
        expected_date: expected,
        line_count: ((r.po_line_items as unknown[]) ?? []).length,
        partial_deliveries: partial.get(r.id as string) ?? 0,
        is_overdue: !!expected && expected < todayStr,
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

  const openLog = (po: IssuedPO) => {
    setLogFor(po);
    setDoNumber("");
    setDeliveryDate(todayISO());
    setFormNotes("");
    setMarkClosed(false);
  };

  const submitDelivery = async () => {
    if (!logFor) return;
    if (!doNumber.trim()) {
      toast.error("DO number is required.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("log_delivery", {
      p_po_id: logFor.id,
      p_do_number: doNumber.trim(),
      p_delivery_date: deliveryDate || todayISO(),
      p_received_by_name: receiver.trim() || null,
      p_notes: formNotes.trim() || null,
      p_close_po: markClosed,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = (data as { po_number?: string; po_status?: string }[] | null)?.[0];
    toast.success(`Delivery logged for ${res?.po_number ?? logFor.po_number}`, {
      description: res?.po_status === "closed" ? "PO closed — fully delivered." : "PO stays open for further deliveries.",
    });
    setLogFor(null);
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
                      {po.is_overdue && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtMoney(po.total_amount)} · {po.line_count} line{po.line_count === 1 ? "" : "s"}
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setLogFor(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading font-semibold text-card-foreground">Log delivery · {logFor.po_number}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {logFor.supplier_name || "—"} · {fmtMoney(logFor.total_amount)}
                  {logFor.partial_deliveries > 0 ? ` · ${logFor.partial_deliveries} DO already logged` : ""}
                </p>
              </div>
              <button onClick={() => setLogFor(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

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

              <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-card-foreground">
                <input
                  type="checkbox"
                  checked={markClosed}
                  onChange={(e) => setMarkClosed(e.target.checked)}
                  className="h-4 w-4"
                />
                Mark PO as fully delivered (closes the PO)
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setLogFor(null)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={submitDelivery}
                disabled={submitting}
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
