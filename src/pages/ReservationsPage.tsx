/*
  Reservations — /store/reservations

  Available vs Reserved stock per material, and per-project reservations.

    physical  = materials.qty_on_hand           (moves only via Store form / Excel import)
    reserved  = Σ remaining of ACTIVE rows in material_allocations
    available = physical − reserved

  A reservation is an allocation only: nothing leaves the store until the
  Store form logs an OUT for that project, which consumes the reservation
  (RPC log_material_movement). Reserved stock can never go OUT to a different
  project. Reads: views material_stock_position + project_reservations.
  Writes: RPCs reserve_material / release_reservation (SECURITY DEFINER).
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Loader2, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const ACTOR_KEY = "conplus_store_approver";

interface Position {
  id: string;
  name: string;
  item_code: string | null;
  unit: string | null;
  storage_location: string | null;
  physical_qty: number;
  reserved_qty: number;
  available_qty: number;
  active_reservations: number;
}

interface Reservation {
  id: string;
  material_id: string;
  material_name: string;
  unit: string | null;
  project_code: string;
  project_name: string | null;
  project_site: string | null;
  wo_number: string | null;
  allocated_qty: number;
  used_qty: number;
  remaining_qty: number;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface ProjectRef {
  project_code: string;
  name: string | null;
}

interface RpcResult {
  ok: boolean;
  error?: string;
  reserved?: number;
  shortfall?: number;
  released?: number;
  material?: string;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ""));
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-SG", { day: "numeric", month: "short" });

export default function ReservationsPage() {
  const [actor, setActor] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTOR_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);

  const [search, setSearch] = useState("");
  const [onlyReserved, setOnlyReserved] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");

  // reserve form
  const [pick, setPick] = useState<Position | null>(null);
  const [fProject, setFProject] = useState("");
  const [fQty, setFQty] = useState("");
  const [fWo, setFWo] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);

  const setActingActor = (v: string) => {
    setActor(v);
    try {
      localStorage.setItem(ACTOR_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [pos, res, prj] = await Promise.all([
      supabase.from("material_stock_position").select("*").order("name"),
      supabase.from("project_reservations").select("*").eq("status", "active").order("created_at", { ascending: false }),
      supabase.from("projects").select("project_code,name").eq("status", "active").order("project_code", { ascending: false }),
    ]);
    if (pos.error) toast.error(pos.error.message);
    if (res.error) toast.error(res.error.message);
    setPositions(
      ((pos.data ?? []) as Position[]).map((p) => ({
        ...p,
        physical_qty: n(p.physical_qty),
        reserved_qty: n(p.reserved_qty),
        available_qty: n(p.available_qty),
        active_reservations: n(p.active_reservations),
      })),
    );
    setReservations(
      ((res.data ?? []) as Reservation[]).map((r) => ({
        ...r,
        allocated_qty: n(r.allocated_qty),
        used_qty: n(r.used_qty),
        remaining_qty: n(r.remaining_qty),
      })),
    );
    setProjects((prj.data ?? []) as ProjectRef[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return positions.filter((p) => {
      if (onlyReserved && p.reserved_qty <= 0) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.item_code ?? "").toLowerCase().includes(q);
    });
  }, [positions, search, onlyReserved]);

  const byProject = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of reservations) {
      if (projectFilter && r.project_code !== projectFilter) continue;
      m.set(r.project_code, [...(m.get(r.project_code) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [reservations, projectFilter]);

  const totals = useMemo(
    () => ({
      reservedLines: reservations.length,
      projects: new Set(reservations.map((r) => r.project_code)).size,
      materialsReserved: positions.filter((p) => p.reserved_qty > 0).length,
      short: positions.filter((p) => p.available_qty < 0).length,
    }),
    [reservations, positions],
  );

  const openReserve = (p: Position) => {
    setPick(p);
    setFQty("");
    setFWo("");
    setFNotes("");
  };

  const reserve = async () => {
    if (!pick) return;
    const q = Number(fQty);
    if (!q || q <= 0) {
      toast.error("Enter a quantity greater than 0.");
      return;
    }
    if (!fProject) {
      toast.error("Choose a project.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("reserve_material", {
      p_material_id: pick.id,
      p_project_code: fProject,
      p_qty: q,
      p_wo_number: fWo.trim() || null,
      p_notes: fNotes.trim() || null,
      p_actor: actor.trim() || null,
      p_allow_partial: true,
    });
    setSaving(false);
    const res = data as RpcResult | null;
    if (error || !res?.ok) {
      toast.error(res?.error || error?.message || "Could not reserve.");
      return;
    }
    if ((res.shortfall ?? 0) > 0) {
      toast.warning(`Reserved ${fmt(res.reserved ?? 0)} of ${fmt(q)} for ${fProject}`, {
        description: `${fmt(res.shortfall ?? 0)} short — balance to purchase.`,
      });
    } else {
      toast.success(`Reserved ${fmt(res.reserved ?? 0)} ${pick.unit ?? ""} of ${res.material} for ${fProject}`);
    }
    setPick(null);
    await load();
  };

  const release = async (r: Reservation) => {
    setReleasing(r.id);
    const { data, error } = await supabase.rpc("release_reservation", {
      p_reservation_id: r.id,
      p_actor: actor.trim() || null,
      p_qty: null,
    });
    setReleasing(null);
    const res = data as RpcResult | null;
    if (error || !res?.ok) {
      toast.error(res?.error || error?.message || "Could not release.");
      return;
    }
    toast.success(`Released ${fmt(res.released ?? 0)} of ${r.material_name} from ${r.project_code}`);
    await load();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bookmark className="h-5 w-5" />
          </div>
          <div className="mr-auto leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">Reservations</h1>
            <p className="text-xs text-muted-foreground">Available vs reserved stock per project</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Your name
            <input
              value={actor}
              onChange={(e) => setActingActor(e.target.value)}
              placeholder="your name"
              className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active reservations" value={totals.reservedLines} />
          <Stat label="Projects holding stock" value={totals.projects} />
          <Stat label="Materials reserved" value={totals.materialsReserved} />
          <Stat label="Over-reserved" value={totals.short} tone={totals.short ? "bad" : "muted"} />
        </section>

        {/* Stock position */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-semibold text-foreground">Stock position</h2>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={onlyReserved} onChange={(e) => setOnlyReserved(e.target.checked)} className="h-3.5 w-3.5 rounded border-input" />
              only reserved
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search material…"
                className="w-56 rounded-lg border border-input bg-card py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">In store</th>
                  <th className="px-3 py-2 text-right">Reserved</th>
                  <th className="px-3 py-2 text-right">Available</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && positions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No materials match.
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 200).map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.item_code}
                          {p.storage_location ? ` · ${p.storage_location}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmt(p.physical_qty)} {p.unit}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", p.reserved_qty > 0 ? "font-medium text-warning" : "text-muted-foreground")}>
                        {fmt(p.reserved_qty)}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", p.available_qty < 0 ? "text-destructive" : p.available_qty === 0 ? "text-muted-foreground" : "text-success")}>
                        {fmt(p.available_qty)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => openReserve(p)}
                          disabled={p.available_qty <= 0}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reserve
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {filtered.length > 200 && <p className="px-3 py-2 text-xs text-muted-foreground">Showing 200 of {filtered.length}. Narrow the search.</p>}
          </div>
        </section>

        {/* Reservations by project */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-sm font-semibold text-foreground">Reserved by project</h2>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">all projects</option>
              {[...new Set(reservations.map((r) => r.project_code))].sort().map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {byProject.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing reserved{projectFilter ? ` for ${projectFilter}` : ""}. Use Reserve on a material above, or tick “Reserve stock” when creating a Works Order.
            </div>
          ) : (
            byProject.map(([code, rows]) => (
              <div key={code} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between bg-secondary/40 px-3 py-2">
                  <div>
                    <span className="font-semibold text-foreground">{code}</span>
                    {rows[0].project_name && <span className="ml-2 text-xs text-muted-foreground">{rows[0].project_name}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {rows.length} line{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{r.material_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.wo_number ? `WO ${r.wo_number} · ` : ""}
                            {fmtDate(r.created_at)}
                            {r.created_by ? ` · ${r.created_by}` : ""}
                            {r.notes ? ` · ${r.notes}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {fmt(r.used_qty)} issued of {fmt(r.allocated_qty)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-warning">
                          {fmt(r.remaining_qty)} {r.unit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => void release(r)}
                            disabled={releasing === r.id}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
                          >
                            {releasing === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Release"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </section>
      </main>

      {pick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPick(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading font-semibold text-card-foreground">Reserve · {pick.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmt(pick.available_qty)} {pick.unit} available of {fmt(pick.physical_qty)} in store
                </p>
              </div>
              <button onClick={() => setPick(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Project *</span>
                <select
                  value={fProject}
                  onChange={(e) => setFProject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">choose…</option>
                  {projects.map((p) => (
                    <option key={p.project_code} value={p.project_code}>
                      {p.project_code}
                      {p.name ? ` — ${p.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className="text-xs font-medium text-muted-foreground">Quantity *</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    autoFocus
                    value={fQty}
                    onChange={(e) => setFQty(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="block flex-1">
                  <span className="text-xs font-medium text-muted-foreground">WO number</span>
                  <input
                    value={fWo}
                    onChange={(e) => setFWo(e.target.value)}
                    placeholder="optional"
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Notes</span>
                <input
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  placeholder="optional"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              {Number(fQty) > pick.available_qty && (
                <p className="text-xs text-warning">
                  Only {fmt(pick.available_qty)} available. The rest ({fmt(Number(fQty) - pick.available_qty)}) is reported as balance to purchase.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPick(null)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
                Cancel
              </button>
              <button
                onClick={() => void reserve()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Reserve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "bad" | "muted" }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2", tone === "bad" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground")}>
      <div className="text-2xl font-bold tabular-nums leading-tight text-foreground">{value}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  );
}
