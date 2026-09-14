/*
  Stock Import — /store/import

  Drop the client's Material_Inventory_Record workbook (Sheet2) on the page and
  it is reconciled against material_movements by S/No.:

    parse (ExcelJS, in the browser)
      → resolve every material name against `materials` (materialMatch)
      → diff against rows already imported (source = inventory_record_sheet2)
      → preview: new / changed (field by field) / unchanged / needs material
      → Apply → RPC import_inventory_rows(p_rows, p_actor, p_create_missing)

  Single write path is the RPC (SECURITY DEFINER, one transaction). The AFTER
  trigger on material_movements recomputes materials.qty_on_hand, so the Store
  Health and Stock Watchlist views pick the new balances up immediately.

  Rows logged through the Store form (source = store_form) are NOT in the
  workbook and are left untouched; the page says how many exist so the person
  importing knows the sheet is not the only source of truth.
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
  planInventoryImport,
  rpcRowsForPlan,
  type ExistingMovement,
  type ImportPlan,
  type PlannedRow,
  type RawCell,
  type SheetRow,
} from "@/lib/inventoryImport";

const ACTOR_KEY = "conplus_import_actor";
const SHEET_COLS = 17;

interface MaterialRef {
  id: string;
  name: string;
  code: string | null;
}

interface ImportResult {
  ok: boolean;
  inserted: number;
  updated: number;
  created_materials: number;
  created_material_names: string[];
  materials_touched: number;
}

const FIELD_LABEL: Record<keyof SheetRow, string> = {
  sno: "S/No.",
  supplier: "Supplier",
  location: "Location",
  material: "Material",
  expiryDate: "Expiry",
  shelfLife: "Shelf life",
  packing: "Packing",
  uom: "UOM",
  coatingType: "Coating",
  qtyIn: "Qty IN",
  dateIn: "Date IN",
  projectIn: "Project IN",
  remarksIn: "Remarks IN",
  qtyOut: "Qty OUT",
  dateOut: "Date OUT",
  projectOut: "Project OUT",
  remarksOut: "Remarks OUT",
};

const show = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : String(v));

/** Read a worksheet into the plain cell matrix the parser expects. */
function sheetToCells(ws: ExcelJS.Worksheet): RawCell[][] {
  const out: RawCell[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: RawCell[] = [];
    for (let c = 1; c <= SHEET_COLS; c++) cells.push(row.getCell(c).value as RawCell);
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
  const [parseError, setParseError] = useState<string | null>(null);

  const [materials, setMaterials] = useState<MaterialRef[]>([]);
  const [existing, setExisting] = useState<ExistingMovement[]>([]);
  const [storeFormCount, setStoreFormCount] = useState(0);
  const [createMissing, setCreateMissing] = useState(true);
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
      supabase.from("materials").select("id,name,item_code").order("name"),
      supabase
        .from("material_movements")
        .select(
          "id,sno,material_id,supplier_name,location,packing,uom,expiry_date,coating_type,shelf_life,qty_in,date_in,project_in,remarks_in,qty_out,date_out,project_out,remarks_out",
        )
        .eq("source", INVENTORY_SOURCE)
        .order("sno"),
      supabase.from("material_movements").select("id", { count: "exact", head: true }).eq("source", "store_form"),
    ]);
    if (mats.error) toast.error(`Materials: ${mats.error.message}`);
    if (rows.error) toast.error(`Existing rows: ${rows.error.message}`);
    setMaterials(((mats.data ?? []) as { id: string; name: string; item_code: string | null }[]).map((m) => ({ id: m.id, name: m.name, code: m.item_code })));
    setExisting((rows.data ?? []) as ExistingMovement[]);
    setStoreFormCount(sf.count ?? 0);
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
      let cells = ws ? sheetToCells(ws) : [];
      if (!ws || findHeaderRow(cells) < 0) {
        ws = null;
        for (const cand of wb.worksheets) {
          const c = sheetToCells(cand);
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
      setSheetName(ws.name);
      setLastUpdated(stamp);
      setSheetRows(rows);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }, []);

  const plan: ImportPlan | null = useMemo(() => {
    if (!sheetRows) return null;
    return planInventoryImport(sheetRows, existing, materials);
  }, [sheetRows, existing, materials]);

  const toApply = plan ? rpcRowsForPlan(plan, createMissing) : [];
  const skippedUnmatched = plan && !createMissing ? plan.unmatched.length : 0;
  const canApply = !!plan && toApply.length > 0 && !applying && !loadingDb;

  const apply = async () => {
    if (!plan || toApply.length === 0) return;
    setApplying(true);
    const { data, error } = await supabase.rpc("import_inventory_rows", {
      p_rows: toApply,
      p_actor: actor.trim() || null,
      p_create_missing: createMissing,
    });
    setApplying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as ImportResult;
    setResult(res);
    toast.success(
      `Imported — ${res.inserted} new, ${res.updated} updated` +
        (res.created_materials ? `, ${res.created_materials} material${res.created_materials === 1 ? "" : "s"} created` : ""),
    );
    await loadDb(); // re-diff: everything should now read as unchanged
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

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
            title="Reload materials and existing rows"
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
              Drag &amp; drop the Material_Inventory_Record workbook here, or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reads Sheet2 (S/No. · Material · Quantity_IN · Quantity_OUT …). Nothing is written until you press Apply.
            </p>
          </div>

          {fileName && !parseError && sheetRows && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{fileName}</span> · sheet “{sheetName}”
              </span>
              <span>{sheetRows.length} numbered rows</span>
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
              <Stat label="New rows" value={plan.inserts.length} tone={plan.inserts.length ? "good" : "muted"} />
              <Stat label="Changed" value={plan.updates.length} tone={plan.updates.length ? "warn" : "muted"} />
              <Stat label="Unchanged" value={plan.unchanged.length} tone="muted" />
              <Stat label="Needs material" value={plan.unmatched.length} tone={plan.unmatched.length ? "bad" : "muted"} />
              <Stat label="Blank rows" value={plan.blank} tone="muted" />
            </section>

            {storeFormCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {storeFormCount} movement{storeFormCount === 1 ? "" : "s"} logged through the Store form are not in the workbook and stay as they are. Balances = workbook rows + Store form rows.
              </p>
            )}

            {plan.unmatched.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Rows whose material is not in the system</h2>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} className="h-4 w-4 rounded border-input" />
                  Create {plan.unmatched.length} missing material{plan.unmatched.length === 1 ? "" : "s"} as new stock items (name, supplier, location, UOM taken from the sheet)
                </label>
                <RowTable
                  rows={plan.unmatched}
                  extra={(p) =>
                    p.candidates && p.candidates.length > 0 ? (
                      <span className="text-xs text-muted-foreground">Similar: {p.candidates.join(" · ")}</span>
                    ) : null
                  }
                />
              </section>
            )}

            {plan.inserts.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">New rows</h2>
                <RowTable rows={plan.inserts} />
              </section>
            )}

            {plan.updates.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Changed rows</h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">S/No.</th>
                        <th className="px-3 py-2">Material</th>
                        <th className="px-3 py-2">Changes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.updates.map((p) => (
                        <tr key={p.row.sno} className="border-t border-border align-top">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.row.sno}</td>
                          <td className="px-3 py-2 font-medium text-foreground">{p.materialName}</td>
                          <td className="px-3 py-2">
                            <ul className="space-y-0.5">
                              {p.changes?.map((c) => (
                                <li key={c.field} className="text-xs">
                                  <span className="text-muted-foreground">{FIELD_LABEL[c.field]}:</span>{" "}
                                  <span className="line-through text-muted-foreground/70">{show(c.before)}</span>{" "}
                                  <span className="font-medium text-foreground">{show(c.after)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {plan.inserts.length === 0 && plan.updates.length === 0 && plan.unmatched.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                The ledger already matches this workbook. Nothing to import.
              </div>
            )}

            {/* Step 3 — apply */}
            <section className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
                <div className="mr-auto text-xs text-muted-foreground">
                  {toApply.length > 0
                    ? `${toApply.length} row${toApply.length === 1 ? "" : "s"} will be written in one transaction`
                    : "Nothing to write"}
                  {skippedUnmatched > 0 && ` · ${skippedUnmatched} unmatched row${skippedUnmatched === 1 ? "" : "s"} will be skipped`}
                </div>
                <button
                  onClick={() => void apply()}
                  disabled={!canApply}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Apply to store ledger
                </button>
              </div>
            </section>
          </>
        )}

        {result && (
          <section className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Import complete</p>
            <p className="text-muted-foreground">
              {result.inserted} new · {result.updated} updated · {result.materials_touched} material balance{result.materials_touched === 1 ? "" : "s"} recomputed
              {result.created_materials > 0 && ` · created: ${result.created_material_names.join(", ")}`}
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

function RowTable({ rows, extra }: { rows: PlannedRow[]; extra?: (p: PlannedRow) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">S/No.</th>
            <th className="px-3 py-2">Material</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2 text-right">IN</th>
            <th className="px-3 py-2 text-right">OUT</th>
            <th className="px-3 py-2">Project</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.row.sno} className="border-t border-border align-top">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.row.sno}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{p.materialName || show(p.row.material)}</div>
                {extra?.(p)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{show(p.row.supplier)}</td>
              <td className="px-3 py-2 text-muted-foreground">{show(p.row.location)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{show(p.row.qtyIn)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{show(p.row.qtyOut)}</td>
              <td className="px-3 py-2 text-muted-foreground">{show(p.row.projectOut ?? p.row.projectIn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
