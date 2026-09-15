/*
  Project Reference Report — /reports/project-reference

  Client ask (4 Sep 2026): a Project Reference Report filtered on the
  STANDARDIZED TYPE OF WORK column of the "Project Ref - Standardized" tab
  (their project master: every project since 2009, ongoing and completed),
  not from the claims list (current period only).

  Reads: table project_reference (a 1:1 mirror of that tab, 1,014 rows loaded
  15 Sep 2026). Re-upload: drop the Claim Summary workbook on the page → the
  tab is parsed in the browser and the table is replaced through the
  SECURITY DEFINER RPC replace_project_reference (which also back-fills
  projects.work_type_code). Export: styled .xlsx in the client's own report
  layout (S/N | Project Code(s) | Project Name | Client | Scope of Works |
  Contract Value | Total Contract Value incl. VO | Progress | Start | End | Location).
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, RefreshCw, Search, Upload } from "lucide-react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { RawCell } from "@/lib/inventoryImport";
import {
  appOnlyLines,
  consolidate,
  filterReport,
  parseReferenceSheet,
  tokenCounts,
  workTokens,
  type AppProject,
  type ReferenceRow,
  type ReportFilter,
  type ReportLine,
} from "@/lib/projectReference";

const fmtMoney = (n: number) => n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-SG", { month: "short", year: "numeric" }) : "");

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

async function exportReport(lines: ReportLine[], title: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Project References", { views: [{ state: "frozen", ySplit: 5 }] });
  ws.columns = [
    { key: "sn", width: 6 },
    { key: "codes", width: 20 },
    { key: "name", width: 46 },
    { key: "client", width: 32 },
    { key: "scope", width: 60 },
    { key: "cv", width: 18 },
    { key: "tcv", width: 22 },
    { key: "prog", width: 11 },
    { key: "start", width: 12 },
    { key: "end", width: 12 },
    { key: "loc", width: 24 },
    { key: "note", width: 22 },
  ];
  ws.getCell("A1").value = "Conplus Resources Pte Ltd";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = title;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `Consolidated by project (VOs and duplicate entries merged) — ${lines.length} projects · generated ${new Date().toLocaleDateString("en-SG")}`;
  ws.getCell("A3").font = { italic: true, color: { argb: "FF666666" } };
  const hdr = ws.getRow(5);
  hdr.values = ["S/N", "Project Code(s)", "Project Name", "Client", "Scope of Works", "Contract Value (S$)", "Total Contract Value incl. VO (S$)", "Progress (%)", "Start Date", "End Date", "Location", "Note"];
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  hdr.alignment = { vertical: "middle", wrapText: true };
  hdr.height = 30;
  lines.forEach((l, i) => {
    const row = ws.addRow([
      i + 1,
      l.codes.join(", "),
      l.project_name,
      l.client,
      l.scope,
      l.contract_value,
      l.total_contract_value,
      l.progress_pct ?? null,
      l.start_date ? new Date(`${l.start_date}T00:00:00`) : null,
      l.end_date ? new Date(`${l.end_date}T00:00:00`) : null,
      l.location ?? "",
      l.source === "app" ? "In app, not yet in Project Ref master" : "",
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(6).numFmt = "#,##0.00";
    row.getCell(7).numFmt = "#,##0.00";
    row.getCell(9).numFmt = "mmm-yy";
    row.getCell(10).numFmt = "mmm-yy";
    if (i % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } };
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_")}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function ProjectReferencePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReferenceRow[]>([]);
  const [appProjects, setAppProjects] = useState<AppProject[]>([]);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [band, setBand] = useState<"ALL" | "EPOXY" | "MISC">("EPOXY");
  const [tokens, setTokens] = useState<string[]>([]);
  const [salesRep, setSalesRep] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // PostgREST caps a request at 1,000 rows; the master has more, so page through it.
    const PAGE = 1000;
    let data: (ReferenceRow & { imported_at: string })[] = [];
    for (let from = 0; ; from += PAGE) {
      const res = await supabase.from("project_reference").select("*").order("sno", { ascending: true }).range(from, from + PAGE - 1);
      if (res.error) {
        toast.error(res.error.message);
        break;
      }
      const chunk = (res.data ?? []) as (ReferenceRow & { imported_at: string })[];
      data = data.concat(chunk);
      if (chunk.length < PAGE) break;
    }
    const list = data.map((r) => ({
      ...r,
      contract_value: r.contract_value == null ? null : Number(r.contract_value),
      total_claim_value: r.total_claim_value == null ? null : Number(r.total_claim_value),
      balance_work: r.balance_work == null ? null : Number(r.balance_work),
      progress_pct: r.progress_pct == null ? null : Number(r.progress_pct),
    }));
    setRows(list);
    setImportedAt(data[0]?.imported_at ?? null);
    // Projects that live in the app (e.g. set up through LOA intake) but are not in the master yet.
    const prj = await supabase
      .from("projects")
      .select("project_code,name,client_name,contract_value,total_contract_value,vo_value,work_type_code,start_date,end_date,sales_manager,scope,location,status")
      .order("created_at", { ascending: false });
    if (prj.error) toast.error(prj.error.message);
    setAppProjects((prj.data ?? []) as AppProject[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const masterLines = useMemo(() => consolidate(rows), [rows]);
  const appLines = useMemo(() => appOnlyLines(appProjects, masterLines, rows), [appProjects, masterLines, rows]);
  const lines = useMemo(() => [...masterLines, ...appLines], [masterLines, appLines]);
  const allTokens = useMemo(() => tokenCounts(lines), [lines]);
  const reps = useMemo(() => [...new Set(lines.map((l) => l.sales_rep).filter((x): x is string => !!x))].sort(), [lines]);
  const filter: ReportFilter = { band, tokens, salesRep: salesRep || null, yearFrom: yearFrom ? Number(yearFrom) : null, yearTo: yearTo ? Number(yearTo) : null, search };
  const shown = useMemo(() => filterReport(lines, filter).sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.key.localeCompare(b.key)), [lines, band, tokens, salesRep, yearFrom, yearTo, search]);
  const totalValue = shown.reduce((s, l) => s + l.total_contract_value, 0);

  const title = `Project Reference List — ${band === "EPOXY" ? "Epoxy Coating / Flooring Works" : band === "MISC" ? "MISC Works" : "All Works"}${tokens.length ? ` (${tokens.join(" + ")})` : ""}${salesRep ? ` — ${salesRep}` : ""}`;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw new Error("Drop the Claim Summary workbook (.xlsx).");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      let parsed: { rows: ReferenceRow[] } | null = null;
      let sheetName = "";
      for (const ws of wb.worksheets) {
        try {
          const p = parseReferenceSheet(sheetToCells(ws, 18));
          if (p.rows.length > 0) {
            parsed = p;
            sheetName = ws.name;
            break;
          }
        } catch {
          /* not this sheet */
        }
      }
      if (!parsed) throw new Error('No sheet with the "Project Code … STANDARDIZED TYPE OF WORK" header found. Drop the Claim Summary workbook.');
      const { data, error } = await supabase.rpc("replace_project_reference", { p_rows: parsed.rows, p_actor: null });
      if (error) throw new Error(error.message);
      const res = data as { inserted: number; deleted: number; projects_backfilled: number };
      toast.success(`Project master replaced from “${sheetName}” — ${res.inserted} rows (was ${res.deleted}); ${res.projects_backfilled} projects got a type-of-work code`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const toggleToken = (t: string) => setTokens((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="mr-auto leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">Project Reference Report</h1>
            <p className="text-xs text-muted-foreground">
              From the Project Ref – Standardized master · {rows.length} entries · {masterLines.length} projects
              {appLines.length > 0 ? ` · +${appLines.length} from the app not yet in the master` : ""}
              {importedAt ? ` · loaded ${new Date(importedAt).toLocaleDateString("en-SG")}` : ""}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50", dragOver ? "border-primary bg-primary/5" : "border-border text-muted-foreground")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            title="Drop or pick the Claim Summary workbook to replace the master"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Update master
          </button>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <button
            onClick={async () => {
              setExporting(true);
              try {
                await exportReport(shown, title);
              } finally {
                setExporting(false);
              }
            }}
            disabled={shown.length === 0 || exporting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Excel ({shown.length})
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        {/* Filters */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-border">
              {(["EPOXY", "MISC", "ALL"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBand(b)}
                  className={cn("px-3 py-1.5 text-xs font-semibold", band === b ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary")}
                >
                  {b === "EPOXY" ? "Epoxy works" : b === "MISC" ? "MISC works" : "All"}
                </button>
              ))}
            </div>
            <select value={salesRep} onChange={(e) => setSalesRep(e.target.value)} className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
              <option value="">all sales reps</option>
              {reps.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              start year
              <input value={yearFrom} onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="from" className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
              <input value={yearTo} onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="to" className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
            </label>
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="code, site, client, scope…" className="w-64 rounded-lg border border-input bg-background py-1.5 pl-8 pr-3 text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTokens.map(({ token, count }) => (
              <button
                key={token}
                onClick={() => toggleToken(token)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                  tokens.includes(token) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {token} <span className="opacity-60">{count}</span>
              </button>
            ))}
            {tokens.length > 0 && (
              <button onClick={() => setTokens([])} className="rounded-full px-2.5 py-1 text-[11px] text-muted-foreground underline">
                clear
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{shown.length}</strong> projects · total contract value incl. VO{" "}
            <strong className="text-foreground">${fmtMoney(totalValue)}</strong>. Epoxy works = any entry whose type of work includes EPOXY; MISC = everything else. Pick type chips to narrow further (all chosen must apply).
            {appLines.length > 0 && (
              <>
                {" "}Projects created in the app that are not in the master yet are included and marked <span className="rounded bg-warning/15 px-1 text-[10px] font-semibold uppercase text-warning">app</span>; their type of work comes from the code assigned in the app, so some show under All only until a code is set.
              </>
            )}
          </p>
        </section>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Project code(s)</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Type of work</th>
                <th className="px-3 py-2 text-right">Contract</th>
                <th className="px-3 py-2 text-right">Incl. VO</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">Rep</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No projects match. {rows.length === 0 ? "Load the master with “Update master”." : ""}
                  </td>
                </tr>
              ) : (
                shown.slice(0, 500).map((l, i) => (
                  <tr key={l.key} className="border-t border-border align-top">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {l.codes.join(", ") || "—"}
                      {l.source === "app" && (
                        <span className="ml-1.5 rounded bg-warning/15 px-1 py-0.5 text-[10px] font-semibold uppercase text-warning" title="Exists in the app but not in the Project Ref master yet">app</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-foreground">{l.project_name}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground" title={l.scope}>
                        {l.scope}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.client}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {workTokens(l.type_of_work).map((t) => (
                          <span key={t} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", t.includes("EPOXY") ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(l.contract_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmtMoney(l.total_contract_value)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(l.start_date)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.sales_rep ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {shown.length > 500 && <p className="px-3 py-2 text-xs text-muted-foreground">Showing 500 of {shown.length}. The export includes all of them.</p>}
        </div>
      </main>
    </div>
  );
}
