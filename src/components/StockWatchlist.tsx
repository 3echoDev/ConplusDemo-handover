import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Search, Pencil, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/*
  Stock Watchlist — reads the `stock_watchlist` view (honest, near-zero based
  thresholds), NOT the old placeholder alert_threshold=5 which flagged
  everything "critical".

  stock_status is computed server-side in the view:
    - reorder_point set  → out ≤0, critical ≤ RP,      low ≤ RP×1.5, else ok
    - not set (default)  → out ≤0, critical ≤1,         low ≤3,        else ok
  threshold_is_default = true means the status uses the honest absolute default,
  not a reorder point Vincent has tuned.

  The watchlist shows out/critical/low grouped by supplier (the store reorders
  per supplier). OK items are hidden unless you search. Vincent can set a
  reorder point inline; deliver-direct items can be dropped by setting RP = 0.
*/

type Status = "out" | "critical" | "low" | "ok";

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
  threshold_is_default: boolean;
}

const SEVERITY: Record<Status, number> = { out: 0, critical: 1, low: 2, ok: 3 };

const PILL: Record<Status, string> = {
  out: "bg-red-100 text-red-700",
  critical: "bg-orange-100 text-orange-700",
  low: "bg-yellow-100 text-yellow-800",
  ok: "bg-emerald-100 text-emerald-700",
};

function Pill({ status }: { status: Status }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", PILL[status])}>
      {status}
    </span>
  );
}

export default function StockWatchlist({
  onCounts,
}: {
  onCounts?: (c: { out: number; critical: number; low: number }) => void;
}) {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("stock_watchlist")
      .select(
        "id,name,item_code,supplier_name,unit,storage_location,qty_on_hand,reorder_point,stock_status,threshold_is_default",
      )
      .order("supplier_name");
    setRows((data as WatchRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Report honest issue counts up to the page KPI.
  useEffect(() => {
    if (!onCounts) return;
    onCounts({
      out: rows.filter((r) => r.stock_status === "out").length,
      critical: rows.filter((r) => r.stock_status === "critical").length,
      low: rows.filter((r) => r.stock_status === "low").length,
    });
  }, [rows, onCounts]);

  const attention = useMemo(
    () => rows.filter((r) => r.stock_status !== "ok"),
    [rows],
  );

  // Search shows ALL statuses (incl. ok); watchlist default hides ok.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return rows
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.item_code.toLowerCase().includes(q) ||
          (r.supplier_name ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => SEVERITY[a.stock_status] - SEVERITY[b.stock_status] || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [rows, search]);

  // Group items-needing-attention by supplier — each block is a reorder list.
  const grouped = useMemo(() => {
    const map = new Map<string, WatchRow[]>();
    for (const r of attention) {
      const key = r.supplier_name || "No supplier";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([supplier, items]) => ({
        supplier,
        items: items.sort(
          (a, b) => SEVERITY[a.stock_status] - SEVERITY[b.stock_status] || a.qty_on_hand - b.qty_on_hand,
        ),
      }));
  }, [attention]);

  const hasOut = attention.some((r) => r.stock_status === "out");

  const startEdit = (r: WatchRow) => {
    setEditingId(r.id);
    setEditValue(r.reorder_point == null ? "" : String(r.reorder_point));
  };

  const saveEdit = async (id: string) => {
    const raw = editValue.trim();
    const n = raw === "" ? null : Number(raw);
    if (n != null && (isNaN(n) || n < 0)) return;
    setSavingId(id);
    await supabase.from("materials").update({ reorder_point: n }).eq("id", id);
    setSavingId(null);
    setEditingId(null);
    await load(); // status recomputes server-side
  };

  const RowRight = ({ r }: { r: WatchRow }) => (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-sm font-semibold text-card-foreground tabular-nums">
        {r.qty_on_hand} {r.unit}
      </span>
      <Pill status={r.stock_status} />
      {editingId === r.id ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit(r.id);
              if (e.key === "Escape") setEditingId(null);
            }}
            type="number"
            min="0"
            step="any"
            placeholder="RP"
            className="w-16 rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => saveEdit(r.id)}
            disabled={savingId === r.id}
            className="rounded p-1 text-primary hover:bg-secondary"
            title="Save reorder point"
          >
            {savingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setEditingId(null)} className="rounded p-1 text-muted-foreground hover:bg-secondary" title="Cancel">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <button
          onClick={() => startEdit(r)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
          title={r.threshold_is_default ? "Auto default — click to set a reorder point" : "Reorder point — click to edit"}
        >
          {r.threshold_is_default ? (
            <span className="rounded bg-muted px-1 py-0.5 font-medium uppercase tracking-wide">auto</span>
          ) : (
            <span className="tabular-nums">RP {r.reorder_point}</span>
          )}
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
        <span className="text-primary"><Package className="h-4 w-4" /></span>
        <h2 className="text-sm font-heading font-semibold text-card-foreground flex-1">
          {search ? "Stock Search" : "Stock Watchlist"}
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all stock..."
            className="w-44 rounded-lg border border-input bg-background pl-8 pr-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading stock…</p>
      ) : search ? (
        /* ---- Search mode: flat list, includes OK ---- */
        <div className="divide-y divide-border">
          {searchResults.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No matching items.</p>
          )}
          {searchResults.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-card-foreground truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {(r.supplier_name || "No supplier")} · {r.item_code}
                  {r.storage_location ? ` · ${r.storage_location}` : ""}
                </p>
              </div>
              <RowRight r={r} />
            </div>
          ))}
        </div>
      ) : (
        /* ---- Watchlist: out/critical/low grouped by supplier ---- */
        <div>
          {attention.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing low right now — stock is healthy.</p>
          )}
          {hasOut && (
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Some "Out" items are delivered straight to site and never stocked — set their reorder point to 0 to drop them from the watchlist.
            </p>
          )}
          {grouped.map(({ supplier, items }) => (
            <div key={supplier}>
              <div className="flex items-center justify-between gap-2 bg-secondary/40 px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{supplier}</span>
                <span className="text-[11px] text-muted-foreground">{items.length} to reorder</span>
              </div>
              <div className="divide-y divide-border">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-card-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.item_code}
                        {r.storage_location ? ` · ${r.storage_location}` : ""}
                      </p>
                    </div>
                    <RowRight r={r} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
