// Daily report: the DAILY WORK REPORT header plus one DAILY MATERIAL REPORT card
// per activity (R1 template: PLANNED, ACTUAL, DEFECT). Workflow stages 4 and 5:
// saved as a draft before work, reopened at the end of the day for ACTUAL,
// then submitted. Submitted reports are read-only until reopened.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CopyCheck,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { notify as toast } from "./notify";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  carryCrew,
  copyPlannedToActual,
  CREW_FIELDS,
  crewTotal,
  defaultSiteLocation,
  emptyCrew,
  hasCrew,
  draftErrors,
  emptyHeader,
  emptyLine,
  fmtDay,
  hasActual,
  hasPlanned,
  isoDate,
  linesFromPlan,
  qtyDelta,
  storedToForm,
  submitWarnings,
  type CarriedCrew,
  type ReportHeader,
  type ReportLine,
  type ValidationIssue,
} from "@/lib/siteReports";
import {
  deleteReport,
  fetchCrewSources,
  fetchRecentReports,
  fetchReports,
  fetchSiteLocations,
  fetchWeeklyPlan,
  reopenReport,
  reporterName,
  saveReport,
  setReporterName,
  submitReport,
  type StoredReportFull,
} from "@/lib/siteReportsApi";
import type { SiteMaterial, SiteProject } from "./pickers";
import { LocationField, MaterialField } from "./pickers";
import { Button, Field, NumberInput, Pill, SectionCard, successInk, TextArea, TextInput } from "./primitives";

type Recent = Awaited<ReturnType<typeof fetchRecentReports>>[number];

const headerFromStored = (r: StoredReportFull): ReportHeader => ({
  id: r.id,
  project_id: r.project_id,
  report_date: r.report_date,
  site_location: r.site_location ?? "",
  epoxy_system: r.epoxy_system ?? "",
  time_text: r.time_text ?? "",
  supervisor: r.supervisor ?? "",
  safety_personnel: r.safety_personnel ?? "",
  men: r.men ?? "",
  supply_men: r.supply_men ?? "",
  total_men: r.total_men == null ? "" : String(r.total_men),
  days_to_complete: r.days_to_complete ?? "",
  negative_days: r.negative_days == null ? "" : String(r.negative_days),
  remark: r.remark ?? "",
  additional_area_date: r.additional_area_date ?? "",
  status: r.status,
  submitted_at: r.submitted_at,
  submitted_by: r.submitted_by,
});

const snapshot = (h: ReportHeader, l: ReportLine[]) => JSON.stringify([h, l]);

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });

const fmtStamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export default function DailyReportTab({
  project,
  materials,
  date,
  onDateChange,
  onChanged,
  onDirtyChange,
  resetSignal,
  locationHints,
}: {
  project: SiteProject;
  materials: SiteMaterial[];
  date: string;
  onDateChange: (d: string) => void;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Bumped by the page when the user discards from outside the tab: reload from the database. */
  resetSignal?: number;
  locationHints: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [dayReports, setDayReports] = useState<StoredReportFull[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [siteOptions, setSiteOptions] = useState<string[]>([]);
  const [header, setHeader] = useState<ReportHeader>(() => emptyHeader(project.id, date, project.coating_system ?? ""));
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [saved, setSaved] = useState<string>("");
  const [meta, setMeta] = useState<{ updated_at: string | null; updated_by: string | null }>({ updated_at: null, updated_by: null });
  const [fromPlan, setFromPlan] = useState(0);
  const [crewFrom, setCrewFrom] = useState<CarriedCrew["from"] | null>(null);
  const [totalTouched, setTotalTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "submit" | "reopen" | "delete">(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [name, setName] = useState(reporterName());
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const locked = header.status === "submitted";
  const dirty = !loading && snapshot(header, lines) !== saved;
  const autoTotal = crewTotal(header);
  const errors = useMemo(() => (showErrors ? draftErrors(header, lines) : []), [showErrors, header, lines]);
  const errFor = (line: number | null, field: string) => errors.find((e) => e.line === line && e.field === field)?.message ?? null;

  const openStored = useCallback((r: StoredReportFull) => {
    const h = headerFromStored(r);
    const ls = r.lines.map(storedToForm);
    setHeader(h);
    setLines(ls);
    setSaved(snapshot(h, ls));
    setMeta({ updated_at: r.updated_at, updated_by: r.updated_by });
    setTotalTouched(r.total_men != null && r.total_men !== crewTotal(h));
    setFromPlan(0);
    setCrewFrom(null);
    setShowErrors(false);
  }, []);

  const openNew = useCallback(
    async (siteLocation = "") => {
      const [plan, crewSources] = await Promise.all([fetchWeeklyPlan(project.id, date, date), fetchCrewSources(project.id, date)]);
      const ls = linesFromPlan(plan, date);
      const kept = carryCrew(crewSources, date, siteLocation);
      const h: ReportHeader = {
        ...emptyHeader(project.id, date, project.coating_system ?? ""),
        site_location: siteLocation,
        ...(kept?.crew ?? {}),
        total_men: kept?.total != null ? String(kept.total) : "",
      };
      const start = ls.length ? ls : [emptyLine()];
      setHeader(h);
      setLines(start);
      // A fresh form is "clean" even though it carries the plan's rows: nothing typed yet.
      setSaved(snapshot(h, start));
      setMeta({ updated_at: null, updated_by: null });
      setFromPlan(ls.length);
      setCrewFrom(kept?.from ?? null);
      setTotalTouched(kept?.total != null);
      setShowErrors(false);
    },
    [project.id, project.coating_system, date],
  );

  const load = useCallback(
    async (preferId?: string) => {
      setLoading(true);
      const [day, rec, sites] = await Promise.all([
        fetchReports(project.id, date, date),
        fetchRecentReports(project.id),
        fetchSiteLocations(project.id),
      ]);
      setDayReports(day);
      setRecent(rec);
      setSiteOptions(sites);
      const pick = day.find((r) => r.id === preferId) ?? day[0];
      if (pick) openStored(pick);
      else await openNew(defaultSiteLocation(sites, day.map((r) => r.site_location)));
      setLoading(false);
    },
    [project.id, date, openStored, openNew],
  );

  useEffect(() => {
    load();
  }, [load, resetSignal]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Leaving the page with typed-but-unsaved work: let the browser ask.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /** Run an action that would drop unsaved edits — ask first if there are any. */
  const guard = (action: () => void) => (dirty ? setPending(() => action) : action());

  const setH = <K extends keyof ReportHeader>(k: K, v: ReportHeader[K]) => setHeader((h) => ({ ...h, [k]: v }));
  const setL = (i: number, patch: Partial<ReportLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const effectiveHeader = (): ReportHeader => ({
    ...header,
    total_men: totalTouched ? header.total_men : autoTotal ? String(autoTotal) : "",
  });

  const focusFirstError = (errs: ValidationIssue[]) => {
    const first = errs[0];
    if (!first) return;
    const el = first.line == null ? document.getElementById("sr-date") : lineRefs.current[first.line];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const doSave = async (): Promise<string | null> => {
    const h = effectiveHeader();
    const errs = draftErrors(h, lines);
    if (errs.length) {
      setShowErrors(true);
      toast.error(`Fix ${errs.length} field${errs.length === 1 ? "" : "s"} before saving.`);
      focusFirstError(errs);
      return null;
    }
    const res = await saveReport(h, lines);
    if (!res.ok || !res.id) {
      toast.error(res.error ?? "Could not save the report.");
      return null;
    }
    const next = { ...h, id: res.id };
    setHeader(next);
    setSaved(snapshot(next, lines));
    setMeta({ updated_at: new Date().toISOString(), updated_by: reporterName() || null });
    setFromPlan(0);
    setShowErrors(false);
    return res.id;
  };

  const onSaveDraft = async () => {
    setBusy("save");
    const id = await doSave();
    setBusy(null);
    if (id) {
      toast.success("Draft saved", { description: `${project.project_code} · ${fmtDay(date)}${header.site_location ? ` · ${header.site_location}` : ""}` });
      const [day, rec] = await Promise.all([fetchReports(project.id, date, date), fetchRecentReports(project.id)]);
      setDayReports(day);
      setRecent(rec);
      onChanged();
    }
  };

  const onSubmitClick = () => {
    const errs = draftErrors(effectiveHeader(), lines);
    if (errs.length) {
      setShowErrors(true);
      toast.error(`Fix ${errs.length} field${errs.length === 1 ? "" : "s"} before submitting.`);
      focusFirstError(errs);
      return;
    }
    setConfirmSubmit(true);
  };

  const onConfirmSubmit = async () => {
    if (!name.trim()) return;
    setReporterName(name);
    setBusy("submit");
    const id = header.id && !dirty ? header.id : await doSave();
    if (!id) {
      setBusy(null);
      return;
    }
    const res = await submitReport(id);
    setBusy(null);
    setConfirmSubmit(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not submit the report.");
      return;
    }
    toast.success("Report submitted", { description: "It now shows on the Dashboard Report." });
    await load(id);
    onChanged();
  };

  const onReopen = async () => {
    if (!header.id) return;
    setBusy("reopen");
    const res = await reopenReport(header.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Could not reopen the report.");
      return;
    }
    toast("Report reopened as a draft");
    await load(header.id);
    onChanged();
  };

  const onDelete = async () => {
    if (!header.id) return;
    setBusy("delete");
    const res = await deleteReport(header.id);
    setBusy(null);
    setConfirmDelete(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the draft.");
      return;
    }
    toast("Draft deleted");
    await load();
    onChanged();
  };

  const removeLine = (i: number) => {
    const before = lines;
    setLines((ls) => ls.filter((_, j) => j !== i));
    toast("Activity removed", { action: { label: "Undo", onClick: () => setLines(before) } });
  };

  const addLine = () => {
    setLines((ls) => [...ls, emptyLine({ location: ls[ls.length - 1]?.location ?? "" })]);
    requestAnimationFrame(() => lineRefs.current[lines.length]?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  /** The site decides when the crew changes: clear it, with an Undo. */
  const resetCrew = () => {
    const before = { header, totalTouched, crewFrom };
    setHeader((h) => ({ ...h, ...emptyCrew(), total_men: "" }));
    setTotalTouched(false);
    setCrewFrom(null);
    toast("Crew reset", {
      description: "Enter today's crew.",
      action: {
        label: "Undo",
        onClick: () => {
          setHeader((h) => ({ ...h, ...Object.fromEntries(CREW_FIELDS.map((f) => [f, before.header[f]])), total_men: before.header.total_men }));
          setTotalTouched(before.totalTouched);
          setCrewFrom(before.crewFrom);
        },
      },
    });
  };

  const fillAllActual = () => {
    setLines((ls) => ls.map(copyPlannedToActual));
    toast("ACTUAL filled from PLANNED", { description: "Change anything that differed on the day." });
  };

  const warnings = submitWarnings(lines);
  const plannedCount = lines.filter(hasPlanned).length;
  const actualCount = lines.filter(hasActual).length;
  const today = isoDate(new Date());

  return (
    <div className="space-y-5">
      {/* Date + which report */}
      <SectionCard
        title="Report date"
        description="One report per project, day and site location. Save a draft before work, finish ACTUAL at the end of the day, then submit."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[11.5rem] space-y-1.5">
            <label htmlFor="sr-date" className="block text-[13px] font-medium text-foreground">
              Date
            </label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                id="sr-date"
                type="date"
                value={date}
                onChange={(e) => e.target.value && guard(() => onDateChange(e.target.value))}
                className="pl-9 tabular-nums"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pb-0.5">
            {date !== today && (
              <Button variant="ghost" className="h-11" onClick={() => guard(() => onDateChange(today))}>
                Today
              </Button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 pb-2.5">
            {loading ? (
              <Pill tone="neutral">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading
              </Pill>
            ) : locked ? (
              <Pill tone="submitted">
                <CheckCircle2 className="h-3 w-3" /> Submitted
              </Pill>
            ) : header.id ? (
              <Pill tone="draft">Draft</Pill>
            ) : (
              <Pill tone="neutral">New</Pill>
            )}
          </div>
        </div>

        {dayReports.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">On {fmtDay(date)}:</span>
            {dayReports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => r.id !== header.id && guard(() => openStored(r))}
                aria-pressed={r.id === header.id}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-150 sm:h-9",
                  r.id === header.id ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                <MapPin className="h-3.5 w-3.5" />
                {r.site_location || "No site location"}
                <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "submitted" ? "bg-success" : "bg-warning")} aria-hidden />
                <span className="sr-only">{r.status}</span>
              </button>
            ))}
            {header.id && (
              <button
                type="button"
                onClick={() => guard(() => openNew())}
                className="inline-flex h-11 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary/5 sm:h-9"
              >
                <Plus className="h-3.5 w-3.5" /> Another site location
              </button>
            )}
          </div>
        )}

        {recent.length > 0 && (
          <details className="group mt-4">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
              Recent reports for {project.project_code}
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => guard(() => onDateChange(r.report_date))}
                  className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs tabular-nums text-foreground transition-colors duration-150 hover:bg-secondary sm:h-8 sm:px-2.5"
                >
                  {fmtDay(r.report_date)}
                  {r.site_location && <span className="text-muted-foreground">· {r.site_location}</span>}
                  <span className={cn("h-1.5 w-1.5 rounded-full", r.status === "submitted" ? "bg-success" : "bg-warning")} aria-hidden />
                  <span className="sr-only">{r.status}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </SectionCard>

      {locked && (
        <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-foreground">
            Submitted{header.submitted_by ? ` by ${header.submitted_by}` : ""} {fmtStamp(header.submitted_at)}. It is read-only — reopen it to correct anything.
          </p>
        </div>
      )}

      {fromPlan > 0 && !locked && (
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/5 px-4 py-3 text-sm">
          <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-foreground">
            Started from the weekly plan: {fromPlan} {fromPlan === 1 ? "activity" : "activities"} for {fmtDay(date)}. Adjust them for today, then save.
          </p>
        </div>
      )}

      {/* DAILY WORK REPORT */}
      <fieldset disabled={locked || loading} className="contents">
        <SectionCard title="Daily work report" description="Who is on site and for how long — the template posted before work.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site location" hint="Pick a site this project uses, or type a new one">
              {(id, d) => (
                <LocationField
                  id={id}
                  describedBy={d}
                  options={siteOptions}
                  usedToday={dayReports.filter((r) => r.id !== header.id).map((r) => r.site_location)}
                  value={header.site_location}
                  onChange={(v) => setH("site_location", v)}
                  placeholder="e.g. Plantation A"
                />
              )}
            </Field>
            <Field label="Epoxy system">
              {(id) => <TextInput id={id} value={header.epoxy_system} onChange={(e) => setH("epoxy_system", e.target.value)} />}
            </Field>
            <Field label="Time" hint="e.g. 8am to 10pm">
              {(id, d) => <TextInput id={id} aria-describedby={d} value={header.time_text} onChange={(e) => setH("time_text", e.target.value)} />}
            </Field>
            <Field label="Days to complete" hint="Day of total, e.g. 1/7">
              {(id, d) => <TextInput id={id} aria-describedby={d} value={header.days_to_complete} onChange={(e) => setH("days_to_complete", e.target.value)} className="tabular-nums" />}
            </Field>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Man power</h3>
              <span className="text-xs text-muted-foreground">Worker numbers, separated by commas</span>
              {!locked && hasCrew(header) && (
                <button
                  type="button"
                  onClick={resetCrew}
                  className="ml-auto inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-secondary active:scale-[0.97] motion-reduce:active:scale-100 sm:h-8"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset crew
                </button>
              )}
            </div>
            {crewFrom && !locked && (
              <p className="-mt-1 mb-3 text-xs text-muted-foreground">
                Kept from the {fmtDay(crewFrom.date)} report{crewFrom.site ? ` · ${crewFrom.site}` : ""}. Keep it, edit it, or reset it if the team changed.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supervisor">
                {(id) => <TextInput id={id} value={header.supervisor} onChange={(e) => setH("supervisor", e.target.value)} inputMode="numeric" className="tabular-nums" />}
              </Field>
              <Field label="Safety personnel">
                {(id) => <TextInput id={id} value={header.safety_personnel} onChange={(e) => setH("safety_personnel", e.target.value)} inputMode="numeric" className="tabular-nums" />}
              </Field>
              <Field label="Men" hint="e.g. 321, 317, 332, 336">
                {(id, d) => <TextInput id={id} aria-describedby={d} value={header.men} onChange={(e) => setH("men", e.target.value)} className="tabular-nums" />}
              </Field>
              <Field label="Supply men">
                {(id) => <TextInput id={id} value={header.supply_men} onChange={(e) => setH("supply_men", e.target.value)} className="tabular-nums" />}
              </Field>
              <Field
                label="Total"
                hint={totalTouched ? "Typed in — clear it to count the crew again" : `Counted from the crew above: ${autoTotal}`}
                error={errFor(null, "total_men")}
              >
                {(id, d) => (
                  <NumberInput
                    id={id}
                    aria-describedby={d}
                    value={totalTouched ? header.total_men : autoTotal ? String(autoTotal) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTotalTouched(v !== "");
                      setH("total_men", v);
                    }}
                    className="tabular-nums"
                  />
                )}
              </Field>
              <Field label="Negative days">
                {(id) => <NumberInput id={id} value={header.negative_days} onChange={(e) => setH("negative_days", e.target.value)} className="tabular-nums" />}
              </Field>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Additional area & date">
              {(id) => <TextInput id={id} value={header.additional_area_date} onChange={(e) => setH("additional_area_date", e.target.value)} />}
            </Field>
            <Field label="Remark">
              {(id) => <TextInput id={id} value={header.remark} onChange={(e) => setH("remark", e.target.value)} />}
            </Field>
          </div>
        </SectionCard>

        {/* DAILY MATERIAL REPORT, one card per activity */}
        <SectionCard
          title="Daily material report"
          description={`${lines.length} ${lines.length === 1 ? "activity" : "activities"} · ${plannedCount} planned · ${actualCount} with actual`}
          actions={
            !locked && lines.some(hasPlanned) ? (
              <Button variant="secondary" className="h-11 px-3 text-xs sm:h-9" onClick={fillAllActual}>
                <CopyCheck className="h-4 w-4" /> Fill ACTUAL from PLANNED
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {lines.map((l, i) => (
              <ActivityCard
                key={l.uid}
                index={i}
                line={l}
                materials={materials}
                locked={locked}
                errFor={(f) => errFor(i, f)}
                onChange={(patch) => setL(i, patch)}
                onRemove={lines.length > 1 ? () => removeLine(i) : undefined}
                cardRef={(el) => (lineRefs.current[i] = el)}
                locationHints={locationHints}
              />
            ))}
            {lines.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No activities yet.</p>}
            {!locked && (
              <Button variant="secondary" className="w-full border-dashed" onClick={addLine}>
                <Plus className="h-4 w-4" /> Add activity
              </Button>
            )}
          </div>
        </SectionCard>
      </fieldset>

      {/* Action bar: sticks to the bottom of whichever element scrolls (the
          window in the client build, the main pane inside the app shell), so it
          stays in the content column and never covers the sidebar. */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-card shadow-[0_-6px_16px_-10px_rgb(15_23_42/0.18)] sm:mx-0 sm:rounded-t-2xl sm:border-x">
        <div className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
            {loading ? null : dirty ? (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                <span className="truncate">Unsaved<span className="hidden sm:inline"> changes</span></span>
              </span>
            ) : meta.updated_at ? (
              <span className="block truncate" title={`Saved ${fmtStamp(meta.updated_at)}${meta.updated_by ? ` by ${meta.updated_by}` : ""}`}>
                Saved <span className="sm:hidden">{fmtTime(meta.updated_at)}</span>
                <span className="hidden sm:inline">
                  {fmtStamp(meta.updated_at)}
                  {meta.updated_by ? ` · ${meta.updated_by}` : ""}
                </span>
              </span>
            ) : (
              <span className="block truncate">Not saved yet</span>
            )}
          </div>
          {locked ? (
            <Button variant="secondary" onClick={onReopen} disabled={busy !== null}>
              {busy === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reopen to edit
            </Button>
          ) : (
            <>
              {header.id && (
                <Button variant="ghost" className="px-3 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy !== null} aria-label="Delete draft">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="secondary" onClick={onSaveDraft} disabled={busy !== null || loading || (!dirty && !!header.id)}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="hidden min-[400px]:inline">Save draft</span>
                <span className="min-[400px]:hidden">Save</span>
              </Button>
              <Button variant="primary" onClick={onSubmitClick} disabled={busy !== null || loading || lines.length === 0}>
                {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Submit */}
      <AlertDialog open={confirmSubmit} onOpenChange={(o) => busy !== "submit" && setConfirmSubmit(o)}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Submit the {fmtDay(date)} report?</AlertDialogTitle>
            <AlertDialogDescription>
              {project.project_code}
              {header.site_location ? ` · ${header.site_location}` : ""} · {lines.length} {lines.length === 1 ? "activity" : "activities"}. A submitted report is read-only until someone reopens it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {warnings.length > 0 && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-accent" /> Check before submitting
              </p>
              <ul className="space-y-0.5 pl-6 text-sm text-muted-foreground">
                {warnings.map((w) => (
                  <li key={w} className="list-disc">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Submitted by" error={name.trim() ? null : "Enter your name so the report shows who submitted it."}>
            {(id, d) => <TextInput id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" invalid={!name.trim()} />}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl" disabled={busy === "submit"}>
              Not yet
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              disabled={!name.trim() || busy === "submit"}
              onClick={(e) => {
                e.preventDefault();
                onConfirmSubmit();
              }}
            >
              {busy === "submit" && <Loader2 className="h-4 w-4 animate-spin" />}
              {warnings.length ? "Submit anyway" : "Submit report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete draft */}
      <AlertDialog open={confirmDelete} onOpenChange={(o) => busy !== "delete" && setConfirmDelete(o)}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The {fmtDay(date)} draft for {project.project_code}
              {header.site_location ? ` at ${header.site_location}` : ""} and its {lines.length} {lines.length === 1 ? "activity" : "activities"} will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes guard */}
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>This report has edits that are not saved. Save the draft first to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Stay here</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              onClick={() => {
                const a = pending;
                setPending(null);
                setSaved(snapshot(header, lines)); // the edits are being dropped on purpose
                a?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── one activity: PLANNED | ACTUAL | DEFECT ──────────────────────────────────

function ActivityCard({
  index,
  line,
  materials,
  locked,
  errFor,
  onChange,
  onRemove,
  cardRef,
  locationHints,
}: {
  index: number;
  line: ReportLine;
  materials: SiteMaterial[];
  locked: boolean;
  errFor: (field: string) => string | null;
  onChange: (patch: Partial<ReportLine>) => void;
  onRemove?: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
  locationHints: string[];
}) {
  const [defectOpen, setDefectOpen] = useState(!!(line.defect_area || line.defect_remark));
  const delta = qtyDelta(line);
  const planned = hasPlanned(line);

  return (
    <div
      ref={cardRef}
      className="scroll-mt-24 rounded-2xl border border-border bg-background/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity {index + 1}</span>
        {onRemove && !locked && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-destructive/5 hover:text-destructive"
            aria-label={`Remove activity ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr_7rem]">
          <Field label="Location" hint="Area of the site, e.g. Phase 3">
            {(id, d) => (
              <LocationField
                id={id}
                describedBy={d}
                options={locationHints}
                value={line.location}
                onChange={(v) => onChange({ location: v })}
                placeholder="e.g. Phase 3"
              />
            )}
          </Field>
          <Field label="Activity" error={errFor("activity")}>
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} value={line.activity} onChange={(e) => onChange({ activity: e.target.value })} invalid={!!errFor("activity")} placeholder="e.g. Grinding" />
            )}
          </Field>
          <Field label="Manpower" error={errFor("manpower")}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} value={line.manpower} onChange={(e) => onChange({ manpower: e.target.value })} invalid={!!errFor("manpower")} className="tabular-nums" />}
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <MaterialBlock
            title="Planned"
            tone="planned"
            prefix="planned"
            line={line}
            materials={materials}
            errFor={errFor}
            onChange={onChange}
          />
          <MaterialBlock
            title="Actual"
            tone="actual"
            prefix="actual"
            line={line}
            materials={materials}
            errFor={errFor}
            onChange={onChange}
            badge={
              delta != null && delta !== 0 ? (
                <Pill tone={delta > 0 ? "warning" : "info"} className="tabular-nums">
                  {delta > 0 ? "+" : "−"}
                  {Math.abs(delta)} sets vs plan
                </Pill>
              ) : delta === 0 ? (
                <Pill tone="submitted">As planned</Pill>
              ) : null
            }
            action={
              !locked && planned ? (
                <button
                  type="button"
                  onClick={() => onChange(copyPlannedToActual(line))}
                  className={cn("inline-flex h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors duration-150 hover:bg-success/10 sm:h-8", successInk)}
                >
                  <CopyCheck className="h-3.5 w-3.5" /> Same as planned
                </button>
              ) : undefined
            }
          />
        </div>

        <div className="rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setDefectOpen((o) => !o)}
            aria-expanded={defectOpen}
            className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium text-foreground transition-colors duration-150 hover:bg-secondary/60"
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Defect
              {(line.defect_area || line.defect_remark) && !defectOpen && <span className="text-xs font-normal text-muted-foreground">· {line.defect_area || line.defect_remark}</span>}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out", defectOpen && "rotate-180")} />
          </button>
          {defectOpen && (
            <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <Field label="Defect area">
                {(id) => <TextInput id={id} value={line.defect_area} onChange={(e) => onChange({ defect_area: e.target.value })} />}
              </Field>
              <Field label="Defect remark">
                {(id) => <TextArea id={id} value={line.defect_remark} onChange={(e) => onChange({ defect_remark: e.target.value })} className="min-h-11" rows={1} />}
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialBlock({
  title,
  tone,
  prefix,
  line,
  materials,
  errFor,
  onChange,
  badge,
  action,
}: {
  title: string;
  tone: "planned" | "actual";
  prefix: "planned" | "actual";
  line: ReportLine;
  materials: SiteMaterial[];
  errFor: (field: string) => string | null;
  onChange: (patch: Partial<ReportLine>) => void;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  const k = <S extends string>(s: S) => `${prefix}_${s}` as `${typeof prefix}_${S}`;
  const area = line[k("area")];
  const qty = line[k("qty")];
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "planned" ? "border-primary/20 bg-primary/[0.03]" : "border-success/25 bg-success/[0.04]",
      )}
    >
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", tone === "planned" ? "bg-primary" : "bg-success")} aria-hidden />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h4>
          {badge}
        </div>
        {action}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Area (m²)" error={errFor(k("area"))}>
          {(id, d) => <NumberInput id={id} aria-describedby={d} value={area} onChange={(e) => onChange({ [k("area")]: e.target.value })} invalid={!!errFor(k("area"))} className="tabular-nums" />}
        </Field>
        <Field label="Qty in set" error={errFor(k("qty"))}>
          {(id, d) => <NumberInput id={id} aria-describedby={d} value={qty} onChange={(e) => onChange({ [k("qty")]: e.target.value })} invalid={!!errFor(k("qty"))} className="tabular-nums" />}
        </Field>
        <Field label="Material" className="col-span-2">
          {(id, d) => (
            <MaterialField
              id={id}
              describedBy={d}
              materials={materials}
              value={line[k("material")]}
              materialId={line[k("material_id")]}
              onChange={(name, mid) => onChange({ [k("material")]: name, [k("material_id")]: mid })}
            />
          )}
        </Field>
        <Field label="Coverage" hint="e.g. 0.15kg/m2">
          {(id, d) => <TextInput id={id} aria-describedby={d} value={line[k("coverage")]} onChange={(e) => onChange({ [k("coverage")]: e.target.value })} />}
        </Field>
        <Field label="Remark">
          {(id) => <TextInput id={id} value={line[k("remark")]} onChange={(e) => onChange({ [k("remark")]: e.target.value })} />}
        </Field>
      </div>
    </div>
  );
}
