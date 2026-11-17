// A project's orders and the stage screens that carry no day-by-day data:
// 1 Project Plan (the order itself), 2 Kick Off, 5 Site Walk / Handover,
// 6 Transfer / Movement, 7 Completion. Stages 3 and 4 live in OrderDays.tsx.
// Screen for screen on the SitePulse mockup; one order = one phase.
import { useEffect, useMemo, useState } from "react";
import {
  cleanScope,
  orderChip,
  orderDone,
  scopeArea,
  stageDesc,
  stageName,
  stageState,
  STAGES,
  syncTransferTools,
  toolsUsedOn,
  transferReady,
  type Completion,
  type KickOff,
  type ScopeRow,
  type SiteOrder,
  type SiteTool,
  type SiteWalk,
  type SiteWorker,
  type Transfer,
} from "@/lib/siteOrders";
import { deleteOrder, fetchOrderAllocations, saveOrder, saveStage } from "@/lib/siteOrdersApi";
import type { SiteProject } from "./pickers";
import { notify } from "./notify";
import { Banner, Button, ButtonRow, Card, CardHead, Chip, FabNew, Field, FieldRow, Note, NumberInput, Placeholder, SectionLabel, Select, TextArea, TextInput, Tracker } from "./primitives";

export const SCOPE_HINTS = ["Grinding", "Sanding", "Roller Apply", "Self Levelling", "Patching", "Powerfloat", "Wall Painting"];

