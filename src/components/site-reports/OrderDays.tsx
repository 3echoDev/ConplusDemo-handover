// Stage 3 Schedule Posting (the order's days and what each needs) and
// stage 4 Deployment & Execution (who and which tools are on site each day).
// An allocation belongs to its date: the next day opens empty, and
// "Copy previous day" is the explicit way to carry a crew over.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtDay, isoDate } from "@/lib/siteReports";
import {
  ATTENDANCE,
  cleanScope,
  placesOn,
  placeText,
  scheduleDates,
  scopeText,
  stageState,
  type Allocation,
  type Attendance,
  type OrderDay,
  type ScopeRow,
  type SiteOrder,
  type SiteTool,
  type SiteWorker,
} from "@/lib/siteOrders";
import { deleteDay, fetchAllocationsOn, fetchOrderAllocations, fetchOrderDays, saveDays, saveStage, setAllocation } from "@/lib/siteOrdersApi";
import { notify } from "./notify";
import { ScopeRows } from "./OrdersTab";
import { Banner, Button, ButtonRow, Card, CardHead, Chip, Field, FieldRow, Kv, Note, NumberInput, SectionLabel, Select, TextArea, TextInput } from "./primitives";

interface Props {
  order: SiteOrder;
  workers: SiteWorker[];
  tools: SiteTool[];
  allOrders: SiteOrder[];
  onSaved: () => void;
  onBack: () => void;
  onOpenStage: (orderId: string, stage: number) => void;
  onOpenReport: (date: string) => void;
}

const dayTitle = (d: string, today: string) => (d === today ? `Today · ${fmtDay(d)}` : fmtDay(d));
const checkCls = "h-5 w-5 shrink-0 accent-[var(--accent)]";

// ── Stage 3 ───────────────────────────────────────────────────────────────────

