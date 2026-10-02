// Weekly plan: workflow stage 3 — the Monday meeting's whiteboard, as rows.
// A row can span days ("14-15/09 Grinding - 4"); it then shows on every day it
// covers, and those days' daily reports start from it.
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { notify as toast } from "./notify";
import { cn } from "@/lib/utils";
import { addDays, fmtDay, fmtRange, isoDate, numStr, parseIso, toNum, weekStart, type WeeklyPlanRow } from "@/lib/siteReports";
import { deletePlanRow, fetchWeeklyPlan, savePlanRow } from "@/lib/siteReportsApi";
import type { SiteProject } from "./pickers";
import { Button, Field, NumberInput, SectionCard, TextInput } from "./primitives";

interface Draft {
  id: string | null;
  date_from: string;
  date_to: string;
  location: string;
  activities: string;
  area_m2: string;
  manpower: string;
  remarks: string;
}

const draftFrom = (r: WeeklyPlanRow): Draft => ({
  id: r.id,
  date_from: r.date_from,
  date_to: r.date_to,
  location: r.location ?? "",
  activities: r.activities,
  area_m2: numStr(r.area_m2),
  manpower: r.manpower == null ? "" : String(r.manpower),
  remarks: r.remarks ?? "",
});

const blank = (day: string, location = ""): Draft => ({
  id: null,
  date_from: day,
  date_to: day,
  location,
  activities: "",
  area_m2: "",
  manpower: "",
  remarks: "",
});

const weekLabel = (mon: string) => {
  const a = parseIso(mon);
  const b = parseIso(addDays(mon, 6));
  const f = (d: Date) => d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  return `${f(a)} – ${f(b)}`;
};

