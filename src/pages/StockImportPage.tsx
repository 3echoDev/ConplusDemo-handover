/*
  Stock Import — /store/import

  Drop the client's Material_Inventory_Record workbook on the page. Each upload
  is a SNAPSHOT of the store ledger:

    parse Sheet2 + the "Material" master sheet (ExcelJS, in the browser)
      → resolve every material name against `materials` (exact / separator-
        insensitive only — colours like "RAL 7037" are distinct items)
      → preview: balance before → after per material, materials to be created,
        old materials that would be left with no stock rows
      → Apply → RPC replace_inventory_sheet(p_rows, p_actor, p_create_missing,
        p_deactivate_orphans)

  The RPC deletes every ledger row with source = inventory_record_sheet2 and
  inserts the sheet's rows in one transaction; Store-form rows are untouched.
  The AFTER trigger on material_movements recomputes materials.qty_on_hand, so
  Store Health and the Stock Watchlist pick the new balances up immediately.

  Why snapshot and not upsert: the sheet's S/No. is a ROW() formula and
  renumbers whenever a line is inserted or deleted, so it cannot key updates.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  INVENTORY_SOURCE,
  cellText,
  findHeaderRow,
  parseInventorySheet,
  parseMaterialMaster,
  planInventoryImport,
  toRpcRows,
  type ExistingMovement,
  type ImportPlan,
  type MasterEntry,
  type MaterialRef,
  type RawCell,
  type SheetRow,
} from "@/lib/inventoryImport";

const ACTOR_KEY = "conplus_import_actor";
const SHEET_COLS = 17;
const MASTER_COLS = 10;

interface ImportResult {
  ok: boolean;
  deleted: number;
  inserted: number;
  created_materials: number;
  created_material_names: string[];
  deactivated_materials: number;
  deactivated_material_names: string[];
  materials_touched: number;
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/** Read a worksheet into the plain cell matrix the parser expects. */
function sheetToCells(ws: ExcelJS.Worksheet, cols: number): RawCell[][] {
  const out: RawCell[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: RawCell[] = [];
    for (let c = 1; c <= cols; c++) cells.push(row.getCell(c).value as RawCell);
    out.push(cells);
  }
  return out;
}

