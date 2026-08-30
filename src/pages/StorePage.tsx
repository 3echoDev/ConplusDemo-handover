import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  Check,
  Loader2,
  Undo2,
  Package,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/*
  ConPlus — Store / Material Movement log (mobile-first)
  ------------------------------------------------------
  Vincent / Halal log stock in & out from the loading bay. The single write
  path is the SECURITY DEFINER RPC `log_material_movement`, which validates
  everything itself (unknown material, bad qty, unknown project ref) and
  returns the new balance. The trigger recomputes materials.qty_on_hand.

  Project refs are validated server-side against real project codes, so the
  UI uses a dropdown (Store / Sample / active project codes) — never free text.
*/

const RECENTS_KEY = "conplus_store_recent_materials";
const RECENTS_MAX = 10;

interface Material {
  id: string;
  item_code: string;
  name: string;
  unit: string;
  qty_on_hand: number;
}

interface ProjectOption {
  project_code: string;
  name: string;
}

interface MovementRow {
  id: string;
  sno: number;
  material_id: string;
  direction: "in" | "out";
  qty: number;
  project_ref: string;
  remarks: string | null;
  doc_ref: string | null;
  created_at: string;
}

interface RpcResult {
  ok: boolean;
  movement_id?: string;
  sno?: number;
  material?: string;
  direction?: "in" | "out";
  qty?: number;
  new_balance?: number;
  error?: string;
}

// Store + Sample are fixed non-project destinations, pinned above the project list.
const FIXED_REFS = ["Store", "Sample"];

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit", hour12: true });
};

const startOfTodayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string): string[] {
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
  return next;
}

