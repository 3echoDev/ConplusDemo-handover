// Daily report: the DAILY WORK REPORT header plus one DAILY MATERIAL REPORT card
// per activity (R1 template: PLANNED, ACTUAL, DEFECT). Workflow stages 4 and 5:
// saved as a draft before work, reopened at the end of the day for ACTUAL,
// then submitted. Submitted reports are read-only until reopened.
//
// Laid out like a stage screen of the client's SitePulse mockup: the stage
// rail at the top, flat uppercase-labelled fields, one card per activity, and
// the stacked button row at the foot (Submit / Save and back).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Banner, Button, ButtonRow, Card, CardHead, Chip, Field, FieldRow, IconButton, Note, NumberInput, SectionLabel, TextArea, TextInput, Tracker } from "./primitives";

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

const fmtStamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export default function DailyReportTab({
  project,
  materials,
  date,
  reportId,
  onDateChange,
  onChanged,
  onDirtyChange,
  onBack,
  resetSignal,
  locationHints,
}: {
  project: SiteProject;
  materials: SiteMaterial[];
  date: string;
  /** "new" opens a blank report for the day, an id opens that report, null opens the day's first report (or a blank one). */
  reportId: string | null;
  onDateChange: (d: string) => void;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Back to the project's report list. */
  onBack: () => void;
  /** Bumped by the page when the user discards from outside the tab: reload from the database. */
  resetSignal?: number;
  locationHints: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [dayReports, setDayReports] = useState<StoredReportFull[]>([]);
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
    async (preferId?: string | null) => {
      setLoading(true);
      const [day, sites] = await Promise.all([fetchReports(project.id, date, date), fetchSiteLocations(project.id)]);
      setDayReports(day);
      setSiteOptions(sites);
      const want = preferId === undefined ? reportId : preferId;
      const pick = want === "new" ? undefined : (day.find((r) => r.id === want) ?? day[0]);
      if (pick) openStored(pick);
      else await openNew(defaultSiteLocation(sites, day.map((r) => r.site_location)));
      setLoading(false);
    },
    [project.id, date, reportId, openStored, openNew],
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

  const onSaveDraft = async (back: boolean) => {
    if (!dirty && header.id) {
      if (back) onBack();
      return;
    }
    setBusy("save");
    const id = await doSave();
    setBusy(null);
    if (id) {
      toast.success("Draft saved", { description: `${project.project_code} · ${fmtDay(date)}${header.site_location ? ` · ${header.site_location}` : ""}` });
      onChanged();
      if (back) onBack();
      else setDayReports(await fetchReports(project.id, date, date));
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
    toast.success("Report submitted", { description: "It now shows on Progress." });
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
    setSaved(snapshot(header, lines)); // nothing left to keep
    onChanged();
    onBack();
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
  const allActual = lines.length > 0 && actualCount === lines.length;
  const today = isoDate(new Date());

  const statusChip = loading ? (
    <Chip tone="pending">Loading</Chip>
  ) : locked ? (
    <Chip tone="good">Submitted</Chip>
  ) : header.id ? (
    <Chip tone="warn">Draft</Chip>
  ) : (
    <Chip tone="pending">New</Chip>
  );

  return (
    <>
      <div className="sr-scroll">
        {/* Which day. Changing it opens that day's report. */}
        <SectionLabel right={statusChip}>Report</SectionLabel>
        <FieldRow>
          <Field label="Date">
            {(id) => <TextInput id="sr-date" aria-labelledby={id} type="date" value={date} onChange={(e) => e.target.value && guard(() => onDateChange(e.target.value))} className="tabular-nums" />}
          </Field>
          {date !== today && (
            <div className="sr-field !flex-none justify-end">
              <Button variant="ghost" className="!w-auto" onClick={() => guard(() => onDateChange(today))}>
                Today
              </Button>
            </div>
          )}
        </FieldRow>

        {/* Where this report is: draft before work, ACTUAL at the end of the day, then submitted. */}
        {!loading && (
          <Tracker
            label="Report stage"
            steps={[
              { title: "Before work", desc: header.id ? "Draft saved" : "Save a draft first", state: header.id ? "done" : "active" },
              {
                title: "End of day",
                desc: lines.length === 0 ? "Fill ACTUAL" : locked ? "Completed" : `${actualCount} of ${lines.length} ${lines.length === 1 ? "activity has" : "activities have"} ACTUAL`,
                state: locked || allActual ? "done" : header.id ? "active" : "locked",
              },
              { title: "Submitted", desc: locked ? `${fmtStamp(header.submitted_at)}${header.submitted_by ? ` · ${header.submitted_by}` : ""}` : "Read-only after", state: locked ? "done" : allActual ? "active" : "locked" },
            ]}
          />
        )}

        {locked && (
          <Banner tone="good" icon={<span aria-hidden>🔒</span>}>
            Submitted{header.submitted_by ? ` by ${header.submitted_by}` : ""} {fmtStamp(header.submitted_at)}. It is read-only — reopen it to correct anything.
          </Banner>
        )}
        {fromPlan > 0 && !locked && (
          <Banner tone="info" icon={<span aria-hidden>📅</span>}>
            Started from the weekly plan: {fromPlan} {fromPlan === 1 ? "activity" : "activities"} for {fmtDay(date)}. Adjust them for today, then save.
          </Banner>
        )}

        <fieldset disabled={locked || loading} className="contents">
          {/* DAILY WORK REPORT */}
          <SectionLabel>Daily work report</SectionLabel>
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
          <Field label="Epoxy system">{(id) => <TextInput id={id} value={header.epoxy_system} onChange={(e) => setH("epoxy_system", e.target.value)} />}</Field>
          <FieldRow>
            <Field label="Time" hint="e.g. 8am to 10pm">
              {(id, d) => <TextInput id={id} aria-describedby={d} value={header.time_text} onChange={(e) => setH("time_text", e.target.value)} />}
            </Field>
            <Field label="Days to complete" hint="Day of total, e.g. 1/7">
              {(id, d) => <TextInput id={id} aria-describedby={d} value={header.days_to_complete} onChange={(e) => setH("days_to_complete", e.target.value)} className="tabular-nums" />}
            </Field>
          </FieldRow>

          {/* MAN POWER */}
          <SectionLabel
            right={
              !locked && hasCrew(header) ? (
                <IconButton text onClick={resetCrew} className="!h-7">
                  ↺ Reset crew
                </IconButton>
              ) : undefined
            }
          >
            Man power
          </SectionLabel>
          {crewFrom && !locked && (
            <Note className="mb-3">
              Kept from the {fmtDay(crewFrom.date)} report{crewFrom.site ? ` · ${crewFrom.site}` : ""}. Keep it, edit it, or reset it if the team changed. Worker numbers, separated by commas.
            </Note>
          )}
          <FieldRow>
            <Field label="Supervisor">{(id) => <TextInput id={id} value={header.supervisor} onChange={(e) => setH("supervisor", e.target.value)} inputMode="numeric" className="tabular-nums" />}</Field>
            <Field label="Safety personnel">
              {(id) => <TextInput id={id} value={header.safety_personnel} onChange={(e) => setH("safety_personnel", e.target.value)} inputMode="numeric" className="tabular-nums" />}
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Men" hint="e.g. 321, 317, 332, 336">
              {(id, d) => <TextInput id={id} aria-describedby={d} value={header.men} onChange={(e) => setH("men", e.target.value)} className="tabular-nums" />}
            </Field>
            <Field label="Supply men">{(id) => <TextInput id={id} value={header.supply_men} onChange={(e) => setH("supply_men", e.target.value)} className="tabular-nums" />}</Field>
          </FieldRow>
          <FieldRow>
            <Field label="Total" hint={totalTouched ? "Typed in — clear it to count the crew again" : `Counted from the crew: ${autoTotal}`} error={errFor(null, "total_men")}>
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
            <Field label="Negative days">{(id) => <NumberInput id={id} value={header.negative_days} onChange={(e) => setH("negative_days", e.target.value)} className="tabular-nums" />}</Field>
          </FieldRow>
          <Field label="Additional area & date">{(id) => <TextInput id={id} value={header.additional_area_date} onChange={(e) => setH("additional_area_date", e.target.value)} />}</Field>
          <Field label="Remark">{(id) => <TextArea id={id} rows={2} value={header.remark} onChange={(e) => setH("remark", e.target.value)} />}</Field>

          {/* DAILY MATERIAL REPORT, one card per activity */}
          <SectionLabel right={<span className="sr-mono normal-case tracking-normal">{plannedCount} planned · {actualCount} actual</span>}>Daily material report</SectionLabel>
          {!locked && lines.some(hasPlanned) && (
            <Button variant="line" className="mb-3" onClick={fillAllActual}>
              ⇆ Fill ACTUAL from PLANNED
            </Button>
          )}
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
          {lines.length === 0 && <Note>No activities yet.</Note>}
          {!locked && (
            <Button variant="line" className="mt-1" onClick={addLine}>
              ＋ Add activity
            </Button>
          )}
        </fieldset>

        {header.id && !locked && !loading && (
          <Button variant="danger" className="mt-5" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            🗑 Delete this draft
          </Button>
        )}
      </div>

      {/* The mockup's btn-row: Complete and Continue / Save and back to Main. */}
      <ButtonRow
        status={
          loading ? null : dirty ? (
            <span className="font-semibold text-[var(--warn)]">● Unsaved changes</span>
          ) : meta.updated_at ? (
            `Saved ${fmtStamp(meta.updated_at)}${meta.updated_by ? ` · ${meta.updated_by}` : ""}`
          ) : (
            "Not saved yet"
          )
        }
      >
        {locked ? (
          <>
            <Button variant="primary" onClick={onReopen} disabled={busy !== null}>
              {busy === "reopen" ? "Reopening…" : "↺ Reopen to edit"}
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Back to reports
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onSubmitClick} disabled={busy !== null || loading || lines.length === 0}>
              {busy === "submit" ? "Submitting…" : "Submit report"}
            </Button>
            <Button variant="ghost" onClick={() => onSaveDraft(true)} disabled={busy !== null || loading}>
              {busy === "save" ? "Saving…" : dirty || !header.id ? "Save draft and back" : "Back to reports"}
            </Button>
          </>
        )}
      </ButtonRow>

      {/* Submit */}
      <AlertDialog open={confirmSubmit} onOpenChange={(o) => busy !== "submit" && setConfirmSubmit(o)}>
        <AlertDialogContent className="sr-app max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">Submit the {fmtDay(date)} report?</AlertDialogTitle>
            <AlertDialogDescription>
              {project.project_code}
              {header.site_location ? ` · ${header.site_location}` : ""} · {lines.length} {lines.length === 1 ? "activity" : "activities"}. A submitted report is read-only until someone reopens it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {warnings.length > 0 && (
            <Banner tone="warn" icon={<span aria-hidden>⚠</span>} className="mb-0">
              <b>Check before submitting</b>
              <ul className="mt-1 list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Banner>
          )}
          <Field label="Submitted by" error={name.trim() ? null : "Enter your name so the report shows who submitted it."} className="mb-0">
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
              {busy === "submit" ? "Submitting…" : warnings.length ? "Submit anyway" : "Submit report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete draft */}
      <AlertDialog open={confirmDelete} onOpenChange={(o) => busy !== "delete" && setConfirmDelete(o)}>
        <AlertDialogContent className="sr-app max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">Delete this draft?</AlertDialogTitle>
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
              {busy === "delete" ? "Deleting…" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes guard */}
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="sr-app max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl">Discard unsaved changes?</AlertDialogTitle>
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
    </>
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
  const actual = hasActual(line);

  return (
    <div ref={cardRef} className="scroll-mt-24">
      <Card>
        <CardHead
          small
          name={`Activity ${index + 1}`}
          meta={[line.location, line.activity].filter(Boolean).join(" · ") || "Not filled in yet"}
          right={
            <>
              {actual ? <Chip tone="good">Actual</Chip> : planned ? <Chip tone="progress">Planned</Chip> : <Chip tone="pending">Empty</Chip>}
              {onRemove && !locked && (
                <IconButton onClick={onRemove} aria-label={`Remove activity ${index + 1}`} className="!h-[26px] !w-[26px] !text-[12px]">
                  ✕
                </IconButton>
              )}
            </>
          }
        />
        <Field label="Location" hint="Area of the site, e.g. Phase 3">
          {(id, d) => <LocationField id={id} describedBy={d} options={locationHints} value={line.location} onChange={(v) => onChange({ location: v })} placeholder="e.g. Phase 3" />}
        </Field>
        <FieldRow>
          <Field label="Activity" error={errFor("activity")} className="!flex-[2]">
            {(id, d) => <TextInput id={id} aria-describedby={d} value={line.activity} onChange={(e) => onChange({ activity: e.target.value })} invalid={!!errFor("activity")} placeholder="e.g. Grinding" />}
          </Field>
          <Field label="Manpower" error={errFor("manpower")}>
            {(id, d) => <NumberInput id={id} aria-describedby={d} value={line.manpower} onChange={(e) => onChange({ manpower: e.target.value })} invalid={!!errFor("manpower")} className="tabular-nums" />}
          </Field>
        </FieldRow>

        <MaterialBlock title="Planned" prefix="planned" line={line} materials={materials} errFor={errFor} onChange={onChange} />
        <MaterialBlock
          title="Actual"
          prefix="actual"
          line={line}
          materials={materials}
          errFor={errFor}
          onChange={onChange}
          badge={
            delta != null && delta !== 0 ? (
              <Chip tone={delta > 0 ? "warn" : "progress"}>
                {delta > 0 ? "+" : "−"}
                {Math.abs(delta)} sets vs plan
              </Chip>
            ) : delta === 0 ? (
              <Chip tone="good">As planned</Chip>
            ) : !locked && planned ? (
              <button type="button" onClick={() => onChange(copyPlannedToActual(line))} className="sr-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--good)]">
                ⇆ Same as planned
              </button>
            ) : null
          }
        />

        <button
          type="button"
          onClick={() => setDefectOpen((o) => !o)}
          aria-expanded={defectOpen}
          className="sr-btn sr-btn-line mt-3 !justify-between !py-2.5 !text-[13px]"
        >
          <span>
            ⚠ Defect
            {(line.defect_area || line.defect_remark) && !defectOpen && <span className="font-normal text-[var(--ink-muted)]"> · {line.defect_area || line.defect_remark}</span>}
          </span>
          <span aria-hidden>{defectOpen ? "▾" : "▸"}</span>
        </button>
        {defectOpen && (
          <div className="mt-3">
            <Field label="Defect area">{(id) => <TextInput id={id} value={line.defect_area} onChange={(e) => onChange({ defect_area: e.target.value })} />}</Field>
            <Field label="Defect remark" className="mb-0">
              {(id) => <TextArea id={id} rows={2} value={line.defect_remark} onChange={(e) => onChange({ defect_remark: e.target.value })} />}
            </Field>
          </div>
        )}
      </Card>
    </div>
  );
}

function MaterialBlock({
  title,
  prefix,
  line,
  materials,
  errFor,
  onChange,
  badge,
}: {
  title: string;
  prefix: "planned" | "actual";
  line: ReportLine;
  materials: SiteMaterial[];
  errFor: (field: string) => string | null;
  onChange: (patch: Partial<ReportLine>) => void;
  badge?: ReactNode;
}) {
  const k = <S extends string>(s: S) => `${prefix}_${s}` as `${typeof prefix}_${S}`;
  const area = line[k("area")];
  const qty = line[k("qty")];
  return (
    <div>
      <SectionLabel right={badge} className={cn("flex items-center gap-1.5", prefix === "actual" && "!mt-2")}>
        <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full align-middle", prefix === "planned" ? "bg-[var(--accent)]" : "bg-[var(--good)]")} aria-hidden />
        {title}
      </SectionLabel>
      <FieldRow>
        <Field label="Area (m²)" error={errFor(k("area"))}>
          {(id, d) => <NumberInput id={id} aria-describedby={d} value={area} onChange={(e) => onChange({ [k("area")]: e.target.value })} invalid={!!errFor(k("area"))} className="tabular-nums" />}
        </Field>
        <Field label="Qty in set" error={errFor(k("qty"))}>
          {(id, d) => <NumberInput id={id} aria-describedby={d} value={qty} onChange={(e) => onChange({ [k("qty")]: e.target.value })} invalid={!!errFor(k("qty"))} className="tabular-nums" />}
        </Field>
      </FieldRow>
      <Field label="Material">
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
      <FieldRow>
        <Field label="Coverage" hint="e.g. 0.15kg/m2">
          {(id, d) => <TextInput id={id} aria-describedby={d} value={line[k("coverage")]} onChange={(e) => onChange({ [k("coverage")]: e.target.value })} />}
        </Field>
        <Field label="Remark">{(id) => <TextInput id={id} value={line[k("remark")]} onChange={(e) => onChange({ [k("remark")]: e.target.value })} />}</Field>
      </FieldRow>
    </div>
  );
}