export default function StockImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [actor, setActor] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTOR_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [loadingDb, setLoadingDb] = useState(true);
  const [applying, setApplying] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sheetRows, setSheetRows] = useState<SheetRow[] | null>(null);
  const [master, setMaster] = useState<Map<string, MasterEntry>>(new Map());
  const [parseError, setParseError] = useState<string | null>(null);

  const [materials, setMaterials] = useState<MaterialRef[]>([]);
  const [existing, setExisting] = useState<ExistingMovement[]>([]);
  const [storeFormIds, setStoreFormIds] = useState<Set<string>>(new Set());
  const [storeFormCount, setStoreFormCount] = useState(0);
  const [createMissing, setCreateMissing] = useState(true);
  const [deactivateOrphans, setDeactivateOrphans] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);

  const setActingActor = (v: string) => {
    setActor(v);
    try {
      localStorage.setItem(ACTOR_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const loadDb = useCallback(async () => {
    setLoadingDb(true);
    const [mats, rows, sf] = await Promise.all([
      supabase.from("materials").select("id,name,item_code,qty_on_hand,is_active").order("name"),
      supabase.from("material_movements").select("id,sno,material_id,qty_in,qty_out").eq("source", INVENTORY_SOURCE),
      supabase.from("material_movements").select("material_id").eq("source", "store_form"),
    ]);
    if (mats.error) toast.error(`Materials: ${mats.error.message}`);
    if (rows.error) toast.error(`Existing rows: ${rows.error.message}`);
    setMaterials(
      ((mats.data ?? []) as { id: string; name: string; item_code: string | null; qty_on_hand: number | string | null; is_active: boolean | null }[]).map(
        (m) => ({ id: m.id, name: m.name, code: m.item_code, qtyOnHand: Number(m.qty_on_hand ?? 0), isActive: m.is_active !== false }),
      ),
    );
    setExisting((rows.data ?? []) as ExistingMovement[]);
    const sfRows = (sf.data ?? []) as { material_id: string | null }[];
    setStoreFormCount(sfRows.length);
    setStoreFormIds(new Set(sfRows.map((r) => r.material_id).filter((x): x is string => !!x)));
    setLoadingDb(false);
  }, []);

  useEffect(() => {
    void loadDb();
  }, [loadDb]);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setParseError(null);
    setResult(null);
    setSheetRows(null);
    setFileName(file.name);
    try {
      if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
        throw new Error("Please drop the .xlsx workbook (the Material_Inventory_Record file), not a CSV or PDF.");
      }
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());

      // Prefer "Sheet2"; otherwise the first sheet that carries the S/No. | … | Material header.
      let ws = wb.getWorksheet("Sheet2") ?? null;
      let cells = ws ? sheetToCells(ws, SHEET_COLS) : [];
      if (!ws || findHeaderRow(cells) < 0) {
        ws = null;
        for (const cand of wb.worksheets) {
          const c = sheetToCells(cand, SHEET_COLS);
          if (findHeaderRow(c) >= 0) {
            ws = cand;
            cells = c;
            break;
          }
        }
      }
      if (!ws) throw new Error('No sheet with the "S/No. … Material … Quantity_IN" header was found in this workbook.');

      const { rows, headerIndex } = parseInventorySheet(cells);
      // "LAST UPDATED DATE:" sits in B2 with the value in D2 on the client's sheet.
      const stamp = cells.slice(0, headerIndex).map((r) => cellText(r[3])).find((v) => v && /\d{4}/.test(v)) ?? null;

      // Optional "Material" master sheet (unit + shelf life per part) for new materials.
      let masterMap = new Map<string, MasterEntry>();
      for (const cand of wb.worksheets) {
        if (cand === ws) continue;
        const m = parseMaterialMaster(sheetToCells(cand, MASTER_COLS));
        if (m.size > masterMap.size) masterMap = m;
      }

      setSheetName(ws.name);
      setLastUpdated(stamp);
      setMaster(masterMap);
      setSheetRows(rows);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }, []);

  const plan: ImportPlan | null = useMemo(() => {
    if (!sheetRows) return null;
    return planInventoryImport(sheetRows, existing, materials, storeFormIds);
  }, [sheetRows, existing, materials, storeFormIds]);

  const rpcRows = plan ? toRpcRows(plan, materials, master) : [];
  const blockedByCreate = !!plan && plan.toCreate.length > 0 && !createMissing;
  const canApply = !!plan && rpcRows.length > 0 && !blockedByCreate && !applying && !loadingDb;
  const noChange = !!plan && plan.balanceChanges.length === 0 && plan.orphans.length === 0 && plan.toCreate.length === 0;

  const apply = async () => {
    if (!plan || rpcRows.length === 0) return;
    setApplying(true);
    const { data, error } = await supabase.rpc("replace_inventory_sheet", {
      p_rows: rpcRows,
      p_actor: actor.trim() || null,
      p_create_missing: createMissing,
      p_deactivate_orphans: deactivateOrphans,
    });
    setApplying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as ImportResult;
    setResult(res);
    toast.success(`Ledger replaced — ${res.inserted} rows, ${res.materials_touched} materials`);
    await loadDb(); // re-plan: a second drop of the same file should read as no change
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const ups = plan?.balanceChanges.filter((b) => b.after > b.before).length ?? 0;
  const downs = plan?.balanceChanges.filter((b) => b.after < b.before).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="mr-auto leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">Stock Import</h1>
            <p className="text-xs text-muted-foreground">Material_Inventory_Record → store ledger</p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Imported by
            <input
              value={actor}
              onChange={(e) => setActingActor(e.target.value)}
              placeholder="your name"
              className="w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            onClick={() => void loadDb()}
            disabled={loadingDb}
            title="Reload materials and current ledger"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingDb && "animate-spin")} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Step 1 — file */}
        <section className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed bg-card p-8 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            {parsing ? (
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm font-medium text-card-foreground">
              Drag &amp; drop the whole Material_Inventory_Record workbook here, or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reads Sheet2 (the stock lines) and the Material sheet (units, shelf life). The pivot is ignored. Nothing is written until you press Apply.
            </p>
          </div>

          {fileName && !parseError && sheetRows && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{fileName}</span> · sheet “{sheetName}”
              </span>
              <span>{sheetRows.length} numbered rows</span>
              {master.size > 0 && <span>{master.size} master entries</span>}
              {lastUpdated && <span>Sheet says last updated {lastUpdated}</span>}
            </div>
          )}
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </section>

        {/* Step 2 — plan */}
        {plan && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Stock rows" value={plan.rows.length} tone="muted" />
              <Stat label="Balances up" value={ups} tone={ups ? "good" : "muted"} />
              <Stat label="Balances down" value={downs} tone={downs ? "warn" : "muted"} />
              <Stat label="New materials" value={plan.toCreate.length} tone={plan.toCreate.length ? "warn" : "muted"} />
              <Stat label="Dropped from sheet" value={plan.orphans.length} tone={plan.orphans.length ? "bad" : "muted"} />
            </section>

            <p className="text-xs text-muted-foreground">
              This upload replaces the {existing.length} ledger rows that came from the previous workbook.
              {storeFormCount > 0 &&
                ` ${storeFormCount} movement${storeFormCount === 1 ? "" : "s"} logged through the Store form stay as they are; balances = workbook rows + Store form rows.`}
              {plan.unchanged > 0 && ` ${plan.unchanged} material${plan.unchanged === 1 ? "" : "s"} keep the same balance.`}
              {plan.blank > 0 && ` ${plan.blank} blank tail row${plan.blank === 1 ? "" : "s"} ignored.`}
            </p>

            {noChange && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                The ledger already matches this workbook. Applying would rewrite the same rows.
              </div>
            )}

            {plan.balanceChanges.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Balance changes</h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Material</th>
                        <th className="px-3 py-2 text-right">Before</th>
                        <th className="px-3 py-2 text-right">After</th>
                        <th className="px-3 py-2 text-right">Change</th>
                        <th className="px-3 py-2 text-right">Sheet rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.balanceChanges.map((b) => {
                        const d = b.after - b.before;
                        return (
                          <tr key={b.materialId ?? `new:${b.name}`} className="border-t border-border">
                            <td className="px-3 py-2">
                              <span className="font-medium text-foreground">{b.name}</span>
                              {b.materialId === null && (
                                <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning">new</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtQty(b.before)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtQty(b.after)}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums font-medium", d > 0 ? "text-success" : "text-destructive")}>
                              {d > 0 ? "+" : ""}
                              {fmtQty(d)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{b.rows}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {plan.toCreate.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Materials not in the system yet</h2>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input" />
                  <span>
                    Create these {plan.toCreate.length} as new stock items, using the sheet's supplier, location and unit
                    {master.size > 0 && " plus unit and shelf life from the Material sheet"}.
                    <span className="block text-xs text-muted-foreground">
                      Names are matched exactly, so a colour variant like “(RAL 7037)” is a separate item from the plain name. Untick to stop and rename in the workbook first.
                    </span>
                  </span>
                </label>
                <NameList names={plan.toCreate} />
              </section>
            )}

            {plan.orphans.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Materials no longer in the sheet</h2>
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={deactivateOrphans} onChange={(e) => setDeactivateOrphans(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input" />
                  <span>
                    Deactivate these {plan.orphans.length} so they leave the watchlist. Their balance becomes 0 either way, because their only stock rows came from the old workbook.
                    <span className="block text-xs text-muted-foreground">They are not deleted. Re-uploading a sheet that names them reactivates them.</span>
                  </span>
                </label>
                <NameList names={plan.orphans.map((o) => `${o.name} (${fmtQty(o.qtyOnHand)})`)} />
              </section>
            )}

            {/* Step 3 — apply */}
            <section className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
                <div className="mr-auto text-xs text-muted-foreground">
                  {blockedByCreate
                    ? "Tick “create” above or rename the unknown materials in the workbook before applying"
                    : `${existing.length} rows out, ${rpcRows.length} rows in, one transaction`}
                </div>
                <button
                  onClick={() => void apply()}
                  disabled={!canApply}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Replace store ledger with this sheet
                </button>
              </div>
            </section>
          </>
        )}

        {result && (
          <section className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Import complete</p>
            <p className="text-muted-foreground">
              {result.deleted} old rows replaced by {result.inserted} · {result.materials_touched} material balance{result.materials_touched === 1 ? "" : "s"} recomputed
              {result.created_materials > 0 && ` · ${result.created_materials} created`}
              {result.deactivated_materials > 0 && ` · ${result.deactivated_materials} deactivated`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Check <a href="/store/health" className="underline">Store Health</a> for the new balances.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "muted" }) {
  const toneCls = {
    good: "border-success/40 text-success",
    warn: "border-warning/40 text-warning",
    bad: "border-destructive/40 text-destructive",
    muted: "border-border text-muted-foreground",
  }[tone];
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2", toneCls)}>
      <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

function NameList({ names }: { names: string[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card px-3 py-2">
      <ul className="columns-1 gap-x-6 text-sm text-foreground sm:columns-2">
        {names.map((n) => (
          <li key={n} className="break-inside-avoid py-0.5">
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}