/** The project's orders, newest first, each with the seven-stage rail. */
export function OrdersList({ orders, onNew, onOpen }: { orders: SiteOrder[] | null; onNew: () => void; onOpen: (o: SiteOrder, stage: number) => void }) {
  if (orders === null) {
    return (
      <>
        {[0, 1].map((i) => (
          <div key={i} className="sr-skeleton" />
        ))}
      </>
    );
  }
  return (
    <>
      <FabNew onClick={onNew}>＋ New order</FabNew>
      {orders.length === 0 ? (
        <Placeholder icon="🗂️" title="No orders yet">
          Tap "New order" above to create the first one. Each order is one phase of the project and tracks its own Project Plan through Completion.
        </Placeholder>
      ) : (
        <>
          <SectionLabel>Orders</SectionLabel>
          {[...orders].reverse().map((o) => {
            const chip = orderChip(o);
            const area = scopeArea(o.scope);
            return (
              <Card key={o.id}>
                <CardHead small name={o.label} meta={`Order ${o.order_no}${area > 0 ? ` · ${area} m²` : ""}`} right={<Chip tone={chip.tone}>{chip.text}</Chip>} />
                <Tracker
                  small
                  label={`Stages of ${o.label}`}
                  steps={STAGES.map((title, i) => {
                    const s = i + 1;
                    const state = stageState(o, s);
                    return { title, desc: stageDesc(o, s), state, onClick: state === "locked" ? undefined : () => onOpen(o, s) };
                  })}
                />
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}

/** Scope + area rows, shared by the order form and a schedule day. */
export function ScopeRows({ rows, onChange, disabled }: { rows: ScopeRow[]; onChange: (r: ScopeRow[]) => void; disabled?: boolean }) {
  const list = rows.length && rows[rows.length - 1].scope.trim() === "" ? rows : [...rows, { scope: "", area: "" }];
  const set = (i: number, patch: Partial<ScopeRow>) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      <datalist id="sr-scope-hints">
        {SCOPE_HINTS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {list.map((r, i) => (
        <FieldRow key={i}>
          <Field label={i === 0 ? "Scope" : `Scope ${i + 1}`}>
            {(id) => <TextInput id={id} list="sr-scope-hints" value={r.scope} disabled={disabled} onChange={(e) => set(i, { scope: e.target.value })} placeholder="e.g. Grinding" />}
          </Field>
          <Field label="Area (m²)">{(id) => <NumberInput id={id} value={r.area} disabled={disabled} onChange={(e) => set(i, { area: e.target.value })} placeholder="e.g. 850" />}</Field>
        </FieldRow>
      ))}
    </>
  );
}

interface StageProps {
  project: SiteProject;
  /** null on the New Order screen. */
  order: SiteOrder | null;
  stage: number;
  workers: SiteWorker[];
  tools: SiteTool[];
  /** Reload orders; resolves once the list is fresh. */
  onSaved: () => void;
  onBack: () => void;
  onOpenStage: (orderId: string, stage: number) => void;
}

/** Stages 1, 2, 5, 6, 7 — a form, then the mockup's stacked button row. */
export function OrderStageForm(props: StageProps) {
  const { order, stage } = props;
  if (!order || stage === 1) return <PlanForm {...props} />;
  if (stage === 2) return <KickOffForm {...props} order={order} />;
  if (stage === 5) return <SiteWalkForm {...props} order={order} />;
  if (stage === 6) return <TransferForm {...props} order={order} />;
  return <CompletionForm {...props} order={order} />;
}

type Withorder = StageProps & { order: SiteOrder };

const pastNote = (o: SiteOrder, s: number) =>
  stageState(o, s) === "done" && s !== 7 ? <Banner tone="info">Viewing a completed stage. Edits here update the record without changing the order's progress.</Banner> : null;

function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, okMsg: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) notify.error(r.error || "Could not save");
    else notify.success(okMsg);
    return r;
  };
  return { busy, run };
}

function PlanForm({ project, order, onSaved, onBack, onOpenStage }: StageProps) {
  const [label, setLabel] = useState(order?.label ?? "");
  const [scope, setScope] = useState<ScopeRow[]>(order?.scope?.length ? order.scope : [{ scope: "", area: "" }]);
  const [remarks, setRemarks] = useState(order?.remarks ?? "");
  const [armed, setArmed] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const { busy, run } = useBusy();

  const save = async () => {
    if (!label.trim()) return setShowErr(true);
    const r = await run(() => saveOrder({ id: order?.id, project_id: project.id, label: label.trim(), scope: cleanScope(scope), remarks }), order ? "Order saved" : "Order created");
    if (!r.ok) return;
    onSaved();
    if (!order && r.id) onOpenStage(r.id, 2);
    else onBack();
  };
  const remove = async () => {
    if (!order) return;
    if (!armed) return setArmed(true);
    const r = await run(() => deleteOrder(order.id), "Order deleted");
    if (r.ok) {
      onSaved();
      onBack();
    } else setArmed(false);
  };

  return (
    <>
      <div className="sr-scroll">
        {order && <Banner tone="info">Editing an existing order. Changes here update its Project Plan details only.</Banner>}
        <Field label="Order name" error={showErr && !label.trim() ? "Give the order a name" : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. L3 Server Room, or Phase 2" />}
        </Field>
        <ScopeRows rows={scope} onChange={setScope} />
        <Field label="Remarks">{(id) => <TextArea id={id} rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes on this order" />}</Field>
        <Note>Each order tracks its own Project Plan → Kick Off → … → Completion, independently from every other order of the project.</Note>
        {order && (
          <Button variant="danger" className="mt-4" onClick={remove} disabled={busy}>
            {armed ? "Tap again to delete this order" : "Delete order"}
          </Button>
        )}
      </div>
      <ButtonRow>
        <Button variant="primary" onClick={save} disabled={busy}>
          {order ? "Save changes" : "Save order and continue"}
        </Button>
        <Button onClick={onBack} disabled={busy}>
          Back to project
        </Button>
      </ButtonRow>
    </>
  );
}

function KickOffForm({ order, onSaved, onBack, onOpenStage }: Withorder) {
  const [k, setK] = useState<KickOff>({ date: "", participants: "", comments: "", target_start: "", target_end: "", ...(order.kickoff ?? {}) });
  const [showErr, setShowErr] = useState(false);
  const { busy, run } = useBusy();
  const current = order.stage === 2;
  const set = (p: Partial<KickOff>) => setK((v) => ({ ...v, ...p }));
  const endBeforeStart = !!k.target_start && !!k.target_end && k.target_end < k.target_start;

  const save = async (complete: boolean) => {
    if ((complete && !k.date) || endBeforeStart) return setShowErr(true);
    const r = await run(() => saveStage(order.id, 2, k, complete), complete ? "Kick Off confirmed" : "Kick Off saved");
    if (!r.ok) return;
    onSaved();
    if (complete) onOpenStage(order.id, 3);
    else onBack();
  };

  return (
    <>
      <div className="sr-scroll">
        {pastNote(order, 2)}
        <Field label="Date of kick off" error={showErr && !k.date ? "Enter the kick off date" : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} type="date" value={k.date} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
        <Field label="Participants">{(id) => <TextInput id={id} value={k.participants} onChange={(e) => set({ participants: e.target.value })} placeholder="e.g. PM, PC, Supervisor" />}</Field>
        <Field label="Comments">{(id) => <TextArea id={id} rows={3} value={k.comments} onChange={(e) => set({ comments: e.target.value })} />}</Field>
        <Field label="Target full commencement date">{(id) => <TextInput id={id} type="date" value={k.target_start} onChange={(e) => set({ target_start: e.target.value })} />}</Field>
        <Field label="Target full completion date" error={showErr && endBeforeStart ? "Completion is before commencement" : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} type="date" value={k.target_end} onChange={(e) => set({ target_end: e.target.value })} />}
        </Field>
      </div>
      <ButtonRow>
        <Button variant="primary" onClick={() => save(current)} disabled={busy}>
          {current ? "Complete and continue" : "Save changes"}
        </Button>
        {current && (
          <Button onClick={() => save(false)} disabled={busy}>
            Save and back to project
          </Button>
        )}
      </ButtonRow>
    </>
  );
}

function SiteWalkForm({ order, onSaved, onBack, onOpenStage }: Withorder) {
  const [w, setW] = useState<SiteWalk>({ date: "", attendees: "", defects: "", outcome: "", remarks: "", ...(order.site_walk ?? {}) });
  const [showErr, setShowErr] = useState(false);
  const { busy, run } = useBusy();
  const current = order.stage === 5;
  const set = (p: Partial<SiteWalk>) => setW((v) => ({ ...v, ...p }));
  const canComplete = !!w.date && w.outcome === "accepted";

  const save = async (complete: boolean) => {
    if (complete && !canComplete) return setShowErr(true);
    const r = await run(() => saveStage(order.id, 5, w, complete), complete ? "Handover recorded" : "Site walk saved");
    if (!r.ok) return;
    onSaved();
    if (complete) onOpenStage(order.id, 6);
    else onBack();
  };

  return (
    <>
      <div className="sr-scroll">
        {pastNote(order, 5)}
        <Field label="Date of site walk" error={showErr && !w.date ? "Enter the site walk date" : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} type="date" value={w.date} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
        <Field label="Attendees">{(id) => <TextInput id={id} value={w.attendees} onChange={(e) => set({ attendees: e.target.value })} placeholder="e.g. Client rep, PC, Supervisor" />}</Field>
        <Field label="Outcome" error={showErr && w.outcome !== "accepted" ? "The order moves on once the handover is accepted" : null}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={w.outcome} onChange={(e) => set({ outcome: e.target.value as SiteWalk["outcome"] })}>
              <option value="">Select</option>
              <option value="accepted">Accepted, handed over</option>
              <option value="rework">Rework needed</option>
            </Select>
          )}
        </Field>
        <Field label="Defects / rework" hint="Rework days are allocated back in Deployment & Execution: add the day there.">
          {(id, d) => <TextArea id={id} aria-describedby={d} rows={3} value={w.defects} onChange={(e) => set({ defects: e.target.value })} />}
        </Field>
        <Field label="Remarks">{(id) => <TextArea id={id} rows={2} value={w.remarks} onChange={(e) => set({ remarks: e.target.value })} />}</Field>
      </div>
      <ButtonRow>
        <Button variant="primary" onClick={() => save(current)} disabled={busy}>
          {current ? "Complete and continue" : "Save changes"}
        </Button>
        {current && (
          <Button onClick={() => save(false)} disabled={busy}>
            Save and back to project
          </Button>
        )}
      </ButtonRow>
    </>
  );
}

function TransferForm({ order, tools, workers, onSaved, onBack, onOpenStage }: Withorder) {
  const [t, setT] = useState<Transfer>({ move_date: "", remarks: "", ...(order.transfer ?? {}), tools: order.transfer?.tools ?? [] });
  const [loaded, setLoaded] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const { busy, run } = useBusy();
  const current = order.stage === 6;
  const toolById = useMemo(() => new Map(tools.map((x) => [x.id, x])), [tools]);

  // Every tool this order ever had allocated has to be accounted for.
  useEffect(() => {
    fetchOrderAllocations(order.id).then((a) => {
      setT((v) => ({ ...v, tools: syncTransferTools(v.tools, toolsUsedOn(a, order.id)) }));
      setLoaded(true);
    });
  }, [order.id]);

  const setTool = (id: string, p: Partial<Transfer["tools"][number]>) => setT((v) => ({ ...v, tools: v.tools.map((x) => (x.tool_id === id ? { ...x, ...p } : x)) }));
  const ready = transferReady(t);

  const save = async (complete: boolean) => {
    if (complete && !ready) return setShowErr(true);
    const r = await run(() => saveStage(order.id, 6, t, complete), complete ? "Transfer completed" : "Transfer saved");
    if (!r.ok) return;
    onSaved();
    if (complete) onOpenStage(order.id, 7);
    else onBack();
  };

  return (
    <>
      <div className="sr-scroll">
        {pastNote(order, 6)}
        <datalist id="sr-receivers">
          {workers.filter((x) => x.active).map((x) => (
            <option key={x.id} value={x.name} />
          ))}
        </datalist>
        <Field label="Date of movement" error={showErr && !t.move_date ? "Enter the movement date" : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} type="date" value={t.move_date} onChange={(e) => setT((v) => ({ ...v, move_date: e.target.value }))} />}
        </Field>
        <SectionLabel>Tools used on this order</SectionLabel>
        {!loaded ? (
          <div className="sr-skeleton" />
        ) : t.tools.length === 0 ? (
          <Note>No tools were allocated to this order, so there is nothing to move.</Note>
        ) : (
          t.tools.map((x) => {
            const tool = toolById.get(x.tool_id);
            const done = x.destination && x.received_by.trim() && x.acknowledged && (x.destination !== "Another site" || x.site.trim());
            return (
              <Card key={x.tool_id}>
                <CardHead small name={tool ? tool.item : "Tool"} meta={tool?.tool_no} right={done ? <Chip tone="good">Received</Chip> : <Chip tone="warn">Pending</Chip>} />
                <FieldRow>
                  <Field label="Goes to">
                    {(id) => (
                      <Select id={id} value={x.destination} onChange={(e) => setTool(x.tool_id, { destination: e.target.value as Transfer["tools"][number]["destination"] })}>
                        <option value="">Select</option>
                        <option>Store</option>
                        <option>Another site</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Received by">{(id) => <TextInput id={id} list="sr-receivers" value={x.received_by} onChange={(e) => setTool(x.tool_id, { received_by: e.target.value })} />}</Field>
                </FieldRow>
                {x.destination === "Another site" && (
                  <Field label="Which site">{(id) => <TextInput id={id} value={x.site} onChange={(e) => setTool(x.tool_id, { site: e.target.value })} placeholder="Project code or site name" />}</Field>
                )}
                <label className="flex min-h-[40px] items-center gap-2 text-[13px] font-medium">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={x.acknowledged} onChange={(e) => setTool(x.tool_id, { acknowledged: e.target.checked })} />
                  Receiver confirmed the tool arrived
                </label>
              </Card>
            );
          })
        )}
        {showErr && !ready && t.move_date && <Banner tone="warn">Every tool needs a destination, a receiver and the receiver's confirmation before this stage can complete.</Banner>}
        <Field label="Remarks">{(id) => <TextArea id={id} rows={2} value={t.remarks} onChange={(e) => setT((v) => ({ ...v, remarks: e.target.value }))} />}</Field>
      </div>
      <ButtonRow>
        <Button variant="primary" onClick={() => save(current)} disabled={busy || !loaded}>
          {current ? "Complete and continue" : "Save changes"}
        </Button>
        {current && (
          <Button onClick={() => save(false)} disabled={busy || !loaded}>
            Save and back to project
          </Button>
        )}
      </ButtonRow>
    </>
  );
}

function CompletionForm({ order, onSaved, onBack }: Withorder) {
  const [c, setC] = useState<Completion>({ date: "", remarks: "", ...(order.completion ?? {}) });
  const [showErr, setShowErr] = useState(false);
  const { busy, run } = useBusy();
  const done = orderDone(order);

  const save = async (complete: boolean) => {
    if (complete && !c.date) return setShowErr(true);
    const r = await run(() => saveStage(order.id, 7, c, complete), complete ? `${order.label} completed` : done ? "Order reopened" : "Completion saved");
    if (!r.ok) return;
    onSaved();
    onBack();
  };

  return (
    <>
      <div className="sr-scroll">
        {done && <Banner tone="good">This order is completed. Its manpower and tools can no longer be allocated.</Banner>}
        <Field label="Completion date" error={showErr && !c.date ? "Enter the completion date" : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} type="date" value={c.date} onChange={(e) => setC((v) => ({ ...v, date: e.target.value }))} />}
        </Field>
        <Field label="Remarks">{(id) => <TextArea id={id} rows={3} value={c.remarks} onChange={(e) => setC((v) => ({ ...v, remarks: e.target.value }))} />}</Field>
        <Note>{stageName(7)} is the last stage. Completing it closes this order only; the project's other orders carry on.</Note>
      </div>
      <ButtonRow>
        <Button variant="primary" onClick={() => save(true)} disabled={busy}>
          {done ? "Save changes" : "Mark order completed"}
        </Button>
        {done ? (
          <Button onClick={() => save(false)} disabled={busy}>
            Reopen order
          </Button>
        ) : (
          <Button onClick={() => save(false)} disabled={busy}>
            Save and back to project
          </Button>
        )}
      </ButtonRow>
    </>
  );
}
