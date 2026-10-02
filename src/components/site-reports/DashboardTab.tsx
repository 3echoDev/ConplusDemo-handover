// Dashboard Report: the per-project sheet Lynn fills by hand from the chat
// groups today — WEEKLY PLAN beside DAILY MATERIAL REPORT (PLANNED) and
// (ACTUAL), plus the material planned-vs-used totals. Built from the weekly
// plan and the daily reports; exports to Excel in the same layout.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, FileText, Layers, Loader2, Ruler } from "lucide-react";
import { notify as toast } from "./notify";
import { cn } from "@/lib/utils";
import {
  addDays,
  buildDashboardRows,
  dashboardTotals,
  fmtDay,
  isoDate,
  materialVariance,
  parseIso,
  weekStart,
  type DashboardRow,
} from "@/lib/siteReports";
import { fetchReports, fetchWeeklyPlan } from "@/lib/siteReportsApi";
import type { SiteProject } from "./pickers";
import { Button, Pill, SectionCard, TextInput } from "./primitives";

type Preset = "this-week" | "last-week" | "this-month" | "custom";

const area = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("en-SG", { maximumFractionDigits: 2 }));
const sets = (v: number | null | undefined) => (v == null ? "" : `${Number(v.toFixed(3))} sets`);

function rangeFor(p: Preset, today: string): [string, string] {
  const mon = weekStart(today);
  if (p === "last-week") return [addDays(mon, -7), addDays(mon, -1)];
  if (p === "this-month") {
    const d = parseIso(today);
    return [isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  return [mon, addDays(mon, 6)];
}

export default function DashboardTab({
  project,
  lastWo,
  refreshKey,
  onOpenDay,
}: {
  project: SiteProject;
  lastWo: string;
  refreshKey: number;
  onOpenDay: (date: string) => void;
}) {
  const today = isoDate(new Date());
  const [preset, setPreset] = useState<Preset>("this-week");
  const [[from, to], setRange] = useState<[string, string]>(() => rangeFor("this-week", today));
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [variance, setVariance] = useState<ReturnType<typeof materialVariance>>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [plan, reports] = await Promise.all([fetchWeeklyPlan(project.id, from, to), fetchReports(project.id, from, to)]);
    setRows(buildDashboardRows(plan, reports, from, to));
    setVariance(materialVariance(reports, from, to));
    setLoading(false);
  }, [project.id, from, to]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const totals = useMemo(() => dashboardTotals(rows, today), [rows, today]);
  const byDate = useMemo(() => {
    const m = new Map<string, DashboardRow[]>();
    for (const r of rows) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    return [...m.entries()];
  }, [rows]);

  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(rangeFor(p, today));
  };

  const clientSite = [project.client_name, project.name].filter(Boolean).join(" / ");
  const pctDone = totals.plannedArea > 0 ? Math.round((totals.actualArea / totals.plannedArea) * 100) : null;

  const onExport = async () => {
    setExporting(true);
    try {
      const { exportDashboardToExcel } = await import("@/lib/siteReportExcel");
      await exportDashboardToExcel(rows, { clientSite, projectRef: project.project_code, wo: lastWo, from, to });
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
    setExporting(false);
  };

  return (
    <div className="space-y-5">
      {/* Sheet header block: CLIENT / SITE · PROJECT REF · WO */}
      <section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-sm sm:grid-cols-[2fr_1fr_1fr]">
        {[
          ["Client / site", clientSite || "—"],
          ["Project ref", project.project_code],
          ["WO", lastWo || "No works order on file"],
        ].map(([k, v]) => (
          <div key={k} className="bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className={cn("mt-0.5 text-sm font-semibold text-foreground sm:truncate", k === "WO" && !lastWo && "font-normal text-muted-foreground")} title={v}>
              {v}
            </p>
          </div>
        ))}
      </section>

      {/* Range */}
      <div className="flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Date range" className="grid w-full grid-cols-2 gap-0.5 rounded-xl border border-border bg-secondary/60 p-1 min-[480px]:grid-cols-4 sm:flex sm:w-auto">
          {(
            [
              ["this-week", "This week"],
              ["last-week", "Last week"],
              ["this-month", "This month"],
              ["custom", "Custom"],
            ] as [Preset, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preset === p}
              onClick={() => pick(p)}
              className={cn(
                "h-10 cursor-pointer whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors duration-150 sm:h-9",
                preset === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
            <label className="sr-only" htmlFor="dash-from">From</label>
            <TextInput id="dash-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} className="h-11 min-w-0 px-2 tabular-nums sm:h-10 sm:w-[10.5rem] sm:px-3" />
            <span className="text-muted-foreground" aria-hidden>–</span>
            <label className="sr-only" htmlFor="dash-to">To</label>
            <TextInput id="dash-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} className="h-11 min-w-0 px-2 tabular-nums sm:h-10 sm:w-[10.5rem] sm:px-3" />
          </div>
        )}
        <p className="pb-2 text-xs tabular-nums text-muted-foreground">
          {fmtDay(from)} – {fmtDay(to)}
        </p>
        <Button variant="secondary" className="ml-auto" onClick={onExport} disabled={exporting || loading || rows.length === 0}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Excel
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Ruler} label="Planned area" value={`${area(totals.plannedArea) || "0"} m²`} loading={loading} />
        <StatTile
          icon={Layers}
          label="Actual area"
          value={`${area(totals.actualArea) || "0"} m²`}
          note={pctDone == null ? "Nothing planned in range" : `${pctDone}% of planned`}
          loading={loading}
        />
        <StatTile
          icon={totals.planOnlyPast ? AlertTriangle : CheckCircle2}
          label="Planned days with no report"
          value={String(totals.planOnlyPast)}
          note={totals.planOnlyPast ? "Past plan rows nobody reported on" : "Every past plan row has a report"}
          status={totals.planOnlyPast ? "warning" : "good"}
          loading={loading}
        />
        <StatTile
          icon={FileText}
          label="Reports still in draft"
          value={String(totals.drafts)}
          note={totals.drafts ? "Saved, not submitted yet" : "All reports submitted"}
          status={totals.drafts ? "warning" : "good"}
          loading={loading}
        />
      </div>

      {/* The Dashboard Report */}
      <SectionCard title="Dashboard report" description="Weekly plan beside the day's planned and actual material, one row per date and location.">
        {loading ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/60" />
            <p className="font-medium text-foreground">Nothing planned or reported for {fmtDay(from)} – {fmtDay(to)}</p>
            <p className="text-sm text-muted-foreground">Add the week's rows on the Weekly plan tab, or file a daily report.</p>
          </div>
        ) : (
          <>
            {/* phones: one card per date */}
            <div className="space-y-4 md:hidden">
              {byDate.map(([date, list]) => (
                <div key={date} className="space-y-2">
                  <h3 className="text-sm font-semibold tabular-nums text-foreground">{fmtDay(date)}</h3>
                  {list.map((r, i) => (
                    <MobileRow key={i} row={r} today={today} onOpen={() => onOpenDay(r.date)} />
                  ))}
                </div>
              ))}
            </div>

            {/* tablet and up: the sheet */}
            <div className="hidden max-h-[70vh] overflow-auto rounded-xl border border-border md:block">
              <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th rowSpan={2} scope="col" className="sticky left-0 z-20 border-b border-r border-border bg-card px-3 py-2 text-left align-bottom text-xs font-semibold text-muted-foreground">
                      Date
                    </th>
                    <BlockHead span={4} tone="weekly">Weekly plan</BlockHead>
                    <BlockHead span={8} tone="planned">Daily material report (planned)</BlockHead>
                    <BlockHead span={6} tone="actual">Daily material report (actual)</BlockHead>
                    <th rowSpan={2} scope="col" className="border-b border-border bg-card px-3 py-2 text-left align-bottom text-xs font-semibold text-muted-foreground">
                      Status
                    </th>
                  </tr>
                  <tr>
                    {[
                      ["Location", "weekly"], ["Activities", "weekly"], ["Area (m²)", "weekly", true], ["Manpower", "weekly", true],
                      ["Location", "planned"], ["Activities", "planned"], ["Area (m²)", "planned", true], ["Manpower", "planned", true],
                      ["Material", "planned"], ["Qty", "planned", true], ["Coverage", "planned"], ["Remarks", "planned"],
                      ["Activities", "actual"], ["Area (m²)", "actual", true], ["Material", "actual"], ["Qty", "actual", true],
                      ["Coverage", "actual"], ["Remarks", "actual"],
                    ].map(([label, tone, num], i) => (
                      <th
                        key={i}
                        scope="col"
                        className={cn(
                          "whitespace-nowrap border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground",
                          num ? "text-right" : "text-left",
                          blockBg[tone as Block],
                          (i === 3 || i === 11) && "border-r",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byDate.map(([date, list]) => (
                    <Fragment key={date}>
                      {list.map((r, i) => (
                        <tr key={`${date}-${i}`} className="group">
                          <td className={cn("sticky left-0 z-[5] whitespace-nowrap border-r border-border bg-card px-3 py-2 align-top font-semibold tabular-nums text-foreground transition-colors duration-150 group-hover:bg-secondary", i === list.length - 1 && "border-b")}>
                            {i === 0 && fmtDay(date)}
                            {r.weekly && r.weekly.range !== fmtDay(date) && (
                              <span className="block text-[11px] font-normal text-muted-foreground">plan {r.weekly.range}</span>
                            )}
                          </td>
                          <Cells row={r} last={i === list.length - 1} />
                          <td className={cn("whitespace-nowrap px-3 py-2 align-top transition-colors duration-150 group-hover:bg-secondary/50", i === list.length - 1 && "border-b border-border")}>
                            <RowStatus row={r} today={today} onOpen={() => onOpenDay(r.date)} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      {/* Material: planned vs used */}
      <SectionCard title="Material: planned vs used" description="Sets per material across the reports in range, drafts included.">
        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ) : variance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No material entered on the reports in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left">Material</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Planned</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Used</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {variance.map((v) => (
                  <tr key={v.material} className="transition-colors duration-150 hover:bg-secondary/40">
                    <td className="px-3 py-2.5 font-medium text-foreground">{v.material}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{sets(v.planned)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{sets(v.actual)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {v.delta === 0 ? (
                        <span className="text-muted-foreground">As planned</span>
                      ) : (
                        <span className="font-medium text-foreground">
                          {v.delta > 0 ? "+" : "−"}
                          {sets(Math.abs(v.delta))} {v.delta > 0 ? "over" : "under"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

type Block = "weekly" | "planned" | "actual";
const blockBg: Record<Block, string> = {
  weekly: "bg-secondary",
  planned: "bg-[hsl(217_91%_97%)] dark:bg-primary/10",
  actual: "bg-[hsl(160_60%_96%)] dark:bg-success/10",
};

function BlockHead({ span, tone, children }: { span: number; tone: Block; children: string }) {
  return (
    <th colSpan={span} scope="colgroup" className={cn("border-b border-r border-border px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-foreground", blockBg[tone])}>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", tone === "weekly" ? "bg-muted-foreground" : tone === "planned" ? "bg-primary" : "bg-success")} aria-hidden />
        {children}
      </span>
    </th>
  );
}

function Cells({ row, last }: { row: DashboardRow; last: boolean }) {
  const w = row.weekly;
  const p = row.planned;
  const a = row.actual;
  const td = (v: string | number | null | undefined, opts: { num?: boolean; end?: boolean; wide?: boolean } = {}) => (
    <td
      className={cn(
        "px-3 py-2 align-top text-foreground transition-colors duration-150 group-hover:bg-secondary/50",
        opts.num ? "whitespace-nowrap text-right tabular-nums" : opts.wide ? "min-w-[11rem] max-w-[16rem]" : "min-w-[6rem] max-w-[12rem]",
        opts.end && "border-r border-border",
        last && "border-b border-border",
      )}
    >
      {v === "" || v == null ? <span className="text-muted-foreground/50">·</span> : v}
    </td>
  );
  return (
    <>
      {td(w?.location)}
      {td(w?.activities, { wide: true })}
      {td(area(w?.area), { num: true })}
      {td(w?.manpower, { num: true, end: true })}
      {td(p?.location)}
      {td(p?.activities, { wide: true })}
      {td(area(p?.area), { num: true })}
      {td(p?.manpower, { num: true })}
      {td(p?.material)}
      {td(sets(p?.qty), { num: true })}
      {td(p?.coverage)}
      {td(p?.remarks, { end: true })}
      {td(a?.activities, { wide: true })}
      {td(area(a?.area), { num: true })}
      {td(a?.material)}
      {td(sets(a?.qty), { num: true })}
      {td(a?.coverage)}
      {td(a?.remarks)}
    </>
  );
}

function RowStatus({ row, today, onOpen }: { row: DashboardRow; today: string; onOpen: () => void }) {
  if (row.state === "plan-only") {
    return row.date < today ? (
      <Pill tone="warning">
        <AlertTriangle className="h-3 w-3" /> No report
      </Pill>
    ) : (
      <Pill tone="neutral">Planned</Pill>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {row.reportStatus === "submitted" ? (
        <Pill tone="submitted">
          <CheckCircle2 className="h-3 w-3" /> Submitted
        </Pill>
      ) : (
        <Pill tone="draft">Draft</Pill>
      )}
      {row.state === "unplanned" && <Pill tone="info">Not on plan</Pill>}
      <button
        type="button"
        onClick={onOpen}
        className="cursor-pointer rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:bg-primary/5"
      >
        Open
      </button>
    </span>
  );
}

function MobileRow({ row, today, onOpen }: { row: DashboardRow; today: string; onOpen: () => void }) {
  const w = row.weekly;
  const p = row.planned;
  const a = row.actual;
  const line = (label: string, dot: string, parts: (string | null | undefined)[]) => {
    const text = parts.filter(Boolean).join(" · ");
    return (
      <div className="flex gap-2 text-sm">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
        <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("min-w-0 text-foreground", !text && "text-muted-foreground")}>{text || "—"}</span>
      </div>
    );
  };
  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-background/60 p-3">
      {line("Plan", "hsl(var(--muted-foreground))", [w?.range, w?.location, w?.activities, w?.area != null ? `${area(w.area)} m²` : null, w?.manpower != null ? `${w.manpower} men` : null])}
      {p && line("Planned", "hsl(var(--primary))", [p.location, p.activities, p.area != null ? `${area(p.area)} m²` : null, p.material, sets(p.qty), p.coverage])}
      {(p || a) && line("Actual", "hsl(var(--success))", [a?.activities, a?.area != null ? `${area(a.area)} m²` : null, a?.material, sets(a?.qty), a?.coverage, a?.remarks])}
      <div className="pt-1">
        <RowStatus row={row} today={today} onOpen={onOpen} />
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  note,
  status,
  loading,
}: {
  icon: typeof Ruler;
  label: string;
  value: string;
  note?: string;
  status?: "good" | "warning";
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            status === "warning" ? "text-accent" : status === "good" ? "text-success" : "text-muted-foreground",
          )}
          aria-hidden
        />
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-secondary motion-reduce:animate-none" />
      ) : (
        <p className="mt-1.5 font-heading text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      )}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
