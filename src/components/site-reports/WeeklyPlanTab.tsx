// Weekly plan: workflow stage 3 — the Monday meeting's whiteboard, as rows.
// A row can span days ("14-15/09 Grinding - 4"); it then shows on every day it
// covers, and those days' daily reports start from it.
// Laid out like a list screen of the client's SitePulse mockup: a week
// switcher, "＋ Add plan row", one card per row, and the form as a card.
import { useCallback, useEffect, useState } from "react";
import { notify as toast } from "./notify";
import { cn } from "@/lib/utils";
import { addDays, fmtDay, fmtRange, isoDate, numStr, parseIso, toNum, weekStart, type WeeklyPlanRow } from "@/lib/siteReports";
import { deletePlanRow, fetchWeeklyPlan, savePlanRow } from "@/lib/siteReportsApi";
import { LocationField, type SiteProject } from "./pickers";
import { Button, Card, CardHead, FabNew, Field, FieldRow, IconButton, Note, NumberInput, Placeholder, SectionLabel, TextInput } from "./primitives";

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

  const startNew = () => {
    const last = rows[rows.length - 1];
    const next = last ? addDays(last.date_to, 1) : week;
    setTried(false);
    setEditing(blank(next <= sunday ? next : sunday, last?.location ?? ""));
  };

  const totalManDays = rows.reduce((s, r) => {
    const days = Math.max(1, Math.round((parseIso(r.date_to).getTime() - parseIso(r.date_from).getTime()) / 86400000) + 1);
    return s + (r.manpower ?? 0) * days;
  }, 0);

  return (
    <>
      {/* Week switcher */}
      <div className="mb-4 flex items-center gap-2">
        <IconButton onClick={() => onWeekChange(addDays(week, -7))} aria-label="Previous week">
          ‹
        </IconButton>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-heading text-[19px] font-bold leading-tight">{weekLabel(week)}</div>
          <div className="sr-meta !mt-0">{week === thisWeek ? "This week" : "Week of " + fmtDay(week)}</div>
        </div>
        <IconButton onClick={() => onWeekChange(addDays(week, 7))} aria-label="Next week">
          ›
        </IconButton>
      </div>
      {week !== thisWeek && (
        <Button variant="line" className="mb-3 !py-2 !text-[13px]" onClick={() => onWeekChange(thisWeek)}>
          Jump to this week
        </Button>
      )}

      {!editing && <FabNew onClick={startNew}>＋ Add plan row</FabNew>}

      {editing && (
        <Card className="!border-[var(--accent)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <CardHead small name={editing.id ? "Edit plan row" : "New plan row"} meta={weekLabel(week)} right={<IconButton onClick={() => setEditing(null)} aria-label="Close the plan row form">✕</IconButton>} />
            <FieldRow>
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
            </FieldRow>
            <Field label="Location" hint="e.g. Driveway & Parking lot">
              {(id, d) => (
                <LocationField id={id} describedBy={d} options={locationHints} value={editing.location} onChange={(v) => setEditing((x) => x && { ...x, location: v })} placeholder="e.g. Driveway & Parking lot" />
              )}
            </Field>
            <Field label="Activities" error={errors.activities}>
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} value={editing.activities} invalid={!!errors.activities} placeholder="e.g. Grinding" onChange={(e) => setEditing((x) => x && { ...x, activities: e.target.value })} autoFocus />
              )}
            </Field>
            <FieldRow>
              <Field label="Area (m²)" error={errors.area_m2}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} value={editing.area_m2} invalid={!!errors.area_m2} onChange={(e) => setEditing((x) => x && { ...x, area_m2: e.target.value })} className="tabular-nums" />}
              </Field>
              <Field label="Manpower" error={errors.manpower}>
                {(id, d) => <NumberInput id={id} aria-describedby={d} value={editing.manpower} invalid={!!errors.manpower} inputMode="numeric" onChange={(e) => setEditing((x) => x && { ...x, manpower: e.target.value })} className="tabular-nums" />}
              </Field>
            </FieldRow>
            <Field label="Remarks">{(id) => <TextInput id={id} value={editing.remarks} onChange={(e) => setEditing((x) => x && { ...x, remarks: e.target.value })} />}</Field>
            <Note className="mb-3">
              {editing.date_from && editing.date_to && editing.date_to !== editing.date_from
                ? `Shows on ${fmtDay(editing.date_from)} to ${fmtDay(editing.date_to)}; each of those days' reports starts from it.`
                : editing.date_from
                  ? `Shows on ${fmtDay(editing.date_from)}; that day's report starts from it.`
                  : "Pick the day or days this row covers."}
            </Note>
            <div className="flex flex-col gap-2">
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : editing.id ? "Save row" : "Add row"}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        [0, 1, 2].map((i) => <div key={i} className="sr-skeleton !h-[72px]" />)
      ) : rows.length === 0 ? (
        !editing && (
          <Placeholder icon="📅" title={`No plan for ${weekLabel(week)}`}>
            Copy the rows from this week's whiteboard: date, location, activity, area and manpower.
          </Placeholder>
        )
      ) : (
        <>
          <SectionLabel right={<span className="sr-mono normal-case tracking-normal">{rows.length} {rows.length === 1 ? "row" : "rows"} · {totalManDays} man-days</span>}>Plan rows</SectionLabel>
          {rows.map((r) => (
            <Card key={r.id} className={cn(editing?.id === r.id && "!border-[var(--accent)]")}>
              <CardHead
                small
                name={r.activities}
                meta={[fmtRange(r.date_from, r.date_to), r.location].filter(Boolean).join(" · ")}
                right={
                  <>
                    <IconButton onClick={() => (setTried(false), setEditing(draftFrom(r)))} aria-label={`Edit ${r.activities}`} className="!h-[26px] !w-[26px] !text-[12px]">
                      ✎
                    </IconButton>
                    <IconButton onClick={() => remove(r)} aria-label={`Delete ${r.activities}`} className="!h-[26px] !w-[26px] !text-[12px]">
                      ✕
                    </IconButton>
                  </>
                }
              />
              <div className="sr-order-line !border-t-0 !py-0">
                <span className="sr-st">{[r.area_m2 != null ? `${r.area_m2.toLocaleString("en-SG")} m²` : null, r.manpower != null ? `${r.manpower} men` : null].filter(Boolean).join(" · ") || "No area or manpower"}</span>
              </div>
              {r.remarks && <Note className="mt-2">{r.remarks}</Note>}
            </Card>
          ))}
        </>
      )}
    </>
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