export function ScheduleStage({ order, workers, onSaved, onBack, onOpenStage }: Props) {
  const today = isoDate(new Date());
  const [days, setDays] = useState<OrderDay[] | null>(null);
  const [start, setStart] = useState(order.kickoff?.target_start || today);
  const [count, setCount] = useState("");
  const [addDate, setAddDate] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = order.stage === 3;
  const supervisors = useMemo(() => workers.filter((w) => w.active && /supervisor/i.test(w.designation)), [workers]);

  const load = useCallback(() => fetchOrderDays(order.id).then(setDays), [order.id]);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (list: Partial<OrderDay>[], msg: string) => {
    setBusy(true);
    const r = await saveDays(order.id, list);
    setBusy(false);
    if (!r.ok) return notify.error(r.error || "Could not save"), false;
    notify.success(msg);
    await load();
    return true;
  };

  const generate = () => {
    const n = parseInt(count, 10);
    if (!start || !n || n < 1) return notify.error("Enter a start date and the number of days");
    post(
      scheduleDates(start, n).map((d) => ({ work_date: d, scope: [] })),
      `${n} day${n > 1 ? "s" : ""} posted`,
    );
  };

  const complete = async () => {
    setBusy(true);
    const r = await saveStage(order.id, 3, null, true);
    setBusy(false);
    if (!r.ok) return notify.error(r.error || "Could not save");
    notify.success("Schedule posted");
    onSaved();
    onOpenStage(order.id, 4);
  };

  return (
    <>
      <div className="sr-scroll">
        {stageState(order, 3) === "done" && <Banner tone="info">Viewing a completed stage. Edits here update the record without changing the order's progress.</Banner>}
        {days === null ? (
          <div className="sr-skeleton" />
        ) : days.length === 0 ? (
          <>
            <SectionLabel>Plan this schedule</SectionLabel>
            <FieldRow>
              <Field label="Start date">{(id) => <TextInput id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
              <Field label="Number of days">{(id) => <NumberInput id={id} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder="e.g. 5" />}</Field>
            </FieldRow>
            <Button variant="primary" onClick={generate} disabled={busy}>
              Generate schedule
            </Button>
            <Note className="mt-2">Creates one entry per day from that date. Tap each day afterwards to fill in scope, supervisor and the workers needed.</Note>
          </>
        ) : (
          <>
            <SectionLabel>Schedule · {days.length} day{days.length > 1 ? "s" : ""}</SectionLabel>
            {days.map((d) =>
              editing === d.id ? (
                <DayEditor
                  key={d.id}
                  day={d}
                  supervisors={supervisors}
                  busy={busy}
                  title={dayTitle(d.work_date, today)}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => (await post([{ ...patch, work_date: d.work_date }], "Day saved")) && setEditing(null)}
                  onRemove={async () => {
                    setBusy(true);
                    const r = await deleteDay(d.id);
                    setBusy(false);
                    if (!r.ok) return notify.error(r.error || "Could not remove the day");
                    setEditing(null);
                    load();
                  }}
                />
              ) : (
                <Card key={d.id} onClick={() => setEditing(d.id)} ariaLabel={`Edit ${fmtDay(d.work_date)}`}>
                  <CardHead
                    small
                    name={dayTitle(d.work_date, today)}
                    meta={scopeText(d.scope) || "Tap to fill in"}
                    right={<Chip tone={d.scope.length || d.supervisor || d.workers_needed ? "progress" : "pending"}>{d.scope.length || d.supervisor || d.workers_needed ? "Planned" : "Not filled in"}</Chip>}
                  />
                  {(d.supervisor || d.workers_needed != null || d.safety_officer) && (
                    <>
                      <Kv k="Supervisor" v={d.supervisor || "—"} />
                      <Kv k="Workers needed" v={d.workers_needed ?? "—"} />
                      <Kv k="Safety officer needed" v={d.safety_officer ? "Yes" : "No"} />
                    </>
                  )}
                  {d.remarks && <Note className="mt-2">{d.remarks}</Note>}
                </Card>
              ),
            )}
            <FieldRow className="mt-3 items-end">
              <Field label="Add a day">{(id) => <TextInput id={id} type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />}</Field>
              <Button
                variant="line"
                className="mb-[14px]"
                disabled={busy || !addDate || days.some((d) => d.work_date === addDate)}
                onClick={async () => (await post([{ work_date: addDate, scope: [] }], "Day added")) && setAddDate("")}
              >
                ＋ Add
              </Button>
            </FieldRow>
          </>
        )}
      </div>
      <ButtonRow>
        {current && (
          <Button variant="primary" onClick={complete} disabled={busy || !days?.length}>
            Complete and continue
          </Button>
        )}
        <Button variant={current ? "ghost" : "primary"} onClick={onBack} disabled={busy}>
          {current ? "Save and back to project" : "Back to project"}
        </Button>
      </ButtonRow>
    </>
  );
}

function DayEditor({
  day,
  supervisors,
  busy,
  title,
  onSave,
  onCancel,
  onRemove,
}: {
  day: OrderDay;
  supervisors: SiteWorker[];
  busy: boolean;
  title: string;
  onSave: (d: Partial<OrderDay>) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [scope, setScope] = useState<ScopeRow[]>(day.scope.length ? day.scope : [{ scope: "", area: "" }]);
  const [supervisor, setSupervisor] = useState(day.supervisor ?? "");
  const [needed, setNeeded] = useState(day.workers_needed == null ? "" : String(day.workers_needed));
  const [safety, setSafety] = useState(day.safety_officer);
  const [remarks, setRemarks] = useState(day.remarks ?? "");
  return (
    <Card className="!border-[var(--accent)]">
      <CardHead small name={title} meta="Editing this day" />
      <ScopeRows rows={scope} onChange={setScope} />
      <FieldRow>
        <Field label="Supervisor">
          {(id) => (
            <Select id={id} value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
              <option value="">None yet</option>
              {supervisor && !supervisors.some((s) => s.name === supervisor) && <option>{supervisor}</option>}
              {supervisors.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Workers needed">{(id) => <NumberInput id={id} inputMode="numeric" value={needed} onChange={(e) => setNeeded(e.target.value)} />}</Field>
      </FieldRow>
      <label className="mb-3 flex min-h-[40px] items-center gap-2 text-[13px] font-medium">
        <input type="checkbox" className={checkCls} checked={safety} onChange={(e) => setSafety(e.target.checked)} />
        Safety officer needed
      </label>
      <Field label="Remarks">{(id) => <TextArea id={id} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />}</Field>
      <Button
        variant="primary"
        disabled={busy}
        onClick={() => onSave({ scope: cleanScope(scope), supervisor, workers_needed: needed.trim() === "" ? null : Math.max(0, Math.floor(Number(needed)) || 0),safety_officer: safety, remarks })}
      >
        Save day
      </Button>
      <FieldRow className="mt-2">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onRemove} disabled={busy}>
          Remove day
        </Button>
      </FieldRow>
    </Card>
  );
}

// ── Stage 4 ───────────────────────────────────────────────────────────────────

interface WorkerPick {
  attendance: Attendance;
  ot: string;
}

export function DeploymentStage({ order, workers, tools, allOrders, onSaved, onBack, onOpenStage, onOpenReport }: Props) {
  const today = isoDate(new Date());
  const [days, setDays] = useState<OrderDay[] | null>(null);
  const [mine, setMine] = useState<Allocation[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const current = order.stage === 4;
  const closed = !!order.completed_at;

  const load = useCallback(async () => {
    const [d, a] = await Promise.all([fetchOrderDays(order.id), fetchOrderAllocations(order.id)]);
    setDays(d);
    setMine(a);
    return d;
  }, [order.id]);
  useEffect(() => {
    load().then((d) => setOpen((o) => o ?? (d.some((x) => x.work_date === today) ? today : null)));
  }, [load, today]);

  // Scheduled days, plus any other date that already has an allocation (a rework day, an unplanned day).
  const dates = useMemo(() => {
    const s = new Set<string>([...(days ?? []).map((d) => d.work_date), ...mine.map((a) => a.work_date)]);
    if (open) s.add(open);
    return [...s].sort();
  }, [days, mine, open]);
  const planByDate = useMemo(() => new Map((days ?? []).map((d) => [d.work_date, d])), [days]);

  const complete = async () => {
    setBusy(true);
    const r = await saveStage(order.id, 4, null, true);
    setBusy(false);
    if (!r.ok) return notify.error(r.error || "Could not save");
    notify.success("Deployment completed");
    onSaved();
    onOpenStage(order.id, 5);
  };

  return (
    <>
      <div className="sr-scroll">
        {stageState(order, 4) === "done" && <Banner tone="info">Viewing a completed stage. Edits here update the record without changing the order's progress.</Banner>}
        <Note className="mb-3">
          Manpower and tools are allocated per day. A new day starts empty, so nobody stays booked on a site they have left; use <b>Copy previous day</b> to carry a crew over.
        </Note>
        {days === null ? (
          <div className="sr-skeleton" />
        ) : (
          <>
            {dates.length === 0 && <Note>No schedule posted yet. Go back to Schedule Posting to plan the days, or add a date below.</Note>}
            {dates.map((d) => {
              const plan = planByDate.get(d);
              const dayAllocs = mine.filter((a) => a.work_date === d);
              const nw = dayAllocs.filter((a) => a.worker_id).length;
              const nt = dayAllocs.filter((a) => a.tool_id).length;
              if (open === d) {
                const prev = [...new Set(mine.filter((a) => a.work_date < d).map((a) => a.work_date))].sort().pop();
                return (
                  <AllocationEditor
                    key={d}
                    order={order}
                    date={d}
                    title={dayTitle(d, today)}
                    plan={plan}
                    workers={workers}
                    tools={tools}
                    allOrders={allOrders}
                    current={dayAllocs}
                    previous={prev ? { date: prev, rows: mine.filter((a) => a.work_date === prev) } : null}
                    readOnly={closed}
                    onClose={() => setOpen(null)}
                    onSaved={() => {
                      load();
                      onSaved();
                    }}
                    onOpenReport={() => onOpenReport(d)}
                  />
                );
              }
              return (
                <Card key={d} onClick={() => setOpen(d)} ariaLabel={`Allocate ${fmtDay(d)}`}>
                  <CardHead
                    small
                    name={dayTitle(d, today)}
                    meta={plan ? scopeText(plan.scope) || "No scope set" : "Not on the posted schedule"}
                    right={nw + nt > 0 ? <Chip tone="good">Allocated</Chip> : <Chip tone={d < today ? "bad" : "pending"}>{d < today ? "Nothing logged" : "Not allocated"}</Chip>}
                  />
                  <Kv k="Workers" v={plan?.workers_needed != null ? `${nw} of ${plan.workers_needed} needed` : nw} />
                  <Kv k="Tools" v={nt} />
                </Card>
              );
            })}
            {!closed && (
              <FieldRow className="mt-3 items-end">
                <Field label="Allocate another date">{(id) => <TextInput id={id} type="date" value={extra} onChange={(e) => setExtra(e.target.value)} />}</Field>
                <Button
                  variant="line"
                  className="mb-[14px]"
                  disabled={!extra}
                  onClick={() => {
                    setOpen(extra);
                    setExtra("");
                  }}
                >
                  Open
                </Button>
              </FieldRow>
            )}
          </>
        )}
      </div>
      <ButtonRow>
        {current && (
          <Button variant="primary" onClick={complete} disabled={busy}>
            Complete and continue
          </Button>
        )}
        <Button variant={current ? "ghost" : "primary"} onClick={onBack} disabled={busy}>
          {current ? "Save and back to project" : "Back to project"}
        </Button>
      </ButtonRow>
    </>
  );
}

function AllocationEditor({
  order,
  date,
  title,
  plan,
  workers,
  tools,
  allOrders,
  current,
  previous,
  readOnly,
  onClose,
  onSaved,
  onOpenReport,
}: {
  order: SiteOrder;
  date: string;
  title: string;
  plan: OrderDay | undefined;
  workers: SiteWorker[];
  tools: SiteTool[];
  allOrders: SiteOrder[];
  current: Allocation[];
  previous: { date: string; rows: Allocation[] } | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
  onOpenReport: () => void;
}) {
  const fromRows = (rows: Allocation[]) => ({
    w: Object.fromEntries(rows.filter((a) => a.worker_id).map((a) => [a.worker_id as string, { attendance: a.attendance, ot: a.ot_hours ? String(a.ot_hours) : "" }])) as Record<string, WorkerPick>,
    t: new Set(rows.filter((a) => a.tool_id).map((a) => a.tool_id as string)),
  });
  const [picked, setPicked] = useState<Record<string, WorkerPick>>(() => fromRows(current).w);
  const [toolSet, setToolSet] = useState<Set<string>>(() => fromRows(current).t);
  const [others, setOthers] = useState<Allocation[]>([]);
  const [wq, setWq] = useState("");
  const [tq, setTq] = useState("");
  const [cat, setCat] = useState("");
  const [busy, setBusy] = useState(false);

  // Everyone else's allocations that day: a tool taken elsewhere is locked, a worker elsewhere is flagged.
  useEffect(() => {
    fetchAllocationsOn(date).then((a) => setOthers(a.filter((x) => x.order_id !== order.id)));
  }, [date, order.id]);
  const workerElsewhere = useMemo(() => placesOn(others, allOrders, date, "worker"), [others, allOrders, date]);
  const toolElsewhere = useMemo(() => placesOn(others, allOrders, date, "tool"), [others, allOrders, date]);

  const cats = useMemo(() => [...new Set(tools.map((t) => t.category))].sort(), [tools]);
  const wNeedle = wq.trim().toLowerCase();
  const tNeedle = tq.trim().toLowerCase();
  const workerList = workers.filter((w) => (w.active || picked[w.id]) && (!wNeedle || `${w.name} ${w.emp_code ?? ""} ${w.designation}`.toLowerCase().includes(wNeedle)));
  // Selected first, so the day's crew reads as one block at the top.
  workerList.sort((a, b) => Number(!!picked[b.id]) - Number(!!picked[a.id]) || a.name.localeCompare(b.name));
  const searching = !!tNeedle || !!cat;
  const toolList = tools
    .filter((t) => toolSet.has(t.id) || (t.active && searching && (!cat || t.category === cat) && (!tNeedle || `${t.tool_no} ${t.item}`.toLowerCase().includes(tNeedle))))
    .sort((a, b) => Number(toolSet.has(b.id)) - Number(toolSet.has(a.id)) || a.tool_no.localeCompare(b.tool_no));

  const toggleWorker = (id: string) =>
    setPicked((p) => {
      const n = { ...p };
      if (n[id]) delete n[id];
      else n[id] = { attendance: "Full Day", ot: "" };
      return n;
    });
  const toggleTool = (id: string) =>
    setToolSet((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const copyPrev = () => {
    if (!previous) return;
    const p = fromRows(previous.rows);
    // A tool another order holds today, or one marked spoiled since, is left behind.
    const usable = new Set(tools.filter((t) => t.active && t.condition === "good" && !toolElsewhere.has(t.id)).map((t) => t.id));
    const kept = [...p.t].filter((id) => usable.has(id));
    setPicked(p.w);
    setToolSet(new Set(kept));
    const left = p.t.size - kept.length;
    notify(`Copied from ${fmtDay(previous.date)}${left ? `, ${left} tool${left > 1 ? "s" : ""} left out (in use elsewhere or spoiled)` : ""}. Save to keep it.`);
  };

  const save = async () => {
    setBusy(true);
    const r = await setAllocation(
      order.id,
      date,
      Object.entries(picked).map(([id, v]) => ({ id, attendance: v.attendance, ot_hours: v.ot ? Number(v.ot) : null })),
      [...toolSet],
    );
    setBusy(false);
    if (!r.ok) return notify.error(r.error || "Could not save the allocation");
    notify.success(`Allocation saved for ${fmtDay(date)}`);
    onSaved();
  };

  const nPicked = Object.keys(picked).length;
  return (
    <Card className="!border-[var(--accent)]">
      <CardHead small name={title} meta={`${order.project_code} · ${order.label}`} />
      {plan && (
        <div className="mb-2">
          <Kv k="Scope & area" v={scopeText(plan.scope) || "—"} />
          <Kv k="Supervisor" v={plan.supervisor || "—"} />
          <Kv k="Workers needed" v={plan.workers_needed ?? "—"} />
          <Kv k="Safety officer needed" v={plan.safety_officer ? "Yes" : "No"} />
        </div>
      )}
      {previous && !readOnly && (
        <Button variant="line" className="mb-3" onClick={copyPrev}>
          ⧉ Copy previous day ({fmtDay(previous.date)})
        </Button>
      )}

      <SectionLabel>Manpower · {nPicked} on site</SectionLabel>
      <TextInput type="search" value={wq} onChange={(e) => setWq(e.target.value)} placeholder="Search name, code or designation" aria-label="Search manpower" className="mb-2" />
      <div className="max-h-[320px] overflow-y-auto rounded-xl border border-[var(--line)]">
        {workerList.map((w) => {
          const sel = picked[w.id];
          const also = workerElsewhere.get(w.id);
          return (
            <div key={w.id} className="border-b border-[var(--line)] px-3 py-2 last:border-b-0">
              <label className="flex min-h-[36px] items-center gap-2.5">
                <input type="checkbox" className={checkCls} checked={!!sel} disabled={readOnly} onChange={() => toggleWorker(w.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{w.name}</span>
                  <span className="block truncate text-[11px] text-[var(--ink-muted)]">
                    {[w.emp_code, w.designation].filter(Boolean).join(" · ")}
                    {also && <span className="font-semibold text-[var(--warn)]"> · also at {also.map(placeText).join(", ")}</span>}
                  </span>
                </span>
              </label>
              {sel && (
                <div className="mt-1.5 flex gap-2 pl-[30px]">
                  <Select
                    aria-label={`Attendance for ${w.name}`}
                    className="!min-h-[36px] !py-1.5 !text-[12px]"
                    value={sel.attendance}
                    disabled={readOnly}
                    onChange={(e) => setPicked((p) => ({ ...p, [w.id]: { ...sel, attendance: e.target.value as Attendance } }))}
                  >
                    {ATTENDANCE.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </Select>
                  <Select
                    aria-label={`Overtime for ${w.name}`}
                    className="!min-h-[36px] !py-1.5 !text-[12px]"
                    value={sel.ot}
                    disabled={readOnly}
                    onChange={(e) => setPicked((p) => ({ ...p, [w.id]: { ...sel, ot: e.target.value } }))}
                  >
                    <option value="">No overtime</option>
                    {[1, 2, 3, 4, 5, 6].map((h) => (
                      <option key={h} value={h}>
                        +{h}h OT
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          );
        })}
        {workerList.length === 0 && <div className="px-3 py-4 text-[12.5px] text-[var(--ink-muted)]">No one matches. Add people on the Manpower tab.</div>}
      </div>

      <SectionLabel className="mt-4">Tools · {toolSet.size} on site</SectionLabel>
      <FieldRow>
        <Select aria-label="Tool category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Pick a category</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <TextInput type="search" value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Or search" aria-label="Search tools" />
      </FieldRow>
      <div className="mt-2 max-h-[320px] overflow-y-auto rounded-xl border border-[var(--line)]">
        {toolList.map((t) => {
          const taken = toolElsewhere.get(t.id);
          const spoiled = t.condition === "spoiled";
          const blocked = !toolSet.has(t.id) && (!!taken || spoiled);
          return (
            <label key={t.id} className={`flex min-h-[44px] items-center gap-2.5 border-b border-[var(--line)] px-3 py-2 last:border-b-0 ${blocked ? "opacity-60" : ""}`}>
              <input type="checkbox" className={checkCls} checked={toolSet.has(t.id)} disabled={readOnly || blocked} onChange={() => toggleTool(t.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{t.item}</span>
                <span className="block truncate text-[11px] text-[var(--ink-muted)]">
                  <span className="sr-mono">{t.tool_no}</span> · {t.category}
                  {taken && <span className="font-semibold text-[var(--bad)]"> · at {taken.map(placeText).join(", ")}</span>}
                  {spoiled && <span className="font-semibold text-[var(--bad)]"> · spoiled</span>}
                </span>
              </span>
            </label>
          );
        })}
        {toolList.length === 0 && <div className="px-3 py-4 text-[12.5px] text-[var(--ink-muted)]">{searching ? "No tool matches." : "Pick a category or search to add tools for this day."}</div>}
      </div>

      {!readOnly && (
        <Button variant="primary" className="mt-4" onClick={save} disabled={busy}>
          Save allocation
        </Button>
      )}
      <FieldRow className="mt-2">
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button variant="line" onClick={onOpenReport} disabled={busy}>
          📝 Daily report
        </Button>
      </FieldRow>
    </Card>
  );
}
