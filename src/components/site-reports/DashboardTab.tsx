// Progress: the per-project Dashboard Report sheet Lynn fills by hand from the
// chat groups today — WEEKLY PLAN beside DAILY MATERIAL REPORT (PLANNED) and
// (ACTUAL), plus the material planned-vs-used totals. Built from the weekly
// plan and the daily reports; the full sheet layout is the Excel export.
// Laid out like the mockup's "Progress" tab: kv cards with a verdict chip,
// then one card per day.
import { useCallback, useEffect, useMemo, useState } from "react";
import { notify as toast } from "./notify";
import { addDays, buildDashboardRows, dashboardTotals, fmtDay, isoDate, materialVariance, parseIso, weekStart, type DashboardRow } from "@/lib/siteReports";
import { fetchReports, fetchWeeklyPlan } from "@/lib/siteReportsApi";
import type { SiteProject } from "./pickers";
import { Button, Card, CardHead, Chip, Kv, Placeholder, SectionLabel, Select, TextInput } from "./primitives";

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
  const verdict: { tone: "good" | "warn" | "pending"; txt: string } = loading
    ? { tone: "pending", txt: "Loading" }
    : rows.length === 0
      ? { tone: "pending", txt: "Nothing yet" }
      : totals.planOnlyPast > 0 || totals.drafts > 0
        ? { tone: "warn", txt: "Attention" }
        : { tone: "good", txt: "On track" };

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
    <>
      {/* Range */}
      <div className="mb-3 flex gap-2">
        <Select value={preset} onChange={(e) => pick(e.target.value as Preset)} aria-label="Date range" className="flex-1">
          <option value="this-week">This week</option>
          <option value="last-week">Last week</option>
          <option value="this-month">This month</option>
          <option value="custom">Custom range</option>
        </Select>
        <Button variant="ghost" className="!w-auto !px-3 !py-2 !text-[12px]" onClick={onExport} disabled={exporting || loading || rows.length === 0}>
          {exporting ? "Exporting…" : "⬇ Excel"}
        </Button>
      </div>
      {preset === "custom" && (
        <div className="mb-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="dash-from">
            From
          </label>
          <TextInput id="dash-from" type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} className="tabular-nums" />
          <span className="text-[var(--ink-muted)]" aria-hidden>
            –
          </span>
          <label className="sr-only" htmlFor="dash-to">
            To
          </label>
          <TextInput id="dash-to" type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} className="tabular-nums" />
        </div>
      )}

      {/* Sheet header + totals, as the mockup's Progress card */}
      <Card>
        <SectionLabel className="!m-0 !mb-2" right={<Chip tone={verdict.tone}>{verdict.txt}</Chip>}>
          📅 Progress — {fmtDay(from)} to {fmtDay(to)}
        </SectionLabel>
        <Kv k="Client / site" v={clientSite || "—"} />
        <Kv k="Project ref" v={project.project_code} />
        <Kv k="WO" v={lastWo || "None on file"} />
        <Kv k="Planned area" v={loading ? "…" : `${area(totals.plannedArea) || "0"} m²`} />
        <Kv k="Actual area" v={loading ? "…" : `${area(totals.actualArea) || "0"} m²${pctDone == null ? "" : ` · ${pctDone}%`}`} />
        <Kv k="Planned days with no report" v={loading ? "…" : String(totals.planOnlyPast)} />
        <Kv k="Reports still in draft" v={loading ? "…" : String(totals.drafts)} />
      </Card>

      {/* One card per day */}
      {loading ? (
        [0, 1, 2].map((i) => <div key={i} className="sr-skeleton" />)
      ) : rows.length === 0 ? (
        <Placeholder icon="📊" title="Nothing planned or reported">
          {fmtDay(from)} – {fmtDay(to)}. Add the week's rows on Plan, or file a daily report.
        </Placeholder>
      ) : (
        <>
          <SectionLabel>By day</SectionLabel>
          {byDate.map(([date, list]) => (
            <Card key={date} onClick={() => onOpenDay(date)} ariaLabel={`Open the ${fmtDay(date)} report`}>
              <CardHead small name={date === today ? `Today · ${fmtDay(date)}` : fmtDay(date)} meta={`${list.length} ${list.length === 1 ? "row" : "rows"}`} right={<DayChips list={list} today={today} />} />
              {list.map((r, i) => (
                <DayRow key={i} row={r} first={i === 0} />
              ))}
            </Card>
          ))}
        </>
      )}

      {/* Material: planned vs used */}
      <SectionLabel>Material · planned vs used</SectionLabel>
      <Card>
        {loading ? (
          <div className="sr-skeleton !mb-0 !h-10" />
        ) : variance.length === 0 ? (
          <p className="sr-hint">No material entered on the reports in this range.</p>
        ) : (
          variance.map((v) => (
            <Kv
              key={v.material}
              k={v.material}
              v={
                <>
                  {sets(v.planned) || "0 sets"} → {sets(v.actual) || "0 sets"}
                  {v.delta !== 0 && (
                    <span className={v.delta > 0 ? "text-[var(--warn)]" : "text-[var(--sky)]"}>
                      {" "}
                      ({v.delta > 0 ? "+" : "−"}
                      {Number(Math.abs(v.delta).toFixed(3))})
                    </span>
                  )}
                </>
              }
            />
          ))
        )}
      </Card>
    </>
  );
}