export default function StorePage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [material, setMaterial] = useState<Material | null>(null);
  const [matSearch, setMatSearch] = useState("");
  const [matOpen, setMatOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [projOpen, setProjOpen] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [docRef, setDocRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [recents, setRecents] = useState<string[]>([]);
  const [today, setToday] = useState<MovementRow[]>([]);
  const [reversing, setReversing] = useState<string | null>(null);

  const matSearchRef = useRef<HTMLInputElement>(null);

  const materialById = useMemo(() => {
    const m = new Map<string, Material>();
    materials.forEach((x) => m.set(x.id, x));
    return m;
  }, [materials]);

  const loadMaterials = useCallback(async () => {
    const { data } = await supabase
      .from("materials")
      .select("id,item_code,name,unit,qty_on_hand")
      .eq("is_active", true)
      .order("name");
    setMaterials((data as Material[]) ?? []);
  }, []);

  const loadToday = useCallback(async () => {
    const { data } = await supabase
      .from("material_movements")
      .select("id,sno,material_id,direction,qty,project_ref,remarks,doc_ref,created_at")
      .eq("source", "store_form")
      .gte("created_at", startOfTodayISO())
      .order("created_at", { ascending: false });
    setToday((data as MovementRow[]) ?? []);
  }, []);

  useEffect(() => {
    setRecents(loadRecents());
    (async () => {
      const { data: proj } = await supabase
        .from("projects")
        .select("project_code,name")
        .eq("status", "active")
        .order("project_code");
      setProjects((proj as ProjectOption[]) ?? []);
      await Promise.all([loadMaterials(), loadToday()]);
      setLoading(false);
    })();
  }, [loadMaterials, loadToday]);

  const filteredMaterials = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    const base = q
      ? materials.filter(
          (m) => m.name.toLowerCase().includes(q) || m.item_code.toLowerCase().includes(q),
        )
      : materials;
    return base.slice(0, 30);
  }, [materials, matSearch]);

  const recentMaterials = useMemo(
    () => recents.map((id) => materialById.get(id)).filter((m): m is Material => !!m),
    [recents, materialById],
  );

  const projectChoices = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    const fixed = FIXED_REFS.map((code) => ({ project_code: code, name: "", fixed: true }));
    const list = [...fixed, ...projects.map((p) => ({ ...p, fixed: false }))];
    if (!q) return list;
    return list.filter(
      (p) => p.project_code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [projects, projSearch]);

  const selectMaterial = (m: Material) => {
    setMaterial(m);
    setMatOpen(false);
    setMatSearch("");
  };

  const resetForm = (keepDirection: "in" | "out") => {
    setMaterial(null);
    setMatSearch("");
    setQty("");
    setProjectRef("");
    setDocRef("");
    setRemarks("");
    setDirection(keepDirection);
    // focus material search for the next rapid entry
    setTimeout(() => matSearchRef.current?.focus(), 50);
  };

  const submit = async () => {
    if (!material) {
      toast.error("Pick a material first.");
      return;
    }
    const q = Number(qty);
    if (!q || q <= 0 || isNaN(q)) {
      toast.error("Enter a quantity greater than 0.");
      return;
    }
    if (!projectRef) {
      toast.error("Choose a project (or Store / Sample).");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("log_material_movement", {
      p_material_id: material.id,
      p_direction: direction,
      p_qty: q,
      p_project_ref: projectRef,
      p_remarks: remarks.trim() || null,
      p_doc_ref: docRef.trim() || null,
    });
    setSubmitting(false);

    const res = data as RpcResult | null;
    if (error || !res?.ok) {
      toast.error(res?.error || error?.message || "Could not log the movement.");
      return;
    }

    setRecents(pushRecent(material.id));
    const dirWord = res.direction === "in" ? "in" : "out";
    toast.success(`${res.material} — now ${res.new_balance} in store`, {
      description: `Logged ${res.qty} ${dirWord} · #${res.sno}`,
    });
    resetForm(direction);
    await Promise.all([loadMaterials(), loadToday()]);
  };

  const reverse = async (row: MovementRow) => {
    setReversing(row.id);
    const { data, error } = await supabase.rpc("log_material_movement", {
      p_material_id: row.material_id,
      p_direction: row.direction === "in" ? "out" : "in",
      p_qty: row.qty,
      p_project_ref: row.project_ref,
      p_remarks: `Reversal of #${row.sno}`,
      p_doc_ref: null,
    });
    setReversing(null);

    const res = data as RpcResult | null;
    if (error || !res?.ok) {
      toast.error(res?.error || error?.message || "Could not reverse.");
      return;
    }
    toast.success(`Reversed #${row.sno}`, {
      description: `${res.material} — now ${res.new_balance} in store`,
    });
    await Promise.all([loadMaterials(), loadToday()]);
  };

  const projectLabel = (ref: string) => {
    if (!ref) return "Choose project…";
    if (FIXED_REFS.includes(ref)) return ref;
    const p = projects.find((x) => x.project_code === ref);
    return p ? `${p.project_code} · ${p.name}` : ref;
  };

  const isIn = direction === "in";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">Store — Material Movement</h1>
            <p className="text-xs text-muted-foreground">Log stock in &amp; out</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-5 pb-24">
        {/* Direction */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border-2 py-5 text-lg font-bold transition-colors",
              !isIn
                ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            <ArrowUpCircle className="h-7 w-7" />
            OUT
          </button>
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border-2 py-5 text-lg font-bold transition-colors",
              isIn
                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            <ArrowDownCircle className="h-7 w-7" />
            IN
          </button>
        </div>

        {/* Material */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Material</label>

          {recentMaterials.length > 0 && !material && (
            <div className="flex flex-wrap gap-2">
              {recentMaterials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMaterial(m)}
                  className="rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  {m.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{m.qty_on_hand}</span>
                </button>
              ))}
            </div>
          )}

          {material ? (
            <div className="flex items-center justify-between rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">{material.name}</div>
                <div className="text-xs text-muted-foreground">
                  {material.item_code} · {material.qty_on_hand} {material.unit} in store
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMaterial(null);
                  setTimeout(() => matSearchRef.current?.focus(), 50);
                }}
                className="ml-3 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
                aria-label="Change material"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center rounded-xl border border-border bg-card px-3">
                <Search className="h-5 w-5 text-muted-foreground" />
                <input
                  ref={matSearchRef}
                  value={matSearch}
                  onChange={(e) => {
                    setMatSearch(e.target.value);
                    setMatOpen(true);
                  }}
                  onFocus={() => setMatOpen(true)}
                  placeholder="Search name or item code…"
                  className="w-full bg-transparent px-2 py-3 text-base outline-none placeholder:text-muted-foreground"
                />
              </div>
              {matOpen && filteredMaterials.length > 0 && (
                <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg">
                  {filteredMaterials.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => selectMaterial(m)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{m.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{m.item_code}</span>
                        </span>
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {m.qty_on_hand} {m.unit}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Quantity */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Quantity</label>
          <div className="flex items-center rounded-xl border border-border bg-card px-4">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              className="w-full bg-transparent py-4 text-2xl font-bold outline-none placeholder:text-muted-foreground"
            />
            {material && <span className="pl-3 text-base text-muted-foreground">{material.unit}</span>}
          </div>
        </section>

        {/* Project */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Project</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProjOpen((o) => !o);
                setProjSearch("");
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-4 text-left text-base",
                projectRef ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate">{projectLabel(projectRef)}</span>
              <ArrowUpCircle className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", projOpen ? "rotate-180" : "")} />
            </button>
            {projOpen && (
              <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                <div className="flex items-center border-b border-border px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={projSearch}
                    onChange={(e) => setProjSearch(e.target.value)}
                    placeholder="Search project…"
                    className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <ul className="max-h-72 overflow-auto">
                  {projectChoices.map((p) => (
                    <li key={p.project_code}>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectRef(p.project_code);
                          setProjOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-foreground">{p.project_code}</span>
                          {p.name && <span className="block truncate text-xs text-muted-foreground">{p.name}</span>}
                        </span>
                        {projectRef === p.project_code && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    </li>
                  ))}
                  {projectChoices.length === 0 && (
                    <li className="px-4 py-3 text-sm text-muted-foreground">No match</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* DO/PO ref + Remarks */}
        <section className="grid gap-3">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">
              DO / PO ref <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              value={docRef}
              onChange={(e) => setDocRef(e.target.value)}
              placeholder="e.g. DO-1234"
              className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">
              Remarks <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Anything worth noting"
              className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
        </section>

        {/* Submit */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-60",
            isIn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600",
          )}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : isIn ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
          Log {isIn ? "IN" : "OUT"}
        </button>

        {/* Today's movements */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">Today</h2>
            <span className="text-sm text-muted-foreground">{today.length} logged</span>
          </div>

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">Loading…</div>
          ) : today.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No movements logged yet today.
            </div>
          ) : (
            <ul className="space-y-2">
              {today.map((row) => {
                const m = materialById.get(row.material_id);
                const rowIn = row.direction === "in";
                const isReversal = (row.remarks || "").startsWith("Reversal of #");
                return (
                  <li key={row.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-xs font-bold",
                              rowIn ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {rowIn ? "IN" : "OUT"}
                          </span>
                          <span className="font-semibold text-foreground">{row.qty}</span>
                          <span className="truncate font-medium text-foreground">{m?.name ?? row.material_id}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {fmtTime(row.created_at)} · {row.project_ref}
                          {row.doc_ref ? ` · ${row.doc_ref}` : ""}
                          {row.remarks ? ` · ${row.remarks}` : ""}
                        </div>
                      </div>
                      {!isReversal && (
                        <button
                          type="button"
                          onClick={() => reverse(row)}
                          disabled={reversing === row.id}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:opacity-60"
                        >
                          {reversing === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                          Reverse
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