export default function WeeklyPlanTab({
  project,
  week,
  onWeekChange,
  onChanged,
  locationHints,
}: {
  project: SiteProject;
  week: string; // Monday, YYYY-MM-DD
  onWeekChange: (mon: string) => void;
  onChanged: () => void;
  locationHints: string[];
}) {
  const [rows, setRows] = useState<WeeklyPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const sunday = addDays(week, 6);
  const thisWeek = weekStart(isoDate(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await fetchWeeklyPlan(project.id, week, sunday));
    setLoading(false);
  }, [project.id, week, sunday]);

  useEffect(() => {
    setEditing(null);
    load();
  }, [load]);

  const errors = editing && tried ? validate(editing) : {};

  const save = async () => {
    if (!editing) return;
    setTried(true);
    if (Object.keys(validate(editing)).length) return;
    setSaving(true);
    const res = await savePlanRow({
      id: editing.id ?? undefined,
      project_id: project.id,
      date_from: editing.date_from,
      date_to: editing.date_to || editing.date_from,
      location: editing.location,
      activities: editing.activities,
      area_m2: toNum(editing.area_m2),
      manpower: toNum(editing.manpower),
      remarks: editing.remarks,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save the plan row.");
      return;
    }
    toast.success(editing.id ? "Plan row updated" : "Plan row added");
    // Keep the form open on the next day for quick entry from the whiteboard.
    const wasNew = !editing.id;
    const nextDay = addDays(editing.date_to || editing.date_from, 1);
    setTried(false);
    setEditing(wasNew && nextDay <= sunday ? blank(nextDay, editing.location) : null);
    await load();
    onChanged();
  };

  const remove = async (r: WeeklyPlanRow) => {
    const res = await deletePlanRow(r.id);
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the plan row.");
      return;
    }
    toast("Plan row deleted", {
      description: `${fmtRange(r.date_from, r.date_to)} · ${r.activities}`,
      action: {
        label: "Undo",
        onClick: async () => {
          const back = await savePlanRow({ ...r, id: undefined });
          if (back.ok) {
            await load();
            onChanged();
          } else toast.error(back.error ?? "Could not restore the row.");
        },
      },
    });
    if (editing?.id === r.id) setEditing(null);
    await load();
    onChanged();
  };

  const totalManDays = rows.reduce((s, r) => {
    const days = Math.max(1, Math.round((parseIso(r.date_to).getTime() - parseIso(r.date_from).getTime()) / 86400000) + 1);
    return s + (r.manpower ?? 0) * days;
  }, 0);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Weekly plan"
        description="Rows from the Monday meeting. A row can cover several days; each day's report starts from the rows planned for it."
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onWeekChange(addDays(week, -7))}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors duration-150 hover:bg-secondary active:scale-[0.97]"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9.5rem] px-1 text-center text-sm font-semibold tabular-nums text-foreground">{weekLabel(week)}</span>
            <button
              type="button"
              onClick={() => onWeekChange(addDays(week, 7))}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors duration-150 hover:bg-secondary active:scale-[0.97]"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {week !== thisWeek && (
              <Button variant="ghost" className="h-10 px-3 text-xs" onClick={() => onWeekChange(thisWeek)}>
                This week
              </Button>
            )}
          </div>
        }
      >
        {loading ? (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary motion-reduce:animate-none" />
            ))}
          </div>
        ) : rows.length === 0 && !editing ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/60" />
            <div>
              <p className="font-medium text-foreground">No plan for {weekLabel(week)}</p>
              <p className="mt-1 text-sm text-muted-foreground">Copy the rows from this week's whiteboard: date, location, activity, area and manpower.</p>
            </div>
            <Button variant="primary" onClick={() => setEditing(blank(week))}>
              <Plus className="h-4 w-4" /> Add the first row
            </Button>
          </div>
        ) : (
          <>
            {/* phones: cards */}
            <ul className="space-y-2 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className={cn("rounded-xl border border-border bg-background/60 p-3", editing?.id === r.id && "border-primary ring-2 ring-primary/15")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tabular-nums text-primary">{fmtRange(r.date_from, r.date_to)}</p>
                      <p className="mt-0.5 font-medium text-foreground">{r.activities}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {[r.location, r.area_m2 != null ? `${r.area_m2.toLocaleString("en-SG")} m²` : null, r.manpower != null ? `${r.manpower} men` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <RowActions onEdit={() => (setTried(false), setEditing(draftFrom(r)))} onDelete={() => remove(r)} label={r.activities} />
                  </div>
                </li>
              ))}
            </ul>

            {/* tablet and up: table */}
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">Date</th>
                    <th scope="col" className="px-3 py-2.5">Location</th>
                    <th scope="col" className="px-3 py-2.5">Activities</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Area (m²)</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Manpower</th>
                    <th scope="col" className="px-3 py-2.5">Remarks</th>
                    <th scope="col" className="w-24 px-3 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className={cn("transition-colors duration-150 hover:bg-secondary/40", editing?.id === r.id && "bg-primary/5")}>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-foreground">{fmtRange(r.date_from, r.date_to)}</td>
                      <td className="px-3 py-2.5 text-foreground">{r.location || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2.5 text-foreground">{r.activities}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.area_m2 != null ? r.area_m2.toLocaleString("en-SG", { maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.manpower ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.remarks || ""}</td>
                      <td className="px-2 py-1.5">
                        <RowActions onEdit={() => (setTried(false), setEditing(draftFrom(r)))} onDelete={() => remove(r)} label={r.activities} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-secondary/30 text-xs text-muted-foreground">
                    <tr>
                      <td colSpan={7} className="px-3 py-2">
                        {rows.length} {rows.length === 1 ? "row" : "rows"} · {totalManDays} man-days planned
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {!editing && (
              <Button
                variant="secondary"
                className="mt-3 w-full border-dashed"
                onClick={() => {
                  const last = rows[rows.length - 1];
                  const next = last ? addDays(last.date_to, 1) : week;
                  setTried(false);
                  setEditing(blank(next <= sunday ? next : sunday, last?.location ?? ""));
                }}
              >
                <Plus className="h-4 w-4" /> Add plan row
              </Button>
            )}
          </>
        )}

        {editing && (
          <form
            className="mt-4 rounded-2xl border border-primary/30 bg-primary/[0.03] p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{editing.id ? "Edit plan row" : "New plan row"}</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
                aria-label="Close the plan row form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="From" error={errors.date_from}>
                {(id, d) => (
                  <TextInput
                    id={id}
                    aria-describedby={d}
                    type="date"
                    value={editing.date_from}
                    invalid={!!errors.date_from}
                    onChange={(e) => {
                      const v = e.target.value;
                      // A one-day row stays one day when its date moves; a range keeps its end
                      // unless the new start passes it.
                      setEditing((x) => x && { ...x, date_from: v, date_to: !x.date_to || x.date_to === x.date_from || x.date_to < v ? v : x.date_to });
                    }}
                    className="tabular-nums"
                  />
                )}
              </Field>
              <Field label="To" hint="Same day unless it spans days" error={errors.date_to}>
                {(id, d) => (
                  <TextInput id={id} aria-describedby={d} type="date" value={editing.date_to} min={editing.date_from} invalid={!!errors.date_to} onChange={(e) => setEditing((x) => x && { ...x, date_to: e.target.value })} className="tabular-nums" />
                )}
              </Field>
              <Field label="Location" className="lg:col-span-2" hint="e.g. Driveway & Parking lot">
                {(id, d) => <TextInput id={id} aria-describedby={d} value={editing.location} list="sr-plan-locations" autoComplete="off" onChange={(e) => setEditing((x) => x && { ...x, location: e.target.value })} />}
              </Field>
              <Field label="Activities" className="sm:col-span-2" error={errors.activities}>
                {(id, d) => (
                  <TextInput id={id} aria-describedby={d} value={editing.activities} invalid={!!errors.activities} placeholder="e.g. Grinding" onChange={(e) => setEditing((x) => x && { ...x, activities: e.target.value })} autoFocus />
                )}
              </Field>
              <Field label="Area (m²)" error={errors.area_m2}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} value={editing.area_m2} invalid={!!errors.area_m2} onChange={(e) => setEditing((x) => x && { ...x, area_m2: e.target.value })} className="tabular-nums" />}
              </Field>
              <Field label="Manpower" error={errors.manpower}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} value={editing.manpower} invalid={!!errors.manpower} inputMode="numeric" onChange={(e) => setEditing((x) => x && { ...x, manpower: e.target.value })} className="tabular-nums" />}
              </Field>
              <Field label="Remarks" className="sm:col-span-2 lg:col-span-4">
                {(id) => <TextInput id={id} value={editing.remarks} onChange={(e) => setEditing((x) => x && { ...x, remarks: e.target.value })} />}
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-muted-foreground">
                {editing.date_from && editing.date_to && editing.date_to !== editing.date_from
                  ? `Shows on ${fmtDay(editing.date_from)} to ${fmtDay(editing.date_to)}`
                  : editing.date_from
                    ? `Shows on ${fmtDay(editing.date_from)}`
                    : ""}
              </p>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing.id ? "Save row" : "Add row"}
              </Button>
            </div>
            <datalist id="sr-plan-locations">
              {locationHints.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </form>
        )}
      </SectionCard>
    </div>
  );
}

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.date_from) e.date_from = "Pick a date.";
  if (d.date_to && d.date_from && d.date_to < d.date_from) e.date_to = "Ends before it starts.";
  if (!d.activities.trim()) e.activities = "What is planned?";
  if (d.area_m2.trim() && toNum(d.area_m2) == null) e.area_m2 = "Enter a number.";
  if (d.manpower.trim() && toNum(d.manpower) == null) e.manpower = "Enter a number.";
  return e;
}

function RowActions({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
        aria-label={`Edit ${label}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-destructive/5 hover:text-destructive"
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