function DayChips({ list, today }: { list: DashboardRow[]; today: string }) {
  const submitted = list.filter((r) => r.state !== "plan-only" && r.reportStatus === "submitted").length;
  const drafts = list.filter((r) => r.state !== "plan-only" && r.reportStatus !== "submitted").length;
  const missing = list.filter((r) => r.state === "plan-only" && r.date < today).length;
  const planned = list.filter((r) => r.state === "plan-only" && r.date >= today).length;
  if (missing) return <Chip tone="bad">No report</Chip>;
  if (drafts) return <Chip tone="warn">Draft</Chip>;
  if (submitted) return <Chip tone="good">Submitted</Chip>;
  if (planned) return <Chip tone="pending">Planned</Chip>;
  return null;
}

/** One sheet row: the plan line, the planned line, the actual line. */
function DayRow({ row, first }: { row: DashboardRow; first: boolean }) {
  const w = row.weekly;
  const p = row.planned;
  const a = row.actual;
  const line = (label: string, color: string, parts: (string | null | undefined)[]) => {
    const text = parts.filter(Boolean).join(" · ");
    return (
      <div className={first ? "sr-order-line !border-t-0" : "sr-order-line"}>
        <span className="sr-dot" style={{ background: color }} aria-hidden />
        <span className="sr-st w-[52px] shrink-0">{label}</span>
        <span className="sr-nm !whitespace-normal !font-normal">{text || <span className="text-[var(--ink-muted)]">—</span>}</span>
      </div>
    );
  };
  return (
    <div className={first ? "" : "mt-1 border-t border-dashed border-[var(--line)] pt-1"}>
      {line("Plan", "var(--ink-muted)", [w?.range, w?.location, w?.activities, w?.area != null ? `${area(w.area)} m²` : null, w?.manpower != null ? `${w.manpower} men` : null])}
      {p && line("Planned", "var(--accent)", [p.location, p.activities, p.area != null ? `${area(p.area)} m²` : null, p.material, sets(p.qty), p.coverage])}
      {(p || a) && line("Actual", "var(--good)", [a?.activities, a?.area != null ? `${area(a.area)} m²` : null, a?.material, sets(a?.qty), a?.coverage, a?.remarks])}
      {row.state === "unplanned" && (
        <div className="mt-1">
          <Chip tone="progress">Not on plan</Chip>
        </div>
      )}
    </div>
  );
}
